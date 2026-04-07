/**
 * Cross-Studio Intelligence Bridge
 * 
 * Connects PM Studio to other Mantram AI studios for a closed-loop intelligence network.
 * Pulls data from: SEO Studio, Content Studio, Creative Studio, Video Studio, Brainstorm Studio.
 */

import SeoAudit from '../../models/SeoAudit.js';
import AdCampaign from '../../models/AdCampaign.js';
import Brand from '../../models/Brand.js';
import { getRouter } from '../../ai/router.js';
import { callAgent } from '../shared/agentUtils.js';

// ══════════════════════════════════════════════════════════════════════════════
// SEO STUDIO → PM KEYWORDS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Pull top-performing organic keywords from SEO Studio audit data.
 * Identifies keywords useful for paid targeting AND cannibalization risks.
 */
export async function getSEOKeywordsForTargeting(brandId) {
    try {
        // Get latest SEO audits for the brand
        const audits = await SeoAudit.find({
            brand: brandId,
            type: { $in: ['health-check', 'traffic', 'ai-visibility'] },
        }).sort({ createdAt: -1 }).limit(5).lean();

        if (audits.length === 0) return { keywords: [], message: 'No SEO audits found. Run a Health Check or Traffic analysis first.' };

        // Extract keywords from audit results
        const allKeywords = [];
        for (const audit of audits) {
            const results = audit.results || {};

            // Health check keywords
            if (results.topKeywords) allKeywords.push(...results.topKeywords);
            if (results.keywords) allKeywords.push(...results.keywords);

            // Traffic analysis keywords
            if (results.organicKeywords) allKeywords.push(...results.organicKeywords);
            if (results.topQueries) allKeywords.push(...results.topQueries.map(q => q.query || q));

            // AI visibility keywords
            if (results.promptCategories) {
                for (const cat of results.promptCategories) {
                    if (cat.prompts) allKeywords.push(...cat.prompts.map(p => p.prompt || p));
                }
            }
        }

        // Deduplicate and structure
        const uniqueKeywords = [...new Set(allKeywords.filter(k => typeof k === 'string' && k.length > 2))];

        // Check cannibalization: keywords that are ranking organically AND being targeted in paid campaigns
        const campaigns = await AdCampaign.find({ brand: brandId, status: { $in: ['active', 'draft'] } }).lean();
        const paidKeywords = campaigns.flatMap(c => c.targeting?.interests || []).map(k => k.toLowerCase());

        const cannibalized = uniqueKeywords.filter(k => paidKeywords.includes(k.toLowerCase()));

        return {
            keywords: uniqueKeywords.slice(0, 50),
            total: uniqueKeywords.length,
            cannibalized: cannibalized,
            cannibalizationWarning: cannibalized.length > 0
                ? `⚠️ ${cannibalized.length} keywords are ranking organically AND being targeted in paid ads. Consider pausing paid targeting for these to save budget.`
                : null,
            suggestedForPaid: uniqueKeywords.filter(k => !paidKeywords.includes(k.toLowerCase())).slice(0, 20),
        };
    } catch (e) {
        console.error('SEO keyword bridge error:', e.message);
        return { keywords: [], error: e.message };
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// CONTENT STUDIO → AD CALENDAR SYNC
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Pull upcoming content calendar data to align ad campaigns with content drops.
 * Uses brand context and AI to suggest optimal timing.
 */
export async function getContentCalendarForAds(brandId) {
    try {
        const brand = await Brand.findById(brandId).lean();
        if (!brand) return { calendar: [], error: 'Brand not found' };

        // Check if brand has content plan context
        const contentContext = brand.dna?.contentPlan || brand.contextMemory?.contentStrategy || null;

        if (!contentContext) {
            return {
                calendar: [],
                message: 'No content calendar data available. Generate a content plan in Content Studio first.',
                suggestion: 'Create a content calendar in Content Studio → it will automatically sync here for ad timing optimization.',
            };
        }

        // AI: Match content schedule with optimal ad timing
        const ai = getRouter();
        const response = await ai.chat({
            messages: [
                {
                    role: 'system', content: `You are a Campaign Timing Optimizer. Given brand content plans, suggest when to run ads for maximum impact.

Return STRICT JSON:
{
  "upcomingContent": [
    { "date": "YYYY-MM-DD", "type": "blog|social|video|launch", "title": "...", "adOpportunity": "description of how to amplify this with paid ads" }
  ],
  "optimalAdWindows": [
    { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "reason": "...", "suggestedBudgetMultiplier": 1.5 }
  ]
}` },
                { role: 'user', content: `Brand: ${brand.name}\nIndustry: ${brand.dna?.industry || 'Unknown'}\nContent context:\n${JSON.stringify(contentContext).slice(0, 3000)}` },
            ],
            temperature: 0.5,
            response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content || '{}';
        return (() => {
            let _t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            const lastThinkIdx = _t.lastIndexOf('<think>');
            if (lastThinkIdx !== -1) {
                const beforeThink = _t.substring(0, lastThinkIdx).trim();
                const jsonAfter = _t.substring(lastThinkIdx).match(/\{[\s\S]*\}/);
                if (!jsonAfter && (beforeThink.endsWith('}') || beforeThink.endsWith(']'))) {
                    _t = beforeThink;
                }
            }
            const jm = _t.match(/\{[\s\S]*\}/) || _t.match(/\[[\s\S]*\]/);
            try { return JSON.parse(jm ? jm[0] : _t); } catch(e) { return {}; }
        })();
    } catch (e) {
        console.error('Content calendar bridge error:', e.message);
        return { calendar: [], error: e.message };
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// AGGREGATED CROSS-STUDIO OPPORTUNITIES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Aggregate all cross-studio data into a unified opportunities view.
 * AI-powered analysis of what data from other studios can improve PM performance.
 */
export async function getCrossStudioOpportunities(userId, brandId) {
    const [seoData, contentData] = await Promise.allSettled([
        getSEOKeywordsForTargeting(brandId),
        getContentCalendarForAds(brandId),
    ]);

    const seo = seoData.status === 'fulfilled' ? seoData.value : { keywords: [], error: seoData.reason?.message };
    const content = contentData.status === 'fulfilled' ? contentData.value : { calendar: [], error: contentData.reason?.message };

    // Generate AI-powered opportunity summary
    const ai = getRouter();
    try {
        const response = await ai.chat({
            messages: [
                {
                    role: 'system', content: `You are a Cross-Studio Intelligence Analyst. Given data from SEO Studio and Content Studio, identify opportunities to improve Performance Marketing.

Return STRICT JSON:
{
  "opportunities": [
    {
      "source": "seo|content|creative|video",
      "title": "short opportunity title",
      "description": "what to do",
      "impact": "high|medium|low",
      "actionType": "create-campaign|adjust-targeting|schedule-ads|generate-creative"
    }
  ],
  "summary": "2-sentence overview"
}` },
                {
                    role: 'user', content: `SEO keywords available: ${seo.keywords?.length || 0} keywords (${seo.cannibalized?.length || 0} cannibalized).
Content calendar: ${content.upcomingContent?.length || 0} upcoming items.
Suggested paid keywords: ${seo.suggestedForPaid?.slice(0, 10).join(', ') || 'None'}`
                },
            ],
            temperature: 0.5,
            response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content || '{}';
        const analysis = (() => {
            let _t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            const lastThinkIdx = _t.lastIndexOf('<think>');
            if (lastThinkIdx !== -1) {
                const beforeThink = _t.substring(0, lastThinkIdx).trim();
                const jsonAfter = _t.substring(lastThinkIdx).match(/\{[\s\S]*\}/);
                if (!jsonAfter && (beforeThink.endsWith('}') || beforeThink.endsWith(']'))) {
                    _t = beforeThink;
                }
            }
            const jm = _t.match(/\{[\s\S]*\}/) || _t.match(/\[[\s\S]*\]/);
            try { return JSON.parse(jm ? jm[0] : _t); } catch(e) { return {}; }
        })();

        return {
            ...analysis,
            seoData: seo,
            contentData: content,
            studioConnections: {
                seo: seo.keywords?.length > 0,
                content: !content.error,
                creative: false, // Future: integrate with Creative Studio image bank
                video: false,    // Future: integrate with Video Studio outputs
            },
        };
    } catch (e) {
        return {
            opportunities: [],
            summary: 'Cross-studio analysis unavailable.',
            seoData: seo,
            contentData: content,
            studioConnections: { seo: seo.keywords?.length > 0, content: !content.error, creative: false, video: false },
        };
    }
}

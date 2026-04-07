/**
 * Historical Learning Module — Self-Improving AI
 * 
 * Stores insights from completed campaigns and research,
 * then injects them into future agent prompts so the AI
 * gets smarter with each interaction.
 */

import AdLearning from '../../models/AdLearning.js';
import AdReport from '../../models/AdReport.js';
import AdCampaign from '../../models/AdCampaign.js';
import { getRouter } from '../../ai/router.js';
import { callAgent } from '../shared/agentUtils.js';

// ══════════════════════════════════════════════════════════════════════════════
// EXTRACT LEARNINGS — Analyze completed work and extract insights
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Extract learnings from a completed research report
 */
export async function extractLearningsFromReport(reportId) {
    const report = await AdReport.findById(reportId).lean();
    if (!report) return [];

    const learnings = [];

    // Extract from AI analysis recommendations
    if (report.aiAnalysis?.recommendations?.length) {
        for (const rec of report.aiAnalysis.recommendations.slice(0, 3)) {
            learnings.push({
                user: report.user,
                brand: report.brand,
                type: 'competitor-pattern',
                title: rec.title || 'Competitor insight',
                insight: {
                    summary: rec.title || '',
                    details: rec.description || '',
                    actionable: rec.estimatedImpact || '',
                    confidence: rec.priority === 'high' ? 'high' : 'medium',
                },
                tags: ['research', report.type],
                source: { reportId: report._id, agentGenerated: true },
            });
        }
    }

    // Extract strategy-level learnings
    if (report.strategyPlan?.goals?.length) {
        learnings.push({
            user: report.user,
            brand: report.brand,
            type: 'platform-insight',
            title: `Strategy goals for ${report.title}`,
            insight: {
                summary: report.strategyPlan.goals.slice(0, 3).join('; '),
                details: `Channel allocation: ${(report.strategyPlan.channelAllocation || []).map(c => `${c.channel}: ${c.budgetPercent}%`).join(', ')}`,
                actionable: 'Use these insights to inform future campaign strategies',
                confidence: 'medium',
            },
            tags: ['strategy', 'goals'],
            source: { reportId: report._id, agentGenerated: true },
        });
    }

    // Save all learnings
    if (learnings.length > 0) {
        await AdLearning.insertMany(learnings);
        console.log(`📚 PM Learning: Extracted ${learnings.length} insights from report ${reportId}`);
    }

    return learnings;
}

/**
 * Extract learnings from campaign performance data
 */
export async function extractLearningsFromCampaign(campaignId) {
    const campaign = await AdCampaign.findById(campaignId).lean();
    if (!campaign || !campaign.performance) return [];

    const learnings = [];
    const perf = campaign.performance;

    // Campaign result learning
    if (perf.spend > 0) {
        const roas = perf.roas || (perf.conversions > 0 ? perf.revenue / perf.spend : 0);
        const isGood = roas > 2 || perf.ctr > 2;

        learnings.push({
            user: campaign.user,
            brand: campaign.brand,
            type: 'campaign-result',
            title: `${isGood ? '✅ Winning' : '⚠️ Underperforming'}: ${campaign.title}`,
            insight: {
                summary: `${campaign.platform} campaign "${campaign.title}" achieved ${roas.toFixed(1)}x ROAS with ${perf.ctr?.toFixed(2)}% CTR`,
                details: `Spend: ₹${perf.spend}, Impressions: ${perf.impressions}, Clicks: ${perf.clicks}, Conversions: ${perf.conversions}`,
                actionable: isGood
                    ? `Scale this campaign type. Replicate the ${campaign.objective} objective on ${campaign.platform}.`
                    : `Review targeting and creatives. Consider pausing or restructuring.`,
                confidence: perf.impressions > 1000 ? 'high' : 'low',
            },
            tags: ['campaign', campaign.platform, campaign.objective],
            platform: campaign.platform,
            source: { campaignId: campaign._id, agentGenerated: true },
            metrics: {
                roas,
                ctr: perf.ctr,
                cpc: perf.cpc,
                cpa: perf.cpa,
                conversions: perf.conversions,
                spend: perf.spend,
            },
        });
    }

    // Audience insight
    if (campaign.targeting?.demographics) {
        learnings.push({
            user: campaign.user,
            brand: campaign.brand,
            type: 'audience-insight',
            title: `Audience: ${campaign.targeting.demographics.ageRange || 'All ages'} on ${campaign.platform}`,
            insight: {
                summary: `Targeted ${campaign.targeting.demographics.ageRange || 'broad audience'} on ${campaign.platform}`,
                details: `Interests: ${(campaign.targeting.interests || []).join(', ')}`,
                actionable: 'Consider testing this audience segment in future campaigns',
                confidence: 'medium',
            },
            tags: ['audience', campaign.platform],
            platform: campaign.platform,
            source: { campaignId: campaign._id, agentGenerated: true },
        });
    }

    if (learnings.length > 0) {
        await AdLearning.insertMany(learnings);
        console.log(`📚 PM Learning: Extracted ${learnings.length} insights from campaign ${campaignId}`);
    }

    return learnings;
}

// ══════════════════════════════════════════════════════════════════════════════
// RETRIEVE LEARNINGS — Format for AI prompt injection
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get relevant historical learnings for a brand, formatted for AI injection
 */
export async function getHistoricalContext(brandId, options = {}) {
    const { types, platform, limit = 15 } = options;

    const filter = {
        brand: brandId,
        status: 'active',
    };
    if (types?.length) filter.type = { $in: types };
    if (platform) filter.platform = { $in: [platform, 'both', 'general'] };

    const learnings = await AdLearning.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    if (learnings.length === 0) return '';

    // Increment usage counts
    const ids = learnings.map(l => l._id);
    await AdLearning.updateMany({ _id: { $in: ids } }, { $inc: { usageCount: 1 } });

    // Format for prompt injection
    const lines = ['── HISTORICAL LEARNINGS (from past campaigns & research) ──'];
    for (const l of learnings) {
        lines.push(`\n[${l.type.toUpperCase()}] ${l.title}`);
        lines.push(`  Summary: ${l.insight.summary}`);
        if (l.insight.actionable) lines.push(`  Action: ${l.insight.actionable}`);
        if (l.metrics?.roas) lines.push(`  ROAS: ${l.metrics.roas.toFixed(1)}x | CTR: ${l.metrics.ctr?.toFixed(2)}%`);
    }

    return lines.join('\n');
}

/**
 * Generate AI-powered meta-learnings by analyzing all past insights
 */
export async function generateMetaLearnings(brandId, userId) {
    const learnings = await AdLearning.find({
        brand: brandId,
        status: 'active',
    }).sort({ createdAt: -1 }).limit(30).lean();

    if (learnings.length < 3) return null;

    const router = getRouter();
    const result = await router.generateText({
        systemPrompt: `You are a performance marketing analyst. Analyze these historical campaign learnings and produce 3-5 META-INSIGHTS — higher-level patterns that emerge from multiple data points. Focus on what consistently works or fails for this brand. Respond in JSON with key: metaInsights (array of {title, summary, actionable, confidence}).`,
        userPrompt: learnings.map(l => `[${l.type}] ${l.title}: ${l.insight.summary} (${l.insight.actionable})`).join('\n'),
        temperature: 0.4,
        maxTokens: 2048,
    }); // Router auto-selects cheapest provider

    try {
        const text = result.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = (() => {
                try { return ( (() => { try { return JSON.parse(jsonMatch[0]); } catch(e) { return {}; } })() ); } catch(e) { return {}; }
           })();
            return parsed.metaInsights || [];
        }
    } catch (e) {
        console.warn('Meta-learning parse error:', e.message);
    }

    return null;
}

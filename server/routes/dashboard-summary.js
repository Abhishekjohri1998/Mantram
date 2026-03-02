/**
 * Dashboard Summary — Aggregated command center data
 * 
 * Single endpoint that returns everything the dashboard needs:
 * 1. Daily AI insight (tip/trick/opportunity) — cached per day
 * 2. Brand health scores (content velocity, trend readiness)
 * 3. Studio activity summary (content, creatives, campaigns, etc.)
 * 4. Grok trending topics + content suggestions
 * 5. Business News — live industry news relevant to the brand
 * 6. Did You Know — trivia/history about the brand's product/service
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Brand from '../models/Brand.js';
import Content from '../models/Content.js';
import Creative from '../models/Creative.js';
import {
    getTrendingTopics,
    getTrendingSEOKeywords,
    getContentSuggestions,
    isGrokAvailable,
} from '../services/grokTrends.js';

const router = Router();

// ── Daily insight cache (1 per brand per day) ──
const insightCache = new Map();

function getInsightCacheKey(brandId) {
    const today = new Date().toISOString().split('T')[0];
    return `${brandId || 'generic'}:${today}`;
}

async function generateDailyInsight(brand) {
    const cacheKey = getInsightCacheKey(brand?._id);
    const cached = insightCache.get(cacheKey);
    if (cached) return cached;

    if (!isGrokAvailable()) {
        const fallback = {
            title: 'Consistency is Key',
            tip: 'Brands that post 4-5 times per week see 3x more engagement than those posting once. Try scheduling content ahead using the Smart Calendar.',
            category: 'growth',
            emoji: '📈',
            actionLabel: 'Plan Content',
            actionPath: '/smart-calendar',
        };
        return fallback;
    }

    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${grokKey}`,
            },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a marketing intelligence agent. Generate ONE actionable daily tip for a brand owner. Today is ${new Date().toISOString().split('T')[0]}.

The tip should be:
- SPECIFIC and ACTIONABLE (not generic like "post more")
- Based on CURRENT trends, events, or seasonal opportunities
- Relevant to the brand's industry
- Something they can act on TODAY

Respond in JSON:
{
  "title": "Short catchy title (max 8 words)",
  "tip": "2-3 sentence actionable insight",
  "category": "trend|growth|competitive|seasonal|content|engagement",
  "emoji": "relevant emoji",
  "actionLabel": "Button text (e.g. 'Create Reel', 'Try Now')",
  "actionPath": "/path (one of: /content-studio, /creative-studio, /brainstorm, /seo-studio, /performance-marketing, /smart-calendar, /video-studio)"
}`,
                    },
                    {
                        role: 'user',
                        content: brand
                            ? `Brand: ${brand.name}, Industry: ${brand.dna?.industry || 'general'}, Voice: ${brand.dna?.voice?.personality || 'professional'}. What should they focus on today?`
                            : 'Give a general marketing tip for today based on current trends.',
                    },
                ],
                temperature: 0.8,
                max_tokens: 500,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';
        let insight;
        try {
            let clean = text.trim();
            if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            insight = JSON.parse(clean);
        } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) insight = JSON.parse(m[0]);
        }

        if (insight?.title) {
            insightCache.set(cacheKey, insight);
            return insight;
        }
    } catch (e) {
        console.warn('Daily insight generation failed:', e.message);
    }

    return {
        title: 'Post During Peak Hours',
        tip: `Most engagement happens between 10am-1pm and 7pm-9pm. Schedule your best content for these windows to maximize reach.`,
        category: 'engagement',
        emoji: '⏰',
        actionLabel: 'Schedule Now',
        actionPath: '/smart-calendar',
    };
}

// ── Business News cache (per brand per day) ──
const newsCache = new Map();

async function generateBusinessNews(brand) {
    const cacheKey = `news:${brand?._id || 'generic'}:${new Date().toISOString().split('T')[0]}`;
    const cached = newsCache.get(cacheKey);
    if (cached) return cached;

    if (!isGrokAvailable()) {
        return [
            { headline: 'AI Marketing Spend Surges 40% in 2026', summary: 'Brands investing more in AI-driven campaigns see higher ROI than traditional methods.', category: 'market', emoji: '📊', relevance: 'AI tools are reshaping how brands allocate budgets' },
            { headline: 'Short-Form Video Dominates Social Commerce', summary: 'Reels and Shorts now drive 35% of product discovery for D2C brands.', category: 'trend', emoji: '📱', relevance: 'Great time to invest in video content' },
        ];
    }

    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a business intelligence agent. Today is ${new Date().toISOString().split('T')[0]}.

Generate 4-5 CURRENT business news items relevant to a brand owner. Focus on:
- Funding rounds, acquisitions, or IPOs in the industry
- Policy changes, regulations, or government announcements
- New market opportunities or emerging trends
- Competitor moves or industry shifts
- Technology updates that impact the business

Make them REAL and CURRENT — reference actual events happening today or this week.
Each news item should explain WHY it matters to the brand.

Respond in JSON:
{
  "news": [
    {
      "headline": "Short punchy headline (max 12 words)",
      "summary": "2-3 sentence summary of the news",
      "category": "funding|policy|market|competitor|technology|economy",
      "emoji": "relevant emoji",
      "relevance": "Why this matters to the brand — 1 sentence",
      "source": "General source (e.g. 'Industry Reports', 'Market Analysis')"
    }
  ]
}`,
                    },
                    {
                        role: 'user',
                        content: brand
                            ? `Brand: ${brand.name}, Industry: ${brand.dna?.industry || 'general'}, Target Audience: ${brand.dna?.targetAudience || 'consumers'}, Country: ${brand.dna?.country || 'India'}. What's the latest business news they need to know?`
                            : 'Give general business and marketing news relevant to brand owners in India.',
                    },
                ],
                temperature: 0.7,
                max_tokens: 1200,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            let clean = text.trim();
            if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            parsed = JSON.parse(clean);
        } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
        }
        if (parsed?.news?.length) {
            newsCache.set(cacheKey, parsed.news);
            return parsed.news;
        }
    } catch (e) {
        console.warn('Business news generation failed:', e.message);
    }

    return [];
}

// ── Did You Know cache (per brand per day) ──
const dykCache = new Map();

async function generateDidYouKnow(brand) {
    const cacheKey = `dyk:${brand?._id || 'generic'}:${new Date().toISOString().split('T')[0]}`;
    const cached = dykCache.get(cacheKey);
    if (cached) return cached;

    if (!isGrokAvailable()) {
        return [
            { fact: 'The first known advertisement was carved on a papyrus in ancient Egypt around 3000 BC, advertising a reward for a runaway slave.', category: 'history', emoji: '📜', postIdea: 'Share this as a "Marketing Through the Ages" carousel post' },
            { fact: 'Color increases brand recognition by up to 80%. Choosing the right palette is one of the most impactful branding decisions.', category: 'psychology', emoji: '🎨', postIdea: 'Create an infographic about color psychology in your industry' },
        ];
    }

    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a knowledge curator for brand owners. Today is ${new Date().toISOString().split('T')[0]}.

Generate 3-4 fascinating "Did You Know" facts related to the brand's product, service, or industry. These should be:
- Genuinely SURPRISING and INTERESTING — not common knowledge
- Mix of: historical origins, science behind the product, cultural trivia, industry milestones, famous stories, psychology of consumers
- Each fact should be usable as a SOCIAL MEDIA POST — conversation starter, carousel content, or reel topic
- Include a concrete content idea for each fact

Respond in JSON:
{
  "facts": [
    {
      "fact": "The fascinating fact (2-3 sentences, detailed enough to be a mini-story)",
      "category": "history|science|culture|psychology|industry|innovation",
      "emoji": "relevant emoji",
      "postIdea": "How to turn this into a social media post — specific format suggestion",
      "hashtags": ["#relevant", "#hashtags"]
    }
  ]
}`,
                    },
                    {
                        role: 'user',
                        content: brand
                            ? `Brand: ${brand.name}, Industry: ${brand.dna?.industry || 'general'}, Products/Services: ${brand.dna?.brandDescription || brand.dna?.tagline || 'not specified'}, Target Audience: ${brand.dna?.targetAudience || 'general consumers'}. Give me fascinating facts about this industry/product category.`
                            : 'Give fascinating business and marketing facts that any brand owner would love.',
                    },
                ],
                temperature: 0.9,
                max_tokens: 1200,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';
        let parsed;
        try {
            let clean = text.trim();
            if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            parsed = JSON.parse(clean);
        } catch {
            const m = text.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
        }
        if (parsed?.facts?.length) {
            dykCache.set(cacheKey, parsed.facts);
            return parsed.facts;
        }
    } catch (e) {
        console.warn('Did You Know generation failed:', e.message);
    }

    return [];
}

// ── Studio activity aggregation ──
async function getStudioActivity(userId, brandId) {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const filter = { user: userId };
    if (brandId) filter.brand = brandId;

    const [
        contentThisWeek,
        contentTotal,
        creativesThisWeek,
        creativesTotal,
    ] = await Promise.allSettled([
        Content.countDocuments({ ...filter, createdAt: { $gte: weekAgo } }),
        Content.countDocuments(filter),
        Creative.countDocuments({ ...filter, createdAt: { $gte: weekAgo } }),
        Creative.countDocuments(filter),
    ]);

    return {
        content: {
            thisWeek: contentThisWeek.status === 'fulfilled' ? contentThisWeek.value : 0,
            total: contentTotal.status === 'fulfilled' ? contentTotal.value : 0,
        },
        creatives: {
            thisWeek: creativesThisWeek.status === 'fulfilled' ? creativesThisWeek.value : 0,
            total: creativesTotal.status === 'fulfilled' ? creativesTotal.value : 0,
        },
    };
}

// ── Brand health score ──
function computeBrandHealth(brand, activity) {
    const scores = {
        contentVelocity: Math.min(100, (activity.content.thisWeek / 5) * 100),
        creativeOutput: Math.min(100, (activity.creatives.thisWeek / 3) * 100),
        brandCompleteness: 0,
        trendReadiness: isGrokAvailable() ? 75 : 30,
        overallScore: 0,
    };

    // Brand completeness
    if (brand) {
        let complete = 0;
        if (brand.name) complete += 20;
        if (brand.dna?.industry) complete += 20;
        if (brand.dna?.voice?.personality) complete += 20;
        if (brand.dna?.targetAudience) complete += 20;
        if (brand.website) complete += 20;
        scores.brandCompleteness = complete;
    }

    scores.overallScore = Math.round(
        (scores.contentVelocity * 0.3) +
        (scores.creativeOutput * 0.2) +
        (scores.brandCompleteness * 0.25) +
        (scores.trendReadiness * 0.25)
    );

    return scores;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/dashboard-summary
// ═══════════════════════════════════════════════════════════════════════════

router.get('/', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const userId = req.user._id;

        let brand = null;
        if (brandId) {
            brand = await Brand.findById(brandId).lean();
        }

        // Parallel data fetching
        const industry = brand?.dna?.industry || 'general';
        const [
            dailyInsight,
            activity,
            grokTopicsResult,
            grokSeoResult,
            grokContentResult,
            businessNewsResult,
            didYouKnowResult,
        ] = await Promise.allSettled([
            generateDailyInsight(brand),
            getStudioActivity(userId, brandId),
            isGrokAvailable() ? getTrendingTopics(industry) : Promise.resolve({ trends: [] }),
            isGrokAvailable() ? getTrendingSEOKeywords(industry, brand?.website) : Promise.resolve({ risingKeywords: [] }),
            (isGrokAvailable() && brand) ? getContentSuggestions(brand) : Promise.resolve({ suggestions: [] }),
            generateBusinessNews(brand),
            generateDidYouKnow(brand),
        ]);

        const activityData = activity.status === 'fulfilled' ? activity.value : { content: { thisWeek: 0, total: 0 }, creatives: { thisWeek: 0, total: 0 } };
        const healthScores = computeBrandHealth(brand, activityData);

        res.json({
            success: true,
            dailyInsight: dailyInsight.status === 'fulfilled' ? dailyInsight.value : null,
            healthScores,
            activity: activityData,
            grokTrends: grokTopicsResult.status === 'fulfilled' ? (grokTopicsResult.value?.trends || []) : [],
            grokSeo: grokSeoResult.status === 'fulfilled' ? grokSeoResult.value : null,
            grokContent: grokContentResult.status === 'fulfilled' ? (grokContentResult.value?.suggestions || []) : [],
            businessNews: businessNewsResult.status === 'fulfilled' ? businessNewsResult.value : [],
            didYouKnow: didYouKnowResult.status === 'fulfilled' ? didYouKnowResult.value : [],
            grokAvailable: isGrokAvailable(),
            timestamp: new Date(),
        });
    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;

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
import SocialPost from '../models/SocialPost.js';
import SocialAccount from '../models/SocialAccount.js';
import IntelMission from '../models/IntelMission.js';
import { safeErrorMessage } from '../utils/safeError.js';
import {
    getTrendingTopics,
    getTrendingSEOKeywords,
    getContentSuggestions,
    isGrokAvailable,
} from '../services/grokTrends.js';

const router = Router();

// ── Daily insight cache (1 per brand per day) ──
const insightCache = new Map();

// ── Purge stale cache entries (older than today) ──
function purgeOldCacheEntries() {
    const today = new Date().toISOString().split('T')[0];
    for (const cache of [insightCache, newsCache, dykCache, radarCache]) {
        for (const key of cache.keys()) {
            const dateInKey = key.split(':').pop();
            if (dateInKey && dateInKey < today) cache.delete(key);
        }
    }
}

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

    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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

IMPORTANT: Only include news from the last 30 days (after ${cutoffDate}). Do NOT include any news older than this cutoff. Every item MUST be recent and relevant TODAY.

Generate 4-5 CURRENT business news items relevant to a brand owner. Focus on:
- Funding rounds, acquisitions, or IPOs in the industry
- Policy changes, regulations, or government announcements
- New market opportunities or emerging trends
- Competitor moves or industry shifts
- Technology updates that impact the business

Make them REAL and CURRENT — reference actual events happening this week or this month only.
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

// ── Streak calculation (consecutive days of activity) ──
async function computeStreak(userId) {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [contentDates, creativeDates] = await Promise.all([
            Content.find({ user: userId, createdAt: { $gte: thirtyDaysAgo } }, { createdAt: 1 }).lean(),
            Creative.find({ user: userId, createdAt: { $gte: thirtyDaysAgo } }, { createdAt: 1 }).lean(),
        ]);

        const allDates = [...contentDates, ...creativeDates].map(d => {
            const dt = new Date(d.createdAt);
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        });
        const uniqueDays = [...new Set(allDates)].sort().reverse();

        let streak = 0;
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const check = new Date(today);
            check.setDate(check.getDate() - i);
            const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
            if (uniqueDays.includes(key)) {
                streak++;
            } else if (i > 0) {
                break; // streak broken
            }
            // i === 0 and no activity today — check yesterday
        }
        return streak;
    } catch {
        return 0;
    }
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

// ── Strikes Radar (audience analytics) ──
const radarCache = new Map();

async function generateStrikesRadar(brand) {
    const cacheKey = `radar:${brand?._id || 'generic'}:${new Date().toISOString().split('T')[0]}`;
    const cached = radarCache.get(cacheKey);
    if (cached) return cached;

    if (!isGrokAvailable()) {
        const fallback = {
            sources: [
                { name: 'Organic Search', value: 38, color: '#34d399' },
                { name: 'Social Media', value: 28, color: '#8b5cf6' },
                { name: 'Direct', value: 18, color: '#06b6d4' },
                { name: 'Referral', value: 10, color: '#f59e0b' },
                { name: 'Paid Ads', value: 6, color: '#f43f5e' },
            ],
            locations: [
                { name: 'Mumbai', value: 22 }, { name: 'Delhi', value: 18 },
                { name: 'Bangalore', value: 15 }, { name: 'Pune', value: 12 },
                { name: 'Hyderabad', value: 10 }, { name: 'Others', value: 23 },
            ],
            gender: [{ name: 'Male', value: 52, color: '#3b82f6' }, { name: 'Female', value: 41, color: '#ec4899' }, { name: 'Other', value: 7, color: '#a855f7' }],
            devices: [{ name: 'Mobile', value: 64, color: '#06b6d4' }, { name: 'Desktop', value: 28, color: '#8b5cf6' }, { name: 'Tablet', value: 8, color: '#f59e0b' }],
            totalVisitors: 12480,
            weeklyGrowth: 12.5,
            topPage: '/products',
            bounceRate: 38,
            avgSession: '2m 45s',
        };
        return fallback;
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
                        content: `You are a web analytics intelligence agent. Generate REALISTIC estimated audience analytics for a brand. Use real market data patterns for the brand's industry and country.

Respond in JSON:
{
  "sources": [{"name": "source name", "value": percentage, "color": "hex"}],
  "locations": [{"name": "city/region", "value": percentage}],
  "gender": [{"name": "Male/Female/Other", "value": percentage, "color": "hex"}],
  "devices": [{"name": "Mobile/Desktop/Tablet", "value": percentage, "color": "hex"}],
  "totalVisitors": number,
  "weeklyGrowth": percentage,
  "topPage": "most visited page path",
  "bounceRate": percentage,
  "avgSession": "duration string"
}

Use colors: green=#34d399, violet=#8b5cf6, cyan=#06b6d4, amber=#f59e0b, rose=#f43f5e, blue=#3b82f6, pink=#ec4899, purple=#a855f7.
All percentage arrays must sum to 100. Make data realistic for the industry.`,
                    },
                    {
                        role: 'user',
                        content: brand
                            ? `Brand: ${brand.name}, Industry: ${brand.dna?.industry || 'general'}, Country: ${brand.dna?.country || 'India'}, Website: ${brand.website || 'not specified'}, Target Audience: ${brand.dna?.targetAudience || 'general'}.`
                            : 'Generate realistic analytics for a general Indian D2C brand.',
                    },
                ],
                temperature: 0.7,
                max_tokens: 800,
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
        if (parsed?.sources) {
            radarCache.set(cacheKey, parsed);
            return parsed;
        }
    } catch (e) {
        console.warn('Strikes radar generation failed:', e.message);
    }
    return null;
}

// ── ═══════════════════════════════════════════════════════════════════════════
// GET /api/dashboard-summary
// ── ═══════════════════════════════════════════════════════════════════════════

// ── 1. Hero Data (Fast: Streak, Health, Activity, Daily Insight)
router.get('/hero', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const userId = req.user._id;
        let brand = brandId ? await Brand.findById(brandId).lean() : null;

        const [dailyInsight, activity, streak] = await Promise.allSettled([
            generateDailyInsight(brand),
            getStudioActivity(userId, brandId),
            computeStreak(userId),
        ]);

        const activityData = activity.status === 'fulfilled' ? activity.value : { content: { thisWeek: 0, total: 0 }, creatives: { thisWeek: 0, total: 0 } };
        const healthScores = computeBrandHealth(brand, activityData);

        res.json({
            success: true,
            dailyInsight: dailyInsight.status === 'fulfilled' ? dailyInsight.value : null,
            healthScores,
            activity: activityData,
            streak: streak.status === 'fulfilled' ? streak.value : 0,
        });

    } catch (error) {
        console.error('Dash Hero error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── 2. Intelligence Hub (Heavy: News, Trends, Suggestions)
router.get('/intelligence', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        let brand = brandId ? await Brand.findById(brandId).lean() : null;
        const industry = brand?.dna?.industry || 'general';

        // Set a 25s timeout for AI operations to prevent 502s from Nginx (usually 30s-60s)
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), 25000);

        try {
            const [
                grokTopicsResult,
                grokSeoResult,
                grokContentResult,
                businessNewsResult,
                didYouKnowResult,
            ] = await Promise.allSettled([
                isGrokAvailable() ? getTrendingTopics(industry) : Promise.resolve({ trends: [] }),
                isGrokAvailable() ? getTrendingSEOKeywords(industry, brand?.website) : Promise.resolve({ risingKeywords: [] }),
                (isGrokAvailable() && brand) ? getContentSuggestions(brand) : Promise.resolve({ suggestions: [] }),
                generateBusinessNews(brand),
                generateDidYouKnow(brand),
            ]);

            res.json({
                success: true,
                grokTrends: grokTopicsResult.status === 'fulfilled' ? (grokTopicsResult.value?.trends || []) : [],
                grokSeo: grokSeoResult.status === 'fulfilled' ? grokSeoResult.value : null,
                grokContent: grokContentResult.status === 'fulfilled' ? (grokContentResult.value?.suggestions || []) : [],
                businessNews: businessNewsResult.status === 'fulfilled' ? businessNewsResult.value : [],
                didYouKnow: didYouKnowResult.status === 'fulfilled' ? didYouKnowResult.value : [],
                grokAvailable: isGrokAvailable(),
            });
        } finally {
            clearTimeout(timeout);
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return res.status(504).json({ success: false, error: 'Intelligence generation timed out. Try again.' });
        }
        console.error('Dash Intelligence error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── 3. Strikes Radar (Heavy: Audience Analytics)
router.get('/radar', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        let brand = brandId ? await Brand.findById(brandId).lean() : null;

        const radarResult = await generateStrikesRadar(brand);

        res.json({
            success: true,
            strikesRadar: radarResult,
        });
    } catch (error) {
        console.error('Dash Radar error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// Backward compatibility (Deprecated: Slow)
router.get('/', protect, async (req, res) => {
    try {
        purgeOldCacheEntries();
        const { brandId } = req.query;
        const userId = req.user._id;

        let brand = null;
        if (brandId) brand = await Brand.findById(brandId).lean();

        const industry = brand?.dna?.industry || 'general';
        const [
            dailyInsight, activity, grokTopicsResult, grokSeoResult,
            grokContentResult, businessNewsResult, didYouKnowResult,
            streakResult, radarResult,
        ] = await Promise.allSettled([
            generateDailyInsight(brand),
            getStudioActivity(userId, brandId),
            isGrokAvailable() ? getTrendingTopics(industry) : Promise.resolve({ trends: [] }),
            isGrokAvailable() ? getTrendingSEOKeywords(industry, brand?.website) : Promise.resolve({ risingKeywords: [] }),
            (isGrokAvailable() && brand) ? getContentSuggestions(brand) : Promise.resolve({ suggestions: [] }),
            generateBusinessNews(brand),
            generateDidYouKnow(brand),
            computeStreak(userId),
            generateStrikesRadar(brand),
        ]);

        res.json({
            success: true,
            dailyInsight: dailyInsight.status === 'fulfilled' ? dailyInsight.value : null,
            healthScores: computeBrandHealth(brand, activity.status === 'fulfilled' ? activity.value : { content: { thisWeek: 0, total: 0 }, creatives: { thisWeek: 0, total: 0 } }),
            activity: activity.status === 'fulfilled' ? activity.value : { content: { thisWeek: 0, total: 0 }, creatives: { thisWeek: 0, total: 0 } },
            grokTrends: grokTopicsResult.status === 'fulfilled' ? (grokTopicsResult.value?.trends || []) : [],
            grokSeo: grokSeoResult.status === 'fulfilled' ? grokSeoResult.value : null,
            grokContent: grokContentResult.status === 'fulfilled' ? (grokContentResult.value?.suggestions || []) : [],
            businessNews: businessNewsResult.status === 'fulfilled' ? businessNewsResult.value : [],
            didYouKnow: didYouKnowResult.status === 'fulfilled' ? didYouKnowResult.value : [],
            streak: streakResult.status === 'fulfilled' ? streakResult.value : 0,
            strikesRadar: radarResult.status === 'fulfilled' ? radarResult.value : null,
            grokAvailable: isGrokAvailable(),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ── ═══════════════════════════════════════════════════════════════════════════
// POST /api/dashboard-summary/strategy — AI Strategy from radar data
// ── ═══════════════════════════════════════════════════════════════════════════

router.post('/strategy', protect, async (req, res) => {
    try {
        const { radarData, contentStats, brandId } = req.body;
        if (!radarData) return res.status(400).json({ error: 'Radar data required' });

        let brand = null;
        if (brandId) brand = await Brand.findById(brandId).lean();

        if (!isGrokAvailable()) {
            // Smart fallback based on actual data
            const topSource = radarData.sources?.[0] || { name: 'Organic', value: 40 };
            const topLoc = radarData.locations?.[0] || { name: 'Primary City', value: 25 };
            const mobileShare = radarData.devices?.find(d => d.name === 'Mobile')?.value || 60;
            const bounce = radarData.bounceRate || 40;

            return res.json({
                strategy: {
                    summary: `Strategy for ${brand?.name || 'your brand'} based on current traffic patterns:`,
                    actions: [
                        { title: `Maximize ${topSource.name} Channel`, desc: `${topSource.name} drives ${topSource.value}% of traffic. Double investment here — optimize landing pages, increase content frequency, and A/B test CTAs specific to this channel.`, priority: 'high', icon: 'trending_up' },
                        { title: `Expand Beyond ${topLoc.name}`, desc: `${topLoc.name} accounts for ${topLoc.value}% of visitors. Run geo-targeted campaigns in secondary cities to diversify your audience base and reduce market concentration risk.`, priority: 'medium', icon: 'public' },
                        { title: mobileShare > 50 ? 'Mobile-First Content' : 'Desktop Optimization', desc: mobileShare > 50 ? `${mobileShare}% of traffic is mobile — prioritize vertical video, mobile-optimized landing pages, and snackable content formats.` : `Desktop traffic is strong — invest in long-form blog content, detailed product pages, and wide-format visuals.`, priority: 'high', icon: mobileShare > 50 ? 'smartphone' : 'computer' },
                        { title: bounce > 45 ? 'Fix Bounce Rate' : 'Maintain Engagement', desc: bounce > 45 ? `Bounce rate at ${bounce}% is above healthy range. Add interactive elements, improve page speed, and ensure above-fold content hooks visitors.` : `Bounce rate at ${bounce}% is healthy. Continue optimizing for engagement — add related content suggestions and embedded CTAs.`, priority: bounce > 45 ? 'high' : 'low', icon: 'speed' },
                        { title: 'Diversify Content Mix', desc: `Create content across all ${Object.keys(contentStats?.typeBreakdown || {}).length || 3} active formats. Test new formats like carousels, infographics, and short-video to discover hidden engagement drivers.`, priority: 'medium', icon: 'grid_view' },
                    ],
                },
            });
        }

        const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a marketing strategist AI. Analyze the traffic and content data, then generate 5 specific, actionable strategy recommendations.

Respond in JSON:
{
  "summary": "One-sentence overview of the strategy",
  "actions": [
    {
      "title": "Short action title (max 6 words)",
      "desc": "2-3 sentence detailed recommendation with specific numbers from the data",
      "priority": "high|medium|low",
      "icon": "material icon name (trending_up, public, smartphone, speed, grid_view, campaign, diversity_3, analytics, schedule, lightbulb)"
    }
  ]
}

Order actions by priority (high first). Make recommendations specific to the data — reference actual percentages and channel names.`,
                    },
                    {
                        role: 'user',
                        content: `Brand: ${brand?.name || 'Unknown'}, Industry: ${brand?.dna?.industry || 'general'}.
Traffic Sources: ${JSON.stringify(radarData.sources)}
Top Locations: ${JSON.stringify(radarData.locations)}
Gender Split: ${JSON.stringify(radarData.gender)}
Devices: ${JSON.stringify(radarData.devices)}
Total Visitors: ${radarData.totalVisitors}, Weekly Growth: ${radarData.weeklyGrowth}%, Bounce Rate: ${radarData.bounceRate}%, Avg Session: ${radarData.avgSession}
Content Stats: ${JSON.stringify(contentStats)}`,
                    },
                ],
                temperature: 0.7,
                max_tokens: 1000,
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
        res.json({ strategy: parsed });
    } catch (error) {
        console.error('Strategy generation error:', error);
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ── ═══════════════════════════════════════════════════════════════════════════
// GET /api/dashboard-summary/enhanced — Single-call aggregate for Command Center
// Returns: scheduled posts, social accounts, intel missions, strategy status,
//          studio activity counts, health scores, streak — all in one hit.
// ── ═══════════════════════════════════════════════════════════════════════════
router.get('/enhanced', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const userId = req.user._id;
        const brand = brandId ? await Brand.findById(brandId).lean() : null;

        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999);
        const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        const tomorrowEnd   = new Date(todayEnd);   tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

        const baseFilter = { user: userId, ...(brandId ? { brand: brandId } : {}) };

        const [
            activity,
            streak,
            socialAccounts,
            todayPosts,
            tomorrowPosts,
            intelMissions,
            scheduledCount,
        ] = await Promise.allSettled([
            getStudioActivity(userId, brandId),
            computeStreak(userId),
            SocialAccount.find(baseFilter).select('platform accountId accountName accessToken createdAt').lean().catch(() => []),
            SocialPost.find({ ...baseFilter, scheduledFor: { $gte: todayStart, $lte: todayEnd } })
                .sort({ scheduledFor: 1 }).limit(10)
                .select('platform caption scheduledFor status postId accountId accountName').lean().catch(() => []),
            SocialPost.find({ ...baseFilter, scheduledFor: { $gte: tomorrowStart, $lte: tomorrowEnd } })
                .sort({ scheduledFor: 1 }).limit(5)
                .select('platform caption scheduledFor status accountId accountName').lean().catch(() => []),
            brandId
                ? IntelMission.find({ brand: brandId, user: userId, status: 'active' })
                    .select('title type target status lastCheckedAt findings').sort({ updatedAt: -1 }).limit(5).lean().catch(() => [])
                : Promise.resolve([]),
            SocialPost.countDocuments({ ...baseFilter, status: 'scheduled', scheduledFor: { $gte: now } }).catch(() => 0),
        ]);

        const activityData = activity.status === 'fulfilled' ? activity.value : { content: { thisWeek: 0, total: 0 }, creatives: { thisWeek: 0, total: 0 } };
        const healthScores = computeBrandHealth(brand, activityData);

        // Per-platform social summary
        const accounts = socialAccounts.status === 'fulfilled' ? socialAccounts.value : [];
        const platformMap = {};
        for (const acc of accounts) {
            platformMap[acc.platform] = {
                connected: true,
                accountName: acc.accountName,
                accountId: acc.accountId,
                connectedAt: acc.createdAt,
            };
        }

        res.json({
            success: true,
            healthScores,
            activity: activityData,
            streak: streak.status === 'fulfilled' ? streak.value : 0,
            scheduledPosts: {
                today: todayPosts.status === 'fulfilled' ? todayPosts.value : [],
                tomorrow: tomorrowPosts.status === 'fulfilled' ? tomorrowPosts.value : [],
                totalUpcoming: scheduledCount.status === 'fulfilled' ? scheduledCount.value : 0,
            },
            socialPlatforms: {
                instagram: platformMap.instagram || { connected: false },
                facebook: platformMap.facebook || { connected: false },
                linkedin: platformMap.linkedin || { connected: false },
                twitter: platformMap.twitter || { connected: false },
            },
            connectedPlatformCount: accounts.length,
            intelMissions: intelMissions.status === 'fulfilled' ? intelMissions.value : [],
        });
    } catch (error) {
        console.error('[Dashboard Enhanced] Error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;

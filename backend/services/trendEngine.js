/**
 * Trend Engine — Marketing-focused trend aggregator
 * 
 * Fetches MARKETING-RELEVANT trends (not generic news):
 * 1. Google Trends Daily (what people are actually searching for)
 * 2. Google Trends Real-time (viral search spikes)
 * 
 * Then AI filters for: marketable topics, meme-able moments, brand-relevant 
 * cultural events, seasonal hooks — NOT political news or disasters.
 */

import googleTrends from 'google-trends-api';
import Parser from 'rss-parser';
import { getTrendingTopics, isGrokAvailable } from './grokTrends.js';

const rssParser = new Parser({
    timeout: 10000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MantramAI/1.0)' },
});

// ── In-memory cache (brand-specific) ────────────────────────────────────
const cache = {
    raw: null,          // raw trends (brand-agnostic)
    rawFetched: 0,
    branded: new Map(), // brand-specific matched results: brandId → { trends, time }
    TTL: 30 * 60 * 1000,
};

// ── Google Trends RSS ───────────────────────────────────────────────────
async function fetchGoogleTrendsRSS(geo = 'IN') {
    try {
        const url = `https://trends.google.com/trending/rss?geo=${geo}`;
        const feed = await rssParser.parseURL(url);
        return (feed.items || []).slice(0, 20).map(item => ({
            title: item.title,
            description: item.contentSnippet || item.content || '',
            url: item.link || '',
            source: 'Google Trends',
            sourceIcon: 'trending_up',
            category: 'trending',
            traffic: item['ht:approx_traffic'] || '',
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
        }));
    } catch (err) {
        console.warn('⚠️ Google Trends RSS failed:', err.message);
        return [];
    }
}

// ── Google Trends Daily ─────────────────────────────────────────────────
async function fetchGoogleTrendsDaily(geo = 'IN') {
    const retryFetch = async (retries = 2) => {
        try {
            // Add jitter to avoid synchronized bursts
            await new Promise(r => setTimeout(r, Math.random() * 2000));
            const result = await googleTrends.dailyTrends({ geo });
            if (result && result.trim().startsWith('<')) {
                if (retries > 0) return retryFetch(retries - 1);
                console.log('ℹ️ Google Daily Trends rate-limited, falling back to RSS/Grok.');
                return [];
            }
            return JSON.parse(result);
        } catch (err) {
            if (retries > 0) return retryFetch(retries - 1);
            throw err;
        }
    };

    try {
        const parsed = await retryFetch();
        const days = parsed.default?.trendingSearchesDays || [];
        const searches = [];

        for (const day of days.slice(0, 2)) {
            for (const ts of (day.trendingSearches || []).slice(0, 10)) {
                searches.push({
                    title: ts.title?.query || ts.title || '',
                    description: ts.articles?.[0]?.title || '',
                    url: ts.articles?.[0]?.url || '',
                    source: 'Google Daily',
                    sourceIcon: 'search',
                    category: 'daily',
                    traffic: ts.formattedTraffic || '',
                    pubDate: new Date(day.date || Date.now()),
                    relatedQueries: (ts.relatedQueries || []).map(q => q.query),
                    image: ts.image?.imageUrl || ts.articles?.[0]?.image?.imageUrl || '',
                });
            }
        }
        return searches;
    } catch (err) {
        if (!err.message?.includes('Unexpected token')) {
            console.warn('⚠️ Google daily trends failed:', err.message);
        }
        return [];
    }
}

// ── Google Trends Real-time ─────────────────────────────────────────────
async function fetchGoogleTrendsRealtime(geo = 'IN') {
    const retryFetch = async (retries = 2) => {
        try {
            await new Promise(r => setTimeout(r, Math.random() * 2000));
            const result = await googleTrends.realTimeTrends({ geo, category: 'all' });
            if (result && result.trim().startsWith('<')) {
                if (retries > 0) return retryFetch(retries - 1);
                console.log('ℹ️ Google Real-time Trends rate-limited, falling back to RSS/Grok.');
                return [];
            }
            return JSON.parse(result);
        } catch (err) {
            if (retries > 0) return retryFetch(retries - 1);
            throw err;
        }
    };

    try {
        const parsed = await retryFetch();
        const stories = parsed.storySummaries?.trendingStories || [];

        return stories.slice(0, 15).map(story => ({
            title: story.entityNames?.join(', ') || story.title || 'Trending',
            description: story.articles?.[0]?.articleTitle || '',
            url: story.articles?.[0]?.url || '',
            source: 'Google Real-time',
            sourceIcon: 'bolt',
            category: 'realtime',
            traffic: story.articles?.length ? `${story.articles.length} articles` : '',
            pubDate: new Date(),
        }));
    } catch (err) {
        if (!err.message?.includes('Unexpected token')) {
            console.warn('⚠️ Google real-time trends failed:', err.message);
        }
        return [];
    }
}

// ── Raw trend fetcher (no AI) ───────────────────────────────────────────
export async function fetchAllTrends(geo = 'IN') {
    if (cache.raw && (Date.now() - cache.rawFetched) < cache.TTL) {
        console.log('📦 Returning cached raw trends');
        return cache.raw;
    }

    console.log('🔥 Fetching fresh trends from Google + Grok...');

    const sources = [
        fetchGoogleTrendsRSS(geo),
        fetchGoogleTrendsDaily(geo),
        fetchGoogleTrendsRealtime(geo),
    ];

    // Add Grok as 4th source if available
    if (isGrokAvailable()) {
        sources.push(
            getTrendingTopics('general', geo === 'IN' ? 'India' : geo)
                .then(data => (data?.trends || []).map(t => ({
                    title: t.topic || '',
                    description: t.description || '',
                    url: '',
                    source: 'Grok xAI',
                    sourceIcon: 'smart_toy',
                    category: t.category || 'viral',
                    traffic: `${t.viralScore || 0}/100 viral`,
                    pubDate: new Date(),
                    contentIdea: t.contentIdea || '',
                    marketingAngle: t.marketingAngle || '',
                    hashtags: t.hashtags || [],
                    format: t.format || '',
                    urgency: t.urgency || 'medium',
                })))
                .catch(() => [])
        );
    }

    const settled = await Promise.allSettled(sources);

    const allTrends = settled
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value || []);

    // Deduplicate
    const seen = new Set();
    const unique = allTrends.filter(t => {
        const key = t.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
        if (seen.has(key) || !t.title) return false;
        seen.add(key);
        return true;
    });

    const result = unique.slice(0, 40);
    cache.raw = result;
    cache.rawFetched = Date.now();
    console.log(`✅ Fetched ${result.length} unique trends`);
    return result;
}

// ── AI Brand Matching — MARKETING FOCUSED ───────────────────────────────
export async function matchTrendsToBrand(trends, brand, orchestrator) {
    if (!trends.length || !brand) return [];

    // Check brand-specific cache
    const brandCacheKey = brand._id?.toString();
    const brandCache = cache.branded.get(brandCacheKey);
    if (brandCache && (Date.now() - brandCache.time) < cache.TTL) {
        console.log(`📦 Returning cached brand-matched trends for ${brand.name}`);
        return brandCache.trends;
    }

    const trendSummaries = trends.slice(0, 30).map((t, i) =>
        `[${i}] "${t.title}" — ${t.traffic || 'trending'}`
    ).join('\n');

    const brandContext = [
        `Brand: ${brand.name}`,
        brand.dna?.industry ? `Industry: ${brand.dna.industry}` : '',
        brand.dna?.aboutUs ? `About: ${brand.dna.aboutUs.slice(0, 300)}` : '',
        brand.dna?.targetAudience ? `Target Audience: ${brand.dna.targetAudience}` : '',
        brand.dna?.voice?.personality ? `Brand Personality: ${brand.dna.voice.personality}` : '',
        brand.dna?.services?.length ? `Services/Products: ${brand.dna.services.map(s => s.name || s).join(', ')}` : '',
        brand.website ? `Website: ${brand.website}` : '',
    ].filter(Boolean).join('\n');

    try {
        const aiResult = await orchestrator.generateContent({
            brand: { name: 'Marketing Trend Agent' },
            user: { _id: 'system' },
            type: 'trend_matching',
            prompt: `You are a MARKETING TREND HIJACK strategist. Your job is to identify trending topics that a brand can USE for marketing content.

${brandContext}

TRENDING SEARCHES RIGHT NOW:
${trendSummaries}

IMPORTANT SELECTION CRITERIA:
- ONLY select trends that are MARKETABLE — topics a brand can make social media posts, memes, campaigns, or carousel reels about
- SKIP: political news, accidents, crime, court cases, disasters, death-related news, government policy
- PREFER: pop culture, entertainment, sports events, viral moments, tech launches, festivals, memes, celebrity moments, lifestyle trends, seasonal events
- Think about what is TRENDING on Instagram/Twitter that brands are posting about
- The brand operates in: ${brand.dna?.industry || 'general'} market
- Match trends that this specific brand's audience would care about

Return a JSON array (max 6 items):
[
  {
    "index": 0,
    "relevance": 85,
    "marketingAngle": "How this brand should leverage this — be specific and actionable",
    "contentIdea": "Exact post headline/caption idea for social media",
    "format": "reel|carousel|meme|instagram-post|twitter-post|story",
    "urgency": "high|medium|low",
    "hashtags": ["#trending", "#brandrelevant"]
  }
]

RULES:
- relevance 80-100: directly related to brand's market (e.g., tech trend for a tech brand)
- relevance 60-79: tangentially related (e.g., cricket match → "music for match watching" for audio brand)
- relevance 40-59: creative stretch possible (e.g., viral meme format the brand can adapt)
- Skip anything below 40 relevance
- "contentIdea" must be a READY-TO-POST social media idea, not a vague suggestion
- Return ONLY valid JSON array, nothing else`,
            platform: '',
            options: {},
        });

        let content = aiResult.content || '';
        content = content.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();

        let matches = [];
        try {
            const parsed = JSON.parse(content);
            matches = Array.isArray(parsed) ? parsed : (parsed.trends || []);
        } catch (parseErr) {
            // Robust parsing for partial/truncated JSON: extract all complete { ... } objects
            const objectRegex = /\{[\s\S]*?\}/g;
            const foundObjects = content.match(objectRegex) || [];
            for (const objStr of foundObjects) {
                try {
                    const obj = JSON.parse(objStr);
                    if (obj && typeof obj.index === 'number') matches.push(obj);
                } catch (e) { /* skip broken objects */ }
            }

            if (matches.length === 0) {
                console.warn('AI trend match: no valid JSON objects found. Raw response length:', content.length);
                return [];
            }
            console.log(`ℹ️ Salvaged ${matches.length} trend matches from truncated response.`);
        }
        const result = matches
            .filter(m => typeof m.index === 'number' && m.index >= 0 && m.index < trends.length)
            .map(m => ({
                ...trends[m.index],
                relevance: m.relevance || 50,
                angle: m.marketingAngle || '',
                contentIdea: m.contentIdea || '',
                format: m.format || 'instagram-post',
                urgency: m.urgency || 'medium',
                hashtags: m.hashtags || [],
            }))
            .sort((a, b) => b.relevance - a.relevance);

        // Cache brand-matched results
        cache.branded.set(brandCacheKey, { trends: result, time: Date.now() });

        return result;
    } catch (err) {
        console.error('AI trend matching failed:', err.message);
        return [];
    }
}

// ── Force refresh ───────────────────────────────────────────────────────
export function clearTrendCache() {
    cache.raw = null;
    cache.rawFetched = 0;
    cache.branded.clear();
}

/**
 * Web Intelligence Module — Real-time market data for PM Studio
 * 
 * Pulls live data from:
 * 1. Google Trends (via existing trendEngine.js)
 * 2. Google Trends API (keyword interest over time)
 * 3. Web scraping for competitor landing pages
 * 
 * All data is formatted for injection into AI agent prompts.
 */

import googleTrends from 'google-trends-api';
import { fetchAllTrends, matchTrendsToBrand } from '../../services/trendEngine.js';
import Brand from '../../models/Brand.js';

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE TRENDS — Interest Over Time
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get interest over time for keywords
 * Returns trend data that shows if interest is growing or declining
 */
export async function getKeywordTrends(keywords, geo = 'IN', timeRange = 'now 3-m') {
    const results = [];

    for (const keyword of (keywords || []).slice(0, 5)) {
        try {
            const data = await googleTrends.interestOverTime({
                keyword,
                geo,
                startTime: getStartTime(timeRange),
            });

            const parsed = safeJSON(data);
            if (!parsed) {
                results.push({ keyword, error: 'Invalid response from Google Trends', trend: 'unknown' });
                continue;
            }
            const timeline = parsed?.default?.timelineData || [];

            if (timeline.length > 0) {
                const values = timeline.map(t => t.value?.[0] || 0);
                const recent = values.slice(-7);
                const older = values.slice(0, 7);
                const recentAvg = recent.reduce((s, v) => s + v, 0) / Math.max(recent.length, 1);
                const olderAvg = older.reduce((s, v) => s + v, 0) / Math.max(older.length, 1);

                results.push({
                    keyword,
                    currentInterest: values[values.length - 1] || 0,
                    avgInterest: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
                    trend: recentAvg > olderAvg * 1.1 ? 'rising' :
                        recentAvg < olderAvg * 0.9 ? 'declining' : 'stable',
                    trendStrength: Math.round(((recentAvg - olderAvg) / Math.max(olderAvg, 1)) * 100),
                    peakInterest: Math.max(...values),
                    dataPoints: timeline.length,
                });
            }
        } catch (e) {
            console.warn(`Google Trends error for "${keyword}":`, e.message);
            results.push({ keyword, error: e.message, trend: 'unknown' });
        }
    }

    return results;
}

/**
 * Get related queries for a keyword (what people also search for)
 */
export async function getRelatedQueries(keyword, geo = 'IN') {
    try {
        const data = await googleTrends.relatedQueries({
            keyword,
            geo,
            startTime: getStartTime('now 3-m'),
        });

        const parsed = safeJSON(data);
        if (!parsed) return { keyword, topQueries: [], risingQueries: [], error: 'Invalid response' };
        
        const topQueries = parsed?.default?.rankedList?.[0]?.rankedKeyword || [];
        const risingQueries = parsed?.default?.rankedList?.[1]?.rankedKeyword || [];

        return {
            keyword,
            topQueries: topQueries.slice(0, 10).map(q => ({
                query: q.query,
                value: q.value,
            })),
            risingQueries: risingQueries.slice(0, 10).map(q => ({
                query: q.query,
                value: q.formattedValue || `+${q.value}%`,
            })),
        };
    } catch (e) {
        console.warn(`Related queries error for "${keyword}":`, e.message);
        return { keyword, topQueries: [], risingQueries: [], error: e.message };
    }
}

/**
 * Get related topics for a keyword
 */
export async function getRelatedTopics(keyword, geo = 'IN') {
    try {
        const data = await googleTrends.relatedTopics({
            keyword,
            geo,
            startTime: getStartTime('now 3-m'),
        });

        const parsed = safeJSON(data);
        if (!parsed) return { keyword, topTopics: [], risingTopics: [], error: 'Invalid response' };

        const topTopics = parsed?.default?.rankedList?.[0]?.rankedKeyword || [];
        const risingTopics = parsed?.default?.rankedList?.[1]?.rankedKeyword || [];

        return {
            keyword,
            topTopics: topTopics.slice(0, 8).map(t => ({
                title: t.topic?.title || t.query,
                type: t.topic?.type || '',
                value: t.formattedValue || t.value,
            })),
            risingTopics: risingTopics.slice(0, 8).map(t => ({
                title: t.topic?.title || t.query,
                type: t.topic?.type || '',
                value: t.formattedValue || `+${t.value}%`,
            })),
        };
    } catch (e) {
        console.warn(`Related topics error for "${keyword}":`, e.message);
        return { keyword, topTopics: [], risingTopics: [], error: e.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// LIVE TRENDS — Industry & Brand-Matched Trends
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Get currently trending topics relevant to the brand
 */
export async function getBrandTrends(brandId, geo = 'IN') {
    try {
        const brand = await Brand.findById(brandId).lean();
        if (!brand) return { trends: [], error: 'Brand not found' };

        const rawTrends = await fetchAllTrends(geo);

        // Match trends to brand (uses AI matching from trendEngine)
        // Note: matchTrendsToBrand requires an orchestrator, but we can filter manually
        const industry = brand.industry || brand.dna?.industry || '';
        const brandName = brand.name || '';
        const keywords = [
            ...(brand.dna?.keywords || []),
            ...(brand.competitors || []),
            industry,
            brandName,
        ].filter(Boolean).map(k => k.toLowerCase());

        // Simple keyword matching for fast, no-cost filtering
        const relevantTrends = rawTrends
            .filter(t => {
                const title = (t.title || t.topic || '').toLowerCase();
                return keywords.some(k => title.includes(k) || k.includes(title));
            })
            .slice(0, 10);

        return {
            totalTrending: rawTrends.length,
            brandRelevant: relevantTrends.length,
            trends: relevantTrends,
            allTrends: rawTrends.slice(0, 20),
        };
    } catch (e) {
        console.warn('Brand trends error:', e.message);
        return { trends: [], allTrends: [], error: e.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE INTELLIGENCE — Combined data for PM agents
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Run full intelligence gathering for a competitor research session.
 * Returns structured data ready for injection into agent prompts.
 */
export async function gatherMarketIntelligence({ competitors, industry, keywords, brandId, geo = 'IN' }) {
    console.log('🔍 Web Intelligence: Gathering market data...');

    // Build keyword list from all inputs
    const allKeywords = [
        ...(keywords || []),
        ...(competitors || []),
        industry,
    ].filter(Boolean).slice(0, 5);

    // Run all data sources in parallel
    const [keywordTrends, brandTrends, relatedData] = await Promise.all([
        getKeywordTrends(allKeywords, geo),
        brandId ? getBrandTrends(brandId, geo) : Promise.resolve({ trends: [], allTrends: [] }),
        allKeywords[0] ? getRelatedQueries(allKeywords[0], geo) : Promise.resolve({ topQueries: [], risingQueries: [] }),
    ]);

    // Format as a context string for AI prompts
    const contextString = formatForPrompt({ keywordTrends, brandTrends, relatedData });

    return {
        keywordTrends,
        brandTrends,
        relatedQueries: relatedData,
        contextString,
        fetchedAt: new Date().toISOString(),
    };
}

/**
 * Format intelligence data into a concise string for AI prompt injection
 */
function formatForPrompt({ keywordTrends, brandTrends, relatedData }) {
    const lines = ['── LIVE MARKET INTELLIGENCE ──'];

    // Keyword trends
    if (keywordTrends?.length) {
        lines.push('\nKEYWORD TRENDS (Google Trends):');
        for (const kt of keywordTrends) {
            if (kt.error) continue;
            lines.push(`• "${kt.keyword}": interest=${kt.currentInterest}/100, trend=${kt.trend} (${kt.trendStrength > 0 ? '+' : ''}${kt.trendStrength}%), peak=${kt.peakInterest}`);
        }
    }

    // Currently trending topics
    if (brandTrends?.trends?.length) {
        lines.push(`\nRELEVANT TRENDING TOPICS (${brandTrends.brandRelevant} of ${brandTrends.totalTrending}):`);
        for (const t of brandTrends.trends.slice(0, 5)) {
            lines.push(`• ${t.title || t.topic} (traffic: ${t.traffic || 'unknown'})`);
        }
    }

    // Related queries (what people also search for)
    if (relatedData?.risingQueries?.length) {
        lines.push('\nRISING SEARCH QUERIES:');
        for (const q of relatedData.risingQueries.slice(0, 5)) {
            lines.push(`• "${q.query}" — ${q.value}`);
        }
    }

    return lines.join('\n');
}

// ── Helper ──
function getStartTime(range) {
    const now = new Date();
    switch (range) {
        case 'now 1-d': return new Date(now - 24 * 60 * 60 * 1000);
        case 'now 7-d': return new Date(now - 7 * 24 * 60 * 60 * 1000);
        case 'now 1-m': return new Date(now - 30 * 24 * 60 * 60 * 1000);
        case 'now 3-m': return new Date(now - 90 * 24 * 60 * 60 * 1000);
        case 'now 12-m': return new Date(now - 365 * 24 * 60 * 60 * 1000);
        default: return new Date(now - 90 * 24 * 60 * 60 * 1000);
    }
}

/**
 * Safe JSON parser for Google Trends responses
 */
function safeJSON(data) {
    if (!data) return null;
    try {
        // google-trends-api sometimes returns a string that starts with ")]}',\n"
        let clean = data;
        if (clean.includes(")]}',")) {
            clean = clean.substring(clean.indexOf('\n') + 1);
        }
        return JSON.parse(clean);
    } catch (e) {
        console.warn('[WebIntel] Google Trends JSON Parse failed:', e.message);
        return null;
    }
}

/**
 * Performance Marketing Studio — Competitor Research Module
 * 
 * Provides functions to research competitor ads using:
 * 1. Meta Ad Library API (free, no ad account needed)
 * 2. AI-powered web analysis via Claude
 * 
 * Phase 1: AI-only analysis (no API keys needed)
 * Phase 2: Live Meta Ad Library integration
 */

import config from '../../config/env.js';
import { gatherMarketIntelligence } from './webIntelligence.js';

// ══════════════════════════════════════════════════════════════════════════════
// META AD LIBRARY — Search public competitor ads
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Search Meta Ad Library for competitor ads.
 * The Ad Library API is free and doesn't require an ad account.
 * Docs: https://www.facebook.com/ads/library/api/
 * 
 * @param {Object} params
 * @param {string} params.query — Search term (brand name, keyword)
 * @param {string} params.country — ISO country code (e.g., 'IN', 'US')
 * @param {string} params.adType — 'ALL', 'POLITICAL_AND_ISSUE_ADS'
 * @param {number} params.limit — Max results
 */
export async function searchMetaAdLibrary({ query, country = 'IN', adType = 'ALL', limit = 25 }) {
    const accessToken = config.metaAds?.appId; // Long-lived token or app token
    if (!accessToken) {
        console.log('⚠️ Meta Ad Library: No access token configured, using AI-only mode');
        return { ads: [], source: 'ai-only' };
    }

    try {
        const url = new URL('https://graph.facebook.com/v19.0/ads_archive');
        url.searchParams.set('access_token', accessToken);
        url.searchParams.set('search_terms', query);
        url.searchParams.set('ad_reached_countries', `["${country}"]`);
        url.searchParams.set('ad_type', adType);
        url.searchParams.set('ad_active_status', 'ALL');
        url.searchParams.set('fields', 'id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_creative_link_captions,ad_snapshot_url,page_name,publisher_platforms,estimated_audience_size,spend,impressions,ad_delivery_start_time');
        url.searchParams.set('limit', String(limit));

        const response = await fetch(url.toString());
        const data = await response.json();

        if (data.error) {
            console.warn('Meta Ad Library error:', data.error.message);
            return { ads: [], error: data.error.message, source: 'meta-api' };
        }

        // Normalize the response
        const ads = (data.data || []).map(ad => ({
            id: ad.id,
            advertiser: ad.page_name,
            platform: 'meta',
            adType: 'paid',
            headline: ad.ad_creative_link_titles?.[0] || '',
            bodyText: ad.ad_creative_bodies?.[0] || '',
            description: ad.ad_creative_link_descriptions?.[0] || '',
            cta: ad.ad_creative_link_captions?.[0] || '',
            snapshotUrl: ad.ad_snapshot_url || '',
            platforms: ad.publisher_platforms || [],
            estimatedAudienceSize: ad.estimated_audience_size || {},
            spend: ad.spend || {},
            impressions: ad.impressions || {},
            startDate: ad.ad_delivery_start_time,
        }));

        return { ads, source: 'meta-api', total: data.data?.length || 0 };
    } catch (error) {
        console.error('Meta Ad Library fetch error:', error.message);
        return { ads: [], error: error.message, source: 'meta-api' };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE ADS TRANSPARENCY CENTER — Scrape competitor data
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Note: Google Ads Transparency Center doesn't have a public API yet.
 * This placeholder returns structured data that Claude can analyze.
 * In production, you'd use the Ads Transparency Center or Google Ads API.
 */
export async function searchGoogleTransparency({ query, country = 'IN' }) {
    // Placeholder — returns empty for now, Claude fills in from training data
    return {
        ads: [],
        source: 'google-transparency',
        note: 'Google Ads Transparency API not yet available. Using AI analysis.',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// COMBINED RESEARCH — Run all sources and merge
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Run competitor research across all available sources
 */
export async function runCompetitorResearch({ competitors, platforms, country = 'IN', brandId, industry, keywords }) {
    const allAds = [];
    const sources = [];

    // 1. Gather live market intelligence (Google Trends + related queries)
    let marketIntelligence = {};
    try {
        marketIntelligence = await gatherMarketIntelligence({
            competitors,
            industry,
            keywords,
            brandId,
            geo: country,
        });
        sources.push('google-trends');
        console.log('📈 PM Research: Google Trends data gathered');
    } catch (e) {
        console.warn('Market intelligence gathering failed:', e.message);
    }

    // 2. Search ad platforms
    for (const competitor of (competitors || ['industry trends'])) {
        // Meta Ad Library
        if (platforms.includes('meta') || platforms.includes('both')) {
            const metaResult = await searchMetaAdLibrary({
                query: competitor,
                country,
                limit: 10,
            });
            allAds.push(...metaResult.ads);
            if (!sources.includes(metaResult.source)) sources.push(metaResult.source);
        }

        // Google Transparency
        if (platforms.includes('google') || platforms.includes('both')) {
            const googleResult = await searchGoogleTransparency({
                query: competitor,
                country,
            });
            allAds.push(...googleResult.ads);
            if (!sources.includes(googleResult.source)) sources.push(googleResult.source);
        }
    }

    return {
        ads: allAds,
        sources,
        competitorsSearched: competitors || [],
        totalAds: allAds.length,
        marketIntelligence,
    };
}

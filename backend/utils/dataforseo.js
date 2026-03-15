/**
 * Mantram AI — DataForSEO Integration
 * 
 * Provides real keyword data: search volumes, CPC, difficulty, SERP features.
 * When DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD are set in .env, uses real API.
 * Otherwise, falls back to enhanced estimation from Google Autocomplete signals.
 * 
 * DataForSEO Pricing: ~$50/mo starter (pay-per-task)
 * Docs: https://docs.dataforseo.com/v3/
 */

const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN || '';
const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD || '';
const DATAFORSEO_BASE = 'https://api.dataforseo.com/v3';

function hasDataForSEO() {
    return !!(DATAFORSEO_LOGIN && DATAFORSEO_PASSWORD);
}

function getAuthHeader() {
    return 'Basic ' + Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64');
}

/**
 * Fetch real keyword data from DataForSEO
 * @param {string[]} keywords - Array of keywords to lookup
 * @param {string} locationCode - DataForSEO location code (2356=India, 2840=US, 2784=UAE)
 * @param {string} languageCode - Language code (en, hi, ar)
 * @returns {Promise<Object[]>} Array of keyword data objects
 */
async function fetchKeywordData(keywords, locationCode = '2356', languageCode = 'en') {
    if (!hasDataForSEO()) {
        console.log('⚠️ DataForSEO not configured — using estimation fallback');
        return null;
    }

    try {
        const response = await fetch(`${DATAFORSEO_BASE}/keywords_data/google_ads/search_volume/live`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{
                keywords: keywords.slice(0, 100), // Max 100 per request
                location_code: parseInt(locationCode),
                language_code: languageCode,
                date_from: getMonthsAgo(3),
                date_to: getToday(),
            }]),
        });

        if (!response.ok) {
            console.warn(`DataForSEO API error: ${response.status}`);
            return null;
        }

        const data = await response.json();
        if (data.status_code !== 20000) {
            console.warn('DataForSEO error:', data.status_message);
            return null;
        }

        // Parse results
        const results = data.tasks?.[0]?.result || [];
        return results.map(r => ({
            keyword: r.keyword,
            searchVolume: r.search_volume || 0,
            cpc: r.cpc || 0,
            competition: r.competition || 0, // 0-1 scale
            competitionLevel: r.competition_level || 'UNKNOWN',
            monthlySearches: r.monthly_searches || [], // Last 12 months
        }));
    } catch (e) {
        console.warn('DataForSEO fetch error:', e.message);
        return null;
    }
}

/**
 * Fetch keyword difficulty from DataForSEO
 */
async function fetchKeywordDifficulty(keywords, locationCode = '2356', languageCode = 'en') {
    if (!hasDataForSEO()) return null;

    try {
        const response = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/keyword_difficulty/live`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{
                keywords: keywords.slice(0, 100),
                location_code: parseInt(locationCode),
                language_code: languageCode,
            }]),
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data.status_code !== 20000) return null;

        const results = data.tasks?.[0]?.result || [];
        return results.map(r => ({
            keyword: r.keyword,
            difficulty: r.keyword_difficulty || 0, // 0-100 scale
        }));
    } catch (e) {
        console.warn('DataForSEO difficulty error:', e.message);
        return null;
    }
}

/**
 * Fetch SERP features for keywords
 */
async function fetchSerpFeatures(keywords, locationCode = '2356', languageCode = 'en') {
    if (!hasDataForSEO()) return null;

    try {
        const tasks = keywords.slice(0, 10).map(kw => ({
            keyword: kw,
            location_code: parseInt(locationCode),
            language_code: languageCode,
            device: 'desktop',
            os: 'windows',
        }));

        const response = await fetch(`${DATAFORSEO_BASE}/serp/google/organic/live/regular`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(tasks),
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data.status_code !== 20000) return null;

        return data.tasks?.map(t => {
            const items = t.result?.[0]?.items || [];
            const serpFeatures = new Set();
            for (const item of items) {
                if (item.type) serpFeatures.add(item.type);
            }
            return {
                keyword: t.data?.keyword,
                features: [...serpFeatures],
                totalResults: t.result?.[0]?.items_count || 0,
            };
        }) || [];
    } catch (e) {
        console.warn('DataForSEO SERP error:', e.message);
        return null;
    }
}

/**
 * Get keyword suggestions (related keywords with real data)
 */
async function fetchKeywordSuggestions(seedKeyword, locationCode = '2356', languageCode = 'en') {
    if (!hasDataForSEO()) return null;

    try {
        const response = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/related_keywords/live`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{
                keyword: seedKeyword,
                location_code: parseInt(locationCode),
                language_code: languageCode,
                limit: 50,
            }]),
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data.status_code !== 20000) return null;

        const items = data.tasks?.[0]?.result?.[0]?.items || [];
        return items.map(i => ({
            keyword: i.keyword_data?.keyword,
            searchVolume: i.keyword_data?.keyword_info?.search_volume || 0,
            cpc: i.keyword_data?.keyword_info?.cpc || 0,
            competition: i.keyword_data?.keyword_info?.competition || 0,
            difficulty: i.keyword_data?.keyword_properties?.keyword_difficulty || 0,
        })).filter(i => i.keyword);
    } catch (e) {
        console.warn('DataForSEO suggestions error:', e.message);
        return null;
    }
}

/**
 * Get backlink summary for a domain
 */
async function fetchBacklinkSummary(domain) {
    if (!hasDataForSEO()) return null;

    try {
        const response = await fetch(`${DATAFORSEO_BASE}/backlinks/summary/live`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{ target: domain, internal_list_limit: 0, backlinks_status_type: 'live' }]),
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data.status_code !== 20000) return null;

        const r = data.tasks?.[0]?.result?.[0];
        if (!r) return null;

        return {
            totalBacklinks: r.total_backlinks || 0,
            referringDomains: r.referring_domains || 0,
            referringIps: r.referring_ips || 0,
            domainRank: r.rank || 0,
            backlinksNofollow: r.backlinks_nofollow || 0,
            backlinksDofollow: r.total_backlinks - (r.backlinks_nofollow || 0),
            brokenBacklinks: r.broken_backlinks || 0,
            referringDomainsNofollow: r.referring_domains_nofollow || 0,
        };
    } catch (e) {
        console.warn('DataForSEO backlinks error:', e.message);
        return null;
    }
}

/**
 * Get top referring domains
 */
async function fetchTopReferringDomains(domain, limit = 20) {
    if (!hasDataForSEO()) return null;

    try {
        const response = await fetch(`${DATAFORSEO_BASE}/backlinks/referring_domains/live`, {
            method: 'POST',
            headers: {
                'Authorization': getAuthHeader(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify([{
                target: domain,
                limit,
                order_by: ['rank,desc'],
                backlinks_status_type: 'live',
            }]),
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data.status_code !== 20000) return null;

        const items = data.tasks?.[0]?.result?.[0]?.items || [];
        return items.map(i => ({
            domain: i.domain,
            rank: i.rank || 0,
            backlinks: i.backlinks || 0,
            firstSeen: i.first_seen,
            dofollow: i.backlinks - (i.backlinks_nofollow || 0),
            nofollow: i.backlinks_nofollow || 0,
        }));
    } catch (e) {
        console.warn('DataForSEO referring domains error:', e.message);
        return null;
    }
}

// ─── Unified Interface ──────────────────────────────────────────────────

/**
 * Location code mapping for DataForSEO
 */
const LOCATION_CODES = {
    'India': '2356', 'United States': '2840', 'UAE': '2784', 'Dubai': '2784',
    'UK': '2826', 'Singapore': '2702', 'Australia': '2036', 'Saudi Arabia': '2682',
    'Germany': '2276', 'France': '2250', 'Canada': '2124', 'Japan': '2392',
};

/**
 * Master function: Get enriched keyword data for a set of keywords
 * Uses DataForSEO if available, otherwise returns null (caller should use AI estimates)
 * 
 * @param {string[]} keywords - Keywords to research
 * @param {Object} options
 * @param {string} options.country - Country name
 * @param {string} options.language - Language code
 * @returns {Promise<{available: boolean, keywords: Object[], backlinks?: Object}>}
 */
export async function getKeywordIntelligence(keywords, options = {}) {
    const { country = 'India', language = 'en' } = options;
    const locationCode = LOCATION_CODES[country] || '2356';
    const isAvailable = hasDataForSEO();

    if (!isAvailable) {
        return {
            available: false,
            provider: 'none',
            message: 'DataForSEO API not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD in .env for real keyword data.',
        };
    }

    console.log(`📊 DataForSEO: Fetching real data for ${keywords.length} keywords (${country})...`);

    // Fetch volume + difficulty in parallel
    const [volumeData, difficultyData] = await Promise.all([
        fetchKeywordData(keywords, locationCode, language),
        fetchKeywordDifficulty(keywords, locationCode, language),
    ]);

    // Merge results
    const difficultyMap = {};
    (difficultyData || []).forEach(d => { difficultyMap[d.keyword] = d.difficulty; });

    const mergedKeywords = (volumeData || []).map(kw => ({
        ...kw,
        difficulty: difficultyMap[kw.keyword] || 0,
        dataSource: 'dataforseo',
    }));

    return {
        available: true,
        provider: 'dataforseo',
        keywords: mergedKeywords,
    };
}

/**
 * Get domain backlink intelligence
 */
export async function getDomainBacklinks(domain, options = {}) {
    const isAvailable = hasDataForSEO();
    if (!isAvailable) {
        return { available: false, provider: 'none' };
    }

    console.log(`🔗 DataForSEO: Fetching backlink data for ${domain}...`);

    const [summary, topDomains] = await Promise.all([
        fetchBacklinkSummary(domain),
        fetchTopReferringDomains(domain, 15),
    ]);

    return {
        available: true,
        provider: 'dataforseo',
        summary: summary || {},
        topReferringDomains: topDomains || [],
    };
}

/**
 * Get keyword suggestions with real data
 */
export async function getKeywordSuggestions(seedKeyword, options = {}) {
    const { country = 'India', language = 'en' } = options;
    const locationCode = LOCATION_CODES[country] || '2356';

    if (!hasDataForSEO()) {
        return { available: false, provider: 'none' };
    }

    const suggestions = await fetchKeywordSuggestions(seedKeyword, locationCode, language);
    return {
        available: true,
        provider: 'dataforseo',
        suggestions: suggestions || [],
    };
}

/**
 * Get SERP features for target keywords
 */
export async function getSerpFeatures(keywords, options = {}) {
    const { country = 'India', language = 'en' } = options;
    const locationCode = LOCATION_CODES[country] || '2356';

    if (!hasDataForSEO()) {
        return { available: false, provider: 'none' };
    }

    const features = await fetchSerpFeatures(keywords, locationCode, language);
    return {
        available: true,
        provider: 'dataforseo',
        features: features || [],
    };
}

/**
 * Format real keyword data for AI prompt
 */
export function formatKeywordDataForPrompt(keywordData) {
    if (!keywordData?.available || !keywordData.keywords?.length) return '';

    let text = '\n=== REAL KEYWORD DATA (DataForSEO — verified) ===\n';
    text += `Data source: ${keywordData.provider}\n`;
    text += `Keywords analyzed: ${keywordData.keywords.length}\n\n`;

    // Sort by volume descending
    const sorted = [...keywordData.keywords].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));

    text += `| Keyword | Volume | CPC | Difficulty | Competition |\n`;
    text += `|---------|--------|-----|------------|-------------|\n`;
    for (const kw of sorted.slice(0, 30)) {
        text += `| ${kw.keyword} | ${kw.searchVolume.toLocaleString()}/mo | $${kw.cpc.toFixed(2)} | ${kw.difficulty}/100 | ${kw.competitionLevel || 'N/A'} |\n`;
    }

    return text;
}

/**
 * Format backlink data for AI prompt
 */
export function formatBacklinkDataForPrompt(backlinkData) {
    if (!backlinkData?.available || !backlinkData.summary) return '';

    const s = backlinkData.summary;
    let text = '\n=== BACKLINK INTELLIGENCE (DataForSEO — verified) ===\n';
    text += `Total backlinks: ${(s.totalBacklinks || 0).toLocaleString()}\n`;
    text += `Referring domains: ${(s.referringDomains || 0).toLocaleString()}\n`;
    text += `Domain rank: ${s.domainRank}\n`;
    text += `Dofollow: ${(s.backlinksDofollow || 0).toLocaleString()} | Nofollow: ${(s.backlinksNofollow || 0).toLocaleString()}\n`;
    text += `Broken backlinks: ${(s.brokenBacklinks || 0).toLocaleString()}\n`;

    if (backlinkData.topReferringDomains?.length) {
        text += `\nTop referring domains:\n`;
        for (const d of backlinkData.topReferringDomains.slice(0, 10)) {
            text += `  - ${d.domain} (rank: ${d.rank}, ${d.backlinks} links, ${d.dofollow} dofollow)\n`;
        }
    }

    return text;
}

/**
 * Check if DataForSEO is configured
 */
export function isDataForSEOConfigured() {
    return hasDataForSEO();
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function getToday() {
    return new Date().toISOString().slice(0, 10);
}

function getMonthsAgo(months) {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
}

/**
 * Mantram AI — DataForSEO Advanced SEO Intelligence
 * 
 * Tier 1: On-Page API — Cloud-based crawling (replaces local Playwright)
 * Tier 2: Ranked Keywords — What any domain ranks for
 * Tier 2: Domain Intersection — Competitive keyword overlap
 * Tier 2: SERP Competitors — Who competes for the same terms
 * 
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

const LOCATION_CODES = {
    'India': '2356', 'United States': '2840', 'UAE': '2784', 'Dubai': '2784',
    'UK': '2826', 'Singapore': '2702', 'Australia': '2036', 'Saudi Arabia': '2682',
    'Germany': '2276', 'France': '2250', 'Canada': '2124', 'Japan': '2392',
};

// ─── On-Page API: Instant Pages (Live — synchronous) ────────────────────────

/**
 * Analyze a single page instantly — no crawl queue needed
 * Returns 60+ on-page SEO parameters for a single URL
 * @param {string} url - Full URL to analyze
 * @returns {Promise<Object|null>} Page analysis data
 */
async function fetchInstantPage(url) {
    if (!hasDataForSEO()) return null;
    try {
        const resp = await fetch(`${DATAFORSEO_BASE}/on_page/instant_pages`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                url,
                enable_javascript: true,
                enable_browser_rendering: true,
                load_resources: true,
                return_despite_timeout: true,
            }]),
            signal: AbortSignal.timeout(30000),
        });
        if (!resp.ok) { 
            if (resp.status === 402) console.warn('❌ DataForSEO Error: Payment Required (402). Check account balance.');
            else if (resp.status === 429) console.warn('⚠️ DataForSEO Warning: Rate Limit Exceeded (429).');
            else console.warn(`On-Page Instant error: ${resp.status}`); 
            return null; 
        }
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        
        const items = data.tasks?.[0]?.result || [];
        if (!items.length) return null;
        return items[0]; // Full page analysis object
    } catch (e) {
        console.warn('On-Page Instant error:', e.message);
        return null;
    }
}

// ─── On-Page API: Task-based Crawl (Async — for background jobs) ────────────

/**
 * Submit a domain for cloud crawling — async, returns task ID
 * @param {string} domain - Domain to crawl (e.g., "acwo.agency")
 * @param {Object} options - Crawl options
 * @returns {Promise<string|null>} Task ID for polling
 */
async function submitOnPageCrawl(domain, options = {}) {
    if (!hasDataForSEO()) return null;
    const { maxPages = 200, enableJS = true, enableBrowserRendering = true } = options;
    try {
        const target = domain.startsWith('http') ? domain : `https://${domain}`;
        const resp = await fetch(`${DATAFORSEO_BASE}/on_page/task_post`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                target,
                max_crawl_pages: maxPages,
                enable_javascript: enableJS,
                enable_browser_rendering: enableBrowserRendering,
                load_resources: true,
                support_cookies: true,
                respect_sitemap: true,
                force_sitewide_checks: true,
                store_raw_html: false,
            }]),
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) { 
            if (resp.status === 402) console.warn('❌ DataForSEO Error: Payment Required (402). Check account balance.');
            else if (resp.status === 429) console.warn('⚠️ DataForSEO Warning: Rate Limit Exceeded (429).');
            else console.warn(`On-Page Task POST error: ${resp.status}`); 
            return null; 
        }
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        const taskId = data.tasks?.[0]?.id;
        console.log(`📋 On-Page crawl submitted: task ${taskId} for ${domain} (max ${maxPages} pages)`);
        return taskId;
    } catch (e) {
        console.warn('On-Page Task POST error:', e.message);
        return null;
    }
}

/**
 * Get crawl summary for a completed task
 * @param {string} taskId - Task ID from submitOnPageCrawl
 * @returns {Promise<Object|null>} Crawl summary
 */
async function getOnPageSummary(taskId) {
    if (!hasDataForSEO() || !taskId) return null;
    try {
        const resp = await fetch(`${DATAFORSEO_BASE}/on_page/summary/${taskId}`, {
            method: 'GET',
            headers: { 'Authorization': getAuthHeader() },
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        return data.tasks?.[0]?.result?.[0] || null;
    } catch (e) {
        console.warn('On-Page Summary error:', e.message);
        return null;
    }
}

/**
 * Get individual page data from a completed crawl
 * @param {string} taskId - Task ID
 * @param {number} limit - Max pages to return
 * @returns {Promise<Array|null>} Array of page data
 */
async function getOnPagePages(taskId, limit = 100) {
    if (!hasDataForSEO() || !taskId) return null;
    try {
        const resp = await fetch(`${DATAFORSEO_BASE}/on_page/pages`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{ id: taskId, limit, order_by: ['checks.no_content_encoding,desc'] }]),
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        return data.tasks?.[0]?.result?.[0]?.items || [];
    } catch (e) {
        console.warn('On-Page Pages error:', e.message);
        return null;
    }
}

/**
 * Get duplicate tags from a completed crawl
 * @param {string} taskId
 * @returns {Promise<Object|null>}
 */
async function getOnPageDuplicateTags(taskId) {
    if (!hasDataForSEO() || !taskId) return null;
    try {
        const resp = await fetch(`${DATAFORSEO_BASE}/on_page/duplicate_tags`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{ id: taskId, limit: 100 }]),
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        return data.tasks?.[0]?.result?.[0]?.items || [];
    } catch (e) {
        console.warn('On-Page Duplicate Tags error:', e.message);
        return null;
    }
}

// ─── DataForSEO Labs: Ranked Keywords ───────────────────────────────────────

/**
 * Get ALL keywords a domain ranks for — the #1 feature for competitive intelligence
 * @param {string} domain - Target domain
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
async function fetchRankedKeywords(domain, options = {}) {
    if (!hasDataForSEO()) return null;
    const { locationCode = '2356', languageCode = 'en', limit = 100 } = options;
    try {
        const target = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const resp = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                target,
                location_code: parseInt(locationCode),
                language_code: languageCode,
                item_types: ['organic', 'featured_snippet', 'ai_overview_reference'],
                limit,
                load_rank_absolute: true,
                order_by: ['ranked_serp_element.serp_item.rank_group,asc'],
                filters: [
                    ['ranked_serp_element.serp_item.rank_group', '<=', 100],
                    'and',
                    ['keyword_data.keyword_info.search_volume', '>', 0]
                ],
            }]),
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) { 
            if (resp.status === 402) console.warn('❌ DataForSEO Error: Payment Required (402). Check account balance.');
            else if (resp.status === 429) console.warn('⚠️ DataForSEO Warning: Rate Limit Exceeded (429).');
            else console.warn(`Ranked Keywords error: ${resp.status}`); 
            return null; 
        }
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        
        const result = data.tasks?.[0]?.result?.[0];
        if (!result) return null;
        
        return {
            totalCount: result.total_count || 0,
            metrics: result.metrics || {},
            items: (result.items || []).map(item => ({
                keyword: item.keyword_data?.keyword || '',
                searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
                cpc: item.keyword_data?.keyword_info?.cpc || 0,
                competition: item.keyword_data?.keyword_info?.competition || 0,
                difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || 0,
                intent: item.keyword_data?.search_intent_info?.main_intent || 'unknown',
                position: item.ranked_serp_element?.serp_item?.rank_group || 0,
                rankAbsolute: item.ranked_serp_element?.serp_item?.rank_absolute || 0,
                url: item.ranked_serp_element?.serp_item?.relative_url || '',
                type: item.ranked_serp_element?.serp_item?.type || 'organic',
                isAiOverview: item.ranked_serp_element?.serp_item?.type === 'ai_overview_reference',
                etv: item.ranked_serp_element?.serp_item?.etv || 0,
                lastUpdated: item.ranked_serp_element?.serp_item?.last_updated_time || null,
            })),
        };
    } catch (e) {
        console.warn('Ranked Keywords error:', e.message);
        return null;
    }
}

// ─── DataForSEO Labs: Domain Intersection ───────────────────────────────────

/**
 * Find keywords where two domains BOTH rank — competitive overlap
 * @param {string} domain1 - Your brand domain
 * @param {string} domain2 - Competitor domain
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
async function fetchDomainIntersection(domain1, domain2, options = {}) {
    if (!hasDataForSEO()) return null;
    const { locationCode = '2356', languageCode = 'en', limit = 50 } = options;
    try {
        const clean = d => d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const resp = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/domain_intersection/live`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                target1: clean(domain1),
                target2: clean(domain2),
                location_code: parseInt(locationCode),
                language_code: languageCode,
                item_types: ['organic'],
                limit,
                order_by: ['keyword_data.keyword_info.search_volume,desc'],
                filters: [['keyword_data.keyword_info.search_volume', '>', 0]],
            }]),
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        
        const result = data.tasks?.[0]?.result?.[0];
        if (!result) return null;
        
        return {
            totalCount: result.total_count || 0,
            items: (result.items || []).map(item => ({
                keyword: item.keyword_data?.keyword || '',
                searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
                cpc: item.keyword_data?.keyword_info?.cpc || 0,
                difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty || 0,
                intent: item.keyword_data?.search_intent_info?.main_intent || 'unknown',
                // Position for domain1
                pos1: item.first_domain_serp_element?.serp_item?.rank_group || 0,
                url1: item.first_domain_serp_element?.serp_item?.relative_url || '',
                // Position for domain2
                pos2: item.second_domain_serp_element?.serp_item?.rank_group || 0,
                url2: item.second_domain_serp_element?.serp_item?.relative_url || '',
            })),
        };
    } catch (e) {
        console.warn('Domain Intersection error:', e.message);
        return null;
    }
}

// ─── DataForSEO Labs: SERP Competitors ──────────────────────────────────────

/**
 * Find domains that compete for the same keywords
 * @param {string} domain - Target domain
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
async function fetchSerpCompetitors(domain, options = {}) {
    if (!hasDataForSEO()) return null;
    const { locationCode = '2356', languageCode = 'en', limit = 20 } = options;
    try {
        const target = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
        const resp = await fetch(`${DATAFORSEO_BASE}/dataforseo_labs/google/competitors_domain/live`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                target,
                location_code: parseInt(locationCode),
                language_code: languageCode,
                limit,
                filters: [['avg_position', '<=', 50]],
                order_by: ['avg_position,asc'],
            }]),
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        
        const result = data.tasks?.[0]?.result?.[0];
        if (!result) return null;
        
        return {
            totalCount: result.total_count || 0,
            items: (result.items || []).map(item => ({
                domain: item.domain || '',
                avgPosition: item.avg_position || 0,
                intersections: item.intersections || 0,
                sumPosition: item.sum_position || 0,
                fullDomainRank: item.full_domain_rank || 0,
                competitorMetrics: {
                    organic: item.metrics?.organic || {},
                    paid: item.metrics?.paid || {},
                },
                etv: item.metrics?.organic?.etv || 0,
                count: item.metrics?.organic?.count || 0,
            })),
        };
    } catch (e) {
        console.warn('SERP Competitors error:', e.message);
        return null;
    }
}

// ─── Content Analysis API ───────────────────────────────────────────────────

/**
 * Find brand mentions and citations across the web
 * @param {string} keyword - Brand name or keyword to search
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
async function fetchContentAnalysisSummary(keyword, options = {}) {
    if (!hasDataForSEO()) return null;
    try {
        const resp = await fetch(`${DATAFORSEO_BASE}/content_analysis/summary/live`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{
                keyword,
                internal_list_limit: 10,
            }]),
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        return data.tasks?.[0]?.result?.[0] || null;
    } catch (e) {
        console.warn('Content Analysis Summary error:', e.message);
        return null;
    }
}

/**
 * Get sentiment analysis for brand mentions
 * @param {string} keyword
 * @returns {Promise<Object|null>}
 */
async function fetchContentSentiment(keyword) {
    if (!hasDataForSEO()) return null;
    try {
        const resp = await fetch(`${DATAFORSEO_BASE}/content_analysis/sentiment_analysis/live`, {
            method: 'POST',
            headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify([{ keyword }]),
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.status_code !== 20000) return null;
        return data.tasks?.[0]?.result?.[0] || null;
    } catch (e) {
        console.warn('Content Sentiment error:', e.message);
        return null;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED EXPORTS — High-level functions for SEO Studio endpoints
// ═══════════════════════════════════════════════════════════════════════════

/**
 * INSTANT SITE INTELLIGENCE — Replaces researchDomain() for Health Check
 * Runs in parallel: Instant Page (homepage) + Ranked Keywords + SERP Competitors
 * Returns comprehensive data in 5-10 seconds instead of 120-300s
 */
export async function getInstantSiteIntelligence(domain, options = {}) {
    if (!hasDataForSEO()) return { available: false, provider: 'none' };
    
    const { country = 'India', language = 'en' } = options;
    const locationCode = LOCATION_CODES[country] || '2356';
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    const fullUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    
    console.log(`🔬 Instant Site Intelligence for ${cleanDomain} (${country})...`);
    const startTime = Date.now();
    
    // Run all 3 in parallel
    const [homepageData, rankedKeywords, serpCompetitors] = await Promise.all([
        fetchInstantPage(fullUrl),
        fetchRankedKeywords(cleanDomain, { locationCode, languageCode: language, limit: 100 }),
        fetchSerpCompetitors(cleanDomain, { locationCode, languageCode: language, limit: 15 }),
    ]);
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Instant Site Intelligence complete in ${elapsed}ms`);
    
    return {
        available: true,
        provider: 'dataforseo',
        elapsedMs: elapsed,
        homepage: homepageData,
        rankedKeywords,
        serpCompetitors,
    };
}

/**
 * DOMAIN RANKINGS — Get all keywords a domain ranks for
 */
export async function getDomainRankings(domain, options = {}) {
    if (!hasDataForSEO()) return { available: false };
    
    const { country = 'India', language = 'en', limit = 100 } = options;
    const locationCode = LOCATION_CODES[country] || '2356';
    
    console.log(`📊 Fetching ranked keywords for ${domain}...`);
    const result = await fetchRankedKeywords(domain, { locationCode, languageCode: language, limit });
    
    return {
        available: !!result,
        provider: 'dataforseo',
        ...result,
    };
}

/**
 * COMPETITIVE KEYWORD OVERLAP — Find shared keywords between two domains
 */
export async function getCompetitiveOverlap(brandDomain, competitorDomain, options = {}) {
    if (!hasDataForSEO()) return { available: false };
    
    const { country = 'India', language = 'en', limit = 50 } = options;
    const locationCode = LOCATION_CODES[country] || '2356';
    
    console.log(`⚔️ Keyword overlap: ${brandDomain} vs ${competitorDomain}...`);
    const result = await fetchDomainIntersection(brandDomain, competitorDomain, { locationCode, languageCode: language, limit });
    
    return {
        available: !!result,
        provider: 'dataforseo',
        ...result,
    };
}

/**
 * SERP COMPETITOR DISCOVERY — Find who competes for the same terms
 */
export async function discoverSerpCompetitors(domain, options = {}) {
    if (!hasDataForSEO()) return { available: false };
    
    const { country = 'India', language = 'en', limit = 20 } = options;
    const locationCode = LOCATION_CODES[country] || '2356';
    
    console.log(`🔍 Discovering SERP competitors for ${domain}...`);
    const result = await fetchSerpCompetitors(domain, { locationCode, languageCode: language, limit });
    
    return {
        available: !!result,
        provider: 'dataforseo',
        ...result,
    };
}

/**
 * BRAND MENTIONS — Track brand presence across the web
 */
export async function getBrandMentions(brandName) {
    if (!hasDataForSEO()) return { available: false };
    
    console.log(`📰 Brand mentions for "${brandName}"...`);
    const [summary, sentiment] = await Promise.all([
        fetchContentAnalysisSummary(brandName),
        fetchContentSentiment(brandName),
    ]);
    
    return {
        available: !!(summary || sentiment),
        provider: 'dataforseo',
        summary,
        sentiment,
    };
}

/**
 * SUBMIT BACKGROUND CRAWL — Start async crawl (results available later)
 */
export async function submitSiteCrawl(domain, options = {}) {
    if (!hasDataForSEO()) return { available: false };
    const taskId = await submitOnPageCrawl(domain, options);
    return { available: !!taskId, taskId };
}

/**
 * GET CRAWL RESULTS — Get results from background crawl
 */
export async function getCrawlResults(taskId) {
    if (!hasDataForSEO() || !taskId) return { available: false };
    
    const [summary, pages, duplicateTags] = await Promise.all([
        getOnPageSummary(taskId),
        getOnPagePages(taskId, 100),
        getOnPageDuplicateTags(taskId),
    ]);
    
    return {
        available: !!(summary),
        provider: 'dataforseo',
        summary,
        pages: pages || [],
        duplicateTags: duplicateTags || [],
    };
}

// ─── Formatting for AI Prompts ──────────────────────────────────────────────

/**
 * Format ranked keywords data for AI prompt — concise and structured
 */
export function formatRankedKeywordsForPrompt(data) {
    if (!data?.available || !data.items?.length) return '';
    
    let text = '\n=== RANKED KEYWORDS (DataForSEO — verified, live data) ===\n';
    text += `Total keywords ranking: ${data.totalCount}\n`;
    
    // Position distribution
    const metrics = data.metrics?.organic || {};
    if (metrics.pos_1) text += `#1 position: ${metrics.pos_1} keywords\n`;
    if (metrics.pos_2_3) text += `#2-3 position: ${metrics.pos_2_3} keywords\n`;
    if (metrics.pos_4_10) text += `#4-10 position: ${metrics.pos_4_10} keywords\n`;
    if (metrics.pos_11_20) text += `#11-20 position: ${metrics.pos_11_20} keywords\n`;
    if (metrics.pos_21_30) text += `#21-30 position: ${metrics.pos_21_30} keywords\n`;
    if (metrics.etv) text += `Estimated monthly organic traffic: ${metrics.etv.toLocaleString()}\n`;
    
    // Top keywords
    text += `\nTop ranked keywords (by search volume):\n`;
    text += `| Keyword | Position | Volume | CPC | Difficulty | Intent | URL |\n`;
    text += `|---------|----------|--------|-----|------------|--------|-----|\n`;
    const sorted = [...data.items].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
    for (const kw of sorted.slice(0, 30)) {
        text += `| ${kw.keyword} | #${kw.position} | ${kw.searchVolume.toLocaleString()} | $${(kw.cpc || 0).toFixed(2)} | ${kw.difficulty}/100 | ${kw.intent} | ${kw.url} |\n`;
    }
    
    // AI Overview keywords
    const aiOverviewKws = data.items.filter(i => i.isAiOverview);
    if (aiOverviewKws.length > 0) {
        text += `\nKeywords appearing in AI Overviews: ${aiOverviewKws.length}\n`;
        for (const kw of aiOverviewKws.slice(0, 10)) {
            text += `  - "${kw.keyword}" (vol: ${kw.searchVolume})\n`;
        }
    }
    
    return text;
}

/**
 * Format homepage analysis for AI prompt
 */
export function formatInstantPageForPrompt(pageData) {
    if (!pageData) return '';
    
    let text = '\n=== HOMEPAGE ANALYSIS (DataForSEO On-Page — live scan) ===\n';
    const meta = pageData.meta || {};
    text += `Title: ${meta.title || 'MISSING'}\n`;
    text += `Description: ${meta.description || 'MISSING'}\n`;
    text += `H1: ${meta.htags?.h1?.join(', ') || 'MISSING'}\n`;
    text += `Status code: ${pageData.status_code || 'N/A'}\n`;
    text += `Page size: ${(pageData.page_timing?.download_time || 0)}ms download\n`;
    text += `OnPage Score: ${pageData.onpage_score || 0}/100\n`;
    
    // Key checks
    const checks = pageData.checks || {};
    const issues = [];
    if (checks.no_title) issues.push('Missing title tag');
    if (checks.no_description) issues.push('Missing meta description');
    if (checks.no_h1_tag) issues.push('Missing H1 tag');
    if (checks.title_too_long) issues.push('Title too long');
    if (checks.title_too_short) issues.push('Title too short');
    if (checks.no_image_alt) issues.push(`${checks.no_image_alt} images without alt`);
    if (checks.is_broken) issues.push('Broken page');
    if (checks.is_redirect) issues.push('Page redirects');
    if (checks.no_favicon) issues.push('Missing favicon');
    if (checks.seo_friendly_url === false) issues.push('Non-SEO-friendly URL');
    if (checks.low_content_rate) issues.push('Low content rate');
    if (checks.large_page_size) issues.push('Large page size');
    if (checks.no_content_encoding) issues.push('No content encoding (gzip)');
    
    if (issues.length > 0) {
        text += `\nIssues found:\n`;
        issues.forEach(i => { text += `  ⚠️ ${i}\n`; });
    }
    
    return text;
}

/**
 * Format SERP competitors for AI prompt
 */
export function formatSerpCompetitorsForPrompt(data) {
    if (!data?.available || !data.items?.length) return '';
    
    let text = '\n=== SERP COMPETITORS (DataForSEO — verified) ===\n';
    text += `Total SERP competitors found: ${data.totalCount}\n`;
    text += `\n| Domain | Avg Position | Keyword Overlap | Est. Traffic | Domain Rank |\n`;
    text += `|--------|-------------|-----------------|--------------|-------------|\n`;
    for (const c of data.items.slice(0, 15)) {
        text += `| ${c.domain} | #${Math.round(c.avgPosition)} | ${c.intersections} keywords | ${(c.etv || 0).toLocaleString()} | ${c.fullDomainRank} |\n`;
    }
    
    return text;
}

/**
 * Format competitive keyword overlap for AI prompt
 */
export function formatDomainIntersectionForPrompt(data, brandDomain, competitorDomain) {
    if (!data?.available || !data.items?.length) return '';
    
    let text = `\n=== KEYWORD OVERLAP: ${brandDomain} vs ${competitorDomain} ===\n`;
    text += `Shared keywords: ${data.totalCount}\n`;
    
    // Win/loss analysis
    const brandWins = data.items.filter(i => i.pos1 < i.pos2);
    const competitorWins = data.items.filter(i => i.pos2 < i.pos1);
    text += `Brand outranks: ${brandWins.length} keywords | Competitor outranks: ${competitorWins.length} keywords\n`;
    
    text += `\n| Keyword | Volume | Brand Pos | Competitor Pos | Winner |\n`;
    text += `|---------|--------|-----------|----------------|--------|\n`;
    const sorted = [...data.items].sort((a, b) => (b.searchVolume || 0) - (a.searchVolume || 0));
    for (const kw of sorted.slice(0, 25)) {
        const winner = kw.pos1 < kw.pos2 ? '✅ Brand' : kw.pos2 < kw.pos1 ? '❌ Competitor' : '🟡 Tied';
        text += `| ${kw.keyword} | ${kw.searchVolume.toLocaleString()} | #${kw.pos1} | #${kw.pos2} | ${winner} |\n`;
    }
    
    return text;
}

/**
 * Check if the On-Page API is configured
 */
export function isOnPageConfigured() {
    return hasDataForSEO();
}

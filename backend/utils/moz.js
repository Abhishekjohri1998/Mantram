/**
 * Mantram AI — Moz API Integration
 * 
 * Provides real Domain Authority (DA), Page Authority (PA), and Spam Score.
 * Uses Moz Links API v2.
 * Docs: https://moz.com/help/links-api
 */

const MOZ_ACCESS_ID = process.env.MOZ_ACCESS_ID || '';
const MOZ_SECRET_KEY = process.env.MOZ_SECRET_KEY || '';
const MOZ_BASE = 'https://lsapi.seomoz.com/v2';

function hasMoz() {
    return !!(MOZ_ACCESS_ID && MOZ_SECRET_KEY);
}

function getMozAuth() {
    return 'Basic ' + Buffer.from(`${MOZ_ACCESS_ID}:${MOZ_SECRET_KEY}`).toString('base64');
}

/**
 * Get Domain Authority, Page Authority, and Spam Score for a URL
 * @param {string} target - Domain or URL to check (e.g., "acwo.com")
 * @returns {Promise<Object|null>}
 */
async function fetchDomainAuthority(target) {
    if (!hasMoz()) return null;
    try {
        const resp = await fetch(`${MOZ_BASE}/url_metrics`, {
            method: 'POST',
            headers: {
                'Authorization': getMozAuth(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                targets: [target],
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) {
            console.warn(`Moz API error: ${resp.status} ${resp.statusText}`);
            return null;
        }
        const data = await resp.json();
        const result = data.results?.[0];
        if (!result) return null;
        return {
            domainAuthority: result.domain_authority || 0,
            pageAuthority: result.page_authority || 0,
            spamScore: result.spam_score || 0,
            rootDomainsToRootDomain: result.root_domains_to_root_domain || 0,
            externalPagesToRootDomain: result.external_pages_to_root_domain || 0,
            lastCrawled: result.last_crawled || null,
        };
    } catch (e) {
        console.warn('Moz API fetch error:', e.message);
        return null;
    }
}

/**
 * Get Domain Authority for multiple domains in one call (batch)
 * @param {string[]} domains - Array of domains
 * @returns {Promise<Object>} Map of domain -> { domainAuthority, pageAuthority, spamScore }
 */
async function fetchBatchDomainAuthority(domains) {
    if (!hasMoz() || !domains.length) return {};
    try {
        const resp = await fetch(`${MOZ_BASE}/url_metrics`, {
            method: 'POST',
            headers: {
                'Authorization': getMozAuth(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                targets: domains.slice(0, 30), // Max 30 per request
            }),
            signal: AbortSignal.timeout(20000),
        });
        if (!resp.ok) return {};
        const data = await resp.json();
        const results = {};
        (data.results || []).forEach((r, i) => {
            const domain = domains[i];
            if (domain) {
                results[domain] = {
                    domainAuthority: r.domain_authority || 0,
                    pageAuthority: r.page_authority || 0,
                    spamScore: r.spam_score || 0,
                    rootDomainsToRootDomain: r.root_domains_to_root_domain || 0,
                    externalPagesToRootDomain: r.external_pages_to_root_domain || 0,
                };
            }
        });
        return results;
    } catch (e) {
        console.warn('Moz batch error:', e.message);
        return {};
    }
}


// ─── Exports ─────────────────────────────────────────────────────────────

/**
 * Get Domain Authority data for a single domain
 */
export async function getMozDomainAuthority(domain) {
    if (!hasMoz()) return { available: false, provider: 'none' };
    console.log(`🏛️ Moz: Fetching DA for ${domain}...`);
    const data = await fetchDomainAuthority(domain);
    if (!data) return { available: false, provider: 'moz', error: 'API call failed' };
    return { available: true, provider: 'moz', ...data };
}

/**
 * Get Domain Authority for brand + competitors in one call
 */
export async function getMozBatchDA(brandDomain, competitorDomains = []) {
    if (!hasMoz()) return { available: false, provider: 'none' };
    const allDomains = [brandDomain, ...competitorDomains];
    console.log(`🏛️ Moz: Batch DA for ${allDomains.length} domains...`);
    const results = await fetchBatchDomainAuthority(allDomains);
    return {
        available: Object.keys(results).length > 0,
        provider: 'moz',
        brand: results[brandDomain] || null,
        competitors: competitorDomains.reduce((acc, d) => { acc[d] = results[d] || null; return acc; }, {}),
        allResults: results,
    };
}

/**
 * Format Moz data for AI prompt
 */
export function formatMozDataForPrompt(mozData) {
    if (!mozData?.available) return '';
    let text = '\n=== DOMAIN AUTHORITY (Moz — verified) ===\n';
    if (mozData.brand || mozData.domainAuthority) {
        const b = mozData.brand || mozData;
        text += `Domain Authority (DA): ${b.domainAuthority}/100\n`;
        text += `Page Authority (PA): ${b.pageAuthority}/100\n`;
        text += `Spam Score: ${b.spamScore}%\n`;
        if (b.rootDomainsToRootDomain) text += `Linking root domains: ${b.rootDomainsToRootDomain.toLocaleString()}\n`;
        if (b.externalPagesToRootDomain) text += `External pages linking: ${b.externalPagesToRootDomain.toLocaleString()}\n`;
    }
    if (mozData.competitors && Object.keys(mozData.competitors).length > 0) {
        text += '\nCompetitor DA comparison:\n';
        for (const [domain, data] of Object.entries(mozData.competitors)) {
            if (data) text += `  ${domain}: DA ${data.domainAuthority}, PA ${data.pageAuthority}, Spam ${data.spamScore}%\n`;
        }
    }
    return text;
}

/**
 * Check if Moz API is configured
 */
export function isMozConfigured() {
    return hasMoz();
}

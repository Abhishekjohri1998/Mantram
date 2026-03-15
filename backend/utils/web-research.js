/**
 * Mantram AI — Web Research Utility
 * Real internet research for SEO Studio.
 * Crawls pages, extracts structured data, and builds site intelligence.
 */

const USER_AGENT = 'MantramAI-SEOBot/1.0 (+https://mantram.ai)';
const FETCH_TIMEOUT = 12000; // 12s

// ============================================================================
// FETCH HELPER
// ============================================================================

async function safeFetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
        const resp = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...options.headers,
            },
            redirect: 'follow',
        });
        clearTimeout(timer);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.text();
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

// ============================================================================
// HTML PARSER (lightweight, no dependencies)
// ============================================================================

function extractMeta(html) {
    const meta = {};

    // Title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    meta.title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

    // Meta tags
    const metaPattern = /<meta\s+([^>]+?)\/?>/gi;
    let m;
    while ((m = metaPattern.exec(html)) !== null) {
        const attrs = m[1];
        const name = getAttr(attrs, 'name') || getAttr(attrs, 'property') || '';
        const content = getAttr(attrs, 'content') || '';
        if (name && content) {
            meta[name.toLowerCase()] = content;
        }
    }

    return meta;
}

function extractHeadings(html) {
    const headings = [];
    const hPattern = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = hPattern.exec(html)) !== null) {
        const level = parseInt(m[1]);
        const text = stripTags(m[2]).trim();
        if (text && level <= 3) headings.push({ level, text });
    }
    return headings;
}

function extractJsonLd(html) {
    const schemas = [];
    const pattern = /<script\s+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
        try {
            schemas.push(JSON.parse(m[1].trim()));
        } catch { /* skip invalid JSON-LD */ }
    }
    return schemas;
}

function extractLinks(html, baseUrl) {
    const internal = new Set();
    const external = new Set();
    const linkPattern = /<a\s+[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi;
    let m;
    let baseDomain;
    try { baseDomain = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { return { internal: [], external: [] }; }

    while ((m = linkPattern.exec(html)) !== null) {
        let href = m[1].trim();
        if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
        try {
            const resolved = new URL(href, baseUrl);
            const linkDomain = resolved.hostname.replace(/^www\./, '');
            if (linkDomain === baseDomain) {
                internal.add(resolved.pathname);
            } else {
                external.add(resolved.hostname);
            }
        } catch { /* skip invalid href */ }
    }
    return { internal: [...internal].slice(0, 50), external: [...external].slice(0, 30) };
}

function extractImages(html) {
    const imgs = [];
    const imgPattern = /<img\s+[^>]*>/gi;
    let m;
    while ((m = imgPattern.exec(html)) !== null) {
        const alt = getAttr(m[0], 'alt') || '';
        imgs.push({ hasAlt: alt.length > 0 });
    }
    return { total: imgs.length, withAlt: imgs.filter(i => i.hasAlt).length, withoutAlt: imgs.filter(i => !i.hasAlt).length };
}

function extractCanonical(html) {
    const m = html.match(/<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i)
        || html.match(/<link\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["'][^>]*>/i);
    return m ? m[1] : '';
}

function detectTechSignals(html) {
    const signals = [];
    if (html.includes('wp-content') || html.includes('wordpress')) signals.push('WordPress');
    if (html.includes('shopify') || html.includes('Shopify')) signals.push('Shopify');
    if (html.includes('wix.com')) signals.push('Wix');
    if (html.includes('squarespace')) signals.push('Squarespace');
    if (html.includes('next/') || html.includes('__next')) signals.push('Next.js');
    if (html.includes('react')) signals.push('React');
    if (html.includes('vue') || html.includes('Vue')) signals.push('Vue');
    if (html.includes('gtag') || html.includes('google-analytics') || html.includes('GA4')) signals.push('Google Analytics');
    if (html.includes('gtm.js') || html.includes('googletagmanager')) signals.push('Google Tag Manager');
    if (html.includes('facebook.com/tr') || html.includes('fbq(')) signals.push('Facebook Pixel');
    if (html.includes('hotjar')) signals.push('Hotjar');
    if (html.includes('clarity.ms')) signals.push('Microsoft Clarity');
    if (html.includes('schema.org')) signals.push('Schema.org');
    return [...new Set(signals)];
}

function getBodyText(html) {
    // Remove script, style, nav, header, footer
    let clean = html.replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    clean = stripTags(clean);
    clean = clean.replace(/\s+/g, ' ').trim();
    return clean;
}

function getWordCount(text) {
    return text.split(/\s+/).filter(w => w.length > 1).length;
}

// Helpers
function getAttr(tag, name) {
    const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return m ? m[1] : '';
}

function stripTags(str) {
    return str.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
}

function decodeEntities(str) {
    return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}


// ============================================================================
// CRAWL SINGLE PAGE
// ============================================================================

export async function crawlPage(url) {
    try {
        const html = await safeFetch(url);
        const meta = extractMeta(html);
        const headings = extractHeadings(html);
        const jsonLd = extractJsonLd(html);
        const links = extractLinks(html, url);
        const images = extractImages(html);
        const canonical = extractCanonical(html);
        const tech = detectTechSignals(html);
        const bodyText = getBodyText(html);
        const wordCount = getWordCount(bodyText);

        // Extract a meaningful content snippet (first 500 chars of body text)
        const contentSnippet = bodyText.substring(0, 500);

        return {
            url,
            success: true,
            title: meta.title || '',
            metaDescription: meta.description || '',
            ogTitle: meta['og:title'] || '',
            ogDescription: meta['og:description'] || '',
            ogImage: meta['og:image'] || '',
            canonical,
            headings,
            h1: headings.filter(h => h.level === 1).map(h => h.text),
            h2: headings.filter(h => h.level === 2).map(h => h.text),
            h3: headings.filter(h => h.level === 3).map(h => h.text),
            jsonLd,
            hasSchemaOrg: jsonLd.length > 0,
            schemaTypes: jsonLd.map(s => s['@type']).filter(Boolean),
            links,
            internalLinkCount: links.internal.length,
            externalLinkCount: links.external.length,
            images,
            tech,
            wordCount,
            contentSnippet,
            robots: meta.robots || '',
            viewport: meta.viewport || '',
            charset: (html.match(/charset\s*=\s*["']?([^"'\s;>]+)/i) || ['', ''])[1] || '',
        };
    } catch (e) {
        return { url, success: false, error: e.message };
    }
}


// ============================================================================
// REDIRECT-AWARE FETCH
// ============================================================================

async function safeFetchWithRedirects(url) {
    const chain = [];
    let currentUrl = url;
    let maxHops = 5;
    let finalHtml = '';

    while (maxHops-- > 0) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const resp = await fetch(currentUrl, {
                signal: controller.signal,
                headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
                redirect: 'manual', // Don't auto-follow — we want to track the chain
            });
            clearTimeout(timer);

            if ([301, 302, 303, 307, 308].includes(resp.status)) {
                const location = resp.headers.get('location');
                if (!location) break;
                const resolved = new URL(location, currentUrl).href;
                chain.push({ from: currentUrl, to: resolved, status: resp.status });
                currentUrl = resolved;
                continue;
            }

            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            finalHtml = await resp.text();
            break;
        } catch (e) {
            clearTimeout(timer);
            // Fallback to regular fetch if manual redirect fails
            if (chain.length === 0) {
                try {
                    finalHtml = await safeFetch(url);
                } catch (e2) { throw e2; }
            } else {
                throw e;
            }
            break;
        }
    }

    return { html: finalHtml, redirectChain: chain, finalUrl: currentUrl };
}


// ============================================================================
// SITEMAP.XML PARSER
// ============================================================================

async function fetchSitemap(baseUrl) {
    const urls = [];
    const sitemapUrls = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];

    for (const smUrl of sitemapUrls) {
        try {
            const xml = await safeFetch(smUrl);
            if (!xml || xml.length < 50) continue;

            // Check if it's a sitemap index (contains <sitemap> tags)
            const isIndex = xml.includes('<sitemap>');

            if (isIndex) {
                // Parse sitemap index — extract child sitemap URLs
                const locPattern = /<sitemap>\s*<loc>([^<]+)<\/loc>/gi;
                let m;
                const childSitemaps = [];
                while ((m = locPattern.exec(xml)) !== null && childSitemaps.length < 3) {
                    childSitemaps.push(m[1].trim());
                }
                // Fetch first 2 child sitemaps
                for (const childUrl of childSitemaps.slice(0, 2)) {
                    try {
                        const childXml = await safeFetch(childUrl);
                        const childLocPattern = /<url>\s*<loc>([^<]+)<\/loc>/gi;
                        let cm;
                        while ((cm = childLocPattern.exec(childXml)) !== null && urls.length < 50) {
                            urls.push(cm[1].trim());
                        }
                    } catch { /* skip failed child sitemap */ }
                }
            } else {
                // Standard sitemap — extract URLs
                const locPattern = /<url>\s*<loc>([^<]+)<\/loc>/gi;
                let m;
                while ((m = locPattern.exec(xml)) !== null && urls.length < 50) {
                    urls.push(m[1].trim());
                }
            }

            if (urls.length > 0) break; // Found URLs, stop trying
        } catch { /* sitemap not found, continue */ }
    }

    return { urls, found: urls.length > 0, count: urls.length };
}


// ============================================================================
// ROBOTS.TXT PARSER
// ============================================================================

async function fetchRobotsTxt(baseUrl) {
    try {
        const text = await safeFetch(`${baseUrl}/robots.txt`);
        if (!text || text.length < 10 || text.includes('<html')) {
            return { found: false, rules: [], sitemapUrls: [], raw: '' };
        }

        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const disallowRules = [];
        const allowRules = [];
        const sitemapUrls = [];
        let currentAgent = '*';

        for (const line of lines) {
            const lower = line.toLowerCase();
            if (lower.startsWith('user-agent:')) {
                currentAgent = line.split(':').slice(1).join(':').trim();
            } else if (lower.startsWith('disallow:')) {
                const path = line.split(':').slice(1).join(':').trim();
                if (path) disallowRules.push({ agent: currentAgent, path });
            } else if (lower.startsWith('allow:')) {
                const path = line.split(':').slice(1).join(':').trim();
                if (path) allowRules.push({ agent: currentAgent, path });
            } else if (lower.startsWith('sitemap:')) {
                const url = line.split(':').slice(1).join(':').trim();
                if (url) sitemapUrls.push(url);
            }
        }

        return {
            found: true,
            disallowRules,
            allowRules,
            sitemapUrls,
            crawlDelay: lines.find(l => l.toLowerCase().startsWith('crawl-delay:'))?.split(':')?.[1]?.trim() || null,
            raw: text.substring(0, 2000),
        };
    } catch {
        return { found: false, rules: [], sitemapUrls: [], raw: '' };
    }
}


// ============================================================================
// DUPLICATE CONTENT DETECTION (3-gram shingling + Jaccard)
// ============================================================================

function contentFingerprint(text) {
    // Create n-gram shingles from text
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    if (words.length < 10) return new Set();
    const shingles = new Set();
    for (let i = 0; i < words.length - 2; i++) {
        shingles.add(`${words[i]} ${words[i+1]} ${words[i+2]}`);
    }
    return shingles;
}

function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    for (const item of setA) { if (setB.has(item)) intersection++; }
    return intersection / (setA.size + setB.size - intersection);
}

function computeDuplicates(pages) {
    const fingerprints = pages.map(p => ({
        url: p.url,
        fp: contentFingerprint(p.contentSnippet || p.bodyTextFull || ''),
    }));

    const duplicates = [];
    for (let i = 0; i < fingerprints.length; i++) {
        for (let j = i + 1; j < fingerprints.length; j++) {
            const sim = jaccardSimilarity(fingerprints[i].fp, fingerprints[j].fp);
            if (sim > 0.6) { // 60%+ similarity = near-duplicate
                duplicates.push({
                    page1: fingerprints[i].url,
                    page2: fingerprints[j].url,
                    similarity: Math.round(sim * 100),
                    level: sim > 0.85 ? 'duplicate' : 'near-duplicate',
                });
            }
        }
    }
    return duplicates;
}


// ============================================================================
// RESEARCH DOMAIN — Deep crawl: sitemap + robots.txt + 20+ pages
// ============================================================================

export async function researchDomain(baseUrl) {
    // Normalize URL
    let normalizedUrl = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    // Strip trailing slash for consistency
    const cleanBase = normalizedUrl.replace(/\/+$/, '');

    console.log(`🕷️  Deep crawl starting: ${cleanBase}`);

    // PHASE 1: Fetch homepage + robots.txt + sitemap.xml in parallel
    const [homepageResult, robotsTxt, sitemap] = await Promise.all([
        (async () => {
            const { html, redirectChain, finalUrl } = await safeFetchWithRedirects(cleanBase);
            if (!html) return { success: false, error: 'Empty response', redirectChain };
            const meta = extractMeta(html);
            const headings = extractHeadings(html);
            const jsonLd = extractJsonLd(html);
            const links = extractLinks(html, finalUrl);
            const images = extractImages(html);
            const canonical = extractCanonical(html);
            const tech = detectTechSignals(html);
            const bodyText = getBodyText(html);
            const wordCount = getWordCount(bodyText);
            return {
                url: finalUrl,
                success: true,
                title: meta.title || '',
                metaDescription: meta.description || '',
                ogTitle: meta['og:title'] || '',
                ogDescription: meta['og:description'] || '',
                ogImage: meta['og:image'] || '',
                canonical,
                headings,
                h1: headings.filter(h => h.level === 1).map(h => h.text),
                h2: headings.filter(h => h.level === 2).map(h => h.text),
                h3: headings.filter(h => h.level === 3).map(h => h.text),
                jsonLd,
                hasSchemaOrg: jsonLd.length > 0,
                schemaTypes: jsonLd.map(s => s['@type']).filter(Boolean),
                links,
                internalLinkCount: links.internal.length,
                externalLinkCount: links.external.length,
                images,
                tech,
                wordCount,
                contentSnippet: bodyText.substring(0, 500),
                bodyTextFull: bodyText.substring(0, 2000), // More text for duplicate detection
                robots: meta.robots || '',
                viewport: meta.viewport || '',
                redirectChain,
            };
        })(),
        fetchRobotsTxt(cleanBase),
        fetchSitemap(cleanBase),
    ]);

    if (!homepageResult.success) {
        return { url: cleanBase, pages: [homepageResult], summary: null, error: homepageResult.error, robotsTxt, sitemap };
    }

    const homepage = homepageResult;
    const internalLinks = homepage.links?.internal || [];

    // PHASE 2: Build priority crawl queue (sitemap URLs first, then key paths, then discovery)
    const crawled = new Set([cleanBase, homepage.url]);
    const toCrawl = [];

    // Priority 1: Sitemap URLs (up to 15)
    if (sitemap.found) {
        for (const sUrl of sitemap.urls.slice(0, 15)) {
            try {
                const resolved = new URL(sUrl).href;
                if (!crawled.has(resolved)) {
                    toCrawl.push(resolved);
                    crawled.add(resolved);
                }
            } catch { /* skip invalid */ }
        }
    }

    // Priority 2: Key structural pages
    const keyPaths = ['/about', '/about-us', '/services', '/products', '/contact', '/blog', '/faq', '/pricing', '/team', '/case-studies', '/portfolio', '/news', '/careers', '/features'];
    for (const path of keyPaths) {
        if (toCrawl.length >= 25) break;
        const match = internalLinks.find(l => l.toLowerCase().includes(path));
        if (match) {
            try {
                const fullUrl = new URL(match, cleanBase).href;
                if (!crawled.has(fullUrl)) {
                    toCrawl.push(fullUrl);
                    crawled.add(fullUrl);
                }
            } catch { /* skip */ }
        }
    }

    // Priority 3: Discovery from internal links (fill up to 20)
    for (const link of internalLinks) {
        if (toCrawl.length >= 20) break;
        if (link === '/' || link.includes('#') || link.includes('?') || link.endsWith('.pdf') || link.endsWith('.jpg') || link.endsWith('.png')) continue;
        try {
            const fullUrl = new URL(link, cleanBase).href;
            if (!crawled.has(fullUrl)) {
                toCrawl.push(fullUrl);
                crawled.add(fullUrl);
            }
        } catch { /* skip */ }
    }

    console.log(`🕷️  Crawl queue: ${toCrawl.length} pages (sitemap: ${sitemap.found ? sitemap.count : 0}, robots: ${robotsTxt.found})`);

    // PHASE 3: Crawl in batches of 5 to avoid overwhelming the server
    const allSubPages = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < toCrawl.length; i += BATCH_SIZE) {
        const batch = toCrawl.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
            batch.map(url => crawlPage(url).catch(e => ({ url, success: false, error: e.message })))
        );
        allSubPages.push(...batchResults.filter(p => p.success));
        // Stop if we've taken too long (keep total under 15s for sub-crawl)
        if (i + BATCH_SIZE >= 15 && allSubPages.length >= 10) break;
    }

    const allPages = [homepage, ...allSubPages];
    console.log(`🕷️  Crawl complete: ${allPages.length} pages successfully crawled`);

    // PHASE 4: Compute duplicate content
    const duplicateContent = computeDuplicates(allPages);

    // PHASE 5: Build comprehensive site intelligence
    const allHeadings = allPages.flatMap(p => p.headings || []);
    const allSchemaTypes = [...new Set(allPages.flatMap(p => p.schemaTypes || []))];
    const allTech = [...new Set(allPages.flatMap(p => p.tech || []))];
    const totalWordCount = allPages.reduce((s, p) => s + (p.wordCount || 0), 0);
    const totalImages = allPages.reduce((s, p) => s + (p.images?.total || 0), 0);
    const imagesWithoutAlt = allPages.reduce((s, p) => s + (p.images?.withoutAlt || 0), 0);
    const hasCanonical = allPages.some(p => p.canonical);
    const hasViewport = allPages.every(p => p.viewport);
    const hasFAQ = allHeadings.some(h => h.text.toLowerCase().includes('faq') || h.text.toLowerCase().includes('frequently'));
    const hasRobots = homepage.robots;
    const avgWordCount = Math.round(totalWordCount / allPages.length);
    const thinPages = allPages.filter(p => (p.wordCount || 0) < 300);
    const missingMeta = allPages.filter(p => !p.metaDescription);
    const missingH1 = allPages.filter(p => !p.h1?.length);
    const pagesWithRedirects = allPages.filter(p => p.redirectChain?.length > 0);

    // Compute click depth (how many clicks from homepage)
    const clickDepthMap = {};
    clickDepthMap[homepage.url] = 0;
    for (const page of allSubPages) {
        // If page appears in homepage internal links, depth = 1
        const matchPath = internalLinks.find(l => {
            try { return new URL(l, cleanBase).href === page.url; } catch { return false; }
        });
        clickDepthMap[page.url] = matchPath ? 1 : 2; // Simple heuristic
    }
    const deepPages = allSubPages.filter(p => clickDepthMap[p.url] >= 2);

    return {
        url: normalizedUrl,
        pages: allPages.map(p => ({
            url: p.url,
            title: p.title,
            metaDescription: p.metaDescription,
            h1: p.h1,
            h2: p.h2,
            wordCount: p.wordCount,
            contentSnippet: p.contentSnippet,
            redirectChain: p.redirectChain,
        })),
        homepage: {
            title: homepage.title,
            metaDescription: homepage.metaDescription,
            ogTitle: homepage.ogTitle,
            ogDescription: homepage.ogDescription,
            ogImage: homepage.ogImage,
            h1: homepage.h1,
            h2: homepage.h2,
            h3: homepage.h3,
            contentSnippet: homepage.contentSnippet,
            redirectChain: homepage.redirectChain,
        },
        robotsTxt: {
            found: robotsTxt.found,
            disallowCount: robotsTxt.disallowRules?.length || 0,
            disallowRules: (robotsTxt.disallowRules || []).slice(0, 20),
            sitemapUrls: robotsTxt.sitemapUrls || [],
            crawlDelay: robotsTxt.crawlDelay,
            raw: robotsTxt.raw?.substring(0, 500) || '',
        },
        sitemap: {
            found: sitemap.found,
            urlCount: sitemap.count,
            sampleUrls: sitemap.urls.slice(0, 10),
        },
        siteIntelligence: {
            totalPages: allPages.length,
            totalWordCount,
            avgWordCount,
            totalImages,
            imagesWithoutAlt,
            schemaTypes: allSchemaTypes,
            hasSchemaOrg: allSchemaTypes.length > 0,
            techStack: allTech,
            hasCanonical,
            hasViewport,
            hasFAQ,
            hasRobots: !!hasRobots,
            hasRobotsTxt: robotsTxt.found,
            hasSitemap: sitemap.found,
            sitemapUrlCount: sitemap.count,
            internalLinkCount: homepage.internalLinkCount || 0,
            externalLinkCount: homepage.externalLinkCount || 0,
            externalDomains: homepage.links?.external || [],
            // New deep crawl metrics
            thinPages: thinPages.map(p => ({ url: p.url, wordCount: p.wordCount })),
            thinPageCount: thinPages.length,
            missingMetaDescriptions: missingMeta.map(p => p.url),
            missingH1Tags: missingH1.map(p => p.url),
            redirectChains: pagesWithRedirects.map(p => ({ url: p.url, chain: p.redirectChain })),
            redirectChainCount: pagesWithRedirects.length,
            duplicateContent,
            duplicateContentCount: duplicateContent.length,
            deepPages: deepPages.map(p => p.url),
            clickDepthIssues: deepPages.length,
        },
    };
}


// ============================================================================
// RESEARCH COMPETITOR — Lighter crawl for competitor sites
// ============================================================================

export async function researchCompetitor(url) {
    let normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

    const page = await crawlPage(normalizedUrl);
    if (!page.success) {
        return { url: normalizedUrl, success: false, error: page.error };
    }

    return {
        url: normalizedUrl,
        success: true,
        title: page.title,
        metaDescription: page.metaDescription,
        h1: page.h1,
        h2: page.h2,
        contentSnippet: page.contentSnippet,
        wordCount: page.wordCount,
        tech: page.tech,
        hasSchemaOrg: page.hasSchemaOrg,
        schemaTypes: page.schemaTypes,
        internalLinkCount: page.internalLinkCount,
        externalLinkCount: page.externalLinkCount,
    };
}


// ============================================================================
// RESEARCH MULTIPLE COMPETITORS
// ============================================================================

export async function researchCompetitors(urls) {
    const results = await Promise.all(urls.map(u => researchCompetitor(u)));
    return results;
}


// ============================================================================
// FORMAT RESEARCH FOR AI PROMPT (concise text summary)
// ============================================================================

export function formatSiteResearch(research) {
    if (!research || !research.pages?.length) return 'No site data available (crawl failed).';

    const si = research.siteIntelligence;
    const hp = research.homepage;

    let text = `=== REAL SITE DATA (deep crawl — ${si.totalPages} pages) ===\n`;
    text += `URL: ${research.url}\n`;
    text += `Title: ${hp.title}\n`;
    text += `Meta Description: ${hp.metaDescription || 'MISSING'}\n`;
    text += `H1 tags: ${hp.h1?.join(', ') || 'MISSING'}\n`;
    text += `H2 tags: ${hp.h2?.slice(0, 10).join(', ') || 'None found'}\n`;
    text += `OG Title: ${hp.ogTitle || 'MISSING'}\n`;
    text += `OG Description: ${hp.ogDescription || 'MISSING'}\n`;
    text += `Content preview: ${hp.contentSnippet || 'N/A'}\n`;
    if (hp.redirectChain?.length > 0) {
        text += `⚠️ HOMEPAGE REDIRECT CHAIN: ${hp.redirectChain.map(r => `${r.status}: ${r.from} → ${r.to}`).join(' → ')}\n`;
    }
    text += `\n`;

    text += `Site Stats:\n`;
    text += `- Pages crawled: ${si.totalPages}\n`;
    text += `- Total word count: ${si.totalWordCount} (avg ${si.avgWordCount || 0} per page)\n`;
    text += `- Total images: ${si.totalImages} (${si.imagesWithoutAlt} missing alt text)\n`;
    text += `- Internal links: ${si.internalLinkCount}, External links: ${si.externalLinkCount}\n`;
    text += `- Schema/JSON-LD: ${si.hasSchemaOrg ? `Yes (${si.schemaTypes.join(', ')})` : 'NONE FOUND'}\n`;
    text += `- Tech Stack: ${si.techStack.join(', ') || 'Unknown'}\n`;
    text += `- Canonical: ${si.hasCanonical ? 'Yes' : 'MISSING'}\n`;
    text += `- Mobile viewport: ${si.hasViewport ? 'Yes' : 'MISSING'}\n`;
    text += `- FAQ section: ${si.hasFAQ ? 'Yes' : 'Not found'}\n`;
    text += `- Robots meta: ${si.hasRobots ? 'Yes' : 'Not found'}\n`;

    // NEW: Robots.txt + Sitemap intelligence
    if (research.robotsTxt) {
        text += `\n--- robots.txt ---\n`;
        text += `- robots.txt found: ${research.robotsTxt.found ? 'YES' : 'MISSING ⚠️'}\n`;
        if (research.robotsTxt.found) {
            text += `- Disallow rules: ${research.robotsTxt.disallowCount}\n`;
            if (research.robotsTxt.disallowRules?.length > 0) {
                text += `- Key rules: ${research.robotsTxt.disallowRules.slice(0, 5).map(r => `${r.path} (${r.agent})`).join(', ')}\n`;
            }
            if (research.robotsTxt.crawlDelay) text += `- Crawl-delay: ${research.robotsTxt.crawlDelay}\n`;
            if (research.robotsTxt.sitemapUrls?.length > 0) text += `- Sitemaps referenced: ${research.robotsTxt.sitemapUrls.join(', ')}\n`;
        }
    }

    if (research.sitemap) {
        text += `\n--- Sitemap ---\n`;
        text += `- sitemap.xml found: ${research.sitemap.found ? 'YES' : 'MISSING ⚠️'}\n`;
        if (research.sitemap.found) {
            text += `- URLs in sitemap: ${research.sitemap.urlCount}\n`;
        }
    }

    // NEW: Issues detected
    const issues = [];
    if (si.thinPageCount > 0) issues.push(`${si.thinPageCount} THIN PAGES (<300 words): ${si.thinPages.slice(0, 3).map(p => p.url).join(', ')}`);
    if (si.missingMetaDescriptions?.length > 0) issues.push(`${si.missingMetaDescriptions.length} pages MISSING meta descriptions: ${si.missingMetaDescriptions.slice(0, 3).join(', ')}`);
    if (si.missingH1Tags?.length > 0) issues.push(`${si.missingH1Tags.length} pages MISSING H1 tags: ${si.missingH1Tags.slice(0, 3).join(', ')}`);
    if (si.redirectChainCount > 0) issues.push(`${si.redirectChainCount} pages have REDIRECT CHAINS: ${si.redirectChains.slice(0, 2).map(r => `${r.url} (${r.chain.length} hops)`).join(', ')}`);
    if (si.duplicateContentCount > 0) issues.push(`${si.duplicateContentCount} DUPLICATE/NEAR-DUPLICATE content pairs: ${si.duplicateContent.slice(0, 2).map(d => `${d.page1} ↔ ${d.page2} (${d.similarity}% ${d.level})`).join(', ')}`);
    if (si.clickDepthIssues > 0) issues.push(`${si.clickDepthIssues} pages have DEEP CLICK DEPTH (not directly linked from homepage)`);

    if (issues.length > 0) {
        text += `\n--- ISSUES DETECTED ---\n`;
        for (const issue of issues) {
            text += `⚠️ ${issue}\n`;
        }
    }

    text += `\n`;

    // Sub-pages
    if (research.pages.length > 1) {
        text += `Sub-pages crawled:\n`;
        for (const p of research.pages.slice(1, 15)) { // Show up to 15
            text += `- ${p.url}: "${p.title}" (${p.wordCount} words)`;
            if (p.h1?.length) text += ` | H1: ${p.h1.join(', ')}`;
            if (!p.metaDescription) text += ` | ⚠️ no meta desc`;
            if (p.redirectChain?.length > 0) text += ` | ⚠️ ${p.redirectChain.length} redirects`;
            text += `\n`;
        }
        if (research.pages.length > 15) {
            text += `  ... and ${research.pages.length - 15} more pages crawled\n`;
        }
    }

    return text;
}

export function formatCompetitorResearch(competitors) {
    if (!competitors?.length) return 'No competitor data available.';

    let text = `=== COMPETITOR SITE DATA (crawled live) ===\n`;
    for (const c of competitors) {
        if (!c.success) {
            text += `\n${c.url}: CRAWL FAILED (${c.error})\n`;
            continue;
        }
        text += `\n--- ${c.url} ---\n`;
        text += `Title: ${c.title}\n`;
        text += `Meta: ${c.metaDescription || 'MISSING'}\n`;
        text += `H1: ${c.h1?.join(', ') || 'MISSING'}\n`;
        text += `H2: ${c.h2?.slice(0, 8).join(', ') || 'None'}\n`;
        text += `Content preview: ${c.contentSnippet?.substring(0, 300) || 'N/A'}\n`;
        text += `Word count: ${c.wordCount}, Schema: ${c.hasSchemaOrg ? c.schemaTypes.join(', ') : 'None'}\n`;
        text += `Tech: ${c.tech?.join(', ') || 'Unknown'}\n`;
    }
    return text;
}


// ============================================================================
// EXTRACT LINKS TO A TARGET DOMAIN (for backlink discovery)
// ============================================================================

/**
 * Given raw HTML and a target domain, find all <a> tags that link TO that domain.
 * Returns an array of { href, anchorText, rel, context }.
 */
function extractLinksTo(html, targetDomain) {
    const results = [];
    const baseDomain = targetDomain.replace(/^www\./, '').toLowerCase();
    // Match <a> tags with href and inner content
    const pattern = /<a\s+([^>]*href\s*=\s*["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
        const attrs = m[1];
        const href = m[2];
        const anchorText = stripTags(m[3]).trim().substring(0, 150);
        try {
            const linkUrl = new URL(href.startsWith('//') ? `https:${href}` : href);
            const linkDomain = linkUrl.hostname.replace(/^www\./, '').toLowerCase();
            if (linkDomain === baseDomain || linkDomain.endsWith(`.${baseDomain}`)) {
                const rel = getAttr(attrs, 'rel') || '';
                const isNoFollow = rel.toLowerCase().includes('nofollow');
                results.push({
                    href: linkUrl.href,
                    anchorText: anchorText || '[no anchor text]',
                    rel: isNoFollow ? 'nofollow' : 'dofollow',
                    targetPath: linkUrl.pathname,
                });
            }
        } catch { /* skip invalid URLs */ }
    }
    return results;
}


// ============================================================================
// DISCOVER BACKLINKS — Crawl pages and verify links to target domain
// ============================================================================

/**
 * Given a list of page URLs that potentially link to targetDomain,
 * crawl each page and verify the actual link presence.
 * Returns verified backlinks with anchor text, link type, and context.
 */
export async function discoverBacklinks(potentialPages, targetDomain) {
    const verified = [];
    const maxPages = Math.min(potentialPages.length, 8); // limit concurrent crawls

    const results = await Promise.all(
        potentialPages.slice(0, maxPages).map(async (pageUrl) => {
            try {
                const html = await safeFetch(pageUrl);
                const meta = extractMeta(html);
                const linksTo = extractLinksTo(html, targetDomain);
                const bodyText = getBodyText(html);
                const wordCount = getWordCount(bodyText);
                const tech = detectTechSignals(html);

                return {
                    pageUrl,
                    pageTitle: meta.title || '',
                    pageWordCount: wordCount,
                    pageTech: tech,
                    success: true,
                    linksFound: linksTo,
                };
            } catch (e) {
                return { pageUrl, success: false, error: e.message, linksFound: [] };
            }
        })
    );

    for (const r of results) {
        if (r.success && r.linksFound.length > 0) {
            for (const link of r.linksFound) {
                verified.push({
                    sourceUrl: r.pageUrl,
                    sourceTitle: r.pageTitle,
                    targetUrl: link.href,
                    anchorText: link.anchorText,
                    linkType: link.rel,
                    targetPath: link.targetPath,
                    sourceWordCount: r.pageWordCount,
                });
            }
        }
    }

    return { verified, crawled: results.length, pagesWithLinks: results.filter(r => r.linksFound.length > 0).length };
}


// ============================================================================
// ANALYZE COMPETITOR LINK SOURCES — Find who links to competitors
// ============================================================================

/**
 * For each competitor, crawl their site and extract all external domains
 * that they link to. Also extract sites that link to them (from external link patterns).
 * This helps find link gap opportunities.
 */
export async function analyzeCompetitorLinkProfile(competitorUrls, brandDomain) {
    const profiles = [];
    const baseBrandDomain = brandDomain.replace(/^www\./, '').replace(/^https?:\/\//, '').toLowerCase();

    for (const compUrl of competitorUrls.slice(0, 3)) { // max 3 competitors
        try {
            let normalizedUrl = compUrl.trim();
            if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

            const html = await safeFetch(normalizedUrl);
            const meta = extractMeta(html);
            const links = extractLinks(html, normalizedUrl);
            const headings = extractHeadings(html);
            const bodyText = getBodyText(html);
            const wordCount = getWordCount(bodyText);
            let compDomain;
            try { compDomain = new URL(normalizedUrl).hostname.replace(/^www\./, ''); } catch { compDomain = normalizedUrl; }

            profiles.push({
                url: normalizedUrl,
                domain: compDomain,
                title: meta.title || '',
                wordCount,
                h2Topics: headings.filter(h => h.level === 2).map(h => h.text).slice(0, 10),
                externalDomains: links.external, // domains they link TO
                internalLinkCount: links.internal.length,
                linksToUs: links.external.some(d => d.replace(/^www\./, '').toLowerCase() === baseBrandDomain),
                success: true,
            });
        } catch (e) {
            profiles.push({ url: compUrl, success: false, error: e.message });
        }
    }

    return profiles;
}


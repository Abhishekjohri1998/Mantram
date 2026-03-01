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
// RESEARCH DOMAIN — Crawl multiple pages for full site intelligence
// ============================================================================

export async function researchDomain(baseUrl) {
    // Normalize URL
    let normalizedUrl = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

    // 1. Crawl homepage
    const homepage = await crawlPage(normalizedUrl);
    if (!homepage.success) {
        return { url: normalizedUrl, pages: [homepage], summary: null, error: homepage.error };
    }

    // 2. Identify key internal pages to crawl (about, contact, services, blog)
    const keyPaths = ['/about', '/about-us', '/services', '/contact', '/blog', '/faq', '/pricing'];
    const internalLinks = homepage.links?.internal || [];

    // Find matching internal pages
    const pagesToCrawl = [];
    for (const path of keyPaths) {
        const match = internalLinks.find(l => l.toLowerCase().includes(path));
        if (match) pagesToCrawl.push(match);
        if (pagesToCrawl.length >= 4) break;
    }

    // If we didn't find enough, add first few internal links
    if (pagesToCrawl.length < 3) {
        for (const link of internalLinks) {
            if (link !== '/' && !pagesToCrawl.includes(link) && !link.includes('#')) {
                pagesToCrawl.push(link);
                if (pagesToCrawl.length >= 4) break;
            }
        }
    }

    // 3. Crawl sub-pages in parallel
    const subPages = await Promise.all(
        pagesToCrawl.map(path => {
            try {
                const fullUrl = new URL(path, normalizedUrl).href;
                return crawlPage(fullUrl);
            } catch {
                return Promise.resolve({ url: path, success: false, error: 'Invalid URL' });
            }
        })
    );

    const allPages = [homepage, ...subPages.filter(p => p.success)];

    // 4. Build site summary
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
        },
        siteIntelligence: {
            totalPages: allPages.length,
            totalWordCount,
            totalImages,
            imagesWithoutAlt,
            schemaTypes: allSchemaTypes,
            hasSchemaOrg: allSchemaTypes.length > 0,
            techStack: allTech,
            hasCanonical,
            hasViewport,
            hasFAQ,
            hasRobots: !!hasRobots,
            internalLinkCount: homepage.internalLinkCount || 0,
            externalLinkCount: homepage.externalLinkCount || 0,
            externalDomains: homepage.links?.external || [],
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

    let text = `=== REAL SITE DATA (crawled live) ===\n`;
    text += `URL: ${research.url}\n`;
    text += `Title: ${hp.title}\n`;
    text += `Meta Description: ${hp.metaDescription || 'MISSING'}\n`;
    text += `H1 tags: ${hp.h1?.join(', ') || 'MISSING'}\n`;
    text += `H2 tags: ${hp.h2?.slice(0, 10).join(', ') || 'None found'}\n`;
    text += `OG Title: ${hp.ogTitle || 'MISSING'}\n`;
    text += `OG Description: ${hp.ogDescription || 'MISSING'}\n`;
    text += `Content preview: ${hp.contentSnippet || 'N/A'}\n\n`;

    text += `Site Stats:\n`;
    text += `- Pages crawled: ${si.totalPages}\n`;
    text += `- Total word count: ${si.totalWordCount}\n`;
    text += `- Total images: ${si.totalImages} (${si.imagesWithoutAlt} missing alt text)\n`;
    text += `- Internal links: ${si.internalLinkCount}, External links: ${si.externalLinkCount}\n`;
    text += `- Schema/JSON-LD: ${si.hasSchemaOrg ? `Yes (${si.schemaTypes.join(', ')})` : 'NONE FOUND'}\n`;
    text += `- Tech Stack: ${si.techStack.join(', ') || 'Unknown'}\n`;
    text += `- Canonical: ${si.hasCanonical ? 'Yes' : 'MISSING'}\n`;
    text += `- Mobile viewport: ${si.hasViewport ? 'Yes' : 'MISSING'}\n`;
    text += `- FAQ section: ${si.hasFAQ ? 'Yes' : 'Not found'}\n`;
    text += `- Robots meta: ${si.hasRobots ? 'Yes' : 'Not found'}\n\n`;

    // Sub-pages
    if (research.pages.length > 1) {
        text += `Sub-pages crawled:\n`;
        for (const p of research.pages.slice(1)) {
            text += `- ${p.url}: "${p.title}" (${p.wordCount} words)\n`;
            if (p.h1?.length) text += `  H1: ${p.h1.join(', ')}\n`;
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

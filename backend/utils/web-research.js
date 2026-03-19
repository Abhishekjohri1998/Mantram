/**
 * Mantram AI — Web Research Utility
 * Real internet research for SEO Studio.
 * Crawls pages, extracts structured data, and builds site intelligence.
 */

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT = 12000; // 12s

// ============================================================================
// BOT CHALLENGE DETECTION (Cloudflare, hCaptcha, etc.)
// ============================================================================

function isBotChallengePage(html) {
  if (!html || html.length < 100) return false;
  const lowerHtml = html.toLowerCase();
  
  // Check the <title> — Cloudflare/bot challenge pages have specific titles
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] || '').trim().toLowerCase();
  
  // Known challenge page titles (Cloudflare + similar WAFs)
  const cfChallengeTitles = [
    'just a moment...',
    'checking if the site connection is secure',
    'verifying your connection',                     // NEW: seen in acwo.com logs
    'attention required',                            // NEW: Cloudflare variant
    'one more step',                                 // NEW: Cloudflare variant
    'access denied',
    'please wait...',
    'checking your browser',
  ];
  
  // Cloudflare-specific HTML markers (only present on actual challenge pages)
  const hasCfMarkers = lowerHtml.includes('cf_chl_opt') ||
                       lowerHtml.includes('cf-challenge-running') ||
                       lowerHtml.includes('cf-browser-verification') ||
                       lowerHtml.includes('cdn-cgi/challenge-platform') ||
                       lowerHtml.includes('_cf_chl_tk') ||
                       lowerHtml.includes('challenge-form');
  
  // Title match + CF markers = definitely a challenge
  if (cfChallengeTitles.some(ct => title.includes(ct)) && hasCfMarkers) return true;
  
  // CF markers combo = definitely a challenge (even without title match)
  if (lowerHtml.includes('cf-challenge-running') && lowerHtml.includes('cf_chl_opt')) return true;
  if (lowerHtml.includes('cf-browser-verification') && lowerHtml.includes('cdn-cgi/challenge-platform')) return true;
  
  // Challenge title + short/empty page = challenge (no real content on these pages)
  if (cfChallengeTitles.some(ct => title.includes(ct)) && html.length < 50000) return true;
  
  // Fallback: title exactly matches + page has very few visible words (challenge pages are mostly JS)
  if (cfChallengeTitles.some(ct => title === ct)) return true;
  
  return false;
}

// ============================================================================
// CLOUDFLARE SOLVER (FlareSolverr-style — solve once, reuse cookies)
// ============================================================================

let _cfSession = null; // { cookies: string, userAgent: string, solved: boolean }

/**
 * Solve Cloudflare challenge for a domain using Playwright.
 * Launches Chromium ONCE, navigates to the site, waits for challenge to pass,
 * then extracts cookies + UA for all subsequent HTTP requests.
 */
async function solveCloudflare(url) {
  if (_cfSession?.solved) return _cfSession;

  let pw;
  try {
    pw = await import('playwright');
    pw = pw.default || pw;
  } catch {
    console.warn('⚠️  Playwright not available — cannot solve Cloudflare');
    return { cookies: '', userAgent: USER_AGENT, solved: false };
  }

  let browser;
  try {
    console.log(`🛡️  Cloudflare Solver: launching Chromium for ${url}...`);
    browser = await pw.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait for Cloudflare challenge to be solved (poll up to 30s)
    const solveStart = Date.now();
    let solved = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const title = await page.title();
      const hasCfChallenge = await page.evaluate(() => {
        return !!(document.querySelector('#cf-challenge-running') ||
                  document.querySelector('.cf-browser-verification') ||
                  document.title.includes('Just a moment') ||
                  document.title.includes('Verifying'));
      });
      if (!hasCfChallenge && !title.includes('Verifying') && !title.includes('Just a moment')) {
        solved = true;
        console.log(`🛡️  Cloudflare solved in ${((Date.now() - solveStart) / 1000).toFixed(1)}s — title: "${title.substring(0, 60)}"`);
        break;
      }
    }

    if (!solved) {
      console.warn('🛡️  Cloudflare challenge NOT solved after 30s');
      await browser.close();
      return { cookies: '', userAgent: USER_AGENT, solved: false };
    }

    // Extract cookies and user-agent
    const cookies = await context.cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const ua = await page.evaluate(() => navigator.userAgent);

    // Also extract H1 from the rendered page as bonus data
    const h1Data = await page.evaluate(() => {
      const h1s = document.querySelectorAll('h1');
      return Array.from(h1s).map(h => h.textContent?.trim()).filter(Boolean);
    });

    console.log(`🛡️  Extracted ${cookies.length} cookies, UA: ${ua.substring(0, 50)}...`);
    console.log(`🛡️  Homepage H1 (JS rendered): ${h1Data.length > 0 ? h1Data.join(', ').substring(0, 80) : 'NONE'}`);

    _cfSession = { cookies: cookieStr, userAgent: ua, solved: true, homepageH1: h1Data };
    await browser.close();
    return _cfSession;
  } catch (e) {
    console.error('🛡️  Cloudflare solver error:', e.message);
    if (browser) await browser.close().catch(() => {});
    return { cookies: '', userAgent: USER_AGENT, solved: false };
  }
}

function resetCfSession() { _cfSession = null; }

// ============================================================================
// FETCH HELPER
// ============================================================================

async function safeFetch(url, options = {}) {
    const MAX_RETRIES = 3;
    // Use CF session cookies/UA if available
    const effectiveUA = _cfSession?.solved ? _cfSession.userAgent : USER_AGENT;
    const cfCookies = _cfSession?.solved ? _cfSession.cookies : '';
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const resp = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'User-Agent': effectiveUA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    ...(cfCookies ? { 'Cookie': cfCookies } : {}),
                    ...options.headers,
                },
                redirect: 'follow',
            });
            clearTimeout(timer);
            // Retry on 429 (rate limit) and 503 (service unavailable) with backoff
            if ((resp.status === 429 || resp.status === 503) && attempt < MAX_RETRIES) {
                const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
                console.log(`⏳ HTTP ${resp.status} on ${url} — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.text();
        } catch (e) {
            clearTimeout(timer);
            if (attempt < MAX_RETRIES && (e.name === 'AbortError' || e.message?.includes('429') || e.message?.includes('503'))) {
                const delay = Math.pow(2, attempt + 1) * 1000;
                console.log(`⏳ Fetch error on ${url}: ${e.message} — retrying in ${delay / 1000}s`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e;
        }
    }
}

/**
 * Enhanced fetch that returns response metadata (status, headers, timing, size)
 * Used for advanced SEO auditing — Semrush/Ahrefs-level data collection
 */
async function safeFetchWithMeta(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const startTime = Date.now();
    const effectiveUA = _cfSession?.solved ? _cfSession.userAgent : USER_AGENT;
    const cfCookies = _cfSession?.solved ? _cfSession.cookies : '';
    try {
        const resp = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': effectiveUA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...(cfCookies ? { 'Cookie': cfCookies } : {}),
                ...options.headers,
            },
            redirect: 'follow',
        });
        clearTimeout(timer);
        const html = await resp.text();
        const responseTimeMs = Date.now() - startTime;
        return {
            html,
            status: resp.status,
            ok: resp.ok,
            responseTimeMs,
            pageSizeBytes: new Blob([html]).size,
            headers: {
                contentType: resp.headers.get('content-type') || '',
                server: resp.headers.get('server') || '',
                cacheControl: resp.headers.get('cache-control') || '',
                // Security headers
                csp: resp.headers.get('content-security-policy') || '',
                hsts: resp.headers.get('strict-transport-security') || '',
                xFrameOptions: resp.headers.get('x-frame-options') || '',
                xContentType: resp.headers.get('x-content-type-options') || '',
                xXssProtection: resp.headers.get('x-xss-protection') || '',
                referrerPolicy: resp.headers.get('referrer-policy') || '',
                permissionsPolicy: resp.headers.get('permissions-policy') || '',
            },
        };
    } catch (e) {
        clearTimeout(timer);
        return {
            html: '', status: e.message.includes('HTTP') ? parseInt(e.message.replace('HTTP ', '')) || 0 : 0,
            ok: false, responseTimeMs: Date.now() - startTime, pageSizeBytes: 0,
            headers: {}, error: e.message,
        };
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
    const externalUrls = []; // full URLs for broken link checking
    let emptyAnchors = 0;
    let nofollowInternalLinks = 0;
    // Capture full anchor tag including inner text
    const linkPattern = /<a\s+([^>]*)href\s*=\s*["']([^"'#]+)["']([^>]*)>(.*?)<\/a>/gis;
    let m;
    let baseDomain;
    try { baseDomain = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch { return { internal: [], external: [], externalUrls: [], emptyAnchors: 0, nofollowInternalLinks: 0 }; }

    while ((m = linkPattern.exec(html)) !== null) {
        const preAttrs = m[1] || '';
        let href = m[2].trim();
        const postAttrs = m[3] || '';
        const anchorText = stripTags(m[4] || '').trim();
        if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;

        // Check for empty anchor text
        if (!anchorText && !m[0].includes('<img')) emptyAnchors++;

        // Check for rel="nofollow"
        const allAttrs = preAttrs + ' ' + postAttrs;
        const hasNofollow = /rel\s*=\s*["'][^"']*nofollow[^"']*["']/i.test(allAttrs);

        try {
            const resolved = new URL(href, baseUrl);
            const linkDomain = resolved.hostname.replace(/^www\./, '');
            if (linkDomain === baseDomain) {
                internal.add(resolved.pathname);
                if (hasNofollow) nofollowInternalLinks++;
            } else {
                external.add(resolved.hostname);
                if (externalUrls.length < 30) externalUrls.push(resolved.href);
            }
        } catch { /* skip invalid href */ }
    }
    return {
        internal: [...internal].slice(0, 50),
        external: [...external].slice(0, 30),
        externalUrls: externalUrls.slice(0, 30),
        emptyAnchors,
        nofollowInternalLinks,
    };
}

function extractImages(html) {
    // Strip <noscript> blocks first — images inside them aren't rendered
    const cleanHtml = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    const imgs = [];
    const imgPattern = /<img\s+[^>]*>/gi;
    let m;
    while ((m = imgPattern.exec(cleanHtml)) !== null) {
        const tag = m[0];
        const src = getAttr(tag, 'src') || '';
        const alt = getAttr(tag, 'alt') || '';
        const width = parseInt(getAttr(tag, 'width') || '999', 10);
        const height = parseInt(getAttr(tag, 'height') || '999', 10);

        // Skip tracking pixels, spacers, beacons, data URIs, hidden images
        if (width < 3 || height < 3) continue;
        if (src.startsWith('data:')) continue;
        if (/pixel|beacon|track|spacer|blank\.gif|1x1|transparent/i.test(src)) continue;
        if (/aria-hidden\s*=\s*["']true["']/i.test(tag)) continue;
        if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(getAttr(tag, 'style') || '')) continue;
        if (!src || src === '#') continue;

        imgs.push({ src, hasAlt: alt.trim().length > 0 });
    }
    // Return src URLs of images missing alt for cross-page dedup
    const srcsMissingAlt = imgs.filter(i => !i.hasAlt).map(i => i.src);
    return { total: imgs.length, withAlt: imgs.filter(i => i.hasAlt).length, withoutAlt: srcsMissingAlt.length, srcsMissingAlt };
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

// ============================================================================
// ADVANCED EXTRACTION — Beats Semrush/Ahrefs
// ============================================================================

/** Extract hreflang tags for international SEO */
function extractHreflang(html) {
    const hreflangs = [];
    const pattern = /<link\s+[^>]*rel\s*=\s*["']alternate["'][^>]*hreflang\s*=\s*["']([^"']+)["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
        hreflangs.push({ lang: m[1], url: m[2] });
    }
    // Also try reversed attribute order
    const pattern2 = /<link\s+[^>]*hreflang\s*=\s*["']([^"']+)["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((m = pattern2.exec(html)) !== null) {
        if (!hreflangs.find(h => h.lang === m[1])) hreflangs.push({ lang: m[1], url: m[2] });
    }
    return hreflangs;
}

/** Detect mixed content (HTTP resources on HTTPS pages) */
function detectMixedContent(html, pageUrl) {
    if (!pageUrl.startsWith('https')) return { hasMixed: false, count: 0, examples: [] };
    const mixed = [];
    // Check src= and href= attributes for http:// (not https://)
    const pattern = /(?:src|href)\s*=\s*["'](http:\/\/[^"']+)["']/gi;
    let m;
    while ((m = pattern.exec(html)) !== null) {
        const resource = m[1];
        // Exclude common false positives (schema.org, xmlns, etc.)
        if (!resource.includes('schema.org') && !resource.includes('w3.org') && !resource.includes('xmlns')) {
            mixed.push(resource);
        }
    }
    return { hasMixed: mixed.length > 0, count: mixed.length, examples: mixed.slice(0, 5) };
}

/** Extract lang attribute from <html> tag */
function extractLangAttribute(html) {
    const m = html.match(/<html[^>]*\slang\s*=\s*["']([^"']+)["']/i);
    return m ? m[1] : '';
}

/** Count CSS and JS resources */
function countResources(html) {
    const cssLinks = (html.match(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi) || []).length;
    const cssInline = (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || []).length;
    const jsExternal = (html.match(/<script[^>]*src\s*=\s*["'][^"']+["'][^>]*>/gi) || []).length;
    const jsInline = (html.match(/<script[^>]*>[\s\S]+?<\/script>/gi) || []).filter(s => !s.includes('application/ld+json')).length;
    return {
        cssExternal: cssLinks, cssInline, cssTotal: cssLinks + cssInline,
        jsExternal, jsInline, jsTotal: jsExternal + jsInline,
        totalResources: cssLinks + jsExternal,
    };
}

/** Extract all external JS/CSS resource URLs (for cache/minification scanning — Semrush parity) */
function extractResourceUrls(html, baseUrl) {
    const resources = [];
    // External CSS stylesheets
    const cssPattern = /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = cssPattern.exec(html)) !== null && resources.length < 50) {
        const href = m[1].trim();
        if (href && !href.startsWith('data:')) {
            try {
                const fullUrl = new URL(href, baseUrl).href;
                resources.push({ url: fullUrl, type: 'css', isMinified: /\.min\.css/i.test(href) });
            } catch { /* skip invalid */ }
        }
    }
    // Also try reversed attribute order (href before rel)
    const cssPattern2 = /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
    while ((m = cssPattern2.exec(html)) !== null && resources.length < 50) {
        const href = m[1].trim();
        if (href && !href.startsWith('data:')) {
            try {
                const fullUrl = new URL(href, baseUrl).href;
                if (!resources.find(r => r.url === fullUrl)) {
                    resources.push({ url: fullUrl, type: 'css', isMinified: /\.min\.css/i.test(href) });
                }
            } catch { /* skip invalid */ }
        }
    }
    // External JS scripts
    const jsPattern = /<script[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
    while ((m = jsPattern.exec(html)) !== null && resources.length < 100) {
        const src = m[1].trim();
        if (src && !src.startsWith('data:') && !src.includes('application/ld+json')) {
            try {
                const fullUrl = new URL(src, baseUrl).href;
                if (!resources.find(r => r.url === fullUrl)) {
                    resources.push({ url: fullUrl, type: 'js', isMinified: /\.min\.js/i.test(src) });
                }
            } catch { /* skip invalid */ }
        }
    }
    return resources;
}

/** Validate heading hierarchy (no skipped levels) */
function validateHeadingHierarchy(headings) {
    const issues = [];
    let lastLevel = 0;
    for (const h of headings) {
        if (h.level > lastLevel + 1 && lastLevel > 0) {
            issues.push({ from: `H${lastLevel}`, to: `H${h.level}`, text: h.text.substring(0, 60) });
        }
        lastLevel = h.level;
    }
    return { valid: issues.length === 0, skippedLevels: issues };
}

/** Extract meta robots directives */
function extractMetaRobots(meta) {
    const robotsStr = (meta.robots || '').toLowerCase();
    return {
        raw: robotsStr,
        noindex: robotsStr.includes('noindex'),
        nofollow: robotsStr.includes('nofollow'),
        noarchive: robotsStr.includes('noarchive'),
        nosnippet: robotsStr.includes('nosnippet'),
        hasDirectives: robotsStr.length > 0,
    };
}

/** Analyze security headers — beats all competitors (Semrush/Ahrefs don't check this) */
function analyzeSecurityHeaders(headers) {
    if (!headers) return { score: 0, total: 7, details: [] };
    const checks = [
        { name: 'Content-Security-Policy', present: !!headers.csp, importance: 'critical' },
        { name: 'Strict-Transport-Security', present: !!headers.hsts, importance: 'critical' },
        { name: 'X-Frame-Options', present: !!headers.xFrameOptions, importance: 'high' },
        { name: 'X-Content-Type-Options', present: !!headers.xContentType, importance: 'high' },
        { name: 'Referrer-Policy', present: !!headers.referrerPolicy, importance: 'medium' },
        { name: 'Permissions-Policy', present: !!headers.permissionsPolicy, importance: 'medium' },
        { name: 'X-XSS-Protection', present: !!headers.xXssProtection, importance: 'low' },
    ];
    return {
        score: checks.filter(c => c.present).length,
        total: checks.length,
        percentage: Math.round((checks.filter(c => c.present).length / checks.length) * 100),
        details: checks,
    };
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
        // Use enhanced fetch for response metadata (status, timing, headers, size)
        const fetchResult = await safeFetchWithMeta(url);
        const html = fetchResult.html;

        // If fetch completely failed (no HTML), return error with status
        if (!html && !fetchResult.ok) {
            return {
                url, success: false, error: fetchResult.error || `HTTP ${fetchResult.status}`,
                statusCode: fetchResult.status, responseTimeMs: fetchResult.responseTimeMs,
            };
        }

        // Detect Cloudflare/bot challenge pages — these look like real pages but have fake H1/content
        if (isBotChallengePage(html)) {
            return {
                url, success: false, error: 'Bot challenge page (Cloudflare)',
                statusCode: fetchResult.status, responseTimeMs: fetchResult.responseTimeMs,
                isBotChallenge: true,
            };
        }

        const meta = extractMeta(html);
        const headings = extractHeadings(html);
        const jsonLd = extractJsonLd(html);
        const links = extractLinks(html, url);
        const images = extractImages(html);
        const canonical = extractCanonical(html);
        const tech = detectTechSignals(html);
        const bodyText = getBodyText(html);
        const wordCount = getWordCount(bodyText);

        // ── Soft-404 detection (SPA sites return 200 with a 404 page body) ──
        const titleLower = (meta.title || '').toLowerCase().trim();
        const h1Texts = headings.filter(h => h.level === 1).map(h => h.text.trim());
        const isSoft404 = (
            titleLower === '404' ||
            titleLower === '404 not found' ||
            titleLower === 'page not found' ||
            titleLower === 'not found' ||
            (h1Texts.length === 1 && /^(404|page not found|not found)$/i.test(h1Texts[0])) ||
            (titleLower === 'user' && h1Texts.some(h => /^404$/i.test(h)))
        );

        // ── NEW: Advanced extraction (beats Semrush/Ahrefs) ──
        const hreflang = extractHreflang(html);
        const mixedContent = detectMixedContent(html, url);
        const langAttr = extractLangAttribute(html);
        const resources = countResources(html);
        const headingHierarchy = validateHeadingHierarchy(headings);
        const metaRobots = extractMetaRobots(meta);
        const securityHeaders = analyzeSecurityHeaders(fetchResult.headers);

        // Full body text for duplicate detection + text-to-HTML ratio (capped at 10K for memory)
        const contentSnippet = bodyText.substring(0, 500);
        const bodyTextFull = bodyText.substring(0, 10000);
        const textToHtmlRatio = html.length > 0 ? Math.round((bodyText.length / html.length) * 100) : 0;

        return {
            url,
            success: true,
            isSoft404,
            // ── Response metadata ──
            statusCode: fetchResult.status,
            responseTimeMs: fetchResult.responseTimeMs,
            pageSizeBytes: fetchResult.pageSizeBytes,
            pageSizeKB: Math.round(fetchResult.pageSizeBytes / 1024),
            htmlSizeOver2MB: fetchResult.pageSizeBytes > 2 * 1024 * 1024,
            redirectChain: fetchResult.redirectChain || [],
            redirectCount: (fetchResult.redirectChain || []).length,
            // ── SEO data ──
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
            bodyTextFull,
            textToHtmlRatio,
            robots: meta.robots || '',
            viewport: meta.viewport || '',
            charset: (html.match(/charset\s*=\s*["']?([^"'\s;>]+)/i) || ['', ''])[1] || '',
            // ── Advanced data ──
            hreflang,
            hasHreflang: hreflang.length > 0,
            mixedContent,
            langAttr,
            hasLangAttr: !!langAttr,
            resources,
            headingHierarchy,
            metaRobots,
            securityHeaders,
            urlLength: url.length,
            urlTooLong: url.length > 75,
            // ── Title/meta quality flags ──
            titleLength: (meta.title || '').length,
            titleTooShort: (meta.title || '').length > 0 && (meta.title || '').length < 30,
            titleTooLong: (meta.title || '').length > 70,
            metaDescLength: (meta.description || '').length,
            metaDescTooShort: (meta.description || '').length > 0 && (meta.description || '').length < 120,
            metaDescTooLong: (meta.description || '').length > 160,
            // ── Enhanced link data ──
            emptyAnchors: links.emptyAnchors || 0,
            nofollowInternalLinks: links.nofollowInternalLinks || 0,
            externalUrls: links.externalUrls || [],
            hasCacheControl: !!(fetchResult.headers?.cacheControl),
            // ── Resource URLs for cache/minification scanning (Semrush parity) ──
            resourceUrls: extractResourceUrls(html, url),
        };
    } catch (e) {
        return { url, success: false, error: e.message, statusCode: 0, responseTimeMs: 0 };
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
        const effectiveUA = _cfSession?.solved ? _cfSession.userAgent : USER_AGENT;
        const cfCookies = _cfSession?.solved ? _cfSession.cookies : '';
        try {
            const resp = await fetch(currentUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': effectiveUA,
                    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                    ...(cfCookies ? { 'Cookie': cfCookies } : {}),
                },
                redirect: 'manual',
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
                while ((m = locPattern.exec(xml)) !== null && childSitemaps.length < 20) {
                    childSitemaps.push(m[1].trim());
                }
                // Fetch first 10 child sitemaps for full coverage
                for (const childUrl of childSitemaps.slice(0, 10)) {
                    try {
                        const childXml = await safeFetch(childUrl);
                        const childLocPattern = /<url>\s*<loc>([^<]+)<\/loc>/gi;
                        let cm;
                        while ((cm = childLocPattern.exec(childXml)) !== null && urls.length < 2000) {
                            urls.push(cm[1].trim());
                        }
                    } catch { /* skip failed child sitemap */ }
                }
            } else {
                // Standard sitemap — extract URLs
                const locPattern = /<url>\s*<loc>([^<]+)<\/loc>/gi;
                let m;
                while ((m = locPattern.exec(xml)) !== null && urls.length < 2000) {
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

/**
 * Fetch /llms.txt — AI crawler accessibility file (like robots.txt for LLMs)
 * Semrush 2025 checks for this. We beat them by also parsing its sections.
 */
async function fetchLlmsTxt(baseUrl) {
    try {
        const text = await safeFetch(`${baseUrl}/llms.txt`);
        if (!text || text.length < 10 || text.includes('<html')) {
            return { found: false, content: '', sections: [] };
        }
        // Parse sections (# headers)
        const sections = [];
        const lines = text.split('\n');
        let currentSection = null;
        for (const line of lines) {
            if (line.startsWith('#')) {
                if (currentSection) sections.push(currentSection);
                currentSection = { title: line.replace(/^#+\s*/, ''), content: '' };
            } else if (currentSection) {
                currentSection.content += line + '\n';
            }
        }
        if (currentSection) sections.push(currentSection);
        return { found: true, content: text.substring(0, 2000), sections, lineCount: lines.length };
    } catch {
        return { found: false, content: '', sections: [] };
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
    // Aggressive boilerplate stripping — shared nav/footer/sidebar causes false positives
    // Strip first/last 200 words AND remove common boilerplate patterns
    const stripBoilerplate = (text) => {
        const words = text.split(/\s+/);
        if (words.length < 500) return ''; // Pages under 500 words: skip content comparison entirely (too short for reliable fingerprinting)
        // Strip 200 words from each end (header/nav + footer/CTA)
        const core = words.slice(200, words.length - 200).join(' ');
        // Remove common boilerplate phrases that inflate similarity
        return core
            .replace(/copyright\s*\d{4}.*$/gi, '')
            .replace(/all rights reserved/gi, '')
            .replace(/privacy policy|terms of service|cookie policy/gi, '')
            .replace(/\s+/g, ' ').trim();
    };

    // Only fingerprint pages with sufficient content (500+ words)
    const fingerprints = pages
        .map(p => {
            const stripped = stripBoilerplate(p.bodyTextFull || p.contentSnippet || '');
            return { url: p.url, fp: stripped ? contentFingerprint(stripped) : new Set(), wordCount: p.wordCount || 0 };
        })
        .filter(p => p.fp.size > 0); // Exclude pages with empty fingerprints

    // Content duplicates — 99%+ similarity ONLY (Semrush reports near-0 for most sites)
    // 95% was catching templated pages (same layout, different products) as duplicates
    const contentDuplicates = [];
    for (let i = 0; i < fingerprints.length; i++) {
        for (let j = i + 1; j < fingerprints.length; j++) {
            const sim = jaccardSimilarity(fingerprints[i].fp, fingerprints[j].fp);
            if (sim > 0.99) {
                contentDuplicates.push({
                    page1: fingerprints[i].url,
                    page2: fingerprints[j].url,
                    similarity: Math.round(sim * 100),
                    level: 'exact-duplicate',
                });
            }
        }
    }

    // Duplicate titles (exact match, non-empty) — Semrush reports these separately
    const titleMap = new Map();
    for (const p of pages) {
        const t = (p.title || '').trim().toLowerCase();
        if (t.length < 5) continue; // skip empty/too-short
        if (!titleMap.has(t)) titleMap.set(t, []);
        titleMap.get(t).push(p.url);
    }
    const duplicateTitles = [...titleMap.entries()]
        .filter(([, urls]) => urls.length > 1)
        .map(([title, urls]) => ({ title, count: urls.length, urls: urls.slice(0, 5) }));

    // Duplicate meta descriptions (exact match, non-empty) — Semrush reports these separately
    const metaMap = new Map();
    for (const p of pages) {
        const d = (p.metaDescription || '').trim().toLowerCase();
        if (d.length < 10) continue;
        if (!metaMap.has(d)) metaMap.set(d, []);
        metaMap.get(d).push(p.url);
    }
    const duplicateMetaDescriptions = [...metaMap.entries()]
        .filter(([, urls]) => urls.length > 1)
        .map(([desc, urls]) => ({ description: desc.substring(0, 80) + '...', count: urls.length, urls: urls.slice(0, 5) }));

    // Total duplicate count: Semrush-style (separate categories)
    const titleDuplicateCount = duplicateTitles.reduce((s, d) => s + d.count, 0);
    const metaDuplicateCount = duplicateMetaDescriptions.reduce((s, d) => s + d.count, 0);

    return {
        contentDuplicates,
        duplicateTitles,
        duplicateMetaDescriptions,
        contentDuplicateCount: contentDuplicates.length,
        titleDuplicateCount,
        metaDuplicateCount,
        // Semrush-parity: combined count reported as "X duplicate content issues"
        totalDuplicateIssues: contentDuplicates.length + titleDuplicateCount + metaDuplicateCount,
    };
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

    // PHASE 0: Conditional Cloudflare challenge detection
    // Try a quick fetch first — only launch the expensive Playwright solver if CF is detected
    resetCfSession(); // Fresh session for each domain
    let _cfNeeded = false;
    try {
        const probeCtrl = new AbortController();
        const probeTimer = setTimeout(() => probeCtrl.abort(), 8000);
        const probeResp = await fetch(cleanBase, {
            signal: probeCtrl.signal,
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*;q=0.8' },
            redirect: 'follow',
        });
        clearTimeout(probeTimer);
        const probeHtml = await probeResp.text();
        _cfNeeded = isBotChallengePage(probeHtml);
        if (_cfNeeded) {
            console.log(`🛡️  Cloudflare challenge DETECTED — launching solver...`);
            await solveCloudflare(cleanBase);
        } else {
            console.log(`🛡️  No Cloudflare challenge — skipping solver (saved 15-30s)`);
        }
    } catch (probeErr) {
        console.log(`🛡️  Homepage probe failed (${probeErr.message}) — trying solver as fallback`);
        await solveCloudflare(cleanBase);
    }

    // PHASE 1: Fetch homepage + robots.txt + sitemap.xml in parallel
    const [homepageResult, robotsTxt, sitemap, llmsTxt] = await Promise.all([
        (async () => {
            // Use redirect-aware fetch for redirect chain tracking
            const { html, redirectChain, finalUrl } = await safeFetchWithRedirects(cleanBase);
            if (!html) return { success: false, error: 'Empty response', redirectChain };

            // Also fetch metadata (status, timing, headers) via enhanced fetch
            const metaFetch = await safeFetchWithMeta(finalUrl);

            const meta = extractMeta(html);
            const headings = extractHeadings(html);
            const jsonLd = extractJsonLd(html);
            const links = extractLinks(html, finalUrl);
            const images = extractImages(html);
            const canonical = extractCanonical(html);
            const tech = detectTechSignals(html);
            const bodyText = getBodyText(html);
            const wordCount = getWordCount(bodyText);

            // ── NEW: Advanced extraction for homepage ──
            const hreflang = extractHreflang(html);
            const mixedContent = detectMixedContent(html, finalUrl);
            const langAttr = extractLangAttribute(html);
            const resources = countResources(html);
            const headingHierarchy = validateHeadingHierarchy(headings);
            const metaRobots = extractMetaRobots(meta);
            const securityHeaders = analyzeSecurityHeaders(metaFetch.headers);

            return {
                url: finalUrl,
                success: true,
                // Response metadata
                statusCode: metaFetch.status || 200,
                responseTimeMs: metaFetch.responseTimeMs || 0,
                pageSizeBytes: metaFetch.pageSizeBytes || new Blob([html]).size,
                pageSizeKB: Math.round((metaFetch.pageSizeBytes || new Blob([html]).size) / 1024),
                // Existing fields
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
                bodyTextFull: bodyText.substring(0, 2000),
                robots: meta.robots || '',
                viewport: meta.viewport || '',
                redirectChain,
                // ── NEW: Advanced data ──
                hreflang,
                hasHreflang: hreflang.length > 0,
                mixedContent,
                langAttr,
                hasLangAttr: !!langAttr,
                resources,
                headingHierarchy,
                metaRobots,
                securityHeaders,
                urlLength: finalUrl.length,
                urlTooLong: finalUrl.length > 75,
                titleLength: (meta.title || '').length,
                titleTooShort: (meta.title || '').length > 0 && (meta.title || '').length < 30,
                titleTooLong: (meta.title || '').length > 60,
                metaDescLength: (meta.description || '').length,
                metaDescTooShort: (meta.description || '').length > 0 && (meta.description || '').length < 120,
                metaDescTooLong: (meta.description || '').length > 160,
                // ── NEW: Enhanced link data ──
                emptyAnchors: links.emptyAnchors || 0,
                nofollowInternalLinks: links.nofollowInternalLinks || 0,
                externalUrls: links.externalUrls || [],
                hasCacheControl: !!(metaFetch.headers?.cacheControl),
            };
        })(),
        fetchRobotsTxt(cleanBase),
        fetchSitemap(cleanBase),
        fetchLlmsTxt(cleanBase),
    ]);

    if (!homepageResult.success) {
        return { url: cleanBase, pages: [homepageResult], summary: null, error: homepageResult.error, robotsTxt, sitemap, llmsTxt };
    }

    let homepage = homepageResult;

    // ── Puppeteer JS-rendering fallback for SPA sites ──
    // If fetch() gets <300 words, the site is likely JS-rendered (React/Angular/Vue)
    // Re-render with headless Chrome to get the actual DOM content
    if ((homepage.wordCount || 0) < 300) {
        try {
            console.log(`🖥️  Homepage has ${homepage.wordCount} words — likely SPA. Trying Puppeteer JS rendering (12s timeout)...`);
            const puppeteerTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Puppeteer timeout (12s)')), 12000));
            const puppeteerRender = (async () => {
                const { jsRenderCrawl } = await import('./js-crawler.js');
                return jsRenderCrawl(cleanBase, { maxPages: 1, mobile: false });
            })();
            const jsResult = await Promise.race([puppeteerRender, puppeteerTimeout]);
            if (jsResult?.pages?.[0]?.wordCount > homepage.wordCount) {
                const jp = jsResult.pages[0];
                console.log(`🖥️  Puppeteer got ${jp.wordCount} words (vs ${homepage.wordCount} from fetch). Using rendered content.`);
                // Merge Puppeteer data into homepage
                homepage = {
                    ...homepage,
                    wordCount: jp.wordCount,
                    bodyTextFull: jp.bodyText || homepage.bodyTextFull,
                    contentSnippet: (jp.bodyText || '').substring(0, 500),
                    title: jp.title || homepage.title,
                    h1: jp.h1s || homepage.h1,
                    h2: jp.h2s || homepage.h2,
                    images: jp.images ? { total: jp.images.length, withAlt: jp.images.filter(i => i.hasAlt).length, withoutAlt: jp.imagesWithoutAlt || 0 } : homepage.images,
                    jsRendered: true,
                };
            }
        } catch (puppeteerErr) {
            console.warn(`🖥️  Puppeteer fallback skipped: ${puppeteerErr.message}`);
        }
    }

    const internalLinks = homepage.links?.internal || [];

    // PHASE 2: Build priority crawl queue (expanded for Semrush-level coverage)
    const MAX_PAGES = 800; // Semrush crawls 800+ pages — must match
    const CRAWL_TIMEOUT_MS = 180000; // 180s crawl time for full-site coverage
    const crawlStartTime = Date.now();
    const crawled = new Set([cleanBase, homepage.url]);
    const toCrawl = [];

    // Helper: add URL to queue if not already seen
    const enqueue = (url) => {
        if (crawled.size >= MAX_PAGES) return;
        try {
            const resolved = new URL(url).href;
            if (!crawled.has(resolved)) {
                toCrawl.push(resolved);
                crawled.add(resolved);
            }
        } catch { /* skip invalid */ }
    };

    // Helper: check if URL is crawlable (not a file, fragment, or query)
    const isCrawlable = (link) => {
        if (!link || link === '/' || link.includes('#')) return false;
        const lower = link.toLowerCase();
        if (['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.zip', '.mp4', '.mp3', '.css', '.js'].some(ext => lower.endsWith(ext))) return false;
        return true;
    };

    // Priority 1: Sitemap URLs (up to 200 — covers most of the site)
    if (sitemap.found) {
        for (const sUrl of sitemap.urls) {
            enqueue(sUrl);
        }
    }

    // Priority 2: Key structural pages
    const keyPaths = ['/about', '/about-us', '/services', '/products', '/contact', '/blog', '/faq', '/pricing', '/team', '/case-studies', '/portfolio', '/news', '/careers', '/features', '/terms', '/privacy', '/shop', '/store', '/testimonials', '/reviews'];
    for (const path of keyPaths) {
        if (crawled.size >= MAX_PAGES) break;
        const match = internalLinks.find(l => l.toLowerCase().includes(path));
        if (match) {
            try { enqueue(new URL(match, cleanBase).href); } catch { /* skip */ }
        }
    }

    // Priority 3: All homepage internal links
    for (const link of internalLinks) {
        if (crawled.size >= MAX_PAGES) break;
        if (!isCrawlable(link)) continue;
        try { enqueue(new URL(link, cleanBase).href); } catch { /* skip */ }
    }

    console.log(`🕷️  Initial crawl queue: ${toCrawl.length} pages (sitemap: ${sitemap.found ? sitemap.count : 0}, robots: ${robotsTxt.found})`);

    // PHASE 3: Crawl with recursive link discovery (batch size 8)
    const allSubPages = [];
    const BATCH_SIZE = _cfNeeded ? 6 : 12; // Smaller batches for CF sites to avoid 429
    const BATCH_DELAY = _cfNeeded ? 300 : 50; // Longer delay for CF sites
    let queueIndex = 0;
    const allFailedUrls = []; // Track failed URLs for Playwright re-crawl

    while (queueIndex < toCrawl.length) {
        // Safety: stop if we hit timeout or max pages
        if (Date.now() - crawlStartTime > CRAWL_TIMEOUT_MS) {
            console.log(`🕷️  Crawl timeout (${CRAWL_TIMEOUT_MS / 1000}s) — stopping with ${allSubPages.length + 1} pages`);
            break;
        }
        if (allSubPages.length + 1 >= MAX_PAGES) break;

        const batch = toCrawl.slice(queueIndex, queueIndex + BATCH_SIZE);
        queueIndex += BATCH_SIZE;

        const batchResults = await Promise.all(
            batch.map(url => crawlPage(url).catch(e => ({ url, success: false, error: e.message })))
        );

        const successPages = batchResults.filter(p => p.success);
        const failedBatch = batchResults.filter(p => !p.success);
        allSubPages.push(...successPages);
        allFailedUrls.push(...failedBatch.map(p => p.url).filter(Boolean));

        // Recursive discovery: extract internal links from newly crawled pages and add to queue
        for (const page of successPages) {
            const pageLinks = page.links?.internal || [];
            for (const link of pageLinks) {
                if (crawled.size >= MAX_PAGES) break;
                if (!isCrawlable(link)) continue;
                try { enqueue(new URL(link, cleanBase).href); } catch { /* skip */ }
            }
        }

        // Rate limit: delay between batches to avoid 429
        if (queueIndex < toCrawl.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    const allPages = [homepage, ...allSubPages];
    const crawlElapsed = ((Date.now() - crawlStartTime) / 1000).toFixed(1);

    // CRAWL TELEMETRY — detailed breakdown for debugging
    console.log(`🕷️  Fetch crawl complete: ${allPages.length} pages in ${crawlElapsed}s (queue had ${toCrawl.length} URLs, ${allFailedUrls.length} failed)`);
    console.log(`🕷️  Breakdown: ${allPages.filter(p => p.success).length} success, ${allFailedUrls.length} failed`);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3.5: PLAYWRIGHT HYBRID RE-CRAWL
    // If >50% of pages failed (CF/429/bot-challenge), use Playwright to
    // re-crawl them with a real browser context that bypasses rate limits.
    // This extracts: title, H1, meta, word count, images, links
    // ═══════════════════════════════════════════════════════════════════════
    const fetchSuccessRate = allPages.filter(p => p.success).length / Math.max(toCrawl.length, 1);
    if (allFailedUrls.length > 20 && fetchSuccessRate < 0.5) {
        console.log(`🖥️  Hybrid re-crawl: ${allFailedUrls.length} pages failed (${(fetchSuccessRate * 100).toFixed(0)}% success rate) — launching Playwright batch...`);
        let pw;
        try { pw = await import('playwright'); pw = pw.default || pw; } catch { pw = null; }

        if (pw) {
            let browser;
            try {
                browser = await pw.chromium.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
                });
                const ctx = await browser.newContext({
                    userAgent: _cfSession?.solved ? _cfSession.userAgent : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    viewport: { width: 1280, height: 800 },
                    ignoreHTTPSErrors: true,
                });
                // Inject CF cookies if available
                if (_cfSession?.solved && _cfSession.cookies) {
                    try {
                        const domain = new URL(cleanBase).hostname;
                        const cookiePairs = _cfSession.cookies.split('; ').map(c => {
                            const [name, ...rest] = c.split('=');
                            return { name, value: rest.join('='), domain, path: '/' };
                        });
                        await ctx.addCookies(cookiePairs);
                    } catch { /* skip cookie injection */ }
                }

                const page = await ctx.newPage();
                // Block heavy resources to speed up
                await page.route('**/*', (route) => {
                    const type = route.request().resourceType();
                    if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                        route.abort().catch(() => {});
                    } else {
                        route.continue().catch(() => {});
                    }
                });

                const PW_BATCH_LIMIT = 300;
                const PW_PAGE_TIMEOUT = 8000;
                const PW_TOTAL_TIMEOUT = 120000; // 2 minutes
                const pwStart = Date.now();
                let pwSuccess = 0;

                const urlsToReCrawl = allFailedUrls.slice(0, PW_BATCH_LIMIT);
                for (let i = 0; i < urlsToReCrawl.length; i++) {
                    if (Date.now() - pwStart > PW_TOTAL_TIMEOUT) {
                        console.log(`🖥️  Playwright re-crawl timeout (120s) — got ${pwSuccess} pages`);
                        break;
                    }
                    const url = urlsToReCrawl[i];
                    try {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PW_PAGE_TIMEOUT });
                        await page.waitForTimeout(1500); // Let JS render

                        const pageData = await page.evaluate(() => {
                            const title = document.title || '';
                            const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
                            const h1Elements = document.querySelectorAll('h1');
                            const h1 = Array.from(h1Elements).map(h => h.textContent?.trim()).filter(t => t && t.length > 0);
                            const h2Elements = document.querySelectorAll('h2');
                            const h2 = Array.from(h2Elements).map(h => h.textContent?.trim()).filter(t => t && t.length > 0);
                            // Word count from body text
                            const bodyText = document.body?.innerText || '';
                            const wordCount = bodyText.split(/\s+/).filter(w => w.length > 1).length;
                            // Images
                            const imgs = document.querySelectorAll('img');
                            let imgTotal = 0, imgNoAlt = 0;
                            const srcsMissingAlt = [];
                            imgs.forEach(img => {
                                const src = img.src || img.getAttribute('src') || '';
                                if (!src || src.startsWith('data:') || src === '#') return;
                                if (img.width < 3 || img.height < 3) return;
                                imgTotal++;
                                if (!(img.alt || '').trim()) {
                                    imgNoAlt++;
                                    srcsMissingAlt.push(src);
                                }
                            });
                            // Internal links
                            const links = [];
                            document.querySelectorAll('a[href]').forEach(a => {
                                try {
                                    const href = new URL(a.href, location.origin).href;
                                    if (href.startsWith(location.origin)) links.push(href);
                                } catch {}
                            });
                            const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
                            return { title, metaDesc, h1, h2, wordCount, imgTotal, imgNoAlt, srcsMissingAlt, links, canonical, bodyText: bodyText.substring(0, 500) };
                        });

                        // Check if this is a soft-404
                        const titleLower = (pageData.title || '').toLowerCase();
                        const isSoft404 = titleLower === '404' || titleLower === '404 not found' ||
                            titleLower === 'page not found' || titleLower === 'not found' ||
                            (pageData.h1.length === 1 && /^(404|page not found|not found)$/i.test(pageData.h1[0]));

                        const pwPage = {
                            url,
                            success: true,
                            isSoft404,
                            jsRendered: true,
                            statusCode: 200,
                            responseTimeMs: 0,
                            pageSizeBytes: 0,
                            pageSizeKB: 0,
                            title: pageData.title,
                            metaDescription: pageData.metaDesc,
                            canonical: pageData.canonical,
                            headings: [
                                ...pageData.h1.map(t => ({ level: 1, text: t })),
                                ...pageData.h2.map(t => ({ level: 2, text: t })),
                            ],
                            h1: pageData.h1,
                            h2: pageData.h2,
                            h3: [],
                            images: { total: pageData.imgTotal, withAlt: pageData.imgTotal - pageData.imgNoAlt, withoutAlt: pageData.imgNoAlt, srcsMissingAlt: pageData.srcsMissingAlt },
                            wordCount: pageData.wordCount,
                            contentSnippet: pageData.bodyText,
                            bodyTextFull: pageData.bodyText,
                            textToHtmlRatio: 50, // approximate for rendered pages
                            links: { internal: pageData.links, external: [] },
                            internalLinkCount: pageData.links.length,
                            externalLinkCount: 0,
                            titleLength: (pageData.title || '').length,
                            metaDescLength: (pageData.metaDesc || '').length,
                            viewport: 'width=device-width',
                        };

                        allSubPages.push(pwPage);
                        pwSuccess++;

                        // Discover links from Playwright-crawled pages too
                        for (const link of pageData.links) {
                            if (crawled.size >= MAX_PAGES) break;
                            if (!isCrawlable(link)) continue;
                            try { enqueue(new URL(link, cleanBase).href); } catch {}
                        }
                    } catch {
                        // Timeout or error — skip
                    }

                    // Small delay between pages to be polite
                    if (i % 4 === 3) await new Promise(r => setTimeout(r, 200));
                }

                await page.close().catch(() => {});
                await ctx.close().catch(() => {});
                await browser.close().catch(() => {});
                const pwElapsed = ((Date.now() - pwStart) / 1000).toFixed(1);
                console.log(`🖥️  Playwright re-crawl complete: ${pwSuccess} pages recovered in ${pwElapsed}s`);

                // Rebuild allPages with the new Playwright results
                allPages.length = 0;
                allPages.push(homepage, ...allSubPages);
            } catch (pwErr) {
                console.warn(`🖥️  Playwright re-crawl error: ${pwErr.message}`);
                if (browser) await browser.close().catch(() => {});
            }
        } else {
            console.warn(`🖥️  Playwright re-crawl skipped — Playwright not available`);
        }
    }

    // PHASE 3.5: SPA / Soft-404 Detection + Template Stripping
    // On SPA sites, fetch() returns the app shell (same title/H1/content on every page)
    // We must detect and strip this template data to get accurate metrics
    const soft404Pages = allPages.filter(p => p.isSoft404);
    if (soft404Pages.length > 0) {
        console.log(`🔍  Soft-404 detected: ${soft404Pages.length} pages have 404 title/H1 (SPA shell returning 200 with 404 body)`);
    }

    // Filter to only "real" (non-soft-404) pages for content analysis
    const realPages = allPages.filter(p => p.success && !p.isSoft404);
    console.log(`🔍  Real pages for content analysis: ${realPages.length} (${soft404Pages.length} soft-404 excluded)`);

    // Template title detection: if a title appears on >50% of real pages, it's a template
    const titleFreq = {};
    for (const p of realPages) {
        const t = (p.title || '').trim().toLowerCase();
        if (t) titleFreq[t] = (titleFreq[t] || 0) + 1;
    }
    const templateTitles = Object.entries(titleFreq)
        .filter(([, count]) => count / Math.max(realPages.length, 1) > 0.5)
        .map(([title]) => title);
    if (templateTitles.length > 0) {
        console.log(`🔍  Template title detected: "${templateTitles[0]}" (on ${titleFreq[templateTitles[0]]} pages) — stripping from analysis`);
        for (const p of allPages) {
            if (templateTitles.includes((p.title || '').trim().toLowerCase())) {
                p._originalTitle = p.title; // preserve for reference
                p.title = ''; // strip template title
                p.titleLength = 0;
            }
        }
    }

    // Template H1 detection: if an H1 appears on >30% of real pages, it's a template
    const h1Freq = {};
    for (const p of realPages) {
        for (const h of (p.h1 || [])) {
            const ht = h.trim().toLowerCase();
            if (ht) h1Freq[ht] = (h1Freq[ht] || 0) + 1;
        }
    }
    const templateH1s = Object.entries(h1Freq)
        .filter(([, count]) => count / Math.max(realPages.length, 1) > 0.3)
        .map(([text]) => text);
    if (templateH1s.length > 0) {
        console.log(`🔍  Template H1 detected: ${templateH1s.map(h => `"${h}" (${h1Freq[h]} pages)`).join(', ')} — stripping`);
        for (const p of allPages) {
            if (p.h1) {
                p._originalH1 = [...p.h1]; // preserve for reference
                p.h1 = p.h1.filter(h => !templateH1s.includes(h.trim().toLowerCase()));
                // Also strip from headings array
                if (p.headings) {
                    p.headings = p.headings.filter(h => {
                        if (h.level !== 1) return true;
                        return !templateH1s.includes(h.text.trim().toLowerCase());
                    });
                }
            }
        }
    }

    // PHASE 3.6: H1 re-scan for NON-Playwright pages that still have missing H1
    // (Playwright pages already have rendered H1 — only need to re-scan fetch-based pages)
    const pagesNeedingH1Scan = allPages.filter(p =>
        p.success && !p.isSoft404 && !p.jsRendered && (!p.h1 || p.h1.length === 0)
    );
    if (pagesNeedingH1Scan.length > 0 && pagesNeedingH1Scan.length <= 50) {
        // Only do H1-only re-scan if there are few pages (if many, the hybrid re-crawl above handles it)
        console.log(`🖥️  H1 re-scan: ${pagesNeedingH1Scan.length} fetch-based pages need H1 check — launching Playwright...`);
        let pw;
        try { pw = await import('playwright'); pw = pw.default || pw; } catch { pw = null; }
        if (pw) {
            let h1Browser;
            try {
                h1Browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
                const h1Context = await h1Browser.newContext({
                    userAgent: _cfSession?.solved ? _cfSession.userAgent : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                    viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true,
                });
                if (_cfSession?.solved && _cfSession.cookies) {
                    try {
                        const domain = new URL(cleanBase).hostname;
                        const cookiePairs = _cfSession.cookies.split('; ').map(c => { const [name, ...rest] = c.split('='); return { name, value: rest.join('='), domain, path: '/' }; });
                        await h1Context.addCookies(cookiePairs);
                    } catch {}
                }
                const h1Page = await h1Context.newPage();
                await h1Page.route('**/*', (route) => { const type = route.request().resourceType(); if (['image', 'media', 'font', 'stylesheet'].includes(type)) { route.abort().catch(() => {}); } else { route.continue().catch(() => {}); } });
                const h1ScanStart = Date.now();
                let h1Found = 0;
                for (const pg of pagesNeedingH1Scan.slice(0, 50)) {
                    if (Date.now() - h1ScanStart > 60000) break;
                    try {
                        await h1Page.goto(pg.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
                        await h1Page.waitForTimeout(1500);
                        const h1Data = await h1Page.evaluate(() => Array.from(document.querySelectorAll('h1')).map(h => h.textContent?.trim()).filter(t => t && t.length > 0));
                        if (h1Data.length > 0) { pg.h1 = h1Data; pg.headings = [...h1Data.map(text => ({ level: 1, text })), ...(pg.headings || []).filter(h => h.level !== 1)]; pg.jsRenderedH1 = true; h1Found++; }
                    } catch {}
                }
                await h1Page.close().catch(() => {}); await h1Context.close().catch(() => {}); await h1Browser.close().catch(() => {});
                console.log(`🖥️  H1 re-scan complete: ${h1Found} H1s found in ${((Date.now() - h1ScanStart) / 1000).toFixed(1)}s`);
            } catch (h1Err) { console.warn(`🖥️  H1 re-scan error: ${h1Err.message}`); if (h1Browser) await h1Browser.close().catch(() => {}); }
        }
    }

    // PHASE 4: Compute duplicate content
    const duplicateContent = computeDuplicates(allPages);

    // PHASE 4.5: Probe external links for broken ones (HEAD, 2s timeout, max 15)
    const externalUrlSet = new Set();
    for (const p of allPages) {
        for (const u of (p.externalUrls || [])) {
            externalUrlSet.add(JSON.stringify({ url: u, from: p.url }));
            if (externalUrlSet.size >= 50) break;
        }
        if (externalUrlSet.size >= 50) break;
    }
    const brokenExternal = [];
    const externalToProbe = [...externalUrlSet].map(s => JSON.parse(s));
    if (externalToProbe.length > 0) {
        console.log(`🔗  Probing ${externalToProbe.length} external links...`);
        const probeResults = await Promise.all(
            externalToProbe.map(async ({ url, from }) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 2000);
                try {
                    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
                    clearTimeout(t);
                    return { url, from, status: r.status, broken: r.status >= 400 };
                } catch (e) {
                    clearTimeout(t);
                    return { url, from, status: 0, broken: true, error: e.message };
                }
            })
        );
        brokenExternal.push(...probeResults.filter(r => r.broken).map(r => ({ url: r.url, linkedFrom: r.from, statusCode: r.status })));
        console.log(`🔗  External links: ${probeResults.length} probed, ${brokenExternal.length} broken`);
    }

    // PHASE 4.6: Broken internal links detection (like Semrush)
    const brokenInternal = [];
    const crawledUrls = new Set(allPages.map(p => p.url));
    const internalUrlGraph = new Map(); // url → Set of source pages
    for (const p of allPages) {
        for (const link of (p.links?.internal || [])) {
            if (!isCrawlable(link)) continue;
            try {
                const fullUrl = new URL(link, cleanBase).href;
                if (!internalUrlGraph.has(fullUrl)) internalUrlGraph.set(fullUrl, new Set());
                internalUrlGraph.get(fullUrl).add(p.url);
            } catch { /* skip */ }
        }
    }
    // Check pages that returned non-200 status during crawl
    for (const p of allPages) {
        if (p.statusCode && p.statusCode >= 400) {
            const sources = internalUrlGraph.get(p.url);
            brokenInternal.push({ url: p.url, statusCode: p.statusCode, linkedFrom: sources ? [...sources].slice(0, 3) : [] });
        }
    }
    // HEAD-probe uncrawled internal URLs (max 30, 2s timeout each) — reduced from 200 to avoid over-counting
    const uncrawledInternal = [...internalUrlGraph.entries()]
        .filter(([url]) => !crawledUrls.has(url))
        .slice(0, 30);
    if (uncrawledInternal.length > 0) {
        console.log(`🔗  Probing ${uncrawledInternal.length} uncrawled internal URLs for broken links...`);
        const internalProbeResults = await Promise.all(
            uncrawledInternal.map(async ([url, sources]) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 2000);
                try {
                    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
                    clearTimeout(t);
                    return { url, status: r.status, broken: r.status >= 400, sources: [...sources].slice(0, 3) };
                } catch (e) {
                    clearTimeout(t);
                    return { url, status: 0, broken: true, error: e.message, sources: [...sources].slice(0, 3) };
                }
            })
        );
        for (const r of internalProbeResults) {
            if (r.broken) brokenInternal.push({ url: r.url, statusCode: r.status, linkedFrom: r.sources });
        }
        console.log(`🔗  Internal links: ${uncrawledInternal.length} probed, ${brokenInternal.length} total broken`);
    }

    // PHASE 4.7: JS/CSS Resource Scanning (Semrush parity: blocked resources, uncached, unminified)
    const resourceStats = { totalResources: 0, blockedResources: [], uncachedResources: [], unminifiedResources: [], probedCount: 0 };
    const allResourceUrls = new Map(); // url → { type, isMinified, pages }
    for (const p of allPages) {
        for (const r of (p.resourceUrls || [])) {
            if (!allResourceUrls.has(r.url)) {
                allResourceUrls.set(r.url, { ...r, pages: [p.url] });
            } else {
                allResourceUrls.get(r.url).pages.push(p.url);
            }
        }
    }
    resourceStats.totalResources = allResourceUrls.size;
    // HEAD-probe up to 50 unique resources (2s timeout each, parallel)
    const resourcesToProbe = [...allResourceUrls.entries()].slice(0, 50);
    if (resourcesToProbe.length > 0) {
        console.log(`📦  Probing ${resourcesToProbe.length} JS/CSS resources for cache/minification...`);
        const resourceProbes = await Promise.all(
            resourcesToProbe.map(async ([url, info]) => {
                const ctrl = new AbortController();
                const t = setTimeout(() => ctrl.abort(), 2000);
                try {
                    const r = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
                    clearTimeout(t);
                    const cacheControl = r.headers.get('cache-control') || '';
                    const contentLength = parseInt(r.headers.get('content-length') || '0', 10);
                    return {
                        url, type: info.type, status: r.status, blocked: r.status === 403,
                        hasCacheControl: !!cacheControl, cacheControl,
                        isMinified: info.isMinified, contentLength,
                        // Heuristic: >50KB and not .min. = probably unminified
                        likelyUnminified: contentLength > 50000 && !info.isMinified,
                        pages: info.pages.slice(0, 3),
                    };
                } catch (e) {
                    clearTimeout(t);
                    return { url, type: info.type, status: 0, blocked: false, error: e.message, pages: info.pages.slice(0, 3) };
                }
            })
        );
        resourceStats.probedCount = resourceProbes.length;
        resourceStats.blockedResources = resourceProbes.filter(r => r.blocked).map(r => ({ url: r.url, type: r.type, pages: r.pages }));
        resourceStats.uncachedResources = resourceProbes.filter(r => r.status === 200 && !r.hasCacheControl).map(r => ({ url: r.url, type: r.type, pages: r.pages }));
        resourceStats.unminifiedResources = resourceProbes.filter(r => r.likelyUnminified).map(r => ({ url: r.url, type: r.type, sizeKB: Math.round(r.contentLength / 1024), pages: r.pages }));
        console.log(`📦  Resources: ${resourceStats.blockedResources.length} blocked, ${resourceStats.uncachedResources.length} uncached, ${resourceStats.unminifiedResources.length} unminified`);
    }

    // PHASE 5: Build comprehensive site intelligence
    // Use realPages (non-soft-404) for content analysis to avoid SPA shell pollution
    const analysisPages = allPages.filter(p => p.success && !p.isSoft404);
    const allHeadings = analysisPages.flatMap(p => p.headings || []);
    const allSchemaTypes = [...new Set(analysisPages.flatMap(p => p.schemaTypes || []))];
    const allTech = [...new Set(analysisPages.flatMap(p => p.tech || []))];
    const totalWordCount = analysisPages.reduce((s, p) => s + (p.wordCount || 0), 0);
    // Image dedup: count UNIQUE image src URLs missing alt, not total instances
    const uniqueImgSrcs = new Set();
    const uniqueImgNoAlt = new Set();
    for (const p of analysisPages) {
        // We need to re-extract images for dedup, but images obj only has counts
        // So use total/withoutAlt as a proxy per page, but cap at unique estimate
        // For accurate dedup, track per-page image data
    }
    // Image dedup: count UNIQUE image src URLs missing alt across all pages
    const globalMissingAltSrcs = new Set();
    for (const p of analysisPages) {
        const srcs = p.images?.srcsMissingAlt || [];
        for (const src of srcs) globalMissingAltSrcs.add(src);
    }
    const totalImages = analysisPages.reduce((s, p) => s + (p.images?.total || 0), 0);
    const rawImagesWithoutAlt = analysisPages.reduce((s, p) => s + (p.images?.withoutAlt || 0), 0);
    // Use unique src count if we have src data, otherwise fall back to raw count
    const imagesWithoutAlt = globalMissingAltSrcs.size > 0 ? globalMissingAltSrcs.size : rawImagesWithoutAlt;
    console.log(`🖼️  Images: ${totalImages} total, ${rawImagesWithoutAlt} raw missing alt, ${imagesWithoutAlt} unique src URLs missing alt (${globalMissingAltSrcs.size} unique srcs)`);

    const hasCanonical = analysisPages.some(p => p.canonical);
    const hasViewport = analysisPages.every(p => p.viewport);
    const hasFAQ = allHeadings.some(h => h.text.toLowerCase().includes('faq') || h.text.toLowerCase().includes('frequently'));
    const hasRobots = homepage.robots;
    const avgWordCount = analysisPages.length > 0 ? Math.round(totalWordCount / analysisPages.length) : 0;
    // Thin pages: exclude soft-404 pages (they're not real pages)
    const thinPages = analysisPages.filter(p => (p.wordCount || 0) < 300);
    const missingMeta = analysisPages.filter(p => !p.metaDescription);
    const missingH1 = analysisPages.filter(p => !p.h1?.length);
    const multipleH1 = analysisPages.filter(p => (p.h1?.length || 0) > 1);
    const pagesWithRedirects = analysisPages.filter(p => p.redirectChain?.length > 0);
    const lowTextRatioPages = analysisPages.filter(p => (p.textToHtmlRatio || 100) < 10);
    const oversizedPages = analysisPages.filter(p => p.htmlSizeOver2MB);
    const avgTextToHtmlRatio = analysisPages.length > 0 ? Math.round(analysisPages.reduce((s, p) => s + (p.textToHtmlRatio || 0), 0) / analysisPages.length) : 0;

    // Incoming internal link count per page (for single-incoming-link detection)
    const incomingLinkCount = new Map();
    for (const p of allPages) {
        for (const link of (p.links?.internal || [])) {
            try {
                const target = new URL(link, cleanBase).href;
                incomingLinkCount.set(target, (incomingLinkCount.get(target) || 0) + 1);
            } catch { /* skip */ }
        }
    }
    const singleIncomingPages = allSubPages.filter(p => (incomingLinkCount.get(p.url) || 0) <= 1);

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
            // ── Per-page enhanced data ──
            statusCode: p.statusCode || 200,
            responseTimeMs: p.responseTimeMs || 0,
            pageSizeKB: p.pageSizeKB || 0,
            pageSizeBytes: p.pageSizeBytes || 0,
            titleLength: p.titleLength || 0,
            metaDescLength: p.metaDescLength || 0,
            headingHierarchy: p.headingHierarchy || { valid: true, skippedLevels: [] },
            metaRobots: p.metaRobots || {},
            securityHeaders: p.securityHeaders || {},
            resources: p.resources || {},
            mixedContent: p.mixedContent || { hasMixed: false },
            urlTooLong: p.urlTooLong || false,
            hasHreflang: p.hasHreflang || false,
            hasLangAttr: p.hasLangAttr || false,
            // ── Previously missing fields (critical for Semrush parity) ──
            images: p.images || { total: 0, withAlt: 0, withoutAlt: 0 },
            canonical: p.canonical || '',
            hasSchemaOrg: p.hasSchemaOrg || false,
            textToHtmlRatio: p.textToHtmlRatio || 0,
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
            // Deep crawl metrics
            thinPages: thinPages.map(p => ({ url: p.url, wordCount: p.wordCount })),
            thinPageCount: thinPages.length,
            missingMetaDescriptions: missingMeta.map(p => p.url),
            missingH1Tags: missingH1.map(p => p.url),
            redirectChains: pagesWithRedirects.map(p => ({ url: p.url, chain: p.redirectChain })),
            redirectChainCount: pagesWithRedirects.length,
            // Duplicate detection (structured — separate content vs title vs meta)
            duplicateContent: duplicateContent.contentDuplicates || [],
            duplicateContentCount: duplicateContent.contentDuplicateCount || 0,
            duplicateTitles: duplicateContent.duplicateTitles || [],
            titleDuplicateCount: duplicateContent.titleDuplicateCount || 0,
            duplicateMetaDescriptions: duplicateContent.duplicateMetaDescriptions || [],
            metaDuplicateCount: duplicateContent.metaDuplicateCount || 0,
            // H1 issues (split — Semrush reports separately)
            missingH1Count: missingH1.length,
            multipleH1Pages: multipleH1.map(p => ({ url: p.url, h1Count: p.h1.length, h1s: p.h1.slice(0, 3) })),
            multipleH1Count: multipleH1.length,
            // Deep page analysis
            deepPages: deepPages.map(p => p.url),
            clickDepthIssues: deepPages.length,
            // New metrics
            avgTextToHtmlRatio,
            lowTextRatioPages: lowTextRatioPages.map(p => ({ url: p.url, ratio: p.textToHtmlRatio })),
            lowTextRatioCount: lowTextRatioPages.length,
            oversizedPages: oversizedPages.map(p => ({ url: p.url, sizeKB: p.pageSizeKB })),
            oversizedPageCount: oversizedPages.length,
            singleIncomingPages: singleIncomingPages.map(p => p.url).slice(0, 20),
            singleIncomingCount: singleIncomingPages.length,

            // ── Broken Internal Links (Semrush critical metric — was completely missing) ──
            brokenInternalLinks: brokenInternal,
            brokenInternalCount: brokenInternal.length,
            // ── Broken External Links ──
            brokenExternalLinks: brokenExternal,
            brokenExternalCount: brokenExternal.length,
            // ── Permanent Redirects (301/308 — pages that followed redirects to reach final URL) ──
            permanentRedirects: allPages.filter(p => (p.redirectChain?.length || 0) > 0).map(p => ({
                url: p.url, statusCode: p.redirectChain?.[0]?.status || 301, finalUrl: p.redirectChain?.[p.redirectChain.length - 1]?.to || p.url,
                chainLength: p.redirectChain?.length || 0,
            })),
            permanentRedirectCount: allPages.filter(p => (p.redirectChain?.length || 0) > 0).length,
            // ── Blocked by robots.txt (only Googlebot / * agent rules — SEO relevant) ──
            blockedByRobotsTxt: (() => {
                if (!robotsTxt.found || !robotsTxt.disallowRules?.length) return { internal: [], external: [], internalCount: 0, externalCount: 0 };
                // Only consider rules for Googlebot or * (all bots) — not bot-specific rules like AhrefsBot, SemrushBot
                const seoRules = robotsTxt.disallowRules.filter(rule => {
                    const agent = (rule.agent || '*').toLowerCase();
                    return agent === '*' || agent === 'googlebot' || agent === 'googlebot-mobile';
                });
                if (!seoRules.length) return { internal: [], external: [], internalCount: 0, externalCount: 0 };
                const blockedInternal = allPages.filter(p => {
                    try {
                        const path = new URL(p.url).pathname;
                        return seoRules.some(rule => path.startsWith(rule.path || rule));
                    } catch { return false; }
                });
                return {
                    internal: blockedInternal.map(p => p.url),
                    internalCount: blockedInternal.length,
                    rules: seoRules.slice(0, 30),
                };
            })(),

            // ══════════════════════════════════════════════════════
            // NEW: Advanced metrics (beats Semrush/Ahrefs)
            // ══════════════════════════════════════════════════════

            // Page status distribution (like Semrush/Ahrefs)
            pageStatusDistribution: {
                status200: allPages.filter(p => (p.statusCode || 200) >= 200 && (p.statusCode || 200) < 300).length,
                status301: allPages.filter(p => (p.statusCode || 200) >= 300 && (p.statusCode || 200) < 400).length,
                status404: allPages.filter(p => (p.statusCode || 200) === 404).length,
                status5xx: allPages.filter(p => (p.statusCode || 200) >= 500).length,
                broken: allPages.filter(p => !p.success).length,
            },

            // Orphan pages (not linked from any other crawled page)
            orphanPages: (() => {
                const linkedPaths = new Set();
                for (const page of allPages) {
                    (page.links?.internal || []).forEach(l => linkedPaths.add(l));
                }
                return allSubPages.filter(p => {
                    try { return !linkedPaths.has(new URL(p.url).pathname); } catch { return false; }
                }).map(p => p.url);
            })(),

            // Mixed content detection
            mixedContentPages: allPages.filter(p => p.mixedContent?.hasMixed).map(p => ({
                url: p.url, count: p.mixedContent.count, examples: p.mixedContent.examples,
            })),
            mixedContentCount: allPages.filter(p => p.mixedContent?.hasMixed).length,

            // Response time analysis (like Ahrefs)
            responseTime: {
                avg: Math.round(allPages.reduce((s, p) => s + (p.responseTimeMs || 0), 0) / allPages.length),
                fastest: Math.min(...allPages.map(p => p.responseTimeMs || 9999)),
                slowest: Math.max(...allPages.map(p => p.responseTimeMs || 0)),
                slowPages: allPages.filter(p => (p.responseTimeMs || 0) > 3000).map(p => ({ url: p.url, ms: p.responseTimeMs })),
                slowPageCount: allPages.filter(p => (p.responseTimeMs || 0) > 3000).length,
            },

            // Page size analysis
            pageSize: {
                avg: Math.round(allPages.reduce((s, p) => s + (p.pageSizeKB || 0), 0) / allPages.length),
                largest: Math.max(...allPages.map(p => p.pageSizeKB || 0)),
                heavyPages: allPages.filter(p => (p.pageSizeKB || 0) > 3000).map(p => ({ url: p.url, sizeKB: p.pageSizeKB })),
                heavyPageCount: allPages.filter(p => (p.pageSizeKB || 0) > 3000).length,
            },

            // Heading hierarchy issues
            headingIssues: {
                skippedLevels: allPages.filter(p => !p.headingHierarchy?.valid).map(p => ({
                    url: p.url, issues: p.headingHierarchy?.skippedLevels || [],
                })),
                multipleH1: allPages.filter(p => (p.h1?.length || 0) > 1).map(p => ({ url: p.url, count: p.h1.length })),
                noH1: allPages.filter(p => !p.h1?.length).map(p => p.url),
                skippedCount: allPages.filter(p => !p.headingHierarchy?.valid).length,
                multipleH1Count: allPages.filter(p => (p.h1?.length || 0) > 1).length,
            },

            // Title quality
            titleQuality: {
                missing: allPages.filter(p => !p.title).map(p => p.url),
                tooShort: allPages.filter(p => p.titleTooShort).map(p => ({ url: p.url, length: p.titleLength })),
                tooLong: allPages.filter(p => p.titleTooLong).map(p => ({ url: p.url, length: p.titleLength })),
                duplicates: (() => {
                    const titles = {};
                    allPages.forEach(p => { if (p.title) (titles[p.title] = titles[p.title] || []).push(p.url); });
                    return Object.entries(titles).filter(([, urls]) => urls.length > 1).map(([title, urls]) => ({ title, urls, count: urls.length }));
                })(),
            },

            // Meta description quality
            metaDescQuality: {
                missing: missingMeta.map(p => p.url),
                tooShort: allPages.filter(p => p.metaDescTooShort).map(p => ({ url: p.url, length: p.metaDescLength })),
                tooLong: allPages.filter(p => p.metaDescTooLong).map(p => ({ url: p.url, length: p.metaDescLength })),
                duplicates: (() => {
                    const descs = {};
                    allPages.forEach(p => { if (p.metaDescription) (descs[p.metaDescription] = descs[p.metaDescription] || []).push(p.url); });
                    return Object.entries(descs).filter(([, urls]) => urls.length > 1).map(([desc, urls]) => ({ desc: desc.substring(0, 80), urls, count: urls.length }));
                })(),
            },

            // Hreflang
            hreflangPresent: allPages.some(p => p.hasHreflang),
            hreflangPages: allPages.filter(p => p.hasHreflang).map(p => ({ url: p.url, langs: p.hreflang?.map(h => h.lang) || [] })),

            // Lang attribute
            langAttribute: homepage.langAttr || '',
            hasLangAttribute: !!homepage.langAttr,
            langMismatch: allPages.filter(p => p.langAttr && p.langAttr !== homepage.langAttr).map(p => ({
                url: p.url, lang: p.langAttr, expected: homepage.langAttr,
            })),

            // Resource bloat (CSS/JS counts — unique to us)
            resourceBloat: {
                homepage: homepage.resources || {},
                avgCss: Math.round(allPages.reduce((s, p) => s + (p.resources?.cssTotal || 0), 0) / allPages.length),
                avgJs: Math.round(allPages.reduce((s, p) => s + (p.resources?.jsTotal || 0), 0) / allPages.length),
                avgTotal: Math.round(allPages.reduce((s, p) => s + (p.resources?.totalResources || 0), 0) / allPages.length),
                bloatedPages: allPages.filter(p => (p.resources?.totalResources || 0) > 30).map(p => ({
                    url: p.url, total: p.resources?.totalResources || 0,
                })),
            },

            // Security headers (unique — competitors don't check this)
            securityScore: homepage.securityHeaders || { score: 0, total: 7, details: [] },

            // Meta robots (noindex/nofollow detection)
            metaRobotsIssues: {
                noindexPages: allPages.filter(p => p.metaRobots?.noindex).map(p => p.url),
                nofollowPages: allPages.filter(p => p.metaRobots?.nofollow).map(p => p.url),
                noindexCount: allPages.filter(p => p.metaRobots?.noindex).length,
                nofollowCount: allPages.filter(p => p.metaRobots?.nofollow).length,
            },

            // URL issues
            urlIssues: {
                tooLong: allPages.filter(p => p.urlTooLong).map(p => ({ url: p.url, length: p.urlLength })),
                tooLongCount: allPages.filter(p => p.urlTooLong).length,
            },

            // ══════════════════════════════════════════════════════
            // NEW ROUND 2: Missing Semrush checks
            // ══════════════════════════════════════════════════════

            // llms.txt (AI crawler accessibility — Semrush 2025)
            llmsTxt: llmsTxt || { found: false },

            // Empty anchor text
            emptyAnchorCount: allPages.reduce((s, p) => s + (p.emptyAnchors || 0), 0),
            emptyAnchorPages: allPages.filter(p => (p.emptyAnchors || 0) > 0).map(p => ({ url: p.url, count: p.emptyAnchors })),

            // Nofollow internal links
            nofollowInternalCount: allPages.reduce((s, p) => s + (p.nofollowInternalLinks || 0), 0),
            nofollowInternalPages: allPages.filter(p => (p.nofollowInternalLinks || 0) > 0).map(p => ({ url: p.url, count: p.nofollowInternalLinks })),

            // Cache-Control headers
            cacheControlPresent: !!(homepage.hasCacheControl),

            // Conflicting canonicals — pages where canonical doesn't point to self
            conflictingCanonicals: (() => {
                const conflicts = [];
                for (const p of allPages) {
                    if (p.canonical && p.url) {
                        try {
                            const canonUrl = new URL(p.canonical, p.url).href;
                            const pageUrl = new URL(p.url).href;
                            if (canonUrl !== pageUrl && !canonUrl.endsWith(new URL(p.url).pathname)) {
                                conflicts.push({ url: p.url, canonical: canonUrl });
                            }
                        } catch { /* skip */ }
                    }
                }
                return conflicts;
            })(),

            // Sitemap coverage — cross-reference
            sitemapCoverage: (() => {
                if (!sitemap.found) return { available: false };
                const sitemapUrls = new Set(sitemap.urls.map(u => { try { return new URL(u).pathname; } catch { return u; } }));
                const crawledPaths = new Set(allPages.map(p => { try { return new URL(p.url).pathname; } catch { return p.url; } }));
                const pagesNotInSitemap = [...crawledPaths].filter(p => !sitemapUrls.has(p) && p !== '/');
                const sitemapUrlsNotCrawled = [...sitemapUrls].filter(u => !crawledPaths.has(u));
                const totalUnique = new Set([...sitemapUrls, ...crawledPaths]).size;
                return {
                    available: true,
                    pagesNotInSitemap,
                    pagesNotInSitemapCount: pagesNotInSitemap.length,
                    sitemapUrlsNotCrawled,
                    sitemapUrlsNotCrawledCount: sitemapUrlsNotCrawled.length,
                    coveragePercent: totalUnique > 0 ? Math.round((sitemapUrls.size / totalUnique) * 100) : 0,
                };
            })(),

            // Broken external links (probed after crawl)
            brokenExternalLinks: brokenExternal,
            brokenExternalCount: brokenExternal.length,

            // Broken internal links (Semrush parity)
            brokenInternalLinks: brokenInternal,
            brokenInternalCount: brokenInternal.length,

            // ── JS/CSS Resource Scanning (Semrush: Blocked Resources, Uncached/Unminified JS/CSS) ──
            resourceScanning: {
                totalResources: resourceStats.totalResources,
                probedCount: resourceStats.probedCount,
                blockedResources: resourceStats.blockedResources,
                blockedResourceCount: resourceStats.blockedResources.length,
                uncachedResources: resourceStats.uncachedResources,
                uncachedResourceCount: resourceStats.uncachedResources.length,
                unminifiedResources: resourceStats.unminifiedResources,
                unminifiedResourceCount: resourceStats.unminifiedResources.length,
            },
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
    if (si.thinPageCount > 0) issues.push(`${si.thinPageCount} THIN PAGES (<300 words): ${(si.thinPages || []).slice(0, 3).map(p => p.url).join(', ')}`);
    if (si.missingMetaDescriptions?.length > 0) issues.push(`${si.missingMetaDescriptions.length} pages MISSING meta descriptions: ${si.missingMetaDescriptions.slice(0, 3).join(', ')}`);
    if (si.missingH1Tags?.length > 0) issues.push(`${si.missingH1Tags.length} pages MISSING H1 tags: ${si.missingH1Tags.slice(0, 3).join(', ')}`);
    if (si.redirectChainCount > 0) issues.push(`${si.redirectChainCount} pages have REDIRECT CHAINS: ${(si.redirectChains || []).slice(0, 2).map(r => `${r.url} (${r.chain?.length || 0} hops)`).join(', ')}`);
    if (si.duplicateContentCount > 0) issues.push(`${si.duplicateContentCount} DUPLICATE content pairs (85%+ similarity): ${(si.duplicateContent || []).slice(0, 2).map(d => `${d.page1} ↔ ${d.page2} (${d.similarity}%)`).join(', ')}`);
    if (si.titleDuplicateCount > 0) issues.push(`${si.titleDuplicateCount} pages with DUPLICATE TITLE TAGS: ${(si.duplicateTitles || []).slice(0, 2).map(d => `"${d.title}" (${d.count} pages)`).join(', ')}`);
    if (si.metaDuplicateCount > 0) issues.push(`${si.metaDuplicateCount} pages with DUPLICATE META DESCRIPTIONS`);
    if (si.multipleH1Count > 0) issues.push(`${si.multipleH1Count} pages with MULTIPLE H1 TAGS: ${(si.multipleH1Pages || []).slice(0, 3).map(p => `${p.url || p} (${p.h1Count || '?'} H1s)`).join(', ')}`);
    if (si.lowTextRatioCount > 0) issues.push(`${si.lowTextRatioCount} pages with LOW TEXT-TO-HTML RATIO (<10%): ${(si.lowTextRatioPages || []).slice(0, 3).map(p => `${p.url || p} (${p.ratio || '?'}%)`).join(', ')}`);
    if (si.oversizedPageCount > 0) issues.push(`${si.oversizedPageCount} pages LARGER THAN 2MB`);
    if (si.singleIncomingCount > 0) issues.push(`${si.singleIncomingCount} pages with ONLY 1 INCOMING INTERNAL LINK (low link equity)`);
    if (si.clickDepthIssues > 0) issues.push(`${si.clickDepthIssues} pages have DEEP CLICK DEPTH (not directly linked from homepage)`);



    if (issues.length > 0) {
        text += `\n--- ISSUES DETECTED ---\n`;
        for (const issue of issues) {
            text += `⚠️ ${issue}\n`;
        }
    }

    text += `\n`;

    // Sub-pages
    if ((research.pages || []).length > 1) {
        text += `Sub-pages crawled:\n`;
        for (const p of (research.pages || []).slice(1, 15)) { // Show up to 15
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


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

async function launchChromiumWithSelfHealing(pw, launchOptions) {
  try {
    return await pw.chromium.launch(launchOptions);
  } catch (launchErr) {
    const errMsg = launchErr.message || '';
    if (errMsg.includes("Executable doesn't exist") || errMsg.includes("playwright install") || errMsg.includes("download new browsers")) {
      console.warn('⚠️  Playwright browser executables not found. Running self-healing install: npx playwright install chromium...');
      try {
        const { execSync } = await import('child_process');
        execSync('npx playwright install chromium', { stdio: 'inherit' });
        console.log('✅ Playwright browser installation finished. Retrying launch...');
        return await pw.chromium.launch(launchOptions);
      } catch (installErr) {
        console.error('❌ Failed to run npx playwright install chromium:', installErr.message);
        throw launchErr;
      }
    }
    throw launchErr;
  }
}

/**
 * Solve Cloudflare challenge for a domain using Playwright.
 * Launches Chromium ONCE, navigates to the site, waits for challenge to pass,
 * then extracts cookies + UA for all subsequent HTTP requests.
 */
async function solveCloudflare(url, customUA = null) {
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
    browser = await launchChromiumWithSelfHealing(pw, {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      userAgent: customUA || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
      // Check if we are still on a challenge or block page
      const currentTitle = title.toLowerCase();
      const isStillBlocked = currentTitle.includes('access denied') || 
                             currentTitle.includes('attention required') ||
                             currentTitle.includes('one more step');

      if (!hasCfChallenge && !title.includes('Verifying') && !title.includes('Just a moment') && !isStillBlocked) {
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

    const solvedHtml = await page.content();

    console.log(`🛡️  Extracted ${cookies.length} cookies, UA: ${ua.substring(0, 50)}...`);
    console.log(`🛡️  Homepage H1 (JS rendered): ${h1Data.length > 0 ? h1Data.join(', ').substring(0, 80) : 'NONE'}`);

    _cfSession = { cookies: cookieStr, userAgent: ua, solved: true, homepageH1: h1Data, initialHtml: solvedHtml };
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

        imgs.push({ src, hasAlt: alt.trim().length > 0, width, height });
    }
    // Return src URLs of images missing alt for cross-page dedup
    const srcsMissingAlt = imgs.filter(i => !i.hasAlt).map(i => i.src);
    const stability = extractImageStability(html);
    
    return { 
        total: imgs.length, 
        withAlt: imgs.filter(i => i.hasAlt).length, 
        withoutAlt: srcsMissingAlt.length, 
        srcsMissingAlt,
        missingDimensions: stability.missingDimensions,
        missingLazy: stability.missingLazy,
        urls: imgs.map(i => i.src)
    };
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
    // ── Aggressive Semantic Filtering ──
    // Remove script, style, nav, header, footer, aside, and hidden elements
    let clean = html.replace(/<(script|style|nav|header|footer|aside|noscript|form|svg|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '');
    
    // Remove comments
    clean = clean.replace(/<!--[\s\S]*?-->/g, '');
    
    // Strip tags but keep spacing
    clean = stripTags(clean);
    
    // Normalize whitespace
    clean = clean.replace(/\s+/g, ' ').trim();
    
    return clean;
}

function getWordCount(text) {
    if (!text) return 0;
    // Semrush logic: exclude very short words (<=2 chars) that are usually noise like 'a', 'the', 'of' 
    // when calculating MEANINGFUL word count for thin content detection
    return text.split(/\s+/).filter(w => w.length > 2).length;
}

/** Detect breadcrumbs for site hierarchy accuracy */
function extractBreadcrumbs(html) {
    const breadcrumbs = [];
    const selectors = [
        /class=["'][^"']*breadcrumb[^"']*["']/i,
        /aria-label=["']breadcrumb["']/i,
        /itemtype=["']http:\/\/schema\.org\/BreadcrumbList["']/i
    ];
    
    const hasBreadcrumb = selectors.some(s => s.test(html));
    return { hasBreadcrumb, count: hasBreadcrumb ? 1 : 0 };
}

/** Validate social preview tags (Open Graph & Twitter) */
function validateSocialTags(meta) {
    const og = !!(meta['og:title'] && meta['og:image']);
    const twitter = !!(meta['twitter:title'] && meta['twitter:image'] || meta['twitter:card']);
    return { og, twitter, complete: og && twitter };
}

/** Calculate Readability (Flesch Reading Ease)
 * 206.835 - 1.015 * (total_words / total_sentences) - 84.6 * (total_syllables / total_words)
 */
function calculateReadability(text) {
    if (!text || text.length < 100) return { score: 100, grade: 'Easy', detail: 'Too short for analysis' };
    
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?](\s|$)/).filter(s => s.trim().length > 0);
    
    let syllables = 0;
    words.forEach(word => {
        let w = word.toLowerCase().replace(/[^a-z]/g, '');
        if (w.length <= 3) { syllables += 1; return; }
        w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        w = w.replace(/^y/, '');
        const m = w.match(/[aeiouy]{1,2}/g);
        syllables += m ? m.length : 1;
    });

    const wordCount = words.length;
    const sentenceCount = sentences.length || 1;
    
    const score = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllables / wordCount);
    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
    
    let grade = 'College';
    if (clampedScore > 90) grade = '5th Grade';
    else if (clampedScore > 80) grade = '6th Grade';
    else if (clampedScore > 70) grade = '7th Grade';
    else if (clampedScore > 60) grade = '8th-9th Grade';
    else if (clampedScore > 50) grade = '10th-12th Grade';
    else if (clampedScore > 30) grade = 'College';
    else grade = 'Professional/Academic';

    return { score: clampedScore, grade, wordCount, sentenceCount };
}

/** Image stability detection (missing width/height causes CLS) */
function extractImageStability(html) {
    const rawImgs = (html.match(/<img\s+[^>]*>/gi) || []);
    let missingDimensions = 0;
    let missingLazy = 0;
    
    rawImgs.forEach(tag => {
        const hasWidth = /width\s*=\s*["']?\d+/i.test(tag);
        const hasHeight = /height\s*=\s*["']?\d+/i.test(tag);
        if (!hasWidth || !hasHeight) missingDimensions++;
        if (!/loading\s*=\s*["']lazy["']/i.test(tag)) missingLazy++;
    });

    return { missingDimensions, missingLazy, total: rawImgs.length };
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
        if (images && images.urls && images.urls.length > 0) {
            images.urls = images.urls.map(src => {
                try {
                    return new URL(src, url).href;
                } catch {
                    return src;
                }
            });
        }
        const canonical = extractCanonical(html);
        const tech = detectTechSignals(html);
        const bodyText = getBodyText(html);
        const wordCount = getWordCount(bodyText);

        const breadcrumbs = extractBreadcrumbs(html);
        const socialTags = validateSocialTags(meta);

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
            breadcrumbs: breadcrumbs.hasBreadcrumb,
            socialTags,
            hasSchemaOrg: jsonLd.length > 0,
            schemaTypes: jsonLd.map(s => s['@type']).filter(Boolean),
            schemaValidation: jsonLd.map(s => {
                const type = s['@type'];
                const props = Object.keys(s);
                if (type === 'Product') return { type, valid: props.includes('offers') || props.includes('review'), missing: props.includes('offers') ? [] : ['offers/price'] };
                if (type === 'Organization') return { type, valid: props.includes('logo') || props.includes('contactPoint'), missing: props.includes('logo') ? [] : ['logo'] };
                return { type, valid: true };
            }),
            readability: calculateReadability(bodyTextFull),

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
        shingles.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
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
        .filter(p => p.fp.size > 0);

    const contentDuplicates = [];
    const nearDuplicates = []; // 85% to 98% similarity
    
    for (let i = 0; i < fingerprints.length; i++) {
        for (let j = i + 1; j < fingerprints.length; j++) {
            const sim = jaccardSimilarity(fingerprints[i].fp, fingerprints[j].fp);
            const simPercent = Math.round(sim * 100);
            
            if (sim > 0.99) {
                contentDuplicates.push({
                    page1: fingerprints[i].url,
                    page2: fingerprints[j].url,
                    similarity: simPercent,
                    level: 'exact-duplicate',
                });
            } else if (sim >= 0.85) {
                nearDuplicates.push({
                    page1: fingerprints[i].url,
                    page2: fingerprints[j].url,
                    similarity: simPercent,
                    level: 'near-duplicate',
                });
            }
        }
    }

    const titleMap = new Map();
    for (const p of pages) {
        const t = (p.title || '').trim().toLowerCase();
        if (t.length < 5) continue;
        if (!titleMap.has(t)) titleMap.set(t, []);
        titleMap.get(t).push(p.url);
    }
    const duplicateTitles = [...titleMap.entries()]
        .filter(([, urls]) => urls.length > 1)
        .map(([title, urls]) => ({ title, count: urls.length, urls: urls.slice(0, 5) }));

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

    return {
        contentDuplicates,
        nearDuplicates,
        duplicateTitles,
        duplicateMetaDescriptions,
        contentDuplicateCount: contentDuplicates.length,
        nearDuplicateCount: nearDuplicates.length,
        titleDuplicateCount: duplicateTitles.reduce((s, d) => s + d.count, 0),
        metaDuplicateCount: duplicateMetaDescriptions.reduce((s, d) => s + d.count, 0),
        totalDuplicateIssues: contentDuplicates.length + nearDuplicates.length + duplicateTitles.length + duplicateMetaDescriptions.length,
    };
}



// ============================================================================
// RESEARCH DOMAIN LIGHT — Homepage only (3-5s) for backlinks, warroom, etc.
// Returns same shape as researchDomain() for compatibility with formatSiteResearch()
// ============================================================================

export async function researchDomainLight(baseUrl) {
    let normalizedUrl = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    const cleanBase = normalizedUrl.replace(/\/+$/, '');

    console.log(`🕷️  Light crawl (homepage only): ${cleanBase}`);
    const startTime = Date.now();

    // Fetch homepage + robots.txt + sitemap in parallel (no CF solving, no Playwright)
    const [homepageHtml, robotsTxt, sitemap] = await Promise.all([
        safeFetch(cleanBase).catch(() => ''),
        fetchRobotsTxt(cleanBase),
        fetchSitemap(cleanBase),
    ]);

    if (!homepageHtml) {
        return { url: cleanBase, pages: [{ url: cleanBase, success: false, error: 'Empty response' }], homepage: {}, siteIntelligence: { totalPages: 0 }, robotsTxt, sitemap };
    }

    // Parse homepage
    const meta = extractMeta(homepageHtml);
    const headings = extractHeadings(homepageHtml);
    const jsonLd = extractJsonLd(homepageHtml);
    const links = extractLinks(homepageHtml, cleanBase);
    const images = extractImages(homepageHtml);
    const canonical = extractCanonical(homepageHtml);
    const tech = detectTechSignals(homepageHtml);
    const bodyText = getBodyText(homepageHtml);
    const wordCount = getWordCount(bodyText);

    const homepage = {
        url: cleanBase,
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
        bodyTextFull: bodyText.substring(0, 2000),
        robots: meta.robots || '',
        viewport: meta.viewport || '',
    };

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`🕷️  Light crawl complete: 1 page in ${elapsed}s (sitemap: ${sitemap.found ? sitemap.count + ' URLs' : 'not found'})`);

    // Return same shape as researchDomain() — compatible with formatSiteResearch()
    return {
        url: normalizedUrl,
        pages: [{
            url: homepage.url,
            title: homepage.title,
            metaDescription: homepage.metaDescription,
            h1: homepage.h1,
            h2: homepage.h2,
            wordCount: homepage.wordCount,
            contentSnippet: homepage.contentSnippet,
            statusCode: 200,
            images: homepage.images,
            canonical: homepage.canonical,
            hasSchemaOrg: homepage.hasSchemaOrg,
            textToHtmlRatio: 0,
        }],
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
            redirectChain: [],
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
            totalPages: 1,
            totalWordCount: homepage.wordCount,
            avgWordCount: homepage.wordCount,
            totalImages: homepage.images?.total || 0,
            imagesWithoutAlt: homepage.images?.withoutAlt || 0,
            schemaTypes: homepage.schemaTypes || [],
            hasSchemaOrg: homepage.hasSchemaOrg,
            techStack: homepage.tech || [],
            hasCanonical: !!homepage.canonical,
            hasViewport: !!homepage.viewport,
            hasFAQ: homepage.h2?.some(h => h.toLowerCase().includes('faq') || h.toLowerCase().includes('frequently')) || false,
            hasRobots: !!homepage.robots,
            hasRobotsTxt: robotsTxt.found,
            hasSitemap: sitemap.found,
            sitemapUrlCount: sitemap.count,
            internalLinkCount: homepage.internalLinkCount || 0,
            externalLinkCount: homepage.externalLinkCount || 0,
            externalDomains: homepage.links?.external || [],
            // Empty arrays for deep-crawl fields (not applicable in light mode)
            thinPages: [], thinPageCount: 0,
            missingMetaDescriptions: [], missingH1Tags: [],
            redirectChains: [], redirectChainCount: 0,
            duplicateContent: [], duplicateContentCount: 0,
            duplicateTitles: [], titleDuplicateCount: 0,
            duplicateMetaDescriptions: [], metaDuplicateCount: 0,
            missingH1Count: 0, multipleH1Pages: [], multipleH1Count: 0,
            deepPages: [], clickDepthIssues: 0,
            brokenInternalLinks: [], brokenInternalCount: 0,
            brokenExternalLinks: [], brokenExternalCount: 0,
        },
    };
}


// ============================================================================
// RESEARCH DOMAIN — Deep crawl: sitemap + robots.txt + 20+ pages
// ============================================================================

export async function researchDomain(baseUrl, options = {}) {
    // Normalize URL
    let normalizedUrl = baseUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    // Strip trailing slash for consistency
    const cleanBase = normalizedUrl.replace(/\/+$/, '');

    // Configurable crawl limits — callers can reduce for speed
    const MAX_PAGES = options.maxPages || 1000;
    const CRAWL_TIMEOUT_MS = options.timeout || 600000; // 10 minute default budget for 'exhaustive' requests
    const skipCfSolve = options.skipCfSolve || false;
    const customUA = options.userAgent;

    console.log(`🕷️  Deep crawl starting: ${cleanBase} (max ${MAX_PAGES} pages, timeout ${CRAWL_TIMEOUT_MS / 1000}s)`);

    // PHASE 0: Conditional Cloudflare challenge detection
    // Try a quick fetch first — only launch the expensive Playwright solver if CF is detected
    resetCfSession(); // Fresh session for each domain
    
    // If a custom UA is provided (e.g. for stealth), prime the session with it
    if (customUA) {
        _cfSession = { userAgent: customUA, cookies: '', solved: false };
    }

    let _cfNeeded = false;
    if (!skipCfSolve) {
      if (options.stealth) {
        console.log(`🛡️  Stealth mode enabled — forcing Playwright solver to bypass TLS fingerprinting`);
        _cfNeeded = true;
        await solveCloudflare(cleanBase, customUA);
      } else {
        try {
          const probeCtrl = new AbortController();
          const probeTimer = setTimeout(() => probeCtrl.abort(), 8000);
          const probeResp = await fetch(cleanBase, {
              signal: probeCtrl.signal,
              headers: { 'User-Agent': customUA || USER_AGENT, 'Accept': 'text/html,*/*;q=0.8' },
              redirect: 'follow',
          });
          clearTimeout(probeTimer);
          
          if (probeResp.status === 403 || probeResp.status === 401) {
              console.log(`🛡️  Homepage probe rejected with HTTP ${probeResp.status} — assuming WAF/TLS block. Forcing solver.`);
              _cfNeeded = true;
              await solveCloudflare(cleanBase, customUA);
          } else {
              const probeHtml = await probeResp.text();
              _cfNeeded = isBotChallengePage(probeHtml);
              if (_cfNeeded) {
                  console.log(`🛡️  Cloudflare challenge DETECTED — launching solver...`);
                  await solveCloudflare(cleanBase, customUA);
              } else {
                  console.log(`🛡️  No Cloudflare challenge — skipping solver (saved 15-30s)`);
              }
          }
        } catch (probeErr) {
          console.log(`🛡️  Homepage probe failed (${probeErr.message}) — trying solver as fallback`);
          _cfNeeded = true;
          await solveCloudflare(cleanBase, customUA);
        }
      }
    } else {
      console.log(`🛡️  CF solve skipped (fast mode)`);
    }

    // PHASE 1: Fetch homepage + robots.txt + sitemap.xml
    // For CF-protected sites: serialize with gaps to avoid 429 rate limiting
    // For open sites: parallel for speed
    let homepageResult, robotsTxt, sitemap, llmsTxt;

    const _homepageFetchFn = async () => {
        try {
            let html, redirectChain, finalUrl, metaFetch;

            if (_cfSession?.initialHtml) {
                console.log("🛡️  Using HTML extracted directly from Playwright CF solver to bypass TLS fingerprinting.");
                html = _cfSession.initialHtml;
                redirectChain = [];
                finalUrl = cleanBase;
                metaFetch = { status: 200, responseTimeMs: 1500, pageSizeBytes: html.length, headers: {} };
            } else {
                const fetchRes = await safeFetchWithRedirects(cleanBase);
                html = fetchRes.html;
                redirectChain = fetchRes.redirectChain;
                finalUrl = fetchRes.finalUrl;
                if (!html) return { success: false, error: 'Empty response', redirectChain };
                metaFetch = await safeFetchWithMeta(finalUrl);
            }

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
            const breadcrumbs = extractBreadcrumbs(html);
            const socialTags = validateSocialTags(meta);

            return {
                url: finalUrl,
                success: true,
                // Response metadata
                statusCode: metaFetch.status || 200,
                responseTimeMs: metaFetch.responseTimeMs || 0,
                pageSizeBytes: metaFetch.pageSizeBytes || (typeof Blob !== 'undefined' ? new Blob([html]).size : html.length),
                pageSizeKB: Math.round((metaFetch.pageSizeBytes || (typeof Blob !== 'undefined' ? new Blob([html]).size : html.length)) / 1024),
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
                breadcrumbs: breadcrumbs.hasBreadcrumb,
                socialTags,
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
        } catch (e) {
            return { url: cleanBase, success: false, error: e.message, redirectChain: [] };
        }
    };

    if (_cfNeeded) {
        // CF-protected site: serialize with 500ms gaps to avoid thundering herd 429s
        console.log(`🛡️  CF-protected site — serializing initial fetches with 500ms gaps...`);
        await new Promise(r => setTimeout(r, 1000)); // 1s cooldown after CF solve
        homepageResult = await _homepageFetchFn().catch(e => ({ success: false, error: e.message, url: cleanBase }));
        await new Promise(r => setTimeout(r, 500));
        robotsTxt = await fetchRobotsTxt(cleanBase).catch(() => ({ found: false }));
        await new Promise(r => setTimeout(r, 500));
        sitemap = await fetchSitemap(cleanBase).catch(() => ({ found: false, count: 0, urls: [] }));
        await new Promise(r => setTimeout(r, 300));
        llmsTxt = await fetchLlmsTxt(cleanBase).catch(() => ({ found: false }));
    } else {
        // Open site: parallel for speed
        [homepageResult, robotsTxt, sitemap, llmsTxt] = await Promise.all([
            _homepageFetchFn(),
            fetchRobotsTxt(cleanBase),
            fetchSitemap(cleanBase),
            fetchLlmsTxt(cleanBase),
        ]);
    }

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

    // PHASE 3: Crawl with recursive link discovery
    const allSubPages = [];
    const BATCH_SIZE = _cfNeeded ? 4 : 20; // Lower concurrency for CF sites to avoid 429
    const BATCH_DELAY = _cfNeeded ? 500 : 30; // Longer delay for CF-protected sites
    let queueIndex = 0;
    const allFailedUrls = [];
    let consecutiveFailedBatches = 0; // Track consecutive all-fail batches for early bail

    while (queueIndex < toCrawl.length) {
        if (Date.now() - crawlStartTime > CRAWL_TIMEOUT_MS) {
            console.log(`🕷️  Crawl timeout (${CRAWL_TIMEOUT_MS / 1000}s) — stopping with ${allSubPages.length + 1} pages`);
            break;
        }
        if (allSubPages.length + 1 >= MAX_PAGES) break;

        // EARLY BAIL: if 3 consecutive batches had 0 success, site is clearly rate-limiting — skip to Playwright
        if (consecutiveFailedBatches >= 3 && allFailedUrls.length > 30) {
            const remaining = toCrawl.length - queueIndex;
            console.log(`🕷️  Early bail: ${consecutiveFailedBatches} consecutive failed batches — skipping ${remaining} remaining URLs (will use Playwright)`);
            // Add ALL remaining URLs to failed list for Playwright re-crawl
            allFailedUrls.push(...toCrawl.slice(queueIndex));
            break;
        }

        const batch = toCrawl.slice(queueIndex, queueIndex + BATCH_SIZE);
        queueIndex += BATCH_SIZE;

        const batchResults = await Promise.all(
            batch.map(url => crawlPage(url).catch(e => ({ url, success: false, error: e.message })))
        );
        const successPages = batchResults.filter(p => p.success);
        const failedBatch = batchResults.filter(p => !p.success);
        allSubPages.push(...successPages);
        allFailedUrls.push(...failedBatch.map(p => p.url).filter(Boolean));

        // Track consecutive failures for early bail
        if (successPages.length === 0) {
            consecutiveFailedBatches++;
        } else {
            consecutiveFailedBatches = 0;
        }

        // Recursive discovery
        for (const page of successPages) {
            const pageLinks = page.links?.internal || [];
            for (const link of pageLinks) {
                if (crawled.size >= MAX_PAGES) break;
                if (!isCrawlable(link)) continue;
                try { enqueue(new URL(link, cleanBase).href); } catch {}
            }
        }

        if (queueIndex < toCrawl.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
    }

    const allPages = [homepage, ...allSubPages];
    const crawlElapsed = ((Date.now() - crawlStartTime) / 1000).toFixed(1);

    // CRAWL TELEMETRY — detailed breakdown for debugging
    console.log(`🕷️  Fetch crawl complete: ${allPages.length} pages in ${crawlElapsed}s (queue had ${toCrawl.length} URLs, ${allFailedUrls.length} failed)`);
    console.log(`🕷️  Breakdown: ${allPages.filter(p => p.success).length} success, ${allFailedUrls.length} failed`);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3.5: PLAYWRIGHT HYBRID RE-CRAWL
    // Fires when: (a) >50% of pages failed, OR (b) many pages have <300 words / no H1
    // This catches SPA sites that return app-shell HTML without rendered content.
    // ═══════════════════════════════════════════════════════════════════════
    const fetchSuccessRate = allPages.filter(p => p.success).length / Math.max(toCrawl.length, 1);
    // Also identify pages that need JS rendering — low word count or missing H1
    const pagesNeedingRender = allPages.filter(p => p.success && !p.isSoft404 && !p.jsRendered && ((p.wordCount || 0) < 300 || !p.h1?.length));
    if (pagesNeedingRender.length > 10) {
        // Add these to the re-crawl list so Playwright can render them properly
        console.log(`🖥️  ${pagesNeedingRender.length} pages need JS rendering (<300 words or no H1) — adding to Playwright queue`);
        for (const p of pagesNeedingRender) {
            if (!allFailedUrls.includes(p.url)) allFailedUrls.push(p.url);
        }
    }
    if (allFailedUrls.length > 10 && (fetchSuccessRate < 0.5 || pagesNeedingRender.length > 10)) {
        console.log(`🖥️  Hybrid re-crawl: ${allFailedUrls.length} pages failed (${(fetchSuccessRate * 100).toFixed(0)}% success rate) — launching Playwright batch...`);
        let pw;
        try { pw = await import('playwright'); pw = pw.default || pw; } catch { pw = null; }

        if (pw) {
            let browser;
            try {
                browser = await launchChromiumWithSelfHealing(pw, {
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

                // Use N_TABS parallel pages for speed
                const N_TABS = 6;
                const PW_BATCH_LIMIT = 800;
                const PW_PAGE_TIMEOUT = 6000;
                const PW_TOTAL_TIMEOUT = 150000; // 2.5 minutes
                const pwStart = Date.now();
                let pwSuccess = 0;

                // Create multiple page tabs for parallel crawling
                const tabs = [];
                for (let t = 0; t < N_TABS; t++) {
                    const p = await ctx.newPage();
                    await p.route('**/*', (route) => {
                        const type = route.request().resourceType();
                        if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
                            route.abort().catch(() => {});
                        } else {
                            route.continue().catch(() => {});
                        }
                    });
                    tabs.push(p);
                }

                const urlsToReCrawl = allFailedUrls.slice(0, PW_BATCH_LIMIT);

                // Process URLs in parallel batches of N_TABS
                for (let i = 0; i < urlsToReCrawl.length; i += N_TABS) {
                    if (Date.now() - pwStart > PW_TOTAL_TIMEOUT) {
                        console.log(`🖥️  Playwright re-crawl timeout (150s) — got ${pwSuccess} pages`);
                        break;
                    }

                    const chunk = urlsToReCrawl.slice(i, i + N_TABS);
                    const chunkResults = await Promise.all(chunk.map(async (url, idx) => {
                        const tab = tabs[idx % tabs.length];
                        const start = Date.now();
                        try {
                            const response = await tab.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
                            const responseTimeMs = Date.now() - start;
                            const statusCode = response?.status() || 200;

                            await tab.waitForSelector('h1', { timeout: 8000 }).catch(() => {}); // Wait for H1 to render

                            // CHECK FOR CLOUDFLARE CHALLENGE — skip if page is a CF interstitial
                            const pageTitle = await tab.title();
                            const titleLower = (pageTitle || '').toLowerCase();
                            if (titleLower.includes('just a moment') ||
                                titleLower.includes('attention required') ||
                                titleLower.includes('checking your browser') ||
                                titleLower.includes('please wait') ||
                                titleLower.includes('verifying your connection') ||
                                titleLower.includes('one more step')) {
                                return null; // CF challenge page — skip
                            }

                            const pageData = await tab.evaluate(async () => {
                                const title = document.title || '';
                                const meta = {};
                                document.querySelectorAll('meta').forEach(m => {
                                    const name = m.getAttribute('name') || m.getAttribute('property');
                                    const content = m.getAttribute('content');
                                    if (name && content) meta[name.toLowerCase()] = content;
                                });

                                // Capture Performance Metrics
                                const getPerfMetrics = () => {
                                    const paint = performance.getEntriesByType('paint');
                                    const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
                                    const navigation = performance.getEntriesByType('navigation')[0];
                                    const ttfb = navigation ? navigation.responseStart - navigation.requestStart : 0;
                                    const lcpEntry = performance.getEntriesByType('largest-contentful-paint');
                                    const lcp = lcpEntry.length > 0 ? lcpEntry[lcpEntry.length - 1].startTime : 0;
                                    return { fcp, ttfb, lcp };
                                };

                                const perf = getPerfMetrics();

                                const headings = [];
                                [1,2,3,4,5,6].forEach(level => {
                                    document.querySelectorAll('h' + level).forEach(h => {
                                        headings.push({ level, text: h.textContent?.trim() || '' });
                                    });
                                });

                                const jsonLd = [];
                                document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
                                    try { jsonLd.push(JSON.parse(s.textContent)); } catch {}
                                });

                                // Semantic Word Count (excluding boilerplate children)
                                const bodyClone = document.body.cloneNode(true);
                                bodyClone.querySelectorAll('header, nav, footer, aside, script, style, noscript, form, svg, iframe').forEach(el => el.remove());
                                const bodyText = bodyClone.innerText || '';
                                const wordCount = bodyText.split(/\s+/).filter(w => w.length > 2).length;
                                
                                const imgs = document.querySelectorAll('img');
                                let imgTotal = 0, imgNoAlt = 0;
                                const srcsMissingAlt = [];
                                imgs.forEach(img => {
                                    const src = img.src || img.getAttribute('src') || '';
                                    if (!src || src.startsWith('data:') || src === '#') return;
                                    const rect = img.getBoundingClientRect();
                                    if (rect.width < 5 || rect.height < 5) return; // ignore tracking pixels
                                    imgTotal++;
                                    if (!(img.alt || '').trim()) { imgNoAlt++; srcsMissingAlt.push(src); }
                                });

                                const links = { internal: [], external: [] };
                                const baseHost = location.hostname.replace(/^www\./, '');
                                document.querySelectorAll('a[href]').forEach(a => {
                                    try {
                                        const url = new URL(a.href, location.href);
                                        const host = url.hostname.replace(/^www\./, '');
                                        if (host === baseHost) links.internal.push(url.href);
                                        else links.external.push(url.href);
                                    } catch {}
                                });

                                const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
                                const hreflang = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map(l => ({ lang: l.getAttribute('hreflang'), url: l.href }));

                                const mixedContent = [];
                                if (location.protocol === 'https:') {
                                    document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]').forEach(el => {
                                        mixedContent.push(el.src || el.href);
                                    });
                                }

                                const breadcrumbs = !!(document.querySelector('.breadcrumb') || document.querySelector('[aria-label="breadcrumb"]') || document.querySelector('[itemtype*="BreadcrumbList"]'));
                                const socialTags = {
                                    og: !!(document.querySelector('meta[property="og:title"]') && document.querySelector('meta[property="og:image"]')),
                                    twitter: !!(document.querySelector('meta[name="twitter:title"]') && document.querySelector('meta[name="twitter:image"]'))
                                };

                                return { 
                                    title, meta, headings, jsonLd, wordCount, 
                                    imgTotal, imgNoAlt, srcsMissingAlt, links, canonical, 
                                    bodyText: bodyText.substring(0, 5000), // refined for duplicate detection
                                    hreflang, mixedContent, perf, breadcrumbs, socialTags,
                                    langAttr: document.documentElement.lang || '',
                                    resources: { 
                                        cssTotal: document.querySelectorAll('link[rel="stylesheet"]').length, 
                                        jsTotal: document.querySelectorAll('script[src]').length 
                                    },
                                    viewport: meta['viewport'] || '',
                                    htmlLength: document.documentElement.outerHTML.length
                                };
                            });

                            // Double-check: skip pages with CF challenge H1
                            const h1Lower = (pageData.headings.find(h => h.level === 1)?.text || '').toLowerCase();
                            if (h1Lower.includes('verify') || h1Lower.includes('checking') ||
                                h1Lower.includes('just a moment') || h1Lower.includes('please wait')) {
                                return null; 
                            }

                            // Skip empty/broken pages
                            if (pageData.wordCount < 5 && !pageData.title) return null;

                            const titleLwr = (pageData.title || '').toLowerCase();
                            const isSoft404 = titleLwr === '404' || titleLwr === '404 not found' ||
                                titleLwr === 'page not found' || titleLwr === 'not found' ||
                                (pageData.headings.filter(h => h.level === 1).some(h => /^(404|page not found|not found)$/i.test(h.text)));

                            const robotsStr = (pageData.meta['robots'] || '').toLowerCase();
                            const metaRobots = {
                                raw: robotsStr,
                                noindex: robotsStr.includes('noindex'),
                                nofollow: robotsStr.includes('nofollow'),
                                hasDirectives: robotsStr.length > 0
                            };

                            let lastLevel = 0;
                            const skippedLevels = [];
                            for (const h of pageData.headings) {
                                if (h.level > lastLevel + 1 && lastLevel > 0) skippedLevels.push({ from: `H${lastLevel}`, to: `H${h.level}` });
                                lastLevel = h.level;
                            }

                            return {
                                url, success: true, isSoft404, jsRendered: true,
                                statusCode, responseTimeMs, 
                                perf: pageData.perf, // NEW: FCP, TTFB, LCP
                                pageSizeBytes: pageData.htmlLength, 
                                pageSizeKB: Math.round(pageData.htmlLength / 1024),
                                title: pageData.title, 
                                metaDescription: pageData.meta['description'] || '',
                                canonical: pageData.canonical,
                                headings: pageData.headings,
                                h1: pageData.headings.filter(h => h.level === 1).map(h => h.text),
                                h2: pageData.headings.filter(h => h.level === 2).map(h => h.text),
                                h3: pageData.headings.filter(h => h.level === 3).map(h => h.text),
                                jsonLd: pageData.jsonLd,
                                breadcrumbs: pageData.breadcrumbs,
                                socialTags: pageData.socialTags,
                                hasSchemaOrg: pageData.jsonLd.length > 0,
                                schemaTypes: pageData.jsonLd.map(s => s['@type']).filter(Boolean),
                                images: { total: pageData.imgTotal, withAlt: pageData.imgTotal - pageData.imgNoAlt, withoutAlt: pageData.imgNoAlt, srcsMissingAlt: pageData.srcsMissingAlt },
                                wordCount: pageData.wordCount, 
                                contentSnippet: pageData.bodyText.substring(0, 500), 
                                bodyTextFull: pageData.bodyText,
                                textToHtmlRatio: Math.round((pageData.bodyText.length / pageData.htmlLength) * 100) || 50,
                                links: pageData.links,
                                internalLinkCount: pageData.links.internal.length,
                                externalLinkCount: pageData.links.external.length,
                                hreflang: pageData.hreflang,
                                hasHreflang: pageData.hreflang.length > 0,
                                mixedContent: { hasMixed: pageData.mixedContent.length > 0, count: pageData.mixedContent.length },
                                langAttr: pageData.langAttr,
                                hasLangAttr: !!pageData.langAttr,
                                resources: { ...pageData.resources, totalResources: pageData.resources.cssTotal + pageData.resources.jsTotal },
                                headingHierarchy: { valid: skippedLevels.length === 0, skippedLevels },
                                metaRobots,
                                titleLength: (pageData.title || '').length,
                                metaDescLength: (pageData.meta['description'] || '').length,
                                viewport: pageData.viewport || 'width=device-width',
                                urlLength: url.length,
                                urlTooLong: url.length > 75,
                            };

                        } catch (e) {
                            console.error(`🖥️  Playwright re-crawl fail for ${url}: ${e.message}`);
                            return null;
                        }
                    }));

                    for (const result of chunkResults) {
                        if (result && result.success) {
                            allSubPages.push(result);
                            pwSuccess++;
                            // Discover links
                            for (const link of (result.links?.internal || [])) {
                                if (crawled.size >= MAX_PAGES) break;
                                if (!isCrawlable(link)) continue;
                                try { enqueue(new URL(link, cleanBase).href); } catch {}
                            }
                        }
                    }
                }

                for (const t of tabs) await t.close().catch(() => {});
                await ctx.close().catch(() => {});
                await browser.close().catch(() => {});
                const pwElapsed = ((Date.now() - pwStart) / 1000).toFixed(1);
                console.log(`🖥️  Playwright re-crawl complete: ${pwSuccess} pages recovered in ${pwElapsed}s (${N_TABS} parallel tabs)`);

                // Rebuild allPages
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
                h1Browser = await launchChromiumWithSelfHealing(pw, { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
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
    // Image dedup: count UNIQUE image src URLs missing alt across all pages
    // Normalize URLs: strip query params, fragments, CDN version hashes
    const normalizeImgSrc = (src) => {
        try {
            const u = new URL(src);
            // Keep only protocol + host + pathname (strip ?v=123, #fragment, etc.)
            return u.origin + u.pathname;
        } catch {
            // Not a full URL — strip query/fragment with regex
            return src.replace(/[?#].*$/, '');
        }
    };
    const globalMissingAltSrcs = new Set();
    for (const p of analysisPages) {
        const srcs = p.images?.srcsMissingAlt || [];
        for (const src of srcs) globalMissingAltSrcs.add(normalizeImgSrc(src));
    }
    const totalImages = analysisPages.reduce((s, p) => s + (p.images?.total || 0), 0);
    const rawImagesWithoutAlt = analysisPages.reduce((s, p) => s + (p.images?.withoutAlt || 0), 0);
    // Use normalized unique src count
    const imagesWithoutAlt = globalMissingAltSrcs.size > 0 ? globalMissingAltSrcs.size : rawImagesWithoutAlt;
    console.log(`🖼️  Images: ${totalImages} total, ${rawImagesWithoutAlt} raw missing alt, ${imagesWithoutAlt} unique normalized URLs missing alt`);

    const hasCanonical = analysisPages.some(p => p.canonical);
    const hasViewport = analysisPages.every(p => p.viewport);
    const hasFAQ = allHeadings.some(h => h.text.toLowerCase().includes('faq') || h.text.toLowerCase().includes('frequently'));
    const hasRobots = homepage.robots;
    const avgWordCount = analysisPages.length > 0 ? Math.round(totalWordCount / analysisPages.length) : 0;
    // Thin pages: exclude soft-404 pages (they're not real pages)
    const thinPages = analysisPages.filter(p => (p.wordCount || 0) < 300);
    const missingMeta = analysisPages.filter(p => !p.metaDescription);
    // H1 metrics: simple direct count from all analysis pages
    // Template stripping and CF detection already handle bad data
    const missingH1 = analysisPages.filter(p => !p.h1?.length);
    const multipleH1 = analysisPages.filter(p => (p.h1?.length || 0) > 1);
    const missingH1Count = missingH1.length;
    const multipleH1Count = multipleH1.length;
    console.log(`🏷️  H1 stats: ${missingH1Count} missing, ${multipleH1Count} multiple (from ${analysisPages.length} analysis pages)`);
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
            success: p.success,
            isSoft404: p.isSoft404,
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
            // H1 issues (split — Semrush reports separately, uses fetch-based H1 for parity)
            missingH1Count,
            multipleH1Pages: multipleH1.map(p => ({ url: p.url, h1Count: p.h1.length, h1s: p.h1.slice(0, 3) })),
            multipleH1Count,
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

            // Performance Paint Metrics (Average)
            perf: {
                avgFcp: Math.round(allPages.reduce((s, p) => s + (p.perf?.fcp || 0), 0) / allPages.length),
                avgTtfb: Math.round(allPages.reduce((s, p) => s + (p.perf?.ttfb || p.responseTimeMs || 0), 0) / allPages.length),
                avgLcp: Math.round(allPages.reduce((s, p) => s + (p.perf?.lcp || 0), 0) / allPages.length),
            },

            // Accuracy Tier Aggregation
            readability: {
                avgScore: Math.round(allPages.reduce((s, p) => s + (p.readability?.score || 0), 0) / allPages.length),
                grades: allPages.map(p => p.readability?.grade).filter(Boolean),
            },
            missingImageDimensionsCount: allPages.reduce((s, p) => s + (p.missingDimensions || 0), 0),
            incompleteSchemaCount: allPages.filter(p => (p.schemaValidation || []).some(v => !v.valid)).length,

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

            // ── Performance Metrics (NEW: FCP, TTFB, LCP) ──
            perf: {
                avgFcp: Math.round(allPages.filter(p => p.jsRendered).reduce((s, p) => s + (p.perf?.fcp || 0), 0) / Math.max(1, allPages.filter(p => p.jsRendered && p.perf?.fcp).length)) || 0,
                avgTtfb: Math.round(allPages.reduce((s, p) => s + (p.perf?.ttfb || p.responseTimeMs || 0), 0) / allPages.length),
                avgLcp: Math.round(allPages.filter(p => p.jsRendered).reduce((s, p) => s + (p.perf?.lcp || 0), 0) / Math.max(1, allPages.filter(p => p.jsRendered && p.perf?.lcp).length)) || 0,
            },

            // ── Near Duplicates (NEW: Cannibalization Check) ──
            nearDuplicates: duplicateContent.nearDuplicates || [],
            nearDuplicateCount: duplicateContent.nearDuplicateCount || 0,

            // ── Breadcrumbs & Social Tags (NEW) ──
            missingBreadcrumbsCount: allPages.filter(p => !p.isSoft404 && !p.breadcrumbs).length,
            missingSocialTagsCount: allPages.filter(p => !p.isSoft404 && (!p.socialTags?.og || !p.socialTags?.twitter)).length,
            
            // Meta Robots & Redirects
            metaRobotsIssues: {
                noindexCount: allPages.filter(p => p.metaRobots?.noindex).length,
                nofollowCount: allPages.filter(p => p.metaRobots?.nofollow).length,
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

            // ══════════════════════════════════════════════════════
            // PHASE 2: Full Redirect Chain Analysis (Semrush parity)
            // ══════════════════════════════════════════════════════
            redirectAnalysis: (() => {
                const allRedirects = allPages.filter(p => p.redirectChain?.length > 0);
                // Typed classification
                const by301 = allRedirects.filter(p => p.redirectChain.some(r => r.status === 301));
                const by302 = allRedirects.filter(p => p.redirectChain.some(r => r.status === 302));
                const by307 = allRedirects.filter(p => p.redirectChain.some(r => r.status === 307));
                const by308 = allRedirects.filter(p => p.redirectChain.some(r => r.status === 308));
                // Chain length distribution
                const longChains = allRedirects.filter(p => p.redirectChain.length >= 3);
                // Loop detection
                const loops = [];
                for (const p of allRedirects) {
                    const seen = new Set();
                    for (const hop of p.redirectChain) {
                        if (seen.has(hop.to)) { loops.push({ url: p.url, loopUrl: hop.to, chain: p.redirectChain }); break; }
                        seen.add(hop.from); seen.add(hop.to);
                    }
                }
                // Self-referencing redirects (A → A)
                const selfRedirects = allRedirects.filter(p => p.redirectChain.some(r => r.from === r.to));
                return {
                    totalRedirects: allRedirects.length,
                    permanent301: by301.map(p => ({ url: p.url, chain: p.redirectChain })),
                    permanent301Count: by301.length,
                    temporary302: by302.map(p => ({ url: p.url, chain: p.redirectChain })),
                    temporary302Count: by302.length,
                    temporary307: by307.map(p => ({ url: p.url, chain: p.redirectChain })).slice(0, 10),
                    temporary307Count: by307.length,
                    permanent308: by308.map(p => ({ url: p.url, chain: p.redirectChain })).slice(0, 10),
                    permanent308Count: by308.length,
                    longChains: longChains.map(p => ({ url: p.url, chainLength: p.redirectChain.length, chain: p.redirectChain })),
                    longChainCount: longChains.length,
                    loops,
                    loopCount: loops.length,
                    selfRedirects: selfRedirects.map(p => p.url),
                    selfRedirectCount: selfRedirects.length,
                    avgChainLength: allRedirects.length > 0 ? Math.round(allRedirects.reduce((s, p) => s + p.redirectChain.length, 0) / allRedirects.length * 10) / 10 : 0,
                };
            })(),

            // ══════════════════════════════════════════════════════
            // PHASE 2: Schema Validation (Semrush parity)
            // ══════════════════════════════════════════════════════
            schemaValidation: (() => {
                const REQUIRED_FIELDS = {
                    'Organization': ['name', 'url', 'logo'],
                    'LocalBusiness': ['name', 'address', 'telephone', 'url'],
                    'Product': ['name', 'image', 'description'],
                    'Article': ['headline', 'author', 'datePublished', 'image'],
                    'BlogPosting': ['headline', 'author', 'datePublished', 'image'],
                    'FAQPage': ['mainEntity'],
                    'HowTo': ['name', 'step'],
                    'BreadcrumbList': ['itemListElement'],
                    'WebSite': ['name', 'url'],
                    'WebPage': ['name', 'url'],
                    'Review': ['itemReviewed', 'author', 'reviewRating'],
                    'Event': ['name', 'startDate', 'location'],
                    'Course': ['name', 'description', 'provider'],
                    'VideoObject': ['name', 'description', 'thumbnailUrl', 'uploadDate'],
                };
                const issues = [];
                const typeCounts = {};
                for (const page of analysisPages) {
                    for (const schema of (page.jsonLd || [])) {
                        const type = schema['@type'];
                        if (!type) continue;
                        typeCounts[type] = (typeCounts[type] || 0) + 1;
                        const required = REQUIRED_FIELDS[type];
                        if (required) {
                            const missing = required.filter(f => !schema[f] && !schema[f.toLowerCase()]);
                            if (missing.length > 0) {
                                issues.push({ url: page.url, type, missingFields: missing });
                            }
                        }
                    }
                }
                const pagesWithSchema = analysisPages.filter(p => p.jsonLd?.length > 0);
                const pagesWithoutSchema = analysisPages.filter(p => !p.jsonLd?.length);
                return {
                    totalSchemas: Object.values(typeCounts).reduce((a, b) => a + b, 0),
                    typeCounts,
                    pagesWithSchema: pagesWithSchema.length,
                    pagesWithoutSchema: pagesWithoutSchema.length,
                    pagesWithoutSchemaUrls: pagesWithoutSchema.map(p => p.url).slice(0, 20),
                    validationIssues: issues,
                    validationIssueCount: issues.length,
                    hasOrganization: !!typeCounts['Organization'],
                    hasBreadcrumb: !!typeCounts['BreadcrumbList'],
                    hasFAQ: !!typeCounts['FAQPage'],
                    hasArticle: !!(typeCounts['Article'] || typeCounts['BlogPosting']),
                    hasProduct: !!typeCounts['Product'],
                    missingCritical: (() => {
                        const missing = [];
                        if (!typeCounts['Organization'] && !typeCounts['LocalBusiness']) missing.push('Organization/LocalBusiness');
                        if (!typeCounts['BreadcrumbList']) missing.push('BreadcrumbList');
                        if (!typeCounts['WebSite']) missing.push('WebSite');
                        return missing;
                    })(),
                };
            })(),

            // ══════════════════════════════════════════════════════
            // PHASE 2: Internal Link Flow & PageRank Distribution
            // ══════════════════════════════════════════════════════
            internalLinkFlow: (() => {
                // Build full link graph
                const linkGraph = new Map(); // url → { outgoing: [], incoming: [], pageRank: 1 }
                for (const p of allPages) {
                    if (!linkGraph.has(p.url)) linkGraph.set(p.url, { outgoing: [], incoming: [], pageRank: 1 });
                    for (const link of (p.links?.internal || [])) {
                        try {
                            const target = new URL(link, cleanBase).href;
                            if (!linkGraph.has(target)) linkGraph.set(target, { outgoing: [], incoming: [], pageRank: 1 });
                            linkGraph.get(p.url).outgoing.push(target);
                            linkGraph.get(target).incoming.push(p.url);
                        } catch { /* skip */ }
                    }
                }
                // Simple PageRank (3 iterations) — enough for distribution insight
                const damping = 0.85;
                const pages = [...linkGraph.keys()];
                const n = pages.length || 1;
                for (let iter = 0; iter < 3; iter++) {
                    const newRanks = new Map();
                    for (const url of pages) {
                        let rank = (1 - damping) / n;
                        const node = linkGraph.get(url);
                        for (const src of node.incoming) {
                            const srcNode = linkGraph.get(src);
                            if (srcNode && srcNode.outgoing.length > 0) {
                                rank += damping * (srcNode.pageRank / srcNode.outgoing.length);
                            }
                        }
                        newRanks.set(url, rank);
                    }
                    for (const [url, rank] of newRanks) linkGraph.get(url).pageRank = rank;
                }
                // Build distribution: top pages, orphans, link juice concentration
                const ranked = [...linkGraph.entries()]
                    .map(([url, data]) => ({ url, pageRank: Math.round(data.pageRank * 1000) / 1000, incoming: data.incoming.length, outgoing: data.outgoing.length }))
                    .sort((a, b) => b.pageRank - a.pageRank);
                const topPages = ranked.slice(0, 15);
                const bottomPages = ranked.filter(p => p.incoming === 0 && p.url !== homepage.url);
                // Link juice concentration: what % of total PageRank do top 10% of pages hold
                const totalPR = ranked.reduce((s, p) => s + p.pageRank, 0);
                const top10pct = ranked.slice(0, Math.max(1, Math.floor(ranked.length * 0.1)));
                const top10pctPR = top10pct.reduce((s, p) => s + p.pageRank, 0);
                return {
                    totalNodes: linkGraph.size,
                    topPages,
                    orphanPages: bottomPages.map(p => p.url).slice(0, 20),
                    orphanCount: bottomPages.length,
                    linkJuiceConcentration: totalPR > 0 ? Math.round((top10pctPR / totalPR) * 100) : 0,
                    avgIncoming: Math.round(ranked.reduce((s, p) => s + p.incoming, 0) / Math.max(ranked.length, 1)),
                    avgOutgoing: Math.round(ranked.reduce((s, p) => s + p.outgoing, 0) / Math.max(ranked.length, 1)),
                    distribution: {
                        noIncoming: ranked.filter(p => p.incoming === 0).length,
                        oneIncoming: ranked.filter(p => p.incoming === 1).length,
                        twoToFive: ranked.filter(p => p.incoming >= 2 && p.incoming <= 5).length,
                        sixToTen: ranked.filter(p => p.incoming >= 6 && p.incoming <= 10).length,
                        moreThanTen: ranked.filter(p => p.incoming > 10).length,
                    },
                };
            })(),

            // ══════════════════════════════════════════════════════
            // PHASE 2: Enhanced Crawl Depth Analysis
            // ══════════════════════════════════════════════════════
            crawlDepthAnalysis: (() => {
                // BFS from homepage to compute actual click depth
                const depthMap = new Map();
                depthMap.set(homepage.url, 0);
                const queue = [homepage.url];
                const visited = new Set([homepage.url]);
                while (queue.length > 0) {
                    const current = queue.shift();
                    const currentDepth = depthMap.get(current);
                    const page = allPages.find(p => p.url === current);
                    if (!page) continue;
                    for (const link of (page.links?.internal || [])) {
                        try {
                            const target = new URL(link, cleanBase).href;
                            if (!visited.has(target)) {
                                visited.add(target);
                                depthMap.set(target, currentDepth + 1);
                                queue.push(target);
                            }
                        } catch { /* skip */ }
                    }
                }
                const depths = [...depthMap.entries()].map(([url, depth]) => ({ url, depth }));
                const distribution = { depth0: 0, depth1: 0, depth2: 0, depth3: 0, depth4plus: 0 };
                for (const { depth } of depths) {
                    if (depth === 0) distribution.depth0++;
                    else if (depth === 1) distribution.depth1++;
                    else if (depth === 2) distribution.depth2++;
                    else if (depth === 3) distribution.depth3++;
                    else distribution.depth4plus++;
                }
                const deeperThan3 = depths.filter(d => d.depth > 3);
                return {
                    distribution,
                    maxDepth: Math.max(...depths.map(d => d.depth), 0),
                    avgDepth: depths.length > 0 ? Math.round(depths.reduce((s, d) => s + d.depth, 0) / depths.length * 10) / 10 : 0,
                    deeperThan3: deeperThan3.map(d => ({ url: d.url, depth: d.depth })).slice(0, 20),
                    deeperThan3Count: deeperThan3.length,
                    unreachable: allPages.filter(p => !depthMap.has(p.url) && p.success).map(p => p.url),
                    unreachableCount: allPages.filter(p => !depthMap.has(p.url) && p.success).length,
                };
            })(),
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

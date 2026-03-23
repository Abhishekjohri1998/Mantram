/**
 * Mantram AI — JS Rendering Crawler (Puppeteer)
 * 
 * For JavaScript-heavy SPA sites (React, Angular, Vue) that return
 * blank/sparse HTML to static crawlers. Renders pages with a full
 * headless browser and extracts the real DOM content.
 * 
 * Features:
 * - Full JS rendering with configurable wait
 * - Internal link graph extraction
 * - Orphan page detection
 * - Core Web Vitals measurement via Performance API
 * - Mobile viewport testing
 * - Crawl budget analysis
 */

import puppeteer from 'puppeteer';

const MAX_PAGES = 30;
const PAGE_TIMEOUT = 15000; // 15s per page
const RENDER_WAIT = 2000;   // 2s for JS to execute

/**
 * Launch a shared browser instance
 */
async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
    timeout: 30000,
  });
}

/**
 * Render a single page and extract data
 */
async function renderPage(page, url, viewport = { width: 1440, height: 900 }) {
  try {
    await page.setViewport(viewport);
    await page.setUserAgent('MantramAI-Crawler/1.0 (+https://mantram.ai/bot)');

    // Block heavy resources to speed up crawl
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: PAGE_TIMEOUT,
    });

    // Wait for JS rendering
    await new Promise(r => setTimeout(r, RENDER_WAIT));

    // Extract page data
    const data = await page.evaluate(() => {
      const title = document.title || '';
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const metaRobots = document.querySelector('meta[name="robots"]')?.content || '';
      const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

      // Headings
      const h1s = [...document.querySelectorAll('h1')].map(h => h.textContent.trim()).filter(Boolean);
      const h2s = [...document.querySelectorAll('h2')].map(h => h.textContent.trim()).filter(Boolean);

      // Content
      const bodyText = document.body?.innerText || '';
      const wordCount = bodyText.split(/\s+/).filter(w => w.length > 1).length;

      // Internal links
      const links = [...document.querySelectorAll('a[href]')]
        .map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 80), isExternal: false }))
        .filter(l => l.href.startsWith('http'));

      // Images
      const images = [...document.querySelectorAll('img')].map(img => ({
        src: img.src || img.dataset?.src || '',
        alt: img.alt || '',
        hasAlt: !!img.alt,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      }));
      const imagesWithoutAlt = images.filter(i => !i.hasAlt).length;

      // Schema.org structured data
      const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => { try { return JSON.parse(s.textContent); } catch { return null; } })
        .filter(Boolean);

      // Open Graph
      const ogTags = {};
      document.querySelectorAll('meta[property^="og:"]').forEach(m => {
        ogTags[m.getAttribute('property')] = m.content;
      });

      // Performance metrics (Core Web Vitals proxy)
      const perfEntries = performance.getEntriesByType('navigation')?.[0] || {};
      const timing = {
        ttfb: Math.round(perfEntries.responseStart || 0),
        domContentLoaded: Math.round(perfEntries.domContentLoadedEventEnd || 0),
        loadComplete: Math.round(perfEntries.loadEventEnd || 0),
        domInteractive: Math.round(perfEntries.domInteractive || 0),
      };

      return {
        title, metaDesc, metaRobots, canonical,
        h1s, h2s, wordCount, bodyText: bodyText.slice(0, 500),
        links, images, imagesWithoutAlt,
        schemas: schemas.map(s => s['@type'] || 'Unknown'),
        ogTags, timing,
      };
    });

    // Classify links as internal/external
    const baseHost = new URL(url).hostname;
    data.links = data.links.map(l => {
      try {
        const linkHost = new URL(l.href).hostname;
        l.isExternal = linkHost !== baseHost && !linkHost.endsWith('.' + baseHost);
        return l;
      } catch { return { ...l, isExternal: true }; }
    });

    return {
      url,
      status: response?.status() || 0,
      rendered: true,
      headers: response?.headers() || {},
      ...data,
      internalLinks: data.links.filter(l => !l.isExternal),
      externalLinks: data.links.filter(l => l.isExternal),
    };
  } catch (e) {
    return {
      url,
      status: 0,
      rendered: false,
      error: e.message,
      title: '', metaDesc: '', wordCount: 0,
      h1s: [], h2s: [], links: [], internalLinks: [], externalLinks: [],
      images: [], schemas: [], ogTags: {}, timing: {}, headers: {},
    };
  }
}

/**
 * Full JS-rendered site crawl
 * @param {string} startUrl - The domain to crawl
 * @param {Object} options
 * @param {number} options.maxPages - Max pages to render (default 30)
 * @param {boolean} options.mobile - Also test mobile viewport
 * @returns {Promise<Object>} Comprehensive crawl results
 */
export async function jsRenderCrawl(startUrl, options = {}) {
  const { maxPages = MAX_PAGES, mobile = false } = options;
  const baseUrl = startUrl.startsWith('http') ? startUrl : `https://${startUrl}`;
  const baseHost = new URL(baseUrl).hostname;
  const visited = new Set();
  const queue = [baseUrl];
  const pages = [];
  const linkGraph = {}; // url → [linked urls]
  let browser;

  console.log(`🖥️ JS Render Crawler: Starting for ${baseUrl} (max ${maxPages} pages)...`);

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift();
      const normalized = normalizeUrl(url);
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      console.log(`  📄 Rendering ${pages.length + 1}/${maxPages}: ${url.slice(0, 80)}`);
      const result = await renderPage(page, url);
      pages.push(result);

      // Build link graph
      linkGraph[normalized] = result.internalLinks.map(l => normalizeUrl(l.href));

      // Queue internal links
      for (const link of result.internalLinks) {
        const norm = normalizeUrl(link.href);
        if (!visited.has(norm) && !queue.includes(link.href)) {
          try {
            const linkHost = new URL(link.href).hostname;
            if (linkHost === baseHost || linkHost.endsWith('.' + baseHost)) {
              queue.push(link.href);
            }
          } catch { /* skip bad URLs */ }
        }
      }
    }

    // Mobile viewport test (homepage only if enabled)
    let mobileResult = null;
    if (mobile) {
      console.log('  📱 Testing mobile viewport...');
      mobileResult = await renderPage(page, baseUrl, { width: 375, height: 812 });
    }

    await page.close();
    await browser.close();

    // ── Post-processing analysis ──

    // Orphan pages: pages not linked from any other crawled page
    const allLinkedUrls = new Set(Object.values(linkGraph).flat());
    const orphanPages = pages
      .filter(p => p.url !== baseUrl && !allLinkedUrls.has(normalizeUrl(p.url)))
      .map(p => p.url);

    // Click depth analysis
    const depthMap = computeClickDepth(linkGraph, normalizeUrl(baseUrl));

    // Content issues
    const thinPages = pages.filter(p => p.wordCount > 0 && p.wordCount < 300);
    const noTitle = pages.filter(p => !p.title);
    const noMetaDesc = pages.filter(p => !p.metaDesc);
    const noH1 = pages.filter(p => !p.h1s || p.h1s.length === 0);
    const multipleH1 = pages.filter(p => p.h1s && p.h1s.length > 1);
    const noSchema = pages.filter(p => !p.schemas || p.schemas.length === 0);
    const slowPages = pages.filter(p => p.timing?.loadComplete > 5000);
    const imagesWithoutAlt = pages.reduce((sum, p) => sum + (p.imagesWithoutAlt || 0), 0);

    // Average performance
    const avgTTFB = pages.filter(p => p.timing?.ttfb).reduce((s, p) => s + p.timing.ttfb, 0) / (pages.filter(p => p.timing?.ttfb).length || 1);
    const avgLoad = pages.filter(p => p.timing?.loadComplete).reduce((s, p) => s + p.timing.loadComplete, 0) / (pages.filter(p => p.timing?.loadComplete).length || 1);

    console.log(`✅ JS Render Crawl complete: ${pages.length} pages, ${orphanPages.length} orphans, ${thinPages.length} thin`);

    return {
      pagesRendered: pages.length,
      totalInternalLinks: pages.reduce((s, p) => s + p.internalLinks.length, 0),
      totalExternalLinks: pages.reduce((s, p) => s + p.externalLinks.length, 0),
      // Page data
      pages: pages.map(p => ({
        url: p.url, status: p.status, rendered: p.rendered,
        title: p.title, metaDesc: p.metaDesc?.slice(0, 160),
        h1s: p.h1s, wordCount: p.wordCount,
        internalLinkCount: p.internalLinks.length,
        externalLinkCount: p.externalLinks.length,
        schemas: p.schemas, imagesWithoutAlt: p.imagesWithoutAlt,
        timing: p.timing, clickDepth: depthMap[normalizeUrl(p.url)] ?? -1,
        headers: p.headers || {},
      })),
      // Issues
      issues: {
        orphanPages,
        thinPages: thinPages.map(p => ({ url: p.url, wordCount: p.wordCount })),
        noTitle: noTitle.map(p => p.url),
        noMetaDesc: noMetaDesc.map(p => p.url),
        noH1: noH1.map(p => p.url),
        multipleH1: multipleH1.map(p => ({ url: p.url, h1s: p.h1s })),
        noSchema: noSchema.map(p => p.url),
        slowPages: slowPages.map(p => ({ url: p.url, loadTime: p.timing.loadComplete })),
        imagesWithoutAlt,
      },
      // Performance
      performance: {
        avgTTFB: Math.round(avgTTFB),
        avgLoadComplete: Math.round(avgLoad),
      },
      // Link graph (for visualization)
      linkGraph: Object.entries(linkGraph).map(([from, to]) => ({
        from, to: to.slice(0, 20), // Limit per-page links
      })),
      // Mobile test
      mobileTest: mobileResult ? {
        rendered: mobileResult.rendered,
        title: mobileResult.title,
        wordCount: mobileResult.wordCount,
        timing: mobileResult.timing,
      } : null,
    };
  } catch (e) {
    console.error('JS Render Crawl error:', e.message);
    if (browser) await browser.close().catch(() => {});
    return {
      pagesRendered: pages.length,
      error: e.message,
      pages: pages.map(p => ({ url: p.url, status: p.status, title: p.title, wordCount: p.wordCount, headers: p.headers || {} })),
      issues: {},
    };
  }
}

/**
 * Format JS render crawl results for AI prompt
 */
export function formatJSCrawlForPrompt(crawlData) {
  if (!crawlData || !crawlData.pagesRendered) return '';

  let text = '\n=== JS RENDERING CRAWL (Puppeteer — full browser rendering) ===\n';
  text += `Pages rendered: ${crawlData.pagesRendered}\n`;
  text += `Avg TTFB: ${crawlData.performance?.avgTTFB}ms | Avg Load: ${crawlData.performance?.avgLoadComplete}ms\n`;

  // Issues
  const iss = crawlData.issues || {};
  if (iss.orphanPages?.length) text += `⚠️ Orphan pages (no internal links pointing to them): ${iss.orphanPages.length}\n  ${iss.orphanPages.slice(0, 5).join('\n  ')}\n`;
  if (iss.thinPages?.length) text += `⚠️ Thin pages (<300 words): ${iss.thinPages.length}\n`;
  if (iss.noTitle?.length) text += `❌ Missing title tags: ${iss.noTitle.length}\n`;
  if (iss.noMetaDesc?.length) text += `❌ Missing meta descriptions: ${iss.noMetaDesc.length}\n`;
  if (iss.noH1?.length) text += `❌ Missing H1 tags: ${iss.noH1.length}\n`;
  if (iss.multipleH1?.length) text += `⚠️ Multiple H1 tags: ${iss.multipleH1.length}\n`;
  if (iss.noSchema?.length) text += `⚠️ Pages without structured data: ${iss.noSchema.length}\n`;
  if (iss.slowPages?.length) text += `⚠️ Slow pages (>5s load): ${iss.slowPages.length}\n`;
  if (iss.imagesWithoutAlt) text += `⚠️ Images without alt text: ${iss.imagesWithoutAlt}\n`;

  // Top pages by click depth
  const deepPages = (crawlData.pages || []).filter(p => p.clickDepth > 3);
  if (deepPages.length) {
    text += `\nDeep pages (click depth >3 — hard for bots to find):\n`;
    for (const p of deepPages.slice(0, 5)) {
      text += `  - ${p.url} (depth: ${p.clickDepth})\n`;
    }
  }

  return text;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch { return url.toLowerCase().replace(/\/+$/, ''); }
}

/**
 * BFS click-depth from start URL
 */
function computeClickDepth(linkGraph, startUrl) {
  const depth = { [startUrl]: 0 };
  const queue = [startUrl];
  while (queue.length > 0) {
    const current = queue.shift();
    const currentDepth = depth[current];
    for (const linked of (linkGraph[current] || [])) {
      if (!(linked in depth)) {
        depth[linked] = currentDepth + 1;
        queue.push(linked);
      }
    }
  }
  return depth;
}

/**
 * Mantram AI — SEO Baseline Audit Service
 * 
 * Runs during brand onboarding (background) to provide a baseline SEO score.
 * Uses DETERMINISTIC scoring from real crawl data — no AI hallucination for scores.
 * AI is used ONLY for strategic interpretation of the data.
 * 
 * Data sources:
 * - web-research.js → researchDomain() for deep site crawl (20+ pages)
 * - pagespeed.js → getPageSpeed() for Core Web Vitals + Lighthouse scores
 * - dataforseo.js → getDomainBacklinks() for authority metrics (optional, paid)
 */

import { researchDomain } from '../utils/web-research.js';
import { getPageSpeed } from '../utils/pagespeed.js';
import { getDomainBacklinks, isDataForSEOConfigured } from '../utils/dataforseo.js';
import SeoAudit from '../models/SeoAudit.js';

// ============================================================================
// DETERMINISTIC SCORING ENGINE — No AI, pure data-driven
// ============================================================================

/**
 * Compute Technical Score (0-100) from crawl data + PageSpeed
 */
function computeTechnicalScore(siteIntelligence, robotsTxt, sitemap, pageSpeed, websiteUrl) {
    let score = 0;
    const details = [];

    // HTTPS (10 pts) — check actual URL protocol
    const isHttps = websiteUrl ? websiteUrl.startsWith('https') : true;
    if (isHttps) {
        score += 10;
        details.push({ check: 'HTTPS', score: 10, max: 10, status: 'pass' });
    } else {
        details.push({ check: 'HTTPS', score: 0, max: 10, status: 'fail', fix: 'Migrate to HTTPS — Google considers HTTPS a ranking signal. Install an SSL certificate.' });
    }

    // robots.txt present (5 pts)
    if (robotsTxt?.found) {
        score += 5;
        details.push({ check: 'robots.txt', score: 5, max: 5, status: 'pass' });
    } else {
        details.push({ check: 'robots.txt', score: 0, max: 5, status: 'fail', fix: 'Create a robots.txt file to guide search engine crawlers' });
    }

    // sitemap.xml present (5 pts)
    if (sitemap?.found) {
        score += 5;
        details.push({ check: 'sitemap.xml', score: 5, max: 5, status: 'pass' });
    } else {
        details.push({ check: 'sitemap.xml', score: 0, max: 5, status: 'fail', fix: 'Create an XML sitemap and submit to Google Search Console' });
    }

    // Mobile viewport (5 pts)
    if (siteIntelligence.hasViewport) {
        score += 5;
        details.push({ check: 'Mobile Viewport', score: 5, max: 5, status: 'pass' });
    } else {
        details.push({ check: 'Mobile Viewport', score: 0, max: 5, status: 'fail', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to all pages' });
    }

    // Canonical tags (5 pts)
    if (siteIntelligence.hasCanonical) {
        score += 5;
        details.push({ check: 'Canonical Tags', score: 5, max: 5, status: 'pass' });
    } else {
        details.push({ check: 'Canonical Tags', score: 0, max: 5, status: 'fail', fix: 'Add <link rel="canonical"> to prevent duplicate content issues' });
    }

    // PageSpeed Performance (20 pts) — scaled from 0-100 Lighthouse score
    if (pageSpeed?.success && pageSpeed.scores) {
        const perfScore = Math.round(pageSpeed.scores.performance * 0.2);
        score += perfScore;
        details.push({
            check: 'PageSpeed Performance',
            score: perfScore,
            max: 20,
            status: perfScore >= 14 ? 'pass' : perfScore >= 8 ? 'warning' : 'fail',
            value: `${pageSpeed.scores.performance}/100`,
            fix: perfScore < 14 ? 'Optimize images, enable compression, reduce render-blocking resources' : undefined,
        });
    } else {
        details.push({ check: 'PageSpeed Performance', score: 0, max: 20, status: 'skip', value: 'Not available' });
    }

    // Core Web Vitals (15 pts) — LCP (5), CLS (5), INP/FID (5)
    if (pageSpeed?.success && pageSpeed.coreWebVitals) {
        const cwv = pageSpeed.coreWebVitals;
        // LCP — Good: <2500ms, Needs Improvement: <4000ms, Poor: >=4000ms
        if (cwv.lcp) {
            const lcpMs = cwv.lcp.value;
            const lcpScore = lcpMs <= 2500 ? 5 : lcpMs <= 4000 ? 3 : 1;
            score += lcpScore;
            details.push({ check: 'LCP (Largest Contentful Paint)', score: lcpScore, max: 5, status: lcpScore === 5 ? 'pass' : lcpScore === 3 ? 'warning' : 'fail', value: `${lcpMs}ms` });
        }
        // CLS — Good: <0.1, Needs Improvement: <0.25, Poor: >=0.25
        if (cwv.cls) {
            const clsVal = cwv.cls.value;
            const clsScore = clsVal <= 0.1 ? 5 : clsVal <= 0.25 ? 3 : 1;
            score += clsScore;
            details.push({ check: 'CLS (Cumulative Layout Shift)', score: clsScore, max: 5, status: clsScore === 5 ? 'pass' : clsScore === 3 ? 'warning' : 'fail', value: `${clsVal}` });
        }
        // INP — Good: <200ms, Needs Improvement: <500ms, Poor: >=500ms
        if (cwv.inp) {
            const inpMs = cwv.inp.value;
            const inpScore = inpMs <= 200 ? 5 : inpMs <= 500 ? 3 : 1;
            score += inpScore;
            details.push({ check: 'INP (Interaction to Next Paint)', score: inpScore, max: 5, status: inpScore === 5 ? 'pass' : inpScore === 3 ? 'warning' : 'fail', value: `${inpMs}ms` });
        }
    }

    // Redirect chains (8 pts)
    const redirectPenalty = Math.min(8, siteIntelligence.redirectChainCount * 2);
    const redirectScore = 8 - redirectPenalty;
    score += Math.max(0, redirectScore);
    if (siteIntelligence.redirectChainCount > 0) {
        details.push({ check: 'Redirect Chains', score: Math.max(0, redirectScore), max: 8, status: redirectScore <= 3 ? 'fail' : 'warning', value: `${siteIntelligence.redirectChainCount} chains found`, fix: 'Fix redirect chains — each hop adds latency and dilutes link equity' });
    } else {
        details.push({ check: 'Redirect Chains', score: 8, max: 8, status: 'pass' });
    }

    // Structured data / Schema (7 pts)
    if (siteIntelligence.hasSchemaOrg) {
        const schemaCount = siteIntelligence.schemaTypes?.length || 0;
        const schemaScore = Math.min(7, schemaCount * 2 + 2);
        score += schemaScore;
        details.push({ check: 'Structured Data (Schema.org)', score: schemaScore, max: 7, status: schemaScore >= 5 ? 'pass' : 'warning', value: siteIntelligence.schemaTypes.join(', ') });
    } else {
        details.push({ check: 'Structured Data (Schema.org)', score: 0, max: 7, status: 'fail', fix: 'Add JSON-LD structured data (Organization, LocalBusiness, Product, FAQ) for rich results' });
    }

    // Security Headers (5 pts — unique: Semrush/Ahrefs don't check this)
    const secScore = siteIntelligence.securityScore || {};
    const securityPts = Math.min(5, Math.round((secScore.score || 0) / (secScore.total || 7) * 5));
    score += securityPts;
    details.push({
        check: 'Security Headers',
        score: securityPts,
        max: 5,
        status: securityPts >= 4 ? 'pass' : securityPts >= 2 ? 'warning' : 'fail',
        value: `${secScore.score || 0}/${secScore.total || 7} headers present (${secScore.percentage || 0}%)`,
        fix: securityPts < 4 ? 'Add security headers: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options' : undefined,
    });

    // Mixed Content (penalty from HTTPS score, -3 max)
    if (siteIntelligence.mixedContentCount > 0) {
        const mixPenalty = Math.min(3, siteIntelligence.mixedContentCount);
        score -= mixPenalty;
        details.push({ check: 'Mixed Content', score: -mixPenalty, max: 0, status: 'fail', value: `${siteIntelligence.mixedContentCount} pages load HTTP resources on HTTPS`, fix: 'Update all resource URLs to HTTPS to fix mixed content warnings' });
    }

    // Response Time (penalty, -3 max)
    if (siteIntelligence.responseTime?.slowPageCount > 0) {
        const rtPenalty = Math.min(3, siteIntelligence.responseTime.slowPageCount);
        score -= rtPenalty;
        details.push({ check: 'Slow Response Time', score: -rtPenalty, max: 0, status: 'fail', value: `${siteIntelligence.responseTime.slowPageCount} pages >3s TTFB (avg: ${siteIntelligence.responseTime.avg}ms)`, fix: 'Optimize server response time — enable caching, upgrade hosting, optimize database queries' });
    }

    // Meta Robots Issues (penalty, -3 max)
    if (siteIntelligence.metaRobotsIssues?.noindexCount > 0) {
        details.push({ check: 'Noindex Pages Detected', score: 0, max: 0, status: 'warning', value: `${siteIntelligence.metaRobotsIssues.noindexCount} pages have noindex — verify this is intentional` });
    }

    // ── Broken External Links (penalty, -3 max) ──
    if (siteIntelligence.brokenExternalCount > 0) {
        const extPenalty = Math.min(3, siteIntelligence.brokenExternalCount);
        score -= extPenalty;
        details.push({ check: 'Broken External Links', issueType: 'warning', score: -extPenalty, max: 0, status: 'fail',
            value: `${siteIntelligence.brokenExternalCount} outgoing links return errors`,
            affectedUrls: (siteIntelligence.brokenExternalLinks || []).slice(0, 10).map(b => b.url),
            aboutThisIssue: 'Broken external links lead users to dead pages, harming user experience and signaling low site maintenance to search engines.',
            howToFix: 'Remove or replace broken outbound links. Use a link checker tool periodically to catch new broken links.' });
    }

    // ── Broken Internal Links (penalty, -5 max) ──
    if (siteIntelligence.brokenInternalCount > 0) {
        const intPenalty = Math.min(5, Math.ceil(siteIntelligence.brokenInternalCount / 2));
        score -= intPenalty;
        details.push({ check: 'Broken Internal Links', issueType: 'error', score: -intPenalty, max: 0, status: 'fail',
            value: `${siteIntelligence.brokenInternalCount} internal links return 404/error`,
            affectedUrls: (siteIntelligence.brokenInternalLinks || []).slice(0, 10).map(b => b.url),
            aboutThisIssue: 'Broken internal links create dead ends for users and waste crawl budget. They also prevent link equity from flowing to important pages.',
            howToFix: 'Fix or remove each broken internal link. Update links to point to the correct URLs or add 301 redirects for moved pages.' });
    }

    // ── Text-to-HTML Ratio (penalty, -2 max) ──
    const lowTextRatioCount = siteIntelligence.lowTextRatioCount || 0;
    if (lowTextRatioCount > 0) {
        const ratioP = Math.min(2, Math.ceil(lowTextRatioCount / 5));
        score -= ratioP;
        details.push({ check: 'Low Text-to-HTML Ratio (<10%)', issueType: 'warning', score: -ratioP, max: 0, status: 'warning',
            value: `${lowTextRatioCount} pages (avg ratio: ${siteIntelligence.avgTextToHtmlRatio || 0}%)`,
            affectedUrls: (siteIntelligence.lowTextRatioPages || []).slice(0, 10).map(p => p.url),
            aboutThisIssue: 'A text-to-HTML ratio below 10% suggests pages are mostly code/layout with very little actual content. Search engines may classify these as thin content.',
            howToFix: 'Add more meaningful text content to these pages. Reduce unnecessary HTML, inline CSS, and JavaScript. Move external resources to separate files.' });
    }

    // ── Oversized HTML (>2MB, penalty -1) ──
    const oversizedCount = siteIntelligence.oversizedPageCount || 0;
    if (oversizedCount > 0) {
        score -= 1;
        details.push({ check: 'HTML Page Size Over 2MB', issueType: 'warning', score: -1, max: 0, status: 'warning',
            value: `${oversizedCount} pages`,
            affectedUrls: (siteIntelligence.oversizedPages || []).slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Google may not fully index HTML pages larger than 2MB. Large pages also hurt Core Web Vitals and mobile performance.',
            howToFix: 'Reduce page size by optimizing images, minifying CSS/JS, removing unused code, and lazy-loading non-critical content.' });
    }

    // ── Pages with only 1 incoming internal link (notice) ──
    const singleIncoming = siteIntelligence.singleIncomingCount || 0;
    if (singleIncoming > 3) {
        details.push({ check: 'Pages With Single Incoming Internal Link', issueType: 'notice', score: 0, max: 0, status: 'warning',
            value: `${singleIncoming} pages`,
            affectedUrls: (siteIntelligence.singleIncomingPages || []).slice(0, 10),
            aboutThisIssue: 'Pages with only 1 incoming internal link receive minimal link equity, making them harder to rank. They may also be difficult for users to discover.',
            howToFix: 'Add internal links from related pages to improve link equity flow. Use contextual links within content, not just navigation/footer links.' });
    }

    // ── Duplicate Content (penalty, -2 max) ──
    const dupContentCount = siteIntelligence.duplicateContentCount || 0;
    if (dupContentCount > 0) {
        const dupP = Math.min(2, dupContentCount);
        score -= dupP;
        details.push({ check: 'Duplicate Content Pages', issueType: 'warning', score: -dupP, max: 0, status: 'warning',
            value: `${dupContentCount} page pairs with 85%+ identical content`,
            affectedUrls: (siteIntelligence.duplicateContent || []).slice(0, 5).flatMap(d => [d.page1, d.page2]),
            aboutThisIssue: 'Pages with nearly identical content compete against each other in rankings (cannibalisation). Search engines may choose the wrong version or de-value both.',
            howToFix: 'Consolidate duplicate pages using canonical tags or 301 redirects. If both pages are needed, differentiate their content significantly.' });
    }

    // ── Mixed Content HTTPS→HTTP (penalty, -2 max) ──
    const mixedContentPages = (siteIntelligence.mixedContentPages || []);
    if (mixedContentPages.length > 0) {
        score -= Math.min(2, mixedContentPages.length);
        details.push({ check: 'Mixed Content (HTTPS→HTTP)', issueType: 'error', score: -Math.min(2, mixedContentPages.length), max: 0, status: 'fail',
            value: `${mixedContentPages.length} pages load HTTP resources on HTTPS pages`,
            aboutThisIssue: 'Loading HTTP resources on HTTPS pages triggers browser security warnings and can cause content to be blocked entirely.',
            howToFix: 'Update all resource URLs (images, scripts, stylesheets) to use HTTPS. Use protocol-relative URLs or absolute HTTPS URLs.' });
    }

    // ── Cache-Control Header (bonus, +1 pt) ──
    if (siteIntelligence.cacheControlPresent) {
        score += 1;
        details.push({ check: 'Browser Caching', score: 1, max: 1, status: 'pass', value: 'Cache-Control header present on homepage' });
    } else {
        details.push({ check: 'Browser Caching', issueType: 'notice', score: 0, max: 1, status: 'warning', value: 'No Cache-Control header detected',
            aboutThisIssue: 'Without Cache-Control headers, browsers re-download resources on every visit, increasing load times for returning users.',
            howToFix: 'Add Cache-Control headers to your server config. For static assets: `Cache-Control: public, max-age=31536000`. For HTML: `Cache-Control: public, max-age=3600`.' });
    }

    // ── Sitemap Orphans (pages in sitemap but not internally linked — Semrush critical metric) ──
    const sitemapCoverage = siteIntelligence.sitemapCoverage || {};
    if (sitemapCoverage.available && sitemapCoverage.sitemapUrlsNotCrawledCount > 0) {
        details.push({ check: 'Sitemap Orphan Pages', issueType: 'warning', score: 0, max: 0, status: 'warning',
            value: `${sitemapCoverage.sitemapUrlsNotCrawledCount} pages in sitemap but not internally linked`,
            affectedUrls: (sitemapCoverage.sitemapUrlsNotCrawled || []).slice(0, 15),
            aboutThisIssue: 'Pages listed in your sitemap but not linked from anywhere on the site are "sitemap orphans." Search engines can find them through the sitemap, but they receive zero internal link equity, making them very hard to rank.',
            howToFix: 'Add internal links to these pages from relevant content pages. If pages are no longer needed, remove them from the sitemap. Orphan pages often indicate outdated or abandoned content.' });
    }
    if (sitemapCoverage.available && sitemapCoverage.pagesNotInSitemapCount > 0) {
        details.push({ check: 'Crawled Pages Not in Sitemap', issueType: 'notice', score: 0, max: 0, status: 'warning',
            value: `${sitemapCoverage.pagesNotInSitemapCount} pages found by crawler but not in sitemap.xml`,
            affectedUrls: (sitemapCoverage.pagesNotInSitemap || []).slice(0, 15),
            aboutThisIssue: 'Pages that exist on your site but are missing from the sitemap may not be discovered or prioritized by search engines.',
            howToFix: 'Add these pages to your sitemap.xml. If they are intentionally excluded (e.g., utility pages), ensure they have appropriate meta robots directives.' });
    }

    // Lighthouse SEO score (15 pts)
    if (pageSpeed?.success && pageSpeed.scores?.seo !== undefined) {
        const seoLhScore = Math.round(pageSpeed.scores.seo * 0.15);
        score += seoLhScore;
        details.push({ check: 'Lighthouse SEO Audit', score: seoLhScore, max: 15, status: seoLhScore >= 12 ? 'pass' : seoLhScore >= 8 ? 'warning' : 'fail', value: `${pageSpeed.scores.seo}/100` });
    }

    return { score: Math.min(100, Math.max(0, score)), details };
}

/**
 * Compute On-Page Score (0-100) from per-page crawl data
 */
function computeOnPageScore(siteIntelligence, pages) {
    let score = 0;
    const details = [];
    const totalPages = pages.length || 1;

    // Title tags (20 pts) — present + correct length (30-70 chars) + unique
    const titledPages = pages.filter(p => p.title && p.title.length > 0);
    const titlesTooLong = titledPages.filter(p => p.title.length > 70);
    const titlesTooShort = titledPages.filter(p => p.title.length < 30);
    const goodTitles = titledPages.filter(p => p.title.length >= 30 && p.title.length <= 70);
    const uniqueTitles = new Set(titledPages.map(p => p.title)).size;
    const missingTitlePages = pages.filter(p => !p.title);
    const titlePresenceRatio = titledPages.length / totalPages;
    const titleScore = Math.round(
        (titlePresenceRatio * 8) + // presence (8 pts)
        ((goodTitles.length / totalPages) * 6) + // length (6 pts)
        (Math.min(1, uniqueTitles / totalPages) * 6) // uniqueness (6 pts)
    );
    score += Math.min(20, titleScore);
    // Split into sub-issues
    if (missingTitlePages.length > 0) {
        details.push({ check: 'Pages Without Title Tag', issueType: 'error', score: 0, max: 0, status: 'fail',
            value: `${missingTitlePages.length} pages`, affectedUrls: missingTitlePages.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Title tags tell search engines and users what each page is about. Pages without titles are difficult to rank and get poor click-through rates in search results.',
            howToFix: 'Add a unique, descriptive <title> tag to each page\'s <head> section. Keep titles between 30-70 characters and include your target keyword near the beginning.' });
    }
    if (titlesTooLong.length > 0) {
        details.push({ check: 'Title Tags Too Long (>70 chars)', issueType: 'warning', score: 0, max: 0, status: 'warning',
            value: `${titlesTooLong.length} pages`, affectedUrls: titlesTooLong.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Titles longer than 70 characters get truncated in search results, cutting off important information and reducing click-through rate.',
            howToFix: 'Shorten titles to under 70 characters. Put the most important keywords and brand name within the visible portion.' });
    }
    if (titlesTooShort.length > 0) {
        details.push({ check: 'Title Tags Too Short (<30 chars)', issueType: 'notice', score: 0, max: 0, status: 'warning',
            value: `${titlesTooShort.length} pages`, affectedUrls: titlesTooShort.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Very short titles (<30 chars) miss the opportunity to include relevant keywords and descriptive information that helps search engines understand page content.',
            howToFix: 'Expand titles to 30-70 characters with descriptive, keyword-rich text that accurately represents the page content.' });
    }
    // Duplicate titles
    const dupTitleCount = siteIntelligence.titleDuplicateCount || 0;
    if (dupTitleCount > 0) {
        details.push({ check: 'Duplicate Title Tags', issueType: 'warning', score: 0, max: 0, status: 'warning',
            value: `${dupTitleCount} pages share identical titles`, affectedUrls: (siteIntelligence.duplicateTitles || []).slice(0, 5).flatMap(d => d.urls.slice(0, 2)),
            aboutThisIssue: 'Duplicate title tags make it harder for search engines to distinguish between pages, causing them to compete against each other (keyword cannibalization).',
            howToFix: 'Give every page a unique title that reflects its specific content. Include the target keyword for that page and make it distinct from other pages.' });
    }

    // Meta descriptions (15 pts) — split
    const metaPages = pages.filter(p => p.metaDescription && p.metaDescription.length > 0);
    const missingMetaPages = pages.filter(p => !p.metaDescription);
    const metaTooLong = metaPages.filter(p => p.metaDescription.length > 160);
    const metaTooShort = metaPages.filter(p => p.metaDescription.length < 120);
    const goodMeta = metaPages.filter(p => p.metaDescription.length >= 120 && p.metaDescription.length <= 160);
    const metaRatio = metaPages.length / totalPages;
    const metaScore = Math.round((metaRatio * 9) + ((goodMeta.length / totalPages) * 6));
    score += Math.min(15, metaScore);
    if (missingMetaPages.length > 0) {
        details.push({ check: 'Pages Without Meta Description', issueType: 'warning', score: 0, max: 0, status: missingMetaPages.length > totalPages * 0.5 ? 'fail' : 'warning',
            value: `${missingMetaPages.length} pages`, affectedUrls: missingMetaPages.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Meta descriptions are shown as the snippet in search results. Without them, Google generates its own snippet which may not be compelling or accurate.',
            howToFix: 'Write unique meta descriptions (120-160 chars) for each page. Include a call-to-action and target keywords naturally.' });
    }
    if (metaTooLong.length > 0) {
        details.push({ check: 'Meta Description Too Long (>160 chars)', issueType: 'notice', score: 0, max: 0, status: 'warning',
            value: `${metaTooLong.length} pages`, affectedUrls: metaTooLong.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Meta descriptions over 160 characters get truncated in search results. The cut-off text may remove important selling points.',
            howToFix: 'Trim meta descriptions to 120-160 characters. Front-load the most compelling information.' });
    }
    // Duplicate meta descriptions
    const dupMetaCount = siteIntelligence.metaDuplicateCount || 0;
    if (dupMetaCount > 0) {
        details.push({ check: 'Duplicate Meta Descriptions', issueType: 'warning', score: 0, max: 0, status: 'warning',
            value: `${dupMetaCount} pages share identical meta descriptions`, affectedUrls: (siteIntelligence.duplicateMetaDescriptions || []).slice(0, 5).flatMap(d => d.urls.slice(0, 2)),
            aboutThisIssue: 'Duplicate meta descriptions indicate pages lack unique positioning, hurting click-through differentiation in search results.',
            howToFix: 'Write a unique meta description for each page that highlights what makes that specific page valuable.' });
    }

    // H1 tags (15 pts) — SPLIT into two separate issues (Semrush parity)
    const h1Pages = pages.filter(p => p.h1 && p.h1.length > 0);
    const singleH1 = pages.filter(p => p.h1 && p.h1.length === 1);
    const multipleH1Pages = pages.filter(p => (p.h1?.length || 0) > 1);
    const missingH1Pages = pages.filter(p => !p.h1?.length);
    const h1Ratio = h1Pages.length / totalPages;
    const h1Score = Math.round((h1Ratio * 10) + ((singleH1.length / totalPages) * 5));
    score += Math.min(15, h1Score);
    if (missingH1Pages.length > 0) {
        details.push({ check: 'Pages Without H1 Tag', issueType: 'warning', score: 0, max: 0, status: missingH1Pages.length > 10 ? 'fail' : 'warning',
            value: `${missingH1Pages.length} pages`, affectedUrls: missingH1Pages.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'The H1 tag is the primary heading of a page. Missing H1 means Google cannot easily determine the page\'s main topic, reducing ranking potential.',
            howToFix: 'Add a single, descriptive H1 tag to each page. It should contain your primary keyword and clearly describe the page\'s content.' });
    }
    if (multipleH1Pages.length > 0) {
        details.push({ check: 'Pages With Multiple H1 Tags', issueType: 'warning', score: 0, max: 0, status: multipleH1Pages.length > 20 ? 'fail' : 'warning',
            value: `${multipleH1Pages.length} pages`, affectedUrls: multipleH1Pages.slice(0, 10).map(p => p.url),
            aboutThisIssue: 'Multiple H1 tags on a page dilute the topical signal. Search engines may struggle to identify the primary topic when multiple H1s compete.',
            howToFix: 'Keep exactly one H1 per page. Convert extra H1 tags to H2 or H3 as appropriate. The H1 should be the main page title.' });
    }

    // Image alt tags (15 pts)
    const totalImages = siteIntelligence.totalImages || 0;
    const withoutAlt = siteIntelligence.imagesWithoutAlt || 0;
    const altRatio = totalImages > 0 ? 1 - (withoutAlt / totalImages) : 1;
    const altScore = Math.round(altRatio * 15);
    score += altScore;
    details.push({
        check: 'Image Alt Tags',
        score: altScore,
        max: 15,
        status: altScore >= 12 ? 'pass' : altScore >= 7 ? 'warning' : 'fail',
        value: totalImages > 0 ? `${totalImages - withoutAlt}/${totalImages} images have alt text` : 'No images found',
        fix: withoutAlt > 0 ? `${withoutAlt} images missing alt text. Add descriptive alt attributes for accessibility and SEO.` : undefined,
    });

    // Content length (15 pts) — >300 words on important pages
    const thinPages = (siteIntelligence.thinPages || []).length;
    const thinRatio = totalPages > 0 ? thinPages / totalPages : 0;
    const contentScore = Math.round((1 - thinRatio) * 15);
    score += contentScore;
    details.push({
        check: 'Content Depth',
        score: contentScore,
        max: 15,
        status: contentScore >= 12 ? 'pass' : contentScore >= 7 ? 'warning' : 'fail',
        value: `Avg ${siteIntelligence.avgWordCount || 0} words/page, ${thinPages} thin pages (<300 words)`,
        fix: thinPages > 0 ? `${thinPages} pages have thin content (<300 words). Expand with useful, relevant content.` : undefined,
    });

    // Internal linking (10 pts)
    const internalLinks = siteIntelligence.internalLinkCount || 0;
    const deepPages = siteIntelligence.clickDepthIssues || 0;
    const linkScore = Math.min(10, Math.round((internalLinks > 10 ? 7 : internalLinks * 0.7) + (deepPages === 0 ? 3 : Math.max(0, 3 - deepPages))));
    score += linkScore;
    details.push({
        check: 'Internal Linking',
        score: linkScore,
        max: 10,
        status: linkScore >= 7 ? 'pass' : linkScore >= 4 ? 'warning' : 'fail',
        value: `${internalLinks} internal links, ${deepPages} deep pages`,
        fix: deepPages > 0 ? `${deepPages} pages are not directly linked from homepage. Add internal links for better crawlability.` : undefined,
    });

    // Duplicate content penalty (5 pts)
    const dupes = siteIntelligence.duplicateContentCount || 0;
    const dupeScore = Math.max(0, 5 - dupes * 2);
    score += dupeScore;
    if (dupes > 0) {
        details.push({ check: 'Duplicate Content', score: dupeScore, max: 5, status: 'fail', value: `${dupes} duplicate/near-duplicate pairs`, fix: 'Consolidate duplicate pages or add canonical tags' });
    } else {
        details.push({ check: 'Duplicate Content', score: 5, max: 5, status: 'pass' });
    }

    // ── NEW: Heading Hierarchy (8 pts) ──
    const hierarchyIssues = siteIntelligence.headingIssues || {};
    const skippedCount = hierarchyIssues.skippedCount || 0;
    const multiH1Count = hierarchyIssues.multipleH1Count || 0;
    const hierarchyProblems = skippedCount + multiH1Count;
    const hierarchyScore = Math.max(0, 8 - hierarchyProblems * 2);
    score += hierarchyScore;
    if (hierarchyProblems > 0) {
        details.push({ check: 'Heading Hierarchy', score: hierarchyScore, max: 8, status: hierarchyScore <= 3 ? 'fail' : 'warning', value: `${skippedCount} pages skip heading levels, ${multiH1Count} have multiple H1s`, fix: `Fix heading hierarchy: ${skippedCount} pages skip levels (${(hierarchyIssues.skippedLevels || []).slice(0, 3).map(p => p.url).join(', ')}), ${multiH1Count} have multiple H1s (${(hierarchyIssues.multipleH1 || []).slice(0, 3).map(p => p.url).join(', ')}). Use H1→H2→H3 sequentially.` });
    } else {
        details.push({ check: 'Heading Hierarchy', score: 8, max: 8, status: 'pass', value: 'All pages have proper heading structures' });
    }

    // ── NEW: URL Length Issues (penalty, -2 max) ──
    const longUrls = siteIntelligence.urlIssues?.tooLongCount || 0;
    if (longUrls > 0) {
        const urlPenalty = Math.min(2, longUrls);
        score -= urlPenalty;
        details.push({ check: 'URL Length', score: -urlPenalty, max: 0, status: 'warning', value: `${longUrls} URLs exceed 75 characters`, fix: 'Shorten URLs — keep them under 75 characters for better readability and click-through' });
    }

    // ── NEW: Orphan Pages (penalty, -3 max) ──
    const orphanCount = siteIntelligence.orphanPages?.length || 0;
    if (orphanCount > 0) {
        const orphanPenalty = Math.min(3, orphanCount);
        score -= orphanPenalty;
        details.push({ check: 'Orphan Pages', score: -orphanPenalty, max: 0, status: 'fail', value: `${orphanCount} pages have no internal links pointing to them`, fix: 'Add internal links to orphan pages from relevant parent pages' });
    }

    // ── NEW: Title Quality issues (penalty, -2 max) ──
    const titleDupes = siteIntelligence.titleQuality?.duplicates?.length || 0;
    if (titleDupes > 0) {
        score -= Math.min(2, titleDupes);
        details.push({ check: 'Duplicate Titles', score: -Math.min(2, titleDupes), max: 0, status: 'fail', value: `${titleDupes} sets of pages share the same title tag`, fix: 'Give each page a unique, descriptive title tag' });
    }

    // ── NEW R2: Empty Anchor Text (penalty, -2 max) ──
    const emptyAnchors = siteIntelligence.emptyAnchorCount || 0;
    if (emptyAnchors > 0) {
        const anchorPenalty = Math.min(2, Math.ceil(emptyAnchors / 3));
        score -= anchorPenalty;
        details.push({ check: 'Empty Anchor Text', score: -anchorPenalty, max: 0, status: 'warning', value: `${emptyAnchors} links have empty anchor text`, fix: 'Add descriptive anchor text to all links for better accessibility and SEO' });
    }

    // ── NEW R2: Nofollow Internal Links (warning) ──
    const nofollowInternal = siteIntelligence.nofollowInternalCount || 0;
    if (nofollowInternal > 0) {
        details.push({ check: 'Nofollow Internal Links', score: 0, max: 0, status: 'warning', value: `${nofollowInternal} internal links use rel="nofollow"`, fix: 'Remove nofollow from internal links — it wastes crawl budget and blocks link equity flow' });
    }

    // ── NEW R2: Conflicting Canonicals (penalty, -2 max) ──
    const canonConflicts = siteIntelligence.conflictingCanonicals?.length || 0;
    if (canonConflicts > 0) {
        const canonPenalty = Math.min(2, canonConflicts);
        score -= canonPenalty;
        details.push({ check: 'Conflicting Canonical Tags', score: -canonPenalty, max: 0, status: 'fail', value: `${canonConflicts} pages have canonical pointing to different URL`, fix: 'Ensure canonical tags point to the correct/preferred version of each page' });
    }

    return { score: Math.min(100, Math.max(0, score)), details };
}

/**
 * Compute Content Score (0-100)
 * @param {Object} siteIntelligence - from researchDomain()
 * @param {Object} homepage - homepage crawl result with OG data
 */
function computeContentScore(siteIntelligence, homepage) {
    let score = 0;
    const details = [];

    // Content volume (35 pts) — more weight since dupes moved to on-page
    const totalWords = siteIntelligence.totalWordCount || 0;
    const avgWords = siteIntelligence.avgWordCount || 0;
    const volumeScore = Math.min(35, Math.round(
        (totalWords > 5000 ? 20 : totalWords * 0.004) +
        (avgWords > 500 ? 15 : avgWords * 0.03)
    ));
    score += volumeScore;
    details.push({ check: 'Content Volume', score: volumeScore, max: 35, status: volumeScore >= 25 ? 'pass' : volumeScore >= 14 ? 'warning' : 'fail', value: `${totalWords} total words, ${avgWords} avg/page` });

    // Structured data presence (25 pts)
    const schemaTypes = siteIntelligence.schemaTypes || [];
    const schemaScore = Math.min(25, schemaTypes.length * 6);
    score += schemaScore;
    details.push({ check: 'Structured Data Richness', score: schemaScore, max: 25, status: schemaScore >= 18 ? 'pass' : schemaScore >= 6 ? 'warning' : 'fail', value: schemaTypes.length > 0 ? schemaTypes.join(', ') : 'None' });

    // FAQ / Q&A content (15 pts)
    if (siteIntelligence.hasFAQ) {
        score += 15;
        details.push({ check: 'FAQ Content', score: 15, max: 15, status: 'pass' });
    } else {
        details.push({ check: 'FAQ Content', score: 0, max: 15, status: 'warning', fix: 'Add an FAQ section to improve AI Overview visibility and rich results' });
    }

    // OG tags / social readiness (15 pts) — use actual homepage data
    const hasOgTitle = !!(homepage?.ogTitle);
    const hasOgDesc = !!(homepage?.ogDescription);
    const hasOgImage = !!(homepage?.ogImage);
    const ogChecks = [hasOgTitle, hasOgDesc, hasOgImage].filter(Boolean).length;
    const ogScore = ogChecks * 5; // 5 pts each: title, desc, image
    score += ogScore;
    details.push({
        check: 'Open Graph Tags',
        score: ogScore,
        max: 15,
        status: ogScore >= 15 ? 'pass' : ogScore >= 5 ? 'warning' : 'fail',
        value: `OG Title: ${hasOgTitle ? '✅' : '❌'}, OG Description: ${hasOgDesc ? '✅' : '❌'}, OG Image: ${hasOgImage ? '✅' : '❌'}`,
        fix: ogScore < 15 ? 'Add Open Graph tags (og:title, og:description, og:image) for better social media sharing' : undefined,
    });

    // Thin content penalty (10 pts)
    const thinPages = siteIntelligence.thinPageCount || 0;
    const totalPages = siteIntelligence.totalPages || 1;
    const thinRatio = thinPages / totalPages;
    const thinScore = Math.round((1 - thinRatio) * 10);
    score += thinScore;
    if (thinPages > 0) {
        details.push({ check: 'Thin Content', score: thinScore, max: 10, status: thinRatio > 0.5 ? 'fail' : 'warning', value: `${thinPages}/${totalPages} pages have <300 words`, fix: 'Expand thin pages with useful, substantive content' });
    } else {
        details.push({ check: 'Thin Content', score: 10, max: 10, status: 'pass', value: 'No thin pages detected' });
    }

    // ── NEW: Language & i18n (penalty/bonus) ──
    if (!siteIntelligence.hasLangAttribute) {
        score -= 2;
        details.push({ check: 'HTML Lang Attribute', score: -2, max: 0, status: 'fail', value: 'Missing <html lang="..."> attribute', fix: 'Add lang attribute to <html> tag (e.g., <html lang="en">) — critical for accessibility and SEO' });
    }
    if (siteIntelligence.hreflangPresent) {
        score += 3;
        details.push({ check: 'Hreflang Tags', score: 3, max: 3, status: 'pass', value: `International targeting configured for ${siteIntelligence.hreflangPages?.length || 0} pages` });
    }

    // ── NEW: Resource Bloat (penalty, -3 max) ──
    const avgResources = siteIntelligence.resourceBloat?.avgTotal || 0;
    if (avgResources > 30) {
        const bloatPenalty = Math.min(3, Math.floor((avgResources - 30) / 10));
        score -= bloatPenalty;
        details.push({ check: 'Resource Bloat', score: -bloatPenalty, max: 0, status: 'warning', value: `Avg ${avgResources} external CSS/JS resources per page`, fix: 'Reduce external resources — combine CSS/JS files, remove unused scripts' });
    }

    // ── NEW R2: llms.txt (AI crawlability, bonus +2 pts) ──
    if (siteIntelligence.llmsTxt?.found) {
        score += 2;
        details.push({ check: 'AI Crawlability (llms.txt)', score: 2, max: 2, status: 'pass', value: `llms.txt found with ${siteIntelligence.llmsTxt.sections?.length || 0} sections` });
    } else {
        details.push({ check: 'AI Crawlability (llms.txt)', score: 0, max: 2, status: 'warning', value: 'No llms.txt file found', fix: 'Create a /llms.txt file to help AI models (ChatGPT, Claude, Perplexity) understand your site content' });
    }

    // ── NEW R2: Sitemap Coverage (penalty, -2 max) ──
    const coverage = siteIntelligence.sitemapCoverage;
    if (coverage?.available && coverage.pagesNotInSitemapCount > 0) {
        const sitemapPenalty = Math.min(2, Math.ceil(coverage.pagesNotInSitemapCount / 3));
        score -= sitemapPenalty;
        details.push({ check: 'Sitemap Coverage', score: -sitemapPenalty, max: 0, status: 'warning', value: `${coverage.pagesNotInSitemapCount} crawled pages missing from sitemap`, fix: 'Add all important pages to your sitemap.xml for better crawl coverage' });
    } else if (coverage?.available) {
        details.push({ check: 'Sitemap Coverage', score: 0, max: 0, status: 'pass', value: 'All crawled pages found in sitemap' });
    }

    return { score: Math.min(100, Math.max(0, score)), details };
}

/**
 * Compute Authority Score (0-100) from backlink data
 */
function computeAuthorityScore(backlinkData) {
    if (!backlinkData?.available || !backlinkData.summary) {
        return { score: 0, details: [{ check: 'Backlink Profile', score: 0, max: 100, status: 'skip', value: 'DataForSEO not configured — authority score unavailable' }] };
    }

    let score = 0;
    const details = [];
    const s = backlinkData.summary;

    // Domain rank (30 pts) — DataForSEO domain rank is 0-1000+
    const rankScore = Math.min(30, Math.round((s.domainRank || 0) * 0.05));
    score += rankScore;
    details.push({ check: 'Domain Rank', score: rankScore, max: 30, status: rankScore >= 20 ? 'pass' : rankScore >= 10 ? 'warning' : 'fail', value: `${s.domainRank || 0}` });

    // Referring domains (30 pts)
    const refDomains = s.referringDomains || 0;
    const refScore = Math.min(30, Math.round(refDomains > 500 ? 30 : refDomains > 100 ? 25 : refDomains > 50 ? 20 : refDomains > 10 ? 15 : refDomains * 1.5));
    score += refScore;
    details.push({ check: 'Referring Domains', score: refScore, max: 30, status: refScore >= 20 ? 'pass' : refScore >= 10 ? 'warning' : 'fail', value: `${refDomains}` });

    // Dofollow ratio (20 pts)
    const totalBacklinks = s.totalBacklinks || 1;
    const dofollow = s.backlinksDofollow || 0;
    const dfRatio = dofollow / totalBacklinks;
    const dfScore = Math.round(dfRatio * 20);
    score += dfScore;
    details.push({ check: 'Dofollow Ratio', score: dfScore, max: 20, status: dfRatio >= 0.6 ? 'pass' : 'warning', value: `${Math.round(dfRatio * 100)}%` });

    // Broken backlinks penalty (20 pts)
    const brokenRatio = (s.brokenBacklinks || 0) / totalBacklinks;
    const brokenScore = Math.round((1 - Math.min(1, brokenRatio * 5)) * 20);
    score += brokenScore;
    if (s.brokenBacklinks > 0) {
        details.push({ check: 'Broken Backlinks', score: brokenScore, max: 20, status: 'warning', value: `${s.brokenBacklinks} broken`, fix: 'Reclaim broken backlinks by fixing 404 pages or setting up redirects' });
    } else {
        details.push({ check: 'Broken Backlinks', score: 20, max: 20, status: 'pass' });
    }

    return { score: Math.min(100, score), details };
}


// ============================================================================
// MAIN FUNCTION — Run SEO Baseline Audit
// ============================================================================

/**
 * Run a comprehensive SEO baseline audit for a newly onboarded brand.
 * This fires in the background during brand creation — does NOT block the onboarding response.
 * 
 * @param {Object} brand - The Brand document from MongoDB
 * @returns {Object} Audit results with deterministic scores
 */
export async function runSEOBaseline(brand) {
    const website = brand.website;
    if (!website) throw new Error('Brand has no website');

    console.log(`\n🔍 SEO Baseline Audit starting for ${brand.name} (${website})...`);
    const startTime = Date.now();

    // ── Step 1: Deep site crawl + PageSpeed + Backlinks (in parallel) ──
    const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
    const [siteResearch, pageSpeed, backlinkData] = await Promise.all([
        researchDomain(website).catch(e => {
            console.warn('  ⚠️ Site crawl failed:', e.message);
            return null;
        }),
        getPageSpeed(website, 'mobile').catch(e => {
            console.warn('  ⚠️ PageSpeed failed:', e.message);
            return { success: false, error: e.message };
        }),
        isDataForSEOConfigured() ? getDomainBacklinks(domain).catch(e => {
            console.warn('  ⚠️ Backlinks failed:', e.message);
            return null;
        }) : Promise.resolve(null),
    ]);

    if (!siteResearch || !siteResearch.pages?.length) {
        console.warn('  ❌ SEO Baseline failed: site crawl returned no data');
        throw new Error('Site crawl returned no data');
    }

    const si = siteResearch.siteIntelligence;
    const pages = siteResearch.pages;
    console.log(`  📊 Crawled ${si.totalPages} pages, ${si.totalWordCount} total words`);

    // ── Step 2: Deterministic scoring ──
    const technicalResult = computeTechnicalScore(si, siteResearch.robotsTxt, siteResearch.sitemap, pageSpeed, website);
    const onPageResult = computeOnPageScore(si, pages);
    const contentResult = computeContentScore(si, siteResearch.homepage);
    const authorityResult = computeAuthorityScore(backlinkData);

    // Weighted overall score
    // If authority data unavailable, redistribute weight to other categories
    const hasAuthority = backlinkData?.available;
    const weights = hasAuthority
        ? { technical: 0.30, onPage: 0.30, content: 0.20, authority: 0.20 }
        : { technical: 0.35, onPage: 0.35, content: 0.30, authority: 0 };

    const overallScore = Math.round(
        technicalResult.score * weights.technical +
        onPageResult.score * weights.onPage +
        contentResult.score * weights.content +
        authorityResult.score * weights.authority
    );

    console.log(`  📈 Scores: Overall=${overallScore}, Technical=${technicalResult.score}, OnPage=${onPageResult.score}, Content=${contentResult.score}, Authority=${authorityResult.score}`);

    // ── Step 3: Build issues list from failed checks ──
    const allDetails = [
        ...technicalResult.details.map(d => ({ ...d, category: 'technical' })),
        ...onPageResult.details.map(d => ({ ...d, category: 'on-page' })),
        ...contentResult.details.map(d => ({ ...d, category: 'content' })),
        ...authorityResult.details.map(d => ({ ...d, category: 'authority' })),
    ];

    const issues = allDetails
        .filter(d => d.status === 'fail' || d.status === 'warning')
        .sort((a, b) => {
            const severityOrder = { fail: 0, warning: 1 };
            return (severityOrder[a.status] || 2) - (severityOrder[b.status] || 2);
        })
        .map(d => ({
            severity: d.status === 'fail' ? (d.max >= 10 ? 'critical' : 'high') : 'medium',
            category: d.category,
            title: d.check,
            description: d.value || '',
            fix: d.fix || '',
            currentScore: d.score,
            maxScore: d.max,
        }));

    // ── Step 4: Build results ──
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ✅ SEO Baseline Audit complete in ${elapsedSec}s`);

    const results = {
        overallScore,
        scores: {
            seoHealth: overallScore,
            technicalScore: technicalResult.score,
            onPageScore: onPageResult.score,
            contentScore: contentResult.score,
            authorityScore: authorityResult.score,
        },
        grading: {
            overall: getGrade(overallScore),
            technical: getGrade(technicalResult.score),
            onPage: getGrade(onPageResult.score),
            content: getGrade(contentResult.score),
            authority: hasAuthority ? getGrade(authorityResult.score) : 'N/A',
        },
        technicalDetails: technicalResult.details,
        onPageDetails: onPageResult.details,
        contentDetails: contentResult.details,
        authorityDetails: authorityResult.details,
        issues,
        issuesSummary: {
            critical: issues.filter(i => i.severity === 'critical').length,
            high: issues.filter(i => i.severity === 'high').length,
            medium: issues.filter(i => i.severity === 'medium').length,
            total: issues.length,
        },
        // ── Per-page report cards (like Semrush/Ahrefs) ──
        pageReports: pages.slice(0, 20).map(p => ({
            url: p.url,
            title: p.title || 'Untitled',
            statusCode: p.statusCode || 200,
            responseTimeMs: p.responseTimeMs || 0,
            pageSizeKB: p.pageSizeKB || 0,
            wordCount: p.wordCount || 0,
            titleLength: p.titleLength || 0,
            metaDescLength: p.metaDescLength || 0,
            hasH1: !!(p.h1?.length),
            h1Count: p.h1?.length || 0,
            imagesWithoutAlt: p.images?.withoutAlt || 0,
            headingHierarchyValid: p.headingHierarchy?.valid ?? true,
            hasSchema: p.hasSchemaOrg || false,
            hasCanonical: !!p.canonical,
            urlTooLong: p.urlTooLong || false,
            metaRobots: p.metaRobots || {},
            issues: [],
        })),
        siteStats: {
            pagesCrawled: si.totalPages,
            totalWordCount: si.totalWordCount,
            avgWordCount: si.avgWordCount,
            totalImages: si.totalImages,
            imagesWithoutAlt: si.imagesWithoutAlt,
            thinPageCount: si.thinPageCount,
            schemaTypes: si.schemaTypes,
            hasSitemap: si.hasSitemap,
            hasRobotsTxt: si.hasRobotsTxt,
            hasCanonical: si.hasCanonical,
            duplicateContentCount: si.duplicateContentCount,
            redirectChainCount: si.redirectChainCount,
            techStack: si.techStack,
            // ── NEW: Enhanced stats ──
            pageStatusDistribution: si.pageStatusDistribution || {},
            orphanPageCount: si.orphanPages?.length || 0,
            mixedContentCount: si.mixedContentCount || 0,
            responseTimeAvg: si.responseTime?.avg || 0,
            responseTimeSlowest: si.responseTime?.slowest || 0,
            slowPageCount: si.responseTime?.slowPageCount || 0,
            pageSizeAvg: si.pageSize?.avg || 0,
            pageSizeLargest: si.pageSize?.largest || 0,
            heavyPageCount: si.pageSize?.heavyPageCount || 0,
            headingSkippedCount: si.headingIssues?.skippedCount || 0,
            multipleH1Count: si.headingIssues?.multipleH1Count || 0,
            titleDuplicateCount: si.titleQuality?.duplicates?.length || 0,
            metaDescDuplicateCount: si.metaDescQuality?.duplicates?.length || 0,
            securityHeaderScore: `${si.securityScore?.score || 0}/${si.securityScore?.total || 7}`,
            securityHeaders: si.securityScore?.details || [],
            hasLangAttribute: si.hasLangAttribute || false,
            langAttribute: si.langAttribute || '',
            hreflangPresent: si.hreflangPresent || false,
            noindexPageCount: si.metaRobotsIssues?.noindexCount || 0,
            nofollowPageCount: si.metaRobotsIssues?.nofollowCount || 0,
            urlTooLongCount: si.urlIssues?.tooLongCount || 0,
            avgCssResources: si.resourceBloat?.avgCss || 0,
            avgJsResources: si.resourceBloat?.avgJs || 0,
            brokenInternalCount: si.brokenInternalCount || 0,
            brokenInternalLinks: (si.brokenInternalLinks || []).slice(0, 20),
        },
        pageSpeed: pageSpeed?.success ? {
            scores: pageSpeed.scores,
            coreWebVitals: pageSpeed.coreWebVitals,
            overallFieldAssessment: pageSpeed.overallFieldAssessment,
            failedAudits: (pageSpeed.failedAudits || []).slice(0, 10),
            strategy: pageSpeed.strategy,
            dataSource: pageSpeed.dataSource,
        } : null,
        backlinks: backlinkData?.available ? {
            totalBacklinks: backlinkData.summary?.totalBacklinks || 0,
            referringDomains: backlinkData.summary?.referringDomains || 0,
            domainRank: backlinkData.summary?.domainRank || 0,
            dofollow: backlinkData.summary?.backlinksDofollow || 0,
            brokenBacklinks: backlinkData.summary?.brokenBacklinks || 0,
            topReferringDomains: (backlinkData.topReferringDomains || []).slice(0, 5),
        } : null,
        metadata: {
            auditType: 'onboarding-baseline',
            scoringMethod: 'deterministic',
            dataSource: `crawl${pageSpeed?.success ? '+pagespeed' : ''}${backlinkData?.available ? '+dataforseo' : ''}`,
            elapsedSeconds: parseFloat(elapsedSec),
            timestamp: new Date().toISOString(),
            checksPerformed: allDetails.length,
        },
    };

    // ── Step 5: Save to SeoAudit collection ──
    try {
        await SeoAudit.create({
            user: brand.user,
            brand: brand._id,
            type: 'onboarding-baseline',
            url: website,
            scores: {
                seoHealth: overallScore,
                aiVisibility: 0, // Not computed at onboarding
                technicalScore: technicalResult.score,
                contentScore: contentResult.score,
                authorityScore: authorityResult.score,
            },
            results,
            status: 'completed',
        });
        console.log(`  💾 SEO Baseline saved to SeoAudit for ${brand.name}`);
    } catch (dbErr) {
        console.warn('  ⚠️ Could not save SEO baseline:', dbErr.message);
    }

    return results;
}


// ============================================================================
// HELPERS
// ============================================================================

function getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 60) return 'C';
    if (score >= 50) return 'D';
    return 'F';
}

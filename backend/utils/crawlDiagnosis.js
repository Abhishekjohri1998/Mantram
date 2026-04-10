/**
 * Crawl Diagnosis Utility
 * 
 * Provides specific, actionable feedback based on the failure pattern of a crawl.
 */

export function diagnoseCrawlFailure(audit) {
  const q = audit.quality;

  // All 200s but empty — almost certainly JS rendering failure
  if (q.empty200Ratio >= 0.9 && q.zeroTime200Ratio >= 0.8) {
    return {
      code: 'JS_RENDER_FAILURE',
      headline: 'Pages loaded but content was not extracted.',
      detail:
        'All crawled pages returned HTTP 200 but had 0 bytes and 0 words. ' +
        'This usually means the site content is rendered entirely by JavaScript ' +
        'and our crawler did not wait long enough for the DOM to hydrate.',
      userActions: [
        'Ensure your crawler uses a headless browser (Puppeteer/Playwright) with JS enabled.',
        'Increase the page-load wait time from 2s to 5s before extracting DOM content.',
        'Check if the site uses a framework like Next.js or React that requires SSR or pre-rendering.'
      ],
      adminActions: [
        'Verify robots.txt does not block MantramBot or Googlebot.',
        'Check if a Cloudflare or WAF challenge page is being served to the crawler.',
        'Inspect the raw HTML captured by the crawler — it may contain a login redirect or challenge page.'
      ]
    };
  }

  // Some 200s with content, but many empty — likely bot detection / rate limiting
  if (q.empty200Ratio >= 0.4) {
    return {
      code: 'PARTIAL_BLOCK',
      headline: 'Crawler was partially blocked.',
      detail:
        `${Math.round(q.empty200Ratio * 100)}% of pages returned empty content. ` +
        'This typically indicates rate limiting, IP-based blocking, or session-based access control.',
      userActions: [
        'Add your crawler IP to the site\'s allowlist if you control it.',
        'Reduce crawl concurrency (crawl 1 page every 2–3 seconds, not in parallel).',
        'Try the crawl again during off-peak hours.'
      ],
      adminActions: [
        'Check server access logs for 429 (rate limited) or 403 (forbidden) responses that may have been swallowed.',
        'Verify session cookies or auth headers are not required to access these pages.'
      ]
    };
  }

  // Zero pages returned — total failure
  if (q.totalPages === 0) {
    return {
      code: 'NO_PAGES_RETURNED',
      headline: 'The crawler returned no data.',
      detail: 'No pages were returned from the crawl. The site may be unreachable or the crawl job may have failed before starting.',
      userActions: [
        'Verify the site URL is reachable from the internet.',
        'Check if the crawl job errored before completing.'
      ],
      adminActions: [
        'Check server logs for the crawl job for crash output.',
        'Confirm network egress is allowed from the backend server to external URLs.'
      ]
    };
  }

  return {
    code: 'UNKNOWN',
    headline: 'Crawl quality was below the required threshold.',
    detail: audit.blockers.join(' '),
    userActions: ['Re-run the health check and contact support if the issue persists.'],
    adminActions: []
  };
}

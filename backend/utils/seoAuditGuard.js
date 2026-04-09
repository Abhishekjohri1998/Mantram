/**
 * SEO Audit Guard - Data Quality Validation Layer
 * 
 * This utility evaluates the quality of crawl data before it is processed by AI.
 * It prevents hallucinations by identifying empty, failed, or suspicious crawl results.
 */

const THRESHOLDS = {
  // Hard block: too many truly empty pages
  EMPTY_200_RATIO_BLOCK: 0.40,

  // Hard block: too many impossible response times (indicates crawler error)
  ZERO_TIME_RATIO_BLOCK: 0.80,

  // Partial report: warn but allow with caveats
  EMPTY_200_RATIO_WARN: 0.20,

  // Minimum meaningful word floor per page
  MEANINGFUL_WORD_COUNT: 50,

  // Minimum % of pages that must clear the word floor to allow full report
  MIN_MEANINGFUL_PAGE_RATIO: 0.50
};

/**
 * Normalizes and inspects a crawl dataset.
 * @param {Array} pages - The raw pages returned by the crawler.
 * @returns {Object} Audit result with reportMode, blockers, and warnings.
 */
export function inspectCrawlDataset(pages = []) {
  const totalPages = pages.length;
  const status200 = pages.filter(p => p.status === 200 || p.statusCode === 200);
  const okPages = status200.length;

  const empty200 = status200.filter(p => (!p.wordCount || p.wordCount === 0) && (!p.contentLength || p.contentLength === 0));
  const zeroTime200 = status200.filter(p => p.responseTime === 0 || p.loadTime === 0);

  const quality = {
    totalPages,
    okPages,
    empty200Count: empty200.length,
    zeroTime200Count: zeroTime200.length,
    empty200Ratio: okPages > 0 ? empty200.length / okPages : 0,
    zeroTime200Ratio: okPages > 0 ? zeroTime200.length / okPages : 0,
  };

  const meaningful200 = status200.filter(p => (p.wordCount || 0) >= THRESHOLDS.MEANINGFUL_WORD_COUNT);
  const meaningfulRatio = okPages > 0 ? meaningful200.length / okPages : 0;

  const blockers = [];
  const warnings = [];

  // Hard blocks
  if (totalPages === 0) {
    blockers.push('Crawler returned zero pages.');
  }
  if (okPages > 0 && quality.empty200Ratio >= THRESHOLDS.EMPTY_200_RATIO_BLOCK) {
    blockers.push(
      `${empty200.length}/${okPages} pages (${Math.round(quality.empty200Ratio * 100)}%) ` +
      `returned 200 but are completely empty. Likely a JavaScript rendering failure.`
    );
  }
  if (okPages > 0 && quality.zeroTime200Ratio >= THRESHOLDS.ZERO_TIME_RATIO_BLOCK) {
    blockers.push(
      `${zeroTime200.length}/${okPages} pages have 0ms response time — crawl data was not actually fetched.`
    );
  }

  // Soft warnings (allow partial report)
  if (okPages > 0 && quality.empty200Ratio >= THRESHOLDS.EMPTY_200_RATIO_WARN && blockers.length === 0) {
    warnings.push(
      `${empty200.length}/${okPages} pages are empty (between 20–40% threshold). ` +
      `Findings are partial and may undercount issues.`
    );
  }
  if (okPages > 0 && meaningfulRatio < THRESHOLDS.MIN_MEANINGFUL_PAGE_RATIO && blockers.length === 0) {
    warnings.push(
      `Only ${meaningful200.length}/${okPages} pages have >= ${THRESHOLDS.MEANINGFUL_WORD_COUNT} words. ` +
      `Text-based findings (thin content, word counts) are not reliable.`
    );
  }

  const reportMode =
    blockers.length > 0   ? 'INVALID' :
    warnings.length > 0   ? 'PARTIAL' :
                            'FULL';

  return {
    valid: reportMode !== 'INVALID',
    reportMode,      // 'FULL' | 'PARTIAL' | 'INVALID'
    blockers,
    warnings,
    quality: {
      ...quality,
      meaningfulPages: meaningful200.length,
      meaningfulRatio
    },
    pages
  };
}

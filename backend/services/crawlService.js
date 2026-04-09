import { researchDomain } from '../utils/web-research.js';
import { inspectCrawlDataset } from '../utils/seoAuditGuard.js';

/**
 * Crawl Strategy Definitions
 */
const RETRY_STRATEGIES = [
  {
    label: 'Default',
    userAgent: 'MantramBot/1.0 (+https://mantram.ai/bot)',
    delayMs: 0,
    renderJs: true
  },
  {
    label: 'Googlebot-mimicry',
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    delayMs: 3000,      // polite delay before retry
    renderJs: true
  },
  {
    label: 'Stealth-Safari',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    delayMs: 5000,      // extra delay for sensitivity
    renderJs: true,
    stealth: true
  }
];

/**
 * Executes a crawl with a self-healing retry mechanism.
 * 
 * @param {string} url - The base URL to crawl.
 * @param {Object} options - Additonal crawl options.
 * @returns {Object} Result containing best pages found and audit status.
 */
export async function crawlWithRetry(url, options = {}) {
  let lastAudit = null;
  let lastPages = [];

  for (let attempt = 0; attempt < RETRY_STRATEGIES.length; attempt++) {
    const strategy = RETRY_STRATEGIES[attempt];
    
    // Polite delay for retries
    if (strategy.delayMs > 0) {
      console.log(`⏳ Waiting ${strategy.delayMs}ms before ${strategy.label} retry...`);
      await new Promise(r => setTimeout(r, strategy.delayMs));
    }

    console.log(`🕷️ [SEO Crawl] Attempt ${attempt + 1}: Using ${strategy.label} strategy for ${url}`);
    
    try {
      // NOTE: web-research.js's researchDomain manages its own session, 
      // but we can pass userAgent if we modify it, or we rely on it being smart.
      // For now, we use researchDomain as is, but we can pass specialized options if needed.
      const siteResearch = await researchDomain(url, { 
        ...options,
        userAgent: strategy.userAgent,
        stealth: strategy.stealth,
        // If we want to force JS rendering to be more aggressive on 2nd attempt
        timeout: attempt === 1 ? 90000 : (options.timeout || 60000)
      });

      const pages = siteResearch.pages || [];
      const audit = inspectCrawlDataset(pages);

      lastPages = pages;
      lastAudit = audit;

      // If crawl is valid or it's the last attempt, return results
      if (audit.valid || attempt === RETRY_STRATEGIES.length - 1) {
        return {
          pages,
          siteResearch, // Return original object for structural compatibility
          audit,
          attemptsMade: attempt + 1,
          strategyUsed: strategy.label,
          success: audit.valid
        };
      }

      console.warn(
        `[SEO Crawl] Attempt ${attempt + 1} invalid (${audit.blockers.join('; ')}). ` +
        `Retrying with strategy: ${RETRY_STRATEGIES[attempt + 1]?.label}`
      );
    } catch (e) {
      console.error(`[SEO Crawl] Fatal error during attempt ${attempt + 1}: ${e.message}`);
      if (attempt === RETRY_STRATEGIES.length - 1) {
        throw e;
      }
    }
  }

  return {
    pages: lastPages,
    audit: lastAudit,
    attemptsMade: RETRY_STRATEGIES.length,
    strategyUsed: RETRY_STRATEGIES[RETRY_STRATEGIES.length - 1].label,
    success: false
  };
}

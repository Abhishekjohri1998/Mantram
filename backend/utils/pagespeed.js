import config from '../config/env.js';

const PSI_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const PSI_TIMEOUT = 30000; // 30s — PageSpeed can be slow

/**
 * Fetch real PageSpeed data for a URL.
 * @param {string} url - The page URL to test
 * @param {string} strategy - 'mobile' or 'desktop'
 * @returns {Object} Structured performance data
 */
export async function getPageSpeed(url, strategy = 'mobile') {
  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;

  let apiUrl = `${PSI_API}?url=${encodeURIComponent(normalizedUrl)}&strategy=${strategy}&category=performance&category=seo&category=accessibility&category=best-practices`;
  
  // Use API key if configured to increase daily quota
  if (config.pagespeed?.apiKey) {
    apiUrl += `&key=${config.pagespeed.apiKey}`;
  }

  try {
    console.log(`⚡ PageSpeed: testing ${normalizedUrl} (${strategy})...`);
    const resp = await fetch(apiUrl, { signal: AbortSignal.timeout(PSI_TIMEOUT) });
    const data = await resp.json();

    if (data.error) {
      const isQuota = data.error.message?.toLowerCase().includes('quota exceeded');
      console.warn(`⚡ PageSpeed error:`, data.error.message);
      return { success: false, error: data.error.message, quotaExceeded: isQuota, url: normalizedUrl, strategy };
    }

    // Extract Lighthouse scores
    const categories = data.lighthouseResult?.categories || {};
    const scores = {
      performance: Math.round((categories.performance?.score || 0) * 100),
      seo: Math.round((categories.seo?.score || 0) * 100),
      accessibility: Math.round((categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((categories['best-practices']?.score || 0) * 100),
    };

    // Extract Core Web Vitals from field data (real user data) or lab data
    const fieldData = data.loadingExperience?.metrics || {};
    const labData = data.lighthouseResult?.audits || {};

    const coreWebVitals = {
      // Field data (real users) — preferred
      lcp: extractFieldMetric(fieldData, 'LARGEST_CONTENTFUL_PAINT_MS') || extractLabMetric(labData, 'largest-contentful-paint'),
      fid: extractFieldMetric(fieldData, 'FIRST_INPUT_DELAY_MS'),
      cls: extractFieldMetric(fieldData, 'CUMULATIVE_LAYOUT_SHIFT_SCORE') || extractLabMetric(labData, 'cumulative-layout-shift'),
      inp: extractFieldMetric(fieldData, 'INTERACTION_TO_NEXT_PAINT') || extractLabMetric(labData, 'interaction-to-next-paint'),
      fcp: extractFieldMetric(fieldData, 'FIRST_CONTENTFUL_PAINT_MS') || extractLabMetric(labData, 'first-contentful-paint'),
      ttfb: extractLabMetric(labData, 'server-response-time'),
      si: extractLabMetric(labData, 'speed-index'),
      tbt: extractLabMetric(labData, 'total-blocking-time'),
    };

    // Extract key audit failures
    const audits = data.lighthouseResult?.audits || {};
    const failedAudits = [];
    const importantAudits = [
      'render-blocking-resources', 'uses-optimized-images', 'uses-text-compression',
      'uses-responsive-images', 'offscreen-images', 'unminified-css', 'unminified-javascript',
      'unused-css-rules', 'unused-javascript', 'modern-image-formats',
      'efficient-animated-content', 'duplicated-javascript', 'legacy-javascript',
      'meta-description', 'document-title', 'http-status-code', 'is-crawlable',
      'robots-txt', 'hreflang', 'canonical', 'font-display',
    ];

    for (const auditId of importantAudits) {
      const audit = audits[auditId];
      if (audit && audit.score !== null && audit.score < 1) {
        failedAudits.push({
          id: auditId,
          title: audit.title,
          description: audit.description?.substring(0, 200),
          score: Math.round((audit.score || 0) * 100),
          displayValue: audit.displayValue || '',
        });
      }
    }

    // Overall field data assessment
    const overallCategory = data.loadingExperience?.overall_category || 'NONE';

    console.log(`⚡ PageSpeed done: Performance=${scores.performance}, SEO=${scores.seo}, CWV=${overallCategory}`);

    return {
      success: true,
      url: normalizedUrl,
      strategy,
      scores,
      coreWebVitals,
      overallFieldAssessment: overallCategory, // FAST, AVERAGE, SLOW, or NONE
      failedAudits: failedAudits.slice(0, 15),
      dataSource: Object.keys(fieldData).length > 0 ? 'field+lab' : 'lab-only',
    };
  } catch (e) {
    console.warn(`⚡ PageSpeed failed:`, e.message);
    return { success: false, error: e.message, url: normalizedUrl, strategy };
  }
}

/**
 * Get both mobile & desktop scores
 */
export async function getFullPageSpeed(url) {
  const [mobile, desktop] = await Promise.all([
    getPageSpeed(url, 'mobile'),
    getPageSpeed(url, 'desktop'),
  ]);
  return { mobile, desktop };
}


// ============================================================================
// HELPERS
// ============================================================================

function extractFieldMetric(fieldData, metricName) {
  const metric = fieldData[metricName];
  if (!metric) return null;
  return {
    value: metric.percentile,
    unit: metricName.includes('SCORE') ? '' : 'ms',
    category: metric.category, // FAST, AVERAGE, SLOW
  };
}

function extractLabMetric(labData, auditId) {
  const audit = labData[auditId];
  if (!audit || audit.numericValue === undefined) return null;
  return {
    value: Math.round(audit.numericValue * 100) / 100,
    unit: audit.numericUnit || 'ms',
    displayValue: audit.displayValue || '',
  };
}


// ============================================================================
// FORMAT FOR AI PROMPT
// ============================================================================

export function formatPageSpeedForPrompt(pageSpeedData) {
  if (!pageSpeedData?.success) return 'PageSpeed data unavailable.';

  const { scores, coreWebVitals, overallFieldAssessment, failedAudits, strategy, dataSource } = pageSpeedData;

  let text = `\n=== REAL PAGESPEED DATA (${strategy}, ${dataSource}) ===\n`;
  text += `Overall Field Assessment: ${overallFieldAssessment}\n`;
  text += `Lighthouse Scores: Performance=${scores.performance}/100, SEO=${scores.seo}/100, Accessibility=${scores.accessibility}/100, Best Practices=${scores.bestPractices}/100\n`;

  text += `\nCore Web Vitals:\n`;
  if (coreWebVitals.lcp) text += `- LCP (Largest Contentful Paint): ${coreWebVitals.lcp.value}${coreWebVitals.lcp.unit}${coreWebVitals.lcp.category ? ' [' + coreWebVitals.lcp.category + ']' : ''} (Good: <2500ms)\n`;
  if (coreWebVitals.cls) text += `- CLS (Cumulative Layout Shift): ${coreWebVitals.cls.value}${coreWebVitals.cls.unit}${coreWebVitals.cls.category ? ' [' + coreWebVitals.cls.category + ']' : ''} (Good: <0.1)\n`;
  if (coreWebVitals.inp) text += `- INP (Interaction to Next Paint): ${coreWebVitals.inp.value}${coreWebVitals.inp.unit}${coreWebVitals.inp.category ? ' [' + coreWebVitals.inp.category + ']' : ''} (Good: <200ms)\n`;
  if (coreWebVitals.fcp) text += `- FCP (First Contentful Paint): ${coreWebVitals.fcp.value}${coreWebVitals.fcp.unit}${coreWebVitals.fcp.category ? ' [' + coreWebVitals.fcp.category + ']' : ''} (Good: <1800ms)\n`;
  if (coreWebVitals.tbt) text += `- TBT (Total Blocking Time): ${coreWebVitals.tbt.value}ms (Good: <200ms)\n`;
  if (coreWebVitals.si) text += `- Speed Index: ${coreWebVitals.si.displayValue || coreWebVitals.si.value}\n`;
  if (coreWebVitals.ttfb) text += `- TTFB (Time to First Byte): ${coreWebVitals.ttfb.value}ms (Good: <800ms)\n`;

  if (failedAudits.length > 0) {
    text += `\nFailed Audits (${failedAudits.length}):\n`;
    for (const a of failedAudits) {
      text += `- [${a.score}/100] ${a.title}${a.displayValue ? ': ' + a.displayValue : ''}\n`;
    }
  }

  return text;
}

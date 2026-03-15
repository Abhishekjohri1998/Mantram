/**
 * Mantram AI — Google Trends Intelligence
 * Fetches real search interest data from Google Trends.
 * Uses the unofficial Trends API (same as trends.google.com frontend).
 * FREE — no API key required.
 */

const TRENDS_TIMEOUT = 10000;

// ============================================================================
// INTEREST OVER TIME — Get relative search interest (0-100)
// ============================================================================

/**
 * Fetch Google Trends interest data for a keyword.
 * Uses the widget API endpoint that powers the Trends website.
 * @param {string} keyword - The search term
 * @param {string} geo - Country code (e.g., 'IN', 'US', '')
 * @param {string} timeRange - 'today 12-m' (1yr), 'today 3-m', 'today 1-m'
 * @returns {Object} { interest, trend, relatedQueries, risingQueries }
 */
export async function getTrendsInterest(keyword, geo = '', timeRange = 'today 12-m') {
  try {
    // Step 1: Get the explore widget tokens
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-330&req=${encodeURIComponent(JSON.stringify({
      comparisonItem: [{ keyword, geo, time: timeRange }],
      category: 0,
      property: '',
    }))}&tz=-330`;

    const exploreResp = await fetch(exploreUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://trends.google.com/',
      },
      signal: AbortSignal.timeout(TRENDS_TIMEOUT),
    });

    const exploreText = await exploreResp.text();
    
    // Check if we got HTML (rate limited or redirected)
    if (exploreText.trim().startsWith('<!DOCTYPE') || exploreText.trim().startsWith('<html')) {
        throw new Error('Google Trends returned HTML (likely rate-limited)');
    }

    // Google Trends API returns ")]}',\n" prefix — strip it
    const cleanText = exploreText.replace(/^\)\]\}',?\n/, '');
    const exploreData = JSON.parse(cleanText);

    const widgets = exploreData.widgets || [];
    const timelineWidget = widgets.find(w => w.id === 'TIMESERIES');
    const relatedWidget = widgets.find(w => w.id === 'RELATED_QUERIES');

    let interestData = null;
    let relatedData = null;

    // Step 2: Fetch interest over time
    if (timelineWidget?.token) {
      interestData = await fetchWidget(timelineWidget.token, timelineWidget.request);
    }

    // Step 3: Fetch related queries
    if (relatedWidget?.token) {
      relatedData = await fetchWidget(relatedWidget.token, relatedWidget.request);
    }

    // Parse interest data
    const timelineData = interestData?.default?.timelineData || [];
    const values = timelineData.map(p => p.value?.[0] || 0);
    const currentInterest = values.length > 0 ? values[values.length - 1] : 0;
    const avgInterest = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    const peakInterest = values.length > 0 ? Math.max(...values) : 0;
    
    // Calculate trend direction
    const recentQuarter = values.slice(-3);
    const prevQuarter = values.slice(-6, -3);
    const recentAvg = recentQuarter.length > 0 ? recentQuarter.reduce((a, b) => a + b, 0) / recentQuarter.length : 0;
    const prevAvg = prevQuarter.length > 0 ? prevQuarter.reduce((a, b) => a + b, 0) / prevQuarter.length : 0;
    
    let trend = 'stable';
    let trendPercent = 0;
    if (prevAvg > 0) {
      trendPercent = Math.round(((recentAvg - prevAvg) / prevAvg) * 100);
      if (trendPercent > 15) trend = 'rising';
      else if (trendPercent > 40) trend = 'breakout';
      else if (trendPercent < -15) trend = 'declining';
    }

    // Parse related queries
    const relatedQueries = [];
    const risingQueries = [];
    if (relatedData?.default?.rankedList) {
      const topList = relatedData.default.rankedList.find(l => l.rankedKeyword) || relatedData.default.rankedList[0];
      const risingList = relatedData.default.rankedList.find(l => l.rankedKeyword && l !== topList) || relatedData.default.rankedList[1];
      
      if (topList?.rankedKeyword) {
        for (const k of topList.rankedKeyword.slice(0, 10)) {
          relatedQueries.push({ query: k.query, value: k.value });
        }
      }
      if (risingList?.rankedKeyword) {
        for (const k of risingList.rankedKeyword.slice(0, 10)) {
          risingQueries.push({ query: k.query, value: k.formattedValue || String(k.value) });
        }
      }
    }

    return {
      success: true,
      keyword,
      geo,
      currentInterest,
      avgInterest,
      peakInterest,
      trend,
      trendPercent,
      relatedQueries,
      risingQueries,
      dataPoints: values.length,
    };
  } catch (e) {
    console.warn(`📈 Google Trends failed for "${keyword}":`, e.message);
    return { success: false, keyword, error: e.message };
  }
}


async function fetchWidget(token, request) {
  try {
    const url = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-330&req=${encodeURIComponent(JSON.stringify(request))}&token=${token}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://trends.google.com/',
      },
      signal: AbortSignal.timeout(TRENDS_TIMEOUT),
    });
    const text = await resp.text();
    const clean = text.replace(/^\)\]\}',?\n/, '');
    return JSON.parse(clean);
  } catch {
    return null;
  }
}


// ============================================================================
// BATCH TRENDS — Get trends for multiple keywords
// ============================================================================

/**
 * Get trends data for multiple keywords sequentially (rate-limited).
 * @param {string[]} keywords
 * @param {string} geo
 * @returns {Object[]} Array of trend results
 */
export async function batchTrends(keywords, geo = '') {
  const results = [];
  for (const keyword of keywords.slice(0, 10)) { // Cap at 10 to avoid rate limits
    const result = await getTrendsInterest(keyword, geo);
    results.push(result);
    // Incremented delay to avoid rate limiting
    if (keywords.indexOf(keyword) < keywords.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return results;
}


// ============================================================================
// VOLUME ESTIMATION from Trends Score
// ============================================================================

/**
 * Estimate monthly search volume from Google Trends interest score.
 * Calibrated using known benchmarks. This is directional, not exact.
 */
export function estimateVolumeFromTrends(trendsScore, inAutocomplete = false) {
  if (trendsScore >= 90) return { range: '50K-100K+', estimate: 75000, tier: 'very-high' };
  if (trendsScore >= 75) return { range: '20K-50K', estimate: 35000, tier: 'high' };
  if (trendsScore >= 55) return { range: '10K-20K', estimate: 15000, tier: 'high' };
  if (trendsScore >= 40) return { range: '5K-10K', estimate: 7500, tier: 'medium-high' };
  if (trendsScore >= 25) return { range: '2K-5K', estimate: 3500, tier: 'medium' };
  if (trendsScore >= 15) return { range: '1K-2K', estimate: 1500, tier: 'low-medium' };
  if (trendsScore >= 5 || inAutocomplete) return { range: '500-1K', estimate: 750, tier: 'low' };
  return { range: '<500', estimate: 250, tier: 'very-low' };
}


// ============================================================================
// FORMAT FOR AI PROMPT
// ============================================================================

export function formatTrendsForPrompt(trendsResults) {
  if (!trendsResults?.length) return 'No Google Trends data available.';

  const successful = trendsResults.filter(r => r.success);
  if (successful.length === 0) return 'Google Trends queries failed.';

  let text = `\n=== REAL GOOGLE TRENDS DATA ===\n`;
  for (const t of successful) {
    const vol = estimateVolumeFromTrends(t.avgInterest);
    text += `\n"${t.keyword}": Interest=${t.avgInterest}/100 (peak:${t.peakInterest}), Trend: ${t.trend} (${t.trendPercent > 0 ? '+' : ''}${t.trendPercent}%), Est. Volume: ${vol.range}/mo\n`;
    if (t.relatedQueries.length > 0) {
      text += `  Related: ${t.relatedQueries.slice(0, 5).map(q => q.query).join(', ')}\n`;
    }
    if (t.risingQueries.length > 0) {
      text += `  Rising: ${t.risingQueries.slice(0, 5).map(q => `${q.query} (${q.value})`).join(', ')}\n`;
    }
  }
  return text;
}

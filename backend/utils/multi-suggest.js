/**
 * Mantram AI — Multi-Engine Search Suggest
 * Fetches suggestions from YouTube, Amazon, and Bing.
 * All FREE — no API keys required.
 */

const SUGGEST_TIMEOUT = 8000;

// ============================================================================
// YOUTUBE SUGGEST
// ============================================================================

/**
 * Get YouTube search suggestions. YouTube is the 2nd largest search engine.
 * Great for video-intent and how-to keywords.
 */
export async function youtubeSuggest(query) {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT),
    });
    const text = await resp.text();
    // JSONP format: window.google.ac.h([...])
    const jsonMatch = text.match(/\[.*\]/s);
    if (!jsonMatch) return [];
    const data = JSON.parse(jsonMatch[0]);
    return (data[1] || []).map(item => (Array.isArray(item) ? item[0] : item)).filter(s => typeof s === 'string');
  } catch (e) {
    console.warn(`🎥 YouTube suggest failed for "${query}":`, e.message);
    return [];
  }
}


// ============================================================================
// AMAZON SUGGEST
// ============================================================================

/**
 * Get Amazon search suggestions. Critical for D2C/e-commerce brands.
 * These are pure purchase-intent keywords.
 */
export async function amazonSuggest(query, marketplace = 'ATVPDKIKX0DER') {
  // ATVPDKIKX0DER = Amazon US, A21TJRUUN4KGV = Amazon India
  try {
    const url = `https://completion.amazon.com/api/2017/suggestions?mid=${marketplace}&alias=aps&prefix=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT),
    });
    const data = await resp.json();
    return (data.suggestions || []).map(s => s.value).filter(Boolean);
  } catch (e) {
    console.warn(`🛒 Amazon suggest failed for "${query}":`, e.message);
    return [];
  }
}


// ============================================================================
// BING SUGGEST
// ============================================================================

/**
 * Get Bing search suggestions. Different search engine = different perspective.
 * Bing powers ~10% of search + Copilot queries.
 */
export async function bingSuggest(query, market = '') {
  try {
    const params = new URLSearchParams({ q: query, type: 'json' });
    if (market) params.set('mkt', market);
    const url = `https://api.bing.com/osjson.aspx?${params}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT),
    });
    const data = await resp.json();
    // Bing returns [query, [suggestions]]
    return (data[1] || []).filter(s => typeof s === 'string');
  } catch (e) {
    console.warn(`🔷 Bing suggest failed for "${query}":`, e.message);
    return [];
  }
}


// ============================================================================
// COLLECT ALL SUGGESTIONS — Query all engines at once
// ============================================================================

/**
 * Get suggestions from all engines for a seed query.
 * Returns categorized results by platform + intent.
 */
export async function multiSuggest(query, options = {}) {
  const { country = '', includeAmazon = true } = options;
  const amazonMarketplace = country?.toLowerCase() === 'in' ? 'A21TJRUUN4KGV' : 'ATVPDKIKX0DER';
  const bingMarket = country ? `${country.toLowerCase()}-${country.toUpperCase()}` : '';

  const promises = [
    youtubeSuggest(query).then(r => ({ platform: 'youtube', intent: 'video/how-to', suggestions: r })),
    bingSuggest(query, bingMarket).then(r => ({ platform: 'bing', intent: 'general', suggestions: r })),
  ];

  if (includeAmazon) {
    promises.push(
      amazonSuggest(query, amazonMarketplace).then(r => ({ platform: 'amazon', intent: 'purchase', suggestions: r }))
    );
  }

  const results = await Promise.all(promises);

  // Deduplicate across all platforms
  const allSuggestions = new Set();
  const byPlatform = {};

  for (const r of results) {
    byPlatform[r.platform] = { suggestions: r.suggestions, intent: r.intent };
    for (const s of r.suggestions) allSuggestions.add(s);
  }

  return {
    query,
    byPlatform,
    allSuggestions: [...allSuggestions],
    totalUnique: allSuggestions.size,
  };
}


// ============================================================================
// BATCH MULTI-SUGGEST — Multiple seeds
// ============================================================================

export async function batchMultiSuggest(seeds, options = {}) {
  const results = {};
  for (let i = 0; i < seeds.length && i < 8; i++) {
    results[seeds[i]] = await multiSuggest(seeds[i], options);
    if (i < seeds.length - 1) await new Promise(r => setTimeout(r, 300));
  }
  return results;
}


// ============================================================================
// FORMAT FOR AI PROMPT
// ============================================================================

export function formatMultiSuggestForPrompt(multiResults) {
  if (!multiResults || Object.keys(multiResults).length === 0) return '';

  let text = `\n=== MULTI-ENGINE SEARCH SUGGESTIONS (YouTube, Amazon, Bing) ===\n`;
  let totalUnique = 0;

  for (const [seed, data] of Object.entries(multiResults)) {
    if (!data.totalUnique) continue;
    totalUnique += data.totalUnique;
    text += `\n"${seed}" → ${data.totalUnique} unique suggestions:\n`;

    for (const [platform, info] of Object.entries(data.byPlatform)) {
      if (info.suggestions.length > 0) {
        const icon = platform === 'youtube' ? '🎥' : platform === 'amazon' ? '🛒' : '🔷';
        text += `  ${icon} ${platform} (${info.intent}): ${info.suggestions.slice(0, 5).join(', ')}\n`;
      }
    }
  }

  text += `\nTotal unique suggestions: ${totalUnique}\n`;
  return text;
}

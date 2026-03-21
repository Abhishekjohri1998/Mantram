/**
 * Mantram AI — Google Autocomplete / People Also Ask
 * Fetches real search suggestions from Google Suggest API.
 * FREE — no API key required.
 */

const SUGGEST_TIMEOUT = 8000;

/**
 * Get Google Autocomplete suggestions for a query.
 * @param {string} query - Search query seed
 * @param {string} country - Country code (e.g., 'in', 'us')
 * @param {string} lang - Language code (e.g., 'en', 'hi')
 * @returns {string[]} Array of suggestion strings
 */
export async function getAutocompleteSuggestions(query, country = '', lang = 'en') {
  try {
    const params = new URLSearchParams({
      q: query,
      client: 'firefox', // Returns clean JSON
      hl: lang,
    });
    if (country) params.set('gl', country);

    const url = `https://suggestqueries.google.com/complete/search?${params}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT),
    });
    if (!resp.ok) {
      throw new Error(`Google API rate limit or bad request (${resp.status})`);
    }
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Google returned non-JSON response');
    }
    // Response format: [query, [suggestions...]]
    return (data[1] || []).filter(s => typeof s === 'string');
  } catch (e) {
    // Only log if it's not an HTML parsing error, these are normally just rate limits or bad queries
    console.warn(`Autocomplete fail for "${query.substring(0, 30)}...":`, e.message);
    return [];
  }
}


/**
 * Get suggestions for multiple seed queries in parallel.
 * @param {string[]} seeds - Array of seed queries
 * @param {string} country - Country code
 * @param {string} lang - Language code  
 * @returns {Object} Map of seed → suggestions
 */
export async function batchAutocompleteSuggestions(seeds, country = '', lang = 'en') {
  const results = {};
  // Process in batches of 5 to avoid rate limiting
  for (let i = 0; i < seeds.length; i += 5) {
    const batch = seeds.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async seed => {
        const suggestions = await getAutocompleteSuggestions(seed, country, lang);
        return { seed, suggestions };
      })
    );
    for (const { seed, suggestions } of batchResults) {
      results[seed] = suggestions;
    }
    // Small delay between batches
    if (i + 5 < seeds.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}


/**
 * Generate seed queries from brand context for prompt mining.
 * Creates a comprehensive list of queries people might search for.
 */
export function generateSeedQueries(brandName, industry, targetAudience, country) {
  const seeds = [];

  // Brand-specific
  if (brandName) {
    seeds.push(brandName);
    seeds.push(`${brandName} review`);
    seeds.push(`${brandName} vs`);
    seeds.push(`${brandName} alternative`);
  }

  // Industry queries
  if (industry) {
    seeds.push(`best ${industry}`);
    seeds.push(`${industry} tools`);
    seeds.push(`${industry} software`);
    seeds.push(`${industry} for small business`);
    seeds.push(`${industry} tips`);
    seeds.push(`how to ${industry}`);
    seeds.push(`${industry} strategy`);
    seeds.push(`${industry} trends 2026`);
    seeds.push(`${industry} agency`);
    seeds.push(`${industry} platform`);
  }

  // Audience-specific
  if (targetAudience && industry && targetAudience.length < 50) {
    seeds.push(`${industry} for ${targetAudience}`);
  }

  // Country-specific
  if (country && industry) {
    seeds.push(`best ${industry} in ${country}`);
  }

  // Sanitize and filter
  return seeds
    .filter(Boolean)
    .map(s => s.trim().substring(0, 80)) // Max 80 chars per seed query
    .slice(0, 20); // Cap at 20 seeds
}


/**
 * Run full autocomplete mining and return formatted results.
 */
export async function mineAutocomplete(brandName, industry, targetAudience, country, lang = 'en') {
  console.log(`🔎 Autocomplete mining: brand="${brandName}", industry="${industry}"...`);

  const seeds = generateSeedQueries(brandName, industry, targetAudience, country);
  const countryCode = mapCountryToCode(country);
  const suggestions = await batchAutocompleteSuggestions(seeds, countryCode, lang);

  // Flatten and deduplicate
  const allSuggestions = new Set();
  const categorized = {};

  for (const [seed, suggs] of Object.entries(suggestions)) {
    categorized[seed] = suggs;
    for (const s of suggs) {
      allSuggestions.add(s);
    }
  }

  console.log(`🔎 Autocomplete: ${seeds.length} seeds → ${allSuggestions.size} unique suggestions`);

  return {
    seeds,
    categorized,
    allSuggestions: [...allSuggestions],
    totalSeeds: seeds.length,
    totalSuggestions: allSuggestions.size,
  };
}


/**
 * Format autocomplete data for AI prompt.
 */
export function formatAutocompleteForPrompt(autocompleteData) {
  if (!autocompleteData || autocompleteData.totalSuggestions === 0) {
    return 'No autocomplete data available.';
  }

  let text = `\n=== REAL GOOGLE AUTOCOMPLETE DATA (${autocompleteData.totalSuggestions} suggestions from ${autocompleteData.totalSeeds} seeds) ===\n`;
  text += `These are REAL queries that Google users are actively searching for:\n\n`;

  for (const [seed, suggs] of Object.entries(autocompleteData.categorized)) {
    if (suggs.length === 0) continue;
    text += `"${seed}" → ${suggs.slice(0, 8).join(' | ')}\n`;
  }

  return text;
}


// ============================================================================
// HELPERS
// ============================================================================

function mapCountryToCode(country) {
  if (!country) return '';
  const map = {
    'india': 'in', 'united states': 'us', 'usa': 'us', 'uk': 'gb', 'united kingdom': 'gb',
    'canada': 'ca', 'australia': 'au', 'germany': 'de', 'france': 'fr', 'japan': 'jp',
    'brazil': 'br', 'spain': 'es', 'italy': 'it', 'mexico': 'mx', 'singapore': 'sg',
    'uae': 'ae', 'south africa': 'za', 'nigeria': 'ng', 'indonesia': 'id',
  };
  return map[country.toLowerCase()] || country.substring(0, 2).toLowerCase();
}

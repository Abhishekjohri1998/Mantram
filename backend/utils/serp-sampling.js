/**
 * Mantram AI — SERP Sampling
 * Scrapes Google Search Results to analyze keyword difficulty,
 * SERP features, and competition signals.
 * FREE — no API key required.
 */

const SERP_TIMEOUT = 10000;
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];


// ============================================================================
// SERP FETCH — Get Google search results page
// ============================================================================

/**
 * Fetch Google SERP for a keyword and extract signals.
 * @param {string} keyword
 * @param {string} country - Country (e.g., 'IN', 'US')
 * @param {string} lang - Language (e.g., 'en', 'hi')
 * @returns {Object} SERP analysis
 */
export async function sampleSERP(keyword, country = '', lang = 'en') {
  try {
    const params = new URLSearchParams({
      q: keyword,
      hl: lang,
      num: '10',
    });
    if (country) params.set('gl', country.toLowerCase());

    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const url = `https://www.google.com/search?${params}`;

    const resp = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${lang},en-US;q=0.9,en;q=0.8`,
      },
      signal: AbortSignal.timeout(SERP_TIMEOUT),
      redirect: 'follow',
    });

    if (!resp.ok) {
      return { success: false, keyword, error: `HTTP ${resp.status}` };
    }

    const html = await resp.text();
    return parseSERP(html, keyword);
  } catch (e) {
    console.warn(`🌐 SERP sampling failed for "${keyword}":`, e.message);
    return { success: false, keyword, error: e.message };
  }
}


// ============================================================================
// SERP PARSER — Extract signals from result HTML
// ============================================================================

function parseSERP(html, keyword) {
  const result = {
    success: true,
    keyword,
    organicResults: [],
    peopleAlsoAsk: [],
    serpFeatures: [],
    totalResults: 0,
    difficultySignals: {},
  };

  // 1. Total results count
  const totalMatch = html.match(/About\s+([\d,]+)\s+results/i) || html.match(/(\d[\d,]+)\s+results/i);
  result.totalResults = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0;

  // 2. Organic results — extract titles and domains
  // Google uses various div structures, try multiple patterns
  const titlePatterns = [
    /<h3[^>]*class="[^"]*"[^>]*>([^<]+)<\/h3>/gi,
    /<h3[^>]*>([^<]+)<\/h3>/gi,
  ];

  const domains = new Set();
  for (const pattern of titlePatterns) {
    let m;
    while ((m = pattern.exec(html)) !== null) {
      const title = m[1].trim();
      if (title && title.length > 5 && !title.includes('People also ask')) {
        result.organicResults.push({ title });
      }
    }
    if (result.organicResults.length >= 3) break;
  }

  // Extract domains from result URLs
  const urlPattern = /href="\/url\?q=(https?:\/\/[^"&]+)/gi;
  const urlPattern2 = /data-href="(https?:\/\/[^"]+)"/gi;
  const citePattern = /<cite[^>]*>([^<]+)<\/cite>/gi;

  let m;
  while ((m = citePattern.exec(html)) !== null) {
    try {
      let domain = m[1].replace(/<[^>]+>/g, '').trim();
      if (domain.includes('://')) {
        domain = new URL(domain).hostname;
      } else if (domain.includes(' ›')) {
        domain = domain.split(' ›')[0].trim();
      }
      domain = domain.replace(/^www\./, '');
      if (domain && domain.includes('.')) domains.add(domain);
    } catch { }
  }

  result.topDomains = [...domains].slice(0, 10);

  // 3. People Also Ask
  const paaPattern = /data-q="([^"]+)"/gi;
  while ((m = paaPattern.exec(html)) !== null) {
    const question = m[1].trim();
    if (question && question.length > 10) {
      result.peopleAlsoAsk.push(question);
    }
  }

  // Alternative PAA extraction
  if (result.peopleAlsoAsk.length === 0) {
    const paaAlt = /<div[^>]*class="[^"]*related-question[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
    while ((m = paaAlt.exec(html)) !== null) {
      result.peopleAlsoAsk.push(m[1].trim());
    }
  }

  // Simpler PAA: look for question-like strings near "People also ask"
  if (result.peopleAlsoAsk.length === 0) {
    const paaSection = html.match(/People also ask[\s\S]{0,3000}/i);
    if (paaSection) {
      const questionPattern = /([A-Z][^.?]*\?)/g;
      let qm;
      while ((qm = questionPattern.exec(paaSection[0])) !== null) {
        if (qm[1].length > 15 && qm[1].length < 150) {
          result.peopleAlsoAsk.push(qm[1].trim());
        }
      }
    }
  }

  result.peopleAlsoAsk = [...new Set(result.peopleAlsoAsk)].slice(0, 8);

  // 4. SERP Features detection
  if (html.includes('featured_snippet') || html.includes('Featured snippet') || html.includes('data-attrid="wa:')) {
    result.serpFeatures.push('featured-snippet');
  }
  if (html.includes('People also ask') || html.includes('related-question')) {
    result.serpFeatures.push('people-also-ask');
  }
  if (html.includes('knowledge-panel') || html.includes('kp-header') || html.includes('data-attrid')) {
    result.serpFeatures.push('knowledge-panel');
  }
  if (html.includes('shopping-results') || html.includes('commercial-unit')) {
    result.serpFeatures.push('shopping-ads');
  }
  if (html.includes('video-result') || html.includes('youtube.com/watch')) {
    result.serpFeatures.push('video-results');
  }
  if (html.includes('local-results') || html.includes('local-pack')) {
    result.serpFeatures.push('local-pack');
  }
  if (html.includes('/images?') || html.includes('image-results')) {
    result.serpFeatures.push('image-pack');
  }
  if (html.includes('AI Overview') || html.includes('ai-overview')) {
    result.serpFeatures.push('ai-overview');
  }

  // 5. Difficulty signals
  const knownAuthoritySites = [
    'wikipedia.org', 'amazon.com', 'youtube.com', 'linkedin.com', 'facebook.com',
    'twitter.com', 'instagram.com', 'reddit.com', 'quora.com', 'medium.com',
    'forbes.com', 'hubspot.com', 'neilpatel.com', 'semrush.com', 'ahrefs.com',
    'moz.com', 'searchenginejournal.com', 'backlinko.com', 'shopify.com',
    'googleapis.com', 'microsoft.com', 'apple.com', 'github.com',
  ];

  const authoritySiteCount = result.topDomains.filter(d =>
    knownAuthoritySites.some(auth => d.includes(auth))
  ).length;

  const hasForumsOrUGC = result.topDomains.some(d =>
    d.includes('reddit.com') || d.includes('quora.com') || d.includes('medium.com') || d.includes('wordpress.com')
  );

  // Difficulty estimation
  let difficultyScore;
  if (authoritySiteCount >= 7) difficultyScore = 90;
  else if (authoritySiteCount >= 5) difficultyScore = 75;
  else if (authoritySiteCount >= 3) difficultyScore = 60;
  else if (authoritySiteCount >= 1) difficultyScore = 40;
  else difficultyScore = 25;

  // If forums/UGC rank, difficulty is lower (easier to compete)
  if (hasForumsOrUGC && difficultyScore > 30) difficultyScore -= 15;

  // Featured snippet = opportunity (if you can claim it)
  if (result.serpFeatures.includes('featured-snippet')) difficultyScore -= 5;

  result.difficultySignals = {
    score: Math.max(5, Math.min(95, difficultyScore)),
    level: difficultyScore >= 70 ? 'hard' : difficultyScore >= 40 ? 'medium' : 'easy',
    authoritySiteCount,
    hasForumsOrUGC,
    topDomainCount: result.topDomains.length,
    featuresPresent: result.serpFeatures.length,
  };

  return result;
}


// ============================================================================
// BATCH SERP — Sample multiple keywords
// ============================================================================

/**
 * Sample SERPs for multiple keywords with delays to avoid rate limiting.
 */
export async function batchSERPSample(keywords, country = '', lang = 'en') {
  const results = [];
  for (const keyword of keywords.slice(0, 5)) { // Cap at 5 to be respectful
    const result = await sampleSERP(keyword, country, lang);
    results.push(result);
    // Delay between requests to avoid rate limiting
    if (keywords.indexOf(keyword) < keywords.length - 1) {
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }
  }
  return results;
}


// ============================================================================
// FORMAT FOR AI PROMPT
// ============================================================================

export function formatSERPForPrompt(serpResults) {
  if (!serpResults?.length) return 'No SERP sampling data available.';

  const successful = serpResults.filter(r => r.success);
  if (successful.length === 0) return 'SERP sampling failed (Google may have rate-limited requests).';

  let text = `\n=== REAL GOOGLE SERP DATA (live search results) ===\n`;
  for (const s of successful) {
    text += `\n"${s.keyword}":\n`;
    text += `  Total results: ${s.totalResults ? s.totalResults.toLocaleString() : 'N/A'}\n`;
    text += `  Difficulty: ${s.difficultySignals.score}/100 (${s.difficultySignals.level})\n`;
    text += `  Top domains: ${s.topDomains.slice(0, 6).join(', ') || 'Could not extract'}\n`;
    text += `  Authority sites in top 10: ${s.difficultySignals.authoritySiteCount}\n`;
    text += `  SERP features: ${s.serpFeatures.join(', ') || 'standard'}\n`;
    if (s.peopleAlsoAsk.length > 0) {
      text += `  People Also Ask: ${s.peopleAlsoAsk.slice(0, 4).join(' | ')}\n`;
    }
  }
  return text;
}

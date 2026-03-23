/**
 * Mantram AI — People Also Ask (PAA) Scraper
 * 
 * Extracts Google's "People Also Ask" questions for given queries.
 * Uses Google's public search to discover PAA boxes, which are
 * critical for understanding user intent and content planning.
 * 
 * This is how Semrush/Ahrefs discover question-based keywords —
 * we're replicating the same technique.
 */

const PAA_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Fetch Google search results page and extract PAA questions
 * @param {string} query - The search query
 * @param {string} [gl='in'] - Geographic location (e.g., 'in', 'us', 'ae')
 * @param {string} [hl='en'] - Language (e.g., 'en', 'hi', 'ar')
 * @returns {Promise<{questions: string[], relatedSearches: string[], query: string}>}
 */
async function fetchPAAForQuery(query, gl = 'in', hl = 'en') {
    const encoded = encodeURIComponent(query);
    const url = `https://www.google.com/search?q=${encoded}&gl=${gl}&hl=${hl}&num=10`;

    try {
        const controller = new AbortController();
        if (typeof controller.signal.setMaxListeners === 'function') {
            controller.signal.setMaxListeners(30);
        }
        const timer = setTimeout(() => controller.abort(), 10000);
        
        const resp = await fetch(url, {
            headers: {
                'User-Agent': PAA_USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': `${hl},en;q=0.9`,
            },
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (!resp.ok) return { questions: [], relatedSearches: [], query, error: `HTTP ${resp.status}` };
        const html = await resp.text();

        // Extract PAA questions
        // PAA questions appear in various patterns — we try multiple
        const questions = new Set();

        // Pattern 1: data-q attribute (most reliable)
        const dataQPattern = /data-q="([^"]+)"/gi;
        let m;
        while ((m = dataQPattern.exec(html)) !== null) {
            const q = decodeEntities(m[1]).trim();
            if (q.length > 10 && q.length < 200) questions.add(q);
        }

        // Pattern 2: aria-label on PAA accordions
        const ariaPattern = /aria-label="([^"]*\?[^"]*)"/gi;
        while ((m = ariaPattern.exec(html)) !== null) {
            const q = decodeEntities(m[1]).trim();
            if (q.length > 10 && q.length < 200 && !q.includes('Search') && !q.includes('navigation')) {
                questions.add(q);
            }
        }

        // Pattern 3: Look for question-like headings near "People also ask"
        const paaSection = html.match(/People also ask[\s\S]{0,5000}/i)?.[0] || '';
        if (paaSection) {
            // Questions within spans/divs near PAA section
            const spanPattern = />([^<]*\?)\s*</g;
            while ((m = spanPattern.exec(paaSection)) !== null) {
                const q = decodeEntities(m[1]).trim();
                if (q.length > 15 && q.length < 200 && !q.includes('function') && !q.includes('var ')) {
                    questions.add(q);
                }
            }
        }

        // Extract "Related searches" (bottom of Google results)
        const relatedSearches = new Set();
        // Related searches are typically in specific link patterns
        const relatedPattern = /\/search\?[^"]*q=([^&"]+)[^"]*"[^>]*>([^<]+)</gi;
        while ((m = relatedPattern.exec(html)) !== null) {
            const text = decodeEntities(m[2]).trim();
            if (text.length > 3 && text.length < 100 && text !== query && !text.includes('...')) {
                relatedSearches.add(text);
            }
        }

        return {
            query,
            questions: [...questions].slice(0, 10),
            relatedSearches: [...relatedSearches].slice(0, 8),
        };
    } catch (e) {
        return { query, questions: [], relatedSearches: [], error: e.message };
    }
}

function decodeEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
}

/**
 * Batch PAA extraction — queries multiple terms with rate limiting
 * @param {string[]} queries - Array of search queries
 * @param {string} [gl='in'] - Geographic location
 * @param {string} [hl='en'] - Language
 * @returns {Promise<{results: Object[], allQuestions: string[], allRelated: string[]}>}
 */
export async function batchPAA(queries, gl = 'in', hl = 'en') {
    const results = [];
    const allQuestions = new Set();
    const allRelated = new Set();

    // Process sequentially with delays to avoid rate limiting
    for (let i = 0; i < queries.length && i < 5; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000)); // 1.5-2.5s delay
        
        const result = await fetchPAAForQuery(queries[i], gl, hl);
        results.push(result);
        
        for (const q of result.questions) allQuestions.add(q);
        for (const r of result.relatedSearches) allRelated.add(r);
    }

    return {
        results,
        allQuestions: [...allQuestions],
        allRelated: [...allRelated],
        totalQueries: queries.length,
        processedQueries: results.length,
    };
}

/**
 * Format PAA data for inclusion in AI prompts
 */
export function formatPAAForPrompt(paaData) {
    if (!paaData || !paaData.allQuestions?.length) return '';

    let text = '\n=== PEOPLE ALSO ASK (from Google) ===\n';
    text += `Queries analyzed: ${paaData.processedQueries}\n`;
    
    if (paaData.allQuestions.length > 0) {
        text += `\nQuestions people are asking:\n`;
        for (const q of paaData.allQuestions.slice(0, 15)) {
            text += `  - "${q}"\n`;
        }
    }

    if (paaData.allRelated?.length > 0) {
        text += `\nRelated searches:\n`;
        for (const r of paaData.allRelated.slice(0, 10)) {
            text += `  - "${r}"\n`;
        }
    }

    return text;
}

/**
 * Knowledge Duplicate Detector
 * Multi-signal analysis to detect duplicate or conflicting knowledge entries.
 * 
 * Detection signals:
 *  1. Exact URL match (same URL scraped again)
 *  2. Exact filename match (same file uploaded again)
 *  3. Title similarity (fuzzy matching via normalized Levenshtein-like distance)
 *  4. Content similarity (Jaccard similarity on word shingles)
 *  5. Key entity overlap (product names, numbers, proper nouns)
 * 
 * Warning levels:
 *  - EXACT_DUPLICATE:    Content is >90% similar → almost certainly the same data
 *  - CONFLICTING_DATA:   Title/entities match but content differs significantly → may have conflicting info
 *  - SAME_SOURCE:        Same URL or filename → source re-uploaded
 *  - SIMILAR_CONTENT:    Content is 50-90% similar → significant overlap
 */

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

function normalize(text) {
    return (text || '')
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractWords(text) {
    return normalize(text).split(' ').filter(w => w.length > 2);
}

// ============================================================================
// SIMILARITY METRICS
// ============================================================================

/**
 * Jaccard similarity on word sets — fast, good for detecting content overlap.
 * Returns value between 0 (no overlap) and 1 (identical).
 */
function jaccardSimilarity(wordsA, wordsB) {
    if (!wordsA.length || !wordsB.length) return 0;
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = new Set([...setA].filter(w => setB.has(w)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
}

/**
 * Shingle-based similarity — uses word n-grams for more accurate comparison.
 * Better at catching reordered content vs simple word overlap.
 */
function shingleSimilarity(textA, textB, n = 3) {
    const wordsA = extractWords(textA);
    const wordsB = extractWords(textB);
    if (wordsA.length < n || wordsB.length < n) return jaccardSimilarity(wordsA, wordsB);

    const shinglesA = new Set();
    const shinglesB = new Set();
    for (let i = 0; i <= wordsA.length - n; i++) shinglesA.add(wordsA.slice(i, i + n).join(' '));
    for (let i = 0; i <= wordsB.length - n; i++) shinglesB.add(wordsB.slice(i, i + n).join(' '));

    const intersection = new Set([...shinglesA].filter(s => shinglesB.has(s)));
    const union = new Set([...shinglesA, ...shinglesB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

/**
 * Fuzzy title similarity — normalized comparison that handles typos, order variance.
 */
function titleSimilarity(titleA, titleB) {
    const a = normalize(titleA);
    const b = normalize(titleB);
    if (!a || !b) return 0;
    if (a === b) return 1;

    // Check if one contains the other
    if (a.includes(b) || b.includes(a)) return 0.85;

    // Word overlap for titles
    const wordsA = a.split(' ').filter(w => w.length > 1);
    const wordsB = b.split(' ').filter(w => w.length > 1);
    return jaccardSimilarity(wordsA, wordsB);
}

/**
 * Extract key entities — product names, model numbers, proper nouns.
 * These are the high-signal identifiers within content.
 */
function extractEntities(text) {
    const normalized = (text || '').trim();
    const entities = new Set();

    // Model numbers / product codes (e.g., "mbuds 202", "XPS 15", "iPhone 14 Pro")
    const modelPattern = /\b([A-Za-z]+[\s-]*\d{2,}[\w]*(?:\s+[A-Za-z]+)?)\b/g;
    let m;
    while ((m = modelPattern.exec(normalized)) !== null) {
        entities.add(normalize(m[1]));
    }

    // Quoted product names
    const quotedPattern = /["']([^"']{3,50})["']/g;
    while ((m = quotedPattern.exec(normalized)) !== null) {
        entities.add(normalize(m[1]));
    }

    // Capitalized multi-word names (likely proper nouns / brand/product names)
    const properNouns = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
    while ((m = properNouns.exec(text || '')) !== null) {
        entities.add(normalize(m[1]));
    }

    return [...entities];
}

/**
 * Entity overlap score — how many key entities are shared between two texts.
 */
function entityOverlap(entitiesA, entitiesB) {
    if (!entitiesA.length || !entitiesB.length) return { score: 0, shared: [] };
    const setB = new Set(entitiesB);
    const shared = entitiesA.filter(e => setB.has(e));
    const score = shared.length / Math.min(entitiesA.length, entitiesB.length);
    return { score: Math.min(score, 1), shared };
}

// ============================================================================
// MAIN DETECTION
// ============================================================================

/**
 * Detect duplicates for incoming knowledge against existing entries.
 * 
 * @param {Object} incoming — { title, content, sourceUrl, fileName, sourceType }
 * @param {Array}  existingEntries — array of existing knowledge entries
 * @returns {Array} warnings — array of { level, message, existingEntry, matchDetails }
 */
export function detectDuplicates(incoming, existingEntries) {
    if (!existingEntries?.length) return [];

    const warnings = [];
    const incomingWords = extractWords(incoming.content);
    const incomingEntities = extractEntities(incoming.content);

    for (const existing of existingEntries) {
        const matchDetails = {};
        let highestLevel = null;

        // ── Signal 1: Same URL (exact match) ──
        if (incoming.sourceUrl && existing.sourceUrl) {
            const normUrlA = incoming.sourceUrl.replace(/\/+$/, '').toLowerCase();
            const normUrlB = existing.sourceUrl.replace(/\/+$/, '').toLowerCase();
            if (normUrlA === normUrlB) {
                matchDetails.sameUrl = true;
                highestLevel = 'SAME_SOURCE';
            }
        }

        // ── Signal 2: Same filename ──
        if (incoming.fileName && existing.fileName) {
            if (incoming.fileName.toLowerCase() === existing.fileName.toLowerCase()) {
                matchDetails.sameFile = true;
                highestLevel = 'SAME_SOURCE';
            }
        }

        // ── Signal 3: Title similarity ──
        const titleSim = titleSimilarity(incoming.title, existing.title);
        matchDetails.titleSimilarity = Math.round(titleSim * 100);
        const titlesMatch = titleSim >= 0.6;

        // ── Signal 4: Content similarity ──
        const contentSim = shingleSimilarity(incoming.content, existing.content);
        matchDetails.contentSimilarity = Math.round(contentSim * 100);

        // ── Signal 5: Entity overlap ──
        const existingEntities = extractEntities(existing.content);
        const entityResult = entityOverlap(incomingEntities, existingEntities);
        matchDetails.entityOverlap = Math.round(entityResult.score * 100);
        matchDetails.sharedEntities = entityResult.shared.slice(0, 5);

        // ── Classification Logic ──

        // Case A: HIGH content similarity → EXACT_DUPLICATE
        if (contentSim >= 0.90) {
            highestLevel = 'EXACT_DUPLICATE';
        }

        // Case B: Titles match OR entities overlap significantly, but content DIFFERS
        //         → CONFLICTING_DATA (most dangerous — e.g., same product, different specs)
        else if ((titlesMatch || entityResult.score >= 0.5) && contentSim >= 0.15 && contentSim < 0.90) {
            highestLevel = highestLevel || 'CONFLICTING_DATA';
        }

        // Case C: Moderate content overlap → SIMILAR_CONTENT
        else if (contentSim >= 0.50) {
            highestLevel = highestLevel || 'SIMILAR_CONTENT';
        }

        // Case D: Same source re-uploaded (already caught above)
        // Stays as SAME_SOURCE if no stronger signal detected

        // Only report if we found something
        if (highestLevel) {
            const levelMessages = {
                EXACT_DUPLICATE: `Nearly identical content already exists: "${existing.title}" — ${matchDetails.contentSimilarity}% match.`,
                CONFLICTING_DATA: `Entry "${existing.title}" covers similar topics but with different data${matchDetails.sharedEntities.length ? ` (shared: ${matchDetails.sharedEntities.join(', ')})` : ''}. Adding both may cause conflicting information.`,
                SAME_SOURCE: `This ${matchDetails.sameUrl ? 'URL' : 'file'} was already ingested as "${existing.title}".`,
                SIMILAR_CONTENT: `Significant overlap with "${existing.title}" — ${matchDetails.contentSimilarity}% similar content.`,
            };

            warnings.push({
                level: highestLevel,
                message: levelMessages[highestLevel],
                existingEntry: {
                    id: existing.id,
                    title: existing.title,
                    sourceType: existing.sourceType,
                    charCount: existing.charCount,
                    addedAt: existing.addedAt,
                    preview: existing.content?.substring(0, 200) || '',
                },
                matchDetails,
            });
        }
    }

    // Sort by severity: EXACT_DUPLICATE > CONFLICTING_DATA > SAME_SOURCE > SIMILAR_CONTENT
    const levelPriority = { EXACT_DUPLICATE: 0, CONFLICTING_DATA: 1, SAME_SOURCE: 2, SIMILAR_CONTENT: 3 };
    warnings.sort((a, b) => (levelPriority[a.level] ?? 99) - (levelPriority[b.level] ?? 99));

    return warnings;
}

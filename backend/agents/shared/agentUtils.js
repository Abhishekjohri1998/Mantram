/**
 * Shared Agent Utilities
 * 
 * Reusable functions for all agentic pipelines:
 *   - callAgent: LLM call with JSON parsing
 *   - loadBrandContext: Brand DNA → prompt context
 *   - buildBrandContext: Brand → XML context block (includes DNA + knowledge + products + images)
 *   - buildStyleMemory: Past projects → memory block
 */

import Brand from '../../models/Brand.js';
import Product from '../../models/Product.js';
import { getRouter } from '../../ai/router.js';
import { resolveTargetMarkets, getMarketContext, getRelevantFestivals } from '../../utils/globalCalendar.js';
import redis from '../../utils/redisClient.js';

// Brand context cache TTL — 5 minutes (300s)
// Invalidated instantly on any brand update via redis.del() in brands.js
const BRAND_CACHE_TTL = 300;

/**
 * Call AI via router (auto-selects cheapest provider) and parse JSON response.
 * @param {string}  systemPrompt
 * @param {string}  userPrompt
 * @param {number}  [temperature=0.7]
 * @param {number}  [maxTokens=4096]
 * @param {object}  [options={}]          - Optional overrides
 * @param {string}  [options.provider]    - Force a specific provider ('google', 'anthropic', etc.)
 */
export async function callAgent(systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096, options = {}) {
    const router = getRouter();
    // Safety: Truncate extremely long prompts to prevent context overflow / max token errors
    const MAX_INPUT_CHARS = 100000; // ~25k tokens safety limit
    const safeSystem = systemPrompt.length > MAX_INPUT_CHARS ? systemPrompt.substring(0, MAX_INPUT_CHARS) + '... [truncated]' : systemPrompt;
    const safeUser = userPrompt.length > MAX_INPUT_CHARS ? userPrompt.substring(0, MAX_INPUT_CHARS) + '... [truncated]' : userPrompt;

    const result = await router.generateText({
        systemPrompt: safeSystem,
        userPrompt: safeUser,
        temperature,
        maxTokens,
    }, options.provider ? { provider: options.provider } : undefined); // Router auto-selects unless overridden

    const text = result.text || '';
    try {
        let cleaned = text;
        
        // Debug: log raw response length
        console.log(`🔍 callAgent raw response: ${text.length} chars, starts with: "${text.substring(0, 50)}..."`);
        
        // Strip <think>...</think> tags (Gemini 2.5 Flash reasoning)
        // MUST strip closed tags first, then handle unclosed at end
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
        
        // Only strip unclosed <think> if it appears AFTER any JSON content
        // Check if there's still an unclosed <think> tag
        const lastThinkIdx = cleaned.lastIndexOf('<think>');
        if (lastThinkIdx !== -1) {
            // Only strip from <think> onward if there's no JSON before it
            const beforeThink = cleaned.substring(0, lastThinkIdx).trim();
            if (beforeThink.length > 0) {
                cleaned = beforeThink; // Keep content before <think>
            } else {
                cleaned = cleaned.substring(lastThinkIdx); // <think> is at start, strip everything
                cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
            }
        }
        
        // Strip markdown code fences: ```json ... ``` or ``` ... ```
        cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '');
        
        cleaned = cleaned.trim();
        
        console.log(`🔍 callAgent cleaned: ${cleaned.length} chars, starts with: "${cleaned.substring(0, 80)}..."`);
        
        // Strategy 1: Full text as JSON
        if (cleaned.startsWith('{')) {
            try { return JSON.parse(cleaned); } catch (e) { 
                console.log(`🔍 Strategy 1 failed: ${e.message.substring(0, 100)}`);
            }
        }
        
        // Strategy 2: Extract JSON with regex
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            console.log(`🔍 Strategy 2 match: ${jsonMatch[0].length} chars`);
            try { return JSON.parse(jsonMatch[0]); } catch (e) { 
                console.log(`🔍 Strategy 2 failed: ${e.message.substring(0, 100)}`);
            }
        }
        
        // Strategy 3: Fix trailing commas + unquoted keys
        if (jsonMatch) {
            const fixedJson = jsonMatch[0]
                .replace(/,\s*([\]}])/g, '$1')
                .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
            try { return JSON.parse(fixedJson); } catch (e) { 
                console.log(`🔍 Strategy 3 failed: ${e.message.substring(0, 100)}`);
                console.log(`🔍 Raw text sample (first 300): ${text.substring(0, 300)}`);
            }
        } else {
            console.log(`🔍 No JSON object found in cleaned text. Cleaned sample: ${cleaned.substring(0, 300)}`);
        }

        // Strategy 4: Field-by-field regex extraction (last resort for copywriter / long JSON with unescaped chars)
        // Handles cases where string values contain apostrophes, quotes, or newlines that break JSON.parse
        const fieldExtract = (jsonMatch?.[0] || cleaned);
        if (fieldExtract) {
            try {
                const obj = {};
                // Extract string fields: "key": "value" — handles values with embedded quotes
                const stringPairs = fieldExtract.matchAll(/"(\w+)"\s*:\s*"([\s\S]*?)(?<!\\)"(?=\s*[,}\n])/g);
                for (const [, key, val] of stringPairs) {
                    if (!obj[key]) obj[key] = val.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                }

                // --- NEW: Truncation Recovery ---
                // If certain expected keys are missing, they might be truncated at the end of the string
                const expectedKeys = ['primaryPrompt', 'engineeringNotes', 'creativeDirection', 'suggestedHeadline', 'analysis', 'headline'];
                const missingKeys = expectedKeys.filter(k => !obj[k]);
                
                if (missingKeys.length > 0) {
                    for (const key of missingKeys) {
                        // Look for "key": " (open quote but no closing quote at end of string)
                        const truncatedRegex = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*)$`, 'i');
                        const truncatedMatch = fieldExtract.match(truncatedRegex);
                        if (truncatedMatch) {
                            console.log(`🔍 Recovery: Found truncated field "${key}"`);
                            let val = truncatedMatch[1].trim();
                            // Strip any trailing garbage that isn't part of the string (like a trailing comma or partial brace if they somehow got there)
                            val = val.replace(/["\s,}]*$/, ''); 
                            obj[key] = val.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                        }
                    }
                }

                // Extract array fields: "key": [...]
                const arrayPairs = fieldExtract.matchAll(/"(\w+)"\s*:\s*\[([\s\S]*?)\]/g);
                for (const [, key, val] of arrayPairs) {
                    if (!obj[key]) {
                        const items = val.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
                        obj[key] = items;
                    }
                }
                if (Object.keys(obj).length > 0) {
                    console.log(`🔍 Strategy 4 success: extracted keys: ${Object.keys(obj).join(', ')}`);
                    return obj;
                }
            } catch (e4) {
                console.log(`🔍 Strategy 4 failed: ${e4.message.substring(0, 100)}`);
            }
        }

    } catch (e) {
        console.warn('Agent JSON parse failed, raw:', text.substring(0, 200));
    }
    return { error: 'Failed to parse agent response', raw: text.substring(0, 500) };
}

/**
 * Call AI via router and return raw text (not JSON)
 */
export async function callAgentText(systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096) {
    const router = getRouter();

    // Safety: Truncate extremely long prompts
    const MAX_INPUT_CHARS = 100000;
    const safeSystem = systemPrompt.length > MAX_INPUT_CHARS ? systemPrompt.substring(0, MAX_INPUT_CHARS) + '... [truncated]' : systemPrompt;
    const safeUser = userPrompt.length > MAX_INPUT_CHARS ? userPrompt.substring(0, MAX_INPUT_CHARS) + '... [truncated]' : userPrompt;

    const result = await router.generateText({
        systemPrompt: safeSystem,
        userPrompt: safeUser,
        temperature,
        maxTokens,
    }); // Router auto-selects cheapest provider
    return result.text || '';
}

/**
 * Load brand + products + build context strings
 * ⚡ Redis-first: Results cached for 5 minutes per brandId.
 *    Cache invalidated on any brand update (brands.js routes call redis.del).
 *    Falls back to MongoDB if Redis is unavailable — never throws.
 */
export async function loadBrandContext(brandId) {
    if (!brandId) return { brand: null, brandContext: '<brand_bible>No brand data. Use professional style.</brand_bible>', styleMemory: '' };

    // ── Try Redis cache first ──────────────────────────────────────────────
    const cacheKey = `brand:${brandId}:context`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`⚡ Brand context cache HIT for ${brandId}`);
            return JSON.parse(cached);
        }
    } catch (cacheErr) {
        // Redis unavailable — continue to DB fetch
        console.warn(`⚠️ Brand cache read failed: ${cacheErr.message}`);
    }

    // ── Cache MISS — load from MongoDB ────────────────────────────────────
    console.log(`🗄️  Brand context cache MISS — loading from DB for ${brandId}`);
    const brand = await Brand.findById(brandId).lean();

    // Also load active products for this brand (up to 20)
    let products = [];
    try {
        products = await Product.find({ brand: brandId, status: 'active' })
            .select('title description shortDescription category subCategory price features keywords tags images')
            .limit(20)
            .lean();
    } catch (e) {
        // Products collection may not exist yet — gracefully continue
    }

    const brandContext = buildBrandContext(brand, products);
    const result = { brand, brandContext, products };

    // ── Store in Redis for next call ───────────────────────────────────────
    try {
        await redis.setex(cacheKey, BRAND_CACHE_TTL, JSON.stringify(result));
    } catch (cacheErr) {
        // Non-fatal — system works without cache
        console.warn(`⚠️ Brand cache write failed: ${cacheErr.message}`);
    }

    return result;
}

/**
 * Build brand bible XML block for agent prompts
 * Now includes: DNA + Knowledge Bank + Product Catalog + Brand Images
 */
export function buildBrandContext(brand, products = []) {
    if (!brand?.dna) return '<brand_bible>No brand data available. Use generic professional style.</brand_bible>';

    const dna = brand.dna;
    const parts = [];

    // ── Core Brand Identity ──
    if (brand.name) parts.push(`Brand: ${brand.name}`);
    if (brand.website) parts.push(`Website: ${brand.website}`);
    if (dna.industry) parts.push(`Industry: ${dna.industry}`);
    if (dna.targetAudience) parts.push(`Target Audience: ${dna.targetAudience}`);
    if (dna.brandDescription) parts.push(`Description: ${dna.brandDescription}`);
    if (dna.country) parts.push(`Origin: ${dna.country}${dna.region ? ` (${dna.region})` : ''}`);

    // ── Target Markets & Global Intelligence ──
    const targetMarkets = resolveTargetMarkets(brand);
    parts.push(`Target Markets: ${targetMarkets.join(', ')}`);

    const marketCtx = getMarketContext(targetMarkets);
    if (marketCtx) parts.push(marketCtx);

    // Inject verified festival dates filtered by target markets
    const festivalCtx = getRelevantFestivals('', targetMarkets, 8);
    if (festivalCtx) parts.push(festivalCtx);

    // Language directive
    if (dna.defaultLanguage && dna.defaultLanguage !== 'english') {
        parts.push(`Content Language: Generate content primarily in ${dna.defaultLanguage}`);
    }

    // ── Voice & Tone ──
    if (dna.voice?.personality) parts.push(`Voice: ${dna.voice.personality}`);
    if (dna.voice?.description) parts.push(`Voice Style: ${dna.voice.description}`);
    if (dna.voice?.sampleQuote) parts.push(`Sample Quote: "${dna.voice.sampleQuote}"`);
    if (dna.voice?.keywords?.length) parts.push(`Key Phrases: ${dna.voice.keywords.join(', ')}`);

    // ── Visual Identity ──
    if (dna.colors?.length) {
        const colorStr = dna.colors.map(c => `${c.name || c.usage}: ${c.hex}`).join(', ');
        parts.push(`Brand Colors: ${colorStr}`);
    }
    if (dna.fonts?.heading?.family) parts.push(`Heading Font: ${dna.fonts.heading.family}`);

    // ── Content Style ──
    if (dna.contentStyle?.dos?.length) parts.push(`Content Dos: ${dna.contentStyle.dos.join('; ')}`);
    if (dna.contentStyle?.donts?.length) parts.push(`Content Don'ts: ${dna.contentStyle.donts.join('; ')}`);
    if (dna.contentStyle?.keyPhrases?.length) parts.push(`Key Phrases: ${dna.contentStyle.keyPhrases.join('; ')}`);

    // ── Knowledge Bank Entries ──
    const knowledgeEntries = brand.knowledge?.entries || [];
    if (knowledgeEntries.length > 0) {
        parts.push('');
        parts.push('=== KNOWLEDGE BANK ===');
        let totalChars = 0;
        const MAX_KNOWLEDGE_CHARS = 3000; // Cap to avoid blowing context window
        for (const entry of knowledgeEntries) {
            if (totalChars >= MAX_KNOWLEDGE_CHARS) {
                parts.push(`... and ${knowledgeEntries.length - knowledgeEntries.indexOf(entry)} more knowledge entries (truncated)`);
                break;
            }
            const content = (entry.content || '').trim();
            if (!content) continue;
            const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
            parts.push(`[${entry.sourceType?.toUpperCase() || 'TEXT'}] ${entry.title || 'Knowledge Entry'}:`);
            parts.push(truncated);
            totalChars += truncated.length;
        }
    }

    // ── Product Catalog ──
    if (products.length > 0) {
        parts.push('');
        parts.push('=== PRODUCT CATALOG ===');
        const maxProducts = Math.min(products.length, 15);
        const MAX_PRODUCT_CHARS = 4000;
        let productTotalChars = 0;

        for (let i = 0; i < maxProducts; i++) {
            if (productTotalChars >= MAX_PRODUCT_CHARS) {
                parts.push(`... and ${maxProducts - i} more products (truncated to save context)`);
                break;
            }
            const p = products[i];
            const pParts = [`• ${p.title}`];
            if (p.category) pParts.push(`Category: ${p.category}${p.subCategory ? ` > ${p.subCategory}` : ''}`);
            if (p.shortDescription) pParts.push(p.shortDescription);
            else if (p.description) pParts.push(p.description.substring(0, 150));
            if (p.price?.amount) pParts.push(`Price: ${p.price.currency || 'INR'} ${p.price.amount}${p.price.mrp ? ` (MRP: ${p.price.mrp})` : ''}`);
            if (p.features?.length) pParts.push(`Features: ${p.features.slice(0, 5).join(', ')}`);
            if (p.keywords?.length) pParts.push(`Keywords: ${p.keywords.slice(0, 5).join(', ')}`);
            if (p.tags?.length) pParts.push(`Tags: ${p.tags.slice(0, 5).join(', ')}`);
            
            const productLine = pParts.join(' | ');
            parts.push(productLine);
            productTotalChars += productLine.length;
        }
        if (products.length > maxProducts && productTotalChars < MAX_PRODUCT_CHARS) {
            parts.push(`... and ${products.length - maxProducts} more products`);
        }
    }

    // ── Market Rules ──
    parts.push('');
    parts.push('=== MARKET RULES ===');
    parts.push('1. Adapt ALL content for the target markets — use their currency, language, cultural references, and local trends.');
    parts.push('2. If multiple target markets, create content that resonates across all of them, noting key differences.');
    parts.push('3. Use ONLY verified dates from the festival calendar. NEVER hallucinate dates.');
    parts.push('4. Respect cultural sensitivities of each target market.');

    // ── Brand Images Summary ──
    const brandImages = dna.brandImages || [];
    if (brandImages.length > 0) {
        parts.push('');
        parts.push(`=== BRAND IMAGES: ${brandImages.length} images available ===`);
        const imageSummary = brandImages
            .filter(img => img.alt)
            .slice(0, 10)
            .map(img => `[${img.source || 'page'}] ${img.alt}`)
            .join(', ');
        if (imageSummary) parts.push(`Image tags: ${imageSummary}`);
    }

    return `<brand_bible>\n${parts.join('\n')}\n</brand_bible>`;
}

/**
 * MCoT: Multimodal Chain-of-Thought — Call AI with text + images for visual reasoning.
 * 
 * This enables two-stage reasoning:
 *   Stage 1: Analyze images → produce visual rationale (grounding)
 *   Stage 2: Use the rationale to inform downstream creative decisions
 * 
 * Uses Gemini's native vision capability (images[] param in generateText).
 * Falls back to text-only if image fetching fails.
 * 
 * @param {string} systemPrompt - System instruction for the reasoning task
 * @param {string} userPrompt - The user's input text (brief, question, etc.)
 * @param {string[]} imageUrls - Array of image URLs (HTTP or data: URIs) to analyze
 * @param {object} options - { temperature, maxTokens, returnRaw }
 * @returns {object} Parsed JSON response from the model
 */
export async function callMultimodalAgent(systemPrompt, userPrompt, imageUrls = [], options = {}) {
    const { temperature = 0.3, maxTokens = 2048, returnRaw = false } = options;
    const router = getRouter();
    const startMs = Date.now();

    // Filter valid image URLs — skip empties, nulls, broken refs
    const validImages = (imageUrls || []).filter(url => 
        url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))
    ).slice(0, 5); // Max 5 images to avoid context overflow

    console.log(`🧠 MCoT: Multimodal Agent — ${validImages.length} images, prompt: ${userPrompt.substring(0, 80)}...`);

    try {
        const result = await router.generateText({
            systemPrompt,
            userPrompt,
            temperature,
            maxTokens,
            images: validImages, // Gemini provider natively handles URL→base64 conversion
        });

        const text = result.text || '';
        console.log(`🧠 MCoT: Multimodal response received in ${Date.now() - startMs}ms (${text.length} chars)`);

        if (returnRaw) return text;

        // Parse JSON from response — handle all common LLM output quirks
        try {
            let cleaned = text;
            
            // Strip <think>...</think> tags (Gemini 2.5 Flash reasoning)
            // Handle both closed and unclosed <think> blocks
            cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
            // Handle unclosed <think> safely — preserve content before it
            const lastThinkIdx = cleaned.lastIndexOf('<think>');
            if (lastThinkIdx !== -1) {
                const before = cleaned.substring(0, lastThinkIdx).trim();
                if (before.length > 0) {
                    cleaned = before;
                } else {
                    cleaned = cleaned.substring(lastThinkIdx).replace(/<think>[\s\S]*/gi, '');
                }
            }
            
            // Strip markdown code fences: ```json ... ``` or ``` ... ```
            cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '');
            
            cleaned = cleaned.trim();
            
            // Strategy 1: Try parsing the full cleaned text as JSON
            if (cleaned.startsWith('{')) {
                try { return JSON.parse(cleaned); } catch (_) { /* try next */ }
            }
            
            // Strategy 2: Extract JSON object with regex
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try { return JSON.parse(jsonMatch[0]); } catch (_) { /* try next */ }
            }
            
            // Strategy 3: Try to fix common JSON issues (trailing commas, missing quotes)
            if (jsonMatch) {
                const fixedJson = jsonMatch[0]
                    .replace(/,\s*([\]}])/g, '$1')  // Remove trailing commas
                    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');  // Quote unquoted keys
                try { return JSON.parse(fixedJson); } catch (_) { /* give up */ }
            }
            
            console.warn('🧠 MCoT: Could not parse JSON from response. Raw text (first 300 chars):', cleaned.substring(0, 300));
        } catch (parseErr) {
            console.warn('🧠 MCoT: JSON parse exception:', parseErr.message, 'Raw text:', text.substring(0, 200));
        }

        return { rawText: text, error: 'Failed to parse multimodal agent response' };
    } catch (err) {
        console.error(`🧠 MCoT: Multimodal agent call failed (${Date.now() - startMs}ms):`, err.message);
        // Return a graceful error — downstream nodes should handle this and skip MCoT
        return { error: err.message, skipped: true };
    }
}


/**
 * Build style memory from past projects
 */
export function buildStyleMemory(projects = [], type = 'general') {
    if (!projects.length) return '';

    const memories = projects.slice(0, 5).map(p => {
        const edits = (p.editHistory || []).map(e => `Changed ${e.field}: "${e.before}" → "${e.after}"`).join('; ');
        return `- "${p.title}": ${edits || 'No edits'}`;
    }).join('\n');

    return `\n<user_style_memory type="${type}">\n${memories}\nApply these learned preferences.\n</user_style_memory>`;
}

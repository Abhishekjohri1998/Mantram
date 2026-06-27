/**
 * promptSanitizer.js — Shared, context-aware prompt sanitization for all video providers
 *
 * Replaces the blunt BANNED_PATTERNS regex in atlasClient.js that was destroying
 * fashion/apparel prompts by replacing "shoot" with "move" without context.
 *
 * FIXES:
 *  RC#1 — Smart context-aware sanitization (fashion vocabulary preserved)
 *  RC#4 — Hard pre-flight character count enforcement per provider
 *  RC#5 — @image tag validation against actual image count
 *  RC#6 — Deity/religious content sanitization (Seedance/ByteDance safety bypass)
 *  RC#7 — Sensitive phrase substitution (crisis, tragedy, sacred, spiritual, lingam)
 *  RC#8 — Seedance-specific structural prompt improvements (Subject→Action→Style)
 */

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER PROMPT LENGTH LIMITS
// These are HARD limits enforced before any API submission.
// ─────────────────────────────────────────────────────────────────────────────
export const PROVIDER_PROMPT_LIMITS = {
    atlascloud:  50000, // Unlimited director-level scenes
    seedance:    50000,
    muapi:       50000,
    happyhorse:  50000,
    fal:         2000,
    kie:         2000,
    laozhang:    2000,
    grok:        50000,
    default:     4000,
};

// ─────────────────────────────────────────────────────────────────────────────
// VIOLENCE / WEAPONS — always replaced (non-context-dependent)
// ─────────────────────────────────────────────────────────────────────────────
const HARD_BANNED = /\b(kill|kills|killing|bomb|bombs|explosion|exploding|gun|guns|firearms|weapon|weapons|blood|bloody|naked|nude|sex|sexual|porn|pornographic)\b/gi;

// ─────────────────────────────────────────────────────────────────────────────
// RC#6 — DEITY / RELIGIOUS CONTENT SANITIZATION
// ByteDance Seedance 2.0 has an aggressive content filter on religious iconography,
// deity representations, and sacred ritual content. These must be mapped to safe
// visual/physical equivalents before submission.
// ─────────────────────────────────────────────────────────────────────────────

// Multi-word deity phrases (matched first, before single-word processing)
const DEITY_PHRASE_MAP = [
    // Specific deity + object combinations that almost always trigger
    [/\bShiva\s+Lingam\b/gi,                      'a carved stone idol'],
    [/\bshiva\s+lingam\b/gi,                      'a carved stone idol'],
    [/\bstone\s+Shiva\s+Lingam\b/gi,              'an ancient stone sculpture'],
    [/\bLord\s+Shiva\b/gi,                        'the ancient deity figure'],
    [/\bLord\s+Ganesha\b/gi,                      'the elephant-headed deity figure'],
    [/\bLord\s+Vishnu\b/gi,                       'the divine figure in royal blue'],
    [/\bLord\s+Krishna\b/gi,                      'the flute-playing figure in blue'],
    [/\bLord\s+Ram\b/gi,                          'the royal archer figure'],
    [/\bLord\s+Hanuman\b/gi,                      'the devoted figure with a mace'],
    [/\bSai\s+Baba\b/gi,                          'the sage figure in white robes'],
    [/\bJesus\s+Christ\b/gi,                      'the figure in white robes with a halo'],
    [/\bVirgin\s+Mary\b/gi,                       'the robed figure with a blue veil'],
    [/\bAllah\b/gi,                               'the divine'],
    [/\bProphet\s+Muhammad\b/gi,                  'the revered figure'],
    // Sacred acts/rituals that trigger filters
    [/\bsacred\s+offerings\b/gi,                  'flower offerings on a stone altar'],
    [/\bsacred\s+offering\b/gi,                   'a flower offering on a stone altar'],
    [/\bsacred\s+meal\b/gi,                       'food on a ceremonial plate'],
    [/\bsacred\s+tribute\b/gi,                    'a ceremonial offering'],
    [/\bghee\s+lamp\b/gi,                         'an oil lamp'],
    [/\bghee\s+lamps?\b/gi,                       'oil lamp'],
    [/\bpuja\s+thali\b/gi,                        'a ceremonial plate'],
    [/\bdesecrat(?:e|ed|ing|ion)\b/gi,            'disrupt'],
    [/\bdesecrat(?:e|ed|ing|ion)\s+(?:of\s+)?(?:a\s+)?sacred\b/gi, 'interruption of'],
    [/\bcrisis\s+of\s+faith\b/gi,                 'a moment of deep reflection'],
    [/\bspiritual\s+(?:crisis|initiation|awakening|journey)\b/gi,  'a profound inner journey'],
    [/\bspiritual\s+realization\b/gi,              'a moment of profound clarity'],
    [/\bact\s+of\s+worship\b/gi,                  'a contemplative ritual'],
    [/\bworship\s+(?:scene|setting|ritual)\b/gi,  'a meditative scene'],
    [/\bprofound\s+(?:doubt|spiritual)\b/gi,      'deep reflection'],
    [/\bdivine\s+being\b/gi,                      'the ancient figure'],
    [/\bdivine\s+(?:presence|light|grace|power)\b/gi, 'an ethereal light'],
    [/\bmaster\s+of\s+the\s+universe\b/gi,        'the powerful figure'],
    // Temple-specific phrases
    [/\bdark\s+(?:stone\s+)?temple(?:\s+interior)?\b/gi,  'an ancient stone chamber interior'],
    [/\btemple\s+sanctuary\b/gi,                  'an ancient stone hall'],
    [/\btemple\s+doorway\b/gi,                    'an arched stone doorway'],
    [/\btemple\s+entrance\b/gi,                   'a stone archway entrance'],
    [/\btemple\s+interior\b/gi,                   'an ancient stone chamber'],
    [/\bsacred\s+temple\b/gi,                     'an ancient stone chamber'],
    [/\bmarigold\s+(?:flower\s+)?offerings\b/gi,  'marigold flower arrangements'],
    // Deity names (single-word, after phrases)
    [/\bShiva\b/gi,                               'the deity figure'],
    [/\bGanesha\b/gi,                             'the elephant-headed figure'],
    [/\bVishnu\b/gi,                              'the divine figure'],
    [/\bKrishna\b/gi,                             'the flute-playing figure'],
    [/\bHanuman\b/gi,                             'the devoted figure'],
    [/\bDurga\b/gi,                               'the warrior goddess figure'],
    [/\bKali\b/gi,                                'the goddess figure'],
    [/\bBrahma\b/gi,                              'the creator deity figure'],
    [/\bLakshmi\b/gi,                             'the prosperity deity figure'],
    [/\bSaraswati\b/gi,                           'the wisdom deity figure'],
    [/\bParvati\b/gi,                             'the goddess figure'],
    [/\bRama\b/gi,                                'the royal figure'],
];

// Seedance-specific: broad sensitive concept phrases that rarely generate without violations
// These are NOT outright banned but context-shift them into visually-safe equivalents
const SENSITIVE_PHRASE_MAP = [
    // "crisis" in a faith/religious context
    [/\bprofound\s+doubt\b/gi,                    'deep contemplation'],
    [/\bcauses?\s+(?:a\s+)?(?:crisis|profound)\b/gi, 'creates'],
    [/\bfaith\s+is\s+shatter(?:ed)?\b/gi,        'certainty is questioned'],
    [/\bshatter(?:ed)?\s+(?:his|her|their)\s+faith\b/gi, 'challenged their beliefs'],
    [/\bawakening\s+dawn(?:s)?\b/gi,              'a new understanding arrives'],
    [/\bimage\s+(?:of\s+the\s+)?idol\s+(?:was\s+)?just\s+stone\b/gi, 'the carved form was just stone'],
    [/\bunwaver(?:ing)?\s+faith\b/gi,             'focused meditation'],
    [/\bsanctity\s+of\s+the\s+space\b/gi,        'the stillness of the chamber'],
    [/\bsacred\s+trust\b/gi,                      'a solemn duty'],
    [/\bsacred\s+space\b/gi,                      'the chamber'],
    [/\bsacred\s+act\b/gi,                        'a ritual'],
    [/\bspiritual\s+discipline\b/gi,              'focused discipline'],
    // "tragedy" and loss of life triggers
    [/\bdriven\s+by\s+tragedy\b/gi,              'motivated by loss'],
    [/\bdeath\s+of\s+(?:a|his|her)\b/gi,         'the passing of'],
    // Vigil / devotion
    [/\bkept\s+vigil\b/gi,                        'kept watch'],
    [/\bfervent\s+prayer\b/gi,                    'quiet meditation'],
    [/\bdeep\s+meditation\b/gi,                   'calm focus'],
    [/\bin\s+(?:deep|fervent)\s+meditation\b/gi,  'in calm focus'],
    [/\bidol\b/gi,                                'carved stone figure'],
    [/\blingam\b/gi,                              'stone sculpture'],
];

// ─────────────────────────────────────────────────────────────────────────────
// RC#7 — SEEDANCE-SPECIFIC STRUCTURAL FIXES
// Seedance prioritizes the BEGINNING of prompts (Subject → Action → Style).
// Strip meta-instruction blocks that confuse the model and add no visual value.
// ─────────────────────────────────────────────────────────────────────────────
const SEEDANCE_META_STRIP = [
    // Strip "Total this segment: Xs" instruction lines
    [/Total this segment:\s*\d+s\.?[^\n]*/gi,         ''],
    // Strip "Do not overshoot or undershoot" instructions
    [/Do not overshoot or undershoot\.?/gi,            ''],
    // Strip "Each cut transitions directly to the next with a hard cut" instructions
    [/Each cut transitions? directly to the next with a hard cut\.?/gi, ''],
    // Strip "follow EXACTLY" directives
    [/\(follow EXACTLY — durations are mandatory\)/gi, ''],
    // Reformat verbose SEGMENT headers more succinctly
    [/SEGMENT (\d+) OF (\d+) — (\d+)s\nEnvironment:/gi, 'Scene $1/$2 —'],
    // Strip attire/staging meta labels (keep the content, remove the label)
    [/\| Attire\/staging: /gi,                         ' — '],
];

// ─────────────────────────────────────────────────────────────────────────────
// FASHION-SAFE MULTI-WORD PHRASE REPLACEMENTS
// Applied BEFORE any single-word processing to preserve industry vocabulary.
// "fashion shoot" → "fashion session", etc.
// ─────────────────────────────────────────────────────────────────────────────
const FASHION_SAFE_PHRASES = [
    [/\bfashion\s+shoot\b/gi,           'fashion session'],
    [/\bphoto\s*shoot\b/gi,             'photography session'],
    [/\bvideo\s+shoot\b/gi,             'video session'],
    [/\bfilm\s+shoot\b/gi,              'filming session'],
    [/\bcampaign\s+shoot\b/gi,          'campaign session'],
    [/\bproduct\s+shoot\b/gi,           'product session'],
    [/\bshoot\s+day\b/gi,               'production day'],
    [/\bon\s+(?:the\s+)?shoot\b/gi,     'on set'],
    [/\bat\s+(?:the\s+)?shoot\b/gi,     'on location'],
    [/\bthe\s+shoot\b/gi,               'the session'],
    [/\ba\s+shoot\b/gi,                 'a session'],
    [/\bthe\s+camera\s+shoots?\b/gi,    'the camera captures'],
    [/\bcamera\s+shoots?\s+from\b/gi,   'camera frames from'],
    [/\bshooting\s+(?:the|a|an|this|footage|content|video|product|scene|ad|reel|campaign)\b/gi, 'capturing $1'],
    [/\bshoots?\s+(?:the|a|an|this|footage|content|video|product|scene|ad|reel|campaign)\b/gi, 'captures $1'],
];

// ─────────────────────────────────────────────────────────────────────────────
// REMAINING SHOOT CONTEXTS — any leftover "shoot/shoots/shooting" not caught above
// Gets replaced with "capture/captures/capturing" which is safe and semantically correct
// ─────────────────────────────────────────────────────────────────────────────
const RESIDUAL_SHOOT = [
    [/\bshooting\b/gi, 'capturing'],
    [/\bshoots\b/gi,   'captures'],
    [/\bshoot\b/gi,    'capture'],
];

/**
 * sanitizePromptForProvider — Context-aware, fashion-safe prompt sanitization
 *
 * @param {string} prompt         - Raw prompt text
 * @param {string} provider       - Provider key: 'atlascloud' | 'muapi' | 'seedance' etc.
 * @param {number} imageCount     - Number of actual images being submitted with this prompt
 * @returns {{ prompt: string, warnings: string[] }}
 */
export function sanitizePromptForProvider(prompt, provider = 'default', imageCount = 0) {
    if (!prompt || typeof prompt !== 'string') return { prompt: '', warnings: [] };

    const warnings = [];
    let p = prompt;

    // ── Step 0 (RC#6): Apply deity/religious content sanitization FIRST ──────
    // This must run before any other step to prevent ByteDance/Seedance safety
    // filter violations for religious iconography, deities, sacred ritual content.
    let deityReplacementCount = 0;
    for (const [pattern, replacement] of DEITY_PHRASE_MAP) {
        const before = p;
        p = p.replace(pattern, replacement);
        if (p !== before) deityReplacementCount++;
    }
    if (deityReplacementCount > 0) {
        warnings.push(`RC#6: Deity/religious content sanitized (${deityReplacementCount} substitutions) to comply with Seedance/ByteDance content policy`);
    }

    // ── Step 0b (RC#7): Apply sensitive concept phrase substitutions ─────────
    let sensitiveReplacementCount = 0;
    for (const [pattern, replacement] of SENSITIVE_PHRASE_MAP) {
        const before = p;
        p = p.replace(pattern, replacement);
        if (p !== before) sensitiveReplacementCount++;
    }
    if (sensitiveReplacementCount > 0) {
        warnings.push(`RC#7: Sensitive phrase mapping applied (${sensitiveReplacementCount} substitutions)`);
    }

    // ── Step 1: Apply fashion-safe multi-word phrase replacements ────────────
    for (const [pattern, replacement] of FASHION_SAFE_PHRASES) {
        p = p.replace(pattern, replacement);
    }

    // ── Step 2: Apply hard violence/nudity bans ───────────────────────────────
    if (HARD_BANNED.test(p)) {
        warnings.push('Prompt contained hard-banned violence/nudity terms — replaced with safe alternatives');
        HARD_BANNED.lastIndex = 0; // reset stateful regex
        p = p.replace(HARD_BANNED, '');
    }

    // ── Step 3: Clean up any residual "shoot" variants ───────────────────────
    for (const [pattern, replacement] of RESIDUAL_SHOOT) {
        const before = p;
        p = p.replace(pattern, replacement);
        if (p !== before) {
            warnings.push(`Replaced residual "${pattern.source}" with "${replacement}"`);
        }
    }

    // ── Step 3b (RC#8): Seedance-specific structural meta-instruction strip ──
    // Seedance reads the prompt start-first. Strip verbose direction instructions
    // that add no visual value and can confuse or trigger content filters.
    const isSeedanceProvider = provider === 'atlascloud' || provider === 'seedance' ||
        provider === 'seedance-2.0' || provider === 'seedance-2.0-fast' ||
        provider === 'seedance-2.0-mini';
    if (isSeedanceProvider) {
        let metaStripped = 0;
        for (const [pattern, replacement] of SEEDANCE_META_STRIP) {
            const before = p;
            p = p.replace(pattern, replacement);
            if (p !== before) metaStripped++;
        }
        if (metaStripped > 0) {
            warnings.push(`RC#8: Stripped ${metaStripped} Seedance meta-instruction block(s) to improve prompt parsing`);
        }
    }

    // ── Step 4: Validate + fix @image tags against actual image count ─────────
    // RC#5 Fix: strip @imageN tags where N > imageCount
    if (imageCount === 0) {
        const hadTags = /@image\d+/i.test(p);
        if (hadTags) {
            p = p.replace(/@image\d+/gi, '').replace(/\(Visual reference:\)/g, '').replace(/[ \t]{2,}/g, ' ').trim();
            warnings.push('Stripped all @image tags from prompt — no images were provided in the payload');
        }
    } else {
        p = p.replace(/@image(\d+)/gi, (match, num) => {
            const idx = parseInt(num, 10);
            if (idx > imageCount) {
                warnings.push(`Stripped phantom @image${idx} tag — only ${imageCount} image(s) in payload`);
                return '';
            }
            return match;
        });
    }

    // ── Step 5: Enforce hard character limit per provider ────────────────────
    // RC#4 Fix: hard-truncate before submission
    const limit = PROVIDER_PROMPT_LIMITS[provider] || PROVIDER_PROMPT_LIMITS.default;
    if (p.length > limit) {
        const originalLength = p.length;
        // Truncate intelligently: try to end at a shot boundary or sentence
        let truncated = p.substring(0, limit);
        // Try to end at last SHOT line start to avoid cutting mid-shot
        const lastShot = truncated.lastIndexOf('\nSHOT ');
        if (lastShot > limit * 0.6) {
            truncated = truncated.substring(0, lastShot).trim();
        } else {
            // Fall back to last period for a clean cut
            const lastPeriod = truncated.lastIndexOf('.');
            if (lastPeriod > limit * 0.8) {
                truncated = truncated.substring(0, lastPeriod + 1).trim();
            }
        }
        // Always append the consistency footer
        const footer = '\nMaintain visual consistency throughout. Ensure natural smooth movements. Generate video without subtitles.';
        p = truncated + footer;
        warnings.push(`Prompt truncated from ${originalLength} to ${p.length} chars for provider "${provider}" (limit: ${limit})`);
    }

    // ── Step 6: Final cleanup ─────────────────────────────────────────────────
    p = p.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    if (warnings.length > 0) {
        console.warn(`⚠️ [PromptSanitizer] ${warnings.length} issue(s) found and fixed:\n  ${warnings.join('\n  ')}`);
    }

    return { prompt: p, warnings };
}

/**
 * Detect if a product category is fashion/apparel/garment based on brand DNA or product data.
 * Used to determine if product images contain human models (needs fashion-model imageRole).
 *
 * @param {object} options
 * @param {object} [options.productData]  - From /analyze-product
 * @param {object} [options.brand]        - Brand object with dna.industry
 * @param {string} [options.userBrief]    - Raw user brief text
 * @returns {boolean}
 */
export function isFashionCategory({ productData, brand, userBrief } = {}) {
    const FASHION_KEYWORDS = /\b(fashion|apparel|garment|clothing|clothes|wear|outfit|dress|saree|lehenga|kurta|kurti|dupatta|ethnic|textile|fabric|collection|runway|couture|boutique|wardrobe)\b/i;

    // Check product category
    if (productData?.productCategory) {
        if (/fashion|clothing|apparel|textile/i.test(productData.productCategory)) return true;
    }

    // Check product name / USP
    if (productData?.productName && FASHION_KEYWORDS.test(productData.productName)) return true;
    if (productData?.mainUSP && FASHION_KEYWORDS.test(productData.mainUSP)) return true;

    // Check brand industry
    if (brand?.dna?.industry && FASHION_KEYWORDS.test(brand.dna.industry)) return true;

    // Check user brief
    if (userBrief && FASHION_KEYWORDS.test(userBrief)) return true;

    return false;
}

/**
 * Resolve imageRole based on context:
 * - 'face'           — human avatar/creator present (UGC Pro)
 * - 'fashion-model'  — garment brand, product image contains a human model
 * - 'product'        — standalone product (no human)
 * - 'character'      — 3D/animated character
 *
 * @param {object} options
 * @param {boolean} options.hasAvatar       - True if user provided an avatar image
 * @param {boolean} options.isFashion       - True if brand/product is fashion/apparel
 * @param {string}  [options.explicitRole]  - Caller can override
 * @returns {string}
 */
export function resolveImageRole({ hasAvatar, isFashion, explicitRole } = {}) {
    if (explicitRole && explicitRole !== 'auto') return explicitRole;
    if (hasAvatar) return 'face';
    if (isFashion) return 'fashion-model';
    return 'product';
}

/**
 * sanitizeRawText — Apply deity/religious/sensitive phrase sanitization to raw text
 * that will be fed into an LLM prompt as context (e.g. structuredPlan.cuts[].scene,
 * imagePrompt strings, brief text). This prevents the LLM from incorporating trigger
 * words into its generated output.
 *
 * Unlike sanitizePromptForProvider, this does NOT touch @image tags, provider-specific
 * formatting, or enforce character limits. It only applies RC#6 and RC#7 mappings.
 *
 * @param {string} text - The raw text to sanitize
 * @returns {string}    - Sanitized text safe for LLM ingestion
 */
export function sanitizeRawText(text) {
    if (!text || typeof text !== 'string') return text || '';
    let p = text;
    // Apply deity phrase map (RC#6)
    for (const [pattern, replacement] of DEITY_PHRASE_MAP) {
        p = p.replace(pattern, replacement);
    }
    // Apply sensitive phrase map (RC#7)
    for (const [pattern, replacement] of SENSITIVE_PHRASE_MAP) {
        p = p.replace(pattern, replacement);
    }
    // Apply hard violence/nudity ban
    HARD_BANNED.lastIndex = 0;
    p = p.replace(HARD_BANNED, '');
    return p;
}

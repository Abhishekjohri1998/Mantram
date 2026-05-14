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

    // ── Step 1: Apply fashion-safe multi-word phrase replacements first ──────
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

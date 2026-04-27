/**
 * Avatar Prompt Builder — Mantram AI Avatar Studio
 *
 * Pure function module: no I/O, no async, fully deterministic.
 * Exports buildAvatarPrompt(options) + all mapping constants.
 *
 * RULES enforced here (not in frontend):
 *  1. Fixed prefix: mid-shot, direct eye contact, 9:16 — always applied
 *  2. genderExpression is required — throws if missing
 *  3. No age numbers / banned age terms — stripped via regex
 *  4. No racial terms — ORIGIN_MAP uses appearance descriptors only
 */

// ─── Regional Appearance Descriptors ─────────────────────────────────────────
// Never uses racial or ethnic labels — describes appearance, complexion, features only.
export const ORIGIN_MAP = {
    'south-asian':     'South Asian features, warm golden-brown complexion, expressive dark eyes, defined brow architecture',
    'southeast-asian': 'Southeast Asian features, warm tan complexion, almond-shaped expressive eyes, smooth even skin tone',
    'east-asian':      'East Asian features, porcelain to light golden complexion, softly defined eyes, graceful bone structure',
    'middle-eastern':  'Middle Eastern features, warm olive complexion, strongly defined brow, rich dark eyes, sculpted jaw',
    'african':         'Sub-Saharan African features, deep warm melanin-rich complexion, striking facial definition, full lips',
    'western':         'Western European features, fair to medium complexion, light expressive eyes, defined cheekbones',
    'latin':           'Latin American features, warm medium-brown complexion, expressive dark or hazel eyes, full lips',
    'mixed':           'Mixed heritage features, ambiguous globally relatable appearance, warm medium complexion',
};

// ─── Age Range → Bearing Descriptors (no numbers ever) ───────────────────────
export const AGE_MAP = {
    'young-adult':  'early-twenties appearance, fresh-faced, energetic youthful bearing',
    'adult':        'late-twenties to thirties appearance, confident composed bearing, professional maturity',
    'mature-adult': 'mature distinguished appearance, professional bearing, elegant authoritative presence',
};

// ─── Gender Expression ────────────────────────────────────────────────────────
export const GENDER_MAP = {
    'masculine':  'masculine presenting',
    'feminine':   'feminine presenting',
    'neutral':    'androgynous neutral presenting',
};

// ─── Clothing Style ───────────────────────────────────────────────────────────
export const CLOTHING_MAP = {
    'casual':       'casual everyday clothing — fitted t-shirt or clean henley, comfortable well-fitted jeans',
    'smart-casual': 'smart-casual attire — neat collared shirt or tailored blouse, clean well-fitted trousers',
    'professional': 'professional business attire — tailored blazer, crisp formal shirt, polished accessories',
    'streetwear':   'contemporary streetwear — oversized graphic tee layered with clean hoodie, fresh sneakers',
    'athletic':     'athletic performance sportswear — moisture-wicking fabric, fitted activewear, clean sneakers',
    'traditional':  'culturally appropriate traditional attire, dignified and authentically presented',
};

// ─── Environment ─────────────────────────────────────────────────────────────
export const ENVIRONMENT_MAP = {
    'home':         'warm modern home interior background, soft contemporary furnishings, golden-hour glow through sheer curtains, shallow bokeh depth of field',
    'outdoor-urban':'urban outdoor setting, city plaza or street background, natural soft diffused daylight, gentle bokeh',
    'gym':          'modern premium fitness studio background, floor-to-ceiling windows with natural daylight, minimalist equipment in deep soft focus',
    'office':       'sleek contemporary open-plan office background, panoramic window light flooding in, modern desk and city view in soft focus',
    'nature':       'lush outdoor nature setting, park or garden greenery background, soft dappled sunlight through leaves',
    'minimalist':   'clean seamless studio backdrop, neutral warm-white gradient, professional high-key photography studio setup',
};

// ─── Lighting Mood ────────────────────────────────────────────────────────────
export const LIGHTING_MAP = {
    'natural-daylight':  'soft diffused natural daylight, gentle window-direction key illumination, clean even exposure',
    'golden-hour':       'warm golden-hour directional light, long soft shadows, rich amber and honey tones',
    'studio-bright':     'clean high-key studio lighting, twin softbox setup, bright even commercial light, no harsh shadows',
    'moody-cinematic':   'low-key dramatic cinematic lighting, strong chiaroscuro contrast, deep shadows with selective rim light',
    'cool-professional': 'neutral cool-toned office or studio lighting, soft flat key light, professional editorial feel',
};

// ─── Banned age patterns ──────────────────────────────────────────────────────
const BANNED_AGE_PATTERNS = /\b(\d+)\s*(?:year[s]?\s*old|yr[s]?\s*old|y\.?o\.?)\b|\b(?:teen(?:age[r]?)?|juvenile|minor|underage|elderly|geriatric|senior\s+citizen)\b/gi;

/**
 * Build a photorealistic avatar prompt from structured options.
 *
 * @param {Object} options
 * @param {string} options.origin          - Key from ORIGIN_MAP
 * @param {string} options.ageRange        - Key from AGE_MAP
 * @param {string} options.genderExpression - Key from GENDER_MAP — REQUIRED
 * @param {string} options.clothingStyle   - Key from CLOTHING_MAP
 * @param {string} options.environment     - Key from ENVIRONMENT_MAP
 * @param {string} options.lightingMood    - Key from LIGHTING_MAP
 * @param {string} [options.additionalDetails] - Free-text detail (sanitised)
 * @returns {string} Complete assembled prompt
 * @throws {Object} { status: 400, message: string } if genderExpression missing
 */
export function buildAvatarPrompt({
    origin = 'south-asian',
    ageRange = 'adult',
    genderExpression,
    clothingStyle = 'smart-casual',
    environment = 'minimalist',
    lightingMood = 'natural-daylight',
    additionalDetails = '',
} = {}) {
    // Rule 2: gender is required
    if (!genderExpression || !GENDER_MAP[genderExpression]) {
        const err = new Error('Gender expression is required for avatar generation. Please select masculine, feminine, or neutral.');
        err.status = 400;
        throw err;
    }

    // Sanitise additional details — strip banned age patterns
    const safeDetails = (additionalDetails || '')
        .replace(BANNED_AGE_PATTERNS, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 200); // hard cap

    // Map each option to descriptor (fall back to first available if unknown key)
    const originDesc     = ORIGIN_MAP[origin]       || ORIGIN_MAP['south-asian'];
    const ageDesc        = AGE_MAP[ageRange]         || AGE_MAP['adult'];
    const genderDesc     = GENDER_MAP[genderExpression];
    const clothingDesc   = CLOTHING_MAP[clothingStyle] || CLOTHING_MAP['smart-casual'];
    const envDesc        = ENVIRONMENT_MAP[environment] || ENVIRONMENT_MAP['minimalist'];
    const lightingDesc   = LIGHTING_MAP[lightingMood]   || LIGHTING_MAP['natural-daylight'];

    // Rule 1: fixed prefix always applied — cannot be overridden by frontend
    const FIXED_PREFIX = 'mid-shot portrait photograph, subject facing directly toward camera with natural direct confident eye contact, 9:16 vertical aspect ratio';
    const FIXED_SUFFIX = 'photorealistic, commercial photography quality, sharp focus on subject face and upper body, professional post-processing, authentic skin texture';

    const parts = [
        FIXED_PREFIX,
        `${genderDesc}, ${ageDesc}, ${originDesc}`,
        clothingDesc,
        envDesc,
        lightingDesc,
    ];

    if (safeDetails) {
        parts.push(safeDetails);
    }

    parts.push(FIXED_SUFFIX);

    return parts.join('. ');
}

/**
 * Aspect ratio string → pixel dimensions for LaoZhang image generation.
 * LaoZhang /images/generations accepts size as "WIDTHxHEIGHT".
 */
export const RATIO_TO_SIZE = {
    '9:16':  '1024x1792',  // Native 9:16 portrait for gpt-image-2 (high quality)
    '1:1':   '1024x1024',  // Square
    '16:9':  '1792x1024',  // Landscape
    '4:5':   '1024x1280',  // Instagram portrait
    '3:4':   '1024x1365',  // Tall landscape
};

export default { buildAvatarPrompt, ORIGIN_MAP, AGE_MAP, GENDER_MAP, CLOTHING_MAP, ENVIRONMENT_MAP, LIGHTING_MAP, RATIO_TO_SIZE };

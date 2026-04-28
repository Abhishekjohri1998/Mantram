/**
 * Avatar Prompt Builder — Mantram AI Avatar Studio
 *
 * Pure function module: no I/O, no async, fully deterministic.
 * Exports buildAvatarPrompt(options) + all mapping constants.
 *
 * THREE GENERATION MODES (dispatched by avatar-studio.js routes):
 *   1. 'structured'   — full option selector (origin, age, gender, clothing, env, lighting)
 *   2. 'directPrompt' — user writes the full prompt, bypasses all selectors
 *   3. 'reference'    — reference image + optional directPrompt, routed to multimodal pipeline
 *
 * RULES enforced here (not in frontend):
 *  1. Fixed prefix: mid-shot, direct eye contact, 9:16 — always applied in structured mode
 *  2. genderExpression is required in structured mode — throws if missing
 *  3. No age numbers / banned age terms — stripped via regex (structured + directPrompt)
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
const BANNED_AGE_PATTERNS = /\b(\d+)\s*(?:year[s]?\s*old|yr[s]?\s*old|y\.?o\.?)|\b(?:teen(?:age[r]?)?|juvenile|minor|underage|elderly|geriatric|senior\s+citizen)\b/gi;

// ─── Fixed cinematic constraints (applied in structured mode always) ──────────
const FIXED_PREFIX = 'mid-shot portrait photograph, subject facing directly toward camera with natural direct confident eye contact, 9:16 vertical aspect ratio';
const FIXED_SUFFIX = 'photorealistic, commercial photography quality, sharp focus on subject face and upper body, professional post-processing, authentic skin texture';

/**
 * Build a photorealistic avatar prompt from structured options.
 * MODE: 'structured'
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
    const originDesc     = ORIGIN_MAP[origin]          || ORIGIN_MAP['south-asian'];
    const ageDesc        = AGE_MAP[ageRange]            || AGE_MAP['adult'];
    const genderDesc     = GENDER_MAP[genderExpression];
    const clothingDesc   = CLOTHING_MAP[clothingStyle]  || CLOTHING_MAP['smart-casual'];
    const envDesc        = ENVIRONMENT_MAP[environment] || ENVIRONMENT_MAP['minimalist'];
    const lightingDesc   = LIGHTING_MAP[lightingMood]   || LIGHTING_MAP['natural-daylight'];

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
 * Build a prompt for directPrompt mode.
 * MODE: 'directPrompt'
 *
 * User-supplied prompt is sanitised (age terms stripped) then wrapped with
 * the mandatory cinematic suffix so output quality is consistent.
 * No fixed prefix is applied — user controls the full framing.
 *
 * @param {string} directPrompt - User's raw prompt string
 * @returns {string} Sanitised + suffixed prompt
 */
export function buildDirectPrompt(directPrompt = '') {
    if (!directPrompt.trim()) {
        const err = new Error('directPrompt cannot be empty');
        err.status = 400;
        throw err;
    }

    const sanitised = directPrompt
        .replace(BANNED_AGE_PATTERNS, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 1000); // generous cap for creative prompts

    // Append fixed quality suffix (still enforced) but NOT the mid-shot / 9:16 prefix
    return `${sanitised}. ${FIXED_SUFFIX}`;
}

/**
 * Build a prompt for reference image mode.
 * MODE: 'reference'
 *
 * When reference images are provided, the prompt describes what CHANGES to make
 * relative to the reference — maintaining likeness, changing environment/style.
 * Routes to laozhangMultimodalImageGenerate (not laozhangImageGenerate).
 *
 * @param {string} [referenceDescription] - Optional instruction for the reference
 * @param {Object} [structuredOptions]    - Optional structured fields to mix in
 * @returns {string} Reference-mode prompt
 */
export function buildReferencePrompt(referenceDescription = '', structuredOptions = {}) {
    const baseInstruction = referenceDescription.trim()
        || 'Maintain the exact face and likeness of the person in the reference image.';

    const sanitised = baseInstruction
        .replace(BANNED_AGE_PATTERNS, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .substring(0, 500);

    // Optionally inject environment or lighting if structured options provided
    const extras = [];
    if (structuredOptions.environment && ENVIRONMENT_MAP[structuredOptions.environment]) {
        extras.push(ENVIRONMENT_MAP[structuredOptions.environment]);
    }
    if (structuredOptions.lightingMood && LIGHTING_MAP[structuredOptions.lightingMood]) {
        extras.push(LIGHTING_MAP[structuredOptions.lightingMood]);
    }
    if (structuredOptions.clothingStyle && CLOTHING_MAP[structuredOptions.clothingStyle]) {
        extras.push(CLOTHING_MAP[structuredOptions.clothingStyle]);
    }

    const parts = [sanitised, ...extras, FIXED_SUFFIX];
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
    '3:4':   '1024x1365',  // Tall portrait
};

export default { buildAvatarPrompt, buildDirectPrompt, buildReferencePrompt, ORIGIN_MAP, AGE_MAP, GENDER_MAP, CLOTHING_MAP, ENVIRONMENT_MAP, LIGHTING_MAP, RATIO_TO_SIZE };

/*
================================================================================
STEP 12 — EXAMPLE INPUTS + EXPECTED OUTPUTS (documentation, not executable code)
================================================================================

── MODE: structured ──────────────────────────────────────────────────────────

Input:
  origin: 'south-asian', gender: 'feminine', ageRange: 'adult',
  clothingStyle: 'smart-casual', environment: 'office', lightingMood: 'natural-daylight',
  additionalDetails: 'red dupatta'

Expected output (roughly):
  "mid-shot portrait photograph, subject facing directly toward camera with natural direct
  confident eye contact, 9:16 vertical aspect ratio. feminine presenting, late-twenties to
  thirties appearance, confident composed bearing, professional maturity, South Asian features,
  warm golden-brown complexion, expressive dark eyes, defined brow architecture. smart-casual
  attire — neat collared shirt or tailored blouse, clean well-fitted trousers. sleek contemporary
  open-plan office background, panoramic window light flooding in, modern desk and city view in
  soft focus. soft diffused natural daylight, gentle window-direction key illumination, clean
  even exposure. red dupatta. photorealistic, commercial photography quality, sharp focus on
  subject face and upper body, professional post-processing, authentic skin texture"

── MODE: directPrompt ────────────────────────────────────────────────────────

Input:
  directPrompt: "A confident Indian woman in a red saree standing on a rooftop at sunset with city skyline behind her"

Expected output:
  "A confident Indian woman in a red saree standing on a rooftop at sunset with city skyline
  behind her. photorealistic, commercial photography quality, sharp focus on subject face and
  upper body, professional post-processing, authentic skin texture"

Note: no mid-shot/9:16 prefix — user controls framing in directPrompt mode.
Banned age patterns ("23 years old", "teenage") would be stripped before output.

── MODE: reference ───────────────────────────────────────────────────────────

Input:
  referenceImageUrls: ['https://s3.../ref-face.jpg']
  referenceDescription: 'Keep exact face and skin tone. Change to a minimalist white studio background with professional business attire.'
  structuredOptions: { environment: 'minimalist', lightingMood: 'studio-bright' }

Expected prompt sent to laozhangMultimodalImageGenerate():
  "Keep exact face and skin tone. Change to a minimalist white studio background with
  professional business attire. clean seamless studio backdrop, neutral warm-white gradient,
  professional high-key photography studio setup. clean high-key studio lighting, twin softbox
  setup, bright even commercial light, no harsh shadows. photorealistic, commercial photography
  quality, sharp focus on subject face and upper body, professional post-processing, authentic
  skin texture"

The reference image is passed as imageUrls[0] to the multimodal endpoint.
The LaoZhang client pre-fetches it server-side to avoid CDN 403 blocks.
================================================================================
*/

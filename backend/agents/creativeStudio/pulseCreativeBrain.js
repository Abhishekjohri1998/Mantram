/**
 * Pulse Creative Brain (v1 — June 2026)
 *
 * Adapts the full Unified Creative Engine for Pulse Studio's productDNA context.
 * Pulse tools don't have a Brand DB record — they operate on productDNA + mood direction.
 * This module bridges that gap: productDNA → brandContext string → full creative pipeline.
 *
 * Three new intelligence layers over the base engine:
 *   1. Typography DNA  — font weight, style, letter-spacing extracted from product URL scan
 *   2. Human Presence  — avatar config (origin, gender, age, clothing, intent) from UI
 *   3. Design Elements — layout grid, accent shapes, texture directives for post-AI-slop output
 */

import { callAgent } from '../shared/agentUtils.js';
import {
    ORIGIN_MAP,
    AGE_MAP,
    GENDER_MAP,
    CLOTHING_MAP,
    ENVIRONMENT_MAP,
} from '../avatarStudio/avatarPromptBuilder.js';

// ── Human intent descriptions (Pulse-specific, extends avatarPromptBuilder) ────
const INTENT_DESCRIPTIONS = {
    'in-use':       'Person is ACTIVELY USING the product — hands engaged, caught mid-action, product central',
    'lifestyle':    'Person in a LIFESTYLE SCENE where the product fits naturally — present but not forced',
    'spokesperson': 'Person FACES THE CAMERA DIRECTLY — confident, engaging, product visible but they are the hero',
    'ambient':      'Person in the BACKGROUND or EDGE of frame — human presence without being the focal point',
};

// ── Typography personality → visual copy style mapper ──────────────────────────
const TYPO_STYLE_MAP = {
    'bold-display':   'oversized heavy geometric weight, maximum contrast, all-caps, high punch',
    'serif-elegant':  'refined fine letterforms, classical proportion, gold or cream on dark, quiet luxury',
    'sans-minimal':   'clean neutral sans-serif, clinical precision, tight tracking, confident restraint',
    'handwritten':    'organic warm brush energy, intentionally imperfect, authentic hand-crafted feel',
    'editorial':      'editorial magazine style, dramatic size contrast, stark black/white, art-directed',
    'tech-precision': 'monospace or geometric sans, cool tones, technical precision, engineering confidence',
    'playful':        'rounded soft letterforms, warm friendly weight, expressive varied sizes',
};

// ──────────────────────────────────────────────────────────────────────────────
// BUILD BRAND CONTEXT STRING from productDNA + mood + typographyDNA
// This is the equivalent of loadBrandContext() for Pulse's productDNA world
// ──────────────────────────────────────────────────────────────────────────────
export function buildPulseBrandContext(productDNA, typographyDNA, moodDirection) {
    const colors = (productDNA?.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .slice(0, 6)
        .map(c => `  • ${c.name} (${c.hex}) — ${c.role || 'accent'}`)
        .join('\n');

    const moodLabel = moodDirection?.label || productDNA?.defaultMoodDirection || 'Professional';
    const moodDesc = moodDirection?.description || '';
    const shootDir = moodDirection?.shootDirective || '';

    const typoStyle = typographyDNA?.brandToneFromType
        ? TYPO_STYLE_MAP[typographyDNA.brandToneFromType] || typographyDNA.brandToneFromType
        : 'bold-display';

    const usps = (productDNA?.keySellingPoints || []).slice(0, 5).join(' | ');
    const materials = productDNA?.materials || '';
    const surfaceFinish = productDNA?.surfaceFinish || '';
    const moodTags = (productDNA?.moodTags || []).slice(0, 5).join(', ');

    return `<brand_bible>
PRODUCT: ${productDNA?.productCategory || 'Consumer Product'}
BRAND IDENTITY: ${productDNA?.brandPersonality || 'Premium, modern, quality-focused'}
TARGET AUDIENCE: ${productDNA?.targetAudienceProfile || 'Discerning consumers seeking quality'}
KEY USPs: ${usps || 'Premium quality, distinctive design'}

VISUAL DNA:
  Visual Design Style: ${moodLabel} — ${moodDesc}
  Image Mood: ${moodTags || 'Premium, aspirational, editorial'}
  Photography Direction: ${shootDir || 'Professional studio lighting, clean backdrop'}
  ${materials ? `Materials & Finish: ${materials}${surfaceFinish ? ` — ${surfaceFinish}` : ''}` : ''}

PRODUCT COLOURS (LOCKED — DO NOT CHANGE):
${colors || '  • Deep premium tones matching product'}

TYPOGRAPHY PERSONALITY (HARD CONSTRAINT — each brand must look typographically unique):
  ${typographyDNA ? `
  Font Weight: ${typographyDNA.fontWeight || 'bold'}
  Type Style: ${typographyDNA.typeStyle || 'sans-serif'}
  Letter Spacing: ${typographyDNA.letterSpacing || 'normal'}
  Visual Style: ${typoStyle}
  Source: ${typographyDNA.source === 'url' ? 'Extracted from product URL' : 'Brand DNA'}
  ` : 'Bold display sans-serif — strong, clear, product-forward'}

DESIGN RULES:
  • Product colors must be preserved exactly in all generated imagery
  • Visual hierarchy: one dominant focal point, clear supporting context
  • Anti-AI-slop: specificity, brand point of view, and real emotion are mandatory
  • ${moodLabel} aesthetic governs all visual choices

DESIGN AVOID:
  • Generic floating products on plain gradients
  • Retouched model aesthetic (real, specific moments only)
  • Watermarks, logos, brand names rendered in images
  • Muddy palettes or color inconsistency with product
</brand_bible>`;
}

// ──────────────────────────────────────────────────────────────────────────────
// BUILD HUMAN PRESENCE DIRECTIVE from avatarConfig
// ──────────────────────────────────────────────────────────────────────────────
export function buildHumanDirective(avatarConfig) {
    if (!avatarConfig || !avatarConfig.enabled) {
        return `🚫 NO HUMAN REQUESTED — Generate product/lifestyle focused creative without human faces.
The Creative Director MAY include hands or partial human elements only if it dramatically serves the composition.`;
    }

    const originDesc   = ORIGIN_MAP[avatarConfig.origin]    || ORIGIN_MAP['south-asian'];
    const ageDesc      = AGE_MAP[avatarConfig.age]          || AGE_MAP['adult'];
    const genderDesc   = GENDER_MAP[avatarConfig.gender]    || 'confident presenting';
    const clothingDesc = CLOTHING_MAP[avatarConfig.clothing] || CLOTHING_MAP['smart-casual'];
    const intentDesc   = INTENT_DESCRIPTIONS[avatarConfig.intent] || INTENT_DESCRIPTIONS['lifestyle'];

    return `👤 HUMAN IS REQUESTED — Feature a person in this creative:

APPEARANCE: ${genderDesc}, ${ageDesc}, ${originDesc}
CLOTHING: ${clothingDesc}
INTENT: ${avatarConfig.intent} — ${intentDesc}
${avatarConfig.environment ? `ENVIRONMENT: ${ENVIRONMENT_MAP[avatarConfig.environment] || ''}` : ''}

CRITICAL CASTING RULES:
→ Cast demographics from the brand's target audience — NEVER default to generic Western appearance for Indian/Asian D2C brands
→ The person must look REAL and SPECIFIC, not a retouched stock model
→ Define the FEELING first (${avatarConfig.intent === 'in-use' ? 'focused engagement' : avatarConfig.intent === 'spokesperson' ? 'confident authority' : 'effortless lifestyle'}) — the pose follows naturally
→ AGE must match the described age range — do NOT default to 25-year-old unless that is explicitly the target
→ Emotion is AUTHENTIC — caught in a real moment, not posed for camera (except spokesperson mode)`;
}

// ──────────────────────────────────────────────────────────────────────────────
// PULSE CREATIVE ENGINE PROMPT
// Extends UNIFIED_CREATIVE_ENGINE_PROMPT with: typography DNA, human directive, design elements
// ──────────────────────────────────────────────────────────────────────────────
export function PULSE_CREATIVE_ENGINE_PROMPT(brandContext, aspectRatio = '1:1', generateCopy = false, format = 'instagram-post', humanDirective = '', typographyDNA = null) {
    const textEnabled = !!generateCopy;

    return `You are a Creative Team of four — simultaneously an Art Director, Prompt Engineer, Copywriter, and Brand Typographer — operating as the Pulse Creative Brain for a D2C brand's marketing creative. You execute all four roles in ONE reasoning pass.

Your output drives image generation AI (GPT Image 2 / Flux / NanoBanana / Gemini Imagen). Be hyper-specific and visual.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE BRAND IDENTITY (YOUR ANCHOR — READ EVERY LINE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${brandContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CANVAS SPECIFICATION — ${aspectRatio}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Aspect Ratio: ${aspectRatio}
Orientation: ${aspectRatio === '9:16' ? 'VERTICAL — tall portrait (Story/Reel). Primary zone: top 60%.' : aspectRatio === '16:9' || aspectRatio === '3.2:1' ? 'HORIZONTAL — wide landscape (Facebook/LinkedIn/Banner). Subject left or center, space right.' : aspectRatio === '4:5' ? 'NEAR-SQUARE PORTRAIT — Instagram Feed / Pinterest Pin. Product centered with breathing room.' : aspectRatio === '2:3' ? 'PORTRAIT — Pinterest/Magazine. Vertical flow, top-to-bottom reading order.' : 'SQUARE — equal sides. Symmetric or slightly off-center composition.'}
Compose the image specifically for this canvas. Never center-crop a horizontal composition into a vertical format.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROLE 1 — ART DIRECTOR: Creative Vision
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NON-NEGOTIABLES (priority order):
1. BRIEF IS KING — The user's CREATIVE BRIEF defines SUBJECT and THEME. Brand DNA defines AESTHETIC.
2. BRAND FIDELITY — Product colours are LOCKED. Visual Design Style, Image Mood, Typography Personality are hard constraints.
3. FORMAT FIDELITY — Compose for the canvas above. 9:16 vertical ≠ 1:1 square ≠ 16:9 horizontal.
4. MARKETING JOB — Every image stops scroll → holds attention → builds want → drives action.
5. ANTI-AI-SLOP — Generic AI output is skipped in 2026. Specificity, brand point of view, and real emotion are the antidote.

2026 DESIGN AESTHETIC — Pick the ONE that fits brand + brief:
1. EDITORIAL BRUTALISM — Oversized bold type carved into frame, stark contrast, intentional ugly-beauty
2. SOFT LUXURY — Whisper-quiet elegance, muted tones, extreme negative space, silk/cashmere
3. NEON NOIR — Deep blacks with surgical neon accents, cinematic shallow DOF, urban night
4. COASTAL MAXIMALISM — Saturated tropicals, layered organic textures, joyful abundance
5. ANALOG REVIVAL — Film grain, Kodak Portra colour science, hand-developed imperfection (anti-AI-slop signal)
6. SOLARPUNK OPTIMISM — Lush biophilia, warm gold + verdant green, tech integrated with nature
7. AI-NATIVE SURREALISM — Impossible physics used INTENTIONALLY — not accidentally
8. DARK ACADEMIA — Jewel tones, leather and parchment, warm candlelit drama
9. TECH INDUSTRIAL — Brushed metal, cold blue-white, precision engineering minimalism
10. WARM MAXIMALISM — Terracotta + cream + burnt mustard, organic curves, dopamine-rich
11. POST-AESTHETIC — Just product, lit honestly, in a real environment. Confidence through restraint.
12. INDIA NEW LUXE — Muted handloom textures, brass + jade + ivory palette, contemporary cultural cues

PRODUCT INTEGRATION LOGIC:
→ Product-focused brief → HERO PRODUCT (70-80% of frame)
→ Thematic brief → SUPPORTING PRODUCT (30-40%), naturally placed in scene
→ Occasion/greeting → AMBIENT (10-20%), brand atmosphere dominates
→ Brand identity → NO PRODUCT — pure brand visual world

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUMAN PRESENCE DIRECTIVE (from user configuration)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${humanDirective || '🚫 NO HUMAN REQUESTED — product and lifestyle focused, no faces required.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROLE 2 — PROMPT ENGINEER: Image Generation Prompt
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write primaryPrompt as a FOCUSED, VISUAL DESCRIPTION (80-130 words). Shorter, keyword-rich prompts outperform verbose prose.

PROMPT STRUCTURE: [canvas orientation + visual style], [hero subject + action or human + product interaction], [environment + atmosphere], [lighting — specific source and quality], [brand-palette environmental surfaces — NO hex codes], [one specific texture], [quality anchors].

Front-load the most important visual element in the first 8 words (that's 80% of the model's attention).
COLOUR: describe by appearance — "deep forest green", "dusty rose". NEVER hex codes.
QUALITY ANCHORS (end every prompt with): "editorial lifestyle photography, natural 35mm film grain, raw tactile textures, authentic skin detail, candid unposed framing, soft directional shadows, atmospheric color grading, cinematic realism"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN ELEMENTS INTELLIGENCE (Pulse-specific — anti-product-slop layer)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYOUT GRID: Apply a clear visual hierarchy — primary focal point (60%), secondary information (25%), breathing space (15%). Never fill every pixel.

DESIGN ACCENT (use ONE — describe precisely in prompt):
  A. Geometric shape overlay — a circle, arc, or diagonal cut as a compositional frame around the product
  B. Texture layer — paper grain, fabric weave, or concrete noise for depth and anti-AI authenticity
  C. Color block split — background divided by brand accent color creating visual tension
  D. Light element — a light leak, caustic pattern through glass, or gradient flare (atmospheric, not cheesy)
  E. Typography as design element — if copy enabled, the headline occupies a DELIBERATE compositional space

MANDATORY DESIGN RULES:
→ Depth: foreground + hero + atmospheric background creates dimensionality (never flat)
→ Lighting: one strong directional source with real shadows (flat lighting is invisible on a feed)
→ Texture: at least ONE rich physical texture (grain, fabric, condensation, glass, metal, leather)
→ Point of view: the brand has an opinion about the world — the image must show it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROLE 3 — BRAND TYPOGRAPHER & COPYWRITER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${textEnabled ? `TEXT IS ENABLED for this generation. Populate copy fields.

TYPOGRAPHY DNA (from brand's typographic personality — HARD CONSTRAINT):
${typographyDNA ? `
  • Font weight: ${typographyDNA.fontWeight || 'bold'} — ${typographyDNA.fontWeight === 'light' || typographyDNA.fontWeight === 'thin' ? 'featherweight elegance, fine strokes' : typographyDNA.fontWeight === 'bold' || typographyDNA.fontWeight === 'black' ? 'dominant heavy weight, commanding presence' : 'balanced readable weight'}
  • Type style: ${typographyDNA.typeStyle || 'sans-serif'} — ${typographyDNA.typeStyle === 'serif' ? 'classical refined letterforms, editorial authority' : typographyDNA.typeStyle === 'handwritten' ? 'organic brush energy, authentic warmth' : 'clean geometric precision'}
  • Letter spacing: ${typographyDNA.letterSpacing || 'normal'} — ${typographyDNA.letterSpacing === 'wide' || typographyDNA.letterSpacing === 'very-wide' ? 'generous open tracking, premium air' : typographyDNA.letterSpacing === 'tight' ? 'tight condensed impact' : 'standard rhythm'}
  • Visual style: ${typographyDNA.brandToneFromType ? (TYPO_STYLE_MAP[typographyDNA.brandToneFromType] || typographyDNA.brandToneFromType) : 'bold display sans-serif'}
` : '  Bold display weight, clean sans-serif, high contrast — brand-forward typography'}

HEADLINE RULES (ABSOLUTE):
- 2-6 WORDS MAXIMUM — count them, not one more
- DERIVE from the ACTUAL BRIEF + PRODUCT BENEFIT — never invent a generic aspiration word
- FORBIDDEN WORDS: "Evolve", "Rise", "Empower", "Inspire", "Ignite", "Lead", "Thrive", "Innovation", "Excellence", "Masterpiece", "Greatness", "Conquer", "Unstoppable", "Unlock", "Elevate", "Supercharge", "Transform", "Revolutionize"
- Good: "Shot on iPhone" | "Just Do It" | "50% Off. Today Only." | "Music for Every Mood"
- Bad: "Elevate Your Lifestyle With Premium Quality" — generic, long, zero punch

HEADLINE AS DESIGN ELEMENT:
→ The headline must occupy a DELIBERATE space in the composition — not centered generic floating text
→ Size contrast: headline at least 3× larger than supporting text
→ Negative space: minimum 10% padding around text, nothing touching edges
→ Color: text must achieve minimum 4.5:1 contrast ratio against background
` : `🚫 NO TEXT ON IMAGE — This image communicates entirely through composition, lighting, colour, texture, and subject. Set all copy fields to null.`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANTI-HALLUCINATION RULES (non-negotiable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER render brand names, logos, hex codes, font names, or metadata in any prompt field
2. PRODUCT COLOURS from Brand Bible above → LOCKED. Describe by appearance, not hex code.
3. DESIGN AVOID list → ABSOLUTE PROHIBITION
4. Human casting → ONLY if human directive above says YES

RESPOND with valid JSON only — no markdown, no code fences:
{
  "mood": "energetic | calm | luxurious | playful | bold | sophisticated | warm | festive | hypnotic | raw | ethereal | confident",
  "visualStyle": "photorealistic | cinematic | editorial | illustrated | 3d-render | minimal | surrealist | analog-film",
  "designTrend": "Name of chosen 2026 aesthetic and one-sentence rationale for why it fits this product + brief",
  "productIntegration": "hero | supporting | ambient | none",
  "humanPresence": ${JSON.stringify(!!humanDirective && humanDirective.includes('👤 HUMAN IS REQUESTED'))},
  "composition": "Precise layout — what is in foreground, midground, background. Reference canvas orientation explicitly.",
  "lightingDirection": "Hyper-specific: light source type, direction, colour temperature, shadow quality",
  "designAccent": "Which of A/B/C/D/E design accent was chosen and precisely how it appears in the image",
  "scrollStopFactor": "The ONE unexpected visual element that breaks the feed pattern and forces the viewer to pause",
  "primaryPrompt": "80-130 word image generation prompt — one flowing paragraph, front-loaded with canvas orientation + hero subject, ending with quality anchors",
  "negativePrompt": "CGI plastic skin, centered floating product on plain gradient, watermark, border, logo, brand name, text artifacts, hex codes, generic AI aesthetic, flat lighting, stock photo pose",
  "styleModifiers": "editorial lifestyle photography, 35mm film aesthetic, raw tactile texture, candid unposed gesture, natural ambient light, authentic skin detail, cinematic color science",
  "copyHeadline": ${textEnabled ? '"2-6 word headline derived from the brief — or null"' : 'null'},
  "copySubtext": ${textEnabled ? '"Supporting phrase max 8 words — or null"' : 'null'},
  "copyCta": ${textEnabled ? '"2-4 word CTA button text — or null"' : 'null'},
  "copyTextStyle": ${textEnabled ? '"Typography style matching brand personality — e.g. bold white geometric sans-serif on dark overlay — or null"' : 'null'},
  "engineeringNotes": "2-3 sentence rationale: design trend chosen and why it fits, the key creative decision, and what makes this image scroll-stopping"
}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// BUILD USER PROMPT for the Pulse Creative Engine
// ──────────────────────────────────────────────────────────────────────────────
function buildPulseUserPrompt({ brief, format, platformId, platformHint, productDNA, moodDirection }) {
    const FORMAT_LABELS = {
        'instagram-post':  'Instagram Post (1080×1350, 4:5)',
        'instagram-story': 'Instagram Story / Reel (1080×1920, 9:16)',
        'facebook':        'Facebook Post (1200×630, 16:9)',
        'twitter_x':       'Twitter/X Post (1200×675, 16:9)',
        'linkedin':        'LinkedIn Post (1200×627, 16:9)',
        'pinterest':       'Pinterest Pin (1000×1500, 2:3)',
        'brochure-front':  'A4 Brochure Front Cover (portrait, A4)',
        'brochure-back':   'A4 Brochure Back Panel (landscape, A4)',
        'landing-hero':    'Landing Page Hero (1920×800, wide)',
        'banner':          'Website Banner (1920×600, 3.2:1)',
    };

    const productMeta = [
        `PRODUCT: ${productDNA?.productCategory || 'Consumer Product'}`,
        productDNA?.keySellingPoints?.length ? `KEY SELLING POINTS: ${productDNA.keySellingPoints.slice(0, 4).join(' | ')}` : '',
        productDNA?.materials ? `MATERIALS: ${productDNA.materials}` : '',
        productDNA?.surfaceFinish ? `SURFACE FINISH: ${productDNA.surfaceFinish}` : '',
    ].filter(Boolean).join('\n');

    return [
        `CREATIVE BRIEF: ${brief || 'Create a compelling marketing visual for this product'}`,
        `FORMAT: ${FORMAT_LABELS[format] || format || 'Instagram Post'}`,
        platformHint ? `PLATFORM CONTEXT: ${platformHint}` : '',
        `MOOD DIRECTION: ${moodDirection?.label || 'Professional'} — ${moodDirection?.description || ''}`,
        moodDirection?.shootDirective ? `SHOOT STYLE: ${moodDirection.shootDirective}` : '',
        '',
        productMeta,
    ].filter(Boolean).join('\n');
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT: runPulseCreativeBrain()
// Called by brand-studio.js routes instead of simple prompt strings
// ──────────────────────────────────────────────────────────────────────────────
export async function runPulseCreativeBrain({
    productDNA,
    moodDirection,
    brief,
    format = 'instagram-post',
    aspectRatio = '1:1',
    avatarConfig = null,    // { enabled, origin, gender, age, clothing, intent, environment }
    typographyDNA = null,   // { fontWeight, typeStyle, letterSpacing, brandToneFromType, source }
    generateCopy = false,
    platformId = null,
    platformHint = '',
}) {
    const brandContext  = buildPulseBrandContext(productDNA, typographyDNA, moodDirection);
    const humanDirective = buildHumanDirective(avatarConfig);

    const systemPrompt = PULSE_CREATIVE_ENGINE_PROMPT(
        brandContext, aspectRatio, generateCopy, format, humanDirective, typographyDNA
    );

    const userPrompt = buildPulseUserPrompt({
        brief, format, platformId, platformHint, productDNA, moodDirection
    });

    console.log(`🧠 Pulse Creative Brain: ${format} | human=${!!(avatarConfig?.enabled)} | copy=${generateCopy} | typo=${typographyDNA?.source || 'none'}`);
    const startMs = Date.now();

    const result = await callAgent(
        systemPrompt,
        userPrompt,
        0.65,
        3500,
        { provider: 'anthropic', timeoutMs: 120_000 }
    );

    console.log(`⚡ Pulse Creative Brain done in ${Date.now() - startMs}ms — trend: ${result.designTrend?.split(' ')[0] || '?'} | human: ${result.humanPresence} | headline: "${result.copyHeadline || 'none'}"`);
    return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY EXTRACTOR — Lightweight vision/text analysis of product URL
// Returns typographyDNA object from scraped HTML or product images
// ──────────────────────────────────────────────────────────────────────────────
export async function extractTypographyDNA(productUrl, scrapedHtml = '', brandImages = []) {
    if (!productUrl && !scrapedHtml && !brandImages.length) {
        return null;
    }

    const analysisPrompt = `You are a typography and visual design analyst. Analyze the brand's digital presence from the provided HTML/content and determine their typographic personality.

${scrapedHtml ? `SCRAPED PAGE CONTENT (analyze font references, heading styles, CSS hints, copy tone):
${scrapedHtml.substring(0, 2000)}` : ''}
${productUrl ? `PRODUCT URL: ${productUrl}` : ''}

Extract typographic signals to determine this brand's visual personality. Look for:
- CSS font-family references (Google Fonts, system fonts, custom font names)
- Heading weight patterns (h1-h3 bold vs thin)
- Letter-spacing patterns (uppercase headers suggest wide tracking)
- Overall copy tone (luxury brands use restrained copy, bold brands use short punchy copy)
- Color contrast patterns (high contrast = bold brand, soft contrast = luxury brand)

Return ONLY valid JSON:
{
  "fontWeight": "thin | light | regular | medium | bold | black",
  "typeStyle": "serif | sans-serif | display | handwritten | monospace",
  "letterSpacing": "tight | normal | wide | very-wide",
  "textTransform": "none | uppercase | lowercase",
  "colorContrast": "high-contrast | soft-contrast | monochrome",
  "brandToneFromType": "bold-display | serif-elegant | sans-minimal | handwritten | editorial | tech-precision | playful",
  "detectedFontHints": ["Any font names found in HTML/CSS"],
  "confidence": "high | medium | low",
  "reasoning": "1-2 sentence explanation of why you chose these values"
}`;

    try {
        const result = await callAgent(
            'You are a typography analyst. Analyze brand typography signals and return ONLY valid JSON.',
            analysisPrompt,
            0.3,
            600,
            { preferFast: true }
        );
        if (result && result.fontWeight) {
            result.source = 'url';
            console.log(`🔤 Typography DNA extracted: ${result.brandToneFromType} (${result.confidence} confidence) — ${result.reasoning || ''}`);
            return result;
        }
    } catch (err) {
        console.warn('⚠️ Typography extraction failed (non-blocking):', err.message);
    }
    return null;
}

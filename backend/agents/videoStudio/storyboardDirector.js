/**
 * Storyboard Director — Claude-powered Ad Film Storyboard Generator
 *
 * Takes product + avatars (multiple) + ref images + brief → writes a 4-section structured storyboard plan:
 *
 *   Section 1 — Character + Product DNA
 *     colorPalette, paletteNames, materialNotes
 *
 *   Section 2 — Environment / Set Design
 *     environmentFingerprint (single set description locked across the whole video)
 *
 *   Section 3 — Cut Plan
 *     cuts[] — each cut has: id, lens, duration, move, shot, scene, framePrompt
 *     totalDuration (sum of all cut durations)
 *
 *   Section 4 — Lighting / Mood / Style
 *     moodKeywords, cinematographyRules, emotionalArc
 *
 * Additionally outputs:
 *   imagePrompt — a rich grid-poster prompt built from ALL cuts (dynamic panel count)
 *   narrativeArc, hookStrategy — story-level metadata
 *
 * The structuredPlan is stored in MongoDB and used at animate-time to build
 * a precise, timed video prompt — not inferred from a grid image thumbnail.
 */

import { loadBrandContext, callMultimodalAgent } from '../shared/agentUtils.js';

const MIN_SHOT_DURATION = 2;  // seconds per cut
const MAX_SHOT_DURATION = 15; // Seedance I2V max per segment

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic panel builder — generates storyboard panel descriptions from cuts[]
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a dynamic storyboard panel block for the imagePrompt.
 * Shows all cuts up to MAX_VISIBLE_PANELS (8), split into rows of 5 for 6+ cuts.
 * @param {Array} cuts — the cuts[] array from the storyboard plan
 * @param {number} duration — total video duration in seconds
 * @returns {string} storyboard panel block text
 */
function buildDynamicPanelBlock(cuts = [], duration = 30) {
    const MAX_VISIBLE = 8;
    const visible = cuts.slice(0, MAX_VISIBLE);
    const panelCount = visible.length || 5;

    if (panelCount <= 5) {
        // Single row
        const panels = visible.map((cut, i) => (
            `  - Panel ${i + 1} (Cut ${cut.id || i + 1}): ${cut.scene || cut.framePrompt || `Shot ${i + 1}`} (max 12 words).`
        )).join('\n');
        return `- A clean horizontal row of ${panelCount} storyboard panels showing:\n${panels}
- Below each panel, include clear black typography: 'Lens | Duration | Move | Shot Type'.`;
    } else {
        // Two rows for 6–8 panels
        const row1 = visible.slice(0, 5);
        const row2 = visible.slice(5);
        const panelsRow1 = row1.map((cut, i) => (
            `  - Panel ${i + 1} (Cut ${cut.id || i + 1}): ${cut.scene || cut.framePrompt || `Shot ${i + 1}`} (max 12 words).`
        )).join('\n');
        const panelsRow2 = row2.map((cut, i) => (
            `  - Panel ${i + 6} (Cut ${cut.id || i + 6}): ${cut.scene || cut.framePrompt || `Shot ${i + 6}`} (max 12 words).`
        )).join('\n');
        return `- ROW 1 (Cuts 1–5) horizontal panels:\n${panelsRow1}
- ROW 2 (Cuts 6–${panelCount}) horizontal panels:\n${panelsRow2}
- Below each panel, include clear black typography: 'Lens | Duration | Move | Shot Type'.
- Note: ${cuts.length - MAX_VISIBLE > 0 ? `${cuts.length - MAX_VISIBLE} additional cuts are planned but not shown in this poster.` : ''}`;
    }
}

/**
 * Build a dynamic CHARACTER REFERENCE block for the imagePrompt.
 * Handles 1–4 named characters.
 * @param {Array} avatarNames — array of character names e.g. ['Riya', 'Arjun']
 * @returns {string}
 */
function buildCharacterReferenceBlock(avatarNames = []) {
    if (avatarNames.length === 0) {
        return `- CHARACTER REFERENCE: 6 panels showing the presenter/model from angles (front, side, back, face close-up, side close-up, wardrobe detail).`;
    }
    if (avatarNames.length === 1) {
        return `- CHARACTER REFERENCE: 6 panels showing Character "${avatarNames[0]}" from angles (front, side, back, face close-up, side close-up, wardrobe detail).`;
    }
    // Multiple characters — one panel per character
    const charPanels = avatarNames.map(name => `"${name}" (front view + face close-up)`).join(', ');
    return `- CHARACTER REFERENCE: ${avatarNames.length} panels — one per character: ${charPanels}. Label each panel with the character name.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT TYPE AUTO-DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detect content type from brief + video prompt + brand context.
 * Returns: 'devotional' | 'music_video' | 'documentary' | 'product_ad'
 */
function detectContentType(brief = '', videoPrompt = '', brandContext = '') {
    const combined = `${brief} ${videoPrompt} ${brandContext}`.toLowerCase();

    const devotionalSignals = [
        'devotional', 'bhajan', 'mantra', 'prayer', 'temple', 'god', 'goddess',
        'spiritual', 'sacred', 'divine', 'worship', 'pooja', 'puja', 'aarti',
        'krishna', 'shiva', 'rama', 'durga', 'lakshmi', 'ganesh', 'hanuman',
        'religious', 'holy', 'faith', 'meditation', 'kirtan', 'guru',
        'stotra', 'chalisa', 'stuti', 'vandana',
    ];
    const musicVideoSignals = [
        'music video', 'song', 'track', 'album', 'artist', 'singer', 'band',
        'lyric', 'chorus', 'verse', 'bridge', 'hook', 'beat', 'melody',
        'single', 'music', 'audio', 'soundtrack',
    ];
    const documentarySignals = [
        'documentary', 'brand story', 'brand film', 'company story', 'journey',
        'behind the scenes', 'origin story', 'brand documentary', 'mission',
    ];

    const devotionalScore  = devotionalSignals.filter(w => combined.includes(w)).length;
    const musicScore       = musicVideoSignals.filter(w => combined.includes(w)).length;
    const docScore         = documentarySignals.filter(w => combined.includes(w)).length;

    if (devotionalScore >= 2) return 'devotional';
    if (devotionalScore >= 1 && musicScore >= 1) return 'devotional';
    if (musicScore >= 2) return 'music_video';
    if (docScore >= 2) return 'documentary';
    return 'product_ad';
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Professional 4-Section Storyboard Director
// ─────────────────────────────────────────────────────────────────────────────

function buildStoryboardDirectorPrompt({
    brandContext,
    duration,
    format,
    style,
    dialogueLanguage = 'English',
    brandName = '',
    logoUrl = '',
    logoDescription = '',
    includeBranding = true,
    cuts = [],
    avatarNames = [],
    contentType = 'product_ad', // 'product_ad' | 'music_video' | 'devotional' | 'documentary'
}) {
    const logoTagInstruction = (includeBranding && logoUrl)
        ? `\n- <<<image_logo>>> = brand logo — describe it as: "${logoDescription || 'brand logo'}".`
        : '';
    const logoPromptInstruction = (includeBranding && logoUrl)
        ? `\n- Brand logo: Whenever the logo appears in the grid panels or footer, reference it as "the brand logo (<<<image_logo>>>)".`
        : '';

    const brandDNASection = includeBranding
        ? `═══════════════════════════════════════════════════════
BRAND DNA & CREATIVE ESSENCE
═══════════════════════════════════════════════════════
${brandContext || 'No brand data. Use premium cinematic style throughout.'}`
        : `═══════════════════════════════════════════════════════
CREATIVE STYLE
═══════════════════════════════════════════════════════
No brand data injected (branding toggle is OFF). Use premium cinematic style throughout. Do not include any brand logo, brand name lock-up, or colour palette drawn from brand assets.`;

    // Dynamic storyboard panels from cuts (for imagePrompt field)
    const panelBlock = buildDynamicPanelBlock(cuts, duration);
    const charRefBlock = buildCharacterReferenceBlock(avatarNames);
    const panelCount = Math.min(Math.max(cuts.length, 5), 8);

    // ── Content-type-aware narrative arc and environment strategy ──────────────
    const isDevotional  = contentType === 'devotional';
    const isMusicVideo  = contentType === 'music_video';
    const isDocumentary = contentType === 'documentary';
    const isProductAd   = contentType === 'product_ad';

    // Narrative arc per content type
    const narrativeArcGuide = isDevotional
        ? `SPIRITUAL NARRATIVE ARC (MANDATORY): Follow this devotional emotional journey across ALL cuts:
  AWAKENING (first 15%) → DEVOTION (next 20%) → PRAYER & RITUAL (next 25%) → TRANSCENDENCE (next 25%) → DIVINE PEACE / RESOLVE (final 15%)
  Every cut must advance this arc. Never stay in the same emotional phase for more than 3 consecutive cuts.`
        : isMusicVideo
        ? `MUSIC VIDEO NARRATIVE ARC (MANDATORY): Follow the song structure:
  INTRO / HOOK (first 10%) → VERSE 1 (next 20%) → PRE-CHORUS (5%) → CHORUS (15%) → VERSE 2 (next 15%) → CHORUS REPRISE (10%) → BRIDGE / CLIMAX (15%) → OUTRO (10%)
  Each cut must carry a phase tag in its scene field: [INTRO] / [VERSE 1] / [CHORUS] / etc.`
        : isDocumentary
        ? `DOCUMENTARY NARRATIVE ARC (MANDATORY): Follow a journalistic story structure:
  ESTABLISH THE WORLD (first 15%) → INTRODUCE THE SUBJECT (next 20%) → CONFLICT / CHALLENGE (next 25%) → TURNING POINT (next 20%) → RESOLUTION / IMPACT (final 20%)
  Each cut must feel like a chapter in the real story.`
        : `COMMERCIAL NARRATIVE ARC (MANDATORY): COLD OPEN (intrigue) → BUILD (environment, character) → REVEAL (product hero moment) → DETAIL (macro features) → EMOTION (presenter or lifestyle) → RESOLVE (CTA/brand close)`;

    // Environment strategy per content type
    const environmentSection = (isDevotional || isMusicVideo) && duration > 60
        ? `═══════════════════════════════════════════════════════
SECTION 2 — ENVIRONMENTS / LOCATIONS (MULTIPLE)
═══════════════════════════════════════════════════════
This is a long-form ${isDevotional ? 'devotional' : 'music'} video. Define 3–5 DISTINCT environments/locations that the narrative will travel through. Each environment corresponds to a different emotional phase of the story.

Output an "environments" array (not a single environmentFingerprint). Example structure:
- Environment 1 (AWAKENING phase): description of opening sacred/natural location
- Environment 2 (DEVOTION phase): description of a devotional space — temple, altar, river ghat
- Environment 3 (PRAYER/RITUAL phase): close intimate sacred space — prayer hall, lamp-lit room
- Environment 4 (TRANSCENDENCE phase): open sky, mountaintop, vast sacred landscape
- Environment 5 (RESOLVE/PEACE phase): serene, quiet, golden-hour closing environment

Each cut in your cuts[] MUST include an "environment" field that references which of these environments it takes place in (by number or name). The camera travels between these locations as the story progresses.`
        : `═══════════════════════════════════════════════════════
SECTION 2 — ENVIRONMENT / SET DESIGN
═══════════════════════════════════════════════════════
Define ONE environment (set) that all cuts take place in:
- environmentFingerprint: a single evocative description of the set (e.g. "marble café counter; steam-lit espresso machine; tall street-facing window with soft morning light")
This environment NEVER changes across cuts. The camera moves through it.`;

    // Cut rules per content type
    const cutSpecificRules = isDevotional
        ? `- Each cut MUST show the spiritual narrative progressing — no two consecutive cuts should be emotionally identical
- Include devotional gestures: folded hands, eyes closed in prayer, lighting diyas, offering flowers, ringing bells, prostrating
- Feature sacred objects: diyas, incense, marigold garlands, sacred vessels, holy books, idols
- Include nature as metaphor: flowing river = continuity of faith, rising sun = divine light, lotus = purity
- Camera movements should feel contemplative and deliberate: slow STEADICAM through a temple, TILT-UP to reveal a deity, DOLLY-OUT from prayer to reveal landscape
- AVOID: commercial product shots, talking-head close-ups, product labels, brand CTA, presenter "demonstrating" something
- The character's emotional journey (devotion → surrender → peace) must be visible in their face and posture across cuts`
        : isMusicVideo
        ? `- Each cut must visually sync with the PHASE TAG in its scene field ([VERSE 1], [CHORUS], etc.)
- High energy during chorus: fast WHIP-PAN transitions, DUTCH-TILT, kinetic handheld camera
- Emotional verse moments: slow DOLLY-IN, RACK-FOCUS from environment to face, gentle STEADICAM
- Feature the artist performing, plus narrative storytelling cuts intercut with performance
- AVOID: static talking head close-ups for more than 2 consecutive cuts`
        : isDocumentary
        ? `- Cuts should feel observational and authentic — handheld for intimacy, wide for context
- Mix interview-style framing with B-roll landscape, environment, and detail shots
- Feature real environments, real objects, real moments — no artificial product hero shots
- AVOID: product labels, CTA overlays, commercial aesthetic`
        : `- The product must be visually featured in at least one INSERT/MACRO cut and one LIFESTYLE/IN-USE cut
- Feature at least one TWO-SHOT or GROUP SHOT with multiple characters interacting
- INJECT at least one unexpected, visually striking angle (e.g. extreme low-angle looking up at product, Dutch tilt energy shot, kinetic rack-focus from environment to product)
- Preserve the product's original design, shape, color shades, and branding details faithfully in all scene descriptions and framePrompts. Do NOT simplify, stylize, or modify any physical product attributes or color values.
- AVOID boring talking head or moving head close-ups. Presenters/models must be shown as a proper moving person explaining while actively doing something in the scene (e.g., typing on a laptop, gesturing dynamically at a screen, pointing, walking through the studio set, demonstrating the product, or interacting with props/environments) to ensure it looks very natural.`;

    return `You are an award-winning Ad Film Director and Cinematographer building a professional pre-production storyboard package. Your output is a structured JSON document — NOT a description of a grid image.

The storyboard package has 4 sections, exactly like a real agency pre-production document:

═══════════════════════════════════════════════════════
SECTION 1 — CHARACTER + PRODUCT DNA
═══════════════════════════════════════════════════════
Define the visual identity that must stay consistent across every frame:
- colorPalette: 3 exact hex colors that define the entire visual world
- paletteNames: human-readable names for each color
- materialNotes: the physical materials present in the scene (e.g. "polished marble, walnut wood, brushed brass, ceramic glaze, steam condensation")
${logoTagInstruction}

${environmentSection}

═══════════════════════════════════════════════════════
SECTION 3 — CUT PLAN (THE STORYBOARD)
═══════════════════════════════════════════════════════
Write the exact shot list for ONE continuous video of ${duration} seconds.
Cuts are camera angles / shot changes within the video — NOT separate videos.
${duration > 60 
    ? `DENSITY (MANDATORY): Since this is a long-form video of ${duration} seconds, you MUST write between ${Math.ceil(duration / 12)} and ${Math.ceil(duration / 10)} scenes (cuts) in your cuts[] array to fit within the AI output token limit. The durations of the cuts must sum exactly to ${duration} seconds, with most cuts being 10 to 12 seconds long.`
    : `DENSITY (MANDATORY): Minimum 1 cut per 3 seconds. A ${duration}s video MUST have AT LEAST ${Math.ceil(duration / 3)} cuts. Target ${Math.ceil(duration / 3)} to ${Math.ceil(duration / 2)} cuts. Each cut should be 2–4 seconds for high commercial energy. Never let any single cut exceed 5 seconds unless it is a special slow-motion or reveal moment.`
}

Each cut must have:
- id: sequential number starting at 1
- lens: cinematic lens spec (e.g. "40mm anamorphic", "100mm macro", "85mm prime", "24mm wide-angle", "85mm portrait")
- duration: exact seconds for this cut (integer, min ${MIN_SHOT_DURATION}s, max ${duration > 60 ? 15 : 5}s for normal cuts, up to ${duration > 60 ? 15 : MAX_SHOT_DURATION}s only for special reveal/slow-motion)
- move: camera movement (STEADICAM | DOLLY-IN | DOLLY-OUT | RACK-FOCUS | ARC | PULL-OUT | CRANE | HANDHELD | STATIC | WHIP-PAN | PUSH-IN | MATCH-CUT | TILT-UP | TILT-DOWN | ORBIT)
- shot: shot type (WIDE | MEDIUM | CLOSE-UP | EXTREME-CLOSE-UP | INSERT | MACRO | TWO-SHOT | OVER-SHOULDER | POV | ESTABLISHING | LOW-ANGLE | HIGH-ANGLE | DUTCH-TILT)
- scene: 1 vivid, active-voice sentence — what is VISUALLY HAPPENING right now: use strong motion verbs (slices / pours / emerges / spins / glows / drifts / explodes / contracts / reveals / bursts). E.g. "The amber liquid pours in slow motion into the crystal glass, creating rippling reflections." Not: "Presenter picks up product."
- framePrompt: a 50-60 word VISUAL SCENE DESCRIPTION that goes directly into Seedance AI video generation. This is the most important field. Write it as a precise visual frame:
  • Camera angle + depth of field: "Extreme low angle looking up, bokeh background, razor-sharp product foreground"
  • Lighting: "warm amber key light from camera-left, cool rim light separating subject from background"
  • Subject position + action: "Product @image1 tilted at 30°, slow rotation revealing label detail"
  • Surface interaction: "condensation beads rolling down the glass surface, catching the light"
  • @image reference: always reference provided images by tag (@image1=product, @image2=character)
  Example: "Extreme low-angle, product @image1 rotating 360° on a marble pedestal with warm amber key light, cool blue rim light, condensation visible. Presenter @image2 seen defocused in background, approving. Bokeh sparkle from background lighting rig."
- voiceover: (string) Write a spoken voiceover line or dialogue for this cut in the native script of "${dialogueLanguage}". 
  * Decide if a voiceover is required or not by analyzing the images, product, brand style, brochure text, and user brief. Ads for products, real estate, brochures, tutorials, etc., generally always benefit from voiceover narration to explain features.
  * If voiceover is appropriate, write a natural, compelling spoken line in "${dialogueLanguage}".
  * CRITICAL for localization: The voiceover MUST be written in the native script/characters of "${dialogueLanguage}" (e.g., Devanagari script for Hindi, Cyrillic for Russian, Chinese characters for Mandarin, Spanish text for Spanish). Do not use Latin transliteration.
  * If you decide a voiceover is absolutely not required for a specific cut or the entire video, leave the voiceover field as an empty string "".

RULES FOR CUTS:
- Durations must SUM exactly to ${duration}s
${duration > 60
    ? `- BETWEEN ${Math.ceil(duration / 12)} AND ${Math.ceil(duration / 10)} CUTS ARE REQUIRED in the cuts[] array — this is a hard constraint, not a suggestion. The cuts must sum exactly to ${duration}s.`
    : `- MINIMUM ${Math.ceil(duration / 3)} CUTS REQUIRED — this is a hard constraint, not a suggestion.`
}
${narrativeArcGuide}
- USE ALL THESE SHOT TYPES across your cuts — rotate them for visual variety:
  WIDE (environment) → CLOSE-UP (emotion/face) → MEDIUM (character action) → INSERT/MACRO (detail) → ESTABLISHING/TWO-SHOT (context)
  NO two consecutive cuts may use the same shot type.
- Use professional lens + shot combinations (wide angle for establishing, macro/insert for detail, close-up for emotion, whip-pan for energy transitions)
- If multiple characters are provided, DISTRIBUTE them across cuts — do not show all characters in every cut. Build ensemble storytelling: different characters carry different narrative beats.
${cutSpecificRules}

═══════════════════════════════════════════════════════
SECTION 4 — LIGHTING / MOOD / STYLE
═══════════════════════════════════════════════════════
- moodKeywords: 5-7 single words defining the emotional feel (e.g. "inviting", "premium", "intimate")
- cinematographyRules: 2-4 sentences defining the visual rules for the ENTIRE video (depth of field, lens character, colour grading, movement rhythm)
- emotionalArc: the narrative journey described as an arrow chain (e.g. "establish → approach → detail → emotion → resolve")

═══════════════════════════════════════════════════════
ADDITIONAL OUTPUTS
═══════════════════════════════════════════════════════
- narrativeArc: one sentence summarising the story
- hookStrategy: one sentence describing the opening hook strategy
- imagePrompt: a rich, detailed prompt to generate a SINGLE CONSOLIDATED INFOGRAPHIC storyboard pitch deck sheet image. Build it from your cuts[] so the storyboard row is described precisely. It MUST follow this exact structure:

"Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout for a ${brandName || 'product'} advertisement.

Beige/creme background canvas.
Top Meta Header: Display 'Cut Count: ${panelCount}', 'Color Palette: [hex colors/names]', 'Environment Fingerprint: [environment description]' in clean black typography.

Section 1 (CHARACTER & HERO PRODUCT REFERENCE):
- ${charRefBlock}
- HERO PRODUCT REFERENCE: 5 panels showing the product from angles (front view, three-quarter view, side view, macro detail, in-context lifestyle).
- Bottom row: Color palette circular swatches and text material notes.

Section 2 (ENVIRONMENT / SET DESIGN):
- Left side: A large 16:9 set design render of the environment ([environment description]).
- Right side: A top-down floor plan schematic diagram showing furniture layout and camera paths/arrows labeled with cut numbers.

Section 3 (STORYBOARD):
${panelBlock}

Section 4 (LIGHTING / MOOD / STYLE NOTES):
- 4 small lighting panels showing soft backlight, warm glow, rim light, and bokeh details with descriptions.
- On the right: 'MOOD KEYWORDS' list and bulleted 'CINEMATOGRAPHY NOTES'.

Format: ${format} | Style: ${style === '3d' ? 'Pixar/Unreal Engine 3D animated' : style === '2d' ? 'Clean 2D flat animated illustration' : 'Hyperrealistic cinematic live-action photography'} | ${duration}s total. Negative prompt: [cartoonish styles, low quality, distorted panels, text errors, smiling models, watermarks, talking head closeups, close-up heads]. Note: The product's original color shade, shape, and label must remain completely unchanged and must not be recolored with the brand colors. Panels showing presenters must depict a proper moving person explaining while doing something (e.g. typing on a laptop, gesturing at a screen, pointing, walking, demonstrating features, interacting with props/environments) and not just a talking head or moving head close-up."

${brandDNASection}

═══════════════════════════════════════════════════════
AD FILM SPECIFICATIONS
═══════════════════════════════════════════════════════
TOTAL DURATION: ${duration}s
FORMAT: ${format}
VISUAL STYLE: ${style === '3d' ? 'Pixar/Unreal Engine 3D animated' : style === '2d' ? 'Clean 2D flat animated illustration' : 'Hyperrealistic cinematic live-action photography'}
DIALOGUE LANGUAGE: ${dialogueLanguage}

OUTPUT FORMAT — CRITICAL:
Return ONLY valid JSON. No markdown. No explanation. No code fences.
The JSON must match this exact schema:

{
  "colorPalette": ["#hex1", "#hex2", "#hex3"],
  "paletteNames": ["Name1", "Name2", "Name3"],
  "materialNotes": "string",
  "environmentFingerprint": "string",
  "cuts": [
    {
      "id": 1,
      "lens": "string",
      "duration": 4,
      "move": "STEADICAM",
      "shot": "WIDE",
      "scene": "string",
      "framePrompt": "string",
      "voiceover": "string"
    }
  ],
  "moodKeywords": ["word1", "word2"],
  "cinematographyRules": "string",
  "emotionalArc": "establish → approach → detail → emotion → resolve",
  "narrativeArc": "string",
  "hookStrategy": "string",
  "imagePrompt": "Create a premium..."
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt({
    brief,
    productName,
    productFeatures,
    avatarUrls = [],
    avatarNames = [],
    refImageUrls = [],
    duration,
    format,
    style,
    dialogueLanguage = 'English',
    brandName = '',
    logoUrl = '',
    logoDescription = '',
    productImageUrls = [],
    includeBranding = true,
    // Brochure pipeline
    brochureExtractedText = '',
    isBrochure = false,
}) {
    const logoDetails = (includeBranding && logoUrl)
        ? `\nBRAND LOGO DETAILS: description="${logoDescription}"`
        : '';

    const imageMappingLines = [];
    let imgIdx = 1;

    // Product images
    if (productImageUrls?.length > 0) {
        productImageUrls.forEach(() => {
            imageMappingLines.push(`  - Attached Image ${imgIdx++}: PRODUCT reference — "${productName || 'product'}". Use this for exact product appearance (shape, color, branding, materials) in all framePrompts and in the imagePrompt grid panels. Do NOT recolor or color-shift the product itself to match the brand colors.`);
        });
    }

    // Avatar images — each labelled with character name
    if (avatarUrls.length > 0) {
        avatarUrls.forEach((_, i) => {
            const name = avatarNames[i] || `Character ${i + 1}`;
            imageMappingLines.push(`  - Attached Image ${imgIdx++}: CHARACTER "${name}" — the exact face, body, and wardrobe of this character. Use this face ONLY for Character "${name}" in all cuts that feature them. Do NOT confuse with the product or other characters.`);
        });
    }

    // Reference images (location/element/mood)
    if (refImageUrls.length > 0) {
        refImageUrls.forEach((_, i) => {
            imageMappingLines.push(`  - Attached Image ${imgIdx++}: LOCATION/ELEMENT REFERENCE ${i + 1} — use this for set design inspiration, background visual language, prop design, or mood reference. Do NOT use faces from this image as characters.`);
        });
    }

    const imageMappingText = imageMappingLines.length > 0
        ? `\nIMAGE REFERENCES:\n${imageMappingLines.join('\n')}\n\nCRITICAL: Even if a product reference image contains a model, treat it STRICTLY as the PRODUCT reference. Each character must match their specific CHARACTER reference image only.`
        : '';

    const avatarInstruction = avatarUrls.length === 0
        ? 'NO — product-only ad, no presenter'
        : avatarUrls.length === 1
        ? `YES — 1 character provided: "${avatarNames[0] || 'Character 1'}". Feature this presenter in relevant cuts.`
        : `YES — ${avatarUrls.length} characters: ${avatarNames.map((n, i) => `"${n || `Character ${i + 1}`}"`).join(', ')}. Distribute them across cuts for ensemble storytelling. Assign each character to specific narrative beats.`;

    const refImageInstruction = refImageUrls.length > 0
        ? `\nLOCATION/ELEMENT REFS: ${refImageUrls.length} reference image(s) provided for set design, background, or prop inspiration.`
        : '';

    const documentSection = (isBrochure && brochureExtractedText) ? `

═══════════════════════════════════════════════════════
DOCUMENT CONTENT (VERBATIM — MANDATORY SCRIPT SOURCE)
═══════════════════════════════════════════════════════
The user uploaded a brochure/document. Below is ALL the text extracted from it verbatim.
You MUST use the specific facts, numbers, prices, feature names, and copy from this document
when writing scene descriptions and dialogues — do NOT paraphrase or generalize.

${brochureExtractedText}

CRITICAL RULES for document-sourced storyboards:
- Every cut's scene MUST reference actual product/property/feature names from the document
- Dialogue and voiceover lines MUST include specific numbers: prices, specs, dates, area sq ft, etc.
- The narrative arc MUST follow the document's own structure (e.g. intro → features → pricing → CTA)
- Do NOT invent specs or prices — only use what is in the document above
` : '';

    return `CREATIVE BRIEF: "${brief || 'Create an incredibly creative, high-energy ad for this product.'}"
${imageMappingText}

PRODUCT: ${productName || 'See product images provided'}
KEY FEATURES: ${productFeatures || 'Extract from the product images and highlight visually'}
TOTAL VIDEO DURATION: ${duration}s (cuts must sum EXACTLY to this)
FORMAT: ${format}
VISUAL STYLE: ${style}
DIALOGUE LANGUAGE: ${dialogueLanguage}
AVATAR/PRESENTER(S): ${avatarInstruction}${refImageInstruction}
BRAND NAME: ${brandName}${logoDetails}${documentSection}

Now act as the VISIONARY award-winning storyboard director. Deeply analyse every reference image, the brief, and the brand DNA.
Write the complete 4-section structured storyboard JSON. Channel the energy of the world's best ad directors:
- Make cuts dense, rich, and full of fast-cut narrative beats — each scene should feel like a story beat, not a shot description
- Inject extreme creativity in every framePrompt: dynamic camera angles, professional lighting textures, kinetic motion
- Build a genuine emotional arc — the audience must feel something by the last cut
- Each framePrompt is your canvas — make it DETAILED enough that an AI image generator could produce a magazine-quality frame
- cuts[] durations must SUM EXACTLY to ${duration}s
- environmentFingerprint defines ONE single set — never changes
- imagePrompt must be built from your cuts[] array — it is the grid poster prompt
- Return ONLY the JSON object, no other text`;
}


// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT PARSER + VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

function parseStoryboardOutput(rawText, targetDuration) {
    // Strip markdown code fences if Claude added them
    let cleaned = rawText.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    let plan;
    try {
        plan = JSON.parse(cleaned);
    } catch (e) {
        const jsonMatch = cleaned.match(/\{[\s\S]+\}/);
        if (jsonMatch) {
            plan = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error(`Failed to parse storyboard JSON: ${e.message}`);
        }
    }

    if (!plan.imagePrompt) {
        throw new Error('Storyboard JSON missing imagePrompt field');
    }

    // Validate and fix cuts[] if present
    if (Array.isArray(plan.cuts) && plan.cuts.length > 0) {
        // Ensure all cuts have required fields with fallbacks
        plan.cuts = plan.cuts.map((cut, i) => {
            const vo = cut.voiceover || cut.dialogue || '';
            return {
                id: cut.id || i + 1,
                lens: cut.lens || '50mm',
                duration: Math.max(MIN_SHOT_DURATION, parseInt(cut.duration) || 4),
                move: cut.move || 'STEADICAM',
                shot: cut.shot || 'MEDIUM',
                scene: cut.scene || `Cut ${i + 1}`,
                framePrompt: cut.framePrompt || cut.scene || '',
                voiceover: vo,
                dialogue: vo, // keep dialogue field for back-compat
            };
        });

        // Build a unified voiceoverScript from the cuts
        plan.voiceoverScript = plan.cuts.map(c => c.voiceover).filter(Boolean).join(' ');

        // Compute actual total from cuts
        const cutsTotal = plan.cuts.reduce((sum, c) => sum + c.duration, 0);
        plan.totalDuration = cutsTotal;

        // If there's a duration mismatch, scale the last cut to fix it
        if (cutsTotal !== targetDuration && plan.cuts.length > 0) {
            const diff = targetDuration - cutsTotal;
            plan.cuts[plan.cuts.length - 1].duration = Math.max(
                MIN_SHOT_DURATION,
                plan.cuts[plan.cuts.length - 1].duration + diff
            );
            plan.totalDuration = plan.cuts.reduce((sum, c) => sum + c.duration, 0);
        }
    } else {
        // No structured cuts — create minimal fallback
        plan.cuts = [];
        plan.totalDuration = targetDuration;
    }

    // Ensure all section fields have fallbacks
    plan.colorPalette = Array.isArray(plan.colorPalette) ? plan.colorPalette.slice(0, 3) : [];
    plan.paletteNames = Array.isArray(plan.paletteNames) ? plan.paletteNames.slice(0, 3) : [];
    plan.materialNotes = plan.materialNotes || '';
    plan.environmentFingerprint = plan.environmentFingerprint || '';
    plan.moodKeywords = Array.isArray(plan.moodKeywords) ? plan.moodKeywords : [];
    plan.cinematographyRules = plan.cinematographyRules || '';
    plan.emotionalArc = plan.emotionalArc || '';
    plan.narrativeArc = plan.narrativeArc || '';
    plan.hookStrategy = plan.hookStrategy || '';
    plan.videoPrompt = '';  // Generated fresh at animate-time

    return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Storyboard Director — generates a complete 4-section structured storyboard plan
 *
 * @param {object} params
 * @param {string}   params.brandId
 * @param {string}   params.brief                  — user's creative brief
 * @param {string}   params.productName            — product name
 * @param {string}   params.productFeatures        — key features text
 * @param {string[]} params.productImageUrls       — S3 URLs of product images
 * @param {string[]} params.avatarUrls             — S3 URLs of avatar images (1–4 characters)
 * @param {string[]} params.avatarNames            — display names for each avatar (matching avatarUrls order)
 * @param {string[]} params.refImageUrls           — S3 URLs of location/element reference images (max 3)
 * @param {string}   params.style                  — 'hyperrealistic' | '3d' | '2d'
 * @param {number}   params.duration               — total video duration in seconds
 * @param {string}   params.format                 — '9:16' | '16:9' | '1:1'
 * @param {string}   params.userId
 * @param {string}   params.directorModel          — 'claude' | 'gemini'
 * @param {string}   params.dialogueLanguage       — dialogue language
 * @param {boolean}  params.includeBranding        — whether to inject brand DNA + logo (default true)
 * @returns {object} full storyboard plan JSON with structuredPlan fields
 */
export async function runStoryboardDirector({
    brandId, brief, productName, productFeatures,
    productImageUrls = [],
    avatarUrls = [],
    avatarNames = [],
    refImageUrls = [],
    style = 'hyperrealistic', duration = 30, format = '9:16', userId, directorModel = 'claude',
    dialogueLanguage = 'English',
    includeBranding = true,
    // Brochure pipeline
    brochureExtractedText = '',
    isBrochure = false,
    // Legacy single-avatar compat
    avatarUrl = null,
}) {
    // Back-compat: if old single avatarUrl is passed, wrap it
    const resolvedAvatarUrls = (avatarUrls && avatarUrls.length > 0)
        ? avatarUrls
        : (avatarUrl ? [avatarUrl] : []);

    console.log(`[Storyboard Director] Starting — ${duration}s, style=${style}, format=${format}, avatars=${resolvedAvatarUrls.length}, refs=${refImageUrls.length}, branding=${includeBranding}`);
    console.log(`[Storyboard Director] isBrochure=${isBrochure} brochureExtractedText.length=${(brochureExtractedText || '').length}`);
    if (brochureExtractedText) {
        console.log(`[Storyboard Director] brochureExtractedText preview: "${brochureExtractedText.substring(0, 300)}"`);
    }

    // 1. Load brand DNA (even if not injecting into prompt — we need logoUrl)
    const { brand, brandContext } = await loadBrandContext(brandId);
    console.log(`[Storyboard Director] Brand context: ${brandContext?.length || 0} chars (injecting=${includeBranding})`);

    // Auto-detect content type from brief + brand context
    const contentType = detectContentType(brief || '', productFeatures || '', brandContext || '');
    console.log(`[Storyboard Director] Content type detected: ${contentType}`);

    const logoUrl = brand?.dna?.logo?.url || null;
    const logoDescription = brand?.dna?.logo?.metadata?.visionDescription || '';
    const brandName = brand?.name || 'the brand';

    // 2. Build a preliminary cuts array for the imagePrompt panel builder.
    //    We run a two-pass approach: first generate the plan (no imagePrompt yet)
    //    then rebuild the imagePrompt with the actual cuts. But since the LLM
    //    generates cuts AND imagePrompt in one call, we seed the system prompt
    //    with the expected panel count based on duration heuristic.
    //    The actual panel block in the final imagePrompt will be built by the LLM
    //    using its own cuts[] output. We provide a heuristic panel count seed here.
    const expectedCutCount = Math.max(5, Math.round(duration / 5));
    const heuristicCuts = Array.from({ length: Math.min(expectedCutCount, 8) }, (_, i) => ({
        id: i + 1,
        scene: `Cut ${i + 1} — narrative beat`,
        framePrompt: '',
    }));

    // 3. Build prompts
    const systemPrompt = buildStoryboardDirectorPrompt({
        brandContext: includeBranding ? brandContext : '',
        duration,
        format,
        style,
        dialogueLanguage,
        brandName: includeBranding ? brandName : '',
        logoUrl: includeBranding ? logoUrl : null,
        logoDescription: includeBranding ? logoDescription : '',
        includeBranding,
        cuts: heuristicCuts,
        avatarNames,
        contentType,
    });

    const userPrompt = buildUserPrompt({
        brief, productName, productFeatures,
        avatarUrls: resolvedAvatarUrls,
        avatarNames,
        refImageUrls,
        duration, format, style, dialogueLanguage,
        brandName: includeBranding ? brandName : '',
        logoUrl: includeBranding ? logoUrl : null,
        logoDescription: includeBranding ? logoDescription : '',
        productImageUrls,
        includeBranding,
        // Brochure pipeline
        brochureExtractedText,
        isBrochure,
    });

    // 4. Build image URLs for multimodal agent — ALL product images + avatars + ref images
    const imageUrls = [];
    for (const url of (productImageUrls || []).filter(u => u?.startsWith('http'))) {
        imageUrls.push(url);
    }
    for (const url of resolvedAvatarUrls.filter(u => u?.startsWith('http'))) {
        imageUrls.push(url);
    }
    for (const url of (refImageUrls || []).filter(u => u?.startsWith('http'))) {
        imageUrls.push(url);
    }

    console.log(`[Storyboard Director] Calling ${directorModel} with ${imageUrls.length} vision images (${productImageUrls.length} product + ${resolvedAvatarUrls.length} avatar + ${refImageUrls.length} ref)...`);

    // 5. Call Agent (multimodal)
    // Scale token budget with duration — each cut needs ~180 tokens (id+lens+duration+move+shot+scene+framePrompt+voiceover).
    // A 300s video targeting 1 cut/3s = 100 cuts = ~18,000 tokens. Give 20% headroom.
    const expectedCuts = Math.ceil(duration / 3); // min density = 1 cut/3s
    const tokensPerCut = 180;
    const scaledTokens = Math.min(32000, Math.max(8000, Math.ceil(expectedCuts * tokensPerCut * 1.2)));
    console.log(`[Storyboard Director] Token budget: ${scaledTokens} (${expectedCuts} cuts × ${tokensPerCut} tokens × 1.2 headroom)`);

    let rawOutput;
    try {
        rawOutput = await callMultimodalAgent(
            systemPrompt,
            userPrompt,
            imageUrls,
            { temperature: 0.7, maxTokens: scaledTokens, returnRaw: true, provider: directorModel, timeoutMs: 600000 }
        );
        if (!rawOutput || typeof rawOutput !== 'string' || rawOutput.error) {
            throw new Error(rawOutput?.error || 'Empty or invalid response from LLM');
        }
    } catch (err) {
        throw new Error(`Storyboard Director (${directorModel}) failed: ${err.message}`);
    }

    // 6. Parse + validate
    let plan;
    try {
        plan = parseStoryboardOutput(rawOutput, duration);
    } catch (parseErr) {
        console.error(`[Storyboard Director] Parse failed, retrying...`);
        const retrySystem = systemPrompt + '\n\nCRITICAL: Your previous output could not be parsed as JSON. Return ONLY raw JSON, zero other text.';
        rawOutput = await callMultimodalAgent(retrySystem, userPrompt, imageUrls, { temperature: 0.4, maxTokens: 8000, returnRaw: true, provider: directorModel, timeoutMs: 600000 });
        if (!rawOutput || typeof rawOutput !== 'string' || rawOutput.error) {
            throw new Error(`Storyboard Director (${directorModel}) retry failed: ${rawOutput?.error || 'Empty or invalid response'}`);
        }
        plan = parseStoryboardOutput(rawOutput, duration);
    }

    console.log(`[Storyboard Director] ✅ Complete — ${plan.cuts.length} cuts, ${plan.totalDuration}s total`);
    console.log(`[Storyboard Director]   Arc: ${plan.emotionalArc}`);
    console.log(`[Storyboard Director]   Colors: ${plan.colorPalette.join(', ')}`);
    console.log(`[Storyboard Director]   Mood: ${plan.moodKeywords.join(', ')}`);

    return {
        ...plan,
        brandContext: includeBranding ? brandContext : '',
        requestedDuration: duration,
        format,
        defaultStyle: style,
        productImageUrls,
        avatarUrls: resolvedAvatarUrls,
        avatarNames,
        refImageUrls,
        dialogueLanguage,
        logoUrl: includeBranding ? logoUrl : null,
        includeBranding,
    };
}

/**
 * Recreate the video prompt based on user's updated imagePrompt and selected dialogue language.
 * (Legacy — kept for backwards compat with regen-poster flow)
 */
export async function recreateVideoPrompt({
    imagePrompt, brief, productName, productFeatures,
    avatarUrl, duration, format, style, dialogueLanguage = 'English',
    brandContext = '', directorModel = 'claude'
}) {
    console.log(`[Storyboard Director] Recreating video prompt... duration=${duration}s, lang=${dialogueLanguage}`);

    const systemPrompt = `You are a visionary, award-winning Ad Film Director and Cinematographer.
Your job: Given a creative brief, product details, brand DNA, the generated storyboard poster description (imagePrompt), and a selected dialogue language, write a highly complex, cinematic video animation prompt (videoPrompt) for an AI Video Generator (like Seedance).

This videoPrompt will animate the storyboard poster into a seamless, high-end commercial video.

BRAND DNA & CREATIVE ESSENCE:
${brandContext || 'No brand data. Use premium cinematic style throughout.'}

AD FILM SPECIFICATIONS:
TOTAL DURATION: ${duration}s | FORMAT: ${format} | VISUAL STYLE: ${style} | DIALOGUE LANGUAGE: ${dialogueLanguage}

VIDEO PROMPT RULES:
- Start with: "Use the attached storyboard image (@image2) as the visual style reference."
- Define cinematic motion using professional film terminology.
- MANDATORY: Write explicit spoken dialogues/voiceover in ${dialogueLanguage} inside the prompt.
- Use @image1, @image2, @image3 tags to reference attached images.
- Specify exact shot durations that sum to ${duration}s.
- Return ONLY valid JSON: { "videoPrompt": "..." }`;

    const userPrompt = `CREATIVE BRIEF: "${brief || 'Create an incredibly creative, high-energy ad for this product.'}"
PRODUCT: ${productName || 'See product images'}
KEY FEATURES: ${productFeatures || 'Highlight product features visually'}
STORYBOARD POSTER DESCRIPTION: "${imagePrompt}"
DIALOGUE LANGUAGE: ${dialogueLanguage}
AVATAR: ${avatarUrl ? 'Yes — avatar image provided.' : 'No avatar'}

Generate the videoPrompt JSON now. Return ONLY JSON.`;

    let rawOutput;
    try {
        rawOutput = await callMultimodalAgent(
            systemPrompt,
            userPrompt,
            avatarUrl ? [avatarUrl] : [],
            { temperature: 0.7, maxTokens: 4000, returnRaw: true, provider: directorModel }
        );
        if (!rawOutput || typeof rawOutput !== 'string' || rawOutput.error) {
            throw new Error(rawOutput?.error || 'Empty or invalid response from LLM');
        }
    } catch (err) {
        throw new Error(`Failed to recreate video prompt: ${err.message}`);
    }

    let cleaned = rawOutput.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        if (parsed.videoPrompt) return parsed.videoPrompt;
    } catch (e) {
        const jsonMatch = cleaned.match(/\{[\s\S]+\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.videoPrompt) return parsed.videoPrompt;
            } catch (innerE) { /* fallback */ }
        }
    }

    return cleaned;
}

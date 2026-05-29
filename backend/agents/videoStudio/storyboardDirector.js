/**
 * Storyboard Director — Claude-powered Ad Film Storyboard Generator
 *
 * Takes product + avatar + brief → writes a 4-section structured storyboard plan:
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
 *   imagePrompt — a rich grid-poster prompt built from the cuts (for GPT-Image-2 / NanoBanana)
 *   narrativeArc, hookStrategy — story-level metadata
 *
 * The structuredPlan is stored in MongoDB and used at animate-time to build
 * a precise, timed video prompt — not inferred from a grid image thumbnail.
 */

import { loadBrandContext, callMultimodalAgent } from '../shared/agentUtils.js';

const MIN_SHOT_DURATION = 2;  // seconds per cut
const MAX_SHOT_DURATION = 15; // Seedance I2V max per segment

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Professional 4-Section Storyboard Director
// ─────────────────────────────────────────────────────────────────────────────

function buildStoryboardDirectorPrompt({ brandContext, duration, format, style, dialogueLanguage = 'English', brandName = '', logoUrl = '', logoDescription = '' }) {
    const logoTagInstruction = logoUrl
        ? `\n- <<<image_logo>>> = brand logo — describe it as: "${logoDescription || 'brand logo'}".`
        : '';
    const logoPromptInstruction = logoUrl
        ? `\n- Brand logo: Whenever the logo appears in the grid panels or footer, reference it as "the brand logo (<<<image_logo>>>)".`
        : '';

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

═══════════════════════════════════════════════════════
SECTION 2 — ENVIRONMENT / SET DESIGN
═══════════════════════════════════════════════════════
Define ONE environment (set) that all cuts take place in:
- environmentFingerprint: a single evocative description of the set (e.g. "marble café counter; steam-lit espresso machine; tall street-facing window with soft morning light")
This environment NEVER changes across cuts. The camera moves through it.

═══════════════════════════════════════════════════════
SECTION 3 — CUT PLAN (THE STORYBOARD)
═══════════════════════════════════════════════════════
Write the exact shot list for ONE continuous video of ${duration} seconds.
Cuts are camera angles / shot changes within the video — NOT separate videos.
Each cut must have:
- id: sequential number starting at 1
- lens: cinematic lens spec (e.g. "40mm anamorphic", "100mm macro", "85mm prime")
- duration: exact seconds for this cut (integer, min ${MIN_SHOT_DURATION}s, max ${MAX_SHOT_DURATION}s)
- move: camera movement (STEADICAM | DOLLY-IN | DOLLY-OUT | RACK-FOCUS | ARC | PULL-OUT | CRANE | HANDHELD | STATIC | WHIP-PAN | PUSH-IN)
- shot: shot type (WIDE | MEDIUM | CLOSE-UP | EXTREME-CLOSE-UP | INSERT | MACRO | TWO-SHOT | OVER-SHOULDER | POV | ESTABLISHING)
- scene: one crisp sentence describing what happens in this cut (who, what action, emotional note)
- framePrompt: a detailed image generation prompt for this panel in the storyboard grid (describe the exact composition, lighting, subject position, product placement, mood — as if describing a still photograph)

RULES FOR CUTS:
- Durations must SUM exactly to ${duration}s
- Follow a natural cinematic arc (wide → narrow → detail → emotion → resolve)
- Use professional lens + shot combinations (wide angle for establishing, macro/insert for product details, close-up for emotion)
- The product must be visually featured in at least one INSERT/MACRO cut
- If an avatar/presenter is provided, feature them in at least one CLOSE-UP
- Preserve the product's original design, shape, color shades, and branding details faithfully in all scene descriptions and framePrompts. Do NOT simplify, stylize, or modify any physical product attributes or color values. The brand colors/color palette must ONLY be used for the environment, background, or UI elements, and must NEVER be applied to recolor or color-shift the product itself.

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

"Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout for a ${brandName} advertisement.

Beige/creme background canvas.
Top Meta Header: Display 'Cut Count: ${duration > 15 ? '5+' : '5'}', 'Color Palette: [hex colors/names]', 'Environment Fingerprint: [environment description]' in clean black typography.

Section 1 (CHARACTER & HERO PRODUCT REFERENCE):
- CHARACTER REFERENCE: 6 panels showing the presenter/model (using avatar reference) from angles (front, side, back, face close-up, side close-up, wardrobe detail).
- HERO PRODUCT REFERENCE: 5 panels showing the product (using product image reference) from angles (front view, three-quarter view, side view, macro detail, in-context lifestyle).
- Bottom row: Color palette circular swatches and text material notes.

Section 2 (ENVIRONMENT / SET DESIGN):
- Left side: A large 16:9 set design render of the environment ([environment description]).
- Right side: A top-down floor plan schematic diagram showing furniture layout and camera paths/arrows labeled with cut numbers (e.g. Cut 1, Cut 2).

Section 3 (STORYBOARD):
- A clean horizontal row of 5 storyboard panels showing:
  - Panel 1 (Cut 1): Describe Panel 1 in detail using the specific lens, shot type, camera move, and action description from your Cut 1 plan.
  - Panel 2 (Cut 2): Describe Panel 2 in detail using the details from your Cut 2 plan.
  - Panel 3 (Cut 3): Describe Panel 3 in detail using the details from your Cut 3 plan.
  - Panel 4 (Cut 4): Describe Panel 4 in detail using the details from your Cut 4 plan.
  - Panel 5 (Cut 5): Describe Panel 5 in detail using the details from your Cut 5 plan.
- Below each panel, include clear black typography: 'Lens | Duration | Move | Shot Type — short action description'.

Section 4 (LIGHTING / MOOD / STYLE NOTES):
- 4 small lighting panels showing soft backlight, warm glow, rim light, and bokeh details with descriptions.
- On the right: 'MOOD KEYWORDS' list and bulleted 'CINEMATOGRAPHY NOTES'.

Format: ${format} | Style: ${style === '3d' ? 'Pixar/Unreal Engine 3D animated' : style === '2d' ? 'Clean 2D flat animated illustration' : 'Hyperrealistic cinematic live-action photography'} | ${duration}s total. Negative prompt: [cartoonish styles, low quality, distorted panels, text errors, smiling models, watermarks]. Note: The product's original color shade, shape, and label must remain completely unchanged and must not be recolored with the brand colors."

═══════════════════════════════════════════════════════
BRAND DNA & CREATIVE ESSENCE
═══════════════════════════════════════════════════════
${brandContext || 'No brand data. Use premium cinematic style throughout.'}

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
      "framePrompt": "string"
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

function buildUserPrompt({ brief, productName, productFeatures, avatarUrl, duration, format, style, dialogueLanguage = 'English', brandName = '', logoUrl = '', logoDescription = '', productImageUrls = [] }) {
    const logoDetails = logoUrl ? `\nBRAND LOGO DETAILS: description="${logoDescription}"` : '';

    const imageMappingLines = [];
    let imgIdx = 1;
    if (productImageUrls?.length > 0) {
        productImageUrls.forEach((url, i) => {
            imageMappingLines.push(`  - Attached Image ${imgIdx++}: PRODUCT reference — "${productName || 'product'}". Use this for exact product appearance (shape, color, branding, materials) in all framePrompts and in the imagePrompt grid panels. Do NOT recolor or color-shift the product itself to match the brand colors.`);
        });
    }
    if (avatarUrl) {
        imageMappingLines.push(`  - Attached Image ${imgIdx++}: AVATAR/PRESENTER — the presenter's exact face and body. Use this for all cuts that feature a human presenter. Do NOT confuse with the product.`);
    }

    const imageMappingText = imageMappingLines.length > 0
        ? `\nIMAGE REFERENCES:\n${imageMappingLines.join('\n')}\n\nCRITICAL: Even if a product reference image contains a model, treat it STRICTLY as the PRODUCT reference. The presenter must match the AVATAR reference only.`
        : '';

    return `CREATIVE BRIEF: "${brief || 'Create an incredibly creative, high-energy ad for this product.'}"
${imageMappingText}

PRODUCT: ${productName || 'See product images provided'}
KEY FEATURES: ${productFeatures || 'Extract from the product images and highlight visually'}
TOTAL VIDEO DURATION: ${duration}s (cuts must sum EXACTLY to this)
FORMAT: ${format}
VISUAL STYLE: ${style}
DIALOGUE LANGUAGE: ${dialogueLanguage}
AVATAR/PRESENTER: ${avatarUrl ? 'YES — avatar image provided. Feature this specific presenter in relevant cuts.' : 'NO — product-only ad, no presenter'}
BRAND NAME: ${brandName}${logoDetails}

Now act as the professional storyboard director. Deeply analyse the product, brief, and reference images.
Write the complete 4-section structured storyboard JSON.
Remember:
- cuts[] durations must SUM EXACTLY to ${duration}s
- environmentFingerprint defines ONE single set — never changes
- Each cut's framePrompt must be a detailed still-image description grounded in the actual product/avatar references
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
        plan.cuts = plan.cuts.map((cut, i) => ({
            id: cut.id || i + 1,
            lens: cut.lens || '50mm',
            duration: Math.max(MIN_SHOT_DURATION, parseInt(cut.duration) || 4),
            move: cut.move || 'STEADICAM',
            shot: cut.shot || 'MEDIUM',
            scene: cut.scene || `Cut ${i + 1}`,
            framePrompt: cut.framePrompt || cut.scene || '',
        }));

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
 * @param {string} params.brandId
 * @param {string} params.brief                 — user's creative brief
 * @param {string} params.productName           — product name
 * @param {string} params.productFeatures       — key features text
 * @param {string[]} params.productImageUrls    — S3 URLs of product images
 * @param {string|null} params.avatarUrl        — S3 URL of avatar (or null)
 * @param {string} params.style                 — 'hyperrealistic' | '3d' | '2d'
 * @param {number} params.duration              — total video duration in seconds
 * @param {string} params.format                — '9:16' | '16:9' | '1:1'
 * @param {string} params.userId
 * @param {string} params.directorModel         — 'claude' | 'gemini'
 * @param {string} params.dialogueLanguage      — dialogue language
 * @returns {object} full storyboard plan JSON with structuredPlan fields
 */
export async function runStoryboardDirector({
    brandId, brief, productName, productFeatures,
    productImageUrls = [], avatarUrl = null,
    style = 'hyperrealistic', duration = 30, format = '9:16', userId, directorModel = 'claude',
    dialogueLanguage = 'English'
}) {
    console.log(`[Storyboard Director] Starting — ${duration}s, style=${style}, format=${format}`);

    // 1. Load brand DNA
    const { brand, brandContext } = await loadBrandContext(brandId);
    console.log(`[Storyboard Director] Brand context: ${brandContext?.length || 0} chars`);

    const logoUrl = brand?.dna?.logo?.url || null;
    const logoDescription = brand?.dna?.logo?.metadata?.visionDescription || '';
    const brandName = brand?.name || 'the brand';

    // 2. Build prompts
    const systemPrompt = buildStoryboardDirectorPrompt({ brandContext, duration, format, style, dialogueLanguage, brandName, logoUrl, logoDescription });
    const userPrompt = buildUserPrompt({ brief, productName, productFeatures, avatarUrl, duration, format, style, dialogueLanguage, brandName, logoUrl, logoDescription, productImageUrls });

    // 3. Build image URLs for Claude vision — ALL product images + avatar
    const imageUrls = [];
    for (const url of (productImageUrls || []).filter(u => u?.startsWith('http'))) {
        imageUrls.push(url);
    }
    if (avatarUrl?.startsWith('http')) imageUrls.push(avatarUrl);

    console.log(`[Storyboard Director] Calling ${directorModel} with ${imageUrls.length} vision images...`);

    // 4. Call Agent (multimodal)
    let rawOutput;
    try {
        rawOutput = await callMultimodalAgent(
            systemPrompt,
            userPrompt,
            imageUrls,
            { temperature: 0.7, maxTokens: 8000, returnRaw: true, provider: directorModel }
        );
    } catch (err) {
        throw new Error(`Storyboard Director (${directorModel}) failed: ${err.message}`);
    }

    // 5. Parse + validate
    let plan;
    try {
        plan = parseStoryboardOutput(rawOutput, duration);
    } catch (parseErr) {
        console.error(`[Storyboard Director] Parse failed, retrying...`);
        const retrySystem = systemPrompt + '\n\nCRITICAL: Your previous output could not be parsed as JSON. Return ONLY raw JSON, zero other text.';
        rawOutput = await callMultimodalAgent(retrySystem, userPrompt, imageUrls, { temperature: 0.4, maxTokens: 8000, returnRaw: true, provider: directorModel });
        plan = parseStoryboardOutput(rawOutput, duration);
    }

    console.log(`[Storyboard Director] ✅ Complete — ${plan.cuts.length} cuts, ${plan.totalDuration}s total`);
    console.log(`[Storyboard Director]   Arc: ${plan.emotionalArc}`);
    console.log(`[Storyboard Director]   Colors: ${plan.colorPalette.join(', ')}`);
    console.log(`[Storyboard Director]   Mood: ${plan.moodKeywords.join(', ')}`);

    return {
        ...plan,
        brandContext,
        requestedDuration: duration,
        format,
        defaultStyle: style,
        productImageUrls,
        avatarUrl,
        dialogueLanguage,
        logoUrl,
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

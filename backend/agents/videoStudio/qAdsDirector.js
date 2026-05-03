/**
 * Q-Ads Director — Stage 2 of the two-stage pipeline
 *
 * Takes: enhanced brief + 1 concept angle + preset locked params + brand context
 * Returns: 1 production-ready Seedance 2.0 prompt with rich cinematic detail
 *
 * Uses Gemini 2.5 Pro for cinematic prose generation.
 */

import { callAgent } from '../shared/agentUtils.js';
import { MODEL_STYLE_GUIDES } from './promptEnhancer.js';
import { ANTISLOP_BANNED_WORDS, AGEBLIND_BANNED_WORDS } from './qAdsPresets.js';

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function buildDirectorSystem({ presetConfig, brandContext, settings }) {
    const duration = parseInt(settings?.duration || presetConfig.recommendedDuration || 8);
    const format = settings?.format || presetConfig.recommendedFormat || '9:16';
    const antislop = ANTISLOP_BANNED_WORDS.join(', ');
    const ageblind = AGEBLIND_BANNED_WORDS.join(', ');

    // Seedance 2.0 directorial structure guide
    const seedanceGuide = MODEL_STYLE_GUIDES?.['seedance-2.0']?.structure
        || `Seedance 2.0: Subject + Action + Camera + Lighting + Timeline markers. Present tense. 180-280 words. End with quality suffix.`;

    // Build timecode structure based on duration
    const hookEnd = Math.max(2, Math.round(duration * 0.20));
    const midEnd = Math.max(hookEnd + 2, Math.round(duration * 0.75));
    const revealEnd = Math.max(midEnd + 1, Math.round(duration * 0.90));

    return `You are the Q-Ads Cinematic Prompt Director. You write ONE production-ready Seedance 2.0 video prompt — the most cinematic, rich, and visually specific video ad prompt ever written.

You have received one strategic concept angle from Stage 1. Your job is to translate it into a single, breathtaking cinematic prompt paragraph.

═══════════════════════════════════════════════════════
TARGET MODEL: Seedance 2.0
DURATION: ${duration}s | FORMAT: ${format}
═══════════════════════════════════════════════════════
${seedanceGuide}

═══════════════════════════════════════════════════════
BRAND CONTEXT (use for colors, voice, visual identity)
═══════════════════════════════════════════════════════
${brandContext}

═══════════════════════════════════════════════════════
PRESET LOCKED PARAMETERS — Non-negotiable hard rules
These MUST appear in every prompt you write. No exceptions.
═══════════════════════════════════════════════════════
Camera Signature: ${presetConfig.cameraSignature}
  → Your camera description MUST match this exactly. Name specific moves (push-in, rack focus, handheld drift, orbit, tracking pull).

Pacing Rule: ${presetConfig.pacing}
  → Your timecodes MUST reflect this pacing. Every beat must be scene-specific.

Environment: ${presetConfig.environmentPreset}
  → Your scene setting MUST match this. Describe lighting sources, surface textures, background depth.

Register: ${presetConfig.register}
  → The energy and tone of the prose MUST reflect this.

Forbidden Elements: ${(presetConfig.forbiddenElements || []).join('; ')}
  → These elements must NOT appear in the prompt.

Preset Director Mandate: ${presetConfig.directorBrief}
  → This is the core creative intention. Honor it precisely.

═══════════════════════════════════════════════════════
IMAGE TAG RULES
═══════════════════════════════════════════════════════
@image1 = product reference image (always present)
@image2 = avatar/presenter reference image (only if noAvatar is false)

EVERY @image tag MUST have a SPECIFIC, DETAILED JOB:
  CORRECT: "@image1 as the product hero — camera glides close over its exact matte surface, catching the edge where the amber light breaks into shadow."
  WRONG: "@image1 is in the video."

If preset.noAvatar is true, do NOT include @image2.

═══════════════════════════════════════════════════════
CINEMATIC RICHNESS REQUIREMENTS
═══════════════════════════════════════════════════════
Your prompt MUST contain ALL of the following. Absence of any = failure:

1. CAMERA MOVE — Name it exactly: push-in, crane-up, rack focus, handheld drift, whip-pan, slow orbit, etc.
2. LIGHTING SETUP — Specify: direction (side, top, back), quality (hard, diffused, volumetric), color temperature (warm gold, cool blue, amber), and source (window, practicals, ring, LED panel).
3. SUBJECT CHOREOGRAPHY — Exact actions the person or product takes. Verb-specific: "lifts", "exhales", "tilts the bottle toward the light". NO vague moves.
4. TEXTURE DETAIL — One sentence on material surface: condensation, fabric grain, matte finish, metallic gleam, skin texture.
5. BACKGROUND DEPTH — What is the bokeh field? What is out of focus behind the subject?
6. SHOT BEATS — Every scene segment must be labelled as SHOT 1, SHOT 2, etc.

═══════════════════════════════════════════════════════
NARRATIVE STRUCTURE (embed in every prompt via Shots)
═══════════════════════════════════════════════════════
HOOK SHOT(S): Arresting first frame — pure visual emotion. No product. A texture, a gesture, an expression, a light flare. Viewer must stop scrolling.
STORY SHOT(S): Human truth + product integration. Camera moves with the subject. Product enters naturally as part of the action — never placed, always discovered.
PRODUCT REVEAL SHOT(S): Brand colors activate in the lighting. Camera holds on the product. One macro detail shot. This is the payoff.
CLOSE SHOT(S): The subject or scene settles. Energy drops to a breath. The brand moment lands — felt, not announced.

═══════════════════════════════════════════════════════
ANTISLOP RULE — Never use these words
═══════════════════════════════════════════════════════
BANNED: ${antislop}
Replace every banned word with a specific, observable visual action or detail.

═══════════════════════════════════════════════════════
AGE-BLIND RULE — Never describe character age
═══════════════════════════════════════════════════════
BANNED: ${ageblind}
Use functional roles: runner, figure, presenter, user, rider, speaker, parent, creator, hand.

═══════════════════════════════════════════════════════
QUALITY SUFFIX — Append to the prompt
═══════════════════════════════════════════════════════
End the prompt with: "4K ultra HD, cinematic detail, sharp clarity, natural textures, stable picture."

═══════════════════════════════════════════════════════
OUTPUT FORMAT — Return ONLY valid JSON, no markdown
═══════════════════════════════════════════════════════
{
  "variants": [
    {
      "variantId": "A",
      "angle": "The angle title from Stage 1",
      "prompt": "The full Seedance 2.0 prompt following the EXACT Seedance Prompt Template (STYLE, WARDROBE, ENVIRONMENT, MOOD, SHOT 1, SHOT 2...). Include @image tags. Include quality suffix. NO markdown, NO brackets around final text — just the structured prompt exactly as it will be sent to Seedance. Must feel like a master director wrote it.",
      "timecodeBreakdown": {
        "hook": "Exact scene for the hook",
        "story": "Exact scene for the story",
        "productReveal": "Exact scene for the product reveal",
        "close": "Exact closing beat"
      },
      "voiceLine": "One cinematic voiceover line (15 words max) matching brand voice. Present tense. Null if no voiceover."
    }
  ]
}`;
}

function buildDirectorUser({ enhancedBrief, conceptAngles, productData, visualDNA, settings, presetConfig }) {
    const hasAvatar = !presetConfig.noAvatar;
    const product = productData || {};
    const customDialogue = settings?.customDialogue;
    const angle = conceptAngles[0]; // Single angle — all creative power goes here

    let msg = `ENHANCED BRIEF FROM STAGE 1:
"${enhancedBrief}"

PRODUCT:
  Name: ${product.productName || 'the product'}
  USP: ${product.mainUSP || ''}
  Key Features: ${Array.isArray(product.keyFeatures) ? product.keyFeatures.slice(0, 4).join('; ') : ''}
  Problem Solved: ${product.problemSolved || ''}
  Suggested Dialogue: ${customDialogue || product.suggestedDialogue || 'None — invent something brand-aligned and memorable'}

IMAGE CONTEXT:
  @image1 — Product reference image (${product.productName || 'product'}). Study its exact shape, color, texture, and form factor. Describe it precisely in the prompt.
  ${hasAvatar ? '@image2 — Presenter/avatar image. Study their exact features, clothing style, and energy. Write them into the scene specifically — not generically.' : 'NO AVATAR — this is a product-only preset. Do NOT include @image2.'}`;

    if (visualDNA && !visualDNA.error && !visualDNA.skipped) {
        msg += `

VISUAL DNA (from product images — use ALL of these):
  Hero Colors: ${Array.isArray(visualDNA.heroColors) ? visualDNA.heroColors.join(', ') : 'Not detected'}
  Texture: ${visualDNA.texture || 'Not detected'}
  Shot Suggestions: ${Array.isArray(visualDNA.shotSuggestions) ? visualDNA.shotSuggestions.join('; ') : 'None'}
  Avoid: ${Array.isArray(visualDNA.avoidList) ? visualDNA.avoidList.join('; ') : 'None'}

CRITICAL: Use the hero colors in lighting descriptions. Use shot suggestions as inspiration for each timecode beat.`;
    }

    msg += `

CONCEPT ANGLE TO DIRECT:
  Title: ${angle?.angle || 'Brand Story'}
  Emotional Approach: ${angle?.emotionalApproach || 'aspiration'}
  Hook: ${angle?.hook || ''}
  Story: ${angle?.story || ''}
  Close Beat: ${angle?.cta || ''}
  Mood: ${angle?.moodNote || ''}

Your job: Write ONE masterfully crafted Seedance 2.0 prompt for this angle.

Do NOT be generic. Do NOT use vague adjectives. Every sentence must describe something a camera can physically capture:
  - Specific camera moves ("the camera drifts left across the marble surface")
  - Specific lighting ("warm amber light from a low-angle practical catches the condensation on the glass")
  - Specific human actions ("the presenter lifts the product with both hands, angles it toward the window light")
  - Specific textures ("the matte ceramic surface absorbs the shadow cleanly")
  - Specific depth of field ("the background kitchen dissolves into creamy bokeh")

This prompt is being sent directly to an AI video model. It must be a masterclass in visual direction. Write it in pure cinematic prose — present tense, no labels, no headers. Just the paragraph.`;

    return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run Stage 2 — Cinematic Prompt Director
 *
 * @param {object} params
 * @param {string} params.enhancedBrief      — from Stage 1
 * @param {Array}  params.conceptAngles      — [{ variantId, angle, hook, story, cta, moodNote }]
 * @param {object} params.presetConfig       — locked params from Stage 1
 * @param {string} params.brandContext       — passed from Stage 1 (no second DB hit)
 * @param {object} params.visualDNA          — from Stage 1 MCoT
 * @param {object} params.productData
 * @param {string[]} params.imageUrls
 * @param {object} params.settings           — { duration, format, cta, customDialogue }
 * @returns {object} { variants: [{ variantId, angle, prompt, timecodeBreakdown, voiceLine, ctaText }] }
 */
export async function runDirector({ enhancedBrief, conceptAngles, presetConfig, brandContext, visualDNA, productData, imageUrls = [], settings = {} }) {
    console.log(`[Q-Ads Director] Starting Stage 2 — preset=${presetConfig.id}, angles=${conceptAngles.length}`);

    if (!conceptAngles || conceptAngles.length === 0) {
        throw new Error('Stage 2 Director requires at least one concept angle from Stage 1');
    }

    const systemPrompt = buildDirectorSystem({ presetConfig, brandContext, settings });
    const userPrompt = buildDirectorUser({ enhancedBrief, conceptAngles, productData, visualDNA, settings, presetConfig });

    console.log(`[Q-Ads Director] Calling Gemini for Stage 2 cinematic prompts...`);

    let result;
    try {
        // preferFast: false → Gemini 2.5 Pro for cinematic prose quality
        result = await callAgent(systemPrompt, userPrompt, 0.72, 4096, { preferFast: false, timeoutMs: 120_000 });
    } catch (llmErr) {
        console.error(`[Q-Ads Director] LLM call failed: ${llmErr.message}`);
        throw new Error(`Stage 2 Director failed: ${llmErr.message}`);
    }

    if (!result || !result.variants || !Array.isArray(result.variants) || result.variants.length === 0) {
        throw new Error('Stage 2 Director returned invalid JSON — missing variants');
    }

    // Validate each variant has a non-empty prompt
    const validated = result.variants.map((v, i) => {
        if (!v.prompt || v.prompt.trim().length < 30) {
            throw new Error(`Stage 2 Director: Variant ${v.variantId || i + 1} has empty or too-short prompt`);
        }
        return {
            variantId: v.variantId || 'A',
            angle: v.angle || conceptAngles[0]?.angle || 'Variant A',
            prompt: v.prompt.trim(),
            timecodeBreakdown: v.timecodeBreakdown || {},
            voiceLine: v.voiceLine || null,
        };
    });

    console.log(`[Q-Ads Director] Stage 2 complete — ${validated.length} prompts generated`);
    validated.forEach(v => {
        console.log(`[Q-Ads Director] Variant ${v.variantId}: ${v.prompt.split(/\s+/).length} words`);
    });

    return { variants: validated };
}

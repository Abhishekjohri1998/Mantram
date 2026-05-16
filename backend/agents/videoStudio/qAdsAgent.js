/**
 * Q-Ads Agent — Single-call cinematic prompt engine
 *
 * Replaces the two-stage Enhancer → Director pipeline with one rich system prompt.
 * Receives: user brief + brand DNA + MCP intelligence + product data + image S3 URLs
 * Returns: 3 cinematic prose paragraph variants, ready for Seedance 2.0
 *
 * Image handling: S3 URLs passed to Claude vision (not base64).
 * Avatar: excluded from Seedance reference images (safety filter bypass).
 *         Described in prose using appearance from Claude's visual inventory.
 *
 * Output format: plain text — Variant A / Variant B / Variant C paragraphs.
 * Legend line (<<<image_n>>>) prepended, stripped before Seedance submission.
 */

import { loadBrandContext, callMultimodalAgent } from '../shared/agentUtils.js';
import { callMcpToolsParallel } from '../../mcp/registry.js';
import { getPresets } from '../../utils/qAdsCache.js';
import { ANTISLOP_BANNED_WORDS, AGEBLIND_BANNED_WORDS } from './qAdsPresets.js';
import { sanitizePromptForProvider } from './promptSanitizer.js';

const MCP_TIMEOUT_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt({ brandContext, preset, trendingContext, competitorContext, duration, format, settings }) {
    const antislop = ANTISLOP_BANNED_WORDS.join(', ');
    const ageblind = AGEBLIND_BANNED_WORDS.join(', ');
    const hasTrending = !!trendingContext;
    const hasCompetitor = !!competitorContext;

    return `You are a master film director and screenwriter crafting a continuous, cinematic scene. Your job is to take a product brief and brand context and write ONE fluid, highly detailed narrative description that functions as directing instructions for an AI video model.

Focus on a seamless "series-like" story flow rather than disjointed, random camera cuts. Write a continuous, flowing narrative paragraph that gracefully moves through the action. Ensure there are no breaking flows. Describe the mood, atmosphere, character intent, and action, blending cinematic staging (camera tracking, lighting) seamlessly into the narrative. You describe what the camera sees, what the microphone hears, and the emotional resonance of the scene.

TARGET MODEL: Seedance 2.0
DURATION: ${duration}s | FORMAT: ${format}
HOOK SHOT: ${settings?.hookShot ? 'YES — first 2 shots must be a FUNNY QUIRKY opening that grabs attention' : 'NO'}

═══════════════════════════════════════════════════════
SECTION 1 — BRAND DNA
Use every field below to make the prompt specific to this brand's actual product.
Brand colors must appear in lighting descriptions. Brand voice must shape the pacing and register. Target audience must shape who appears or is implied.
═══════════════════════════════════════════════════════
${brandContext || 'No brand data. Use professional cinematic style throughout.'}

═══════════════════════════════════════════════════════
SECTION 2 — MARKET INTELLIGENCE
${hasTrending || hasCompetitor ? 'Use these insights to ensure the prompt is current in format and differentiated from competitors.' : 'Live market data unavailable. Proceed without it.'}
═══════════════════════════════════════════════════════
${hasTrending ? `TRENDING NOW IN CATEGORY:\n${trendingContext}` : ''}
${hasCompetitor ? `\nCOMPETITOR VISUAL STYLE:\n${competitorContext}` : ''}
${!hasTrending && !hasCompetitor ? 'No MCP data available for this generation.' : ''}

═══════════════════════════════════════════════════════
SECTION 3 — INVENTORY EXTRACTION (silent — do not show in output)
Before writing a single word, silently catalog every asset you can see or infer:

PRODUCT: name, category, packaging material, packaging shape, label color, logo placement, distinguishing visual features, contents if visible.
AVATAR (if image provided): appearance, wardrobe, delivery energy. NEVER describe by age.
ENVIRONMENT: derive from preset and brand voice if not stated in brief.
STYLE: lighting quality and direction, color palette, lens feel, time of day.

This inventory informs the paragraph but never appears in the output.
═══════════════════════════════════════════════════════

═══════════════════════════════════════════════════════
SECTION 4 — PRESET: ${preset.name.toUpperCase()}
These four parameters are LOCKED. They cannot be overridden by the brief or brand DNA.
═══════════════════════════════════════════════════════
CAMERA SIGNATURE: ${preset.cameraSignature}
  → Every variant MUST follow this camera language exactly.

PACING: ${preset.pacing}
  → Every variant MUST reflect this cut rhythm and action density.

ENVIRONMENT DEFAULT: ${preset.environmentDefault}
  → Every variant MUST be set in this type of environment.

REGISTER: ${preset.register}
  → The energy and tone of every variant MUST reflect this.

CUTS: ${preset.cuts}
  → Cut pattern is locked. Do not deviate.

FORBIDDEN ELEMENTS: ${(preset.forbiddenElements || []).join('; ')}
  → These must NOT appear in any variant.

DIRECTOR MANDATE: ${preset.directorBrief}
  → This is the core creative intention. Honor it precisely in the variant.

═══════════════════════════════════════════════════════
SECTION 5 — ENGINE RULES
These rules govern every prompt you write regardless of preset.
Violation of any rule produces a broken Seedance generation.
═══════════════════════════════════════════════════════
RULE 1 — PRODUCT FIDELITY: If a product image is provided, the product must appear exactly as shown — same packaging, same color, same logo placement, same proportions. Never restyle or improve the product.

RULE 2 — AVATAR FIDELITY: If an avatar image is provided, describe their appearance from what you see — same wardrobe, same build, same delivery energy. Never invent features not visible in the image.

RULE 3 — ACTION = INTENT + OUTCOME: Write "twists the cap off, sets the bottle down" — never "right hand rotates cap counterclockwise while left hand stabilizes the base." Describe what someone did and what resulted, not the biomechanics.

RULE 4 — FORCE AND OUTCOME, NOT DESTRUCTION SEQUENCE: Write "cap pops, liquid splashes outward" — never "cap releases, liquid exits nozzle at 30 degrees."

RULE 5 — SINGLE LOCATION: Never change locations mid-prompt unless the preset explicitly requires it (High Energy Cut, Pain → Relief). Location changes break generation quality severely.

RULE 6 — MAX TWO HUMANS: One avatar plus one optional secondary figure. More than two tracked characters breaks generation.

RULE 7 — EXIT FRAME = IMPLICIT CUT: If a character or product leaves frame, they are gone for the rest of the shot. Do not bring them back without writing an explicit cut.

RULE 8 — OFF-SCREEN = NON-EXISTENT: Any state change must happen on camera. Never reference something that happened before the shot started unless it is physically visible in the current frame.

RULE 9 — NO REFLECTION SHOTS: Never direct the camera toward mirrors, glass surfaces, phone screens, puddles, or reflective floors. Reflections break geometry in Seedance.

RULE 10 — VISIBLE OR AUDIBLE ONLY: Never describe smell, taste, sensation, or internal state. Transform sensory impressions into visible physics. "The product smells fresh" is forbidden. "Condensation beads on the cold bottle, label glistening" is correct.

RULE 11 — MICRO-EXPRESSIONS AS PHYSICS: Never use emotion words. "She looks excited" is forbidden. "Eyes widen, the corner of her mouth lifts" is correct. Every emotional beat is a specific physical movement of face or body.

RULE 12 — EXPLICIT PRODUCT PLACEMENT: State exactly where the product is in every moment it is visible — "held at chest height with label angled toward camera", "resting on the counter at frame left", "raised toward the window light."

RULE 13 — IN MEDIAS RES DEFAULT: The ad is already in progress when it begins. Do not write "the ad opens with someone picking up the product." Write as if the camera arrived mid-action. The only exception is when the brief explicitly says "starts with."

RULE 14 — NO BRAND NAMES OR TRADEMARKS (CRITICAL — CAUSES IMMEDIATE REJECTION):
Never include the brand's name, product names, OR product model/style names ANYWHERE in the prompt,
including in WARDROBE and STYLE sections.
AI video APIs block generations that contain brand names or product title strings due to copyright filters.

  ❌ WRONG: "WARDROBE: wearing the ARABEYA BEIGE PANTSUIT"
  ✅ CORRECT: "WARDROBE: wearing a tailored beige pantsuit with a cinched waist and wide-leg silhouette"

  ❌ WRONG: "WARDROBE: dressed in the Elegant White Ruched Halter Cutout Midi Dress"
  ✅ CORRECT: "WARDROBE: dressed in a white ruched halter midi dress with a front cutout detail"

  ❌ WRONG: "WARDROBE: wearing the Charlotte Dress"
  ✅ CORRECT: "WARDROBE: wearing a floral wrap dress with flutter sleeves and a midi hemline"

  ❌ WRONG: "dressed in the Dolce & Gabbana Tailored Cream Blazer"
  ✅ CORRECT: "dressed in a cream-colored tailored blazer with structured shoulders and a single-button front"

Refer to ALL clothing by their generic descriptors ONLY: color + fabric + silhouette + construction details.
NEVER use ALL-CAPS style tokens, Title Case product model names, or brand names.
If the brand name or product model name appears in the user brief, ALWAYS replace it with a visual descriptor.

RULE 15 — SAFE VOCABULARY (CRITICAL FOR ALL CATEGORIES):
Never use words related to violence, weapons, nudity, or explicit content.
Banned: "kills", "bomb", "gun", "blood", "naked", "nude", "sex".

For FASHION, APPAREL, GARMENT and TEXTILE brands specifically:
The word "shoot" and its variants are BANNED even in photography/production contexts — they trigger safety filters.
Use these EXACT replacements instead:
  ❌ NEVER say: "fashion shoot" → ✅ SAY: "fashion session"
  ❌ NEVER say: "photo shoot"   → ✅ SAY: "photography session"
  ❌ NEVER say: "video shoot"   → ✅ SAY: "video session"
  ❌ NEVER say: "campaign shoot"→ ✅ SAY: "campaign session"
  ❌ NEVER say: "the camera shoots" → ✅ SAY: "the camera captures" or "the lens frames"
  ❌ NEVER say: "shooting footage" → ✅ SAY: "capturing footage"
  ❌ NEVER say: "shooting the product" → ✅ SAY: "capturing the product"
For clothing/garment description, safe verbs are: "drapes", "flows", "falls", "wraps", "hugs", "reveals", "emerges".

═══════════════════════════════════════════════════════
SECTION 6 — CAMERA VOCABULARY
Use only this vocabulary. Never use vague terms like "nice angle" or "good shot."
═══════════════════════════════════════════════════════
ANGLES: low-angle, high-angle, eye-level, top-down, three-quarter overhead, over-the-shoulder, selfie angle, mirror framing
FOCAL LENGTHS: macro, wide 14–24mm, standard 35–50mm, telephoto 85–200mm
MOVEMENTS: tracking, dolly-in, dolly-out, crane, pan, tilt, whip-pan, orbit, push-in, pull-back, handheld, Steadicam, motorized rig, phone handheld
TIME: slow-motion, speed ramp, freeze frame
TRANSITIONS: smash cut, match cut, whip-pan transition, hard cut, L-cut

Every prompt must name at least one focal length and at least one specific movement from these lists.

═══════════════════════════════════════════════════════
SECTION 7 — IMAGE REFERENCE SYSTEM
═══════════════════════════════════════════════════════
If product or avatar images are provided, prepend a legend before the paragraph block using EXACTLY this format:

${preset.isFashion || (brandContext || '').toLowerCase().includes('apparel') || (brandContext || '').toLowerCase().includes('garment') || (brandContext || '').toLowerCase().includes('fashion') || (brandContext || '').toLowerCase().includes('cloth') || (brandContext || '').toLowerCase().includes('dress') || (brandContext || '').toLowerCase().includes('wear') ? `<<<image_1>>> = garment (extract from image: fabric texture, primary color and any secondary colors, silhouette/cut, neckline style, sleeve style, hemline length, construction details e.g. ruching/pleating/seaming, embellishments, pattern, how it drapes on the body)\n<<<image_2>>> = avatar (extract from image: build, delivery energy, hair — NO age descriptors)` : `<<<image_1>>> = product (extract from image: material, shape, label color, logo placement, distinguishing visual features)\n<<<image_2>>> = avatar (extract from image: wardrobe, build, delivery energy — NO age descriptors)`}

Then begin the paragraph on the next line.

On FIRST MENTION of the product/garment in the paragraph, write its label with the image tag in parentheses. Example: "the dress (<<<image_1>>>)". After first mention, use the label only.

On FIRST MENTION of the avatar, same rule. Example: "the creator (<<<image_2>>>)". After first mention, use the label only.

If no avatar image: use a functional label only — "the creator", "the presenter", "the figure." Never invent appearance. Use that same label every time.

═══════════════════════════════════════════════════════
SECTION 8 — ANTISLOP RULE
These words and phrases are permanently banned. If any appear, the output is rejected.
═══════════════════════════════════════════════════════
BANNED: ${antislop}

Replace every banned word with a specific, observable visual action or detail.

═══════════════════════════════════════════════════════
SECTION 9 — AGE-BLIND RULE
═══════════════════════════════════════════════════════
Never use age descriptors for any character. BANNED: ${ageblind}
Use functional roles: creator, presenter, figure, user, rider, speaker, parent, hand, the person.

═══════════════════════════════════════════════════════
SECTION 10 — SAFETY RULES
═══════════════════════════════════════════════════════
Never invent product performance claims. Never write "clinically proven," "10x stronger," "scientifically tested" unless those exact words appear in the user's brief. Only describe what is physically visible or audible.

Never alter the product's appearance from an uploaded image. Never alter avatar appearance from an uploaded image.

═══════════════════════════════════════════════════════
SECTION 11 — VARIANT PRODUCTION
═══════════════════════════════════════════════════════
Produce ONE prompt variant. It uses the preset, the brand DNA, and the brief to construct a cinematic approach within the rules of the preset.

The variant is labeled exactly:
Variant A

This label is for the UI only and is stripped before sending to Seedance.

═══════════════════════════════════════════════════════
SECTION 12 — OUTPUT FORMAT (STRICT)
═══════════════════════════════════════════════════════
OUTPUT IS:
1. (If images provided) The legend line(s) using @image1 format
2. A blank line
3. "Variant A" label
4. The prompt structured EXACTLY like this:

STYLE: [Determine style dynamically based on brief and preset. MUST be "Photorealistic cinematic live-action" or "High-end UGC mobile phone footage" unless the user explicitly requests animation. NEVER hardcode 3D animation unless asked.]
WARDROBE: [Write 2-3 sentences describing the avatar's clothing in GENERIC terms only — color, material, silhouette, texture, pattern, fit, accessories. Describe how the garment drapes, its neckline, sleeve type, hemline, and any visible details like buttons, zippers, or embellishments. NEVER use brand or product names. Write: "a fitted ribbed chocolate brown tank top with thin spaghetti straps and a scooped neckline, paired with a delicate gold chain necklace resting on the collarbones" NOT "Elegant Chocolate Tank Top."]
ENVIRONMENT: [2-3 sentences describing the full environment — surfaces, textures, props visible, color palette of the space, time of day.]
MOOD: [Emotional arc — e.g. "Playful, curious, building excitement, ending in confident satisfaction."]

${(() => {
    const needsDialogue = preset.register && (preset.register.toLowerCase().includes('dialogue') || preset.register.toLowerCase().includes('conversational') || preset.register.toLowerCase().includes('talks to') || preset.register.toLowerCase().includes('peer-to-peer') || preset.register.toLowerCase().includes('instructional') || (preset.group === 'creator' && !preset.register.toLowerCase().includes('no dialogue')));
    const lang = settings?.language || 'English';
    const isNonEnglish = lang.toLowerCase() !== 'english';
    // Force dialogue for non-English languages even if preset doesn't require it,
    // because regional language voiceover needs spoken text to synthesize.
    if (needsDialogue || isNonEnglish) {
        return `DIALOGUE REQUIREMENT — ${isNonEnglish ? 'MANDATORY (regional language selected)' : 'this preset demands spoken words on camera'}:
Every shot with the avatar on screen MUST include a DIALOGUE line.
DIALOGUE LANGUAGE: ${lang} — ALL dialogue lines MUST be written DIRECTLY in ${lang} using ${lang} script/characters. NOT English. NOT translated from English. Write as a native ${lang} speaker would naturally speak.
${isNonEnglish ? `⚠️ CRITICAL: If ANY dialogue line is in English instead of ${lang}, the ENTIRE output is REJECTED. You MUST write in ${lang} only.` : ''}
Format: DIALOGUE [emotion]: "[exact words the presenter says in ${lang}]"

EMOTION TAGS (pick one per line — think like a director giving actor notes):
- [excited] — product reveal, wow moment, unboxing surprise
- [warm] — personal story, relatable moment, testimonial
- [urgent] — limited time, scarcity, call to action
- [calm] — expert opinion, feature explanation
- [playful] — humor, sarcasm, self-deprecating hook
- [dramatic] — emotional payoff, transformation reveal
- [curious] — opening hook, rhetorical question
- [confident] — strong recommendation, social proof

Write at least 4-6 distinct DIALOGUE lines across different shots. Emotions MUST arc — never repeat the same emotion twice in a row.
${isNonEnglish ? `Example (${lang}): DIALOGUE [excited]: "[write this in ${lang} script]"` : 'Example: DIALOGUE [curious]: "Has anyone else been struggling with this?"'}
`;
    } else {
        return 'NO DIALOGUE — this preset is silent/cinematic. Do not include spoken words.\n';
    }
})()}
${settings?.hookShot ? `HOOK SHOT (shots 1–2): A FUNNY QUIRKY opening that grabs attention in the first 2–3 seconds. The product (@image2 if avatar is used, else @image1) MUST be the source of comedy. Make it absurd and funny, but weave it naturally into the continuous narrative.\n\n` : ''}CRITICAL: NARRATIVE FLOW AND DETAIL REQUIREMENTS:
- Your task is to write a single, continuous, highly detailed narrative scene that runs for the full ${duration}s video duration.
- DO NOT break the scene into mechanical "SHOT 1", "SHOT 2" fragments. This causes the AI video model to create random camera movements and broken flows.
- Instead, write a fluid, series-style description that seamlessly transitions camera movements and actions without jarring cuts.
- The camera should float, track, or pan smoothly through the scene, maintaining visual consistency and a continuous story flow.
- Describe ALL of the following seamlessly within your narrative:
  1. CAMERA: exact angle, focal length, continuous movement type and speed.
  2. SUBJECT: facial micro-expression, eye direction, lip position, hand placement, body posture shift, and emotional intent.
  3. PRODUCT: exact position in frame, how light interacts with surface, label orientation, size relative to hands.
  4. ENVIRONMENT: what's visible in background, any ambient movement (curtains, steam, hair, particles).
  5. LIGHTING: direction, quality (soft/hard), color temperature, any shifts.
- Your TOTAL output MUST be extremely detailed, acting as a complete director's treatment for the scene. Do NOT write a short summary.

SCENE NARRATIVE:
[Write the full, unbroken story description here in 1-2 massive paragraphs. Blend the camera directions naturally into the prose (e.g., "The camera slowly pushes in on the model as she..."). Focus on a high-end cinematic, series-like aesthetic. Flesh out EVERY action and movement to create a comprehensive prompt. Every word earns its place by describing the physical reality and emotional weight of the scene.]

Last line of the prompt MUST be exactly: "Maintain visual consistency throughout. Ensure natural smooth continuous movements without jarring cuts. Generate video without subtitles."`;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt({ userBrief, productData, hasAvatar, settings }) {
    const p = productData || {};
    const lang = settings?.language || 'English';
    return `USER BRIEF: "${userBrief || 'Create a compelling short-form video ad for this product.'}"

PRODUCT INTELLIGENCE:
  Name: ${p.productName || 'Unknown'}
  Main USP: ${p.mainUSP || 'Not provided'}
  Key Features: ${Array.isArray(p.keyFeatures) ? p.keyFeatures.slice(0, 5).join('; ') : (p.keyFeatures || 'Not provided')}
  Target Audience: ${p.targetAudience || 'Not specified'}
  Problem Solved: ${p.problemSolved || 'Not specified'}
  Suggested Dialogue: ${settings?.customDialogue || p.suggestedDialogue || 'None — invent something specific and brand-aligned if dialogue is appropriate for this preset'}

GENERATION SETTINGS:
  Duration: ${settings?.duration || 8}s
  Format: ${settings?.format || '9:16'}
  Dialogue Language: ${lang} — write ALL dialogue lines in ${lang}
  Custom Dialogue: ${settings?.customDialogue || 'None'}
  Avatar provided: ${hasAvatar ? 'Yes — extract appearance from image, write them into scene specifically' : 'No — use functional label only, do not invent appearance'}

Write the Seedance 2.0 prompt variant now. Remember: in medias res. The ad is already in progress when the camera starts. Your output MUST be extremely detailed with a full SHOT-by-SHOT breakdown, acting as a director. There is no character limit; write as much detail as needed (up to 50K characters). Do NOT summarize.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT PARSER
// ─────────────────────────────────────────────────────────────────────────────

function parseVariants(rawText) {
    if (!rawText || typeof rawText !== 'string') throw new Error('Q-Ads Agent returned empty response');

    // Extract legend if present
    const legendLines = [];
    const lines = rawText.trim().split('\n');
    let i = 0;
    while (i < lines.length && lines[i].trim().startsWith('<<<')) {
        legendLines.push(lines[i].trim());
        i++;
    }
    const legend = legendLines.join('\n');

    // Split on variant labels
    const variantRegex = /\bVariant\s+([A-C])\b/gi;
    const parts = rawText.split(variantRegex);

    // parts alternates: [pre-A-text, 'A', textA, 'B', textB, 'C', textC]
    const variants = [];
    for (let j = 1; j < parts.length; j += 2) {
        const label = parts[j].toUpperCase();
        const body = (parts[j + 1] || '').trim();
        if (body.length > 30) {
            // Step 1: Strip (<<<image_N>>>) PARENTHETICALS first
            // The LLM often writes "the creator (<<<image_1>>>)" as a visual reference tag.
            // After stripping the tag, we'd get "the creator (the model)" which is redundant/odd.
            // Instead, remove the whole parenthetical — "the creator" is already the right noun.
            let cleanBody = body
                .replace(/\s*\(<<<image_\d+>>>\)/g, '')          // strip (<<<image_N>>>) parentheticals
                .replace(/<<<image_(\d+)>>>'?s?\b/g, (m, n) => parseInt(n) === 1 ? 'the model' : 'the product')
                .replace(/<<<image_(\d+)>>>/g, (m, n) => parseInt(n) === 1 ? 'the model' : 'the product')
                // Step 2: Strip legend header lines (<<<image_N>>> = ... lines)
                .replace(/<<<image_\d+>>>\s*=.*\n?/g, '')
                .replace(/[ \t]{2,}/g, ' ')
                .trim();
            variants.push({ variantId: label, prompt: cleanBody, legend });
        }
    }

    if (variants.length === 0) {
        throw new Error('Q-Ads Agent: could not parse any variants from output. Raw output was returned for retry.');
    }

    return variants;
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validateVariants(variants) {
    const issues = [];

    for (const v of variants) {
        const text = v.prompt.toLowerCase();

        // Allowed to have SHOT/STYLE section labels now. Removed the bullet point check.

        // Check for antislop
        for (const word of ANTISLOP_BANNED_WORDS) {
            if (text.includes(word.toLowerCase())) {
                issues.push(`Variant ${v.variantId}: contains banned word "${word}"`);
                break;
            }
        }

        // Check for age markers
        for (const word of AGEBLIND_BANNED_WORDS) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(v.prompt)) {
                issues.push(`Variant ${v.variantId}: contains age descriptor "${word}"`);
                break;
            }
        }

        // Check minimum length
        if (v.prompt.split(/\s+/).length < 80) {
            issues.push(`Variant ${v.variantId}: too short (${v.prompt.split(/\s+/).length} words — minimum 80)`);
        }
    }

    return issues;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run Q-Ads Agent — single call, 3 variants
 *
 * @param {object} params
 * @param {string} params.brandId
 * @param {string} params.presetId
 * @param {string} params.userBrief
 * @param {object} params.productData       — from /analyze-product
 * @param {string[]} params.productImageUrls — S3 URLs of product images
 * @param {string|null} params.avatarUrl    — S3 URL of avatar image (or null)
 * @param {object} params.settings          — { duration, format, customDialogue }
 * @param {string} params.userId
 * @returns {object} { variants: [{ variantId, prompt, legend }], preset, brandContext }
 */
export async function runQAdsAgent({
    brandId, presetId, userBrief, productData, productImageUrls = [], avatarUrl = null, settings = {}, userId
}) {
    console.log(`[Q-Ads Agent] Starting — brand=${brandId}, preset=${presetId}`);

    // ── 1. Load preset ────────────────────────────────────────────────────────
    const allPresets = await getPresets();
    const rawPreset = allPresets.presets.find(p => p.presetCode === presetId || p.id === presetId || p._id?.toString() === presetId);
    if (!rawPreset) throw new Error(`Unknown Q-Ads preset: ${presetId}`);
    const preset = { ...rawPreset, ...(rawPreset.promptRules || {}) };

    // ── 2. Load Brand DNA ─────────────────────────────────────────────────────
    const { brandContext } = await loadBrandContext(brandId);
    if (!brandContext || brandContext.trim().length < 20) {
        throw new Error('Complete Brand DNA setup first to generate brand-accurate ads.');
    }
    console.log(`[Q-Ads Agent] Brand context: ${brandContext.length} chars`);

    // ── 3. MCP Intelligence — parallel, 5s timeout ───────────────────────────
    let trendingContext = null;
    let competitorContext = null;
    try {
        const mcpPromise = callMcpToolsParallel([
            { tool: 'fetch_trending', args: { brandId } },
            { tool: 'scrape_competitor', args: { brandId } },
        ]);
        const mcpResults = await Promise.race([
            mcpPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('MCP timeout')), MCP_TIMEOUT_MS))
        ]);
        for (const { tool, result } of mcpResults) {
            if (tool === 'fetch_trending' && result?.summary) trendingContext = result.summary;
            if (tool === 'scrape_competitor' && result?.summary) competitorContext = result.summary;
        }
        console.log(`[Q-Ads Agent] MCP: trending=${!!trendingContext}, competitor=${!!competitorContext}`);
    } catch (mcpErr) {
        console.warn(`[Q-Ads Agent] MCP unavailable (non-blocking): ${mcpErr.message}`);
    }

    // ── 4. Collect image URLs for Claude vision ───────────────────────────────
    const imageUrls = [];
    const validProductImgs = (productImageUrls || []).filter(u => u && u.startsWith('http'));
    for (const url of validProductImgs) imageUrls.push(url);
    // Avatar is passed to Claude for visual inventory but NOT to Seedance
    if (avatarUrl && avatarUrl.startsWith('http') && !preset.noAvatar) {
        imageUrls.push(avatarUrl);
    }
    const hasAvatar = !preset.noAvatar && !!avatarUrl;

    // ── 5. Build system prompt ────────────────────────────────────────────────
    const duration = Math.min(parseInt(settings?.duration || preset.recommendedDuration || 8), 15);
    const format = settings?.format || preset.recommendedFormat || '9:16';
    const systemPrompt = buildSystemPrompt({ brandContext, preset, trendingContext, competitorContext, duration, format, settings });
    const userPrompt = buildUserPrompt({ userBrief, productData, hasAvatar, settings });

    console.log(`[Q-Ads Agent] Calling Claude — ${imageUrls.length} images, ${duration}s, ${format}`);

    // ── 6. Claude call (with images via vision) ───────────────────────────────
    let rawOutput;
    try {
        rawOutput = await callMultimodalAgent(
            systemPrompt,
            userPrompt,
            imageUrls,
            { temperature: 0.75, maxTokens: 5000, returnRaw: true }
        );
    } catch (llmErr) {
        console.error(`[Q-Ads Agent] Claude call failed: ${llmErr.message}`);
        throw new Error(`Q-Ads generation failed: ${llmErr.message}`);
    }

    // ── 7. Parse variants ─────────────────────────────────────────────────────
    let variants;
    try {
        variants = parseVariants(rawOutput);
    } catch (parseErr) {
        throw new Error(`Q-Ads Agent: output parse failed — ${parseErr.message}`);
    }

    // ── 8. Validate — retry once if issues found ──────────────────────────────
    const issues = validateVariants(variants);
    if (issues.length > 0) {
        const wordCount = variants[0]?.prompt?.split(/\s+/).length || 0;
        console.warn(`[Q-Ads Agent] Validation issues found: ${issues.join('; ')}. Retrying once...`);
        const retrySystem = systemPrompt + `\n\nPREVIOUS OUTPUT WAS REJECTED.\nIssues found: ${issues.join('; ')}.\nYour previous output was only ${wordCount} words — this is UNACCEPTABLE.\nYou MUST write an extremely detailed continuous narrative scene covering the full ${settings?.duration || 8}s video duration, with NO maximum character limit.\nEnsure the narrative flows seamlessly and describes camera angle, movement, subject action, product interaction, and lighting in vivid detail without jarring cuts.\nReturn the output labeled Variant A. No other text.`;
        try {
            rawOutput = await callMultimodalAgent(
                retrySystem,
                userPrompt,
                imageUrls,
                { temperature: 0.65, maxTokens: 5000, returnRaw: true }
            );
            variants = parseVariants(rawOutput);
            const retryIssues = validateVariants(variants);
            if (retryIssues.length > 0) {
                console.warn(`[Q-Ads Agent] Retry also has issues: ${retryIssues.join('; ')}. Proceeding with warnings.`);
            }
        } catch (retryErr) {
            console.warn(`[Q-Ads Agent] Retry failed: ${retryErr.message}. Using first attempt.`);
        }
    }

    console.log(`[Q-Ads Agent] Complete — ${variants.length} variants generated`);
    variants.forEach(v => console.log(`[Q-Ads Agent] Variant ${v.variantId}: ${v.prompt.split(/\s+/).length} words`));

    // 🧹 Post-generation cleanup — two-pass fix for real submission failures:
    //
    // Pass 1: Brand-name stripping (RC#2)
    //   Even with RULE 14, LLMs bleed brand names into WARDROBE / STYLE sections.
    //   Pattern: a WARDROBE/WEARING line that starts with an ALL-CAPS brand token
    //   e.g. "wearing the ARABEYA BEIGE PANTSUIT" → "wearing the beige pantsuit"
    //   Strategy: remove the leading ALL_CAPS sequences from WARDROBE descriptions
    //   and lowercase the remainder so the product reads as generic.
    //
    // Pass 2: Curly-brace stripping (RC#4)
    //   "{no watermark, clean background}" is parsed as template syntax by Atlas NLP.
    //
    // Pass 3: promptSanitizer (RC#1 vocab, RC#4 char limit, RC#5 phantom tags)

    function stripBrandNamesFromPrompt(text) {
        return text
            // Pass A: Strip { } template blocks
            .replace(/\{[^}]{0,300}\}/g, '')

            // Pass B: ALL-CAPS brand tokens in WARDROBE / wearing contexts
            // e.g. "WARDROBE: wearing the ARABEYA BEIGE PANTSUIT" → "WARDROBE: wearing the beige pantsuit"
            .replace(/(WARDROBE\s*:\s*|\bwearing\s+(?:the\s+)?|\bworn\s+(?:in\s+)?)([A-Z]{2,}(?:\s+[A-Z]{2,})+)/g,
                (_, prefix, brandToken) => `${prefix}${brandToken.toLowerCase()}`)
            .replace(/\b(?:wearing|dressed in|in the|the)\s+([A-Z]{3,}(?:\s+[A-Z]{3,})+)\b/g,
                (_, brand) => `the ${brand.toLowerCase()}`)

            // Pass C: Title Case brand tokens in WARDROBE lines
            // Catches "WARDROBE: Elegant White Ruched Halter Cutout Midi Dress throughout"
            // Pattern: WARDROBE: followed by 3+ consecutive Title-Case words (likely a product/garment name)
            // Replace with "a [lowercased descriptors]" to keep the style description but remove the proper noun feel
            .replace(/\bWARDROBE\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){2,})/g,
                (_, garmentName) => `WARDROBE: a ${garmentName.toLowerCase()}`)

            // Pass D: Fix broken possessives left when <<<image_N>>> was stripped inline
            // e.g. "runs hands over 's ruched fabric" → "runs hands over the model's ruched fabric"
            .replace(/\bower\s+'s\b/g, "over the model's")
            .replace(/\bof\s+'s\b/g, "of the model's")
            .replace(/\b(?:the\s+)?'s\s+/g, "the model's ")

            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    variants = variants.map(v => {
        // Pass 1 & 2: brand names + curly braces
        let p = stripBrandNamesFromPrompt(v.prompt);
        // Pass 3: vocab sanitizer (shoot→capture, char limit, phantom @image tags)
        const { prompt: cleanPrompt, warnings } = sanitizePromptForProvider(p, 'atlascloud', 0);
        if (warnings.length > 0) {
            console.warn(`[Q-Ads Agent] Post-gen sanitizer fixed Variant ${v.variantId}: ${warnings.join('; ')}`);
        }
        return { ...v, prompt: cleanPrompt };
    });

    return {
        variants,
        preset: {
            id: preset.id,
            name: preset.name,
            noAvatar: preset.noAvatar,
            recommendedDuration: preset.recommendedDuration,
            recommendedFormat: preset.recommendedFormat,
        },
        brandContext,
        hasAvatar,
        productImageUrls: validProductImgs,
        avatarUrl: hasAvatar ? avatarUrl : null,
    };
}

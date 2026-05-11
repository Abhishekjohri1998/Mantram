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

const MCP_TIMEOUT_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt({ brandContext, preset, trendingContext, competitorContext, duration, format, settings }) {
    const antislop = ANTISLOP_BANNED_WORDS.join(', ');
    const ageblind = AGEBLIND_BANNED_WORDS.join(', ');
    const hasTrending = !!trendingContext;
    const hasCompetitor = !!competitorContext;

    return `You are a professional ad director and Seedance 2.0 prompt engineer. Your job is to take a product brief and brand context and write ONE cinematic prompt that functions as directing instructions for an AI video model.

You write exactly like a cinematographer writing a shot note — specific, physical, present tense, no interpretation, no emotion words. You describe only what the camera sees and the microphone hears.

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

<<<image_1>>> = product (extract from image: material, shape, label color, logo, distinguishing visual features)
<<<image_2>>> = avatar (extract from image: wardrobe, build, delivery energy — NO age descriptors)

Then begin the paragraph on the next line.

On FIRST MENTION of the product in the paragraph, write its label with the image tag in parentheses. Example: "the bottle (<<<image_1>>>)". After first mention, use the label only.

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
1. (If images provided) The legend line(s) using <<<image_n>>> format
2. A blank line
3. "Variant A" label
4. The prompt structured EXACTLY like this:

STYLE: [Rendering style — e.g. "High-end stylized 3D animated, cinematic lighting, expressive face, polished materials, comedic visual storytelling."]
WARDROBE: [avatar clothing per shot range — match environment and brand.]
ENVIRONMENT: [All locations in one sentence — e.g. "Living room, kitchen, rainy street, office."]
MOOD: [Emotional arc — e.g. "Playful, curious, building excitement, ending in confident satisfaction."]

${settings?.hookShot ? `HOOK SHOT (shots 1–2): A FUNNY QUIRKY opening that grabs attention in the first 2–3 seconds. The product (<<<image_1>>> if provided) MUST be the source of comedy — e.g. the product box falls on the avatar's face, a cat knocks the product onto their head. Make it absurd but brand-safe. Use the same shot notation below.\n\n` : ''}SHOT 1: [Shot size + focal length] / [Camera move] / [Avatar action. Product reference if shown. ONE motion verb only.]
SHOT 2: [Shot size + focal length] / [Camera move] / [Action]
SHOT 3: [Shot size + focal length] / [Camera move] / [Action]
[Continue — 8 to 15 shots based on duration (approx 1.8s per shot)]

VIVID BUT ECONOMICAL. No poetic padding. Every word earns its place by describing something the camera sees. The prompt MUST NOT exceed 2200 characters total. Count before returning. Last line of the prompt MUST be exactly: "Maintain face and clothing consistency throughout. No distortion. Natural smooth movements. Generate video without subtitles."`;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt({ userBrief, productData, hasAvatar, settings }) {
    const p = productData || {};
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
  Custom Dialogue: ${settings?.customDialogue || 'None'}
  Avatar provided: ${hasAvatar ? 'Yes — extract appearance from image, write them into scene specifically' : 'No — use functional label only, do not invent appearance'}

Write the Seedance 2.0 prompt variant now. Remember: in medias res. The ad is already in progress when the camera starts.`;
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
            // Strip legend lines from variant body if duplicated
            const cleanBody = body.replace(/<<<image_\d+>>>\s*=.*\n?/g, '').trim();
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
            { temperature: 0.75, maxTokens: 3000, returnRaw: true }
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
        console.warn(`[Q-Ads Agent] Validation issues found: ${issues.join('; ')}. Retrying once...`);
        const retrySystem = systemPrompt + `\n\nPREVIOUS OUTPUT WAS REJECTED. Issues found: ${issues.join('; ')}.\nReturn ONLY one valid prose paragraph labeled Variant A. No other text.`;
        try {
            rawOutput = await callMultimodalAgent(
                retrySystem,
                userPrompt,
                imageUrls,
                { temperature: 0.65, maxTokens: 3000, returnRaw: true }
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

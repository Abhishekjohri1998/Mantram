/**
 * Storyboard Director — Claude-powered Ad Film Storyboard Generator
 *
 * Takes product + avatar + brief → writes a numbered shot plan (like a real film storyboard)
 * Each shot has: label, duration, frame image prompt, I2V video prompt, dialogue, camera, emotion
 *
 * Outputs structured JSON that the frontend renders as a storyboard grid.
 * Each shot's framePrompt is fed to Gemini image gen.
 * Each shot's videoPrompt is fed to Seedance 2.0 I2V.
 */

import { loadBrandContext, callMultimodalAgent } from '../shared/agentUtils.js';
import { ANTISLOP_BANNED_WORDS, AGEBLIND_BANNED_WORDS } from './qAdsPresets.js';

const MAX_SHOTS_DEFAULT = 12;
const MAX_SHOTS_LONG = 20;
const MIN_SHOT_DURATION = 3; // seconds
const MAX_SHOT_DURATION = 15; // max per Seedance I2V limit

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — Director Brain for Storyboard Planning
// ─────────────────────────────────────────────────────────────────────────────

function buildStoryboardDirectorPrompt({ brandContext, duration, format, style }) {
    // Increase shot density for modern fast-paced ad films (approx 1.5 - 2s per shot)
    const estimatedShots = Math.min(Math.ceil(duration / 1.5), MAX_SHOTS_LONG);
    const gridLayout = estimatedShots <= 9 ? '3x3' : estimatedShots <= 12 ? '3x4' : '4x4';

    return `You are a visionary, award-winning Ad Film Director and Cinematographer. Your expertise lies in crafting visually breathtaking, high-energy, and deeply emotional commercial video campaigns with dynamic pacing and avant-garde camera work.

Your job: Given a product, brand DNA, avatar, and creative brief, write exactly TWO master prompts. 
1. An \`imagePrompt\` for an AI Image Generator (like Midjourney or Gemini) to create a single high-resolution "storyboard poster" (a dense grid of frames).
2. A \`videoPrompt\` for an AI Video Generator (like Seedance) that will take your generated storyboard image as an exact reference and animate it into a seamless, high-end commercial video.

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
TARGET GRID: Around ${estimatedShots} frames total (a ${gridLayout} grid) to allow for fast-paced cinematic cuts.

═══════════════════════════════════════════════════════
PROMPT 1 RULES: imagePrompt (For the Storyboard Grid Image)
═══════════════════════════════════════════════════════
Write an incredibly detailed and imaginative prompt to generate ONE single image containing a dense grid of frames.
- AVOID basic grids. DEMAND a highly complex editorial layout.
- INJECT extreme creativity: use dynamic camera angles (low-angle hero shots, sweeping aerials, macro close-ups, Dutch angles, kinetic tracking).
- SPECIFY professional lighting (volumetric god rays, chiaroscuro, neon rim lights, softbox diffusion).
- Detail the EXACT sequence of fast cuts, props, character actions, and product hero moments.
- CRITICAL: The prompt MUST start with "Reference image attached — reproduce the exact product/garment shown with its precise colors, silhouette, and details in every frame." This ensures the image model uses the actual product reference and does NOT hallucinate a generic or different product.
- Example: "Reference image attached — reproduce the exact product/garment shown with its precise colors, silhouette, and details in every frame. Create a breathtaking high-end ${format} luxury pitch deck storyboard in a ${gridLayout} grid (${estimatedShots} frames). Pixar 3D style. The layout must resemble an elite agency presentation. Structured fast-cut flow: 1. Extreme macro close-up of condensation on the product -> 2. Kinetic whip-pan revealing the presenter in volumetric lighting -> 3. Low-angle tracking shot -> 4. Sweeping aerial... Each frame must have typography underneath describing the camera motion."

═══════════════════════════════════════════════════════
PROMPT 2 RULES: videoPrompt (For the Video Animation)
═══════════════════════════════════════════════════════
Write a highly complex and cinematic prompt instructing an AI Video Model to animate the sequence.
- It MUST start with: "Use the attached storyboard image as the exact reference."
- Instruct the AI to interpret the grid as a storyboard and execute the fast cuts dynamically.
- Define the cinematic motion using professional film terminology (smooth 3D tracking cameras, rack focus, kinetic whip-pans, hyper-lapse, high-energy motion blur).
- Detail how the product should interact with the light and how the camera should move to create a ${duration}-second masterpiece.
- Example: "Use the attached storyboard image as the exact reference. Animate this ${duration}-second ${format} sequence with award-winning commercial pacing. Preserve the exact shot order and visual continuity of the presenter and product. Execute kinetic whip-pans between cuts, smooth 3D tracking pushes, and rack focus transitions. Maintain flawless lighting and high-energy motion blur to bring the storyboard to life..."

═══════════════════════════════════════════════════════
OUTPUT FORMAT — CRITICAL
═══════════════════════════════════════════════════════
Return ONLY valid JSON. No markdown. No explanation. No code fences.
The JSON must match this exact schema:

{
  "imagePrompt": "Reference image attached — reproduce the exact product/garment shown...",
  "videoPrompt": "Use the attached storyboard image as the exact reference..."
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt({ brief, productName, productFeatures, avatarUrl, duration, format, style }) {
    return `CREATIVE BRIEF: "${brief || 'Create an incredibly creative, high-energy ad for this product.'}"

PRODUCT: ${productName || 'See product images provided'}
KEY FEATURES: ${productFeatures || 'Extract from the product images provided and heavily highlight them visually'}
TOTAL VIDEO DURATION: ${duration}s, FORMAT: ${format}
VISUAL STYLE: ${style}
AVATAR: ${avatarUrl ? 'Yes — avatar image provided. Incorporate this specific presenter dynamically across multiple fast-cut shots.' : 'No avatar — product-only ad with high-end CGI/VFX feel'}

Now act as the visionary director. Deeply analyze the product and brief, and write the two master prompts as JSON. 
Remember:
- Make the imagePrompt dense, rich, and full of fast-cut narrative beats.
- Make the videoPrompt cinematic, demanding high-end transitions and motion.
- Return ONLY the JSON object, no other text.`;
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
        // Try to extract JSON from within the text
        const jsonMatch = cleaned.match(/\{[\s\S]+\}/);
        if (jsonMatch) {
            plan = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error(`Failed to parse storyboard JSON: ${e.message}`);
        }
    }

    if (!plan.imagePrompt || !plan.videoPrompt) {
        throw new Error('Storyboard JSON missing imagePrompt or videoPrompt fields');
    }

    return {
        imagePrompt: plan.imagePrompt,
        videoPrompt: plan.videoPrompt,
        duration: targetDuration
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the Storyboard Director — generates a complete shot plan
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
 * @returns {object} storyboard plan JSON
 */
export async function runStoryboardDirector({
    brandId, brief, productName, productFeatures,
    productImageUrls = [], avatarUrl = null,
    style = 'hyperrealistic', duration = 30, format = '9:16', userId, directorModel = 'claude'
}) {
    console.log(`[Storyboard Director] Starting — ${duration}s, style=${style}, shots estimated=${Math.ceil(duration / 4)}`);

    // 1. Load brand DNA
    const { brandContext } = await loadBrandContext(brandId);
    console.log(`[Storyboard Director] Brand context: ${brandContext?.length || 0} chars`);

    // 2. Build prompts
    const systemPrompt = buildStoryboardDirectorPrompt({ brandContext, duration, format, style });
    const userPrompt = buildUserPrompt({ brief, productName, productFeatures, avatarUrl, duration, format, style });

    // 3. Build image URLs for Claude vision (product + avatar)
    const imageUrls = [];
    for (const url of (productImageUrls || []).filter(u => u?.startsWith('http')).slice(0, 3)) {
        imageUrls.push(url);
    }
    if (avatarUrl?.startsWith('http')) imageUrls.push(avatarUrl);

    console.log(`[Storyboard Director] Calling Claude with ${imageUrls.length} vision images...`);

    // 4. Call Agent (multimodal)
    let rawOutput;
    try {
        rawOutput = await callMultimodalAgent(
            systemPrompt,
            userPrompt,
            imageUrls,
            { temperature: 0.7, maxTokens: 6000, returnRaw: true, provider: directorModel }
        );
    } catch (err) {
        throw new Error(`Storyboard Director (Claude) failed: ${err.message}`);
    }

    // 5. Parse + validate
    let plan;
    try {
        plan = parseStoryboardOutput(rawOutput, duration);
    } catch (parseErr) {
        console.error(`[Storyboard Director] Parse failed, retrying with stricter prompt...`);
        // Retry once with a stronger instruction
        const retrySystem = systemPrompt + '\n\nCRITICAL: Your previous output could not be parsed as JSON. Return ONLY raw JSON, zero other text.';
        rawOutput = await callMultimodalAgent(retrySystem, userPrompt, imageUrls, { temperature: 0.5, maxTokens: 6000, returnRaw: true, provider: directorModel });
        plan = parseStoryboardOutput(rawOutput, duration);
    }

    console.log(`[Storyboard Director] Complete — duration: ${plan.duration}s`);

    return {
        ...plan,
        brandContext,
        requestedDuration: duration,
        format,
        defaultStyle: style,
        productImageUrls,
        avatarUrl,
    };
}

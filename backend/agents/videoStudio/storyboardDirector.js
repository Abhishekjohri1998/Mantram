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

function buildStoryboardDirectorPrompt({ brandContext, duration, format, style, dialogueLanguage = 'English', brandName = '', logoUrl = '', logoDescription = '' }) {
    let logoTagInstruction = '';
    let logoPromptInstruction = '';
    if (logoUrl) {
        logoTagInstruction = `
- <<<image_logo>>> = brand logo (extract from image: exact shapes, typography, and colors of the logo described as: "${logoDescription || 'brand logo'}").`;
        logoPromptInstruction = `
- Brand logo: Since a brand logo reference image is provided, you MUST refer to the brand logo using the tag "the brand logo (<<<image_logo>>>)" whenever it appears in the Canvas, footer, or panels. This ensures the image model uses the actual logo design and does not hallucinate it.`;
    }

    return `You are a visionary, award-winning Ad Film Director and Cinematographer. Your expertise lies in crafting visually breathtaking, high-energy, and deeply emotional commercial video campaigns with dynamic pacing and avant-garde camera work.

Your job: Given a product, brand DNA, avatar, and creative brief, write ONE master prompt for the storyboard poster image generator.

The video animation prompt will be written separately after storyboard approval — you do NOT need to generate it here.

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

═══════════════════════════════════════════════════════
PROMPT RULES: imagePrompt (For the Storyboard Grid Image)
═══════════════════════════════════════════════════════
Write an incredibly detailed and imaginative prompt to generate ONE single image containing a dense grid of multiple distinct storyboard panels.
- GRID SIZE & PACING: Determine the optimal number of frames (shots) and the grid layout (e.g. 2x2, 2x3, 3x3, 3x4, 4x4) dynamically based on the story pacing and structure. The total duration is ${duration}s, so each panel should represent a logical segment (e.g. 2 to 6 seconds per shot) summing up to exactly ${duration}s. Do NOT hardcode the layout; let it fit the story.
- STRUCTURE: You MUST format the generated imagePrompt using this exact structure (do not skip any sections):

Create a premium [Grid Layout, e.g. 3x3] cinematic storyboard poster for a [Product/Brand Name] advertisement.

Canvas:
[Describe layout: format e.g. Square 1:1 or Portrait 9:16, clean grid layout. Each panel has a dark frame, small scene number in top-left, short title text, brief action copy, and a sound bar at the bottom with music and SFX cues. Optionally add a footer area with a tagline and logo.]

Style:
[Describe visual style, lighting, grading, mood, weather, photography quality, premium feel based on the requested visual style.]

Main subject:
[Describe the product/garment (reproducing its exact colors and details) and any characters/avatars shown. Avoid hallucinating product details.]
${logoPromptInstruction}

Storyboard panels:
Panel 1: [TITLE]
[Describe visual action, camera angle and movement, matching continuous cinematic flow]
Music: [Describe music/mood cue]
SFX: [Describe sound effects cues]

Panel 2: ...
[Continue for all panels in the grid]

Design details:
[Describe formatting details: white uppercase typography for scene titles, body text, black translucent bars for music and SFX, waveforms, clean spacing.]

Negative prompt:
[Detailed negative prompt to prevent cartoonish styles, low quality, distorted layout, smiling models, etc.]

OUTPUT FORMAT — CRITICAL
Return ONLY valid JSON. No markdown. No explanation. No code fences.
The JSON must match this exact schema:

{
  "imagePrompt": "Create a premium..."
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function buildUserPrompt({ brief, productName, productFeatures, avatarUrl, duration, format, style, dialogueLanguage = 'English', brandName = '', logoUrl = '', logoDescription = '', productImageUrls = [] }) {
    const logoDetails = logoUrl ? `\nBRAND LOGO DETAILS: description="${logoDescription}"` : '';

    const imageMappingLines = [];
    let imgIdx = 1;
    if (productImageUrls && productImageUrls.length > 0) {
        productImageUrls.forEach((url, i) => {
            imageMappingLines.push(`  - Attached Image ${imgIdx++} in your visual input is a **PRODUCT** reference image featuring the product: "${productName || 'product'}". Use this as visual reference for the product in the storyboard panels.`);
        });
    }
    if (avatarUrl) {
        imageMappingLines.push(`  - Attached Image ${imgIdx++} in your visual input is the **AVATAR/PRESENTER** reference image featuring the presenter's face/body. Use this as visual reference for the human presenter in the storyboard panels.`);
    }

    const imageMappingText = imageMappingLines.length > 0
        ? `\nIMAGE REFERENCES:\n${imageMappingLines.join('\n')}\n\nCRITICAL CONTEXT DISAMBIGUATION:\n- Even if a product reference image contains a model wearing, holding, or interacting with the product, treat that image strictly as the PRODUCT reference (representing the item itself). Do NOT confuse the model in the product image with the main presenter.\n- The main presenter's face and identity must be strictly modeled after the AVATAR reference image (the last attached image). Keep these distinct.`
        : '';

    return `CREATIVE BRIEF: "${brief || 'Create an incredibly creative, high-energy ad for this product.'}"
${imageMappingText}

PRODUCT: ${productName || 'See product images provided'}
KEY FEATURES: ${productFeatures || 'Extract from the product images provided and heavily highlight them visually'}
TOTAL VIDEO DURATION: ${duration}s, FORMAT: ${format}
VISUAL STYLE: ${style}
DIALOGUE LANGUAGE: ${dialogueLanguage}
AVATAR: ${avatarUrl ? 'Yes — avatar image provided. Incorporate this specific presenter dynamically across multiple fast-cut storyboard panels.' : 'No avatar — product-only ad with high-end CGI/VFX feel'}
BRAND NAME: ${brandName}${logoDetails}

Now act as the visionary director. Deeply analyze the product and brief, and write the imagePrompt as JSON.
Remember:
- Make the imagePrompt dense, rich, and formatted with Canvas, Style, Main subject, Storyboard panels, Design details, and Negative prompt sections.
- Return ONLY the JSON object with the imagePrompt field, no other text.`;
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

    if (!plan.imagePrompt) {
        throw new Error('Storyboard JSON missing imagePrompt field');
    }

    return {
        imagePrompt: plan.imagePrompt,
        videoPrompt: '',  // Video prompt generated fresh at animate-time — not at creation time
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
    style = 'hyperrealistic', duration = 30, format = '9:16', userId, directorModel = 'claude',
    dialogueLanguage = 'English'
}) {
    console.log(`[Storyboard Director] Starting — ${duration}s, style=${style}, shots estimated=${Math.ceil(duration / 4)}`);

    // 1. Load brand DNA
    const { brand, brandContext } = await loadBrandContext(brandId);
    console.log(`[Storyboard Director] Brand context: ${brandContext?.length || 0} chars`);
    
    const logoUrl = brand?.dna?.logo?.url || null;
    const logoDescription = brand?.dna?.logo?.metadata?.visionDescription || '';
    const brandName = brand?.name || 'the brand';

    // 2. Build prompts
    const systemPrompt = buildStoryboardDirectorPrompt({ brandContext, duration, format, style, dialogueLanguage, brandName, logoUrl, logoDescription });
    const userPrompt = buildUserPrompt({ brief, productName, productFeatures, avatarUrl, duration, format, style, dialogueLanguage, brandName, logoUrl, logoDescription, productImageUrls });

    // 3. Build image URLs for Claude vision (product + avatar) — NO cap, use ALL images
    const imageUrls = [];
    for (const url of (productImageUrls || []).filter(u => u?.startsWith('http'))) {
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
        dialogueLanguage,
        logoUrl,
    };
}

/**
 * Recreate the video prompt based on user's updated imagePrompt and selected dialogue language.
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

═══════════════════════════════════════════════════════
VIDEO PROMPT GENERATION RULES
═══════════════════════════════════════════════════════
- It MUST start with: "Use the attached storyboard image as the exact reference."
- Define the cinematic motion using professional film terminology (smooth 3D tracking cameras, rack focus, kinetic whip-pans, hyper-lapse, high-energy motion blur).
- Preserve the exact shot order and visual continuity of the presenter and product.
- MANDATORY: Write explicit spoken dialogues or voiceover scripts in the selected language (${dialogueLanguage}) directly inside the videoPrompt. The dialogues must be written in the actual script/language (e.g. if selected language is Hindi, write the dialogue in Hindi, e.g. Presenter says: "नमस्ते, यह हमारा नया प्रोडक्ट है...", rather than asking the character to speak without defining the dialogue).
- Detail the image reference tags in the videoPrompt explicitly:
  - Use \`@image1\` for the starting frame/visual layout (this is the first product image if present, else the storyboard poster).
  - Use \`@image2\` to reference the storyboard poster grid.
  - Use \`@image3\` to reference the presenter/avatar face if present in the scenes.
  - Use \`@image4\`, \`@image5\` etc. to reference additional product images if any.
  For instance, a prompt could mention: 'The presenter shown in @image3 says: "[spoken dialogue in ${dialogueLanguage}]".' or 'The camera pans across the product shown in @image1 and @image4...'

Return ONLY valid JSON with a single key "videoPrompt". No markdown. No explanation. No code fences.
Example output format:
{
  "videoPrompt": "Use the attached storyboard image as the exact reference. Animate this sequence..."
}
`;

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
        if (parsed.videoPrompt) {
            return parsed.videoPrompt;
        }
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

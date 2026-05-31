/**
 * Scene Planner — LLM-powered decomposition of long-form video into cinematic scenes
 *
 * Takes a target duration (30–120s) and decomposes it into 3–10 discrete scenes,
 * each with its own prompt, dialogue, emotion arc, and camera direction.
 *
 * Used by longFormGenerator.js to orchestrate parallel video generation.
 */

import { callAgentText } from '../shared/agentUtils.js';

// ── Scene Duration Allocation ──────────────────────────────────────────────────
// Optimal segment lengths per model (stay within native max while keeping coherent shots)
const OPTIMAL_SEGMENT_DURATION = {
    'seedance-2.0': 10,
    'seedance-2.0-fast': 10,
    'kling-3.0': 12,
    'kling-3.0-o': 10,
    'veo-3.1': 8,
    'veo-3.1-fast': 8,
    'grok-imagine': 10,
    'happyhorse-1.0': 10,
    'hunyuan': 8,
    'sora-2': 10,
    'gemini-flash': 6,
};

const MAX_SEGMENT_DURATION = {
    'seedance-2.0': 15,
    'seedance-2.0-fast': 15,
    'kling-3.0': 15,
    'kling-3.0-o': 15,
    'veo-3.1': 8,
    'veo-3.1-fast': 8,
    'grok-imagine': 15,
    'happyhorse-1.0': 15,
    'hunyuan': 10,
    'sora-2': 15,
    'gemini-flash': 10,
};

/**
 * Calculate how many scenes are needed for a given duration and model
 */
export function calculateSceneCount(targetDuration, model = 'seedance-2.0') {
    const optimal = OPTIMAL_SEGMENT_DURATION[model] || 10;
    const maxSeg = MAX_SEGMENT_DURATION[model] || 15;
    const count = Math.ceil(targetDuration / optimal);
    // Ensure each scene is at least 5s and at most maxSeg
    return Math.max(2, Math.min(count, Math.ceil(targetDuration / 5)));
}

/**
 * Allocate durations across scenes to hit the target total
 */
export function allocateSceneDurations(targetDuration, sceneCount, model = 'seedance-2.0') {
    const maxSeg = MAX_SEGMENT_DURATION[model] || 15;
    const baseDuration = Math.floor(targetDuration / sceneCount);
    const remainder = targetDuration - (baseDuration * sceneCount);

    const durations = [];
    for (let i = 0; i < sceneCount; i++) {
        // Distribute remainder to earlier scenes (hook scenes get slightly more time)
        let dur = baseDuration + (i < remainder ? 1 : 0);
        dur = Math.min(dur, maxSeg);
        dur = Math.max(dur, 5);
        durations.push(dur);
    }

    // Adjust if total doesn't match target
    const total = durations.reduce((a, b) => a + b, 0);
    if (total < targetDuration) {
        // Add extra seconds to last scenes
        let deficit = targetDuration - total;
        for (let i = durations.length - 1; i >= 0 && deficit > 0; i--) {
            const addable = Math.min(deficit, maxSeg - durations[i]);
            durations[i] += addable;
            deficit -= addable;
        }
    }

    return durations;
}

// ── Director's Arc Templates ───────────────────────────────────────────────────
const ARC_TEMPLATES = {
    short: {  // 30s → 3 scenes
        scenes: [
            { role: 'HOOK',   emotionSuggestion: 'curious/playful', purpose: 'Grab attention, introduce the problem or intrigue' },
            { role: 'REVEAL', emotionSuggestion: 'excited/dramatic', purpose: 'Product reveal, the solution, key demo moment' },
            { role: 'CTA',    emotionSuggestion: 'urgent/confident', purpose: 'Call to action, social proof, closing shot' },
        ],
    },
    medium: {  // 45-60s → 4-5 scenes
        scenes: [
            { role: 'HOOK',    emotionSuggestion: 'curious/playful',   purpose: 'Attention-grabbing opening, pose a question or show a relatable struggle' },
            { role: 'BUILD',   emotionSuggestion: 'warm/empathetic',   purpose: 'Relate to the viewer, build emotional connection, show the problem' },
            { role: 'REVEAL',  emotionSuggestion: 'excited/dramatic',  purpose: 'Product reveal — the moment the solution appears, hero shot' },
            { role: 'PROOF',   emotionSuggestion: 'confident/calm',    purpose: 'Product demo, feature showcase, social proof, before/after' },
            { role: 'CTA',     emotionSuggestion: 'urgent/confident',  purpose: 'Call to action, limited time offer, memorable closing' },
        ],
    },
    long: {  // 90-120s → 6-10 scenes
        scenes: [
            { role: 'COLD_OPEN',    emotionSuggestion: 'mysterious/curious', purpose: 'Cold open — start mid-action, visual hook, no product yet' },
            { role: 'HOOK',         emotionSuggestion: 'playful/curious',    purpose: 'Introduce the protagonist, pose the central question or pain point' },
            { role: 'PROBLEM',      emotionSuggestion: 'warm/empathetic',    purpose: 'Deep dive into the problem — relatable, emotional, real' },
            { role: 'TENSION',      emotionSuggestion: 'dramatic/urgent',    purpose: 'Build tension — the struggle peaks, something needs to change' },
            { role: 'REVEAL',       emotionSuggestion: 'excited/dramatic',   purpose: 'Product reveal — the eureka moment, hero shot with product' },
            { role: 'DEMO',         emotionSuggestion: 'confident/calm',     purpose: 'Product in action — features, benefits, how it works' },
            { role: 'PROOF',        emotionSuggestion: 'warm/confident',     purpose: 'Social proof, testimonial moment, before/after transformation' },
            { role: 'VISION',       emotionSuggestion: 'excited/playful',    purpose: 'Lifestyle shot — the new reality with the product' },
            { role: 'CTA',          emotionSuggestion: 'urgent/confident',   purpose: 'Call to action — limited time, special offer, direct instruction' },
            { role: 'TAG',          emotionSuggestion: 'warm/confident',     purpose: 'Closing brand tag — logo, tagline, final product beauty shot' },
        ],
    },
};

function getArcTemplate(targetDuration, sceneCount) {
    if (targetDuration <= 35) return ARC_TEMPLATES.short;
    if (targetDuration <= 65) return ARC_TEMPLATES.medium;
    return ARC_TEMPLATES.long;
}

// ── Main Scene Planner ─────────────────────────────────────────────────────────

/**
 * Plan scenes for a long-form video
 *
 * @param {object} params
 * @param {number} params.targetDuration      — Total video duration in seconds (30-120)
 * @param {string} params.model               — Video model ID (for duration limits)
 * @param {string} params.language            — Dialogue language
 * @param {string} params.prompt              — User's overall brief / prebuilt prompt
 * @param {object} params.productData         — Product analysis data
 * @param {string} params.brandContext        — Brand DNA context
 * @param {object} params.settings            — Additional settings (hookShot, cta, etc.)
 * @param {string[]} params.referenceImages   — Product/avatar image URLs
 * @returns {object[]} Array of scene objects
 */
export async function planScenes({
    targetDuration,
    model = 'seedance-2.0',
    language = 'English',
    prompt = '',
    productData = {},
    brandContext = '',
    settings = {},
    referenceImages = [],
}) {
    const sceneCount = calculateSceneCount(targetDuration, model);
    const durations = allocateSceneDurations(targetDuration, sceneCount, model);
    const arc = getArcTemplate(targetDuration, sceneCount);

    // Map arc roles to scene count (trim or repeat as needed)
    const arcScenes = [];
    for (let i = 0; i < sceneCount; i++) {
        if (i < arc.scenes.length) {
            arcScenes.push(arc.scenes[i]);
        } else {
            // For extra scenes beyond the template, use DEMO/PROOF alternating
            arcScenes.push(i % 2 === 0
                ? { role: 'DEMO_EXTRA', emotionSuggestion: 'confident/calm', purpose: 'Additional product feature showcase' }
                : { role: 'LIFESTYLE', emotionSuggestion: 'warm/playful', purpose: 'Lifestyle moment showing the product in use' }
            );
        }
    }

    const isNonEnglish = language.toLowerCase() !== 'english';

    const systemPrompt = `You are a world-class ad director, screenwriter, and cinematographer planning a ${targetDuration}-second video advertisement.

You must decompose this video into exactly ${sceneCount} SCENES. Each scene will be generated as a separate AI video clip and stitched together with crossfade transitions.

TARGET MODEL: ${model}
TOTAL DURATION: ${targetDuration}s across ${sceneCount} scenes
DIALOGUE LANGUAGE: ${language}${isNonEnglish ? ` — ALL dialogue MUST be in ${language} script/characters. NO English.` : ''}

BRAND CONTEXT:
${brandContext || 'No brand data available.'}

PRODUCT INTELLIGENCE:
  Name: ${productData?.productName || 'Unknown'}
  USP: ${productData?.mainUSP || 'Not provided'}
  Features: ${Array.isArray(productData?.keyFeatures) ? productData.keyFeatures.join('; ') : (productData?.keyFeatures || 'Not provided')}
  Target Audience: ${productData?.targetAudience || 'Not specified'}

USER BRIEF: "${prompt || 'Create a compelling video ad for this product.'}"
CTA: ${settings?.cta || 'Shop now'}

REFERENCE IMAGES: ${referenceImages.length} images provided (product + avatar).
Every scene MUST reference these images to maintain visual consistency. Use @image1, @image2, etc.

SCENE PLAN (you must produce exactly ${sceneCount} scenes):
${arcScenes.map((s, i) => `Scene ${i + 1} [${durations[i]}s] — ${s.role}: ${s.purpose} (suggested emotion: ${s.emotionSuggestion})`).join('\n')}

RULES & CREATIVE GUIDELINES:
1. BRAND CATEGORY & EMOTIONAL ARC:
   - Analyze the brand context, vertical, and product category. Tailor the visual language, camerawork, pacing, color palette, and mood to match the vertical (e.g. high-fashion luxury uses slow, dramatic, soft-lit, high-contrast, atmospheric studio shots with rich fabric textures; tech uses sleek, high-tech, futuristic UI overlays, dynamic movement, and clean blue/teal grading).
   - Write creative, narrative-driven scenes that build an emotional arc (Hook, Build-up, Demonstration, Call to Action) instead of flat, literal summaries of product features.
2. VISUAL PROMPT DEPTH & MOTION:
   - Each visualPrompt must be a richly detailed, self-contained description (at least 100 words) describing the subject, active dynamic motion, camera angles (e.g., slow tracking shot, low-angle pan, close-up), lighting (e.g. golden hour backlight, soft diffused key light), and art direction. Avoid static poses; describe active, cinematic motion.
3. SPATIAL CHAINING & MATCH CUTS:
   - Design seamless visual transitions between scenes. The transitionOut of a scene must directly align with the opening framing of the next scene (e.g., a match cut on action or a camera push-in to a specific object/actor), creating a continuous and visually unified film.
4. DIALOGUE:
   - Write natural, emotionally resonant dialogue or voiceover (1-3 lines per scene) matching the suggested emotion, formatted as DIALOGUE [emotion]: "text in ${language}".
   - ${isNonEnglish ? `ALL dialogue MUST be in ${language} script/characters. If any line is in English, the output is REJECTED.` : ''}
5. Product must appear in at least ${Math.ceil(sceneCount * 0.7)} of ${sceneCount} scenes, integrated naturally into the environment.

OUTPUT FORMAT (strict JSON array):
[
  {
    "sceneId": 1,
    "role": "HOOK",
    "duration": ${durations[0]},
    "visualPrompt": "Detailed cinematic prompt (100+ words) describing the action, lighting, color grading, setting, and subject, referencing @image1 and @image2...",
    "dialogue": [
      { "text": "dialogue line in ${language}", "emotion": "curious" }
    ],
    "camerawork": "Medium close-up at 50mm, slow dolly-in...",
    "transitionOut": "Camera pushes into close-up, matching the visual opening of next scene"
  }
]

Return ONLY the JSON array. No explanation, no markdown.`;

    const userPrompt = `Plan ${sceneCount} scenes for a ${targetDuration}s ${language} video ad. Product: ${productData?.productName || 'Unknown'}. Brief: "${prompt?.substring(0, 500) || 'Compelling product ad'}". Settings: ${JSON.stringify({ hookShot: settings?.hookShot, cta: settings?.cta, style: settings?.style })}`;

    console.log(`[ScenePlanner] Planning ${sceneCount} scenes for ${targetDuration}s video (${model}, ${language})...`);

    let rawOutput;
    try {
        rawOutput = await callAgentText(systemPrompt, userPrompt, 0.7, 8000);
    } catch (err) {
        console.error(`[ScenePlanner] LLM call failed: ${err.message}`);
        // Fallback: generate scenes from the arc template without LLM
        return generateFallbackScenes({ sceneCount, durations, arcScenes, language, prompt, productData, settings });
    }

    // Parse JSON output
    try {
        // Strip markdown code fences if present
        let cleaned = rawOutput.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const scenes = JSON.parse(cleaned);

        if (!Array.isArray(scenes) || scenes.length === 0) {
            throw new Error('Empty scene array');
        }

        // Normalize and validate scenes
        const normalizedScenes = scenes.map((scene, i) => ({
            sceneId: scene.sceneId || i + 1,
            role: scene.role || arcScenes[i]?.role || 'SCENE',
            duration: durations[i] || scene.duration || 10,
            visualPrompt: scene.visualPrompt || scene.prompt || '',
            dialogue: Array.isArray(scene.dialogue) ? scene.dialogue : [],
            camerawork: scene.camerawork || '',
            transitionOut: scene.transitionOut || 'Smooth crossfade to next scene',
        }));

        console.log(`[ScenePlanner] ✅ Planned ${normalizedScenes.length} scenes: ${normalizedScenes.map(s => `${s.role}(${s.duration}s)`).join(' → ')}`);
        return normalizedScenes;

    } catch (parseErr) {
        console.warn(`[ScenePlanner] JSON parse failed: ${parseErr.message}. Using fallback.`);
        return generateFallbackScenes({ sceneCount, durations, arcScenes, language, prompt, productData, settings });
    }
}

/**
 * Fallback scene generation when LLM fails — uses the prompt directly
 */
function generateFallbackScenes({ sceneCount, durations, arcScenes, language, prompt, productData, settings }) {
    console.log(`[ScenePlanner] Generating ${sceneCount} fallback scenes from template...`);

    return arcScenes.map((arc, i) => ({
        sceneId: i + 1,
        role: arc.role,
        duration: durations[i],
        visualPrompt: `Scene ${i + 1}: ${arc.purpose}. ${prompt?.substring(0, 300) || `Showcase ${productData?.productName || 'the product'} with cinematic quality.`} Maintain visual consistency with reference images. @image1 @image2`,
        dialogue: [{
            text: `[${language} dialogue for ${arc.role.toLowerCase()} scene about ${productData?.productName || 'the product'}]`,
            emotion: arc.emotionSuggestion.split('/')[0],
        }],
        camerawork: 'Cinematic camera movement, steady tracking shot',
        transitionOut: 'Smooth crossfade to next scene',
    }));
}

/**
 * Decompose storyboard's master videoPrompt into sequential scenes
 */
export async function planStoryboardScenes({
    videoPrompt,
    imageUrl,
    targetDuration,
    model = 'seedance-2.0',
    language = 'English',
    brandContext = '',
    productName = '',
    productFeatures = '',
    referenceImages = [],
}) {
    const sceneCount = calculateSceneCount(targetDuration, model);
    const durations = allocateSceneDurations(targetDuration, sceneCount, model);

    const isNonEnglish = language.toLowerCase() !== 'english';

    const systemPrompt = `You are a world-class ad director, screenwriter, and cinematographer. You are planning a long-form video ad of ${targetDuration} seconds based on a master storyboard.

The master storyboard consists of:
1. A master storyboard video prompt: "${videoPrompt}"

You must decompose this video into exactly ${sceneCount} sequential scenes/segments. Each segment will be generated as a separate AI video clip (around ${durations[0]}s each) and stitched together with crossfade transitions.

TOTAL DURATION: ${targetDuration}s across ${sceneCount} scenes
DIALOGUE LANGUAGE: ${language}${isNonEnglish ? ` — ALL dialogue MUST be in ${language} script/characters. NO English.` : ''}

BRAND CONTEXT:
${brandContext || 'No brand data available.'}

PRODUCT:
  Name: ${productName || 'Unknown'}
  Features: ${productFeatures || 'Highlight product features visually'}

REFERENCE IMAGES: ${referenceImages.length} images provided (product + avatar).
Every scene MUST reference these images to maintain visual consistency. Use @image1, @image2, etc.

YOUR TASK:
Decompose the master storyboard video prompt into exactly ${sceneCount} sequential segments.
Analyze the brand category and vertical (e.g. luxury, tech, beauty, wellness, sports) and write visual prompts that align with that category's tone and styling, crafting an emotional and visually creative storyline.

For each segment:
1. Write a specific "visualPrompt" describing ONLY what happens in this segment of the storyboard sequence. Do NOT repeat the entire sequence. Focus on the camera movement, action, and continuity from the previous segment. Describe active dynamic motion, camera angles (e.g., slow dolly-in, tracking pan), lighting, and color grading. Subsequent segments should chain from the last frame of the previous one.
2. Extract or write the DIALOGUE / VOICEOVER lines for this segment (in ${language}) in the format: DIALOGUE [emotion]: "text in ${language}". The dialogue lines must match the dialogues specified in the master storyboard video prompt, distributed chronologically. If no explicit dialogue is in the master storyboard for a segment, you may write relevant voiceover describing the product features or brand message.
3. CRITICAL — NO REPEATED BRAND CLOSINGS: The brand logo, brand name lock-up, and CTA must appear ONLY in the FINAL segment's closing seconds. Do NOT include brand logo reveals, brand closing shots, or CTAs in any intermediate or opening segment. Segments 1 through ${sceneCount - 1} should be pure narrative/product/presenter content with NO brand intro or brand outro.

OUTPUT FORMAT (strict JSON array):
[
  {
    "sceneId": 1,
    "duration": ${durations[0]},
    "visualPrompt": "Detailed cinematic prompt (100+ words) describing the action, lighting, color grading, setting, and subject for this segment, referencing @image1 and @image2...",
    "dialogue": [
      { "text": "spoken dialogue line in ${language}", "emotion": "confident" }
    ]
  }
]

Return ONLY the JSON array. No explanation, no markdown.`;

    const userPrompt = `Decompose this master video prompt into ${sceneCount} segments for a ${targetDuration}s video: "${videoPrompt?.substring(0, 1000)}"`;

    console.log(`[ScenePlanner] Decomposing storyboard into ${sceneCount} scenes for ${targetDuration}s video...`);

    let rawOutput;
    try {
        rawOutput = await callAgentText(systemPrompt, userPrompt, 0.7, 8000);
    } catch (err) {
        console.error(`[ScenePlanner] Storyboard planning LLM call failed: ${err.message}`);
        // Fallback: divide master prompt into segments
        return durations.map((dur, i) => ({
            sceneId: i + 1,
            duration: dur,
            visualPrompt: `Segment ${i + 1} of ${sceneCount}: Continue storyboard flow. ${videoPrompt?.substring(0, 300)}`,
            dialogue: [],
        }));
    }

    try {
        let cleaned = rawOutput.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const scenes = JSON.parse(cleaned);

        if (!Array.isArray(scenes) || scenes.length === 0) {
            throw new Error('Empty scene array');
        }

        return scenes.map((scene, i) => ({
            sceneId: scene.sceneId || i + 1,
            duration: durations[i] || scene.duration || 10,
            visualPrompt: scene.visualPrompt || scene.prompt || `Segment ${i+1}: Continue storyboard flow.`,
            dialogue: Array.isArray(scene.dialogue) ? scene.dialogue : [],
        }));
    } catch (parseErr) {
        console.warn(`[ScenePlanner] Storyboard JSON parse failed: ${parseErr.message}`);
        return durations.map((dur, i) => ({
            sceneId: i + 1,
            duration: dur,
            visualPrompt: `Segment ${i + 1} of ${sceneCount}: Continue storyboard flow. ${videoPrompt?.substring(0, 300)}`,
            dialogue: [],
        }));
    }
}

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
    'veo-3.1-lite': 8,
    'grok-imagine': 10,
    'happyhorse-1.0': 10,
    'happyhorse-1.1': 10,
    'hunyuan': 8,
    'sora-2': 10,
    'gemini-flash': 6,
    'gemini-omni-flash': 6,
};

const MAX_SEGMENT_DURATION = {
    'seedance-2.0': 15,
    'seedance-2.0-fast': 15,
    'kling-3.0': 15,
    'kling-3.0-o': 15,
    'veo-3.1': 8,
    'veo-3.1-fast': 8,
    'veo-3.1-lite': 8,
    'grok-imagine': 15,
    'happyhorse-1.0': 15,
    'happyhorse-1.1': 15,
    'hunyuan': 10,
    'sora-2': 15,
    'gemini-flash': 10,
    'gemini-omni-flash': 10,
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
2. VISUAL PROMPT DEPTH & MOTION (CRITICAL — affects generation quality directly):
   - Each visualPrompt is a self-contained AI video generation prompt. The longer the scene, the richer the prompt must be.
   - Word count MINIMUMS per scene duration (strictly enforced):
     • Scene ≤ 5s → at least 60 words
     • Scene 5–8s → at least 120 words
     • Scene 8–12s → at least 180 words
     • Scene > 12s → at least 240 words (multiple timed sub-cuts, e.g. "At 0s: ..., at 5s: ..., at 10s: ...")
   - Each prompt must describe: subject identity, active dynamic motion (not static pose), camera angle and movement, lighting setup, color grade, background environment, and how the scene ends.
   - For scenes > 10s: break the scene into explicit timed sub-shots within the prompt. Example: "[0–4s] Wide establishing shot... [4–8s] Push to medium close-up... [8–12s] Tight product shot, freeze frame on logo."
   - Avoid static poses; describe active, cinematic motion throughout.
3. SHOT VARIETY (CRITICAL for visual energy):
   - NO two consecutive scenes may use the same shot type. Rotate: ECU (extreme close-up), CU (close-up), MCU (medium close-up), MS (medium shot), WS (wide shot), OTS (over-the-shoulder), POV.
   - Each scene must specify a unique camera move: dolly, push, pull, orbit, crane, handheld, static.
4. SPATIAL CHAINING & MATCH CUTS:
   - Design seamless visual transitions between scenes. The transitionOut of a scene must directly align with the opening framing of the next scene (e.g., a match cut on action or a camera push-in to a specific object/actor), creating a continuous and visually unified film.
5. DIALOGUE:
   - Write natural, emotionally resonant dialogue or voiceover (1-3 lines per scene) matching the suggested emotion, formatted as DIALOGUE [emotion]: "text in ${language}".
   - ${isNonEnglish ? `ALL dialogue MUST be in ${language} script/characters. If any line is in English, the output is REJECTED.` : ''}
6. Product must appear in at least ${Math.ceil(sceneCount * 0.7)} of ${sceneCount} scenes, integrated naturally into the environment.

OUTPUT FORMAT (strict JSON array):
[
  {
    "sceneId": 1,
    "role": "HOOK",
    "duration": ${durations[0]},
    "visualPrompt": "Self-contained cinematic AI video prompt (min ${durations[0] <= 5 ? 60 : durations[0] <= 8 ? 120 : durations[0] <= 12 ? 180 : 240}+ words for a ${durations[0]}s scene). Describe subject, motion, camera, lighting, color grade, and environment. For scenes >10s add timed sub-shots like [0-4s], [4-8s]...",
    "dialogue": [
      { "text": "dialogue line in ${language}", "emotion": "curious" }
    ],
    "camerawork": "Unique camera type and movement — e.g. low-angle dolly-in at 35mm, handheld push-to-close...",
    "transitionOut": "Camera pushes into close-up, matching the visual opening of next scene"
  }
]

Return ONLY the JSON array. No explanation, no markdown.`;

    // Build per-scene word-count hint for the user prompt so the LLM sees it on both system + user side
    const sceneWordHints = arcScenes.map((s, i) => {
        const d = durations[i];
        const minWords = d <= 5 ? 60 : d <= 8 ? 120 : d <= 12 ? 180 : 240;
        return `Scene ${i+1} [${d}s] → min ${minWords} words`;
    }).join(', ');

    const userPrompt = `Plan ${sceneCount} scenes for a ${targetDuration}s ${language} video ad. Product: ${productData?.productName || 'Unknown'}. Brief: "${prompt?.substring(0, 500) || 'Compelling product ad'}". Settings: ${JSON.stringify({ hookShot: settings?.hookShot, cta: settings?.cta, style: settings?.style })}. WORD COUNT TARGETS: ${sceneWordHints}.`;

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
 * Decompose storyboard's master videoPrompt into sequential scenes.
 *
 * When structuredPlan.cuts[] is available (generated by storyboardDirector.js),
 * we map the director's pre-planned cuts directly to segments — NO LLM re-decomposition.
 * This preserves exact shot timings from the storyboard.
 *
 * When structuredPlan is missing, fall back to LLM decomposition.
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
    characterNames = [],   // names of characters mapped to @imageN (after product + poster)
    structuredPlan = null, // NEW: 4-section plan from storyboardDirector (contains cuts[])
}) {
    // ── FAST PATH: director's cuts[] are available ────────────────────────────
    // Group the storyboard director's individual cuts into video segments,
    // respecting the model's max segment duration. Each segment = 1 or more cuts.
    if (structuredPlan?.cuts?.length > 0) {
        const maxSeg = MAX_SEGMENT_DURATION[model] || 15;
        const cuts = structuredPlan.cuts;

        const segments = [];
        let currentSegment = { cutsInSegment: [], duration: 0 };

        for (const cut of cuts) {
            const cutDur = Math.max(2, parseInt(cut.duration) || 4);
            // If adding this cut would exceed the model limit, start a new segment
            if (currentSegment.duration > 0 && currentSegment.duration + cutDur > maxSeg) {
                segments.push(currentSegment);
                currentSegment = { cutsInSegment: [], duration: 0 };
            }
            currentSegment.cutsInSegment.push({ ...cut, duration: cutDur });
            currentSegment.duration += cutDur;
        }
        if (currentSegment.cutsInSegment.length > 0) segments.push(currentSegment);

        // Build scene objects from grouped cuts
        const isNonEnglish = language.toLowerCase() !== 'english';
        const sceneCount = segments.length;

        const scenes = segments.map((seg, i) => {
            // ── Build Seedance-native directorial prompt targeting ~2000-2200 chars ──
            // Seedance performs best with the SHOT N structure + STYLE/ENVIRONMENT/MOOD block.
            // Reference: promptEnhancer.js MODEL_STYLE_GUIDES['seedance-2.0'] — "under 2200 characters"
            let elapsed = 0;

            // Build STYLE block from structuredPlan metadata
            const palette = (structuredPlan.colorPalette || []).join(', ');
            const paletteNames = (structuredPlan.paletteNames || []).join(', ');
            const moodKeywords = (structuredPlan.moodKeywords || []).join(', ');
            const cinemaRules = structuredPlan.cinematographyRules || '';
            const environment = structuredPlan.environmentFingerprint || 'Professional studio environment with cinematic lighting';
            const materialNotes = structuredPlan.materialNotes || '';
            const emotionalArc = structuredPlan.emotionalArc || '';
            const totalSegs = sceneCount;
            const isFirstSeg = i === 0;
            const isLastSeg = i === totalSegs - 1;

            // Build character preamble
            const charPreamble = characterNames.length > 0
                ? `CHARACTERS: ${characterNames.map(n => `"${n}"`).join(', ')}. Lock: exact face, hair colour, skin tone per reference sheet. Wardrobe follows per-shot costume description.\n`
                : '';

            // Build SHOT lines in Seedance directorial format — expanded, detailed
            const shotLines = seg.cutsInSegment.map((cut, ci) => {
                const start = elapsed;
                const end = elapsed + cut.duration;
                elapsed = end;
                const shotNum = ci + 1;
                // Voiceover inline if present
                const voiceoverLine = cut.voiceover ? ` Voiceover: "${cut.voiceover}"` : '';
                // Expand staging/attire detail from framePrompt
                const stagingDetail = cut.framePrompt && cut.framePrompt.length > 10
                    ? ` | Staging: ${cut.framePrompt.substring(0, 150)}`
                    : '';
                return `SHOT ${shotNum} [${start}s-${end}s]: ${(cut.shot || 'MEDIUM').replace(/_/g,' ')}, ${cut.lens || '50mm'} ${cut.move || 'STEADICAM'} — ${cut.scene}${stagingDetail}${voiceoverLine}`;
            }).join('\n');

            // Segment position note
            const segPositionNote = isFirstSeg
                ? 'OPENING SEGMENT — establish the world, hook immediately. No brand CTA.'
                : isLastSeg
                ? 'CLOSING SEGMENT — emotional peak, hard cut to product hero, brand name/tagline in final 2 seconds ONLY.'
                : `CONTINUATION SEGMENT ${i + 1}/${totalSegs} — maintain exact visual continuity from previous segment. No brand CTA.`;

            // Assemble full Seedance-native prompt — target 1800-2200 chars
            const promptParts = [
                charPreamble.trim(),
                `STYLE: ${cinemaRules || 'Hyperrealistic cinematic live-action. Sharp focus. Shallow depth of field. Natural motion blur on fast moves.'}`,
                `COLOR PALETTE: ${paletteNames || 'See reference'} (${palette}). Apply palette to lighting and set design — never recolor the product itself.`,
                materialNotes ? `MATERIALS: ${materialNotes}` : null,
                `ENVIRONMENT: ${environment}`,
                `MOOD: ${moodKeywords || 'Premium, cinematic, engaging'}. Arc: ${emotionalArc || 'build tension then reveal'}.`,
                isNonEnglish ? `LANGUAGE: All dialogue and voiceover MUST be in ${language} script/characters.` : null,
                '',
                shotLines,
                '',
                segPositionNote,
                `Total segment: ${seg.duration}s. Hard cuts between shots — no dissolves. Reference all provided @image tags for character and product visual consistency.`,
                '4K ultra HD, cinematic detail, sharp clarity, natural textures, stable picture.',
            ].filter(p => p !== null).join('\n');

            // Enforce ~2200 char Seedance sweet spot — truncate gracefully, keep quality suffix
            const SEEDANCE_MAX_CHARS = 2200;
            let visualPrompt = promptParts;
            if (visualPrompt.length > SEEDANCE_MAX_CHARS) {
                const truncated = visualPrompt.substring(0, SEEDANCE_MAX_CHARS);
                const lastPeriod  = truncated.lastIndexOf('.');
                const lastNewline = truncated.lastIndexOf('\n');
                const breakPoint  = Math.max(lastPeriod, lastNewline);
                visualPrompt = breakPoint > SEEDANCE_MAX_CHARS * 0.7
                    ? truncated.substring(0, breakPoint + 1).trim()
                    : truncated.trim();
                // Always keep quality suffix
                if (!visualPrompt.includes('4K ultra HD')) {
                    visualPrompt += '\n4K ultra HD, cinematic detail, sharp clarity, stable picture.';
                }
            }

            console.log(`[ScenePlanner] Seg ${i+1}: ${visualPrompt.length} chars, ${seg.cutsInSegment.length} shots, ${seg.duration}s`);

            return {
                sceneId: i + 1,
                duration: seg.duration,
                cutsInSegment: seg.cutsInSegment,
                visualPrompt,
                dialogue: seg.cutsInSegment.flatMap(c => c.voiceover
                    ? [{ text: c.voiceover, emotion: 'natural' }]
                    : c.dialogue ? [{ text: c.dialogue, emotion: 'natural' }] : []
                ),
            };
        });

        console.log(`[ScenePlanner] ✅ Direct cut→segment mapping: ${cuts.length} cuts → ${scenes.length} segments (${scenes.map(s => `${s.cutsInSegment.length}shot(s)/${s.duration}s/${s.visualPrompt.length}chars`).join(' | ')})`);
        return scenes;
    }

    // ── FALLBACK PATH: no structuredPlan — use LLM decomposition ─────────────
    const sceneCount = calculateSceneCount(targetDuration, model);
    const durations = allocateSceneDurations(targetDuration, sceneCount, model);

    const isNonEnglish = language.toLowerCase() !== 'english';

    // Build the character context for the system prompt
    let characterContext = '';
    if (characterNames.length > 0) {
        const productRefCount = Math.max(0, referenceImages.length - characterNames.length - 1);
        const charLines = characterNames.map((name, i) => {
            const tagIdx = 2 + productRefCount + i + 1;
            return `  @image${tagIdx} = Character "${name}" — use this face for "${name}" in relevant segments`;
        });
        characterContext = `\nCHARACTERS (distribute across segments for ensemble storytelling):\n${charLines.join('\n')}\nFeature different characters in different segments. Include at least one segment with two characters interacting.`;
    }

    const systemPrompt = `You are a world-class ad director, screenwriter, and cinematographer. You are planning a long-form video ad of ${targetDuration} seconds based on a master storyboard.

The master storyboard consists of:
1. A master storyboard video prompt: "${videoPrompt}"

You must decompose this video into exactly ${sceneCount} sequential scenes/segments. Each segment will be generated as a separate AI video clip (~${durations[0]}s each) and stitched together with hard cuts.

TOTAL DURATION: ${targetDuration}s across ${sceneCount} scenes
DIALOGUE LANGUAGE: ${language}${isNonEnglish ? ` — ALL dialogue MUST be in ${language} script/characters. NO English.` : ''}

BRAND CONTEXT:
${brandContext || 'No brand data available.'}

PRODUCT:
  Name: ${productName || 'Unknown'}
  Features: ${productFeatures || 'Highlight product features visually'}

REFERENCE IMAGES: ${referenceImages.length} images provided (product + avatar).
Every scene MUST reference these images to maintain visual consistency. Use @image1, @image2, etc.${characterContext}

YOUR TASK:
Decompose the master storyboard video prompt into exactly ${sceneCount} sequential segments.

For each segment:
1. Write a specific "visualPrompt" (100+ words) describing ONLY what happens in this segment. Include explicit timing: "CUT [Xs-Ys]: action". 
2. Include DIALOGUE / VOICEOVER lines for this segment (in ${language}).
3. CRITICAL: Brand logo/CTA ONLY in the FINAL segment's closing seconds. No brand elements in segments 1–${sceneCount - 1}.

OUTPUT FORMAT (strict JSON array):
[
  {
    "sceneId": 1,
    "duration": ${durations[0]},
    "visualPrompt": "Detailed prompt with timed cuts...",
    "dialogue": [
      { "text": "spoken line in ${language}", "emotion": "confident" }
    ]
  }
]

Return ONLY the JSON array. No explanation, no markdown.`;

    const userPrompt = `Decompose this master video prompt into ${sceneCount} segments for a ${targetDuration}s video: "${videoPrompt?.substring(0, 1000)}"`;

    console.log(`[ScenePlanner] LLM decomposing storyboard into ${sceneCount} scenes for ${targetDuration}s video...`);

    let rawOutput;
    try {
        rawOutput = await callAgentText(systemPrompt, userPrompt, 0.7, 8000);
    } catch (err) {
        console.error(`[ScenePlanner] Storyboard planning LLM call failed: ${err.message}`);
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


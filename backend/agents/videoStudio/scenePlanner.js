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
    'seedance-2.0': 15,
    'seedance-2.0-fast': 15,
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
/**
 * Procedurally expand segment cuts to at least 5 per segment.
 * Each sub-cut is DRIVEN BY THE ACTUAL SCENE CONTENT — not hardcoded shot archetypes.
 * Shot A mirrors the director's own framing for the dominant action.
 * Shot B tightens on character emotion.
 * Shot C is a contextual B-roll of a real visual element extracted from the scene text.
 * Shot D shifts to a contrasting angle/perspective of the same action.
 * Shot E widens to close the scene beat.
 */
function ensureMinCutsPerSegment(cuts, duration) {
    if (cuts.length >= 5) return cuts;

    const subDuration = Math.round((duration / 5) * 10) / 10;

    // Use the dominant cut as the scene anchor
    const dominant = cuts.reduce((best, c) => (c.duration > best.duration ? c : best), cuts[0]);
    const baseScene  = dominant.scene  || 'Cinematic visual scene';
    const baseFrame  = dominant.framePrompt || dominant.scene || '';
    const env        = dominant.environment || '';
    const domShot    = dominant.shot  || 'MEDIUM';
    const domMove    = dominant.move  || 'STEADICAM';
    const domLens    = dominant.lens  || '50mm prime';
    const charRef    = '@image2';

    // Derive B-roll subject from the actual scene text — looks for real visual elements
    const brollSubject = extractBrollSubject(baseFrame, env);

    // Contrasting angle: if director picked a low angle, shift to high, and vice-versa
    const contrastShot = domShot === 'LOW-ANGLE'   ? 'HIGH-ANGLE'
                       : domShot === 'HIGH-ANGLE'   ? 'LOW-ANGLE'
                       : domShot === 'WIDE'         ? 'CLOSE-UP'
                       : domShot === 'CLOSE-UP'     ? 'WIDE'
                       : domShot === 'ESTABLISHING' ? 'CLOSE-UP'
                       : 'MEDIUM';
    const contrastMove = ['STEADICAM', 'STATIC', 'DOLLY-IN', 'DOLLY-OUT', 'ARC']
                            .find(m => m !== domMove) || 'ARC';

    const variations = [
        // A — Primary action: mirrors the director's own framing, preserves their intent
        {
            shot: domShot,
            move: domMove,
            lens: domLens,
            framePrompt: `${baseFrame}${env ? ` Set: ${env}.` : ''} ${charRef} in frame — scene as directed.`,
        },
        // B — Emotional close-up: tighten onto the character's face / gesture / reaction
        {
            shot: 'CLOSE-UP',
            move: 'DOLLY-IN',
            lens: '85mm portrait',
            framePrompt: `85mm portrait lens, shallow depth of field. Close-up on ${charRef} — face, eyes, expression conveying emotion as ${baseScene.replace(/\.$/, '').toLowerCase()}. Warm key light, soft rim light, creamy bokeh background.`,
        },
        // C — Contextual B-roll: a real visual element from this specific scene/environment
        {
            shot: 'INSERT',
            move: 'STATIC',
            lens: '100mm macro',
            framePrompt: `B-roll insert — ${brollSubject}. 100mm macro lens, extreme close-up, razor-sharp foreground detail, bokeh background. Natural or ambient light picking out texture and surface. No character faces in frame — pure visual element.`,
        },
        // D — Perspective contrast: opposite angle of the same action for visual variety
        {
            shot: contrastShot,
            move: contrastMove,
            lens: '50mm prime',
            framePrompt: `${contrastShot.toLowerCase().replace('-', ' ')} perspective — ${baseScene.replace(/\.$/, '').toLowerCase()}. ${env ? `Location: ${env}.` : ''} ${charRef} repositioned in frame. 50mm prime, ${contrastMove.toLowerCase()} camera movement, cinematic depth.`,
        },
        // E — Scene resolution: wider pull-out closing this beat before the next scene
        {
            shot: 'WIDE',
            move: 'PULL-OUT',
            lens: '35mm anamorphic',
            framePrompt: `Wide pull-out closing this scene beat — ${baseScene.replace(/\.$/, '').toLowerCase()}. ${env || 'Location'} fully revealed. 35mm anamorphic, natural ambient light, full depth of field, foreground to background.`,
        },
    ];

    return variations.map((v, i) => ({
        ...dominant,
        id: `${dominant.id || 1}_sub${i + 1}`,
        duration: subDuration,
        shot: v.shot,
        move: v.move,
        lens: v.lens,
        framePrompt: v.framePrompt,
        scene: dominant.scene || `Scene shot ${i + 1}`,
        voiceover: i === 0 ? (dominant.voiceover || '') : '', // voiceover on primary shot only
        dialogue:  i === 0 ? (dominant.dialogue  || '') : '',
    }));
}

/**
 * Extract a contextual B-roll subject from the scene's framePrompt and environment text.
 * Looks for real visual elements mentioned in the content — sacred objects for devotional,
 * nature elements for music videos, product details for ads, etc.
 * Falls back to an environmental texture shot if no specific element is found.
 */
function extractBrollSubject(framePrompt = '', environment = '') {
    const text = `${framePrompt} ${environment}`.toLowerCase();

    // Ordered from most specific to least — stops at first match
    const patterns = [
        // Sacred / devotional
        { match: ['diya', 'diye', 'diyas'],        label: 'a diya oil lamp — flame flickering, warm golden light, melted wax pooling around the wick' },
        { match: ['incense', 'agarbatti'],          label: 'incense stick — thin smoke curling upward in slow motion, soft glow at the tip' },
        { match: ['lotus', 'kamal'],                label: 'lotus flower — petals opening, water drops beading on the surface, soft morning light' },
        { match: ['petal', 'flower', 'phool'],      label: 'flower petals — scattered on a surface, colours vivid, gentle texture in macro detail' },
        { match: ['bell', 'ghanta'],                label: 'temple bell — close-up of worn brass surface, rope swinging softly' },
        { match: ['garland', 'maala'],              label: 'marigold garland — individual flowers close-up, orange and yellow petals in sharp detail' },
        { match: ['idol', 'murti', 'deity', 'god'], label: 'sacred idol — close-up of intricate carved detail, gold and stone surface, ambient lamp light' },
        { match: ['flame', 'fire', 'aarti'],        label: 'flame — close-up of dancing fire, sparks micro-detail, warm orange light' },
        { match: ['river', 'ganga', 'water', 'nadi'], label: 'flowing water — river surface, light refracting on ripples, movement and stillness' },
        { match: ['leaf', 'tree', 'forest', 'jungle'], label: 'leaves — macro of a single leaf, light filtering through, vein texture' },
        { match: ['mountain', 'hill', 'pahad'],     label: 'mountain landscape — mist, rock texture, scale and silence' },
        { match: ['sky', 'cloud', 'dawn', 'sunset', 'sunrise'], label: 'sky — clouds moving, light gradient, atmospheric colour' },
        { match: ['hand', 'hath', 'finger'],        label: 'hands — close-up of palms, gesture, texture, light catching the skin' },
        { match: ['eye', 'aankh'],                  label: 'eyes — extreme close-up, iris detail, emotion, reflection in the pupil' },
        // Product / commercial
        { match: ['label', 'bottle', 'packaging'],  label: 'product label — macro detail, typography, surface finish, light reflection' },
        { match: ['product', 'logo'],               label: 'product surface — close-up texture, material quality, brand mark detail' },
        { match: ['fabric', 'cloth', 'texture'],    label: 'fabric texture — weave detail, colour, surface light interaction' },
        // Generic light/atmosphere
        { match: ['light', 'glow', 'shimmer', 'glimmer', 'golden'], label: 'light — bokeh particles, rays, atmospheric haze in slow motion' },
    ];

    for (const { match, label } of patterns) {
        if (match.some(keyword => text.includes(keyword))) return label;
    }

    // Fallback: generic environmental B-roll derived from environment description
    if (environment) {
        return `environmental detail from ${environment} — surface texture, ambient light, atmosphere`;
    }
    return 'ambient environmental texture — surface, light, and atmosphere in macro detail';
}

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
            // Guarantee a minimum visual density of at least 5 cuts per segment
            const activeCuts = ensureMinCutsPerSegment(seg.cutsInSegment, seg.duration);

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

            // Build SHOT lines in Seedance directorial format
            // KEY: framePrompt = rich visual + camera description (up to 40 words)
            //      scene       = narrative beat (1 short sentence)
            // Seedance is a VISUAL model — use framePrompt as primary, scene as context.
            const shotLines = activeCuts.map((cut, ci) => {
                const start = elapsed;
                const end = elapsed + cut.duration;
                elapsed = end;
                const shotNum = ci + 1;

                // Primary visual description: framePrompt contains dynamic angles, lighting, props, subjects
                const primaryVisual = cut.framePrompt && cut.framePrompt.trim().length > 15
                    ? cut.framePrompt.trim()
                    : cut.scene || `Shot ${shotNum}`;

                // Narrative context: what happens in this cut
                const narrativeBeat = (cut.scene && cut.framePrompt && cut.framePrompt.trim().length > 15)
                    ? ` Story: ${cut.scene.trim()}`
                    : '';

                // Voiceover inline
                const voiceoverLine = cut.voiceover && cut.voiceover.trim()
                    ? ` VO: "${cut.voiceover.trim()}"`
                    : '';

                // Shot grammar: shot type + lens + camera move in Seedance's language
                const shotGrammar = `${(cut.shot || 'MEDIUM').replace(/_/g,' ')}, ${cut.lens || '50mm'} ${cut.move || 'STEADICAM'}`;

                return `SHOT ${shotNum} [${start}s-${end}s] ${shotGrammar}: ${primaryVisual}${narrativeBeat}${voiceoverLine}`;
            }).join('\n');

            // Segment position note
            const segPositionNote = isFirstSeg
                ? 'OPENING SEGMENT — establish the world, hook immediately. No brand CTA.'
                : isLastSeg
                ? 'CLOSING SEGMENT — emotional peak, hard cut to product hero, brand name/tagline in final 2 seconds ONLY.'
                : `CONTINUATION SEGMENT ${i + 1}/${totalSegs} — maintain exact visual continuity from previous segment. No brand CTA.`;

            // Build trimmed background metadata to ensure the shot list is never truncated.
            let trimmedEnv = environment || 'Professional studio environment';
            if (trimmedEnv.length > 250) {
                trimmedEnv = trimmedEnv.substring(0, 250).trim() + '...';
            }
            let trimmedStyle = cinemaRules || 'Hyperrealistic cinematic live-action. Sharp focus. Shallow depth of field.';
            if (trimmedStyle.length > 150) {
                trimmedStyle = trimmedStyle.substring(0, 150).trim() + '...';
            }
            let trimmedMaterials = materialNotes || '';
            if (trimmedMaterials.length > 100) {
                trimmedMaterials = trimmedMaterials.substring(0, 100).trim() + '...';
            }

            const promptParts = [
                charPreamble.trim(),
                `STYLE: ${trimmedStyle}`,
                `COLOR PALETTE: ${paletteNames || 'See reference'} (${palette}).`,
                trimmedMaterials ? `MATERIALS: ${trimmedMaterials}` : null,
                `ENVIRONMENT: ${trimmedEnv}`,
                `MOOD: ${moodKeywords || 'Premium, cinematic'}.`,
                isNonEnglish ? `LANGUAGE: All dialogue and voiceover MUST be in ${language} script/characters.` : null,
                '',
                shotLines,
                '',
                segPositionNote,
                `Total segment: ${seg.duration}s. Hard cuts between shots — no dissolves. Reference all provided @image tags for character and product visual consistency.`,
                '4K ultra HD, cinematic detail, sharp clarity, natural textures, stable picture.',
            ].filter(p => p !== null).join('\n');

            let visualPrompt = promptParts;
            const SEEDANCE_MAX_CHARS = 2200;
            if (visualPrompt.length > SEEDANCE_MAX_CHARS) {
                // If still over the limit, trim the environment further to preserve the shotLines
                const diff = visualPrompt.length - SEEDANCE_MAX_CHARS;
                if (trimmedEnv.length > diff + 50) {
                    trimmedEnv = trimmedEnv.substring(0, trimmedEnv.length - diff - 5).trim() + '...';
                    visualPrompt = [
                        charPreamble.trim(),
                        `STYLE: ${trimmedStyle}`,
                        `COLOR PALETTE: ${paletteNames || 'See reference'} (${palette}).`,
                        trimmedMaterials ? `MATERIALS: ${trimmedMaterials}` : null,
                        `ENVIRONMENT: ${trimmedEnv}`,
                        `MOOD: ${moodKeywords || 'Premium, cinematic'}.`,
                        isNonEnglish ? `LANGUAGE: All dialogue and voiceover MUST be in ${language} script/characters.` : null,
                        '',
                        shotLines,
                        '',
                        segPositionNote,
                        `Total segment: ${seg.duration}s. Hard cuts between shots — no dissolves. Reference all provided @image tags for character and product visual consistency.`,
                        '4K ultra HD, cinematic detail, sharp clarity, natural textures, stable picture.',
                    ].filter(p => p !== null).join('\n');
                } else {
                    // Absolute fallback: truncate at the end
                    visualPrompt = visualPrompt.substring(0, SEEDANCE_MAX_CHARS);
                    if (!visualPrompt.includes('4K ultra HD')) {
                        visualPrompt += '\n4K ultra HD, cinematic detail, sharp clarity, stable picture.';
                    }
                }
            }

            console.log(`[ScenePlanner] Seg ${i+1}: ${visualPrompt.length} chars, ${activeCuts.length} shots, ${seg.duration}s`);

            return {
                sceneId: i + 1,
                duration: seg.duration,
                cutsInSegment: activeCuts,
                visualPrompt,
                dialogue: activeCuts.flatMap(c => c.voiceover
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


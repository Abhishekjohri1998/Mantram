/**
 * Q-Ads (Quick Ads) — Category-First Prompt Engine
 *
 * 10 pre-engineered Seedance 2.0 prompt templates, each optimised for
 * a specific ad creative format. Brand DNA is mapped to visual properties
 * (lighting, camera, grade) and injected into the template.
 *
 * SEEDANCE 2.0 RULES ENFORCED:
 *  - @image1 = avatar/character (always, except cinematic_flex)
 *  - @image2+ = product images
 *  - One motion verb per shot line
 *  - Camera movement on separate sentence from subject movement
 *  - Lighting described explicitly (biggest quality lever)
 *  - Timecodes in [00s-XXs] format
 *  - Constraint block always at end
 *  - 30-200 words total
 *  - No negative prompts
 *  - MuAPI tag format: @image (not [Image])
 */

import * as agentUtils from '../shared/agentUtils.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const Q_ADS_CATEGORIES = [
    {
        id: 'first_reaction',
        name: 'First Reaction',
        tagline: 'Real discovery. Real emotion.',
        description: 'A person encounters your product for the very first time. Genuine surprise, curiosity, and delight — all captured in one authentic moment.',
        msIcon: 'sentiment_very_satisfied',
        color: '#FF6B6B',
        recommendedDuration: 8,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Photorealistic lifestyle UGC, natural window light, shallow depth of field, warm-toned grade.
WARDROBE: @image1 in casual home clothes throughout.
ENVIRONMENT: Bright living room, near a window.
MOOD: Genuine curiosity → surprise → delight and excitement.

SHOT 1: MS, 35mm / Handheld slight sway / @image1 sits at home, notices @image2 on the table for the first time. Eyes widen.
SHOT 2: MCU, 50mm / Static / @image1 leans forward and reaches toward @image2, expression shifting to genuine curiosity.
SHOT 3: CU, 85mm / Rack focus product→face / @image1 picks up @image2, turns it over, examines closely.
SHOT 4: ECU, 85mm push-in / Static macro / @image2 detail — key feature or label fills frame.
SHOT 5: MCU, 50mm / Slow push-in / @image1 looks directly into camera, surprised smile, holds @image2 up. Dialogue: ${d.customDialogue || d.suggestedDialogue || `"Wait — this actually ${d.mainUSP}?"`}.
SHOT 6: MS, 35mm / Static / @image1 shows @image2 to camera with enthusiasm. CTA: "${d.cta}".

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'real_talk',
        name: 'Real Talk',
        tagline: 'Like a friend telling you directly.',
        description: 'No filters, no scripts — just a person talking straight to camera about why this product changed something for them.',
        msIcon: 'record_voice_over',
        color: '#4ECDC4',
        recommendedDuration: 10,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Candid UGC talking-head, natural warm light, locked-off intimate feel.
WARDROBE: @image1 in relaxed everyday clothing throughout.
ENVIRONMENT: Cozy home — sofa, kitchen counter, or desk.
MOOD: Honest → confessional → conviction and warmth.

SHOT 1: MCU, 50mm / Static locked-off / @image1 faces camera directly, relaxed posture, eye contact. Natural soft window light.
SHOT 2: MCU, 50mm / Imperceptible push-in / @image1 speaks naturally, gestures with hands, @image2 loosely visible in frame.
SHOT 3: CU, 85mm / Static / @image1 leans slightly toward lens, lowers voice slightly — conspiratorial warmth. Dialogue: ${d.customDialogue || d.suggestedDialogue || `"Honestly, ${d.mainUSP} — I wish I'd found this sooner."`}.
SHOT 4: MCU, 50mm / Rack focus face→product / @image1 holds @image2 up to camera clearly. Key feature visible.
SHOT 5: MCU, 50mm / Slow static / @image1 looks into camera with conviction. CTA: "${d.cta}".

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'the_drop',
        name: 'The Drop',
        tagline: 'Premium unboxing. Every detail revealed.',
        description: 'A cinematic product reveal — slow, deliberate, premium. Every texture and detail of your product gets its hero moment.',
        msIcon: 'package_2',
        color: '#A29BFE',
        recommendedDuration: 10,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Premium lifestyle unboxing, soft-box directional light, clean neutral background, shallow DoF.
WARDROBE: @image1 in clean minimal outfit — solid colour, no logos.
ENVIRONMENT: Clean flat surface — marble, wood, or white table. Minimal props.
MOOD: Anticipation → reveal → premium satisfaction.

SHOT 1: Top-down, 35mm / Static overhead / @image2 packaging sits on clean surface. @image1 hands enter frame from above.
SHOT 2: CU, 85mm / Slow dolly-in / Hands of @image1 carefully open @image2 packaging. Rim light catches edges.
SHOT 3: MS, 50mm / Slow dolly-in / @image1 lifts @image2 from packaging with both hands. Product rises into frame.
SHOT 4: ECU, 85mm orbit / Camera arcs 45° around @image2 / Product surface detail — texture, finish, label fills frame.
SHOT 5: MCU, 50mm / Static / @image1 holds @image2 at eye level, turns it slowly. Dialogue: ${d.customDialogue || `"${d.productName} — ${d.mainUSP}."`}.
SHOT 6: MS, 35mm / Slow pull-back / @image1 faces camera proudly holding @image2. CTA: "${d.cta}".

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'in_my_life',
        name: 'In My Life',
        tagline: 'Product as part of a real moment.',
        description: 'Your product seamlessly integrated into a real lifestyle scene. No ad feel — just life, with your product naturally in it.',
        msIcon: 'self_improvement',
        color: '#55EFC4',
        recommendedDuration: 10,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Fly-on-the-wall lifestyle documentary, natural ambient light, handheld organic movement.
WARDROBE: @image1 in authentic everyday outfit matching the environment.
ENVIRONMENT: ${d.environment || 'Home'} — real lived-in setting, natural lighting, environmental props.
MOOD: Natural → organic product discovery → satisfied ease.

SHOT 1: WS, 24mm / Handheld follow / @image1 goes about natural activity in real environment. @image2 present in scene organically.
SHOT 2: MS, 35mm / Handheld slight sway / @image1 reaches for @image2 naturally — seamless, unposed.
SHOT 3: CU, 85mm / Rack focus env→product / @image1 uses @image2 within the scene. One smooth natural motion.
SHOT 4: MCU, 50mm / Camera settles static / @image1 pauses, looks at result, quiet satisfaction.
SHOT 5: MCU, 50mm / Imperceptible push-in / @image1 glances at camera with natural smile. @image2 visible in hand. Dialogue: "${d.mainUSP} — fits right into my day."
SHOT 6: MS, 35mm / Static / @image1 holds @image2, relaxed and at ease. CTA: "${d.cta}" spoken naturally.

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'watch_me',
        name: 'Watch Me Use It',
        tagline: 'Hands on. Step by step. Results shown.',
        description: 'A clear product demonstration. The viewer sees exactly how it works and what it does — no guessing, no ambiguity.',
        msIcon: 'touch_app',
        color: '#FDCB6E',
        recommendedDuration: 12,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Clear instructional UGC, bright even light, product details fully legible, warm grade.
WARDROBE: @image1 in clean casual outfit — hands clearly visible throughout.
ENVIRONMENT: Kitchen counter, desk, or bathroom — contextually appropriate for ${d.productCategory || 'product'}.
MOOD: Confident demonstration → clear results → satisfied conclusion.

SHOT 1: Top-down, 35mm / Static overhead / @image1 hands prepare @image2 on surface. Product label and features visible.
SHOT 2: MCU, 50mm / Tracking follows action / @image1 demonstrates key function of @image2 with clear deliberate motion.
SHOT 3: CU, 85mm / Slow push-in / Close-up of the result or output of using @image2 — outcome made visually clear.
SHOT 4: MCU, 50mm / Static / @image1 reacts to result — impressed or satisfied expression. Natural.
SHOT 5: MS, 50mm / Static / @image1 faces camera, @image2 visible. Dialogue: ${d.customDialogue || `"It literally does ${d.keyFeatures?.[0] || d.mainUSP} — watch."`}.
SHOT 6: MCU, 50mm / Slow push-in / @image1 holds @image2 up to lens. CTA: "${d.cta}".

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'glow_up',
        name: 'Glow Up',
        tagline: 'Before and after. The transformation is the story.',
        description: 'A two-act narrative — life before the product, life after. The emotional shift is the hook.',
        msIcon: 'auto_awesome',
        color: '#FD79A8',
        recommendedDuration: 12,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Emotional lifestyle narrative, lighting shifts from cool→warm to mirror the story arc.
WARDROBE: @image1 same outfit throughout — the transformation is emotional, not physical.
ENVIRONMENT: Same home location across both acts — consistency amplifies the contrast.
MOOD: Tired/frustrated (act 1) → curious discovery (midpoint) → radiant confidence (act 2).

SHOT 1: MCU, 50mm / Static / @image1 shows the problem — tired, frustrated, or struggling. Cool neutral light. No @image2 yet.
SHOT 2: CU, 85mm / Slow push-in / @image1 expression — genuine fatigue or frustration close up.
SHOT 3: MCU, 50mm / Slow dolly-in / @image1 discovers @image2. Lighting begins to shift warmer.
SHOT 4: CU, 85mm / Rack focus / @image1 uses @image2 — hands and product in focus. Warm golden light fills frame.
SHOT 5: MCU, 50mm / Static warm light / @image1 after — visibly different energy, positive, confident. @image2 held naturally.
SHOT 6: MS, 35mm / Slow push-in / @image1 faces camera, warm glow. Dialogue: ${d.customDialogue || `"Since I found ${d.productName} — ${d.mainUSP}. Genuinely."`}.
SHOT 7: MCU, 50mm / Static / @image1 holds @image2, direct eye contact. CTA: "${d.cta}".

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'speed_mode',
        name: 'Speed Mode',
        tagline: 'High energy. Fast cuts. Instant impact.',
        description: 'A punchy multi-angle rapid-fire ad. Perfect for attention-grabbing content that needs to land in the first second.',
        msIcon: 'electric_bolt',
        color: '#E17055',
        recommendedDuration: 8,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: High-energy kinetic UGC, bold dramatic side light, high contrast, punchy saturated grade.
WARDROBE: @image1 in bold confident outfit — solid colour, strong presence.
ENVIRONMENT: Minimal — @image1 pops against simple background. Energy over environment.
MOOD: Instant explosive energy → product confidence → direct CTA urgency.

SHOT 1: ECU, 85mm snap push / @image1 holds @image2 directly at camera lens. Bold open expression, high contrast light.
SHOT 2: CU, 50mm / Fast tracking side-on / @image1 uses @image2 with decisive full-energy motion.
SHOT 3: ECU, 85mm / Static macro / @image2 product detail — label or key feature fills frame. Multiple fast angles implied.
SHOT 4: MCU, 50mm / Snap push / @image1 faces camera, confident stance, @image2 visible. Dialogue: ${d.customDialogue || `"${d.mainUSP}. Period."`}.
SHOT 5: CU, 85mm / Static / @image1 direct eye contact, product raised. CTA: "${d.cta}" — fast and direct.

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'cinematic_flex',
        name: 'Cinematic Flex',
        tagline: 'Your product as the hero. No person needed.',
        description: 'A premium product-only film. Dramatic lighting, slow motion, and cinematic camera movement make your product look like a luxury commercial.',
        msIcon: 'movie_filter',
        color: '#636E72',
        recommendedDuration: 10,
        recommendedFormat: '16:9',
        noAvatar: true,
        promptTemplate: (d) =>
`STYLE: High-end luxury product commercial, dramatic rim lighting, dark studio, cinematic grade.
WARDROBE: No character. Product only.
ENVIRONMENT: Premium studio — dark moody background, clean surface (marble or black acrylic).
MOOD: Mysterious reveal → textural beauty → hero moment finale.

SHOT 1: MS, 50mm / Static / @image2 sits on premium surface. Rim lighting catches every edge and texture.
SHOT 2: ECU, 85mm orbit / Camera begins slow 360° arc around @image2 / Product edges glow against dark background.
SHOT 3: ECU, 85mm slow push-in / Camera pushes to extreme close-up of most visually striking feature of @image2.
SHOT 4: CU, 50mm / Low-angle static / @image2 from below — product towers, dramatically lit.
SHOT 5: MS, 35mm / Slow pull-back / Camera pulls back to reveal full @image2 in final hero shot. Maximum lighting drama.

No dialogue. Ambient product sounds. Generate video without subtitles.`,
    },

    {
        id: 'problem_solver',
        name: 'Problem Solver',
        tagline: 'The struggle is real. So is the solution.',
        description: 'Lead with a pain point your audience knows. Then show your product solving it — the most conversion-proven ad format.',
        msIcon: 'lightbulb',
        color: '#0984E3',
        recommendedDuration: 12,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Emotional problem-solution narrative, lighting arc from desaturated cool → warm golden.
WARDROBE: @image1 in casual relatable outfit. Same clothes throughout.
ENVIRONMENT: Everyday location appropriate to the problem — home, office, or kitchen.
MOOD: Frustrated struggle (act 1) → hope and curiosity (midpoint) → relief and genuine joy (act 2).

SHOT 1: MCU, 50mm / Static cool light / @image1 shows the problem moment — frustrated expression, struggling with issue related to ${d.problemSolved || 'the problem this product solves'}.
SHOT 2: CU, 85mm / Slow push-in / @image1 expression — genuine frustration or fatigue in close-up.
SHOT 3: MCU, 50mm / Slow dolly-in / @image1 notices @image2. Expression shifts — curious. Light begins to warm.
SHOT 4: CU, 85mm / Rack focus face→product / @image1 uses @image2. Problem visibly resolved. Warm light fills scene.
SHOT 5: MCU, 50mm / Static warm / @image1 relief — expression relaxes into genuine satisfaction. @image2 in hand.
SHOT 6: MS, 35mm / Slow push-in / @image1 faces camera. Dialogue: ${d.customDialogue || `"I kept dealing with ${d.problemSolved || 'that problem'} until I found ${d.productName}. ${d.mainUSP}."`}.
SHOT 7: MCU, 50mm / Static / @image1 holds @image2 to camera. CTA: "${d.cta}".

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },

    {
        id: 'social_proof',
        name: 'Social Proof',
        tagline: '"You NEED to know about this."',
        description: 'The conspiratorial recommendation. Feels like a friend pulling you aside to tell you about a secret they found. Highest share rate format.',
        msIcon: 'campaign',
        color: '#6C5CE7',
        recommendedDuration: 8,
        recommendedFormat: '9:16',
        promptTemplate: (d) =>
`STYLE: Candid conspiratorial UGC, natural handheld intimacy, warm real-person feel, candid-not-produced lighting.
WARDROBE: @image1 in everyday casual clothes — must feel like a real person, not a presenter.
ENVIRONMENT: Casual real setting — sofa, bedroom, or cafe. Feels unplanned.
MOOD: Conspiratorial secret → excited revelation → urgent recommendation.

SHOT 1: MCU, 50mm / Handheld natural / @image1 leans into camera — lowered voice energy, slightly conspiratorial. Finger points toward lens.
SHOT 2: CU, 85mm / Handheld slight wobble / @image1 eyes widen, cannot-contain-it excitement. @image2 comes into frame.
SHOT 3: MCU, 50mm / Static / @image1 holds @image2 up close to camera, taps or points at specific feature. Excited energy.
SHOT 4: CU, 85mm / Slow push-in / @image2 detail — feature that makes it special. @image1 finger traces it.
SHOT 5: MCU, 50mm / Handheld settles / @image1 pulls back slightly, @image2 still visible. Genuine urgency. Dialogue: ${d.customDialogue || `"Okay I have to tell you about ${d.productName} — ${d.mainUSP} and nobody talks about it."`}.
SHOT 6: MS, 35mm / Static / @image1 looks into camera. CTA: "${d.cta} right now."

Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.`,
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export function getCategory(categoryId) {
    return Q_ADS_CATEGORIES.find(c => c.id === categoryId) || null;
}

/**
 * Build the final Seedance 2.0 prompt for a Q-Ad.
 *
 * 1. Get category template
 * 2. Map brand DNA → visual properties (lighting, camera, colour grade)
 * 3. Fill template with product data + brand data
 * 4. Refine through LLM to inject brand voice + enforce quality
 */
export async function buildQAdPrompt({ categoryId, productData, settings, brandId, userId }) {
    const category = getCategory(categoryId);
    if (!category) throw new Error(`Unknown Q-Ad category: ${categoryId}`);

    const { brandContext } = await agentUtils.loadBrandContext(brandId);

    // Map brand DNA → Seedance visual properties
    const ctx = (brandContext || '').toLowerCase();
    const brandVisual = {
        lighting: ctx.includes('premium') || ctx.includes('luxury')
            ? 'soft rim light, warm golden hour, shallow depth of field'
            : ctx.includes('playful') || ctx.includes('fun')
            ? 'bright natural daylight, high key vivid saturation'
            : ctx.includes('minimal') || ctx.includes('clean')
            ? 'clean soft box light, cool white tones, even exposure'
            : ctx.includes('bold') || ctx.includes('energetic')
            ? 'dramatic side light, strong contrast, deep shadows'
            : 'natural window light, slightly warm, realistic shadows',

        camera: ctx.includes('premium') || ctx.includes('luxury')
            ? 'slow cinematic dolly-in'
            : ctx.includes('playful')
            ? 'handheld energetic follow'
            : ctx.includes('minimal')
            ? 'static locked-off medium shot'
            : 'handheld natural movement',

        grade: ctx.includes('premium') || ctx.includes('luxury')
            ? 'warm desaturated film grade'
            : ctx.includes('playful')
            ? 'punchy vibrant colour grade'
            : ctx.includes('minimal')
            ? 'clean neutral grade'
            : ctx.includes('bold')
            ? 'high contrast cinematic grade'
            : 'natural realistic grade',
    };

    const product = productData || {};

    // Assemble template data
    const templateData = {
        productName: product.productName || 'the product',
        mainUSP: product.mainUSP || '',
        keyFeatures: product.keyFeatures || [],
        targetAudience: product.targetAudience || '',
        problemSolved: product.problemSolved || '',
        suggestedDialogue: product.suggestedDialogue || '',
        customDialogue: settings?.customDialogue || null,
        cta: settings?.cta || 'Shop now',
        duration: parseInt(settings?.duration || category.recommendedDuration),
        format: settings?.format || category.recommendedFormat,
        brandLighting: brandVisual.lighting,
        brandCamera: brandVisual.camera,
        brandGrade: brandVisual.grade,
    };

    // Generate base prompt from category template
    const basePrompt = category.promptTemplate(templateData);

    // Refine with LLM to inject brand voice and ensure production quality
    const REFINE_SYSTEM = `You are a Seedance 2.0 expert video prompt engineer.
Refine the given video ad prompt into the EXACT cinematic structure below.

BRAND CONTEXT:
${brandContext}

PRODUCT: ${product.productName}
USP: ${product.mainUSP}
TARGET AUDIENCE: ${product.targetAudience}

OUTPUT STRUCTURE (follow exactly — no deviations):
STYLE: [one sentence — rendering style, animation quality, visual feel]
WARDROBE: [@image1 clothing description per shot range]
ENVIRONMENT: [all scene locations in one sentence]
MOOD: [emotional arc, one sentence]
SHOT 1: [Size, focal length] / [Camera move] / [@image1 action. @image2 if shown. ONE motion verb.]
SHOT 2: [same format]
[Continue for the video duration — 8–15 shots]
Maintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.

RULES:
1. Keep ALL @image1 and @image2+ references exactly as-is — never remove them
2. ONE motion verb per shot line
3. Camera move on its own clause after the second slash
4. HARD LIMIT: 2200 characters total — count carefully
5. No negative prompts. No text overlays.
6. Inject brand voice into wardrobe, mood and environment choices
7. Return ONLY the refined prompt — no explanation, no markdown`;

    try {
        const refined = await agentUtils.callAgentText(
            REFINE_SYSTEM,
            `PROMPT TO REFINE:\n${basePrompt}`,
            0.3,
            900
        );
        // Enforce 2200-char limit
        let out = (refined && typeof refined === 'string' && refined.length > 30) ? refined : basePrompt;
        if (out.length > 2200) {
            const t = out.substring(0, 2200);
            const lp = t.lastIndexOf('.');
            out = (lp > 1800 ? t.substring(0, lp + 1) : t) + '\nMaintain face and clothing consistency of @image1 throughout. No distortion. Natural smooth movements. Generate video without subtitles.';
        }
        return out;
    } catch (err) {
        console.warn(`[Q-Ads] LLM refinement failed, using base template: ${err.message}`);
        return basePrompt;
    }
}

import { estimateCost } from './falClient.js';

/**
 * Credit cost for Q-Ads — now uses real estimateCost() for Atlas Cloud pricing.
 * Previously hardcoded at 15/25/35, which severely undercharged for Seedance 2.0.
 * Now matches the dynamic pricing in credits.js middleware.
 */
export function getQAdsCreditCost(duration) {
    const d = parseInt(duration) || 8;
    // Q-Ads always uses seedance-2.0 on Atlas Cloud at 720p
    const estimate = estimateCost('seedance-2.0', d, '720p', 'fast');
    return Math.max(Math.ceil(estimate.usd * 70), 5);
}

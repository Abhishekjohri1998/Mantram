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
`@image1 ${d.brandCamera || 'handheld natural movement'}, ${d.brandLighting || 'natural window light, warm tones'}.

[00s-02s] @image1 notices @image2 for the first time. Eyes widen with genuine curiosity. Camera holds static medium close-up, slight zoom-in on face.

[02s-05s] @image1 picks up @image2 carefully and examines it closely. Slow rack focus from face to product in hands.

[05s-${d.duration}s] @image1 looks directly into camera with an authentic smile, holds @image2 up. Static medium shot, catch-light visible in eyes.

Dialogue: ${d.customDialogue || d.suggestedDialogue || `"Wait — this is actually ${d.mainUSP}?"`}. CTA: @image1 says "${d.cta}" with genuine enthusiasm.

Lighting: ${d.brandLighting || 'soft natural window light, warm golden tone'}. Colour: ${d.brandGrade || 'natural realistic grade'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 ${d.brandCamera || 'static locked-off medium close-up'}, ${d.brandLighting || 'soft natural light, warm tones'}.

[00s-03s] @image1 leans slightly toward camera, direct eye contact, relaxed and confident posture. Camera completely static, intimate framing.

[03s-07s] @image1 gestures naturally while speaking, @image2 visible in frame or held loosely. Camera holds without movement, letting performance breathe.

[07s-${d.duration}s] @image1 holds @image2 up clearly to lens, speaks closing line with conviction. Extremely slow almost imperceptible push-in.

Dialogue: ${d.customDialogue || d.suggestedDialogue || `"Honestly, ${d.mainUSP} — and I wish I'd found this sooner."`}. CTA: "${d.cta}".

Lighting: ${d.brandLighting || 'natural soft window light, slightly warm, realistic shadows'}. Colour: ${d.brandGrade || 'clean natural grade'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 ${d.brandLighting || 'dramatic soft box light, clean neutral background'}.

[00s-03s] Close-up overhead shot of @image2 packaging on a clean surface. Hands of @image1 enter frame and slowly begin to open. Camera holds static overhead.

[03s-06s] @image1 lifts @image2 from packaging with both hands, revealing the product. Slow dolly-in toward product as it rises into frame.

[06s-09s] @image1 holds @image2 at eye level, turns it slowly to show detail. Camera arcs smoothly around product at 45 degrees.

[09s-${d.duration}s] @image1 faces camera holding @image2 proudly. Static medium shot, product clearly visible.

Dialogue: ${d.customDialogue || `"${d.productName} — ${d.mainUSP}."`}. CTA: "${d.cta}".

Lighting: ${d.brandLighting || 'soft rim light, clean neutral background, premium product photography feel'}. Colour: ${d.brandGrade || 'clean desaturated premium grade'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 ${d.brandCamera || 'handheld follow shot, organic natural movement'}, ${d.brandLighting || 'natural ambient light, environmental feel'}.

[00s-04s] @image1 goes about a natural activity in a real environment, @image2 present in scene organically. Handheld camera follows naturally with slight sway.

[04s-08s] @image1 reaches for @image2 and uses it naturally within the scene. Camera settles as focus narrows on the interaction between person and product.

[08s-${d.duration}s] @image1 glances up at camera with a natural, unposed smile. @image2 visible in hand or nearby. Camera holds static, intimate and real.

Dialogue: ${d.customDialogue || `"${d.mainUSP} — fits right into my day."`}. CTA: "${d.cta}" spoken naturally.

Lighting: ${d.brandLighting || 'natural ambient light, real environment feel, no studio look'}. Colour: ${d.brandGrade || 'warm natural film grade'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 ${d.brandLighting || 'bright even light, product details clearly visible'}.

[00s-03s] Close-up of @image1 hands preparing to use @image2. Static overhead or 45-degree shot, product label and key features visible.

[03s-07s] @image1 uses @image2 with clear deliberate motion showing key function. Tracking shot follows the action closely. One smooth continuous motion.

[07s-10s] Close-up of the result or output of using @image2 — the outcome made visually clear. Camera pushes slowly into the result.

[10s-${d.duration}s] @image1 faces camera holding @image2, satisfied expression. Medium close-up, static shot.

Dialogue: ${d.customDialogue || `"It literally does ${d.keyFeatures?.[0] || d.mainUSP} — watch."`}. CTA: "${d.cta}".

Lighting: ${d.brandLighting || 'bright clean even light, all product details readable, no harsh shadows'}. Colour: ${d.brandGrade || 'clean accurate grade, true-to-life colours'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 ${d.brandCamera || 'static medium shot transitioning to warm lifestyle feel'}.

[00s-04s] @image1 shows a moment of the problem or gap — tired, frustrated, or missing something. @image2 not yet visible. Camera holds static, slightly cooler light tone.

[04s-07s] @image1 discovers or starts using @image2. Lighting shifts warmer. Slow dolly-in toward product interaction moment.

[07s-${d.duration}s] @image1 after using @image2 — visibly different, positive, confident. @image2 held naturally. Warm light, static close-up shot, direct eye contact with camera.

Dialogue: ${d.customDialogue || `"Since I found ${d.productName} — ${d.mainUSP}. Genuinely."`}. CTA: "${d.cta}".

Lighting: [00s-04s] slightly cooler natural light. [04s-end] ${d.brandLighting || 'warm golden natural light, positive lift in tone'}. Colour: ${d.brandGrade || 'warm desaturated film grade'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 high energy, dynamic presence. ${d.brandLighting || 'bold dramatic side light, strong contrast'}.

[00s-02s] @image1 holds @image2 directly at camera lens, bold open expression. Camera static extreme close-up, high contrast light.

[02s-04s] @image1 uses @image2 with decisive motion, full energy. Quick tracking shot follows movement side-on.

[04s-06s] @image2 product shown in close-up detail from multiple fast angles. Camera cuts between overhead, side, and front. Rapid but stable shots.

[06s-${d.duration}s] @image1 faces camera, holds @image2 up with confident expression. Static medium shot, strong eye contact.

Dialogue: ${d.customDialogue || `"${d.mainUSP}. Period."`}. CTA: "${d.cta}" delivered fast and direct.

Lighting: ${d.brandLighting || 'bold dramatic lighting, high contrast, punchy feel'}. Colour: ${d.brandGrade || 'high contrast vivid grade, saturated'}. Native audio, fast energy background sound, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`Product-only cinematic commercial. No character. ${d.brandLighting || 'dramatic rim light, dark moody background'}.

[00s-04s] @image2 sits on a premium surface. Camera begins a slow 360-degree orbit around the product. Rim lighting catches every edge and texture detail.

[04s-07s] Camera performs a slow dolly-in toward @image2 stopping at extreme close-up of the most visually striking detail. Product label or key feature fills frame.

[07s-${d.duration}s] Camera pulls back slowly to reveal full product in final hero shot. Lighting at maximum drama. Product perfectly centred.

No dialogue. Natural ambient product sounds. CTA text moment implied through final frame.

Lighting: ${d.brandLighting || 'dramatic cinematic rim light, dark studio, product edges glowing, premium material feel'}. Colour: ${d.brandGrade || 'dark moody cinematic grade, deep shadows, crisp highlights'}. Native audio, ${d.format || '16:9'}, 720p.

Product packaging and details stay sharp and consistent throughout. No motion blur on product. Smooth controlled camera movement only. Generate video without subtitles.`,
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
`@image1 ${d.brandCamera || 'static medium close-up'}, ${d.brandLighting || 'natural window light'}.

[00s-03s] @image1 shows the problem moment — frustrated expression, struggling with a task related to ${d.problemSolved || 'the problem this product solves'}. Camera static, slightly desaturated light.

[03s-06s] @image1 notices @image2 for the first time. Expression shifts from frustrated to curious. Slow push-in as @image1 reaches for product.

[06s-10s] @image1 uses @image2, problem visibly resolved. Expression relaxes into relief then genuine satisfaction. Camera settles on warm static close-up.

[10s-${d.duration}s] @image1 faces camera, @image2 visible, speaks directly. Static medium shot, warm light, direct eye contact.

Dialogue: ${d.customDialogue || `"I kept dealing with ${d.problemSolved || 'that problem'} until I found ${d.productName}. ${d.mainUSP}."`}. CTA: "${d.cta}".

Lighting: [00s-06s] slightly cooler neutral light. [06s-end] ${d.brandLighting || 'warm soft natural light, relief and positivity in tone'}. Colour: ${d.brandGrade || 'natural warm grade'}. Native audio, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
`@image1 ${d.brandCamera || 'handheld intimate close-up, feels personal and immediate'}, ${d.brandLighting || 'natural light, feels candid not produced'}.

[00s-02s] @image1 leans into camera conspiratorially, slightly lowered voice energy, finger pointing toward lens or product. Camera handheld, slight natural movement.

[02s-05s] @image1 holds @image2 up close to camera, taps or points at specific feature. Excited, cannot-contain-it energy. Camera static, product clearly in frame.

[05s-${d.duration}s] @image1 pulls back slightly, @image2 still visible, delivers CTA with genuine urgency. Handheld camera settles into soft static close-up.

Dialogue: ${d.customDialogue || `"Okay I have to tell you about ${d.productName} — ${d.mainUSP} and nobody talks about it."`}. CTA: "${d.cta} right now."

Lighting: ${d.brandLighting || 'natural candid light, feels real not staged, warm and intimate'}. Colour: ${d.brandGrade || 'natural slightly warm grade, social-native feel'}. Native audio, word-of-mouth energy, 9:16, 720p.

Maintain face and clothing consistency of @image1 throughout, no distortion, high detail. Character face stable without deformation, natural smooth movements. Generate video without subtitles.`,
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
Refine the given video ad prompt to be production-ready.

BRAND CONTEXT:
${brandContext}

PRODUCT: ${product.productName}
USP: ${product.mainUSP}
TARGET AUDIENCE: ${product.targetAudience}

Rules you MUST follow:
1. Keep ALL timecodes in [00s-XXs] format — do not remove them
2. Keep ALL @image1 and @image2+ references exactly as-is
3. Keep the constraint block at the end word-for-word
4. One motion verb per shot — split if needed
5. Camera movement must be on its own sentence, separate from subject movement
6. Keep lighting description — it is mandatory
7. Total word count must be between 30 and 200 words
8. Do NOT add negative prompts — Seedance does not support them
9. Inject brand voice/tone into dialogue naturally
10. Return ONLY the refined prompt — no explanation, no markdown`;

    try {
        const refined = await agentUtils.callAgentText(
            REFINE_SYSTEM,
            `PROMPT TO REFINE:\n${basePrompt}`,
            0.3,
            600
        );
        return (refined && typeof refined === 'string' && refined.length > 30) ? refined : basePrompt;
    } catch (err) {
        console.warn(`[Q-Ads] LLM refinement failed, using base template: ${err.message}`);
        return basePrompt;
    }
}

/**
 * Credit cost for Q-Ads
 */
export function getQAdsCreditCost(duration) {
    const d = parseInt(duration) || 8;
    if (d <= 10) return 15;
    if (d <= 20) return 25;
    return 35;
}

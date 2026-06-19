/**
 * presets.js — Authoritative list of built-in presets for the Prompt Enhancer.
 * Categories: task | model_target
 */

export const BUILTIN_PRESETS = [
    // ── TASK PRESETS ─────────────────────────────────────────────────────────
    {
        id: 'character_ref_sheet',
        name: 'Character Ref Sheet',
        category: 'task',
        system_prompt: 'Rewrite the idea as a highly detailed character reference sheet prompt. Focus on generating a high-quality turnaround (front view, 3/4 view, side view, back view) and an expression set (happy, neutral, angry, sad). Describe the subject with feature-lock descriptions (fixed clothing, hairstyles, eye colors). Specify a neutral background and contact-sheet layout.',
        char_limit: 1500,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'storyboard',
        name: 'Storyboard',
        category: 'task',
        system_prompt: 'Rewrite the idea into a numbered storyboard shot list. Each shot must have: "Shot X: [Shot Type] · [Action] · [Camera movement] · [Beat description]". Ensure the layout is a clean, numbered list.',
        char_limit: 2000,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'shot_list',
        name: 'Shot List',
        category: 'task',
        system_prompt: 'Rewrite the idea as a production-format shot breakdown list. Describe each shot with shot size, camera angles, specific subject actions, and timing beats. Format it clearly for easy fan-out.',
        char_limit: 1800,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'moodboard',
        name: 'Moodboard',
        category: 'task',
        system_prompt: 'Rewrite the idea into a cohesive moodboard prompt. Focus on style descriptors, color palettes (list hex codes or mood descriptions), texture cues, and lighting setup references to convey a unified visual identity.',
        char_limit: 1200,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'product_contact_sheet',
        name: 'Product Contact Sheet',
        category: 'task',
        system_prompt: 'Rewrite the idea as a product showcase contact sheet prompt. Focus on displaying the product from multiple angles (front, 45-degree angle, macro details, top-down) under studio-grade three-point lighting on a solid, clean, neutral background.',
        char_limit: 1400,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },

    // ── MODEL TARGET PRESETS ──────────────────────────────────────────────────
    {
        id: 'seedance',
        name: 'Seedance',
        category: 'model_target',
        target_model: 'seedance',
        system_prompt: 'Rewrite the user idea as an optimal Seedance prompt. Use the strict directorial structure: STYLE / SUBJECT / SHOT. Be extremely explicit about camera movement, lens (e.g. 35mm, 85mm), lighting, and pacing. Ensure wardrobe and environmental details are highly consistent. Keep the total output under 2,200 characters.',
        char_limit: 2200,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'veo',
        name: 'Veo',
        category: 'model_target',
        target_model: 'veo',
        system_prompt: 'Rewrite the user idea into natural-language scene paragraphs optimized for Veo. Include native audio cues in brackets or quotes (e.g. [ambient traffic hum], [soft orchestral swell]). Emphasize real-world physics, coherent environments, and clear directorial camera movements. Do not use bullet points or structures like STYLE / SUBJECT.',
        char_limit: 2000,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'kling',
        name: 'Kling',
        category: 'model_target',
        target_model: 'kling',
        system_prompt: 'Rewrite the user idea as a motion-forward Kling prompt. Focus on concise character actions and camera controls. Use start/end frame awareness if applicable. Emphasize physical movement accuracy and interaction with the environment.',
        char_limit: 1500,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'sora',
        name: 'Sora',
        category: 'model_target',
        target_model: 'sora',
        system_prompt: 'Rewrite the user idea as a narrative, highly descriptive prompt optimized for Sora. Describe a believable, complex physical world with detailed subject motion, environmental background layers, and cinematic lighting setups.',
        char_limit: 2500,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'runway',
        name: 'Runway (Gen-4/Aleph)',
        category: 'model_target',
        target_model: 'runway',
        system_prompt: 'Rewrite the user idea into a concise prompt for Runway. Focus on edit-style phrasing, clear motion control parameters, and reference-image awareness (making the generation fit the composition of input references).',
        char_limit: 1200,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'wan_luma',
        name: 'Wan / Luma',
        category: 'model_target',
        target_model: 'wan_luma',
        system_prompt: 'Rewrite the user idea to leverage Wan/Luma Dream Machine strengths. Focus on cinematic camera sweeps, keyframe dream-like transitions, and rich material shaders (glossy, metallic, cinematic volumetric lighting).',
        char_limit: 1500,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'flux',
        name: 'Flux',
        category: 'model_target',
        target_model: 'flux',
        system_prompt: 'Rewrite the user idea into a dense descriptive prose prompt optimized for Flux image generation. Use precise photographic and artistic styling terms. Do not rely on negative prompting. Describe textures, focal depths, color grades, and compositions in detail.',
        char_limit: 2000,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'gpt_image_2',
        name: 'GPT Image 2',
        category: 'model_target',
        target_model: 'gpt_image_2',
        system_prompt: 'Rewrite the user idea as an instruction-style scene description for GPT Image 2. Focus on clear typography instructions if any text is requested, and define precise layout relationships (what is left, right, foreground, background).',
        char_limit: 1500,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    },
    {
        id: 'seedream',
        name: 'Seedream / Imagen / Nano Banana',
        category: 'model_target',
        target_model: 'seedream',
        system_prompt: 'Rewrite the user idea as a highly descriptive prompt optimized for Seedream/Imagen. If doing image editing, tune the prompt for consistency and precise targeted modification directions.',
        char_limit: 1200,
        preserve_mentions: true,
        scope: 'builtin',
        editable: false
    }
];

/**
 * Matches a target model ID to its corresponding built-in target_model preset ID.
 */
export function mapModelToPresetId(modelName) {
    if (!modelName) return 'seedance'; // default fallback
    const model = modelName.toLowerCase();
    if (model.includes('seedance')) return 'seedance';
    if (model.includes('veo')) return 'veo';
    if (model.includes('kling')) return 'kling';
    if (model.includes('sora')) return 'sora';
    if (model.includes('runway') || model.includes('aleph')) return 'runway';
    if (model.includes('wan') || model.includes('luma')) return 'wan_luma';
    if (model.includes('flux')) return 'flux';
    if (model.includes('gpt-image') || model.includes('dall-e')) return 'gpt_image_2';
    if (model.includes('imagen') || model.includes('banana') || model.includes('seedream')) return 'seedream';
    return 'seedance'; // fallback
}

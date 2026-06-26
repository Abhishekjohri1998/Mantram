export const NODE_PARAM_SCHEMAS = {
    video_generate: {
        model:       { type: 'enum',   label: 'Model',        options: ['seedance-2.0','seedance-2.0-mini','kling-3.0','veo-3.1','veo-3.1-fast','grok-imagine','gemini-flash'] },
        duration:    { type: 'number', label: 'Duration (s)',  min: 3, max: 120 },
        aspectRatio: { type: 'enum',   label: 'Aspect Ratio', options: ['9:16','16:9','1:1','4:5','21:9'] },
        motionMode:  { type: 'enum',   label: 'Motion Mode',  options: ['subtle','balanced','dynamic'] },
    },
    text_input:    { text:       { type: 'string', label: 'Text', multiline: true } },
    asset_input:   {
        url:       { type: 'string', label: 'Asset URL' },
        assetType: { type: 'enum',   label: 'Type',  options: ['image','video','audio'] },
        label:     { type: 'string', label: 'Label' },
    },
    image_generate: {
        model:       { type: 'enum', label: 'Model',        options: ['gemini-flash','gpt-image-2','flux-pro'] },
        aspectRatio: { type: 'enum', label: 'Aspect Ratio', options: ['9:16','16:9','1:1','4:5'] },
        quality:     { type: 'enum', label: 'Quality',      options: ['draft','standard','hd'] },
    },
    prompt_expand: {
        targetModel: { type: 'enum',   label: 'Target Model',  options: ['seedance-2.0','seedance-2.0-mini','kling-3.0','veo-3.1','veo-3.1-fast','grok-imagine','gemini-flash'] },
        style:       { type: 'string', label: 'Style Override' },
    },
    voiceover: {
        provider: { type: 'enum',   label: 'Provider', options: ['elevenlabs','sarvam','minimax'] },
        voice:    { type: 'string', label: 'Voice ID' },
        language: { type: 'string', label: 'Language' },
        speed:    { type: 'number', label: 'Speed',    min: 0.5, max: 2.0, step: 0.1 },
    },
    character_ref: {
        description: { type: 'string',      label: 'Character Description', multiline: true },
        urls:        { type: 'string_list', label: 'Image URLs (one per line)' },
    },
    style_ref: {
        description: { type: 'string',      label: 'Style Description', multiline: true },
        urls:        { type: 'string_list', label: 'Image URLs (one per line)' },
    },
    concat: {
        transition:  { type: 'enum',   label: 'Transition',     options: ['cut','fade','dissolve'] },
        crossfadeMs: { type: 'number', label: 'Crossfade (ms)', min: 0, max: 2000 },
    },
    output:  { label: { type: 'string', label: 'Label' } },
    resize: {
        width:  { type: 'number', label: 'Width (px)',  min: 64 },
        height: { type: 'number', label: 'Height (px)', min: 64 },
        mode:   { type: 'enum',   label: 'Fit Mode',    options: ['fill','fit','crop'] },
    },
    trim: {
        startTime: { type: 'number', label: 'Start (s)', min: 0 },
        endTime:   { type: 'number', label: 'End (s)',   min: 0 },
    },
    batch:   { maxParallel: { type: 'number', label: 'Max Parallel', min: 1, max: 10 } },
    upscale: {
        scale: { type: 'enum', label: 'Scale', options: ['2x','4x'] },
        model: { type: 'enum', label: 'Model', options: ['esrgan','real-esrgan'] },
    },
    reframe:   { targetRatio: { type: 'enum', label: 'Target Ratio', options: ['9:16','16:9','1:1','4:5','21:9'] } },
    music_sfx: {
        duration: { type: 'number', label: 'Duration (s)', min: 5, max: 300 },
        type:     { type: 'enum',   label: 'Type',         options: ['background','sfx','jingle'] },
    },
    assistant: {
        model:       { type: 'enum',   label: 'Model',        options: ['gemini-flash', 'gpt-4o', 'claude-3-5-sonnet', 'grok-beta'] },
        system_prompt: { type: 'string', label: 'System Instruction', multiline: true },
        output_mode:  { type: 'enum',   label: 'Output Mode',  options: ['simple', 'list'] },
    },
    sound_effects: {
        duration: { type: 'number', label: 'Duration (s)', min: 1, max: 30 },
    },
    video_audio_mix: {
        videoVolume: { type: 'number', label: 'Video Vol', step: 0.1 },
        audioVolume: { type: 'number', label: 'Audio Vol', step: 0.1 },
    },
    list: {
        type: { type: 'enum', label: 'Item Type', options: ['text', 'image', 'video', 'audio'] },
    },
    group: {
        label: { type: 'string', label: 'Label' },
        color: { type: 'enum',   label: 'Color', options: ['#3f3f46', '#2563eb', '#16a34a', '#ca8a04', '#dc2626'] },
    },
    sticky_note: {
        text:     { type: 'string', label: 'Text', multiline: true },
        color:    { type: 'enum',   label: 'Color', options: ['yellow', 'purple', 'blue', 'green'] },
        fontSize: { type: 'number', label: 'Font Size', min: 10, max: 28 },
    },
    variations: {
        strength: { type: 'number', label: 'Denoising Strength', min: 0.0, max: 1.0, step: 0.1 },
    },
    image_editor: {
        prompt: { type: 'string', label: 'Edit Instruction', multiline: true },
    },
    image_to_3d: {
        format: { type: 'enum', label: 'Format', options: ['glb', 'obj', 'fbx'] },
    },
    image_to_svg: {
        colors: { type: 'number', label: 'Max Colors', min: 2, max: 256 },
    },
    svg_generator: {
        style: { type: 'enum', label: 'Style', options: ['flat', 'gradient', 'outline'] },
    },
    svg_animation: {
        duration: { type: 'number', label: 'Duration (s)', min: 1, max: 30 },
        preset: { type: 'enum', label: 'Animation Preset', options: ['draw', 'fade', 'pulse', 'spin'] },
    },
    video_upscaler: {
        scale: { type: 'enum', label: 'Scale', options: ['2x', '4x'] },
    },
    speak: {
        voice_id: { type: 'string', label: 'Voice ID' },
    },
    edit_video_modify: {
        intensity: { type: 'number', label: 'Edit Strength', min: 0.0, max: 1.0, step: 0.1 },
    },
    extract_frames: {
        interval: { type: 'number', label: 'Interval (s)', min: 0.1, max: 60.0, step: 0.1 },
    },
    sticker: {
        style: { type: 'enum', label: 'Sticker Style', options: ['die-cut', 'embossed', 'vintage'] },
    },
    designer: {
        template: { type: 'string', label: 'Template Type' },
    },
};

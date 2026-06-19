/**
 * nodeCatalog.js — Authoritative registry of every node type in the Canvas Copilot.
 *
 * Rules:
 * - The Command Bus validates `add_node` against this catalog.
 * - The copilot agent calls `get_node_catalog()` and MUST use only these types.
 * - Adding a new model/node type = add it here first, then wire execution.
 *
 * Port types: text | image | video | audio | mask | number | asset_list | ref
 * Cost classes: free | low | billed
 */

export const NODE_CATALOG = {

    // ── Input nodes (free) ──────────────────────────────────────────────────────
    text_input: {
        label: 'Text Input',
        description: 'Brief, prompt, or script entry. Connect to prompt_expand or directly to a generator.',
        category: 'input',
        costClass: 'free',
        icon: 'text_fields',
        ports: {
            inputs: [],
            outputs: [{ id: 'text', type: 'text', label: 'Text' }],
        },
        params: {
            text: { type: 'string', default: '', label: 'Text', multiline: true },
        },
    },

    asset_input: {
        label: 'Asset Input',
        description: 'Upload an image, video, or audio — or pick from your brand library.',
        category: 'input',
        costClass: 'free',
        icon: 'upload_file',
        ports: {
            inputs: [],
            outputs: [
                { id: 'image', type: 'image', label: 'Image' },
                { id: 'video', type: 'video', label: 'Video' },
                { id: 'audio', type: 'audio', label: 'Audio' },
            ],
        },
        params: {
            url:       { type: 'string', default: '',      label: 'Asset URL' },
            assetType: { type: 'enum',   default: 'image', label: 'Type', options: ['image', 'video', 'audio'] },
            label:     { type: 'string', default: '',      label: 'Label' },
        },
    },

    character_ref: {
        label: 'Character Ref',
        description: 'One or more reference images that lock in a consistent character appearance across shots.',
        category: 'input',
        costClass: 'free',
        icon: 'person',
        ports: {
            inputs:  [{ id: 'images', type: 'asset_list', label: 'Reference Images', multi: true, required: false }],
            outputs: [{ id: 'ref',    type: 'ref',        label: 'Character Ref' }],
        },
        params: {
            description: { type: 'string', default: '', label: 'Character Description', multiline: true },
            urls:        { type: 'string_list', default: [], label: 'Image URLs' },
        },
    },

    style_ref: {
        label: 'Style Ref',
        description: 'Visual style reference (color palette, mood, cinematography). Applied to all connected generators.',
        category: 'input',
        costClass: 'free',
        icon: 'palette',
        ports: {
            inputs:  [{ id: 'images', type: 'asset_list', label: 'Style Images', multi: true, required: false }],
            outputs: [{ id: 'ref',    type: 'ref',        label: 'Style Ref' }],
        },
        params: {
            description: { type: 'string', default: '', label: 'Style Description', multiline: true },
            urls:        { type: 'string_list', default: [], label: 'Image URLs' },
        },
    },

    // ── Transform nodes (free, run inline) ──────────────────────────────────────
    prompt_expand: {
        label: 'Prompt Expand',
        description: 'Rewrites a simple brief into a rich, model-optimized generation prompt.',
        category: 'transform',
        costClass: 'low',
        icon: 'auto_awesome',
        ports: {
            inputs:  [{ id: 'text', type: 'text', label: 'Brief / Instruction', required: true }],
            outputs: [{ id: 'text', type: 'text', label: 'Expanded Prompt' }],
        },
        params: {
            targetModel: { type: 'enum', default: 'seedance-2.0', label: 'Target Model',
                options: ['seedance-2.0', 'kling-3.0', 'veo-3.1', 'veo-3.1-fast', 'grok-imagine', 'gemini-flash'] },
            style:       { type: 'string', default: '', label: 'Style Override' },
        },
    },

    resize: {
        label: 'Resize / Crop',
        description: 'Deterministic resize or crop — no model, no cost.',
        category: 'transform',
        costClass: 'free',
        icon: 'crop',
        ports: {
            inputs:  [
                { id: 'media', type: 'image', label: 'Image In', required: false },
                { id: 'video_in', type: 'video', label: 'Video In', required: false },
            ],
            outputs: [
                { id: 'image', type: 'image', label: 'Image Out' },
                { id: 'video', type: 'video', label: 'Video Out' },
            ],
        },
        params: {
            width:       { type: 'number', default: 1080, label: 'Width (px)' },
            height:      { type: 'number', default: 1920, label: 'Height (px)' },
            mode:        { type: 'enum',   default: 'fill', label: 'Fit Mode', options: ['fill', 'fit', 'crop'] },
        },
    },

    trim: {
        label: 'Trim',
        description: 'Trim a video clip to a specific start/end time. Free, no model.',
        category: 'transform',
        costClass: 'free',
        icon: 'content_cut',
        ports: {
            inputs:  [{ id: 'video_in', type: 'video', label: 'Video', required: true }],
            outputs: [{ id: 'video',    type: 'video', label: 'Trimmed' }],
        },
        params: {
            startTime: { type: 'number', default: 0,  label: 'Start (s)' },
            endTime:   { type: 'number', default: 10, label: 'End (s)' },
        },
    },

    concat: {
        label: 'Concat / Stitch',
        description: 'Join multiple video clips in sequence. Accepts up to 24 clips. Free.',
        category: 'transform',
        costClass: 'free',
        icon: 'merge',
        ports: {
            inputs:  [{ id: 'clips', type: 'asset_list', label: 'Clips', multi: true, required: true }],
            outputs: [{ id: 'video', type: 'video',      label: 'Joined Video' }],
        },
        params: {
            transition: { type: 'enum', default: 'cut', label: 'Transition', options: ['cut', 'fade', 'dissolve'] },
            crossfadeMs:{ type: 'number', default: 0,   label: 'Crossfade (ms)' },
        },
    },

    // Alias: stitch === concat (frontend uses both names interchangeably)
    stitch: {
        label: 'Stitch / Concat',
        description: 'Join multiple video clips in sequence. Alias of Concat.',
        category: 'transform',
        costClass: 'free',
        icon: 'merge',
        ports: {
            inputs:  [{ id: 'clips', type: 'asset_list', label: 'Clips', multi: true, required: true }],
            outputs: [{ id: 'video', type: 'video',      label: 'Joined Video' }],
        },
        params: {
            transition: { type: 'enum', default: 'cut', label: 'Transition', options: ['cut', 'fade', 'dissolve'] },
            crossfadeMs:{ type: 'number', default: 0,   label: 'Crossfade (ms)' },
        },
    },

    batch: {
        label: 'Batch Iterator',
        description: 'Fan-out: takes an asset list and runs the connected template once per item. For long-form multi-shot workflows.',
        category: 'transform',
        costClass: 'free',
        icon: 'repeat',
        ports: {
            inputs:  [
                { id: 'items',    type: 'asset_list', label: 'Items List',  required: true },
                { id: 'template', type: 'text',       label: 'Prompt Template', required: true },
            ],
            outputs: [{ id: 'results', type: 'asset_list', label: 'Results' }],
        },
        params: {
            maxParallel: { type: 'number', default: 3, label: 'Max Parallel Jobs' },
        },
    },

    // ── Generation nodes (billed) ───────────────────────────────────────────────
    image_generate: {
        label: 'Image Generate',
        description: 'AI image generation (GPT Image / Gemini). Use as first-frame or ref input for video.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 5,
        icon: 'image',
        ports: {
            inputs: [
                { id: 'prompt',    type: 'text',  label: 'Prompt',         required: true  },
                { id: 'style_ref', type: 'ref',   label: 'Style Ref',      required: false },
                { id: 'char_ref',  type: 'ref',   label: 'Character Ref',  required: false },
            ],
            outputs: [{ id: 'image', type: 'image', label: 'Image' }],
        },
        params: {
            model:       { type: 'enum',   default: 'gemini-flash', label: 'Model',
                options: ['auto', 'gemini-flash', 'gpt-image-2', 'flux-pro'] },
            aspectRatio: { type: 'enum',   default: '9:16', label: 'Ratio',
                options: ['9:16', '16:9', '1:1', '4:5'] },
            quality:     { type: 'enum',   default: 'standard', label: 'Quality',
                options: ['draft', 'standard', 'hd'] },
            count:       { type: 'number', default: 1, label: 'Count', min: 1, max: 4 },
            seed:        { type: 'number', default: -1, label: 'Seed' },
            guidanceScale: { type: 'number', default: 7.5, label: 'Guidance Scale' },
            unlimitedMode: { type: 'boolean', default: false, label: 'Unlimited Mode' },
        },
    },

    video_generate: {
        label: 'Video Generate',
        description: 'AI video generation. Model-selectable: Seedance, Kling, Veo, Grok.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 40,
        icon: 'movie',
        ports: {
            inputs: [
                { id: 'prompt',    type: 'text',  label: 'Prompt',          required: true  },
                { id: 'image',     type: 'image', label: 'First Frame',     required: false },
                { id: 'end_image', type: 'image', label: 'End Frame',       required: false },
                { id: 'style_ref', type: 'ref',   label: 'Style Ref',       required: false },
                { id: 'char_ref',  type: 'ref',   label: 'Character Ref',   required: false },
                { id: 'audio',     type: 'audio', label: 'Audio (Veo only)',required: false },
            ],
            outputs: [
                { id: 'video',     type: 'video', label: 'Video' },
                { id: 'end_frame', type: 'image', label: 'End Frame' },
            ],
        },
        params: {
            model:       { type: 'enum',   default: 'seedance-2.0', label: 'Model',
                options: ['auto', 'seedance-2.0', 'kling-3.0', 'veo-3.1', 'veo-3.1-fast', 'grok-imagine', 'gemini-flash'] },
            duration:    { type: 'number', default: 6,      label: 'Duration (s)', min: 3, max: 120 },
            aspectRatio: { type: 'enum',   default: '16:9', label: 'Aspect Ratio',
                options: ['9:16', '16:9', '1:1', '4:5', '21:9'] },
            resolution:  { type: 'enum',   default: '1080p', label: 'Resolution',
                options: ['auto', '720p', '1080p', '4K'] },
            motionMode:  { type: 'enum',   default: 'balanced', label: 'Motion',
                options: ['subtle', 'balanced', 'dynamic'] },
            sound:       { type: 'boolean', default: true,  label: 'Sound' },
            seed:        { type: 'number',  default: -1,    label: 'Seed' },
            guidanceScale: { type: 'number', default: 7.5,  label: 'Guidance Scale' },
        },
    },

    frame_interpolate: {
        label: 'Frame Interpolate',
        description: 'Generate smooth motion between 2-5 keyframe images. For beats that need controlled animation.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 20,
        icon: 'animation',
        ports: {
            inputs:  [{ id: 'frames', type: 'asset_list', label: 'Keyframes (2-5)', multi: true, required: true }],
            outputs: [{ id: 'video',  type: 'video',      label: 'Interpolated Video' }],
        },
        params: {
            duration:    { type: 'number', default: 5, label: 'Output Duration (s)', min: 2, max: 30 },
            aspectRatio: { type: 'enum',   default: '9:16', label: 'Ratio',
                options: ['9:16', '16:9', '1:1'] },
        },
    },

    voiceover: {
        label: 'Voiceover',
        description: 'Text-to-speech with emotion/expression tags. ElevenLabs or Sarvam.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 8,
        icon: 'record_voice_over',
        ports: {
            inputs:  [{ id: 'script', type: 'text',  label: 'Script',    required: true }],
            outputs: [{ id: 'audio',  type: 'audio', label: 'Voiceover' }],
        },
        params: {
            provider:   { type: 'enum',   default: 'elevenlabs', label: 'Provider',
                options: ['elevenlabs', 'sarvam', 'minimax'] },
            voice:      { type: 'string', default: '',    label: 'Voice ID' },
            speed:      { type: 'number', default: 1.0,   label: 'Speed', min: 0.5, max: 2.0 },
            language:   { type: 'string', default: 'en',  label: 'Language' },
        },
    },

    lipsync: {
        label: 'Lip Sync',
        description: 'Align dialogue audio to a character\'s mouth in the video.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 15,
        icon: 'mic',
        ports: {
            inputs:  [
                { id: 'video_in', type: 'video', label: 'Video',    required: true },
                { id: 'audio',    type: 'audio', label: 'Dialogue', required: true },
            ],
            outputs: [{ id: 'video', type: 'video', label: 'Synced Video' }],
        },
        params: {
            model: { type: 'enum', default: 'sync-1.6', label: 'Model',
                options: ['sync-1.6', 'wav2lip'] },
        },
    },

    music_sfx: {
        label: 'Music / SFX',
        description: 'AI-generated background score, ambient audio, or sound effects from a text prompt.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 10,
        icon: 'music_note',
        ports: {
            inputs:  [{ id: 'prompt', type: 'text',  label: 'Description',  required: true }],
            outputs: [{ id: 'audio',  type: 'audio', label: 'Audio' }],
        },
        params: {
            duration: { type: 'number', default: 30, label: 'Duration (s)', min: 5, max: 300 },
            type:     { type: 'enum',   default: 'background', label: 'Type',
                options: ['background', 'sfx', 'jingle'] },
        },
    },

    upscale: {
        label: 'Upscale',
        description: 'AI upscale to 2K or 4K. ESRGAN or similar model.',
        category: 'enhance',
        costClass: 'billed',
        creditEstimate: 12,
        icon: 'hd',
        ports: {
            inputs:  [
                { id: 'image_in', type: 'image', label: 'Image', required: false },
                { id: 'video_in', type: 'video', label: 'Video', required: false },
            ],
            outputs: [
                { id: 'image', type: 'image', label: 'Upscaled Image' },
                { id: 'video', type: 'video', label: 'Upscaled Video' },
            ],
        },
        params: {
            scale:  { type: 'enum', default: '2x', label: 'Scale', options: ['2x', '4x'] },
            model:  { type: 'enum', default: 'esrgan', label: 'Model', options: ['esrgan', 'real-esrgan'] },
        },
    },

    reframe: {
        label: 'Reframe',
        description: 'Change aspect ratio using AI outpainting. E.g. 16:9 → 9:16.',
        category: 'enhance',
        costClass: 'billed',
        creditEstimate: 18,
        icon: 'crop_rotate',
        ports: {
            inputs:  [
                { id: 'image_in', type: 'image', label: 'Image', required: false },
                { id: 'video_in', type: 'video', label: 'Video', required: false },
            ],
            outputs: [
                { id: 'image', type: 'image', label: 'Reframed Image' },
                { id: 'video', type: 'video', label: 'Reframed Video' },
            ],
        },
        params: {
            targetRatio: { type: 'enum', default: '9:16', label: 'Target Ratio',
                options: ['9:16', '16:9', '1:1', '4:5', '21:9'] },
        },
    },

    // ── Output node ─────────────────────────────────────────────────────────────
    output: {
        label: 'Output',
        description: 'Final deliverable. Mark the end of your workflow. Connects to any media type.',
        category: 'output',
        costClass: 'free',
        icon: 'flag',
        ports: {
            inputs: [
                { id: 'video', type: 'video', label: 'Video', required: false },
                { id: 'audio', type: 'audio', label: 'Audio', required: false },
                { id: 'image', type: 'image', label: 'Image', required: false },
            ],
            outputs: [],
        },
        params: {
            label: { type: 'string', default: 'Final Output', label: 'Label' },
        },
    },

    // ── Wave 1 spaces-parity nodes ────────────────────────────────────────────────
    assistant: {
        label: 'Assistant (LLM)',
        description: 'The in-canvas LLM. Prompt, analyze media, generate text lists for batching.',
        category: 'text',
        costClass: 'low',
        icon: 'assistant',
        ports: {
            inputs: [
                { id: 'prompt', type: 'text', label: 'Prompt', required: true },
                { id: 'media', type: 'image', label: 'Media (Image)', required: false },
                { id: 'texts', type: 'asset_list', label: 'Texts', required: false },
            ],
            outputs: [
                { id: 'text', type: 'text', label: 'Simple Text' },
                { id: 'list', type: 'asset_list', label: 'As List' },
            ]
        },
        params: {
            model:      { type: 'enum', default: 'gemini-flash', label: 'Model', options: ['gemini-flash', 'gpt-4o', 'claude-3-5-sonnet', 'grok-beta'] },
            system_prompt: { type: 'string', default: 'You are a creative assistant.', label: 'System Instructions', multiline: true },
            output_mode: { type: 'enum', default: 'simple', label: 'Output Mode', options: ['simple', 'list'] },
        }
    },

    sound_effects: {
        label: 'Sound Effects',
        description: 'AI-generated sound effects & Foley from text prompt.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 10,
        icon: 'volume_up',
        ports: {
            inputs: [{ id: 'prompt', type: 'text', label: 'Description', required: true }],
            outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }]
        },
        params: {
            duration: { type: 'number', default: 5, label: 'Duration (s)', min: 1, max: 30 }
        }
    },

    video_audio_mix: {
        label: 'Video Audio Mix',
        description: 'Mixes voiceover, sound effects, and background music onto a video clip.',
        category: 'transform',
        costClass: 'free',
        icon: 'volume_up',
        ports: {
            inputs: [
                { id: 'video', type: 'video', label: 'Video In', required: true },
                { id: 'audio', type: 'audio', label: 'Audio Tracks', multi: true, required: false }
            ],
            outputs: [{ id: 'video', type: 'video', label: 'Video Out' }]
        },
        params: {
            videoVolume: { type: 'number', default: 1.0, label: 'Video Vol' },
            audioVolume: { type: 'number', default: 1.0, label: 'Audio Vol' }
        }
    },

    list: {
        label: 'List (Batch Engine)',
        description: 'Batch runner holds a list of texts/images/videos/audio. Processes downstream one-by-one.',
        category: 'utility',
        costClass: 'free',
        icon: 'list',
        ports: {
            inputs: [{ id: 'items', type: 'asset_list', label: 'Items In', multi: true, required: false }],
            outputs: [{ id: 'results', type: 'asset_list', label: 'Items Out' }]
        },
        params: {
            type: { type: 'enum', default: 'text', label: 'Item Type', options: ['text', 'image', 'video', 'audio'] }
        }
    },

    group: {
        label: 'Group Container',
        description: 'A visual grouping box that lets you move locked child nodes together.',
        category: 'utility',
        costClass: 'free',
        icon: 'grid_view',
        ports: { inputs: [], outputs: [] },
        params: {
            label: { type: 'string', default: 'Group', label: 'Label' },
            color: { type: 'enum', default: '#3f3f46', label: 'Color', options: ['#3f3f46', '#2563eb', '#16a34a', '#ca8a04', '#dc2626'] }
        }
    },

    sticky_note: {
        label: 'Sticky Note',
        description: 'Draw annotation notes directly on the canvas.',
        category: 'utility',
        costClass: 'free',
        icon: 'note',
        ports: { inputs: [], outputs: [] },
        params: {
            text: { type: 'string', default: 'Annotation here...', label: 'Text', multiline: true },
            color: { type: 'enum', default: 'yellow', label: 'Color', options: ['yellow', 'purple', 'blue', 'green'] },
            fontSize: { type: 'number', default: 14, label: 'Font Size' }
        }
    },

    variations: {
        label: 'Variations',
        description: 'Generate image variations from an input image using AI.',
        category: 'enhance',
        costClass: 'billed',
        creditEstimate: 10,
        icon: 'difference',
        ports: {
            inputs: [{ id: 'image_in', type: 'image', label: 'Image', required: true }],
            outputs: [{ id: 'image', type: 'image', label: 'Variant Image' }],
        },
        params: {
            strength: { type: 'number', default: 0.5, label: 'Denoising Strength', min: 0.0, max: 1.0, step: 0.1 },
        },
    },

    image_editor: {
        label: 'Image Editor',
        description: 'Modify an image with custom prompt-based instructions and optional mask.',
        category: 'enhance',
        costClass: 'billed',
        creditEstimate: 15,
        icon: 'edit',
        ports: {
            inputs: [
                { id: 'image_in', type: 'image', label: 'Image', required: true },
                { id: 'mask', type: 'mask', label: 'Mask', required: false },
            ],
            outputs: [{ id: 'image', type: 'image', label: 'Edited Image' }],
        },
        params: {
            prompt: { type: 'string', default: '', label: 'Edit Instruction', multiline: true },
        },
    },

    image_to_3d: {
        label: 'Image to 3D',
        description: 'Convert a 2D image into a 3D mesh asset.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 50,
        icon: '3d_rotation',
        ports: {
            inputs: [{ id: 'image_in', type: 'image', label: 'Image', required: true }],
            outputs: [{ id: 'mesh', type: 'ref', label: '3D Mesh' }],
        },
        params: {
            format: { type: 'enum', default: 'glb', label: 'Format', options: ['glb', 'obj', 'fbx'] },
        },
    },

    image_to_svg: {
        label: 'Image to SVG',
        description: 'Convert a raster image (PNG/JPG) to a clean vector SVG.',
        category: 'transform',
        costClass: 'billed',
        creditEstimate: 8,
        icon: 'vector_artwork',
        ports: {
            inputs: [{ id: 'image_in', type: 'image', label: 'Image', required: true }],
            outputs: [
                { id: 'svg', type: 'text', label: 'SVG XML' },
                { id: 'image', type: 'image', label: 'Vector Image' },
            ],
        },
        params: {
            colors: { type: 'number', default: 16, label: 'Max Colors', min: 2, max: 256 },
        },
    },

    svg_generator: {
        label: 'SVG Generator',
        description: 'Generate customizable vector SVG art from a text prompt.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 12,
        icon: 'code',
        ports: {
            inputs: [{ id: 'prompt', type: 'text', label: 'Prompt', required: true }],
            outputs: [
                { id: 'svg', type: 'text', label: 'SVG XML' },
                { id: 'image', type: 'image', label: 'Vector Image' },
            ],
        },
        params: {
            style: { type: 'enum', default: 'flat', label: 'Style', options: ['flat', 'gradient', 'outline'] },
        },
    },

    svg_animation: {
        label: 'SVG Animation',
        description: 'Animate a vector SVG into a short video clip.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 15,
        icon: 'play_arrow',
        ports: {
            inputs: [{ id: 'svg', type: 'text', label: 'SVG XML', required: true }],
            outputs: [{ id: 'video', type: 'video', label: 'Animated SVG' }],
        },
        params: {
            duration: { type: 'number', default: 5, label: 'Duration (s)', min: 1, max: 30 },
            preset: { type: 'enum', default: 'draw', label: 'Animation Preset', options: ['draw', 'fade', 'pulse', 'spin'] },
        },
    },

    video_upscaler: {
        label: 'Video Upscaler',
        description: 'AI video upscaling to higher resolution (2K/4K).',
        category: 'enhance',
        costClass: 'billed',
        creditEstimate: 35,
        icon: 'hd',
        ports: {
            inputs: [{ id: 'video_in', type: 'video', label: 'Video', required: true }],
            outputs: [{ id: 'video', type: 'video', label: 'Upscaled Video' }],
        },
        params: {
            scale: { type: 'enum', default: '2x', label: 'Scale', options: ['2x', '4x'] },
        },
    },

    speak: {
        label: 'Speak (Talking Head)',
        description: 'Generate a talking head video from an avatar image and audio/script.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 20,
        icon: 'face',
        ports: {
            inputs: [
                { id: 'image_in', type: 'image', label: 'Avatar Image', required: true },
                { id: 'audio_in', type: 'audio', label: 'Audio', required: false },
                { id: 'text_in', type: 'text', label: 'Script', required: false },
            ],
            outputs: [{ id: 'video', type: 'video', label: 'Talking Avatar Video' }],
        },
        params: {
            voice_id: { type: 'string', default: '', label: 'Voice ID' },
        },
    },

    edit_video_modify: {
        label: 'Edit Video Modify',
        description: 'Modify video content (objects, style, environment) using text instructions.',
        category: 'transform',
        costClass: 'billed',
        creditEstimate: 25,
        icon: 'video_settings',
        ports: {
            inputs: [
                { id: 'video_in', type: 'video', label: 'Video In', required: true },
                { id: 'prompt', type: 'text', label: 'Edit Prompt', required: true },
            ],
            outputs: [{ id: 'video', type: 'video', label: 'Modified Video' }],
        },
        params: {
            intensity: { type: 'number', default: 0.8, label: 'Edit Strength', min: 0.0, max: 1.0, step: 0.1 },
        },
    },

    extract_frames: {
        label: 'Extract Frames',
        description: 'Extract individual image frames from a video clip at set intervals.',
        category: 'transform',
        costClass: 'free',
        creditEstimate: 0,
        icon: 'grid_on',
        ports: {
            inputs: [{ id: 'video_in', type: 'video', label: 'Video In', required: true }],
            outputs: [{ id: 'frames', type: 'asset_list', label: 'Frames List' }],
        },
        params: {
            interval: { type: 'number', default: 1, label: 'Interval (s)', min: 0.1, max: 60.0, step: 0.1 },
        },
    },

    sticker: {
        label: 'Sticker Generator',
        description: 'Generate die-cut, transparent, or custom stickers from text prompt.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 10,
        icon: 'label',
        ports: {
            inputs: [{ id: 'prompt', type: 'text', label: 'Prompt', required: true }],
            outputs: [{ id: 'image', type: 'image', label: 'Sticker Image' }],
        },
        params: {
            style: { type: 'enum', default: 'die-cut', label: 'Sticker Style', options: ['die-cut', 'embossed', 'vintage'] },
        },
    },

    designer: {
        label: 'Designer',
        description: 'Generate high-quality composite graphic designs or banners.',
        category: 'generate',
        costClass: 'billed',
        creditEstimate: 15,
        icon: 'auto_awesome',
        ports: {
            inputs: [
                { id: 'prompt', type: 'text', label: 'Design Prompt', required: true },
                { id: 'images', type: 'asset_list', label: 'Asset Images', required: false },
            ],
            outputs: [{ id: 'image', type: 'image', label: 'Final Composition' }],
        },
        params: {
            template: { type: 'string', default: 'ad_banner', label: 'Template Type' },
        },
    },
};

// ── Utility helpers ────────────────────────────────────────────────────────────
export function getNodeType(type) { return NODE_CATALOG[type] || null; }
export function getAllTypes()     { return Object.keys(NODE_CATALOG); }
export function isBilledNode(type) { return NODE_CATALOG[type]?.costClass === 'billed'; }
export function getCreditEstimate(type) { return NODE_CATALOG[type]?.creditEstimate || 0; }

// Implicit type casts allowed in connect validation
export const IMPLICIT_CASTS = new Map([
    ['image→asset_list', true],
    ['video→asset_list', true],
    ['audio→asset_list', true],
]);

export function portsCompatible(fromType, toType) {
    if (fromType === toType) return true;
    return IMPLICIT_CASTS.has(`${fromType}→${toType}`);
}

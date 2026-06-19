import BaseNode from './BaseNode';

const GENERIC_META = {
    trim: { 
        icon: '✂️',  
        label: 'Trim',            
        accent: '#94a3b8', 
        cost: 'free',   
        ports: { 
            in: [{ id: 'video_in', type: 'video', label: 'Video', required: true }], 
            out: [{ id: 'video', type: 'video', label: 'Trimmed' }] 
        }
    },
    resize: { 
        icon: '📐',  
        label: 'Resize',          
        accent: '#94a3b8', 
        cost: 'free',   
        ports: { 
            in: [
                { id: 'media', type: 'image', label: 'Image In', required: false },
                { id: 'video_in', type: 'video', label: 'Video In', required: false }
            ], 
            out: [
                { id: 'image', type: 'image', label: 'Image Out' },
                { id: 'video', type: 'video', label: 'Video Out' }
            ] 
        }
    },
    reframe: { 
        icon: '🔄',  
        label: 'Reframe',         
        accent: '#f59e0b', 
        cost: 'low',    
        ports: { 
            in: [
                { id: 'image_in', type: 'image', label: 'Image In', required: false },
                { id: 'video_in', type: 'video', label: 'Video In', required: false }
            ], 
            out: [
                { id: 'image', type: 'image', label: 'Reframed Image' },
                { id: 'video', type: 'video', label: 'Reframed Video' }
            ] 
        }
    },
    upscale: { 
        icon: '🔍',  
        label: 'Upscale',         
        accent: '#FF4D00', 
        cost: 'billed', 
        ports: { 
            in: [
                { id: 'image_in', type: 'image', label: 'Image In', required: false },
                { id: 'video_in', type: 'video', label: 'Video In', required: false }
            ], 
            out: [
                { id: 'image', type: 'image', label: 'Upscaled Image' },
                { id: 'video', type: 'video', label: 'Upscaled Video' }
            ] 
        }
    },
    lipsync: { 
        icon: '👄',  
        label: 'Lip Sync',        
        accent: '#FF4D00', 
        cost: 'billed', 
        ports: { 
            in: [
                { id: 'video_in', type: 'video', label: 'Video In', required: true },
                { id: 'audio', type: 'audio', label: 'Audio', required: true }
            ], 
            out: [{ id: 'video', type: 'video', label: 'Synced' }] 
        }
    },
    music_sfx: { 
        icon: '🎵',  
        label: 'Music / SFX',     
        accent: '#FF4D00', 
        cost: 'billed', 
        ports: { 
            in: [{ id: 'prompt', type: 'text', label: 'Prompt', required: true }], 
            out: [{ id: 'audio', type: 'audio', label: 'Audio' }] 
        }
    },
    frame_interpolate: { 
        icon: '🎞️', 
        label: 'Interpolate',     
        accent: '#FF4D00', 
        cost: 'billed', 
        ports: { 
            in: [{ id: 'frames', type: 'asset_list', label: 'Keyframes', required: true }], 
            out: [{ id: 'video', type: 'video', label: 'Smooth Video' }] 
        }
    },
    assistant: {
        icon: '🤖',
        label: 'Assistant (LLM)',
        accent: '#a78bfa',
        cost: 'low',
        ports: {
            in: [
                { id: 'prompt', type: 'text', label: 'Prompt', required: true },
                { id: 'media', type: 'image', label: 'Media In', required: false },
                { id: 'texts', type: 'asset_list', label: 'Texts', required: false }
            ],
            out: [
                { id: 'text', type: 'text', label: 'Simple Text' },
                { id: 'list', type: 'asset_list', label: 'As List' }
            ]
        }
    },
    sound_effects: {
        icon: '🔊',
        label: 'Sound Effects',
        accent: '#fb923c',
        cost: 'billed',
        ports: {
            in: [{ id: 'prompt', type: 'text', label: 'Description', required: true }],
            out: [{ id: 'audio', type: 'audio', label: 'Audio' }]
        }
    },
    video_audio_mix: {
        icon: '🎛️',
        label: 'Video Audio Mix',
        accent: '#94a3b8',
        cost: 'free',
        ports: {
            in: [
                { id: 'video', type: 'video', label: 'Video In', required: true },
                { id: 'audio', type: 'audio', label: 'Audio Tracks', required: false }
            ],
            out: [{ id: 'video', type: 'video', label: 'Video Out' }]
        }
    },

    // ── Previously missing — caused zero-port nodes ───────────────────────────
    variations: {
        icon: '🔀',
        label: 'Variations',
        accent: '#f59e0b',
        cost: 'billed',
        ports: {
            in: [{ id: 'image_in', type: 'image', label: 'Image', required: true }],
            out: [{ id: 'image', type: 'image', label: 'Variant Image' }]
        }
    },
    image_editor: {
        icon: '✏️',
        label: 'Image Editor',
        accent: '#FF4D00',
        cost: 'billed',
        ports: {
            in: [
                { id: 'image_in', type: 'image', label: 'Image', required: true },
                { id: 'mask', type: 'mask', label: 'Mask', required: false }
            ],
            out: [{ id: 'image', type: 'image', label: 'Edited Image' }]
        }
    },
    image_to_3d: {
        icon: '🧊',
        label: 'Image to 3D',
        accent: '#8b5cf6',
        cost: 'billed',
        ports: {
            in: [{ id: 'image_in', type: 'image', label: 'Image', required: true }],
            out: [{ id: 'mesh', type: 'ref', label: '3D Mesh' }]
        }
    },
    image_to_svg: {
        icon: '🔷',
        label: 'Image to SVG',
        accent: '#06b6d4',
        cost: 'billed',
        ports: {
            in: [{ id: 'image_in', type: 'image', label: 'Image', required: true }],
            out: [
                { id: 'svg', type: 'text', label: 'SVG XML' },
                { id: 'image', type: 'image', label: 'Vector Image' }
            ]
        }
    },
    svg_generator: {
        icon: '🎨',
        label: 'SVG Generator',
        accent: '#8b5cf6',
        cost: 'billed',
        ports: {
            in: [{ id: 'prompt', type: 'text', label: 'Prompt', required: true }],
            out: [
                { id: 'svg', type: 'text', label: 'SVG XML' },
                { id: 'image', type: 'image', label: 'Vector Image' }
            ]
        }
    },
    svg_animation: {
        icon: '▶️',
        label: 'SVG Animation',
        accent: '#ec4899',
        cost: 'billed',
        ports: {
            in: [{ id: 'svg', type: 'text', label: 'SVG XML', required: true }],
            out: [{ id: 'video', type: 'video', label: 'Animated SVG' }]
        }
    },
    video_upscaler: {
        icon: '🔭',
        label: 'Video Upscaler',
        accent: '#FF4D00',
        cost: 'billed',
        ports: {
            in: [{ id: 'video_in', type: 'video', label: 'Video', required: true }],
            out: [{ id: 'video', type: 'video', label: 'Upscaled Video' }]
        }
    },
    speak: {
        icon: '🗣️',
        label: 'Speak (Talking Head)',
        accent: '#FF4D00',
        cost: 'billed',
        ports: {
            in: [
                { id: 'image_in', type: 'image', label: 'Avatar Image', required: true },
                { id: 'audio_in', type: 'audio', label: 'Audio', required: false },
                { id: 'text_in', type: 'text', label: 'Script', required: false }
            ],
            out: [{ id: 'video', type: 'video', label: 'Talking Avatar Video' }]
        }
    },
    edit_video_modify: {
        icon: '🎬',
        label: 'Edit Video Modify',
        accent: '#f59e0b',
        cost: 'billed',
        ports: {
            in: [
                { id: 'video_in', type: 'video', label: 'Video In', required: true },
                { id: 'prompt', type: 'text', label: 'Edit Prompt', required: true }
            ],
            out: [{ id: 'video', type: 'video', label: 'Modified Video' }]
        }
    },
    extract_frames: {
        icon: '🖼️',
        label: 'Extract Frames',
        accent: '#64748b',
        cost: 'free',
        ports: {
            in: [{ id: 'video_in', type: 'video', label: 'Video In', required: true }],
            out: [{ id: 'frames', type: 'asset_list', label: 'Frames List' }]
        }
    },
    sticker: {
        icon: '🏷️',
        label: 'Sticker Generator',
        accent: '#10b981',
        cost: 'billed',
        ports: {
            in: [{ id: 'prompt', type: 'text', label: 'Prompt', required: true }],
            out: [{ id: 'image', type: 'image', label: 'Sticker Image' }]
        }
    },
    designer: {
        icon: '🎭',
        label: 'Designer',
        accent: '#a855f7',
        cost: 'billed',
        ports: {
            in: [
                { id: 'prompt', type: 'text', label: 'Design Prompt', required: true },
                { id: 'images', type: 'asset_list', label: 'Asset Images', required: false }
            ],
            out: [{ id: 'image', type: 'image', label: 'Final Composition' }]
        }
    },
};


export default function GenericNode({ data, selected }) {
    const meta = GENERIC_META[data?.type] || { icon: '⬡', label: data?.type, accent: '#64748b', cost: 'free', ports: { in: [], out: [] } };
    return (
        <BaseNode
            data={data}
            selected={selected}
            icon={meta.icon}
            costClass={meta.cost}
            accentColor={meta.accent}
            inputPorts={meta.ports.in}
            outputPorts={meta.ports.out}
        />
    );
}

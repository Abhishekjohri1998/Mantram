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

import React from 'react';
import useReveal from '../../hooks/useReveal';
import { BRAND, MODEL_LINEUP } from '../../data/studios';

export default function IntelligenceLayer() {
    const revealRef = useReveal();

    // Flatten all models to create a dense grid
    const allModels = [
        ...MODEL_LINEUP.reasoning,
        ...MODEL_LINEUP.image,
        ...MODEL_LINEUP.video
    ];

    // Pad with some extra generic ones to ensure density if needed
    const displayModels = [...allModels, 
        { name: 'Claude 3 Opus', vendor: 'Anthropic' },
        { name: 'Gemini 1.5 Pro', vendor: 'Google' },
        { name: 'DALL-E 3', vendor: 'OpenAI' },
        { name: 'Sora', vendor: 'OpenAI' },
        { name: 'Stable Video', vendor: 'Stability AI' },
        { name: 'Command R+', vendor: 'Cohere' },
        { name: 'Llama 3 70B', vendor: 'Meta' }
    ].slice(0, 18); // Ensure exactly or roughly 18 items

    return (
        <section className="py-24 md:py-32 relative border-y border-white/5" ref={revealRef}>
            {/* Background pattern */}
            <div className="absolute inset-0 z-0 opacity-[0.03]" 
                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} 
            />

            <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
                
                {/* Left: Copy */}
                <div>
                    <span className="text-[11px] font-bold tracking-widest text-[#a1a1aa] uppercase mb-6 block">
                        The Intelligence Layer
                    </span>
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white font-serif mb-6 leading-[1.1]">
                        Powered by every frontier model.<br />
                        <span className="italic" style={{ color: BRAND.primary }}>Not a wrapper. An orchestrator.</span>
                    </h2>
                    <p className="text-lg text-[#a1a1aa] leading-relaxed max-w-xl">
                        Mantram routes each task to the model that does it best — and switches as the frontier moves. You get the output. We handle the orchestration, fallback, and cost.
                    </p>
                </div>

                {/* Right: Dense Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {displayModels.map((model, i) => (
                        <div 
                            key={i}
                            className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-center items-center text-center hover:bg-white/10 hover:border-white/20 transition-colors group cursor-default"
                        >
                            <span className="text-sm font-bold text-white mb-1 group-hover:text-[#FF5A1F] transition-colors">{model.name}</span>
                            <span className="text-[10px] text-[#a1a1aa] uppercase tracking-wider">{model.vendor}</span>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}

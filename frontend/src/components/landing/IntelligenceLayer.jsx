import React from 'react';
import { motion } from 'framer-motion';
import { BRAND } from '../../data/studios';
import { Sparkles, BrainCircuit, Box, Image as ImageIcon, Video, Mic, Music, Waves, CircleDot, Triangle, Diamond, Command, Activity, Cpu } from 'lucide-react';

const MODELS = [
    // Row 1
    { name: 'GPT-5', vendor: 'OpenAI', tag: 'REASONING', icon: BrainCircuit, color: '#a1a1aa' },
    { name: 'Claude 4.5', vendor: 'Anthropic', tag: 'REASONING', icon: Box, color: '#a1a1aa' },
    { name: 'Gemini 2.5', vendor: 'Google', tag: 'MULTIMODAL', icon: Sparkles, color: '#6366f1' },
    { name: 'Grok 4', vendor: 'xAI', tag: 'REASONING', icon: CircleDot, color: '#a1a1aa' },
    { name: 'Llama 4', vendor: 'Meta', tag: 'OPEN', icon: Activity, color: '#f59e0b' },
    { name: 'Mistral L', vendor: 'Mistral', tag: 'OPEN', icon: Waves, color: '#f59e0b' },
    // Row 2
    { name: 'Sora 2', vendor: 'OpenAI', tag: 'VIDEO', icon: Video, color: '#a1a1aa' },
    { name: 'Veo 3', vendor: 'Google', tag: 'VIDEO', icon: Video, color: '#a1a1aa' },
    { name: 'Kling 2.0', vendor: 'Kuaishou', tag: 'VIDEO', icon: Video, color: '#a1a1aa' },
    { name: 'Seedance', vendor: 'ByteDance', tag: 'VIDEO', icon: Diamond, color: '#a1a1aa' },
    { name: 'Runway G4', vendor: 'Runway', tag: 'VIDEO', icon: Triangle, color: '#a1a1aa' },
    { name: 'Hailuo 02', vendor: 'MiniMax', tag: 'VIDEO', icon: Command, color: '#a1a1aa' },
    // Row 3
    { name: 'Flux 1.1', vendor: 'BFL', tag: 'IMAGE', icon: Cpu, color: '#a1a1aa' },
    { name: 'Imagen 4', vendor: 'Google', tag: 'IMAGE', icon: ImageIcon, color: '#a1a1aa' },
    { name: 'Ideogram', vendor: 'Ideogram', tag: 'IMAGE', icon: Box, color: '#a1a1aa' },
    { name: 'Recraft V3', vendor: 'Recraft', tag: 'IMAGE', icon: Box, color: '#a1a1aa' },
    { name: 'ElevenLabs', vendor: 'ElevenLabs', tag: 'VOICE', icon: Mic, color: '#a1a1aa' },
    { name: 'Suno V4', vendor: 'Suno', tag: 'MUSIC', icon: Music, color: '#a1a1aa' },
];

export default function IntelligenceLayer() {
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, scale: 0.95, y: 10 },
        visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
    };

    return (
        <section className="py-24 md:py-32 relative border-y border-white/5 overflow-hidden">
            {/* Background pattern */}
            <div className="absolute inset-0 z-0 opacity-[0.03]" 
                style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} 
            />

            <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10 flex flex-col items-center">
                
                {/* Header */}
                <div className="text-center mb-16 max-w-3xl">
                    <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif mb-6 leading-[1.1]">
                        Powered by every frontier model.<br />
                        <span className="italic" style={{ color: BRAND.primary }}>Not a wrapper. An orchestrator.</span>
                    </h2>
                    <p className="text-lg text-[#a1a1aa] leading-relaxed max-w-2xl mx-auto">
                        Mantram routes each task to the model that does it best — and switches as the frontier moves. You get the output. We handle the orchestration, fallback, and cost.
                    </p>
                </div>

                {/* Models Grid */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                    className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10"
                >
                    {MODELS.map((model, i) => (
                        <motion.div 
                            key={i}
                            variants={itemVariants}
                            className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between h-32 hover:bg-white/5 hover:border-white/20 transition-all group cursor-default"
                        >
                            <div className="flex justify-between items-start w-full">
                                <div className="text-white/60 group-hover:text-white transition-colors">
                                    <model.icon className="w-5 h-5" strokeWidth={1.5} />
                                </div>
                                <span className="text-[9px] font-bold tracking-widest uppercase" style={{ color: model.color }}>
                                    {model.tag}
                                </span>
                            </div>
                            <div className="mt-auto">
                                <span className="block text-[15px] font-bold text-white mb-0.5 group-hover:text-[#FF5A1F] transition-colors">{model.name}</span>
                                <span className="block text-[11px] text-[#a1a1aa]">{model.vendor}</span>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Bottom Pill */}
                <div className="inline-flex items-center gap-3 bg-[#121214] border border-white/10 rounded-full py-3 px-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22c55e' }} />
                    <span className="text-sm font-medium text-[#a1a1aa] relative z-10">
                        Auto-routing engine picks the right model per task — and you can override anytime.
                    </span>
                </div>

            </div>
        </section>
    );
}

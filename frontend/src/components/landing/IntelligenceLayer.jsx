import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { BRAND } from '../../data/studios';
import { Infinity } from 'lucide-react';

// Custom Brand Icons
const OpenAIIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.2157-2.1042 5.9824 5.9824 0 0 0-4.6633-4.103 5.9847 5.9847 0 0 0-2.0913-.1314 5.9825 5.9825 0 0 0-4.6033 2.1157A5.9847 5.9847 0 0 0 8.761 4.542a5.9825 5.9825 0 0 0-5.834 3.123 5.9847 5.9847 0 0 0-1.127 1.8 5.9825 5.9825 0 0 0 1.2587 6.438 5.9847 5.9847 0 0 0 .2157 2.1042 5.9824 5.9824 0 0 0 4.6633 4.103 5.9847 5.9847 0 0 0 2.0913.1314 5.9825 5.9825 0 0 0 4.6033-2.1157 5.9847 5.9847 0 0 0 1.9472 1.0562 5.9825 5.9825 0 0 0 5.834-3.123 5.9847 5.9847 0 0 0 1.127-1.8 5.9825 5.9825 0 0 0-1.2587-6.438zM12.0004 22c-2.31 0-4.3294-1.5036-5.1118-3.6496l1.3934-.803c.6917 1.701 2.3788 2.8718 4.2952 2.8718a4.675 4.675 0 0 0 4.672-4.672v-.2234l1.378.7958C17.7282 19.551 15.068 22 12.0004 22zm-7.6192-3.1115C3.393 17.5135 2.8093 15.932 3.1098 14.3414l1.3917.8037c-.201 1.8315.656 3.6393 2.1963 4.5284l1.5298-.883a4.675 4.675 0 0 0-2.336-4.0456l-1.378-.7958c-.6897 1.8488-.118 3.9935 1.4883 5.2597zM2 12.0004c0-2.31 1.5036-4.3294 3.6496-5.1118l.803 1.3934c-1.701.6917-2.8718 2.3788-2.8718 4.2952a4.675 4.675 0 0 0 4.672 4.672h.2234l-.7958 1.378C4.449 17.7282 2 15.068 2 12.0004zm11.6192-8.8889c.9882 1.375 1.5719 2.9565 1.2714 4.5471l-1.3917-.8037c.201-1.8315-.656-3.6393-2.1963-4.5284l-1.5298.883a4.675 4.675 0 0 0 2.336 4.0456l1.378.7958c.6897-1.8488.118-3.9935-1.4883-5.2597zM22 12.0004c0 2.31-1.5036 4.3294-3.6496 5.1118l-.803-1.3934c1.701-.6917 2.8718-2.3788 2.8718-4.2952a4.675 4.675 0 0 0-4.672-4.672h-.2234l.7958-1.378C19.551 6.2718 22 8.932 22 12.0004zM10.3808 5.1115c-1.375.9882-2.9565 1.5719-4.5471 1.2714l.8037-1.3917c1.8315.201 3.6393-.656 4.5284-2.1963l.883 1.5298a4.675 4.675 0 0 0 4.0456 2.336l.7958-1.378c-1.8488-.6897-3.9935-.118-5.2597 1.4883zM12 14.672a2.672 2.672 0 1 1 0-5.344 2.672 2.672 0 0 1 0 5.344z" />
  </svg>
);
const AnthropicIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M11.5 2h1l8 20h-2.5l-2-5h-8l-2 5H3.5l8-20zm.5 4L7.5 15h9L12 6z" />
  </svg>
);
const GeminiIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
  </svg>
);
const GrokIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const MistralIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.345-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" />
  </svg>
);
const KlingIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontSize="18" fontFamily="sans-serif" fontWeight="bold">K</text>
  </svg>
);
const SeedanceIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2l10 10-10 10L2 12z" />
  </svg>
);
const RunwayIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M14 4l-6 16M20 4l-6 16" />
  </svg>
);
const HailuoIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontSize="14" fontFamily="sans-serif" fontWeight="bold">ME</text>
  </svg>
);
const FluxIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <circle cx="12" cy="6" r="2.5"/><circle cx="17.7" cy="10.1" r="2.5"/><circle cx="15.5" cy="16.9" r="2.5"/><circle cx="8.5" cy="16.9" r="2.5"/><circle cx="6.3" cy="10.1" r="2.5"/><circle cx="12" cy="12" r="1.5"/>
  </svg>
);
const IdeogramIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="8" cy="12" r="2" fill="currentColor"/>
  </svg>
);
const RecraftIcon = (props) => (
  <svg viewBox="0 0 24 24" {...props}>
    <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fill="currentColor" fontSize="18" fontFamily="sans-serif" fontWeight="bold">R</text>
  </svg>
);
const ElevenLabsIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 5v14M15 5v14" />
  </svg>
);
const SunoIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 12q3-6 6 0t6 0t6 0" />
  </svg>
);

const MODELS = [
    // Row 1
    { name: 'GPT-5', vendor: 'OpenAI', domain: 'openai.com', tag: 'REASONING', icon: OpenAIIcon, color: '#a1a1aa' },
    { name: 'Claude 4.5', vendor: 'Anthropic', domain: 'anthropic.com', tag: 'REASONING', icon: AnthropicIcon, color: '#a1a1aa' },
    { name: 'Gemini 2.5', vendor: 'Google', domain: 'google.com', tag: 'MULTIMODAL', icon: GeminiIcon, color: '#6366f1' },
    { name: 'Grok 4', vendor: 'xAI', domain: 'x.ai', tag: 'REASONING', icon: GrokIcon, color: '#a1a1aa' },
    { name: 'Llama 4', vendor: 'Meta', domain: 'meta.com', tag: 'OPEN', icon: Infinity, color: '#f59e0b' },
    { name: 'Mistral L', vendor: 'Mistral', domain: 'mistral.ai', tag: 'OPEN', icon: MistralIcon, color: '#f59e0b' },
    // Row 2
    { name: 'Sora 2', vendor: 'OpenAI', domain: 'openai.com', tag: 'VIDEO', icon: OpenAIIcon, color: '#a1a1aa' },
    { name: 'Veo 3', vendor: 'Google', domain: 'google.com', tag: 'VIDEO', icon: GoogleIcon, color: '#a1a1aa' },
    { name: 'Kling 2.0', vendor: 'Kuaishou', domain: 'klingai.com', tag: 'VIDEO', icon: KlingIcon, color: '#a1a1aa' },
    { name: 'Seedance', vendor: 'ByteDance', domain: 'bytedance.com', tag: 'VIDEO', icon: SeedanceIcon, color: '#a1a1aa' },
    { name: 'Runway G4', vendor: 'Runway', domain: 'runwayml.com', tag: 'VIDEO', icon: RunwayIcon, color: '#a1a1aa' },
    { name: 'Hailuo 02', vendor: 'MiniMax', domain: 'hailuo.ai', tag: 'VIDEO', icon: HailuoIcon, color: '#a1a1aa' },
    // Row 3
    { name: 'Flux 1.1', vendor: 'BFL', domain: 'blackforestlabs.ai', tag: 'IMAGE', icon: FluxIcon, color: '#a1a1aa' },
    { name: 'Imagen 4', vendor: 'Google', domain: 'google.com', tag: 'IMAGE', icon: GoogleIcon, color: '#a1a1aa' },
    { name: 'Ideogram', vendor: 'Ideogram', domain: 'ideogram.ai', tag: 'IMAGE', icon: IdeogramIcon, color: '#a1a1aa' },
    { name: 'Recraft V3', vendor: 'Recraft', domain: 'recraft.ai', tag: 'IMAGE', icon: RecraftIcon, color: '#a1a1aa' },
    { name: 'ElevenLabs', vendor: 'ElevenLabs', domain: 'elevenlabs.io', tag: 'VOICE', icon: ElevenLabsIcon, color: '#a1a1aa' },
    { name: 'Suno V4', vendor: 'Suno', domain: 'suno.com', tag: 'MUSIC', icon: SunoIcon, color: '#a1a1aa' },
];

export default function IntelligenceLayer() {
    const sectionRef = useRef(null);

    // 3D scroll-linked tilt for the whole section
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "center center"]
    });
    const rotateX3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [5, 0]),
        { stiffness: 80, damping: 30 }
    );
    const z3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [-100, 0]),
        { stiffness: 80, damping: 30 }
    );
    const scale3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [0.94, 1]),
        { stiffness: 80, damping: 30 }
    );

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
        <motion.section 
            ref={sectionRef}
            className="py-24 md:py-32 relative border-y border-white/5 overflow-hidden section-3d"
            style={{ rotateX: rotateX3D, z: z3D, scale: scale3D }}
        >
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

                {/* Models Grid — staggered Z-depth */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                    className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10 z-stagger"
                    style={{ transformStyle: 'preserve-3d' }}
                >
                    {MODELS.map((model, i) => (
                        <motion.div 
                            key={i}
                            variants={itemVariants}
                            className="bg-[#121214] border border-white/5 rounded-2xl p-4 flex flex-col justify-between h-32 hover:bg-white/5 hover:border-white/20 transition-all group cursor-default hover-3d-lift"
                        >
                            <div className="flex justify-between items-start w-full">
                                <div className="w-7 h-7 bg-white/90 rounded-md flex items-center justify-center shadow-sm border border-white/20 group-hover:bg-white transition-colors overflow-hidden p-1">
                                    <img 
                                        src={`https://www.google.com/s2/favicons?domain=${model.domain}&sz=128`} 
                                        alt={model.vendor} 
                                        className="w-full h-full object-contain"
                                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }}
                                    />
                                    <model.icon className="w-5 h-5 text-black hidden" strokeWidth={1.5} />
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
        </motion.section>
    );
}

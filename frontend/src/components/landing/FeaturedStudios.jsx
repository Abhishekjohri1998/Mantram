import React, { useRef } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { BRAND } from '../../data/studios';

const SHOWCASES = [
    {
        id: 'creative',
        eyebrow: '01 · CREATIVE STUDIO',
        title: <>From prompt to <span className="italic" style={{ color: BRAND.primary }}>brand-true asset</span> in under 30 seconds.</>,
        description: 'Lock your brand fonts, palette, logos and tone of voice once. Every output respects them — no re-prompting, no review purgatory.',
        features: ['Brand book parser', 'Approval workflows', 'Multi-format export', 'Version history'],
        placeholderText: 'CREATIVE STUDIO · BRAND ASSET PREVIEW',
        placeholderColor: '#1e3a8a', // Dark blue
        reverse: false,
        image: '/screenshots/creative-studio.png'
    },
    {
        id: 'video',
        eyebrow: '02 · VIDEO STUDIO',
        title: <>Cinematic <span className="italic" style={{ color: BRAND.primary }}>6-second</span> spots for every channel, at scale.</>,
        description: 'From concert Q-ads to product reels — direct, edit, and export in one place. Your team stays in the creative seat.',
        features: ['16:9, 9:16, 1:1', 'Voice-over library', 'Auto-localization', 'Stock + custom'],
        placeholderText: 'VIDEO STUDIO · 6S SPOT TIMELINE',
        placeholderColor: '#7c2d12', // Dark orange/brown
        reverse: true,
        image: '/screenshots/video-studio.png'
    },
    {
        id: 'pulse',
        eyebrow: '03 · PULSE STUDIO',
        title: <>The <span className="italic" style={{ color: BRAND.primary }}>signal</span>, not the noise.</>,
        description: 'Real-time performance, audience reactions and creative recommendations — in one feed, refreshed every 15 minutes.',
        features: ['Live dashboards', 'Creative scoring', 'Anomaly alerts', 'Slack + Teams'],
        placeholderText: 'PULSE STUDIO · LIVE SIGNAL FEED',
        placeholderColor: '#064e3b', // Dark green
        reverse: false,
        image: '/screenshots/dashboard.png'
    }
];

export default function FeaturedStudios() {
    return (
        <section className="py-24 md:py-32 relative border-b border-white/5 bg-[#0b0b0c]">
            <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col gap-32">
                {SHOWCASES.map((showcase, index) => (
                    <ShowcaseRow key={showcase.id} showcase={showcase} index={index} />
                ))}
            </div>
        </section>
    );
}

function ShowcaseRow({ showcase, index }) {
    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "end start"]
    });

    const isReversed = showcase.reverse;
    
    const yParallax = useTransform(scrollYProgress, [0, 1], ["-20%", "20%"]);
    const opacityFade = useTransform(scrollYProgress, [0, 0.4], [0, 1]);

    return (
        <motion.div 
            ref={containerRef} 
            style={{ opacity: opacityFade }}
            className={`flex flex-col lg:flex-row items-center gap-16 lg:gap-24 ${isReversed ? 'lg:flex-row-reverse' : ''}`}
        >
            
            {/* Copy Side */}
            <div className="flex-1 w-full">
                <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F] uppercase mb-6 block">
                    {showcase.eyebrow}
                </span>
                
                <h2 className="text-4xl md:text-5xl tracking-tight text-white font-serif mb-6 leading-[1.1]">
                    {showcase.title}
                </h2>
                
                <p className="text-[#a1a1aa] text-lg leading-relaxed mb-8">
                    {showcase.description}
                </p>

                <div className="grid grid-cols-2 gap-y-4 gap-x-8 mb-10 text-[13px] text-[#a1a1aa] font-medium">
                    {showcase.features.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-500 shrink-0" />
                            {feature}
                        </div>
                    ))}
                </div>

                <button className="flex items-center gap-2 text-sm font-semibold text-white px-5 py-2.5 rounded-full transition-colors hover:bg-white/10 border border-white/10">
                    Learn more <ArrowRight className="w-4 h-4" />
                </button>
            </div>

            {/* Visual Side */}
            <div className="flex-1 w-full">
                {/* Container */}
                <div 
                    className="w-full aspect-[4/3] rounded-3xl relative overflow-hidden flex items-center justify-center shadow-2xl transition-transform duration-700 hover:scale-[1.02]"
                    style={{ backgroundColor: showcase.placeholderColor }}
                >
                    {showcase.image ? (
                        <>
                            <img 
                                src={showcase.image} 
                                alt={showcase.eyebrow} 
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105" 
                            />
                            {/* Inner border/shadow to blend the image into the card nicely */}
                            <div className="absolute inset-0 border border-white/10 rounded-3xl pointer-events-none mix-blend-overlay" />
                        </>
                    ) : (
                        <>
                            {/* Diagonal striped overlay for that technical blueprint feel */}
                            <motion.div 
                                className="absolute -top-[50%] -bottom-[50%] -left-[50%] -right-[50%] opacity-10 mix-blend-overlay"
                                style={{
                                    backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 8px)',
                                    y: yParallax
                                }}
                            />
                            
                            {/* Inner glowing element */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-black/40 to-transparent pointer-events-none" />
                            
                            <span className="relative z-10 text-[10px] font-bold text-white/50 tracking-[0.2em] uppercase">
                                {showcase.placeholderText}
                            </span>
                        </>
                    )}
                </div>
            </div>
            
        </motion.div>
    );
}

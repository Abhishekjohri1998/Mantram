import React from 'react';
import { Play, CheckCircle2 } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

export default function Hero({ onEarlyAccess, onAgencyDemo }) {
    const revealContent = useReveal();

    return (
        <section className="relative pt-24 md:pt-32 pb-16 md:pb-24 overflow-hidden flex flex-col items-center text-center">
            {/* Ambient background glow */}
            <div className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center">
                <div 
                    className="w-[800px] h-[600px] rounded-full blur-[150px] opacity-20 mix-blend-screen"
                    style={{ background: 'radial-gradient(circle, #FF5A1F 0%, rgba(255,90,31,0) 70%)' }}
                />
            </div>

            <div className="max-w-4xl mx-auto px-4 md:px-6 flex flex-col items-center" ref={revealContent}>
                {/* Top Pill */}
                <div 
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}
                >
                    <span className="text-[11px] font-bold tracking-widest text-[#a1a1aa]">
                        ★ NEW • 16 STUDIOS • 240+ TEMPLATES • BRAND-NATIVE AI
                    </span>
                </div>

                {/* H1 */}
                <h1 className="text-5xl md:text-7xl lg:text-[84px] font-bold tracking-tight leading-[1.05] mb-8 text-white font-serif">
                    One creative team.<br />
                    <span className="italic" style={{ color: BRAND.primary }}>Sixteen studios.</span><br />
                    Infinite output.
                </h1>

                {/* Subheadline */}
                <p className="text-lg md:text-xl text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed mb-10">
                    Mantram is the AI-native creative OS for marketers, brand teams, and agencies. Generate brand-true videos, images, campaigns and copy across every channel — without breaking your team or your brand book.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center mb-12">
                    <button 
                        onClick={onEarlyAccess}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                        style={{ background: BRAND.primary }}
                    >
                        Book a Demo <span aria-hidden="true">→</span>
                    </button>
                    
                    <button 
                        onClick={onEarlyAccess}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white transition-all hover:bg-white/5 flex items-center justify-center gap-2"
                        style={{ border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                        Join the waitlist
                    </button>
                    
                    <button 
                        onClick={onAgencyDemo}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white transition-all hover:bg-white/5 flex items-center justify-center gap-2 group"
                        style={{ border: '1px solid rgba(255,255,255,0.2)' }}
                    >
                        <Play className="w-4 h-4 text-[#a1a1aa] group-hover:text-white transition-colors" fill="currentColor" />
                        Watch the 90-second tour
                    </button>
                </div>

                {/* Trust Checks */}
                <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 text-[13px] text-[#a1a1aa] font-medium">
                    <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> Brand-locked outputs
                    </span>
                    <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> 100+ enterprise brands
                    </span>
                    <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> SOC 2 · GDPR ready
                    </span>
                    <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-green-500" /> Live in 5 minutes
                    </span>
                </div>
            </div>
        </section>
    );
}

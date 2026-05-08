import React, { useState } from 'react';
import { Play, CheckCircle2 } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import useWaitlist from '../../hooks/useWaitlist';
import { BRAND } from '../../data/studios';

export default function Hero({ onEarlyAccess, onAgencyDemo }) {
    const revealContent = useReveal();
    const [heroEmail, setHeroEmail] = useState('');
    const { submit, submitting, submitted, error } = useWaitlist();

    const handleInlineSubmit = async (e) => {
        e.preventDefault();
        if (!heroEmail.trim()) {
            onEarlyAccess(); // No email entered — just open the full modal
            return;
        }
        await submit({ email: heroEmail, name: '', type: 'individual', source: 'hero_inline' });
    };

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
                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-[#FF5A1F]/30 bg-[#FF5A1F]/5"
                >
                    <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F]">
                        ★ NEW • 16 STUDIOS • 240+ TEMPLATES • BRAND-NATIVE AI
                    </span>
                </div>

                {/* H1 */}
                <h1 className="text-5xl md:text-7xl lg:text-[84px] tracking-tight leading-[1.05] mb-8 text-white font-serif font-normal">
                    One creative team.<br />
                    <span className="italic text-[#FF5A1F]">Sixteen studios.</span><br />
                    Infinite output.
                </h1>

                {/* Subheadline */}
                <p className="text-lg md:text-xl text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed mb-10">
                    Mantram is the AI-native creative OS for marketers, brand teams, and agencies. Generate brand-true videos, images, campaigns and copy across every channel — without breaking your team or your brand book.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
                    <button 
                        onClick={onEarlyAccess}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                        style={{ background: BRAND.primary }}
                    >
                        Book a Demo <span aria-hidden="true">→</span>
                    </button>
                    
                    <button 
                        onClick={onEarlyAccess}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white transition-all hover:bg-white/5 flex items-center justify-center gap-2 border border-white/20"
                    >
                        Join the waitlist
                    </button>
                    
                    <button 
                        onClick={onAgencyDemo}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-[#a1a1aa] hover:text-white transition-all hover:bg-white/5 flex items-center justify-center gap-2 border border-white/10 group"
                    >
                        <Play className="w-4 h-4 text-[#a1a1aa] group-hover:text-white transition-colors" fill="currentColor" />
                        Watch the 90-second tour
                    </button>
                </div>

                {/* Waitlist Inline Input */}
                {submitted ? (
                    <div className="flex items-center gap-2 mt-8 px-6 py-3 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="text-sm font-medium text-emerald-300">You're on the list! We'll be in touch.</span>
                    </div>
                ) : (
                    <form onSubmit={handleInlineSubmit} className="flex flex-col sm:flex-row items-center w-full max-w-md mx-auto mt-8 bg-[#121214] border border-white/10 rounded-full p-1 sm:pl-6 focus-within:border-[#FF5A1F]/50 transition-colors">
                        <input 
                            type="email" 
                            placeholder="you@brand.com"
                            value={heroEmail}
                            onChange={(e) => setHeroEmail(e.target.value)}
                            className="bg-transparent border-none text-white text-sm outline-none w-full flex-1 px-4 sm:px-0 py-3 sm:py-0 placeholder:text-[#a1a1aa]"
                        />
                        <button 
                            type="submit"
                            disabled={submitting}
                            className="w-full sm:w-auto px-6 py-2.5 rounded-full font-bold text-sm text-white transition-all hover:scale-105 active:scale-95 bg-[#FF5A1F] disabled:opacity-60"
                        >
                            {submitting ? 'Joining…' : <>Join waitlist <span aria-hidden="true" className="ml-1">→</span></>}
                        </button>
                    </form>
                )}
                {error && (
                    <p className="text-xs mt-2 text-red-400">{error}</p>
                )}
            </div>
        </section>
    );
}

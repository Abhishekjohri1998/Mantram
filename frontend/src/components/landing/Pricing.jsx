import React from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

export default function Pricing() {
    const revealRef = useReveal();

    return (
        <section className="py-24 md:py-32 bg-[#0b0b0c] relative" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-16">
                    <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F] uppercase mb-4 block">
                        Pricing
                    </span>
                    <h2 className="text-4xl md:text-5xl tracking-tight text-white font-serif max-w-3xl leading-[1.1]">
                        Pick the pack. <span className="italic" style={{ color: BRAND.primary }}>Scale on your terms.</span>
                    </h2>
                </div>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto items-end">
                    
                    {/* Spark Pack */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-8 flex flex-col h-[460px]">
                        <h3 className="text-white font-bold text-xl mb-1">⚡ Spark</h3>
                        <p className="text-[#a1a1aa] text-sm mb-6">For trying out a few campaigns</p>
                        
                        <div className="text-white font-serif text-3xl tracking-tight mb-2">
                            ₹149
                        </div>
                        <div className="text-[#FF5A1F] font-bold text-[11px] mb-8 uppercase tracking-widest">
                            60 Credits
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 text-[13px] text-[#a1a1aa] font-medium">
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Full access to 14 studios</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Claude 4.6 & Gemini 3 Pro</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> 180 days validity</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Standard rendering</span>
                        </div>
                        
                        <Link 
                            to="/auth?mode=signup"
                            className="w-full py-3 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-colors mt-8 text-center block"
                        >
                            Get Spark
                        </Link>
                    </div>

                    {/* Surge Pack */}
                    <div className="bg-[#121214] border border-[#FF5A1F] rounded-2xl p-8 flex flex-col h-[480px] relative shadow-[0_0_40px_rgba(255,90,31,0.15)] z-10">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF5A1F] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                            Most popular
                        </div>
                        
                        <h3 className="text-white font-bold text-xl mb-1">🔥 Surge</h3>
                        <p className="text-[#a1a1aa] text-sm mb-6">For active brand marketers</p>
                        
                        <div className="text-white font-serif text-3xl tracking-tight mb-2">
                            ₹499
                        </div>
                        <div className="text-[#FF5A1F] font-bold text-[11px] mb-8 uppercase tracking-widest">
                            250 Credits
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 text-[13px] text-[#a1a1aa] font-medium">
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5A1F] shrink-0" /> Everything in Spark</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5A1F] shrink-0" /> +20 Bonus Credits</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5A1F] shrink-0" /> Unlimited brands</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5A1F] shrink-0" /> Priority rendering queue</span>
                        </div>
                        
                        <Link 
                            to="/auth?mode=signup"
                            className="w-full py-3 rounded-xl bg-[#FF5A1F] hover:bg-[#e04a14] text-white font-bold text-sm transition-colors mt-8 text-center block"
                        >
                            Get Surge
                        </Link>
                    </div>

                    {/* Stellar Pack */}
                    <div className="bg-[#121214] border border-[#8b5cf6] rounded-2xl p-8 flex flex-col h-[460px] relative shadow-[0_0_40px_rgba(139,92,246,0.1)]">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#8b5cf6] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                            Best Value
                        </div>
                        <h3 className="text-white font-bold text-xl mb-1">🌟 Stellar</h3>
                        <p className="text-[#a1a1aa] text-sm mb-6">For agencies and brand groups</p>
                        
                        <div className="text-white font-serif text-3xl tracking-tight mb-2">
                            ₹3,000
                        </div>
                        <div className="text-[#8b5cf6] font-bold text-[11px] mb-8 uppercase tracking-widest">
                            800 Credits
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 text-[13px] text-[#a1a1aa] font-medium">
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#8b5cf6] shrink-0" /> 650 Base Credits</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#8b5cf6] shrink-0" /> +150 Bonus Credits</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#8b5cf6] shrink-0" /> 365 days validity</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-[#8b5cf6] shrink-0" /> Dedicated CSM</span>
                        </div>
                        
                        <Link 
                            to="/auth?mode=signup"
                            className="w-full py-3 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-colors mt-8 text-center block"
                        >
                            Get Stellar
                        </Link>
                    </div>

                </div>

            </div>
        </section>
    );
}

import React from 'react';
import { Check } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

export default function Pricing({ onEarlyAccess, onAgencyDemo }) {
    const revealRef = useReveal();

    return (
        <section className="py-24 md:py-32 bg-[#0b0b0c] relative" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-16">
                    <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F] uppercase mb-4 block">
                        Pricing
                    </span>
                    <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white font-serif max-w-3xl leading-[1.1]">
                        Pick the pack. <span className="italic" style={{ color: BRAND.primary }}>Scale on your terms.</span>
                    </h2>
                </div>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto items-end">
                    
                    {/* Smart Show */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-8 flex flex-col h-[460px]">
                        <h3 className="text-white font-bold text-xl mb-1">Smart Show</h3>
                        <p className="text-[#a1a1aa] text-sm mb-6">For brand teams launching campaigns</p>
                        
                        <div className="text-white font-serif text-3xl tracking-tight mb-8">
                            Starts at $1,200/mo
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 text-[13px] text-[#a1a1aa] font-medium">
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> 8 core studios</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> 3 brand seats</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Templates library</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Standard support</span>
                        </div>
                        
                        <button 
                            onClick={onEarlyAccess}
                            className="w-full py-3 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-colors mt-8"
                        >
                            Start trial
                        </button>
                    </div>

                    {/* Enterprise */}
                    <div className="bg-[#121214] border border-[#FF5A1F] rounded-2xl p-8 flex flex-col h-[480px] relative shadow-[0_0_40px_rgba(255,90,31,0.15)] z-10">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#FF5A1F] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                            Most popular
                        </div>
                        
                        <h3 className="text-white font-bold text-xl mb-1">Enterprise</h3>
                        <p className="text-[#a1a1aa] text-sm mb-6">For agencies and brand groups</p>
                        
                        <div className="text-white font-serif text-3xl tracking-tight mb-8">
                            Custom
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 text-[13px] text-[#a1a1aa] font-medium">
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> All 16 studios</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Unlimited brands</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Pulse + Performance</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Dedicated CSM</span>
                        </div>
                        
                        <button 
                            onClick={onAgencyDemo || onEarlyAccess}
                            className="w-full py-3 rounded-xl bg-[#FF5A1F] text-white font-bold text-sm hover:bg-[#e04a14] transition-colors mt-8"
                        >
                            Book a demo
                        </button>
                    </div>

                    {/* Studio Lite */}
                    <div className="bg-[#121214] border border-white/5 rounded-2xl p-8 flex flex-col h-[460px]">
                        <h3 className="text-white font-bold text-xl mb-1">Studio Lite</h3>
                        <p className="text-[#a1a1aa] text-sm mb-6">For solo marketers and freelancers</p>
                        
                        <div className="text-white font-serif text-3xl tracking-tight mb-8">
                            $99/mo
                        </div>
                        
                        <div className="flex-1 flex flex-col gap-3 text-[13px] text-[#a1a1aa] font-medium">
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> 4 studios</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> 1 brand</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Watermarked exports</span>
                            <span className="flex items-center gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Community support</span>
                        </div>
                        
                        <button 
                            onClick={onEarlyAccess}
                            className="w-full py-3 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-colors mt-8"
                        >
                            Get started
                        </button>
                    </div>

                </div>

            </div>
        </section>
    );
}

import React from 'react';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

export default function Testimonial() {
    const revealRef = useReveal();

    return (
        <section className="py-24 md:py-32 bg-[#0b0b0c] relative border-b border-white/5" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
                
                {/* Left side: Quote */}
                <div className="flex-1 w-full relative z-10">
                    <span className="text-6xl text-[#FF5A1F] font-serif leading-none block mb-6 select-none opacity-80">
                        “
                    </span>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif text-white leading-tight tracking-tight mb-12 relative z-10">
                        We replaced a 14-person creative pipeline with three brand managers and Mantram. Output went up <span className="italic" style={{ color: BRAND.primary }}>11x</span>. Our CMO sleeps better.
                    </h2>
                    
                    <div className="flex flex-col sm:flex-row sm:items-center gap-8 border-t border-white/10 pt-8">
                        {/* Profile */}
                        <div className="flex items-center gap-4 shrink-0">
                            <div className="w-12 h-12 rounded-full bg-[#FF5A1F] flex items-center justify-center text-white font-serif text-lg">
                                PM
                            </div>
                            <div>
                                <div className="text-white font-bold text-[15px] mb-0.5">Priya Mehta</div>
                                <div className="text-[#a1a1aa] text-xs font-medium">VP Marketing • BookMyShow</div>
                            </div>
                        </div>

                        {/* Stats mini-row */}
                        <div className="flex items-center gap-4 text-[10px] font-bold tracking-widest text-[#a1a1aa] uppercase sm:pl-8 sm:border-l sm:border-white/10">
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] opacity-50" /> 11x Output</span>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] opacity-50" /> 62% Cost cut</span>
                            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] opacity-50" /> 4 Quarters</span>
                        </div>
                    </div>
                </div>

                {/* Right side: Visual Portrait */}
                <div className="w-full lg:w-[420px] shrink-0">
                    <div className="w-full aspect-[4/5] rounded-[2rem] bg-gradient-to-br from-[#ea580c] to-[#431407] relative flex items-center justify-center shadow-2xl overflow-hidden group">
                        <img 
                            src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800" 
                            alt="Priya Mehta" 
                            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-80 group-hover:scale-105 transition-transform duration-700" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    </div>
                </div>

            </div>
        </section>
    );
}

import React from 'react';
import { ArrowRight } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import { BRAND, STUDIOS, STUDIO_ICONS } from '../../data/studios';

export default function StudiosShowcase() {
    const revealRef = useReveal();

    return (
        <section className="py-24 md:py-32 relative bg-[#0b0b0c] border-b border-white/5" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Header Row */}
                <div className="flex flex-col lg:flex-row justify-between items-start gap-12 mb-16">
                    <div>
                        <span className="text-[11px] font-bold tracking-widest uppercase mb-4 block" style={{ color: BRAND.primary }}>
                            The Studios
                        </span>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif leading-[1.1]">
                            Sixteen specialists.<br />
                            <span className="italic" style={{ color: BRAND.primary }}>One creative OS.</span>
                        </h2>
                    </div>
                    <div className="lg:w-1/3 lg:pt-8">
                        <p className="text-[#a1a1aa] leading-relaxed text-sm md:text-base font-medium">
                            Each Mantram Studio is purpose-built for one part of the creative pipeline — from concept to publish to optimize. Use one. Use all. They share your brand book, assets, and history natively.
                        </p>
                    </div>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {STUDIOS.map((studio, i) => (
                        <a 
                            key={studio.slug}
                            href={`/studio/${studio.slug}`}
                            className={`group bg-[#121214] border rounded-2xl p-6 flex flex-col justify-between hover:bg-white/5 transition-all min-h-[220px] ${
                                i === 0 
                                    ? 'border-[#FF4D00]' 
                                    : 'border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="text-[#FF4D00]">
                                    <span className="material-symbols-outlined text-[28px]">{STUDIO_ICONS[studio.slug]}</span>
                                </div>
                                {i < 2 && (
                                    <span className="text-[10px] font-bold text-white bg-[#FF4D00] px-2.5 py-1 rounded-sm uppercase tracking-wider">
                                        Most Used
                                    </span>
                                )}
                                {i === STUDIOS.length - 1 && (
                                    <span className="text-[10px] font-bold text-white bg-[#FF4D00] px-2.5 py-1 rounded-sm uppercase tracking-wider">
                                        New
                                    </span>
                                )}
                            </div>

                            <div>
                                <h3 className="text-white font-bold mb-2 text-[15px]">{studio.name}</h3>
                                <p className="text-[#a1a1aa] text-xs leading-relaxed">
                                    {studio.tagline}
                                </p>
                            </div>

                            <div className="mt-8 flex items-center gap-1 text-[13px] font-medium transition-transform group-hover:translate-x-1" style={{ color: BRAND.primary }}>
                                Explore <ArrowRight className="w-3.5 h-3.5" />
                            </div>
                        </a>
                    ))}
                </div>

            </div>
        </section>
    );
}

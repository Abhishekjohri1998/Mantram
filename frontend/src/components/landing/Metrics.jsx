import React from 'react';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

const METRICS = [
    { value: '8.4×', label: 'Faster campaign turn-around', sub: 'VS TRADITIONAL CREATIVE CYCLE' },
    { value: '62%', label: 'Reduction in agency spend', sub: 'FIRST-QUARTER AVERAGE' },
    { value: '240+', label: 'Brand-locked templates', sub: 'CURATED AND UPDATABLE' },
    { value: '16', label: 'Studios in one OS', sub: 'FROM BRAINSTORM TO PERFORMANCE' },
];

export default function Metrics() {
    const revealRef = useReveal();

    return (
        <section className="py-24 md:py-32 relative bg-[#0b0b0c]" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Section Header */}
                <div className="flex flex-col items-center text-center mb-20">
                    <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif max-w-2xl">
                        Not vanity metrics. <span className="italic" style={{ color: BRAND.primary }}>Real outcomes.</span>
                    </h2>
                    <p className="text-[#a1a1aa] mt-6 text-sm max-w-xl font-medium">
                        Numbers from brand teams running production campaigns on Mantram, last 90 days.
                    </p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8 relative">
                    {/* Divider Lines (Desktop) */}
                    <div className="hidden md:block absolute top-0 bottom-0 left-[25%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                    <div className="hidden md:block absolute top-0 bottom-0 left-[50%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                    <div className="hidden md:block absolute top-0 bottom-0 left-[75%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                    {METRICS.map((metric, i) => (
                        <div key={i} className="flex flex-col items-start px-4">
                            <span className="text-5xl md:text-6xl font-serif mb-4" style={{ color: BRAND.primary }}>
                                {metric.value}
                            </span>
                            <span className="text-white font-bold text-lg mb-2 leading-tight">{metric.label}</span>
                            <span className="text-[10px] font-bold text-[#a1a1aa] uppercase tracking-wider">{metric.sub}</span>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}

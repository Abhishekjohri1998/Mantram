import React from 'react';
import { ArrowRight } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

const CASES = [
    {
        brand: 'BookMyShow',
        tag: 'CASE - CONCERT Q-ADS',
        challenge: 'Launch concert Q-ads across 7 cities in 5 days.',
        stats: [
            { value: '12.4M', label: 'VIEWS' },
            { value: '68', label: 'SPOTS' },
            { value: '₹0.04', label: 'CPV' }
        ],
        gradient: 'from-[#be123c] to-[#4c0519]' // Pink/Red gradient
    },
    {
        brand: 'Tata 1mg',
        tag: 'CASE - HEALTH CAMPAIGN',
        challenge: 'Awareness for diabetes-care line.',
        stats: [
            { value: '4.1M', label: 'IMPRESSIONS' },
            { value: '38', label: 'ASSETS' }
        ],
        gradient: 'from-[#0e7490] to-[#164e63]' // Cyan gradient
    },
    {
        brand: 'Britannia',
        tag: 'CASE - FESTIVE LAUNCH',
        challenge: 'Diwali variant launch in 6 languages.',
        stats: [
            { value: '8.2M', label: 'REACH' },
            { value: '54', label: 'LOCALIZATIONS' }
        ],
        gradient: 'from-[#b45309] to-[#78350f]' // Gold/Brown gradient
    }
];

export default function CaseStudies() {
    const revealRef = useReveal();

    return (
        <section className="py-24 md:py-32 bg-[#0b0b0c] relative border-b border-white/5" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                    <div>
                        <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F] uppercase mb-4 block">
                            Case Studies
                        </span>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white font-serif leading-[1.1]">
                            Not claims. <span className="italic" style={{ color: BRAND.primary }}>Actual results.</span>
                        </h2>
                    </div>
                    <button className="flex items-center gap-2 text-sm font-bold text-[#FF5A1F] hover:text-[#e04a14] transition-colors shrink-0 pb-2">
                        All 24 case studies <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                {/* Cards Grid */}
                <div className="grid md:grid-cols-3 gap-6">
                    {CASES.map((item, i) => (
                        <div 
                            key={i}
                            className="rounded-[2rem] overflow-hidden flex flex-col bg-[#121214] border border-white/5 group hover:border-white/10 transition-colors h-[500px]"
                        >
                            {/* Top Half - Gradient */}
                            <div className={`flex-1 bg-gradient-to-br ${item.gradient} p-8 relative flex flex-col items-center justify-center`}>
                                {/* Diagonal line pattern overlay */}
                                <div className="absolute inset-0 opacity-10 mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 2px, transparent 2px, transparent 8px)' }} />
                                
                                <span className="absolute top-8 left-8 text-white font-bold text-xl tracking-tight z-10">
                                    {item.brand}
                                </span>
                                
                                <span className="relative z-10 text-[10px] font-bold text-white/50 tracking-[0.2em] uppercase">
                                    {item.tag}
                                </span>
                            </div>

                            {/* Bottom Half - Details */}
                            <div className="p-8 h-[200px] flex flex-col justify-between">
                                <div>
                                    <span className="text-[10px] font-bold tracking-wider text-[#FF5A1F] uppercase mb-3 block">
                                        Challenge
                                    </span>
                                    <p className="text-white font-medium text-[15px] leading-relaxed">
                                        {item.challenge}
                                    </p>
                                </div>
                                
                                <div className="flex items-end gap-8 pt-6">
                                    {item.stats.map((stat, idx) => (
                                        <div key={idx} className="flex flex-col">
                                            <span className="text-white font-serif text-3xl font-bold mb-1 tracking-tight">
                                                {stat.value}
                                            </span>
                                            <span className="text-[10px] font-bold tracking-wider text-[#a1a1aa] uppercase">
                                                {stat.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}

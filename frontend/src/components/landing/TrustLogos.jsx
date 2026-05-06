import React from 'react';
import useReveal from '../../hooks/useReveal';

const BRANDS = [
    'BookMyShow',
    'Tata 1mg',
    'Zomato',
    'Cleartrip',
    'Britannia',
    'Asian Paints',
    'Nykaa',
    'Unacademy'
];

export default function TrustLogos() {
    const revealRef = useReveal();

    return (
        <section className="py-12 border-y border-white/5 bg-[#0b0b0c]" ref={revealRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <h2 className="text-center text-[10px] font-bold uppercase tracking-[0.2em] mb-8 text-[#a1a1aa]">
                    Trusted by brands that move fast
                </h2>

                {/* Using a marquee or flex-wrap for the logos */}
                <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                    {BRANDS.map((brand, i) => (
                        <div key={i} className="text-xl md:text-2xl font-bold font-serif tracking-tight text-white/80 hover:text-white transition-colors cursor-default">
                            {brand}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

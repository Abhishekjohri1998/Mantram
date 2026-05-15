import React, { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';
import { apiFetch } from '../../services/api';

export default function Pricing() {
    const revealRef = useReveal();
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPackages = async () => {
            try {
                // Fetch subscription packages from the public endpoint
                const data = await apiFetch('/payments/packages');
                if (data.success && data.packages) {
                    // Filter out inactive plans if needed, though backend should only return active or we just show them
                    setPackages(data.packages.filter(p => p.isActive));
                }
            } catch (error) {
                console.error('Failed to fetch pricing packages:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPackages();
    }, []);

    return (
        <section className="py-24 md:py-32 bg-[#0b0b0c] relative" ref={revealRef}>
            <div className="max-w-[1400px] mx-auto px-4 md:px-6">

                {/* Header */}
                <div className="flex flex-col items-center text-center mb-16">
                    <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F] uppercase mb-4 block">
                        Pricing
                    </span>
                    <h2 className="text-4xl md:text-5xl tracking-tight text-white font-serif max-w-3xl leading-[1.1]">
                        Pick the plan. <span className="italic" style={{ color: BRAND.primary }}>Scale on your terms.</span>
                    </h2>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 className="w-8 h-8 text-[#FF5A1F] animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-stretch">
                        {packages.map((pack) => {
                            const isPopular = pack.badge && pack.badge.length > 0;
                            const cardColor = pack.color || '#6366f1';

                            return (
                                <div
                                    key={pack._id}
                                    className="bg-[#121214] rounded-2xl p-8 flex flex-col relative transition-transform hover:-translate-y-1"
                                    style={{
                                        borderColor: isPopular ? cardColor : 'rgba(255,255,255,0.05)',
                                        borderWidth: '1px',
                                        borderStyle: 'solid',
                                        boxShadow: isPopular ? `0 0 40px ${cardColor}20` : 'none',
                                        zIndex: isPopular ? 10 : 1
                                    }}
                                >
                                    {isPopular && (
                                        <div
                                            className="absolute -top-3 left-1/2 -translate-x-1/2 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap"
                                            style={{ backgroundColor: cardColor }}
                                        >
                                            {pack.badge}
                                        </div>
                                    )}

                                    <h3 className="text-white font-serif text-2xl mb-1">{pack.name}</h3>
                                    <p className="text-[#a1a1aa] text-sm mb-6 h-10 line-clamp-2">{pack.description || pack.tagline}</p>

                                    <div className="text-white font-serif text-4xl tracking-tight mb-8">
                                        {pack.contactForPricing ? (
                                            <span className="text-2xl mt-2 block">Custom Pricing</span>
                                        ) : (
                                            <>
                                                {pack.pricing?.currency === 'USD' ? '$' : '₹'}
                                                {pack.pricing?.monthly}
                                                <span className="text-sm text-[#a1a1aa] font-sans font-normal">/mo</span>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex-1 flex flex-col gap-4 text-[14px] text-[#a1a1aa] font-medium mb-8">
                                        {pack.features && pack.features.map((feature, idx) => (
                                            <span key={idx} className="flex items-start gap-3">
                                                <Check
                                                    className="w-5 h-5 shrink-0 mt-0.5"
                                                    style={{ color: cardColor }}
                                                />
                                                <span className="leading-snug">{feature.name}</span>
                                            </span>
                                        ))}
                                    </div>

                                    <Link
                                        to={pack.contactForPricing ? "mailto:sales@mantram.ai" : "/auth?mode=signup"}
                                        className="w-full py-3.5 rounded-xl text-white font-bold text-sm transition-colors text-center block mt-auto border"
                                        style={isPopular ? {
                                            backgroundColor: cardColor,
                                            borderColor: cardColor,
                                        } : {
                                            backgroundColor: 'transparent',
                                            borderColor: 'rgba(255,255,255,0.1)',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isPopular) {
                                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isPopular) {
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                            }
                                        }}
                                    >
                                        {pack.contactForPricing ? "Contact Sales" : "Get Started"}
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

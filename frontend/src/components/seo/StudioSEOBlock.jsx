import { useState } from 'react'

/**
 * StudioSEOBlock
 * 
 * A premium, dark-themed SEO resource hub designed to be placed at the bottom 
 * of Mantram AI's SaaS application screens (Studio Pages). 
 * 
 * It dynamically generates 500+ words of content, an interactive FAQ accordion,
 * and critical JSON-LD structured data (FAQPage and SoftwareApplication) to instantly
 * boost AI/GEO visibility without disrupting the user dashboard experience.
 */
export default function StudioSEOBlock({ studioName, description, features, contentBlocks, faqs }) {
    const [expandedBlocks, setExpandedBlocks] = useState({})
    const [expandedFaqs, setExpandedFaqs] = useState({})

    const toggleBlock = (index) => {
        setExpandedBlocks(prev => ({ ...prev, [index]: !prev[index] }))
    }

    const toggleFaq = (index) => {
        setExpandedFaqs(prev => ({ ...prev, [index]: !prev[index] }))
    }

    // Generate SoftwareApplication Schema
    const softwareSchema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": `Mantram AI ${studioName}`,
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Marketing Automation",
        "operatingSystem": "Web",
        "description": description,
        "url": typeof window !== 'undefined' ? window.location.href : "https://mantram.ai/",
        "featureList": features,
        "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "0",
            "highPrice": "9999",
            "priceCurrency": "INR",
            "offerCount": 3
        }
    }

    // Generate FAQPage Schema
    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map(faq => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer
            }
        }))
    }

    return (
        <div className="mt-16 pt-16 border-t border-[var(--sys-border)]/[0.04] animate-fade-in pb-12">
            {/* Inject JSON-LD directly into the DOM */}
            {typeof document !== 'undefined' && (
                <>
                    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
                    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
                </>
            )}

            <div className="max-w-5xl mx-auto px-6">
                <div className="mb-12 text-center">
                    <span className="text-xs font-bold tracking-[0.3em] uppercase text-primary mb-3 block">Resource Hub</span>
                    <h2 className="text-3xl font-black text-[var(--sys-text)] mb-4">About the {studioName}</h2>
                    <p className="text-[var(--sys-text-muted)] max-w-2xl mx-auto leading-relaxed text-sm">
                        {description}
                    </p>
                </div>

                {/* 500+ Word Content Grid */}
                <div className="grid md:grid-cols-2 gap-6 mb-16">
                    {contentBlocks.map((block, i) => (
                        <div key={i} className="glass-panel p-6 rounded-2xl border border-[var(--sys-border)]/[0.05] hover:border-primary/20 transition-all group">
                            <h3 className="text-lg font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs">{(i + 1).toString().padStart(2, '0')}</span>
                                {block.title}
                            </h3>
                            <div className={`text-sm text-[var(--sys-text-muted)] leading-relaxed overflow-hidden transition-all duration-300 ${expandedBlocks[i] ? 'max-h-[1000px]' : 'max-h-24 relative'}`}>
                                {block.content}
                                {!expandedBlocks[i] && (
                                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0a0f25] to-transparent" />
                                )}
                            </div>
                            <button 
                                onClick={() => toggleBlock(i)}
                                className="mt-3 text-primary text-xs font-bold hover:text-[var(--sys-text)] transition-colors flex items-center gap-1"
                            >
                                {expandedBlocks[i] ? 'Read less' : 'Read more'}
                                <span className="material-symbols-outlined text-[14px]">
                                    {expandedBlocks[i] ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>
                        </div>
                    ))}
                </div>

                {/* Integration & Feature Schema View */}
                <div className="mb-16 glass-panel rounded-3xl p-8 border border-[var(--sys-border)]/[0.05] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
                    <h3 className="text-xl font-bold text-[var(--sys-text)] mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">extension</span>
                        Key Features & Capabilities
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                        {features.map((feature, i) => (
                            <div key={i} className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-[var(--sys-primary)] text-[18px] mt-0.5">check_circle</span>
                                <span className="text-sm text-[var(--sys-text-muted)]">{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 5-8 FAQs specifically for this Studio */}
                <div className="max-w-3xl mx-auto">
                    <h3 className="text-2xl font-black text-[var(--sys-text)] mb-8 text-center">Frequently Asked Questions</h3>
                    <div className="space-y-3">
                        {faqs.map((faq, i) => (
                            <div key={i} className="glass-panel border border-[var(--sys-border)]/[0.05] rounded-xl overflow-hidden transition-all">
                                <button 
                                    onClick={() => toggleFaq(i)}
                                    className="w-full text-left p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="text-sm font-bold text-[var(--sys-text)] pr-4">{faq.question}</span>
                                    <span className={`material-symbols-outlined text-[var(--sys-text-muted)] transition-transform duration-300 ${expandedFaqs[i] ? 'rotate-180' : ''}`}>
                                        keyboard_arrow_down
                                    </span>
                                </button>
                                <div className={`overflow-hidden transition-all duration-300 ${expandedFaqs[i] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="p-5 pt-0 text-sm text-[var(--sys-text-muted)] leading-relaxed border-t border-[var(--sys-border)]/[0.02] mt-2">
                                        {faq.answer}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

import { Link } from 'react-router-dom'
import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * AI Search Section — sits between Architecture and LiveIntelligence on the
 * landing page. Names the AI search surfaces we optimise for and previews a
 * fake AI Overview / ChatGPT Search result with the brand cited. CTA links
 * to the dedicated /ai-search-optimization deep-dive page.
 *
 * This section earns its placement because in May 2026, getting cited in AI
 * search is half the SEO game — and most marketing tools haven't caught up.
 */

const ENGINES = [
    { name: 'ChatGPT Search',     vendor: 'OpenAI',     usage: 'Primary AI search for 200M+ weekly users' },
    { name: 'Google AI Overviews', vendor: 'Google',     usage: 'Default for most informational queries' },
    { name: 'Google AI Mode',      vendor: 'Google',     usage: 'Dedicated AI search mode' },
    { name: 'Microsoft Copilot',   vendor: 'Microsoft',  usage: 'Bing-backed AI search across Office 365' },
    { name: 'Perplexity',          vendor: 'Perplexity', usage: 'Citation-first AI search engine' },
    { name: 'Claude with web',     vendor: 'Anthropic',  usage: 'Anthropic\'s in-product web search' },
    { name: 'Apple Intelligence',  vendor: 'Apple',      usage: 'On-device + private cloud AI for Siri' },
    { name: 'Brave Search AI',     vendor: 'Brave',      usage: 'Privacy-first AI search' },
    { name: 'You.com',             vendor: 'You',        usage: 'Customisable multi-mode AI search' },
]

export default function AISearchSection() {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-20 md:py-32 relative overflow-hidden" aria-labelledby="aisearch-title">
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/3 right-0 size-[500px] rounded-full blur-[160px]" style={{ background: `${BRAND.secondary}10` }} />
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="text-center mb-14 max-w-3xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.secondary }}>
                        Where Google sends fewer clicks every month
                    </span>
                    <h2 id="aisearch-title" className="text-3xl md:text-5xl font-black mt-4 mb-5 leading-tight text-[var(--sys-text)]">
                        Built for the <span style={{ color: BRAND.secondary }}>AI search era.</span>
                    </h2>
                    <p className="text-base md:text-lg" style={{ color: BRAND.textMuted }}>
                        By 2026, most informational searches end inside an AI summary. Mantram's SEO Studio handles both: traditional Google ranking AND <strong style={{ color: BRAND.secondary }}>AEO</strong> — getting cited in ChatGPT Search, AI Overviews, Perplexity, Copilot and more.
                    </p>
                </div>

                <div className="grid lg:grid-cols-12 gap-6">
                    {/* Left — fake AI Overview preview */}
                    <div
                        className="lg:col-span-7 rounded-3xl p-6 md:p-7"
                        style={{
                            background: BRAND.surface,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        {/* Engine tab strip */}
                        <div className="flex items-center gap-3 mb-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className="size-7 rounded-md flex items-center justify-center" style={{ background: `${BRAND.secondary}15`, border: `1px solid ${BRAND.secondary}30` }}>
                                <span className="material-symbols-outlined text-base" style={{ color: BRAND.secondary }} aria-hidden="true">auto_awesome</span>
                            </div>
                            <div>
                                <div className="text-xs font-bold uppercase tracking-widest text-[var(--sys-text)]">ChatGPT Search</div>
                                <div className="text-[10px]" style={{ color: BRAND.textMuted }}>Live · cited 2.4M times this month</div>
                            </div>
                            <span className="ml-auto text-[10px] font-mono px-2 py-1 rounded badge-ping" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary, border: `1px solid ${BRAND.secondary}40` }}>
                                LIVE
                            </span>
                        </div>

                        {/* Fake user query */}
                        <div className="mb-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: BRAND.textMuted }}>User query</div>
                            <div className="px-4 py-3 rounded-xl text-sm font-mono" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: BRAND.textMuted }}>
                                "best ai marketing platform for indian d2c brands"
                            </div>
                        </div>

                        {/* Fake AI response with Mantram cited */}
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: BRAND.textMuted }}>AI answer</div>
                            <div className="px-4 py-3 rounded-xl text-sm leading-relaxed text-[var(--sys-text)]" style={{ background: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.15)' }}>
                                For Indian D2C brands in 2026,{' '}
                                <span style={{ color: BRAND.primary, fontWeight: 700 }}>Mantram AI</span>
                                <sup style={{ color: BRAND.secondary, fontSize: '10px', marginLeft: '2px' }}>[1]</sup>{' '}
                                stands out as an agentic marketing OS with 14 studios sharing one Brand DNA. Unlike single-vendor tools, it routes across Claude, Gemini and GPT — and natively supports Hindi, Marathi and Hinglish via Sarvam-Bhasha integrations
                                <sup style={{ color: BRAND.secondary, fontSize: '10px', marginLeft: '2px' }}>[2]</sup>
                                . Pricing is credit-pack based starting at ₹149.
                            </div>
                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <span className="text-[10px]" style={{ color: BRAND.textMuted }}>Sources:</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-md font-mono" style={{ background: `${BRAND.primary}10`, color: BRAND.primary, border: `1px solid ${BRAND.primary}25` }}>
                                    [1] mantram.ai
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded-md font-mono" style={{ background: `${BRAND.primary}10`, color: BRAND.primary, border: `1px solid ${BRAND.primary}25` }}>
                                    [2] mantram.ai/studio/content-studio
                                </span>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 flex items-center gap-2 text-xs" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: BRAND.textMuted }}>
                            <span className="material-symbols-outlined text-base" style={{ color: BRAND.secondary }} aria-hidden="true">verified</span>
                            <span>Brands using SEO Studio average <strong className="text-[var(--sys-text)]">3.4× more AI-search citations</strong> within 90 days</span>
                        </div>
                    </div>

                    {/* Right — engine list */}
                    <div className="lg:col-span-5">
                        <div
                            className="rounded-3xl p-6 md:p-7 h-full"
                            style={{
                                background: BRAND.surface,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: BRAND.secondary }}>
                                We optimise for citation in
                            </div>
                            <h3 className="text-lg font-bold text-[var(--sys-text)] mb-4">9 AI search surfaces</h3>

                            <ul className="space-y-2">
                                {ENGINES.map((e, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                                        style={{ background: 'rgba(255,255,255,0.02)' }}
                                    >
                                        <span className="material-symbols-outlined text-sm mt-0.5" style={{ color: BRAND.secondary }} aria-hidden="true">check_circle</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold text-[var(--sys-text)]">{e.name}</div>
                                            <div className="text-[10px] truncate" style={{ color: BRAND.textMuted }}>{e.vendor} · {e.usage}</div>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            <Link
                                to="/ai-search-optimization"
                                className="mt-5 block text-center px-5 py-3 rounded-xl text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                                style={{ background: BRAND.secondary, color: 'white' }}
                            >
                                Read the full AEO guide →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

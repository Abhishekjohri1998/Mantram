import { useState } from 'react'
import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const STEPS = [
    {
        n: '01',
        title: 'Scan',
        sub: 'Drop your URL. Mantram does the rest.',
        body: 'Mantram crawls your website, public socials, top reviews and competitor stack. AI vision reads your logo, palette and photography style. NLP extracts your tone, voice and language preference.',
        icon: 'travel_explore',
    },
    {
        n: '02',
        title: 'Capture',
        sub: 'A living Brand DNA profile.',
        body: 'Voice sliders (witty 78, formal 22, warm 91). Visual identity (palette, type, photo style). Per-platform voice (your IG ≠ your LinkedIn). Knowledge bank (uploaded PDFs, docs, URLs). Competitive position. Public sentiment.',
        icon: 'memory',
    },
    {
        n: '03',
        title: 'Use everywhere',
        sub: 'Every studio reads from the same brain.',
        body: 'Open Content Studio? It already knows your voice. Open Creative Studio? Brand kit is auto-applied. Brainstorm a campaign? It hands off to Video Studio with context preserved. One source. Fourteen studios. Zero re-prompting.',
        icon: 'graph_3',
    },
]

/**
 * Brand DNA centerpiece — the moat made interactive. Visitor clicks step
 * 1/2/3 and sees what each phase produces. Right panel changes per step.
 */
export default function BrandDNA() {
    const [active, setActive] = useState(0)
    const ref = useReveal()
    const step = STEPS[active]

    return (
        <section ref={ref} id="brand-dna" className="reveal py-20 md:py-32 relative overflow-hidden" aria-labelledby="branddna-title">
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/3 -left-40 size-[500px] rounded-full blur-[160px]" style={{ background: `${BRAND.primary}10` }} />
                <div className="absolute bottom-1/3 -right-40 size-[500px] rounded-full blur-[160px]" style={{ background: `${BRAND.secondary}0c` }} />
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="text-center mb-16 max-w-3xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.primary }}>
                        The moat
                    </span>
                    <h2 id="branddna-title" className="text-3xl md:text-5xl font-black mt-4 mb-5 leading-tight text-[var(--sys-text)]">
                        Your Brand DNA. Captured in 90 seconds.
                        <br />
                        <span style={{ color: BRAND.secondary }}>Used everywhere.</span>
                    </h2>
                    <p className="text-base md:text-lg" style={{ color: BRAND.textMuted }}>
                        Most AI tools forget your brand the moment you close the tab. Mantram learns it once — and every studio reads from the same source.
                    </p>
                </div>

                <div className="grid lg:grid-cols-12 gap-8 items-stretch">
                    {/* Left — step nav */}
                    <div className="lg:col-span-5 space-y-3">
                        {STEPS.map((s, i) => {
                            const isActive = i === active
                            return (
                                <button
                                    key={s.n}
                                    type="button"
                                    onClick={() => setActive(i)}
                                    className="w-full text-left p-5 rounded-2xl transition-all cursor-pointer"
                                    style={{
                                        background: isActive ? `${BRAND.primary}10` : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${isActive ? BRAND.primary : 'rgba(255,255,255,0.06)'}`,
                                    }}
                                    aria-pressed={isActive}
                                >
                                    <div className="flex items-start gap-4">
                                        <div
                                            className="size-12 rounded-xl flex items-center justify-center shrink-0"
                                            style={{
                                                background: isActive ? BRAND.primary : 'rgba(255,255,255,0.04)',
                                                color: isActive ? 'white' : BRAND.textMuted,
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-xl" aria-hidden="true">{s.icon}</span>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-baseline gap-3 mb-1">
                                                <span className="text-xs font-mono" style={{ color: isActive ? BRAND.primary : BRAND.textMuted }}>
                                                    {s.n}
                                                </span>
                                                <h3 className="text-lg font-bold text-[var(--sys-text)]">{s.title}</h3>
                                            </div>
                                            <p className="text-sm" style={{ color: BRAND.textMuted }}>{s.sub}</p>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Right — visual */}
                    <div
                        className="lg:col-span-7 rounded-3xl p-8 md:p-10 relative overflow-hidden flex flex-col justify-center min-h-[400px]"
                        style={{
                            background: BRAND.surface,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        {active === 0 && <ScanVisual />}
                        {active === 1 && <CaptureVisual />}
                        {active === 2 && <UseEverywhereVisual />}

                        <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <p className="text-sm leading-relaxed" style={{ color: BRAND.textMuted }}>
                                {step.body}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

// ── Sub-visuals ──────────────────────────────────────────────────────────────

function ScanVisual() {
    return (
        <div className="relative">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span className="material-symbols-outlined text-base" style={{ color: BRAND.secondary }} aria-hidden="true">link</span>
                <span className="text-sm font-mono text-[var(--sys-text)]">https://yourbrand.com</span>
                <span className="ml-auto text-xs font-bold agent-pulse px-2 py-1 rounded" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary, border: `1px solid ${BRAND.secondary}40` }}>
                    SCANNING
                </span>
            </div>

            <div className="space-y-2">
                {[
                    'Reading site copy + structure...',
                    'Analysing logo + palette via vision AI...',
                    'Auditing Instagram, LinkedIn, X voice...',
                    'Discovering top 5 competitors...',
                    'Sentiment-scoring 200 reviews...',
                ].map((t, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg field-unfurl"
                        style={{ animationDelay: `${0.2 + i * 0.2}s`, opacity: 0, background: 'rgba(255,255,255,0.02)' }}
                    >
                        <span className="material-symbols-outlined text-sm" style={{ color: BRAND.secondary }} aria-hidden="true">check_circle</span>
                        <span className="text-xs font-mono" style={{ color: BRAND.textMuted }}>{t}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function CaptureVisual() {
    const sliders = [
        { label: 'Witty',     value: 78 },
        { label: 'Formal',    value: 22 },
        { label: 'Warm',      value: 91 },
        { label: 'Confident', value: 84 },
    ]
    return (
        <div className="space-y-5">
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.textMuted }}>
                    Voice
                </p>
                <div className="space-y-2">
                    {sliders.map((s, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <span className="text-xs w-20 text-[var(--sys-text)]">{s.label}</span>
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div
                                    className="h-full rounded-full"
                                    style={{
                                        width: `${s.value}%`,
                                        background: `linear-gradient(90deg, ${BRAND.primary}, ${BRAND.secondary})`,
                                    }}
                                />
                            </div>
                            <span className="text-xs font-mono w-8 text-right" style={{ color: BRAND.textMuted }}>{s.value}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.textMuted }}>
                    Palette
                </p>
                <div className="flex gap-2">
                    {['#FF4D00', '#06B6D4', '#09090b', '#f4f4f5', '#a1a1aa'].map((c, i) => (
                        <div key={i} className="flex flex-col items-start">
                            <div className="size-12 rounded-lg" style={{ background: c, border: '1px solid rgba(255,255,255,0.08)' }} />
                            <span className="text-[9px] font-mono mt-1.5" style={{ color: BRAND.textMuted }}>{c}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.textMuted }}>
                    Per-platform voice
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {['Instagram: warm, witty, hi+en', 'LinkedIn: confident, formal-light', 'X: punchy, contrarian'].map((s, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-md text-[10px] font-mono" style={{ background: `${BRAND.secondary}10`, border: `1px solid ${BRAND.secondary}30`, color: BRAND.secondary }}>
                            {s}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    )
}

function UseEverywhereVisual() {
    return (
        <div>
            <div className="flex items-center justify-center mb-6">
                <div
                    className="size-20 rounded-2xl flex items-center justify-center brand-pulse"
                    style={{
                        background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`,
                    }}
                >
                    <span className="material-symbols-outlined text-3xl text-white" aria-hidden="true">memory</span>
                </div>
            </div>
            <p className="text-center text-xs font-bold uppercase tracking-widest mb-6" style={{ color: BRAND.textMuted }}>
                One Brand DNA → 14 studios
            </p>
            <div className="grid grid-cols-3 gap-2">
                {[
                    'Content', 'Creative', 'Video',
                    'YouTube', 'Avatar', 'Brand',
                    'Social', 'Performance', 'Funnel',
                    'SEO', 'Retention', 'Research',
                ].map((s, i) => (
                    <div
                        key={i}
                        className="p-2.5 rounded-lg text-center text-[10px] font-semibold field-unfurl"
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            color: BRAND.textMuted,
                            animationDelay: `${i * 0.05}s`,
                            opacity: 0,
                        }}
                    >
                        {s}
                    </div>
                ))}
            </div>
        </div>
    )
}

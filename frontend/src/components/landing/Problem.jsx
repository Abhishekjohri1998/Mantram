import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const PROBLEMS = [
    {
        title: 'AI slop vs Brand-DNA-led output',
        before: '"Write me a caption" → bland AI-voice copy. Google\'s Helpful Content guidance flags it. AI Overviews skip it.',
        after:  'Same prompt → opinionated, brand-faithful copy that ChatGPT Search and AI Overviews actually quote.',
        beforeIcon: 'auto_fix_off',
        afterIcon:  'verified',
    },
    {
        title: 'Single-vendor lock vs Model-agnostic fleet',
        before: 'Picked the wrong AI vendor in 2024 → stuck with their roadmap, their pricing, their ceiling.',
        after:  'Mantram routes per task across Claude, Gemini, GPT, Veo, Sora, Flux. Never locked. Always best-in-class.',
        beforeIcon: 'lock',
        afterIcon:  'hub',
    },
    {
        title: 'Manual research vs Live MCP',
        before: 'Hours juggling SEMrush, SimilarWeb, Brandwatch, Meta Ad Library.',
        after:  '30-second live competitor scan + AI search citation tracker — through one prompt.',
        beforeIcon: 'hourglass_empty',
        afterIcon:  'bolt',
    },
    {
        title: 'Invisible in AI search vs AEO-ready content',
        before: 'Your brand ranks #4 on Google but never gets cited in AI Overviews, ChatGPT Search or Perplexity.',
        after:  'SEO Studio rewrites for AEO so AI engines actually quote you, then tracks citation share.',
        beforeIcon: 'visibility_off',
        afterIcon:  'auto_awesome',
    },
]

/**
 * Problem section — earns the right to talk about the solution by naming the
 * pain. Each card is a before/after pair so visitors see the contrast directly.
 */
export default function Problem() {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-20 md:py-28" aria-labelledby="problem-title">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
                <div className="text-center mb-14 max-w-2xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.primary }}>
                        Why most marketing AI is failing in 2026
                    </span>
                    <h2 id="problem-title" className="text-3xl md:text-5xl font-black mt-4 mb-4 text-[var(--sys-text)] leading-tight">
                        Generic AI gives you <span style={{ color: BRAND.textMuted }}>AI slop</span>.
                        <br />
                        Mantram gives you <span style={{ color: BRAND.primary }}>you</span>.
                    </h2>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                    {PROBLEMS.map((p, i) => (
                        <div
                            key={i}
                            className="rounded-2xl p-6 transition-all glow-card"
                            style={{
                                background: BRAND.surface,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <h3 className="text-sm font-bold uppercase tracking-wider mb-5" style={{ color: BRAND.textMuted }}>
                                {p.title}
                            </h3>

                            <div className="space-y-3">
                                <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
                                    <span className="material-symbols-outlined text-base mt-0.5 shrink-0" style={{ color: '#ef4444', opacity: 0.7 }} aria-hidden="true">{p.beforeIcon}</span>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#ef4444', opacity: 0.7 }}>Before</div>
                                        <p className="text-sm leading-relaxed text-[var(--sys-text)]">{p.before}</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: `${BRAND.primary}08`, border: `1px solid ${BRAND.primary}30` }}>
                                    <span className="material-symbols-outlined text-base mt-0.5 shrink-0" style={{ color: BRAND.primary }} aria-hidden="true">{p.afterIcon}</span>
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: BRAND.primary }}>With Mantram</div>
                                        <p className="text-sm leading-relaxed text-[var(--sys-text)]">{p.after}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const STEPS = [
    {
        n: '01',
        prompt: '"Launch a Diwali sale for my candle brand"',
        action: 'You type. One sentence.',
        icon: 'edit',
    },
    {
        n: '02',
        prompt: 'Master Orchestrator → Strategy + Research + Creative',
        action: 'Mantram routes to the right studios automatically.',
        icon: 'route',
    },
    {
        n: '03',
        prompt: 'Brainstorm → Content → Creative → Video → Schedule',
        action: 'Specialist agents work in parallel.',
        icon: 'auto_awesome',
    },
    {
        n: '04',
        prompt: '30 days · 30 posts · all on-brand · ready to publish',
        action: 'Output lands in your calendar. Ship or refine.',
        icon: 'celebration',
    },
]

/**
 * Workflow walkthrough — show, don't tell. Four discrete steps from prompt
 * to shipped output. Each card uses a "terminal-prompt" treatment so the
 * AI/agentic vibe is visible.
 */
export default function Workflow() {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-20 md:py-28 relative overflow-hidden" aria-labelledby="workflow-title">
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[600px] rounded-full blur-[160px]" style={{ background: `${BRAND.primary}08` }} />
            </div>

            <div className="max-w-6xl mx-auto px-4 md:px-6">
                <div className="text-center mb-14 max-w-2xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.secondary }}>
                        From prompt to live campaign
                    </span>
                    <h2 id="workflow-title" className="text-3xl md:text-5xl font-black mt-4 mb-4 leading-tight text-[var(--sys-text)]">
                        4 steps. <span style={{ color: BRAND.primary }}>No agency.</span>
                    </h2>
                </div>

                <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 list-none">
                    {STEPS.map((s, i) => (
                        <li
                            key={s.n}
                            className="rounded-2xl p-5 relative"
                            style={{
                                background: BRAND.surface,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <span
                                    className="size-9 rounded-lg flex items-center justify-center text-sm font-mono font-bold"
                                    style={{
                                        background: `${BRAND.primary}10`,
                                        border: `1px solid ${BRAND.primary}30`,
                                        color: BRAND.primary,
                                    }}
                                >
                                    {s.n}
                                </span>
                                <span className="material-symbols-outlined text-xl" style={{ color: BRAND.secondary }} aria-hidden="true">
                                    {s.icon}
                                </span>
                            </div>

                            <div
                                className="text-xs font-mono px-3 py-2 rounded-lg mb-3 leading-relaxed"
                                style={{
                                    background: 'rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(6,182,212,0.15)',
                                    color: BRAND.secondary,
                                }}
                            >
                                <span style={{ color: BRAND.primary }}>{'>'}</span> {s.prompt}
                            </div>

                            <p className="text-sm text-[var(--sys-text)]">{s.action}</p>
                        </li>
                    ))}
                </ol>

                <p className="text-center text-sm mt-10" style={{ color: BRAND.textMuted }}>
                    Total time, real numbers: <strong className="text-[var(--sys-text)]">~ 60 seconds</strong> for the orchestration. <strong className="text-[var(--sys-text)]">2–3 minutes</strong> per studio runs in parallel.
                </p>
            </div>
        </section>
    )
}

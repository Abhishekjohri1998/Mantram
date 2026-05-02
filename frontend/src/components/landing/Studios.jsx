import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND, STUDIOS, STUDIO_GROUPS, STUDIO_ICONS, studiosForGroup } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * The 14 studios — tabbed by outcome (Plan / Create / Distribute / Optimize)
 * so visitors don't get hit with a 4×4 wall of cards. Each card links to the
 * SEO sub-page at /studio/<slug> for deep dive + early-access conversion.
 */
export default function Studios() {
    const [activeGroup, setActiveGroup] = useState(STUDIO_GROUPS[0])
    const ref = useReveal()
    const visible = studiosForGroup(activeGroup)

    return (
        <section ref={ref} id="studios" className="reveal py-20 md:py-32 relative" aria-labelledby="studios-title">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="text-center mb-12 max-w-3xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.primary }}>
                        14 specialised studios
                    </span>
                    <h2 id="studios-title" className="text-3xl md:text-5xl font-black mt-4 mb-5 leading-tight text-[var(--sys-text)]">
                        Plan. Create. Distribute. <span style={{ color: BRAND.primary }}>Optimise.</span>
                    </h2>
                    <p className="text-base md:text-lg" style={{ color: BRAND.textMuted }}>
                        Every studio reads from your Brand DNA — so output stays on-brand without re-prompting. Pick what you need, when you need it.
                    </p>
                </div>

                {/* Group tabs */}
                <div
                    className="flex flex-wrap justify-center gap-1 mb-10 mx-auto p-1 rounded-2xl max-w-fit"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                    role="tablist"
                >
                    {STUDIO_GROUPS.map(g => {
                        const isActive = g === activeGroup
                        return (
                            <button
                                key={g}
                                role="tab"
                                aria-selected={isActive}
                                type="button"
                                onClick={() => setActiveGroup(g)}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer"
                                style={{
                                    background: isActive ? BRAND.primary : 'transparent',
                                    color: isActive ? 'white' : BRAND.textMuted,
                                }}
                            >
                                {g}
                                <span className="ml-2 text-[10px] opacity-60">
                                    {studiosForGroup(g).length}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Studio cards */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map((s) => (
                        <Link
                            key={s.slug}
                            to={`/studio/${s.slug}`}
                            className="group rounded-2xl p-6 transition-all hover:scale-[1.02] active:scale-[0.99] glow-card"
                            style={{
                                background: BRAND.surface,
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div className="flex items-start justify-between mb-5">
                                <div
                                    className="size-12 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                                    style={{
                                        background: `linear-gradient(135deg, ${BRAND.primary}25, ${BRAND.secondary}20)`,
                                        border: `1px solid ${BRAND.primary}40`,
                                    }}
                                >
                                    <span className="material-symbols-outlined text-xl" style={{ color: BRAND.primary }} aria-hidden="true">
                                        {STUDIO_ICONS[s.slug] || 'auto_awesome'}
                                    </span>
                                </div>
                                <span
                                    className="text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ color: BRAND.secondary }}
                                >
                                    Learn more →
                                </span>
                            </div>

                            <h3 className="text-lg font-bold mb-1.5 text-[var(--sys-text)]">{s.name}</h3>
                            <p className="text-xs font-semibold mb-3" style={{ color: BRAND.secondary }}>{s.tagline}</p>
                            <p className="text-sm leading-relaxed" style={{ color: BRAND.textMuted }}>
                                {s.teaser.length > 130 ? s.teaser.substring(0, 130) + '…' : s.teaser}
                            </p>

                            {/* Models row */}
                            {s.models?.length > 0 && (
                                <div className="mt-5 pt-4 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    {s.models.slice(0, 3).map((m, i) => (
                                        <span
                                            key={i}
                                            className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                                            style={{
                                                background: `${BRAND.secondary}10`,
                                                color: BRAND.secondary,
                                                border: `1px solid ${BRAND.secondary}25`,
                                            }}
                                        >
                                            {m}
                                        </span>
                                    ))}
                                    {s.models.length > 3 && (
                                        <span className="text-[10px] px-2 py-0.5" style={{ color: BRAND.textMuted }}>
                                            +{s.models.length - 3}
                                        </span>
                                    )}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>

                <div className="text-center mt-10 text-sm" style={{ color: BRAND.textMuted }}>
                    All 14 studios → <strong className="text-[var(--sys-text)]">{STUDIOS.length}</strong> ways to ship marketing, one Brand DNA powering all of them.
                </div>
            </div>
        </section>
    )
}

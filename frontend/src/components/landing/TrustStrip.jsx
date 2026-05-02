import { BRAND, MODEL_LINEUP, INTEGRATIONS } from '../../data/studios'

/**
 * Two trust rows. The split sells two stories silently:
 *   Row 1 — "we have the best AI brain"   (frontier model lineup)
 *   Row 2 — "we plug into your stack"     (integration logos)
 *
 * Models marked `latest: true` get a soft cyan badge ping. The trailing
 * single-line copy "Mantram routes to the right model for every job" turns
 * the chip soup into a clear value statement.
 */
export default function TrustStrip() {
    const reasoningModels = MODEL_LINEUP.reasoning
    const imageModels = MODEL_LINEUP.image
    const videoModels = MODEL_LINEUP.video

    return (
        <section className="py-16 md:py-20 border-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }} aria-labelledby="trust-title">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <h2 id="trust-title" className="text-center text-xs font-bold uppercase tracking-[0.3em] mb-3" style={{ color: BRAND.textMuted }}>
                    Built on every leading AI model.
                </h2>
                <p className="text-center text-2xl md:text-3xl font-black mb-12 text-[var(--sys-text)]">
                    Loyal to <span style={{ color: BRAND.primary }}>none.</span>
                </p>

                <div className="space-y-6">
                    <ModelRow label="Reasoning & language" models={reasoningModels} />
                    <ModelRow label="Image generation"     models={imageModels} />
                    <ModelRow label="Video & avatars"      models={videoModels} />
                </div>

                <p className="text-center text-sm mt-10 max-w-2xl mx-auto" style={{ color: BRAND.textMuted }}>
                    Model-agnostic by design. <strong style={{ color: BRAND.secondary }}>Mantram routes to the right model per task</strong> — quality, latency and cost optimised. You're never locked to one vendor.
                </p>

                {/* Divider */}
                <div className="h-px my-14" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />

                <h2 className="text-center text-xs font-bold uppercase tracking-[0.3em] mb-10" style={{ color: BRAND.textMuted }}>
                    Connects to your stack
                </h2>

                {/* Integrations row — marquee for visual life on a long list */}
                <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)' }}>
                    <div className="marquee-track">
                        {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
                            <span
                                key={i}
                                className="px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap shrink-0"
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    color: BRAND.textMuted,
                                }}
                            >
                                {name}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

function ModelRow({ label, models }) {
    return (
        <div className="grid md:grid-cols-[180px_1fr] gap-4 md:gap-6 items-center">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] md:text-right" style={{ color: BRAND.textMuted }}>
                {label}
            </span>
            <div className="flex flex-wrap gap-2">
                {models.map((m, i) => (
                    <div
                        key={i}
                        className="group relative px-3 py-2 rounded-lg flex items-center gap-2"
                        style={{
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        <span className="text-sm font-semibold text-[var(--sys-text)]">{m.name}</span>
                        {m.latest && (
                            <span
                                className="text-[8px] font-bold tracking-widest px-1.5 py-0.5 rounded badge-ping"
                                style={{
                                    background: `${BRAND.secondary}20`,
                                    color: BRAND.secondary,
                                    border: `1px solid ${BRAND.secondary}40`,
                                }}
                            >
                                LATEST
                            </span>
                        )}
                        {/* Tooltip with vendor on hover */}
                        <span
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                            style={{ background: BRAND.bg, color: BRAND.textMuted, border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                            {m.vendor}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

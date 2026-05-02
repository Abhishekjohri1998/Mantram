import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * Architecture diagram — three vertical layers showing how user input
 * traverses the agentic system. Confident, technical, but readable to
 * non-engineers. The MCP layer at the bottom is the secret sauce most
 * "AI marketing" tools don't have.
 */
export default function Architecture() {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-20 md:py-32 relative overflow-hidden" aria-labelledby="arch-title">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
                <div className="text-center mb-16 max-w-3xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.secondary }}>
                        Inside the brain
                    </span>
                    <h2 id="arch-title" className="text-3xl md:text-5xl font-black mt-4 mb-5 leading-tight text-[var(--sys-text)]">
                        Not a tool. <span style={{ color: BRAND.primary }}>A team of agents.</span>
                    </h2>
                    <p className="text-base md:text-lg" style={{ color: BRAND.textMuted }}>
                        Master Orchestrator routes intent. Specialist agents execute. MCP server fetches live web intelligence. They share one brain — your Brand DNA.
                    </p>
                </div>

                <div className="relative space-y-3">
                    {/* Layer 1 — User */}
                    <ArchLayer
                        label="You"
                        sub="Type what you want. Plain English, Hindi, Hinglish."
                        nodes={[{ icon: 'person', label: 'User intent', primary: true }]}
                        accent={BRAND.primary}
                    />

                    <Connector />

                    {/* Layer 2 — Master Orchestrator */}
                    <ArchLayer
                        label="Master Orchestrator"
                        sub="Reads your Brand DNA. Routes to the right specialist agents."
                        nodes={[{ icon: 'hub', label: 'Intent classifier' }, { icon: 'route', label: 'Studio router' }, { icon: 'memory', label: 'Brand DNA core' }]}
                        accent={BRAND.secondary}
                    />

                    <Connector />

                    {/* Layer 3 — Specialist agents */}
                    <ArchLayer
                        label="Specialist Agents"
                        sub="Each has a specialised job. They share Brand DNA context."
                        nodes={[
                            { icon: 'brush',           label: 'Art Director' },
                            { icon: 'integration_instructions', label: 'Prompt Engineer' },
                            { icon: 'fact_check',      label: 'Style Critic' },
                            { icon: 'auto_awesome',    label: 'Generator' },
                            { icon: 'description',     label: 'Strategist' },
                            { icon: 'edit_note',       label: 'Copywriter' },
                        ]}
                        accent={BRAND.secondary}
                    />

                    <Connector />

                    {/* Layer 4 — Tools (MCP + models) */}
                    <ArchLayer
                        label="Tools (MCP + Frontier Models)"
                        sub="Live web intel + the right model for the job, picked automatically."
                        nodes={[
                            { icon: 'travel_explore', label: 'web_search' },
                            { icon: 'find_in_page',   label: 'scrape_competitor' },
                            { icon: 'trending_up',    label: 'fetch_trending' },
                            { icon: 'analytics',      label: 'fetch_seo_audit' },
                            { icon: 'auto_awesome',   label: 'Claude · Gemini · GPT' },
                            { icon: 'movie',          label: 'Veo 3.1 · Sora 2' },
                        ]}
                        accent={BRAND.primary}
                        muted
                    />
                </div>
            </div>
        </section>
    )
}

function ArchLayer({ label, sub, nodes, accent, muted }) {
    return (
        <div
            className="rounded-2xl p-5 md:p-6"
            style={{
                background: muted ? 'rgba(255,255,255,0.02)' : `${accent}08`,
                border: `1px solid ${muted ? 'rgba(255,255,255,0.06)' : `${accent}30`}`,
            }}
        >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-4">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: accent }}>
                        {label}
                    </div>
                    <div className="text-sm" style={{ color: BRAND.textMuted }}>{sub}</div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {nodes.map((n, i) => (
                    <div
                        key={i}
                        className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
                        style={{
                            background: n.primary ? accent : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${n.primary ? accent : 'rgba(255,255,255,0.06)'}`,
                            color: n.primary ? 'white' : 'var(--sys-text)',
                        }}
                    >
                        <span className="material-symbols-outlined text-base" style={{ color: n.primary ? 'white' : accent }} aria-hidden="true">{n.icon}</span>
                        <span>{n.label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function Connector() {
    return (
        <div className="flex justify-center" aria-hidden="true">
            <svg width="40" height="36" viewBox="0 0 40 36">
                <line x1="20" y1="0" x2="20" y2="32" stroke={BRAND.secondary} strokeWidth="1.5" className="thread-line" />
                <polyline points="14,26 20,32 26,26" fill="none" stroke={BRAND.secondary} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    )
}

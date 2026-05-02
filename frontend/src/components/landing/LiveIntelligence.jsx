import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const TICKER_EVENTS = [
    { tool: 'scrape_competitor', text: 'nike.com scraped',                   age: '2s ago' },
    { tool: 'fetch_trending',    text: '#diwali2026 +340%',                  age: '4s ago' },
    { tool: 'web_search',        text: '"AI for shopify" — 12 top results',  age: '7s ago' },
    { tool: 'fetch_seo_audit',   text: 'mybrand.in: 87/100 health',          age: '11s ago' },
    { tool: 'scrape_competitor', text: 'gymshark.com — 14 active ads',       age: '14s ago' },
    { tool: 'fetch_trending',    text: 'Black Friday queries +1200%',        age: '18s ago' },
    { tool: 'web_search',        text: 'D2C SEO India — top 5 ranking',      age: '22s ago' },
    { tool: 'scrape_social',     text: '@compbrand voice profile updated',   age: '25s ago' },
    { tool: 'fetch_content',     text: 'Last 90d patterns analysed',         age: '29s ago' },
]

/**
 * LiveIntelligence — short standalone section that visualises the MCP
 * server in action with a horizontal ticker. Reinforces "this is alive,
 * not training-data."
 */
export default function LiveIntelligence() {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-16 md:py-24 relative overflow-hidden">
            <div className="max-w-6xl mx-auto px-4 md:px-6">
                <div className="text-center mb-10 max-w-2xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.secondary }}>
                        Live web intelligence
                    </span>
                    <h2 className="text-2xl md:text-4xl font-black mt-3 mb-3 text-[var(--sys-text)]">
                        Your AI doesn't live in 2024. <span style={{ color: BRAND.secondary }}>It lives now.</span>
                    </h2>
                    <p className="text-sm md:text-base" style={{ color: BRAND.textMuted }}>
                        Built-in MCP server fetches competitor sites, trending topics, SEO data and social signals at the moment you ask — so your strategy is always current.
                    </p>
                </div>

                <div
                    className="rounded-2xl p-6 relative overflow-hidden"
                    style={{
                        background: BRAND.surface,
                        border: '1px solid rgba(255,255,255,0.06)',
                    }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <span className="size-2 rounded-full agent-pulse" style={{ background: BRAND.secondary }} aria-hidden="true" />
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.secondary }}>MCP · Live</span>
                    </div>

                    <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)' }}>
                        <div className="marquee-track">
                            {[...TICKER_EVENTS, ...TICKER_EVENTS].map((e, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg shrink-0"
                                    style={{
                                        background: 'rgba(6,182,212,0.04)',
                                        border: '1px solid rgba(6,182,212,0.15)',
                                    }}
                                >
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary }}>
                                        {e.tool}
                                    </span>
                                    <span className="text-sm whitespace-nowrap text-[var(--sys-text)]">{e.text}</span>
                                    <span className="text-[10px] font-mono whitespace-nowrap" style={{ color: BRAND.textMuted }}>{e.age}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

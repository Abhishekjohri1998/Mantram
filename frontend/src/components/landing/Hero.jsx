import HeroVisual from './HeroVisual'
import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * Hero — first screen the visitor lands on.
 *
 * Two CTAs:
 *  - "Get Early Access"   → opens waitlist modal (individual flow)
 *  - "For Agencies →"     → opens waitlist modal (enterprise flow)
 *
 * Single H1, single value prop. Headline calls out the actual moat
 * (brand-aware AI), not the UI metaphor.
 */
export default function Hero({ onEarlyAccess, onAgencyDemo }) {
    const left = useReveal()
    const right = useReveal({ threshold: 0.05 })

    return (
        <section className="relative pt-12 md:pt-20 pb-16 md:pb-24 overflow-hidden" aria-labelledby="hero-title">
            {/* Ambient glow — orange + cyan */}
            <div className="absolute inset-0 pointer-events-none -z-10">
                <div
                    className="absolute -top-40 left-1/4 size-[600px] rounded-full blur-[140px]"
                    style={{ background: `${BRAND.primary}1a` }}
                />
                <div
                    className="absolute -bottom-32 right-1/4 size-[500px] rounded-full blur-[120px]"
                    style={{ background: `${BRAND.secondary}14` }}
                />
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6 grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
                {/* Left — copy */}
                <div ref={left} className="reveal lg:col-span-6">
                    {/* Eyebrow badge */}
                    <div
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 agent-pulse"
                        style={{
                            background: `${BRAND.secondary}10`,
                            border: `1px solid ${BRAND.secondary}40`,
                        }}
                    >
                        <span className="size-1.5 rounded-full" style={{ background: BRAND.secondary }} aria-hidden="true" />
                        <span className="text-xs font-bold tracking-wider uppercase" style={{ color: BRAND.secondary }}>
                            Agentic AI · Now in Early Access
                        </span>
                    </div>

                    {/* H1 */}
                    <h1 id="hero-title" className="text-[42px] md:text-6xl lg:text-7xl font-black leading-[1.02] tracking-tight mb-6 text-[var(--sys-text)]">
                        AI that knows your brand,{' '}
                        <span
                            style={{
                                background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%)`,
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                backgroundClip: 'text',
                            }}
                        >
                            not just the internet.
                        </span>
                    </h1>

                    {/* Sub */}
                    <p className="text-lg md:text-xl leading-relaxed mb-8 max-w-xl" style={{ color: BRAND.textMuted }}>
                        Mantram learns your brand DNA once — voice, visuals, audience, competitors — then runs <strong className="text-[var(--sys-text)]">14 agentic studios</strong> that plan, create, distribute and optimise for you.
                    </p>

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <button
                            onClick={onEarlyAccess}
                            className="px-7 py-4 rounded-full font-bold text-sm transition-all transform hover:scale-105 active:scale-95 cursor-pointer brand-pulse"
                            style={{ background: BRAND.primary, color: 'white' }}
                        >
                            Get Early Access →
                        </button>
                        <button
                            onClick={onAgencyDemo}
                            className="px-7 py-4 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                            style={{
                                background: 'transparent',
                                color: BRAND.secondary,
                                border: `1px solid ${BRAND.secondary}60`,
                            }}
                        >
                            For Agencies →
                        </button>
                    </div>

                    {/* Trust microline — outcome-led, not model-name-dropped (it's 2026, every tool has these models) */}
                    <p className="text-xs" style={{ color: BRAND.textMuted }}>
                        <span className="size-1.5 rounded-full inline-block mr-2" style={{ background: BRAND.secondary, verticalAlign: 'middle' }} aria-hidden="true" />
                        Brand-DNA-led · Model-agnostic · AEO-ready · Built for India 2026
                    </p>
                </div>

                {/* Right — animated visual */}
                <div ref={right} className="reveal lg:col-span-6">
                    <HeroVisual />
                </div>
            </div>
        </section>
    )
}

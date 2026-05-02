import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * Two-up segment section. Both cards convert to the same waitlist endpoint
 * but with different flow types so we can route leads differently downstream.
 */
export default function ForWho({ onEarlyAccess, onAgencyDemo }) {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-20 md:py-28" aria-labelledby="for-who-title">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="text-center mb-14 max-w-2xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.primary }}>
                        Built for both ends
                    </span>
                    <h2 id="for-who-title" className="text-3xl md:text-5xl font-black mt-4 mb-4 leading-tight text-[var(--sys-text)]">
                        One brand or fifty. <span style={{ color: BRAND.primary }}>Mantram fits.</span>
                    </h2>
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                    <SegmentCard
                        accent={BRAND.secondary}
                        eyebrow="For Agencies"
                        title="50 brands. Zero voice bleed."
                        desc="Manage every client in one workspace. Brand DNA is per-client and never crosses accounts. Role-based access for creators, reviewers and admins."
                        bullets={[
                            'Multi-brand workspace, one-click switching',
                            'Per-client Brand DNA (never bleeds across accounts)',
                            'Roles: creator · reviewer · admin',
                            'White-label exports + audit logs',
                        ]}
                        ctaLabel="Book Agency Demo"
                        onCta={onAgencyDemo}
                    />

                    <SegmentCard
                        accent={BRAND.primary}
                        eyebrow="For Solopreneurs & D2C"
                        title="One brand. All studios. ₹149 to start."
                        desc="One brand. All 14 studios. Indian languages built in. Credit packs from ₹149 — pay only for what you use, no monthly subscription anxiety."
                        bullets={[
                            'One brand, all 14 studios',
                            'Hindi, Marathi, Hinglish — auto-detected',
                            'No subscription · credits valid up to 12 months',
                            'Built-in Shopify, Meta, WhatsApp ready',
                        ]}
                        ctaLabel="Get Early Access"
                        onCta={onEarlyAccess}
                    />
                </div>
            </div>
        </section>
    )
}

function SegmentCard({ accent, eyebrow, title, desc, bullets, ctaLabel, onCta }) {
    return (
        <div
            className="rounded-3xl p-7 md:p-9 transition-all relative overflow-hidden glow-card"
            style={{
                background: BRAND.surface,
                border: `1px solid ${accent}30`,
            }}
        >
            <div
                className="absolute top-0 right-0 size-48 rounded-full blur-[80px] -z-0"
                style={{ background: `${accent}10` }}
                aria-hidden="true"
            />
            <div className="relative">
                <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: accent }}>
                    {eyebrow}
                </span>
                <h3 className="text-2xl md:text-3xl font-black mt-3 mb-3 text-[var(--sys-text)]">{title}</h3>
                <p className="text-sm md:text-base mb-6 leading-relaxed" style={{ color: BRAND.textMuted }}>{desc}</p>

                <ul className="space-y-2.5 mb-8">
                    {bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm">
                            <span className="material-symbols-outlined text-base mt-0.5 shrink-0" style={{ color: accent }} aria-hidden="true">check_circle</span>
                            <span className="text-[var(--sys-text)]">{b}</span>
                        </li>
                    ))}
                </ul>

                <button
                    onClick={onCta}
                    className="px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
                    style={{ background: accent, color: 'white' }}
                >
                    {ctaLabel} →
                </button>
            </div>
        </div>
    )
}

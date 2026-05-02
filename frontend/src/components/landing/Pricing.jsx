import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const PACKS = [
    { name: 'Spark',   credits: 50,  bonus: 0,   price: 349,  popular: false, validity: '6 mo' },
    { name: 'Boost',   credits: 150, bonus: 15,  price: 899,  popular: false, validity: '6 mo' },
    { name: 'Power',   credits: 300, bonus: 45,  price: 1699, popular: true,  validity: '6 mo' },
    { name: 'Stellar', credits: 650, bonus: 150, price: 3000, popular: false, validity: '12 mo' },
]

const CREDIT_EXAMPLES = [
    { use: 'Caption + variants',     credits: '0.2' },
    { use: 'Ad creative (image)',    credits: '1' },
    { use: 'Long-form blog post',    credits: '2' },
    { use: '60s video (Veo 3.1)',    credits: '5' },
    { use: '30-day Monthly Strategy', credits: '10' },
]

/**
 * Pricing — credit-pack based. Two columns:
 *   Left: explanation of "what is 1 credit?" — kills the biggest friction
 *   Right: 4 representative packs (out of 10 in production)
 * Plus a Festive Special promo strip + "see all packs" link.
 */
export default function Pricing({ onEarlyAccess }) {
    const ref = useReveal()
    return (
        <section ref={ref} id="pricing" className="reveal py-20 md:py-32 relative overflow-hidden" aria-labelledby="pricing-title">
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-1/3 right-0 size-[500px] rounded-full blur-[160px]" style={{ background: `${BRAND.primary}10` }} />
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="text-center mb-14 max-w-2xl mx-auto">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.primary }}>
                        Pricing
                    </span>
                    <h2 id="pricing-title" className="text-3xl md:text-5xl font-black mt-4 mb-4 leading-tight text-[var(--sys-text)]">
                        Pay only for what you generate.
                    </h2>
                    <p className="text-base md:text-lg" style={{ color: BRAND.textMuted }}>
                        No subscription. No tiers. Credits valid up to 12 months.
                    </p>
                </div>

                <div className="grid lg:grid-cols-12 gap-6">
                    {/* Left — what is 1 credit? */}
                    <div
                        className="lg:col-span-4 rounded-2xl p-6 md:p-7"
                        style={{
                            background: BRAND.surface,
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: BRAND.secondary }}>
                            What is 1 credit?
                        </div>
                        <h3 className="text-xl font-bold mb-5 text-[var(--sys-text)]">Concrete examples</h3>
                        <div className="space-y-2">
                            {CREDIT_EXAMPLES.map((c, i) => (
                                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <span className="text-sm text-[var(--sys-text)]">{c.use}</span>
                                    <span className="text-sm font-mono font-bold" style={{ color: BRAND.secondary }}>
                                        {c.credits}<span className="text-[10px] opacity-60 ml-0.5">cr</span>
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 pt-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <p className="text-xs leading-relaxed" style={{ color: BRAND.textMuted }}>
                                You don't pay for the AI you didn't use. Credits roll over for 6–12 months. No expiry surprises.
                            </p>
                        </div>
                    </div>

                    {/* Right — 4 packs */}
                    <div className="lg:col-span-8">
                        <div className="grid sm:grid-cols-2 gap-3">
                            {PACKS.map((p, i) => (
                                <div
                                    key={p.name}
                                    className="rounded-2xl p-5 relative transition-all glow-card"
                                    style={{
                                        background: BRAND.surface,
                                        border: `1px solid ${p.popular ? BRAND.primary : 'rgba(255,255,255,0.06)'}`,
                                    }}
                                >
                                    {p.popular && (
                                        <span
                                            className="absolute -top-2.5 left-5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                                            style={{ background: BRAND.primary, color: 'white' }}
                                        >
                                            Most picked
                                        </span>
                                    )}
                                    <h4 className="text-xl font-black mb-1 text-[var(--sys-text)]">{p.name}</h4>
                                    <div className="flex items-baseline gap-1.5 mb-3">
                                        <span className="text-3xl font-black" style={{ color: BRAND.primary }}>₹{p.price.toLocaleString('en-IN')}</span>
                                        <span className="text-xs" style={{ color: BRAND.textMuted }}>one-time</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        <span className="text-[10px] px-2 py-1 rounded-full font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: BRAND.textMuted }}>
                                            {p.credits} credits
                                        </span>
                                        {p.bonus > 0 && (
                                            <span className="text-[10px] px-2 py-1 rounded-full font-mono" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary }}>
                                                +{p.bonus} bonus
                                            </span>
                                        )}
                                        <span className="text-[10px] px-2 py-1 rounded-full font-mono" style={{ background: 'rgba(255,255,255,0.04)', color: BRAND.textMuted }}>
                                            valid {p.validity}
                                        </span>
                                    </div>
                                    <button
                                        onClick={onEarlyAccess}
                                        className="w-full py-2.5 rounded-lg font-bold text-xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
                                        style={{
                                            background: p.popular ? BRAND.primary : 'rgba(255,255,255,0.04)',
                                            color: p.popular ? 'white' : BRAND.textMuted,
                                            border: p.popular ? 'none' : '1px solid rgba(255,255,255,0.06)',
                                        }}
                                    >
                                        {p.popular ? 'Get Early Access' : 'Join Waitlist'}
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 text-center">
                            <span className="text-xs" style={{ color: BRAND.textMuted }}>
                                10 packs total — Micro ₹149 to Enterprise ₹17,999.{' '}
                            </span>
                            <button
                                onClick={onEarlyAccess}
                                className="text-xs font-bold cursor-pointer hover:underline"
                                style={{ color: BRAND.secondary }}
                            >
                                See all packs →
                            </button>
                        </div>
                    </div>
                </div>

                {/* Festive Special promo */}
                <div
                    className="mt-6 rounded-2xl p-5 md:p-6 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center gap-4"
                    style={{
                        background: `linear-gradient(135deg, ${BRAND.primary}15 0%, ${BRAND.secondary}10 100%)`,
                        border: `1px solid ${BRAND.primary}40`,
                    }}
                >
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full badge-ping" style={{ background: BRAND.primary, color: 'white' }}>
                                Limited time
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.primary }}>30% off · Festive Special</span>
                        </div>
                        <h4 className="text-xl font-black text-[var(--sys-text)]">Festive Special — 800 + 200 bonus credits at ₹3,000</h4>
                        <p className="text-sm mt-1" style={{ color: BRAND.textMuted }}>Save ₹1,286. Best per-credit value in the lineup.</p>
                    </div>
                    <button
                        onClick={onEarlyAccess}
                        className="px-6 py-3 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
                        style={{ background: BRAND.primary, color: 'white' }}
                    >
                        Claim Promo →
                    </button>
                </div>
            </div>
        </section>
    )
}

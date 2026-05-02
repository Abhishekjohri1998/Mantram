import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const ITEMS = [
    { icon: 'shield_lock',  label: 'India DPDP Act compliant',          sub: 'Consent flows, purpose-bound processing, data residency. In force since 2024.' },
    { icon: 'verified',     label: 'Meta Business compliant',           sub: 'Anti-mimicry delays + rate limits + signed webhooks' },
    { icon: 'shopping_bag', label: 'Shopify App Store ready',           sub: 'Partner-Terms compliant from day one' },
    { icon: 'lock',         label: 'End-to-end SSL/TLS',                sub: 'Encrypted credentials, HMAC verification' },
    { icon: 'do_not_disturb_on', label: 'Your data, your model',        sub: 'Never used to train shared models. Sovereign by design.' },
    { icon: 'sms',          label: 'TRAI DLT-registered SMS',           sub: 'India regulatory-ready out of the box (Twilio)' },
]

/**
 * Compliance / trust strip — quiet but does the heavy lifting for agency
 * objections. Six chips, two rows on desktop. The "Your data, your model"
 * bullet is the single most important line for agency procurement.
 */
export default function Compliance() {
    const ref = useReveal()
    return (
        <section ref={ref} className="reveal py-16 md:py-20" aria-labelledby="compliance-title">
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <h2 id="compliance-title" className="text-center text-xs font-bold uppercase tracking-[0.3em] mb-10" style={{ color: BRAND.textMuted }}>
                    Built for trust
                </h2>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ITEMS.map((item, i) => (
                        <div
                            key={i}
                            className="flex items-start gap-3 p-4 rounded-xl"
                            style={{
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <span
                                className="size-9 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${BRAND.secondary}10`, border: `1px solid ${BRAND.secondary}30` }}
                            >
                                <span className="material-symbols-outlined text-base" style={{ color: BRAND.secondary }} aria-hidden="true">{item.icon}</span>
                            </span>
                            <div>
                                <div className="text-sm font-bold text-[var(--sys-text)] mb-0.5">{item.label}</div>
                                <div className="text-xs" style={{ color: BRAND.textMuted }}>{item.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

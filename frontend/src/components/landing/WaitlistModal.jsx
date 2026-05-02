import { useEffect, useState } from 'react'
import useWaitlist from '../../hooks/useWaitlist'
import { BRAND } from '../../data/studios'

/**
 * Early-access waitlist modal. Two flows in one form:
 *   - 'individual' — email + name + role  (D2C / solopreneur)
 *   - 'enterprise' — adds company, team size, message  (agency demo)
 *
 * The flow is selectable via tabs at the top so visitors who land via the
 * "For Agencies" CTA can still convert without a separate route.
 */
export default function WaitlistModal({ open, initialType = 'individual', onClose }) {
    const [type, setType] = useState(initialType)
    const [form, setForm] = useState({ name: '', email: '', company: '', role: '', phone: '', teamSize: '', message: '' })
    const { submit, submitting, submitted, error, reset } = useWaitlist()

    useEffect(() => {
        if (open) setType(initialType)
    }, [open, initialType])

    useEffect(() => {
        if (!open) {
            // Reset state on close so re-opening starts clean.
            const t = setTimeout(() => { setForm({ name: '', email: '', company: '', role: '', phone: '', teamSize: '', message: '' }); reset() }, 200)
            return () => clearTimeout(t)
        }
    }, [open, reset])

    // Esc to close
    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, onClose])

    if (!open) return null

    const handleSubmit = async (e) => {
        e.preventDefault()
        await submit({ ...form, type, source: 'landing' })
    }

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="waitlist-title"
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="absolute inset-0 backdrop-blur-md" style={{ background: 'rgba(9,9,11,0.85)' }} />

            <div
                className="relative w-full max-w-md rounded-3xl p-6 md:p-8 max-h-[90vh] overflow-y-auto"
                style={{ background: BRAND.surface, border: `1px solid rgba(255,255,255,0.08)`, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close waitlist"
                    className="absolute top-4 right-4 size-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/5 cursor-pointer"
                    style={{ color: BRAND.textMuted }}
                >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">close</span>
                </button>

                {!submitted ? (
                    <>
                        <h2 id="waitlist-title" className="text-2xl md:text-3xl font-black mb-2 text-[var(--sys-text)]">
                            Get Early Access
                        </h2>
                        <p className="text-sm mb-6" style={{ color: BRAND.textMuted }}>
                            Mantram is in private early access. Drop your details and we'll let you in.
                        </p>

                        {/* Flow tabs */}
                        <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            <button
                                type="button"
                                onClick={() => setType('individual')}
                                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                style={{
                                    background: type === 'individual' ? BRAND.primary : 'transparent',
                                    color: type === 'individual' ? 'white' : BRAND.textMuted,
                                }}
                            >
                                Solopreneur / D2C
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('enterprise')}
                                className="flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                style={{
                                    background: type === 'enterprise' ? BRAND.secondary : 'transparent',
                                    color: type === 'enterprise' ? 'white' : BRAND.textMuted,
                                }}
                            >
                                Agency
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <input
                                type="text"
                                required
                                placeholder="Your name"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none placeholder:text-[var(--sys-text-muted)] text-[var(--sys-text)]"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                            />
                            <input
                                type="email"
                                required
                                placeholder="you@brand.com"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none placeholder:text-[var(--sys-text-muted)] text-[var(--sys-text)]"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                            />

                            {type === 'enterprise' ? (
                                <>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Agency / company name"
                                        value={form.company}
                                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none placeholder:text-[var(--sys-text-muted)] text-[var(--sys-text)]"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                    />
                                    <select
                                        value={form.teamSize}
                                        onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none text-[var(--sys-text)]"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                    >
                                        <option value="">Team size</option>
                                        <option value="1-5">1–5</option>
                                        <option value="6-15">6–15</option>
                                        <option value="16-50">16–50</option>
                                        <option value="50+">50+</option>
                                    </select>
                                    <textarea
                                        rows={3}
                                        placeholder="How many brands do you manage? Anything else we should know?"
                                        value={form.message}
                                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none placeholder:text-[var(--sys-text-muted)] text-[var(--sys-text)] resize-none"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                    />
                                </>
                            ) : (
                                <input
                                    type="text"
                                    placeholder="Your role (e.g. founder, marketer)"
                                    value={form.role}
                                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none placeholder:text-[var(--sys-text-muted)] text-[var(--sys-text)]"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                />
                            )}

                            {error && (
                                <p className="text-xs" style={{ color: '#ef4444' }} role="alert">{error}</p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all transform hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                style={{ background: type === 'enterprise' ? BRAND.secondary : BRAND.primary, color: 'white' }}
                            >
                                {submitting ? 'Submitting…' : (type === 'enterprise' ? 'Request Agency Demo' : 'Get Early Access')}
                            </button>
                        </form>

                        <p className="text-xs mt-4 text-center" style={{ color: BRAND.textMuted }}>
                            We'll never share your email. Limited spots available.
                        </p>
                    </>
                ) : (
                    <div className="text-center py-6">
                        <div
                            className="size-14 rounded-full mx-auto mb-5 flex items-center justify-center"
                            style={{ background: `${BRAND.secondary}15`, border: `2px solid ${BRAND.secondary}` }}
                        >
                            <span className="material-symbols-outlined text-3xl" style={{ color: BRAND.secondary }} aria-hidden="true">check</span>
                        </div>
                        <h2 className="text-2xl font-black mb-2 text-[var(--sys-text)]">You're on the list.</h2>
                        <p className="text-sm mb-6" style={{ color: BRAND.textMuted }}>
                            We'll review and email you with access details soon. Keep an eye on <strong style={{ color: BRAND.primary }}>{form.email}</strong>.
                        </p>
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                            style={{ background: 'rgba(255,255,255,0.05)', color: BRAND.textMuted, border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

/**
 * ScheduleDrawer — Slide-in right panel to schedule a post to any platform.
 *
 * Props:
 *  open          boolean
 *  onClose       () => void
 *  onScheduled   (scheduledPost) => void   — called after successful schedule
 *  prefill       {
 *    caption, imageUrl, platform, scheduledAt (ISO),
 *    sourceType, sourceTitle, strategyId, calendarItemId
 *  }
 */
import { useState, useEffect, useRef } from 'react'
import { social, brandCalendar } from '../services/api'
import { useBrand } from '../context/BrandContext'

const PLATFORM_META = {
    instagram: { label: 'Instagram', icon: 'photo_camera',  color: '#E1306C' },
    facebook:  { label: 'Facebook',  icon: 'thumb_up',      color: '#1877F2' },
    linkedin:  { label: 'LinkedIn',  icon: 'work',          color: '#0A66C2' },
    twitter:   { label: 'Twitter / X', icon: 'alternate_email', color: '#1DA1F2' },
    tiktok:    { label: 'TikTok',    icon: 'music_note',    color: '#010101' },
    gbp:       { label: 'Google Business', icon: 'location_on', color: '#4285F4' },
}

function pad2(n) { return String(n).padStart(2, '0') }

function toLocalDatetimeValue(isoOrNull) {
    const d = isoOrNull ? new Date(isoOrNull) : new Date(Date.now() + 3 * 60 * 60 * 1000)
    // datetime-local format: YYYY-MM-DDTHH:mm
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export default function ScheduleDrawer({ open, onClose, onScheduled, prefill = {} }) {
    const { activeBrand } = useBrand()
    const [accounts,   setAccounts]   = useState([])
    const [selAccts,   setSelAccts]   = useState([])
    const [caption,    setCaption]    = useState('')
    const [imageUrl,   setImageUrl]   = useState('')
    const [schedAt,    setSchedAt]    = useState(toLocalDatetimeValue(null))
    const [loading,    setLoading]    = useState(false)
    const [error,      setError]      = useState('')
    const [success,    setSuccess]    = useState(false)
    const drawerRef = useRef(null)

    // Load connected accounts
    useEffect(() => {
        social.accounts().then(d => setAccounts(d.data || [])).catch(() => {})
    }, [])

    // Reset whenever prefill or open changes
    useEffect(() => {
        if (!open) { setSuccess(false); setError(''); return }
        setCaption(prefill.caption || '')
        setImageUrl(prefill.imageUrl || '')
        setSchedAt(toLocalDatetimeValue(prefill.scheduledAt || null))
        // Pre-select accounts that match the prefilled platform
        if (prefill.platform && accounts.length) {
            const matched = accounts.filter(a => a.platform === prefill.platform).map(a => a._id)
            setSelAccts(matched.length ? matched : [])
        } else {
            setSelAccts([])
        }
        setError('')
        setSuccess(false)
    }, [open, prefill.caption, prefill.imageUrl, prefill.platform, prefill.scheduledAt, accounts.length]) // eslint-disable-line

    // Trap keyboard close
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape' && open) onClose() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [open, onClose])

    const toggleAcct = (id) => setSelAccts(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )

    const selectAllAccounts = () => {
        const allIds = accounts.map(a => a._id)
        setSelAccts(prev => prev.length === allIds.length ? [] : allIds)
    }

    const selectAllForPlatform = (platform) => {
        const platformIds = accounts.filter(a => a.platform === platform).map(a => a._id)
        const allSelected = platformIds.every(id => selAccts.includes(id))
        if (allSelected) {
            setSelAccts(prev => prev.filter(id => !platformIds.includes(id)))
        } else {
            setSelAccts(prev => [...new Set([...prev, ...platformIds])])
        }
    }

    const handleSchedule = async () => {
        if (!selAccts.length) { setError('Select at least one account'); return }
        if (!caption.trim())  { setError('Caption is required'); return }
        const scheduledFor = new Date(schedAt).toISOString()
        if (new Date(scheduledFor) <= new Date()) { setError('Scheduled time must be in the future'); return }

        setLoading(true); setError('')
        try {
            const payload = {
                accountIds:  selAccts,
                text:        caption,
                imageUrl:    imageUrl || undefined,
                scheduledFor,
                brandId:     activeBrand?._id,
                sourceType:  prefill.sourceType  || 'manual',
                sourceTitle: prefill.sourceTitle || '',
                calendarItemId: prefill.calendarItemId || undefined,
                strategyId:     prefill.strategyId     || undefined,
            }
            const res = await social.schedule(payload)
            setSuccess(true)
            if (onScheduled) onScheduled(res.scheduled || [])
            setTimeout(() => { setSuccess(false); onClose() }, 2500)
        } catch (err) {
            setError(err.message || 'Scheduling failed')
        } finally {
            setLoading(false)
        }
    }

    // ── Platform grouping for account list ───────────────────────────────────
    const grouped = {}
    for (const acct of accounts) {
        if (!grouped[acct.platform]) grouped[acct.platform] = []
        grouped[acct.platform].push(acct)
    }

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            />

            {/* Drawer */}
            <aside
                ref={drawerRef}
                className={`fixed top-0 right-0 h-full w-full max-w-md bg-[var(--sys-bg)] border-l border-[var(--sys-border)] z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sys-border)]">
                    <div>
                        <h2 className="text-[15px] font-bold text-[var(--sys-text)] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">calendar_add_on</span>
                            Schedule Post
                        </h2>
                        <p className="text-xs text-[var(--sys-text-muted)] mt-0.5">Auto-publish at your chosen time</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] cursor-pointer transition-colors">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* Date + Time */}
                    <div>
                        <label className="block text-xs font-semibold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2">
                            Publish Date &amp; Time
                        </label>
                        <input
                            type="datetime-local"
                            value={schedAt}
                            onChange={e => setSchedAt(e.target.value)}
                            className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-3 text-sm text-[var(--sys-text)] focus:outline-none focus:border-primary/40 transition-colors"
                        />
                    </div>

                    {/* Accounts */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-xs font-semibold text-[var(--sys-text-muted)] uppercase tracking-wider">
                                Publish To
                            </label>
                            {accounts.length > 0 && (
                                <button
                                    onClick={selectAllAccounts}
                                    className="text-[11px] font-bold text-primary hover:text-primary/80 cursor-pointer transition-colors flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-xs">
                                        {selAccts.length === accounts.length ? 'deselect' : 'select_all'}
                                    </span>
                                    {selAccts.length === accounts.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>
                        {accounts.length === 0 ? (
                            <div className="rounded-xl border border-[var(--sys-border)] bg-[var(--sys-surface)] p-4 text-xs text-[var(--sys-text-muted)] text-center">
                                <span className="material-symbols-outlined block text-2xl mb-1 text-[var(--sys-text-muted)]">link_off</span>
                                No social accounts connected.<br />
                                <a href="/integrations" className="text-primary underline mt-1 inline-block">Connect accounts →</a>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {Object.entries(grouped).map(([platform, accts]) => {
                                    const meta = PLATFORM_META[platform] || { label: platform, icon: 'share', color: '#888' }
                                    const platformAllSelected = accts.every(a => selAccts.includes(a._id))
                                    return (
                                        <div key={platform}>
                                            {/* Platform group header */}
                                            <button
                                                onClick={() => selectAllForPlatform(platform)}
                                                className="w-full flex items-center gap-2 mb-1.5 px-1 text-left cursor-pointer group"
                                            >
                                                <span className="material-symbols-outlined text-sm" style={{ color: meta.color }}>{meta.icon}</span>
                                                <span className="text-[11px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider flex-1">{meta.label}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                                                    platformAllSelected ? 'bg-primary/15 text-primary' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] group-hover:text-primary'
                                                }`}>
                                                    {platformAllSelected ? '✓ All' : `Select ${accts.length > 1 ? 'all' : ''}`}
                                                </span>
                                            </button>
                                            {/* Accounts for this platform */}
                                            <div className="space-y-1.5">
                                                {accts.map(acct => {
                                                    const isSelected = selAccts.includes(acct._id)
                                                    return (
                                                        <button
                                                            key={acct._id}
                                                            onClick={() => toggleAcct(acct._id)}
                                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left ${
                                                                isSelected
                                                                    ? 'border-primary/40 bg-primary/5 text-[var(--sys-text)]'
                                                                    : 'border-[var(--sys-border)] hover:border-primary/20 text-[var(--sys-text-muted)]'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-lg" style={{ color: isSelected ? meta.color : '' }}>{meta.icon}</span>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-semibold">{meta.label}</p>
                                                                <p className="text-[10px] text-[var(--sys-text-muted)] truncate">{acct.accountName}</p>
                                                            </div>
                                                            <span className={`material-symbols-outlined text-sm ${isSelected ? 'text-primary' : 'text-[var(--sys-border)]'}`}>
                                                                {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                                                            </span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Caption */}
                    <div>
                        <label className="block text-xs font-semibold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2">Caption</label>
                        <textarea
                            rows={5}
                            value={caption}
                            onChange={e => setCaption(e.target.value)}
                            placeholder="Write your post caption…"
                            className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-3 text-sm text-[var(--sys-text)] resize-none focus:outline-none focus:border-primary/40 transition-colors"
                        />
                        <p className="text-[10px] text-[var(--sys-text-muted)] text-right mt-1">{caption.length} chars</p>
                    </div>

                    {/* Image preview */}
                    {imageUrl && (
                        <div>
                            <label className="block text-xs font-semibold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2">Media Preview</label>
                            <div className="rounded-xl overflow-hidden border border-[var(--sys-border)]">
                                <img src={imageUrl} alt="Scheduled media" className="w-full max-h-52 object-cover" onError={e => e.target.style.display = 'none'} />
                            </div>
                        </div>
                    )}

                    {/* Source tag */}
                    {prefill.sourceTitle && (
                        <div className="flex items-center gap-2 text-xs text-[var(--sys-text-muted)]">
                            <span className="material-symbols-outlined text-sm">link</span>
                            From: <span className="text-primary font-medium">{prefill.sourceTitle}</span>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            <span className="material-symbols-outlined text-sm">error_outline</span>
                            {error}
                        </div>
                    )}

                    {/* Success */}
                    {success && (
                        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            Scheduled! You&apos;ll get an email reminder 1 hour before.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-[var(--sys-border)] flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-xl border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-sm font-semibold hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSchedule}
                        disabled={loading || success}
                        className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all cursor-pointer disabled:opacity-40"
                    >
                        {loading ? (
                            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        ) : (
                            <span className="material-symbols-outlined text-base">schedule_send</span>
                        )}
                        {loading ? 'Scheduling…' : 'Confirm Schedule'}
                    </button>
                </div>
            </aside>
        </>
    )
}

import { useState, useEffect } from 'react'
import { social } from '../services/api'

const PLATFORM_META = {
    instagram: { label: 'Instagram', icon: '📸', color: '#E1306C', accent: 'from-pink-500/20 to-purple-500/20', border: 'border-pink-500/30' },
    facebook: { label: 'Facebook', icon: '👥', color: '#1877F2', accent: 'from-blue-500/20 to-indigo-500/20', border: 'border-blue-500/30' },
    twitter: { label: 'Twitter / X', icon: '𝕏', color: '#000000', accent: 'from-slate-500/20 to-slate-600/20', border: 'border-slate-400/30' },
    linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2', accent: 'from-sky-500/20 to-blue-500/20', border: 'border-sky-500/30' },
}

/**
 * PublishModal — Smart publish + schedule flow
 */
export default function PublishModal({ isOpen, onClose, defaultText = '', defaultImage = null, defaultImages = null, brandId = null }) {
    const [accounts, setAccounts] = useState([])
    const [selectedAccounts, setSelectedAccounts] = useState([])
    const [loading, setLoading] = useState(false)
    const [imageUrl, setImageUrl] = useState(defaultImage || '')
    const [imageUrls, setImageUrls] = useState(defaultImages || [])
    const [caption, setCaption] = useState(defaultText || '')
    const [platformCaptions, setPlatformCaptions] = useState({})
    const [isAdapted, setIsAdapted] = useState(false)
    const [adapting, setAdapting] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [results, setResults] = useState(null)
    const [activePlatform, setActivePlatform] = useState(null)
    const [generatingCaption, setGeneratingCaption] = useState(false)
    const [adaptError, setAdaptError] = useState('')

    // Scheduling state
    const [scheduleMode, setScheduleMode] = useState(false)
    const [scheduledFor, setScheduledFor] = useState('')
    const [scheduleResults, setScheduleResults] = useState(null)

    useEffect(() => {
        if (isOpen) {
            setImageUrl(defaultImage || (defaultImages?.[0] || ''))
            setImageUrls(defaultImages || [])
            setCaption(defaultText || '')
            setPlatformCaptions({})
            setIsAdapted(false)
            setResults(null)
            setSelectedAccounts([])
            setGeneratingCaption(false)
            setScheduleMode(false)
            setScheduledFor('')
            setScheduleResults(null)
            setAdaptError('')
            loadAccounts()
        }
    }, [isOpen, defaultImage, defaultImages, defaultText])

    const loadAccounts = async () => {
        setLoading(true)
        try {
            const data = await social.accounts()
            setAccounts(data.data || data.accounts || [])
        } catch (err) {
            console.error('Load accounts error:', err)
        } finally {
            setLoading(false)
        }
    }

    const toggleAccount = (id) => {
        setSelectedAccounts(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    const getSelectedPlatforms = () => {
        const selected = accounts.filter(a => selectedAccounts.includes(a._id))
        return [...new Set(selected.map(a => a.platform))]
    }

    // Adapt the single caption into platform-specific versions (1 AI call)
    // Adapt caption into platform-specific versions (1 AI call)
    // Backend normalizes keys to lowercase canonical names (instagram, facebook, linkedin, twitter)
    const handleAdaptForPlatforms = async () => {
        const platforms = getSelectedPlatforms()
        if (platforms.length === 0) return

        setAdapting(true)
        setAdaptError('')
        try {
            const data = await social.generateCaption({
                imageUrl: imageUrl || undefined,
                platforms,
                brandId: brandId || undefined,
                userBrief: caption || undefined,
            })

            if (data.success && data.captions) {
                // Backend already normalizes keys to lowercase — direct match
                const adapted = {}
                platforms.forEach(p => {
                    if (data.captions[p]) {
                        adapted[p] = data.captions[p]
                    }
                })

                // If no adapted captions matched, fall back to using any available caption
                if (Object.keys(adapted).length === 0 && Object.keys(data.captions).length > 0) {
                    // Fallback: assign whatever captions exist to matching platforms
                    const available = Object.values(data.captions)
                    platforms.forEach((p, i) => {
                        adapted[p] = available[i % available.length]
                    })
                }

                if (Object.keys(adapted).length === 0) {
                    setAdaptError('Failed to generate adapted captions. Please try again.')
                    return
                }

                setPlatformCaptions(adapted)
                setIsAdapted(true)
                setActivePlatform(platforms[0])
            } else {
                setAdaptError('Failed to generate adapted captions. Please try again.')
            }
        } catch (err) {
            console.error('Adapt error:', err)
            setAdaptError(err.message || 'Failed to adapt captions. Check your connection.')
        } finally {
            setAdapting(false)
        }
    }

    const getCaptionForPlatform = (platform) => {
        if (isAdapted && platformCaptions[platform]) return platformCaptions[platform]
        return caption
    }

    // Check if we have any caption content (either single or adapted)
    const hasCaption = () => {
        if (isAdapted && Object.values(platformCaptions).some(c => c?.trim())) return true
        return !!caption.trim()
    }

    const handlePublish = async () => {
        if (selectedAccounts.length === 0) return alert('Select at least one account')
        const platforms = getSelectedPlatforms()
        if (!hasCaption() && platforms.length > 0) return alert('Please write a caption before publishing')

        setPublishing(true)
        try {
            const captions = {}
            platforms.forEach(p => { captions[p] = getCaptionForPlatform(p) })
            const fallbackText = caption.trim() || Object.values(platformCaptions).find(c => c?.trim()) || ''

            const res = await social.publish({
                accountIds: selectedAccounts,
                text: fallbackText,
                captions,
                imageUrl: isCarouselMode ? undefined : imageUrl,
                imageUrls: isCarouselMode ? imageUrls : undefined,
                brandId: brandId || undefined,
            })
            setResults(res.results)
        } catch (err) {
            alert(err.message || 'Failed to publish')
        } finally {
            setPublishing(false)
        }
    }

    const handleSchedule = async () => {
        if (selectedAccounts.length === 0) return alert('Select at least one account')
        if (!scheduledFor) return alert('Please select a date and time')

        const platforms = getSelectedPlatforms()
        if (!hasCaption() && platforms.length > 0) return alert('Please write a caption before scheduling')

        const scheduleDate = new Date(scheduledFor)
        if (scheduleDate <= new Date()) return alert('Please select a future date and time')

        setPublishing(true)
        try {
            const captions = {}
            platforms.forEach(p => { captions[p] = getCaptionForPlatform(p) })
            const fallbackText = caption.trim() || Object.values(platformCaptions).find(c => c?.trim()) || ''

            const res = await social.schedule({
                accountIds: selectedAccounts,
                text: fallbackText,
                captions,
                imageUrl: isCarouselMode ? imageUrls[0] : imageUrl,
                imageUrls: isCarouselMode ? imageUrls : undefined,
                brandId: brandId || undefined,
                scheduledFor,
            })
            setScheduleResults(res.scheduled)
        } catch (err) {
            alert(err.message || 'Failed to schedule')
        } finally {
            setPublishing(false)
        }
    }

    if (!isOpen) return null

    const selectedPlatforms = getSelectedPlatforms()
    const isCarouselMode = Array.isArray(imageUrls) && imageUrls.length > 1

    const getMinDateTime = () => {
        const now = new Date()
        now.setMinutes(now.getMinutes() + 5)
        return now.toISOString().slice(0, 16)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
            <div className="relative bg-gradient-to-b from-[#0e1225] to-[#0a0d1a] border border-white/[0.08] rounded-3xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-[0_24px_80px_rgba(0,0,0,0.6)]" style={{ animation: 'fadeInUp 0.3s ease-out' }}>

                {/* Header — Gradient accent */}
                <div className="relative p-6 border-b border-white/[0.06]">
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary/60 to-transparent rounded-t-3xl" />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${scheduleMode ? 'bg-violet-500/15' : 'bg-primary/15'}`}>
                                <span className={`material-symbols-outlined text-xl ${scheduleMode ? 'text-violet-400' : 'text-primary'}`}>
                                    {scheduleMode ? 'schedule_send' : 'send'}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">
                                    {scheduleMode ? 'Schedule Post' : 'Publish to Socials'}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    {selectedAccounts.length > 0 ? `${selectedAccounts.length} account${selectedAccounts.length > 1 ? 's' : ''} selected` : 'Select accounts below'}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-slate-500 hover:text-white transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-5">

                    {/* ═══ Published Results ═══ */}
                    {results ? (
                        <div className="space-y-4">
                            <div className="text-center py-8">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <span className="material-symbols-outlined text-4xl text-emerald-400">check_circle</span>
                                </div>
                                <h4 className="text-2xl font-bold text-white">Published! 🎉</h4>
                                <p className="text-slate-400 text-sm mt-1">Your content is now live.</p>
                            </div>
                            <div className="space-y-2">
                                {results.map((r, i) => (
                                    <div key={i} className={`p-4 rounded-xl border flex items-center justify-between ${r.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-rose-500/5 border-rose-500/15'}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xl">{PLATFORM_META[r.platform]?.icon || '📱'}</span>
                                            <div>
                                                <p className="font-semibold text-white text-sm">{r.accountName}</p>
                                                <p className="text-[10px] text-slate-500 uppercase">{r.platform}</p>
                                            </div>
                                        </div>
                                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${r.status === 'success' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                            {r.status === 'success' ? '✓ Live' : '✗ Failed'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        /* ═══ Schedule Results ═══ */
                    ) : scheduleResults ? (
                        <div className="space-y-4">
                            <div className="text-center py-8">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 flex items-center justify-center mx-auto mb-4 border border-violet-500/20">
                                    <span className="material-symbols-outlined text-4xl text-violet-400">schedule_send</span>
                                </div>
                                <h4 className="text-2xl font-bold text-white">Scheduled! ⏰</h4>
                                <p className="text-slate-400 text-sm mt-1">
                                    Posting on <span className="text-violet-300 font-medium">{new Date(scheduledFor).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </p>
                            </div>
                            <div className="space-y-2">
                                {scheduleResults.map((s, i) => (
                                    <div key={i} className="p-4 rounded-xl border bg-violet-500/5 border-violet-500/15 flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xl">{PLATFORM_META[s.platform]?.icon || '📱'}</span>
                                            <div>
                                                <p className="font-semibold text-white text-sm">{s.accountName}</p>
                                                <p className="text-[10px] text-slate-500 uppercase">{s.platform}</p>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-500/15 text-violet-400">
                                            ⏰ Queued
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ── Image Preview ── */}
                            {isCarouselMode ? (
                                <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-black/30 p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-violet-400 text-sm">view_carousel</span>
                                        <span className="text-xs font-bold text-violet-300">Carousel Post</span>
                                        <span className="text-[10px] text-slate-500 bg-white/[0.06] px-2 py-0.5 rounded-full">{imageUrls.length} images</span>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                        {imageUrls.map((url, i) => (
                                            <img key={i} src={url} alt={`Slide ${i+1}`} className="h-28 w-28 object-cover rounded-xl flex-shrink-0 border border-white/[0.06]" loading="lazy" />
                                        ))}
                                    </div>
                                </div>
                            ) : imageUrl && (
                                <div className="rounded-2xl overflow-hidden border border-white/[0.06] bg-black/30">
                                    <img src={imageUrl} alt="Creative" className="w-full max-h-44 object-contain" loading="lazy" onError={e => e.target.style.display = 'none'} />
                                </div>
                            )}

                            {/* ── Account Selection ── */}
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-widest flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-primary">group</span>
                                    Select Accounts
                                </h4>
                                {loading ? (
                                    <div className="py-8 text-center"><span className="material-symbols-outlined animate-spin text-primary">progress_activity</span></div>
                                ) : accounts.length === 0 ? (
                                    <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
                                        <span className="material-symbols-outlined text-3xl text-slate-600 mb-2">link_off</span>
                                        <p className="text-slate-400 text-sm mb-2">No social accounts connected.</p>
                                        <a href="/integrations" className="text-primary text-sm hover:underline font-medium">Connect accounts →</a>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {accounts.map(acc => {
                                            const isSelected = selectedAccounts.includes(acc._id)
                                            const meta = PLATFORM_META[acc.platform] || {}
                                            return (
                                                <button key={acc._id} onClick={() => toggleAccount(acc._id)}
                                                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer group ${isSelected
                                                        ? `bg-gradient-to-r ${meta.accent || 'bg-primary/10'} ${meta.border || 'border-primary'} shadow-lg shadow-black/10`
                                                        : 'bg-white/[0.03] border-white/[0.06] hover:border-white/15 hover:bg-white/[0.05]'}`}
                                                    style={isSelected ? { boxShadow: `0 0 20px ${meta.color}10` } : {}}>
                                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-white text-[#0c0f1a] scale-110' : 'border border-slate-600 group-hover:border-slate-400'}`}>
                                                        {isSelected && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                                    </div>
                                                    {acc.avatar ? <img src={acc.avatar} className="w-9 h-9 rounded-full flex-shrink-0 ring-2 ring-white/10" alt="" /> : <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-lg">{meta.icon || '📱'}</div>}
                                                    <div className="truncate pr-2">
                                                        <p className="text-sm font-bold text-white truncate">{acc.accountName}</p>
                                                        <p className="text-[10px] text-slate-500 uppercase font-medium">{meta.label || acc.platform}</p>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── Caption ── */}
                            {!isAdapted && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary">edit_note</span>
                                            Caption
                                        </h4>
                                        {selectedPlatforms.length > 1 && (
                                            <button
                                                onClick={handleAdaptForPlatforms}
                                                disabled={adapting || !caption.trim()}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 hover:from-violet-500/20 hover:to-fuchsia-500/20 text-violet-300 border border-violet-500/20 hover:border-violet-500/40">
                                                {adapting ? (
                                                    <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Adapting...</>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-xs">auto_awesome</span> Adapt per platform</>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        value={caption}
                                        onChange={e => setCaption(e.target.value)}
                                        className="w-full h-28 p-4 bg-white/[0.03] border border-white/[0.08] text-white text-sm rounded-xl focus:outline-none focus:border-primary/40 focus:bg-white/[0.04] custom-scrollbar resize-none transition-all placeholder-slate-600"
                                        placeholder="Write your caption here..."
                                    />
                                    {/* Adapt error */}
                                    {adaptError && (
                                        <div className="mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                                            <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5">warning</span>
                                            <p className="text-xs text-amber-300">{adaptError}</p>
                                        </div>
                                    )}
                                    {/* AI Caption generate */}
                                    {imageUrl && caption.trim().length < 20 && selectedAccounts.length > 0 && (
                                        <button
                                            onClick={async () => {
                                                const platforms = getSelectedPlatforms()
                                                if (platforms.length === 0) return
                                                setGeneratingCaption(true)
                                                try {
                                                    const data = await social.generateCaption({
                                                        imageUrl,
                                                        platforms: [platforms[0]],
                                                        brandId: brandId || undefined,
                                                    })
                                                    if (data.success && data.captions) {
                                                        const firstCaption = Object.values(data.captions)[0]
                                                        if (firstCaption) setCaption(firstCaption)
                                                    }
                                                } catch (err) {
                                                    console.error('AI caption error:', err)
                                                } finally {
                                                    setGeneratingCaption(false)
                                                }
                                            }}
                                            disabled={generatingCaption}
                                            className="mt-2 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 bg-gradient-to-r from-violet-500/10 to-primary/10 hover:from-violet-500/20 hover:to-primary/20 text-violet-300 border border-violet-500/20 hover:border-violet-500/40 w-full justify-center"
                                        >
                                            {generatingCaption ? (
                                                <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Generating caption...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-xs">auto_awesome</span> ✨ Generate AI Caption from Image</>
                                            )}
                                        </button>
                                    )}
                                    <p className="text-[10px] text-slate-600 mt-1.5">
                                        {selectedPlatforms.length > 1
                                            ? `Same caption → ${selectedPlatforms.map(p => PLATFORM_META[p]?.label || p).join(', ')}`
                                            : selectedPlatforms.length === 1
                                                ? `Posting to ${PLATFORM_META[selectedPlatforms[0]]?.label || selectedPlatforms[0]}`
                                                : 'Select accounts to publish'
                                        }
                                    </p>
                                </div>
                            )}

                            {/* ── Per-Platform Captions (after adapt) ── */}
                            {isAdapted && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-emerald-400">auto_awesome</span>
                                            Adapted Captions
                                        </h4>
                                        <button
                                            onClick={() => { setIsAdapted(false); setPlatformCaptions({}) }}
                                            className="text-[11px] text-slate-500 hover:text-white cursor-pointer transition-colors flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">arrow_back</span>
                                            Single caption
                                        </button>
                                    </div>

                                    {/* Platform Tabs */}
                                    {selectedPlatforms.length > 1 && (
                                        <div className="flex gap-2 mb-3">
                                            {selectedPlatforms.map(platform => {
                                                const meta = PLATFORM_META[platform] || {}
                                                const isActive = activePlatform === platform
                                                return (
                                                    <button key={platform} onClick={() => setActivePlatform(platform)}
                                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive
                                                            ? `bg-gradient-to-r ${meta.accent || 'bg-primary/20'} text-white ${meta.border || 'border-primary/40'} border shadow-md`
                                                            : 'bg-white/[0.03] text-slate-400 hover:text-white border border-transparent hover:border-white/10'}`}>
                                                        <span className="text-sm">{meta.icon || '📱'}</span>
                                                        {meta.label || platform}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Caption Editor */}
                                    {selectedPlatforms.map(platform => {
                                        if (selectedPlatforms.length > 1 && activePlatform !== platform) return null
                                        const meta = PLATFORM_META[platform] || {}
                                        return (
                                            <div key={platform} className={`rounded-xl border p-4 ${meta.border || 'border-white/10'} bg-gradient-to-br ${meta.accent || 'from-white/5 to-white/5'}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{meta.icon || '📱'}</span>
                                                        <span className="text-sm font-bold text-white">{meta.label || platform}</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-500 font-mono">{(platformCaptions[platform] || '').length} chars</span>
                                                </div>
                                                <textarea
                                                    value={platformCaptions[platform] || ''}
                                                    onChange={e => setPlatformCaptions(prev => ({ ...prev, [platform]: e.target.value }))}
                                                    className="w-full h-28 p-3 bg-black/30 border border-white/[0.06] text-white text-sm rounded-lg focus:outline-none focus:border-white/20 custom-scrollbar resize-none"
                                                    placeholder={`${meta.label || platform} caption...`}
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* ── Media URL fallback ── */}
                            {!imageUrl && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">Media URL</h4>
                                    <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                                        placeholder="Paste image URL (required for Instagram)"
                                        className="w-full p-3.5 bg-white/[0.03] border border-white/[0.08] text-white text-sm rounded-xl focus:outline-none focus:border-primary/40 transition-all placeholder-slate-600" />
                                </div>
                            )}

                            {/* ── Schedule Section — Premium ── */}
                            <div className={`rounded-2xl border overflow-hidden transition-all duration-300 ${scheduleMode ? 'bg-gradient-to-br from-violet-500/[0.06] via-fuchsia-500/[0.03] to-violet-600/[0.06] border-violet-500/25 shadow-lg shadow-violet-500/5' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                                {/* Toggle Header */}
                                <div className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${scheduleMode ? 'bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 shadow-inner' : 'bg-white/[0.05]'}`}>
                                            <span className={`material-symbols-outlined text-xl transition-colors ${scheduleMode ? 'text-violet-300' : 'text-slate-500'}`}>schedule_send</span>
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-white">Schedule for later</span>
                                            <p className="text-[10px] text-slate-500">Queue your post for the perfect time</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setScheduleMode(!scheduleMode); if (scheduleMode) setScheduledFor('') }}
                                        className={`relative w-12 h-7 rounded-full transition-all duration-300 cursor-pointer ${scheduleMode ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40' : 'bg-white/10 hover:bg-white/15'}`}>
                                        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${scheduleMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {/* Schedule Picker — Expanded */}
                                {scheduleMode && (
                                    <div className="px-4 pb-4 space-y-3">
                                        {/* Divider */}
                                        <div className="h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />

                                        {/* Quick Select Times */}
                                        <div>
                                            <p className="text-[10px] text-violet-400/70 uppercase tracking-widest font-bold mb-2">Quick Schedule</p>
                                            <div className="grid grid-cols-5 gap-1.5">
                                                {[
                                                    { label: 'In 1h', hours: 1 },
                                                    { label: 'In 3h', hours: 3 },
                                                    { label: 'In 6h', hours: 6 },
                                                    { label: 'Tomorrow\n9 AM', hours: null, preset: 'tomorrow9' },
                                                    { label: 'Tomorrow\n6 PM', hours: null, preset: 'tomorrow18' },
                                                ].map(opt => {
                                                    const getDate = () => {
                                                        if (opt.hours) {
                                                            const d = new Date(); d.setHours(d.getHours() + opt.hours); return d
                                                        }
                                                        const d = new Date()
                                                        d.setDate(d.getDate() + 1)
                                                        d.setHours(opt.preset === 'tomorrow9' ? 9 : 18, 0, 0, 0)
                                                        return d
                                                    }
                                                    const optDate = getDate()
                                                    const optVal = optDate.toISOString().slice(0, 16)
                                                    const isActive = scheduledFor === optVal
                                                    return (
                                                        <button key={opt.label} onClick={() => setScheduledFor(optVal)}
                                                            className={`py-2.5 px-1 rounded-xl text-center transition-all cursor-pointer text-[10px] font-bold leading-tight whitespace-pre-line ${isActive
                                                                ? 'bg-gradient-to-b from-violet-500/30 to-fuchsia-500/20 text-violet-200 border border-violet-400/40 shadow-md shadow-violet-500/10'
                                                                : 'bg-white/[0.04] text-slate-400 border border-transparent hover:bg-white/[0.08] hover:text-white'
                                                                }`}>
                                                            {opt.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* Custom DateTime */}
                                        <div>
                                            <p className="text-[10px] text-violet-400/70 uppercase tracking-widest font-bold mb-2">Or pick exact time</p>
                                            <input
                                                type="datetime-local"
                                                value={scheduledFor}
                                                onChange={e => setScheduledFor(e.target.value)}
                                                min={getMinDateTime()}
                                                className="w-full p-3 bg-black/20 border border-violet-500/15 text-white text-sm rounded-xl focus:outline-none focus:border-violet-500/40 [color-scheme:dark] transition-all"
                                            />
                                        </div>

                                        {/* Visual Confirmation */}
                                        {scheduledFor && (
                                            <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-500/10 via-fuchsia-500/5 to-violet-600/10 border border-violet-500/15 p-4">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                                <div className="flex items-center gap-3 relative">
                                                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                                                        <span className="material-symbols-outlined text-violet-300 text-xl">event_available</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-violet-400/70 uppercase tracking-wider font-bold">Posting on</p>
                                                        <p className="text-sm text-white font-bold">
                                                            {new Date(scheduledFor).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                        </p>
                                                        <p className="text-xs text-violet-300">
                                                            {new Date(scheduledFor).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/[0.06] bg-black/20 rounded-b-3xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer">
                        {results || scheduleResults ? 'Done' : 'Cancel'}
                    </button>
                    {!results && !scheduleResults && (
                        scheduleMode ? (
                            <button
                                onClick={handleSchedule}
                                disabled={publishing}
                                className="px-7 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 disabled:opacity-40 transition-all cursor-pointer bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-xl shadow-violet-500/25 hover:shadow-violet-500/40">
                                {publishing ? (
                                    <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span> Scheduling...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-lg">schedule_send</span> Schedule{selectedPlatforms.length > 0 ? ` to ${selectedPlatforms.length}` : ''}</>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handlePublish}
                                disabled={publishing}
                                className="px-7 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 disabled:opacity-40 transition-all cursor-pointer bg-gradient-to-r from-primary to-primary-light hover:shadow-primary/40 text-white shadow-xl shadow-primary/25">
                                {publishing ? (
                                    <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span> Publishing...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-lg">send</span> Publish{selectedPlatforms.length > 0 ? ` to ${selectedPlatforms.length}` : ''}</>
                                )}
                            </button>
                        )
                    )}
                </div>
            </div>

            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(16px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>
        </div>
    )
}

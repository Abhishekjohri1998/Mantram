import { useState, useEffect } from 'react'
import { social } from '../services/api'

const PLATFORM_META = {
    instagram: { label: 'Instagram', icon: '📸', color: '#E1306C', accent: 'from-[#FF4D00]/20 to-[#FF7A00]/20', border: 'border-[#FF4D00]/30' },
    facebook: { label: 'Facebook', icon: '👥', color: '#1877F2', accent: 'from-[#FF4D00]/20 to-[#FF7A00]/20', border: 'border-[#FF4D00]/30' },
    twitter: { label: 'Twitter / X', icon: '𝕏', color: '#000000', accent: 'from-slate-500/20 to-slate-600/20', border: 'border-[var(--sys-border)]' },
    linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2', accent: 'from-sky-500/20 to-[#FF7A00]/20', border: 'border-sky-500/30' },
}

/**
 * PublishModal — Smart publish + schedule flow
 */
export default function PublishModal({ isOpen, onClose, defaultText = '', defaultImage = null, defaultImages = null, defaultVideo = null, brandId = null }) {
    const [accounts, setAccounts] = useState([])
    const [selectedAccounts, setSelectedAccounts] = useState([])
    const [loading, setLoading] = useState(false)
    const [imageUrl, setImageUrl] = useState(defaultImage || '')
    const [imageUrls, setImageUrls] = useState(defaultImages || [])
    const [videoUrl, setVideoUrl] = useState(defaultVideo || '')
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

    const autoGenerateCaption = async (imgUrl) => {
        setGeneratingCaption(true)
        try {
            const data = await social.generateCaption({
                imageUrl: imgUrl,
                platforms: ['instagram'],
                brandId: brandId || undefined,
            })
            if (data.success && data.captions) {
                const firstCaption = Object.values(data.captions)[0]
                if (firstCaption) setCaption(firstCaption)
            }
        } catch (err) {
            console.error('Auto AI caption error:', err)
        } finally {
            setGeneratingCaption(false)
        }
    }

    useEffect(() => {
        if (isOpen) {
            const initialImage = defaultImage || (defaultImages?.[0] || '')
            setImageUrl(initialImage)
            setImageUrls(defaultImages || [])
            setVideoUrl(defaultVideo || '')
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

            if (defaultText) {
                setCaption(defaultText)
            } else if (initialImage) {
                // Auto-generate caption if text is empty and there's an image
                setCaption('')
                autoGenerateCaption(initialImage)
            } else {
                setCaption('')
            }
        }
    }, [isOpen, defaultImage, defaultImages, defaultVideo, defaultText, brandId])

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
                videoUrl,
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
                videoUrl,
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
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[var(--sys-surface)] " onClick={onClose} />
            <div className="relative bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] rounded-3xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-[0_24px_80px_rgba(0,0,0,0.6)]" style={{ animation: 'fadeInUp 0.3s ease-out' }}>

                {/* Header — Gradient accent */}
                <div className="relative p-6 border-b border-[var(--sys-border)]">
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-t-3xl" />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${scheduleMode ? 'bg-[#FF4D00]/15' : 'bg-primary/15'}`}>
                                <span className={`material-symbols-outlined text-xl ${scheduleMode ? 'text-[#FF4D00]' : 'text-primary'}`}>
                                    {scheduleMode ? 'schedule_send' : 'send'}
                                </span>
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)]">
                                    {scheduleMode ? 'Schedule Post' : 'Publish to Socials'}
                                </h3>
                                <p className="text-xs text-[var(--sys-text-muted)]">
                                    {selectedAccounts.length > 0 ? `${selectedAccounts.length} account${selectedAccounts.length > 1 ? 's' : ''} selected` : 'Select accounts below'}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-5">

                    {/* ═══ Published Results ═══ */}
                    {results ? (
                        <div className="space-y-4">
                            <div className="text-center py-8">
                                <div className="w-20 h-20 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center mx-auto mb-4 border border-[var(--sys-border)]">
                                    <span className="material-symbols-outlined text-4xl text-primary">check_circle</span>
                                </div>
                                <h4 className="text-2xl font-bold text-[var(--sys-text)]">Published! 🎉</h4>
                                <p className="text-[var(--sys-text-muted)] text-sm mt-1">Your content is now live.</p>
                            </div>
                            <div className="space-y-2">
                                {results.map((r, i) => (
                                    <div key={i} className={`p-4 rounded-xl border flex items-center justify-between ${r.status === 'success' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]'}`}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xl">{PLATFORM_META[r.platform]?.icon || '📱'}</span>
                                            <div>
                                                <p className="font-semibold text-[var(--sys-text)] text-sm">{r.accountName}</p>
                                                <p className="text-[10px] text-[var(--sys-text-muted)] uppercase">{r.platform}</p>
                                            </div>
                                        </div>
                                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${r.status === 'success' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
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
                                <div className="w-20 h-20 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center mx-auto mb-4 border border-[#FF4D00]/20">
                                    <span className="material-symbols-outlined text-4xl text-[#FF4D00]">schedule_send</span>
                                </div>
                                <h4 className="text-2xl font-bold text-[var(--sys-text)]">Scheduled! ⏰</h4>
                                <p className="text-[var(--sys-text-muted)] text-sm mt-1">
                                    Posting on <span className="text-[#FF7A00] font-medium">{new Date(scheduledFor).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </p>
                            </div>
                            <div className="space-y-2">
                                {scheduleResults.map((s, i) => (
                                    <div key={i} className="p-4 rounded-xl border bg-[#FF4D00]/5 border-[#FF4D00]/15 flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xl">{PLATFORM_META[s.platform]?.icon || '📱'}</span>
                                            <div>
                                                <p className="font-semibold text-[var(--sys-text)] text-sm">{s.accountName}</p>
                                                <p className="text-[10px] text-[var(--sys-text-muted)] uppercase">{s.platform}</p>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FF4D00]/15 text-[#FF4D00]">
                                            ⏰ Queued
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ── Image/Video Preview ── */}
                            {isCarouselMode ? (
                                <div className="rounded-2xl overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-surface)] p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-[#FF4D00] text-sm">view_carousel</span>
                                        <span className="text-xs font-bold text-[#FF7A00]">Carousel Post</span>
                                        <span className="text-[10px] text-[var(--sys-text-muted)] bg-[var(--sys-surface)] px-2 py-0.5 rounded-full">{imageUrls.length} images</span>
                                    </div>
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                                        {imageUrls.map((url, i) => (
                                            <img key={i} src={url} alt={`Slide ${i+1}`} className="h-28 w-28 object-cover rounded-xl flex-shrink-0 border border-[var(--sys-border)]" loading="lazy" />
                                        ))}
                                    </div>
                                </div>
                            ) : videoUrl ? (
                                <div className="rounded-2xl overflow-hidden border border-[var(--sys-border)] bg-black flex justify-center items-center">
                                    <video src={videoUrl} controls autoPlay muted loop className="w-full max-h-44 object-contain" />
                                </div>
                            ) : imageUrl && (
                                <div className="rounded-2xl overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                    <img src={imageUrl} alt="Creative" className="w-full max-h-44 object-contain" loading="lazy" onError={e => e.target.style.display = 'none'} />
                                </div>
                            )}

                            {/* ── Quick Share (works without accounts) ── */}
                            <div>
                                <h4 className="text-xs font-bold text-[var(--sys-text-muted)] mb-3 uppercase tracking-widest flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-primary">share</span>
                                    Quick Share
                                </h4>
                                <div className="grid grid-cols-3 gap-2.5">
                                    {/* Native Share (mobile share sheet) */}
                                    {typeof navigator !== 'undefined' && navigator.share && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const shareData = { title: 'Mantram Creative', text: caption || 'Check out this creative!' }
                                                    if (imageUrl && !videoUrl) {
                                                        try {
                                                            const res = await fetch(imageUrl)
                                                            const blob = await res.blob()
                                                            const file = new File([blob], 'creative.png', { type: blob.type })
                                                            shareData.files = [file]
                                                        } catch { shareData.url = imageUrl }
                                                    } else if (videoUrl) {
                                                        shareData.url = videoUrl;
                                                    }
                                                    await navigator.share(shareData)
                                                } catch (e) { if (e.name !== 'AbortError') console.warn('Share failed:', e) }
                                            }}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[#FF4D00]/20 hover:border-[#FF4D00]/40 text-[#FF7A00] hover:text-[var(--sys-text)] transition-all cursor-pointer group"
                                        >
                                            <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">smartphone</span>
                                            <span className="text-[11px] font-bold">Share via...</span>
                                            <span className="text-[9px] text-[var(--sys-text-muted)]">WhatsApp, Telegram etc.</span>
                                        </button>
                                    )}

                                    {/* Copy Link */}
                                    <button
                                        onClick={() => {
                                            const textToCopy = videoUrl || imageUrl || caption || ''
                                            navigator.clipboard.writeText(textToCopy).then(() => {
                                                alert('Copied to clipboard!')
                                            })
                                        }}
                                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-primary/30 text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer group"
                                    >
                                        <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">content_copy</span>
                                        <span className="text-[11px] font-bold">Copy Link</span>
                                        <span className="text-[9px] text-[var(--sys-text-muted)]">Paste anywhere</span>
                                    </button>

                                    {/* Download */}
                                    <button
                                        onClick={async () => {
                                            if (!imageUrl && !videoUrl) return
                                            const targetUrl = videoUrl || imageUrl;
                                            const extension = videoUrl ? 'mp4' : 'png';
                                            try {
                                                const res = await fetch(targetUrl)
                                                const blob = await res.blob()
                                                const blobUrl = window.URL.createObjectURL(blob)
                                                const a = document.createElement('a')
                                                a.href = blobUrl; a.download = `mantram-creative.${extension}`
                                                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                                                window.URL.revokeObjectURL(blobUrl)
                                            } catch { window.open(targetUrl, '_blank') }
                                        }}
                                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer group"
                                    >
                                        <span className="material-symbols-outlined text-2xl group-hover:scale-110 transition-transform">download</span>
                                        <span className="text-[11px] font-bold">Download</span>
                                        <span className="text-[9px] text-[var(--sys-text-muted)]">Save image</span>
                                    </button>
                                </div>
                            </div>

                            {/* ── Divider ── */}
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-px bg-[var(--sys-surface)]" />
                                <span className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-wider font-medium">or publish to socials</span>
                                <div className="flex-1 h-px bg-[var(--sys-surface)]" />
                            </div>

                            {/* ── Account Selection ── */}
                            <div>
                                <h4 className="text-xs font-bold text-[var(--sys-text-muted)] mb-3 uppercase tracking-widest flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-primary">group</span>
                                    Select Accounts
                                </h4>
                                {loading ? (
                                    <div className="py-8 text-center"><span className="material-symbols-outlined animate-spin text-primary">progress_activity</span></div>
                                ) : accounts.length === 0 ? (
                                    <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-center">
                                        <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)] mb-2">link_off</span>
                                        <p className="text-[var(--sys-text-muted)] text-sm mb-2">No social accounts connected.</p>
                                        <p className="text-[11px] text-[var(--sys-text-muted)] mb-3">Use Quick Share above, or connect accounts to publish directly.</p>
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
                                                        ? `bg-gradient-to-r ${meta.accent || 'bg-primary/10'} ${meta.border || 'border-primary'} shadow-none`
                                                        : 'bg-[var(--sys-surface)] border-[var(--sys-border)] hover:border-[var(--sys-border)] hover:bg-[var(--sys-surface)]'}`}
                                                    style={isSelected ? { boxShadow: `0 0 20px ${meta.color}10` } : {}}>
                                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-white text-[#0c0f1a] scale-110' : 'border border-[var(--sys-border)] group-hover:border-[var(--sys-border)]'}`}>
                                                        {isSelected && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                                    </div>
                                                    {acc.avatar ? <img src={acc.avatar} className="w-9 h-9 rounded-full flex-shrink-0 ring-2 border-[var(--sys-border)]" alt="" /> : <div className="w-9 h-9 rounded-full bg-[var(--sys-surface)] flex items-center justify-center flex-shrink-0 text-lg">{meta.icon || '📱'}</div>}
                                                    <div className="truncate pr-2">
                                                        <p className="text-sm font-bold text-[var(--sys-text)] truncate">{acc.accountName}</p>
                                                        <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-medium">{meta.label || acc.platform}</p>
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
                                        <h4 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-widest flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary">edit_note</span>
                                            Caption
                                        </h4>
                                        {selectedPlatforms.length > 1 && (
                                            <button
                                                onClick={handleAdaptForPlatforms}
                                                disabled={adapting || !caption.trim()}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-30 bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:from-[#FF4D00]/20 hover:to-[#FF7A00]/20 text-[#FF7A00] border border-[#FF4D00]/20 hover:border-[#FF4D00]/40">
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
                                        className="w-full h-28 p-4 bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm rounded-xl focus:outline-none focus:border-primary/40 focus:bg-[var(--sys-surface)] custom-scrollbar resize-none transition-all placeholder-slate-600"
                                        placeholder="Write your caption here..."
                                    />
                                    {/* Adapt error */}
                                    {adaptError && (
                                        <div className="mt-2 p-2.5 rounded-lg bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] flex items-start gap-2">
                                            <span className="material-symbols-outlined text-primary text-sm mt-0.5">warning</span>
                                            <p className="text-xs text-[var(--sys-primary)]">{adaptError}</p>
                                        </div>
                                    )}
                                    {/* AI Caption generate — works even without accounts */}
                                    {imageUrl && !videoUrl && caption.trim().length < 20 && (
                                        <button
                                            onClick={async () => {
                                                const platforms = getSelectedPlatforms()
                                                const targetPlatform = platforms.length > 0 ? platforms[0] : 'instagram'
                                                setGeneratingCaption(true)
                                                try {
                                                    const data = await social.generateCaption({
                                                        imageUrl,
                                                        platforms: [targetPlatform],
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
                                            className="mt-2 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:from-[#FF4D00]/20 hover:to-primary/20 text-[#FF7A00] border border-[#FF4D00]/20 hover:border-[#FF4D00]/40 w-full justify-center"
                                        >
                                            {generatingCaption ? (
                                                <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Generating caption...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-xs">auto_awesome</span> ✨ Generate AI Caption from Image</>
                                            )}
                                        </button>
                                    )}
                                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-1.5">
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
                                        <h4 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-widest flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary">auto_awesome</span>
                                            Adapted Captions
                                        </h4>
                                        <button
                                            onClick={() => { setIsAdapted(false); setPlatformCaptions({}) }}
                                            className="text-[11px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-colors flex items-center gap-1">
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
                                                            : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border border-transparent hover:border-[var(--sys-border)]'}`}>
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
                                            <div key={platform} className={`rounded-xl border p-4 ${meta.border || 'border-[var(--sys-border)]'} bg-gradient-to-br ${meta.accent || 'from-white/5 to-white/5'}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{meta.icon || '📱'}</span>
                                                        <span className="text-sm font-bold text-[var(--sys-text)]">{meta.label || platform}</span>
                                                    </div>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)] font-mono">{(platformCaptions[platform] || '').length} chars</span>
                                                </div>
                                                <textarea
                                                    value={platformCaptions[platform] || ''}
                                                    onChange={e => setPlatformCaptions(prev => ({ ...prev, [platform]: e.target.value }))}
                                                    className="w-full h-28 p-3 bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm rounded-lg focus:outline-none focus:border-[var(--sys-border)] custom-scrollbar resize-none"
                                                    placeholder={`${meta.label || platform} caption...`}
                                                />
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* ── Media URL fallback ── */}
                            {!imageUrl && !videoUrl && (
                                <div>
                                    <h4 className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 uppercase tracking-widest">Media URL</h4>
                                    <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                                        placeholder="Paste image URL (required for Instagram)"
                                        className="w-full p-3.5 bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm rounded-xl focus:outline-none focus:border-primary/40 transition-all placeholder-slate-600" />
                                </div>
                            )}

                            {/* ── Schedule Section — Premium ── */}
                            <div className={`rounded-2xl border overflow-hidden transition-all duration-300 ${scheduleMode ? 'bg-[var(--sys-surface)] border border-[var(--sys-border)] border-[#FF4D00]/25 shadow-none' : 'bg-[var(--sys-surface)] border-[var(--sys-border)]'}`}>
                                {/* Toggle Header */}
                                <div className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${scheduleMode ? 'bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-inner' : 'bg-[var(--sys-surface)]'}`}>
                                            <span className={`material-symbols-outlined text-xl transition-colors ${scheduleMode ? 'text-[#FF7A00]' : 'text-[var(--sys-text-muted)]'}`}>schedule_send</span>
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-[var(--sys-text)]">Schedule for later</span>
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">Queue your post for the perfect time</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setScheduleMode(!scheduleMode); if (scheduleMode) setScheduledFor('') }}
                                        className={`relative w-12 h-7 rounded-full transition-all duration-300 cursor-pointer ${scheduleMode ? 'bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-none' : 'bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)]'}`}>
                                        <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${scheduleMode ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                </div>

                                {/* Schedule Picker — Expanded */}
                                {scheduleMode && (
                                    <div className="px-4 pb-4 space-y-3">
                                        {/* Divider */}
                                        <div className="h-px bg-[var(--sys-surface)] border border-[var(--sys-border)]" />

                                        {/* Quick Select Times */}
                                        <div>
                                            <p className="text-[10px] text-[#FF4D00]/70 uppercase tracking-widest font-bold mb-2">Quick Schedule</p>
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
                                                                ? 'bg-[var(--sys-surface)] border border-[var(--sys-border)] text-orange-50 border border-[#FF4D00]/40 shadow-md shadow-none'
                                                                : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-transparent hover:bg-[var(--sys-surface)] hover:text-[var(--sys-text)]'
                                                                }`}>
                                                            {opt.label}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* Custom DateTime */}
                                        <div>
                                            <p className="text-[10px] text-[#FF4D00]/70 uppercase tracking-widest font-bold mb-2">Or pick exact time</p>
                                            <input
                                                type="datetime-local"
                                                value={scheduledFor}
                                                onChange={e => setScheduledFor(e.target.value)}
                                                min={getMinDateTime()}
                                                className="w-full p-3 bg-[var(--sys-surface)] border border-[#FF4D00]/15 text-[var(--sys-text)] text-sm rounded-xl focus:outline-none focus:border-[#FF4D00]/40 [color-scheme:dark] transition-all"
                                            />
                                        </div>

                                        {/* Visual Confirmation */}
                                        {scheduledFor && (
                                            <div className="relative overflow-hidden rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[#FF4D00]/15 p-4">
                                                <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF4D00]/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                                                <div className="flex items-center gap-3 relative">
                                                    <div className="w-10 h-10 rounded-xl bg-[#FF4D00]/20 flex items-center justify-center flex-shrink-0">
                                                        <span className="material-symbols-outlined text-[#FF7A00] text-xl">event_available</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] text-[#FF4D00]/70 uppercase tracking-wider font-bold">Posting on</p>
                                                        <p className="text-sm text-[var(--sys-text)] font-bold">
                                                            {new Date(scheduledFor).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                                                        </p>
                                                        <p className="text-xs text-[#FF7A00]">
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
                <div className="flex items-center justify-end gap-3 p-5 border-t border-[var(--sys-border)] bg-[var(--sys-surface)] rounded-b-3xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        {results || scheduleResults ? 'Done' : 'Cancel'}
                    </button>
                    {!results && !scheduleResults && (
                        scheduleMode ? (
                            <button
                                onClick={handleSchedule}
                                disabled={publishing}
                                className="px-7 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 disabled:opacity-40 transition-all cursor-pointer bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:from-[#FF4D00] hover:to-[#FF7A00] text-[var(--sys-text)] shadow-none hover:shadow-none">
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
                                className="px-7 py-3 rounded-xl text-sm font-bold flex items-center gap-2.5 disabled:opacity-40 transition-all cursor-pointer bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:shadow-none text-[var(--sys-text)] shadow-none">
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

import { useState, useEffect } from 'react'
import { social } from '../services/api'

const PLATFORM_META = {
    instagram: { label: 'Instagram', icon: '📸', color: '#E1306C', accent: 'from-pink-500/20 to-purple-500/20', border: 'border-pink-500/30' },
    facebook: { label: 'Facebook', icon: '👥', color: '#1877F2', accent: 'from-blue-500/20 to-indigo-500/20', border: 'border-blue-500/30' },
    twitter: { label: 'Twitter / X', icon: '𝕏', color: '#000000', accent: 'from-slate-500/20 to-slate-600/20', border: 'border-slate-400/30' },
    linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2', accent: 'from-sky-500/20 to-blue-500/20', border: 'border-sky-500/30' },
}

/**
 * PublishModal — Smart, simple 2-step publish flow
 *
 * FLOW:
 *   Step 1: Select accounts + see caption (auto-populated from existing content)
 *   Step 2: Click "Publish" → done
 *
 * OPTIONAL: "Adapt for each platform" — 1 AI call to tailor captions
 * NO mandatory generation gates. Content from Content/Creative Studio is the caption.
 */
export default function PublishModal({ isOpen, onClose, defaultText = '', defaultImage = null, brandId = null }) {
    const [accounts, setAccounts] = useState([])
    const [selectedAccounts, setSelectedAccounts] = useState([])
    const [loading, setLoading] = useState(false)
    const [imageUrl, setImageUrl] = useState(defaultImage || '')
    const [caption, setCaption] = useState(defaultText || '')
    const [platformCaptions, setPlatformCaptions] = useState({})
    const [isAdapted, setIsAdapted] = useState(false)
    const [adapting, setAdapting] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [results, setResults] = useState(null)
    const [activePlatform, setActivePlatform] = useState(null)
    const [generatingCaption, setGeneratingCaption] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setImageUrl(defaultImage || '')
            setCaption(defaultText || '')
            setPlatformCaptions({})
            setIsAdapted(false)
            setResults(null)
            setSelectedAccounts([])
            setGeneratingCaption(false)
            loadAccounts()
        }
    }, [isOpen, defaultImage, defaultText])

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

    // OPTIONAL: Adapt the single caption into platform-specific versions (1 AI call)
    const handleAdaptForPlatforms = async () => {
        const platforms = getSelectedPlatforms()
        if (platforms.length === 0) return

        setAdapting(true)
        try {
            const data = await social.generateCaption({
                imageUrl: imageUrl || undefined,
                platforms,
                brandId: brandId || undefined,
                userBrief: caption || undefined,
            })

            if (data.success && data.captions) {
                const adapted = {}
                platforms.forEach(p => {
                    if (data.captions[p]) adapted[p] = data.captions[p]
                })
                setPlatformCaptions(adapted)
                setIsAdapted(true)
                setActivePlatform(platforms[0])
            }
        } catch (err) {
            console.error('Adapt error:', err)
        } finally {
            setAdapting(false)
        }
    }

    // Get the caption that will be sent for a given platform
    const getCaptionForPlatform = (platform) => {
        if (isAdapted && platformCaptions[platform]) return platformCaptions[platform]
        return caption
    }

    // Publish — uses per-platform captions if adapted, otherwise same caption for all
    const handlePublish = async () => {
        if (selectedAccounts.length === 0) return alert('Select at least one account')

        const platforms = getSelectedPlatforms()
        const currentCaption = caption.trim()

        if (!currentCaption && platforms.length > 0) {
            return alert('Please write a caption before publishing')
        }

        setPublishing(true)
        try {
            // Build captions object — per-platform if adapted, same for all if not
            const captions = {}
            platforms.forEach(p => {
                captions[p] = getCaptionForPlatform(p)
            })

            const res = await social.publish({
                accountIds: selectedAccounts,
                text: currentCaption,
                captions,
                imageUrl
            })
            setResults(res.results)
        } catch (err) {
            alert(err.message || 'Failed to publish')
        } finally {
            setPublishing(false)
        }
    }

    if (!isOpen) return null

    const selectedPlatforms = getSelectedPlatforms()

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0c0f1a] border border-white/10 rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl animate-fade-in">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">send</span>
                        Publish to Socials
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-5">

                    {/* Publishing Results */}
                    {results ? (
                        <div className="space-y-4">
                            <div className="text-center py-6">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                    <span className="material-symbols-outlined text-3xl text-emerald-400">check_circle</span>
                                </div>
                                <h4 className="text-xl font-bold text-white">Published!</h4>
                                <p className="text-slate-400 text-sm mt-1">Your content has been posted.</p>
                            </div>
                            <div className="space-y-3">
                                {results.map((r, i) => (
                                    <div key={i} className={`p-4 rounded-xl border flex items-center justify-between ${r.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-white text-sm flex items-center gap-2">
                                                <span>{PLATFORM_META[r.platform]?.icon || '📱'}</span>
                                                {r.accountName}
                                            </p>
                                            {r.status === 'error' && <p className="text-xs text-rose-400 mt-1">{r.error}</p>}
                                        </div>
                                        <div className={`px-2.5 py-1 rounded text-xs font-bold flex-shrink-0 ${r.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                            {r.status === 'success' ? '✓ Posted' : 'Failed'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ── STEP 1: Image + Accounts ── */}

                            {/* Image Preview */}
                            {imageUrl && (
                                <div className="rounded-xl overflow-hidden border border-white/10 bg-black/20">
                                    <img src={imageUrl} alt="Creative" className="w-full max-h-48 object-contain" loading="lazy" onError={e => e.target.style.display = 'none'} />
                                </div>
                            )}

                            {/* Account Selection */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Select Accounts</h4>
                                {loading ? (
                                    <div className="py-8 text-center"><span className="material-symbols-outlined animate-spin text-primary">progress_activity</span></div>
                                ) : accounts.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                        <p className="text-slate-400 text-sm mb-2">No social accounts connected.</p>
                                        <a href="/integrations" className="text-primary text-sm hover:underline">Connect accounts in Settings</a>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {accounts.map(acc => {
                                            const isSelected = selectedAccounts.includes(acc._id)
                                            const meta = PLATFORM_META[acc.platform] || {}
                                            return (
                                                <button key={acc._id} onClick={() => toggleAccount(acc._id)}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${isSelected ? `bg-gradient-to-r ${meta.accent || 'bg-primary/10'} ${meta.border || 'border-primary'}` : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-white/90 text-[#0c0f1a]' : 'border border-slate-500'}`}>
                                                        {isSelected && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                                    </div>
                                                    {acc.avatar ? <img src={acc.avatar} className="w-8 h-8 rounded-full flex-shrink-0" alt="" /> : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 text-base">{meta.icon || '📱'}</div>}
                                                    <div className="truncate pr-2">
                                                        <p className="text-sm font-bold text-white truncate">{acc.accountName}</p>
                                                        <p className="text-[10px] text-slate-400 uppercase">{acc.platform}</p>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── STEP 2: Caption (auto-populated, editable) ── */}

                            {/* Unified Caption — same for all platforms by default */}
                            {!isAdapted && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary">edit_note</span>
                                            Caption
                                        </h4>
                                        {selectedPlatforms.length > 1 && (
                                            <button
                                                onClick={handleAdaptForPlatforms}
                                                disabled={adapting || !caption.trim()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/20 hover:border-violet-500/40">
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
                                        className="w-full h-28 p-3 bg-white/5 border border-white/10 text-white text-sm rounded-xl focus:outline-none focus:border-primary/50 custom-scrollbar resize-none transition-colors"
                                        placeholder="Write your caption here..."
                                    />
                                    {/* Optional AI Caption — only shown when image exists and caption is empty/short */}
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
                                            className="mt-2 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 bg-gradient-to-r from-violet-500/10 to-primary/10 hover:from-violet-500/20 hover:to-primary/20 text-violet-300 border border-violet-500/20 hover:border-violet-500/40 w-full justify-center"
                                        >
                                            {generatingCaption ? (
                                                <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Generating caption...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-xs">auto_awesome</span> ✨ Generate AI Caption from Image</>
                                            )}
                                        </button>
                                    )}
                                    <p className="text-[10px] text-slate-600 mt-1">
                                        {selectedPlatforms.length > 1
                                            ? `Same caption will be posted to ${selectedPlatforms.map(p => PLATFORM_META[p]?.label || p).join(', ')}`
                                            : selectedPlatforms.length === 1
                                                ? `Will be posted to ${PLATFORM_META[selectedPlatforms[0]]?.label || selectedPlatforms[0]}`
                                                : 'Select accounts above to publish'
                                        }
                                    </p>
                                </div>
                            )}

                            {/* Per-Platform Captions (shown only after "Adapt per platform") */}
                            {isAdapted && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-emerald-400">subtitles</span>
                                            Platform Captions
                                        </h4>
                                        <button
                                            onClick={() => { setIsAdapted(false); setPlatformCaptions({}) }}
                                            className="text-[11px] text-slate-500 hover:text-white cursor-pointer transition-colors">
                                            ← Back to single caption
                                        </button>
                                    </div>

                                    {/* Tabs */}
                                    {selectedPlatforms.length > 1 && (
                                        <div className="flex gap-2 mb-3">
                                            {selectedPlatforms.map(platform => {
                                                const meta = PLATFORM_META[platform] || {}
                                                const isActive = activePlatform === platform
                                                return (
                                                    <button key={platform} onClick={() => setActivePlatform(platform)}
                                                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${isActive
                                                            ? `bg-gradient-to-r ${meta.accent || 'bg-primary/20'} text-white ${meta.border || 'border-primary/40'} border shadow-sm`
                                                            : 'bg-white/5 text-slate-400 hover:text-white border border-transparent hover:border-white/10'}`}>
                                                        <span className="text-sm">{meta.icon || '📱'}</span>
                                                        {meta.label || platform}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Editor for active platform */}
                                    {selectedPlatforms.map(platform => {
                                        if (selectedPlatforms.length > 1 && activePlatform !== platform) return null
                                        const meta = PLATFORM_META[platform] || {}
                                        return (
                                            <div key={platform} className={`rounded-xl border p-4 ${meta.border || 'border-white/10'} bg-gradient-to-br ${meta.accent || 'from-white/5 to-white/5'}`}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-base">{meta.icon || '📱'}</span>
                                                    <span className="text-sm font-bold text-white">{meta.label || platform}</span>
                                                </div>
                                                <textarea
                                                    value={platformCaptions[platform] || ''}
                                                    onChange={e => setPlatformCaptions(prev => ({ ...prev, [platform]: e.target.value }))}
                                                    className="w-full h-28 p-3 bg-black/30 border border-white/10 text-white text-sm rounded-lg focus:outline-none focus:border-white/30 custom-scrollbar resize-none"
                                                    placeholder={`${meta.label || platform} caption...`}
                                                />
                                                <span className="text-[10px] text-slate-500 mt-1 block">{(platformCaptions[platform] || '').length} chars</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Media URL fallback */}
                            {!imageUrl && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Media URL</h4>
                                    <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                                        placeholder="Image URL (required for Instagram)"
                                        className="w-full p-3 bg-white/5 border border-white/10 text-white text-sm rounded-xl focus:outline-none focus:border-primary" />
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-black/20 rounded-b-2xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer">
                        {results ? 'Close' : 'Cancel'}
                    </button>
                    {!results && (
                        <button onClick={handlePublish}
                            disabled={publishing || selectedAccounts.length === 0 || !caption.trim()}
                            className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40">
                            {publishing ? (
                                <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span> Publishing...</>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-lg">send</span>
                                    Publish{selectedPlatforms.length > 0 ? ` to ${selectedPlatforms.length}` : ''}
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

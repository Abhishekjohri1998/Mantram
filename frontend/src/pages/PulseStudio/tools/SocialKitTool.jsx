import React, { useState } from 'react'
import {
    Image as ImageIcon, Film, Monitor, Newspaper, Grid,
    Download, Copy, CheckCircle2, Loader2, Sparkles,
    Globe, MessageCircle, Hash, RefreshCw, Share2
} from 'lucide-react'
import { apiFetch } from '../../../services/api'

const PLATFORMS = [
    { id: 'instagram_feed',  label: 'Instagram Feed',  Icon: ImageIcon, ratio: '1:1',  size: '1080×1080' },
    { id: 'instagram_story', label: 'Instagram Story', Icon: Film,      ratio: '9:16', size: '1080×1920' },
    { id: 'facebook',        label: 'Facebook Post',   Icon: Globe,     ratio: '16:9', size: '1200×630'  },
    { id: 'twitter_x',       label: 'Twitter / X',     Icon: MessageCircle, ratio: '16:9', size: '1200×675' },
    { id: 'linkedin',        label: 'LinkedIn Post',   Icon: Newspaper, ratio: '16:9', size: '1200×627'  },
    { id: 'pinterest',       label: 'Pinterest Pin',   Icon: Grid,      ratio: '4:5',  size: '1000×1500' },
]

const KIT_TYPES = [
    { id: 'promo',   label: 'Promo Post',    desc: 'Consumer-facing, shop now' },
    { id: 'feature', label: 'Feature Spot',  desc: 'Deep-dive one key feature' },
    { id: 'launch',  label: 'Launch Blast',  desc: 'New product announcement' },
]

const ASPECT_HEIGHTS = { '1:1': 'aspect-square', '9:16': 'aspect-[9/16]', '16:9': 'aspect-video', '4:5': 'aspect-[4/5]' }

function downloadImage(url, name) {
    fetch(url).then(r => r.blob()).then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name; a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }).catch(() => window.open(url, '_blank'))
}

export default function SocialKitTool({ sharedContext, brandId }) {
    const [kitType, setKitType]         = useState('promo')
    const [selectedPlatforms, setSelectedPlatforms] = useState(new Set(PLATFORMS.map(p => p.id)))
    const [loading, setLoading]         = useState(false)
    const [result, setResult]           = useState(null)
    const [error, setError]             = useState('')
    const [activePlatform, setActivePlatform] = useState('instagram_feed')
    const [copied, setCopied]           = useState('')

    const togglePlatform = (id) => {
        setSelectedPlatforms(prev => {
            const next = new Set(prev)
            if (next.has(id)) { if (next.size > 1) next.delete(id) } else next.add(id)
            return next
        })
    }

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null)
        try {
            const data = await apiFetch('/brand-studio/social-kit/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 300000, // 5 min timeout for multi-image + copy generation
                body: JSON.stringify({
                    productDNA:            sharedContext?.productDNA,
                    productData:           sharedContext?.productData,
                    selectedMoodId:        sharedContext?.selectedMood || sharedContext?.moodLabel,
                    productMoodDirections: sharedContext?.productMoodDirections,
                    kitType,
                    platforms:             Array.from(selectedPlatforms),
                    brandId,
                }),
            })
            if (data.success) {
                setResult(data)
                // Auto-select first successful platform
                const first = data.kitImages?.find(k => k.success)?.platform
                if (first) setActivePlatform(first)
            } else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    const copyCaption = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(text.slice(0, 20))
            setTimeout(() => setCopied(''), 2000)
        })
    }

    // Get result for the active platform
    const activeResult = result?.kitImages?.find(k => k.platform === activePlatform)
    const activeCaption = result?.captions?.[activePlatform]

    return (
        <div>
            {/* Kit type selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {KIT_TYPES.map(kt => (
                    <button
                        key={kt.id}
                        className={`ps-btn-${kitType === kt.id ? 'primary' : 'secondary'}`}
                        style={{ fontSize: 11, padding: '7px 14px', flexShrink: 0 }}
                        onClick={() => setKitType(kt.id)}
                        disabled={loading}
                    >
                        {kt.label}
                    </button>
                ))}
            </div>

            {/* Platform selection */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 10 }}>
                    Select Platforms ({selectedPlatforms.size} selected)
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PLATFORMS.map(({ id, label, Icon, size }) => {
                        const isOn = selectedPlatforms.has(id)
                        return (
                            <button
                                key={id}
                                onClick={() => togglePlatform(id)}
                                className={`ps-btn-${isOn ? 'primary' : 'ghost'}`}
                                style={{ fontSize: 11, padding: '6px 12px', gap: 5 }}
                                disabled={loading}
                            >
                                <Icon size={12} /> {label}
                                <span style={{ fontSize: 9, opacity: 0.7 }}>{size}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Generate button */}
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading || selectedPlatforms.size === 0} style={{ width: '100%', marginBottom: 16 }}>
                {loading ? (
                    <><Loader2 size={15} className="ps-spin" />Generating {selectedPlatforms.size} platform images + captions…</>
                ) : (
                    <><Sparkles size={15} />Generate Social Kit — {selectedPlatforms.size} platforms · 15 credits</>
                )}
            </button>

            {error && <div className="ps-error-bar" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Results */}
            {result && (
                <div className="ps-fade-in">
                    {/* Platform tabs */}
                    <div className="ps-category-tabs" style={{ marginBottom: 16 }}>
                        {result.kitImages?.map(kit => {
                            const meta = PLATFORMS.find(p => p.id === kit.platform)
                            if (!meta) return null
                            const Icon = meta.Icon
                            return (
                                <button
                                    key={kit.platform}
                                    className={`ps-cat-tab ${activePlatform === kit.platform ? 'active' : ''}`}
                                    onClick={() => setActivePlatform(kit.platform)}
                                >
                                    <Icon size={12} /> {meta.label}
                                    {!kit.success && <span style={{ fontSize: 9, color: '#ef4444', marginLeft: 3 }}>✗</span>}
                                </button>
                            )
                        })}
                    </div>

                    {/* Active platform view */}
                    {activeResult && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {/* Image */}
                            <div>
                                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', background: 'var(--sys-bg)' }}>
                                    {activeResult.imageUrl ? (
                                        <img
                                            src={activeResult.imageUrl}
                                            alt={activeResult.label}
                                            style={{ width: '100%', display: 'block', objectFit: 'contain' }}
                                            onError={e => e.target.style.display='none'}
                                        />
                                    ) : (
                                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--sys-text-muted)', fontSize: 12 }}>
                                            Image generation failed for this platform
                                        </div>
                                    )}
                                    {activeResult.imageUrl && (
                                        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
                                            <button
                                                className="ps-btn-ghost"
                                                style={{ padding: '5px 8px', fontSize: 11, background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff' }}
                                                onClick={() => downloadImage(activeResult.imageUrl, `${activeResult.platform}-${kitType}.png`)}
                                                title="Download"
                                            >
                                                <Download size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <span style={{ fontSize: 10, color: 'var(--sys-text-muted)' }}>{activeResult.label} · {activeResult.size}</span>
                                    {activeResult.imageUrl && (
                                        <button
                                            className="ps-btn-secondary"
                                            style={{ fontSize: 10, padding: '4px 10px', gap: 4 }}
                                            onClick={() => downloadImage(activeResult.imageUrl, `${activeResult.platform}-${kitType}.png`)}
                                        >
                                            <Download size={11} /> Download
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Caption panel */}
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 10 }}>
                                    Ready-to-Publish Copy
                                </div>
                                {activeCaption ? (
                                    <>
                                        {/* Main caption */}
                                        {activeCaption.caption && (
                                            <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sys-primary)' }}>
                                                        Caption
                                                    </div>
                                                    <button
                                                        className="ps-btn-ghost"
                                                        style={{ padding: '3px 8px', fontSize: 10, gap: 4 }}
                                                        onClick={() => copyCaption(activeCaption.caption)}
                                                    >
                                                        {copied ? <CheckCircle2 size={10} style={{ color: '#10b981' }} /> : <Copy size={10} />}
                                                        {copied ? 'Copied!' : 'Copy'}
                                                    </button>
                                                </div>
                                                <div className="ps-caption-text">{activeCaption.caption}</div>
                                            </div>
                                        )}

                                        {/* Story sticker */}
                                        {activeCaption.sticker_text && (
                                            <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', marginBottom: 6 }}>Story Sticker CTA</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-text)' }}>{activeCaption.sticker_text}</div>
                                            </div>
                                        )}

                                        {/* Hashtags */}
                                        {activeCaption.hashtags && (
                                            <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Hash size={10} /> Hashtags
                                                    </div>
                                                    <button
                                                        className="ps-btn-ghost"
                                                        style={{ padding: '3px 8px', fontSize: 10, gap: 4 }}
                                                        onClick={() => copyCaption(activeCaption.hashtags)}
                                                    >
                                                        <Copy size={10} /> Copy
                                                    </button>
                                                </div>
                                                <div className="ps-hashtags">{activeCaption.hashtags}</div>
                                            </div>
                                        )}

                                        {/* Pinterest board suggestion */}
                                        {activeCaption.board_suggestion && (
                                            <div className="ps-caption-box">
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', marginBottom: 4 }}>Suggested Board</div>
                                                <div style={{ fontSize: 12, color: 'var(--sys-text)' }}>{activeCaption.board_suggestion}</div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{ color: 'var(--sys-text-muted)', fontSize: 12, padding: 12 }}>No caption for this platform</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Download all */}
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 6, fontSize: 12 }}>
                            <RefreshCw size={13} /> Regenerate All
                        </button>
                        <button
                            className="ps-btn-primary"
                            style={{ gap: 6, fontSize: 12 }}
                            onClick={() => {
                                result.kitImages?.forEach(kit => {
                                    if (kit.imageUrl) downloadImage(kit.imageUrl, `${kit.platform}-${kitType}.png`)
                                })
                            }}
                        >
                            <Download size={13} /> Download All ({result.kitImages?.filter(k => k.success).length} images)
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

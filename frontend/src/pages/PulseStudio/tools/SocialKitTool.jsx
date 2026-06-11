/**
 * SocialKitTool v2 — Pulse Creative Brain Edition
 *
 * Upgrades:
 *  - Routes generation through Pulse Creative Brain (full Art Director pipeline)
 *  - Avatar config inherited from session (show/hide per-tool toggle)
 *  - Typography DNA passed from productDNA
 *  - "Make it a Reel" post-generation action (Seedance + optional avatar compositing)
 *  - Improved result UI with creative rationale panel
 */

import React, { useState } from 'react'
import {
    Image as ImageIcon, Film, Monitor, Newspaper, Grid,
    Download, Copy, CheckCircle2, Loader2, Sparkles,
    Globe, MessageCircle, Hash, RefreshCw, Share2, Video,
    ChevronDown, ChevronUp, Info, User
} from 'lucide-react'
import { apiFetch } from '../../../services/api'
import AvatarConfigPanel from './AvatarConfigPanel'

const PLATFORMS = [
    { id: 'instagram_feed',  label: 'Instagram Feed',  Icon: ImageIcon,    ratio: '1:1',  size: '1080×1080' },
    { id: 'instagram_story', label: 'Instagram Story', Icon: Film,         ratio: '9:16', size: '1080×1920' },
    { id: 'facebook',        label: 'Facebook Post',   Icon: Globe,        ratio: '16:9', size: '1200×630'  },
    { id: 'twitter_x',       label: 'Twitter / X',     Icon: MessageCircle,ratio: '16:9', size: '1200×675'  },
    { id: 'linkedin',        label: 'LinkedIn Post',   Icon: Newspaper,    ratio: '16:9', size: '1200×627'  },
    { id: 'pinterest',       label: 'Pinterest Pin',   Icon: Grid,         ratio: '4:5',  size: '1000×1500' },
]

const KIT_TYPES = [
    { id: 'promo',   label: 'Promo Post',    desc: 'Consumer-facing, shop now energy' },
    { id: 'feature', label: 'Feature Spot',  desc: 'Deep-dive one key product feature' },
    { id: 'launch',  label: 'Launch Blast',  desc: 'New product announcement, exciting' },
    { id: 'emotion', label: 'Emotion Hook',  desc: 'Lifestyle & feeling — product subtle' },
]

function downloadImage(url, name) {
    fetch(url).then(r => r.blob()).then(blob => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = name; a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }).catch(() => window.open(url, '_blank'))
}

function copyText(text, setCopied, key) {
    navigator.clipboard.writeText(text).then(() => {
        setCopied(key)
        setTimeout(() => setCopied(''), 2000)
    })
}

export default function SocialKitTool({ sharedContext, brandId, avatarConfig, onAvatarConfigChange }) {
    const [kitType, setKitType]         = useState('promo')
    const [brief, setBrief]             = useState('')
    const [selectedPlatforms, setSelectedPlatforms] = useState(new Set(PLATFORMS.map(p => p.id)))
    const [loading, setLoading]         = useState(false)
    const [result, setResult]           = useState(null)
    const [error, setError]             = useState('')
    const [activePlatform, setActivePlatform] = useState('instagram_feed')
    const [copied, setCopied]           = useState('')
    const [showRationale, setShowRationale] = useState(false)
    const [reelLoading, setReelLoading] = useState(false)
    const [reelResult, setReelResult]   = useState(null)

    const togglePlatform = (id) => {
        setSelectedPlatforms(prev => {
            const next = new Set(prev)
            if (next.has(id)) { if (next.size > 1) next.delete(id) } else next.add(id)
            return next
        })
    }

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setReelResult(null)
        try {
            const data = await apiFetch('/brand-studio/social-kit/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 300000, // 5 min timeout for multi-image + creative brain
                body: JSON.stringify({
                    productDNA:            sharedContext?.productDNA,
                    productData:           sharedContext?.productData,
                    selectedMoodId:        sharedContext?.selectedMood || sharedContext?.moodLabel,
                    productMoodDirections: sharedContext?.productMoodDirections,
                    designContext:         sharedContext?.designContext || null,   // ← FIX: pass full design context
                    kitType,
                    brief,
                    platforms:             Array.from(selectedPlatforms),
                    brandId,
                    // NEW: Creative Brain inputs
                    avatarConfig:          avatarConfig?.enabled ? avatarConfig : null,
                    typographyDNA:         sharedContext?.productDNA?.typographyDNA || null,
                    usePulseCreativeBrain: true,
                }),
            })
            if (data.success) {
                setResult(data)
                const first = data.kitImages?.find(k => k.success)?.platform
                if (first) setActivePlatform(first)
            } else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    // Make it a Reel — sends the active image through Seedance video pipeline
    const handleMakeReel = async () => {
        const activeImg = result?.kitImages?.find(k => k.platform === activePlatform)
        if (!activeImg?.imageUrl) return
        setReelLoading(true); setReelResult(null)
        try {
            const data = await apiFetch('/brand-studio/social-kit/make-reel', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 30000, // Just enqueues the job
                body: JSON.stringify({
                    imageUrl:   activeImg.imageUrl,
                    platform:   activePlatform,
                    duration:   10,
                    motionStyle: 'cinematic-drift',
                    brandId,
                    avatarConfig: avatarConfig?.enabled ? avatarConfig : null,
                }),
            })
            if (data.success) setReelResult(data)
            else setError(data.error || 'Reel job failed to enqueue')
        } catch (e) { setError(e.message) }
        setReelLoading(false)
    }

    const activeResult  = result?.kitImages?.find(k => k.platform === activePlatform)
    const activeCaption = result?.captions?.[activePlatform]
    const hasRationale  = result?.creativeRationale

    return (
        <div>
            {/* Kit type */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
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

            {/* Brief */}
            <textarea
                className="ps-textarea"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Creative brief (optional): Hook angle, launch moment, campaign theme, occasion…"
                rows={2}
                disabled={loading}
                style={{ marginTop: 0, marginBottom: 12 }}
            />

            {/* Avatar config panel — tool-level toggle (inherits session config) */}
            {onAvatarConfigChange && (
                <AvatarConfigPanel
                    config={avatarConfig}
                    onChange={onAvatarConfigChange}
                    compact={false}
                    disabled={loading}
                />
            )}

            {/* Platform selection */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 8 }}>
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

            {/* Creative brain indicator */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
                padding: '7px 10px', borderRadius: 7,
                background: 'var(--sys-surface)', border: '1px solid var(--sys-border)',
                fontSize: 10, color: 'var(--sys-text-muted)',
            }}>
                <Sparkles size={11} style={{ color: 'var(--sys-primary)', flexShrink: 0 }} />
                <span>
                    <strong style={{ color: 'var(--sys-text)' }}>Pulse Creative Brain</strong> — Art Director + Copywriter + Typographer working in one pass{avatarConfig?.enabled ? ` · 👤 Human casting enabled` : ''}
                </span>
            </div>

            {/* Generate */}
            <button
                className="ps-btn-primary"
                onClick={handleGenerate}
                disabled={loading || selectedPlatforms.size === 0}
                style={{ width: '100%', marginBottom: 16 }}
            >
                {loading ? (
                    <><Loader2 size={15} className="ps-spin" />Creative Brain generating {selectedPlatforms.size} platform images…</>
                ) : (
                    <><Sparkles size={15} />Generate Social Kit — {selectedPlatforms.size} platforms · 15 credits</>
                )}
            </button>

            {error && <div className="ps-error-bar" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Results */}
            {result && (
                <div className="ps-fade-in">
                    {/* Creative rationale bar */}
                    {hasRationale && (
                        <button
                            onClick={() => setShowRationale(r => !r)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                marginBottom: 12, padding: '8px 12px', borderRadius: 8,
                                background: 'var(--sys-surface)', border: '1px solid var(--sys-border)',
                                cursor: 'pointer', textAlign: 'left',
                            }}
                        >
                            <Info size={12} style={{ color: 'var(--sys-primary)', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: 'var(--sys-text)', flex: 1 }}>
                                <strong>Art Director's Note</strong> — {result.creativeRationale?.split(' ').slice(0, 8).join(' ')}…
                            </span>
                            {showRationale ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                    )}
                    {showRationale && hasRationale && (
                        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', fontSize: 12, color: 'var(--sys-text-muted)', lineHeight: 1.6 }}>
                            <div style={{ marginBottom: 4, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sys-primary)' }}>Creative Rationale</div>
                            {result.creativeRationale}
                            {result.designTrend && (
                                <div style={{ marginTop: 8, fontSize: 10, fontWeight: 600, color: 'var(--sys-text)' }}>
                                    Design Trend: <span style={{ color: 'var(--sys-primary)' }}>{result.designTrend}</span>
                                </div>
                            )}
                        </div>
                    )}

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
                                        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 5 }}>
                                            <button
                                                className="ps-btn-ghost"
                                                style={{ padding: '5px 8px', fontSize: 11, background: 'rgba(0,0,0,0.75)', border: 'none', color: '#fff', borderRadius: 6 }}
                                                onClick={() => downloadImage(activeResult.imageUrl, `${activeResult.platform}-${kitType}.png`)}
                                                title="Download"
                                            >
                                                <Download size={12} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Image meta + Reel action */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 6 }}>
                                    <span style={{ fontSize: 10, color: 'var(--sys-text-muted)' }}>
                                        {activeResult.label} · {activeResult.size}
                                    </span>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        {activeResult.imageUrl && (
                                            <button
                                                className="ps-btn-secondary"
                                                style={{ fontSize: 10, padding: '4px 9px', gap: 4 }}
                                                onClick={() => downloadImage(activeResult.imageUrl, `${activeResult.platform}-${kitType}.png`)}
                                            >
                                                <Download size={11} /> Download
                                            </button>
                                        )}
                                        {activeResult.imageUrl && (
                                            <button
                                                className="ps-btn-secondary"
                                                style={{ fontSize: 10, padding: '4px 9px', gap: 4, color: reelLoading ? 'var(--sys-text-muted)' : undefined }}
                                                onClick={handleMakeReel}
                                                disabled={reelLoading}
                                                title="Convert this image into a short video reel"
                                            >
                                                {reelLoading ? <Loader2 size={11} className="ps-spin" /> : <Video size={11} />}
                                                Make Reel
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Reel job result */}
                                {reelResult && (
                                    <div className="ps-info-bar" style={{ marginTop: 8, fontSize: 11 }}>
                                        <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                                        Reel job queued — {reelResult.message || 'Check Background Jobs for the video'}
                                    </div>
                                )}
                            </div>

                            {/* Caption panel */}
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 10 }}>
                                    Ready-to-Publish Copy
                                </div>
                                {activeCaption ? (
                                    <>
                                        {activeCaption.caption && (
                                            <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sys-primary)' }}>
                                                        Caption
                                                    </div>
                                                    <button
                                                        className="ps-btn-ghost"
                                                        style={{ padding: '3px 8px', fontSize: 10, gap: 4 }}
                                                        onClick={() => copyText(activeCaption.caption, setCopied, 'caption')}
                                                    >
                                                        {copied === 'caption' ? <CheckCircle2 size={10} style={{ color: '#10b981' }} /> : <Copy size={10} />}
                                                        {copied === 'caption' ? 'Copied!' : 'Copy'}
                                                    </button>
                                                </div>
                                                <div className="ps-caption-text">{activeCaption.caption}</div>
                                            </div>
                                        )}
                                        {activeCaption.sticker_text && (
                                            <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', marginBottom: 6 }}>Story Sticker CTA</div>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-text)' }}>{activeCaption.sticker_text}</div>
                                            </div>
                                        )}
                                        {activeCaption.hashtags && (
                                            <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Hash size={10} /> Hashtags
                                                    </div>
                                                    <button
                                                        className="ps-btn-ghost"
                                                        style={{ padding: '3px 8px', fontSize: 10, gap: 4 }}
                                                        onClick={() => copyText(activeCaption.hashtags, setCopied, 'tags')}
                                                    >
                                                        <Copy size={10} /> {copied === 'tags' ? 'Copied!' : 'Copy'}
                                                    </button>
                                                </div>
                                                <div className="ps-hashtags">{activeCaption.hashtags}</div>
                                            </div>
                                        )}
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

                    {/* Download all + Regenerate */}
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 6, fontSize: 12 }}>
                            <RefreshCw size={13} /> Regenerate All
                        </button>
                        <button
                            className="ps-btn-primary"
                            style={{ gap: 6, fontSize: 12 }}
                            onClick={() => result.kitImages?.forEach(kit => {
                                if (kit.imageUrl) downloadImage(kit.imageUrl, `${kit.platform}-${kitType}.png`)
                            })}
                        >
                            <Download size={13} /> Download All ({result.kitImages?.filter(k => k.success).length} images)
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

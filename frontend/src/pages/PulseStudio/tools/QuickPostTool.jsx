/**
 * QuickPostTool v2 — Pulse Creative Brain Edition
 *
 * Single-platform post with full creative brain + avatar config.
 * Passes avatarConfig and typographyDNA to backend.
 */

import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, Download, RefreshCw, Video, CheckCircle2 } from 'lucide-react'
import AvatarConfigPanel from './AvatarConfigPanel'

const STAGES = [
    'Pulse Creative Brain analyzing brief…',
    'Art Director choosing design aesthetic…',
    'Generating visual with human presence…',
    'Copywriter writing platform caption…',
]

export default function QuickPostTool({ sharedContext, brandId, avatarConfig, onAvatarConfigChange }) {
    const [brief, setBrief]       = useState('')
    const [platform, setPlatform] = useState('instagram')
    const [loading, setLoading]   = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]     = useState(null)
    const [error, setError]       = useState('')
    const [reelQueued, setReelQueued] = useState(false)

    const PLATFORMS = ['instagram', 'facebook', 'twitter', 'linkedin']

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0); setReelQueued(false)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 3500)
        try {
            const data = await apiFetch('/brand-studio/quick-post', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 120000,
                body: JSON.stringify({
                    productDNA:    sharedContext?.productDNA,
                    productData:   sharedContext?.productData,
                    productImages: sharedContext?.productImages,
                    designContext: sharedContext?.designContext,
                    brief, platform, brandId,
                    // Creative Brain inputs
                    avatarConfig:   avatarConfig?.enabled ? avatarConfig : null,
                    typographyDNA:  sharedContext?.productDNA?.typographyDNA || null,
                    usePulseCreativeBrain: true,
                }),
            })
            if (data.success) setResult(data)
            else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        clearInterval(ticker)
        setLoading(false)
    }

    const handleMakeReel = async () => {
        if (!result?.imageUrl) return
        try {
            const data = await apiFetch('/brand-studio/social-kit/make-reel', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
                body: JSON.stringify({
                    imageUrl: result.imageUrl,
                    platform,
                    duration: 10,
                    motionStyle: 'cinematic-drift',
                    brandId,
                    avatarConfig: avatarConfig?.enabled ? avatarConfig : null,
                }),
            })
            if (data.success) setReelQueued(true)
        } catch (e) { console.warn('Reel queue failed:', e.message) }
    }

    return (
        <div>
            {/* Platform */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {PLATFORMS.map(p => (
                    <button
                        key={p}
                        className={`ps-btn-${platform === p ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 11, padding: '6px 12px', textTransform: 'capitalize' }}
                        onClick={() => setPlatform(p)}
                        disabled={loading}
                    >
                        {p}
                    </button>
                ))}
            </div>

            {/* Brief */}
            <textarea
                className="ps-textarea"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Brief: what's the hook, goal, or message? (optional but recommended)"
                rows={2}
                disabled={loading}
                style={{ marginTop: 0, marginBottom: 12 }}
            />

            {/* Avatar config */}
            {onAvatarConfigChange && (
                <AvatarConfigPanel
                    config={avatarConfig}
                    onChange={onAvatarConfigChange}
                    compact={false}
                    disabled={loading}
                />
            )}

            {/* Generate */}
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Post · 3 credits</>}
            </button>

            {error && <div className="ps-error-bar">{error}</div>}

            {result && (
                <div className="ps-fade-in">
                    {result.imageUrl && (
                        <img
                            src={result.imageUrl}
                            alt="Post"
                            style={{ width: '100%', borderRadius: 10, border: '1px solid var(--sys-border)', marginBottom: 10 }}
                            onError={e => e.target.style.display='none'}
                        />
                    )}
                    {result.caption && (
                        <div className="ps-caption-box" style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', marginBottom: 6, textTransform: 'uppercase' }}>Caption</div>
                            <div className="ps-caption-text">{result.caption}</div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}>
                            <RefreshCw size={11} /> Redo
                        </button>
                        {result.imageUrl && (
                            <a href={result.imageUrl} download="post.png" className="ps-btn-ghost" style={{ fontSize: 11, gap: 5, textDecoration: 'none' }}>
                                <Download size={11} /> Download
                            </a>
                        )}
                        {result.imageUrl && !reelQueued && (
                            <button className="ps-btn-secondary" onClick={handleMakeReel} style={{ gap: 5, fontSize: 11 }}>
                                <Video size={11} /> Make Reel
                            </button>
                        )}
                        {reelQueued && (
                            <span style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={11} /> Reel queued — check Background Jobs
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

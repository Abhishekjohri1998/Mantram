/**
 * LandingPageTool v2 — Pulse Creative Brain Edition
 *
 * Passes avatarConfig (lifestyle default for landing pages) and typographyDNA to the backend.
 * The landing page hero image uses a lifestyle human presence by default.
 */

import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, ExternalLink, RefreshCw, User } from 'lucide-react'
import AvatarConfigPanel from './AvatarConfigPanel'

const STAGES = [
    'Pulse Creative Brain designing page strategy…',
    'Generating hero lifestyle image…',
    'Building interactive page with GSAP…',
    'Uploading to CDN…',
]

// Landing pages default to "lifestyle" human presence — not spokesperson
const LANDING_AVATAR_DEFAULTS = { intent: 'lifestyle' }

export default function LandingPageTool({ sharedContext, brandId, avatarConfig, onAvatarConfigChange }) {
    const [brief, setBrief]   = useState('')
    const [loading, setLoading] = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]   = useState(null)
    const [error, setError]     = useState('')
    const [humanMode, setHumanMode] = useState(true) // Landing pages default to human lifestyle hero

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 5500)
        try {
            const data = await apiFetch('/brand-studio/landing-page/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 180000,
                body: JSON.stringify({
                    productDNA:    sharedContext?.productDNA,
                    productData:   sharedContext?.productData,
                    productImages: sharedContext?.productImages,
                    designContext: sharedContext?.designContext || null,
                    brandId,
                    // brief is optional — backend defaults to product name/category if empty
                    brief: brief || sharedContext?.productData?.title || sharedContext?.productDNA?.productCategory || 'Product landing page',
                    // Creative Brain inputs
                    avatarConfig:  humanMode && avatarConfig
                        ? { ...avatarConfig, enabled: true, intent: 'lifestyle' }
                        : null,
                    typographyDNA: sharedContext?.productDNA?.typographyDNA || null,
                    usePulseCreativeBrain: true,
                }),
            })
            console.log('✅ Landing page result:', { success: data.success, hostedUrl: data.hostedUrl, pageName: data.pageName, hasHtml: !!data.html, sectionCount: data.sectionCount })
            if (data.success) setResult(data)
            else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        clearInterval(ticker)
        setLoading(false)
    }

    return (
        <div>
            <textarea
                className="ps-textarea"
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Brief: what's the conversion goal? (purchase, signup, enquiry…), primary CTA text, any offers or social proof to include"
                rows={2}
                disabled={loading}
                style={{ marginTop: 0, marginBottom: 12 }}
            />

            {/* Human hero toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)' }}>
                    Hero Image
                </div>
                <button
                    onClick={() => setHumanMode(false)}
                    className={`ps-btn-${!humanMode ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 11, padding: '5px 11px' }}
                    disabled={loading}
                >
                    Product focused
                </button>
                <button
                    onClick={() => setHumanMode(true)}
                    className={`ps-btn-${humanMode ? 'primary' : 'ghost'}`}
                    style={{ fontSize: 11, padding: '5px 11px', gap: 5 }}
                    disabled={loading}
                >
                    <User size={12} /> Lifestyle human
                </button>
            </div>

            {/* Avatar panel when human mode is on */}
            {humanMode && onAvatarConfigChange && (
                <AvatarConfigPanel
                    config={{ ...avatarConfig, enabled: true, intent: 'lifestyle' }}
                    onChange={cfg => onAvatarConfigChange({ ...cfg, intent: 'lifestyle' })}
                    compact={false}
                    disabled={loading}
                />
            )}

            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Landing Page · 12 credits</>}
            </button>

            {error && <div className="ps-error-bar">{error}</div>}

            {result && (
                <div className="ps-fade-in">
                    {/* Page meta */}
                    {(result.pageName || result.metaTitle) && (
                        <div style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 9, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, color: 'var(--sys-text)', marginBottom: 2 }}>{result.pageName || result.metaTitle}</div>
                            {result.metaDescription && <div style={{ color: 'var(--sys-text-muted)', fontSize: 11 }}>{result.metaDescription}</div>}
                            {result.sectionCount && <div style={{ color: 'var(--sys-primary)', fontSize: 10, marginTop: 4 }}>{result.sectionCount} sections · GSAP animated · {result.creditsUsed || 12} credits used</div>}
                        </div>
                    )}

                    {/* Live preview — prefer srcdoc (always works) over iframe src (can be blocked by S3 X-Frame-Options) */}
                    {result.html ? (
                        <div style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                            <div style={{ background: 'var(--sys-surface)', borderBottom: '1px solid var(--sys-border)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--sys-text-muted)' }}>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {['#ef4444','#f59e0b','#10b981'].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />)}
                                </div>
                                <div style={{ flex: 1, background: 'var(--sys-bg)', borderRadius: 4, padding: '2px 8px', fontSize: 9 }}>{result.hostedUrl || result.slug || 'preview'}</div>
                            </div>
                            <iframe
                                srcDoc={result.html}
                                style={{ width: '100%', height: 460, border: 'none', display: 'block' }}
                                title="Landing Page Preview"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                    ) : result.hostedUrl ? (
                        /* Fallback: iframe src if no html body but hosted URL exists */
                        <div style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                            <iframe
                                src={result.hostedUrl}
                                style={{ width: '100%', height: 460, border: 'none', display: 'block' }}
                                title="Landing Page Preview"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                    ) : result.thumbnailUrl ? (
                        /* Last fallback: thumbnail image */
                        <div style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                            <img src={result.thumbnailUrl} alt="Landing page preview" style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }} />
                        </div>
                    ) : null}

                    {/* Embed code (copyable) */}
                    {result.embedCode && (
                        <details style={{ marginBottom: 12 }}>
                            <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--sys-text-muted)', padding: '6px 0' }}>📋 Embed Code</summary>
                            <pre style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 8, padding: 12, fontSize: 10, color: 'var(--sys-text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 6 }}
                                onClick={e => { navigator.clipboard.writeText(result.embedCode); e.target.style.borderColor = 'var(--sys-primary)'; setTimeout(() => e.target.style.borderColor = '', 1000) }}
                            >{result.embedCode}</pre>
                        </details>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}><RefreshCw size={11} /> Regenerate</button>
                        {result.hostedUrl && (
                            <a href={result.hostedUrl} target="_blank" rel="noreferrer" className="ps-btn-primary" style={{ fontSize: 11, gap: 5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}>
                                <ExternalLink size={11} /> Open Live Page
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

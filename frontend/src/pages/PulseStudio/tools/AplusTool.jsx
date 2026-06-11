/**
 * AplusTool — thin wrapper that delegates to the existing A+ generation UI from PulseStudio.
 * The old monolith still owns the A+ generation logic. We just extract the relevant component
 * and pass sharedContext as productContext so it auto-fills from the new phase flow.
 */
import React, { useState, useEffect } from 'react'
import { apiFetch } from '../../../services/api'
import {
    Sparkles, Loader2, Download, ExternalLink, RefreshCw,
    ChevronDown, ChevronUp, Image as ImageIcon
} from 'lucide-react'

const APLUS_STAGES = [
    'Analyzing product data & images…',
    'Claude Opus crafting A+ strategy…',
    'Generating product imagery with GPT Image 2…',
    'Building premium A+ layout…',
    'Applying Amazon brand guidelines…',
]

export default function AplusTool({ sharedContext, brandId, variant = 'premium' }) {
    const [brief, setBrief]       = useState('')
    const [loading, setLoading]   = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]     = useState(null)
    const [error, setError]       = useState('')
    const [showHtml, setShowHtml] = useState(false)

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, APLUS_STAGES.length - 1)), 4500)
        try {
            const data = await apiFetch('/brand-studio/aplus/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 300000, // 5 min timeout for LLM strategy + parallel image gen
                body: JSON.stringify({
                    productDNA:    sharedContext?.productDNA,
                    productData:   sharedContext?.productData,
                    productImages: sharedContext?.productImages,
                    designContext: sharedContext?.designContext,
                    brief, brandId,
                    listingTier:   variant === 'basic' ? 'standard' : 'premium',
                    tier:          variant === 'basic' ? 'A' : 'A+',
                }),
            })
            if (data.success) setResult(data)
            else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        clearInterval(ticker)
        setLoading(false)
    }

    return (
        <div>
            <div style={{ marginBottom: 14 }}>
                <textarea
                    className="ps-textarea"
                    value={brief}
                    onChange={e => setBrief(e.target.value)}
                    placeholder="Optional brief: target audience, key USPs to emphasize, competitor differentiators…"
                    rows={2}
                    disabled={loading}
                    style={{ marginTop: 0 }}
                />
            </div>

            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
                {loading ? (
                    <><Loader2 size={15} className="ps-spin" />{APLUS_STAGES[stageIdx]}</>
                ) : (
                    <><Sparkles size={15} />Generate Amazon {variant === 'basic' ? 'A' : 'A+'} Content · {variant === 'basic' ? 5 : 8} credits</>
                )}
            </button>

            {error && <div className="ps-error-bar" style={{ marginBottom: 12 }}>{error}</div>}

            {result && (
                <div className="ps-fade-in">
                    {/* Module previews */}
                    {result.modules?.map((mod, i) => (
                        <div key={i} style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
                            {mod.imageUrl && (
                                <img src={mod.imageUrl} alt={mod.headline} style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                            )}
                            <div style={{ padding: '10px 12px' }}>
                                {mod.headline && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 4 }}>{mod.headline}</div>}
                                {mod.body && <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.6 }}>{mod.body}</div>}
                            </div>
                        </div>
                    ))}

                    {/* HTML Export */}
                    {result.html && (
                        <div style={{ marginBottom: 12 }}>
                            <button
                                className="ps-btn-ghost"
                                style={{ fontSize: 11, gap: 5 }}
                                onClick={() => setShowHtml(!showHtml)}
                            >
                                {showHtml ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showHtml ? 'Hide' : 'View'} HTML
                            </button>
                            {showHtml && (
                                <textarea
                                    readOnly
                                    value={result.html}
                                    rows={8}
                                    style={{ width: '100%', marginTop: 8, padding: 10, fontSize: 10, fontFamily: 'monospace', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 8, color: 'var(--sys-text-muted)', resize: 'vertical' }}
                                />
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 6, fontSize: 12 }}>
                            <RefreshCw size={12} /> Regenerate
                        </button>
                        {result.html && (
                            <button
                                className="ps-btn-primary"
                                style={{ gap: 6, fontSize: 12, marginLeft: 'auto' }}
                                onClick={() => {
                                    const blob = new Blob([result.html], { type: 'text/html' })
                                    const a = document.createElement('a')
                                    a.href = URL.createObjectURL(blob)
                                    a.download = `aplus-${variant}-content.html`; a.click()
                                }}
                            >
                                <Download size={13} /> Download HTML
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

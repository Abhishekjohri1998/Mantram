import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, Download, RefreshCw, ExternalLink, Presentation, FileDown } from 'lucide-react'

const STAGES = ['Analyzing campaign brief…', 'Claude Opus planning slide structure…', 'Generating slide visuals…', 'Assembling presentation…', 'Applying design system…']

export default function DeckTool({ sharedContext, brandId }) {
    const [brief, setBrief] = useState('')
    const [loading, setLoading] = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]   = useState(null)
    const [error, setError]     = useState('')

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 5000)
        try {
            const data = await apiFetch('/brand-studio/deck/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 240000, // 4 min timeout for deck generation
                body: JSON.stringify({
                    productDNA: sharedContext?.productDNA, productData: sharedContext?.productData,
                    productImages: sharedContext?.productImages, designContext: sharedContext?.designContext,
                    brief, brandId,
                }),
            })
            if (data.success) setResult(data)
            else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        clearInterval(ticker)
        setLoading(false)
    }

    // Extract slides from the correct response path: deckPlan.slides
    const slides = result?.deckPlan?.slides || result?.slides || []
    const images = result?.images || {}
    const hostedUrl = result?.hostedUrl || result?.downloadUrl || null

    return (
        <div>
            <textarea className="ps-textarea" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Brief: who is the audience, what is the deck for? (investor, distributor, sales pitch…)" rows={2} disabled={loading} style={{ marginTop: 0, marginBottom: 12 }} />
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Pitch Deck · 10 credits</>}
            </button>
            {error && <div className="ps-error-bar">{error}</div>}
            {result && (
                <div className="ps-fade-in">
                    {/* Deck header with title and slide count */}
                    {result.deckPlan?.title && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '10px 12px', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10 }}>
                            <Presentation size={16} style={{ color: 'var(--sys-primary)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{result.deckPlan.title}</div>
                                {result.deckPlan.subtitle && <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 2 }}>{result.deckPlan.subtitle}</div>}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', background: 'var(--sys-surface)', padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                                {result.slideCount || slides.length} slides
                            </div>
                        </div>
                    )}

                    {/* Slide preview cards — show up to 3 */}
                    {slides.slice(0, 3).map((slide, i) => {
                        const imgUrl = images[slide.id] || slide.imageUrl || null
                        return (
                            <div key={slide.id || i} style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                                {imgUrl && <img src={imgUrl} alt={slide.headline} style={{ width: '100%', display: 'block', maxHeight: 180, objectFit: 'cover' }} onError={e => e.target.style.display='none'} />}
                                <div style={{ padding: '10px 12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        {slide.headline && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', flex: 1 }}>{slide.headline}</div>}
                                        <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', background: 'var(--sys-surface)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{slide.type}</span>
                                    </div>
                                    {slide.body && <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.6 }}>{slide.body}</div>}
                                    {slide.stat && <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--sys-primary)', marginTop: 4 }}>{slide.stat.number} <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--sys-text-muted)' }}>{slide.stat.label}</span></div>}
                                    {slide.items && (
                                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                            {slide.items.map((item, j) => (
                                                <div key={j} style={{ fontSize: 10, color: 'var(--sys-text-muted)', background: 'var(--sys-surface)', padding: '3px 8px', borderRadius: 6 }}>
                                                    {item.icon || '•'} {item.title}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                    {slides.length > 3 && (
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', padding: '6px 0', textAlign: 'center' }}>
                            +{slides.length - 3} more slides in full deck
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}><RefreshCw size={11} /> Regenerate</button>
                        {hostedUrl && (
                            <a href={hostedUrl} target="_blank" rel="noreferrer" className="ps-btn-primary" style={{ fontSize: 11, gap: 5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                <ExternalLink size={11} /> Open Full Deck
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, Download, RefreshCw, ExternalLink } from 'lucide-react'

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

    return (
        <div>
            <textarea className="ps-textarea" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Brief: who is the audience, what is the deck for? (investor, distributor, sales pitch…)" rows={2} disabled={loading} style={{ marginTop: 0, marginBottom: 12 }} />
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Pitch Deck · 10 credits</>}
            </button>
            {error && <div className="ps-error-bar">{error}</div>}
            {result && (
                <div className="ps-fade-in">
                    {result.slides?.slice(0, 3).map((slide, i) => (
                        <div key={i} style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                            {slide.imageUrl && <img src={slide.imageUrl} alt={slide.headline} style={{ width: '100%', display: 'block', maxHeight: 180, objectFit: 'cover' }} onError={e => e.target.style.display='none'} />}
                            <div style={{ padding: '10px 12px' }}>
                                {slide.headline && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 3 }}>{slide.headline}</div>}
                                {slide.body && <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.6 }}>{slide.body}</div>}
                            </div>
                        </div>
                    ))}
                    {result.slides?.length > 3 && (
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', padding: '6px 0', textAlign: 'center' }}>
                            +{result.slides.length - 3} more slides
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}><RefreshCw size={11} /> Regenerate</button>
                        {result.downloadUrl && <a href={result.downloadUrl} target="_blank" rel="noreferrer" className="ps-btn-primary" style={{ fontSize: 11, gap: 5, textDecoration: 'none' }}><ExternalLink size={11} /> Open Deck</a>}
                    </div>
                </div>
            )}
        </div>
    )
}

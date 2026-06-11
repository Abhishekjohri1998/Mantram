import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, ExternalLink, RefreshCw } from 'lucide-react'

const STAGES = ['Gathering live market intelligence…', 'Claude designing page strategy…', 'Generating brand images…', 'Building interactive page with GSAP…', 'Uploading to CDN…']

export default function LandingPageTool({ sharedContext, brandId }) {
    const [brief, setBrief]   = useState('')
    const [loading, setLoading] = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]   = useState(null)
    const [error, setError]     = useState('')

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 5500)
        try {
            const data = await apiFetch('/brand-studio/landing-page/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
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
            <textarea className="ps-textarea" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Brief: what's the conversion goal? (purchase, signup, enquiry…), primary CTA text, any offers or social proof to include" rows={2} disabled={loading} style={{ marginTop: 0, marginBottom: 12 }} />
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Landing Page · 12 credits</>}
            </button>
            {error && <div className="ps-error-bar">{error}</div>}
            {result && (
                <div className="ps-fade-in">
                    {result.pageUrl && (
                        <div style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
                            <iframe src={result.pageUrl} style={{ width: '100%', height: 420, border: 'none', display: 'block' }} title="Landing Page Preview" />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}><RefreshCw size={11} /> Regenerate</button>
                        {result.pageUrl && (
                            <a href={result.pageUrl} target="_blank" rel="noreferrer" className="ps-btn-primary" style={{ fontSize: 11, gap: 5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', marginLeft: 'auto' }}>
                                <ExternalLink size={11} /> Open Live Page
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

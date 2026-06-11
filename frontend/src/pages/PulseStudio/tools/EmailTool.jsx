import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, Download, RefreshCw, ExternalLink } from 'lucide-react'

const STAGES = ['Analyzing campaign brief…', 'Claude writing email copy…', 'Generating email visuals…', 'Compiling responsive HTML…', 'Email ready!']

export default function EmailTool({ sharedContext, brandId }) {
    const [brief, setBrief]       = useState('')
    const [emailType, setEmailType] = useState('product-launch')
    const [loading, setLoading]   = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]     = useState(null)
    const [error, setError]       = useState('')

    const EMAIL_TYPES = [
        { id: 'product-launch', label: 'Launch' },
        { id: 'promo',          label: 'Promo'  },
        { id: 'newsletter',     label: 'Newsletter' },
    ]

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 4000)
        try {
            const data = await apiFetch('/brand-studio/email/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productDNA: sharedContext?.productDNA, productData: sharedContext?.productData,
                    productImages: sharedContext?.productImages, designContext: sharedContext?.designContext,
                    brief, emailType, brandId,
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
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {EMAIL_TYPES.map(t => (
                    <button key={t.id} className={`ps-btn-${emailType === t.id ? 'primary' : 'ghost'}`} style={{ fontSize: 11, padding: '6px 12px' }} onClick={() => setEmailType(t.id)} disabled={loading}>{t.label}</button>
                ))}
            </div>
            <textarea className="ps-textarea" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Optional: target list, subject line ideas, tone of voice, offer details…" rows={2} disabled={loading} style={{ marginTop: 0, marginBottom: 12 }} />
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Email · 6 credits</>}
            </button>
            {error && <div className="ps-error-bar">{error}</div>}
            {result && (
                <div className="ps-fade-in">
                    {result.html && (
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', marginBottom: 12 }}>
                            <iframe srcDoc={result.html} style={{ width: '100%', height: 400, border: 'none', display: 'block' }} title="Email Preview" />
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}><RefreshCw size={11} /> Regenerate</button>
                        {result.html && (
                            <button className="ps-btn-primary" style={{ fontSize: 11, gap: 5, marginLeft: 'auto' }} onClick={() => {
                                const blob = new Blob([result.html], { type: 'text/html' })
                                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'email-campaign.html'; a.click()
                            }}><Download size={11} /> Download HTML</button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

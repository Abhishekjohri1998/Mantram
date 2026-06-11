import React, { useState } from 'react'
import { apiFetch } from '../../../services/api'
import { Sparkles, Loader2, Download, RefreshCw, ExternalLink } from 'lucide-react'

const STAGES = ['Analyzing market context…', 'Claude writing content strategy…', 'Generating visuals…', 'Building your post…']

export default function QuickPostTool({ sharedContext, brandId }) {
    const [brief, setBrief]   = useState('')
    const [platform, setPlatform] = useState('instagram')
    const [loading, setLoading] = useState(false)
    const [stageIdx, setStageIdx] = useState(0)
    const [result, setResult]   = useState(null)
    const [error, setError]     = useState('')

    const PLATFORMS = ['instagram','facebook','twitter','linkedin']

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null); setStageIdx(0)
        const ticker = setInterval(() => setStageIdx(i => Math.min(i + 1, STAGES.length - 1)), 3500)
        try {
            const data = await apiFetch('/brand-studio/quick-post', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                timeout: 120000, // 2 min timeout for quick post gen
                body: JSON.stringify({
                    productDNA:    sharedContext?.productDNA,
                    productData:   sharedContext?.productData,
                    productImages: sharedContext?.productImages,
                    designContext: sharedContext?.designContext,
                    brief, platform, brandId,
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
            <textarea className="ps-textarea" value={brief} onChange={e => setBrief(e.target.value)} placeholder="Brief: what's the hook, goal, or message?" rows={2} disabled={loading} style={{ marginTop: 0, marginBottom: 12 }} />
            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 14 }}>
                {loading ? <><Loader2 size={14} className="ps-spin" />{STAGES[stageIdx]}</> : <><Sparkles size={14} />Generate Post · 3 credits</>}
            </button>
            {error && <div className="ps-error-bar">{error}</div>}
            {result && (
                <div className="ps-fade-in">
                    {result.imageUrl && <img src={result.imageUrl} alt="Post" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--sys-border)', marginBottom: 10 }} onError={e => e.target.style.display='none'} />}
                    {result.caption && (
                        <div className="ps-caption-box">
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', marginBottom: 6, textTransform: 'uppercase' }}>Caption</div>
                            <div className="ps-caption-text">{result.caption}</div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 5, fontSize: 11 }}><RefreshCw size={11} /> Redo</button>
                        {result.imageUrl && <a href={result.imageUrl} download="post.png" className="ps-btn-ghost" style={{ fontSize: 11, gap: 5, textDecoration: 'none' }}><Download size={11} /> Download</a>}
                    </div>
                </div>
            )}
        </div>
    )
}

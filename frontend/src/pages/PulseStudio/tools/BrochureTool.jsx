import React, { useState, useRef } from 'react'
import { FileText, Download, ExternalLink, Loader2, Sparkles, RefreshCw, Printer } from 'lucide-react'
import { apiFetch } from '../../../services/api'

export default function BrochureTool({ sharedContext, brandId }) {
    const [brief, setBrief]   = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult]   = useState(null)
    const [error, setError]     = useState('')
    const [activeView, setActiveView] = useState('front') // front | back | html
    const iframeRef = useRef()

    const handleGenerate = async () => {
        setLoading(true); setError(''); setResult(null)
        try {
            const data = await apiFetch('/brand-studio/brochure/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productDNA:    sharedContext?.productDNA,
                    productData:   sharedContext?.productData,
                    designContext: sharedContext?.designContext,
                    brandId, brief,
                }),
            })
            if (data.success) setResult(data)
            else setError(data.error || 'Generation failed')
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    const downloadPDF = async () => {
        try {
            const { default: html2pdf } = await import('html2pdf.js')
            const iframe = iframeRef.current
            const doc = iframe?.contentDocument
            if (!doc) return
            const element = doc.body
            html2pdf().set({
                margin: 0,
                filename: `${result?.productName || 'brochure'}.pdf`,
                html2canvas: { scale: 2, useCORS: true, allowTaint: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(element).save()
        } catch (e) {
            // Fallback: open print dialog
            iframeRef.current?.contentWindow?.print()
        }
    }

    return (
        <div>
            {/* Brief input */}
            <div style={{ marginBottom: 14 }}>
                <textarea
                    className="ps-textarea"
                    value={brief}
                    onChange={e => setBrief(e.target.value)}
                    placeholder="Optional brief: target audience, key message, distributor pitch, export market… (AI uses your product DNA by default)"
                    rows={2}
                    disabled={loading}
                    style={{ marginTop: 0 }}
                />
            </div>

            <button className="ps-btn-primary" onClick={handleGenerate} disabled={loading} style={{ width: '100%', marginBottom: 16 }}>
                {loading ? (
                    <><Loader2 size={15} className="ps-spin" />Building A4 brochure + AI images…</>
                ) : (
                    <><Sparkles size={15} />Generate Brochure — Front + Back · 12 credits</>
                )}
            </button>

            {error && <div className="ps-error-bar" style={{ marginBottom: 12 }}>{error}</div>}

            {loading && (
                <div className="ps-analysis-card">
                    {[
                        'Crafting brochure copy with Claude…',
                        'Generating hero image with GPT Image 2…',
                        'Generating lifestyle back image…',
                        'Building print-ready HTML layout…',
                    ].map((s, i) => (
                        <div key={i} className="ps-analysis-step active">
                            <Loader2 size={13} className="ps-spin" style={{ color: 'var(--sys-primary)', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>{s}</span>
                        </div>
                    ))}
                </div>
            )}

            {result && (
                <div className="ps-fade-in">
                    {/* View toggle */}
                    <div className="ps-category-tabs" style={{ marginBottom: 14 }}>
                        <button className={`ps-cat-tab ${activeView === 'front' ? 'active' : ''}`} onClick={() => setActiveView('front')}>
                            <FileText size={12} /> Front Page
                        </button>
                        <button className={`ps-cat-tab ${activeView === 'back' ? 'active' : ''}`} onClick={() => setActiveView('back')}>
                            <FileText size={12} /> Back Page
                        </button>
                        <button className={`ps-cat-tab ${activeView === 'full' ? 'active' : ''}`} onClick={() => setActiveView('full')}>
                            <ExternalLink size={12} /> Full Preview
                        </button>
                    </div>

                    {/* Preview */}
                    {activeView === 'front' && result.frontImageUrl && (
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', marginBottom: 14, maxWidth: 400, margin: '0 auto 14px' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sys-text-muted)', padding: '6px 10px', background: 'var(--sys-surface)', borderBottom: '1px solid var(--sys-border)' }}>Front Cover</div>
                            <img src={result.frontImageUrl} alt="Brochure Front" style={{ width: '100%', display: 'block' }} onError={e => e.target.style.display='none'} />
                            <div style={{ padding: '10px 12px', background: 'var(--sys-surface)', borderTop: '1px solid var(--sys-border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-text)' }}>{result.content?.front?.headline}</div>
                                <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 3 }}>{result.content?.front?.subheadline}</div>
                            </div>
                        </div>
                    )}

                    {activeView === 'back' && result.backImageUrl && (
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', marginBottom: 14 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sys-text-muted)', padding: '6px 10px', background: 'var(--sys-surface)', borderBottom: '1px solid var(--sys-border)' }}>Back Panel</div>
                            <img src={result.backImageUrl} alt="Brochure Back" style={{ width: '100%', display: 'block' }} onError={e => e.target.style.display='none'} />
                            {result.content?.back?.features?.length > 0 && (
                                <div style={{ padding: '12px 14px', background: 'var(--sys-surface)', borderTop: '1px solid var(--sys-border)' }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Key Features</div>
                                    {result.content.back.features.slice(0, 4).map((f, i) => (
                                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sys-primary)', marginTop: 5, flexShrink: 0 }} />
                                            <div>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-text)' }}>{f.title}</div>
                                                <div style={{ fontSize: 10.5, color: 'var(--sys-text-muted)' }}>{f.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeView === 'full' && result.html && (
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', marginBottom: 14 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--sys-text-muted)', padding: '6px 10px', background: 'var(--sys-surface)', borderBottom: '1px solid var(--sys-border)' }}>Full Brochure (A4)</div>
                            <iframe
                                ref={iframeRef}
                                srcDoc={result.html}
                                style={{ width: '100%', height: 600, border: 'none', display: 'block' }}
                                title="Brochure Preview"
                            />
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="ps-btn-secondary" onClick={handleGenerate} disabled={loading} style={{ gap: 6, fontSize: 12 }}>
                            <RefreshCw size={12} /> Regenerate
                        </button>
                        {result.hostedUrl && (
                            <a href={result.hostedUrl} target="_blank" rel="noreferrer" className="ps-btn-secondary" style={{ gap: 6, fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                                <ExternalLink size={12} /> Open Hosted
                            </a>
                        )}
                        <button className="ps-btn-primary" onClick={downloadPDF} style={{ gap: 6, fontSize: 12, marginLeft: 'auto' }}>
                            <Download size={13} /> Download PDF
                        </button>
                        {result.frontImageUrl && (
                            <button
                                className="ps-btn-secondary"
                                style={{ gap: 6, fontSize: 12 }}
                                onClick={() => {
                                    fetch(result.frontImageUrl).then(r => r.blob()).then(blob => {
                                        const a = document.createElement('a')
                                        a.href = URL.createObjectURL(blob)
                                        a.download = `${result.productName || 'brochure'}-front.jpg`
                                        a.click()
                                    })
                                }}
                            >
                                <Download size={12} /> Front Image
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

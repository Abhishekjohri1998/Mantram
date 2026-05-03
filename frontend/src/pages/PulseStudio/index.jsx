import React, { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import DashboardLayout from '../../components/DashboardLayout'
import { useBrand } from '../../context/BrandContext'
import { apiFetch } from '../../services/api'

// ── Image download helper (bypasses CORS on external CDN images) ──────────────
async function downloadImageFile(imageUrl, filename) {
    try {
        // Fetch the image and create a local blob URL for CORS-safe download
        const response = await fetch(imageUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = filename || 'image.jpg'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000)
    } catch (err) {
        // CORS fallback — open in new tab
        window.open(imageUrl, '_blank')
    }
}

// ── Shared ──────────────────────────────────────────────────────────

const DECK_STAGES = [
    "Researching your campaign context...",
    "Claude Opus planning slide strategy...",
    "Generating slide visuals with NanoBanana 2...",
    "Assembling your presentation...",
    "Applying premium design system..."
]

const PAGE_STAGES = [
    "Gathering live market intelligence...",
    "Claude designing page strategy...",
    "Generating brand images...",
    "Building interactive page with GSAP...",
    "Uploading to CDN..."
]

const MAIL_STAGES = [
    "Analyzing your campaign brief...",
    "Claude writing your email copy...",
    "Generating email visuals...",
    "Compiling responsive HTML...",
    "Email ready!"
]

function useGenerate(stagesList) {
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [stageText, setStageText] = useState('')
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    
    // Timer refs
    const stageInterval = useRef(null)
    const progressInterval = useRef(null)

    const start = () => {
        setResult(null); setError(''); setLoading(true); setProgress(0)
        setStageText(stagesList[0])
        
        // Progress smoothly to 90%
        progressInterval.current = setInterval(() => {
            setProgress(p => Math.min(p + (90 - p) * 0.05, 90))
        }, 1000)

        // Morph status
        let idx = 0
        stageInterval.current = setInterval(() => {
            idx = Math.min(idx + 1, stagesList.length - 2) // keep last for finish
            setStageText(stagesList[idx])
        }, 4000)
    }

    const stop = (isSuccess) => {
        clearInterval(progressInterval.current)
        clearInterval(stageInterval.current)
        if (isSuccess) {
            setProgress(100)
            setStageText(stagesList[stagesList.length - 1])
            setTimeout(() => { setLoading(false) }, 1000)
        } else {
            setLoading(false)
        }
    }

    const reset = () => { setResult(null); setProgress(0); setError('') }

    return { loading, progress, stageText, result, setResult, error, setError, start, stop, reset }
}

// ── UI Components ──────────────────────────────────────────────────────────

function InputForm({ brief, setBrief, urlContext, setUrlContext, referenceImage, setReferenceImage, onGenerate, loading, buttonColor, toolName, credits, productContext }) {
    const [urlInput, setUrlInput] = useState('')
    const [fetchingUrl, setFetchingUrl] = useState(false)

    // ── Auto-fill from product context (scanned in Step 1) ──
    useEffect(() => {
        if (productContext?.productDNA) {
            const dna = productContext.productDNA
            const pd = productContext.productData || {}
            const ctx = [
                pd.title ? `Product Name: ${pd.title}` : '',
                pd.brand ? `Brand: ${pd.brand}` : '',
                dna.productCategory ? `Category: ${dna.productCategory}` : '',
                dna.materials ? `Materials: ${dna.materials}` : '',
                dna.surfaceFinish ? `Surface: ${dna.surfaceFinish}` : '',
                dna.dominantColors?.length ? `Colors: ${dna.dominantColors.map(c => c.name).join(', ')}` : '',
                productContext.moodLabel ? `Mood: ${productContext.moodLabel}` : '',
                pd.features?.length ? `Features: ${pd.features.join(', ')}` : '',
                pd.price ? `Price: ${pd.price}` : '',
            ].filter(Boolean).join('\n')
            if (ctx) setUrlContext(ctx)
            // Use first product image as reference if none set
            if (!referenceImage && productContext.productImages?.length > 0) {
                setReferenceImage(productContext.productImages[0])
            }
        }
    }, [productContext])

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => setReferenceImage(reader.result);
        reader.readAsDataURL(file);
    };

    const handleFetchUrl = async () => {
        if (!urlInput) return;
        setFetchingUrl(true)
        try {
            const res = await apiFetch('/brand-studio/fetch-url', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: urlInput })
            })
            if (res.success) {
                const ctx = `Product Name: ${res.title}\nPrice: ${res.price}\nFeatures: ${res.features.join(', ')}\nDetails: ${res.productDesc}`
                setUrlContext(ctx)
                if (res.images && res.images.length > 0 && !referenceImage) {
                    setReferenceImage(res.images[0].url)
                }
            }
        } catch (e) {
            console.error(e)
            alert("Failed to fetch product details.")
        }
        setFetchingUrl(false)
    }

    const hasProductContext = !!productContext?.productDNA

    return (
        <div style={{ background: 'var(--sys-surface)', borderRadius: 16, padding: 40, border: '1px solid var(--sys-border)', position: 'relative' }}>
            {/* Product Context Banner — replaces URL scanner when product is active */}
            {hasProductContext ? (
                <div style={{ marginBottom: 24, padding: 16, background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(34,197,94,0.04))', borderRadius: 12, border: '1px solid rgba(124,58,237,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#A78BFA' }}>inventory_2</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#22C55E' }}>check_circle</span>
                                {productContext.productName || productContext.productDNA?.productCategory || 'Product Context Active'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginTop: 2 }}>
                                {productContext.moodLabel && `${productContext.moodLabel} · `}
                                {productContext.palette?.length > 0 && `${productContext.palette.length} colors locked · `}
                                Product intelligence from Library
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 3 }}>
                            {(productContext.palette || productContext.productDNA?.dominantColors || []).slice(0, 6).map((c, i) => (
                                <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c.hex || c, border: '1px solid var(--sys-border)' }} />
                            ))}
                        </div>
                    </div>
                    {/* Product Images Row */}
                    {productContext.productImages?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {productContext.productImages.slice(0, 4).map((img, i) => (
                                <img key={i} src={img} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--sys-border)' }} onError={e => e.target.style.display='none'} />
                            ))}
                            <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', display: 'flex', alignItems: 'center', marginLeft: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#A78BFA', marginRight: 3 }}>auto_awesome</span>
                                AI will use these as visual reference
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ marginBottom: 24, padding: 20, background: 'color-mix(in srgb, var(--sys-text) 2%, var(--sys-surface))', borderRadius: 12, border: '1px solid var(--sys-border)' }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: buttonColor }}>link</span>
                        Product Data Source
                    </label>
                    <div style={{ display: 'flex', gap: 12, marginBottom: urlContext ? 12 : 0 }}>
                        <input 
                            value={urlInput} 
                            onChange={e => setUrlInput(e.target.value)} 
                            placeholder="Paste a product URL to scan..."
                            style={{ flex: 1, background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', padding: '12px 16px', borderRadius: 8, color: 'var(--sys-text)', fontSize: 13, outline: 'none' }}
                            onFocus={e => e.target.style.borderColor = buttonColor}
                            onBlur={e => e.target.style.borderColor = 'var(--sys-border)'}
                        />
                        <button 
                            onClick={handleFetchUrl} 
                            disabled={fetchingUrl || !urlInput}
                            style={{ background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', color: 'var(--sys-text)', border: '1px solid var(--sys-border)', padding: '0 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: fetchingUrl ? 0.7 : 1, transition: 'all 0.2s' }}
                        >
                            {fetchingUrl ? 'Scanning...' : 'Scan URL'}
                        </button>
                    </div>
                    {(urlContext || (!urlInput && urlContext)) && (
                        <textarea 
                            value={urlContext}
                            onChange={e => setUrlContext(e.target.value)}
                            placeholder="Or type product features, pricing, and details manually..."
                            rows={3}
                            style={{ width: '100%', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 8, padding: '12px 16px', color: 'var(--sys-text)', fontSize: 13, resize: 'vertical', outline: 'none' }}
                            onFocus={e => e.target.style.borderColor = buttonColor}
                            onBlur={e => e.target.style.borderColor = 'var(--sys-border)'}
                        />
                    )}
                    {!urlContext && (
                        <textarea 
                        value={urlContext}
                        onChange={e => setUrlContext(e.target.value)}
                        placeholder="Or type product features, pricing, and details manually..."
                        rows={1}
                        style={{ width: '100%', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 8, padding: '12px 16px', color: 'var(--sys-text)', fontSize: 13, resize: 'vertical', outline: 'none', marginTop: 12 }}
                        onFocus={e => e.target.style.borderColor = buttonColor}
                        onBlur={e => e.target.style.borderColor = 'var(--sys-border)'}
                    />
                    )}
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                        <label style={{ cursor: 'pointer', background: 'color-mix(in srgb, var(--sys-text) 5%, var(--sys-surface))', border: '1px dashed var(--sys-border)', padding: '8px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--sys-text)', transition: 'all 0.2s', fontWeight: 600 }} onMouseEnter={e => e.currentTarget.style.borderColor = buttonColor} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--sys-border)'}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>
                            Upload Product Reference Image
                            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                        </label>
                        {referenceImage && (
                            <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--sys-border)' }}>
                                <img src={referenceImage} alt="Ref" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button onClick={(e) => { e.preventDefault(); setReferenceImage(null); }} style={{ position: 'absolute', top: 2, right: 2, background: 'color-mix(in srgb, var(--sys-bg) 70%, transparent)', border: 'none', color: 'var(--sys-text)', width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}>×</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Describe your campaign brief..."
                rows={4}
                style={{
                    width: '100%', background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', border: '1px solid var(--sys-border)',
                    borderRadius: 12, padding: '16px 20px', color: 'var(--sys-text)', fontSize: 15, lineHeight: 1.7,
                    outline: 'none', transition: 'all 0.2s', resize: 'vertical'
                }}
                onFocus={e => { e.target.style.borderColor = buttonColor; document.getElementById('brief-wrap').style.boxShadow = `0 0 0 3px ${buttonColor}20` }}
                onBlur={e => { e.target.style.borderColor = 'var(--sys-border)'; document.getElementById('brief-wrap').style.boxShadow = 'none' }}
                id="brief-wrap"
            />
            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', textAlign: 'right', marginTop: 8 }}>
                {brief.length} characters
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                    ✦ Mantram will apply both Brand DNA and Product context
                </span>
            </div>
            <button
                onClick={onGenerate}
                disabled={loading}
                style={{
                    display: 'block', width: '100%', padding: '14px 32px', borderRadius: 10,
                    background: `linear-gradient(135deg, ${buttonColor}, ${buttonColor}CC)`, border: 'none',
                    color: 'white', fontSize: 16, fontWeight: 700, marginTop: 24, cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: `0 8px 24px ${buttonColor}35`, opacity: loading ? 0.7 : 1, transition: 'all 0.2s'
                }}
            >
                Generate {toolName} — {credits} credits
            </button>
        </div>
    )
}

function GenerationOverlay({ loading, progress, stageText, icon }) {
    if (!loading) return null;
    return (
        <div style={{
            position: 'absolute', inset: 0, background: 'color-mix(in srgb, var(--sys-bg) 92%, transparent)', backdropFilter: 'blur(12px)',
            borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, minHeight: 400
        }}>
            <style>{`@keyframes pulse-icon { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }`}</style>
            <span className="material-symbols-outlined" style={{ fontSize: 64, color: 'var(--sys-text)', animation: 'pulse-icon 2s ease-in-out infinite' }}>
                {icon}
            </span>
            <div style={{ fontSize: 16, color: 'var(--sys-text)', textAlign: 'center', marginTop: 24, minHeight: 24, transition: 'opacity 0.4s ease' }}>
                {stageText}
            </div>
            <div style={{ width: 280, height: 3, background: 'color-mix(in srgb, var(--sys-text) 10%, var(--sys-surface))', borderRadius: 2, marginTop: 20, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#FFFFFF', transition: 'width 0.5s ease-out' }}></div>
            </div>
        </div>
    )
}

// ── Pulse Deck Tool ──────────────────────────────────────────────────────────

function SlideEditor({ slide, idx, image, onUpdate, onRephraseField, onRegenImage, rephrasing, regenning }) {
    const typeColors = { hero: '#7c3aed', problem: '#EF4444', solution: '#10B981', features: '#F59E0B', testimonial: '#6366F1', comparison: '#0EA5E9', how: '#8B5CF6', cta: '#EC4899' }
    const color = typeColors[slide.type] || '#7c3aed'

    const EditableText = ({ field, value, tag = 'div', style: s = {} }) => (
        <div style={{ position: 'relative', group: true }}>
            {React.createElement(tag, {
                contentEditable: true,
                suppressContentEditableWarning: true,
                onBlur: (e) => onUpdate(idx, field, e.currentTarget.textContent),
                style: { outline: 'none', cursor: 'text', borderRadius: 4, padding: '2px 4px', transition: 'all 0.2s', border: '1px solid transparent', ...s },
                onFocus: (e) => { e.currentTarget.style.border = `1px solid ${color}40`; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' },
                onMouseLeave: (e) => { if (document.activeElement !== e.currentTarget) { e.currentTarget.style.border = '1px solid transparent'; e.currentTarget.style.background = 'transparent' } },
            }, value || '')}
            <button
                onClick={() => onRephraseField(idx, field, value)}
                disabled={rephrasing}
                title="AI Rephrase"
                style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: color, border: 'none', color: 'var(--sys-text)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7, transition: 'opacity 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
            >✦</button>
        </div>
    )

    return (
        <div style={{ background: 'var(--sys-surface)', borderRadius: 16, border: '1px solid var(--sys-border)', overflow: 'hidden', transition: 'all 0.3s' }}>
            {/* Slide Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--sys-border)', background: `${color}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: color, fontWeight: 800 }}>{idx + 1}</div>
                    <span style={{ fontSize: 12, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{slide.type}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>Click text to edit • ✦ to AI rephrase</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: image ? '1fr 1fr' : '1fr', gap: 0 }}>
                {/* Content Side */}
                <div style={{ padding: 24 }}>
                    {slide.headline && <EditableText field="headline" value={slide.headline} tag="h3" style={{ fontSize: 22, fontWeight: 800, color: 'var(--sys-text)', margin: '0 0 12px', lineHeight: 1.3 }} />}
                    {slide.body && <EditableText field="body" value={slide.body} style={{ fontSize: 14, color: 'var(--sys-text)', lineHeight: 1.6, margin: '0 0 12px' }} />}
                    {slide.stat && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '12px 0' }}>
                            <EditableText field="stat.number" value={slide.stat.number} tag="span" style={{ fontSize: 40, fontWeight: 900, color: color }} />
                            <EditableText field="stat.label" value={slide.stat.label} tag="span" style={{ fontSize: 14, color: 'var(--sys-text-muted)' }} />
                        </div>
                    )}
                    {slide.quote && <EditableText field="quote" value={`"${slide.quote}"`} style={{ fontSize: 16, fontStyle: 'italic', color: 'var(--sys-text)', lineHeight: 1.5, margin: '0 0 8px' }} />}
                    {slide.author && <EditableText field="author" value={slide.author} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)' }} />}
                    {slide.role && <EditableText field="role" value={slide.role} style={{ fontSize: 12, color: 'var(--sys-text-muted)' }} />}
                    {slide.cta && <EditableText field="cta" value={slide.cta} style={{ display: 'inline-block', background: `${color}30`, color: color, padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, marginTop: 8 }} />}
                    {slide.ctaText && <EditableText field="ctaText" value={slide.ctaText} style={{ display: 'inline-block', background: `${color}30`, color: color, padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, marginTop: 8 }} />}
                    {slide.items && (
                        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                            {slide.items.map((item, i) => (
                                <div key={i} style={{ background: 'color-mix(in srgb, var(--sys-text) 3%, var(--sys-surface))', borderRadius: 8, padding: 12, border: '1px solid var(--sys-border)' }}>
                                    <EditableText field={`items.${i}.title`} value={item.title} style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', margin: 0 }} />
                                    <EditableText field={`items.${i}.description`} value={item.description} style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '4px 0 0' }} />
                                </div>
                            ))}
                        </div>
                    )}
                    {slide.features && (
                        <div style={{ marginTop: 12 }}>
                            {slide.features.map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--sys-border)' }}>
                                    <EditableText field={`features.${i}.name`} value={f.name} style={{ fontSize: 13, color: 'var(--sys-text)', flex: 1 }} />
                                    <span style={{ fontSize: 14, color: '#22C55E', fontWeight: 700 }}>✓</span>
                                    <span style={{ fontSize: 14, color: f.theirs ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{f.theirs ? '✓' : '✗'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Image Side */}
                {image ? (
                    <div style={{ position: 'relative', minHeight: 200 }}>
                        <img src={image} alt="Slide visual" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                            onClick={() => onRegenImage(idx)}
                            disabled={regenning}
                            style={{ position: 'absolute', bottom: 12, right: 12, background: 'color-mix(in srgb, var(--sys-bg) 80%, transparent)', backdropFilter: 'blur(8px)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>autorenew</span>
                            {regenning ? 'Generating...' : 'Regenerate Image'}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, background: 'color-mix(in srgb, var(--sys-text) 2%, var(--sys-surface))', borderLeft: '1px solid var(--sys-border)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--sys-text-muted)' }}>image</span>
                        <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: '8px 0 12px' }}>No image generated</p>
                        <button
                            onClick={() => onRegenImage(idx)}
                            disabled={regenning}
                            style={{ background: `${color}20`, border: `1px solid ${color}40`, color: color, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        >
                            {regenning ? 'Generating...' : '+ Generate Image'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function DeckTool({ brandId, urlContext, setUrlContext, referenceImage, setReferenceImage, productContext }) {
    const [brief, setBrief] = useState('')
    const gen = useGenerate(DECK_STAGES)
    const [editedPlan, setEditedPlan] = useState(null)
    const [editedImages, setEditedImages] = useState({})
    const [rephrasing, setRephrasing] = useState(false)
    const [regenning, setRegenning] = useState(false)

    const handleGenerate = async () => {
        if (!brief) return;
        gen.start()
        try {
            const data = await apiFetch('/brand-studio/deck/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId, brief, deckType: 'Campaign Pitch', slideCount: 8, urlContext, referenceImage, productContext: productContext || undefined })
            })
            if (!data.success) throw new Error(data.error)
            gen.setResult(data)
            setEditedPlan(JSON.parse(JSON.stringify(data.deckPlan)))
            setEditedImages(data.images || {})
            gen.stop(true)
        } catch (err) {
            gen.setError(err.message)
            gen.stop(false)
        }
    }

    const updateSlideField = (slideIdx, field, value) => {
        if (!editedPlan) return
        const updated = { ...editedPlan, slides: [...editedPlan.slides] }
        const slide = { ...updated.slides[slideIdx] }
        // Handle nested fields like "stat.number" or "items.0.title"
        const parts = field.split('.')
        if (parts.length === 1) {
            slide[field] = value
        } else if (parts.length === 2) {
            slide[parts[0]] = { ...slide[parts[0]], [parts[1]]: value }
        } else if (parts.length === 3) {
            const arr = [...(slide[parts[0]] || [])]
            arr[parseInt(parts[1])] = { ...arr[parseInt(parts[1])], [parts[2]]: value }
            slide[parts[0]] = arr
        }
        updated.slides[slideIdx] = slide
        setEditedPlan(updated)
    }

    const handleRephrase = async (slideIdx, field, currentText) => {
        setRephrasing(true)
        try {
            const res = await apiFetch('/brand-studio/deck/rephrase', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: currentText, instruction: 'Make it more compelling, punchy, and professional. Keep it concise.' })
            })
            if (res.success && res.text) {
                updateSlideField(slideIdx, field, res.text)
            }
        } catch (e) { console.error(e) }
        setRephrasing(false)
    }

    const handleRegenImage = async (slideIdx) => {
        setRegenning(true)
        try {
            const slide = editedPlan.slides[slideIdx]
            const res = await apiFetch('/brand-studio/deck/regenerate-image', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePrompt: slide.imagePrompt, slideType: slide.type, referenceImage })
            })
            if (res.success && res.imageUrl) {
                setEditedImages(prev => ({ ...prev, [slide.id]: res.imageUrl }))
            }
        } catch (e) { console.error(e) }
        setRegenning(false)
    }

    const buildLiveHTML = () => {
        const esc = (s) => (s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const slides = (editedPlan.slides || []).map((slide, idx) => {
            const img = editedImages[slide.id] || ''
            const num = idx + 1
            const total = editedPlan.slides.length
            const sn = `<div style="position:absolute;bottom:20px;right:32px;font-size:12px;color:rgba(255,255,255,0.35);letter-spacing:0.1em">${num} / ${total}</div>`
            switch (slide.type) {
                case 'hero': return `<section data-auto-animate data-background-image="${img}" data-background-size="cover" data-background-opacity="0.35"><div style="width:100%;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:60px 80px;box-sizing:border-box;background:linear-gradient(135deg,#7c3aed 40%,transparent)"><div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:6px 20px;font-size:12px;font-weight:600;letter-spacing:0.1em;color:#fff;margin-bottom:28px">✦ INTRODUCING</div><h1 style="font-size:72px;color:#fff;margin:0 0 24px;max-width:800px;line-height:1.15">${esc(slide.headline)}</h1><p style="font-size:22px;color:rgba(255,255,255,0.85);max-width:560px;margin:0 0 32px">${esc(slide.body)}</p>${slide.cta ? `<a style="display:inline-block;background:#22C55E;color:#fff;padding:14px 36px;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,0.2)">${esc(slide.cta)}</a>` : ''}</div>${sn}</section>`
                case 'problem': return `<section data-auto-animate><div style="position:relative;width:100%;height:100vh;${img ? `background-image:url('${img}');background-size:cover;background-position:center` : ''}"><div style="position:absolute;inset:0;background:linear-gradient(135deg,#1e1b4b 60%,rgba(0,0,0,0.7))"></div><div style="position:relative;z-index:2;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:40px"><div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#A78BFA;font-weight:600;margin-bottom:16px">THE CHALLENGE</div><div style="font-size:120px;font-weight:900;color:#A78BFA;line-height:1;margin:20px 0 8px">${esc(slide.stat?.number)}</div><div style="font-size:22px;color:rgba(255,255,255,0.8);margin-bottom:32px">${esc(slide.stat?.label)}</div><h2 style="color:#fff;font-size:36px;margin:0 0 12px;text-align:center">${esc(slide.headline)}</h2><p style="color:rgba(255,255,255,0.7);font-size:18px;max-width:600px;text-align:center">${esc(slide.body)}</p></div></div>${sn}</section>`
                case 'solution': return `<section data-auto-animate><div style="display:flex;width:100%;height:100vh"><div style="width:48%;height:100vh;background-size:cover;background-position:center;${img ? `background-image:url('${img}')` : 'background:#1e1b4b'}"></div><div style="width:52%;padding:60px 64px;display:flex;flex-direction:column;justify-content:center;background:#fff"><div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#A78BFA;font-weight:600;margin-bottom:16px">THE SOLUTION</div><h2 style="color:#0A0A0A;font-size:42px;margin:0 0 20px;line-height:1.15">${esc(slide.headline)}</h2><p style="color:#6B7280;font-size:18px;line-height:1.7">${esc(slide.body)}</p></div></div>${sn}</section>`
                case 'features': return `<section data-auto-animate><div style="position:relative;width:100%;height:100vh;${img ? `background-image:url('${img}');background-size:cover;background-position:center` : ''}"><div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.96))"></div><div style="position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;height:100vh;padding:60px 80px"><div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#A78BFA;font-weight:600;margin-bottom:16px">KEY FEATURES</div><h2 style="color:#0A0A0A;font-size:40px;margin:0 0 40px">${esc(slide.headline)}</h2><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:32px">${(slide.items || []).slice(0, 3).map(item => `<div style="background:#fff;border-radius:16px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.06)"><div style="font-size:36px;margin-bottom:16px;width:64px;height:64px;display:flex;align-items:center;justify-content:center;background:#f3f0ff;border-radius:16px">${item.icon || '✓'}</div><h3 style="font-size:18px;color:#0A0A0A;margin:0 0 8px;font-weight:700">${esc(item.title)}</h3><p style="font-size:14px;color:#6B7280;line-height:1.5;margin:0">${esc(item.description)}</p></div>`).join('')}</div></div></div>${sn}</section>`
                case 'testimonial': return `<section data-auto-animate><div style="position:relative;width:100%;height:100vh;${img ? `background-image:url('${img}');background-size:cover;background-position:center` : ''}"><div style="position:absolute;inset:0;background:linear-gradient(135deg,#f3f0ff 70%,rgba(255,255,255,0.85))"></div><div style="position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;height:100vh;padding:60px 100px"><div style="font-size:140px;color:#A78BFA;opacity:0.2;line-height:0.8;font-family:Georgia">"</div><div style="font-size:24px;color:#F59E0B;margin-bottom:20px">★★★★★</div><blockquote style="font-size:28px;color:#0A0A0A;font-style:italic;line-height:1.5;margin:0 0 32px;max-width:700px">"${esc(slide.quote)}"</blockquote><div style="width:60px;height:3px;background:#A78BFA;margin-bottom:16px"></div><div style="font-size:18px;font-weight:700;color:#0A0A0A">${esc(slide.author)}</div><div style="font-size:14px;color:#6B7280;margin-top:4px">${esc(slide.role)}</div></div></div>${sn}</section>`
                case 'comparison': return `<section data-auto-animate><div style="position:relative;width:100%;height:100vh;${img ? `background-image:url('${img}');background-size:cover;background-position:center` : ''}"><div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.97))"></div><div style="position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;height:100vh;padding:60px 80px"><div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#A78BFA;font-weight:600;margin-bottom:16px">WHY CHOOSE US</div><h2 style="font-size:40px;color:#0A0A0A;margin:0 0 40px">${esc(slide.headline)}</h2><table style="width:100%;border-collapse:collapse;font-size:16px"><thead><tr style="background:#7c3aed;color:#fff"><th style="padding:14px 20px;text-align:left;font-weight:600">Feature</th><th style="padding:14px 20px;text-align:center;width:100px">Us</th><th style="padding:14px 20px;text-align:center;width:100px">${esc(slide.vsLabel) || 'Others'}</th></tr></thead><tbody>${(slide.features || []).slice(0, 5).map((f, i) => `<tr style="${i % 2 === 0 ? 'background:#f3f0ff' : ''}"><td style="padding:14px 20px;color:#0A0A0A">${esc(f.name)}</td><td style="padding:14px 20px;text-align:center;color:#22C55E;font-size:20px;font-weight:700">✓</td><td style="padding:14px 20px;text-align:center;color:${f.theirs ? '#22C55E' : '#EF4444'};font-size:20px;font-weight:700">${f.theirs ? '✓' : '✗'}</td></tr>`).join('')}</tbody></table></div></div>${sn}</section>`
                case 'how': return `<section data-auto-animate><div style="position:relative;width:100%;height:100vh;${img ? `background-image:url('${img}');background-size:cover;background-position:center` : ''}"><div style="position:absolute;inset:0;background:linear-gradient(135deg,#1e1b4b 50%,rgba(0,0,0,0.75))"></div><div style="position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;height:100vh;padding:60px 80px"><div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#A78BFA;font-weight:600;margin-bottom:16px">HOW IT WORKS</div><h2 style="font-size:40px;color:#fff;margin:0 0 48px">${esc(slide.headline)}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:24px">${(slide.items || []).slice(0, 4).map((item, i) => `<div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px 24px"><div style="width:42px;height:42px;border-radius:50%;background:#A78BFA;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;margin-bottom:16px">${i + 1}</div><h3 style="font-size:16px;color:#fff;margin:0 0 8px;font-weight:700">${esc(item.title)}</h3><p style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.5;margin:0">${esc(item.description)}</p></div>`).join('')}</div></div></div>${sn}</section>`
                case 'cta': return `<section data-auto-animate data-background-image="${img}" data-background-size="cover" data-background-opacity="0.3"><div style="width:100%;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:linear-gradient(135deg,#A78BFA,#7c3aed);padding:60px 80px;box-sizing:border-box"><div style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.6);font-weight:600;margin-bottom:16px">READY TO START?</div><h1 style="font-size:64px;color:#fff;margin:0 0 20px;line-height:1.15">${esc(slide.headline)}</h1><p style="font-size:20px;color:rgba(255,255,255,0.85);max-width:550px;margin:0 auto 36px">${esc(slide.body)}</p>${slide.ctaText ? `<a style="display:inline-block;background:#fff;color:#7c3aed;padding:18px 48px;border-radius:14px;font-weight:800;font-size:18px;text-decoration:none;box-shadow:0 12px 40px rgba(0,0,0,0.2)">${esc(slide.ctaText)}</a>` : ''}</div>${sn}</section>`
                default: return `<section><div style="padding:60px 80px"><h2 style="color:#fff">${esc(slide.headline)}</h2><p style="color:rgba(255,255,255,0.7)">${esc(slide.body)}</p></div>${sn}</section>`
            }
        }).join('\n')

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(editedPlan.title)} — Pulse Studio</title><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/black.css"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}.reveal{font-family:'Inter',sans-serif}.reveal .slides{text-align:left}.reveal .slides section{padding:0;height:100vh}.reveal h1,.reveal h2,.reveal h3{font-family:'Outfit',sans-serif;font-weight:700;text-transform:none;letter-spacing:-0.02em;line-height:1.15}.reveal .slides section::after{content:'';position:absolute;bottom:0;left:0;width:100%;height:4px;z-index:100;background:linear-gradient(90deg,#7c3aed,#A78BFA)}@media print{.reveal .slides section{page-break-after:always}}</style></head><body><div class="reveal"><div class="slides">${slides}</div></div><script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"><\/script><script>Reveal.initialize({hash:true,transition:'slide',transitionSpeed:'default',backgroundTransition:'fade',autoAnimateEasing:'ease-out',autoAnimateDuration:0.8,controls:true,progress:true,center:false,width:'100%',height:'100%',margin:0,minScale:1,maxScale:1})<\/script></body></html>`
    }

    const openPresentation = () => {
        const html = buildLiveHTML()
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')
    }

    if (gen.result && editedPlan) {
        return (
            <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }}></div>
                        <div style={{ fontSize: 16, color: 'var(--sys-text)', fontWeight: 700 }}>
                            {editedPlan.title || 'Your Deck'}
                            <span style={{ background: 'rgba(124,58,237,0.2)', color: '#A78BFA', padding: '2px 10px', borderRadius: 10, fontSize: 12, marginLeft: 10, fontWeight: 600 }}>{editedPlan.slides?.length} slides</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={openPresentation}
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #6D28D9)', color: 'var(--sys-text)', border: 'none', padding: '10px 24px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>slideshow</span> Present Live
                        </button>
                        <button onClick={() => { navigator.clipboard.writeText(gen.result.hostedUrl); alert('Link copied!') }}
                            style={{ background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', color: 'var(--sys-text)', border: '1px solid var(--sys-border)', padding: '10px 20px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link</span> Copy Link
                        </button>
                    </div>
                </div>

                {/* Info Banner */}
                <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10, padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#A78BFA' }}>info</span>
                    <span style={{ fontSize: 13, color: 'var(--sys-text-muted)' }}>
                        <strong style={{ color: 'var(--sys-text)' }}>AI-Generated Content</strong> — Stats, testimonials, and quotes are AI-composed based on your brief and brand DNA. Click any text to edit, or press ✦ to AI-rephrase.
                    </span>
                </div>

                {/* Slide Editor Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {editedPlan.slides?.map((slide, idx) => (
                        <SlideEditor
                            key={idx} slide={slide} idx={idx}
                            image={editedImages[slide.id]}
                            onUpdate={updateSlideField}
                            onRephraseField={handleRephrase}
                            onRegenImage={handleRegenImage}
                            rephrasing={rephrasing}
                            regenning={regenning}
                        />
                    ))}
                </div>

                {/* Bottom Actions */}
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <button onClick={gen.reset} style={{ flex: 1, padding: 14, borderRadius: 10, background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        ↻ Start Over
                    </button>
                    <button onClick={openPresentation} style={{ flex: 1, padding: 14, borderRadius: 10, background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        📄 Present Full Screen
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
            <InputForm brief={brief} setBrief={setBrief} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} onGenerate={handleGenerate} loading={gen.loading} buttonColor="#7c3aed" toolName="Deck" credits={20} productContext={productContext} />
            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="slideshow" />
        </div>
    )
}

// ── Pulse Page Tool ──────────────────────────────────────────────────────────
function PageTool({ brandId, urlContext, setUrlContext, referenceImage, setReferenceImage, productContext }) {
    const [brief, setBrief] = useState('')
    const gen = useGenerate(PAGE_STAGES)
    const [shopDomain, setShopDomain] = useState('')
    const [shopToken, setShopToken] = useState('')

    const handleGenerate = async () => {
        if (!brief) return;
        gen.start()
        try {
            const data = await apiFetch('/brand-studio/landing-page/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId, brief, pageType: 'campaign', urlContext, referenceImage, productContext: productContext || undefined })
            })
            if (!data.success) throw new Error(data.error)
            gen.setResult(data)
            gen.stop(true)
        } catch (err) {
            gen.setError(err.message)
            gen.stop(false)
        }
    }

    const copyCode = (text) => { navigator.clipboard.writeText(text); alert("Copied!"); }

    if (gen.result) {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) 1fr', gap: 24 }}>
                {/* Visual Preview */}
                <div>
                    <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                        <div style={{ fontSize: 14, color: 'var(--sys-text)', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined" style={{ fontSize: 16, color: '#A78BFA' }}>psychology</span> How Claude designed this page</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {Object.entries(gen.result.plan?.pageStrategy || {}).map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase' }}>{k.replace(/([A-Z])/g, ' $1').trim()}</div>
                                    <div style={{ fontSize: 14, color: 'var(--sys-text)', marginTop: 4 }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div style={{ background: 'var(--sys-surface)', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ height: 32, background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }}></div>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }}></div>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }}></div>
                            <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--sys-text-muted)' }}>{gen.result.slug}</div>
                        </div>
                        <iframe srcDoc={gen.result.html} style={{ width: '100%', height: '65vh', border: 'none' }} sandbox="allow-scripts allow-same-origin"></iframe>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: 'var(--sys-text-muted)' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', padding: '4px 10px', borderRadius: 100 }}>✦ GSAP Parallax</span>
                            <span style={{ background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', padding: '4px 10px', borderRadius: 100 }}>🌐 {gen.result.sectionCount} sections</span>
                        </div>
                        <a href={gen.result.hostedUrl} target="_blank" rel="noreferrer" style={{ color: '#10B981', textDecoration: 'none' }}>Open in new tab ↗</a>
                    </div>
                </div>

                {/* Publish Panel */}
                <div style={{ background: 'var(--sys-surface)', borderRadius: 16, padding: 32 }}>
                    <h3 style={{ margin: '0 0 24px', color: 'var(--sys-text)' }}>Publish your page</h3>
                    
                    <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                        <button style={{ flex: 1, background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={() => copyCode(gen.result.html)}>⬇ Download</button>
                        <button style={{ flex: 1, background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={() => copyCode(gen.result.hostedUrl)}>📋 Copy URL</button>
                        <button style={{ flex: 1, background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={() => copyCode(gen.result.embedCode)}>&lt; /&gt; Embed</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
                        <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 12, padding: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#95BF47', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'var(--sys-text)' }}>S</div>
                                <div style={{ color: 'var(--sys-text)', fontWeight: 600 }}>Publish to Shopify</div>
                            </div>
                            <input value={shopDomain} onChange={e => setShopDomain(e.target.value)} placeholder="yourstore.com" className="input-glass" style={{ width: '100%', marginBottom: 12, padding: 10, fontSize: 13, background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)' }} />
                            <input type="password" value={shopToken} onChange={e => setShopToken(e.target.value)} placeholder="Admin API token" className="input-glass" style={{ width: '100%', marginBottom: 12, padding: 10, fontSize: 13, background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)' }} />
                            <button style={{ width: '100%', background: '#95BF47', color: 'var(--sys-text)', border: 'none', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Publish to Store</button>
                        </div>
                        <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 12, padding: 24, cursor: 'pointer' }} onClick={() => copyCode(gen.result.html)}>
                            <div style={{ color: 'var(--sys-text)', fontWeight: 600 }}>Add to WordPress</div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginTop: 4 }}>Click to copy HTML. Paste into Custom HTML block.</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={gen.reset}>↺ Regenerate</button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
            <InputForm brief={brief} setBrief={setBrief} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} onGenerate={handleGenerate} loading={gen.loading} buttonColor="#10b981" toolName="Page" credits={18} productContext={productContext} />
            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="web" />
        </div>
    )
}

// ── Pulse Mail Tool ──────────────────────────────────────────────────────────
function MailTool({ brandId, urlContext, setUrlContext, referenceImage, setReferenceImage, productContext }) {
    const [brief, setBrief] = useState('')
    const gen = useGenerate(MAIL_STAGES)
    const [viewMode, setViewMode] = useState('mobile')

    const handleGenerate = async () => {
        if (!brief) return;
        gen.start()
        try {
            const data = await apiFetch('/brand-studio/email/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId, brief, emailType: 'Campaign', urlContext, referenceImage, productContext: productContext || undefined })
            })
            if (!data.success) throw new Error(data.error)
            gen.setResult(data)
            gen.stop(true)
        } catch (err) {
            gen.setError(err.message)
            gen.stop(false)
        }
    }

    if (gen.result) {
        return (
            <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'mobile' ? '375px 1fr' : '1fr 300px', gap: 32 }}>
                <div>
                    <div style={{ background: viewMode === 'mobile' ? '#000' : '#111', borderRadius: viewMode === 'mobile' ? 44 : 12, border: viewMode === 'mobile' ? '8px solid #1A1A1A' : 'none', overflow: 'hidden', height: 600, display: 'flex', justifyContent: 'center' }}>
                        <iframe srcDoc={gen.result.html} style={{ width: viewMode === 'mobile' ? '100%' : '600px', height: '100%', border: 'none', background: '#FFF' }} sandbox="allow-scripts allow-top-navigation"></iframe>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 16 }}>
                        <button onClick={() => setViewMode('mobile')} style={{ background: viewMode === 'mobile' ? '#333' : 'transparent', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: '6px 16px', borderRadius: 20, cursor: 'pointer' }}>📱 Mobile</button>
                        <button onClick={() => setViewMode('desktop')} style={{ background: viewMode === 'desktop' ? '#333' : 'transparent', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: '6px 16px', borderRadius: 20, cursor: 'pointer' }}>💻 Desktop</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ background: 'var(--sys-surface)', borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase' }}>Subject</div>
                        <div style={{ fontSize: 15, color: 'var(--sys-text)', fontWeight: 600, marginTop: 4, marginBottom: 16 }}>{gen.result.subject}</div>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase' }}>Preview Text</div>
                        <div style={{ fontSize: 14, color: 'var(--sys-text)', marginTop: 4 }}>{gen.result.previewText}</div>
                    </div>

                    <div style={{ background: 'var(--sys-surface)', borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 14, color: 'var(--sys-text)', fontWeight: 600, marginBottom: 16 }}>Send it</div>
                        <button style={{ width: '100%', background: '#EA4335', color: 'var(--sys-text)', border: 'none', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }} onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(gen.result.subject)}&body=${encodeURIComponent(gen.result.plainText)}`)}>
                            📨 Open in Gmail
                        </button>
                        <button style={{ width: '100%', background: '#3b82f6', color: 'var(--sys-text)', border: 'none', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                            📩 Open in Mail app
                        </button>
                    </div>

                    <div style={{ background: 'var(--sys-surface)', borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 14, color: 'var(--sys-text)', fontWeight: 600, marginBottom: 16 }}>Push to ESP</div>
                        <select style={{ width: '100%', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                            <option>Mailchimp</option>
                            <option>Klaviyo</option>
                            <option>Brevo</option>
                        </select>
                        <input type="password" placeholder="API Key" style={{ width: '100%', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: 10, borderRadius: 8, marginBottom: 12, boxSizing: 'border-box' }} />
                        <button style={{ width: '100%', background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Push Template</button>
                    </div>

                    <button className="btn-secondary" style={{ padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={gen.reset}>↺ Regenerate</button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
            <InputForm brief={brief} setBrief={setBrief} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} onGenerate={handleGenerate} loading={gen.loading} buttonColor="#0ea5e9" toolName="Mail" credits={12} productContext={productContext} />
            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="mail" />
        </div>
    )
}

// ── A+ Listing Tool ──────────────────────────────────────────────────────────

const APLUS_STAGES = [
    'Analyzing product data with MCoT Vision...',
    'Fetching competitive intel via web search...',
    'Claude crafting A+ content strategy...',
    'Writing benefit-first copy for each module...',
    'Generating Amazon-spec images with NanoBanana 2...',
    'Assembling your A+ listing page...',
    'A+ Listing ready for Amazon!'
]

// ── Color Palette Strip — visual image-format palette renderer ──────────────
function ColorPaletteStrip({ colors }) {
    if (!colors?.length) return null
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>palette</span>
                Extracted Color Palette — Color Guard Active
            </div>
            {/* Full-width palette strip */}
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', marginBottom: 10 }}>
                <div style={{ display: 'flex', height: 56 }}>
                    {colors.map((c, i) => (
                        <div key={i} title={`${c.name} · ${c.hex}`} style={{
                            flex: 1,
                            background: c.hex,
                            position: 'relative',
                            transition: 'flex 0.2s',
                        }}
                            onMouseEnter={e => e.currentTarget.style.flex = '1.5'}
                            onMouseLeave={e => e.currentTarget.style.flex = '1'}
                        >
                            {c.role === 'product_primary' && (
                                <div style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 10, color: 'var(--sys-text)' }}>star</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                {/* Labels row below strip */}
                <div style={{ display: 'flex', background: 'color-mix(in srgb, var(--sys-bg) 70%, transparent)', borderTop: '1px solid var(--sys-border)' }}>
                    {colors.map((c, i) => (
                        <div key={i} style={{ flex: 1, padding: '5px 6px', borderRight: i < colors.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', minWidth: 0 }}>
                            <div style={{ fontSize: 9, color: c.role === 'product_primary' ? '#A78BFA' : 'rgba(255,255,255,0.7)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                            <div style={{ fontSize: 8, color: 'var(--sys-text-muted)', fontFamily: 'monospace' }}>{c.hex}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

const MODULE_TYPE_CONFIG = {
    hero_banner:     { label: 'Hero Banner',         icon: 'panorama',     color: '#7c3aed', amazon: '970×600px' },
    image_text_left: { label: 'Image & Text',         icon: 'view_sidebar', color: '#0ea5e9', amazon: '300×300px' },
    image_text_right:{ label: 'Image & Text (Right)', icon: 'view_sidebar', color: '#0ea5e9', amazon: '300×300px' },
    three_features:  { label: 'Three Features Grid',  icon: 'grid_view',    color: '#F59E0B', amazon: '300×300px ×3' },
    four_features:   { label: 'Four Features Grid',   icon: 'grid_on',      color: '#F59E0B', amazon: '220×220px ×4' },
    comparison_chart:{ label: 'Comparison Chart',     icon: 'compare',      color: '#22C55E', amazon: '150×300px' },
    image_highlights:{ label: 'Image + Highlights',   icon: 'checklist',    color: '#6366F1', amazon: '300×300px' },
    header_overlay:  { label: 'Header Banner',        icon: 'crop_landscape',color: '#EC4899', amazon: '970×300px' },
    brand_story:     { label: 'Brand Story',          icon: 'auto_stories', color: '#8B5CF6', amazon: '970×600px' },
}

function AplusModuleCard({ module, idx, image, onUpdate, onRephrase, onRegenImage, rephrasing, regenning, productImages, brandColors }) {
    const cfg = MODULE_TYPE_CONFIG[module.type] || { label: module.type, icon: 'layers', color: '#7c3aed', amazon: '' }
    const c = cfg.color
    const [expanded, setExpanded] = useState(idx === 0)

    // Parse the amazon spec string (e.g. '970×600px' or '300×300px ×3') to get the display aspect ratio
    const getAspectRatio = () => {
        const spec = cfg.amazon || '300×300px'
        const match = spec.match(/(\d+)[\u00d7x](\d+)/)
        if (match) return parseInt(match[1]) / parseInt(match[2])
        return 1
    }
    const aspectRatio = getAspectRatio()

    const Field = ({ field, value, label, multiline = false }) => (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{label}</span>
                <button onClick={() => onRephrase(idx, field, value, module.type)}
                    disabled={rephrasing}
                    title="AI Rephrase"
                    style={{ background: `${c}20`, border: `1px solid ${c}40`, color: c, borderRadius: 6, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                    ✦ Rephrase
                </button>
            </div>
            <div contentEditable suppressContentEditableWarning
                onBlur={e => onUpdate(idx, field, e.currentTarget.textContent)}
                style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 8, padding: '10px 12px', color: 'var(--sys-text)', fontSize: 13, lineHeight: 1.6, outline: 'none', cursor: 'text', minHeight: multiline ? 60 : 36, whiteSpace: 'pre-wrap', transition: 'border 0.2s' }}
                onFocus={e => e.currentTarget.style.borderColor = `${c}60`}
                onBlurCapture={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            >{value || ''}</div>
        </div>
    )

    return (
        <div style={{ background: 'var(--sys-surface)', borderRadius: 16, border: `1px solid ${expanded ? c + '30' : 'rgba(255,255,255,0.08)'}`, overflow: 'hidden', transition: 'all 0.3s' }}>
            {/* Module Header — always visible */}
            <div onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', cursor: 'pointer', background: expanded ? `${c}08` : 'transparent', transition: 'background 0.2s' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${c}15`, border: `1px solid ${c}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: c }}>{cfg.icon}</span>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)' }}>{idx + 1}. {cfg.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--sys-text-muted)', background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', padding: '2px 6px', borderRadius: 4 }}>Amazon spec: {cfg.amazon}</span>
                        {image && <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 700 }}>✓ Image ready</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                        {module.headline || module.story || '—'}
                    </div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--sys-text-muted)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>expand_more</span>
            </div>

            {/* Module Content — collapsible */}
            {expanded && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--sys-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: image ? '1fr 280px' : '1fr', gap: 20, paddingTop: 20 }}>
                        {/* Text Fields */}
                        <div>
                            {module.headline   !== undefined && <Field field="headline"    value={module.headline}    label="Headline" />}
                            {module.subheadline !== undefined && <Field field="subheadline" value={module.subheadline} label="Subheadline" />}
                            {module.body        !== undefined && <Field field="body"        value={module.body}        label="Body Copy" multiline />}
                            {module.story       !== undefined && <Field field="story"       value={module.story}       label="Brand Story" multiline />}
                            {module.tagline     !== undefined && <Field field="tagline"     value={module.tagline}     label="Tagline" />}
                            {module.altText     !== undefined && <Field field="altText"     value={module.altText}     label="Alt Text (SEO)" />}

                            {/* Bullets */}
                            {module.bullets?.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Bullets</div>
                                    {module.bullets.map((b, bi) => (
                                        <div key={bi} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                            <span style={{ color: c, marginTop: 2 }}>•</span>
                                            <div contentEditable suppressContentEditableWarning
                                                onBlur={e => onUpdate(idx, `bullets.${bi}`, e.currentTarget.textContent)}
                                                style={{ flex: 1, background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--sys-text)', fontSize: 13, outline: 'none', cursor: 'text' }}
                                            >{b}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Grid Items */}
                            {module.items?.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Feature Items</div>
                                    {module.items.map((item, ii) => (
                                        <div key={ii} style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 22, width: 32, flexShrink: 0, color: '#A78BFA' }}>{item.icon && item.icon.length > 2 ? item.icon : 'auto_awesome'}</span>
                                            <div style={{ flex: 1 }}>
                                                <div contentEditable suppressContentEditableWarning
                                                    onBlur={e => onUpdate(idx, `items.${ii}.title`, e.currentTarget.textContent)}
                                                    style={{ color: 'var(--sys-text)', fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'text', marginBottom: 4 }}
                                                >{item.title}</div>
                                                <div contentEditable suppressContentEditableWarning
                                                    onBlur={e => onUpdate(idx, `items.${ii}.description`, e.currentTarget.textContent)}
                                                    style={{ color: 'var(--sys-text-muted)', fontSize: 12, outline: 'none', cursor: 'text' }}
                                                >{item.description}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Comparison Rows */}
                            {module.rows?.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Comparison Rows</div>
                                    <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 8, overflow: 'hidden' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', background: `${c}20`, padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text)' }}>
                                            <span>Feature</span><span style={{ textAlign: 'center' }}>Ours</span><span style={{ textAlign: 'center' }}>Others</span>
                                        </div>
                                        {module.rows.map((row, ri) => (
                                            <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '8px 12px', borderTop: '1px solid var(--sys-border)', fontSize: 12 }}>
                                                <div contentEditable suppressContentEditableWarning onBlur={e => onUpdate(idx, `rows.${ri}.feature`, e.currentTarget.textContent)} style={{ color: 'var(--sys-text)', outline: 'none', cursor: 'text' }}>{row.feature}</div>
                                                <div style={{ textAlign: 'center', color: '#22C55E', fontWeight: 700 }}>{row.model1Value || '✓'}</div>
                                                <div style={{ textAlign: 'center', color: row.model2Value === '✓' ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{row.model2Value || '✗'}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Image Panel — aspect-ratio-aware preview */}
                        <div>
                            {image ? (
                                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--sys-border)', position: 'relative' }}>
                                    {/* Aspect-ratio-preserving container */}
                                    <div style={{ position: 'relative', width: '100%', paddingBottom: `${(1 / aspectRatio) * 100}%`, overflow: 'hidden', maxHeight: aspectRatio < 1 ? 260 : 'none' }}>
                                        <img src={image} alt={module.altText || ''}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)' }}></div>
                                        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, display: 'flex', gap: 6 }}>
                                            <button onClick={() => onRegenImage(idx)} disabled={regenning}
                                                style={{ flex: 1, background: 'color-mix(in srgb, var(--sys-bg) 80%, transparent)', backdropFilter: 'blur(8px)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: '7px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>autorenew</span>
                                                {regenning ? 'Generating...' : 'Regenerate'}
                                            </button>
                                            <button
                                                onClick={() => downloadImageFile(image, `module_${idx + 1}_${module.type}.jpg`)}
                                                style={{ background: 'color-mix(in srgb, var(--sys-bg) 80%, transparent)', backdropFilter: 'blur(8px)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: '7px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.5)', fontSize: 10, color: 'var(--sys-text-muted)', textAlign: 'center' }}>Amazon spec: {cfg.amazon}</div>
                                </div>
                            ) : (
                                <div style={{ borderRadius: 12, border: '1px dashed rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 10 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--sys-text-muted)' }}>image</span>
                                    <p style={{ fontSize: 12, color: 'var(--sys-text-muted)', margin: 0 }}>No image generated</p>
                                    <button onClick={() => onRegenImage(idx)} disabled={regenning}
                                        style={{ background: `${c}20`, border: `1px solid ${c}40`, color: c, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                        {regenning ? 'Generating...' : '+ Generate Image'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// Mood Board Lightbox
// ══════════════════════════════════════════════════════════════════════════
function MoodBoardLightbox({ moods, moodImages, moodSwatches, openMoodId, onClose, productDNA }) {
    const moodList = Object.values(moods)
    const [currentIdx, setCurrentIdx] = useState(moodList.findIndex(m => m.id === openMoodId) || 0)
    const current = moodList[currentIdx]
    const aiImg = moodImages[current?.id]

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowRight') setCurrentIdx(i => (i + 1) % moodList.length)
            if (e.key === 'ArrowLeft') setCurrentIdx(i => (i - 1 + moodList.length) % moodList.length)
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [moodList.length, onClose])

    if (!current) return null
    const swatchColors = (moodSwatches[current.id] || [])
    const dnaColors = productDNA?.dominantColors?.slice(0, 6) || []

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '90vw', maxWidth: 960, borderRadius: 20,
                background: 'var(--sys-surface)', border: '1px solid var(--sys-border)',
                overflow: 'hidden', boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
            }}>
                {/* Header */}
                <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 10, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Mood Board</span>
                        <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.15)' }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text)' }}>{current.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>{currentIdx + 1} / {moodList.length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {aiImg && (
                            <button
                                onClick={() => downloadImageFile(aiImg, `moodboard_${current.id}.jpg`)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                                Download
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--sys-text)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                    </div>
                </div>
                {/* Image */}
                <div style={{ position: 'relative', height: '55vh', background: 'var(--sys-bg)', overflow: 'hidden' }}>
                    {aiImg ? (
                        <>
                            <img src={aiImg} alt={current.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </>
                    ) : (
                        <div style={{ width: '100%', height: '100%', background: current.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ textAlign: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--sys-text-muted)' }}>hourglass_empty</span>
                                <div style={{ fontSize: 13, color: 'var(--sys-text-muted)', marginTop: 8 }}>Generating mood board...</div>
                            </div>
                        </div>
                    )}
                    {/* Navigation arrows */}
                    <button onClick={() => setCurrentIdx(i => (i - 1 + moodList.length) % moodList.length)}
                        style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: 'color-mix(in srgb, var(--sys-bg) 70%, transparent)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chevron_left</span>
                    </button>
                    <button onClick={() => setCurrentIdx(i => (i + 1) % moodList.length)}
                        style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', background: 'color-mix(in srgb, var(--sys-bg) 70%, transparent)', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chevron_right</span>
                    </button>
                    {/* Slide dots */}
                    <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
                        {moodList.map((_, i) => (
                            <div key={i} onClick={() => setCurrentIdx(i)} style={{ width: i === currentIdx ? 20 : 6, height: 6, borderRadius: 3, background: i === currentIdx ? '#A78BFA' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s' }} />
                        ))}
                    </div>
                </div>
                {/* Footer: colors + desc */}
                <div style={{ padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginBottom: 8 }}>{current.desc}</div>
                        {dnaColors.length > 0 && (
                            <div>
                                <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Product Colors Locked</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {dnaColors.map((c, i) => (
                                        <div key={i} title={`${c.name} ${c.hex}`} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'color-mix(in srgb, var(--sys-text) 5%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 6, padding: '4px 8px' }}>
                                            <div style={{ width: 14, height: 14, borderRadius: 3, background: c.hex, flexShrink: 0 }} />
                                            <span style={{ fontSize: 10, color: 'var(--sys-text-muted)' }}>{c.hex}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 160 }}>
                        {(swatchColors.length > 0 ? swatchColors : []).map((sw, i) => (
                            <div key={i} style={{ width: 28, height: 28, borderRadius: 6, background: sw, border: '1px solid rgba(255,255,255,0.12)' }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════════════════
// Amazon Listing Preview
// ══════════════════════════════════════════════════════════════════════════
const ALL_MODULE_LABELS = {
    hero_banner: 'Hero Banner', image_text_left: 'Image & Text', image_text_right: 'Image & Text',
    three_features: 'Three Features', four_features: 'Four Features', comparison_chart: 'Comparison Chart',
    image_highlights: 'Image Highlights', header_overlay: 'Header Banner', brand_story: 'Brand Story', logo: 'Brand Logo',
    premium_hero: 'Premium Hero', premium_banner: 'Premium Banner', premium_image_text: 'Premium Image & Text',
    carousel: 'Image Carousel', hotspot: 'Interactive Hotspot', video_module: 'Video Module',
    qa_panel: 'Q&A Panel', enhanced_comparison: 'Enhanced Comparison', premium_brand_story: 'Premium Brand Story',
}

function renderAplusModulePreview(module, imageUrl, isMobile, isPremium) {
    const baseText = { fontFamily: 'Arial, sans-serif', color: '#111' }
    const headline = { ...baseText, fontSize: isMobile ? 16 : 20, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }
    const body = { ...baseText, fontSize: isMobile ? 12 : 13, lineHeight: 1.6, color: '#444', marginBottom: 0 }
    const moduleWidth = isPremium ? (isMobile ? '100%' : '1464px') : (isMobile ? '100%' : '970px')

    switch (module.type) {
        case 'hero_banner': case 'premium_hero': {
            const imgH = isMobile ? 220 : (isPremium ? 484 : 400)
            return (
                <div style={{ width: '100%', position: 'relative', background: '#f5f5f5', overflow: 'hidden', height: imgH }}>
                    {imageUrl ? (
                        <img src={imageUrl} alt={module.altText || module.headline} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a1a, #333)' }} />}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: isMobile ? '12px 16px' : '24px 40px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
                        {module.headline && <div style={{ ...headline, color: 'var(--sys-text)', fontSize: isMobile ? 18 : 28, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{module.headline}</div>}
                        {module.subheadline && <div style={{ ...body, color: 'var(--sys-text)', fontSize: isMobile ? 12 : 15 }}>{module.subheadline}</div>}
                    </div>
                </div>
            )
        }
        case 'header_overlay': case 'premium_banner': {
            const imgH = isMobile ? 120 : 180
            return (
                <div style={{ width: '100%', position: 'relative', height: imgH, overflow: 'hidden' }}>
                    {imageUrl ? <img src={imageUrl} alt={module.headline} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))' }} />}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
                        {module.headline && <div style={{ ...headline, color: 'var(--sys-text)', textAlign: 'center', fontSize: isMobile ? 15 : 22 }}>{module.headline}</div>}
                    </div>
                </div>
            )
        }
        case 'image_text_left': case 'premium_image_text': {
            const stacked = isMobile
            return (
                <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'center', gap: 0 }}>
                    <div style={{ width: stacked ? '100%' : '50%', aspectRatio: '1', overflow: 'hidden', flexShrink: 0 }}>
                        {imageUrl ? <img src={imageUrl} alt={module.altText} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: '#e8e8e8' }} />}
                    </div>
                    <div style={{ padding: stacked ? '16px' : '24px 32px', flex: 1 }}>
                        {module.headline && <div style={headline}>{module.headline}</div>}
                        {module.body && <div style={body}>{module.body}</div>}
                    </div>
                </div>
            )
        }
        case 'image_text_right': {
            const stacked = isMobile
            return (
                <div style={{ display: 'flex', flexDirection: stacked ? 'column' : 'row', alignItems: stacked ? 'flex-start' : 'center', gap: 0 }}>
                    {!stacked && <div style={{ padding: '24px 32px', flex: 1 }}>
                        {module.headline && <div style={headline}>{module.headline}</div>}
                        {module.body && <div style={body}>{module.body}</div>}
                    </div>}
                    <div style={{ width: stacked ? '100%' : '50%', aspectRatio: '1', flexShrink: 0 }}>
                        {imageUrl ? <img src={imageUrl} alt={module.altText} style={{ width: '100%', height: stacked ? 200 : '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: stacked ? 200 : '100%', background: '#e8e8e8' }} />}
                    </div>
                    {stacked && <div style={{ padding: '12px 16px', flex: 1 }}>
                        {module.headline && <div style={headline}>{module.headline}</div>}
                        {module.body && <div style={body}>{module.body}</div>}
                    </div>}
                </div>
            )
        }
        case 'three_features': case 'four_features': {
            const items = module.items || []
            const cols = module.type === 'four_features' ? 4 : 3
            return (
                <div style={{ padding: isMobile ? '16px' : '24px 32px' }}>
                    {module.headline && <div style={{ ...headline, textAlign: 'center', marginBottom: 20 }}>{module.headline}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${cols}, 1fr)`, gap: isMobile ? 12 : 20 }}>
                        {items.map((item, i) => (
                            <div key={i} style={{ textAlign: 'center', padding: isMobile ? 8 : 12 }}>
                                <div style={{ fontSize: isMobile ? 24 : 32, marginBottom: 6 }}>{item.icon || '✦'}</div>
                                <div style={{ ...baseText, fontSize: isMobile ? 11 : 13, fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
                                <div style={{ ...baseText, fontSize: isMobile ? 10 : 12, color: '#666' }}>{item.description}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        }
        case 'image_highlights': {
            const bullets = module.bullets || []
            return (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start' }}>
                    <div style={{ width: isMobile ? '100%' : '45%', height: isMobile ? 200 : 300, flexShrink: 0, overflow: 'hidden' }}>
                        {imageUrl ? <img src={imageUrl} alt={module.altText} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#e8e8e8' }} />}
                    </div>
                    <div style={{ padding: isMobile ? '12px 16px' : '24px 28px', flex: 1 }}>
                        {module.headline && <div style={{ ...headline, marginBottom: 14 }}>{module.headline}</div>}
                        <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                            {bullets.slice(0, 6).map((b, i) => <li key={i} style={{ ...body, marginBottom: 8 }}>{b}</li>)}
                        </ul>
                    </div>
                </div>
            )
        }
        case 'comparison_chart': case 'enhanced_comparison': {
            const rows = module.rows || []
            const cols = rows[0] ? Object.keys(rows[0]).filter(k => k !== 'feature') : []
            return (
                <div style={{ padding: isMobile ? '12px 8px' : '20px 32px', overflowX: 'auto' }}>
                    {module.headline && <div style={{ ...headline, textAlign: 'center', marginBottom: 16 }}>{module.headline}</div>}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 11 : 13, fontFamily: 'Arial, sans-serif' }}>
                        <thead>
                            <tr style={{ background: '#f0f0f0' }}>
                                <th style={{ padding: '10px 12px', textAlign: 'left', color: '#333' }}>Feature</th>
                                {cols.filter((_, i) => i % 2 === 0).map((c, i) => (
                                    <th key={i} style={{ padding: '10px 12px', textAlign: 'center', color: '#c45500' }}>{c.replace('model', 'Model ').replace(/([A-Z])/g, ' $1').trim()}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 6).map((row, rIdx) => (
                                <tr key={rIdx} style={{ borderBottom: '1px solid #eee', background: rIdx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                    <td style={{ padding: '9px 12px', fontWeight: 600 }}>{row.feature}</td>
                                    {[row.model1Value, row.model2Value, row.model3Value].filter(Boolean).map((v, i) => (
                                        <td key={i} style={{ padding: '9px 12px', textAlign: 'center', color: v === 'Yes' || v === '✓' ? '#007600' : v === 'No' || v === '✗' ? '#c00' : '#333' }}>{v}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        }
        case 'carousel': {
            const slides = module.slides || []
            return (
                <div style={{ width: '100%', position: 'relative' }}>
                    <div style={{ width: '100%', height: isMobile ? 220 : (isPremium ? 484 : 400), overflow: 'hidden', position: 'relative' }}>
                        {imageUrl ? <img src={imageUrl} alt={module.headline} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1a1a1a, #444)' }} />}
                        {/* Carousel arrows */}
                        <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.9)', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#333' }}>chevron_left</span>
                        </div>
                        <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.9)', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#333' }}>chevron_right</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '10px 0', background: '#f5f5f5' }}>
                        {[0, 1, 2].map(i => <div key={i} style={{ width: i === 0 ? 20 : 8, height: 8, borderRadius: 4, background: i === 0 ? '#c45500' : '#ccc', transition: 'all 0.2s' }} />)}
                    </div>
                    {module.headline && <div style={{ ...baseText, fontSize: isMobile ? 13 : 16, fontWeight: 700, textAlign: 'center', padding: '8px 16px' }}>{module.headline}</div>}
                </div>
            )
        }
        case 'hotspot': {
            const hotspots = module.hotspots || []
            return (
                <div style={{ width: '100%', position: 'relative' }}>
                    {module.headline && <div style={{ ...headline, padding: '16px 20px 8px' }}>{module.headline}</div>}
                    <div style={{ position: 'relative', width: '100%', height: isMobile ? 250 : (isPremium ? 500 : 380), overflow: 'hidden' }}>
                        {imageUrl ? <img src={imageUrl} alt={module.altText} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#e8e8e8' }} />}
                        {hotspots.slice(0, 4).map((h, i) => (
                            <div key={i} style={{ position: 'absolute', left: `${h.x || (20 + i * 20)}%`, top: `${h.y || (30 + i * 15)}%`, transform: 'translate(-50%, -50%)', zIndex: 2 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#c45500', border: '2px solid #FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sys-text)', fontSize: 12, fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', cursor: 'pointer', fontFamily: 'Arial' }}>{h.number || i+1}</div>
                            </div>
                        ))}
                    </div>
                    {hotspots.length > 0 && (
                        <div style={{ padding: isMobile ? '10px 12px' : '12px 20px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 8, background: '#f8f8f8', borderTop: '1px solid #eee' }}>
                            {hotspots.slice(0, 4).map((h, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#c45500', color: 'var(--sys-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, fontFamily: 'Arial' }}>{h.number || i+1}</div>
                                    <div style={{ fontSize: 11, color: '#333', fontFamily: 'Arial' }}><strong>{h.title}</strong> — {h.description}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )
        }
        case 'qa_panel': {
            const questions = module.questions || []
            return (
                <div style={{ padding: isMobile ? '12px 14px' : '20px 32px' }}>
                    {module.headline && <div style={{ ...headline, marginBottom: 16 }}>{module.headline}</div>}
                    {questions.slice(0, 5).map((q, i) => (
                        <div key={i} style={{ borderBottom: '1px solid #eee', paddingBottom: 14, marginBottom: 14 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                <span style={{ color: '#c45500', fontWeight: 700, fontSize: 14, fontFamily: 'Arial', flexShrink: 0 }}>Q:</span>
                                <div style={{ ...baseText, fontSize: isMobile ? 12 : 14, fontWeight: 700 }}>{q.question}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <span style={{ color: '#007600', fontWeight: 700, fontSize: 14, fontFamily: 'Arial', flexShrink: 0 }}>A:</span>
                                <div style={{ ...body }}>{q.answer}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )
        }
        case 'video_module': {
            return (
                <div style={{ width: '100%', position: 'relative', height: isMobile ? 200 : (isPremium ? 484 : 350), background: 'var(--sys-bg)', overflow: 'hidden' }}>
                    {imageUrl ? <img src={imageUrl} alt={module.headline} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} /> : <div style={{ width: '100%', height: '100%', background: 'var(--sys-surface)' }} />}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: isMobile ? 48 : 64, height: isMobile ? 48 : 64, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: isMobile ? 30 : 38, color: '#c45500', marginLeft: 4 }}>play_arrow</span>
                        </div>
                        {module.headline && <div style={{ color: 'var(--sys-text)', fontFamily: 'Arial', fontWeight: 700, fontSize: isMobile ? 13 : 16, marginTop: 14, textShadow: '0 2px 8px rgba(0,0,0,0.7)', textAlign: 'center', padding: '0 20px' }}>{module.headline}</div>}
                        {module.videoCaption && <div style={{ color: 'var(--sys-text)', fontFamily: 'Arial', fontSize: isMobile ? 11 : 13, marginTop: 6, textAlign: 'center' }}>{module.videoCaption}</div>}
                    </div>
                </div>
            )
        }
        case 'brand_story': case 'premium_brand_story': {
            return (
                <div style={{ width: '100%', position: 'relative', minHeight: isMobile ? 260 : (isPremium ? 500 : 400), overflow: 'hidden' }}>
                    {imageUrl ? (
                        <img src={imageUrl} alt={module.tagline || module.headline} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    ) : <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a1a1a, #0d0d0d)' }} />}
                    <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '32px 20px' : '60px 80px', background: 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 100%)' }}>
                        {module.brandName && <div style={{ color: 'var(--sys-text-muted)', fontFamily: 'Arial', fontSize: isMobile ? 10 : 12, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>{module.brandName}</div>}
                        {(module.tagline || module.headline) && <div style={{ color: 'var(--sys-text)', fontFamily: 'Arial', fontWeight: 700, fontSize: isMobile ? 20 : 30, marginBottom: 16, lineHeight: 1.25 }}>{module.tagline || module.headline}</div>}
                        {module.story && <div style={{ color: 'var(--sys-text)', fontFamily: 'Arial', fontSize: isMobile ? 12 : 15, lineHeight: 1.7, maxWidth: 560 }}>{module.story}</div>}
                    </div>
                </div>
            )
        }
        default:
            return (
                <div style={{ padding: isMobile ? '14px 16px' : '20px 32px' }}>
                    {module.headline && <div style={headline}>{module.headline}</div>}
                    {module.body && <div style={body}>{module.body}</div>}
                    {imageUrl && <img src={imageUrl} alt={module.headline} style={{ width: '100%', marginTop: 12, borderRadius: 4 }} />}
                </div>
            )
    }
}

function AmazonListingPreview({ modules, images, isPremium, onClose, productName }) {
    const [viewMode, setViewMode] = useState('desktop')
    const isMobile = viewMode === 'mobile'
    const previewWidth = isMobile ? 390 : (isPremium ? 1464 : 970)
    const containerScale = Math.min(1, (window.innerWidth - 80) / previewWidth)

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'color-mix(in srgb, var(--sys-bg) 92%, transparent)', backdropFilter: 'blur(12px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ background: 'var(--sys-surface)', borderBottom: '1px solid var(--sys-border)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Faint Amazon logo */}
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#FF9900', fontFamily: 'Arial' }}>amazon</div>
                    <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)' }}>Listing Preview</span>
                    {isPremium && (
                        <span style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)' }}>Premium A++</span>
                    )}
                    {productName && <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>{productName}</span>}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* View toggle */}
                    <div style={{ display: 'flex', background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', borderRadius: 8, padding: 3, border: '1px solid var(--sys-border)' }}>
                        {[{id:'desktop',icon:'monitor'},{id:'mobile',icon:'smartphone'}].map(v => (
                            <button key={v.id} onClick={() => setViewMode(v.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 6, border: 'none', background: viewMode === v.id ? 'rgba(255,255,255,0.15)' : 'transparent', color: viewMode === v.id ? '#FFF' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{v.icon}</span>
                                {v.id.charAt(0).toUpperCase() + v.id.slice(1)}
                            </button>
                        ))}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>{previewWidth}px{isMobile ? '' : (containerScale < 1 ? ` · scaled ${Math.round(containerScale * 100)}%` : '')}</span>
                    <button onClick={onClose} style={{ background: 'color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text)', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                    </button>
                </div>
            </div>

            {/* Preview canvas */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', background: '#888' }}>
                <div style={{ width: previewWidth, transform: `scale(${containerScale})`, transformOrigin: 'top center', marginBottom: (containerScale < 1 ? -(previewWidth * (1 - containerScale) * 0.6) : 0) }}>
                    {/* Amazon product page frame */}
                    <div style={{ background: '#FFF', fontFamily: 'Arial, sans-serif', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                        {/* Simulated breadcrumb + title bar */}
                        <div style={{ padding: '10px 18px', borderBottom: '1px solid #ddd', background: '#f5f5f5' }}>
                            <div style={{ fontSize: 11, color: '#007185' }}>Home &nbsp;›&nbsp; Electronics &nbsp;›&nbsp; {ALL_MODULE_LABELS[modules[0]?.type] || 'Product'}</div>
                        </div>
                        <div style={{ padding: '10px 18px', borderBottom: '2px solid #FF9900', background: '#FFF' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F1111' }}>{productName || 'Product Name'}</div>
                        </div>

                        {/* A+ content zone label */}
                        <div style={{ padding: '8px 18px', background: '#FFFBF0', borderBottom: '1px solid #FFE08A', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: '#996600', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isPremium ? '★ Premium A++ Content' : 'A+ Content'}</span>
                            <span style={{ fontSize: 10, color: '#999' }}>· {modules.length} modules</span>
                        </div>

                        {/* Modules */}
                        {modules.map((module, idx) => {
                            const imgKey = Object.keys(images || {}).find(k => k === module.id || k.startsWith(`${module.id}_slide_`))
                            const imgUrl = images?.[module.id] || images?.[`${module.id}_slide_0`] || null
                            return (
                                <div key={module.id || idx} style={{ borderBottom: idx < modules.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                    {renderAplusModulePreview(module, imgUrl, isMobile, isPremium)}
                                </div>
                            )
                        })}

                        {/* Amazon footer watermark */}
                        <div style={{ padding: '14px 18px', background: '#f5f5f5', borderTop: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#FF9900' }}>amazon</div>
                            <span style={{ fontSize: 11, color: '#999' }}>A+ Content — Enhanced Brand Content</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}


// ── Quick Post Panel ──────────────────────────────────────────────────────────
// Renders inside APlusTool pdi_ready state, after mood selection.
// 2-step flow: backend generates background image → canvas compositor adds logo → download all sizes.

const QP_TYPES = [
    { id: 'promo',   icon: 'campaign',     label: 'Promo Post',   desc: 'Social media, consumer-facing' },
    { id: 'order',   icon: 'shopping_bag', label: 'Order Post',   desc: 'Distributors & retailers, BOX QTY + ORDER NOW' },
    { id: 'feature', icon: 'star',         label: 'Feature Card', desc: 'Spotlight one key feature' },
]

const QP_SIZES = [
    { id: '1:1',       label: '1:1',     desc: 'Instagram / Facebook',   icon: 'crop_square',   w: 1024, h: 1024 },
    { id: '4:5',       label: '4:5',     desc: 'Feed Optimal',           icon: 'crop_5_4',      w: 896,  h: 1120 },
    { id: '9:16',      label: '9:16',    desc: 'Story / Reel / Status',  icon: 'crop_portrait', w: 832,  h: 1216 },
    { id: '16:9',      label: '16:9',    desc: 'YouTube / Banner',       icon: 'crop_landscape',w: 1344, h: 768  },
    { id: '750x750',   label: '750×750', desc: 'WhatsApp Group',         icon: 'chat',          w: 750,  h: 750  },
    { id: '1200x628',  label: '1200×628',desc: 'Meta Ad / OG',           icon: 'ads_click',     w: 1200, h: 628  },
    { id: '1080x566',  label: '1080×566',desc: 'LinkedIn Post',          icon: 'business_center',w:1080, h: 566  },
    { id: 'custom',    label: 'Custom',  desc: 'Enter any size',         icon: 'tune',          w: null, h: null },
]

const LOGO_POSITIONS = [
    'top-left', 'top-center', 'top-right',
    'mid-left', 'center',     'mid-right',
    'bot-left', 'bot-center', 'bot-right',
]

// Canvas compositor: overlays logo at chosen grid position on the background image
async function compositeWithLogo(backgroundUrl, logoUrl, logoPos) {
    return new Promise((resolve) => {
        if (!backgroundUrl) { resolve(null); return }
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const bgImg = new Image()
        bgImg.crossOrigin = 'anonymous'
        bgImg.onload = async () => {
            canvas.width  = bgImg.naturalWidth
            canvas.height = bgImg.naturalHeight
            ctx.drawImage(bgImg, 0, 0)

            if (logoUrl) {
                const logoImg = new Image()
                logoImg.crossOrigin = 'anonymous'
                logoImg.onload = () => {
                    const W = canvas.width, H = canvas.height
                    const logoW = Math.min(W * 0.18, 160)
                    const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW
                    const pad   = W * 0.04

                    const posMap = {
                        'top-left':    [pad, pad],
                        'top-center':  [(W - logoW) / 2, pad],
                        'top-right':   [W - logoW - pad, pad],
                        'mid-left':    [pad, (H - logoH) / 2],
                        'center':      [(W - logoW) / 2, (H - logoH) / 2],
                        'mid-right':   [W - logoW - pad, (H - logoH) / 2],
                        'bot-left':    [pad, H - logoH - pad],
                        'bot-center':  [(W - logoW) / 2, H - logoH - pad],
                        'bot-right':   [W - logoW - pad, H - logoH - pad],
                    }
                    const [x, y] = posMap[logoPos] || posMap['top-left']
                    ctx.drawImage(logoImg, x, y, logoW, logoH)
                    resolve(canvas.toDataURL('image/jpeg', 0.92))
                }
                logoImg.onerror = () => resolve(canvas.toDataURL('image/jpeg', 0.92))
                logoImg.src = logoUrl
            } else {
                resolve(canvas.toDataURL('image/jpeg', 0.92))
            }
        }
        bgImg.onerror = () => resolve(null)
        bgImg.src = backgroundUrl
    })
}

function QuickPostPanel({
    productDNA, productData, selectedMoodId, productMoodDirections, brandId,
    qpType, setQpType, qpRatios, toggleQpRatio,
    qpLogoOn, setQpLogoOn, qpLogoPos, setQpLogoPos,
    qpLoading, setQpLoading, qpResult, setQpResult,
    qpError, setQpError, qpCompositeUrls, setQpCompositeUrls,
    canvasRef,
}) {
    const { activeBrand } = useBrand()
    const logoUrl = activeBrand?.logoUrl || activeBrand?.logo || null
    const [customW, setCustomW] = useState(1080)
    const [customH, setCustomH] = useState(1080)

    // Custom size effective label (used when 'custom' is in qpRatios)
    const customRatioLabel = `${customW}:${customH}`

    const handleGenerate = async () => {
        if (!productDNA) return
        setQpLoading(true)
        setQpResult(null)
        setQpError('')
        setQpCompositeUrls({})
        const effectiveRatio = `${customW}:${customH}`
        const ratioList = [...qpRatios].filter(r => r !== 'custom')
        if (qpRatios.has('custom')) ratioList.push(effectiveRatio)
        try {
            const data = await apiFetch('/brand-studio/quick-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productDNA,
                    productData,
                    selectedMoodId,
                    productMoodDirections,
                    postType: qpType,
                    aspectRatios: ratioList,   // send array → parallel generation
                    brandId,
                }),
            })
            if (!data.success) throw new Error(data.error || 'Generation failed')
            setQpResult(data)

            // Composite logo onto each background in parallel
            const backgrounds = data.backgrounds || { [ratioList[0]]: data.backgroundUrl }
            const effectiveLogo = qpLogoOn && logoUrl ? logoUrl : null
            const compositeEntries = await Promise.all(
                Object.entries(backgrounds).map(async ([ratio, url]) => {
                    if (!url) return [ratio, null]
                    const composited = await compositeWithLogo(url, effectiveLogo, qpLogoPos)
                    return [ratio, composited]
                })
            )
            setQpCompositeUrls(Object.fromEntries(compositeEntries))
        } catch (e) {
            setQpError(e.message)
        }
        setQpLoading(false)
    }

    const handleDownload = (dataUrl, size) => {
        if (!dataUrl) return
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `quick_post_${size.replace(':', 'x')}_${Date.now()}.jpg`
        a.click()
    }

    const handleRecomposite = async () => {
        if (!qpResult) return
        const backgrounds = qpResult.backgrounds || {}
        const effectiveLogo = qpLogoOn && logoUrl ? logoUrl : null
        const compositeEntries = await Promise.all(
            Object.entries(backgrounds).map(async ([ratio, url]) => {
                if (!url) return [ratio, null]
                const composited = await compositeWithLogo(url, effectiveLogo, qpLogoPos)
                return [ratio, composited]
            })
        )
        setQpCompositeUrls(Object.fromEntries(compositeEntries))
    }

    const copy = qpResult?.copy || {}
    const palette = qpResult?.palette || productDNA?.dominantColors?.slice(0, 5) || []

    return (
        <div style={{ background: 'linear-gradient(135deg, #0d0d1a 0%, #0A0A14 100%)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))', border: '1px solid rgba(124,58,237,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#A78BFA' }}>campaign</span>
                </div>
                <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#FFF', letterSpacing: '-0.01em' }}>Quick Posts</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Generate promo posts, order posts &amp; feature cards using your locked palette + mood</div>
                </div>
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#F59E0B', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', padding: '3px 8px', borderRadius: 5, fontWeight: 700 }}>8 credits · ~45s</span>
            </div>

            {/* Step 1: Post Type */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Post Type</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    {QP_TYPES.map(t => (
                        <div key={t.id} onClick={() => setQpType(t.id)} style={{
                            borderRadius: 10, border: `1.5px solid ${qpType === t.id ? '#A78BFA' : 'rgba(255,255,255,0.08)'}`,
                            padding: '12px 14px', cursor: 'pointer', transition: 'all 0.2s',
                            background: qpType === t.id ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: qpType === t.id ? '#A78BFA' : 'rgba(255,255,255,0.4)' }}>{t.icon}</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: qpType === t.id ? '#FFF' : 'rgba(255,255,255,0.6)' }}>{t.label}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4 }}>{t.desc}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Step 2: Size / Aspect Ratio — multi-select */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                    Output Sizes
                    <span style={{ marginLeft: 8, fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 400 }}>select multiple — generated in parallel</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {QP_SIZES.map(s => {
                        const active = qpRatios.has(s.id)
                        return (
                            <div key={s.id} onClick={() => toggleQpRatio(s.id)} style={{
                                borderRadius: 8, border: `1.5px solid ${active ? '#F59E0B' : 'rgba(255,255,255,0.08)'}`,
                                padding: '7px 8px', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'center',
                                background: active ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                                position: 'relative',
                            }}>
                                {active && (
                                    <div style={{ position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 7, color: '#000' }}>check</span>
                                    </div>
                                )}
                                <span className="material-symbols-outlined" style={{ fontSize: 15, color: active ? '#F59E0B' : 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 2 }}>{s.icon}</span>
                                <div style={{ fontSize: 10, fontWeight: 700, color: active ? '#FFF' : 'rgba(255,255,255,0.5)' }}>{s.label}</div>
                                <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{s.desc}</div>
                            </div>
                        )
                    })}
                </div>
                {qpRatios.has('custom') && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>WIDTH (px)</div>
                            <input
                                type="number" value={customW} onChange={e => setCustomW(Math.max(100, Math.min(4000, parseInt(e.target.value) || 1080)))}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 7, padding: '8px 12px', color: '#FFF', fontSize: 14, fontWeight: 700, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                            />
                        </div>
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, fontWeight: 700, marginTop: 14 }}>×</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>HEIGHT (px)</div>
                            <input
                                type="number" value={customH} onChange={e => setCustomH(Math.max(100, Math.min(4000, parseInt(e.target.value) || 1080)))}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 7, padding: '8px 12px', color: '#FFF', fontSize: 14, fontWeight: 700, outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 14, flexShrink: 0 }}>→ {customW}×{customH}px</div>
                    </div>
                )}
                {qpRatios.size > 1 && (
                    <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>bolt</span>
                        {qpRatios.size} sizes selected — all generated in parallel — 12 credits
                    </div>
                )}
            </div>

            {/* Step 3: Logo Toggle + Position Grid */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: qpLogoOn ? 14 : 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>corporate_fare</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#FFF', flex: 1 }}>Brand Logo Placement</span>
                    {logoUrl ? (
                        <img src={logoUrl} alt="brand logo" style={{ height: 22, maxWidth: 60, objectFit: 'contain', borderRadius: 4, opacity: 0.7 }} onError={e => e.target.style.display='none'} />
                    ) : (
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Upload logo in Brand DNA</span>
                    )}
                    {/* Toggle */}
                    <div onClick={() => setQpLogoOn(v => !v)} style={{ width: 42, height: 24, borderRadius: 12, background: qpLogoOn ? '#7c3aed' : 'rgba(255,255,255,0.12)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                        <div style={{ position: 'absolute', top: 3, left: qpLogoOn ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#FFF', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
                    </div>
                </div>
                {qpLogoOn && (
                    <div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Logo Position — click to place</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 160 }}>
                            {LOGO_POSITIONS.map(pos => (
                                <div key={pos} onClick={() => { setQpLogoPos(pos); handleRecomposite() }} style={{
                                    width: '100%', aspectRatio: '1', borderRadius: 6,
                                    border: `1.5px solid ${qpLogoPos === pos ? '#A78BFA' : 'rgba(255,255,255,0.1)'}`,
                                    background: qpLogoPos === pos ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.04)',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                                }}>
                                    {qpLogoPos === pos && (
                                        <span className="material-symbols-outlined" style={{ fontSize: 10, color: '#A78BFA' }}>corporate_fare</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Generate Button */}
            <button onClick={handleGenerate} disabled={qpLoading} style={{
                width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
                background: qpLoading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #7c3aed 0%, #F59E0B 180%)',
                color: '#FFF', fontSize: 15, fontWeight: 800, cursor: qpLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: qpLoading ? 'none' : '0 6px 24px rgba(124,58,237,0.35)', transition: 'all 0.2s',
            }}>
                {qpLoading ? (
                    <>
                        <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #FFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        Claude extracting copy · NanoBanana generating background...
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>auto_awesome</span>
                        Generate {QP_TYPES.find(t => t.id === qpType)?.label} — 8 credits
                    </>
                )}
            </button>

            {qpError && <div style={{ marginTop: 10, color: '#EF4444', fontSize: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{qpError}</div>}

            {/* Result — Complete Designed Graphic */}
            {qpResult && !qpLoading && (
                <div style={{ marginTop: 20 }}>

                    {/* Copy summary strip */}
                    {qpResult.copy && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, padding: '10px 12px', background: 'var(--sys-surface)', borderRadius: 10, border: '1px solid var(--sys-border)' }}>
                            {qpResult.copy.productName && (
                                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--sys-text)', fontFamily: 'var(--font-display)' }}>{qpResult.copy.productName}</span>
                            )}
                            {qpResult.copy.heroSpec && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-primary)', background: 'rgba(255,77,0,0.08)', padding: '2px 8px', borderRadius: 5 }}>
                                    {qpResult.copy.heroSpec} {qpResult.copy.heroSpecLabel && <span style={{ fontWeight: 400, opacity: 0.7 }}>{qpResult.copy.heroSpecLabel}</span>}
                                </span>
                            )}
                            {[qpResult.copy.feature1, qpResult.copy.feature2, qpResult.copy.feature3].filter(Boolean).map((f, i) => (
                                <span key={i} style={{ fontSize: 10, color: 'var(--sys-text-muted)', padding: '2px 8px', borderRadius: 5, background: 'var(--sys-bg)', border: '1px solid var(--sys-border)' }}>· {f}</span>
                            ))}
                            {qpResult.copy.cta && (
                                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)' }}>{qpResult.copy.cta}</span>
                            )}
                        </div>
                    )}

                    {/* Generated graphics grid */}
                    {(() => {
                        // Collect all generated images: from backgrounds map (multi-size) or single backgroundUrl
                        const allImages = Object.entries(qpResult.backgrounds || {}).filter(([, url]) => url)
                        if (allImages.length === 0 && qpResult.backgroundUrl) {
                            allImages.push([qpResult.aspectRatio || '1:1', qpResult.backgroundUrl])
                        }
                        if (allImages.length === 0) return null
                        return (
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--sys-primary)' }}>auto_awesome</span>
                                    Generated Creative{allImages.length > 1 ? `s (${allImages.length})` : ''}
                                    <span style={{ color: 'var(--sys-text-muted)', fontSize: 9, fontWeight: 400 }}>· {qpResult.moodLabel} theme</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(allImages.length, 2)}, 1fr)`, gap: 10 }}>
                                    {allImages.map(([ratio, url]) => url && (
                                        <div key={ratio} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', position: 'relative', background: 'var(--sys-bg)' }}>
                                            <div style={{ position: 'absolute', top: 7, left: 7, zIndex: 2, fontSize: 9, background: 'rgba(0,0,0,0.65)', color: '#FFF', padding: '2px 7px', borderRadius: 4, fontWeight: 700, backdropFilter: 'blur(4px)' }}>{ratio}</div>
                                            <button
                                                onClick={() => handleDownload(url, ratio)}
                                                title="Download"
                                                style={{ position: 'absolute', top: 7, right: 7, zIndex: 2, width: 28, height: 28, borderRadius: 7, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                                            </button>
                                            <img
                                                src={url}
                                                alt={`${qpResult.copy?.productName || 'post'} ${ratio}`}
                                                style={{ width: '100%', display: 'block', objectFit: 'contain', background: 'var(--sys-bg)' }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })()}

                    {/* Actions row */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleGenerate} style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', color: 'var(--sys-text-muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span>
                            Regenerate
                        </button>
                        {(() => {
                            const allImages = Object.entries(qpResult.backgrounds || {}).filter(([, url]) => url)
                            if (allImages.length === 0 && qpResult.backgroundUrl) allImages.push([qpResult.aspectRatio || '1:1', qpResult.backgroundUrl])
                            return allImages.map(([ratio, url]) => url && (
                                <button key={ratio} onClick={() => handleDownload(url, ratio)} className="btn-primary" style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
                                    {allImages.length > 1 ? ratio : 'Download'}
                                </button>
                            ))
                        })()}
                    </div>

                    {/* Hidden canvas (kept for compat, not used for compositor anymore) */}
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
            )}

        </div>
    )
}

function APlusTool({ brandId, onContextReady, externalContext, forceTier }) {
    const [inputMode, setInputMode] = useState('url') // url | catalog | sample
    const [productUrl, setProductUrl] = useState('')
    const [analyzedProduct, setAnalyzedProduct] = useState(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [brief, setBrief] = useState('')
    const [referenceImages, setReferenceImages] = useState([])
    const [moduleCount, setModuleCount] = useState(7)
    const [listingTier, setListingTier] = useState(forceTier || 'standard')  // 'standard' | 'premium'

    const gen = useGenerate(APLUS_STAGES)
    const [editedModules, setEditedModules] = useState([])
    const [editedImages, setEditedImages] = useState({})
    const [productImages, setProductImages] = useState([])
    const [brandColors, setBrandColors] = useState([])
    const [rephrasing, setRephrasing] = useState(false)
    const [regenning, setRegenning] = useState(false)
    const [exportCopied, setExportCopied] = useState(false)
    const [previewOpen, setPreviewOpen] = useState(false)
    const [lightboxMood, setLightboxMood] = useState(null)

    // ── PDI State ──────────────────────────────────────────────────────────────
    const [pdiStep, setPdiStep] = useState('input')       // 'input' | 'analyzing' | 'pdi_ready' | 'ready'
    const [productDNA, setProductDNA] = useState(null)
    const [selectedMood, setSelectedMood] = useState(null)
    const [moodImages, setMoodImages] = useState({})       // moodId → imageUrl (AI-generated)
    const [productMoodDirections, setProductMoodDirections] = useState(null)  // AI-generated per-product moods
    const [designContext, setDesignContext] = useState(null)
    const [pdiError, setPdiError] = useState('')
    const [hoveredMood, setHoveredMood] = useState(null)

    // ── Quick Posts State ──────────────────────────────────────────────────────
    const [qpType, setQpType]               = useState('promo')
    const [qpRatios, setQpRatios]           = useState(new Set(['1:1']))  // multi-select set
    const [qpLogoOn, setQpLogoOn]           = useState(false)
    const [qpLogoPos, setQpLogoPos]         = useState('top-left')
    const [qpLoading, setQpLoading]         = useState(false)
    const [qpResult, setQpResult]           = useState(null)
    const [qpError, setQpError]             = useState('')
    const [qpCompositeUrls, setQpCompositeUrls] = useState({})
    const canvasRef                         = useRef(null)

    // Toggle a size in the qpRatios set
    const toggleQpRatio = (id) => {
        setQpRatios(prev => {
            const next = new Set(prev)
            if (next.has(id)) { if (next.size > 1) next.delete(id) }  // always keep at least one
            else next.add(id)
            return next
        })
    }

    // ── Hydrate from external context (parent ProductDiscoverySection) ──
    // When user already scanned a product in Step 1, skip the scan UI entirely
    useEffect(() => {
        if (externalContext?.productDNA) {
            setProductDNA(externalContext.productDNA)
            setAnalyzedProduct(externalContext.productData || null)
            setProductImages(externalContext.productImages || [])
            setProductUrl(externalContext.productUrl || '')
            setDesignContext(externalContext.designContext || null)
            setSelectedMood(externalContext.selectedMood || null)
            if (externalContext.productMoodDirections) setProductMoodDirections(externalContext.productMoodDirections)
            if (externalContext.moodImages) setMoodImages(externalContext.moodImages)
            // Jump straight to the generation form — no re-scan needed
            setPdiStep('pdi_ready')
        }
    }, [externalContext])

    // Fallback mood options (used before AI generates product-specific ones)
    const MOOD_STATIC = {
        editorial: { id: 'editorial', label: 'Editorial Clean', icon: 'straighten',  desc: 'Clean, precise, studio-perfect', bg: 'linear-gradient(135deg, #f0f0f0 0%, #e8e8e8 100%)' },
        bold:      { id: 'bold',      label: 'Bold Ambient',    icon: 'local_fire_department', desc: 'Dark, dramatic, cinematic', bg: 'linear-gradient(135deg, #0d0d1a 0%, #1a0d2e 100%)' },
        lifestyle: { id: 'lifestyle', label: 'Lifestyle Vibrant',icon: 'wb_sunny',    desc: 'Real-world, warm, relatable', bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' },
        luxury:    { id: 'luxury',    label: 'Premium Minimal',  icon: 'diamond',     desc: 'Luxury, spacious, refined',   bg: 'linear-gradient(135deg, #f5f5f0 0%, #e8e4dc 100%)' },
    }

    // Active mood map: AI-generated if available, else static fallback
    const activeMoods = productMoodDirections
        ? Object.fromEntries(Object.values(productMoodDirections).map((m, i) => {
            const defaultIcons = ['graphic_eq', 'local_fire_department', 'wb_sunny', 'diamond']
            const defaultBgs = [
                'linear-gradient(135deg, #0d0d1a 0%, #1a0d2e 100%)',
                'linear-gradient(135deg, #1a0a0a 0%, #2e0d0d 100%)',
                'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                'linear-gradient(135deg, #f5f5f0 0%, #e8e4dc 100%)',
            ]
            const palette = m.colorPalette || []
            const bg = palette.length >= 2
                ? `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 100%)`
                : defaultBgs[i % defaultBgs.length]
            return [m.id, {
                ...m,
                icon: m.icon || defaultIcons[i % defaultIcons.length],
                desc: m.description || m.desc || '',
                bg,
            }]
        }))
        : MOOD_STATIC

    const handleAnalyzeUrl = async () => {
        if (!productUrl) return
        setAnalyzing(true)
        setPdiStep('analyzing')
        setPdiError('')
        // ━━ Reset ALL prior product state so old product NEVER bleeds into new analysis ━━
        setProductDNA(null)
        setMoodImages({})
        setProductMoodDirections(null)
        setSelectedMood(null)
        setDesignContext(null)
        setAnalyzedProduct(null)
        setProductImages([])
        try {
            const data = await apiFetch('/brand-studio/aplus/analyze-product', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: productUrl })
            })
            if (data.success) {
                setAnalyzedProduct(data.product)
                const images = data.product.images || []
                setProductImages(images)
                console.log(`📦 Product scraped: "${data.product.title}" — ${images.length} images found`)
                if (images.length === 0) {
                    console.warn('⚠️ No images scraped. PDI will run text-only fallback. Check if the URL is behind a login or bot-protection.')
                }
                await runProductIntelligence(images, data.product)
            }
        } catch (e) { setPdiError(e.message); setPdiStep('input') }
        setAnalyzing(false)
    }

    const runProductIntelligence = async (images, product) => {
        if (!images.length && !product?.title) { setPdiStep('ready'); return }
        try {
            const data = await apiFetch('/brand-studio/product-intelligence', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                // Pass all images (up to 8) for two-stage diversity classification
                body: JSON.stringify({ productImages: images.slice(0, 8), productData: product, brief, brandId })
            })
            if (data.success && data.productDNA) {
                setProductDNA(data.productDNA)
                const defaultMood = data.productDNA.defaultMoodDirection || 'editorial'
                setSelectedMood(defaultMood)
                setPdiStep('pdi_ready')
                await buildDesignContextFromMood(data.productDNA, defaultMood, null)
                generateMoodBoardInBackground(data.productDNA, product)
            }
        } catch (e) { console.warn('PDI failed:', e.message); setPdiStep('ready') }
    }

    const buildDesignContextFromMood = async (dna, moodId, customDirs = null) => {
        try {
            const data = await apiFetch('/brand-studio/design-context', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productDNA: dna,
                    selectedMoodId: moodId,
                    brandColors,
                    customMoodDirections: customDirs || productMoodDirections || null,
                })
            })
            if (data.success) setDesignContext(data.designContext)
        } catch (e) { console.warn('Design context build failed:', e.message) }
    }

    const generateMoodBoardInBackground = async (dna, product) => {
        try {
            const data = await apiFetch('/brand-studio/mood-board', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productDNA: dna, productData: product || analyzedProduct, brandId })
            })
            if (data.success) {
                // Store AI-generated mood directions (product-specific names and descriptions)
                if (data.moodDirections && Object.keys(data.moodDirections).length >= 2) {
                    setProductMoodDirections(data.moodDirections)
                    // Select first AI mood direction as default
                    const firstMoodId = Object.keys(data.moodDirections)[0]
                    setSelectedMood(firstMoodId)
                    if (dna) await buildDesignContextFromMood(dna, firstMoodId, data.moodDirections)
                }
                // Store mood images
                if (data.moods) {
                    const newImages = {}
                    data.moods.forEach(m => { if (m.imageUrl) newImages[m.id] = m.imageUrl })
                    setMoodImages(newImages)
                }
            }
        } catch (e) { console.warn('Mood board AI gen failed (using static presets):', e.message) }
    }

    const handleSelectMood = async (moodId) => {
        setSelectedMood(moodId)
        const dc = productDNA ? await buildDesignContextFromMood(productDNA, moodId, productMoodDirections) : null
        // Bubble context up to parent PulseStudio so all tools share it
        if (onContextReady && productDNA) {
            onContextReady({
                productData:           analyzedProduct,
                productDNA,
                productImages,
                productUrl,
                selectedMood:          moodId,
                productMoodDirections,
                moodImages,
                designContext:         dc,
            })
        }
    }

    const handleUploadAndAnalyzeImages = async (files) => {
        const urls = await Promise.all(files.map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })))
        // Reset all prior state before new upload analysis
        setProductDNA(null)
        setMoodImages({})
        setProductMoodDirections(null)
        setSelectedMood(null)
        setDesignContext(null)
        setReferenceImages(urls); setProductImages(urls)
        setPdiStep('analyzing')
        await runProductIntelligence(urls, analyzedProduct || {})
    }

    const handleGenerate = async () => {
        if (!brandId) return
        gen.start()
        try {
            const data = await apiFetch('/brand-studio/aplus/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId, brief, moduleCount,
                    listingTier,
                    productUrl: inputMode === 'url' ? productUrl : null,
                    productData: analyzedProduct || null,
                    referenceImages: referenceImages.length ? referenceImages : null,
                    designContext: designContext || null,
                    productDNA: productDNA || null,
                })
            })
            if (!data.success) throw new Error(data.error)
            gen.setResult(data)
            setEditedModules(JSON.parse(JSON.stringify(data.aplusPlan.modules || [])))
            setEditedImages(data.images || {})
            if (data.productData?.images) setProductImages(data.productData.images)
            gen.stop(true)
        } catch (err) { gen.setError(err.message); gen.stop(false) }
    }

    const updateModuleField = (moduleIdx, field, value) => {
        setEditedModules(prev => {
            const updated = [...prev]; const m = { ...updated[moduleIdx] }; const parts = field.split('.')
            if (parts.length === 1) { m[parts[0]] = value }
            else if (parts.length === 2) {
                if (parts[0] === 'bullets') { const arr = [...(m.bullets || [])]; arr[parseInt(parts[1])] = value; m.bullets = arr }
                else { m[parts[0]] = { ...(m[parts[0]] || {}), [parts[1]]: value } }
            } else if (parts.length === 3) {
                const arr = [...(m[parts[0]] || [])]; arr[parseInt(parts[1])] = { ...arr[parseInt(parts[1])], [parts[2]]: value }; m[parts[0]] = arr
            }
            updated[moduleIdx] = m; return updated
        })
    }

    const handleRephrase = async (moduleIdx, field, currentText, moduleType) => {
        setRephrasing(true)
        try {
            const res = await apiFetch('/brand-studio/aplus/rephrase', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: currentText, context: `Module type: ${moduleType}`, instruction: 'Make it more compelling, benefit-focused, and Amazon A+ compliant. Keep it concise.' })
            })
            if (res.success && res.text) updateModuleField(moduleIdx, field, res.text)
        } catch (e) { console.error(e) }
        setRephrasing(false)
    }

    const handleRegenImage = async (moduleIdx) => {
        setRegenning(true)
        try {
            const module = editedModules[moduleIdx]
            const res = await apiFetch('/brand-studio/aplus/regenerate-image', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePrompt: module.imagePrompt, moduleType: module.type, productImages, brandColors, designContext })
            })
            if (res.success && res.imageUrl) setEditedImages(prev => ({ ...prev, [module.id]: res.imageUrl }))
        } catch (e) { console.error(e) }
        setRegenning(false)
    }

    const handleCopyExportText = () => {
        const text = editedModules.map((m, i) => {
            const cfg = MODULE_TYPE_CONFIG[m.type] || { label: m.type }
            const lines = [`[Module ${i + 1}: ${cfg.label}${m.type?.startsWith('premium_') || ['carousel','hotspot','video_module','qa_panel','enhanced_comparison'].includes(m.type) ? ' — Premium A++' : ''}]`]
            if (m.headline) lines.push(`Headline: ${m.headline}`)
            if (m.subheadline) lines.push(`Subheadline: ${m.subheadline}`)
            if (m.body) lines.push(`Body: ${m.body}`)
            if (m.story) lines.push(`Brand Story: ${m.story}`)
            if (m.bullets?.length) lines.push(`Bullets:\n${m.bullets.map(b => `  • ${b}`).join('\n')}`)
            if (m.altText) lines.push(`Alt Text: ${m.altText}`)
            // Premium module exports
            if (m.slides?.length) {
                m.slides.forEach((s, si) => lines.push(`  Slide ${si+1}: ${s.headline || ''} — ${s.body || ''}`))
            }
            if (m.hotspots?.length) {
                m.hotspots.forEach(h => lines.push(`  Hotspot ${h.number}: ${h.title} — ${h.description}`))
            }
            if (m.questions?.length) {
                m.questions.forEach(q => { lines.push(`  Q: ${q.question}`); lines.push(`  A: ${q.answer}`) })
            }
            if (m.rows?.length) lines.push(`Comparison: ${m.rows.map(r => `${r.feature}: ${r.model1Value}`).join(' | ')}`)
            return lines.join('\n')
        }).join('\n\n─────────────────────────────────\n\n')
        navigator.clipboard.writeText(text); setExportCopied(true); setTimeout(() => setExportCopied(false), 2500)
    }

    // ── Result View ──────────────────────────────────────────────────────────
    if (gen.result && editedModules.length > 0) {
        const plan = gen.result.aplusPlan; const imageCount = Object.keys(editedImages).length
        const resultMood = gen.result.designContext?.moodLabel
        const isPremiumResult = gen.result.isPremium || listingTier === 'premium'
        return (
            <div>
                {(productDNA || resultMood) && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(245,158,11,0.08))', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#A78BFA' }}>palette</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA' }}>Product Design Intelligence Active</span>
                        <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                            {resultMood && `${resultMood}`}{productDNA?.dominantColors?.length > 0 && ` · ${productDNA.dominantColors.length} colors locked`} · Color Guard enabled
                        </span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                            {productDNA?.dominantColors?.slice(0, 6).map((c, i) => (
                                <div key={i} title={`${c.name} ${c.hex}`} style={{ width: 16, height: 16, borderRadius: 3, background: c.hex, border: '1px solid var(--sys-border)' }} />
                            ))}
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }}></div>
                            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--sys-text)' }}>{plan.productName || 'A+ Listing'}</span>
                            {isPremiumResult ? (
                                <span style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(234,179,8,0.2))', color: '#F59E0B', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>diamond</span>
                                    Premium A++
                                </span>
                            ) : (
                                <span style={{ background: 'rgba(124,58,237,0.2)', color: '#A78BFA', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>Standard A+</span>
                            )}
                            <span style={{ background: 'rgba(124,58,237,0.15)', color: '#C4B5FD', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{editedModules.length} modules</span>
                            <span style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{imageCount} images</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>{plan.contentStrategy}</div>
                    </div>
                     <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleCopyExportText} style={{ background: exportCopied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)', border: '1px solid ' + (exportCopied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.15)'), color: exportCopied ? '#22C55E' : '#FFF', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{exportCopied ? 'check' : 'content_copy'}</span>
                            {exportCopied ? 'Copied!' : 'Copy All Text'}
                        </button>
                        <button onClick={() => setPreviewOpen(true)} style={{ background: 'linear-gradient(135deg, rgba(255,153,0,0.2), rgba(255,153,0,0.1))', border: '1px solid rgba(255,153,0,0.4)', color: '#FF9900', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>preview</span>
                            Preview on Amazon
                        </button>
                        <button onClick={gen.reset} style={{ background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--sys-text)', padding: '10px 18px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>↻ Start Over</button>
                    </div>
                </div>
                {/* Amazon compliance + tier notice */}
                <div style={{ background: isPremiumResult ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.07)', border: `1px solid ${isPremiumResult ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#F59E0B', flexShrink: 0, marginTop: 1 }}>{isPremiumResult ? 'diamond' : 'warning'}</span>
                    <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', lineHeight: 1.6 }}>
                        {isPremiumResult ? (
                            <><strong style={{ color: '#F59E0B' }}>Premium A++ Content (1464px)</strong> — Full-bleed immersive layout with Carousel, Hotspot, and Q&A modules. Upload to Seller Central → A+ Content Manager → Premium A+. Images must be &lt;2MB each, RGB, JPG/PNG only.</>
                        ) : (
                            <><strong style={{ color: 'var(--sys-text)' }}>Standard A+ Content (970px)</strong> — Amazon rules applied. No pricing, competitor mentions, or unverified claims. All images are text-free. Review each module before uploading to Seller Central.</>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {editedModules.map((module, idx) => (
                        <AplusModuleCard key={module.id || idx} module={module} idx={idx} image={editedImages[module.id]}
                            onUpdate={updateModuleField} onRephrase={handleRephrase} onRegenImage={handleRegenImage}
                            rephrasing={rephrasing} regenning={regenning} productImages={productImages} brandColors={brandColors} />
                    ))}
                </div>
                <div style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 14, padding: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#F59E0B' }}>upload</span>
                        Upload to Amazon Seller Central
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 10, padding: 16, border: '1px solid var(--sys-border)' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#F59E0B' }}>content_copy</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 4 }}>Copy Text</div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginBottom: 10 }}>Copy all module headlines, body, and alt-text for Seller Central</div>
                            <button onClick={handleCopyExportText} style={{ width: '100%', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{exportCopied ? 'check' : 'content_copy'}</span>
                                {exportCopied ? 'Copied!' : 'Copy All Text'}
                            </button>
                        </div>
                        <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 10, padding: 16, border: '1px solid var(--sys-border)' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#22C55E' }}>download</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 4 }}>Download Images</div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginBottom: 10 }}>Download each module image named by module type</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {Object.entries(editedImages).map(([moduleId, imgUrl], i) => {
                                    const m = editedModules.find(m => m.id === moduleId); const cfg = MODULE_TYPE_CONFIG[m?.type] || { label: m?.type }
                                    return <button key={i} onClick={() => downloadImageFile(imgUrl, `aplus_${i + 1}_${m?.type || 'module'}.jpg`)} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span>{i + 1}. {cfg.label?.split(' ')[0]}
                                    </button>
                                })}
                            </div>
                        </div>
                        <div style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', borderRadius: 10, padding: 16, border: '1px solid var(--sys-border)' }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#F59E0B' }}>open_in_new</span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 4 }}>Upload to Amazon</div>
                            <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', marginBottom: 10 }}>Go to Seller Central → A+ Content Manager and paste module by module</div>
                            <a href="https://sellercentral.amazon.com/enhanced-content/overview" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>Open Seller Central
                            </a>
                        </div>
                    </div>
                </div>

                {/* Amazon listing preview — portalled to body so position:fixed works from any container */}
                {previewOpen && createPortal(
                    <AmazonListingPreview
                        modules={editedModules}
                        images={editedImages}
                        isPremium={isPremiumResult}
                        productName={plan.productName || productDNA?.productCategory}
                        onClose={() => setPreviewOpen(false)}
                    />,
                    document.body
                )}
            </div>
        )
    }

    // ── PDI Ready — Palette + Mood Selector + Generate ────────────────────────
    if (pdiStep === 'pdi_ready' && productDNA) {
        const activeMood = activeMoods[selectedMood] || activeMoods[Object.keys(activeMoods)[0]] || MOOD_STATIC.editorial
        return (
            <div style={{ position: 'relative' }}>
                {/* ProductDNA Card */}
                <div style={{ background: 'var(--sys-surface)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#A78BFA' }}>palette</span>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#A78BFA' }}>auto_awesome</span>
                                Product Design Intelligence
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>{productDNA.productCategory} · {productDNA.materials} · {productDNA.surfaceFinish}</div>
                        </div>
                        <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 700, background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>lock</span> Colors Locked
                        </span>
                    </div>

                    {/* Product Identity Confirmation — shows user EXACTLY what was analyzed */}
                    {analyzedProduct?.title && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22C55E', flexShrink: 0 }}>inventory_2</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{analyzedProduct.title}</div>
                                <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginTop: 1 }}>
                                    {productDNA.productCategory}
                                    {analyzedProduct.brand ? ` · ${analyzedProduct.brand}` : ''}
                                    {` · ${productImages.length} images analysed`}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                {productImages.slice(0, 3).map((img, i) => (
                                    <img key={i} src={img} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover', border: '1px solid var(--sys-border)' }} onError={e => e.target.style.display='none'} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Color Palette — image-format strip */}
                    {productDNA.dominantColors?.length > 0 && (
                        <ColorPaletteStrip colors={productDNA.dominantColors} />
                    )}


                    {/* Mood Board Selector */}
                    <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>style</span>
                        Visual Mood Direction — Designer Mood Boards
                        {Object.keys(moodImages).length > 0 ? (
                            <span style={{ marginLeft: 4, color: '#A78BFA', textTransform: 'none', letterSpacing: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span> AI mood boards ready
                            </span>
                        ) : (
                            <span style={{ marginLeft: 4, color: 'rgba(124,58,237,0.5)', textTransform: 'none', letterSpacing: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>hourglass_empty</span> Generating mood boards...
                            </span>
                        )}
                    </div>
                    {/* Mood boards — 2x2 grid for larger display */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 16 }}>
                        {Object.values(activeMoods).map(mood => {
                            const aiImg = moodImages[mood.id]
                            const isSelected = selectedMood === mood.id
                            const moodSwatches = {
                                editorial: ['#FFFFFF', '#F5F0EA', '#E8E4DF', '#D0C8BF'],
                                bold:      ['#0D0D0D', '#1A0D2E', '#7B2FFF', '#2A1A5A'],
                                lifestyle: ['#C97B5A', '#8FA888', '#E8D5B7', '#6B8C6B'],
                                luxury:    ['#F8F4EF', '#C9A96E', '#2A2A2A', '#8B7355'],
                            }
                            const swatches = moodSwatches[mood.id] || []
                            const isHovered = hoveredMood === mood.id
                            return (
                                <div key={mood.id}
                                    onClick={() => handleSelectMood(mood.id)}
                                    onMouseEnter={() => setHoveredMood(mood.id)}
                                    onMouseLeave={() => setHoveredMood(null)}
                                    style={{
                                        borderRadius: 14, border: `2px solid ${isSelected ? '#A78BFA' : 'rgba(255,255,255,0.08)'}`,
                                        overflow: 'hidden', cursor: 'pointer', transition: 'all 0.25s',
                                        boxShadow: isSelected ? '0 0 0 3px rgba(124,58,237,0.25), 0 8px 32px rgba(124,58,237,0.2)' : '0 2px 8px rgba(0,0,0,0.3)',
                                        background: 'var(--sys-surface)', transform: isSelected ? 'scale(1.02)' : 'none', position: 'relative',
                                    }}>
                                    {/* Main mood board image */}
                                    <div style={{ height: 160, position: 'relative', overflow: 'hidden' }}>
                                        {aiImg ? (
                                            <img src={aiImg} alt={`${mood.label} mood board`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                        ) : (
                                            <div style={{ height: '100%', background: mood.bg, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                                                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2 }}>
                                                    <div style={{ background: `linear-gradient(135deg, ${swatches[0]}, ${swatches[1]})`, borderRadius: '0 0 4px 0' }} />
                                                    <div style={{ background: swatches[2] || swatches[1], borderRadius: '0 0 0 4px' }} />
                                                    <div style={{ background: swatches[3] || swatches[0], opacity: 0.85, borderRadius: '0 4px 0 0' }} />
                                                    <div style={{ background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: '4px 0 0 0' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: mood.id === 'editorial' ? '#888' : mood.id === 'bold' ? '#A78BFA' : mood.id === 'lifestyle' ? '#D97706' : '#C9A96E' }}>{mood.icon}</span>
                                                    </div>
                                                </div>
                                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 20, display: 'flex' }}>
                                                    {swatches.map((sw, si) => <div key={si} style={{ flex: 1, background: sw }} />)}
                                                </div>
                                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)' }} />
                                            </div>
                                        )}
                                        {/* Hover overlay with zoom + download */}
                                        {isHovered && (
                                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s' }}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setLightboxMood(mood.id) }}
                                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'var(--sys-text)', width: 60, height: 60, borderRadius: 12, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 22, marginTop: 10 }}>zoom_in</span>
                                                    <span style={{ fontSize: 9, fontWeight: 600 }}>View</span>
                                                </button>
                                                {aiImg && (
                                                    <a href={aiImg} download={`moodboard_${mood.id}.jpg`} target="_blank" rel="noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'var(--sys-text)', width: 60, height: 60, borderRadius: 12, cursor: 'pointer', textDecoration: 'none', backdropFilter: 'blur(8px)' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 22, marginTop: 10 }}>download</span>
                                                        <span style={{ fontSize: 9, fontWeight: 600 }}>Save</span>
                                                    </a>
                                                )}
                                            </div>
                                        )}
                                        {/* Selection check */}
                                        {isSelected && (
                                            <div style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: '50%', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(124,58,237,0.5)' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--sys-text)' }}>check</span>
                                            </div>
                                        )}
                                        {/* Mood board label */}
                                        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700, color: isSelected ? '#C4B5FD' : 'rgba(255,255,255,0.8)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Mood Board</div>
                                    </div>
                                    {/* Card details */}
                                    <div style={{ padding: '10px 12px', background: isSelected ? 'rgba(124,58,237,0.12)' : 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: isSelected ? '#A78BFA' : 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{mood.icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
                                                <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#A78BFA' : '#FFF', lineHeight: 1.3 }}>{mood.label}</div>
                                                {productMoodDirections && <span style={{ fontSize: 8, color: 'rgba(139,92,246,0.7)', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 3, padding: '1px 4px', fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>AI</span>}
                                            </div>
                                            <div style={{ fontSize: 9.5, color: 'var(--sys-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mood.desc || mood.description || ''}</div>
                                        </div>
                                        {/* Swatch strip */}
                                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                            {swatches.slice(0, 3).map((sw, si) => (
                                                <div key={si} style={{ width: 10, height: 10, borderRadius: 2, background: sw, border: '1px solid var(--sys-border)' }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8, padding: '8px 12px' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22C55E' }}>lock</span>
                        Product colors are locked. AI will NOT change product color under any circumstances.
                    </div>
                </div>


                {/* Brief */}
                <div style={{ background: 'var(--sys-surface)', borderRadius: 14, padding: 20, border: '1px solid var(--sys-border)', marginBottom: 20 }}>
                    <label style={{ fontSize: 12, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>A+ Content Brief</label>
                    <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3}
                        placeholder="Key USPs, target audience, tone. E.g. 'Indian millennials, 65hr battery, ANC, emphasize music clarity.'"
                        style={{ width: '100%', background: 'color-mix(in srgb, var(--sys-text) 5%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 10, padding: '12px 14px', color: 'var(--sys-text)', fontSize: 14, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>Modules:</label>
                        {[5, 6, 7, 8].map(n => (
                            <button key={n} onClick={() => setModuleCount(n)} style={{ width: 36, height: 36, borderRadius: 8, background: moduleCount === n ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (moduleCount === n ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'), color: moduleCount === n ? '#A78BFA' : 'rgba(255,255,255,0.5)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{n}</button>
                        ))}
                        <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginLeft: 'auto' }}>25 credits · ~90s</span>
                    </div>
                </div>

                <button onClick={handleGenerate} disabled={gen.loading} style={{
                    width: '100%', padding: '15px 32px', borderRadius: 12, border: 'none', color: 'var(--sys-text)', fontSize: 16, fontWeight: 800,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #F59E0B 150%)',
                    cursor: gen.loading ? 'not-allowed' : 'pointer', opacity: gen.loading ? 0.6 : 1,
                    boxShadow: '0 8px 32px rgba(124,58,237,0.4)', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{activeMood.icon}</span>
                    Generate with {activeMood.label} — 25 credits
                </button>
                <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="stars" />

                {/* Mood board lightbox */}
                {lightboxMood && (
                    <MoodBoardLightbox
                        moods={activeMoods}
                        moodImages={moodImages}
                        moodSwatches={{ editorial: ['#FFFFFF', '#F5F0EA', '#E8E4DF', '#D0C8BF'], bold: ['#0D0D0D', '#1A0D2E', '#7B2FFF', '#2A1A5A'], lifestyle: ['#C97B5A', '#8FA888', '#E8D5B7', '#6B8C6B'], luxury: ['#F8F4EF', '#C9A96E', '#2A2A2A', '#8B7355'] }}
                        openMoodId={lightboxMood}
                        onClose={() => setLightboxMood(null)}
                        productDNA={productDNA}
                    />
                )}
            </div>
        )
    }

    // ── Input View (Step 1) ────────────────────────────────────────────────────
    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {[{ id: 'url', label: 'Product URL', icon: 'link' }, { id: 'catalog', label: 'Brand Catalog', icon: 'inventory_2' }, { id: 'sample', label: 'Upload Sample', icon: 'upload' }].map(m => (
                    <button key={m.id} onClick={() => setInputMode(m.id)} style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid ' + (inputMode === m.id ? 'rgba(124,58,237,0.4)' : 'var(--sys-border)'), background: inputMode === m.id ? 'rgba(124,58,237,0.15)' : 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', color: inputMode === m.id ? '#A78BFA' : 'var(--sys-text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{m.icon}</span>{m.label}
                    </button>
                ))}
            </div>

            {inputMode === 'url' && (
                <div style={{ background: 'var(--sys-surface)', borderRadius: 14, padding: 20, border: '1px solid var(--sys-border)', marginBottom: 20 }}>
                    <label style={{ fontSize: 12, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Product URL (Amazon, Shopify, or any website)</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <input value={productUrl} onChange={e => setProductUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyzeUrl()}
                            placeholder="https://www.amazon.in/dp/XXXXXXXXXX or any product link..."
                            style={{ flex: 1, background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 10, padding: '12px 16px', color: 'var(--sys-text)', fontSize: 14, outline: 'none' }} />
                        <button onClick={handleAnalyzeUrl} disabled={pdiStep === 'analyzing' || !productUrl}
                            style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#A78BFA', padding: '12px 20px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{pdiStep === 'analyzing' ? 'hourglass_empty' : 'palette'}</span>
                            {pdiStep === 'analyzing' ? 'Analyzing...' : 'Analyze + Design'}
                        </button>
                    </div>
                    {pdiStep === 'analyzing' && (
                        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                                { icon: 'search', text: 'Scraping product data...' },
                                { icon: 'palette', text: 'Extracting color palette via AI vision...' },
                                { icon: 'psychology', text: 'Building design intelligence...' }
                            ].map((s, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                    <div style={{ width: 14, height: 14, border: '2px solid rgba(124,58,237,0.2)', borderTop: '2px solid #A78BFA', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{s.icon}</span>
                                    {s.text}
                                </div>
                            ))}
                        </div>
                    )}
                    {analyzedProduct && pdiStep !== 'analyzing' && (
                        <div style={{ marginTop: 14, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: 14 }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                {analyzedProduct.images?.[0] && <img src={analyzedProduct.images[0]} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)' }}>{analyzedProduct.title}</div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                        {analyzedProduct.price && <span style={{ fontSize: 11, background: 'rgba(34,197,94,0.15)', color: '#22C55E', padding: '2px 7px', borderRadius: 4 }}>{analyzedProduct.price}</span>}
                                        {analyzedProduct.rating && <span style={{ fontSize: 11, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', padding: '2px 7px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 3 }}><span className="material-symbols-outlined" style={{ fontSize: 11 }}>star</span> {analyzedProduct.rating}</span>}
                                    </div>
                                </div>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#22C55E' }}>check_circle</span>
                            </div>
                        </div>
                    )}
                    {pdiError && <div style={{ marginTop: 10, color: '#EF4444', fontSize: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8 }}>{pdiError}</div>}
                </div>
            )}

            {inputMode === 'catalog' && (
                <div style={{ background: 'var(--sys-surface)', borderRadius: 14, padding: 20, border: '1px solid var(--sys-border)', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--sys-text-muted)', fontSize: 13 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>inventory_2</span>
                        Brand products will be loaded automatically from your catalog. Add your brief below to focus on specific products.
                    </div>
                </div>
            )}

            {inputMode === 'sample' && (
                <div style={{ background: 'var(--sys-surface)', borderRadius: 14, padding: 20, border: '1px solid var(--sys-border)', marginBottom: 20 }}>
                    <label style={{ fontSize: 12, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>Upload Product Images or Reference A+ Screenshots</label>
                    <div style={{ border: '2px dashed rgba(255,255,255,0.15)', borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer' }}
                        onClick={() => document.getElementById('aplus-ref-upload').click()}>
                        <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(255,255,255,0.2)', display: 'block', marginBottom: 8 }}>upload_file</span>
                        <div style={{ fontSize: 13, color: 'var(--sys-text-muted)' }}>Drop product images or A+ reference screenshots</div>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 4 }}>PDI will extract color palette + design DNA automatically</div>
                        <input id="aplus-ref-upload" type="file" accept="image/*" multiple style={{ display: 'none' }}
                            onChange={async e => await handleUploadAndAnalyzeImages(Array.from(e.target.files || []))} />
                    </div>
                    {referenceImages.length > 0 && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{referenceImages.map((img, i) => <img key={i} src={img} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--sys-border)' }} />)}</div>}
                    {pdiStep === 'analyzing' && <div style={{ marginTop: 10, fontSize: 12, color: '#A78BFA', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 14, height: 14, border: '2px solid rgba(124,58,237,0.2)', borderTop: '2px solid #A78BFA', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />Analyzing product design...</div>}
                </div>
            )}

            <div style={{ background: 'var(--sys-surface)', borderRadius: 14, padding: 20, border: '1px solid var(--sys-border)', marginBottom: 20 }}>
                {/* Listing Tier Selector */}
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>workspace_premium</span>
                        Listing Tier
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {/* Standard A+ */}
                        <div onClick={() => setListingTier('standard')} style={{
                            borderRadius: 12, border: `2px solid ${listingTier === 'standard' ? '#7c3aed' : 'rgba(255,255,255,0.08)'}`,
                            padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s',
                            background: listingTier === 'standard' ? 'rgba(124,58,237,0.10)' : 'rgba(255,255,255,0.03)',
                            boxShadow: listingTier === 'standard' ? '0 0 0 2px rgba(124,58,237,0.15)' : 'none',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: listingTier === 'standard' ? '#A78BFA' : 'rgba(255,255,255,0.4)' }}>stars</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: listingTier === 'standard' ? '#FFF' : 'rgba(255,255,255,0.6)' }}>Standard A+</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                {['970px wide', 'Up to 5 modules', 'Image + Text', 'Hero Banner', 'Comparison'].map(f => (
                                    <span key={f} style={{ fontSize: 10, background: 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', color: 'var(--sys-text-muted)', padding: '2px 7px', borderRadius: 4 }}>{f}</span>
                                ))}
                            </div>
                            <div style={{ fontSize: 12, color: listingTier === 'standard' ? '#A78BFA' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>15 credits</div>
                        </div>
                        {/* Premium A++ */}
                        <div onClick={() => setListingTier('premium')} style={{
                            borderRadius: 12, border: `2px solid ${listingTier === 'premium' ? '#F59E0B' : 'rgba(255,255,255,0.08)'}`,
                            padding: '14px 16px', cursor: 'pointer', transition: 'all 0.2s',
                            background: listingTier === 'premium' ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                            boxShadow: listingTier === 'premium' ? '0 0 0 2px rgba(245,158,11,0.15)' : 'none',
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {/* Premium shimmer top border */}
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #F59E0B, #EAB308, #F59E0B)', opacity: listingTier === 'premium' ? 1 : 0, transition: 'opacity 0.2s' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: listingTier === 'premium' ? '#F59E0B' : 'rgba(255,255,255,0.4)' }}>diamond</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: listingTier === 'premium' ? '#FFF' : 'rgba(255,255,255,0.6)' }}>Premium A++</span>
                                <span style={{ fontSize: 9, background: 'rgba(245,158,11,0.2)', color: '#F59E0B', padding: '1px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>New</span>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                {['1464px full-bleed', 'Up to 7 modules', 'Carousel', 'Hotspot', 'Q&A', 'Video'].map(f => (
                                    <span key={f} style={{ fontSize: 10, background: 'rgba(245,158,11,0.1)', color: 'rgba(245,158,11,0.8)', padding: '2px 7px', borderRadius: 4 }}>{f}</span>
                                ))}
                            </div>
                            <div style={{ fontSize: 12, color: listingTier === 'premium' ? '#F59E0B' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>25 credits · 15-30% higher conversion</div>
                        </div>
                    </div>
                </div>

                <label style={{ fontSize: 12, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>A+ Content Brief</label>
                <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4}
                    placeholder="Describe your product, target audience, key USPs, tone, and any specific messaging goals. E.g. 'Premium wireless earbuds targeting Indian millennials. USPs: 65hr battery, ANC, IPX5. Emphasize music clarity + durability.'"
                    style={{ width: '100%', background: 'color-mix(in srgb, var(--sys-text) 5%, var(--sys-surface))', border: '1px solid var(--sys-border)', borderRadius: 10, padding: '12px 14px', color: 'var(--sys-text)', fontSize: 14, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                    <label style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>Modules:</label>
                    {(listingTier === 'premium' ? [5, 6, 7] : [3, 4, 5]).map(n => (
                        <button key={n} onClick={() => setModuleCount(n)} style={{ width: 36, height: 36, borderRadius: 8, background: moduleCount === n ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (moduleCount === n ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'), color: moduleCount === n ? '#A78BFA' : 'rgba(255,255,255,0.5)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>{n}</button>
                    ))}
                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginLeft: 'auto' }}>
                        {listingTier === 'premium' ? '25 credits · 1464px · ~2min' : '15 credits · 970px · ~90s'}
                    </span>
                </div>
            </div>

            {/* Generate CTA */}
            {pdiStep === 'input' && brief && (
                <button onClick={handleGenerate} disabled={gen.loading || (!brief && !analyzedProduct)}
                    style={{
                        width: '100%', padding: '15px 32px', borderRadius: 12,
                        background: listingTier === 'premium'
                            ? 'linear-gradient(135deg, #F59E0B, #D97706)'
                            : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        border: 'none', color: 'var(--sys-text)', fontSize: 16, fontWeight: 800,
                        cursor: gen.loading || (!brief && !analyzedProduct) ? 'not-allowed' : 'pointer',
                        opacity: gen.loading || (!brief && !analyzedProduct) ? 0.6 : 1,
                        boxShadow: listingTier === 'premium' ? '0 8px 24px rgba(245,158,11,0.3)' : '0 8px 24px rgba(124,58,237,0.3)',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
                    }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{listingTier === 'premium' ? 'diamond' : 'stars'}</span>
                    {listingTier === 'premium' ? 'Generate Premium A++ — 25 credits' : 'Generate A+ Listing — 15 credits'}
                </button>
            )}

            {pdiStep === 'input' && !brief && (
                <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 13, color: 'var(--sys-text-muted)' }}>
                    Enter a product URL above to analyze &amp; auto-build design intelligence, or add a brief to generate directly
                </div>
            )}

            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="stars" />

            {/* Mood board lightbox */}
            {lightboxMood && (
                <MoodBoardLightbox
                    moods={activeMoods}
                    moodImages={moodImages}
                    moodSwatches={{ editorial: ['#FFFFFF', '#F5F0EA', '#E8E4DF', '#D0C8BF'], bold: ['#0D0D0D', '#1A0D2E', '#7B2FFF', '#2A1A5A'], lifestyle: ['#C97B5A', '#8FA888', '#E8D5B7', '#6B8C6B'], luxury: ['#F8F4EF', '#C9A96E', '#2A2A2A', '#8B7355'] }}
                    openMoodId={lightboxMood}
                    onClose={() => setLightboxMood(null)}
                    productDNA={productDNA}
                />
            )}

        </div>
    )
}


// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab({ brandId }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('all')
    const [expandedId, setExpandedId] = useState(null)
    const [copiedId, setCopiedId] = useState(null)

    useEffect(() => {
        fetchHistory()
    }, [brandId, filter])

    const fetchHistory = async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ limit: '50' })
            if (brandId) params.set('brandId', brandId)
            if (filter !== 'all') params.set('tool', filter)
            const data = await apiFetch(`/brand-studio/history?${params}`)
            if (data.success) setItems(data.items || [])
        } catch (e) { console.error(e) }
        setLoading(false)
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this generation?')) return
        try {
            await apiFetch(`/brand-studio/history/${id}`, { method: 'DELETE' })
            setItems(prev => prev.filter(i => i._id !== id))
        } catch (e) { console.error(e) }
    }

    const toolIcons = { deck: 'slideshow', email: 'mail', page: 'web', aplus: 'stars' }
    const toolColors = { deck: '#7c3aed', email: '#0ea5e9', page: '#22C55E', aplus: '#F59E0B' }
    const toolLabels = { deck: 'Pulse Deck', email: 'Pulse Mail', page: 'Pulse Page', aplus: 'A+ Listing' }

    const formatDate = (d) => {
        const date = new Date(d)
        const now = new Date()
        const diff = now - date
        if (diff < 60000) return 'Just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    const getOpenUrl = (item) => {
        if (item.tool === 'deck') return item.hostedUrl
        if (item.tool === 'email') return item.emailHostedUrl
        if (item.tool === 'page') return item.pageHostedUrl
        return null  // aplus has no hosted URL — uses inline expansion
    }

    const handleCopyAplusText = async (item) => {
        const text = item.aplusExportText || (
            (item.aplusModules || []).map((m, i) =>
                `MODULE ${i + 1}: ${m.type?.replace(/_/g,' ').toUpperCase()}\n${m.headline || ''}\n${m.body || ''}\n${m.altText ? 'ALT: ' + m.altText : ''}\n`
            ).join('\n---\n')
        )
        if (!text) return
        await navigator.clipboard.writeText(text)
        setCopiedId(item._id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                {[{ id: 'all', label: 'All', icon: 'apps' }, { id: 'deck', label: 'Decks', icon: 'slideshow' }, { id: 'email', label: 'Emails', icon: 'mail' }, { id: 'page', label: 'Pages', icon: 'web' }, { id: 'aplus', label: 'A+ Listings', icon: 'stars' }].map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)} style={{
                        background: filter === f.id ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                        color: filter === f.id ? '#FFF' : 'rgba(255,255,255,0.5)',
                        border: '1px solid ' + (filter === f.id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'),
                        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
                    }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{f.icon}</span>
                        {f.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--sys-text-muted)' }}>
                    <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
                    Loading history...
                </div>
            ) : items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 80 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.1)', display: 'block', marginBottom: 16 }}>history</span>
                    <p style={{ color: 'var(--sys-text-muted)', fontSize: 15 }}>No generations yet</p>
                    <p style={{ color: 'var(--sys-text-muted)', fontSize: 13, marginTop: 4 }}>Create your first deck, email, or landing page to see history here</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {items.map(item => {
                        const color = toolColors[item.tool] || '#7c3aed'
                        const openUrl = getOpenUrl(item)
                        return (
                            <div key={item._id} style={{ borderRadius: 12, border: `1px solid ${item._id === expandedId ? color + '40' : 'rgba(255,255,255,0.08)'}`, overflow: 'hidden', transition: 'all 0.2s', background: item._id === expandedId ? `${color}08` : '#0A0A0A' }}>
                                {/* Main row */}
                                <div style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 16,
                                    cursor: item.tool === 'aplus' ? 'pointer' : 'default'
                                }} onClick={() => item.tool === 'aplus' && setExpandedId(expandedId === item._id ? null : item._id)}>
                                    {/* Icon */}
                                    <div style={{
                                        width: 44, height: 44, borderRadius: 12,
                                        background: `${color}15`, border: `1px solid ${color}30`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 22, color }}>{toolIcons[item.tool]}</span>
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color, fontWeight: 700, background: `${color}15`, padding: '2px 8px', borderRadius: 4 }}>
                                                {toolLabels[item.tool]}
                                            </span>
                                            {item.subType && <span style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>· {item.subType}</span>}
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--sys-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.brief}
                                        </div>
                                        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                            <span>{formatDate(item.createdAt)}</span>
                                            {item.slideCount && <span>· {item.slideCount} slides</span>}
                                            {item.aplusModuleCount && <span>· {item.aplusModuleCount} modules</span>}
                                            {item.creditsUsed > 0 && <span>· {item.creditsUsed} credits</span>}
                                        </div>
                                    </div>

                                    {/* Thumbnail */}
                                    {item.thumbnailUrl && (
                                        <div style={{ width: 80, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--sys-border)' }}>
                                            <img src={item.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                        {item.tool === 'aplus' ? (
                                            // A+ uses expand-in-place
                                            <button title={expandedId === item._id ? 'Collapse' : 'View Listing'} style={{
                                                width: 36, height: 36, borderRadius: 8, background: `${color}15`, border: `1px solid ${color}30`,
                                                color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                                            }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                                    {expandedId === item._id ? 'expand_less' : 'expand_more'}
                                                </span>
                                            </button>
                                        ) : openUrl ? (
                                            <button onClick={() => window.open(openUrl, '_blank')} title="Open" style={{
                                                width: 36, height: 36, borderRadius: 8, background: `${color}15`, border: `1px solid ${color}30`,
                                                color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                                            }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
                                            </button>
                                        ) : null}
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(item._id) }} title="Delete" style={{
                                            width: 36, height: 36, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                                            color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                        </button>
                                    </div>
                                </div>

                                {/* A+ Expanded Panel */}
                                {item.tool === 'aplus' && expandedId === item._id && (
                                    <div style={{ borderTop: `1px solid ${color}20`, padding: '20px 20px 24px', background: 'color-mix(in srgb, var(--sys-bg) 40%, transparent)' }}>
                                        {/* Header action bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#A78BFA', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>stars</span>
                                                A+ Listing — {item.aplusModuleCount || (item.aplusModules?.length) || 0} Modules
                                                {item.aplusProductData?.title && <span style={{ fontWeight: 400, color: 'var(--sys-text-muted)' }}>· {item.aplusProductData.title}</span>}
                                            </div>
                                            <button onClick={() => handleCopyAplusText(item)} style={{
                                                background: copiedId === item._id ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.12)',
                                                border: `1px solid ${copiedId === item._id ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.25)'}`,
                                                color: copiedId === item._id ? '#22C55E' : '#F59E0B',
                                                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
                                                display: 'flex', alignItems: 'center', gap: 6
                                            }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{copiedId === item._id ? 'check' : 'content_copy'}</span>
                                                {copiedId === item._id ? 'Copied!' : 'Copy All Text'}
                                            </button>
                                        </div>

                                        {/* Module images grid */}
                                        {item.aplusImages && Object.keys(item.aplusImages).length > 0 ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
                                                {Object.entries(item.aplusImages).map(([moduleId, imgUrl], i) => {
                                                    const mod = (item.aplusModules || []).find(m => m.id === moduleId)
                                                    return (
                                                        <div key={moduleId} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--sys-border)', position: 'relative' }}>
                                                            <img src={imgUrl} alt={mod?.type || `Module ${i+1}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'color-mix(in srgb, var(--sys-bg) 80%, transparent)', padding: '4px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{mod?.type?.replace(/_/g,' ') || `Module ${i+1}`}</span>
                                                                <a href={imgUrl} download={`aplus_${i+1}_${mod?.type || 'module'}.jpg`} target="_blank" rel="noreferrer"
                                                                    onClick={e => e.stopPropagation()}
                                                                    style={{ color: '#A78BFA', display: 'flex' }}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span>
                                                                </a>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--sys-text-muted)', fontSize: 13, border: '1px dashed var(--sys-border)', borderRadius: 8, marginBottom: 16 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}>image_not_supported</span>
                                                Images not available in this history item
                                            </div>
                                        )}

                                        {/* Module text summary */}
                                        {(item.aplusModules || []).length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {item.aplusModules.slice(0, 4).map((m, i) => (
                                                    <div key={i} style={{ background: 'color-mix(in srgb, var(--sys-text) 3%, var(--sys-surface))', borderRadius: 8, padding: '10px 14px', border: '1px solid var(--sys-border)' }}>
                                                        <div style={{ fontSize: 10, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{m.type?.replace(/_/g,' ') || `Module ${i+1}`}</div>
                                                        {m.headline && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 2 }}>{m.headline}</div>}
                                                        {m.body && <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', lineHeight: 1.5 }}>{m.body.substring(0, 120)}{m.body.length > 120 ? '...' : ''}</div>}
                                                    </div>
                                                ))}
                                                {item.aplusModules.length > 4 && (
                                                    <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', textAlign: 'center', paddingTop: 4 }}>+{item.aplusModules.length - 4} more modules in full listing</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ── Context Library Modal ─────────────────────────────────────────────────────
function ContextLibraryModal({ brandId, onActivate, onClose }) {
    const [contexts, setContexts]     = useState([])
    const [loading, setLoading]       = useState(true)
    const [search, setSearch]         = useState('')
    const [activating, setActivating] = useState(null)

    useEffect(() => {
        if (!brandId) return
        setLoading(true)
        apiFetch(`/brand-studio/product-context?brandId=${brandId}&limit=60`)
            .then(d => { if (d.success) setContexts(d.contexts || []) })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [brandId])

    const filtered = search
        ? contexts.filter(c => c.productName.toLowerCase().includes(search.toLowerCase()))
        : contexts

    const handleActivate = async (ctx) => {
        setActivating(ctx._id)
        try {
            const full = await apiFetch(`/brand-studio/product-context/${ctx._id}`)
            if (full.success) { onActivate(full.context); onClose() }
        } catch (e) { console.error(e) }
        setActivating(null)
    }

    const handleDelete = async (id, e) => {
        e.stopPropagation()
        if (!confirm('Delete this saved context?')) return
        await apiFetch(`/brand-studio/product-context/${id}`, { method: 'DELETE' })
        setContexts(prev => prev.filter(c => c._id !== id))
    }

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div style={{ background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 16, width: '100%', maxWidth: 840, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--sys-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="glass-panel" style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 17, color: 'var(--sys-primary)' }}>library_books</span>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text)', fontFamily: 'var(--font-display)' }}>Product Context Library</div>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>Restore any saved product's palette, mood board, and DNA to use across all tools</div>
                    </div>
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search products..."
                        className="input-glass"
                        style={{ width: 180, borderRadius: 8, fontSize: 13 }}
                    />
                    <button onClick={onClose} className="btn-ghost" style={{ width: 32, height: 32, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid var(--sys-border)', fontFamily: 'inherit' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                    </button>
                </div>
                {/* Grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--sys-text-muted)' }}>
                            <div style={{ width: 28, height: 28, border: '2px solid var(--sys-border)', borderTop: '2px solid var(--sys-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                            Loading library...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--sys-text-muted)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 10 }}>inventory_2</span>
                            {search ? 'No products match your search' : 'No saved contexts yet — analyze a product in A+ Listing, then click Save Context.'}
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
                            {filtered.map(ctx => (
                                <div key={ctx._id} style={{ borderRadius: 10, border: '1px solid var(--sys-border)', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s', background: 'var(--sys-surface)' }}>
                                    <div style={{ height: 100, background: 'var(--sys-bg)', position: 'relative', overflow: 'hidden' }}>
                                        {ctx.thumbnail ? (
                                            <img src={ctx.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--sys-text-muted)', opacity: 0.4 }}>palette</span>
                                            </div>
                                        )}
                                        <button onClick={e => handleDelete(ctx._id, e)} style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 5, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                                        </button>
                                        {ctx.usedIn?.length > 0 && (
                                            <div style={{ position: 'absolute', bottom: 5, left: 5, display: 'flex', gap: 3 }}>
                                                {ctx.usedIn.slice(0,3).map(t => (
                                                    <span key={t} style={{ fontSize: 8, background: 'var(--sys-primary)', color: '#FFF', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: '10px 12px' }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>{ctx.productName}</div>
                                        <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginBottom: 7 }}>{ctx.productCategory}{ctx.productBrand ? ` · ${ctx.productBrand}` : ''}</div>
                                        <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                                            {(ctx.palette || []).slice(0,7).map((c, i) => (
                                                <div key={i} title={c.hex} style={{ width: 13, height: 13, borderRadius: 3, background: c.hex, border: '1px solid var(--sys-border)' }} />
                                            ))}
                                        </div>
                                        <button onClick={() => handleActivate(ctx)} className="btn-primary" style={{ width: '100%', padding: '7px 0', borderRadius: 7, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit', opacity: activating === ctx._id ? 0.7 : 1 }}>
                                            {activating === ctx._id ? (
                                                <><div style={{ width: 11, height: 11, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Loading...</>
                                            ) : (
                                                <><span className="material-symbols-outlined" style={{ fontSize: 13 }}>bolt</span>Activate</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}

// ── Product Context Bar ───────────────────────────────────────────────────────
// Sits above ALL tool tabs. When active, all tools use its palette + mood.
function ProductContextBar({ brandId, activeContext, onContextChange }) {
    const [showLibrary, setShowLibrary] = useState(false)
    const [saving, setSaving]           = useState(false)
    const [saved, setSaved]             = useState(false)

    const handleSave = async () => {
        if (!activeContext?.productDNA || !brandId) return
        setSaving(true)
        try {
            const res = await apiFetch('/brand-studio/product-context', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId,
                    productName:     activeContext.productData?.title || activeContext.productDNA?.productCategory || 'Product',
                    productCategory: activeContext.productDNA?.productCategory || '',
                    productBrand:    activeContext.productData?.brand || '',
                    productUrl:      activeContext.productUrl || '',
                    productImages:   activeContext.productImages || [],
                    palette:         activeContext.productDNA?.dominantColors || [],
                    productDNA:      activeContext.productDNA,
                    selectedMoodId:  activeContext.selectedMood,
                    moodDirections:  activeContext.productMoodDirections || {},
                    moodImages:      activeContext.moodImages || {},
                    designContext:   activeContext.designContext || null,
                })
            })
            if (res.success) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
        } catch (e) { console.error(e) }
        setSaving(false)
    }

    const palette     = activeContext?.productDNA?.dominantColors || []
    const moodName    = activeContext?.productMoodDirections?.[activeContext?.selectedMood]?.label || activeContext?.selectedMood || ''
    const productName = activeContext?.productData?.title || activeContext?.productDNA?.productCategory || ''

    return (
        <>
            <div style={{
                background: activeContext
                    ? 'linear-gradient(135deg, rgba(124,58,237,0.1) 0%, rgba(245,158,11,0.05) 100%)'
                    : 'color-mix(in srgb, var(--sys-text) 3%, var(--sys-surface))',
                border: `1px solid ${activeContext ? 'rgba(124,58,237,0.22)' : 'var(--sys-border)'}`,
                borderRadius: 14, padding: '13px 18px', marginBottom: 18,
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: activeContext ? 'rgba(124,58,237,0.18)' : 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))', border: `1px solid ${activeContext ? 'rgba(124,58,237,0.3)' : 'var(--sys-border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: activeContext ? '#A78BFA' : 'var(--sys-text-muted)' }}>palette</span>
                </div>

                {activeContext ? (
                    <>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#22C55E' }}>check_circle</span>
                                {productName || 'Active Product'}
                                {moodName && <span style={{ fontSize: 10, color: 'var(--sys-text-muted)', fontWeight: 400 }}>· {moodName}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                                {palette.slice(0,8).map((c, i) => (
                                    <div key={i} title={`${c.name} ${c.hex}`} style={{ width: 13, height: 13, borderRadius: 3, background: c.hex, border: '1px solid var(--sys-border)' }} />
                                ))}
                                <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', marginLeft: 4 }}>Color Guard · All tools use this palette</span>
                            </div>
                        </div>
                        <button onClick={handleSave} disabled={saving} style={{ background: saved ? 'rgba(34,197,94,0.12)' : 'rgba(34,197,94,0.06)', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.15)'}`, color: saved ? '#22C55E' : '#4ade80', padding: '6px 13px', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.2s' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{saved ? 'check' : saving ? 'hourglass_empty' : 'cloud_done'}</span>
                            {saved ? 'Updated!' : saving ? 'Saving...' : 'Auto-Saved'}
                        </button>
                        <button onClick={() => setShowLibrary(true)} style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', color: '#A78BFA', padding: '6px 13px', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>library_books</span>Library
                        </button>
                        <button onClick={() => onContextChange(null)} title="Clear active context" style={{ background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))', border: '1px solid var(--sys-border)', color: 'var(--sys-text-muted)', padding: '6px 8px', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--sys-text-muted)' }}>
                            <strong style={{ color: 'var(--sys-text)' }}>No active product context.</strong> Analyze a product in A+ Listing to lock its palette + mood — or load a saved context from your library.
                        </div>
                        <button onClick={() => setShowLibrary(true)} style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#A78BFA', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>library_books</span>Load Saved Context
                        </button>
                    </>
                )}
            </div>

            {showLibrary && (
                <ContextLibraryModal
                    brandId={brandId}
                    onActivate={ctx => onContextChange({
                        productData:           { title: ctx.productName, brand: ctx.productBrand },
                        productDNA:            ctx.productDNA,
                        productImages:         ctx.productImages || [],
                        productUrl:            ctx.productUrl,
                        palette:               ctx.palette,
                        selectedMood:          ctx.selectedMoodId,
                        productMoodDirections: ctx.moodDirections,
                        moodImages:            ctx.moodImages,
                        designContext:         ctx.designContext,
                        savedContextId:        ctx._id,
                    })}
                    onClose={() => setShowLibrary(false)}
                />
            )}
        </>
    )
}

// ── Action Cards Config ───────────────────────────────────────────────────────

const ACTIONS = [
    {
        id: 'aplus', icon: 'stars', label: 'A+ Listing',
        desc: 'Amazon Enhanced Content — up to 7 modules with AI images',
        credits: '10', accent: '#7c3aed', tier: 'Amazon',
        badge: null,
    },
    {
        id: 'aptwo', icon: 'diamond', label: 'A++ Premium',
        desc: 'Full-bleed carousels, hotspots, Q&A panels',
        credits: '20', accent: '#F59E0B', tier: 'Amazon',
        badge: 'PREMIUM',
    },
    {
        id: 'quick_post', icon: 'campaign', label: 'Quick Posts',
        desc: 'Promo, order & feature posts in any size, in one click',
        credits: '8–12', accent: '#EC4899', tier: 'Social',
        badge: 'MULTI-SIZE',
    },
    {
        id: 'page', icon: 'web', label: 'Landing Page',
        desc: 'AI-built interactive landing page, hosted on CDN',
        credits: '12', accent: '#10B981', tier: 'Web',
        badge: null,
    },
    {
        id: 'deck', icon: 'slideshow', label: 'Pitch Deck',
        desc: 'Brand presentation — investor or sales deck',
        credits: '15', accent: '#6366F1', tier: 'Sales',
        badge: null,
    },
    {
        id: 'mail', icon: 'mail', label: 'Email Campaign',
        desc: 'Responsive HTML email with AI copy + visuals',
        credits: '10', accent: '#0EA5E9', tier: 'Email',
        badge: null,
    },
]

// ── ProductDiscoverySection ────────────────────────────────────────────────────
// Self-contained analysis entry point. Fires onContextReady when mood is picked.

function ProductDiscoverySection({ brandId, onContextReady }) {
    const [productUrl, setProductUrl] = useState('')
    const [step, setStep]             = useState('input')   // 'input' | 'analyzing' | 'ready'
    const [error, setError]           = useState('')
    const [analyzedProduct, setAnalyzedProduct] = useState(null)
    const [productImages, setProductImages]     = useState([])
    const [productDNA, setProductDNA]           = useState(null)
    const [selectedMood, setSelectedMood]       = useState(null)
    const [moodImages, setMoodImages]           = useState({})
    const [productMoodDirections, setProductMoodDirections] = useState(null)
    const [designContext, setDesignContext]     = useState(null)
    const [uploadedImages, setUploadedImages]   = useState([])
    const fileRef = useRef()

    const MOOD_STATIC = {
        editorial: { id:'editorial', label:'Editorial Clean',    icon:'straighten',            desc:'Clean, precise, studio-perfect',  bg:'linear-gradient(135deg,#f0f0f0,#e8e8e8)' },
        bold:      { id:'bold',      label:'Bold Ambient',       icon:'local_fire_department',  desc:'Dark, dramatic, cinematic',       bg:'linear-gradient(135deg,#0d0d1a,#1a0d2e)' },
        lifestyle: { id:'lifestyle', label:'Lifestyle Vibrant',  icon:'wb_sunny',               desc:'Real-world, warm, relatable',     bg:'linear-gradient(135deg,#fef3c7,#fde68a)' },
        luxury:    { id:'luxury',    label:'Premium Minimal',    icon:'diamond',                desc:'Luxury, spacious, refined',       bg:'linear-gradient(135deg,#f5f5f0,#e8e4dc)' },
    }

    const activeMoods = productMoodDirections
        ? Object.fromEntries(Object.values(productMoodDirections).map((m, i) => {
            const bgs = ['linear-gradient(135deg,#0d0d1a,#1a0d2e)','linear-gradient(135deg,#1a0a0a,#2e0d0d)','linear-gradient(135deg,#fef3c7,#fde68a)','linear-gradient(135deg,#f5f5f0,#e8e4dc)']
            const p = m.colorPalette || []
            return [m.id, { ...m, icon: m.icon || 'style', desc: m.description || '', bg: p.length >= 2 ? `linear-gradient(135deg,${p[0]},${p[1]})` : bgs[i % bgs.length] }]
          }))
        : MOOD_STATIC

    const resetState = () => {
        setProductDNA(null); setMoodImages({}); setProductMoodDirections(null)
        setSelectedMood(null); setDesignContext(null); setAnalyzedProduct(null); setProductImages([])
    }

    const runPDI = async (images, product) => {
        try {
            const data = await apiFetch('/brand-studio/product-intelligence', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productImages: images.slice(0, 8), productData: product, brandId })
            })
            if (data.success && data.productDNA) {
                setProductDNA(data.productDNA)
                const def = data.productDNA.defaultMoodDirection || 'editorial'
                setSelectedMood(def)
                // Build design context in background
                apiFetch('/brand-studio/design-context', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productDNA: data.productDNA, selectedMoodId: def })
                }).then(dc => { if (dc.success) setDesignContext(dc.designContext) }).catch(() => {})
                // Generate mood board in background
                apiFetch('/brand-studio/mood-board', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productDNA: data.productDNA, productData: product, brandId })
                }).then(mb => {
                    if (mb.success) {
                        if (mb.moodDirections && Object.keys(mb.moodDirections).length >= 2) {
                            setProductMoodDirections(mb.moodDirections)
                            const first = Object.keys(mb.moodDirections)[0]
                            setSelectedMood(first)
                        }
                        if (mb.moods) {
                            const imgs = {}; mb.moods.forEach(m => { if (m.imageUrl) imgs[m.id] = m.imageUrl })
                            setMoodImages(imgs)
                        }
                    }
                }).catch(() => {})
            }
        } catch (e) { console.warn('PDI failed:', e.message) }
        setStep('ready')

        // ── Fallback auto-save: persist basic product data even if user doesn’t select a mood ──
        if (brandId && product?.title && !/oops|something went wrong|access denied|captcha/i.test(product.title)) {
            apiFetch('/brand-studio/product-context', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId,
                    productName: product?.title || 'Product',
                    productCategory: '',
                    productBrand: product?.brand || '',
                    productUrl: productUrl || '',
                    productImages: (product?.persistedImages || images || []).slice(0, 4),
                    palette: [],
                    productDNA: {},
                    selectedMoodId: '',
                    moodDirections: {},
                    moodImages: {},
                    designContext: null,
                    autoSaved: true,
                })
            }).catch(() => {})
        }
    }

    const handleAnalyze = async () => {
        if (!productUrl) return
        resetState(); setStep('analyzing'); setError('')
        try {
            const data = await apiFetch('/brand-studio/aplus/analyze-product', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: productUrl })
            })
            if (data.success) {
                setAnalyzedProduct(data.product)
                const imgs = data.product.images || []
                setProductImages(imgs)
                await runPDI(imgs, data.product)
            } else { setError(data.error || 'Failed to analyze'); setStep('input') }
        } catch (e) { setError(e.message); setStep('input') }
    }

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files)
        if (!files.length) return
        resetState(); setStep('analyzing'); setError('')
        const urls = await Promise.all(files.map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f) })))
        setUploadedImages(urls); setProductImages(urls)
        await runPDI(urls, {})
    }

    const handleSelectMood = async (moodId) => {
        setSelectedMood(moodId)
        // Rebuild design context for chosen mood
        let dc = designContext
        try {
            const res = await apiFetch('/brand-studio/design-context', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productDNA, selectedMoodId: moodId, customMoodDirections: productMoodDirections || null })
            })
            if (res.success) { dc = res.designContext; setDesignContext(dc) }
        } catch (e) {}
        // Propagate full context upward to the hub
        onContextReady({
            productData: analyzedProduct,
            productDNA,
            productImages,
            productUrl,
            selectedMood: moodId,
            productMoodDirections,
            moodImages,
            designContext: dc,
        })
        // ── Auto-save to Library in background (non-blocking) ──
        if (brandId && productDNA) {
            const pName = analyzedProduct?.title || productDNA?.productCategory || 'Product'
            if (!/oops|something went wrong|access denied|captcha/i.test(pName)) {
            apiFetch('/brand-studio/product-context', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brandId,
                    productName: pName,
                    productCategory: productDNA?.productCategory || '',
                    productBrand: analyzedProduct?.brand || '',
                    productUrl: productUrl || '',
                    productImages: (analyzedProduct?.persistedImages || productImages || []).slice(0, 4),
                    palette: productDNA?.dominantColors || [],
                    productDNA: productDNA || {},
                    selectedMoodId: moodId,
                    moodDirections: productMoodDirections || {},
                    moodImages: moodImages || {},
                    designContext: dc,
                    autoSaved: true,
                })
            }).then(r => {
                if (r.success) console.log(`✅ Product auto-saved to Library${r.updated ? ' (updated)' : ''}`)
            }).catch(() => {})
            }
        }
    }

    const moodSwatchMap = {
        editorial: ['#FFFFFF','#F5F0EA','#E8E4DF','#D0C8BF'],
        bold:      ['#0D0D0D','#1A0D2E','#7B2FFF','#2A1A5A'],
        lifestyle: ['#C97B5A','#8FA888','#E8D5B7','#6B8C6B'],
        luxury:    ['#F8F4EF','#C9A96E','#2A2A2A','#8B7355'],
    }

    const SP = { fontFamily: 'inherit' }

    return (
        <div>
            {/* ─── Header ─────────────────────────────── */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <div className="glass-panel" style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sys-primary)' }}>search</span>
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text)', fontFamily: 'var(--font-display)' }}>Step 1 — Analyze Your Product</div>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>AI extracts color palette, design DNA & mood directions. Everything flows from this.</div>
                    </div>
                </div>
            </div>

            {/* ─── Input Row ──────────────────────────── */}
            {step !== 'ready' && (
                <div className="glass-panel" style={{ borderRadius: 12, padding: 16, marginBottom: step === 'analyzing' ? 12 : 0 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--sys-text-muted)', pointerEvents: 'none' }}>link</span>
                            <input
                                value={productUrl}
                                onChange={e => setProductUrl(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                                placeholder="Paste Amazon, Flipkart, or any product URL..."
                                disabled={step === 'analyzing'}
                                className="input-glass"
                                style={{ paddingLeft: 38, opacity: step === 'analyzing' ? 0.6 : 1, borderRadius: 8 }}
                            />
                        </div>
                        <button
                            onClick={handleAnalyze}
                            disabled={!productUrl || step === 'analyzing'}
                            className="btn-primary"
                            style={{ borderRadius: 8, gap: 6, flexShrink: 0, cursor: (!productUrl || step === 'analyzing') ? 'not-allowed' : 'pointer', opacity: (!productUrl || step === 'analyzing') ? 0.6 : 1 }}
                        >
                            {step === 'analyzing' ? (
                                <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #FFF', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />Analyzing...</>
                            ) : (
                                <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>Analyze + Design</>
                            )}
                        </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <div style={{ height: 1, flex: 1, background: 'var(--sys-border)' }} />
                        <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', flexShrink: 0 }}>or upload product images</span>
                        <div style={{ height: 1, flex: 1, background: 'var(--sys-border)' }} />
                    </div>
                    <label className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', border: '1px dashed var(--sys-border)', borderRadius: 8, fontSize: 13, fontWeight: 600, width: '100%' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>
                        Upload Product Images (JPG, PNG — up to 8)
                        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                    </label>
                    {error && <div style={{ marginTop: 10, color: 'var(--sys-primary)', fontSize: 12, padding: '8px 12px', background: 'var(--sys-primary-dim)', borderRadius: 8, border: '1px solid var(--sys-border)' }}>{error}</div>}
                </div>
            )}

            {/* ─── Analyzing Progress ─────────────────── */}
            {step === 'analyzing' && (
                <div className="glass-panel" style={{ borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
                    {[
                        { icon: 'search', text: 'Scraping product data & images...' },
                        { icon: 'palette', text: 'AI vision extracting color palette...' },
                        { icon: 'psychology', text: 'Building product design DNA...' },
                        { icon: 'style', text: 'Generating 4 custom mood directions...' },
                    ].map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < 3 ? '1px solid var(--sys-border)' : 'none' }}>
                            <div style={{ width: 13, height: 13, border: '2px solid var(--sys-border)', borderTop: `2px solid var(--sys-primary)`, borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--sys-primary)' }}>{s.icon}</span>
                            <span style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>{s.text}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Analysis Result + Mood Selection ───── */}
            {step === 'ready' && productDNA && (
                <div>
                    {/* Product identity card */}
                    <div className="glass-panel" style={{ borderRadius: 12, padding: 14, marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                            {(productImages[0] || uploadedImages[0]) && (
                                <img src={productImages[0] || uploadedImages[0]} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--sys-border)', flexShrink: 0 }} onError={e => e.target.style.display='none'} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>
                                    {analyzedProduct?.title || productDNA.productCategory || 'Product Analyzed'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginBottom: 6 }}>
                                    {productDNA.productCategory}{analyzedProduct?.brand ? ` · ${analyzedProduct.brand}` : ''} · {productImages.length} images
                                </div>
                                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    {(productDNA.dominantColors || []).slice(0, 8).map((c, i) => (
                                        <div key={i} title={`${c.name} ${c.hex}`} style={{ width: 14, height: 14, borderRadius: 3, background: c.hex, border: '1px solid var(--sys-border)' }} />
                                    ))}
                                    <span style={{ fontSize: 10, color: 'var(--sys-primary)', marginLeft: 5, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>lock</span>Colors Locked
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => { setStep('input'); resetState() }} className="btn-ghost" style={{ padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--sys-border)', fontFamily: 'inherit' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>refresh</span>Reset
                            </button>
                        </div>

                        {/* Mood board selector */}
                        <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>style</span>
                            Pick a Mood Direction
                            {Object.keys(moodImages).length > 0
                                ? <span style={{ color: 'var(--sys-primary)', textTransform: 'none', letterSpacing: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}><span className="material-symbols-outlined" style={{ fontSize: 11 }}>auto_awesome</span>AI ready</span>
                                : <span style={{ color: 'var(--sys-text-muted)', textTransform: 'none', letterSpacing: 0, display: 'flex', alignItems: 'center', gap: 3 }}><span className="material-symbols-outlined" style={{ fontSize: 11 }}>hourglass_empty</span>Generating...</span>
                            }
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                            {Object.values(activeMoods).map(mood => {
                                const aiImg = moodImages[mood.id]
                                const isSelected = selectedMood === mood.id
                                const swatches = moodSwatchMap[mood.id] || []
                                return (
                                    <div key={mood.id} onClick={() => handleSelectMood(mood.id)} style={{
                                        borderRadius: 10,
                                        border: isSelected ? `2px solid var(--sys-primary)` : '1px solid var(--sys-border)',
                                        overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s',
                                        background: 'var(--sys-surface)', position: 'relative',
                                    }}>
                                        <div style={{ height: 110, position: 'relative', overflow: 'hidden' }}>
                                            {aiImg ? (
                                                <img src={aiImg} alt={mood.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                            ) : (
                                                <div style={{ height: '100%', background: mood.bg, position: 'relative' }}>
                                                    <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 1 }}>
                                                        {swatches.map((sw, si) => <div key={si} style={{ background: si === 3 ? sw + 'CC' : sw }} />)}
                                                    </div>
                                                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(255,255,255,0.25)' }}>{mood.icon}</span>
                                                    </div>
                                                </div>
                                            )}
                                            {isSelected && (
                                                <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: 'var(--sys-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#FFF' }}>check</span>
                                                </div>
                                            )}
                                            <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: 5, padding: '2px 6px', fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mood</div>
                                        </div>
                                        <div style={{ padding: '7px 10px', background: isSelected ? 'var(--sys-primary-dim)' : 'transparent', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: isSelected ? 'var(--sys-primary)' : 'var(--sys-text-muted)', flexShrink: 0 }}>{mood.icon}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? 'var(--sys-primary)' : 'var(--sys-text)', marginBottom: 1 }}>{mood.label}{productMoodDirections && <span style={{ marginLeft: 5, fontSize: 8, color: 'var(--sys-primary)', background: 'var(--sys-primary-dim)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>AI</span>}</div>
                                                <div style={{ fontSize: 9.5, color: 'var(--sys-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mood.desc || mood.description || ''}</div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--sys-primary-dim)', border: '1px solid var(--sys-border)', borderRadius: 7, padding: '7px 10px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--sys-primary)' }}>lock</span>
                            Product colors are locked — AI will never shift the product's color in any generated asset.
                        </div>
                    </div>

                    {selectedMood && (
                        <div style={{ fontSize: 12, color: 'var(--sys-text-muted)', textAlign: 'center', padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--sys-primary)' }}>arrow_downward</span>
                            Mood locked — choose an asset type on the right
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ── ActionCard ────────────────────────────────────────────────────────────────

function ActionCard({ action, active, palette, onClick }) {
    const [hover, setHover] = useState(false)
    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                borderRadius: 10,
                border: active ? `1.5px solid var(--sys-primary)` : hover ? '1px solid var(--sys-border)' : '1px solid var(--sys-border)',
                background: active ? 'var(--sys-primary-dim)' : hover ? 'var(--sys-surface)' : 'var(--sys-surface)',
                padding: '13px 14px', cursor: 'pointer', transition: 'all 0.18s',
                position: 'relative', display: 'flex', flexDirection: 'column', gap: 6,
            }}
        >
            {action.badge && (
                <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 8, fontWeight: 700, color: 'var(--sys-primary)', background: 'var(--sys-primary-dim)', border: '1px solid var(--sys-border)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em' }}>
                    {action.badge}
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: active ? 'var(--sys-primary-dim)' : 'var(--sys-bg)', border: '1px solid var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 17, color: active ? 'var(--sys-primary)' : 'var(--sys-text-muted)' }}>{action.icon}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? 'var(--sys-primary)' : 'var(--sys-text)', letterSpacing: '-0.01em', fontFamily: 'var(--font-display)' }}>{action.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--sys-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{action.tier} · {action.credits} cr</div>
                </div>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: active ? 'var(--sys-primary)' : 'var(--sys-text-muted)', transition: 'all 0.18s', transform: active ? 'rotate(-90deg)' : 'rotate(0)' }}>expand_more</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.5 }}>{action.desc}</div>
            {palette && palette.length > 0 && (
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    {palette.slice(0, 6).map((c, i) => (
                        <div key={i} title={c.name || c.hex} style={{ width: 10, height: 10, borderRadius: 3, background: c.hex || c, border: '1px solid var(--sys-border)' }} />
                    ))}
                    <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', marginLeft: 2 }}>palette applied</span>
                </div>
            )}
        </div>
    )
}

// ── Main Page Framework ───────────────────────────────────────────────────────

export default function PulseStudio() {
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id

    // Phase: 'discover' → 'create' | History modal
    const [phase, setPhase]                         = useState('discover')
    const [activeProductContext, setActiveProductContext] = useState(null)
    const [activeAction, setActiveAction]           = useState(null)   // which card is expanded
    const [showHistory, setShowHistory]             = useState(false)
    const [showLibrary, setShowLibrary]             = useState(false)

    // Shared state passed into tools
    const [urlContext, setUrlContext]               = useState('')
    const [referenceImage, setReferenceImage]       = useState(null)

    // QP state lives here so it persists when switching cards
    const [qpType, setQpType]     = useState('promo')
    const [qpRatios, setQpRatios] = useState(new Set(['1:1']))
    const [qpLogoOn, setQpLogoOn] = useState(false)
    const [qpLogoPos, setQpLogoPos] = useState('top-left')
    const [qpLoading, setQpLoading] = useState(false)
    const [qpResult, setQpResult]   = useState(null)
    const [qpError, setQpError]     = useState('')
    const [qpCompositeUrls, setQpCompositeUrls] = useState({})
    const canvasRef = useRef()

    const toggleQpRatio = (id) => {
        setQpRatios(prev => {
            const next = new Set(prev)
            if (next.has(id)) { if (next.size > 1) next.delete(id) } else next.add(id)
            return next
        })
    }

    // Context ready callback from ProductDiscoverySection
    const handleContextReady = useCallback((ctx) => {
        setActiveProductContext(ctx)
        if (!activeAction) setActiveAction(null)   // don't force a card open
        setPhase('create')
    }, [activeAction])

    // Load saved context from library
    const handleLibraryActivate = (ctx) => {
        const mapped = {
            productData:           { title: ctx.productName, brand: ctx.productBrand },
            productDNA:            ctx.productDNA,
            productImages:         ctx.productImages || [],
            productUrl:            ctx.productUrl,
            palette:               ctx.palette,
            selectedMood:          ctx.selectedMoodId,
            productMoodDirections: ctx.moodDirections,
            moodImages:            ctx.moodImages,
            designContext:         ctx.designContext,
            savedContextId:        ctx._id,
        }
        setActiveProductContext(mapped)
        setPhase('create')
        setShowLibrary(false)
    }

    const sharedContext = activeProductContext ? {
        productDNA:    activeProductContext.productDNA,
        designContext: activeProductContext.designContext,
        productImages: activeProductContext.productImages || [],
        palette:       activeProductContext.productDNA?.dominantColors || activeProductContext.palette || [],
        moodLabel:     activeProductContext.productMoodDirections?.[activeProductContext.selectedMood]?.label || activeProductContext.selectedMood || '',
        productName:   activeProductContext.productData?.title || '',
    } : null

    const palette = activeProductContext?.productDNA?.dominantColors || activeProductContext?.palette || []
    const productName = activeProductContext?.productData?.title || activeProductContext?.productDNA?.productCategory || ''
    const moodName = activeProductContext?.productMoodDirections?.[activeProductContext?.selectedMood]?.label || activeProductContext?.selectedMood || ''

    return (
        <DashboardLayout title="Pulse Studio">
            <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
            `}</style>
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>

                {/* ── Top Bar ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="glass-panel" style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--sys-primary)' }}>auto_awesome</span>
                        </div>
                        <div>
                            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--sys-text)', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>Pulse Studio</div>
                            <div style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>Product Intelligence → Marketing Assets</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowLibrary(true)} className="btn-secondary" style={{ gap: 6, fontSize: 12, padding: '7px 14px', borderRadius: 8, fontFamily: 'inherit', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>library_books</span>Library
                        </button>
                        <button onClick={() => setShowHistory(true)} className="btn-ghost" style={{ gap: 6, fontSize: 12, padding: '7px 14px', borderRadius: 8, fontFamily: 'inherit', display: 'flex', alignItems: 'center', cursor: 'pointer', border: '1px solid var(--sys-border)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>history</span>History
                        </button>
                    </div>
                </div>

                {/* ── Two-column layout: discovery left, actions right ── */}
                <div style={{ display: 'grid', gridTemplateColumns: phase === 'discover' ? '1fr' : '420px 1fr', gap: 24, alignItems: 'start', transition: 'all 0.3s' }}>

                    {/* ── LEFT: Product Discovery ── */}
                    <div>
                        <ProductDiscoverySection
                            brandId={brandId}
                            onContextReady={handleContextReady}
                        />

                        {/* ProductContextBar for saving / clearing */}
                        {activeProductContext && (
                            <ProductContextBar
                                brandId={brandId}
                                activeContext={activeProductContext}
                                onContextChange={ctx => {
                                    setActiveProductContext(ctx)
                                    if (!ctx) { setPhase('discover'); setActiveAction(null) }
                                }}
                            />
                        )}
                    </div>

                    {/* ── RIGHT: Creative Hub — Action Cards + Inline Tool ── */}
                    {phase === 'create' && activeProductContext && (
                        <div style={{ animation: 'slideDown 0.35s ease-out' }}>
                            {/* Step 2 header */}
                            <div className="glass-panel" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sys-primary)' }}>rocket_launch</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', fontFamily: 'var(--font-display)' }}>Step 2 — Create Marketing Assets</div>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                        Palette locked{moodName ? ` · ${moodName}` : ''}
                                        {palette.length > 0 && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                {palette.slice(0, 6).map((c, i) => (
                                                    <span key={i} title={c.name} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.hex || c, border: '1px solid var(--sys-border)' }} />
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {productName && <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 6, padding: '3px 9px', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{productName}</span>}
                            </div>

                            {/* Action card grid — 2×3 */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 12 }}>
                                {ACTIONS.map(action => (
                                    <ActionCard
                                        key={action.id}
                                        action={action}
                                        active={activeAction === action.id}
                                        palette={palette}
                                        onClick={() => setActiveAction(prev => prev === action.id ? null : action.id)}
                                    />
                                ))}
                            </div>

                            {/* ── Inline expanded tool panel ── */}
                            {activeAction && (() => {
                                const act = ACTIONS.find(a => a.id === activeAction)
                                return (
                                    <div className="glass-panel" style={{ animation: 'slideDown 0.28s ease-out', borderRadius: 12, overflow: 'hidden', marginBottom: 12, borderColor: `${act?.accent}30` }}>
                                        {/* Tool header strip */}
                                        <div style={{ padding: '10px 16px', background: `${act?.accent}0C`, borderBottom: '1px solid var(--sys-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: act?.accent }}>{act?.icon}</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', fontFamily: 'var(--font-display)', flex: 1 }}>{act?.label}</span>
                                            <span style={{ fontSize: 10, color: act?.accent, background: `${act?.accent}15`, border: `1px solid ${act?.accent}25`, padding: '2px 8px', borderRadius: 5, fontWeight: 700 }}>{act?.credits} credits</span>
                                            <button onClick={() => setActiveAction(null)} className="btn-ghost" style={{ width: 26, height: 26, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid var(--sys-border)' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                                            </button>
                                        </div>
                                        {/* Tool body */}
                                        <div style={{ padding: 16 }}>
                                            {(activeAction === 'aplus' || activeAction === 'aptwo') && (
                                                <APlusTool
                                                    brandId={brandId}
                                                    onContextReady={() => {}}
                                                    externalContext={activeProductContext}
                                                    forceTier={activeAction === 'aptwo' ? 'premium' : 'standard'}
                                                />
                                            )}
                                            {activeAction === 'quick_post' && (
                                                <QuickPostPanel
                                                    productDNA={activeProductContext?.productDNA}
                                                    productData={activeProductContext?.productData}
                                                    selectedMoodId={activeProductContext?.selectedMood}
                                                    productMoodDirections={activeProductContext?.productMoodDirections}
                                                    brandId={brandId}
                                                    brand={null}
                                                    qpType={qpType} setQpType={setQpType}
                                                    qpRatios={qpRatios} toggleQpRatio={toggleQpRatio}
                                                    qpLogoOn={qpLogoOn} setQpLogoOn={setQpLogoOn}
                                                    qpLogoPos={qpLogoPos} setQpLogoPos={setQpLogoPos}
                                                    qpLoading={qpLoading} setQpLoading={setQpLoading}
                                                    qpResult={qpResult} setQpResult={setQpResult}
                                                    qpError={qpError} setQpError={setQpError}
                                                    qpCompositeUrls={qpCompositeUrls} setQpCompositeUrls={setQpCompositeUrls}
                                                    canvasRef={canvasRef}
                                                />
                                            )}
                                            {activeAction === 'deck' && (
                                                <DeckTool brandId={brandId} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} productContext={sharedContext} />
                                            )}
                                            {activeAction === 'mail' && (
                                                <MailTool brandId={brandId} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} productContext={sharedContext} />
                                            )}
                                            {activeAction === 'page' && (
                                                <PageTool brandId={brandId} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} productContext={sharedContext} />
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}

                            {!activeAction && (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--sys-text-muted)', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>touch_app</span>
                                    Select a card above to start creating
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Library Modal ── */}
                {showLibrary && (
                    <ContextLibraryModal
                        brandId={brandId}
                        onActivate={handleLibraryActivate}
                        onClose={() => setShowLibrary(false)}
                    />
                )}

                {/* ── History Modal (slide-in panel) ── */}
                {showHistory && createPortal(
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 9998, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
                        <div style={{ width: '100%', maxWidth: 760, background: 'var(--sys-bg)', borderLeft: '1px solid var(--sys-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', animation: 'slideDown 0.3s ease-out' }}>
                            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sys-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--sys-text-muted)' }}>history</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--sys-text)', flex: 1, fontFamily: 'var(--font-display)' }}>Generation History</span>
                                <button onClick={() => setShowHistory(false)} className="btn-ghost" style={{ width: 30, height: 30, borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, border: '1px solid var(--sys-border)', fontFamily: 'inherit' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                                </button>
                            </div>
                            <div style={{ flex: 1 }}>
                                <HistoryTab brandId={brandId} />
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </DashboardLayout>
    )
}

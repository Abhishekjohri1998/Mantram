import React, { useState, useRef, useCallback, useEffect } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useBrand } from '../../context/BrandContext'
import { apiFetch } from '../../services/api'

// ── Shared ──────────────────────────────────────────────────────────

const DECK_STAGES = [
    "🔍 Researching your campaign context...",
    "🧠 Claude Opus 4.7 planning slide strategy...",
    "🖼️ Generating slide visuals with Nano Banana 2...",
    "📊 Assembling your presentation...",
    "✨ Applying premium design system..."
]

const PAGE_STAGES = [
    "🔍 Gathering live market intelligence...",
    "🧠 Claude designing page strategy...",
    "🖼️ Generating brand images...",
    "⚡ Building interactive page with GSAP...",
    "🚀 Uploading to CDN..."
]

const MAIL_STAGES = [
    "🔍 Analyzing your campaign brief...",
    "🧠 Claude writing your email copy...",
    "🖼️ Generating email visuals...",
    "💌 Compiling responsive HTML...",
    "✅ Email ready!"
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

function InputForm({ brief, setBrief, urlContext, setUrlContext, referenceImage, setReferenceImage, onGenerate, loading, buttonColor, toolName, credits }) {
    const [urlInput, setUrlInput] = useState('')
    const [fetchingUrl, setFetchingUrl] = useState(false)

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

    return (
        <div style={{ background: '#0A0A0A', borderRadius: 16, padding: 40, border: '1px solid rgba(255,255,255,0.08)', position: 'relative' }}>
            <div style={{ marginBottom: 24, padding: 20, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: buttonColor }}>link</span>
                    Product Data Source
                </label>
                <div style={{ display: 'flex', gap: 12, marginBottom: urlContext ? 12 : 0 }}>
                    <input 
                        value={urlInput} 
                        onChange={e => setUrlInput(e.target.value)} 
                        placeholder="Paste a product URL to scan..."
                        style={{ flex: 1, background: '#000', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: 8, color: '#FFF', fontSize: 13, outline: 'none' }}
                        onFocus={e => e.target.style.borderColor = buttonColor}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                    <button 
                        onClick={handleFetchUrl} 
                        disabled={fetchingUrl || !urlInput}
                        style={{ background: '#222', color: '#FFF', border: '1px solid rgba(255,255,255,0.1)', padding: '0 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: fetchingUrl ? 0.7 : 1, transition: 'all 0.2s' }}
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
                        style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 16px', color: '#FFFFFF', fontSize: 13, resize: 'vertical', outline: 'none' }}
                        onFocus={e => e.target.style.borderColor = buttonColor}
                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                    />
                )}
                {!urlContext && (
                    <textarea 
                    value={urlContext}
                    onChange={e => setUrlContext(e.target.value)}
                    placeholder="Or type product features, pricing, and details manually..."
                    rows={1}
                    style={{ width: '100%', background: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 16px', color: '#FFFFFF', fontSize: 13, resize: 'vertical', outline: 'none', marginTop: 12 }}
                    onFocus={e => e.target.style.borderColor = buttonColor}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                )}
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                    <label style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', padding: '8px 16px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#FFF', transition: 'all 0.2s', fontWeight: 600 }} onMouseEnter={e => e.currentTarget.style.borderColor = buttonColor} onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>
                        Upload Product Reference Image
                        <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                    </label>
                    {referenceImage && (
                        <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img src={referenceImage} alt="Ref" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button onClick={(e) => { e.preventDefault(); setReferenceImage(null); }} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#FFF', width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}>×</button>
                        </div>
                    )}
                </div>
            </div>

            <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                placeholder="Describe your campaign brief..."
                rows={4}
                style={{
                    width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12, padding: '16px 20px', color: '#FFFFFF', fontSize: 15, lineHeight: 1.7,
                    outline: 'none', transition: 'all 0.2s', resize: 'vertical'
                }}
                onFocus={e => { e.target.style.borderColor = buttonColor; document.getElementById('brief-wrap').style.boxShadow = `0 0 0 3px ${buttonColor}20` }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; document.getElementById('brief-wrap').style.boxShadow = 'none' }}
                id="brief-wrap"
            />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: 8 }}>
                {brief.length} characters
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
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
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
            borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, minHeight: 400
        }}>
            <style>{`@keyframes pulse-icon { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }`}</style>
            <span className="material-symbols-outlined" style={{ fontSize: 64, color: '#FFFFFF', animation: 'pulse-icon 2s ease-in-out infinite' }}>
                {icon}
            </span>
            <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: 24, minHeight: 24, transition: 'opacity 0.4s ease' }}>
                {stageText}
            </div>
            <div style={{ width: 280, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 20, overflow: 'hidden' }}>
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
                style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: color, border: 'none', color: '#FFF', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7, transition: 'opacity 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
            >✦</button>
        </div>
    )

    return (
        <div style={{ background: '#0A0A0A', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', transition: 'all 0.3s' }}>
            {/* Slide Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: `${color}08` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: color, fontWeight: 800 }}>{idx + 1}</div>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{slide.type}</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Click text to edit • ✦ to AI rephrase</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: image ? '1fr 1fr' : '1fr', gap: 0 }}>
                {/* Content Side */}
                <div style={{ padding: 24 }}>
                    {slide.headline && <EditableText field="headline" value={slide.headline} tag="h3" style={{ fontSize: 22, fontWeight: 800, color: '#FFF', margin: '0 0 12px', lineHeight: 1.3 }} />}
                    {slide.body && <EditableText field="body" value={slide.body} style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: '0 0 12px' }} />}
                    {slide.stat && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: '12px 0' }}>
                            <EditableText field="stat.number" value={slide.stat.number} tag="span" style={{ fontSize: 40, fontWeight: 900, color: color }} />
                            <EditableText field="stat.label" value={slide.stat.label} tag="span" style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }} />
                        </div>
                    )}
                    {slide.quote && <EditableText field="quote" value={`"${slide.quote}"`} style={{ fontSize: 16, fontStyle: 'italic', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5, margin: '0 0 8px' }} />}
                    {slide.author && <EditableText field="author" value={slide.author} style={{ fontSize: 13, fontWeight: 700, color: '#FFF' }} />}
                    {slide.role && <EditableText field="role" value={slide.role} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }} />}
                    {slide.cta && <EditableText field="cta" value={slide.cta} style={{ display: 'inline-block', background: `${color}30`, color: color, padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, marginTop: 8 }} />}
                    {slide.ctaText && <EditableText field="ctaText" value={slide.ctaText} style={{ display: 'inline-block', background: `${color}30`, color: color, padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, marginTop: 8 }} />}
                    {slide.items && (
                        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                            {slide.items.map((item, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <EditableText field={`items.${i}.title`} value={item.title} style={{ fontSize: 13, fontWeight: 700, color: '#FFF', margin: 0 }} />
                                    <EditableText field={`items.${i}.description`} value={item.description} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }} />
                                </div>
                            ))}
                        </div>
                    )}
                    {slide.features && (
                        <div style={{ marginTop: 12 }}>
                            {slide.features.map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <EditableText field={`features.${i}.name`} value={f.name} style={{ fontSize: 13, color: '#FFF', flex: 1 }} />
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
                            style={{ position: 'absolute', bottom: 12, right: 12, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.2)', color: '#FFF', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>autorenew</span>
                            {regenning ? 'Generating...' : 'Regenerate Image'}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, background: 'rgba(255,255,255,0.02)', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'rgba(255,255,255,0.15)' }}>image</span>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: '8px 0 12px' }}>No image generated</p>
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

function DeckTool({ brandId, urlContext, setUrlContext, referenceImage, setReferenceImage }) {
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
                body: JSON.stringify({ brandId, brief, deckType: 'Campaign Pitch', slideCount: 8, urlContext, referenceImage })
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

    if (gen.result && editedPlan) {
        return (
            <div>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }}></div>
                        <div style={{ fontSize: 16, color: '#FFF', fontWeight: 700 }}>
                            {editedPlan.title || 'Your Deck'}
                            <span style={{ background: 'rgba(124,58,237,0.2)', color: '#A78BFA', padding: '2px 10px', borderRadius: 10, fontSize: 12, marginLeft: 10, fontWeight: 600 }}>{editedPlan.slides?.length} slides</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => window.open(gen.result.hostedUrl, '_blank')}
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #6D28D9)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>slideshow</span> Present Live
                        </button>
                        <button onClick={() => { navigator.clipboard.writeText(gen.result.hostedUrl); alert('Link copied!') }}
                            style={{ background: 'rgba(255,255,255,0.08)', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 20px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link</span> Copy Link
                        </button>
                    </div>
                </div>

                {/* Info Banner */}
                <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 10, padding: '12px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#A78BFA' }}>info</span>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                        <strong style={{ color: '#FFF' }}>AI-Generated Content</strong> — Stats, testimonials, and quotes are AI-composed based on your brief and brand DNA. Click any text to edit, or press ✦ to AI-rephrase.
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
                    <button onClick={gen.reset} style={{ flex: 1, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        ↻ Start Over
                    </button>
                    <button onClick={() => window.open(gen.result.hostedUrl + '?print-pdf', '_blank')} style={{ flex: 1, padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                        📄 Save as PDF
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
            <InputForm brief={brief} setBrief={setBrief} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} onGenerate={handleGenerate} loading={gen.loading} buttonColor="#7c3aed" toolName="Deck" credits={20} />
            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="slideshow" />
        </div>
    )
}

// ── Pulse Page Tool ──────────────────────────────────────────────────────────
function PageTool({ brandId, urlContext, setUrlContext, referenceImage, setReferenceImage }) {
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
                body: JSON.stringify({ brandId, brief, pageType: 'campaign', urlContext, referenceImage })
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
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                        <div style={{ fontSize: 14, color: '#FFF', fontWeight: 700, marginBottom: 12 }}>🧠 How Claude designed this page</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            {Object.entries(gen.result.plan?.pageStrategy || {}).map(([k, v]) => (
                                <div key={k}>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{k.replace(/([A-Z])/g, ' $1').trim()}</div>
                                    <div style={{ fontSize: 14, color: '#FFF', marginTop: 4 }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div style={{ background: '#1E1E1E', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ height: 32, background: '#222', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444' }}></div>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B' }}></div>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }}></div>
                            <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{gen.result.slug}</div>
                        </div>
                        <iframe srcDoc={gen.result.html} style={{ width: '100%', height: '65vh', border: 'none' }} sandbox="allow-scripts allow-same-origin"></iframe>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span style={{ background: '#222', padding: '4px 10px', borderRadius: 100 }}>✦ GSAP Parallax</span>
                            <span style={{ background: '#222', padding: '4px 10px', borderRadius: 100 }}>🌐 {gen.result.sectionCount} sections</span>
                        </div>
                        <a href={gen.result.hostedUrl} target="_blank" rel="noreferrer" style={{ color: '#10B981', textDecoration: 'none' }}>Open in new tab ↗</a>
                    </div>
                </div>

                {/* Publish Panel */}
                <div style={{ background: '#111', borderRadius: 16, padding: 32 }}>
                    <h3 style={{ margin: '0 0 24px', color: '#FFF' }}>Publish your page</h3>
                    
                    <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
                        <button style={{ flex: 1, background: '#222', border: '1px solid #333', color: '#FFF', padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={() => copyCode(gen.result.html)}>⬇ Download</button>
                        <button style={{ flex: 1, background: '#222', border: '1px solid #333', color: '#FFF', padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={() => copyCode(gen.result.hostedUrl)}>📋 Copy URL</button>
                        <button style={{ flex: 1, background: '#222', border: '1px solid #333', color: '#FFF', padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={() => copyCode(gen.result.embedCode)}>&lt; /&gt; Embed</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 24 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#95BF47', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: '#FFF' }}>S</div>
                                <div style={{ color: '#FFF', fontWeight: 600 }}>Publish to Shopify</div>
                            </div>
                            <input value={shopDomain} onChange={e => setShopDomain(e.target.value)} placeholder="yourstore.com" className="input-glass" style={{ width: '100%', marginBottom: 12, padding: 10, fontSize: 13, background: '#000', border: '1px solid #333', color: '#FFF' }} />
                            <input type="password" value={shopToken} onChange={e => setShopToken(e.target.value)} placeholder="Admin API token" className="input-glass" style={{ width: '100%', marginBottom: 12, padding: 10, fontSize: 13, background: '#000', border: '1px solid #333', color: '#FFF' }} />
                            <button style={{ width: '100%', background: '#95BF47', color: '#FFF', border: 'none', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Publish to Store</button>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 24, cursor: 'pointer' }} onClick={() => copyCode(gen.result.html)}>
                            <div style={{ color: '#FFF', fontWeight: 600 }}>Add to WordPress</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Click to copy HTML. Paste into Custom HTML block.</div>
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
            <InputForm brief={brief} setBrief={setBrief} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} onGenerate={handleGenerate} loading={gen.loading} buttonColor="#10b981" toolName="Page" credits={18} />
            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="web" />
        </div>
    )
}

// ── Pulse Mail Tool ──────────────────────────────────────────────────────────
function MailTool({ brandId, urlContext, setUrlContext, referenceImage, setReferenceImage }) {
    const [brief, setBrief] = useState('')
    const gen = useGenerate(MAIL_STAGES)
    const [viewMode, setViewMode] = useState('mobile')

    const handleGenerate = async () => {
        if (!brief) return;
        gen.start()
        try {
            const data = await apiFetch('/brand-studio/email/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ brandId, brief, emailType: 'Campaign', urlContext, referenceImage })
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
                        <button onClick={() => setViewMode('mobile')} style={{ background: viewMode === 'mobile' ? '#333' : 'transparent', border: '1px solid #333', color: '#FFF', padding: '6px 16px', borderRadius: 20, cursor: 'pointer' }}>📱 Mobile</button>
                        <button onClick={() => setViewMode('desktop')} style={{ background: viewMode === 'desktop' ? '#333' : 'transparent', border: '1px solid #333', color: '#FFF', padding: '6px 16px', borderRadius: 20, cursor: 'pointer' }}>💻 Desktop</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ background: '#111', borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Subject</div>
                        <div style={{ fontSize: 15, color: '#FFF', fontWeight: 600, marginTop: 4, marginBottom: 16 }}>{gen.result.subject}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Preview Text</div>
                        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{gen.result.previewText}</div>
                    </div>

                    <div style={{ background: '#111', borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 14, color: '#FFF', fontWeight: 600, marginBottom: 16 }}>Send it</div>
                        <button style={{ width: '100%', background: '#EA4335', color: '#FFF', border: 'none', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }} onClick={() => window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(gen.result.subject)}&body=${encodeURIComponent(gen.result.plainText)}`)}>
                            📨 Open in Gmail
                        </button>
                        <button style={{ width: '100%', background: '#3b82f6', color: '#FFF', border: 'none', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                            📩 Open in Mail app
                        </button>
                    </div>

                    <div style={{ background: '#111', borderRadius: 12, padding: 20 }}>
                        <div style={{ fontSize: 14, color: '#FFF', fontWeight: 600, marginBottom: 16 }}>Push to ESP</div>
                        <select style={{ width: '100%', background: '#000', border: '1px solid #333', color: '#FFF', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                            <option>Mailchimp</option>
                            <option>Klaviyo</option>
                            <option>Brevo</option>
                        </select>
                        <input type="password" placeholder="API Key" style={{ width: '100%', background: '#000', border: '1px solid #333', color: '#FFF', padding: 10, borderRadius: 8, marginBottom: 12, boxSizing: 'border-box' }} />
                        <button style={{ width: '100%', background: '#222', border: '1px solid #333', color: '#FFF', padding: 12, borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Push Template</button>
                    </div>

                    <button className="btn-secondary" style={{ padding: 12, borderRadius: 8, cursor: 'pointer' }} onClick={gen.reset}>↺ Regenerate</button>
                </div>
            </div>
        )
    }

    return (
        <div style={{ position: 'relative' }}>
            <InputForm brief={brief} setBrief={setBrief} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} onGenerate={handleGenerate} loading={gen.loading} buttonColor="#0ea5e9" toolName="Mail" credits={12} />
            <GenerationOverlay loading={gen.loading} progress={gen.progress} stageText={gen.stageText} icon="mail" />
        </div>
    )
}

// ── Main Page Framework ──────────────────────────────────────────────────────

const TAB_DATA = [
    { id: 'deck', icon: 'slideshow', label: 'Pulse Deck' },
    { id: 'mail', icon: 'mail', label: 'Pulse Mail' },
    { id: 'page', icon: 'web', label: 'Pulse Page' }
]

export default function PulseStudio() {
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id
    const [activeTab, setActiveTab] = useState('deck')
    const [urlContext, setUrlContext] = useState('')
    const [referenceImage, setReferenceImage] = useState(null)

    return (
        <DashboardLayout title="Pulse Studio">
            <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 32, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
                    {TAB_DATA.map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                            background: activeTab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: activeTab === t.id ? '#FFF' : 'rgba(255,255,255,0.5)',
                            border: 'none', padding: '10px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                <div style={{ minHeight: 600 }}>
                    {activeTab === 'deck' && <DeckTool brandId={brandId} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} />}
                    {activeTab === 'mail' && <MailTool brandId={brandId} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} />}
                    {activeTab === 'page' && <PageTool brandId={brandId} urlContext={urlContext} setUrlContext={setUrlContext} referenceImage={referenceImage} setReferenceImage={setReferenceImage} />}
                </div>
            </div>
        </DashboardLayout>
    )
}

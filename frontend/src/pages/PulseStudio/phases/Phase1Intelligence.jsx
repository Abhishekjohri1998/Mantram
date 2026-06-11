import React, { useState, useRef } from 'react'
import {
    Link2, UploadCloud, Search, Palette, Cpu, Sparkles,
    CheckCircle2, Loader2, X, RefreshCw, Lock, ChevronRight, Download
} from 'lucide-react'
import { apiFetch } from '../../../services/api'

// Upload product images via multipart → S3 (no base64 ever sent to generation)
async function uploadProductImages(files) {
    const uploaded = []
    for (const file of files) {
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch('/api/media/image-reference', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` },
                body: formData,
            })
            const data = await res.json()
            if (data.success && data.url) uploaded.push(data.url)
        } catch (e) { console.warn('Upload failed for', file.name, e.message) }
    }
    return uploaded
}

const ANALYSIS_STEPS = [
    { icon: Search,    text: 'Scraping product data & images…' },
    { icon: Palette,   text: 'AI vision extracting color palette…' },
    { icon: Cpu,       text: 'Building product design DNA…' },
    { icon: Sparkles,  text: 'Generating 4 custom mood directions…' },
]

export default function Phase1Intelligence({ brandId, onContextReady, moodImages, setMoodImages, moodLoading, setMoodLoading, setMoodDirections }) {
    const [productUrl, setProductUrl]         = useState('')
    const [description, setDescription]       = useState('')
    const [step, setStep]                     = useState('input')   // input | analyzing | ready
    const [error, setError]                   = useState('')
    const [activeAnalysisStep, setActiveStep] = useState(0)
    const [uploadedFiles, setUploadedFiles]   = useState([])
    const [uploadPreviews, setUploadPreviews] = useState([])
    const [s3ImageUrls, setS3ImageUrls]       = useState([])
    const [sliderIndex, setSliderIndex]       = useState(0)

    // Ready state
    const [analyzedProduct, setAnalyzedProduct]         = useState(null)
    const [productImages, setProductImages]             = useState([])
    const [productDNA, setProductDNA]                   = useState(null)
    const [selectedMood, setSelectedMood]               = useState(null)
    const [productMoodDirections, setProductMoodDirections] = useState(null)
    const [designContext, setDesignContext]             = useState(null)
    const fileRef = useRef()

    const reset = () => {
        setProductDNA(null); setMoodImages({}); setProductMoodDirections(null)
        setSelectedMood(null); setDesignContext(null); setAnalyzedProduct(null)
        setProductImages([]); setActiveStep(0); setError('')
        setUploadedFiles([]); setUploadPreviews([]); setS3ImageUrls([])
        setMoodLoading(false); setSliderIndex(0)
        if (setMoodDirections) setMoodDirections(null)
        setStep('input')
    }

    // Simulate step-by-step progress during analysis
    const runProgressAnimation = () => {
        let i = 0
        const tick = () => {
            setActiveStep(i)
            i++
            if (i < ANALYSIS_STEPS.length) setTimeout(tick, 1800)
        }
        tick()
    }

    const runPDI = async (images, product) => {
        try {
            const data = await apiFetch('/brand-studio/product-intelligence', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productImages: images.slice(0, 8), productData: product, brandId, productUrl }),
            })
            if (data.success && data.productDNA) {
                setProductDNA(data.productDNA)
                const def = data.productDNA.defaultMoodDirection || 'editorial'
                setSelectedMood(def)
                // Build design context silently
                apiFetch('/brand-studio/design-context', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productDNA: data.productDNA, selectedMoodId: def }),
                }).then(dc => { if (dc.success) setDesignContext(dc.designContext) }).catch(() => {})
                // Kick off moodboard generation (fire-and-forget)
                setMoodLoading(true)
                apiFetch('/brand-studio/mood-board', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productDNA: data.productDNA, productData: product, brandId }),
                    timeout: 180000,   // 3 min — 4× AI image generations run in parallel (~60-90s total)
                }).then(mb => {
                    setMoodLoading(false)
                    if (mb.success) {
                        let newMoodDirs = null
                        if (mb.moodDirections && Object.keys(mb.moodDirections).length >= 2) {
                            newMoodDirs = mb.moodDirections
                            setProductMoodDirections(mb.moodDirections)
                            // KEY FIX: lift to parent so Phase2 gets updated IDs
                            if (setMoodDirections) setMoodDirections(mb.moodDirections)
                            setSelectedMood(Object.keys(mb.moodDirections)[0])
                        }
                        let newImgs = {}
                        if (mb.moods) {
                            mb.moods.forEach(m => { if (m.imageUrl) newImgs[m.id] = m.imageUrl })
                            setMoodImages(newImgs)  // lifted to parent — Phase2 sees this reactively
                        }

                        // Auto-save to database
                        if (brandId && data.productDNA) {
                            const pName = product?.title || data.productDNA?.productCategory || 'Product'
                            if (!/oops|something went wrong|access denied|captcha/i.test(pName)) {
                                apiFetch('/brand-studio/product-context', {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        brandId, productName: pName,
                                        productCategory: data.productDNA?.productCategory || '',
                                        productBrand: product?.brand || '',
                                        productUrl: productUrl || '',
                                        productImages: (product?.persistedImages || images || []).slice(0, 4),
                                        palette: data.productDNA?.dominantColors || [],
                                        productDNA: data.productDNA || {},
                                        selectedMoodId: def,
                                        moodDirections: newMoodDirs || {},
                                        moodImages: newImgs || {},
                                        designContext: designContext, autoSaved: true,
                                    }),
                                }).catch(() => {})
                            }
                        }
                    }
                }).catch(err => { console.error('❌ Mood board generation failed:', err.message); setMoodLoading(false) })
            }
        } catch (e) { console.warn('PDI failed:', e.message) }
        setActiveStep(ANALYSIS_STEPS.length - 1)
        setStep('ready')
    }

    const handleAnalyze = async () => {
        if (!productUrl && s3ImageUrls.length === 0) return
        reset()
        setStep('analyzing')
        runProgressAnimation()
        // BUG3 FIX: if user uploaded images but no URL, skip URL scan, go straight to PDI
        if (!productUrl && s3ImageUrls.length > 0) {
            setProductImages(s3ImageUrls)
            await runPDI(s3ImageUrls, { title: '', description: description || '' })
            return
        }
        try {
            const data = await apiFetch('/brand-studio/aplus/analyze-product', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: productUrl }),
            })
            if (data.success) {
                setAnalyzedProduct(data.product)
                // Prefer S3-persisted images (already uploaded by backend) over raw CDN URLs
                // CDN URLs get 403-blocked when passed as AI reference images → wrong generic image generated
                const imgs = data.product.persistedImages?.length
                    ? data.product.persistedImages
                    : (data.product.images || [])
                setProductImages(imgs)
                await runPDI(imgs, data.product)
            } else { setError(data.error || 'Failed to analyze product'); setStep('input') }
        } catch (e) { setError(e.message); setStep('input') }
    }

    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        // BUG2 FIX: reset BEFORE setting previews so reset() doesn't wipe them
        reset()
        setUploadedFiles(files)
        setStep('analyzing')
        runProgressAnimation()
        // Show local previews immediately (for UX while S3 upload runs)
        const previews = await Promise.all(
            files.map(f => new Promise(res => {
                const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f)
            }))
        )
        setUploadPreviews(previews)
        // Upload to S3
        const urls = await uploadProductImages(files)
        setS3ImageUrls(urls)
        setProductImages(urls)
        await runPDI(urls, { title: '', description: description || '' })
    }

    const handleDownloadImage = async (url, filename) => {
        try {
            const response = await fetch(url, { mode: 'cors' })
            const blob = await response.blob()
            const blobUrl = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = blobUrl
            link.download = filename || `moodboard-${Date.now()}.png`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
            URL.revokeObjectURL(blobUrl)
        } catch (e) {
            console.warn('Failed to download image directly:', e)
            window.open(url, '_blank')
        }
    }

    // BUG4 FIX: Clicking mood card only selects — does NOT advance to Phase 2
    const handleMoodCardClick = (moodId) => {
        setSelectedMood(moodId)
    }

    // Called ONLY by the "Continue to Mood Board" button — advances to Phase 2
    const handleContinue = async (moodId) => {
        if (!moodId) return
        setSelectedMood(moodId)
        let dc = designContext
        try {
            const res = await apiFetch('/brand-studio/design-context', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productDNA, selectedMoodId: moodId, customMoodDirections: productMoodDirections || null }),
            })
            if (res.success) { dc = res.designContext; setDesignContext(dc) }
        } catch (e) {}
        onContextReady({
            productData:           analyzedProduct,
            productDNA,
            productImages:         productImages.length ? productImages : s3ImageUrls,
            productUrl,
            selectedMood:          moodId,
            productMoodDirections,
            moodImages,
            designContext:         dc,
        })
        // Background auto-save
        if (brandId && productDNA) {
            const pName = analyzedProduct?.title || productDNA?.productCategory || 'Product'
            if (!/oops|something went wrong|access denied|captcha/i.test(pName)) {
                apiFetch('/brand-studio/product-context', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        brandId, productName: pName,
                        productCategory: productDNA?.productCategory || '',
                        productBrand: analyzedProduct?.brand || '',
                        productUrl: productUrl || '',
                        productImages: (analyzedProduct?.persistedImages || productImages || []).slice(0, 4),
                        palette: productDNA?.dominantColors || [],
                        productDNA: productDNA || {},
                        selectedMoodId: moodId,
                        moodDirections: productMoodDirections || {},
                        moodImages: moodImages || {},
                        designContext: dc, autoSaved: true,
                    }),
                }).catch(() => {})
            }
        }
    }

    const activeMoods = productMoodDirections
        ? Object.fromEntries(Object.values(productMoodDirections).map((m, i) => {
            const bgs = ['linear-gradient(135deg,#0d0d1a,#1a0d2e)', 'linear-gradient(135deg,#1a0a0a,#2e0d0d)', 'linear-gradient(135deg,#fef3c7,#fde68a)', 'linear-gradient(135deg,#f5f5f0,#e8e4dc)']
            const p = m.colorPalette || []
            return [m.id, { ...m, icon: m.icon || 'sparkles', desc: m.description || '', bg: p.length >= 2 ? `linear-gradient(135deg,${p[0]},${p[1]})` : bgs[i % bgs.length] }]
          }))
        : {
            editorial: { id:'editorial', label:'Editorial Clean',   desc:'Clean, precise, studio-perfect',  bg:'linear-gradient(135deg,#f0f0f0,#e8e8e8)' },
            bold:      { id:'bold',      label:'Bold Ambient',      desc:'Dark, dramatic, cinematic',       bg:'linear-gradient(135deg,#0d0d1a,#1a0d2e)' },
            lifestyle: { id:'lifestyle', label:'Lifestyle Vibrant', desc:'Real-world, warm, relatable',     bg:'linear-gradient(135deg,#fef3c7,#fde68a)' },
            luxury:    { id:'luxury',    label:'Premium Minimal',   desc:'Luxury, spacious, refined',       bg:'linear-gradient(135deg,#f5f5f0,#e8e4dc)' },
          }

    return (
        <div className="ps-slide-up">
            {/* Section header */}
            <div className="ps-section-header">
                <div className="ps-section-icon">
                    <Search size={17} />
                </div>
                <div>
                    <div className="ps-section-title">Product Intelligence</div>
                    <div className="ps-section-sub">AI extracts design DNA, color palette & mood — everything flows from this</div>
                </div>
            </div>

            {/* Input card */}
            {step !== 'ready' && (
                <div className="ps-input-card">
                    {/* URL Input Row */}
                    <div className="ps-url-row">
                        <div className="ps-url-wrapper" style={{ flex: 1 }}>
                            <Link2 size={15} className="ps-url-icon" />
                            <input
                                className="ps-url-input"
                                value={productUrl}
                                onChange={e => setProductUrl(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                                placeholder="Paste Amazon, Flipkart, or any product URL…"
                                disabled={step === 'analyzing'}
                            />
                        </div>
                        <button
                            className="ps-btn-primary"
                            onClick={handleAnalyze}
                            disabled={(!productUrl && s3ImageUrls.length === 0) || step === 'analyzing'}
                            style={{ borderRadius: 9 }}
                        >
                            {step === 'analyzing' ? (
                                <><Loader2 size={15} className="ps-spin" />Analyzing…</>
                            ) : (
                                <><Sparkles size={15} />Analyze Product</>
                            )}
                        </button>
                    </div>

                    {/* Description */}
                    <textarea
                        className="ps-textarea"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Optional: Describe your product, target audience, and key USPs… (especially useful for services, tours, projects)"
                        rows={2}
                        disabled={step === 'analyzing'}
                    />

                    {/* Divider */}
                    <div className="ps-divider">
                        <div className="ps-divider-line" />
                        <span className="ps-divider-text">or upload product images</span>
                        <div className="ps-divider-line" />
                    </div>

                    {/* Upload zone */}
                    <label
                        className={`ps-upload-zone ${uploadPreviews.length ? 'has-files' : ''}`}
                        style={{ opacity: step === 'analyzing' ? 0.6 : 1 }}
                    >
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                            disabled={step === 'analyzing'}
                        />
                        {uploadPreviews.length === 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: 'var(--sys-text-muted)' }}>
                                <UploadCloud size={18} />
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>Upload Product Images</div>
                                    <div style={{ fontSize: 11, marginTop: 2 }}>JPG, PNG, WebP — up to 8 images</div>
                                </div>
                            </div>
                        ) : (
                            <div className="ps-upload-grid">
                                {uploadPreviews.slice(0, 8).map((src, i) => (
                                    <div key={i} className="ps-upload-thumb">
                                        <img src={src} alt="" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </label>

                    {error && (
                        <div className="ps-error-bar" style={{ marginTop: 12 }}>
                            <X size={14} /> {error}
                        </div>
                    )}
                </div>
            )}

            {/* Analysis progress */}
            {step === 'analyzing' && (
                <div className="ps-analysis-card">
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 12 }}>
                        AI is understanding your product…
                    </div>
                    {ANALYSIS_STEPS.map((s, i) => {
                        const Icon = s.icon
                        const isDone = i < activeAnalysisStep
                        const isActive = i === activeAnalysisStep
                        return (
                            <div key={i} className={`ps-analysis-step ${isDone ? 'done' : isActive ? 'active' : 'pending'}`}>
                                <div className="ps-step-icon">
                                    {isDone ? <CheckCircle2 size={14} /> : isActive ? <Loader2 size={14} className="ps-spin" /> : <Icon size={14} />}
                                </div>
                                <span style={{ fontSize: 12, color: isDone ? 'var(--sys-text-muted)' : isActive ? 'var(--sys-text)' : 'var(--sys-text-muted)' }}>
                                    {s.text}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Product profile (ready state) */}
            {step === 'ready' && productDNA && (
                <div>
                    <div className="ps-product-profile">
                        {/* Compact Image Slider */}
                        {productImages.length > 0 && (
                            <div className="ps-img-slider">
                                {/* Main image */}
                                <div className="ps-img-slider-main">
                                    <img
                                        src={productImages[sliderIndex]}
                                        alt=""
                                        className="ps-img-slider-img"
                                        onError={e => e.target.style.display='none'}
                                    />
                                    {productImages.length > 1 && (
                                        <>
                                            <button
                                                className="ps-img-slider-arrow left"
                                                onClick={() => setSliderIndex(i => (i - 1 + productImages.length) % productImages.length)}
                                            >‹</button>
                                            <button
                                                className="ps-img-slider-arrow right"
                                                onClick={() => setSliderIndex(i => (i + 1) % productImages.length)}
                                            >›</button>
                                        </>
                                    )}
                                    <div className="ps-img-slider-counter">
                                        {sliderIndex + 1} / {productImages.length}
                                    </div>
                                </div>
                                {/* Thumbnail strip */}
                                {productImages.length > 1 && (
                                    <div className="ps-img-slider-thumbs">
                                        {productImages.slice(0, 8).map((img, i) => (
                                            <div
                                                key={i}
                                                className={`ps-img-slider-thumb ${i === sliderIndex ? 'active' : ''}`}
                                                onClick={() => setSliderIndex(i)}
                                            >
                                                <img src={img} alt="" onError={e => e.target.style.display='none'} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Meta */}
                        <div className="ps-product-meta">
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                <div style={{ flex: 1 }}>
                                    <div className="ps-product-name">
                                        {analyzedProduct?.title || productDNA.productCategory || 'Product Analyzed'}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 2 }}>
                                        {productDNA.productCategory}{analyzedProduct?.brand ? ` · ${analyzedProduct.brand}` : ''} · {productImages.length} images
                                    </div>
                                </div>
                                <button className="ps-btn-ghost" onClick={reset} style={{ flexShrink: 0 }}>
                                    <RefreshCw size={12} /> Reset
                                </button>
                            </div>

                            {/* Tags */}
                            <div className="ps-product-tags">
                                {(productDNA.moodTags || []).slice(0, 4).map((t, i) => (
                                    <span key={i} className="ps-tag">{t}</span>
                                ))}
                                {productDNA.surfaceFinish && <span className="ps-tag">{productDNA.surfaceFinish}</span>}
                                {productDNA.materials && <span className="ps-tag">{productDNA.materials.split(',')[0]?.trim()}</span>}
                            </div>

                            {/* Palette */}
                            <div className="ps-palette-strip">
                                {(productDNA.dominantColors || []).slice(0, 10).map((c, i) => (
                                    <div key={i} className="ps-palette-swatch" title={`${c.name} ${c.hex}`} style={{ background: c.hex }} />
                                ))}
                                <span className="ps-palette-label">
                                    <Lock size={10} /> Colors Locked
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Mood selection */}
                    <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)' }}>
                                Pick a Mood Direction
                            </div>
                            {moodLoading && (
                                <span style={{ fontSize: 10, color: 'var(--sys-primary)', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                    <Loader2 size={10} className="ps-spin" /> GPT Image 2 generating…
                                </span>
                            )}
                            {!moodLoading && Object.keys(moodImages).length > 0 && (
                                <span style={{ fontSize: 10, color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                    <CheckCircle2 size={10} /> AI Moods Ready
                                </span>
                            )}
                        </div>

                        {moodLoading && (
                            <div className="ps-mood-loading-banner" style={{ marginBottom: 12 }}>
                                <Loader2 size={16} className="ps-spin" style={{ color: 'var(--sys-primary)' }} />
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sys-text)' }}>Generating Mood Board Options</div>
                                    <div style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 2 }}>
                                        GPT Image 2 is creating 4 distinct visual territories using your Product DNA (takes ~30-60s). You can select a mood now and continue, or wait for the previews to render.
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="ps-mood-filmstrip">
                            {Object.values(activeMoods).map(mood => {
                                const aiImg = moodImages[mood.id]
                                const isSelected = selectedMood === mood.id
                                return (
                                    // BUG4 FIX: Click only selects mood, does NOT advance phase
                                    <div key={mood.id} className={`ps-mood-thumb ${isSelected ? 'selected' : ''}`} onClick={() => handleMoodCardClick(mood.id)}>
                                        {aiImg ? (
                                            <>
                                                <img src={aiImg} alt={mood.label} className="ps-mood-thumb-img" onError={e => e.target.style.display='none'} />
                                                <button
                                                    className="ps-mood-thumb-download-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleDownloadImage(aiImg, `${mood.label}.png`)
                                                    }}
                                                    title="Download Mood Board"
                                                >
                                                    <Download size={10} />
                                                </button>
                                            </>
                                        ) : moodLoading ? (
                                            <div className="ps-mood-thumb-placeholder">
                                                <Loader2 size={16} className="ps-spin" style={{ color: 'var(--sys-text-muted)' }} />
                                            </div>
                                        ) : (
                                            <div className="ps-mood-thumb-placeholder" style={{ background: mood.bg }}>
                                                <Sparkles size={18} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                            </div>
                                        )}
                                        {moodLoading && !aiImg && (
                                            <div className="ps-mood-generating">Rendering…</div>
                                        )}
                                        <div className="ps-mood-thumb-label">{mood.label}</div>
                                        {isSelected && (
                                            <div className="ps-mood-check">
                                                <CheckCircle2 size={11} />
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        <div className="ps-info-bar">
                            <Lock size={13} />
                            Product colors are locked — AI will never shift the product's color in any generated asset.
                        </div>
                    </div>

                    {selectedMood && (
                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
                            {/* BUG4 FIX: Only this button advances to Phase 2 */}
                            <button className="ps-btn-primary" onClick={() => handleContinue(selectedMood)} style={{ gap: 8 }}>
                                <ChevronRight size={16} />
                                Continue to Mood Board
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

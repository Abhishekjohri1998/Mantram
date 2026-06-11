import React, { useState, useEffect } from 'react'
import {
    ChevronLeft, ChevronRight, Lock, Sparkles, Loader2,
    CheckCircle2, Palette, Image as ImageIcon, RefreshCw,
    Download, Eye
} from 'lucide-react'

export default function Phase2MoodBoard({ productContext, moodLoading, onMoodSelected, onBack }) {
    const {
        productDNA,
        productData,
        productImages = [],
        moodImages = {},
        productMoodDirections,
        selectedMood: initialMood,
    } = productContext || {}

    const [activeMoodId, setActiveMoodId] = useState(initialMood || null)
    const [heroLoaded, setHeroLoaded]     = useState(false)

    const moodMap = productMoodDirections || {
        editorial: { id:'editorial', label:'Editorial Clean',   description:'Clean, precise, studio-perfect — magazine-grade studio perfection', colorPalette:['#f0f0f0','#e0e0e0'] },
        bold:      { id:'bold',      label:'Bold Ambient',      description:'Dramatic, moody, powerful — dark environments with cinematic rim light', colorPalette:['#0d0d1a','#1a0d2e'] },
        lifestyle: { id:'lifestyle', label:'Lifestyle Vibrant', description:'Real-world, human, contextual — aspirational but relatable', colorPalette:['#fef3c7','#fde68a'] },
        luxury:    { id:'luxury',    label:'Premium Minimal',   description:'Ultra-premium, spacious, sophisticated — luxury goods treatment', colorPalette:['#f5f5f0','#e8e4dc'] },
    }

    const moodList = Object.values(moodMap)
    const activeMood = moodMap[activeMoodId] || moodList[0]
    const activeImage = activeMood ? moodImages[activeMood.id] : null
    const palette = productDNA?.dominantColors || []

    // Auto-select first mood with an actual image when moodImages arrives asynchronously
    useEffect(() => {
        const imageKeys = Object.keys(moodImages).filter(k => moodImages[k])
        if (imageKeys.length > 0) {
            // If the current active mood doesn't have an image, switch to the first one that does
            if (!moodImages[activeMoodId]) {
                setActiveMoodId(imageKeys[0])
            }
        }
    }, [moodImages]) // eslint-disable-line react-hooks/exhaustive-deps

    // When mood directions update (AI-generated IDs arrive), auto-select the first one
    useEffect(() => {
        if (productMoodDirections) {
            const ids = Object.keys(productMoodDirections)
            if (ids.length > 0 && !productMoodDirections[activeMoodId]) {
                setActiveMoodId(ids[0])
            }
        }
    }, [productMoodDirections]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setHeroLoaded(false)
    }, [activeMoodId])


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

    // Background gradient from mood palette
    const gradientBg = (() => {
        const p = activeMood?.colorPalette || []
        if (p.length >= 2) return `linear-gradient(135deg, ${p[0]}, ${p[1]})`
        return 'linear-gradient(135deg, #0d0d1a, #1a0d2e)'
    })()

    const handleConfirm = () => {
        if (!activeMoodId) return
        onMoodSelected(activeMoodId)
    }

    return (
        <div className="ps-slide-up">
            {/* Section header */}
            <div className="ps-section-header">
                <div className="ps-section-icon" style={{ cursor: 'pointer' }} onClick={onBack}>
                    <Palette size={17} />
                </div>
                <div style={{ flex: 1 }}>
                    <div className="ps-section-title">Mood Board Studio</div>
                    <div className="ps-section-sub">
                        Select the creative territory that defines your brand's visual world — all assets will follow this direction
                    </div>
                </div>
                {activeMoodId && (
                    <button className="ps-btn-ghost" onClick={onBack}>
                        <ChevronLeft size={14} /> Back
                    </button>
                )}
            </div>

            {/* Hero moodboard image */}
            <div className="ps-mood-hero">
                {activeImage ? (
                    <>
                        <img
                            src={activeImage}
                            alt={activeMood?.label}
                            className="ps-mood-hero-img"
                            style={{ opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.5s' }}
                            onLoad={() => setHeroLoaded(true)}
                            onError={e => e.target.style.display='none'}
                        />
                        {!heroLoaded && (
                            <div className="ps-mood-hero-placeholder" style={{ background: gradientBg, position: 'absolute', inset: 0 }}>
                                <Loader2 size={24} className="ps-spin" style={{ color: 'rgba(255,255,255,0.4)' }} />
                            </div>
                        )}
                        
                        {/* Floating Action Buttons */}
                        <div className="ps-mood-hero-actions">
                            <button className="ps-mood-action-btn" onClick={() => window.open(activeImage, '_blank')} title="View Fullscreen">
                                <Eye size={13} />
                                View Full
                            </button>
                            <button className="ps-mood-action-btn" onClick={() => handleDownloadImage(activeImage, `${activeMood?.label || 'moodboard'}.png`)} title="Download Image">
                                <Download size={13} />
                                Download
                            </button>
                        </div>
                    </>
                ) : moodLoading ? (
                    <div className="ps-mood-hero-placeholder" style={{ background: gradientBg }}>
                        <div style={{ textAlign: 'center', color: '#fff' }}>
                            <Loader2 size={36} className="ps-spin" style={{ marginBottom: 12, color: 'var(--sys-primary)' }} />
                            <div style={{ fontSize: 14, fontWeight: 700 }}>Generating Mood Board Images</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4, maxWidth: 300, margin: '4px auto 0', lineHeight: 1.5 }}>
                                GPT Image 2 is rendering your design concepts (approx. 30-60 seconds)...
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="ps-mood-hero-placeholder" style={{ background: gradientBg }}>
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                            <Sparkles size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                            <div style={{ fontSize: 13, fontWeight: 700 }}>No Mood Board Image Generated</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                                Double check API configuration or retry the scan
                            </div>
                        </div>
                    </div>
                )}

                {/* Overlay */}
                {activeMood && (
                    <div className="ps-mood-hero-overlay">
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="ps-mood-name">{activeMood.label}</div>
                                <div className="ps-mood-desc">{activeMood.description}</div>
                                {activeMood.targetMoment && (
                                    <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                                        "{activeMood.targetMoment}"
                                    </div>
                                )}
                                {/* Mood palette swatches */}
                                <div className="ps-mood-meta">
                                    {(activeMood.colorPalette || []).map((c, i) => (
                                        <div key={i} className="ps-mood-swatch" style={{ background: c }} title={c} />
                                    ))}
                                    {palette.slice(0, 4).map((c, i) => (
                                        <div key={`p${i}`} className="ps-mood-swatch" style={{ background: c.hex }} title={`${c.name} — ${c.hex} (product color)`} />
                                    ))}
                                </div>
                            </div>
                            {/* AI Badge */}
                            {moodImages[activeMood?.id] && (
                                <div style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', borderRadius: 8, padding: '6px 10px', flexShrink: 0 }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>GPT Image 2</div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <CheckCircle2 size={10} style={{ color: '#10b981' }} /> Art Director Ready
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Filmstrip */}
            <div className="ps-mood-filmstrip">
                {moodList.map(mood => {
                    const img = moodImages[mood.id]
                    const isSelected = activeMoodId === mood.id
                    const bg = (() => {
                        const p = mood.colorPalette || []
                        if (p.length >= 2) return `linear-gradient(135deg,${p[0]},${p[1]})`
                        return 'linear-gradient(135deg,#1a1a2e,#0a0a0a)'
                    })()
                    return (
                        <div
                            key={mood.id}
                            className={`ps-mood-thumb ${isSelected ? 'selected' : ''}`}
                            onClick={() => setActiveMoodId(mood.id)}
                        >
                            {img ? (
                                <>
                                    <img src={img} alt={mood.label} className="ps-mood-thumb-img" onError={e => e.target.style.display='none'} />
                                    <button
                                        className="ps-mood-thumb-download-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownloadImage(img, `${mood.label}.png`)
                                        }}
                                        title="Download Mood Board"
                                    >
                                        <Download size={10} />
                                    </button>
                                </>
                            ) : moodLoading ? (
                                <div className="ps-mood-thumb-placeholder" style={{ background: bg }}>
                                    <Loader2 size={14} className="ps-spin" style={{ color: 'rgba(255,255,255,0.4)' }} />
                                </div>
                            ) : (
                                <div className="ps-mood-thumb-placeholder" style={{ background: bg }}>
                                    <Sparkles size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                </div>
                            )}
                            <div className="ps-mood-thumb-label">
                                {mood.label}
                                {productMoodDirections && (
                                    <span style={{ marginLeft: 5, fontSize: 8, color: 'var(--sys-primary)', background: 'var(--sys-primary-dim)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>AI</span>
                                )}
                            </div>
                            {isSelected && (
                                <div className="ps-mood-check">
                                    <CheckCircle2 size={11} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Product color lock notice */}
            <div className="ps-info-bar" style={{ marginBottom: 20 }}>
                <Lock size={13} />
                Product colors ({palette.slice(0,4).map(c => c.hex).join(', ') || 'extracted from your product'}) are permanently locked across ALL generated assets.
                The mood changes the environment and atmosphere — never the product itself.
            </div>

            {/* Shoot directive (art direction preview) */}
            {activeMood?.shootDirective && (
                <div style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 6 }}>
                        Art Direction Brief
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--sys-text)', lineHeight: 1.65 }}>
                        {activeMood.shootDirective || activeMood.moodBoardDirective}
                    </div>
                </div>
            )}

            {/* CTA */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                <button className="ps-btn-ghost" onClick={onBack}>
                    <ChevronLeft size={14} /> Back to Product
                </button>
                <button
                    className="ps-btn-primary"
                    onClick={handleConfirm}
                    disabled={!activeMoodId}
                    style={{ gap: 8, fontSize: 14, padding: '13px 24px' }}
                >
                    <Lock size={15} />
                    Lock This Mood &amp; Create
                    <ChevronRight size={15} />
                </button>
            </div>
        </div>
    )
}

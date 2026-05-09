import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { monthlyStrategy as msAPI, uploadFileToS3, creatives as creativesAPI, jobs as jobsAPI } from '../../services/api'
import { useBrand } from '../../context/BrandContext'
import { useCredits } from '../../context/CreditContext'
import { useJobPoller } from '../../hooks/useJobPoller'
import { CreditBadge, CreditTooltipWrapper } from '../CreditBadge'
import ScheduleDrawer from '../ScheduleDrawer'
import './MonthlyStrategy.css'

// ─── Constants ──────────────────────────────────────────────────────────────

const IMAGE_MODELS = [
  { id: 'nanobanana-2',   name: 'NanoBanana 2',   desc: 'Default · Fast'       },
  { id: 'nanobanana-pro', name: 'NanoBanana Pro',  desc: 'Premium quality'      },
  { id: 'flux-pro-v1.1', name: 'Flux Pro v1.1',   desc: 'Photorealistic'       },
  { id: 'flux-2-pro',    name: 'Flux 2 Pro',      desc: 'Latest Flux'          },
  { id: 'seedream-5',    name: 'Seedream 5',      desc: 'Artistic style'       },
  { id: 'ideogram',      name: 'Ideogram v3',     desc: 'Best text in images'  },
  { id: 'gpt-image-2',   name: 'GPT Image 2',     desc: 'Perfect text'         },
  { id: 'gpt-image-1',   name: 'GPT Image 1',     desc: 'Clean renders'        },
]


const STRATEGY_TYPES = [
  { id: 'social-media',          msIcon: 'smartphone',        label: 'Social Media',          desc: 'Reels, carousels, stories'      },
  { id: 'performance-marketing', msIcon: 'ads_click',         label: 'Performance Marketing',  desc: 'Paid ads, Meta, Google'         },
  { id: 'seo',                   msIcon: 'manage_search',     label: 'SEO & Content',          desc: 'Blogs, keywords, rankings'      },
  { id: 'sales',                 msIcon: 'local_offer',       label: 'Sales Acceleration',     desc: 'Offers, promos, conversion'     },
  { id: 'content-marketing',     msIcon: 'edit_note',         label: 'Content Marketing',      desc: 'Thought leadership, education'  },
  { id: 'email-retention',       msIcon: 'mark_email_read',   label: 'Email & Retention',      desc: 'Win-back, loyalty, LTV'         },
  { id: 'influencer-ugc',        msIcon: 'group',             label: 'Influencer & UGC',       desc: 'Creator briefs, seeding'        },
  { id: 'marketplace',           msIcon: 'storefront',        label: 'Marketplace',            desc: 'Amazon, Flipkart, listings'     },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_COLORS = {
  pending:     'rgba(255,255,255,0.25)',
  in_progress: '#f59e0b',
  complete:    '#22c55e',
  published:   'var(--sys-primary, #FF4D00)',
}

// Platform → Material Symbol icon name
const PLATFORM_ICONS = {
  instagram:  'photo_camera',
  linkedin:   'business_center',
  twitter:    'tag',
  tiktok:     'music_video',
  facebook:   'thumb_up',
  youtube:    'play_circle',
  gbp:        'storefront',
  google:     'storefront',
  email:      'mail',
  newsletter: 'mark_email_read',
  whatsapp:   'chat',
  amazon:     'inventory_2',
  blog:       'article',
}

// Content type → icon (overrides platform icon for text-based content)
const CONTENT_TYPE_ICONS = {
  blog:       'article',
  newsletter: 'mark_email_read',
  article:    'article',
  reel:       'videocam',
  video:      'videocam',
  carousel:   'view_carousel',
  story:      'amp_stories',
  static:     'image',
  ad:         'ads_click',
}

const STUDIO_PATHS = {
  content:   '/content-studio',
  creative:  '/creative-studio',
  video:     '/video-studio',
  retention: '/content-studio',
}

// Content types for single image inline generation
const INLINE_IMAGE_TYPES = new Set(['static', 'story', 'ad'])
// Content types for blog/text generation
const BLOG_TYPES = new Set(['blog', 'newsletter', 'article'])
// Content types for carousel (multi-image)
const CAROUSEL_TYPES = new Set(['carousel'])

// ─── Validation Constants ────────────────────────────────────────────────────
const MAX_BRIEF_LENGTH = 2000
const MAX_KEYWORDS     = 15
const MAX_LAUNCH_EVENTS = 10

// ─── Brief Drawer ────────────────────────────────────────────────────────────

function BriefDrawer({ item, strategyId, onClose, onStatusChange, onAssetWriteback }) {
  const navigate = useNavigate()
  const { activeBrand } = useBrand()
  const [regenInstructions, setRegenInstructions]   = useState('')
  const [regenLoading, setRegenLoading]             = useState(false)
  const [currentBrief, setCurrentBrief]             = useState(item.brief || {})
  const [currentStatus, setCurrentStatus]           = useState(item.status || 'pending')
  const [executeLoading, setExecuteLoading]         = useState(false)
  // Inline image generation state
  const [imageLoading, setImageLoading]             = useState(false)
  const [imageError, setImageError]                 = useState(null)
  const [generatedImageUrl, setGeneratedImageUrl]   = useState(item.generatedAsset?.url || null)
  // Carousel multi-image state
  const [carouselImages, setCarouselImages]         = useState(item.generatedAsset?.imageUrls || [])
  const [carouselLoading, setCarouselLoading]       = useState(false)
  const [carouselError, setCarouselError]           = useState(null)
  const [carouselSlideCount, setCarouselSlideCount] = useState(3)
  // Schedule drawer
  const [schedOpen, setSchedOpen]                   = useState(false)
  // Reference image for visual generation (S3 URL only, never base64)
  const [refImageUrl, setRefImageUrl]               = useState('')
  const [refImagePreview, setRefImagePreview]       = useState('')  // object URL for thumbnail
  const [refUploading, setRefUploading]             = useState(false)
  const [refError, setRefError]                     = useState(null)
  const [libraryImages, setLibraryImages]           = useState([])
  const [libraryOpen, setLibraryOpen]               = useState(false)
  const refFileInput                                = useRef(null)

  const brief    = currentBrief
  const monthStr = item.date
    ? new Date(item.date + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''

  const canInlineImage = INLINE_IMAGE_TYPES.has(item.contentType)
  const canCarousel    = CAROUSEL_TYPES.has(item.contentType)
  const canBlog        = BLOG_TYPES.has(item.contentType)

  // Load brand's recent creatives for the library picker
  useEffect(() => {
    if (!activeBrand?._id || (!canInlineImage && !canCarousel)) return
    creativesAPI.list({ brandId: activeBrand._id, limit: 10 })
      .then(d => setLibraryImages((d.creatives || []).filter(c => c.imageUrl)))
      .catch(() => {})
  }, [activeBrand?._id, canInlineImage, canCarousel])

  // Handle reference image file upload — PUT directly to S3, no base64
  const handleRefFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setRefError('File too large (max 10 MB)'); return }
    setRefUploading(true)
    setRefError(null)
    // Local object URL for instant thumbnail preview
    const preview = URL.createObjectURL(file)
    setRefImagePreview(preview)
    try {
      const s3Url = await uploadFileToS3(file, 'refs')
      setRefImageUrl(s3Url)
    } catch (err) {
      setRefError('Upload failed — check your connection')
      setRefImageUrl('')
      setRefImagePreview('')
      URL.revokeObjectURL(preview)
    }
    setRefUploading(false)
  }

  const clearRefImage = () => {
    if (refImagePreview) URL.revokeObjectURL(refImagePreview)
    setRefImageUrl('')
    setRefImagePreview('')
    if (refFileInput.current) refFileInput.current.value = ''
  }

  const handleStatusChange = async (status) => {
    setCurrentStatus(status)
    onStatusChange?.(item._id, status)
    try { await msAPI.updateStatus(strategyId, item._id, status) } catch {}
  }

  const handleRegen = async () => {
    setRegenLoading(true)
    try {
      const res = await msAPI.regenerateBrief(strategyId, item._id, regenInstructions)
      if (res?.brief) setCurrentBrief(res.brief)
    } catch {}
    setRegenLoading(false)
  }

  // ── Inline image generation ──
  const handleGenerateVisual = async () => {
    if (!activeBrand?._id) return
    setImageLoading(true)
    setImageError(null)
    try {
      // Build visual prompt from brief fields
      const promptParts = [
        brief.visualDirection && brief.visualDirection,
        brief.angle           && `Campaign: ${brief.angle}`,
        brief.toneDirection   && `Mood: ${brief.toneDirection}`,
        activeBrand.name      && `Brand: ${activeBrand.name}`,
      ].filter(Boolean)
      const prompt = promptParts.join('. ')

      // Map content type → aspect ratio
      const aspectRatio = item.contentType === 'story' ? '9:16'
        : item.contentType === 'carousel'              ? '1:1'
        : '1:1'

      // Build refImageUrls — S3 URLs only, passed straight to NanoBanana 2 as reference
      const refImageUrls = refImageUrl ? [refImageUrl] : []

      const res = await msAPI.generateVisual({
        brandId: activeBrand._id,
        type:    `${item.platform || 'instagram'}-post`,
        prompt,
        refImageUrls,       // ← S3 URL(s), never base64
        options: { aspectRatio },
      })

      if (res?.success && res?.creative?.imageUrl) {
        const url = res.creative.imageUrl
        setGeneratedImageUrl(url)
        // Write back to calendar item immediately
        await msAPI.updateAsset(strategyId, item._id, {
          type:        'image',
          url,
          title:       brief.angle || item.contentType,
          description: brief.captionDraft || '',
        })
        // Auto-mark complete
        setCurrentStatus('complete')
        onStatusChange?.(item._id, 'complete')
        onAssetWriteback?.(item._id, { url, type: 'image', status: 'complete' })
      } else {
        throw new Error(res?.error || 'Image generation failed')
      }
    } catch (e) {
      setImageError(e.message || 'Generation failed')
    }
    setImageLoading(false)
  }

  // ── Carousel: generate N slides sequentially ──
  const handleGenerateCarousel = async () => {
    if (!activeBrand?._id) return
    setCarouselLoading(true)
    setCarouselError(null)
    const slides = []
    try {
      const basePrompt = [
        brief.visualDirection && brief.visualDirection,
        brief.angle && `Campaign: ${brief.angle}`,
        brief.toneDirection && `Mood: ${brief.toneDirection}`,
        activeBrand.name && `Brand: ${activeBrand.name}`,
      ].filter(Boolean).join('. ')

      for (let i = 0; i < carouselSlideCount; i++) {
        const slidePrompt = `${basePrompt}. CAROUSEL SLIDE ${i + 1} of ${carouselSlideCount}: ${i === 0 ? 'Hook slide — bold headline, attention-grabbing' : i === carouselSlideCount - 1 ? 'CTA slide — call to action, brand logo' : `Value slide ${i} — supporting point, detail`}.`
        const res = await msAPI.generateVisual({
          brandId: activeBrand._id,
          type:    'instagram-post',
          prompt:  slidePrompt,
          refImageUrls: refImageUrl ? [refImageUrl] : [],
          options: { aspectRatio: '1:1' },
        })
        if (res?.success && res?.creative?.imageUrl) {
          slides.push(res.creative.imageUrl)
          setCarouselImages([...slides]) // show progress
        }
      }
      if (slides.length > 0) {
        await msAPI.updateAsset(strategyId, item._id, {
          type: 'carousel', imageUrls: slides,
          url: slides[0], title: brief.angle || 'Carousel',
        })
        setCurrentStatus('complete')
        onStatusChange?.(item._id, 'complete')
        onAssetWriteback?.(item._id, { imageUrls: slides, url: slides[0], type: 'carousel', status: 'complete' })
      }
    } catch (e) {
      setCarouselError(e.message || 'Carousel generation failed')
    }
    setCarouselLoading(false)
  }

  // ── Studio execute (for blog/video/non-image content) ──
  const handleExecute = async () => {
    setExecuteLoading(true)
    try {
      await msAPI.execute(strategyId, item._id).catch(() => null)
      const handoffStudio = item.targetStudio || 'content'

      // Brief payload for the target studio
      const payload = {
        strategyId,
        itemId:          item._id,
        angle:           brief.angle           || '',
        caption:         brief.captionDraft    || '',
        visualDirection: brief.visualDirection || '',
        tone:            brief.toneDirection   || '',
        cta:             brief.callToAction    || '',
        hashtags:        brief.hashtagSet      || [],
        targetKeyword:   brief.targetKeyword   || '',
        platform:        item.platform         || '',
        contentType:     item.contentType      || '',
      }
      window.sessionStorage.setItem('ms_brief_handoff', JSON.stringify(payload))

      // Separate lightweight key so studios can write back after generation
      // without needing the full brief payload
      window.sessionStorage.setItem('ms_strategy_ctx', JSON.stringify({ strategyId, itemId: item._id }))

      const targetPath = STUDIO_PATHS[handoffStudio] || '/content-studio'
      navigate(`${targetPath}?from=monthly_strategy`)
    } catch (e) {
      console.error('[MonthlyStrategy] Execute failed:', e)
    }
    setExecuteLoading(false)
  }


  return (
    <div className="ms-drawer-overlay" onClick={onClose}>
      <div className="ms-drawer" onClick={e => e.stopPropagation()}>
        <div className="ms-drawer-header">
          <div className="ms-drawer-title">
            <span className="material-symbols-outlined" style={{ fontSize: 16, opacity: 0.7 }}>
              {PLATFORM_ICONS[item.platform] || 'description'}
            </span>
            {item.contentType} · {monthStr}
          </div>
          <button className="ms-drawer-close" onClick={onClose}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div className="ms-drawer-body">

          {/* ── Inline image preview (if already generated) ── */}
          {generatedImageUrl && (
            <div className="ms-inline-image-wrap">
              <img src={generatedImageUrl} alt="Generated visual" className="ms-inline-image" />
              <div className="ms-inline-image-label">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
                Visual generated · status set to complete
              </div>
            </div>
          )}

          {/* Angle */}
          {brief.angle && (
            <div>
              <div className="ms-drawer-section-label">Hook / Angle</div>
              <div className="ms-drawer-field">{brief.angle}</div>
            </div>
          )}

          {/* Caption */}
          {brief.captionDraft && (
            <div>
              <div className="ms-drawer-section-label">Caption Draft</div>
              <div className="ms-drawer-field" style={{ whiteSpace: 'pre-wrap' }}>{brief.captionDraft}</div>
            </div>
          )}

          {/* Visual direction */}
          {brief.visualDirection && (
            <div>
              <div className="ms-drawer-section-label">Visual Direction</div>
              <div className="ms-drawer-field">{brief.visualDirection}</div>
            </div>
          )}

          {/* Tone */}
          {brief.toneDirection && (
            <div>
              <div className="ms-drawer-section-label">Tone</div>
              <div className="ms-drawer-field">{brief.toneDirection}</div>
            </div>
          )}

          {/* CTA */}
          {brief.callToAction && (
            <div>
              <div className="ms-drawer-section-label">Call to Action</div>
              <div className="ms-drawer-field">{brief.callToAction}</div>
            </div>
          )}

          {/* Keyword */}
          {brief.targetKeyword && (
            <div>
              <div className="ms-drawer-section-label">Target Keyword</div>
              <div className="ms-drawer-field">{brief.targetKeyword}</div>
            </div>
          )}

          {/* Hashtags */}
          {brief.hashtagSet?.length > 0 && (
            <div>
              <div className="ms-drawer-section-label">Hashtags</div>
              <div className="ms-hashtag-list">
                {brief.hashtagSet.map((h, i) => (
                  <span key={i} className="ms-hashtag">{h.startsWith('#') ? h : `#${h}`}</span>
                ))}
              </div>
            </div>
          )}

          {/* Posting time */}
          {brief.postingTime && (
            <div>
              <div className="ms-drawer-section-label">Best Time to Post</div>
              <div className="ms-drawer-field">{brief.postingTime}</div>
            </div>
          )}

          {/* Status */}
          <div>
            <div className="ms-drawer-section-label">Status</div>
            <div className="ms-status-row">
              {['pending','in_progress','complete','published'].map(s => (
                <button
                  key={s}
                  className={`ms-status-btn ${currentStatus === s ? `active-${s}` : ''}`}
                  onClick={() => handleStatusChange(s)}
                >
                  {s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Regenerate Brief */}
          <div>
            <div className="ms-drawer-section-label">
              Regenerate Brief
              <CreditBadge action="monthlyBrief" className="ml-1" />
            </div>
            <div className="ms-regen-row">
              <input
                className="ms-regen-input"
                placeholder="Additional instructions (optional)..."
                value={regenInstructions}
                onChange={e => setRegenInstructions(e.target.value)}
              />
              <CreditTooltipWrapper action="monthlyBrief" position="top">
                <button className="ms-regen-btn" onClick={handleRegen} disabled={regenLoading}>
                  {regenLoading
                    ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 14 }}>progress_activity</span>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                  }
                  Regen
                </button>
              </CreditTooltipWrapper>
            </div>
          </div>

          {/* ── Blog / Newsletter: open Content Studio ── */}
          {canBlog && (
            <div>
              <div className="ms-drawer-section-label">
                <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>article</span>
                Generate Blog / Article
              </div>
              {brief.angle && (
                <div style={{ fontSize: '0.75rem', opacity: 0.65, marginBottom: '0.6rem', lineHeight: 1.5 }}>
                  <strong>Topic:</strong> {brief.angle}
                  {brief.targetKeyword && <span> · <strong>Keyword:</strong> {brief.targetKeyword}</span>}
                </div>
              )}
              <button
                className="ms-drawer-execute"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}
                onClick={handleExecute}
                disabled={executeLoading}
              >
                {executeLoading
                  ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 16 }}>progress_activity</span>
                  : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
                }
                {executeLoading ? 'Opening...' : 'Write in Content Studio'}
              </button>
            </div>
          )}

          {/* ── Carousel: generate multiple slides ── */}
          {canCarousel && (
            <div>
              <div className="ms-drawer-section-label">
                <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>view_carousel</span>
                Generate Carousel Slides
                <span style={{ fontSize: '0.65rem', opacity: 0.6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  — {carouselImages.length > 0 ? `${carouselImages.length} slides generated` : 'generates 3–4 slides'}
                </span>
              </div>

              {/* Slide count picker */}
              <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.6rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', opacity: 0.55 }}>Slides:</span>
                {[3, 4, 5].map(n => (
                  <button key={n} onClick={() => setCarouselSlideCount(n)}
                    style={{ padding: '0.2rem 0.55rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600,
                      background: carouselSlideCount === n ? 'var(--sys-primary,#FF4D00)' : 'rgba(255,255,255,0.08)',
                      border: 'none', color: carouselSlideCount === n ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                    {n}
                  </button>
                ))}
              </div>

              {/* Generated slides preview strip */}
              {carouselImages.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem', overflowX: 'auto', paddingBottom: 4 }}>
                  {carouselImages.map((url, i) => (
                    <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                      <img src={url} alt={`Slide ${i+1}`}
                        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8,
                          border: '2px solid rgba(255,255,255,0.15)' }} />
                      <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, textAlign: 'center',
                        fontSize: '0.6rem', color: '#fff', background: 'rgba(0,0,0,0.5)', borderRadius: '0 0 6px 6px' }}>
                        {i + 1}
                      </div>
                    </div>
                  ))}
                  {carouselLoading && (
                    <div style={{ width: 72, height: 72, borderRadius: 8, background: 'rgba(255,255,255,0.05)',
                      border: '2px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 18, opacity: 0.5 }}>progress_activity</span>
                    </div>
                  )}
                </div>
              )}

              {carouselError && (
                <div className="ms-error" style={{ marginBottom: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                  {carouselError}
                </div>
              )}

              <button
                className="ms-drawer-execute"
                style={carouselImages.length > 0
                  ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }
                  : undefined
                }
                onClick={handleGenerateCarousel}
                disabled={carouselLoading || refUploading}
              >
                {carouselLoading
                  ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 16 }}>progress_activity</span>
                  : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{carouselImages.length > 0 ? 'refresh' : 'auto_awesome'}</span>
                }
                {carouselLoading
                  ? `Generating slide ${carouselImages.length + 1}/${carouselSlideCount}...`
                  : carouselImages.length > 0 ? 'Regenerate Carousel' : `Generate ${carouselSlideCount}-slide Carousel`
                }
              </button>
            </div>
          )}

          {/* ── Inline image generation (static/story/ad) ── */}
          {canInlineImage && (
            <div>
              <div className="ms-drawer-section-label">
                Generate Visual
                <span style={{ fontSize: '0.65rem', opacity: 0.6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  — writes back to calendar automatically
                </span>
              </div>

              {/* Reference image selector */}
              <div style={{ marginBottom: '0.6rem' }}>
                <div style={{ fontSize: '0.7rem', opacity: 0.55, marginBottom: '0.35rem', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Reference Image (optional)</div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Hidden file input */}
                  <input
                    ref={refFileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleRefFileSelect}
                  />
                  <button
                    className="ms-regen-btn"
                    onClick={() => refFileInput.current?.click()}
                    disabled={refUploading}
                    style={{ fontSize: '0.72rem' }}
                  >
                    {refUploading
                      ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 13 }}>progress_activity</span>
                      : <span className="material-symbols-outlined" style={{ fontSize: 13 }}>upload</span>
                    }
                    {refUploading ? 'Uploading...' : 'Upload'}
                  </button>

                  {/* Library picker */}
                  {libraryImages.length > 0 && (
                    <div style={{ position: 'relative' }}>
                      <button
                        className="ms-regen-btn"
                        onClick={() => setLibraryOpen(o => !o)}
                        style={{ fontSize: '0.72rem' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>photo_library</span>
                        Library
                      </button>
                      {libraryOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, zIndex: 50,
                          background: 'var(--surface-2, #1c1c1e)', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, padding: '0.4rem', display: 'grid',
                          gridTemplateColumns: 'repeat(3,52px)', gap: '0.3rem', marginTop: '0.3rem',
                        }}>
                          {libraryImages.slice(0,9).map(img => (
                            <img
                              key={img._id}
                              src={img.imageUrl}
                              alt=""
                              onClick={() => {
                                setRefImageUrl(img.imageUrl)
                                setRefImagePreview(img.imageUrl)
                                setLibraryOpen(false)
                              }}
                              style={{
                                width: 52, height: 52, objectFit: 'cover', borderRadius: 6,
                                cursor: 'pointer', border: refImageUrl === img.imageUrl ? '2px solid var(--sys-primary,#FF4D00)' : '2px solid transparent',
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview + clear */}
                  {refImagePreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <img src={refImagePreview} alt="ref" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)' }} />
                      <button onClick={clearRefImage} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
                      </button>
                    </div>
                  )}
                </div>
                {refError && <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.3rem' }}>{refError}</div>}
                {refImageUrl && !refError && (
                  <div style={{ fontSize: '0.67rem', opacity: 0.5, marginTop: '0.25rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 11, verticalAlign: 'middle' }}>check_circle</span>
                    {' '}Reference uploaded to S3 — AI will match product/style
                  </div>
                )}
              </div>

              {imageError && (
                <div className="ms-error" style={{ marginBottom: '0.5rem', margin: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>warning</span>
                  {imageError}
                </div>
              )}
              <button
                className="ms-drawer-execute"
                style={{ background: generatedImageUrl ? 'rgba(34,197,94,0.15)' : undefined, border: generatedImageUrl ? '1px solid rgba(34,197,94,0.35)' : undefined, color: generatedImageUrl ? '#22c55e' : undefined }}
                onClick={handleGenerateVisual}
                disabled={imageLoading || refUploading}
              >
                {imageLoading
                  ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 16 }}>progress_activity</span>
                  : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{generatedImageUrl ? 'refresh' : 'auto_awesome'}</span>
                }
                {imageLoading ? 'Generating...' : generatedImageUrl ? 'Regenerate Visual' : 'Generate Visual'}
              </button>
            </div>
          )}

          {/* ── Studio handoff for video/reel/email/listing content ── */}
          {!canInlineImage && !canCarousel && !canBlog && (
            <div>
              <div className="ms-drawer-section-label">
                <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 4 }}>
                  {item.contentType === 'reel' || item.contentType === 'video' || item.contentType === 'youtube' ? 'videocam'
                    : item.contentType === 'email' || item.contentType === 'whatsapp' ? 'mail'
                    : 'open_in_new'}
                </span>
                Open in Studio
              </div>
              {brief.angle && (
                <div style={{ fontSize: '0.75rem', opacity: 0.65, marginBottom: '0.6rem', lineHeight: 1.5 }}>
                  <strong>Brief:</strong> {brief.angle}
                  {brief.toneDirection && <span> · <strong>Tone:</strong> {brief.toneDirection}</span>}
                </div>
              )}
              <button
                className="ms-drawer-execute"
                style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
                onClick={handleExecute}
                disabled={executeLoading}
              >
                {executeLoading
                  ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 16 }}>progress_activity</span>
                  : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {item.contentType === 'reel' || item.contentType === 'video' ? 'videocam'
                        : item.contentType === 'email' ? 'mail'
                        : 'open_in_new'}
                    </span>
                }
                {executeLoading ? 'Opening...' : `Open in ${
                  item.targetStudio === 'video' ? 'Video Studio'
                  : item.targetStudio === 'content' ? 'Content Studio'
                  : item.targetStudio === 'creative' ? 'Creative Studio'
                  : 'Studio'
                }`}
              </button>
            </div>
          )}

          {/* ── Schedule to Brand Calendar ── */}
          <button
            className="ms-drawer-execute"
            style={{ background: 'rgba(255,77,0,0.08)', border: '1px solid rgba(255,77,0,0.25)', color: 'var(--sys-primary, #FF4D00)', marginTop: '0.5rem' }}
            onClick={() => setSchedOpen(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_add_on</span>
            Schedule to Calendar
          </button>

        </div>
      </div>

      {/* Inline Schedule Drawer */}
      <ScheduleDrawer
        open={schedOpen}
        onClose={() => setSchedOpen(false)}
        prefill={{
          caption:        brief.captionDraft || '',
          imageUrl:       generatedImageUrl || item.generatedAsset?.url || '',
          platform:       item.platform || '',
          scheduledAt:    item.date ? new Date(item.date + 'T09:00:00').toISOString() : null,
          sourceType:     'strategy',
          sourceTitle:    brief.hook || brief.angle || item.contentType || 'Monthly Strategy',
          strategyId,
          calendarItemId: item._id,
        }}
        onScheduled={() => {
          handleStatusChange('scheduled')
          setSchedOpen(false)
        }}
      />
    </div>
  )
}


// ─── Calendar Card ───────────────────────────────────────────────────────────

function DayCard({ item, onClick }) {
  const statusColor = STATUS_COLORS[item.status] || '#64748b'
  const dateStr = item.date
    ? new Date(item.date + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', weekday: 'short' })
    : item.date

  // Use content-type icon for text-based types (blog, newsletter) — they don't belong to instagram etc.
  const isBlogType = BLOG_TYPES.has(item.contentType)
  const displayIcon = isBlogType
    ? CONTENT_TYPE_ICONS[item.contentType]
    : (PLATFORM_ICONS[item.platform] || CONTENT_TYPE_ICONS[item.contentType] || 'description')
  const displayPlatform = isBlogType
    ? item.contentType  // show 'blog' / 'newsletter' instead of wrong platform
    : (item.platform || item.contentType)

  return (
    <div className="ms-day-card" onClick={() => onClick(item)} style={{ borderLeftColor: statusColor, borderLeftWidth: 3 }}>
      <div className="ms-day-card-top">
        <span className="ms-day-label">{dateStr}</span>
        <span className="ms-day-type-badge">{item.contentType}</span>
      </div>
      <div className="ms-day-card-body">
        <div className="ms-day-platform">
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
            {displayIcon}
          </span>
          {displayPlatform}
        </div>
        <div className="ms-day-angle">{item.brief?.angle || 'Brief pending'}</div>
        {item.brief?.captionDraft && (
          <div className="ms-day-caption">"{item.brief.captionDraft}"</div>
        )}
      </div>
      <div className="ms-day-card-footer">
        <div className="ms-status-dot" style={{ background: statusColor }} />
        <div className="ms-day-studio">
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
          {item.targetStudio}
        </div>
        {item.brief?.incomplete && (
          <span className="ms-incomplete-flag" title="Brief may be incomplete">
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MonthlyStrategy() {
  const { activeBrand } = useBrand()
  const { balance, costs } = useCredits()
  const now = new Date()

  // Setup state
  const [view, setView] = useState('setup') // 'setup' | 'generating' | 'result' | 'history'
  const [selectedType, setSelectedType] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  // Campaign Brief (pre-generation context)
  const [showBriefPanel, setShowBriefPanel] = useState(false)
  const [userBrief, setUserBrief]           = useState('')
  const [launchEvents, setLaunchEvents]     = useState([])  // [{name, date, type}]
  const [focusKeywords, setFocusKeywords]   = useState('')  // comma-separated string
  const [toneOverride, setToneOverride]     = useState('')
  const [kwInput, setKwInput]               = useState('')  // live tag input

  // Generation state
  const [genPhase, setGenPhase] = useState('')
  const [genTools, setGenTools] = useState([])
  const [genProgress, setGenProgress] = useState(0)
  const [genError, setGenError] = useState(null)
  const [genStartTime, setGenStartTime] = useState(null)
  const [thinkingExpanded, setThinkingExpanded] = useState(true)

  // Credit confirmation modal
  const [showCreditModal, setShowCreditModal] = useState(false)

  // Result state
  const [strategy, setStrategy] = useState(null)
  const [calendarItems, setCalendarItems] = useState([])

  // Brief drawer
  const [activeItem, setActiveItem] = useState(null)

  // History
  const [historyList, setHistoryList] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // ── Batch generate all images state ──
  const [batchModel, setBatchModel]         = useState('nanobanana-2')
  const [showModelMenu, setShowModelMenu]   = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchProgress, setBatchProgress]   = useState({ done: 0, total: 0 })
  const batchPollRef = useRef(null)
  const batchJobIdRef = useRef(null)

  const abortRef    = useRef(null)
  const activeJobId = useRef(null)  // tracks current background job
  const pollTimerRef = useRef(null)

  const { trackJob, cancelJob } = useJobPoller()

  useEffect(() => {
    if (!activeBrand?._id) return
    setHistoryLoading(true)
    msAPI.list({ brandId: activeBrand._id })
      .then(r => { if (r.strategies) setHistoryList(r.strategies) })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [activeBrand?._id])

  // ── Abort any in-flight SSE stream on unmount ──
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // ── Credit check helpers ──
  const stratCost  = costs?.monthlyStrategy ?? 15
  const canAfford  = balance?.unlimited || !balance || balance.remaining >= stratCost

  // ── Date validation: prevent past month selection ──
  const isPastMonth = (() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0) // last day of selected month
    return lastDay < now
  })()

  // ── Duplicate detection: warn if same (month, year, type) already exists ──
  const existingStrategy = historyList.find(s =>
    s.month === selectedMonth && s.year === selectedYear && s.strategyType === selectedType
  )

  // ── Launch event date warnings ──
  const getEventDateWarning = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    if (d.getMonth() + 1 !== selectedMonth || d.getFullYear() !== selectedYear) {
      return `Outside ${MONTHS[selectedMonth - 1]} ${selectedYear}`
    }
    if (d < now) return 'This date is in the past'
    return null
  }

  // ── Keyword count ──
  const keywordList = focusKeywords ? focusKeywords.split(',').map(k => k.trim()).filter(Boolean) : []
  const keywordLimitReached = keywordList.length >= MAX_KEYWORDS

  // ── Open credit confirmation modal ──
  const handleGenerateClick = () => {
    if (!activeBrand?._id || !selectedType) return
    if (isPastMonth) {
      setGenError('Cannot generate strategy for a past month. Please select the current or a future month.')
      return
    }
    setShowCreditModal(true)
  }

  // ── Generate via fire-and-forget background job ──
  const handleGenerate = useCallback(async () => {
    setShowCreditModal(false)
    if (!activeBrand?._id || !selectedType) return
    setView('generating')
    setGenError(null)
    setGenTools([])
    setGenPhase('Submitting to server...')
    setGenProgress(5)
    setGenStartTime(Date.now())
    setThinkingExpanded(true)

    try {
      // POST returns immediately with jobId — no streaming needed
      const res = await msAPI.startJob({
        brandId:      activeBrand._id,
        strategyType: selectedType,
        month:        selectedMonth,
        year:         selectedYear,
        userBrief:    userBrief.trim() || undefined,
        launchEvents: launchEvents.length ? launchEvents : undefined,
        focusKeywords: focusKeywords ? focusKeywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
        toneOverride: toneOverride || undefined,
      })

      if (!res?.jobId) throw new Error(res?.error || 'Failed to start job')

      const { jobId, label } = res
      activeJobId.current = jobId

      // Register with global poller (persists across refreshes)
      trackJob({
        jobId,
        type:      'monthly-strategy',
        label:     label || `${MONTHS[selectedMonth - 1]} ${selectedYear} strategy`,
        page:      '/brainstorm',
        brandName: activeBrand.name,
      })

      setGenPhase('Strategy is running on our servers...')
      setGenProgress(10)

      // ── Poll this job for live step updates ──
      const startPolling = () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current)
        pollTimerRef.current = setInterval(async () => {
          try {
            const data = await jobsAPI.status(jobId)
            const j = data?.job
            if (!j) return

            // Update steps from DB — extract rich metadata for thinking UI
            if (j.steps?.length) {
              const latestStep = j.steps[j.steps.length - 1]
              setGenPhase(latestStep.message || genPhase)
              const done = j.steps.filter(s => s.status === 'done').length
              setGenProgress(Math.min(90, 10 + (done / Math.max(j.steps.length, 1)) * 80))
              setGenTools(j.steps.map(s => ({
                tool: s.tool || s.agent || '',
                label: s.message,
                detail: s.detail || '',
                status: s.status === 'done' ? 'done' : s.status === 'error' ? 'error' : 'active',
                timestamp: s.ts,
              })))
            }

            if (j.status === 'completed') {
              clearInterval(pollTimerRef.current)
              activeJobId.current = null
              setGenProgress(100)
              setGenPhase('Strategy ready!')
              // Load the strategy
              if (j.result?.strategyId) {
                const r = await msAPI.get(j.result.strategyId)
                if (r?.strategy) {
                  setStrategy(r.strategy)
                  setCalendarItems(r.strategy.calendar || [])
                  setHistoryList(prev => [r.strategy, ...prev.filter(s => s._id !== r.strategy._id)])
                  setView('result')
                }
              }
            }
            if (j.status === 'failed') {
              clearInterval(pollTimerRef.current)
              activeJobId.current = null
              setGenError(j.errorMessage || 'Strategy generation failed.')
              setView('setup')
            }
            if (j.status === 'cancelled') {
              clearInterval(pollTimerRef.current)
              activeJobId.current = null
              setView('setup')
            }
          } catch { /* network hiccup — keep polling */ }
        }, 4000)
      }
      startPolling()

    } catch (err) {
      setGenError(err.message || 'Failed to start strategy generation.')
      setView('setup')
    }
  }, [activeBrand, selectedType, selectedMonth, selectedYear, userBrief, launchEvents, focusKeywords, toneOverride, trackJob])

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }, [])

  // ── Elapsed time ticker — forces re-render every second while generating ──
  const [, forceRender] = useState(0)
  useEffect(() => {
    if (view !== 'generating' || !genStartTime) return
    const id = setInterval(() => forceRender(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [view, genStartTime])

  // ── Stop/cancel current job ──
  const handleStopGeneration = useCallback(async () => {
    if (!activeJobId.current) return
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    await cancelJob(activeJobId.current).catch(() => {})
    activeJobId.current = null
    setView('setup')
  }, [cancelJob])

  // ── Load existing strategy from history ──
  const loadStrategy = useCallback(async (id) => {
    try {
      const res = await msAPI.get(id)
      if (res?.strategy) {
        setStrategy(res.strategy)
        setCalendarItems(res.strategy.calendar || [])
        setView('result')
      }
    } catch {}
  }, [])

  // ── Delete strategy ──
  const deleteStrategy = useCallback(async (id, e) => {
    e.stopPropagation()
    try {
      await msAPI.delete(id)
      setHistoryList(prev => prev.filter(s => s._id !== id))
    } catch {}
  }, [])

  // ── Batch generate all calendar images ──
  const handleBatchGenerate = useCallback(async () => {
    if (!strategy?._id || batchGenerating) return
    setBatchGenerating(true)
    const pending = calendarItems.filter(it => it.status === 'pending' && (it.targetStudio === 'creative' || !it.targetStudio))
    setBatchProgress({ done: 0, total: pending.length })
    try {
      const data = await msAPI.batchGenerate(strategy._id, { imageModel: batchModel })
      if (data?.batchId) {
        batchJobIdRef.current = data.batchId
        let pollCount = 0
        batchPollRef.current = setInterval(async () => {
          try {
            const status = await jobsAPI.status(data.batchId)
            const j = status?.job || status
            if (j?.metadata?.completedItems !== undefined) {
              setBatchProgress({ done: j.metadata.completedItems, total: j.metadata.totalItems || pending.length })
            }
            if (j?.status === 'completed' || j?.status === 'failed' || pollCount > 120) {
              clearInterval(batchPollRef.current)
              setBatchGenerating(false)
              // Reload strategy to get updated assets
              const r = await msAPI.get(strategy._id)
              if (r?.strategy) {
                setStrategy(r.strategy)
                setCalendarItems(r.strategy.calendar || [])
              }
            }
            pollCount++
          } catch { pollCount++ }
        }, 5000)
      } else {
        setBatchGenerating(false)
      }
    } catch (err) {
      console.error('[batch-generate]', err)
      setBatchGenerating(false)
    }
  }, [strategy?._id, batchGenerating, batchModel, calendarItems])

  // ── Stop/cancel batch generation ──
  const handleStopBatch = useCallback(async () => {
    if (batchPollRef.current) {
      clearInterval(batchPollRef.current)
      batchPollRef.current = null
    }
    if (batchJobIdRef.current) {
      try { await jobsAPI.cancel(batchJobIdRef.current) } catch {}
      batchJobIdRef.current = null
    }
    setBatchGenerating(false)
    setBatchProgress({ done: 0, total: 0 })
    // Reload strategy to get any images generated before stopping
    if (strategy?._id) {
      try {
        const r = await msAPI.get(strategy._id)
        if (r?.strategy) { setStrategy(r.strategy); setCalendarItems(r.strategy.calendar || []) }
      } catch {}
    }
  }, [strategy?._id])

  // Cleanup batch poll on unmount
  useEffect(() => () => { if (batchPollRef.current) clearInterval(batchPollRef.current) }, [])

  // ── Status change from drawer ──
  const handleStatusChange = useCallback((itemId, status) => {
    setCalendarItems(prev => prev.map(it => it._id === itemId ? { ...it, status } : it))
  }, [])

  // ── Asset writeback from inline generation or studio return ──
  const handleAssetWriteback = useCallback((itemId, asset) => {
    setCalendarItems(prev => prev.map(it =>
      it._id === itemId
        ? { ...it, generatedAsset: asset, status: asset.status || it.status }
        : it
    ))
  }, [])

  // ── Stats ──
  const stats = calendarItems.reduce((acc, it) => {
    acc[it.status || 'pending'] = (acc[it.status || 'pending'] || 0) + 1
    return acc
  }, {})

  // ── Progress estimate for generating view ──
  const totalTools = genTools.length || 1
  const doneTools  = genTools.filter(t => t.status === 'done').length
  const progress   = genProgress || Math.min(90, (doneTools / totalTools) * 90)

  const monthName = MONTHS[selectedMonth - 1]

  // ─── No brand ──────────────────────────────────────────────────────────
  if (!activeBrand) {
    return (
      <div className="ms-root">
        <div className="ms-empty">
          <span className="material-symbols-outlined ms-empty-icon">label</span>
          <div className="ms-empty-title">Select a brand to get started</div>
          <div className="ms-empty-sub">Choose a brand from the top bar, then generate your monthly strategy.</div>
        </div>
      </div>
    )
  }

  if (view === 'generating') {
    const elapsedSec = genStartTime ? ((Date.now() - genStartTime) / 1000).toFixed(1) : '0.0'

    // Deduplicate steps: keep last occurrence per tool key (done > working)
    const deduped = []
    const seen = new Map()
    for (const step of genTools) {
      const key = step.tool || step.label
      if (seen.has(key)) {
        // Replace if the new status is "done" (upgrade) or if same tool is re-emitted
        const idx = seen.get(key)
        if (step.status === 'done' || deduped[idx].status !== 'done') {
          deduped[idx] = step
        }
      } else {
        seen.set(key, deduped.length)
        deduped.push(step)
      }
    }

    const isActive = genProgress < 100

    return (
      <div className="ms-root">
        <div className="ms-generating">
          {/* Header */}
          <div className="ms-thinking-header">
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--sys-primary, #FF4D00)' }}>
              {STRATEGY_TYPES.find(t => t.id === selectedType)?.msIcon || 'psychology'}
            </span>
            <div>
              <div className="ms-thinking-title">
                Building {STRATEGY_TYPES.find(t => t.id === selectedType)?.label || 'Strategy'}
              </div>
              <div className="ms-thinking-subtitle">
                30-day calendar for {activeBrand.name}
              </div>
            </div>
          </div>

          {/* Thinking panel */}
          <div className="ms-thinking-panel">
            <button className="ms-thinking-toggle" onClick={() => setThinkingExpanded(e => !e)}>
              <span className={`ms-thinking-indicator ${isActive ? 'active' : 'done'}`}>
                {isActive ? (
                  <span className="ms-thinking-spinner" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                )}
              </span>
              <span className="ms-thinking-label">
                {isActive ? 'Thinking...' : `Completed in ${elapsedSec}s`}
              </span>
              <span className="ms-thinking-elapsed">{isActive ? `${elapsedSec}s` : ''}</span>
              <span className="material-symbols-outlined ms-thinking-chevron" style={{ fontSize: 16 }}>
                {thinkingExpanded ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            <div className={`ms-thinking-body ${thinkingExpanded ? 'open' : ''}`}>
              <div className="ms-thinking-steps">
                {deduped.map((step, i) => (
                  <div key={i} className={`ms-thinking-step ${step.status}`} style={{ animationDelay: `${i * 60}ms` }}>
                    <div className="ms-thinking-step-main">
                      <span className="ms-thinking-step-icon">
                        {step.status === 'done' ? (
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22c55e' }}>check_circle</span>
                        ) : step.status === 'error' ? (
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#ef4444' }}>error</span>
                        ) : (
                          <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 14, color: 'var(--sys-primary, #FF4D00)' }}>progress_activity</span>
                        )}
                      </span>
                      <span className="ms-thinking-step-text">{step.label}</span>
                      {i === deduped.length - 1 && isActive && step.status !== 'done' && (
                        <span className="ms-thinking-pulse" />
                      )}
                    </div>
                    {step.detail && (
                      <div className="ms-thinking-step-detail">
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>search</span>
                        {step.detail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="ms-progress-track" style={{ width: '100%', maxWidth: 440 }}>
            <div className="ms-progress-fill" style={{ width: `${progress}%` }} />
          </div>

          {/* Persist notice */}
          <div className="ms-thinking-notice">
            <span style={{ fontSize: 14, marginRight: 4 }}>🔒</span>
            This is running on our servers. You can safely close this tab or refresh — we'll notify you via the bell when it's done.
          </div>

          {/* Stop button */}
          <button className="ms-thinking-stop" onClick={handleStopGeneration}>
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>stop_circle</span>
            Stop Generation
          </button>
        </div>
      </div>
    )
  }

  // ─── Result ───────────────────────────────────────────────────────────────
  if (view === 'result' && strategy) {
    const typeInfo = STRATEGY_TYPES.find(t => t.id === strategy.strategyType) || {}
    const monthLabel = `${MONTHS[(strategy.month || 1) - 1]} ${strategy.year}`

    return (
      <div className="ms-root">
        {/* Header */}
        <div className="ms-result-header">
          <div>
            <div className="ms-result-title">
              {typeInfo.msIcon && (
                <span className="material-symbols-outlined" style={{ fontSize: 16, opacity: 0.7 }}>{typeInfo.msIcon}</span>
              )}
              {typeInfo.label} — {monthLabel}
              {strategy.version > 1 && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>v{strategy.version}</span>}
            </div>
            <div className="ms-result-meta">
              <span>{activeBrand.name}</span>
              <span>·</span>
              <span>{calendarItems.length} items</span>
              {strategy.brandSpecificityWarning && (
                <span className="ms-warn-badge">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                  Review brand specificity
                </span>
              )}
            </div>
          </div>
          <div className="ms-result-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Model selector + Generate All */}
            {calendarItems.filter(it => it.status === 'pending' && (!it.targetStudio || it.targetStudio === 'creative')).length > 0 && (
              <>
                {/* Model dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    className="ms-btn-ghost"
                    onClick={() => setShowModelMenu(v => !v)}
                    style={{ fontSize: '0.75rem', gap: '0.3rem' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
                    {IMAGE_MODELS.find(m => m.id === batchModel)?.name || 'Model'}
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>expand_more</span>
                  </button>
                  {showModelMenu && (
                    <div style={{
                      position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 4,
                      background: 'var(--surface-2, #1c1c1e)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 10, padding: '0.35rem', minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    }}>
                      {IMAGE_MODELS.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { setBatchModel(m.id); setShowModelMenu(false) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                            padding: '0.45rem 0.6rem', background: batchModel === m.id ? 'rgba(255,77,0,0.12)' : 'none',
                            border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: batchModel === m.id ? 'var(--sys-primary,#FF4D00)' : 'rgba(255,255,255,0.9)' }}>{m.name}</div>
                            <div style={{ fontSize: '0.65rem', opacity: 0.55, color: 'rgba(255,255,255,0.7)' }}>{m.desc}</div>
                          </div>
                          {batchModel === m.id && <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--sys-primary,#FF4D00)' }}>check</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Generate All button */}
                <button
                  className="ms-btn-primary"
                  onClick={handleBatchGenerate}
                  disabled={batchGenerating}
                  style={{ gap: '0.35rem', fontSize: '0.8rem' }}
                >
                  {batchGenerating
                    ? <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 14 }}>progress_activity</span>
                    : <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                  }
                  {batchGenerating
                    ? `Generating ${batchProgress.done}/${batchProgress.total}...`
                    : `Generate All Images (${calendarItems.filter(it => it.status === 'pending' && (!it.targetStudio || it.targetStudio === 'creative')).length})`
                  }
                </button>
              </>
            )}

            <button className="ms-btn-ghost" onClick={() => setView('history')}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>history</span>
              History
            </button>
            <button className="ms-btn-primary" onClick={() => { setStrategy(null); setView('setup') }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
              New
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="ms-progress-bar">
          {[
            { label: 'Pending',     key: 'pending',     dot: 'pending'   },
            { label: 'In Progress', key: 'in_progress', dot: 'progress'  },
            { label: 'Complete',    key: 'complete',    dot: 'complete'  },
            { label: 'Published',   key: 'published',   dot: 'published' },
          ].map(s => (
            <div key={s.key} className="ms-stat">
              <div className={`ms-stat-dot ${s.dot}`} />
              <span>{stats[s.key] || 0} {s.label}</span>
            </div>
          ))}
        </div>

        {/* Batch generation progress banner */}
        {batchGenerating && (
          <div style={{
            margin: '0.75rem 0', padding: '0.75rem 1rem',
            background: 'rgba(255,77,0,0.08)', border: '1px solid rgba(255,77,0,0.2)',
            borderRadius: 12, display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <span className="material-symbols-outlined ms-chip-spin" style={{ fontSize: 18, color: 'var(--sys-primary,#FF4D00)' }}>progress_activity</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--sys-primary,#FF4D00)' }}>
                Generating calendar images with {IMAGE_MODELS.find(m => m.id === batchModel)?.name}…
              </div>
              <div style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: 2 }}>
                {batchProgress.done} of {batchProgress.total} complete — you'll be notified when done
              </div>
              <div style={{ marginTop: 6, height: 3, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, background: 'var(--sys-primary,#FF4D00)',
                  width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 5}%`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>
            <button
              onClick={handleStopBatch}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.45rem 0.85rem', borderRadius: 8,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontSize: '0.75rem', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
              onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)' }}
              onMouseOut={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>stop_circle</span>
              Stop
            </button>
          </div>
        )}

        {/* Summary */}
        {strategy.summary && (
          <div className="ms-summary">"{strategy.summary}"</div>
        )}

        {/* Calendar grid */}
        <div className="ms-calendar-scroll">
          <div className="ms-calendar-grid">
            {calendarItems.map(item => (
              <DayCard key={item._id} item={item} onClick={setActiveItem} />
            ))}
          </div>
        </div>

        {/* Brief drawer */}
        {activeItem && (
          <BriefDrawer
            item={activeItem}
            strategyId={strategy._id}
            onClose={() => setActiveItem(null)}
            onStatusChange={handleStatusChange}
            onAssetWriteback={handleAssetWriteback}
          />
        )}
      </div>
    )
  }

  // ─── History ──────────────────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <div className="ms-root">
        <div className="ms-history">
          <div className="ms-history-header">
            <div className="ms-history-title">Past Strategies</div>
            <button className="ms-btn-ghost" onClick={() => setView('setup')}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
              New
            </button>
          </div>

          {historyList.length === 0 && (
            <div className="ms-empty">
              <span className="material-symbols-outlined ms-empty-icon">inbox</span>
              <div className="ms-empty-title">No strategies yet</div>
              <div className="ms-empty-sub">Generate your first monthly strategy.</div>
            </div>
          )}

          {historyList.map(s => {
            const t = STRATEGY_TYPES.find(x => x.id === s.strategyType) || {}
            return (
              <div key={s._id} className="ms-history-item" onClick={() => loadStrategy(s._id)}>
                <div>
                  <div className="ms-history-item-label">
                    {t.msIcon && <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>{t.msIcon}</span>}
                    {t.label} — {MONTHS[(s.month||1)-1]} {s.year}
                  </div>
                  <div className="ms-history-item-meta">
                    {s.calendar?.length || 0} items · v{s.version || 1} · {s.status}
                  </div>
                </div>
                <button className="ms-history-del" onClick={e => deleteStrategy(s._id, e)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="ms-root">
        <div className="ms-setup">
          <div className="ms-setup-header">
            <div className="ms-setup-title">Monthly Strategy Engine</div>
            <div className="ms-setup-sub">AI-powered 30-day content calendar with execution briefs for every item</div>
            <div className="ms-credit-badge">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>bolt</span>
              <CreditBadge action="monthlyStrategy" />
            </div>
          </div>

        {/* Error */}
        {genError && (
          <div className="ms-error">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
            {genError}
          </div>
        )}

        {/* Strategy type */}
        <div>
          <div className="ms-drawer-section-label" style={{ marginBottom: '0.6rem' }}>Strategy Type</div>
          <div className="ms-type-grid">
            {STRATEGY_TYPES.map(t => (
              <button
                key={t.id}
                className={`ms-type-card ${selectedType === t.id ? 'selected' : ''}`}
                onClick={() => setSelectedType(t.id)}
              >
                <div className="ms-type-icon">
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{t.msIcon}</span>
                </div>
                <div>
                  <div className="ms-type-label">{t.label}</div>
                  <div className="ms-type-desc">{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Month + Year */}
        <div>
          <div className="ms-drawer-section-label" style={{ marginBottom: '0.6rem' }}>Target Month</div>
          <div className="ms-month-row">
            <select
              className="ms-select"
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => {
                const monthNum = i + 1
                const lastDay = new Date(selectedYear, monthNum, 0)
                const disabled = lastDay < now
                return (
                  <option key={m} value={monthNum} disabled={disabled}>
                    {m}{disabled ? ' (past)' : ''}
                  </option>
                )
              })}
            </select>
            <select
              className="ms-select"
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
            >
              {[now.getFullYear(), now.getFullYear() + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {isPastMonth && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
              {MONTHS[selectedMonth - 1]} {selectedYear} has already passed. Select the current or a future month.
            </div>
          )}
        </div>

        {/* ── Campaign Brief Panel ── */}
        <div>
          <button
            className="ms-btn-ghost"
            style={{ alignSelf: 'flex-start', borderColor: showBriefPanel ? 'var(--sys-primary,#FF4D00)' : undefined, color: showBriefPanel ? 'var(--sys-primary,#FF4D00)' : undefined }}
            onClick={() => setShowBriefPanel(v => !v)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {showBriefPanel ? 'expand_less' : 'add'}
            </span>
            {showBriefPanel ? 'Hide Brief' : 'Brief Your Campaign'}
            {(userBrief || launchEvents.length || focusKeywords || toneOverride) && (
              <span style={{ marginLeft: 6, fontSize: '0.65rem', background: 'rgba(255,77,0,0.15)', color: 'var(--sys-primary,#FF4D00)', borderRadius: 99, padding: '1px 6px' }}>
                {[userBrief && '📝', launchEvents.length && `${launchEvents.length} events`, focusKeywords && 'keywords', toneOverride && 'tone'].filter(Boolean).join(' · ')}
              </span>
            )}
          </button>

          {showBriefPanel && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '1rem' }}>

              {/* Free-form brief */}
              <div>
                <div className="ms-drawer-section-label" style={{ marginBottom: '0.4rem' }}>
                  Campaign Brief
                  <span style={{ fontSize: '0.62rem', opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>optional — context, goals, things to avoid</span>
                </div>
                <textarea
                  className="ms-regen-input"
                  style={{ minHeight: 72, resize: 'vertical', width: '100%', fontFamily: 'inherit' }}
                  placeholder="e.g. We're launching our new protein powder in 3 flavours. Focus on gym culture, avoid price comparisons. Push 30-day transformation messaging."
                  value={userBrief}
                  maxLength={MAX_BRIEF_LENGTH}
                  onChange={e => setUserBrief(e.target.value.slice(0, MAX_BRIEF_LENGTH))}
                />
                <div style={{ textAlign: 'right', fontSize: '0.65rem', marginTop: '0.2rem', color: userBrief.length > MAX_BRIEF_LENGTH - 200 ? '#ef4444' : 'rgba(255,255,255,0.35)' }}>
                  {userBrief.length} / {MAX_BRIEF_LENGTH}
                </div>
              </div>

              {/* Launch Events */}
              <div>
                <div className="ms-drawer-section-label" style={{ marginBottom: '0.4rem' }}>
                  Launch Events
                  <span style={{ fontSize: '0.62rem', opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>AI will anchor posts on these dates ±3 days</span>
                </div>
                {launchEvents.map((ev, i) => {
                  const dateWarn = getEventDateWarning(ev.date)
                  return (
                    <div key={i} style={{ marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          className="ms-regen-input"
                          style={{ flex: 2, minWidth: 120 }}
                          placeholder="Event / Product name"
                          value={ev.name}
                          maxLength={200}
                          onChange={e => setLaunchEvents(prev => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                        />
                        <input
                          type="date"
                          className="ms-regen-input"
                          style={{ flex: 1, minWidth: 110, borderColor: dateWarn ? 'rgba(239,68,68,0.5)' : undefined }}
                          value={ev.date}
                          onChange={e => setLaunchEvents(prev => prev.map((x, idx) => idx === i ? { ...x, date: e.target.value } : x))}
                        />
                        <select
                          className="ms-select"
                          style={{ flex: 0, minWidth: 90, fontSize: '0.72rem' }}
                          value={ev.type}
                          onChange={e => setLaunchEvents(prev => prev.map((x, idx) => idx === i ? { ...x, type: e.target.value } : x))}
                        >
                          {['product','campaign','sale','collab','event'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <button
                          onClick={() => setLaunchEvents(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: '2px 4px' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                        </button>
                      </div>
                      {dateWarn && (
                        <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                          {dateWarn}
                        </div>
                      )}
                    </div>
                  )
                })}
                <button
                  className="ms-regen-btn"
                  onClick={() => setLaunchEvents(prev => [...prev, { name: '', date: '', type: 'product' }])}
                  disabled={launchEvents.length >= MAX_LAUNCH_EVENTS}
                  style={{ fontSize: '0.72rem', opacity: launchEvents.length >= MAX_LAUNCH_EVENTS ? 0.4 : 1 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span>
                  Add Event{launchEvents.length > 0 ? ` (${launchEvents.length}/10)` : ''}
                </button>
              </div>

              {/* Focus Keywords */}
              <div>
                <div className="ms-drawer-section-label" style={{ marginBottom: '0.4rem' }}>
                  Focus Keywords
                  <span style={{ fontSize: '0.62rem', opacity: 0.5, fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>comma-separated — must appear in captions</span>
                </div>
                <input
                  className="ms-regen-input"
                  placeholder={keywordLimitReached ? `Max ${MAX_KEYWORDS} keywords reached` : 'e.g. protein, gym, transformation, clean label'}
                  value={focusKeywords}
                  disabled={keywordLimitReached}
                  onChange={e => {
                    const val = e.target.value
                    const count = val.split(',').map(k => k.trim()).filter(Boolean).length
                    if (count <= MAX_KEYWORDS) setFocusKeywords(val)
                  }}
                />
                {focusKeywords && (
                  <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {keywordList.map(k => (
                      <span key={k} style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.07)', borderRadius: 99, padding: '2px 8px', color: 'rgba(255,255,255,0.7)' }}>{k}</span>
                    ))}
                    <span style={{ fontSize: '0.62rem', color: keywordLimitReached ? '#f59e0b' : 'rgba(255,255,255,0.35)', marginLeft: 4 }}>
                      {keywordList.length}/{MAX_KEYWORDS}
                    </span>
                  </div>
                )}
              </div>

              {/* Tone Override */}
              <div>
                <div className="ms-drawer-section-label" style={{ marginBottom: '0.4rem' }}>Tone Override</div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {['', 'Aggressive', 'Inspirational', 'Educational', 'Luxury', 'Playful', 'Empathetic'].map(t => (
                    <button
                      key={t}
                      onClick={() => setToneOverride(t)}
                      className="ms-regen-btn"
                      style={{
                        fontSize: '0.72rem',
                        background: toneOverride === t ? 'rgba(255,77,0,0.15)' : undefined,
                        borderColor: toneOverride === t ? 'var(--sys-primary,#FF4D00)' : undefined,
                        color: toneOverride === t ? 'var(--sys-primary,#FF4D00)' : undefined,
                      }}
                    >
                      {t || 'Brand Default'}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* History shortcut */}
        {historyList.length > 0 && (
          <button className="ms-btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setView('history')}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>history</span>
            View {historyList.length} past strateg{historyList.length === 1 ? 'y' : 'ies'}
          </button>
        )}

        {/* Generate */}
        <CreditTooltipWrapper action="monthlyStrategy" position="top">
          <button
            className="ms-btn-generate"
            disabled={!selectedType || !activeBrand || isPastMonth}
            onClick={handleGenerateClick}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_month</span>
            Generate {monthName} {selectedYear} Strategy
            <CreditBadge action="monthlyStrategy" />
          </button>
        </CreditTooltipWrapper>
      </div>
    </div>

    {/* ── Credit Confirmation Modal ── */}
    {showCreditModal && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        onClick={() => setShowCreditModal(false)}
      >
        <div
          style={{ background: 'var(--sys-surface-container)', border: '1px solid var(--sys-border)', borderRadius: 20, padding: '32px 28px', maxWidth: 400, width: '100%', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#818cf8' }}>calendar_month</span>
            </div>
            <div>
              <div style={{ color: 'var(--sys-text)', fontWeight: 700, fontSize: 16 }}>Generate Monthly Strategy</div>
              <div style={{ color: 'var(--sys-text-muted)', fontSize: 12, marginTop: 2 }}>
                {STRATEGY_TYPES.find(t => t.id === selectedType)?.label} · {monthName} {selectedYear}
              </div>
            </div>
          </div>

          {/* Duplicate strategy warning */}
          {existingStrategy && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px',
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 10, marginBottom: 16, fontSize: 12
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f59e0b', flexShrink: 0, marginTop: 1 }}>info</span>
              <span style={{ color: '#f59e0b' }}>
                You already have a <strong>{STRATEGY_TYPES.find(t => t.id === selectedType)?.label}</strong> strategy for <strong>{monthName} {selectedYear}</strong> (v{existingStrategy.version || 1}).
                Generating will create a new version.
              </span>
            </div>
          )}

          {/* Cost breakdown */}
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: 'var(--sys-text-muted)', fontSize: 13 }}>Strategy generation</span>
              <span style={{ color: '#818cf8', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>toll</span>
                {balance?.unlimited ? '∞ (included)' : `${stratCost} credits`}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(99,102,241,0.15)' }}>
              <span style={{ color: 'var(--sys-text-muted)', fontSize: 12 }}>Includes: Research + 30-day calendar + all briefs</span>
            </div>
          </div>

          {/* Balance status */}
          {!balance?.unlimited && balance && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: canAfford ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${canAfford ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              borderRadius: 10, marginBottom: 20, fontSize: 12
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: canAfford ? '#10b981' : '#ef4444' }}>
                {canAfford ? 'check_circle' : 'warning'}
              </span>
              <span style={{ color: canAfford ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {canAfford
                  ? `${balance.remaining} credits available — sufficient`
                  : `Only ${balance.remaining} credits remaining — need ${stratCost}`
                }
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowCreditModal(false)}
              style={{ flex: 1, padding: '11px 0', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--sys-border)', color: 'var(--sys-text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={!canAfford}
              style={{
                flex: 2, padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 13, cursor: canAfford ? 'pointer' : 'not-allowed',
                background: canAfford ? 'var(--sys-primary)' : 'rgba(99,102,241,0.2)',
                border: 'none', color: canAfford ? 'var(--sys-text)' : 'var(--sys-text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: canAfford ? 1 : 0.6,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
              {canAfford ? 'Confirm & Generate' : 'Insufficient Credits'}
            </button>
          </div>

          {!canAfford && (
            <p style={{ textAlign: 'center', color: 'var(--sys-text-muted)', fontSize: 11, marginTop: 12 }}>
              <a href="/credits" style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}>Top up credits →</a>
            </p>
          )}
        </div>
      </div>
    )}
    </>
  )
}

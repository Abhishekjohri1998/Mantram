import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import { creatives as creativesAPI, agents as agentsAPI, products as productsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import VoiceInput from '../components/VoiceInput'

export default function CreativeStudio() {
    const { brands, activeBrand, selectBrand } = useBrand()
    const [searchParams, setSearchParams] = useSearchParams()
    const [selectedType, setSelectedType] = useState('instagram-post')
    const [prompt, setPrompt] = useState('')
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [showProductPicker, setShowProductPicker] = useState(false)
    const [productsList, setProductsList] = useState([])
    const [generating, setGenerating] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [feedbackState, setFeedbackState] = useState(null)  // 'liked' | 'disliked' | 'accepted'
    const [feedbackToast, setFeedbackToast] = useState('')
    const [style, setStyle] = useState('modern')
    const [textOverlay, setTextOverlay] = useState('')
    const [fromContent, setFromContent] = useState(false)

    // Studio mode: 'design', 'photoshoot', 'templates', or 'imagebank'
    const [studioMode, setStudioMode] = useState('design')

    // AI Photoshoot state
    const [productImage, setProductImage] = useState(null)
    const [productFile, setProductFile] = useState(null)
    const [sceneKeywords, setSceneKeywords] = useState([])
    const [photoshootBrief, setPhotoshootBrief] = useState('')
    const [photoshootGenerating, setPhotoshootGenerating] = useState(false)
    const [photoshootResult, setPhotoshootResult] = useState(null)
    const [photoshootError, setPhotoshootError] = useState('')
    const [photoshootSaved, setPhotoshootSaved] = useState(false)
    const [fidelity, setFidelity] = useState(80)

    // Image Bank state
    const [bankImages, setBankImages] = useState([])
    const [bankLoading, setBankLoading] = useState(false)
    const [bankTotal, setBankTotal] = useState(0)

    // Photoshoot image passed to design mode
    const [designBaseImage, setDesignBaseImage] = useState(null)

    // ── NEW: Reference Images (style / character / upload) ──
    const [referenceImages, setReferenceImages] = useState({ style: null, character: null, upload: null })

    // ── NEW: Logo Overlay ──
    const [addLogo, setAddLogo] = useState(false)
    const [logoPosition, setLogoPosition] = useState('bottom-right')
    const [logoSize, setLogoSize] = useState('medium')

    // ── NEW: Quick-start / guided mode ──
    const [showQuickStart, setShowQuickStart] = useState(true)
    const [guidedForm, setGuidedForm] = useState(null) // which template is open

    // ── Brand Templates ──
    const brandTemplates = [
        { id: 'product-showcase', icon: 'shopping_bag', label: 'Product Showcase', desc: 'Feature a product with brand styling', type: 'instagram-post', style: 'modern', promptTemplate: (b) => `Create a premium product showcase post for ${b}. Feature the product prominently with brand colors, clean layout, and a subtle call-to-action.` },
        { id: 'service-post', icon: 'design_services', label: 'Service Post', desc: 'Highlight your service offerings', type: 'instagram-post', style: 'corporate', promptTemplate: (b) => `Create an eye-catching service highlight post for ${b}. Show the key benefit, include a catchy headline, and use brand colors.` },
        { id: 'offer-sale', icon: 'local_offer', label: 'Offer / Sale', desc: 'Promotional offer creative', type: 'instagram-post', style: 'bold', promptTemplate: (b) => `Create an exciting promotional offer/sale creative for ${b}. Make the discount/offer text large and prominent, use urgency elements, brand colors, and a bold CTA.` },
        { id: 'testimonial', icon: 'format_quote', label: 'Quote / Testimonial', desc: 'Customer review or brand quote', type: 'instagram-post', style: 'elegant', promptTemplate: (b) => `Create a beautiful testimonial/quote card for ${b}. Use elegant typography, brand colors as accents, and a clean, professional layout with quotation marks.` },
        { id: 'announcement', icon: 'campaign', label: 'Announcement', desc: 'New launch or update', type: 'instagram-post', style: 'modern', promptTemplate: (b) => `Create an attention-grabbing announcement post for ${b}. Use a bold headline, excited energy, brand colors, and make it shareable.` },
        { id: 'behind-scenes', icon: 'videocam', label: 'Behind the Scenes', desc: 'Show your process & culture', type: 'instagram-story', style: 'playful', promptTemplate: (b) => `Create a behind-the-scenes story for ${b}. Make it feel authentic, warm, and personal while maintaining brand identity.` },
        { id: 'event-promo', icon: 'event', label: 'Event Promo', desc: 'Promote upcoming events', type: 'instagram-post', style: 'bold', promptTemplate: (b) => `Create an event promotional creative for ${b}. Include event details placeholder areas, date/time prominence, and exciting visual energy.` },
        { id: 'infographic', icon: 'analytics', label: 'Infographic', desc: 'Data-driven visual content', type: 'instagram-post', style: 'corporate', promptTemplate: (b) => `Create a clean infographic post for ${b}. Use brand colors for charts/icons, include placeholder data points, and make complex info visually digestible.` },
    ]

    // Quick-start categories for non-technical users
    const quickStartCards = [
        { id: 'social', icon: 'share', label: 'Social Media Post', desc: 'Instagram, Facebook, LinkedIn', color: '#6366f1' },
        { id: 'product', icon: 'inventory_2', label: 'Product Showcase', desc: 'Feature your product or service', color: '#f59e0b' },
        { id: 'promo', icon: 'local_offer', label: 'Promotional Offer', desc: 'Sales, discounts, special deals', color: '#ef4444' },
        { id: 'quote', icon: 'format_quote', label: 'Customer Quote', desc: 'Reviews and testimonials', color: '#10b981' },
        { id: 'announce', icon: 'campaign', label: 'Announcement', desc: 'Launches, updates, news', color: '#8b5cf6' },
        { id: 'story', icon: 'auto_stories', label: 'Brand Story', desc: 'Tell your brand narrative', color: '#ec4899' },
    ]

    // Read URL params from Content Studio
    useEffect(() => {
        const isFromContent = searchParams.get('fromContent')
        const contentPrompt = searchParams.get('prompt')
        const contentType = searchParams.get('type')

        if (isFromContent && contentPrompt) {
            const brandColors = activeBrand?.dna?.colors?.map(c => c.hex).join(', ') || ''
            const brandName = activeBrand?.name || ''
            const personality = activeBrand?.dna?.voice?.personality || ''

            let imagePrompt = contentPrompt
            if (brandName) imagePrompt += `. Brand: ${brandName}.`
            if (personality) imagePrompt += ` Style: ${personality}.`
            if (brandColors) imagePrompt += ` Use brand colors: ${brandColors}.`

            setPrompt(imagePrompt)
            setFromContent(true)

            if (contentType === 'celebrate' || contentType === 'promote') {
                setSelectedType('instagram-post')
            }

            setSearchParams({}, { replace: true })
        }

        // Check if coming with mode=photoshoot from Content Studio
        const mode = searchParams.get('mode')
        if (mode === 'photoshoot') {
            setStudioMode('photoshoot')
            const brief = searchParams.get('brief')
            if (brief) setPhotoshootBrief(brief)
            setSearchParams({}, { replace: true })
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Load image bank when switching to that tab
    useEffect(() => {
        if (studioMode === 'imagebank') {
            loadImageBank()
        }
    }, [studioMode, activeBrand?._id])

    const loadImageBank = async () => {
        console.log('📸 loadImageBank called, activeBrand:', activeBrand?._id, activeBrand?.name)
        setBankLoading(true)
        try {
            // Load all user images — brandId filter is optional
            const params = {}
            if (activeBrand?._id) params.brandId = activeBrand._id
            console.log('📸 Calling imageBank API with params:', params)
            const data = await creativesAPI.imageBank(params)
            console.log('📸 imageBank response:', { success: data.success, total: data.total, imageCount: data.images?.length, counts: data.counts, error: data.error })
            setBankImages(data.images || [])
            setBankTotal(data.total || 0)
        } catch (err) {
            console.error('📸 Failed to load image bank:', err)
        } finally {
            setBankLoading(false)
        }
    }

    // Auto-save photoshoot result to image bank
    const saveToImageBank = async (imageData) => {
        if (!activeBrand?._id) {
            console.warn('Cannot save to image bank: no active brand')
            return
        }
        try {
            const result = await creativesAPI.saveToBank({
                imageUrl: imageData.imageUrl,
                source: 'ai-photoshoot',
                prompt: photoshootBrief || sceneKeywords.join(', '),
                keywords: sceneKeywords,
                brandId: activeBrand._id,
                scene: sceneKeywords.join(', '),
                aiMeta: { provider: 'gemini', model: imageData.model },
            })
            if (result.success) {
                setPhotoshootSaved(true)
                console.log('✅ Image saved to bank')
            } else {
                console.error('Save to bank failed:', result.error)
            }
        } catch (err) {
            console.error('Failed to save to image bank:', err.message || err)
        }
    }

    const creativeTypes = [
        { id: 'instagram-post', icon: 'photo_camera', label: 'Instagram Post', size: '1080×1080' },
        { id: 'instagram-story', icon: 'smartphone', label: 'Story', size: '1080×1920' },
        { id: 'facebook-ad', icon: 'ads_click', label: 'Facebook Ad', size: '1200×628' },
        { id: 'linkedin-post', icon: 'work', label: 'LinkedIn Post', size: '1200×627' },
        { id: 'youtube-thumb', icon: 'smart_display', label: 'YouTube Thumb', size: '1280×720' },
        { id: 'banner', icon: 'web', label: 'Banner', size: '1920×600' },
    ]

    const styles = [
        { id: 'modern', label: 'Modern', icon: 'auto_awesome' },
        { id: 'minimal', label: 'Minimal', icon: 'format_shapes' },
        { id: 'bold', label: 'Bold', icon: 'bolt' },
        { id: 'elegant', label: 'Elegant', icon: 'diamond' },
        { id: 'playful', label: 'Playful', icon: 'mood' },
        { id: 'corporate', label: 'Corporate', icon: 'business' },
    ]

    // ── Client-side logo compositing (pixel-perfect, uses actual brand logo) ──
    const compositeLogoOnImage = (imageUrl, logoUrl, position, size) => {
        return new Promise((resolve) => {
            const img = new window.Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0)

                const logo = new window.Image()
                logo.crossOrigin = 'anonymous'
                logo.onload = () => {
                    // Calculate logo size
                    const pct = size === 'small' ? 0.08 : size === 'large' ? 0.2 : 0.12
                    const maxW = canvas.width * pct
                    const scale = maxW / logo.width
                    const lw = logo.width * scale
                    const lh = logo.height * scale
                    const pad = canvas.width * 0.03 // 3% padding from edges

                    // Position mapping
                    const posMap = {
                        'top-left': [pad, pad],
                        'top-center': [(canvas.width - lw) / 2, pad],
                        'top-right': [canvas.width - lw - pad, pad],
                        'center-left': [pad, (canvas.height - lh) / 2],
                        'center': [(canvas.width - lw) / 2, (canvas.height - lh) / 2],
                        'center-right': [canvas.width - lw - pad, (canvas.height - lh) / 2],
                        'bottom-left': [pad, canvas.height - lh - pad],
                        'bottom-center': [(canvas.width - lw) / 2, canvas.height - lh - pad],
                        'bottom-right': [canvas.width - lw - pad, canvas.height - lh - pad],
                    }
                    const [x, y] = posMap[position] || posMap['bottom-right']

                    ctx.drawImage(logo, x, y, lw, lh)
                    resolve(canvas.toDataURL('image/png'))
                }
                logo.onerror = () => resolve(imageUrl) // fallback to original if logo fails
                logo.src = logoUrl
            }
            img.onerror = () => resolve(imageUrl)
            img.src = imageUrl
        })
    }

    const handleGenerate = async () => {
        if (!prompt.trim() || !activeBrand) return
        setGenerating(true)
        setError('')
        setResult(null)
        setFeedbackState(null)
        setFeedbackToast('')
        setShowQuickStart(false)

        try {
            let fullPrompt = prompt
            const options = {
                style,
                textOverlay,
                referenceImages,
                addLogo,
                logoPosition,
                logoSize,
            }
            if (designBaseImage) {
                options.baseImage = designBaseImage
                if (!fullPrompt.toLowerCase().includes('photoshoot') && !fullPrompt.toLowerCase().includes('product')) {
                    fullPrompt = `Using the provided product photoshoot image as the base: ${fullPrompt}`
                }
            }

            // Inject selected product context
            if (selectedProduct) {
                fullPrompt += `\n\nPRODUCT CONTEXT: ${selectedProduct.title}`
                if (selectedProduct.description) fullPrompt += ` - ${selectedProduct.description}`
                if (selectedProduct.features?.length) fullPrompt += `. Key features: ${selectedProduct.features.slice(0, 3).join(', ')}`
                if (selectedProduct.price?.amount) fullPrompt += `. Price: ₹${selectedProduct.price.amount}`
                if (selectedProduct.images?.[0]?.url) {
                    options.productImageUrl = selectedProduct.images[0].url
                }
            }

            const data = await creativesAPI.generate({
                brandId: activeBrand._id,
                type: selectedType,
                prompt: fullPrompt,
                options,
            })

            let creative = data.creative

            // ── Client-side logo compositing (pixel-perfect) ──
            if (addLogo && creative?.imageUrl) {
                const brandLogoUrl = activeBrand?.dna?.logo?.url
                if (brandLogoUrl) {
                    try {
                        const compositedUrl = await compositeLogoOnImage(
                            creative.imageUrl, brandLogoUrl, logoPosition, logoSize
                        )
                        creative = { ...creative, imageUrl: compositedUrl }
                    } catch (e) {
                        console.warn('Logo compositing failed, using original:', e)
                    }
                }
            }

            setResult(creative)
        } catch (err) {
            setError(err.message || 'Failed to generate creative.')
        } finally {
            setGenerating(false)
        }
    }

    const handleFeedback = async (signalType, extra = {}) => {
        if (!result?._id) {
            console.warn('Feedback: no result._id — skipping API call but showing UI feedback')
        }

        // Immediate visual feedback
        if (signalType === 'thumbs') {
            const dir = extra.thumbs
            setFeedbackState(dir === 'up' ? 'liked' : 'disliked')
            setFeedbackToast(dir === 'up' ? '👍 Liked! This helps improve future creatives.' : '👎 Feedback noted. We\'ll improve next time.')
        } else if (signalType === 'accept') {
            setFeedbackState('accepted')
            setFeedbackToast('✅ Creative accepted & saved!')
        }

        // Auto-dismiss toast
        setTimeout(() => setFeedbackToast(''), 3000)

        // Fire API if we have an ID
        if (result?._id) {
            try {
                await creativesAPI.feedback(result._id, { signalType, ...extra })
            } catch (err) {
                console.error('Feedback failed:', err)
            }
        }
    }

    const selectedTypeInfo = creativeTypes.find(t => t.id === selectedType)

    return (
        <DashboardLayout>
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">Creative <span className="text-primary">Studio</span></h2>
                    <p className="text-slate-400 text-sm">AI visual content generation, aligned with your brand identity.</p>
                </div>
                <select
                    value={activeBrand?._id || ''}
                    onChange={e => {
                        const b = brands.find(b => b._id === e.target.value)
                        if (b) selectBrand(b)
                    }}
                    className="input-glass py-2 px-3 rounded-xl text-xs bg-white/[0.04] border-white/[0.08] cursor-pointer"
                >
                    {brands.length === 0 && <option value="">No brands</option>}
                    {brands.map(b => (
                        <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                </select>
            </div>

            {/* Studio Mode Toggle */}
            <div className="flex gap-2 mb-6">
                {[
                    { id: 'design', icon: 'palette', label: 'Design Studio', desc: 'Generate creatives from text' },
                    { id: 'templates', icon: 'dashboard_customize', label: 'Brand Templates', desc: 'Quick on-brand designs' },
                    { id: 'photoshoot', icon: 'photo_camera', label: 'AI Photoshoot', desc: 'Style product photos with AI' },
                    { id: 'imagebank', icon: 'photo_library', label: 'Image Bank', desc: 'Browse saved images' },
                ].map(m => (
                    <button key={m.id} onClick={() => setStudioMode(m.id)}
                        className={`flex-1 flex items-center gap-3 p-4 rounded-2xl transition-all cursor-pointer ${studioMode === m.id
                            ? 'bg-primary/15 border-2 border-primary/40 text-white'
                            : 'glass-panel text-slate-400 hover:text-white hover:bg-white/[0.04]'
                            }`}>
                        <span className={`material-symbols-outlined text-2xl ${studioMode === m.id ? 'text-primary' : 'text-slate-500'}`}>{m.icon}</span>
                        <div>
                            <p className="text-sm font-bold">{m.label}</p>
                            <p className="text-[10px] text-slate-500">{m.desc}</p>
                        </div>
                        {m.id === 'imagebank' && bankTotal > 0 && (
                            <span className="ml-auto bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">{bankTotal}</span>
                        )}
                    </button>
                ))}
            </div>

            {studioMode === 'design' && (
                <div className="grid grid-cols-12 gap-6">
                    {/* Left — Controls */}
                    <div className="col-span-12 lg:col-span-4 space-y-4">
                        {/* Creative Type */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">category</span>
                                Creative Type
                            </h3>
                            <div className="grid grid-cols-2 gap-2">
                                {creativeTypes.map(ct => (
                                    <button key={ct.id} onClick={() => setSelectedType(ct.id)}
                                        className={`p-3 rounded-xl text-left transition-all cursor-pointer ${selectedType === ct.id
                                            ? 'bg-primary/20 border border-primary/30 text-white'
                                            : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.05]'
                                            }`}>
                                        <span className="material-symbols-outlined text-lg block mb-1">{ct.icon}</span>
                                        <p className="text-xs font-bold">{ct.label}</p>
                                        <p className="text-[10px] text-slate-500">{ct.size}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Reference Images (Style / Character / Upload) ── */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">image_search</span>
                                Reference Images
                                <span className="text-[9px] text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded ml-auto">Optional</span>
                            </h3>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { key: 'style', icon: 'brush', label: 'Style', hint: 'Match this look' },
                                    { key: 'character', icon: 'face', label: 'Character', hint: 'Include this person' },
                                    { key: 'upload', icon: 'add_photo_alternate', label: 'Reference', hint: 'Use as context' },
                                ].map(ref => (
                                    <div key={ref.key}>
                                        {referenceImages[ref.key] ? (
                                            <div className="relative rounded-xl overflow-hidden aspect-square border border-primary/30">
                                                <img src={referenceImages[ref.key]} alt={ref.label} className="w-full h-full object-cover" />
                                                <button onClick={() => setReferenceImages(prev => ({ ...prev, [ref.key]: null }))}
                                                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-rose-500 cursor-pointer">
                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                </button>
                                                <span className="absolute bottom-0 inset-x-0 text-center text-[8px] font-bold bg-black/70 text-white py-0.5">{ref.label}</span>
                                            </div>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/40 cursor-pointer transition-colors bg-white/[0.02] group">
                                                <span className="material-symbols-outlined text-lg text-slate-600 group-hover:text-primary mb-0.5">{ref.icon}</span>
                                                <span className="text-[10px] text-slate-500 font-medium">{ref.label}</span>
                                                <span className="text-[8px] text-slate-600">{ref.hint}</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                    const file = e.target.files?.[0]
                                                    if (file) {
                                                        const reader = new FileReader()
                                                        reader.onload = ev => setReferenceImages(prev => ({ ...prev, [ref.key]: ev.target.result }))
                                                        reader.readAsDataURL(file)
                                                    }
                                                }} />
                                            </label>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Style & Brand Colors (combined) ── */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">style</span>
                                Style
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {styles.map(s => (
                                    <button key={s.id} onClick={() => setStyle(s.id)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all cursor-pointer ${style === s.id
                                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                            : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.06]'
                                            }`}>
                                        <span className="material-symbols-outlined text-sm">{s.icon}</span>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            {activeBrand?.dna?.colors?.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-white/[0.05]">
                                    <p className="text-[10px] text-slate-500 mb-2">Brand Colors (auto-applied)</p>
                                    <div className="flex gap-1.5">
                                        {activeBrand.dna.colors.map((c, i) => (
                                            <div key={i} className="w-7 h-7 rounded-lg border border-white/[0.1]" style={{ background: c.hex }} title={c.hex} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Text Overlay & Logo (combined) ── */}
                        <div className="glass-panel rounded-2xl p-5 space-y-4">
                            <div>
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-primary text-lg">text_fields</span>
                                    Text Overlay
                                </h3>
                                <input value={textOverlay} onChange={e => setTextOverlay(e.target.value)}
                                    placeholder="Text to appear on the creative..."
                                    className="input-glass w-full py-2.5" />
                            </div>
                            <div className="border-t border-white/[0.05] pt-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">add_photo_alternate</span>
                                        Add Logo
                                    </span>
                                    <button onClick={() => setAddLogo(!addLogo)}
                                        className={`w-10 h-5 rounded-full transition-all cursor-pointer ${addLogo ? 'bg-primary' : 'bg-white/[0.1]'}`}>
                                        <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${addLogo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                                {addLogo && (
                                    <div className="mt-3 flex items-center gap-4">
                                        <div>
                                            <p className="text-[9px] text-slate-500 mb-1">Position</p>
                                            <div className="grid grid-cols-3 gap-0.5 w-16">
                                                {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(pos => (
                                                    <button key={pos} onClick={() => setLogoPosition(pos)}
                                                        className={`w-5 h-5 rounded transition-all cursor-pointer ${logoPosition === pos ? 'bg-primary' : 'bg-white/[0.06] hover:bg-white/[0.1]'}`} />
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-slate-500 mb-1">Size</p>
                                            <div className="flex gap-1">
                                                {['small', 'medium', 'large'].map(s => (
                                                    <button key={s} onClick={() => setLogoSize(s)}
                                                        className={`px-2 py-1 rounded text-[9px] font-bold capitalize cursor-pointer ${logoSize === s ? 'bg-primary text-white' : 'bg-white/[0.04] text-slate-500'}`}>
                                                        {s[0].toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right — Canvas & Prompt */}
                    <div className="col-span-12 lg:col-span-8 space-y-5">
                        {/* Canvas */}
                        <div className="glass-panel rounded-2xl p-6" style={{ minHeight: '400px' }}>
                            {generating ? (
                                <div className="flex flex-col items-center justify-center h-80 gap-4">
                                    <div className="size-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                                    </div>
                                    <p className="text-white font-bold">Generating {selectedTypeInfo?.label}...</p>
                                    <p className="text-xs text-slate-400">Using brand DNA: {activeBrand?.name} • Style: {style}</p>
                                </div>
                            ) : result ? (
                                <div className="animate-fade-in">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{result.title || 'Generated Creative'}</h3>
                                            <p className="text-xs text-slate-400">{selectedTypeInfo?.label} • {selectedTypeInfo?.size} • {style}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleFeedback('thumbs', { thumbs: 'up' })}
                                                className={`btn-glass p-2 rounded-xl cursor-pointer transition-all duration-200 ${feedbackState === 'liked'
                                                    ? 'text-emerald-400 bg-emerald-400/15 border border-emerald-400/30 scale-110'
                                                    : 'text-slate-400 hover:text-emerald-400'}`}>
                                                <span className="material-symbols-outlined">{feedbackState === 'liked' ? 'thumb_up' : 'thumb_up'}</span>
                                            </button>
                                            <button onClick={() => handleFeedback('thumbs', { thumbs: 'down' })}
                                                className={`btn-glass p-2 rounded-xl cursor-pointer transition-all duration-200 ${feedbackState === 'disliked'
                                                    ? 'text-rose-400 bg-rose-400/15 border border-rose-400/30 scale-110'
                                                    : 'text-slate-400 hover:text-rose-400'}`}>
                                                <span className="material-symbols-outlined">thumb_down</span>
                                            </button>
                                            <button onClick={handleGenerate}
                                                className="btn-glass p-2 rounded-xl text-slate-400 hover:text-white cursor-pointer">
                                                <span className="material-symbols-outlined">refresh</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Display area */}
                                    <div className="relative rounded-xl overflow-hidden border border-white/[0.08]"
                                        style={{ aspectRatio: selectedType === 'instagram-story' ? '9/16' : selectedType === 'banner' ? '16/5' : '1/1', maxHeight: '500px' }}>
                                        {result.imageUrl ? (
                                            <img
                                                src={result.imageUrl}
                                                alt={result.title || 'Generated creative'}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                            />
                                        ) : null}
                                        <div className={`absolute inset-0 flex flex-col items-center justify-center p-8 text-center ${result.imageUrl ? 'hidden' : ''}`}
                                            style={{ background: `linear-gradient(135deg, ${activeBrand?.dna?.colors?.[0]?.hex || '#2B4BEE'}40, ${activeBrand?.dna?.colors?.[1]?.hex || '#8B5CF6'}40)` }}>
                                            <span className="material-symbols-outlined text-6xl text-white/20 mb-4 block">image</span>
                                            <p className="text-white font-bold text-lg mb-2">{textOverlay || result.title || prompt.substring(0, 40)}</p>
                                            <p className="text-xs text-white/50">{activeBrand?.name}</p>
                                        </div>
                                    </div>

                                    {result.aiMeta && (
                                        <div className="flex items-center gap-4 mt-4 text-[10px] text-slate-500">
                                            <span>Provider: {result.aiMeta.provider}</span>
                                            <span>Model: {result.aiMeta.model}</span>
                                            {result.aiMeta.brandAlignmentScore && (
                                                <span className="text-emerald-400 font-bold">{result.aiMeta.brandAlignmentScore}% Brand Match</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Toast feedback */}
                                    {feedbackToast && (
                                        <div className="mb-3 py-2 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium text-center animate-fade-in">
                                            {feedbackToast}
                                        </div>
                                    )}

                                    <div className="flex gap-3 mt-4">
                                        <button onClick={() => handleFeedback('accept')}
                                            className={`py-2.5 px-6 rounded-xl text-sm flex-1 transition-all duration-200 ${feedbackState === 'accepted'
                                                ? 'bg-emerald-500 text-white font-bold'
                                                : 'btn-primary'}`}>
                                            <span className="material-symbols-outlined text-sm">{feedbackState === 'accepted' ? 'check_circle' : 'check'}</span>
                                            {feedbackState === 'accepted' ? ' Accepted ✓' : ' Accept'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (result?.imageUrl) {
                                                    const a = document.createElement('a')
                                                    a.href = result.imageUrl
                                                    a.download = `${result.title || 'creative'}.png`
                                                    a.click()
                                                }
                                            }}
                                            className="btn-glass py-2.5 px-6 rounded-xl text-sm border border-white/[0.1] text-white cursor-pointer hover:bg-white/[0.06]">
                                            <span className="material-symbols-outlined text-sm">download</span> Export
                                        </button>
                                    </div>
                                </div>
                            ) : designBaseImage ? (
                                <div className="flex flex-col items-center justify-center h-80 gap-4 relative">
                                    <img src={designBaseImage} alt="Photoshoot base" className="w-full h-full object-contain rounded-xl opacity-60" />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-xl">
                                        <span className="material-symbols-outlined text-5xl text-primary mb-3">auto_awesome</span>
                                        <h3 className="text-lg font-bold text-white mb-1">Photoshoot Image Ready</h3>
                                        <p className="text-xs text-slate-300 mb-4 text-center max-w-sm">
                                            Describe how you want to adapt this image for {selectedTypeInfo?.label || 'your platform'}, then click Generate.
                                        </p>
                                        <button onClick={handleGenerate} disabled={!prompt.trim() || generating}
                                            className="btn-primary py-2.5 px-6 rounded-xl text-sm font-bold disabled:opacity-30">
                                            <span className="material-symbols-outlined text-sm">auto_awesome</span> Generate from this image
                                        </button>
                                    </div>
                                </div>
                            ) : showQuickStart && !prompt.trim() ? (
                                <div className="p-4">
                                    <h3 className="text-lg font-bold text-white mb-1 text-center">What do you want to create?</h3>
                                    <p className="text-xs text-slate-400 text-center mb-5">Choose a category and we'll help you build the perfect prompt</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {quickStartCards.map(card => (
                                            <button key={card.id} onClick={() => {
                                                const brandName = activeBrand?.name || 'the brand'
                                                const templates = {
                                                    social: `Create a visually stunning social media post for ${brandName}. Make it eye-catching, on-brand, and shareable. Include a catchy headline and professional layout.`,
                                                    product: `Create a premium product showcase for ${brandName}. Feature the product prominently with brand colors, modern layout, and a subtle call-to-action.`,
                                                    promo: `Create an exciting promotional offer creative for ${brandName}. Make the offer text large and prominent, add urgency, brand colors, and a bold CTA button.`,
                                                    quote: `Create an elegant customer testimonial card for ${brandName}. Use beautiful typography, quotation marks, brand colors as accents, and a clean professional layout.`,
                                                    announce: `Create a bold announcement post for ${brandName}. Make the headline attention-grabbing, use excited energy and brand colors, and include a celebration feel.`,
                                                    story: `Create a compelling brand story visual for ${brandName}. Tell the brand narrative through imagery, use brand colors, and convey authenticity with a warm, premium feel.`,
                                                }
                                                setPrompt(templates[card.id] || '')
                                                setShowQuickStart(false)
                                            }}
                                                className="flex flex-col items-center gap-2 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all cursor-pointer group">
                                                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${card.color}20` }}>
                                                    <span className="material-symbols-outlined text-2xl" style={{ color: card.color }}>{card.icon}</span>
                                                </div>
                                                <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{card.label}</p>
                                                <p className="text-[10px] text-slate-500">{card.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-600 text-center mt-4">Or just type your own description in the prompt box below ↓</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-80 gap-4 opacity-60">
                                    <span className="material-symbols-outlined text-6xl text-primary">brush</span>
                                    <h3 className="text-xl font-bold text-white">Create a Visual</h3>
                                    <p className="text-sm text-slate-400 max-w-md text-center">
                                        {activeBrand
                                            ? `Describe what you want and AI will generate visuals matching ${activeBrand.name}'s brand identity.`
                                            : 'Create a brand first to start generating visuals.'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Prompt Input */}
                        <div className="glass-panel rounded-2xl p-5">
                            {/* Content-linked banner */}
                            {fromContent && (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
                                    <span className="material-symbols-outlined text-primary">link</span>
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-white">Linked to Content Studio</p>
                                        <p className="text-[10px] text-slate-400">Image will be generated to match your content in {activeBrand?.name}'s brand style</p>
                                    </div>
                                    <button onClick={() => setFromContent(false)} className="text-slate-500 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            )}
                            {designBaseImage && (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-4">
                                    <img src={designBaseImage} alt="Base" className="w-10 h-10 rounded-lg object-cover" />
                                    <div className="flex-1">
                                        <p className="text-xs font-bold text-white">📸 Linked from AI Photoshoot</p>
                                        <p className="text-[10px] text-slate-400">Describe how to adapt this image for your platform</p>
                                    </div>
                                    <button onClick={() => setDesignBaseImage(null)} className="text-slate-500 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            )}
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                                Describe Your Creative
                            </h3>

                            {/* Product Picker */}
                            {selectedProduct ? (
                                <div className="flex items-center gap-3 mb-3 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                    {selectedProduct.images?.[0]?.url && (
                                        <img src={selectedProduct.images[0].url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-white truncate">{selectedProduct.title}</p>
                                        <p className="text-[10px] text-cyan-400">Product selected — will be used in creative</p>
                                    </div>
                                    <button onClick={() => setSelectedProduct(null)} className="text-slate-500 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => {
                                    if (activeBrand?._id) {
                                        productsAPI.list({ brandId: activeBrand._id, limit: 50 })
                                            .then(res => setProductsList(res.products || []))
                                            .catch(() => { })
                                    }
                                    setShowProductPicker(true)
                                }}
                                    className="w-full mb-3 py-2 px-3 rounded-xl glass-panel text-xs text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/5 transition-all cursor-pointer font-bold flex items-center gap-2 justify-center border border-dashed border-white/10 hover:border-cyan-400/30">
                                    <span className="material-symbols-outlined text-sm">inventory_2</span>
                                    Select a Product (optional)
                                </button>
                            )}
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <textarea
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
                                        placeholder={activeBrand ? "Describe the visual you want... Type or speak in any language 🎤" : "Create a brand first"}
                                        disabled={!activeBrand || generating}
                                        className="input-glass w-full resize-none py-3 pr-12 disabled:opacity-30"
                                        rows={2}
                                    />
                                    <div className="absolute right-2 top-2">
                                        <VoiceInput
                                            onResult={(text) => setPrompt(prev => prev ? prev + ' ' + text : text)}
                                            size="small"
                                        />
                                    </div>
                                </div>
                                <CreditTooltipWrapper action="creative">
                                    <button onClick={handleGenerate} disabled={!prompt.trim() || !activeBrand || generating}
                                        className="btn-primary py-3 px-6 rounded-xl shrink-0 self-end disabled:opacity-30">
                                        <span className="material-symbols-outlined">auto_awesome</span>
                                        Generate <CreditBadge action="creative" />
                                    </button>
                                </CreditTooltipWrapper>
                            </div>
                            {error && (
                                <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                                    <span className="material-symbols-outlined text-sm align-middle mr-1">error</span> {error}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* =================== AI PHOTOSHOOT MODE =================== */}
            {studioMode === 'photoshoot' && (
                <div className="grid grid-cols-12 gap-6">
                    {/* Left — Photoshoot Controls */}
                    <div className="col-span-12 lg:col-span-5 space-y-5">
                        {/* Product Image Upload */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary text-lg">add_a_photo</span>
                                Product Image
                            </h3>

                            {!productImage ? (
                                <div onDrop={(e) => {
                                    e.preventDefault()
                                    const file = e.dataTransfer?.files?.[0]
                                    if (file && file.type.startsWith('image/')) {
                                        setProductFile(file)
                                        const reader = new FileReader()
                                        reader.onload = (ev) => setProductImage(ev.target.result)
                                        reader.readAsDataURL(file)
                                    }
                                }} onDragOver={e => e.preventDefault()}
                                    className="border-2 border-dashed border-white/[0.1] rounded-2xl p-8 text-center hover:border-primary/40 transition-colors">
                                    <span className="material-symbols-outlined text-4xl text-slate-600 mb-2 block">add_photo_alternate</span>
                                    <p className="text-slate-400 text-sm mb-1">Drop your product image here</p>
                                    <p className="text-[10px] text-slate-600 mb-3">AI will place it in a professional photoshoot</p>
                                    <label className="btn-primary py-2 px-5 rounded-xl text-xs cursor-pointer inline-block">
                                        Choose Image
                                        <input type="file" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file && file.type.startsWith('image/')) {
                                                setProductFile(file)
                                                const reader = new FileReader()
                                                reader.onload = (ev) => setProductImage(ev.target.result)
                                                reader.readAsDataURL(file)
                                            }
                                        }} accept="image/*" />
                                    </label>
                                </div>
                            ) : (
                                <div className="relative rounded-2xl overflow-hidden">
                                    <img src={productImage} alt="Product" className="w-full max-h-48 object-contain bg-black/20 rounded-2xl" />
                                    <button onClick={() => { setProductImage(null); setProductFile(null); setPhotoshootResult(null) }}
                                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 transition-colors cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                    {productFile && (
                                        <div className="absolute bottom-2 left-2 bg-black/60 rounded-lg px-2 py-1">
                                            <span className="text-[10px] text-white">{productFile.name}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Style & Character References (for Photoshoot) ── */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">image_search</span>
                                Style & Character
                                <span className="text-[9px] text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded ml-auto">Optional</span>
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { key: 'style', icon: 'brush', label: 'Style Reference', hint: 'Match this visual style' },
                                    { key: 'character', icon: 'face', label: 'Character', hint: 'Include this person/mascot' },
                                ].map(ref => (
                                    <div key={ref.key}>
                                        {referenceImages[ref.key] ? (
                                            <div className="relative rounded-xl overflow-hidden aspect-video border border-primary/30">
                                                <img src={referenceImages[ref.key]} alt={ref.label} className="w-full h-full object-cover" />
                                                <button onClick={() => setReferenceImages(prev => ({ ...prev, [ref.key]: null }))}
                                                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white hover:bg-rose-500 cursor-pointer">
                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                </button>
                                                <span className="absolute bottom-0 inset-x-0 text-center text-[8px] font-bold bg-black/70 text-white py-0.5">{ref.label}</span>
                                            </div>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/40 cursor-pointer transition-colors bg-white/[0.02] group">
                                                <span className="material-symbols-outlined text-lg text-slate-600 group-hover:text-primary mb-0.5">{ref.icon}</span>
                                                <span className="text-[10px] text-slate-500 font-medium">{ref.label}</span>
                                                <span className="text-[8px] text-slate-600">{ref.hint}</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                    const file = e.target.files?.[0]
                                                    if (file) {
                                                        const reader = new FileReader()
                                                        reader.onload = ev => setReferenceImages(prev => ({ ...prev, [ref.key]: ev.target.result }))
                                                        reader.readAsDataURL(file)
                                                    }
                                                }} />
                                            </label>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[9px] text-slate-600 mt-2">Add a style image or character to guide the photoshoot look</p>
                        </div>

                        {/* Scene Keywords */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary text-lg">landscape</span>
                                Scene & Setting
                            </h3>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {[
                                    { id: 'outdoor', icon: 'park', label: 'Outdoor' },
                                    { id: 'indoor', icon: 'home', label: 'Indoor' },
                                    { id: 'studio', icon: 'photo_camera', label: 'Studio' },
                                    { id: 'podium', icon: 'podium', label: 'Podium' },
                                    { id: 'flat-lay', icon: 'grid_view', label: 'Flat Lay' },
                                    { id: 'lifestyle', icon: 'coffee', label: 'Lifestyle' },
                                    { id: 'model', icon: 'person', label: 'With Model' },
                                    { id: 'minimal', icon: 'format_shapes', label: 'Minimal' },
                                    { id: 'neon', icon: 'light', label: 'Neon Glow' },
                                    { id: 'nature', icon: 'eco', label: 'Nature' },
                                    { id: 'marble', icon: 'counter_1', label: 'Marble' },
                                    { id: 'wooden', icon: 'deck', label: 'Wooden' },
                                    { id: 'festive', icon: 'celebration', label: 'Festive' },
                                    { id: 'luxury', icon: 'diamond', label: 'Luxury' },
                                ].map(kw => {
                                    const active = sceneKeywords.includes(kw.id)
                                    return (
                                        <button key={kw.id} onClick={() => setSceneKeywords(prev =>
                                            active ? prev.filter(k => k !== kw.id) : [...prev, kw.id]
                                        )}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'
                                                }`}>
                                            <span className="material-symbols-outlined text-sm">{kw.icon}</span>
                                            {kw.label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Product Fidelity Control */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-primary text-lg">tune</span>
                                Product Fidelity
                            </h3>
                            <p className="text-[10px] text-slate-500 mb-4">How closely should the output match your original product?</p>

                            <div className="relative">
                                <input
                                    type="range"
                                    min={0} max={100} step={5}
                                    value={fidelity}
                                    onChange={e => setFidelity(Number(e.target.value))}
                                    className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                    style={{
                                        background: `linear-gradient(to right, #f59e0b ${fidelity}%, rgba(255,255,255,0.06) ${fidelity}%)`,
                                    }}
                                />
                                <div className="flex justify-between mt-2">
                                    {[
                                        { val: 0, label: 'Max Creative', icon: '🎨' },
                                        { val: 25, label: 'Creative', icon: '✨' },
                                        { val: 50, label: 'Balanced', icon: '⚖️' },
                                        { val: 75, label: 'Faithful', icon: '🎯' },
                                        { val: 100, label: 'Exact Copy', icon: '🔒' },
                                    ].map(p => (
                                        <button key={p.val} onClick={() => setFidelity(p.val)}
                                            className={`text-center cursor-pointer transition-all ${Math.abs(fidelity - p.val) < 13 ? 'text-amber-400 scale-110' : 'text-slate-600 hover:text-slate-400'}`}>
                                            <span className="text-xs block">{p.icon}</span>
                                            <span className="text-[9px] block">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 p-2 rounded-lg bg-white/[0.03] text-[10px] text-slate-500">
                                {fidelity >= 75 ? '🔒 Product will be preserved closely — only background changes' :
                                    fidelity >= 50 ? '⚖️ Balanced — product preserved with some artistic styling' :
                                        fidelity >= 25 ? '✨ Creative — product may get minor artistic enhancements' :
                                            '🎨 Max creative freedom — product may be significantly reimagined'}
                            </div>
                        </div>

                        {/* Additional Brief */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">description</span>
                                Additional Brief
                            </h3>
                            <div className="relative">
                                <textarea
                                    value={photoshootBrief}
                                    onChange={e => setPhotoshootBrief(e.target.value)}
                                    placeholder="e.g., Warm golden hour lighting, bokeh background, premium feel, close-up angle..."
                                    className="input-glass w-full py-3 pr-12 resize-none"
                                    rows={3}
                                />
                                <div className="absolute right-2 top-2">
                                    <VoiceInput
                                        onResult={(text) => setPhotoshootBrief(prev => prev ? prev + ' ' + text : text)}
                                        size="small"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Generate Button */}
                        <CreditTooltipWrapper action="photoshoot">
                            <button
                                onClick={async () => {
                                    if (!productImage || !activeBrand) return
                                    setPhotoshootGenerating(true)
                                    setPhotoshootError('')
                                    setPhotoshootResult(null)
                                    setPhotoshootSaved(false)
                                    try {
                                        const brandColors = activeBrand?.dna?.colors?.map(c => c.hex).join(', ') || ''
                                        const scene = sceneKeywords.map(k =>
                                            k.charAt(0).toUpperCase() + k.slice(1).replace('-', ' ')
                                        ).join(', ') || 'Professional studio'

                                        const data = await agentsAPI.aiPhotoshoot({
                                            image: productImage,
                                            scene,
                                            keywords: sceneKeywords,
                                            brief: photoshootBrief,
                                            brandName: activeBrand?.name,
                                            brandColors,
                                            fidelity,
                                        })

                                        if (data.success) {
                                            setPhotoshootResult(data)
                                            // Auto-save to image bank
                                            saveToImageBank(data)
                                        } else {
                                            setPhotoshootError(data.error || 'Generation failed')
                                        }
                                    } catch (err) {
                                        setPhotoshootError(err.message || 'Photoshoot generation failed')
                                    } finally {
                                        setPhotoshootGenerating(false)
                                    }
                                }}
                                disabled={!productImage || !activeBrand || photoshootGenerating}
                                className="btn-primary w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-30"
                            >
                                {photoshootGenerating ? (
                                    <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Generating Photoshoot...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate AI Photoshoot <CreditBadge action="photoshoot" /></>
                                )}
                            </button>
                        </CreditTooltipWrapper>

                        {photoshootError && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                                <span className="material-symbols-outlined text-sm align-middle mr-1">error</span> {photoshootError}
                            </div>
                        )}
                    </div>

                    {/* Right — Photoshoot Result */}
                    <div className="col-span-12 lg:col-span-7">
                        <div className="glass-panel rounded-2xl p-6 min-h-[500px] flex items-center justify-center">
                            {!photoshootResult && !photoshootGenerating && (
                                <div className="text-center">
                                    <span className="material-symbols-outlined text-6xl text-slate-700 mb-4 block">photo_camera</span>
                                    <h3 className="text-lg font-bold text-slate-500 mb-2">AI Photoshoot Studio</h3>
                                    <p className="text-xs text-slate-600 max-w-sm">
                                        Upload a product image, choose your scene, and let AI create a professional photoshoot.
                                        Product details are preserved while the background and styling are transformed.
                                    </p>
                                </div>
                            )}

                            {photoshootGenerating && (
                                <div className="text-center animate-fade-in">
                                    <div className="relative inline-block mb-4">
                                        <span className="material-symbols-outlined text-5xl text-primary animate-pulse">photo_camera</span>
                                        <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary"></span>
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-white mb-2">Creating Your Photoshoot</h3>
                                    <p className="text-xs text-slate-400">Gemini AI is styling your product with professional lighting and composition...</p>
                                    <div className="mt-4 flex justify-center gap-1">
                                        {[0, 1, 2, 3, 4].map(i => (
                                            <span key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {photoshootResult && (
                                <div className="w-full animate-fade-in">
                                    <div className="relative rounded-2xl overflow-hidden mb-4">
                                        <img src={photoshootResult.imageUrl} alt="AI Photoshoot"
                                            className="w-full rounded-2xl" />
                                    </div>

                                    {photoshootResult.description && (
                                        <p className="text-xs text-slate-400 mb-4 italic">{photoshootResult.description}</p>
                                    )}

                                    <div className="flex gap-2 flex-wrap">
                                        <a href={photoshootResult.imageUrl} download="ai-photoshoot.png"
                                            className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold">
                                            <span className="material-symbols-outlined text-sm">download</span>
                                            Download
                                        </a>
                                        <button onClick={() => { setPhotoshootResult(null); setPhotoshootSaved(false) }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold glass-panel text-slate-400 hover:text-white cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">refresh</span>
                                            Regenerate
                                        </button>
                                        <button onClick={() => {
                                            setDesignBaseImage(photoshootResult.imageUrl)
                                            setStudioMode('design')
                                            setPrompt(`Create a ${selectedType} design using this product photoshoot image. Brand: ${activeBrand?.name}. Make it platform-ready.`)
                                        }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">palette</span>
                                            Use in Design Studio
                                        </button>
                                        <button onClick={() => {
                                            // Navigate to Content Studio with photoshoot image for auto-analysis
                                            const params = new URLSearchParams({
                                                fromPhotoshoot: 'true',
                                                imageUrl: photoshootResult.imageUrl?.substring(0, 200), // truncated for URL
                                                brandId: activeBrand?._id || '',
                                            })
                                            window.sessionStorage.setItem('photoshootImage', photoshootResult.imageUrl)
                                            navigate(`/content-studio?${params.toString()}`)
                                        }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">article</span>
                                            Use in Content Studio
                                        </button>
                                        <button onClick={() => { setStudioMode('imagebank'); loadImageBank() }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold glass-panel text-slate-400 hover:text-white cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">photo_library</span>
                                            View Image Bank
                                        </button>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] text-slate-600 bg-white/[0.03] px-2 py-1 rounded">
                                            <span className="material-symbols-outlined text-[10px] align-middle mr-0.5">smart_toy</span>
                                            Gemini AI • {photoshootResult.model}
                                        </span>
                                        {photoshootSaved && (
                                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">check_circle</span>
                                                Saved to Image Bank
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* =================== BRAND TEMPLATES MODE =================== */}
            {studioMode === 'templates' && (
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">dashboard_customize</span>
                                Brand Templates
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">Click a template to auto-create an on-brand design — no typing needed</p>
                        </div>
                    </div>

                    {!activeBrand ? (
                        <div className="glass-panel rounded-2xl p-12 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-700 mb-4 block">brand_awareness</span>
                            <h3 className="text-lg font-bold text-slate-400 mb-2">Select a Brand First</h3>
                            <p className="text-xs text-slate-600">Templates use your brand colors, personality, and style</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {brandTemplates.map(tmpl => (
                                <button key={tmpl.id} onClick={() => {
                                    setPrompt(tmpl.promptTemplate(activeBrand.name))
                                    setSelectedType(tmpl.type)
                                    setStyle(tmpl.style)
                                    setShowQuickStart(false)
                                    setStudioMode('design')
                                }}
                                    className="glass-panel rounded-2xl p-5 text-left hover:bg-white/[0.04] hover:border-primary/30 border border-transparent transition-all cursor-pointer group">
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                                        <span className="material-symbols-outlined text-2xl text-primary">{tmpl.icon}</span>
                                    </div>
                                    <h4 className="text-sm font-bold text-white mb-1 group-hover:text-primary transition-colors">{tmpl.label}</h4>
                                    <p className="text-[10px] text-slate-500 leading-relaxed">{tmpl.desc}</p>
                                    <div className="flex items-center gap-2 mt-3">
                                        <span className="text-[9px] text-slate-600 bg-white/[0.03] px-2 py-0.5 rounded">{tmpl.style}</span>
                                        <span className="text-[9px] text-slate-600 bg-white/[0.03] px-2 py-0.5 rounded">{tmpl.type.replace('-', ' ')}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Brand guidelines reminder */}
                    {activeBrand && (
                        <div className="mt-6 glass-panel rounded-2xl p-4 flex items-center gap-4">
                            <div className="flex gap-1.5 shrink-0">
                                {(activeBrand.dna?.colors || []).slice(0, 5).map((c, i) => (
                                    <div key={i} className="w-6 h-6 rounded-lg border border-white/[0.1]" style={{ background: c.hex }} />
                                ))}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">All templates use {activeBrand.name}'s brand identity</p>
                                <p className="text-[10px] text-slate-500">Colors, personality ({activeBrand.dna?.voice?.personality || 'professional'}), and style are automatically applied</p>
                            </div>
                            <span className="material-symbols-outlined text-emerald-400 text-lg shrink-0">verified</span>
                        </div>
                    )}
                </div>
            )}

            {/* =================== IMAGE BANK MODE =================== */}
            {studioMode === 'imagebank' && (
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">photo_library</span>
                                Image Bank
                                {bankTotal > 0 && <span className="text-xs text-slate-400 font-normal ml-1">({bankTotal} images)</span>}
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">All your AI-generated images in one place</p>
                        </div>
                        <button onClick={loadImageBank}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs glass-panel text-slate-400 hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-sm">refresh</span>
                            Refresh
                        </button>
                    </div>

                    {bankLoading && (
                        <div className="flex items-center justify-center py-20">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
                        </div>
                    )}

                    {!bankLoading && bankImages.length === 0 && (
                        <div className="glass-panel rounded-2xl p-12 text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-700 mb-4 block">photo_library</span>
                            <h3 className="text-lg font-bold text-slate-500 mb-2">No Images Yet</h3>
                            <p className="text-xs text-slate-600 mb-4 max-w-md mx-auto">
                                Generate images in Design Studio or AI Photoshoot — they'll automatically appear here.
                            </p>
                            <div className="flex gap-2 justify-center">
                                <button onClick={() => setStudioMode('design')}
                                    className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">palette</span>
                                    Design Studio
                                </button>
                                <button onClick={() => setStudioMode('photoshoot')}
                                    className="py-2.5 px-5 rounded-xl text-xs font-bold glass-panel text-slate-400 hover:text-white cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">photo_camera</span>
                                    AI Photoshoot
                                </button>
                            </div>
                        </div>
                    )}

                    {!bankLoading && bankImages.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {bankImages.map(img => (
                                <div key={img._id} className="glass-panel rounded-2xl overflow-hidden group relative">
                                    <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Generated'} loading="lazy"
                                        className="w-full aspect-square object-cover" />

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-3">
                                        <p className="text-white text-xs font-bold truncate mb-1">{img.title || 'AI Image'}</p>
                                        <p className="text-slate-400 text-[10px] truncate mb-2">
                                            {img.type === 'ai-photoshoot' ? '📸 Photoshoot' : '🎨 Design'} • {new Date(img.createdAt).toLocaleDateString()}
                                        </p>
                                        <div className="flex gap-1.5">
                                            <a href={img.imageUrl} download={`${img.title || 'image'}.png`}
                                                className="flex-1 py-1.5 rounded-lg bg-white/10 text-white text-[10px] font-bold text-center hover:bg-white/20">
                                                <span className="material-symbols-outlined text-xs">download</span>
                                            </a>
                                            <button onClick={() => {
                                                setDesignBaseImage(img.imageUrl)
                                                setPrompt(`Adapt this image for ${selectedType}. Brand: ${activeBrand?.name}.`)
                                                setStudioMode('design')
                                            }}
                                                className="flex-1 py-1.5 rounded-lg bg-primary/20 text-primary text-[10px] font-bold text-center hover:bg-primary/30 cursor-pointer">
                                                <span className="material-symbols-outlined text-xs">palette</span>
                                            </button>
                                            <button onClick={async () => {
                                                if (confirm('Delete this image?')) {
                                                    try {
                                                        await creativesAPI.delete(img._id)
                                                        loadImageBank()
                                                    } catch (e) { console.error(e) }
                                                }
                                            }}
                                                className="py-1.5 px-2 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] hover:bg-rose-500/20 cursor-pointer">
                                                <span className="material-symbols-outlined text-xs">delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Source badge */}
                                    <div className="absolute top-2 left-2">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${img.type === 'ai-photoshoot'
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-primary/20 text-primary'
                                            }`}>
                                            {img.type === 'ai-photoshoot' ? '📸 Photoshoot' : '🎨 Design'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Product Picker Modal */}
            {showProductPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
                    onClick={() => setShowProductPicker(false)}>
                    <div className="glass-panel rounded-2xl p-6 w-full max-w-xl max-h-[80vh] overflow-y-auto animate-scale-in"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-extrabold text-white">
                                <span className="material-symbols-outlined text-cyan-400 align-middle mr-2">inventory_2</span>
                                Select Product
                            </h3>
                            <button onClick={() => setShowProductPicker(false)}
                                className="text-slate-500 hover:text-white transition-colors cursor-pointer">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {productsList.length === 0 ? (
                            <div className="text-center py-10">
                                <span className="material-symbols-outlined text-4xl text-slate-600 mb-3">inbox</span>
                                <p className="text-slate-400 text-sm">No products in your catalog.</p>
                                <p className="text-slate-600 text-xs mt-1">Add products in Brand DNA → Products & Services</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {productsList.map(p => (
                                    <button key={p._id}
                                        onClick={() => { setSelectedProduct(p); setShowProductPicker(false) }}
                                        className="text-left glass-panel rounded-xl overflow-hidden hover:border-cyan-400/40 transition-all cursor-pointer hover:scale-[1.02]">
                                        <div className="h-24 bg-gradient-to-br from-white/[0.03] to-white/[0.01] flex items-center justify-center overflow-hidden">
                                            {p.images?.[0]?.url ? (
                                                <img src={p.images[0].url} alt={p.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined text-2xl text-slate-600">inventory_2</span>
                                            )}
                                        </div>
                                        <div className="p-2.5">
                                            <p className="text-xs font-bold text-white truncate">{p.title}</p>
                                            {p.price?.amount > 0 && (
                                                <p className="text-[10px] font-bold text-cyan-400 mt-0.5">₹{p.price.amount.toLocaleString()}</p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </DashboardLayout>
    )
}

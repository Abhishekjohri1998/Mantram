import { useState, useEffect, useRef, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useSearchParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import { creatives as creativesAPI, agents as agentsAPI, products as productsAPI, brands as brandsAPI, media as mediaAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import VoiceInput from '../components/VoiceInput'
import PublishModal from '../components/PublishModal'

// ── S3 Upload Helper — replaces all base64-in-state patterns ──
async function uploadToS3(base64DataUri, folder = 'refs') {
    if (!base64DataUri) return null;
    // If already a URL, return as-is
    if (base64DataUri.startsWith('http')) return base64DataUri;
    try {
        const { url } = await mediaAPI.upload({ imageData: base64DataUri, folder });
        return url;
    } catch (e) {
        console.warn('S3 upload failed, falling back to base64:', e.message);
        return base64DataUri; // fallback to base64 if S3 fails
    }
}

export default function CreativeStudio() {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()
    const [searchParams, setSearchParams] = useSearchParams()
    const [selectedType, setSelectedType] = useState('instagram-post')
    const [prompt, setPrompt] = useState('')
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [showProductPicker, setShowProductPicker] = useState(false)
    const [productsList, setProductsList] = useState([])
    const [generating, setGenerating] = useState(false)
    const [enhancing, setEnhancing] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [feedbackState, setFeedbackState] = useState(null)  // 'liked' | 'disliked' | 'accepted'
    const [feedbackToast, setFeedbackToast] = useState('')
    const [style, setStyle] = useState('modern')
    const [textOverlay, setTextOverlay] = useState('')
    const [fromContent, setFromContent] = useState(false)
    const [aspectRatio, setAspectRatio] = useState('1:1')
    const [publishData, setPublishData] = useState(null) // { image, text } or null

    // Studio mode: 'create' (unified), 'photoshoot', 'templates', or 'imagebank'
    const [studioMode, setStudioMode] = useState('create')

    // AI Photoshoot state
    const [productImage, setProductImage] = useState(null)
    const [productFile, setProductFile] = useState(null)
    const [productPickerOpen, setProductPickerOpen] = useState(false)
    const [productPickerTab, setProductPickerTab] = useState('brand') // 'brand' | 'upload' | 'link'
    const [productLinkUrl, setProductLinkUrl] = useState('')
    const [sceneKeywords, setSceneKeywords] = useState([])
    const [photoshootBrief, setPhotoshootBrief] = useState('')
    const [photoshootGenerating, setPhotoshootGenerating] = useState(false)
    const [photoshootResult, setPhotoshootResult] = useState(null)
    const [photoshootError, setPhotoshootError] = useState('')
    const [photoshootSaved, setPhotoshootSaved] = useState(false)
    const [fidelity, setFidelity] = useState(80)
    // Professional Photography Controls
    const [cameraAngle, setCameraAngle] = useState('eye-level')
    const [lens, setLens] = useState('50mm')
    const [lightingStyle, setLightingStyle] = useState('softbox')
    const [lightDirection, setLightDirection] = useState('front-left')
    const [surface, setSurface] = useState('white')
    const [modelPresence, setModelPresence] = useState('none')
    const [mood, setMood] = useState(['commercial'])
    const [psTab, setPsTab] = useState('shot')

    // ── AI Image Editing (inline in photoshoot) ──
    const [psEditMode, setPsEditMode] = useState(false) // show AI editor panel
    const [psEditTool, setPsEditTool] = useState('prompt') // prompt | visual | retouch | background
    const [psEditPrompt, setPsEditPrompt] = useState('')
    const [psEditLoading, setPsEditLoading] = useState(false)
    const [psEditError, setPsEditError] = useState('')
    const [psBgAction, setPsBgAction] = useState('remove')
    const [psBgPrompt, setPsBgPrompt] = useState('')
    const [psMaskMode, setPsMaskMode] = useState(false)
    const [psMaskBrushSize, setPsMaskBrushSize] = useState(30)
    const psMaskCanvasRef = useRef(null)
    const psMaskCtxRef = useRef(null)
    const psImageRef = useRef(null)
    const psIsPainting = useRef(false)

    // Image Bank state
    const [bankImages, setBankImages] = useState([])
    const [bankLoading, setBankLoading] = useState(false)
    const [bankTotal, setBankTotal] = useState(0)
    const [lightboxIdx, setLightboxIdx] = useState(null) // index into bankImages for zoom view
    const [bankView, setBankView] = useState('list') // 'list' | 'grid'
    const [bankCopiedId, setBankCopiedId] = useState(null)
    const [bankTab, setBankTab] = useState('generated') // 'generated' | 'uploaded' | 'brand'
    const [bankCounts, setBankCounts] = useState({ uploaded: 0, generated: 0 })

    // Photoshoot image passed to design mode
    const [designBaseImage, setDesignBaseImage] = useState(null)

    // ── NEW: Reference Images (style / upload) + multi-character ──
    const [referenceImages, setReferenceImages] = useState({ style: null, character: null, upload: null })
    const [characters, setCharacters] = useState([]) // [{ name: 'Character 1', image: 'data:...' }]

    // ── NEW: Logo Overlay — auto-enable when brand has a logo ──
    const [addLogo, setAddLogo] = useState(() => !!activeBrand?.dna?.logo?.url)
    const [logoPosition, setLogoPosition] = useState('bottom-right')
    const [logoSize, setLogoSize] = useState('medium')

    // ── Unified landing state ──
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [activeQuickTemplate, setActiveQuickTemplate] = useState(null) // inline template
    const [showQuickStart, setShowQuickStart] = useState(true)
    const [guidedForm, setGuidedForm] = useState(null) // which template is open
    const [refPickerSlot, setRefPickerSlot] = useState(null) // which ref slot is being picked: 'style'|'character-N'|'upload'|null
    const [refPickerTab, setRefPickerTab] = useState('upload') // 'upload'|'bank'|'brand'
    const [brandImages, setBrandImages] = useState([]) // brand images from onboarding
    const [showCharTags, setShowCharTags] = useState(false) // @character tag autocomplete
    const [charTagFilter, setCharTagFilter] = useState('') // filter for @character autocomplete
    const promptTextareaRef = useRef(null) // ref for prompt textarea
    const [zoomImage, setZoomImage] = useState(null) // fullscreen zoom lightbox

    // Load brand images from DNA (with fallback fetch by ID)
    useEffect(() => {
        if (!activeBrand?._id) { setBrandImages([]); return }
        // Try from context first
        if (activeBrand.dna?.brandImages?.length > 0) {
            setBrandImages(activeBrand.dna.brandImages)
            return
        }
        // Fallback: fetch full brand by ID (context may strip heavy fields)
        ; (async () => {
            try {
                const data = await brandsAPI.get(activeBrand._id)
                if (data?.brand?.dna?.brandImages?.length > 0) {
                    setBrandImages(data.brand.dna.brandImages)
                } else {
                    console.log('🖼️ No brand images for', activeBrand.name)
                }
            } catch (e) { console.warn('🖼️ Could not fetch brand images:', e.message) }
        })()
    }, [activeBrand?._id])

    // ── Brand Templates (interactive formula-based) ──
    const [activeTemplate, setActiveTemplate] = useState(null)
    const [templateFields, setTemplateFields] = useState({})
    const [templatePromptPreview, setTemplatePromptPreview] = useState('')
    const [templateRefImage, setTemplateRefImage] = useState(null)
    const [templateGenerating, setTemplateGenerating] = useState(false)
    const [templateResult, setTemplateResult] = useState(null)
    const [templateError, setTemplateError] = useState('')
    const [reversePrompting, setReversePrompting] = useState(false)
    const [savedTemplates, setSavedTemplates] = useState([]) // custom templates from DB
    const [showCreateTemplate, setShowCreateTemplate] = useState(false)
    const [creatingTemplate, setCreatingTemplate] = useState(false)
    const [analyzeLoading, setAnalyzeLoading] = useState(false)
    const [newTmpl, setNewTmpl] = useState({
        label: '', icon: 'auto_awesome', description: '', type: 'instagram-post', style: 'modern',
        promptFormula: '', referenceImageUrl: '', fields: [], category: ''
    })
    const [analyzedMeta, setAnalyzedMeta] = useState({ colorPalette: [], layoutDescription: '' }) // from AI analysis
    const [templateFieldsMode, setTemplateFieldsMode] = useState('simple') // 'simple' | 'advanced'
    const [activeCategory, setActiveCategory] = useState(null)
    const [savedCategories, setSavedCategories] = useState([]) // custom categories from DB
    const [showCreateCategory, setShowCreateCategory] = useState(false)
    const [creatingCategory, setCreatingCategory] = useState(false)
    const [newCat, setNewCat] = useState({
        label: '', icon: 'auto_awesome', color: '#f59e0b', imageSource: 'upload'
    })

    // ── Aspect Ratio Options ──
    const ASPECT_RATIOS = [
        { ratio: '1:1', label: 'Square', icon: '⬜' },
        { ratio: '16:9', label: 'Widescreen', icon: '🖥️' },
        { ratio: '9:16', label: 'Social Story', icon: '📱' },
        { ratio: '2:3', label: 'Portrait', icon: '📷' },
        { ratio: '3:4', label: 'Traditional', icon: '🖼️' },
        { ratio: '4:5', label: 'Social Post', icon: '📸' },
        { ratio: '3:2', label: 'Standard', icon: '🎞️' },
        { ratio: '4:3', label: 'Classic', icon: '📺' },
    ]

    // ── Template Categories with Sub-Templates ──
    const templateCategories = [
        {
            id: 'sales', icon: 'local_offer', label: 'Sales & Offers', color: '#ef4444',
            desc: 'Promotional offers, discounts, festive & seasonal sales',
            subTemplates: [
                {
                    id: 'general-sale', label: 'General Sale', icon: 'sell',
                    desc: 'All-purpose sale/offer design',
                    fields: [
                        { key: 'offerText', label: 'Offer Details', type: 'text', placeholder: 'e.g. FLAT 50% OFF' },
                        { key: 'validTill', label: 'Valid Till', type: 'text', placeholder: 'e.g. This Weekend Only' },
                        { key: 'cta', label: 'Call to Action', type: 'text', placeholder: 'e.g. Order Now', default: 'Order Now' },
                        { key: 'mood', label: 'Design Mood', type: 'select', options: ['Urgency/Bold', 'Elegant Luxury', 'Minimalist', 'Playful/Fun'] },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a promotional sale creative for ${brand.name}.\nOFFER: ${vals.offerText || 'SPECIAL OFFER'}\nVALID TILL: ${vals.validTill || 'Limited Time'}\nCTA: "${vals.cta || 'Order Now'}"\nMOOD: ${vals.mood || 'Urgency/Bold'}\nBRAND COLORS: ${colors}\nMake the offer text LARGE and prominent. Eye-catching, bold, impossible to scroll past. Include ${brand.name} branding.`
                    }
                },
                {
                    id: 'diwali-sale', label: 'Diwali Sale', icon: 'celebration',
                    desc: 'Festival of lights themed sale',
                    fields: [
                        { key: 'offerText', label: 'Offer', type: 'text', placeholder: 'e.g. Diwali Mega Sale - Up to 60% OFF' },
                        { key: 'productName', label: 'Product/Category', type: 'text', placeholder: 'e.g. on all Electronics' },
                        { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Shop the Festive Sale', default: 'Shop Now' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a Diwali sale creative for ${brand.name}.\nOFFER: ${vals.offerText || 'Diwali Special Offer'}\nPRODUCT: ${vals.productName || ''}\nCTA: "${vals.cta || 'Shop Now'}"\nTHEME: Diwali — diyas, rangoli, lanterns, golden sparkles, warm festive lighting\nBRAND COLORS: ${colors}\nFestive and joyful but still on-brand. Include ${brand.name} logo. Traditional+modern design.`
                    }
                },
                {
                    id: 'republic-sale', label: 'Republic Day Sale', icon: 'flag',
                    desc: 'Patriotic themed sale',
                    fields: [
                        { key: 'offerText', label: 'Offer', type: 'text', placeholder: 'e.g. Republic Day Sale – 26% OFF' },
                        { key: 'productName', label: 'Product', type: 'text', placeholder: 'e.g. on all categories' },
                        { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Celebrate & Save', default: 'Shop Now' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a Republic Day sale creative for ${brand.name}.\nOFFER: ${vals.offerText || 'Republic Day Special'}\nPRODUCT: ${vals.productName || ''}\nCTA: "${vals.cta || 'Shop Now'}"\nTHEME: Republic Day — tricolor (saffron, white, green), patriotic, flag elements, Ashoka Chakra subtle\nBRAND COLORS: ${colors}\nPatriotic + brand identity blend. Include ${brand.name} logo.`
                    }
                },
            ]
        },
        {
            id: 'product', icon: 'shopping_bag', label: 'Product Showcase', color: '#f59e0b',
            desc: 'Feature products with professional brand styling',
            subTemplates: [
                {
                    id: 'product-hero', label: 'Hero Shot', icon: 'star',
                    desc: 'Full product hero with brand styling',
                    fields: [
                        { key: 'productName', label: 'Product Name', type: 'text', placeholder: 'e.g. Premium Leather Bag' },
                        { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'e.g. Crafted for Excellence' },
                        { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Shop Now', default: 'Shop Now' },
                        { key: 'layout', label: 'Layout', type: 'select', options: ['Centered', 'Lifestyle', 'Flat Lay', 'Minimal White', 'Dark Luxury'] },
                        { key: 'image', label: 'Product Image', type: 'image', hint: 'Upload product photo' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        const font = brand.dna?.fonts?.heading?.family || 'modern sans-serif'
                        return `Create a premium product showcase for ${brand.name}.\nPRODUCT: ${vals.productName || 'a product'}\nTAGLINE: "${vals.tagline || 'Quality You Deserve'}"\nCTA: "${vals.cta || 'Shop Now'}"\nLAYOUT: ${vals.layout || 'Centered'}\nBRAND COLORS: ${colors}\nFONT: ${font}\nClean background, brand color accents, product as hero element, professional.`
                    }
                },
                {
                    id: 'product-comparison', label: 'Product Comparison', icon: 'compare',
                    desc: 'Side-by-side product comparison',
                    fields: [
                        { key: 'product1', label: 'Product 1', type: 'text', placeholder: 'e.g. Basic Plan' },
                        { key: 'product2', label: 'Product 2', type: 'text', placeholder: 'e.g. Premium Plan' },
                        { key: 'highlight', label: 'What to Highlight', type: 'text', placeholder: 'e.g. Premium = Best Value' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a product comparison visual for ${brand.name}.\nLEFT: ${vals.product1 || 'Option A'}\nRIGHT: ${vals.product2 || 'Option B'}\nHIGHLIGHT: ${vals.highlight || 'Choose the best'}\nBRAND COLORS: ${colors}\nClean split layout, easy to compare, ${brand.name} branding applied.`
                    }
                },
            ]
        },
        {
            id: 'quotes', icon: 'format_quote', label: 'Quotes & Testimonials', color: '#10b981',
            desc: 'Customer reviews, brand quotes, motivational content',
            subTemplates: [
                {
                    id: 'testimonial', label: 'Customer Testimonial', icon: 'reviews',
                    desc: 'Customer review card',
                    fields: [
                        { key: 'quote', label: 'Quote Text', type: 'textarea', placeholder: 'Type the quote...' },
                        { key: 'author', label: 'Author Name', type: 'text', placeholder: 'e.g. Rahul Sharma, CEO' },
                        { key: 'bgStyle', label: 'Background', type: 'select', options: ['Solid Brand Color', 'Gradient', 'Texture', 'Photo (Blurred)', 'Dark/Moody'] },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a testimonial card for ${brand.name}.\nQUOTE: "${vals.quote || 'Great experience!'}"\nAUTHOR: ${vals.author || 'Happy Customer'}\nBG: ${vals.bgStyle || 'Solid Brand Color'}\nBRAND COLORS: ${colors}\nElegant, large quotation marks, ${brand.name} logo subtle in corner.`
                    }
                },
                {
                    id: 'motivational', label: 'Motivational Quote', icon: 'lightbulb',
                    desc: 'Inspirational brand quote',
                    fields: [
                        { key: 'quote', label: 'Quote', type: 'textarea', placeholder: 'e.g. Dream big, start small...' },
                        { key: 'bgStyle', label: 'Background', type: 'select', options: ['Gradient', 'Nature Photo', 'Abstract', 'Minimal', 'Dark'] },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a motivational quote post for ${brand.name}.\nQUOTE: "${vals.quote || 'Success starts with a single step'}"\nBG: ${vals.bgStyle || 'Gradient'}\nUSE brand colors: ${colors}\nInspirational, visually stunning, ${brand.name} branding.`
                    }
                },
            ]
        },
        {
            id: 'announcement', icon: 'campaign', label: 'Announcements', color: '#8b5cf6',
            desc: 'Launches, updates, news, and alerts',
            subTemplates: [
                {
                    id: 'launch', label: 'Product Launch', icon: 'rocket_launch',
                    desc: 'New product/service launch',
                    fields: [
                        { key: 'headline', label: 'Headline', type: 'text', placeholder: 'e.g. Introducing Our Latest Innovation' },
                        { key: 'details', label: 'Details', type: 'textarea', placeholder: 'Brief details...' },
                        { key: 'tone', label: 'Tone', type: 'select', options: ['Exciting', 'Professional', 'Teaser/Mystery', 'Celebratory'] },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a product launch announcement for ${brand.name}.\nHEADLINE: "${vals.headline || 'Something Big is Coming!'}"\nDETAILS: ${vals.details || ''}\nTONE: ${vals.tone || 'Exciting'}\nBRAND COLORS: ${colors}\nBold, shareable, ${brand.name} branding prominent.`
                    }
                },
                {
                    id: 'news-update', label: 'News/Update', icon: 'newspaper',
                    desc: 'Brand news or company update',
                    fields: [
                        { key: 'headline', label: 'Headline', type: 'text', placeholder: 'e.g. We just hit 10K customers!' },
                        { key: 'details', label: 'Details', type: 'textarea', placeholder: 'More info...' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a news update post for ${brand.name}.\nHEADLINE: "${vals.headline || 'Exciting Update'}"\nDETAILS: ${vals.details || ''}\nBRAND COLORS: ${colors}\nProfessional, newsworthy, ${brand.name} identity applied.`
                    }
                },
            ]
        },
        {
            id: 'events', icon: 'event', label: 'Events', color: '#ec4899',
            desc: 'Event promotions, invitations, and recaps',
            subTemplates: [
                {
                    id: 'event-promo', label: 'Event Promotion', icon: 'calendar_month',
                    desc: 'Promote an upcoming event',
                    fields: [
                        { key: 'eventName', label: 'Event Name', type: 'text', placeholder: 'e.g. Annual Tech Summit 2026' },
                        { key: 'date', label: 'Date & Time', type: 'text', placeholder: 'e.g. March 15½ | 10AM' },
                        { key: 'venue', label: 'Venue', type: 'text', placeholder: 'e.g. Taj Hotel, Mumbai' },
                        { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Register Now', default: 'Register Now' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create an event promo for ${brand.name}.\nEVENT: ${vals.eventName || 'Event'}\nDATE: ${vals.date || 'Coming Soon'}\nVENUE: ${vals.venue || 'TBA'}\nCTA: "${vals.cta || 'Register Now'}"\nBRAND COLORS: ${colors}\nClear hierarchy: Name > Date > Venue > CTA. ${brand.name} branding prominent.`
                    }
                },
                {
                    id: 'birthday', label: 'Birthday Post', icon: 'cake',
                    desc: 'Birthday greetings for team/clients',
                    fields: [
                        { key: 'personName', label: 'Person\'s Name', type: 'text', placeholder: 'e.g. Amit Kumar' },
                        { key: 'message', label: 'Birthday Message', type: 'textarea', placeholder: 'e.g. Wishing you a wonderful birthday!' },
                        { key: 'image', label: 'Photo', type: 'image', hint: 'Upload their photo (optional)' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a birthday greeting post for ${brand.name}.\nNAME: ${vals.personName || 'Team Member'}\nMESSAGE: "${vals.message || 'Happy Birthday!'}"\nBRAND COLORS: ${colors}\nFestive, warm, celebration vibes. Cake/balloons/confetti elements. Brand logo included.`
                    }
                },
                {
                    id: 'anniversary', label: 'Anniversary', icon: 'favorite',
                    desc: 'Work anniversary or milestone celebration',
                    fields: [
                        { key: 'personName', label: 'Person\'s Name', type: 'text', placeholder: 'e.g. Priya Patel' },
                        { key: 'years', label: 'Years / Milestone', type: 'text', placeholder: 'e.g. 5 Years' },
                        { key: 'message', label: 'Message', type: 'textarea', placeholder: 'e.g. Thank you for your dedication!' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a work anniversary celebration post for ${brand.name}.\nNAME: ${vals.personName || 'Team Member'}\nMILESTONE: ${vals.years || 'Anniversary'}\nMESSAGE: "${vals.message || 'Thank you for your incredible journey with us!'}"\nBRAND COLORS: ${colors}\nCelebratory, professional, warm. ${brand.name} branding applied.`
                    }
                },
            ]
        },
        {
            id: 'content', icon: 'analytics', label: 'Content & Info', color: '#0ea5e9',
            desc: 'Infographics, tips, educational content',
            subTemplates: [
                {
                    id: 'infographic', label: 'Infographic', icon: 'bar_chart',
                    desc: 'Data-driven visual content',
                    fields: [
                        { key: 'topic', label: 'Topic', type: 'text', placeholder: 'e.g. 5 Benefits of Organic Products' },
                        { key: 'points', label: 'Key Points (one per line)', type: 'textarea', placeholder: 'Point 1\nPoint 2\nPoint 3' },
                        { key: 'style', label: 'Style', type: 'select', options: ['Numbered List', 'Icon Grid', 'Flowchart', 'Statistics'] },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create an infographic for ${brand.name}.\nTOPIC: ${vals.topic || 'Key Facts'}\nPOINTS: ${vals.points || '1. Point one\n2. Point two'}\nSTYLE: ${vals.style || 'Numbered List'}\nBRAND COLORS: ${colors}\nIcons for each point, visually digestible, ${brand.name} branding.`
                    }
                },
                {
                    id: 'service-post', label: 'Service Highlight', icon: 'design_services',
                    desc: 'Highlight a service offering',
                    fields: [
                        { key: 'serviceName', label: 'Service Name', type: 'text', placeholder: 'e.g. Interior Design Consultation' },
                        { key: 'headline', label: 'Headline', type: 'text', placeholder: 'e.g. Expert Design, Made Simple' },
                        { key: 'style', label: 'Visual Style', type: 'select', options: ['Corporate Clean', 'Modern Gradient', 'Illustrated', 'Geometric'] },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a service highlight post for ${brand.name}.\nSERVICE: ${vals.serviceName || 'our service'}\nHEADLINE: "${vals.headline || 'Expert Service'}"\nSTYLE: ${vals.style || 'Corporate Clean'}\nBRAND COLORS: ${colors}\nInformative, visually appealing, ${brand.name} identity.`
                    }
                },
                {
                    id: 'behind-scenes', label: 'Behind the Scenes', icon: 'videocam',
                    desc: 'Show process and culture',
                    fields: [
                        { key: 'scene', label: 'What\'s Happening?', type: 'text', placeholder: 'e.g. Team brainstorming' },
                        { key: 'vibe', label: 'Vibe', type: 'select', options: ['Authentic', 'Professional', 'Fun/Playful', 'Creative'] },
                        { key: 'image', label: 'Photo', type: 'image', hint: 'Upload a BTS photo' },
                    ],
                    buildPrompt: (brand, vals) => {
                        const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                        return `Create a behind-the-scenes story for ${brand.name}.\nSCENE: ${vals.scene || 'Team at work'}\nVIBE: ${vals.vibe || 'Authentic'}\nBRAND COLORS: ${colors} as accent overlays\nAuthentic, warm, ${brand.name} brand identity maintained.`
                    }
                },
            ]
        },
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

        // Check if coming with mode=photoshoot from Content Studio or Brand DNA
        const mode = searchParams.get('mode')
        if (mode === 'photoshoot') {
            setStudioMode('photoshoot')
            const brief = searchParams.get('brief')
            if (brief) setPhotoshootBrief(brief)

            // Read image passed from Brand DNA via sessionStorage
            const passedImage = window.sessionStorage.getItem('photoshootImage')
            if (passedImage) {
                setProductImage(passedImage)
                window.sessionStorage.removeItem('photoshootImage')
            }

            setSearchParams({}, { replace: true })
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Load image bank on mount + when brand changes (needed for reference picker's Library tab)
    useEffect(() => {
        if (activeBrand?._id) {
            loadImageBank()
        }
    }, [activeBrand?._id])

    const loadImageBank = async (cat) => {
        const category = cat || bankTab
        setBankLoading(true)
        try {
            const params = { limit: 50 }
            if (activeBrand?._id) params.brandId = activeBrand._id
            // 'brand' tab uses client-side data, no API call needed
            if (category !== 'brand') params.category = category
            const data = await creativesAPI.imageBank(params)
            setBankImages(data.images || [])
            setBankTotal(data.total || 0)
            if (data.counts) setBankCounts(data.counts)
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
        { id: 'instagram-post', icon: 'photo_camera', label: 'Instagram Post', size: '1080×1080', aspectRatio: '1:1' },
        { id: 'instagram-story', icon: 'smartphone', label: 'Story', size: '1080×1920', aspectRatio: '9:16' },
        { id: 'facebook-ad', icon: 'ads_click', label: 'Facebook Ad', size: '1200×628', aspectRatio: '16:9' },
        { id: 'linkedin-post', icon: 'work', label: 'LinkedIn Post', size: '1200×627', aspectRatio: '16:9' },
        { id: 'youtube-thumb', icon: 'smart_display', label: 'YouTube Thumb', size: '1280×720', aspectRatio: '16:9' },
        { id: 'banner', icon: 'web', label: 'Banner', size: '1920×600', aspectRatio: '16:9' },
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

    const handleEnhancePrompt = async () => {
        if (!prompt.trim() || !activeBrand || enhancing) return
        setEnhancing(true)
        try {
            // Build description of reference images for the enhancer
            const refDescs = []
            if (referenceImages.style) refDescs.push('A style reference image is attached — match its visual aesthetic, color palette, and mood')
            if (characters.length > 0) refDescs.push(`${characters.length} character reference image(s) are attached: ${characters.map(c => c.name).join(', ')} — include these characters in the design`)
            if (referenceImages.upload) refDescs.push('A general reference image is attached — use it as contextual inspiration')

            const data = await creativesAPI.enhancePrompt({
                brandId: activeBrand._id,
                prompt: prompt.trim(),
                style,
                format: selectedType,
                aspectRatio,
                referenceDescriptions: refDescs.length > 0 ? refDescs.join('. ') : '',
            })
            if (data.enhancedPrompt) {
                setPrompt(data.enhancedPrompt)
            }
        } catch (err) {
            console.error('Enhance prompt failed:', err)
        } finally {
            setEnhancing(false)
        }
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
                characters, // multi-character array
                addLogo,
                logoPosition,
                logoSize,
                aspectRatio,
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

            console.log('🎨 Creative Studio — generating with:', {
                type: selectedType,
                aspectRatio,
                style,
                hasStyleRef: !!referenceImages.style,
                charactersCount: characters.length,
                characterNames: characters.map(c => c.name),
                hasUploadRef: !!referenceImages.upload,
                hasBaseImage: !!designBaseImage,
                hasProductImage: !!options.productImageUrl,
                textOverlay: textOverlay || '(none)',
                addLogo,
            })

            const data = await creativesAPI.generate({
                brandId: activeBrand._id,
                type: selectedType,
                prompt: fullPrompt,
                options,
            })

            let creative = data.creative

            // Logo overlay is now handled SERVER-SIDE in creatives.js
            // using sharp (no CORS issues). The addLogo flag in options
            // triggers server-side compositing after S3 upload.

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

    // ── Photoshoot AI Editing: mask helpers ──
    const setupPsMaskCanvas = useCallback(() => {
        const img = psImageRef.current
        if (!img || psMaskCanvasRef.current) return
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth || img.width
        canvas.height = img.naturalHeight || img.height
        canvas.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;cursor:crosshair;z-index:10;`
        const ctx = canvas.getContext('2d')
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = 'rgba(255,80,80,0.5)'
        ctx.lineWidth = psMaskBrushSize
        psMaskCtxRef.current = ctx
        psMaskCanvasRef.current = canvas
        img.parentElement.style.position = 'relative'
        img.parentElement.appendChild(canvas)
        // Events
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect()
            return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }
        }
        canvas.onmousedown = (e) => { psIsPainting.current = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
        canvas.onmousemove = (e) => { if (!psIsPainting.current) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke() }
        canvas.onmouseup = () => { psIsPainting.current = false }
        canvas.onmouseleave = () => { psIsPainting.current = false }
    }, [psMaskBrushSize])

    const teardownPsMaskCanvas = useCallback(() => {
        if (psMaskCanvasRef.current) {
            psMaskCanvasRef.current.remove()
            psMaskCanvasRef.current = null
            psMaskCtxRef.current = null
        }
    }, [])

    const getPsMaskDataUrl = useCallback(() => {
        const src = psMaskCanvasRef.current
        if (!src) return null
        const c = document.createElement('canvas')
        c.width = src.width; c.height = src.height
        const ctx = c.getContext('2d')
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height)
        // Draw mask strokes as white
        ctx.globalCompositeOperation = 'source-over'
        const srcData = src.getContext('2d').getImageData(0, 0, src.width, src.height)
        const outData = ctx.getImageData(0, 0, c.width, c.height)
        for (let i = 0; i < srcData.data.length; i += 4) {
            if (srcData.data[i + 3] > 10) { // any painted pixel
                outData.data[i] = 255; outData.data[i + 1] = 255; outData.data[i + 2] = 255; outData.data[i + 3] = 255
            }
        }
        ctx.putImageData(outData, 0, 0)
        return c.toDataURL('image/png')
    }, [])

    // ── Photoshoot AI Edit Handler ──
    const handlePsEdit = useCallback(async () => {
        if (!photoshootResult?.imageUrl) return
        setPsEditLoading(true)
        setPsEditError('')
        try {
            const imageBase64 = photoshootResult.imageUrl
            let resultUrl = null

            if (psEditTool === 'prompt') {
                if (!psEditPrompt.trim()) throw new Error('Enter a prompt')
                const resp = await fetch('/api/canvas-assets/ai-edit', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: psEditPrompt, imageBase64 }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error)
                resultUrl = data.imageUrl
            } else if (psEditTool === 'visual') {
                if (!psEditPrompt.trim()) throw new Error('Enter a prompt')
                const maskDataUrl = getPsMaskDataUrl()
                if (!maskDataUrl) throw new Error('Paint a mask on the image first')
                const resp = await fetch('/api/canvas-assets/ai-edit-visual', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: psEditPrompt, imageBase64, maskBase64: maskDataUrl }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error)
                resultUrl = data.imageUrl
            } else if (psEditTool === 'retouch') {
                const maskDataUrl = getPsMaskDataUrl()
                const resp = await fetch('/api/canvas-assets/ai-retouch', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: psEditPrompt || 'Retouch naturally', imageBase64, maskBase64: maskDataUrl }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error)
                resultUrl = data.imageUrl
            } else if (psEditTool === 'background') {
                const resp = await fetch('/api/canvas-assets/ai-background', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64, action: psBgAction, bgPrompt: psBgAction === 'replace' ? (psBgPrompt || psEditPrompt) : undefined }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error)
                resultUrl = data.imageUrl
            }

            if (resultUrl) {
                // Auto-apply: replace the photoshoot result image
                setPhotoshootResult(prev => ({ ...prev, imageUrl: resultUrl }))
                teardownPsMaskCanvas()
                setPsMaskMode(false)
            }
        } catch (err) { setPsEditError(err.message) }
        setPsEditLoading(false)
    }, [photoshootResult, psEditTool, psEditPrompt, psBgAction, psBgPrompt, getPsMaskDataUrl, teardownPsMaskCanvas])

    // ── Template Generation Handler ──
    const handleTemplateGenerate = useCallback(async (tmpl) => {
        if (!activeBrand || templateGenerating) return
        setTemplateGenerating(true)
        setTemplateError('')
        setTemplateResult(null)
        try {
            let builtPrompt = tmpl.buildPrompt(activeBrand, templateFields)

            // Append additional user instructions (gender change, outfit, background, etc.)
            const extraInstructions = templateFields._additionalInstructions?.trim()
            if (extraInstructions) {
                builtPrompt += `\n\nADDITIONAL CHANGES (apply these intelligently — adapt the ENTIRE image, not just face swap):\n${extraInstructions}`
            }

            setTemplatePromptPreview(builtPrompt)

            const options = {
                style: tmpl.style || 'modern',
                referenceImages: {},
                aspectRatio: templateFields._aspectRatio || aspectRatio,
                imageSize: templateFields._imageSize || '1K',
                characters: [],
            }

            // Collect ALL image fields from the template — separate by role
            const imageFields = (tmpl.fields || []).filter(f => f.type === 'image')
            const modelFields = imageFields.filter(f => /model|person|human|character|lady|man|woman/i.test(f.label || f.key))
            const productFields = imageFields.filter(f => /product|item|device|object|photo/i.test(f.label || f.key))
            const otherImageFields = imageFields.filter(f => !modelFields.includes(f) && !productFields.includes(f))

            // Model/Person images → character references (for face/appearance preservation)
            for (const mf of modelFields) {
                const imgSrc = templateFields[mf.key]
                if (imgSrc) {
                    options.characters.push({ name: mf.label || 'Model', image: imgSrc })
                }
            }

            // Product images → product image (first one wins)
            const productField = productFields[0]
            const productImage = productField ? templateFields[productField.key] : null

            // If no specific model/product detected, fall back to first image field like before
            if (modelFields.length === 0 && productFields.length === 0 && imageFields.length > 0) {
                const fallbackField = imageFields[0]
                const fallbackImage = templateFields[fallbackField.key]
                if (fallbackImage) {
                    if (/model|person/i.test(fallbackField.label)) {
                        options.characters.push({ name: fallbackField.label || 'Character', image: fallbackImage })
                    } else {
                        // Treat as product
                        if (fallbackImage.startsWith('data:image/')) {
                            options.baseImage = fallbackImage
                        } else {
                            options.productImageUrl = fallbackImage
                        }
                    }
                }
            }

            // Template inpainting mode: reference image exists (saved template)
            const refImage = templateRefImage || tmpl.referenceImageUrl
            if (refImage) {
                options.templateInpainting = true
                options.templateRefImageUrl = refImage
                if (productImage) {
                    if (productImage.startsWith('data:image/')) {
                        options.baseImage = productImage
                    } else {
                        options.productImageUrl = productImage
                    }
                }
            } else if (productImage) {
                if (productImage.startsWith('data:image/')) {
                    options.baseImage = productImage
                } else {
                    options.productImageUrl = productImage
                }
            }

            // Additional reference images (non-model, non-product)
            for (const oif of otherImageFields) {
                const imgSrc = templateFields[oif.key]
                if (imgSrc && !options.referenceImages.upload) {
                    options.referenceImages.upload = imgSrc
                }
            }

            const data = await creativesAPI.generate({
                brandId: activeBrand._id,
                type: tmpl.type,
                prompt: builtPrompt,
                options,
            })

            if (data.success && data.creative) {
                setTemplateResult(data.creative)
            } else {
                setTemplateError(data.error || 'Generation failed')
            }
        } catch (err) {
            setTemplateError(err.message || 'Template generation failed')
        }
        setTemplateGenerating(false)
    }, [activeBrand, templateFields, templateRefImage, templateGenerating, aspectRatio])

    // ── Reverse Prompt Handler (analyze uploaded image to extract design formula) ──
    const handleReversePrompt = useCallback(async (imageSource, tmplId) => {
        if (!activeBrand) return
        setReversePrompting(true)
        try {
            // Determine if imageSource is a base64 data URI or a remote URL
            const isBase64 = imageSource.startsWith('data:')
            setTemplateRefImage(imageSource)

            const brandColors = activeBrand.dna?.colors?.map(c => c.hex).join(', ') || 'brand palette'
            const brandName = activeBrand.name

            const analysisPrompt = `You are an expert design analyst. Analyze this image and create a REUSABLE PROMPT FORMULA for generating new images in this exact style.

EXTRACT AND DESCRIBE:
1. BACKGROUND: What's the background? (color, gradient, texture, pattern)
2. LAYOUT: How are elements arranged? (left-right split, centered, grid, layered)
3. TYPOGRAPHY: Font style, size hierarchy, weight, colors used for text
4. COLOR SCHEME: Dominant colors and how they're applied
5. DESIGN ELEMENTS: Shapes, lines, icons, decorative elements, borders, shadows
6. PRODUCT/IMAGE PLACEMENT: Where is the main image/product placed?
7. LOGO PLACEMENT: Where and how is the brand logo placed?
8. TEXT CONTENT ZONES: Where does headline, subtext, CTA, price appear?
9. OVERALL MOOD: Professional, playful, luxury, minimal, bold, etc.

NOW CREATE A REUSABLE PROMPT FORMULA using {{PLACEHOLDERS}} for content that changes:
- {{HEADLINE}} for the main headline text
- {{SUBTEXT}} for supporting text or description
- {{CTA}} for call-to-action text
- {{PRODUCT_NAME}} for product name
- {{PRICE}} for any price shown
- {{OFFER}} for any offer/discount text
- {{PRODUCT_IMAGE}} for where the product image goes

The formula should describe the EXACT visual style, layout, colors, and design elements so that when placeholders are filled, the AI generates an image with identical design language but different content.

Brand: ${brandName}
Brand Colors: ${brandColors}

Return ONLY the prompt formula text, no explanation. Start directly with "Create a..." or "Design a..."`

            const resp = await fetch('/api/canvas-assets/ai-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: analysisPrompt,
                    ...(isBase64 ? { imageBase64: imageSource } : { imageUrl: imageSource }),
                }),
            })
            const data = await resp.json()

            if (data.description) {
                // Successfully got a prompt formula — set it as the template prompt
                setTemplatePromptPreview(data.description)
                // Also auto-fill the prompt field so user can generate immediately
                setPrompt(data.description
                    .replace(/\{\{HEADLINE\}\}/g, activeBrand.name)
                    .replace(/\{\{SUBTEXT\}\}/g, '')
                    .replace(/\{\{CTA\}\}/g, 'Shop Now')
                    .replace(/\{\{PRODUCT_NAME\}\}/g, '')
                    .replace(/\{\{PRICE\}\}/g, '')
                    .replace(/\{\{OFFER\}\}/g, '')
                    .replace(/\{\{PRODUCT_IMAGE\}\}/g, '')
                )
            } else {
                setTemplatePromptPreview(`Create a design matching this reference style for ${brandName}. Use brand colors (${brandColors}). Maintain the same layout, typography hierarchy, and visual elements. {{HEADLINE}} as the main text. {{SUBTEXT}} as supporting text. {{CTA}} as call-to-action.`)
            }
        } catch (err) {
            console.error('Reverse prompt error:', err)
            setTemplatePromptPreview(`Create a design matching the uploaded reference style for ${activeBrand.name}. Use brand colors. {{HEADLINE}} as the main text. {{SUBTEXT}} as supporting text. {{CTA}} as call-to-action.`)
        }
        setReversePrompting(false)
    }, [activeBrand])

    // ── Load custom templates for the active brand ──
    const loadCustomTemplates = useCallback(async () => {
        if (!activeBrand?._id) return
        try {
            const data = await brandsAPI.getTemplates(activeBrand._id)
            if (data.success) setSavedTemplates(data.templates || [])
        } catch (err) { console.error('Load templates error:', err) }
    }, [activeBrand])

    useEffect(() => {
        if (studioMode === 'templates' && activeBrand?._id) loadCustomTemplates()
    }, [studioMode, activeBrand, loadCustomTemplates])

    // ── Create a new custom template ──
    const handleCreateTemplate = useCallback(async () => {
        if (!activeBrand?._id || !newTmpl.label || !newTmpl.promptFormula) return
        setCreatingTemplate(true)
        try {
            const data = await brandsAPI.saveTemplate(activeBrand._id, {
                ...newTmpl,
                templateId: `custom-${Date.now()}`,
            })
            if (data.success) {
                await loadCustomTemplates()
                setShowCreateTemplate(false)
                setNewTmpl({ label: '', icon: 'auto_awesome', description: '', type: 'instagram-post', style: 'modern', promptFormula: '', referenceImageUrl: '', fields: [] })
            }
        } catch (err) { console.error('Create template error:', err) }
        setCreatingTemplate(false)
    }, [activeBrand, newTmpl, loadCustomTemplates])

    // ── Analyze image for new template creation — SMART STRUCTURED ANALYSIS ──
    const handleAnalyzeForTemplate = useCallback(async (imageSource) => {
        if (!activeBrand) return
        setAnalyzeLoading(true)
        setNewTmpl(prev => ({ ...prev, referenceImageUrl: imageSource }))
        setAnalyzedMeta({ colorPalette: [], layoutDescription: '' })

        const isBase64 = imageSource.startsWith('data:')
        const brandColors = activeBrand.dna?.colors?.map(c => c.hex).join(', ') || 'not specified'

        try {
            const token = localStorage.getItem('mantram_token') || ''
            const resp = await fetch('/api/canvas-assets/ai-analyze-template', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    ...(isBase64 ? { imageBase64: imageSource } : { imageUrl: imageSource }),
                    brandName: activeBrand.name,
                    brandColors,
                }),
            })
            const data = await resp.json()

            if (data.promptFormula) {
                // Auto-generate fields from detected elements
                const autoFields = (data.elements || []).map((el, i) => {
                    const key = el.role?.replace(/[^a-z0-9_]/gi, '_').toLowerCase() || `field_${i}`
                    const placeholder = el.type === 'image'
                        ? (el.description || 'Upload an image')
                        : (el.default || `Enter ${el.label?.toLowerCase() || 'value'}`)
                    
                    return {
                        key,
                        label: el.label || `Element ${i + 1}`,
                        type: el.type === 'color' ? 'color'
                            : el.type === 'select' ? 'select'
                            : el.type === 'image' ? 'image'
                            : el.role === 'subtext' || el.role === 'body' || el.role === 'quote' ? 'textarea'
                            : 'text',
                        placeholder,
                        default: el.default || '',
                        options: el.options || [],
                        style: el.style || '',
                        description: el.description || '',
                        _detected: true, // marker for auto-detected fields
                    }
                })

                setNewTmpl(prev => ({
                    ...prev,
                    promptFormula: data.promptFormula,
                    fields: autoFields,
                }))
                setAnalyzedMeta({
                    colorPalette: data.colorPalette || [],
                    layoutDescription: data.layoutDescription || '',
                })
                setTemplateFieldsMode('advanced') // Auto-switch to show detected elements
            } else {
                // Fallback if structured analysis failed
                setNewTmpl(prev => ({
                    ...prev,
                    promptFormula: `Create a design matching this reference style for ${activeBrand.name}. Use brand colors (${brandColors}). Maintain the same layout, typography hierarchy, and visual elements. Replace content with: {{HEADLINE}}, {{SUBTEXT}}, {{CTA}}.`,
                    fields: [
                        { key: 'headline', label: 'Headline', type: 'text', placeholder: 'Main heading text', default: '', _detected: true },
                        { key: 'subtext', label: 'Subtext', type: 'textarea', placeholder: 'Supporting text', default: '', _detected: true },
                        { key: 'cta', label: 'Call to Action', type: 'text', placeholder: 'e.g. Shop Now', default: 'Shop Now', _detected: true },
                    ]
                }))
            }
        } catch (err) {
            console.error('Template analyze error:', err)
            setNewTmpl(prev => ({
                ...prev,
                promptFormula: `Create a design matching the uploaded reference for ${activeBrand.name}. Use brand colors. {{HEADLINE}} as main text. {{SUBTEXT}} as subtext. {{CTA}} as call-to-action.`,
                fields: [
                    { key: 'headline', label: 'Headline', type: 'text', placeholder: 'Main heading text', default: '', _detected: true },
                    { key: 'subtext', label: 'Subtext', type: 'text', placeholder: 'Supporting text', default: '', _detected: true },
                    { key: 'cta', label: 'Call to Action', type: 'text', placeholder: 'e.g. Shop Now', default: 'Shop Now', _detected: true },
                ]
            }))
        }
        setAnalyzeLoading(false)
    }, [activeBrand])

    // ── Load custom categories from DB ──
    const loadCustomCategories = useCallback(async () => {
        if (!activeBrand?._id) return
        try {
            const data = await brandsAPI.getCategories(activeBrand._id)
            if (data.success) setSavedCategories(data.categories || [])
        } catch (err) { console.error('Load categories error:', err) }
    }, [activeBrand])

    useEffect(() => {
        if (studioMode === 'templates' && activeBrand?._id) {
            loadCustomCategories()
        }
    }, [studioMode, activeBrand, loadCustomCategories])

    // ── Create a new custom category ──
    const handleCreateCategory = useCallback(async () => {
        if (!activeBrand?._id || !newCat.label) return
        setCreatingCategory(true)
        try {
            const data = await brandsAPI.saveCategory(activeBrand._id, {
                label: newCat.label,
                icon: newCat.icon,
                color: newCat.color,
            })
            if (data.success) {
                await loadCustomCategories()
                setShowCreateCategory(false)
                setNewCat({ label: '', icon: 'auto_awesome', color: '#f59e0b', imageSource: 'upload' })
            }
        } catch (err) { console.error('Create category error:', err) }
        setCreatingCategory(false)
    }, [activeBrand, newCat, loadCustomCategories])

    // ── Analyze image for category creation (reverse prompting) ──
    const handleAnalyzeForCategory = useCallback(async (imageSource) => {
        if (!activeBrand) return
        setAnalyzeLoading(true)
        setNewCat(prev => ({ ...prev, referenceImageUrl: imageSource }))

        const isBase64 = imageSource.startsWith('data:')
        const brandColors = activeBrand.dna?.colors?.map(c => c.hex).join(', ') || 'not specified'

        try {
            const resp = await fetch('/api/canvas-assets/ai-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: `You are an expert design analyst. Analyze this design image and create a REUSABLE BASE PROMPT FORMULA for this template category.

Extract the visual DNA:
1. Background style (color, gradient, texture, pattern)
2. Layout structure and composition
3. Typography style, hierarchy, and colors
4. Design elements (shapes, borders, shadows, decorative elements)
5. Logo/branding placement
6. Color scheme and how colors are applied
7. Overall mood and visual theme

Create a BASE PROMPT FORMULA using {{KEYWORD}} placeholders for parts that change between sub-templates:
- {{HEADLINE}} for main text
- {{SUBTEXT}} for supporting text  
- {{CTA}} for call-to-action
- {{PRODUCT_NAME}} for product name
- {{OFFER}} for offer/discount
- {{EVENT_NAME}} for event name
- {{IMAGE}} for product/reference image

Brand: ${activeBrand.name}
Brand colors: ${brandColors}

Return ONLY the prompt formula. Start with "Create a..." or "Design a..."`,
                    ...(isBase64 ? { imageBase64: imageSource } : { imageUrl: imageSource }),
                }),
            })
            const data = await resp.json()
            if (data.description) {
                setNewCat(prev => ({ ...prev, basePromptFormula: data.description }))
            } else {
                setNewCat(prev => ({
                    ...prev,
                    basePromptFormula: `Create a design matching this reference style for ${activeBrand.name}. Brand colors: ${brandColors}. Maintain the same layout, typography, and visual elements. Replace: {{HEADLINE}}, {{SUBTEXT}}, {{CTA}}.`
                }))
            }
        } catch (err) {
            console.error('Analyze error:', err)
            setNewCat(prev => ({
                ...prev,
                basePromptFormula: `Create a design in the reference style for ${activeBrand.name}. Use brand colors. {{HEADLINE}} main text. {{SUBTEXT}} subtext. {{CTA}} call-to-action.`
            }))
        }
        setAnalyzeLoading(false)
    }, [activeBrand])

    const selectedTypeInfo = creativeTypes.find(t => t.id === selectedType)

    // ── Smart format detection from prompt ──
    const detectFormatFromPrompt = useCallback((text) => {
        const lower = text.toLowerCase()
        if (/instagram\s*(post|feed|grid)/i.test(lower)) return 'instagram-post'
        if (/story|stories|reel/i.test(lower)) return 'instagram-story'
        if (/facebook|fb\s*ad/i.test(lower)) return 'facebook-ad'
        if (/linkedin/i.test(lower)) return 'linkedin-post'
        if (/youtube|thumbnail|thumb/i.test(lower)) return 'youtube-thumb'
        if (/banner|hero|header|website/i.test(lower)) return 'banner'
        return null // keep current selection
    }, [])

    // Auto-detect format when prompt changes
    useEffect(() => {
        if (prompt.trim()) {
            const detected = detectFormatFromPrompt(prompt)
            if (detected) setSelectedType(detected)
        }
    }, [prompt, detectFormatFromPrompt])

    // Auto-lock aspect ratio when format changes
    useEffect(() => {
        const typeInfo = creativeTypes.find(t => t.id === selectedType)
        if (typeInfo?.aspectRatio) {
            setAspectRatio(typeInfo.aspectRatio)
        }
    }, [selectedType])

    return (
        <DashboardLayout title="Creative Studio" subtitle="AI-powered image generation & design">
            <SEOHead title="Creative Studio — Mantram AI" noIndex={true} />
            {/* ══ Unified Studio Navigation ══ */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel mb-6 fade-up">
                {[
                    { id: 'create', icon: 'auto_awesome', label: 'AI Create' },
                    { id: 'photoshoot', icon: 'photo_camera', label: 'Photoshoot' },
                    { id: 'templates', icon: 'dashboard_customize', label: 'Templates' },
                    { id: 'imagebank', icon: 'photo_library', label: 'Image Bank', badge: bankTotal > 0 ? bankTotal : null },
                    { id: 'canvas', icon: 'draw', label: 'AI Canvas', isNav: true },
                ].map(tab => (
                    <button key={tab.id}
                        onClick={() => {
                            if (tab.isNav) { navigate('/creative-studio/editor'); return }
                            setStudioMode(tab.id)
                            if (tab.id === 'imagebank') loadImageBank()
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                            studioMode === tab.id
                                ? 'studio-nav-pill text-white'
                                : 'text-slate-500 hover:text-slate-200 hover:bg-white/[0.04]'
                        }`}>
                        <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        {tab.badge && <span className="bg-white/15 text-[11px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>}
                    </button>
                ))}
            </div>

            {/* ====================== UNIFIED CREATE MODE ====================== */}
            {studioMode === 'create' && (
                <div className="max-w-4xl mx-auto fade-up">

                    {/* ── Hero Prompt Bar ── */}
                    <div className="glow-border rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(43,75,238,0.06), rgba(139,92,246,0.04), rgba(6,182,212,0.03))' }}>
                        {/* Subtle mesh gradient overlay */}
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(43,75,238,0.06) 0%, transparent 50%)' }} />
                        {/* Content-linked banner */}
                        {fromContent && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 mb-4">
                                <span className="material-symbols-outlined text-primary">link</span>
                                <div className="flex-1">
                                    <p className="text-sm font-bold text-white">Linked to Content Studio</p>
                                    <p className="text-sm text-slate-400">Image will match your content in {activeBrand?.name}'s brand style</p>
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
                                    <p className="text-sm font-bold text-white">📸 Using photoshoot image as base</p>
                                    <p className="text-sm text-slate-400">Describe how to adapt this for your platform</p>
                                </div>
                                <button onClick={() => setDesignBaseImage(null)} className="text-slate-500 hover:text-white cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        )}

                        {/* Product Selection Banner */}
                        {selectedProduct && (
                            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                {selectedProduct.images?.[0]?.url && (
                                    <img src={selectedProduct.images[0].url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-white truncate">{selectedProduct.title}</p>
                                    <p className="text-sm text-cyan-400">Product selected — will be featured in creative</p>
                                </div>
                                <button onClick={() => setSelectedProduct(null)} className="text-slate-500 hover:text-white cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        )}

                        {/* ── Guided References Bar (ABOVE prompt for guided flow) ── */}
                        <div className="mb-4 p-3 rounded-2xl bg-gradient-to-r from-violet-500/[0.04] to-cyan-500/[0.04] border border-white/[0.06]">
                            <div className="flex items-center justify-between mb-2.5">
                                <p className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm text-violet-400">collections</span>
                                    References
                                </p>
                                <span className="text-[9px] text-slate-600">Add images before writing your prompt</span>
                            </div>
                            <div className="flex gap-2 items-start">
                                {/* Style Ref */}
                                {referenceImages.style ? (
                                    <div className="relative flex-shrink-0">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-amber-500/40">
                                            <img src={referenceImages.style} alt="Style" className="w-full h-full object-cover" />
                                        </div>
                                        <button onClick={() => setReferenceImages(prev => ({ ...prev, style: null }))}
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center cursor-pointer">×</button>
                                        <span className="block text-[8px] text-amber-400 text-center mt-0.5 font-bold">Style</span>
                                    </div>
                                ) : (
                                    <button onClick={() => { setRefPickerSlot('style'); setRefPickerTab('upload') }}
                                        className="flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/40 flex flex-col items-center justify-center cursor-pointer transition-colors bg-amber-500/[0.03] group">
                                        <span className="material-symbols-outlined text-base text-slate-600 group-hover:text-amber-400">brush</span>
                                        <span className="text-[8px] text-slate-600 group-hover:text-amber-400 font-bold">Style</span>
                                    </button>
                                )}

                                {/* Characters — dynamic */}
                                <div className="flex gap-1.5 items-start flex-wrap flex-1 min-w-0">
                                    {characters.map((char, idx) => (
                                        <div key={idx} className="relative flex-shrink-0 group">
                                            <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-violet-500/40">
                                                <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                                            </div>
                                            <button onClick={() => setCharacters(prev => prev.filter((_, i) => i !== idx))}
                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">×</button>
                                            <input
                                                value={char.name}
                                                onChange={e => setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                                                className="w-14 mt-0.5 text-[8px] text-center bg-transparent text-violet-300 outline-none font-bold truncate"
                                                placeholder="Name"
                                            />
                                        </div>
                                    ))}
                                    {characters.length < 5 && (
                                        <button onClick={() => { setRefPickerSlot(`character-${characters.length}`); setRefPickerTab('upload') }}
                                            className="flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-violet-500/20 hover:border-violet-500/40 flex flex-col items-center justify-center cursor-pointer transition-colors bg-violet-500/[0.03] group">
                                            <span className="material-symbols-outlined text-base text-slate-600 group-hover:text-violet-400">person_add</span>
                                            <span className="text-[8px] text-slate-600 group-hover:text-violet-400 font-bold">Character</span>
                                        </button>
                                    )}
                                </div>

                                {/* Upload Ref */}
                                {referenceImages.upload ? (
                                    <div className="relative flex-shrink-0">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-cyan-500/40">
                                            <img src={referenceImages.upload} alt="Ref" className="w-full h-full object-cover" />
                                        </div>
                                        <button onClick={() => setReferenceImages(prev => ({ ...prev, upload: null }))}
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center cursor-pointer">×</button>
                                        <span className="block text-[8px] text-cyan-400 text-center mt-0.5 font-bold">Upload</span>
                                    </div>
                                ) : (
                                    <button onClick={() => { setRefPickerSlot('upload'); setRefPickerTab('upload') }}
                                        className="flex-shrink-0 w-14 h-14 rounded-xl border-2 border-dashed border-cyan-500/20 hover:border-cyan-500/40 flex flex-col items-center justify-center cursor-pointer transition-colors bg-cyan-500/[0.03] group">
                                        <span className="material-symbols-outlined text-base text-slate-600 group-hover:text-cyan-400">add_photo_alternate</span>
                                        <span className="text-[8px] text-slate-600 group-hover:text-cyan-400 font-bold">Upload</span>
                                    </button>
                                )}
                            </div>
                            {characters.length > 0 && (
                                <p className="text-[9px] text-violet-400/60 mt-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[10px]">info</span>
                                    Type <span className="font-bold text-violet-400">@name</span> in prompt to tag characters
                                </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5 mb-4 relative">
                            <span className="material-symbols-outlined text-3xl text-gradient">auto_awesome</span>
                            <h3 className="text-xl font-extrabold text-gradient">Describe your vision</h3>
                        </div>

                        <div className="relative mb-3">
                            <textarea
                                value={prompt}
                                onChange={e => {
                                    const val = e.target.value
                                    setPrompt(val)
                                    // Detect if user just typed @
                                    const cursor = e.target.selectionStart
                                    const textBefore = val.substring(0, cursor)
                                    const atMatch = textBefore.match(/@(\w*)$/)
                                    if (atMatch && characters.length > 0) {
                                        setShowCharTags(true)
                                        setCharTagFilter(atMatch[1].toLowerCase())
                                    } else {
                                        setShowCharTags(false)
                                    }
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey && !showCharTags) { e.preventDefault(); handleGenerate() }
                                    if (e.key === 'Escape') setShowCharTags(false)
                                }}
                                placeholder={activeBrand
                                    ? `Describe your visual... e.g. "Instagram post with @Character1 in a summer scene" 🎤`
                                    : "Create a brand first to start generating visuals"}
                                disabled={!activeBrand || generating}
                                className="input-glass w-full resize-none py-4 pr-14 disabled:opacity-30 text-white text-base"
                                rows={3}
                                autoFocus
                                ref={promptTextareaRef}
                            />

                            {/* @character tag autocomplete dropdown */}
                            {showCharTags && characters.length > 0 && (
                                <div className="absolute left-4 bottom-full mb-1 bg-[#1a1a2e] border border-violet-500/30 rounded-xl shadow-2xl shadow-violet-500/10 p-2 z-50 min-w-[200px] animate-fade-in">
                                    <p className="text-[10px] text-slate-500 mb-1.5 px-2">Tag a character</p>
                                    {characters
                                        .filter(c => !charTagFilter || c.name.toLowerCase().includes(charTagFilter))
                                        .map((char, idx) => (
                                            <button key={idx} onClick={() => {
                                                // Replace the @partial with @CharacterName
                                                const textarea = promptTextareaRef.current
                                                if (!textarea) return
                                                const cursor = textarea.selectionStart
                                                const textBefore = prompt.substring(0, cursor)
                                                const textAfter = prompt.substring(cursor)
                                                const tagName = char.name.replace(/\s/g, '')
                                                const newBefore = textBefore.replace(/@\w*$/, `@${tagName} `)
                                                setPrompt(newBefore + textAfter)
                                                setShowCharTags(false)
                                                setTimeout(() => {
                                                    textarea.focus()
                                                    textarea.selectionStart = textarea.selectionEnd = newBefore.length
                                                }, 50)
                                            }}
                                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-violet-500/15 cursor-pointer transition-colors text-left">
                                                <img src={char.image} alt={char.name} className="w-6 h-6 rounded-full object-cover border border-violet-500/30" />
                                                <div>
                                                    <span className="text-xs font-bold text-white">{char.name}</span>
                                                    <span className="text-[10px] text-violet-400 ml-1.5">@{char.name.replace(/\s/g, '')}</span>
                                                </div>
                                            </button>
                                        ))}
                                </div>
                            )}
                            <div className="absolute right-3 top-3">
                                <VoiceInput
                                    onResult={(text) => setPrompt(prev => prev ? prev + ' ' + text : text)}
                                    size="small"
                                />
                            </div>
                        </div>

                        {/* Enhance Prompt Button */}
                        {prompt.trim() && (
                            <div className="flex items-center gap-2.5 mb-3 -mt-1">
                                <button onClick={handleEnhancePrompt} disabled={enhancing || !activeBrand}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${enhancing
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        : 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-400 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/20 hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10'}`}>
                                    <span className={`material-symbols-outlined text-base ${enhancing ? 'animate-spin' : ''}`}>
                                        {enhancing ? 'progress_activity' : 'auto_awesome'}
                                    </span>
                                    {enhancing ? 'Enhancing...' : '✨ Enhance with AI'}
                                </button>
                                <span className="text-xs text-slate-500">Makes your prompt detailed & brand-aware</span>
                            </div>
                        )}

                        {/* Quick-insert character tags */}
                        {characters.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-3 -mt-1 flex-wrap">
                                <span className="text-[10px] text-slate-600 mr-0.5">Tag:</span>
                                {characters.map((char, idx) => {
                                    const tagName = char.name.replace(/\s/g, '')
                                    return (
                                        <button key={idx} onClick={() => {
                                            const textarea = promptTextareaRef.current
                                            const cursor = textarea?.selectionStart ?? prompt.length
                                            const before = prompt.substring(0, cursor)
                                            const after = prompt.substring(cursor)
                                            setPrompt(before + `@${tagName} ` + after)
                                            setTimeout(() => textarea?.focus(), 50)
                                        }}
                                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-bold hover:bg-violet-500/20 border border-violet-500/15 cursor-pointer transition-all">
                                            <img src={char.image} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                                            @{tagName}
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        {/* Auto-detected format badge */}
                        {prompt.trim() && selectedTypeInfo && (
                            <div className="flex items-center gap-2 mb-3 animate-fade-in">
                                <span className="text-xs text-slate-500">Format:</span>
                                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                    <span className="material-symbols-outlined text-xs align-middle mr-0.5">{selectedTypeInfo.icon}</span>
                                    {selectedTypeInfo.label} ({selectedTypeInfo.size})
                                </span>
                                <button onClick={() => setShowAdvanced(true)} className="text-xs text-slate-600 hover:text-white cursor-pointer underline underline-offset-2">change</button>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <CreditTooltipWrapper action="creative">
                                <button onClick={handleGenerate} disabled={!prompt.trim() || !activeBrand || generating}
                                    className="btn-primary flex-1 py-3.5 px-6 rounded-xl disabled:opacity-30 justify-center text-base font-bold cursor-pointer">
                                    {generating ? (
                                        <><span className="material-symbols-outlined animate-spin">progress_activity</span> Generating...</>
                                    ) : (
                                        <><span className="material-symbols-outlined">auto_awesome</span> Generate <CreditBadge action="creative" /></>
                                    )}
                                </button>
                            </CreditTooltipWrapper>
                            <button onClick={() => setShowAdvanced(!showAdvanced)}
                                className={`px-4 py-3.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 ${showAdvanced ? 'bg-white/10 text-white border border-white/20' : 'glass-panel text-slate-400 hover:text-white'}`}>
                                <span className="material-symbols-outlined text-sm">tune</span>
                                {showAdvanced ? 'Hide' : 'Options'}
                            </button>
                            <button onClick={() => {
                                if (activeBrand?._id) {
                                    productsAPI.list({ brandId: activeBrand._id, limit: 50 })
                                        .then(res => setProductsList(res.products || []))
                                        .catch(() => { })
                                }
                                setShowProductPicker(true)
                            }}
                                className="px-4 py-3.5 rounded-xl text-sm font-bold glass-panel text-slate-400 hover:text-cyan-400 transition-all cursor-pointer flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm">inventory_2</span>
                            </button>
                        </div>
                    </div>

                    {/* ── Collapsible Advanced Options Drawer ── */}
                    {showAdvanced && (
                        <div className="studio-card p-5 mb-6 fade-up space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-sm">tune</span>
                                    Advanced Options
                                </h4>
                                <button onClick={() => setShowAdvanced(false)} className="text-slate-500 hover:text-white cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>

                            {/* Format */}
                            <div>
                                <p className="text-xs font-bold text-slate-400 mb-2">Format</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {creativeTypes.map(ct => (
                                        <button key={ct.id} onClick={() => setSelectedType(ct.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${selectedType === ct.id
                                                ? 'bg-primary/20 text-primary border border-primary/30'
                                                : 'bg-white/[0.04] text-slate-400 hover:text-white border border-transparent'}`}>
                                            <span className="material-symbols-outlined text-xs">{ct.icon}</span>
                                            {ct.label}
                                            <span className="text-[9px] opacity-60">{ct.size}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Style + Ratio Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-2">Style</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {styles.map(s => (
                                            <button key={s.id} onClick={() => setStyle(s.id)}
                                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${style === s.id
                                                    ? 'bg-primary text-white'
                                                    : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
                                                <span className="material-symbols-outlined text-xs">{s.icon}</span>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-2">Aspect Ratio</p>
                                    {selectedTypeInfo?.aspectRatio ? (
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/20 text-primary border border-primary/30 flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-xs">lock</span>
                                                {selectedTypeInfo.aspectRatio}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                Locked by {selectedTypeInfo.label} ({selectedTypeInfo.size})
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-1.5">
                                            {ASPECT_RATIOS.map(ar => (
                                                <button key={ar.ratio} onClick={() => setAspectRatio(ar.ratio)}
                                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${aspectRatio === ar.ratio
                                                        ? 'bg-primary text-white'
                                                        : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
                                                    {ar.icon} {ar.ratio}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Text Overlay + Logo Row */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 mb-2">Text Overlay</p>
                                    <input value={textOverlay} onChange={e => setTextOverlay(e.target.value)}
                                        placeholder="Text to appear on the creative..."
                                        className="input-glass w-full py-2 text-sm" />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-bold text-slate-400">Brand Logo</p>
                                        <button onClick={() => setAddLogo(!addLogo)}
                                            className={`w-9 h-5 rounded-full transition-all cursor-pointer ${addLogo ? 'bg-primary' : 'bg-white/[0.1]'}`}>
                                            <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${addLogo ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                    {addLogo && (
                                        <div className="flex items-center gap-3">
                                            <div className="grid grid-cols-3 gap-0.5 w-14">
                                                {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(pos => (
                                                    <button key={pos} onClick={() => setLogoPosition(pos)}
                                                        className={`w-4 h-4 rounded transition-all cursor-pointer ${logoPosition === pos ? 'bg-primary' : 'bg-white/[0.06] hover:bg-white/[0.1]'}`} />
                                                ))}
                                            </div>
                                            <div className="flex gap-1">
                                                {['small', 'medium', 'large'].map(s => (
                                                    <button key={s} onClick={() => setLogoSize(s)}
                                                        className={`px-2 py-1 rounded text-[10px] font-bold capitalize cursor-pointer ${logoSize === s ? 'bg-primary text-white' : 'bg-white/[0.04] text-slate-500'}`}>
                                                        {s[0].toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Reference images are now in the top References Bar */}
                            <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                <span className="material-symbols-outlined text-sm text-violet-400">collections</span>
                                <p className="text-[11px] text-slate-500">
                                    References (Style, Characters, Upload) are at the <strong className="text-white">top of the panel</strong>
                                </p>
                            </div>

                            {/* Brand Colors */}
                            {activeBrand?.dna?.colors?.length > 0 && (
                                <div className="pt-2 border-t border-white/[0.05]">
                                    <p className="text-xs text-slate-500 mb-1.5">Brand Colors (auto-applied)</p>
                                    <div className="flex gap-1.5">
                                        {activeBrand.dna.colors.map((c, i) => (
                                            <div key={i} className="w-6 h-6 rounded-lg border border-white/[0.1]" style={{ background: c.hex }} title={c.hex} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Inline Template Form (when a quickstart card with fields is active) ── */}
                    {activeQuickTemplate && (
                        <div className="studio-card p-5 mb-6 fade-up border border-primary/10">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">{activeQuickTemplate.icon}</span>
                                    <h4 className="text-sm font-bold text-white">{activeQuickTemplate.label}</h4>
                                    <span className="text-xs text-slate-500">— fill in the details below</span>
                                </div>
                                <button onClick={() => { setActiveQuickTemplate(null); setTemplateFields({}) }}
                                    className="text-slate-500 hover:text-white cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {activeQuickTemplate.fields?.filter(f => f.type !== 'image').map(field => (
                                    <div key={field.key}>
                                        <label className="text-xs font-bold text-slate-400 mb-1 block">{field.label}</label>
                                        {field.type === 'select' ? (
                                            <select value={templateFields[field.key] || ''} onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                className="input-glass w-full py-2 text-sm">
                                                <option value="">Choose...</option>
                                                {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        ) : field.type === 'textarea' ? (
                                            <textarea value={templateFields[field.key] || ''} onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                placeholder={field.placeholder} className="input-glass w-full py-2 text-sm resize-none" rows={2} />
                                        ) : (
                                            <input value={templateFields[field.key] || ''} onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                placeholder={field.placeholder} className="input-glass w-full py-2 text-sm" />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => {
                                const built = activeQuickTemplate.buildPrompt(activeBrand, templateFields)
                                setPrompt(built)
                                setActiveQuickTemplate(null)
                            }}
                                className="mt-4 btn-primary py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer w-full justify-center">
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                Apply to Prompt
                            </button>
                        </div>
                    )}

                    {/* ── Error ── */}
                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                            <span className="material-symbols-outlined text-sm align-middle mr-1">error</span> {error}
                        </div>
                    )}

                    {/* ── Result Area ── */}
                    {result && !generating && (
                        <div className="studio-card p-6 mb-6 fade-up">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white">{result.title || 'Generated Creative'}</h3>
                                    <p className="text-sm text-slate-400">{selectedTypeInfo?.label} • {selectedTypeInfo?.size} • {style}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleFeedback('thumbs', { thumbs: 'up' })}
                                        className={`btn-glass p-2 rounded-xl cursor-pointer transition-all ${feedbackState === 'liked' ? 'text-emerald-400 bg-emerald-400/15 border border-emerald-400/30 scale-110' : 'text-slate-400 hover:text-emerald-400'}`}>
                                        <span className="material-symbols-outlined">thumb_up</span>
                                    </button>
                                    <button onClick={() => handleFeedback('thumbs', { thumbs: 'down' })}
                                        className={`btn-glass p-2 rounded-xl cursor-pointer transition-all ${feedbackState === 'disliked' ? 'text-rose-400 bg-rose-400/15 border border-rose-400/30 scale-110' : 'text-slate-400 hover:text-rose-400'}`}>
                                        <span className="material-symbols-outlined">thumb_down</span>
                                    </button>
                                    <button onClick={handleGenerate} className="btn-glass p-2 rounded-xl text-slate-400 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined">refresh</span>
                                    </button>
                                </div>
                            </div>

                            {/* Display area — respects actual aspect ratio */}
                            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-pointer group"
                                style={{ maxHeight: '600px' }}
                                onClick={() => result.imageUrl && setZoomImage(result.imageUrl)}>
                                {result.imageUrl ? (
                                    <>
                                        <img src={result.imageUrl} alt={result.title || 'Generated creative'} loading="lazy" decoding="async"
                                            className="w-full h-auto object-contain"
                                            style={{ maxHeight: '600px' }}
                                            onError={(e) => { e.target.style.display = 'none'; }} />
                                        {/* Zoom overlay */}
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <span className="material-symbols-outlined text-3xl text-white bg-black/50 rounded-full p-2">zoom_in</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-8 text-center"
                                        style={{ aspectRatio: aspectRatio?.replace(':', '/') || '1/1', background: `linear-gradient(135deg, ${activeBrand?.dna?.colors?.[0]?.hex || '#2B4BEE'}40, ${activeBrand?.dna?.colors?.[1]?.hex || '#8B5CF6'}40)` }}>
                                        <span className="material-symbols-outlined text-6xl text-white/20 mb-4 block">image</span>
                                        <p className="text-white font-bold text-lg mb-2">{textOverlay || result.title || prompt.substring(0, 40)}</p>
                                        <p className="text-sm text-white/50">{activeBrand?.name}</p>
                                    </div>
                                )}
                            </div>

                            {result.aiMeta && (
                                <div className="flex items-center gap-4 mt-4 text-sm text-slate-500">
                                    <span>Provider: {result.aiMeta.provider}</span>
                                    <span>Model: {result.aiMeta.model}</span>
                                    {result.aiMeta.brandAlignmentScore && (
                                        <span className="text-emerald-400 font-bold">{result.aiMeta.brandAlignmentScore}% Brand Match</span>
                                    )}
                                </div>
                            )}

                            {feedbackToast && (
                                <div className="mt-3 py-2 px-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium text-center animate-fade-in">
                                    {feedbackToast}
                                </div>
                            )}

                            <div className="flex gap-3 mt-4">
                                <button onClick={() => handleFeedback('accept')}
                                    className={`py-2.5 px-6 rounded-xl text-sm flex-1 transition-all duration-200 cursor-pointer ${feedbackState === 'accepted' ? 'bg-emerald-500 text-white font-bold' : 'btn-primary'}`}>
                                    <span className="material-symbols-outlined text-sm">{feedbackState === 'accepted' ? 'check_circle' : 'check'}</span>
                                    {feedbackState === 'accepted' ? ' Accepted ✓' : ' Accept'}
                                </button>
                                <button onClick={() => {
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
                                <button onClick={() => setPublishData({ image: result?.imageUrl, text: result?.title || '' })}
                                    className="btn-glass py-2.5 px-6 rounded-xl text-sm font-bold bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 border border-[#1877F2]/30 cursor-pointer transition-all">
                                    <span className="material-symbols-outlined text-sm">share</span> Publish
                                </button>
                            </div>

                            {/* Open Canvas Editor */}
                            {result?.imageUrl && (
                                <button onClick={() => {
                                    const typeInfo = creativeTypes.find(t => t.id === selectedType)
                                    const [w, h] = (typeInfo?.size || '1080×1080').split('×').map(Number)
                                    sessionStorage.setItem('canvasEditorImage', result.imageUrl)
                                    navigate(`/creative-studio/editor?w=${w}&h=${h}`)
                                }}
                                    className="w-full mt-3 py-3 px-6 rounded-xl text-base font-bold text-white cursor-pointer transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg, #2563eb, #6366f1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                                    <span className="material-symbols-outlined">edit</span>
                                    Open Canvas Editor
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── Action Cards — Only shown when no result and prompt is empty ── */}
                    {!result && !generating && !prompt.trim() && (
                        <div className="fade-up-2">
                            <p className="text-sm text-slate-500 text-center mb-5 font-medium">— or choose a starting point —</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {/* Quick-create cards that pre-fill prompts */}
                                {[
                                    {
                                        id: 'social', icon: 'share', label: 'Social Media Post', desc: 'Instagram, Facebook, LinkedIn', color: '#6366f1',
                                        prompt: `Create a visually stunning social media post for ${activeBrand?.name || 'the brand'}. Make it eye-catching, on-brand, and shareable. Include a catchy headline and professional layout.`
                                    },
                                    {
                                        id: 'product', icon: 'inventory_2', label: 'Product Showcase', desc: 'Feature your product beautifully', color: '#f59e0b',
                                        prompt: `Create a premium product showcase for ${activeBrand?.name || 'the brand'}. Feature the product prominently with brand colors, modern layout, and a subtle call-to-action.`
                                    },
                                    {
                                        id: 'promo', icon: 'local_offer', label: 'Sale / Offer', desc: 'Discounts, deals, promotions', color: '#ef4444',
                                        template: templateCategories.find(c => c.id === 'sales')?.subTemplates?.[0]
                                    },
                                    {
                                        id: 'quote', icon: 'format_quote', label: 'Quote / Testimonial', desc: 'Reviews and brand quotes', color: '#10b981',
                                        template: templateCategories.find(c => c.id === 'quotes')?.subTemplates?.[0]
                                    },
                                    {
                                        id: 'announce', icon: 'campaign', label: 'Announcement', desc: 'Launches, updates, news', color: '#8b5cf6',
                                        template: templateCategories.find(c => c.id === 'announcement')?.subTemplates?.[0]
                                    },
                                    {
                                        id: 'event', icon: 'event', label: 'Event Promo', desc: 'Events, birthdays, milestones', color: '#ec4899',
                                        template: templateCategories.find(c => c.id === 'events')?.subTemplates?.[0]
                                    },
                                    {
                                        id: 'info', icon: 'analytics', label: 'Infographic', desc: 'Data, tips, educational', color: '#0ea5e9',
                                        template: templateCategories.find(c => c.id === 'content')?.subTemplates?.[0]
                                    },
                                    {
                                        id: 'story', icon: 'auto_stories', label: 'Brand Story', desc: 'Tell your brand narrative', color: '#f97316',
                                        prompt: `Create a compelling brand story visual for ${activeBrand?.name || 'the brand'}. Tell the brand narrative through imagery, use brand colors, and convey authenticity with a warm, premium feel.`
                                    },
                                ].map((card, idx) => (
                                    <button key={card.id} onClick={() => {
                                        if (card.template && card.template.fields?.length > 0) {
                                            setActiveQuickTemplate(card.template)
                                            setTemplateFields({})
                                        } else if (card.prompt) {
                                            setPrompt(card.prompt)
                                        }
                                    }}
                                        className={`studio-card flex flex-col items-center gap-2.5 p-5 cursor-pointer group text-center fade-up-${Math.min(idx + 1, 5)}`}>
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-lg" style={{ background: `linear-gradient(135deg, ${card.color}30, ${card.color}10)`, boxShadow: `0 4px 15px ${card.color}15` }}>
                                            <span className="material-symbols-outlined text-2xl" style={{ color: card.color }}>{card.icon}</span>
                                        </div>
                                        <p className="text-sm font-bold text-white group-hover:text-primary transition-colors">{card.label}</p>
                                        <p className="text-xs text-slate-500 leading-relaxed">{card.desc}</p>
                                    </button>
                                ))}
                            </div>

                        </div>
                    )}
                </div>
            )}


            {/* =================== AI PHOTOSHOOT MODE =================== */}
            {studioMode === 'photoshoot' && (
                <div className="grid grid-cols-12 gap-6 fade-up">

                    {/* Recent Photoshoots */}
                    {(() => {
                        const recentPhotoshoots = bankImages.filter(i => i.type === 'ai-photoshoot' || i.type === 'photoshoot').slice(0, 8);
                        if (recentPhotoshoots.length === 0) return null;
                        const getTimeAgo = (d) => {
                            if (!d) return '';
                            const diff = Date.now() - new Date(d).getTime();
                            const m = Math.floor(diff / 60000);
                            if (m < 1) return 'just now';
                            if (m < 60) return `${m}m ago`;
                            const h = Math.floor(m / 60);
                            if (h < 24) return `${h}h ago`;
                            const dy = Math.floor(h / 24);
                            if (dy < 7) return `${dy}d ago`;
                            return new Date(d).toLocaleDateString();
                        };
                        return (
                            <div className="col-span-12 studio-card p-5 mb-1 fade-up-1">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-400 text-lg">history</span>
                                        Recent Photoshoots
                                        <span className="text-xs text-slate-500 font-normal">({recentPhotoshoots.length})</span>
                                    </h4>
                                </div>
                                <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
                                    {recentPhotoshoots.map(img => (
                                        <div key={img._id} className="flex-shrink-0 w-48 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.12] overflow-hidden group transition-all cursor-pointer"
                                            onClick={() => {
                                                if (img.prompt) { setPhotoshootBrief(img.prompt); setSceneKeywords(img.tags || []) }
                                            }}>
                                            <div className="relative h-24 overflow-hidden">
                                                <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Photoshoot'} loading="lazy"
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                <div className="absolute bottom-1.5 left-2 right-2">
                                                    <p className="text-white text-[10px] font-medium truncate">{img.prompt ? (img.prompt.length > 40 ? img.prompt.slice(0, 40) + '…' : img.prompt) : 'Photoshoot'}</p>
                                                    <p className="text-slate-400 text-[9px]">{getTimeAgo(img.createdAt)}</p>
                                                </div>
                                            </div>
                                            <div className="px-2 py-1.5 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-amber-400 text-xs">replay</span>
                                                <span className="text-[10px] text-slate-400 font-medium">Refill</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })()}
                    {/* Left — Photoshoot Controls */}
                    <div className="col-span-12 lg:col-span-5 space-y-5 fade-up-2">
                        {/* Product Image Upload */}
                        <div className="studio-card p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary text-xl">add_a_photo</span>
                                Product Image
                            </h3>

                            {!productImage ? (
                                <div>
                                    {/* Clean drop zone */}
                                    <div onDrop={(e) => {
                                        e.preventDefault()
                                        const file = e.dataTransfer?.files?.[0]
                                        if (file && file.type.startsWith('image/')) {
                                            setProductFile(file)
                                            const reader = new FileReader()
                                            reader.onload = async (ev) => {
                                                const s3Url = await uploadToS3(ev.target.result, 'products')
                                                setProductImage(s3Url)
                                            }
                                            reader.readAsDataURL(file)
                                        }
                                    }} onDragOver={e => e.preventDefault()}
                                        className="border-2 border-dashed border-white/[0.1] rounded-2xl p-5 text-center hover:border-primary/40 transition-colors mb-3">
                                        <span className="material-symbols-outlined text-3xl text-slate-600 mb-1 block">add_photo_alternate</span>
                                        <p className="text-slate-400 text-xs">Drag & drop product image here</p>
                                    </div>
                                    {/* 3 action buttons */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => { setProductPickerTab('brand'); setProductPickerOpen(true) }}
                                            className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-emerald-400/40 hover:bg-emerald-500/5 transition-all cursor-pointer group">
                                            <span className="material-symbols-outlined text-base text-emerald-400 group-hover:scale-110 transition-transform">domain</span>
                                            <span className="text-[10px] text-slate-400 font-medium">Brand Photos</span>
                                        </button>
                                        <label className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group">
                                            <span className="material-symbols-outlined text-base text-primary group-hover:scale-110 transition-transform">upload</span>
                                            <span className="text-[10px] text-slate-400 font-medium">Upload</span>
                                            <input type="file" className="hidden" onChange={(e) => {
                                                const file = e.target.files?.[0]
                                                if (file && file.type.startsWith('image/')) {
                                                    setProductFile(file)
                                                    const reader = new FileReader()
                                                    reader.onload = async (ev) => {
                                                        const s3Url = await uploadToS3(ev.target.result, 'products')
                                                        setProductImage(s3Url)
                                                    }
                                                    reader.readAsDataURL(file)
                                                }
                                            }} accept="image/*" />
                                        </label>
                                        <button onClick={() => { setProductPickerTab('link'); setProductPickerOpen(true) }}
                                            className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-violet-400/40 hover:bg-violet-500/5 transition-all cursor-pointer group">
                                            <span className="material-symbols-outlined text-base text-violet-400 group-hover:scale-110 transition-transform">link</span>
                                            <span className="text-[10px] text-slate-400 font-medium">Paste Link</span>
                                        </button>
                                    </div>
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
                                            <span className="text-sm text-white">{productFile.name}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ══ Product Image Picker Modal ══ */}
                        {productPickerOpen && (
                            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setProductPickerOpen(false)}>
                                <div className="bg-[#0f1729] border border-white/10 rounded-2xl w-full max-w-lg mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/[0.06]">
                                        <h3 className="text-white font-bold text-sm">Select Product Image</h3>
                                        <button onClick={() => setProductPickerOpen(false)} className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer">
                                            <span className="material-symbols-outlined text-lg">close</span>
                                        </button>
                                    </div>
                                    {/* Tabs */}
                                    <div className="flex border-b border-white/[0.06]">
                                        {[
                                            { id: 'brand', icon: 'domain', label: 'Brand Photos', color: 'text-emerald-400' },
                                            { id: 'upload', icon: 'upload', label: 'Upload', color: 'text-primary' },
                                            { id: 'link', icon: 'link', label: 'Paste Link', color: 'text-violet-400' },
                                        ].map(tab => (
                                            <button key={tab.id} onClick={() => setProductPickerTab(tab.id)}
                                                className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${productPickerTab === tab.id ? `${tab.color} border-b-2 border-current bg-white/[0.03]` : 'text-slate-500 hover:text-slate-300'}`}>
                                                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>
                                    {/* Tab Content */}
                                    <div className="p-5 max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {/* Brand Photos */}
                                        {productPickerTab === 'brand' && (() => {
                                            const imgSet = new Set()
                                            const allBrandPhotos = []
                                            if (activeBrand?.dna?.logo?.url) {
                                                imgSet.add(activeBrand.dna.logo.url)
                                                allBrandPhotos.push({ url: activeBrand.dna.logo.url, alt: 'Brand Logo' })
                                            }
                                            brandImages.forEach(img => {
                                                if (img?.url && !imgSet.has(img.url)) {
                                                    imgSet.add(img.url)
                                                    allBrandPhotos.push(img)
                                                }
                                            })
                                            ;(activeBrand?.dna?.brandImages || []).forEach(img => {
                                                if (img?.url && !imgSet.has(img.url)) {
                                                    imgSet.add(img.url)
                                                    allBrandPhotos.push(img)
                                                }
                                            })
                                            return allBrandPhotos.length > 0 ? (
                                                <div className="grid grid-cols-4 gap-3">
                                                    {allBrandPhotos.map((img, i) => (
                                                        <button key={`bpm-${i}`}
                                                            onClick={() => {
                                                                setProductImage(img.url)
                                                                setProductFile(null)
                                                                setProductPickerOpen(false)
                                                            }}
                                                            className="aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-primary/60 cursor-pointer transition-all hover:scale-[1.03] group relative">
                                                            <img src={img.url} alt={img.alt || `Brand ${i + 1}`} className="w-full h-full object-cover" />
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                                <span className="material-symbols-outlined text-white text-lg">check_circle</span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-center py-10">
                                                    <span className="material-symbols-outlined text-3xl text-slate-600 mb-2 block">photo_library</span>
                                                    <p className="text-sm text-slate-500">No brand photos available</p>
                                                    <p className="text-xs text-slate-600 mt-1">Scan a website during onboarding to auto-fetch brand images</p>
                                                </div>
                                            )
                                        })()}
                                        {/* Upload */}
                                        {productPickerTab === 'upload' && (
                                            <div className="text-center py-6">
                                                <div onDrop={(e) => {
                                                    e.preventDefault()
                                                    const file = e.dataTransfer?.files?.[0]
                                                    if (file && file.type.startsWith('image/')) {
                                                        setProductFile(file)
                                                        const reader = new FileReader()
                                                        reader.onload = async (ev) => {
                                                            const s3Url = await uploadToS3(ev.target.result, 'products')
                                                            setProductImage(s3Url)
                                                            setProductPickerOpen(false)
                                                        }
                                                        reader.readAsDataURL(file)
                                                    }
                                                }} onDragOver={e => e.preventDefault()}
                                                    className="border-2 border-dashed border-white/[0.1] rounded-2xl p-10 hover:border-primary/40 transition-colors mb-4">
                                                    <span className="material-symbols-outlined text-5xl text-slate-600 mb-3 block">cloud_upload</span>
                                                    <p className="text-slate-400 text-sm mb-1">Drag & drop your image</p>
                                                    <p className="text-xs text-slate-600">PNG, JPG, WEBP up to 10MB</p>
                                                </div>
                                                <label className="btn-primary py-2.5 px-8 rounded-xl text-sm cursor-pointer inline-block">
                                                    Choose File
                                                    <input type="file" className="hidden" onChange={(e) => {
                                                        const file = e.target.files?.[0]
                                                        if (file && file.type.startsWith('image/')) {
                                                            setProductFile(file)
                                                            const reader = new FileReader()
                                                            reader.onload = async (ev) => {
                                                                const s3Url = await uploadToS3(ev.target.result, 'products')
                                                                setProductImage(s3Url)
                                                                setProductPickerOpen(false)
                                                            }
                                                            reader.readAsDataURL(file)
                                                        }
                                                    }} accept="image/*" />
                                                </label>
                                            </div>
                                        )}
                                        {/* Paste Link */}
                                        {productPickerTab === 'link' && (
                                            <div className="space-y-4">
                                                <p className="text-xs text-slate-500">Paste a direct image URL (PNG, JPG, WEBP)</p>
                                                <div className="flex gap-2">
                                                    <input type="text" value={productLinkUrl} onChange={e => setProductLinkUrl(e.target.value)}
                                                        placeholder="https://example.com/product.jpg"
                                                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-primary/40"
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && productLinkUrl.trim()) {
                                                                setProductImage(productLinkUrl.trim())
                                                                setProductFile(null)
                                                                setProductPickerOpen(false)
                                                                setProductLinkUrl('')
                                                            }
                                                        }} />
                                                    <button onClick={() => {
                                                        if (productLinkUrl.trim()) {
                                                            setProductImage(productLinkUrl.trim())
                                                            setProductFile(null)
                                                            setProductPickerOpen(false)
                                                            setProductLinkUrl('')
                                                        }
                                                    }}
                                                        disabled={!productLinkUrl.trim()}
                                                        className="px-5 py-2.5 btn-primary rounded-xl text-sm disabled:opacity-30 cursor-pointer">
                                                        Use
                                                    </button>
                                                </div>
                                                {productLinkUrl.trim() && (
                                                    <div className="rounded-xl overflow-hidden border border-white/10 max-h-48">
                                                        <img src={productLinkUrl.trim()} alt="Preview"
                                                            className="w-full h-full object-contain bg-black/20"
                                                            onError={e => { e.target.style.display = 'none' }} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Style & Character References (for Photoshoot) ── */}
                        <div className="studio-card p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-xl">image_search</span>
                                Style & Character
                                <span className="text-xs text-slate-500 bg-white/[0.05] px-2 py-0.5 rounded-full ml-auto">Optional</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                            <button onClick={() => { setRefPickerSlot(ref.key); setRefPickerTab('upload') }}
                                                className="w-full flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/40 cursor-pointer transition-colors bg-white/[0.02] group">
                                                <span className="material-symbols-outlined text-lg text-slate-600 group-hover:text-primary mb-0.5">{ref.icon}</span>
                                                <span className="text-sm text-slate-500 font-medium">{ref.label}</span>
                                                <span className="text-[8px] text-slate-600">{ref.hint}</span>
                                                <span className="text-[8px] text-slate-600 mt-1 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[8px]">upload</span> Upload
                                                    <span className="material-symbols-outlined text-[8px] ml-1">photo_library</span> Library
                                                    <span className="material-symbols-outlined text-[8px] ml-1">domain</span> Brand
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-600 mt-2">Upload, pick from library, or use brand images to guide the photoshoot look</p>
                        </div>

                        {/* ═══════════════ PHOTO STUDIO PRO ═══════════════ */}

                        {/* ── Aspect Ratio ── */}
                        <div className="studio-card p-4">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400 uppercase tracking-widest font-bold whitespace-nowrap">Ratio</span>
                                <div className="flex gap-1.5 flex-1 justify-center">
                                    {[
                                        { id: '1:1', w: 16, h: 16, label: '1:1' },
                                        { id: '4:5', w: 13, h: 16, label: '4:5' },
                                        { id: '3:4', w: 12, h: 16, label: '3:4' },
                                        { id: '9:16', w: 9, h: 16, label: '9:16' },
                                        { id: '16:9', w: 16, h: 9, label: '16:9' },
                                        { id: '3:2', w: 16, h: 11, label: '3:2' },
                                    ].map(r => (
                                        <button key={r.id} onClick={() => setAspectRatio(r.id)}
                                            className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-all cursor-pointer border ${aspectRatio === r.id
                                                ? 'bg-primary/20 border-primary/50 text-primary'
                                                : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'}`}>
                                            <div className={`rounded-[2px] transition-all ${aspectRatio === r.id ? 'bg-primary' : 'bg-slate-600'}`}
                                                style={{ width: r.w, height: r.h }} />
                                            <span className="text-[10px] font-bold">{r.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* ── Tab Navigation ── */}
                        <div className="flex rounded-2xl overflow-hidden border border-white/[0.06] bg-white/[0.02]">
                            {[
                                { id: 'shot', icon: 'photo_camera', label: 'Shot' },
                                { id: 'light', icon: 'light_mode', label: 'Light' },
                                { id: 'scene', icon: 'view_in_ar', label: 'Scene' },
                                { id: 'style', icon: 'palette', label: 'Style' },
                            ].map(t => (
                                <button key={t.id} onClick={() => setPsTab(t.id)}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-all cursor-pointer ${psTab === t.id
                                        ? 'bg-gradient-to-r from-primary/15 to-accent-purple/10 text-white border-b-2 border-primary shadow-inner'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'}`}>
                                    <span className="material-symbols-outlined text-base">{t.icon}</span>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* ── Tab Content ── */}
                        <div className="studio-card p-5 min-h-[180px]">

                            {/* 📐 SHOT TAB */}
                            {psTab === 'shot' && (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Camera Angle</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { id: 'eye-level', label: '👁️ Eye Level' },
                                                { id: 'hero', label: '⬆ Low Angle' },
                                                { id: '45deg', label: '📐 3/4 View' },
                                                { id: 'overhead', label: '⬇ Overhead' },
                                                { id: 'macro', label: '🔍 Macro' },
                                                { id: 'dutch', label: '↗ Dutch Tilt' },
                                                { id: 'tilt-down', label: '↘ Tilt Down' },
                                                { id: 'worms-eye', label: '🐛 Worm\'s Eye' },
                                                { id: 'birds-eye', label: '🦅 Bird\'s Eye' },
                                                { id: 'profile', label: '👤 Profile' },
                                            ].map(a => (
                                                <button key={a.id} onClick={() => setCameraAngle(a.id)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer border ${cameraAngle === a.id
                                                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                                                    }`}>{a.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Lens</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { id: 'fisheye', label: '🐟 Fish Eye' },
                                                { id: 'ultra-wide', label: '🌐 14mm' },
                                                { id: '24mm', label: '📸 24mm' },
                                                { id: '35mm', label: '🎞️ 35mm' },
                                                { id: '50mm', label: '⭐ 50mm' },
                                                { id: '85mm', label: '🌸 85mm' },
                                                { id: '105mm', label: '🔬 105mm' },
                                                { id: '200mm', label: '🔭 200mm' },
                                                { id: 'tilt-shift', label: '🏙️ Tilt-Shift' },
                                            ].map(l => (
                                                <button key={l.id} onClick={() => setLens(l.id)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer border ${lens === l.id
                                                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                                                    }`}>{l.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 💡 LIGHT TAB */}
                            {psTab === 'light' && (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Style</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { id: 'softbox', label: '☁️ Softbox' },
                                                { id: 'natural', label: '🪟 Window' },
                                                { id: 'golden', label: '🌅 Golden Hour' },
                                                { id: 'dramatic', label: '🎭 Dramatic' },
                                                { id: 'neon', label: '💜 Neon' },
                                                { id: 'rim', label: '✨ Rim' },
                                                { id: 'highkey', label: '⬜ High Key' },
                                            ].map(l => (
                                                <button key={l.id} onClick={() => setLightingStyle(l.id)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer border ${lightingStyle === l.id
                                                        ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
                                                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                                                    }`}>{l.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Direction</p>
                                        <div className="inline-grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            {[
                                                { id: 'front-left', label: '↖', pos: '0' },
                                                { id: 'front', label: '⬆', pos: '1' },
                                                { id: 'front-right', label: '↗', pos: '2' },
                                                { id: 'left', label: '←', pos: '3' },
                                                { id: 'top', label: '●', pos: '4' },
                                                { id: 'right', label: '→', pos: '5' },
                                                { id: 'back', label: '', pos: '6' },
                                                { id: '_label', label: '⬇', pos: '7', isBack: true },
                                                { id: '_empty', label: '', pos: '8' },
                                            ].filter(d => d.id !== '_empty' && d.id !== '_label').map(d => (
                                                <button key={d.id} onClick={() => d.id !== '_empty' && setLightDirection(d.id === '_label' ? 'back' : d.id)}
                                                    className={`w-9 h-9 rounded-lg text-sm flex items-center justify-center transition-all cursor-pointer ${
                                                        lightDirection === d.id || (d.isBack && lightDirection === 'back')
                                                            ? 'bg-yellow-500/25 text-yellow-300 shadow-md shadow-yellow-500/10'
                                                            : d.id === 'top' ? 'bg-white/[0.04] text-slate-400' : 'text-slate-500 hover:bg-white/[0.05]'
                                                    }`}>{d.label}</button>
                                            ))}
                                        </div>
                                        <p className="text-[8px] text-slate-600 mt-1.5">
                                            Light from: {{'front-left':'Front Left','front':'Front','front-right':'Front Right','left':'Left Side','right':'Right Side','top':'Top Down','back':'Backlit'}[lightDirection]}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* 🎬 SCENE TAB */}
                            {psTab === 'scene' && (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Surface & Placement</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { id: 'white', label: '⬜ White' },
                                                { id: 'marble', label: '🤍 Marble' },
                                                { id: 'stone', label: '🪨 Stone' },
                                                { id: 'wood', label: '🪵 Wood' },
                                                { id: 'concrete', label: '🏗️ Concrete' },
                                                { id: 'fabric', label: '🧶 Silk' },
                                                { id: 'podium', label: '🏛️ Podium' },
                                                { id: 'glass', label: '🪞 Glass' },
                                                { id: 'sand', label: '🏖️ Sand' },
                                                { id: 'foliage', label: '🌿 Foliage' },
                                            ].map(s => (
                                                <button key={s.id} onClick={() => setSurface(s.id)}
                                                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer border ${surface === s.id
                                                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                                                    }`}>{s.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Model</p>
                                        <div className="flex gap-2">
                                            {[
                                                { id: 'none', label: '🚫 None' },
                                                { id: 'hands', label: '🤲 Hands' },
                                                { id: 'model-woman', label: '👩 Woman' },
                                                { id: 'model-man', label: '👨 Man' },
                                            ].map(m => (
                                                <button key={m.id} onClick={() => setModelPresence(m.id)}
                                                    className={`flex-1 py-2 rounded-xl text-[10px] font-medium text-center transition-all cursor-pointer border ${modelPresence === m.id
                                                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                                                        : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                                                    }`}>{m.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 🎨 STYLE TAB */}
                            {psTab === 'style' && (
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Mood <span className="text-slate-600 normal-case">(multi-select)</span></p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {[
                                                { id: 'editorial', label: '📰 Editorial' },
                                                { id: 'commercial', label: '🛍️ Commercial' },
                                                { id: 'lifestyle', label: '☕ Lifestyle' },
                                                { id: 'luxury', label: '💎 Luxury' },
                                                { id: 'minimal', label: '◻️ Minimal' },
                                                { id: 'moody', label: '🌑 Moody' },
                                                { id: 'vibrant', label: '🌈 Vibrant' },
                                                { id: 'vintage', label: '📷 Vintage' },
                                            ].map(m => {
                                                const active = mood.includes(m.id)
                                                return (
                                                    <button key={m.id} onClick={() => setMood(prev => active ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                                                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all cursor-pointer border ${active
                                                            ? 'bg-pink-500/20 border-pink-500/50 text-pink-300'
                                                            : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:bg-white/[0.06]'
                                                        }`}>{m.label}</button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-2">Fidelity — <span className="text-amber-400">{fidelity}%</span></p>
                                        <input type="range" min={0} max={100} step={5} value={fidelity}
                                            onChange={e => setFidelity(Number(e.target.value))}
                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                                            style={{ background: `linear-gradient(to right, #f59e0b ${fidelity}%, rgba(255,255,255,0.06) ${fidelity}%)` }}
                                        />
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[8px] text-slate-600">🎨 Creative</span>
                                            <span className="text-[8px] text-slate-600">🔒 Exact</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Director's Brief ── always visible */}
                        <div className="rounded-xl p-2.5 bg-gradient-to-r from-amber-500/[0.04] to-transparent border border-amber-500/10">
                            <p className="text-[10px] text-slate-400/80 leading-relaxed">
                                <span className="text-amber-400/60 font-bold">📋</span>{' '}
                                {(() => {
                                    const a = {'eye-level':'Eye-level','hero':'Low-angle','45deg':'3/4','overhead':'Overhead','macro':'Macro','dutch':'Dutch tilt','tilt-down':'Tilt-down','worms-eye':"Worm's eye",'birds-eye':"Bird's eye",'profile':'Profile'}
                                    const l = {'fisheye':'8mm fish-eye','ultra-wide':'14mm','24mm':'24mm','35mm':'35mm','50mm':'50mm','85mm':'85mm','105mm':'105mm','200mm':'200mm','tilt-shift':'tilt-shift'}
                                    const lt = {'softbox':'softbox','natural':'window','golden':'golden hour','dramatic':'dramatic','neon':'neon','rim':'rim','highkey':'high-key'}
                                    const s = {'white':'white bg','marble':'marble','stone':'stone','wood':'wood','concrete':'concrete','fabric':'silk','podium':'podium','glass':'glass','sand':'sand','foliage':'foliage'}
                                    const md = {'none':'','hands':' · hands','model-woman':' · woman model','model-man':' · man model'}
                                    return `${a[cameraAngle]||cameraAngle} · ${l[lens]||lens} · ${lt[lightingStyle]||lightingStyle} · ${s[surface]||surface}${md[modelPresence]||''} · ${mood.map(m=>m[0].toUpperCase()+m.slice(1)).join('+')} · ${aspectRatio}`
                                })()}
                            </p>
                        </div>

                        {/* ── Extra Notes ── */}
                        <div className="relative">
                            <textarea value={photoshootBrief}
                                onChange={e => setPhotoshootBrief(e.target.value)}
                                placeholder="Extra details: water droplets, steam, brand packaging, props..."
                                className="input-glass w-full py-2.5 px-3 pr-10 resize-none text-xs rounded-xl" rows={2}
                            />
                            <div className="absolute right-1.5 top-1.5">
                                <VoiceInput onResult={(text) => setPhotoshootBrief(prev => prev ? prev + ' ' + text : text)} size="small" />
                            </div>
                        </div>
                        {photoshootBrief.trim() && (
                            <div className="flex items-center gap-2 -mt-1">
                                <button onClick={async () => {
                                    if (!photoshootBrief.trim() || !activeBrand || enhancing) return
                                    setEnhancing(true)
                                    try {
                                        const data = await creativesAPI.enhancePrompt({
                                            brandId: activeBrand._id,
                                            prompt: `Photoshoot scene: ${photoshootBrief.trim()}`,
                                            style: 'photorealistic',
                                            format: 'photoshoot',
                                            aspectRatio,
                                        })
                                        if (data.enhancedPrompt) setPhotoshootBrief(data.enhancedPrompt)
                                    } catch (err) { console.error('Enhance failed:', err) }
                                    finally { setEnhancing(false) }
                                }}
                                    disabled={enhancing || !activeBrand}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${enhancing
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        : 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-400 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/20 hover:border-amber-500/40'}`}>
                                    <span className={`material-symbols-outlined text-sm ${enhancing ? 'animate-spin' : ''}`}>
                                        {enhancing ? 'progress_activity' : 'auto_awesome'}
                                    </span>
                                    {enhancing ? 'Enhancing...' : '✨ Enhance'}
                                </button>
                            </div>
                        )}

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

                                        const data = await agentsAPI.aiPhotoshoot({
                                            image: productImage,
                                            brief: photoshootBrief,
                                            brandName: activeBrand?.name,
                                            brandColors,
                                            fidelity,
                                            aspectRatio,
                                            // Reference images
                                            styleRef: referenceImages.style || null,
                                            characterRef: referenceImages.character || null,
                                            // Professional Photography Controls
                                            cameraAngle,
                                            lens,
                                            lightingStyle,
                                            lightDirection,
                                            surface,
                                            modelPresence,
                                            mood,
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
                        <div className="studio-card p-6 min-h-[500px] flex items-center justify-center">
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
                                    <p className="text-sm text-slate-400">Gemini AI is styling your product with professional lighting and composition...</p>
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
                                        <img ref={psImageRef} src={photoshootResult.imageUrl} alt="AI Photoshoot"
                                            className="w-full rounded-2xl" />
                                    </div>

                                    {photoshootResult.description && (
                                        <p className="text-sm text-slate-400 mb-4 italic">{photoshootResult.description}</p>
                                    )}

                                    <div className="flex gap-2 flex-wrap">
                                        <a href={photoshootResult.imageUrl} download="ai-photoshoot.png"
                                            className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold">
                                            <span className="material-symbols-outlined text-sm">download</span>
                                            Download
                                        </a>
                                        <button onClick={() => { setPhotoshootResult(null); setPhotoshootSaved(false); teardownPsMaskCanvas(); setPsEditMode(false) }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold glass-panel text-slate-400 hover:text-white cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">refresh</span>
                                            Regenerate
                                        </button>
                                        {/* AI Edit Toggle */}
                                        <button onClick={() => { setPsEditMode(!psEditMode); if (psEditMode) { teardownPsMaskCanvas(); setPsMaskMode(false) } }}
                                            className={`py-2.5 px-5 rounded-xl text-xs font-bold cursor-pointer transition-all ${psEditMode
                                                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                                                : 'bg-violet-500/10 text-violet-400 hover:bg-violet-500/20'}`}>
                                            <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                                            {psEditMode ? 'Close AI Editor' : 'Edit with AI'}
                                        </button>
                                        <button onClick={() => {
                                            setDesignBaseImage(photoshootResult.imageUrl)
                                            setStudioMode('create')
                                            setPrompt(`Create a ${selectedType} design using this product photoshoot image. Brand: ${activeBrand?.name}. Make it platform-ready.`)
                                        }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">palette</span>
                                            Use in Design Studio
                                        </button>
                                        <button onClick={() => setPublishData({ image: photoshootResult.imageUrl, text: '' })}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">share</span>
                                            Publish
                                        </button>
                                        <button onClick={() => { setStudioMode('imagebank'); loadImageBank() }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold glass-panel text-slate-400 hover:text-white cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">photo_library</span>
                                            View Image Bank
                                        </button>
                                    </div>

                                    {/* ═══ AI IMAGE EDITOR PANEL ═══ */}
                                    {psEditMode && (
                                        <div className="mt-5 studio-card p-5 border border-violet-500/20 fade-up">
                                            <h4 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                                <span className="material-symbols-outlined text-violet-400">auto_fix_high</span>
                                                AI Image Editor
                                            </h4>

                                            {/* Tool Cards */}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                                {[
                                                    { id: 'prompt', icon: 'edit_note', label: 'Prompt', desc: 'Edit by text' },
                                                    { id: 'visual', icon: 'gesture', label: 'Visual', desc: 'Paint & edit' },
                                                    { id: 'retouch', icon: 'healing', label: 'Retouch', desc: 'Mask & fix' },
                                                    { id: 'background', icon: 'wallpaper', label: 'Background', desc: 'Remove / swap' },
                                                ].map(t => (
                                                    <button key={t.id} onClick={() => {
                                                        setPsEditTool(t.id)
                                                        if (t.id === 'visual' || t.id === 'retouch') {
                                                            setPsMaskMode(true); setupPsMaskCanvas()
                                                        } else {
                                                            setPsMaskMode(false); teardownPsMaskCanvas()
                                                        }
                                                    }}
                                                        className={`p-3 rounded-xl text-center transition-all cursor-pointer ${psEditTool === t.id
                                                            ? 'bg-violet-500/20 border border-violet-500/40 text-white'
                                                            : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.05]'}`}>
                                                        <span className="material-symbols-outlined text-lg block mb-1">{t.icon}</span>
                                                        <p className="text-[11px] font-bold">{t.label}</p>
                                                        <p className="text-sm text-slate-500">{t.desc}</p>
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Mask Controls (Visual / Retouch) */}
                                            {(psEditTool === 'visual' || psEditTool === 'retouch') && (
                                                <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-[11px] text-rose-400 font-bold flex items-center gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                                                            Paint mask on image above
                                                        </span>
                                                        <button onClick={() => {
                                                            if (psMaskCtxRef.current && psMaskCanvasRef.current) {
                                                                psMaskCtxRef.current.clearRect(0, 0, psMaskCanvasRef.current.width, psMaskCanvasRef.current.height)
                                                            }
                                                        }} className="text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-xs">delete</span> Clear
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-sm text-slate-500">Brush</span>
                                                        <input type="range" min={5} max={80} value={psMaskBrushSize}
                                                            onChange={e => {
                                                                const val = Number(e.target.value)
                                                                setPsMaskBrushSize(val)
                                                                if (psMaskCtxRef.current) psMaskCtxRef.current.lineWidth = val
                                                            }}
                                                            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                                                            style={{ background: `linear-gradient(to right, #8b5cf6 ${((psMaskBrushSize - 5) / 75) * 100}%, rgba(255,255,255,0.06) ${((psMaskBrushSize - 5) / 75) * 100}%)` }} />
                                                        <span className="text-sm text-slate-400 min-w-[30px]">{psMaskBrushSize}px</span>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Background Controls */}
                                            {psEditTool === 'background' && (
                                                <div className="mb-4 flex gap-2">
                                                    {[
                                                        { id: 'remove', icon: 'content_cut', label: 'Remove BG' },
                                                        { id: 'replace', icon: 'landscape', label: 'Replace BG' },
                                                    ].map(a => (
                                                        <button key={a.id} onClick={() => setPsBgAction(a.id)}
                                                            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${psBgAction === a.id
                                                                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                                                                : 'glass-panel text-slate-400 hover:text-white'}`}>
                                                            <span className="material-symbols-outlined text-sm">{a.icon}</span>
                                                            {a.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {psEditTool === 'background' && psBgAction === 'replace' && (
                                                <textarea value={psBgPrompt} onChange={e => setPsBgPrompt(e.target.value)}
                                                    placeholder="Describe the new background, e.g. tropical beach, modern office..."
                                                    className="input-glass w-full resize-none mb-4" rows={2} />
                                            )}

                                            {/* Prompt Input (for prompt, visual, retouch) */}
                                            {psEditTool !== 'background' && (
                                                <textarea value={psEditPrompt} onChange={e => setPsEditPrompt(e.target.value)}
                                                    placeholder={psEditTool === 'prompt' ? 'Describe how to edit this image...'
                                                        : psEditTool === 'visual' ? 'What should replace the masked area?'
                                                            : 'Describe how to retouch the masked area...'}
                                                    className="input-glass w-full resize-none mb-4" rows={2} />
                                            )}

                                            {/* Submit & Error */}
                                            <button onClick={handlePsEdit} disabled={psEditLoading}
                                                className="btn-primary w-full py-3 rounded-xl text-sm font-bold disabled:opacity-30 justify-center"
                                                style={{ background: 'linear-gradient(135deg, #7c3aed, #6366f1)' }}>
                                                {psEditLoading ? (
                                                    <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Processing...</>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-sm">auto_fix_high</span> Apply AI Edit</>
                                                )}
                                            </button>
                                            {psEditError && (
                                                <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                                                    ⚠️ {psEditError}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-slate-600 bg-white/[0.03] px-2 py-1 rounded">
                                            <span className="material-symbols-outlined text-xs align-middle mr-0.5">smart_toy</span>
                                            Gemini AI • {photoshootResult.model}
                                        </span>
                                        {photoshootSaved && (
                                            <span className="text-sm text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">check_circle</span>
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

                    <div className="flex items-center justify-between mb-6 fade-up">
                        <div>
                            <h3 className="text-xl font-extrabold text-gradient flex items-center gap-2">
                                <span className="material-symbols-outlined text-2xl">dashboard_customize</span>
                                Brand Templates
                            </h3>
                            <p className="text-sm text-slate-400 mt-1">Pick a template, fill in your details, and generate on-brand designs instantly</p>
                        </div>
                        {activeTemplate && (
                            <button onClick={() => { setActiveTemplate(null); setTemplateFields({}); setTemplateResult(null); setTemplatePromptPreview(''); setTemplateRefImage(null) }}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold studio-card text-slate-300 hover:text-white cursor-pointer">
                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                                All Templates
                            </button>
                        )}
                    </div>

                    {!activeBrand ? (
                        <div className="studio-card p-12 text-center fade-up-1">
                            <span className="material-symbols-outlined text-5xl text-slate-600 mb-4 block">brand_awareness</span>
                            <h3 className="text-lg font-bold text-slate-400 mb-2">Select a Brand First</h3>
                            <p className="text-xs text-slate-600">Templates use your brand colors, personality, and style</p>
                        </div>
                    ) : !activeTemplate ? (
                        /* ──────────── Template Library — Categories & Sub-Templates ──────────── */
                        <>
                            {!activeCategory ? (
                                /* ═══ LEVEL 1: Category Grid ═══ */
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                        {/* ── Built-in Categories ── */}
                                        {templateCategories.map((cat, idx) => (
                                            <button key={cat.id}
                                                onClick={() => setActiveCategory(cat)}
                                                className={`studio-card p-5 text-left cursor-pointer group min-h-[180px] relative overflow-hidden fade-up-${Math.min(idx + 1, 5)}`}>
                                                {/* Gradient top band */}
                                                <div className="absolute top-0 left-0 right-0 h-1 opacity-60" style={{ background: `linear-gradient(90deg, ${cat.color}, transparent)` }} />
                                                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-lg"
                                                    style={{ background: `linear-gradient(135deg, ${cat.color}25, ${cat.color}08)`, boxShadow: `0 4px 15px ${cat.color}12` }}>
                                                    <span className="material-symbols-outlined text-2xl" style={{ color: cat.color }}>{cat.icon}</span>
                                                </div>
                                                <h4 className="text-base font-bold text-white mb-1.5 group-hover:text-primary transition-colors">{cat.label}</h4>
                                                <p className="text-xs text-slate-500 leading-relaxed mb-3">{cat.desc}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-600 bg-white/[0.03] px-2 py-0.5 rounded">
                                                        {cat.subTemplates.length + (savedTemplates.filter(st => st.category === cat.id).length)} templates
                                                    </span>
                                                    <span className="material-symbols-outlined text-xs text-slate-600 ml-auto group-hover:text-primary transition-colors">arrow_forward</span>
                                                </div>
                                            </button>
                                        ))}

                                        {/* ── Saved Custom Categories from DB ── */}
                                        {savedCategories.map(cc => (
                                            <button key={cc.categoryId}
                                                onClick={() => setActiveCategory({
                                                    id: cc.categoryId, icon: cc.icon, label: cc.label,
                                                    color: cc.color || '#f59e0b', desc: cc.description,
                                                    isCustom: true, basePromptFormula: cc.basePromptFormula,
                                                    referenceImageUrl: cc.referenceImageUrl,
                                                    subTemplates: [] // custom categories only have custom sub-templates
                                                })}
                                                className="studio-card p-5 text-left border border-amber-500/10 hover:border-amber-500/30 cursor-pointer group min-h-[170px] relative">
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                    <button onClick={async (e) => {
                                                        e.stopPropagation()
                                                        if (confirm(`Delete category "${cc.label}" and all its templates?`)) {
                                                            try { await brandsAPI.deleteCategory(activeBrand._id, cc.categoryId); loadCustomCategories(); loadCustomTemplates() }
                                                            catch (err) { console.error(err) }
                                                        }
                                                    }} className="p-1 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">delete</span>
                                                    </button>
                                                </div>
                                                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
                                                    style={{ background: `${cc.color || '#f59e0b'}15` }}>
                                                    <span className="material-symbols-outlined text-2xl" style={{ color: cc.color || '#f59e0b' }}>{cc.icon || 'auto_awesome'}</span>
                                                </div>
                                                <h4 className="text-base font-bold text-white mb-1 group-hover:text-amber-400 transition-colors">{cc.label}</h4>
                                                <p className="text-sm text-slate-500 leading-relaxed mb-3">{cc.description || 'Custom category'}</p>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-amber-500/70 bg-amber-500/[0.08] px-2 py-0.5 rounded">✨ Custom</span>
                                                    <span className="text-xs text-slate-600 bg-white/[0.03] px-2 py-0.5 rounded">
                                                        {savedTemplates.filter(st => st.category === cc.categoryId).length} templates
                                                    </span>
                                                    <span className="material-symbols-outlined text-xs text-slate-600 ml-auto group-hover:text-amber-400 transition-colors">arrow_forward</span>
                                                </div>
                                            </button>
                                        ))}

                                        {/* ── Create New Category Card ── */}
                                        <button onClick={() => setShowCreateCategory(true)}
                                            className="rounded-2xl p-5 text-left border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/[0.03] transition-all cursor-pointer group flex flex-col items-center justify-center min-h-[170px]">
                                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 group-hover:scale-110 transition-all">
                                                <span className="material-symbols-outlined text-3xl text-primary">add</span>
                                            </div>
                                            <h4 className="text-sm font-bold text-primary mb-1">New Category</h4>
                                            <p className="text-sm text-slate-500 text-center">e.g. Birthday, Anniversary<br />Learn from a reference design</p>
                                        </button>
                                    </div>

                                    {/* Brand identity bar */}
                                    <div className="mt-6 studio-card p-4 flex items-center gap-4">
                                        <div className="flex gap-1.5 shrink-0">
                                            {(activeBrand.dna?.colors || []).slice(0, 5).map((c, i) => (
                                                <div key={i} className="w-6 h-6 rounded-lg border border-white/[0.1]" style={{ background: c.hex }} />
                                            ))}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-white truncate">
                                                {templateCategories.reduce((s, c) => s + c.subTemplates.length, 0) + savedTemplates.length} templates using {activeBrand.name}'s brand identity
                                            </p>
                                            <p className="text-sm text-slate-500">Colors, personality ({activeBrand.dna?.voice?.personality || 'professional'}), and style auto-applied</p>
                                        </div>
                                        <span className="material-symbols-outlined text-emerald-400 text-lg shrink-0">verified</span>
                                    </div>
                                </>
                            ) : (
                                /* ═══ LEVEL 2: Sub-Templates inside a Category ═══ */
                                <>
                                    {/* Breadcrumb */}
                                    <div className="flex items-center gap-2 mb-4">
                                        <button onClick={() => setActiveCategory(null)}
                                            className="text-sm text-slate-500 hover:text-primary cursor-pointer flex items-center gap-1 transition-colors">
                                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                                            All Categories
                                        </button>
                                        <span className="text-slate-700">/</span>
                                        <span className="text-sm font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm" style={{ color: activeCategory.color }}>{activeCategory.icon}</span>
                                            {activeCategory.label}
                                        </span>
                                    </div>

                                    {/* Aspect Ratio for templates */}
                                    <div className="studio-card p-4 mb-4">
                                        <h4 className="text-xs font-bold text-slate-400 flex items-center gap-2 mb-2">
                                            <span className="material-symbols-outlined text-sm text-primary">aspect_ratio</span>
                                            Aspect Ratio
                                        </h4>
                                        <div className="flex gap-2 flex-wrap">
                                            {ASPECT_RATIOS.map(ar => (
                                                <button key={ar.ratio} onClick={() => setAspectRatio(ar.ratio)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all ${aspectRatio === ar.ratio
                                                        ? 'bg-primary text-white' : 'bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.06]'}`}>
                                                    <span className="text-xs">{ar.icon}</span> {ar.ratio}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Sub-template grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {/* ── Built-in sub-templates ── */}
                                        {activeCategory.subTemplates.map(sub => (
                                            <button key={sub.id}
                                                onClick={() => {
                                                    setActiveTemplate({ ...sub, type: activeCategory.id, style: 'modern' })
                                                    const defaults = {}
                                                    sub.fields.forEach(f => { if (f.default) defaults[f.key] = f.default })
                                                    setTemplateFields(defaults)
                                                    setTemplateResult(null)
                                                    setTemplatePromptPreview('')
                                                    setTemplateRefImage(null)
                                                    setTemplateError('')
                                                }}
                                                className="studio-card p-4 text-left cursor-pointer group">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform"
                                                    style={{ background: `${activeCategory.color}15` }}>
                                                    <span className="material-symbols-outlined text-xl" style={{ color: activeCategory.color }}>{sub.icon}</span>
                                                </div>
                                                <h4 className="text-sm font-bold text-white mb-1 group-hover:text-primary transition-colors">{sub.label}</h4>
                                                <p className="text-sm text-slate-500 leading-relaxed">{sub.desc}</p>
                                                <span className="text-xs text-slate-600 bg-white/[0.03] px-2 py-0.5 rounded mt-2 inline-block">{sub.fields.length} fields</span>
                                            </button>
                                        ))}

                                        {/* ── Saved custom sub-templates in this category ── */}
                                        {savedTemplates.filter(st => st.category === activeCategory.id).map(ct => (
                                            <div key={ct.templateId}
                                                className="studio-card p-4 text-left border border-amber-500/10 hover:border-amber-500/30 cursor-pointer group relative"
                                                onClick={() => {
                                                    setActiveTemplate({
                                                        id: ct.templateId, icon: ct.icon, label: ct.label,
                                                        desc: ct.description, type: ct.type || activeCategory.id, style: ct.style || 'modern',
                                                        isCustom: true, promptFormula: ct.promptFormula,
                                                        referenceImageUrl: ct.referenceImageUrl,
                                                        fields: (ct.fields?.length > 0 ? ct.fields : [
                                                            { key: 'headline', label: 'Headline / Title', type: 'text', placeholder: 'Main text' },
                                                            { key: 'details', label: 'Details', type: 'textarea', placeholder: 'Additional details...' },
                                                            { key: 'product_image', label: 'Add Product / Reference Image', type: 'image', hint: 'Upload or pick from your image bank' },
                                                        ]).map(f => ({ ...f, type: f.type || 'text' })),
                                                        buildPrompt: (brand, vals) => {
                                                            let p = ct.promptFormula || ''
                                                            Object.entries(vals).forEach(([k, v]) => {
                                                                p = p.replace(new RegExp(`\\{\\{${k.toUpperCase()}\\}\\}`, 'g'), v || '')
                                                                p = p.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), v || '')
                                                            })
                                                            const remaining = Object.entries(vals).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join('\n')
                                                            if (remaining && !p.includes(remaining.split('\n')[0])) p += '\n\nUser inputs:\n' + remaining
                                                            return p
                                                        }
                                                    })
                                                    setTemplateFields({})
                                                    setTemplateResult(null)
                                                    setTemplatePromptPreview('')
                                                    setTemplateRefImage(ct.referenceImageUrl || null)
                                                    setTemplateError('')
                                                }}>
                                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                    <button onClick={async (e) => {
                                                        e.stopPropagation()
                                                        if (confirm(`Delete "${ct.label}"?`)) {
                                                            try { await brandsAPI.deleteTemplate(activeBrand._id, ct.templateId); loadCustomTemplates() }
                                                            catch (err) { console.error(err) }
                                                        }
                                                    }} className="p-1 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">delete</span>
                                                    </button>
                                                </div>
                                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-2 group-hover:bg-amber-500/20 transition-colors">
                                                    <span className="material-symbols-outlined text-xl text-amber-400">{ct.icon || 'auto_awesome'}</span>
                                                </div>
                                                <h4 className="text-sm font-bold text-white mb-1 group-hover:text-amber-400 transition-colors">{ct.label}</h4>
                                                <p className="text-sm text-slate-500 leading-relaxed truncate">{ct.description || 'Custom template'}</p>
                                                <span className="text-sm text-amber-500/70 bg-amber-500/[0.08] px-2 py-0.5 rounded mt-2 inline-block">✨ Custom</span>
                                            </div>
                                        ))}

                                        {/* ── Add Sub-Template Card ── */}
                                        <button onClick={() => {
                                            setNewTmpl(prev => ({ ...prev, category: activeCategory.id }))
                                            setShowCreateTemplate(true)
                                        }}
                                            className="rounded-2xl p-4 border-2 border-dashed border-white/10 hover:border-primary/40 hover:bg-primary/[0.02] transition-all cursor-pointer group flex flex-col items-center justify-center min-h-[140px]">
                                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 group-hover:scale-110 transition-all">
                                                <span className="material-symbols-outlined text-xl text-primary">add</span>
                                            </div>
                                            <h4 className="text-[11px] font-bold text-primary mb-0.5">Add Sub-Template</h4>
                                            <p className="text-xs text-slate-600 text-center">Learn from image<br />or write prompt formula</p>
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* ═══ CREATE TEMPLATE MODAL ═══ */}
                            {showCreateTemplate && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
                                    onClick={() => setShowCreateTemplate(false)}>
                                    <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto glass-panel rounded-3xl p-6 mx-4 animate-scale-in"
                                        onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-amber-400">add_circle</span>
                                                    {activeCategory ? `Add Sub-Template` : 'Create New Template'}
                                                </h3>
                                                <p className="text-sm text-slate-500 mt-1">
                                                    {activeCategory
                                                        ? <>Adding to <span className="font-bold text-white" style={{ color: activeCategory.color }}>{activeCategory.label}</span> — learn from an image or write a prompt formula</>
                                                        : 'Pick a category, then build a reusable design formula'}
                                                </p>
                                            </div>
                                            <button onClick={() => setShowCreateTemplate(false)}
                                                className="p-2 rounded-xl bg-white/[0.05] text-slate-400 hover:text-white cursor-pointer">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>

                                        {/* Category — only show picker when opened from top-level */}
                                        {activeCategory ? (
                                            <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                                <span className="material-symbols-outlined text-lg" style={{ color: activeCategory.color }}>{activeCategory.icon}</span>
                                                <span className="text-sm font-bold text-white">{activeCategory.label}</span>
                                                <span className="text-sm text-slate-500 ml-auto">Category (auto-selected)</span>
                                            </div>
                                        ) : (
                                            <div className="mb-4">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Select Category *</label>
                                                <div className="flex gap-2 flex-wrap">
                                                    {templateCategories.map(cat => (
                                                        <button key={cat.id} onClick={() => setNewTmpl(p => ({ ...p, category: cat.id }))}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer transition-all ${newTmpl.category === cat.id
                                                                ? 'text-white shadow-lg' : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:bg-white/[0.06]'}`}
                                                            style={newTmpl.category === cat.id ? { background: cat.color } : {}}>
                                                            <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                                                            {cat.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Template Name & Icon */}
                                        <div className="grid grid-cols-12 gap-3 mb-4">
                                            <div className="col-span-9">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Template Name *</label>
                                                <input type="text" value={newTmpl.label}
                                                    onChange={e => setNewTmpl(p => ({ ...p, label: e.target.value }))}
                                                    placeholder="e.g. Diwali Sale, Birthday Post, Anniversary Card..."
                                                    className="input-glass w-full py-2.5 text-sm" />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Icon</label>
                                                <select value={newTmpl.icon}
                                                    onChange={e => setNewTmpl(p => ({ ...p, icon: e.target.value }))}
                                                    className="input-glass w-full py-2.5 text-sm">
                                                    {['auto_awesome', 'cake', 'favorite', 'celebration', 'star', 'card_giftcard', 'mood', 'eco', 'flag', 'spa', 'local_fire_department', 'brush', 'pets', 'music_note', 'restaurant', 'school'].map(ic => (
                                                        <option key={ic} value={ic}>{ic.replace(/_/g, ' ')}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div className="mb-4">
                                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Description</label>
                                            <input type="text" value={newTmpl.description}
                                                onChange={e => setNewTmpl(p => ({ ...p, description: e.target.value }))}
                                                placeholder="e.g. Festive Diwali-themed sales post with diyas and lanterns"
                                                className="input-glass w-full py-2.5 text-sm" />
                                        </div>

                                        {/* ── Learn from Image ── */}
                                        <div className="mb-4 p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/10">
                                            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2 mb-2">
                                                <span className="material-symbols-outlined text-sm">image_search</span>
                                                Learn from a Reference Design
                                                <span className="text-sm text-amber-500/50 bg-amber-500/10 px-2 py-0.5 rounded ml-auto">Recommended</span>
                                            </h4>
                                            <p className="text-sm text-slate-500 mb-3">Upload a design — AI extracts style, layout, and creates a reusable formula. Future images keep the same look, only changing your content.</p>

                                            {newTmpl.referenceImageUrl ? (
                                                <div className="relative rounded-xl overflow-hidden mb-2">
                                                    <img src={newTmpl.referenceImageUrl} alt="Reference" className="w-full max-h-44 object-contain bg-black/20 rounded-xl" />
                                                    <button onClick={() => setNewTmpl(p => ({ ...p, referenceImageUrl: '' }))}
                                                        className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">close</span>
                                                    </button>
                                                    {analyzeLoading && (
                                                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-xl">
                                                            <span className="material-symbols-outlined text-2xl text-amber-400 animate-spin mb-2">progress_activity</span>
                                                            <p className="text-sm text-amber-400">Analyzing design style...</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <label className="flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/40 cursor-pointer transition-colors bg-amber-500/[0.02]">
                                                    <span className="material-symbols-outlined text-2xl text-amber-500/40 mb-2">add_photo_alternate</span>
                                                    <span className="text-[11px] text-amber-400/60 font-medium">Upload a reference design</span>
                                                    <span className="text-xs text-slate-600 mt-1">AI extracts style → auto-generates prompt formula</span>
                                                    <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                        const file = e.target.files?.[0]
                                                        if (file) {
                                                            const reader = new FileReader()
                                                            reader.onload = async ev => {
                                                                const s3Url = await uploadToS3(ev.target.result, 'templates')
                                                                handleAnalyzeForTemplate(s3Url)
                                                            }
                                                            reader.readAsDataURL(file)
                                                        }
                                                    }} />
                                                </label>
                                            )}
                                        </div>

                                        {/* Prompt Formula */}
                                        <div className="mb-4">
                                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block flex items-center gap-2">
                                                Prompt Formula *
                                                <span className="text-slate-600 font-normal text-xs">Use {'{{PLACEHOLDER}}'} for changeable parts</span>
                                            </label>
                                            <textarea value={newTmpl.promptFormula}
                                                onChange={e => setNewTmpl(p => ({ ...p, promptFormula: e.target.value }))}
                                                placeholder={`e.g. Create a ${newTmpl.label || 'festive sale'} post for ${activeBrand?.name || 'brand'}.\nKeep the same layout and design elements as reference.\nOnly change: {{HEADLINE}}, {{DETAILS}}`}
                                                className="input-glass w-full py-3 text-sm resize-none font-mono" rows={5} />
                                            <p className="text-xs text-slate-600 mt-1 italic">💡 Use {'{{HEADLINE}}'}, {'{{PRODUCT}}'}, {'{{MESSAGE}}'} as placeholders — only these change, the design stays consistent.</p>
                                        </div>

                                        {/* ═══ Simple / Advanced Mode Toggle ═══ */}
                                        <div className="mb-6">
                                            {/* Mode Toggle */}
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex bg-white/[0.04] rounded-xl p-1 border border-white/[0.06]">
                                                    <button onClick={() => setTemplateFieldsMode('simple')}
                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${templateFieldsMode === 'simple'
                                                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                                            : 'text-slate-500 hover:text-slate-300'}`}>
                                                        <span className="material-symbols-outlined text-xs mr-1 align-middle">tune</span>
                                                        Simple
                                                    </button>
                                                    <button onClick={() => setTemplateFieldsMode('advanced')}
                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${templateFieldsMode === 'advanced'
                                                            ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                                                            : 'text-slate-500 hover:text-slate-300'}`}>
                                                        <span className="material-symbols-outlined text-xs mr-1 align-middle">auto_awesome</span>
                                                        Advanced
                                                        {(newTmpl.fields || []).some(f => f._detected) && (
                                                            <span className="ml-1 text-[8px] bg-white/20 px-1.5 py-0.5 rounded-full">{(newTmpl.fields || []).length}</span>
                                                        )}
                                                    </button>
                                                </div>
                                                {templateFieldsMode === 'advanced' && (
                                                    <button onClick={() => setNewTmpl(p => ({
                                                        ...p,
                                                        fields: [...(p.fields || []), { key: `field${(p.fields?.length || 0) + 1}`, label: '', type: 'text', placeholder: '' }]
                                                    }))}
                                                        className="text-sm text-primary cursor-pointer flex items-center gap-1 hover:text-primary-light">
                                                        <span className="material-symbols-outlined text-xs">add</span> Add Field
                                                    </button>
                                                )}
                                            </div>

                                            {/* ── SIMPLE MODE ── */}
                                            {templateFieldsMode === 'simple' && (
                                                <div className="space-y-4">
                                                    {/* Layout & Color info (from AI analysis) */}
                                                    {(analyzedMeta.layoutDescription || analyzedMeta.colorPalette.length > 0) && (
                                                        <div className="p-3 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/10 flex items-center gap-3">
                                                            {analyzedMeta.colorPalette.length > 0 && (
                                                                <div className="flex gap-1">
                                                                    {analyzedMeta.colorPalette.map((c, i) => (
                                                                        <div key={i} className="w-5 h-5 rounded-md border border-white/10" style={{ background: c }} title={c} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {analyzedMeta.layoutDescription && (
                                                                <span className="text-[10px] text-slate-500 flex-1">{analyzedMeta.layoutDescription}</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Title Field */}
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Title / Headline</label>
                                                        <input type="text"
                                                            value={newTmpl._simpleTitle || ''}
                                                            onChange={e => setNewTmpl(p => ({ ...p, _simpleTitle: e.target.value }))}
                                                            placeholder="e.g. FLAUNT., Summer Sale, Brand Tagline..."
                                                            className="input-glass w-full py-2.5 text-sm" />
                                                    </div>

                                                    {/* Message / Details */}
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Message / Details</label>
                                                        <textarea
                                                            value={newTmpl._simpleMessage || ''}
                                                            onChange={e => setNewTmpl(p => ({ ...p, _simpleMessage: e.target.value }))}
                                                            placeholder="Additional text, offers, descriptions..."
                                                            className="input-glass w-full py-2.5 text-sm resize-none" rows={2} />
                                                    </div>

                                                    {/* Product / Model Image */}
                                                    <div>
                                                        <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Product / Reference Image</label>
                                                        {newTmpl._simpleImage ? (
                                                            <div className="relative rounded-xl overflow-hidden bg-black/20 border border-white/[0.06]">
                                                                <img src={newTmpl._simpleImage} alt="Selected" className="w-full max-h-40 object-contain" />
                                                                <button onClick={() => setNewTmpl(p => ({ ...p, _simpleImage: '' }))}
                                                                    className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 cursor-pointer">
                                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {/* Upload from system */}
                                                                <label className="flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-primary/30 cursor-pointer transition-all text-center">
                                                                    <span className="material-symbols-outlined text-lg text-slate-500">upload_file</span>
                                                                    <span className="text-[10px] text-slate-500 font-medium">Upload</span>
                                                                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                                                        const file = e.target.files?.[0]
                                                                        if (!file) return
                                                                        const reader = new FileReader()
                                                                        reader.onload = (ev) => setNewTmpl(p => ({ ...p, _simpleImage: ev.target.result }))
                                                                        reader.readAsDataURL(file)
                                                                    }} />
                                                                </label>
                                                                {/* From brand assets */}
                                                                <button onClick={async () => {
                                                                    try {
                                                                        const data = await creativesAPI.imageBank({ brandId: activeBrand._id, limit: 20 })
                                                                        if (data.images?.length > 0) {
                                                                            setNewTmpl(p => ({ ...p, _showBrandImages: true, _brandImageList: data.images }))
                                                                        }
                                                                    } catch (e) { console.error(e) }
                                                                }}
                                                                    className="flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-amber-500/30 cursor-pointer transition-all text-center">
                                                                    <span className="material-symbols-outlined text-lg text-amber-500/60">photo_library</span>
                                                                    <span className="text-[10px] text-slate-500 font-medium">Brand Assets</span>
                                                                </button>
                                                                {/* From URL */}
                                                                <button onClick={() => {
                                                                    const url = prompt('Enter image URL:')
                                                                    if (url) setNewTmpl(p => ({ ...p, _simpleImage: url }))
                                                                }}
                                                                    className="flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-blue-500/30 cursor-pointer transition-all text-center">
                                                                    <span className="material-symbols-outlined text-lg text-blue-500/60">link</span>
                                                                    <span className="text-[10px] text-slate-500 font-medium">URL</span>
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Brand Image Picker Grid */}
                                                        {newTmpl._showBrandImages && (newTmpl._brandImageList || []).length > 0 && (
                                                            <div className="mt-2 p-3 rounded-xl bg-black/20 border border-amber-500/10">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <span className="text-[10px] font-bold text-amber-400">Select from Brand Assets</span>
                                                                    <button onClick={() => setNewTmpl(p => ({ ...p, _showBrandImages: false }))}
                                                                        className="text-xs text-slate-500 hover:text-white cursor-pointer">✕</button>
                                                                </div>
                                                                <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
                                                                    {newTmpl._brandImageList.map((img, i) => (
                                                                        <img key={i} src={img.url} alt=""
                                                                            className="w-full h-16 object-cover rounded-lg cursor-pointer border-2 border-transparent hover:border-primary transition-all"
                                                                            onClick={() => setNewTmpl(p => ({ ...p, _simpleImage: img.url, _showBrandImages: false }))} />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <p className="text-[10px] text-slate-600 italic">
                                                        💡 Simple mode — set the main text and image. Switch to Advanced for full AI-detected element control.
                                                    </p>
                                                </div>
                                            )}

                                            {/* ── ADVANCED MODE ── */}
                                            {templateFieldsMode === 'advanced' && (
                                                <div>
                                                    {/* Layout & Color info */}
                                                    {(analyzedMeta.layoutDescription || analyzedMeta.colorPalette.length > 0) && (
                                                        <div className="mb-3 p-3 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/10 flex items-center gap-3">
                                                            {analyzedMeta.colorPalette.length > 0 && (
                                                                <div className="flex gap-1">
                                                                    {analyzedMeta.colorPalette.map((c, i) => (
                                                                        <div key={i} className="w-5 h-5 rounded-md border border-white/10" style={{ background: c }} title={c} />
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {analyzedMeta.layoutDescription && (
                                                                <span className="text-[10px] text-slate-500 flex-1">{analyzedMeta.layoutDescription}</span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {(newTmpl.fields || []).length === 0 && (
                                                        <div className="py-6 text-center rounded-xl border-2 border-dashed border-white/[0.06] bg-white/[0.01]">
                                                            <span className="material-symbols-outlined text-2xl text-slate-700 mb-2 block">upload_file</span>
                                                            <p className="text-xs text-slate-600">Upload a reference image — AI will auto-detect elements</p>
                                                            <p className="text-[10px] text-slate-700 mt-1">Or click "Add Field" to create manually</p>
                                                        </div>
                                                    )}

                                                    {(newTmpl.fields || []).map((f, i) => {
                                                        const typeBadge = { text: '📝', textarea: '📝', image: '🖼️', color: '🎨', select: '📋' }[f.type] || '📝'
                                                        return (
                                                            <div key={i} className={`mb-2 p-3 rounded-xl border transition-all ${f._detected ? 'border-emerald-500/15 bg-emerald-500/[0.02]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm" title={f.type}>{typeBadge}</span>
                                                                    <input type="text" value={f.label}
                                                                        onChange={e => {
                                                                            const updated = [...newTmpl.fields]
                                                                            updated[i] = { ...f, label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') || f.key }
                                                                            setNewTmpl(p => ({ ...p, fields: updated }))
                                                                        }}
                                                                        placeholder="Field name"
                                                                        className="input-glass flex-1 py-1.5 text-xs font-semibold" />
                                                                    <select value={f.type}
                                                                        onChange={e => {
                                                                            const updated = [...newTmpl.fields]
                                                                            updated[i] = { ...f, type: e.target.value }
                                                                            setNewTmpl(p => ({ ...p, fields: updated }))
                                                                        }}
                                                                        className="input-glass py-1.5 text-[10px] w-20 rounded-lg">
                                                                        <option value="text">Text</option>
                                                                        <option value="textarea">Long Text</option>
                                                                        <option value="image">Image</option>
                                                                        <option value="color">Color</option>
                                                                        <option value="select">Select</option>
                                                                    </select>
                                                                    {f._detected && (
                                                                        <span className="text-[8px] bg-emerald-500/15 text-emerald-500 px-1.5 py-0.5 rounded font-bold">AI</span>
                                                                    )}
                                                                    <button onClick={() => setNewTmpl(p => ({ ...p, fields: p.fields.filter((_, fi) => fi !== i) }))}
                                                                        className="p-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer">
                                                                        <span className="material-symbols-outlined text-xs">close</span>
                                                                    </button>
                                                                </div>

                                                                {/* Image upload options for image type fields */}
                                                                {f.type === 'image' && (
                                                                    <div className="mt-2 ml-7">
                                                                        {f._selectedImage ? (
                                                                            <div className="relative rounded-lg overflow-hidden bg-black/20 inline-block">
                                                                                <img src={f._selectedImage} alt="" className="max-h-24 object-contain rounded-lg" />
                                                                                <button onClick={() => {
                                                                                    const updated = [...newTmpl.fields]
                                                                                    updated[i] = { ...f, _selectedImage: '' }
                                                                                    setNewTmpl(p => ({ ...p, fields: updated }))
                                                                                }}
                                                                                    className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white hover:bg-rose-500/80 cursor-pointer">
                                                                                    <span className="material-symbols-outlined text-[10px]">close</span>
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex gap-1.5">
                                                                                <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-primary/30 cursor-pointer transition-all text-[9px] text-slate-500">
                                                                                    <span className="material-symbols-outlined text-[11px]">upload</span> Upload
                                                                                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                                                                        const file = e.target.files?.[0]
                                                                                        if (!file) return
                                                                                        const reader = new FileReader()
                                                                                        reader.onload = (ev) => {
                                                                                            const updated = [...newTmpl.fields]
                                                                                            updated[i] = { ...f, _selectedImage: ev.target.result }
                                                                                            setNewTmpl(p => ({ ...p, fields: updated }))
                                                                                        }
                                                                                        reader.readAsDataURL(file)
                                                                                    }} />
                                                                                </label>
                                                                                <button onClick={async () => {
                                                                                    try {
                                                                                        const data = await creativesAPI.imageBank({ brandId: activeBrand._id, limit: 20 })
                                                                                        if (data.images?.length > 0) {
                                                                                            const updated = [...newTmpl.fields]
                                                                                            updated[i] = { ...f, _showPicker: true, _pickerImages: data.images }
                                                                                            setNewTmpl(p => ({ ...p, fields: updated }))
                                                                                        }
                                                                                    } catch (e) { console.error(e) }
                                                                                }}
                                                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-amber-500/30 cursor-pointer transition-all text-[9px] text-slate-500">
                                                                                    <span className="material-symbols-outlined text-[11px]">photo_library</span> Brand
                                                                                </button>
                                                                                <button onClick={() => {
                                                                                    const url = prompt('Enter image URL:')
                                                                                    if (url) {
                                                                                        const updated = [...newTmpl.fields]
                                                                                        updated[i] = { ...f, _selectedImage: url }
                                                                                        setNewTmpl(p => ({ ...p, fields: updated }))
                                                                                    }
                                                                                }}
                                                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:border-blue-500/30 cursor-pointer transition-all text-[9px] text-slate-500">
                                                                                    <span className="material-symbols-outlined text-[11px]">link</span> URL
                                                                                </button>
                                                                            </div>
                                                                        )}

                                                                        {/* Brand image picker */}
                                                                        {f._showPicker && (f._pickerImages || []).length > 0 && (
                                                                            <div className="mt-1.5 p-2 rounded-lg bg-black/20 border border-amber-500/10">
                                                                                <div className="grid grid-cols-4 gap-1 max-h-24 overflow-y-auto">
                                                                                    {f._pickerImages.map((img, pi) => (
                                                                                        <img key={pi} src={img.url} alt=""
                                                                                            className="w-full h-12 object-cover rounded cursor-pointer border-2 border-transparent hover:border-primary"
                                                                                            onClick={() => {
                                                                                                const updated = [...newTmpl.fields]
                                                                                                updated[i] = { ...f, _selectedImage: img.url, _showPicker: false }
                                                                                                setNewTmpl(p => ({ ...p, fields: updated }))
                                                                                            }} />
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {f.description && (
                                                                            <p className="text-[9px] text-amber-500/50 mt-1 italic">{f.description}</p>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Default value for text fields */}
                                                                {f.default && f.type !== 'image' && f.type !== 'color' && (
                                                                    <p className="text-[9px] text-slate-500 ml-7 mt-1">Default: "{f.default}"</p>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Save */}
                                        <button onClick={handleCreateTemplate}
                                            disabled={!newTmpl.label || !newTmpl.promptFormula || !newTmpl.category || creatingTemplate}
                                            className="btn-primary w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-30">
                                            {creatingTemplate ? (
                                                <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Saving...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-sm">save</span> Save to {templateCategories.find(c => c.id === newTmpl.category)?.label || 'Library'}</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ═══ CREATE CATEGORY MODAL ═══ */}
                            {showCreateCategory && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
                                    onClick={() => setShowCreateCategory(false)}>
                                    <div className="w-full max-w-md studio-card p-6 mx-4 animate-scale-in"
                                        onClick={e => e.stopPropagation()}>

                                        {/* Header */}
                                        <div className="flex items-center justify-between mb-5">
                                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary">create_new_folder</span>
                                                New Category
                                            </h3>
                                            <button onClick={() => setShowCreateCategory(false)}
                                                className="p-2 rounded-xl bg-white/[0.05] text-slate-400 hover:text-white cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>

                                        {/* Live Preview */}
                                        <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-5">
                                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all"
                                                style={{ background: `linear-gradient(135deg, ${newCat.color}25, ${newCat.color}08)`, boxShadow: `0 4px 15px ${newCat.color}12` }}>
                                                <span className="material-symbols-outlined text-2xl" style={{ color: newCat.color }}>{newCat.icon}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-white truncate">{newCat.label || 'Category Name'}</p>
                                                <p className="text-xs text-slate-500">Preview — this is how it'll look in your grid</p>
                                            </div>
                                        </div>

                                        {/* Category Name */}
                                        <div className="mb-4">
                                            <label className="text-xs font-bold text-slate-400 mb-1.5 block">Category Name *</label>
                                            <input type="text" value={newCat.label}
                                                onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
                                                placeholder="e.g. Birthday, Anniversary, Diwali..."
                                                className="input-glass w-full py-3 text-sm"
                                                autoFocus />
                                        </div>

                                        {/* Icon & Color — side by side */}
                                        <div className="grid grid-cols-2 gap-4 mb-5">
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 mb-1.5 block">Icon</label>
                                                <select value={newCat.icon}
                                                    onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))}
                                                    className="input-glass w-full py-3 text-sm">
                                                    {['auto_awesome', 'cake', 'favorite', 'celebration', 'star', 'card_giftcard', 'mood', 'eco', 'flag', 'spa', 'local_fire_department', 'brush', 'pets', 'music_note', 'restaurant', 'school', 'sports_esports', 'local_offer', 'campaign', 'event'].map(ic => (
                                                        <option key={ic} value={ic}>{ic.replace(/_/g, ' ')}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 mb-1.5 block">Color</label>
                                                <div className="flex gap-2 flex-wrap">
                                                    {['#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#0ea5e9', '#f97316', '#14b8a6'].map(c => (
                                                        <button key={c} onClick={() => setNewCat(p => ({ ...p, color: c }))}
                                                            className={`w-8 h-8 rounded-xl border-2 cursor-pointer transition-all ${newCat.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`}
                                                            style={{ background: c }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Create Button */}
                                        <button onClick={handleCreateCategory}
                                            disabled={!newCat.label || creatingCategory}
                                            className="btn-primary w-full py-3.5 rounded-2xl text-sm font-bold disabled:opacity-30">
                                            {creatingCategory ? (
                                                <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Creating...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-sm">add</span> Create "{newCat.label || 'Category'}"</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>

                    ) : (
                        /* ──────────── Active Template Detail Panel ──────────── */
                        <div className="grid grid-cols-12 gap-6">
                            {/* Left — Form Fields */}
                            <div className="col-span-12 lg:col-span-5 space-y-4">
                                {/* Template Header */}
                                <div className="studio-card p-5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-2xl text-primary">{activeTemplate.icon}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-base font-bold text-white">{activeTemplate.label}</h4>
                                            <p className="text-sm text-slate-500">{activeTemplate.desc}</p>
                                        </div>
                                    </div>

                                    {/* ── Default Brand Prompt (auto-generated from brand DNA) ── */}
                                    <div className="p-4 rounded-xl bg-gradient-to-r from-primary/[0.06] to-emerald-500/[0.04] border border-primary/10 mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h5 className="text-[11px] font-bold text-primary flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                                                Default Brand Prompt
                                                <span className="text-[8px] text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded ml-1">Auto-generated</span>
                                            </h5>
                                            <button onClick={() => {
                                                const defaultPrompt = activeTemplate.isCustom
                                                    ? (activeTemplate.promptFormula || '')
                                                    : activeTemplate.buildPrompt(activeBrand, {})
                                                navigator.clipboard.writeText(defaultPrompt)
                                            }}
                                                className="text-sm text-slate-500 hover:text-white cursor-pointer flex items-center gap-0.5">
                                                <span className="material-symbols-outlined text-xs">content_copy</span> Copy
                                            </button>
                                        </div>
                                        <div className="bg-black/20 rounded-lg p-3 text-sm text-slate-400 leading-relaxed max-h-28 overflow-y-auto font-mono whitespace-pre-wrap mb-3">
                                            {activeTemplate.isCustom
                                                ? (activeTemplate.promptFormula || 'No prompt formula saved.')
                                                : activeTemplate.buildPrompt(activeBrand, {})}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleTemplateGenerate(activeTemplate)}
                                                disabled={templateGenerating}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold hover:bg-primary/30 cursor-pointer transition-all disabled:opacity-30">
                                                <span className="material-symbols-outlined text-xs">bolt</span>
                                                Use Default Prompt
                                            </button>
                                            <span className="text-xs text-slate-600 italic">or fill fields below to customize</span>
                                        </div>
                                        <p className="text-[8px] text-slate-600 mt-2 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm text-emerald-500">verified</span>
                                            Built with {activeBrand.name}'s brand colors ({(activeBrand.dna?.colors || []).slice(0, 3).map(c => c.hex).join(', ') || 'default'}), {activeBrand.dna?.voice?.personality || 'professional'} voice
                                        </p>
                                    </div>

                                    {/* Form Fields */}
                                    <div className="space-y-3">
                                        {activeTemplate.fields.map(field => (
                                            <div key={field.key}>
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block flex items-center gap-1">
                                                    {field.label}
                                                    {field.hint && <span className="text-slate-600 font-normal">— {field.hint}</span>}
                                                </label>

                                                {field.type === 'text' && (
                                                    <input type="text" value={templateFields[field.key] || ''}
                                                        onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                        placeholder={field.placeholder}
                                                        className="input-glass w-full py-2.5 text-sm" />
                                                )}

                                                {field.type === 'textarea' && (
                                                    <textarea value={templateFields[field.key] || ''}
                                                        onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                        placeholder={field.placeholder}
                                                        className="input-glass w-full py-2.5 text-sm resize-none" rows={3} />
                                                )}

                                                {field.type === 'select' && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {field.options.map(opt => (
                                                            <button key={opt} onClick={() => setTemplateFields(prev => ({ ...prev, [field.key]: opt }))}
                                                                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${templateFields[field.key] === opt
                                                                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                                                    : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}>
                                                                {opt}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}

                                                {field.type === 'color' && (
                                                    <div className="flex items-center gap-3">
                                                        <div className="relative">
                                                            <input type="color"
                                                                value={templateFields[field.key] || field.default || '#6366f1'}
                                                                onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                                className="w-10 h-10 rounded-lg border-2 border-white/10 cursor-pointer bg-transparent" />
                                                        </div>
                                                        <span className="text-xs text-slate-500 font-mono">{templateFields[field.key] || field.default || '#6366f1'}</span>
                                                        {/* Brand color swatches for quick pick */}
                                                        {(activeBrand?.dna?.colors || []).length > 0 && (
                                                            <div className="flex gap-1.5 ml-2">
                                                                {activeBrand.dna.colors.slice(0, 5).map((c, ci) => (
                                                                    <button key={ci}
                                                                        onClick={() => setTemplateFields(prev => ({ ...prev, [field.key]: c.hex }))}
                                                                        className={`w-7 h-7 rounded-md border-2 cursor-pointer transition-all hover:scale-110 ${templateFields[field.key] === c.hex ? 'border-white shadow-lg' : 'border-white/10'}`}
                                                                        style={{ background: c.hex }}
                                                                        title={c.name || c.hex} />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {field.type === 'image' && (
                                                    <div>
                                                        {templateFields[field.key] ? (
                                                            <div className="relative rounded-xl overflow-hidden">
                                                                <img src={templateFields[field.key]} alt="Uploaded" className="w-full max-h-40 object-contain bg-black/20 rounded-xl" />
                                                                <button onClick={() => setTemplateFields(prev => { const next = { ...prev }; delete next[field.key]; return next })}
                                                                    className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 cursor-pointer">
                                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                {/* Source buttons row */}
                                                                <div className="flex gap-2">
                                                                    <label className="flex-1 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/30 cursor-pointer transition-colors bg-white/[0.02]">
                                                                        <span className="material-symbols-outlined text-lg text-slate-600 mb-1">add_photo_alternate</span>
                                                                        <span className="text-sm text-slate-500">Upload File</span>
                                                                        <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                            const file = e.target.files?.[0]
                                                                            if (file) {
                                                                                const reader = new FileReader()
                                                                                reader.onload = async ev => {
                                                                                    const s3Url = await uploadToS3(ev.target.result, 'template-fields')
                                                                                    setTemplateFields(prev => ({ ...prev, [field.key]: s3Url }))
                                                                                }
                                                                                reader.readAsDataURL(file)
                                                                            }
                                                                        }} />
                                                                    </label>
                                                                    <button onClick={() => {
                                                                        if (bankImages.length === 0) loadImageBank()
                                                                        setTemplateFields(prev => ({ ...prev, [`${field.key}_picker`]: prev[`${field.key}_picker`] === 'bank' ? '' : 'bank' }))
                                                                    }}
                                                                        className={`flex-1 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${templateFields[`${field.key}_picker`] === 'bank' ? 'border-primary/40 bg-primary/5' : 'border-white/[0.08] hover:border-primary/30 bg-white/[0.02]'}`}>
                                                                        <span className="material-symbols-outlined text-lg text-primary mb-1">photo_library</span>
                                                                        <span className="text-sm text-slate-400">Image Bank</span>
                                                                    </button>
                                                                    {activeBrand?.dna?.brandImages?.length > 0 && (
                                                                        <button onClick={() => {
                                                                            setTemplateFields(prev => ({ ...prev, [`${field.key}_picker`]: prev[`${field.key}_picker`] === 'brand' ? '' : 'brand' }))
                                                                        }}
                                                                            className={`flex-1 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${templateFields[`${field.key}_picker`] === 'brand' ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-emerald-500/[0.15] hover:border-emerald-500/30 bg-emerald-500/[0.02]'}`}>
                                                                            <span className="material-symbols-outlined text-lg text-emerald-500 mb-1">branding_watermark</span>
                                                                            <span className="text-sm text-emerald-400/70">Brand Assets</span>
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Image Bank grid picker */}
                                                                {templateFields[`${field.key}_picker`] === 'bank' && (
                                                                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 max-h-[220px] overflow-y-auto custom-scrollbar">
                                                                        {bankImages.length > 0 ? (
                                                                            <div className="grid grid-cols-4 gap-2">
                                                                                {bankImages.slice(0, 24).map(img => (
                                                                                    <button key={img._id} onClick={() => {
                                                                                        setTemplateFields(prev => {
                                                                                            const next = { ...prev, [field.key]: img.imageUrl }
                                                                                            delete next[`${field.key}_picker`]
                                                                                            return next
                                                                                        })
                                                                                    }}
                                                                                        className="group relative rounded-lg overflow-hidden aspect-square cursor-pointer ring-1 ring-white/10 hover:ring-primary/50 transition-all">
                                                                                        <img src={img.thumbnailUrl || img.imageUrl} alt={img.title || ''} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                                            <span className="material-symbols-outlined text-white text-lg">check_circle</span>
                                                                                        </div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="py-6 text-center">
                                                                                <span className="material-symbols-outlined animate-spin text-primary text-lg">progress_activity</span>
                                                                                <p className="text-xs text-slate-500 mt-2">Loading images...</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Brand assets grid picker */}
                                                                {templateFields[`${field.key}_picker`] === 'brand' && activeBrand?.dna?.brandImages?.length > 0 && (
                                                                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 max-h-[220px] overflow-y-auto custom-scrollbar">
                                                                        <div className="grid grid-cols-4 gap-2">
                                                                            {activeBrand.dna.brandImages.map((img, i) => (
                                                                                <button key={i} onClick={() => {
                                                                                    setTemplateFields(prev => {
                                                                                        const next = { ...prev, [field.key]: img.url }
                                                                                        delete next[`${field.key}_picker`]
                                                                                        return next
                                                                                    })
                                                                                }}
                                                                                    className="group relative rounded-lg overflow-hidden aspect-square cursor-pointer ring-1 ring-emerald-500/20 hover:ring-emerald-500/50 transition-all">
                                                                                    <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover" />
                                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                                        <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
                                                                                    </div>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Learn from Image (Reverse Prompting) */}
                                <div className="studio-card p-5">
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-amber-400 text-sm">lightbulb</span>
                                        Learn from an Image
                                        <span className="text-xs text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded ml-auto">Optional</span>
                                    </h4>
                                    <p className="text-sm text-slate-500 mb-3">Upload a reference design and AI will extract a reusable prompt formula based on its style, colors, and layout.</p>

                                    {templateRefImage ? (
                                        <div className="relative rounded-xl overflow-hidden mb-3">
                                            <img src={templateRefImage} alt="Reference" className="w-full max-h-32 object-contain bg-black/20 rounded-xl" />
                                            <button onClick={() => setTemplateRefImage(null)}
                                                className="absolute top-2 right-2 p-1 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 cursor-pointer">
                                                <span className="material-symbols-outlined text-xs">close</span>
                                            </button>
                                            {reversePrompting && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
                                                    <span className="material-symbols-outlined text-2xl text-amber-400 animate-spin">progress_activity</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <label className="flex items-center justify-center py-4 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/40 cursor-pointer transition-colors bg-amber-500/[0.03]">
                                                <span className="material-symbols-outlined text-lg text-amber-500/50 mr-2">image_search</span>
                                                <span className="text-[11px] text-amber-400/70">Upload a design to analyze</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                    const file = e.target.files?.[0]
                                                    if (file) {
                                                        const reader = new FileReader()
                                                        reader.onload = async ev => {
                                                            const s3Url = await uploadToS3(ev.target.result, 'reverse-prompt')
                                                            handleReversePrompt(s3Url, activeTemplate.id)
                                                        }
                                                        reader.readAsDataURL(file)
                                                    }
                                                }} />
                                            </label>
                                            {/* Brand website images for quick pick */}
                                            {(activeBrand?.dna?.brandImages?.length > 0 || activeBrand?.dna?.bannerImages?.length > 0) && (
                                                <div>
                                                    <p className="text-sm text-slate-500 mb-1.5 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm text-emerald-500">language</span>
                                                        Or pick from your brand website:
                                                    </p>
                                                    <div className="grid grid-cols-5 gap-1.5 max-h-24 overflow-y-auto">
                                                        {(activeBrand.dna.brandImages || activeBrand.dna.bannerImages || []).slice(0, 10).map((img, i) => (
                                                            <button key={i}
                                                                onClick={() => handleReversePrompt(img.url, activeTemplate.id)}
                                                                className="rounded-lg overflow-hidden border border-white/[0.08] hover:border-emerald-500/50 cursor-pointer transition-all">
                                                                <img src={img.url} alt="" className="w-full aspect-square object-cover"
                                                                    onError={e => e.target.parentElement.style.display = 'none'} />
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Size & Resolution Controls */}
                                <div className="studio-card p-5">
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-cyan-400 text-sm">aspect_ratio</span>
                                        Size & Resolution
                                    </h4>
                                    <div className="space-y-3">
                                        {/* Aspect Ratio */}
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Aspect Ratio</label>
                                            <div className="flex flex-wrap gap-1.5">
                                                {[
                                                    { value: '1:1', label: '1:1', icon: 'crop_square' },
                                                    { value: '4:5', label: '4:5', icon: 'crop_portrait' },
                                                    { value: '9:16', label: '9:16', icon: 'smartphone' },
                                                    { value: '16:9', label: '16:9', icon: 'crop_landscape' },
                                                    { value: '3:2', label: '3:2', icon: 'crop_landscape' },
                                                    { value: '4:3', label: '4:3', icon: 'crop_landscape' },
                                                    { value: '3:4', label: '3:4', icon: 'crop_portrait' },
                                                    { value: '21:9', label: '21:9', icon: 'panorama_wide_angle' },
                                                ].map(r => (
                                                    <button key={r.value} onClick={() => setTemplateFields(prev => ({ ...prev, _aspectRatio: r.value }))}
                                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${(templateFields._aspectRatio || aspectRatio) === r.value
                                                            ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                                                            : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}>
                                                        <span className="material-symbols-outlined text-xs">{r.icon}</span>
                                                        {r.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Resolution */}
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Resolution</label>
                                            <div className="flex gap-2">
                                                {[
                                                    { value: '512px', label: 'Draft', desc: '512px — fast preview' },
                                                    { value: '1K', label: '1K', desc: 'Standard quality' },
                                                    { value: '2K', label: '2K', desc: 'High quality' },
                                                ].map(r => (
                                                    <button key={r.value} onClick={() => setTemplateFields(prev => ({ ...prev, _imageSize: r.value }))}
                                                        className={`flex-1 py-2 rounded-lg text-center transition-all cursor-pointer ${(templateFields._imageSize || '1K') === r.value
                                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                                                            : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}>
                                                        <p className="text-xs font-bold">{r.label}</p>
                                                        <p className="text-[9px] text-slate-500 mt-0.5">{r.desc}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Additional Instructions (AI Vision adjustments) */}
                                <div className="studio-card p-5">
                                    <div className="flex items-center justify-between cursor-pointer"
                                        onClick={() => setTemplateFields(prev => ({ ...prev, _showExtraInstructions: !prev._showExtraInstructions }))}>
                                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-fuchsia-400 text-sm">magic_exchange</span>
                                            Additional Changes
                                            <span className="text-xs text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded">Optional</span>
                                        </h4>
                                        <span className={`material-symbols-outlined text-sm text-slate-500 transition-transform ${templateFields._showExtraInstructions ? 'rotate-180' : ''}`}>
                                            expand_more
                                        </span>
                                    </div>

                                    {templateFields._showExtraInstructions && (
                                        <div className="mt-3 space-y-3">
                                            <p className="text-xs text-slate-500">Tell AI what to change — gender, outfit, pose, background, add/remove elements. Our vision engine will intelligently adapt the entire image.</p>

                                            {/* Smart suggestion chips */}
                                            <div className="flex flex-wrap gap-1.5">
                                                {[
                                                    { label: '👨 Make model male', value: 'Change the model to a male with similar pose and expression' },
                                                    { label: '👩 Make model female', value: 'Change the model to a female with similar pose and expression' },
                                                    { label: '👔 Formal outfit', value: 'Change outfit to a formal business suit' },
                                                    { label: '👕 Casual outfit', value: 'Change outfit to casual streetwear' },
                                                    { label: '🌿 Outdoor background', value: 'Change background to an outdoor natural environment' },
                                                    { label: '🏢 Studio background', value: 'Change background to a clean studio environment' },
                                                    { label: '🌙 Dark theme', value: 'Make the overall design darker with a premium dark theme' },
                                                    { label: '☀️ Light theme', value: 'Make the overall design lighter with a clean light theme' },
                                                    { label: '🇮🇳 Indian model', value: 'Change the model to an Indian person with similar pose' },
                                                    { label: '😊 Smiling pose', value: 'Change the expression to a warm natural smile' },
                                                ].map((chip, i) => (
                                                    <button key={i} onClick={() => {
                                                        const current = templateFields._additionalInstructions || ''
                                                        const sep = current ? '. ' : ''
                                                        setTemplateFields(prev => ({ ...prev, _additionalInstructions: current + sep + chip.value }))
                                                    }}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-fuchsia-500/10 hover:border-fuchsia-500/20 hover:text-fuchsia-300 cursor-pointer transition-all">
                                                        {chip.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Free-form textarea */}
                                            <textarea
                                                value={templateFields._additionalInstructions || ''}
                                                onChange={e => setTemplateFields(prev => ({ ...prev, _additionalInstructions: e.target.value }))}
                                                placeholder="e.g., Change the model to a young man in a blue hoodie, make the background a sunset beach scene, add sunglasses..."
                                                className="input-glass w-full py-3 text-sm resize-none" rows={3} />

                                            {/* Enhance Additional Instructions */}
                                            {templateFields._additionalInstructions && (
                                                <div className="flex items-center gap-2">
                                                    <button onClick={async () => {
                                                        if (!templateFields._additionalInstructions?.trim() || !activeBrand || enhancing) return
                                                        setEnhancing(true)
                                                        try {
                                                            const data = await creativesAPI.enhancePrompt({
                                                                brandId: activeBrand._id,
                                                                prompt: `Image modification instructions: ${templateFields._additionalInstructions.trim()}`,
                                                                style: 'photorealistic',
                                                                format: 'template-edit',
                                                                aspectRatio: templateResolution?.ratio || '1:1',
                                                            })
                                                            if (data.enhancedPrompt) setTemplateFields(prev => ({ ...prev, _additionalInstructions: data.enhancedPrompt }))
                                                        } catch (err) { console.error('Enhance failed:', err) }
                                                        finally { setEnhancing(false) }
                                                    }}
                                                        disabled={enhancing || !activeBrand}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${enhancing
                                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                                            : 'bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-400 hover:from-amber-500/25 hover:to-orange-500/20 border border-amber-500/20 hover:border-amber-500/40'}`}>
                                                        <span className={`material-symbols-outlined text-sm ${enhancing ? 'animate-spin' : ''}`}>
                                                            {enhancing ? 'progress_activity' : 'auto_awesome'}
                                                        </span>
                                                        {enhancing ? 'Enhancing...' : '✨ Enhance'}
                                                    </button>
                                                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">visibility</span>
                                                        AI Vision will apply these changes
                                                    </span>
                                                    <button onClick={() => setTemplateFields(prev => ({ ...prev, _additionalInstructions: '' }))}
                                                        className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer ml-auto">Clear</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Generate Button */}
                                <CreditTooltipWrapper action="creative">
                                    <button onClick={() => handleTemplateGenerate(activeTemplate)}
                                        disabled={templateGenerating}
                                        className="btn-primary w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-30">
                                        {templateGenerating ? (
                                            <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Generating Design...</>
                                        ) : (
                                            <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate {activeTemplate.label} <CreditBadge action="creative" /></>
                                        )}
                                    </button>
                                </CreditTooltipWrapper>

                                {templateError && (
                                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                                        ⚠️ {templateError}
                                    </div>
                                )}
                            </div>

                            {/* Right — Preview & Result */}
                            <div className="col-span-12 lg:col-span-7 space-y-4">
                                {/* Prompt Preview */}
                                {(templatePromptPreview || Object.keys(templateFields).length > 0) && (
                                    <div className="studio-card p-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-sm">visibility</span>
                                                Prompt Preview
                                            </h4>
                                            <button onClick={() => {
                                                const built = activeTemplate.buildPrompt(activeBrand, templateFields)
                                                setTemplatePromptPreview(built)
                                            }}
                                                className="text-sm text-primary hover:text-primary-light cursor-pointer flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">refresh</span> Refresh
                                            </button>
                                        </div>
                                        <div className="bg-black/20 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                                            {templatePromptPreview || activeTemplate.buildPrompt(activeBrand, templateFields)}
                                        </div>
                                        <button onClick={() => {
                                            navigator.clipboard.writeText(templatePromptPreview || activeTemplate.buildPrompt(activeBrand, templateFields))
                                        }}
                                            className="mt-2 text-sm text-slate-500 hover:text-white cursor-pointer flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">content_copy</span> Copy Prompt
                                        </button>
                                    </div>
                                )}

                                {/* Result Display */}
                                {templateGenerating && (
                                    <div className="studio-card p-12 flex flex-col items-center justify-center min-h-[400px]">
                                        <div className="relative inline-block mb-4">
                                            <span className="material-symbols-outlined text-5xl text-primary animate-pulse">{activeTemplate.icon}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-white mb-2">Creating Your {activeTemplate.label}</h3>
                                        <p className="text-sm text-slate-400 mb-4">AI is designing with {activeBrand.name}'s brand identity...</p>
                                        <div className="flex gap-1">
                                            {[0, 1, 2, 3, 4].map(i => (
                                                <span key={i} className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!templateGenerating && !templateResult && (
                                    <div className="studio-card p-12 flex flex-col items-center justify-center min-h-[400px]">
                                        <span className="material-symbols-outlined text-6xl text-slate-700 mb-4">{activeTemplate.icon}</span>
                                        <h3 className="text-lg font-bold text-slate-500 mb-2">{activeTemplate.label}</h3>
                                        <p className="text-xs text-slate-600 max-w-sm text-center">Fill in the fields on the left and click Generate. Your design will appear here with {activeBrand.name}'s brand styling automatically applied.</p>
                                    </div>
                                )}

                                {templateResult && (
                                    <div className="studio-card p-5 fade-up">
                                        <div className="rounded-2xl overflow-hidden mb-4">
                                            <img src={templateResult.imageUrl} alt={activeTemplate.label} className="w-full rounded-2xl" loading="lazy" decoding="async" />
                                        </div>
                                        <div className="flex gap-2 flex-wrap">
                                            <a href={templateResult.imageUrl} download={`${activeTemplate.id}-${activeBrand.name}.png`}
                                                className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold">
                                                <span className="material-symbols-outlined text-sm">download</span>
                                                Download
                                            </a>
                                            <button onClick={() => { setTemplateResult(null); handleTemplateGenerate(activeTemplate) }}
                                                className="py-2.5 px-5 rounded-xl text-xs font-bold glass-panel text-slate-400 hover:text-white cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">refresh</span>
                                                Regenerate
                                            </button>
                                            <button onClick={() => {
                                                sessionStorage.setItem('canvasEditorImage', templateResult.imageUrl)
                                                navigate('/creative-studio/editor')
                                            }}
                                                className="py-2.5 px-5 rounded-xl text-xs font-bold bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                                Open in Canvas
                                            </button>
                                            <button onClick={() => {
                                                setDesignBaseImage(templateResult.imageUrl)
                                                setPrompt(templatePromptPreview || activeTemplate.buildPrompt(activeBrand, templateFields))
                                                setSelectedType(activeTemplate.type)
                                                setStyle(activeTemplate.style)
                                                setStudioMode('create')
                                            }}
                                                className="py-2.5 px-5 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">palette</span>
                                                Edit in Design Studio
                                            </button>
                                            <button onClick={() => setPublishData({ image: templateResult.imageUrl, text: '' })}
                                                className="py-2.5 px-5 rounded-xl text-xs font-bold bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">share</span>
                                                Publish
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* =================== IMAGE BANK MODE =================== */}
            {studioMode === 'imagebank' && (
                <div className="fade-up">


                    {/* ── Tab Bar ── */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                            {[
                                { id: 'generated', icon: 'auto_awesome', label: 'AI Generated', count: bankCounts.generated },
                                { id: 'uploaded', icon: 'upload_file', label: 'Uploaded', count: bankCounts.uploaded },
                                { id: 'brand', icon: 'language', label: 'Brand Images', count: activeBrand?.dna?.brandImages?.length || 0 },
                            ].map(tab => (
                                <button key={tab.id} onClick={() => { setBankTab(tab.id); if (tab.id !== 'brand') loadImageBank(tab.id) }}
                                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${bankTab === tab.id
                                        ? 'studio-nav-pill text-white shadow-lg'
                                        : 'text-slate-500 hover:text-white hover:bg-white/[0.05]'}`}>
                                    <span className="material-symbols-outlined text-base">{tab.icon}</span>
                                    <span className="hidden sm:inline">{tab.label}</span>
                                    {tab.count > 0 && (
                                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold ${bankTab === tab.id ? 'bg-white/20 text-white' : 'bg-white/[0.06] text-slate-400'}`}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            {bankTab !== 'brand' && (
                                <>
                                    <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
                                        <button onClick={() => setBankView('list')}
                                            className={`p-1.5 transition-all cursor-pointer ${bankView === 'list' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400'}`}
                                            title="List view">
                                            <span className="material-symbols-outlined text-sm">view_list</span>
                                        </button>
                                        <button onClick={() => setBankView('grid')}
                                            className={`p-1.5 transition-all cursor-pointer ${bankView === 'grid' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400'}`}
                                            title="Grid view">
                                            <span className="material-symbols-outlined text-sm">grid_view</span>
                                        </button>
                                    </div>
                                    <button onClick={() => loadImageBank()}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs glass-panel text-slate-400 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">refresh</span>
                                        Refresh
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {bankLoading && bankTab !== 'brand' && (
                        <div className="flex items-center justify-center py-20">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin">progress_activity</span>
                        </div>
                    )}

                    {/* ═══ BRAND IMAGES TAB ═══ */}
                    {bankTab === 'brand' && (() => {
                        const allBrandImgs = activeBrand?.dna?.brandImages || activeBrand?.dna?.bannerImages || []
                        return allBrandImgs.length > 0 ? (
                            <div>
                                <p className="text-xs text-slate-500 mb-4">Images scraped from your brand website during onboarding. Use them as references for AI generation.</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {allBrandImgs.map((img, idx) => (
                                        <div key={`brand-${idx}`}
                                            className="studio-card overflow-hidden group relative cursor-pointer">
                                            <img src={img.url} alt={img.alt || `Brand ${idx + 1}`} loading="lazy"
                                                className="w-full object-cover transition-transform duration-300 group-hover:scale-105" style={{ minHeight: '100px', maxHeight: '240px' }}
                                                onError={e => e.target.parentElement.style.display = 'none'} />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
                                                <p className="text-white text-xs font-bold truncate mb-2">{img.alt || img.source || 'Website Image'}</p>
                                                <div className="flex gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); window.open(img.url, '_blank') }}
                                                        className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all cursor-pointer" title="View Full Size">
                                                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDesignBaseImage(img.url); setPrompt(`Create a ${selectedType} using this brand image as reference. Brand: ${activeBrand?.name}.`); setStudioMode('create') }}
                                                        className="p-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all cursor-pointer" title="Use in Design">
                                                        <span className="material-symbols-outlined text-xs">palette</span>
                                                    </button>
                                                </div>
                                            </div>
                                            {img.source && (
                                                <span className="absolute top-2 right-2 text-[8px] text-white/70 bg-emerald-500/40 px-1.5 py-0.5 rounded-full backdrop-blur-sm capitalize">{img.source}</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-600 mt-3 italic">💡 These images can be used as reference for templates, AI photoshoots, and creative generation.</p>
                            </div>
                        ) : (
                            <div className="studio-card p-12 text-center">
                                <span className="material-symbols-outlined text-6xl text-slate-700 mb-4 block">language</span>
                                <h3 className="text-lg font-bold text-slate-500 mb-2">No Brand Images</h3>
                                <p className="text-xs text-slate-600 mb-4 max-w-md mx-auto">Run brand onboarding to scan your website and auto-import brand images.</p>
                                <button onClick={() => navigate('/onboarding')}
                                    className="btn-primary py-2.5 px-5 rounded-xl text-xs font-bold cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">language</span> Scan Website
                                </button>
                            </div>
                        )
                    })()}

                    {/* ═══ GENERATED / UPLOADED TABS ═══ */}
                    {bankTab !== 'brand' && !bankLoading && bankImages.length === 0 && (
                        <div className="studio-card p-12 text-center">
                            <span className="material-symbols-outlined text-6xl text-slate-700 mb-4 block">{bankTab === 'uploaded' ? 'upload_file' : 'auto_awesome'}</span>
                            <h3 className="text-lg font-bold text-slate-500 mb-2">{bankTab === 'uploaded' ? 'No Uploaded Images' : 'No Generated Images Yet'}</h3>
                            <p className="text-xs text-slate-600 mb-4 max-w-md mx-auto">
                                {bankTab === 'uploaded'
                                    ? 'Upload images to use as references or base images for your designs.'
                                    : 'Generate images in Design Studio or AI Photoshoot — they\'ll automatically appear here.'}
                            </p>
                            <div className="flex gap-2 justify-center">
                                <button onClick={() => setStudioMode('create')}
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

                    {bankTab !== 'brand' && !bankLoading && bankImages.length > 0 && (() => {
                        const getTimeAgo = (dateStr) => {
                            if (!dateStr) return '';
                            const diff = Date.now() - new Date(dateStr).getTime();
                            const mins = Math.floor(diff / 60000);
                            if (mins < 1) return 'just now';
                            if (mins < 60) return `${mins}m ago`;
                            const hrs = Math.floor(mins / 60);
                            if (hrs < 24) return `${hrs}h ago`;
                            const days = Math.floor(hrs / 24);
                            if (days < 7) return `${days}d ago`;
                            return new Date(dateStr).toLocaleDateString();
                        };
                        const handleRefillCreative = (img) => {
                            const isPhotoshootType = img.type === 'ai-photoshoot' || img.type === 'photoshoot';
                            if (isPhotoshootType) {
                                setPhotoshootBrief(img.prompt || '');
                                setSceneKeywords(img.tags || []);
                                setStudioMode('photoshoot');
                            } else {
                                setPrompt(img.prompt || '');
                                if (img.designData?.style) setStyle(img.designData.style);
                                if (img.type && !['uploaded', 'other'].includes(img.type)) setSelectedType(img.type);
                                if (img.designData?.textOverlay) setTextOverlay(img.designData.textOverlay);
                                setStudioMode('create');
                                setShowQuickStart(false);
                            }
                        };
                        const handleDownloadImage = async (url, title) => {
                            if (!url) return;
                            try {
                                const resp = await fetch(url);
                                const blob = await resp.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = `${(title || 'image').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
                                document.body.appendChild(a);
                                a.click();
                                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100);
                            } catch { window.open(url, '_blank') }
                        };
                        const handleCopyImagePrompt = (text, id) => {
                            if (!text) return;
                            navigator.clipboard.writeText(text).then(() => {
                                setBankCopiedId(id);
                                setTimeout(() => setBankCopiedId(null), 2000);
                            });
                        };
                        return bankView === 'list' ? (
                            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                {bankImages.map((img, idx) => {
                                    const isPhotoshoot = img.type === 'ai-photoshoot' || img.type === 'photoshoot';
                                    const isUploaded = img.type === 'uploaded';
                                    const timeAgo = getTimeAgo(img.createdAt);
                                    const promptPreview = img.prompt ? (img.prompt.length > 80 ? img.prompt.slice(0, 80) + '…' : img.prompt) : '';
                                    return (
                                        <div key={img._id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.12] transition-all group">
                                            {/* Thumbnail */}
                                            <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-black/40 cursor-pointer"
                                                onClick={() => setLightboxIdx(idx)}>
                                                <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Image'} loading="lazy"
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-white/80 text-lg">zoom_in</span>
                                                </div>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate mb-1">{img.title || 'AI Image'}</p>
                                                {promptPreview && (
                                                    <p className="text-xs text-slate-500 truncate mb-1.5" title={img.prompt}>{promptPreview}</p>
                                                )}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isPhotoshoot ? 'bg-amber-500/15 text-amber-400' :
                                                        isUploaded ? 'bg-slate-500/15 text-slate-400' :
                                                            'bg-primary/15 text-primary'}`}>
                                                        {isPhotoshoot ? '📸 Photoshoot' : isUploaded ? '📁 Uploaded' : '🎨 Design'}
                                                    </span>
                                                    {img.designData?.style && (
                                                        <span className="text-[10px] text-slate-600">{img.designData.style}</span>
                                                    )}
                                                    <span className="text-[10px] text-slate-700">{timeAgo}</span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {img.prompt && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleRefillCreative(img) }}
                                                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
                                                        title="Refill inputs & regenerate">
                                                        <span className="material-symbols-outlined text-base">replay</span>
                                                    </button>
                                                )}
                                                {img.prompt && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleCopyImagePrompt(img.prompt, img._id) }}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${bankCopiedId === img._id ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 hover:text-blue-400 hover:bg-blue-500/10'}`}
                                                        title={bankCopiedId === img._id ? 'Copied!' : 'Copy prompt'}>
                                                        <span className="material-symbols-outlined text-base">{bankCopiedId === img._id ? 'check' : 'content_copy'}</span>
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(img.imageUrl, img.title || 'image') }}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all cursor-pointer"
                                                    title="Download">
                                                    <span className="material-symbols-outlined text-base">download</span>
                                                </button>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    sessionStorage.setItem('canvasEditorImage', img.imageUrl);
                                                    navigate('/creative-studio/editor')
                                                }}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all cursor-pointer"
                                                    title="Edit in Canvas">
                                                    <span className="material-symbols-outlined text-base">edit</span>
                                                </button>
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDesignBaseImage(img.imageUrl);
                                                    setPrompt(`Adapt this image for ${selectedType}. Brand: ${activeBrand?.name}.`);
                                                    setStudioMode('create')
                                                }}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 transition-all cursor-pointer"
                                                    title="Use as base">
                                                    <span className="material-symbols-outlined text-base">palette</span>
                                                </button>
                                                <button onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Delete this image?')) {
                                                        try { await creativesAPI.delete(img._id); loadImageBank() } catch (err) { console.error(err) }
                                                    }
                                                }}
                                                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                                                    title="Delete">
                                                    <span className="material-symbols-outlined text-base">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            /* ── GRID VIEW ── */
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                {bankImages.map((img, idx) => {
                                    const isPhotoshoot = img.type === 'ai-photoshoot' || img.type === 'photoshoot';
                                    const isUploaded = img.type === 'uploaded';
                                    const timeAgo = getTimeAgo(img.createdAt);
                                    return (
                                        <div key={img._id} className="studio-card overflow-hidden group relative cursor-pointer"
                                            onClick={() => setLightboxIdx(idx)}>
                                            <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Generated'} loading="lazy"
                                                className="w-full object-cover transition-transform duration-300 group-hover:scale-105" style={{ minHeight: '120px', maxHeight: '300px' }} />

                                            {/* Hover overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
                                                <p className="text-white text-xs font-bold truncate mb-0.5">{img.title || 'AI Image'}</p>
                                                {img.prompt && <p className="text-slate-400 text-[10px] truncate mb-2" title={img.prompt}>{img.prompt.length > 50 ? img.prompt.slice(0, 50) + '…' : img.prompt}</p>}
                                                <div className="flex gap-1">
                                                    {img.prompt && (
                                                        <>
                                                            <button onClick={(e) => { e.stopPropagation(); handleRefillCreative(img) }}
                                                                className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-all cursor-pointer" title="Refill">
                                                                <span className="material-symbols-outlined text-xs">replay</span>
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleCopyImagePrompt(img.prompt, img._id) }}
                                                                className={`p-1.5 rounded-lg transition-all cursor-pointer ${bankCopiedId === img._id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'}`}
                                                                title={bankCopiedId === img._id ? 'Copied!' : 'Copy prompt'}>
                                                                <span className="material-symbols-outlined text-xs">{bankCopiedId === img._id ? 'check' : 'content_copy'}</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(img.imageUrl, img.title || 'image') }}
                                                        className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-all cursor-pointer" title="Download">
                                                        <span className="material-symbols-outlined text-xs">download</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('canvasEditorImage', img.imageUrl); navigate('/creative-studio/editor') }}
                                                        className="p-1.5 rounded-lg bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 transition-all cursor-pointer" title="Edit">
                                                        <span className="material-symbols-outlined text-xs">edit</span>
                                                    </button>
                                                    <button onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (confirm('Delete this image?')) {
                                                            try { await creativesAPI.delete(img._id); loadImageBank() } catch (err) { console.error(err) }
                                                        }
                                                    }}
                                                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all cursor-pointer" title="Delete">
                                                        <span className="material-symbols-outlined text-xs">delete</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Source badge */}
                                            <div className="absolute top-2 left-2">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm ${isPhotoshoot ? 'bg-amber-500/30 text-amber-300' : isUploaded ? 'bg-slate-500/30 text-slate-300' : 'bg-primary/30 text-primary-light'}`}>
                                                    {isPhotoshoot ? '📸' : isUploaded ? '📁' : '🎨'}
                                                </span>
                                            </div>
                                            {/* Time badge */}
                                            <div className="absolute top-2 right-2">
                                                <span className="text-[8px] text-white/60 bg-black/40 px-1.5 py-0.5 rounded-full backdrop-blur-sm">{timeAgo}</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })()}

                    {/* ═══ ZOOM LIGHTBOX (for generated result) ═══ */}
                    {zoomImage && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center animate-fade-in"
                            onClick={() => setZoomImage(null)}>
                            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
                            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
                                <img src={zoomImage} alt="Zoomed" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
                                <div className="absolute top-3 right-3 flex gap-2">
                                    <a href={zoomImage} download="creative.png"
                                        className="p-2 rounded-full bg-black/60 text-white hover:bg-white/20 backdrop-blur-sm transition-colors">
                                        <span className="material-symbols-outlined text-lg">download</span>
                                    </a>
                                    <button onClick={() => setZoomImage(null)}
                                        className="p-2 rounded-full bg-black/60 text-white hover:bg-white/20 backdrop-blur-sm cursor-pointer transition-colors">
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ═══ LIGHTBOX / ZOOM OVERLAY ═══ */}
                    {lightboxIdx !== null && bankImages[lightboxIdx] && (() => {
                        const img = bankImages[lightboxIdx]
                        return (
                            <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in"
                                style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(20px)' }}
                                onClick={() => setLightboxIdx(null)}
                                ref={el => {
                                    // Keyboard navigation
                                    if (el) {
                                        el.focus()
                                        el.onkeydown = (e) => {
                                            if (e.key === 'Escape') setLightboxIdx(null)
                                            if (e.key === 'ArrowLeft') setLightboxIdx(prev => prev > 0 ? prev - 1 : bankImages.length - 1)
                                            if (e.key === 'ArrowRight') setLightboxIdx(prev => prev < bankImages.length - 1 ? prev + 1 : 0)
                                        }
                                    }
                                }}
                                tabIndex={-1}>

                                {/* Close */}
                                <button onClick={() => setLightboxIdx(null)}
                                    className="absolute top-5 right-5 p-2 rounded-xl bg-white/10 text-white hover:bg-white/20 cursor-pointer z-10 backdrop-blur-sm">
                                    <span className="material-symbols-outlined">close</span>
                                </button>

                                {/* Counter */}
                                <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-xs font-bold bg-white/5 px-4 py-1.5 rounded-full backdrop-blur-sm">
                                    {lightboxIdx + 1} / {bankImages.length}
                                </div>

                                {/* Prev Arrow */}
                                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(prev => prev > 0 ? prev - 1 : bankImages.length - 1) }}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 cursor-pointer z-10 backdrop-blur-sm transition-all hover:scale-110">
                                    <span className="material-symbols-outlined text-2xl">chevron_left</span>
                                </button>

                                {/* Next Arrow */}
                                <button onClick={(e) => { e.stopPropagation(); setLightboxIdx(prev => prev < bankImages.length - 1 ? prev + 1 : 0) }}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-2xl bg-white/10 text-white hover:bg-white/20 cursor-pointer z-10 backdrop-blur-sm transition-all hover:scale-110">
                                    <span className="material-symbols-outlined text-2xl">chevron_right</span>
                                </button>

                                {/* Image + Info */}
                                <div className="max-w-4xl max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                                    <img src={img.imageUrl} alt={img.title || 'AI Image'}
                                        loading="lazy" decoding="async"
                                        className="max-w-full max-h-[65vh] object-contain rounded-2xl shadow-2xl" />

                                    {/* Info bar */}
                                    <div className="mt-4 w-full max-w-2xl">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-white font-bold text-sm">{img.title || 'AI Generated Image'}</p>
                                                <p className="text-slate-400 text-[11px]">
                                                    {img.type === 'ai-photoshoot' ? '📸 AI Photoshoot' : '🎨 Design Studio'} •{' '}
                                                    {new Date(img.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                            </div>
                                            {img.prompt && (
                                                <p className="text-slate-500 text-xs max-w-xs text-right italic truncate">"{img.prompt}"</p>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-2 flex-wrap">
                                            <a href={img.imageUrl} download={`${img.title || 'image'}.png`}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-white/10 text-white hover:bg-white/20 flex items-center gap-2 transition-colors">
                                                <span className="material-symbols-outlined text-sm">download</span>
                                                Download
                                            </a>
                                            <button onClick={() => {
                                                sessionStorage.setItem('canvasEditorImage', img.imageUrl)
                                                setLightboxIdx(null)
                                                navigate('/creative-studio/editor')
                                            }}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 flex items-center gap-2 cursor-pointer transition-colors">
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                                Open in Canvas
                                            </button>
                                            <button onClick={() => {
                                                setDesignBaseImage(img.imageUrl)
                                                setPrompt(`Adapt this image for ${selectedType}. Brand: ${activeBrand?.name}.`)
                                                setLightboxIdx(null)
                                                setStudioMode('create')
                                            }}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-2 cursor-pointer transition-colors">
                                                <span className="material-symbols-outlined text-sm">palette</span>
                                                Use in Design
                                            </button>
                                            <button onClick={() => { setLightboxIdx(null); setPublishData({ image: img.imageUrl, text: '' }) }}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-[#1877F2]/15 text-[#1877F2] hover:bg-[#1877F2]/25 flex items-center gap-2 cursor-pointer transition-colors">
                                                <span className="material-symbols-outlined text-sm">share</span>
                                                Publish
                                            </button>
                                            <button onClick={async () => {
                                                if (confirm('Delete this image permanently?')) {
                                                    try {
                                                        await creativesAPI.delete(img._id)
                                                        setLightboxIdx(null)
                                                        loadImageBank()
                                                    } catch (err) { console.error(err) }
                                                }
                                            }}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center gap-2 cursor-pointer transition-colors ml-auto">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            )}

            {/* ── Media Picker Modal ── */}
            {refPickerSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={() => setRefPickerSlot(null)}>
                    <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex"
                        style={{ width: '720px', maxWidth: '92vw', height: '520px', maxHeight: '85vh' }}
                        onClick={e => e.stopPropagation()}>

                        {/* ── Left Sidebar ── */}
                        <div className="w-[200px] flex-shrink-0 bg-[#12121f] border-r border-white/[0.06] flex flex-col">
                            {/* Header */}
                            <div className="p-4 pb-3">
                                <h3 className="text-sm font-extrabold text-white capitalize flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">image_search</span>
                                    {refPickerSlot?.startsWith('character-') ? 'Add Character' : refPickerSlot === 'style' ? 'Style Reference' : 'Reference Image'}
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1">
                                    {refPickerSlot?.startsWith('character-') ? 'Pick a person, mascot, or character to include in your design' : refPickerSlot === 'style' ? 'Pick an image to match its visual style' : 'Pick an image for context'}
                                </p>
                            </div>

                            {/* Source tabs — vertical */}
                            <div className="flex flex-col gap-1 px-3">
                                {[
                                    { id: 'upload', icon: 'cloud_upload', label: 'Upload', subtitle: 'From device' },
                                    { id: 'bank', icon: 'photo_library', label: 'Library', subtitle: `${bankImages.length} images` },
                                    { id: 'brand', icon: 'domain', label: 'Brand Assets', subtitle: `${brandImages.length} images` },
                                ].map(t => (
                                    <button key={t.id} onClick={() => setRefPickerTab(t.id)}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer
                                            ${refPickerTab === t.id
                                                ? 'bg-primary/15 text-white border border-primary/30'
                                                : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'}`}>
                                        <span className={`material-symbols-outlined text-base ${refPickerTab === t.id ? 'text-primary' : ''}`}>{t.icon}</span>
                                        <div>
                                            <p className="text-xs font-bold">{t.label}</p>
                                            <p className="text-[9px] text-slate-500">{t.subtitle}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Upload panel always visible at bottom */}
                            <div className="mt-auto p-3">
                                <label className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/40 cursor-pointer bg-white/[0.02] transition-all hover:bg-white/[0.04] group">
                                    <span className="material-symbols-outlined text-2xl text-slate-500 group-hover:text-primary mb-1">add_photo_alternate</span>
                                    <span className="text-[10px] text-slate-400 group-hover:text-white font-medium">Upload image</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={e => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                            const reader = new FileReader()
                                            reader.onload = async ev => {
                                                const s3Url = await uploadToS3(ev.target.result, 'refs')
                                                if (refPickerSlot?.startsWith('character-')) {
                                                    setCharacters(prev => [...prev, { name: `Character ${prev.length + 1}`, image: s3Url }])
                                                } else {
                                                    setReferenceImages(prev => ({ ...prev, [refPickerSlot]: s3Url }))
                                                }
                                                setRefPickerSlot(null)
                                            }
                                            reader.readAsDataURL(file)
                                        }
                                    }} />
                                </label>
                            </div>
                        </div>

                        {/* ── Right Content ── */}
                        <div className="flex-1 flex flex-col min-w-0">
                            {/* Top bar with search + close */}
                            <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
                                <div className="flex-1 flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2">
                                    <span className="material-symbols-outlined text-sm text-slate-500">search</span>
                                    <span className="text-xs text-slate-500">
                                        {refPickerTab === 'bank' ? 'Your generated images' : refPickerTab === 'brand' ? 'Brand website images' : 'Upload from device'}
                                    </span>
                                </div>
                                <button onClick={() => setRefPickerSlot(null)}
                                    className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-white cursor-pointer transition-colors">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>

                            {/* Content area */}
                            <div className="flex-1 overflow-y-auto p-5">

                                {/* Upload tab content */}
                                {refPickerTab === 'upload' && (
                                    <label className="flex flex-col items-center justify-center h-full rounded-2xl border-2 border-dashed border-white/[0.1] hover:border-primary/40 cursor-pointer bg-white/[0.02] transition-all group">
                                        <span className="material-symbols-outlined text-5xl text-slate-600 group-hover:text-primary mb-3">cloud_upload</span>
                                        <p className="text-base text-slate-400 group-hover:text-white font-medium mb-1">Drop an image or click to upload</p>
                                        <p className="text-xs text-slate-600">PNG, JPG, or WebP up to 10MB</p>
                                        <input type="file" className="hidden" accept="image/*" onChange={e => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const reader = new FileReader()
                                                reader.onload = async ev => {
                                                    const s3Url = await uploadToS3(ev.target.result, 'refs')
                                                    if (refPickerSlot?.startsWith('character-')) {
                                                        setCharacters(prev => [...prev, { name: `Character ${prev.length + 1}`, image: s3Url }])
                                                    } else {
                                                        setReferenceImages(prev => ({ ...prev, [refPickerSlot]: s3Url }))
                                                    }
                                                    setRefPickerSlot(null)
                                                }
                                                reader.readAsDataURL(file)
                                            }
                                        }} />
                                    </label>
                                )}

                                {/* Library tab content */}
                                {refPickerTab === 'bank' && (
                                    <div>
                                        {bankImages.length > 0 ? (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                                                {bankImages.map((img, i) => (
                                                    <button key={img._id || i}
                                                        onClick={() => {
                                                            if (refPickerSlot?.startsWith('character-')) {
                                                                setCharacters(prev => [...prev, { name: `Character ${prev.length + 1}`, image: img.imageUrl }])
                                                            } else {
                                                                setReferenceImages(prev => ({ ...prev, [refPickerSlot]: img.imageUrl }))
                                                            }
                                                            setRefPickerSlot(null)
                                                        }}
                                                        className="aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-primary/60 cursor-pointer transition-all hover:scale-[1.03] hover:shadow-lg hover:shadow-primary/10 group relative">
                                                        <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || ''} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                                            <span className="text-[9px] text-white font-medium truncate">{img.title || img.type}</span>
                                                        </div>
                                                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <span className="bg-primary text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md">Select</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-60 text-center">
                                                <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">photo_library</span>
                                                <p className="text-sm text-slate-500 font-medium">No images in your library</p>
                                                <p className="text-xs text-slate-600 mt-1">Generate some creatives first — they'll appear here.</p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Brand tab content */}
                                {refPickerTab === 'brand' && (
                                    <div>
                                        {brandImages.length > 0 ? (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                                                {brandImages.map((img, i) => (
                                                    <button key={`brand-${i}`}
                                                        onClick={() => {
                                                            if (refPickerSlot?.startsWith('character-')) {
                                                                setCharacters(prev => [...prev, { name: `Character ${prev.length + 1}`, image: img.url }])
                                                            } else {
                                                                setReferenceImages(prev => ({ ...prev, [refPickerSlot]: img.url }))
                                                            }
                                                            setRefPickerSlot(null)
                                                        }}
                                                        className="aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-emerald-400/60 cursor-pointer transition-all hover:scale-[1.03] hover:shadow-lg hover:shadow-emerald-500/10 group relative">
                                                        <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover"
                                                            onError={e => e.target.parentElement.style.display = 'none'} />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                                            <span className="text-[9px] text-white font-medium truncate">{img.alt || img.source || 'Brand image'}</span>
                                                        </div>
                                                        {img.source && (
                                                            <span className="absolute top-1.5 left-1.5 bg-emerald-500/80 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-md capitalize backdrop-blur-sm">{img.source}</span>
                                                        )}
                                                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <span className="bg-emerald-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md">Select</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-60 text-center">
                                                <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">domain</span>
                                                <p className="text-sm text-slate-500 font-medium">No brand images found</p>
                                                <p className="text-xs text-slate-600 mt-1">Add a website URL in Brand DNA to auto-scan images.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
                                <p className="text-[10px] text-slate-600">
                                    {refPickerTab === 'bank' ? `${bankImages.length} images` : refPickerTab === 'brand' ? `${brandImages.length} images` : 'Drag & drop or browse'}
                                </p>
                                <button onClick={() => setRefPickerSlot(null)}
                                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-colors">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
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

                        {/* Catalog Products */}
                        {productsList.length > 0 && (
                            <div className="mb-5">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-3">From Product Catalog</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                                <p className="text-sm font-bold text-white truncate">{p.title}</p>
                                                {p.price?.amount > 0 && (
                                                    <p className="text-xs font-bold text-cyan-400 mt-0.5">₹{p.price.amount.toLocaleString()}</p>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Brand Website Images — always show if available */}
                        {(activeBrand?.dna?.brandImages?.length > 0 || activeBrand?.dna?.bannerImages?.length > 0) && (
                            <div className="mb-4">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-emerald-500">language</span>
                                    From Your Website
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                    {(activeBrand.dna.brandImages || activeBrand.dna.bannerImages || []).map((img, i) => (
                                        <button key={`brand-${i}`}
                                            onClick={() => {
                                                setSelectedProduct({
                                                    _id: `brand-img-${i}`,
                                                    title: img.alt || `Website Image ${i + 1}`,
                                                    images: [{ url: img.url }],
                                                    source: 'website',
                                                });
                                                setShowProductPicker(false);
                                            }}
                                            className="rounded-xl overflow-hidden border border-white/[0.08] hover:border-emerald-400/40 transition-all cursor-pointer hover:scale-[1.03] group">
                                            <div className="h-20 bg-white/[0.02] overflow-hidden">
                                                <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                    onError={e => e.target.parentElement.parentElement.style.display = 'none'} />
                                            </div>
                                            {img.source && (
                                                <p className="text-sm text-slate-500 text-center py-1 capitalize">{img.source}</p>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty state — only when BOTH are empty */}
                        {productsList.length === 0 && !(activeBrand?.dna?.brandImages?.length > 0 || activeBrand?.dna?.bannerImages?.length > 0) && (
                            <div className="text-center py-10">
                                <span className="material-symbols-outlined text-4xl text-slate-600 mb-3">inbox</span>
                                <p className="text-slate-400 text-sm">No products in your catalog.</p>
                                <p className="text-slate-600 text-xs mt-1">Add products in Brand DNA → Products & Services</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══ UNIFIED PUBLISH MODAL (shared across all modes) ═══ */}
            <PublishModal
                isOpen={!!publishData}
                onClose={() => setPublishData(null)}
                defaultText={publishData?.text || ''}
                defaultImage={publishData?.image || null}
                brandId={activeBrand?._id}
            />

        </DashboardLayout>
    )
}

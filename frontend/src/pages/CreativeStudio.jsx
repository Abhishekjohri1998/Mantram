import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import { creatives as creativesAPI, agents as agentsAPI, products as productsAPI, brands as brandsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import VoiceInput from '../components/VoiceInput'
import PublishModal from '../components/PublishModal'

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
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [feedbackState, setFeedbackState] = useState(null)  // 'liked' | 'disliked' | 'accepted'
    const [feedbackToast, setFeedbackToast] = useState('')
    const [style, setStyle] = useState('modern')
    const [textOverlay, setTextOverlay] = useState('')
    const [fromContent, setFromContent] = useState(false)
    const [aspectRatio, setAspectRatio] = useState('1:1')
    const [showPublish, setShowPublish] = useState(false)

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
    const [activeCategory, setActiveCategory] = useState(null)
    const [savedCategories, setSavedCategories] = useState([]) // custom categories from DB
    const [showCreateCategory, setShowCreateCategory] = useState(false)
    const [creatingCategory, setCreatingCategory] = useState(false)
    const [newCat, setNewCat] = useState({
        label: '', icon: 'auto_awesome', color: '#f59e0b', description: '',
        referenceImageUrl: '', basePromptFormula: '', imageSource: 'upload' // 'upload' | 'url' | 'bank'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
                        const colors = brand.dna?.colors?.map(c => c.hex).join(', ') || 'brand colors'
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
            const builtPrompt = tmpl.buildPrompt(activeBrand, templateFields)
            setTemplatePromptPreview(builtPrompt)

            const options = {
                style: tmpl.style || 'modern',
                referenceImages: {},
                aspectRatio,
            }

            // If an image field was filled, pass it as baseImage
            const imageField = tmpl.fields.find(f => f.type === 'image')
            if (imageField && templateFields[imageField.key]) {
                options.baseImage = templateFields[imageField.key]
            }

            // If a reverse-generated reference image exists, pass it too
            if (templateRefImage) {
                options.referenceImages.style = templateRefImage
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
    }, [activeBrand, templateFields, templateRefImage, templateGenerating])

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

    // ── Analyze image for new template creation ──
    const handleAnalyzeForTemplate = useCallback(async (imageSource) => {
        if (!activeBrand) return
        setAnalyzeLoading(true)
        setNewTmpl(prev => ({ ...prev, referenceImageUrl: imageSource }))

        const isBase64 = imageSource.startsWith('data:')
        const brandColors = activeBrand.dna?.colors?.map(c => c.hex).join(', ') || 'not specified'

        try {
            const resp = await fetch('/api/canvas-assets/ai-analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: `You are an expert design analyst. Analyze this design image and create a REUSABLE PROMPT FORMULA for generating similar designs.

Extract and describe all visual elements:
1. Background (color, gradient, texture, pattern)
2. Layout structure and element arrangement
3. Typography (font style, hierarchy, colors, weights)
4. Design elements (shapes, borders, shadows, icons)
5. Logo/branding placement
6. Color scheme application
7. Overall mood and visual theme

Create a prompt formula using {{KEYWORD}} placeholders for changeable parts:
- {{HEADLINE}} for main headline
- {{SUBTEXT}} for supporting text
- {{CTA}} for call-to-action
- {{PRODUCT_NAME}} for product name
- {{QUOTE_TEXT}} for quote content
- {{OFFER}} for offer/discount text
- {{IMAGE}} for product/reference image

Brand: ${activeBrand.name}
Brand colors: ${brandColors}

Return ONLY the prompt formula text. Start with "Create a..." or "Design a..."`,
                    ...(isBase64 ? { imageBase64: imageSource } : { imageUrl: imageSource }),
                }),
            })
            const data = await resp.json()
            if (data.description) {
                setNewTmpl(prev => ({ ...prev, promptFormula: data.description }))
            } else {
                setNewTmpl(prev => ({
                    ...prev,
                    promptFormula: `Create a design matching this reference style for ${activeBrand.name}. Use brand colors (${brandColors}). Maintain the same layout, typography hierarchy, and visual elements. Replace content with: {{HEADLINE}}, {{SUBTEXT}}, {{CTA}}.`
                }))
            }
        } catch (err) {
            console.error('Analyze error:', err)
            setNewTmpl(prev => ({
                ...prev,
                promptFormula: `Create a design matching the uploaded reference style for ${activeBrand.name}. Use brand colors. {{HEADLINE}} as the main text. {{SUBTEXT}} as subtext. {{CTA}} as call-to-action.`
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
                description: newCat.description,
                referenceImageUrl: newCat.referenceImageUrl,
                basePromptFormula: newCat.basePromptFormula,
            })
            if (data.success) {
                await loadCustomCategories()
                setShowCreateCategory(false)
                setNewCat({ label: '', icon: 'auto_awesome', color: '#f59e0b', description: '', referenceImageUrl: '', basePromptFormula: '', imageSource: 'upload' })
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

    return (
        <DashboardLayout>
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">Creative <span className="text-primary">Studio</span></h2>
                    <p className="text-slate-400 text-sm">AI visual content generation, aligned with your brand identity.</p>
                </div>
            </div>

            {/* Studio Mode Toggle */}
            <div className="flex gap-2 mb-6">
                {[
                    { id: 'design', icon: 'palette', label: 'Design Studio', desc: 'Generate creatives from text' },
                    { id: 'templates', icon: 'dashboard_customize', label: 'Brand Templates', desc: 'Quick on-brand designs' },
                    { id: 'photoshoot', icon: 'photo_camera', label: 'AI Photoshoot', desc: 'Style product photos with AI' },
                    { id: 'aicanvas', icon: 'edit', label: 'AI Canvas', desc: 'Edit images with AI tools' },
                    { id: 'imagebank', icon: 'photo_library', label: 'Image Bank', desc: 'Browse saved images' },
                ].map(m => (
                    <button key={m.id} onClick={() => {
                        if (m.id === 'aicanvas') {
                            navigate('/creative-studio/editor')
                        } else {
                            setStudioMode(m.id)
                        }
                    }}
                        className={`flex-1 flex items-center gap-3 p-4 rounded-2xl transition-all cursor-pointer ${studioMode === m.id
                            ? 'bg-primary/15 border-2 border-primary/40 text-white'
                            : 'glass-panel text-slate-400 hover:text-white hover:bg-white/[0.04]'
                            }`}>
                        <span className={`material-symbols-outlined text-2xl ${studioMode === m.id ? 'text-primary' : 'text-slate-500'}`}>{m.icon}</span>
                        <div>
                            <p className="text-sm font-bold">{m.label}</p>
                            <p className="text-sm text-slate-500">{m.desc}</p>
                        </div>
                        {m.id === 'imagebank' && bankTotal > 0 && (
                            <span className="ml-auto bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{bankTotal}</span>
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
                            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                                {creativeTypes.map(ct => (
                                    <button key={ct.id} onClick={() => setSelectedType(ct.id)}
                                        className={`p-3 rounded-xl text-left transition-all cursor-pointer ${selectedType === ct.id
                                            ? 'bg-primary/20 border border-primary/30 text-white'
                                            : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.05]'
                                            }`}>
                                        <span className="material-symbols-outlined text-lg block mb-1">{ct.icon}</span>
                                        <p className="text-xs font-bold">{ct.label}</p>
                                        <p className="text-sm text-slate-500">{ct.size}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Reference Images (Style / Character / Upload) ── */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">image_search</span>
                                Reference Images
                                <span className="text-xs text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded ml-auto">Optional</span>
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                                                <span className="text-sm text-slate-500 font-medium">{ref.label}</span>
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
                                    <p className="text-sm text-slate-500 mb-2">Brand Colors (auto-applied)</p>
                                    <div className="flex gap-1.5">
                                        {activeBrand.dna.colors.map((c, i) => (
                                            <div key={i} className="w-7 h-7 rounded-lg border border-white/[0.1]" style={{ background: c.hex }} title={c.hex} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Aspect Ratio ── */}
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary text-lg">aspect_ratio</span>
                                Aspect Ratio
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {ASPECT_RATIOS.map(ar => (
                                    <button key={ar.ratio} onClick={() => setAspectRatio(ar.ratio)}
                                        className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-all cursor-pointer ${aspectRatio === ar.ratio
                                            ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                            : 'bg-white/[0.04] text-slate-500 hover:text-white hover:bg-white/[0.06]'}`}>
                                        <span className="text-sm">{ar.icon}</span>
                                        <span className="font-bold">{ar.ratio}</span>
                                        <span className="text-[8px] opacity-70">{ar.label}</span>
                                    </button>
                                ))}
                            </div>
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
                                    <span className="text-base font-bold text-white flex items-center gap-2">
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
                                            <p className="text-sm text-slate-500 mb-1">Position</p>
                                            <div className="grid grid-cols-3 gap-0.5 w-16">
                                                {['top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right'].map(pos => (
                                                    <button key={pos} onClick={() => setLogoPosition(pos)}
                                                        className={`w-5 h-5 rounded transition-all cursor-pointer ${logoPosition === pos ? 'bg-primary' : 'bg-white/[0.06] hover:bg-white/[0.1]'}`} />
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm text-slate-500 mb-1">Size</p>
                                            <div className="flex gap-1">
                                                {['small', 'medium', 'large'].map(s => (
                                                    <button key={s} onClick={() => setLogoSize(s)}
                                                        className={`px-2 py-1 rounded text-xs font-bold capitalize cursor-pointer ${logoSize === s ? 'bg-primary text-white' : 'bg-white/[0.04] text-slate-500'}`}>
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
                                    <p className="text-sm text-slate-400">Using brand DNA: {activeBrand?.name} • Style: {style}</p>
                                </div>
                            ) : result ? (
                                <div className="animate-fade-in">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{result.title || 'Generated Creative'}</h3>
                                            <p className="text-sm text-slate-400">{selectedTypeInfo?.label} • {selectedTypeInfo?.size} • {style}</p>
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
                                            <p className="text-sm text-white/50">{activeBrand?.name}</p>
                                        </div>
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
                                        <button onClick={() => setShowPublish(true)}
                                            className="btn-glass py-2.5 px-6 rounded-xl text-sm font-bold bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 border border-[#1877F2]/30 cursor-pointer transition-all">
                                            <span className="material-symbols-outlined text-sm">share</span> Publish
                                        </button>
                                    </div>

                                    <PublishModal
                                        isOpen={showPublish}
                                        onClose={() => setShowPublish(false)}
                                        defaultText={prompt}
                                        defaultImage={result?.imageUrl}
                                    />

                                    {/* ── Open Canvas Editor Button ── */}
                                    {result?.imageUrl && (
                                        <button
                                            onClick={() => {
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
                            ) : designBaseImage ? (
                                <div className="flex flex-col items-center justify-center h-80 gap-4 relative">
                                    <img src={designBaseImage} alt="Photoshoot base" className="w-full h-full object-contain rounded-xl opacity-60" />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 rounded-xl">
                                        <span className="material-symbols-outlined text-5xl text-primary mb-3">auto_awesome</span>
                                        <h3 className="text-lg font-bold text-white mb-1">Photoshoot Image Ready</h3>
                                        <p className="text-sm text-slate-300 mb-4 text-center max-w-sm">
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
                                    <p className="text-sm text-slate-400 text-center mb-5">Choose a category and we'll help you build the perfect prompt</p>
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
                                                <p className="text-base font-bold text-white group-hover:text-primary transition-colors">{card.label}</p>
                                                <p className="text-sm text-slate-500">{card.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-slate-600 text-center mt-4">Or just type your own description in the prompt box below ↓</p>
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
                                        <p className="text-sm font-bold text-white">Linked to Content Studio</p>
                                        <p className="text-sm text-slate-400">Image will be generated to match your content in {activeBrand?.name}'s brand style</p>
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
                                        <p className="text-sm font-bold text-white">📸 Linked from AI Photoshoot</p>
                                        <p className="text-sm text-slate-400">Describe how to adapt this image for your platform</p>
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
                                        <p className="text-sm font-bold text-white truncate">{selectedProduct.title}</p>
                                        <p className="text-sm text-cyan-400">Product selected — will be used in creative</p>
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
                                    className="w-full mb-3 py-2 px-3 rounded-xl glass-panel text-sm text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/5 transition-all cursor-pointer font-bold flex items-center gap-2 justify-center border border-dashed border-white/10 hover:border-cyan-400/30">
                                    <span className="material-symbols-outlined text-sm">inventory_2</span>
                                    Select a Product (optional)
                                </button>
                            )}
                            <div className="space-y-3">
                                <div className="relative">
                                    <textarea
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate() } }}
                                        placeholder={activeBrand ? "Describe the visual you want... Type or speak in any language 🎤" : "Create a brand first"}
                                        disabled={!activeBrand || generating}
                                        className="input-glass w-full resize-none py-3 pr-12 disabled:opacity-30"
                                        rows={3}
                                        style={{ minHeight: '100px' }}
                                    />
                                    <div className="absolute right-3 top-3">
                                        <VoiceInput
                                            onResult={(text) => setPrompt(prev => prev ? prev + ' ' + text : text)}
                                            size="small"
                                        />
                                    </div>
                                </div>
                                <CreditTooltipWrapper action="creative">
                                    <button onClick={handleGenerate} disabled={!prompt.trim() || !activeBrand || generating}
                                        className="btn-primary w-full py-3 px-6 rounded-xl disabled:opacity-30 justify-center">
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
                                    <p className="text-xs text-slate-600 mb-3">AI will place it in a professional photoshoot</p>
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
                                            <span className="text-sm text-white">{productFile.name}</span>
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
                                <span className="text-xs text-slate-600 bg-white/[0.04] px-1.5 py-0.5 rounded ml-auto">Optional</span>
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
                                            <label className="flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/40 cursor-pointer transition-colors bg-white/[0.02] group">
                                                <span className="material-symbols-outlined text-lg text-slate-600 group-hover:text-primary mb-0.5">{ref.icon}</span>
                                                <span className="text-sm text-slate-500 font-medium">{ref.label}</span>
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
                            <p className="text-xs text-slate-600 mt-2">Add a style image or character to guide the photoshoot look</p>
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
                            <p className="text-sm text-slate-500 mb-4">How closely should the output match your original product?</p>

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
                                            <span className="text-xs block">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-3 p-2 rounded-lg bg-white/[0.03] text-sm text-slate-500">
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
                                            setStudioMode('design')
                                            setPrompt(`Create a ${selectedType} design using this product photoshoot image. Brand: ${activeBrand?.name}. Make it platform-ready.`)
                                        }}
                                            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">palette</span>
                                            Use in Design Studio
                                        </button>
                                        <button onClick={() => {
                                            const params = new URLSearchParams({
                                                fromPhotoshoot: 'true',
                                                imageUrl: photoshootResult.imageUrl?.substring(0, 200),
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

                                    {/* ═══ AI IMAGE EDITOR PANEL ═══ */}
                                    {psEditMode && (
                                        <div className="mt-5 glass-panel rounded-2xl p-5 border border-violet-500/20 animate-fade-in">
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
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">dashboard_customize</span>
                                Brand Templates
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">Pick a template, fill in your details, and generate on-brand designs instantly</p>
                        </div>
                        {activeTemplate && (
                            <button onClick={() => { setActiveTemplate(null); setTemplateFields({}); setTemplateResult(null); setTemplatePromptPreview(''); setTemplateRefImage(null) }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs glass-panel text-slate-400 hover:text-white cursor-pointer">
                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                                Back to Templates
                            </button>
                        )}
                    </div>

                    {!activeBrand ? (
                        <div className="glass-panel rounded-2xl p-12 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-700 mb-4 block">brand_awareness</span>
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
                                        {templateCategories.map(cat => (
                                            <button key={cat.id}
                                                onClick={() => setActiveCategory(cat)}
                                                className="glass-panel rounded-2xl p-5 text-left hover:bg-white/[0.04] hover:border-white/10 border border-transparent transition-all cursor-pointer group min-h-[170px]">
                                                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"
                                                    style={{ background: `${cat.color}15` }}>
                                                    <span className="material-symbols-outlined text-2xl" style={{ color: cat.color }}>{cat.icon}</span>
                                                </div>
                                                <h4 className="text-base font-bold text-white mb-1 group-hover:text-primary transition-colors">{cat.label}</h4>
                                                <p className="text-sm text-slate-500 leading-relaxed mb-3">{cat.desc}</p>
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
                                                className="glass-panel rounded-2xl p-5 text-left hover:bg-white/[0.04] border border-amber-500/10 hover:border-amber-500/30 transition-all cursor-pointer group min-h-[170px] relative">
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
                                    <div className="mt-6 glass-panel rounded-2xl p-4 flex items-center gap-4">
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
                                    <div className="glass-panel rounded-2xl p-4 mb-4">
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
                                                className="glass-panel rounded-2xl p-4 text-left hover:bg-white/[0.04] border border-transparent hover:border-white/10 transition-all cursor-pointer group">
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
                                                className="glass-panel rounded-2xl p-4 text-left hover:bg-white/[0.04] border border-amber-500/10 hover:border-amber-500/30 transition-all cursor-pointer group relative"
                                                onClick={() => {
                                                    setActiveTemplate({
                                                        id: ct.templateId, icon: ct.icon, label: ct.label,
                                                        desc: ct.description, type: ct.type || activeCategory.id, style: ct.style || 'modern',
                                                        isCustom: true, promptFormula: ct.promptFormula,
                                                        referenceImageUrl: ct.referenceImageUrl,
                                                        fields: (ct.fields?.length > 0 ? ct.fields : [
                                                            { key: 'headline', label: 'Headline / Title', type: 'text', placeholder: 'Main text' },
                                                            { key: 'details', label: 'Details', type: 'textarea', placeholder: 'Additional details...' },
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
                                                            reader.onload = ev => handleAnalyzeForTemplate(ev.target.result)
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

                                        {/* Dynamic Fields */}
                                        <div className="mb-6">
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-[11px] font-bold text-slate-400">Fill-in Fields</label>
                                                <button onClick={() => setNewTmpl(p => ({
                                                    ...p,
                                                    fields: [...(p.fields || []), { key: `field${(p.fields?.length || 0) + 1}`, label: '', type: 'text', placeholder: '' }]
                                                }))}
                                                    className="text-sm text-primary cursor-pointer flex items-center gap-1 hover:text-primary-light">
                                                    <span className="material-symbols-outlined text-xs">add</span> Add Field
                                                </button>
                                            </div>
                                            {(newTmpl.fields || []).length === 0 && (
                                                <p className="text-xs text-slate-600 italic">No custom fields. Default Headline + Details fields will be used.</p>
                                            )}
                                            {(newTmpl.fields || []).map((f, i) => (
                                                <div key={i} className="flex gap-2 items-center mb-2">
                                                    <input type="text" value={f.label}
                                                        onChange={e => {
                                                            const updated = [...newTmpl.fields]
                                                            updated[i] = { ...f, label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_') || f.key }
                                                            setNewTmpl(p => ({ ...p, fields: updated }))
                                                        }}
                                                        placeholder="Field name (e.g. Person's Name)"
                                                        className="input-glass flex-1 py-2 text-xs" />
                                                    <select value={f.type}
                                                        onChange={e => {
                                                            const updated = [...newTmpl.fields]
                                                            updated[i] = { ...f, type: e.target.value }
                                                            setNewTmpl(p => ({ ...p, fields: updated }))
                                                        }}
                                                        className="input-glass py-2 text-xs w-24">
                                                        <option value="text">Text</option>
                                                        <option value="textarea">Long Text</option>
                                                        <option value="image">Image</option>
                                                    </select>
                                                    <button onClick={() => setNewTmpl(p => ({ ...p, fields: p.fields.filter((_, fi) => fi !== i) }))}
                                                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">close</span>
                                                    </button>
                                                </div>
                                            ))}
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
                                    <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto glass-panel rounded-3xl p-6 mx-4 animate-scale-in"
                                        onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-primary">create_new_folder</span>
                                                    Create New Category
                                                </h3>
                                                <p className="text-sm text-slate-500 mt-1">Build a template category like Birthday, Anniversary, Festival — learn from a reference design</p>
                                            </div>
                                            <button onClick={() => setShowCreateCategory(false)}
                                                className="p-2 rounded-xl bg-white/[0.05] text-slate-400 hover:text-white cursor-pointer">
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>

                                        {/* Category Name, Icon & Color */}
                                        <div className="grid grid-cols-12 gap-3 mb-4">
                                            <div className="col-span-6">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Category Name *</label>
                                                <input type="text" value={newCat.label}
                                                    onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
                                                    placeholder="e.g. Birthday, Anniversary, Diwali..."
                                                    className="input-glass w-full py-2.5 text-sm" />
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Icon</label>
                                                <select value={newCat.icon}
                                                    onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))}
                                                    className="input-glass w-full py-2.5 text-sm">
                                                    {['auto_awesome', 'cake', 'favorite', 'celebration', 'star', 'card_giftcard', 'mood', 'eco', 'flag', 'spa', 'local_fire_department', 'brush', 'pets', 'music_note', 'restaurant', 'school', 'sports_esports', 'local_offer', 'campaign', 'event'].map(ic => (
                                                        <option key={ic} value={ic}>{ic.replace(/_/g, ' ')}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-3">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Color</label>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {['#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#0ea5e9', '#f97316', '#14b8a6'].map(c => (
                                                        <button key={c} onClick={() => setNewCat(p => ({ ...p, color: c }))}
                                                            className={`w-7 h-7 rounded-lg border-2 cursor-pointer transition-transform ${newCat.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                            style={{ background: c }} />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div className="mb-4">
                                            <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">Description</label>
                                            <input type="text" value={newCat.description}
                                                onChange={e => setNewCat(p => ({ ...p, description: e.target.value }))}
                                                placeholder="e.g. Birthday-themed designs for team members and clients"
                                                className="input-glass w-full py-2.5 text-sm" />
                                        </div>

                                        {/* ── IMAGE SOURCE: 3 tabs ── */}
                                        <div className="mb-4 p-4 rounded-2xl bg-amber-500/[0.04] border border-amber-500/10">
                                            <h4 className="text-xs font-bold text-amber-400 flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-sm">image_search</span>
                                                Learn from Reference Design
                                                <span className="text-sm text-amber-500/50 bg-amber-500/10 px-2 py-0.5 rounded ml-auto">Recommended</span>
                                            </h4>
                                            <p className="text-sm text-slate-500 mb-3">AI analyzes the reference image and extracts a reusable style formula for this category.</p>

                                            {/* 3 Source Tabs */}
                                            <div className="flex gap-2 mb-3 flex-wrap">
                                                {[
                                                    { key: 'upload', icon: 'upload_file', label: 'Upload' },
                                                    { key: 'url', icon: 'link', label: 'URL' },
                                                    { key: 'bank', icon: 'photo_library', label: 'Image Bank' },
                                                    { key: 'website', icon: 'language', label: 'Brand Website' },
                                                ].map(src => (
                                                    <button key={src.key} onClick={() => setNewCat(p => ({ ...p, imageSource: src.key }))}
                                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium cursor-pointer transition-all flex-1 justify-center ${newCat.imageSource === src.key
                                                            ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                                                            : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06]'}`}>
                                                        <span className="material-symbols-outlined text-sm">{src.icon}</span>
                                                        {src.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Show reference image if already loaded */}
                                            {newCat.referenceImageUrl ? (
                                                <div className="relative rounded-xl overflow-hidden mb-2">
                                                    <img src={newCat.referenceImageUrl} alt="Reference" className="w-full max-h-44 object-contain bg-black/20 rounded-xl" />
                                                    <button onClick={() => setNewCat(p => ({ ...p, referenceImageUrl: '' }))}
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
                                                <>
                                                    {/* Upload tab */}
                                                    {newCat.imageSource === 'upload' && (
                                                        <label className="flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed border-amber-500/20 hover:border-amber-500/40 cursor-pointer transition-colors bg-amber-500/[0.02]">
                                                            <span className="material-symbols-outlined text-2xl text-amber-500/40 mb-2">add_photo_alternate</span>
                                                            <span className="text-[11px] text-amber-400/60 font-medium">Click to upload a reference design</span>
                                                            <span className="text-xs text-slate-600 mt-1">JPG, PNG, WebP supported</span>
                                                            <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                const file = e.target.files?.[0]
                                                                if (file) {
                                                                    const reader = new FileReader()
                                                                    reader.onload = ev => handleAnalyzeForCategory(ev.target.result)
                                                                    reader.readAsDataURL(file)
                                                                }
                                                            }} />
                                                        </label>
                                                    )}

                                                    {/* URL tab */}
                                                    {newCat.imageSource === 'url' && (
                                                        <div className="flex gap-2">
                                                            <input id="cat-img-url" type="url" placeholder="Paste image URL here..."
                                                                className="input-glass flex-1 py-2.5 text-sm"
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter' && e.target.value) handleAnalyzeForCategory(e.target.value)
                                                                }} />
                                                            <button onClick={() => {
                                                                const input = document.getElementById('cat-img-url')
                                                                if (input?.value) handleAnalyzeForCategory(input.value)
                                                            }}
                                                                className="btn-primary px-4 py-2.5 rounded-xl text-xs flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-sm">search</span> Analyze
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* Image Bank tab */}
                                                    {newCat.imageSource === 'bank' && (
                                                        <div>
                                                            <p className="text-sm text-slate-500 mb-2">Select from your recently generated images:</p>
                                                            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                                                {(bankImages || []).slice(0, 12).map((img, i) => (
                                                                    <button key={i} onClick={() => handleAnalyzeForCategory(img.imageUrl || img.url)}
                                                                        className="rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-500 cursor-pointer transition-all">
                                                                        <img src={img.imageUrl || img.url} alt="" className="w-full aspect-square object-cover" />
                                                                    </button>
                                                                ))}
                                                                {(!bankImages || bankImages.length === 0) && (
                                                                    <p className="col-span-4 text-xs text-slate-600 text-center py-4">No images in bank yet. Generate some first!</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Brand Website tab */}
                                                    {newCat.imageSource === 'website' && (
                                                        <div>
                                                            <p className="text-sm text-slate-500 mb-2">Select from images scraped from your brand website:</p>
                                                            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                                                {(activeBrand?.dna?.brandImages || activeBrand?.dna?.bannerImages || []).map((img, i) => (
                                                                    <button key={i} onClick={() => handleAnalyzeForCategory(img.url)}
                                                                        className="rounded-lg overflow-hidden border-2 border-transparent hover:border-emerald-500 cursor-pointer transition-all">
                                                                        <img src={img.url} alt={img.alt || ''} className="w-full aspect-square object-cover"
                                                                            onError={e => e.target.parentElement.style.display = 'none'} />
                                                                    </button>
                                                                ))}
                                                                {!(activeBrand?.dna?.brandImages?.length > 0 || activeBrand?.dna?.bannerImages?.length > 0) && (
                                                                    <p className="col-span-4 text-xs text-slate-600 text-center py-4">No brand images found. Re-scan your website to capture images.</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Base Prompt Formula (shown after analysis) */}
                                        {newCat.basePromptFormula && (
                                            <div className="mb-4">
                                                <label className="text-[11px] font-bold text-slate-400 mb-1.5 block flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm text-emerald-400">check_circle</span>
                                                    Extracted Style Formula
                                                </label>
                                                <textarea value={newCat.basePromptFormula}
                                                    onChange={e => setNewCat(p => ({ ...p, basePromptFormula: e.target.value }))}
                                                    className="input-glass w-full py-3 text-sm resize-none font-mono" rows={4} />
                                                <p className="text-xs text-slate-600 mt-1 italic">💡 AI extracted this from the reference. Sub-templates in this category will inherit this style.</p>
                                            </div>
                                        )}

                                        {/* Save */}
                                        <button onClick={handleCreateCategory}
                                            disabled={!newCat.label || creatingCategory}
                                            className="btn-primary w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-30">
                                            {creatingCategory ? (
                                                <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Creating Category...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-sm">create_new_folder</span> Create "{newCat.label || 'Category'}"</>
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
                                <div className="glass-panel rounded-2xl p-5">
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
                                                            <div className="flex gap-2">
                                                                <label className="flex-1 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/30 cursor-pointer transition-colors bg-white/[0.02]">
                                                                    <span className="material-symbols-outlined text-lg text-slate-600 mb-1">add_photo_alternate</span>
                                                                    <span className="text-sm text-slate-500">Upload Image</span>
                                                                    <input type="file" className="hidden" accept="image/*" onChange={e => {
                                                                        const file = e.target.files?.[0]
                                                                        if (file) {
                                                                            const reader = new FileReader()
                                                                            reader.onload = ev => setTemplateFields(prev => ({ ...prev, [field.key]: ev.target.result }))
                                                                            reader.readAsDataURL(file)
                                                                        }
                                                                    }} />
                                                                </label>
                                                                {bankImages.length > 0 && (
                                                                    <button onClick={() => {
                                                                        // Use last image from bank as quick pick
                                                                        const lastImg = bankImages[0]
                                                                        if (lastImg?.imageUrl) {
                                                                            setTemplateFields(prev => ({ ...prev, [field.key]: lastImg.imageUrl }))
                                                                        }
                                                                    }}
                                                                        className="flex-1 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/30 cursor-pointer transition-colors bg-white/[0.02]">
                                                                        <span className="material-symbols-outlined text-lg text-slate-600 mb-1">photo_library</span>
                                                                        <span className="text-sm text-slate-500">From Image Bank</span>
                                                                    </button>
                                                                )}
                                                                {activeBrand?.dna?.brandImages?.length > 0 && (
                                                                    <button onClick={() => {
                                                                        const brandImg = activeBrand.dna.brandImages[0]
                                                                        if (brandImg?.url) {
                                                                            setTemplateFields(prev => ({ ...prev, [field.key]: brandImg.url }))
                                                                        }
                                                                    }}
                                                                        className="flex-1 flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed border-emerald-500/[0.15] hover:border-emerald-500/30 cursor-pointer transition-colors bg-emerald-500/[0.02]">
                                                                        <span className="material-symbols-outlined text-lg text-emerald-600 mb-1">language</span>
                                                                        <span className="text-sm text-emerald-500/70">Brand Website</span>
                                                                    </button>
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
                                <div className="glass-panel rounded-2xl p-5">
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
                                                        reader.onload = ev => handleReversePrompt(ev.target.result, activeTemplate.id)
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
                                    <div className="glass-panel rounded-2xl p-5">
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
                                    <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center min-h-[400px]">
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
                                    <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center min-h-[400px]">
                                        <span className="material-symbols-outlined text-6xl text-slate-700 mb-4">{activeTemplate.icon}</span>
                                        <h3 className="text-lg font-bold text-slate-500 mb-2">{activeTemplate.label}</h3>
                                        <p className="text-xs text-slate-600 max-w-sm text-center">Fill in the fields on the left and click Generate. Your design will appear here with {activeBrand.name}'s brand styling automatically applied.</p>
                                    </div>
                                )}

                                {templateResult && (
                                    <div className="glass-panel rounded-2xl p-5 animate-fade-in">
                                        <div className="rounded-2xl overflow-hidden mb-4">
                                            <img src={templateResult.imageUrl} alt={activeTemplate.label} className="w-full rounded-2xl" />
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
                                                setStudioMode('design')
                                            }}
                                                className="py-2.5 px-5 rounded-xl text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">palette</span>
                                                Edit in Design Studio
                                            </button>
                                            <button onClick={() => {
                                                sessionStorage.setItem('photoshootImage', templateResult.imageUrl)
                                                navigate('/content-studio?fromPhotoshoot=true')
                                            }}
                                                className="py-2.5 px-5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">article</span>
                                                Content Studio
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
                <div>
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">photo_library</span>
                                Image Bank
                                {bankTotal > 0 && <span className="text-sm text-slate-400 font-normal ml-1">({bankTotal} images)</span>}
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">All your AI-generated images — click to zoom, arrow keys to navigate</p>
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

                    {/* Brand Website Images Section — always visible if available */}
                    {(activeBrand?.dna?.brandImages?.length > 0 || activeBrand?.dna?.bannerImages?.length > 0) && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-emerald-500 text-sm">language</span>
                                <h4 className="text-sm font-bold text-white">From Brand Website</h4>
                                <span className="text-sm text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded">
                                    {(activeBrand.dna.brandImages || activeBrand.dna.bannerImages || []).length} images
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {(activeBrand.dna.brandImages || activeBrand.dna.bannerImages || []).map((img, idx) => (
                                    <div key={`brand-${idx}`}
                                        className="glass-panel rounded-xl overflow-hidden group relative cursor-pointer"
                                        onClick={() => {
                                            // Open in a simple preview
                                            window.open(img.url, '_blank')
                                        }}>
                                        <img src={img.url} alt={img.alt || `Brand ${idx + 1}`} loading="lazy"
                                            className="w-full aspect-square object-cover transition-transform duration-300 group-hover:scale-105"
                                            onError={e => e.target.parentElement.style.display = 'none'} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-sm text-white/80 truncate">{img.alt || img.source || 'Website'}</p>
                                        </div>
                                        {img.source && (
                                            <span className="absolute top-1.5 right-1.5 text-[8px] text-white/70 bg-emerald-500/40 px-1.5 py-0.5 rounded-full backdrop-blur-sm capitalize">{img.source}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-600 mt-2 italic">💡 These images can be used as reference for templates, AI photoshoots, and creative generation.</p>
                        </div>
                    )}

                    {!bankLoading && bankImages.length === 0 && !(activeBrand?.dna?.brandImages?.length > 0 || activeBrand?.dna?.bannerImages?.length > 0) && (
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
                            {bankImages.map((img, idx) => (
                                <div key={img._id} className="glass-panel rounded-2xl overflow-hidden group relative cursor-pointer"
                                    onClick={() => setLightboxIdx(idx)}>
                                    <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Generated'} loading="lazy"
                                        className="w-full aspect-square object-cover transition-transform duration-300 group-hover:scale-105" />

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
                                        <p className="text-white text-xs font-bold truncate mb-0.5">{img.title || 'AI Image'}</p>
                                        <p className="text-slate-400 text-xs truncate mb-2">
                                            {img.type === 'ai-photoshoot' ? '📸 Photoshoot' : '🎨 Design'} • {new Date(img.createdAt).toLocaleDateString()}
                                        </p>
                                        <div className="flex gap-1.5">
                                            <a href={img.imageUrl} download={`${img.title || 'image'}.png`}
                                                onClick={e => e.stopPropagation()}
                                                className="flex-1 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold text-center hover:bg-white/20 flex items-center justify-center gap-1">
                                                <span className="material-symbols-outlined text-xs">download</span>
                                            </a>
                                            <button onClick={(e) => {
                                                e.stopPropagation()
                                                sessionStorage.setItem('canvasEditorImage', img.imageUrl)
                                                navigate('/creative-studio/editor')
                                            }}
                                                className="flex-1 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 text-xs font-bold text-center hover:bg-violet-500/30 cursor-pointer flex items-center justify-center gap-1">
                                                <span className="material-symbols-outlined text-xs">edit</span>
                                            </button>
                                            <button onClick={(e) => {
                                                e.stopPropagation()
                                                setDesignBaseImage(img.imageUrl)
                                                setPrompt(`Adapt this image for ${selectedType}. Brand: ${activeBrand?.name}.`)
                                                setStudioMode('design')
                                            }}
                                                className="flex-1 py-1.5 rounded-lg bg-primary/20 text-primary text-xs font-bold text-center hover:bg-primary/30 cursor-pointer flex items-center justify-center gap-1">
                                                <span className="material-symbols-outlined text-xs">palette</span>
                                            </button>
                                            <button onClick={async (e) => {
                                                e.stopPropagation()
                                                if (confirm('Delete this image?')) {
                                                    try {
                                                        await creativesAPI.delete(img._id)
                                                        loadImageBank()
                                                    } catch (err) { console.error(err) }
                                                }
                                            }}
                                                className="py-1.5 px-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs hover:bg-rose-500/20 cursor-pointer flex items-center justify-center">
                                                <span className="material-symbols-outlined text-xs">delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Zoom hint */}
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-symbols-outlined text-white/70 text-sm bg-black/40 rounded-lg p-1">zoom_in</span>
                                    </div>

                                    {/* Source badge */}
                                    <div className="absolute top-2 left-2">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${img.type === 'ai-photoshoot'
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-primary/20 text-primary'
                                            }`}>
                                            {img.type === 'ai-photoshoot' ? '📸' : '🎨'}
                                        </span>
                                    </div>
                                </div>
                            ))}
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
                                                setStudioMode('design')
                                            }}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-primary/15 text-primary hover:bg-primary/25 flex items-center gap-2 cursor-pointer transition-colors">
                                                <span className="material-symbols-outlined text-sm">palette</span>
                                                Use in Design
                                            </button>
                                            <button onClick={() => {
                                                window.sessionStorage.setItem('photoshootImage', img.imageUrl)
                                                setLightboxIdx(null)
                                                navigate('/content-studio?fromPhotoshoot=true')
                                            }}
                                                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 flex items-center gap-2 cursor-pointer transition-colors">
                                                <span className="material-symbols-outlined text-sm">article</span>
                                                Content Studio
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

        </DashboardLayout>
    )
}

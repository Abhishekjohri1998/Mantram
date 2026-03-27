import { useState, useEffect, useRef, useCallback, Fragment } from 'react'
import SEOHead from '../components/SEOHead'
import { useSearchParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import { creatives as creativesAPI, agents as agentsAPI, products as productsAPI, brands as brandsAPI, media as mediaAPI, trends as trendsAPI, nexus as nexusAPI, videoStudio as videoStudioAPI, canvasAssets, API_BASE } from '../services/api'
import { useBrand } from '../context/BrandContext'
import VoiceInput from '../components/VoiceInput'
import PublishModal from '../components/PublishModal'
import GlobalLoader from '../components/GlobalLoader'

// ── Helper: Time Ago ──

function getTimeAgo(dateStr) {
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
}
 
async function uploadToS3(base64Data, folder = 'uploads') {
    try {
        if (base64Data.startsWith('http')) return base64Data;
        const data = await mediaAPI.upload({ imageData: base64Data, folder });
        if (data.success && data.url) return data.url;
        console.warn('[uploadToS3] S3 upload failed, using base64 fallback:', data.error);
        return base64Data;
    } catch (err) {
        console.warn('[uploadToS3] Upload error, using base64 fallback:', err.message);
        return base64Data;
    }
}

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

// ── Creative Formats ──
const creativeTypes = [
    { id: 'instagram-post', icon: 'photo_camera', label: 'Instagram Post', size: '1080×1350', aspectRatio: '4:5' },
    { id: 'instagram-story', icon: 'smartphone', label: 'Story / Reel', size: '1080×1920', aspectRatio: '9:16' },
    { id: 'facebook-ad', icon: 'ads_click', label: 'Facebook Ad', size: '1080×1350', aspectRatio: '4:5' },
    { id: 'linkedin-post', icon: 'work', label: 'LinkedIn Post', size: '1200×1200', aspectRatio: '1:1' },
    { id: 'youtube-thumb', icon: 'smart_display', label: 'YouTube Thumb', size: '1280×720', aspectRatio: '16:9' },
    { id: 'banner', icon: 'web', label: 'Banner', size: '1920×600', aspectRatio: '16:9' },
]

// ── Design Styles ──
const styles = [
    { id: 'modern', label: 'Modern', icon: 'auto_awesome' },
    { id: 'minimal', label: 'Minimal', icon: 'format_shapes' },
    { id: 'bold', label: 'Bold', icon: 'bolt' },
    { id: 'elegant', label: 'Elegant', icon: 'diamond' },
    { id: 'playful', label: 'Playful', icon: 'mood' },
    { id: 'corporate', label: 'Corporate', icon: 'business' },
]

// ── Quick-start categories ──
const quickStartCards = [
    { id: 'social', icon: 'share', label: 'Social Media Post', desc: 'Instagram, Facebook, LinkedIn', color: '#6366f1' },
    { id: 'product', icon: 'inventory_2', label: 'Product Showcase', desc: 'Feature your product or service', color: '#f59e0b' },
    { id: 'promo', icon: 'local_offer', label: 'Promotional Offer', desc: 'Sales, discounts, special deals', color: '#ef4444' },
    { id: 'quote', icon: 'format_quote', label: 'Customer Quote', desc: 'Reviews and testimonials', color: '#10b981' },
    { id: 'announce', icon: 'campaign', label: 'Announcement', desc: 'Launches, updates, news', color: '#8b5cf6' },
    { id: 'story', icon: 'auto_stories', label: 'Brand Story', desc: 'Tell your brand narrative', color: '#ec4899' },
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
                    { key: 'date', label: 'Date & Time', type: 'text', placeholder: 'e.g. March 15 | 10AM' },
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

export default function CreativeStudio() {

    const navigate = useNavigate()
    const { activeBrand } = useBrand()
    const [searchParams, setSearchParams] = useSearchParams()

    // ── Global State ──
    const [selectedType, setSelectedType] = useState('instagram-post')
    const [prompt, setPrompt] = useState('')
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [showProductPicker, setShowProductPicker] = useState(false)
    const [productsList, setProductsList] = useState([])
    const [generating, setGenerating] = useState(false)
    const [autoGenerate, setAutoGenerate] = useState(false)
    const [enhancing, setEnhancing] = useState(false)
    const [result, setResult] = useState(null)
    const [generationHistory, setGenerationHistory] = useState([]) // In-session gallery for AI Create
    const [error, setError] = useState(null)
    const [feedbackState, setFeedbackState] = useState(null)  // 'liked' | 'disliked' | 'accepted'
    const [feedbackToast, setFeedbackToast] = useState('')
    const [style, setStyle] = useState('modern')
    const [textOverlay, setTextOverlay] = useState('')
    const [fromContent, setFromContent] = useState(false)
    const [aspectRatio, setAspectRatio] = useState('1:1')
    const [publishData, setPublishData] = useState(null) // { image, text } or null
    const [imageModel, setImageModel] = useState('nanobanana-2')
    const [showModelMenu, setShowModelMenu] = useState(false)
    const [showBusyModal, setShowBusyModal] = useState(false)
    const [busyModelInfo, setBusyModelInfo] = useState(null)

    // ── Image Model Definitions ──
    const IMAGE_MODELS = [
        { id: 'nanobanana-2', name: 'NanoBanana 2', icon: 'auto_awesome', desc: 'Default • Fast • Best with references', provider: 'Gemini', badge: '⚡', color: '#a855f7' },
        { id: 'nanobanana-pro', name: 'NanoBanana Pro', icon: 'diamond', desc: 'Premium quality • Better details', provider: 'Gemini', badge: '💎', color: '#ec4899' },
        { id: 'flux-pro-v1.1', name: 'Flux Pro v1.1', icon: 'bolt', desc: 'Photorealistic • Great anatomy', provider: 'fal.ai', badge: '🔥', color: '#f97316' },
        { id: 'flux-2-pro', name: 'Flux 2 Pro', icon: 'stars', desc: 'Latest Flux • Premium photorealism', provider: 'fal.ai', badge: '✨', color: '#eab308' },
        { id: 'seedream-5', name: 'Seedream 5', icon: 'park', desc: 'Creative • Artistic style', provider: 'fal.ai', badge: '🌱', color: '#22c55e' },
        { id: 'ideogram', name: 'Ideogram v3', icon: 'text_fields', desc: 'Best for text in images', provider: 'fal.ai', badge: '🎨', color: '#06b6d4' },
    ]

    // ── Animate State ──
    const [animateModalOpen, setAnimateModalOpen] = useState(false)
    const [animatePrompt, setAnimatePrompt] = useState('')
    const [animateModel, setAnimateModel] = useState('grok-imagine')
    const [animateDuration, setAnimateDuration] = useState(5)
    const [animateAspectRatio, setAnimateAspectRatio] = useState('1:1')
    const [animateGenerating, setAnimateGenerating] = useState(false)
    const [animateAnalyzing, setAnimateAnalyzing] = useState(false)
    const [animateProjectId, setAnimateProjectId] = useState(null)
    const [animateProgress, setAnimateProgress] = useState(0)
    const [animateVideoUrl, setAnimateVideoUrl] = useState(null)
    const [animateError, setAnimateError] = useState(null)
    const animatePollRef = useRef(null)

    // Synced with backend MODEL_CAPABILITIES (falClient.js) + xAI/fal.ai/PiAPI API docs
    const ANIMATE_MODELS = {
        'grok-imagine': { name: 'Grok Imagine', icon: '🤖', dur: [1, 15], ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], firstFrame: true, refImages: false, nativeAudio: true, desc: 'Fast, affordable, image-to-video' },
        'seedance-2.0': { name: 'Seedance 2.0', icon: '🎞️', dur: [4, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], firstFrame: true, refImages: true, nativeAudio: true, desc: 'Cinematic, camera control' },
        'kling-3.0': { name: 'Kling 3.0', icon: '🎥', dur: [3, 15], ratios: ['16:9', '9:16', '1:1'], firstFrame: true, refImages: false, nativeAudio: true, desc: 'Best motion & physics' },
        'veo-3.1': { name: 'Veo 3.1', icon: '🎬', dur: [4, 8], ratios: ['16:9', '9:16'], firstFrame: true, refImages: true, nativeAudio: true, desc: 'Premium cinematic quality' },
        'seedance-1.0': { name: 'Seedance 1.0', icon: '🌱', dur: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], firstFrame: true, refImages: false, nativeAudio: false, desc: 'Fast & affordable' },
    }

    // ── Animate: AI Prompt Suggestion ──
    const handleAnimateClick = async () => {
        if (!result?.imageUrl) {
            setError({
                message: 'No image to animate. Generate an image first.',
                isProviderError: false
            })
            setTimeout(() => setError(null), 4000)
            return
        }
        if (!result.imageUrl.startsWith('http')) {
            setError({
                message: 'Cannot animate — image needs to be uploaded first. Try regenerating.',
                isProviderError: false
            })
            setTimeout(() => setError(null), 4000)
            return
        }
        setAnimateModalOpen(true)
        setAnimateError('')
        setAnimateVideoUrl(null)
        setAnimateGenerating(false)
        setAnimateProjectId(null)
        setAnimateProgress(0)
        setAnimateAnalyzing(true)
        try {
            // Preserve the user's explicitly chosen aspect ratio instead of 
            // overriding it strictly based on the generated image bounds (since
            // some image models like NanoBanana currently force 1:1).
            setAnimateAspectRatio(aspectRatio || '1:1')

            // Include the original image prompt context so AI can create a
            // contextually relevant animation prompt (not just visual analysis)
            const originalContext = prompt?.trim()
                ? `\n\nORIGINAL IMAGE PROMPT (use this for context about what was intended): "${prompt.trim()}"`
                : ''

            // Ask AI to describe optimal animation
            const data = await nexusAPI.chat(
                `You are an expert animation director. Analyze this image and write a concise animation prompt (2-3 sentences max) describing the ideal motion, camera movement, and mood to bring this still image to life as a short video. Focus on:
- What should move (subject, background, particles)
- Camera motion (pan, zoom, dolly, static)
- Atmosphere (lighting shifts, particle effects)
${originalContext}

Be specific and cinematic. Do NOT describe the image — describe the MOTION only. Output ONLY the prompt, nothing else.`,
                activeBrand?._id,
                { images: [result.imageUrl] }
            )
            const suggestedPrompt = (data.response || data.text || data.reply || '').replace(/^["']|["']$/g, '').trim()
            if (suggestedPrompt) setAnimatePrompt(suggestedPrompt)
            else setAnimatePrompt('Gentle cinematic motion with smooth camera movement, soft lighting shifts, and natural ambient animation.')
        } catch (e) {
            console.warn('Animate prompt suggestion failed:', e)
            setAnimatePrompt('Gentle cinematic motion with smooth camera movement, soft lighting shifts, and natural ambient animation.')
        }
        setAnimateAnalyzing(false)
    }

    // ── Animate: Generate Video ──
    const handleAnimateGenerate = async () => {
        if (!result?.imageUrl || !animatePrompt.trim()) return
        setAnimateGenerating(true)
        setAnimateError('')
        setAnimateVideoUrl(null)
        setAnimateProgress(5)
        try {
            let projectId = null

            if (animateModel === 'seedance-2.0') {
                // Seedance uses dedicated I2V endpoint
                const data = await videoStudioAPI.advancedI2V({
                    imageUrl: result.imageUrl,
                    prompt: animatePrompt.trim(),
                    duration: animateDuration,
                    aspectRatio: animateAspectRatio,
                    qualityMode: 'fast',
                    brandId: activeBrand?._id || null,
                })
                if (!data.success) throw new Error(data.error || 'Animation failed')
                projectId = data.project._id
            } else {
                // All other models use advanced/generate with firstImageUrl
                const data = await videoStudioAPI.advancedGenerate({
                    prompt: animatePrompt.trim(),
                    model: animateModel,
                    duration: animateDuration,
                    resolution: '1080p',
                    aspectRatio: animateAspectRatio,
                    firstImageUrl: result.imageUrl,
                    generateAudio: true,
                    qualityMode: 'fast',
                    brandId: activeBrand?._id || null,
                })
                if (!data.success) throw new Error(data.error || 'Animation failed')
                projectId = data.project._id
            }

            setAnimateProjectId(projectId)
            // Start polling
            if (animatePollRef.current) clearInterval(animatePollRef.current)
            animatePollRef.current = setInterval(async () => {
                try {
                    const sd = await videoStudioAPI.getStatus(projectId)
                    const gen = sd.project?.generation || {}
                    setAnimateProgress(gen.progress || 30)
                    if (gen.status === 'COMPLETED' || sd.project?.status === 'critique') {
                        clearInterval(animatePollRef.current)
                        setAnimateVideoUrl(gen.videoUrl || gen.s3VideoUrl || '')
                        setAnimateGenerating(false)
                        setAnimateProgress(100)
                    } else if (gen.status === 'FAILED') {
                        clearInterval(animatePollRef.current)
                        setAnimateError({
                            message: gen.error || 'Animation generation failed',
                            isProviderError: gen.isProviderError,
                            provider: gen.provider
                        });
                        setAnimateGenerating(false)
                    }
                } catch { /* continue polling */ }
            }, 5000)
        } catch (e) {
            setAnimateError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
            setAnimateGenerating(false)
        }
    }

    // Cleanup animate polling on unmount
    useEffect(() => () => { if (animatePollRef.current) clearInterval(animatePollRef.current) }, [])
    
    // ── Studio Mode — driven by URL ?mode= param ──
    const studioMode = searchParams.get('mode') || 'create'
    const setStudioMode = useCallback((mode) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.set('mode', mode)
            return next
        }, { replace: true })
    }, [setSearchParams])

    // ── Virtual Try-On State ──
    const [vtoPersonImage, setVtoPersonImage] = useState(null)
    const [vtoGarmentImage, setVtoGarmentImage] = useState(null)
    const [vtoPreviewResult, setVtoPreviewResult] = useState(null)
    const [vtoHdResult, setVtoHdResult] = useState(null)
    const [vtoLoading, setVtoLoading] = useState(false)
    const [vtoHdLoading, setVtoHdLoading] = useState(false)
    const [vtoError, setVtoError] = useState(null)

    // ── Lifestyle Mockups State ──
    const [mockupProductImage, setMockupProductImage] = useState(null)
    const [mockupScenePrompt, setMockupScenePrompt] = useState('')
    const [mockupResult, setMockupResult] = useState(null)
    const [mockupLoading, setMockupLoading] = useState(false)
    const [mockupError, setMockupError] = useState(null)
    const [mockupAspectRatio, setMockupAspectRatio] = useState('1:1')
    const [mockupSceneCategory, setMockupSceneCategory] = useState('all')
    const [mockupSubMode, setMockupSubMode] = useState('lifestyle') // lifestyle | logo
    const [mockupTemplateImage, setMockupTemplateImage] = useState(null)
    const [mockupHarmonize, setMockupHarmonize] = useState(false)

    // ── Logo/Brand Mockup State ──
    const [logoImage, setLogoImage] = useState(null)
    const [logoUrl, setLogoUrl] = useState('')
    const [logoSurface, setLogoSurface] = useState('')
    const [logoSurfaceCategory, setLogoSurfaceCategory] = useState('all')
    const [logoStyleRef, setLogoStyleRef] = useState(null)
    const [logoKeywords, setLogoKeywords] = useState('')
    const [logoResult, setLogoResult] = useState(null)
    const [logoLoading, setLogoLoading] = useState(false)
    const [logoError, setLogoError] = useState(null)
    const [logoAspectRatio, setLogoAspectRatio] = useState('1:1')

    // ── Campaign Logo Generator State ──
    const [clgText, setClgText] = useState('')
    const [clgStyle, setClgStyle] = useState('')
    const [clgOccasion, setClgOccasion] = useState('')
    const [clgIcon, setClgIcon] = useState('')
    const [clgColorMode, setClgColorMode] = useState('brand') // brand | custom
    const [clgCustomColors, setClgCustomColors] = useState('#FFD700, #FF4500')
    const [clgBg, setClgBg] = useState('transparent')
    const [clgShape, setClgShape] = useState('freeform')
    const [clgEnhance, setClgEnhance] = useState('')
    const [clgResults, setClgResults] = useState([])
    const [clgLoading, setClgLoading] = useState(false)
    const [clgError, setClgError] = useState(null)

    // ── Campaign Creatives Wizard State ──
    const [campStep, setCampStep] = useState(1)
    const [campName, setCampName] = useState('')
    const [campGoal, setCampGoal] = useState('')
    const [campKeywordSource, setCampKeywordSource] = useState('product-trends') // product-trends | trending | seo | custom
    const [campKeyword, setCampKeyword] = useState('')
    const [campTrends, setCampTrends] = useState([])
    const [campSeoKws, setCampSeoKws] = useState([])
    const [campTrendsLoading, setCampTrendsLoading] = useState(false)
    const [campProductIntel, setCampProductIntel] = useState(null) // product-aware trending data from AI agent
    const [campIntelLoading, setCampIntelLoading] = useState(false)
    const [campIntelProducts, setCampIntelProducts] = useState({}) // product map from intelligence endpoint
    const [campCount, setCampCount] = useState(3)
    const [campSizes, setCampSizes] = useState(['4:5'])
    const [campProductStrategy, setCampProductStrategy] = useState('same') // same | different
    const [campProducts, setCampProducts] = useState([]) // [{image, source, title, features, price}]
    const [campProductTab, setCampProductTab] = useState('catalog') // catalog | upload | url | bank
    const [campProductUrl, setCampProductUrl] = useState('')
    const [campBrandProducts, setCampBrandProducts] = useState([]) // products from brand catalog
    const [campBrandProductsLoading, setCampBrandProductsLoading] = useState(false)
    const [campPrice, setCampPrice] = useState('') // price point for copy/creative
    const [campCampaignLogo, setCampCampaignLogo] = useState(null)
    const [campCopies, setCampCopies] = useState([]) // [{headline, body, cta}]
    const [campCopyLoading, setCampCopyLoading] = useState(false)
    const [campCta, setCampCta] = useState('Shop Now')
    const [campStyle, setCampStyle] = useState('bold')
    const [campLogoPlacement, setCampLogoPlacement] = useState('bottom-right')
    const [campFeatures, setCampFeatures] = useState([]) // product features to distribute across creatives
    const [campFeatureInput, setCampFeatureInput] = useState('')
    const [campStyleRef, setCampStyleRef] = useState(null)
    const [campScene, setCampScene] = useState('auto') // auto, studio, outdoor, indoor, podium, etc.
    const [campResults, setCampResults] = useState([])
    const [campGenerating, setCampGenerating] = useState(false)
    const [campProgress, setCampProgress] = useState(0)
    const [campError, setCampError] = useState(null)

    // ── Best Performing Library State ──
    const [bplOpen, setBplOpen] = useState(false)
    const [bplCreatives, setBplCreatives] = useState([])
    const [bplLoading, setBplLoading] = useState(false)
    const [bplMode, setBplMode] = useState('style')

    // ── AI Photoshoot State ──
    const [productImage, setProductImage] = useState(null)
    const [productFile, setProductFile] = useState(null)
    const [productPickerOpen, setProductPickerOpen] = useState(false)
    const [productPickerTab, setProductPickerTab] = useState('brand') // 'brand' | 'upload' | 'link'
    const [productLinkUrl, setProductLinkUrl] = useState('')
    const [sceneKeywords, setSceneKeywords] = useState([])
    const [photoshootBrief, setPhotoshootBrief] = useState('')
    const [photoshootGenerating, setPhotoshootGenerating] = useState(false)
    const [photoshootResult, setPhotoshootResult] = useState(null)
    const [psHistory, setPsHistory] = useState([]) // In-session gallery for Photoshoot
    const [photoshootError, setPhotoshootError] = useState(null)
    const [photoshootSaved, setPhotoshootSaved] = useState(false)
    const [fidelity, setFidelity] = useState(80)
    const [cameraAngle, setCameraAngle] = useState('eye-level')
    const [lens, setLens] = useState('50mm')
    const [lightingStyle, setLightingStyle] = useState('softbox')
    const [lightDirection, setLightDirection] = useState('front-left')
    const [surface, setSurface] = useState('white')
    const [modelPresence, setModelPresence] = useState('none')
    const [mood, setMood] = useState(['commercial'])
    const [psTab, setPsTab] = useState('shot')
    const [psEditMode, setPsEditMode] = useState(false)
    const [psEditTool, setPsEditTool] = useState('prompt')
    const [psEditPrompt, setPsEditPrompt] = useState('')
    const [psEditLoading, setPsEditLoading] = useState(false)
    const [psEditError, setPsEditError] = useState('')
    const [aiWarnings, setAiWarnings] = useState([])
    const [psBgAction, setPsBgAction] = useState('remove')
    const [psBgPrompt, setPsBgPrompt] = useState('')
    const [psMaskMode, setPsMaskMode] = useState(false)
    const [psMaskBrushSize, setPsMaskBrushSize] = useState(30)

    // ── Image Bank State ──
    const [bankImages, setBankImages] = useState([])
    const [bankLoading, setBankLoading] = useState(false)
    const [bankTotal, setBankTotal] = useState(0)
    const [lightboxIdx, setLightboxIdx] = useState(null)
    const [bankView, setBankView] = useState('list')
    const [bankCopiedId, setBankCopiedId] = useState(null)
    const [bankTab, setBankTab] = useState('generated')
    const [bankCounts, setBankCounts] = useState({ uploaded: 0, generated: 0 })

    // ── Template & Category State ──
    const [activeTemplate, setActiveTemplate] = useState(null)
    const [templateFields, setTemplateFields] = useState({})
    const [templatePromptPreview, setTemplatePromptPreview] = useState('')
    const [templateRefImage, setTemplateRefImage] = useState(null)
    const [templateGenerating, setTemplateGenerating] = useState(false)
    const [templateResult, setTemplateResult] = useState(null)
    const [templateError, setTemplateError] = useState('')
    const [reversePrompting, setReversePrompting] = useState(false)
    const [savedTemplates, setSavedTemplates] = useState([])
    const [showCreateTemplate, setShowCreateTemplate] = useState(false)
    const [creatingTemplate, setCreatingTemplate] = useState(false)
    const [analyzeLoading, setAnalyzeLoading] = useState(false)
    const [newTmpl, setNewTmpl] = useState({
        label: '', icon: 'auto_awesome', description: '', type: 'instagram-post', style: 'modern',
        promptFormula: '', referenceImageUrl: '', fields: [], category: ''
    })
    const [analyzedMeta, setAnalyzedMeta] = useState({ colorPalette: [], layoutDescription: '' })
    const [templateFieldsMode, setTemplateFieldsMode] = useState('simple')
    const [activeCategory, setActiveCategory] = useState(null)
    const [savedCategories, setSavedCategories] = useState([])
    const [showCreateCategory, setShowCreateCategory] = useState(false)
    const [creatingCategory, setCreatingCategory] = useState(false)
    const [newCat, setNewCat] = useState({ label: '', icon: 'auto_awesome', color: '#f59e0b', imageSource: 'upload' })

    // ── Other UI/Ref State ──
    const [designBaseImage, setDesignBaseImage] = useState(null)
    const [referenceImages, setReferenceImages] = useState({ style: null, character: null, upload: null })
    const [characters, setCharacters] = useState([])
    const [addLogo, setAddLogo] = useState(() => !!activeBrand?.dna?.logo?.url)
    const [logoPosition, setLogoPosition] = useState('bottom-right')
    const [logoSize, setLogoSize] = useState('medium')
    const [galleryFilter, setGalleryFilter] = useState('All')
    const [viewMode, setViewMode] = useState('list')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [activeQuickTemplate, setActiveQuickTemplate] = useState(null)
    const [showQuickStart, setShowQuickStart] = useState(true)
    const [guidedForm, setGuidedForm] = useState(null)
    const [refPickerSlot, setRefPickerSlot] = useState(null)
    const [refPickerTab, setRefPickerTab] = useState('upload')
    const [brandImages, setBrandImages] = useState([])
    const [showCharTags, setShowCharTags] = useState(false)
    const [charTagFilter, setCharTagFilter] = useState('')
    const [zoomImage, setZoomImage] = useState(null)

    // ── Refs ──
    const psMaskCanvasRef = useRef(null)
    const psMaskCtxRef = useRef(null)
    const psImageRef = useRef(null)
    const psIsPainting = useRef(false)
    const promptTextareaRef = useRef(null)
    // Per-tab AbortControllers — so generations survive tab switches
    const aiCreateAbortRef = useRef(null)
    const psAbortRef = useRef(null)
    const campAbortRef = useRef(null)
    const activeBrandIdRef = useRef(activeBrand?._id)

    // Auto-resize textarea when prompt changes programmatically (e.g. enhance)
    useEffect(() => {
        const ta = promptTextareaRef.current
        if (ta) {
            ta.style.height = 'auto'
            ta.style.height = Math.min(ta.scrollHeight, 400) + 'px'
        }
    }, [prompt])

    // ── Helper Functions ──
    async function handleDownloadImage(url, filename) {
        if (!url) return
        try {
            const res = await fetch(url)
            const blob = await res.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = filename || 'mantram-creative.png'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(blobUrl)
        } catch (err) {
            console.error('Download failed, falling back to new tab:', err)
            window.open(url, '_blank')
        }
    }

    function getSignal(tabRef) {
        const ref = tabRef || aiCreateAbortRef
        if (ref.current) ref.current.abort()
        ref.current = new AbortController()
        return ref.current.signal
    }

    // ── Effects ──
    useEffect(() => {
        return () => {
            aiCreateAbortRef.current?.abort()
            psAbortRef.current?.abort()
            campAbortRef.current?.abort()
        }
    }, [])

    useEffect(() => {
        if (!activeBrand?._id) { setBrandImages([]); return }
        if (activeBrand.dna?.brandImages?.length > 0) {
            setBrandImages(activeBrand.dna.brandImages)
            return
        }
        (async () => {
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

    useEffect(() => {
        if (activeBrand?._id !== activeBrandIdRef.current) {
            console.log('Brand changed, aborting creative processing...')
            aiCreateAbortRef.current?.abort()
            psAbortRef.current?.abort()
            campAbortRef.current?.abort()
            activeBrandIdRef.current = activeBrand?._id
            if (generating || enhancing || templateGenerating) {
                setGenerating(false); setEnhancing(false); setTemplateGenerating(false)
            }
        }
    }, [activeBrand?._id, generating, enhancing, templateGenerating])
    useEffect(() => {
        if (autoGenerate && activeBrand && prompt.trim() && !generating) {
            setAutoGenerate(false)
            handleGenerate()
        }
    }, [autoGenerate, activeBrand, prompt, generating, handleGenerate]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (activeBrand?._id) {
            loadImageBank()
        }
    }, [activeBrand?._id])

    useEffect(() => {
        if (studioMode === 'templates' && activeBrand?._id) loadCustomTemplates()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studioMode, activeBrand?._id])

    useEffect(() => {
        if (studioMode === 'templates' && activeBrand?._id) {
            loadCustomCategories()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studioMode, activeBrand?._id])

    useEffect(() => {
        if (prompt.trim()) {
            const detected = detectFormatFromPrompt(prompt)
            if (detected) setSelectedType(detected)
        }
    }, [prompt, detectFormatFromPrompt])

    useEffect(() => {
        const typeInfo = creativeTypes.find(t => t.id === selectedType)
        if (typeInfo?.aspectRatio) {
            setAspectRatio(typeInfo.aspectRatio)
        }
    }, [selectedType])


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

            // Clean up cross-studio params but preserve mode
            setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.delete('fromContent'); next.delete('prompt'); next.delete('type')
                return next
            }, { replace: true })
        }

        // Check if coming with mode=photoshoot from Content Studio or Brand DNA
        if (studioMode === 'photoshoot') {
            const brief = searchParams.get('brief')
            if (brief) {
                setPhotoshootBrief(brief)
                // Read image passed from Brand DNA via sessionStorage
                const passedImage = window.sessionStorage.getItem('photoshootImage')
                if (passedImage) {
                    setProductImage(passedImage)
                    window.sessionStorage.removeItem('photoshootImage')
                }
                // Clean up brief param but preserve mode
                setSearchParams(prev => {
                    const next = new URLSearchParams(prev)
                    next.delete('brief')
                    return next
                }, { replace: true })
            }
        } else if (searchParams.get('fromBrainstorm') === 'true') {
            const bsCtx = window.sessionStorage.getItem('brainstormContext')
            if (bsCtx) {
                try {
                    const parsed = JSON.parse(bsCtx)
                    if (parsed.prompt) {
                        setPrompt(parsed.prompt)
                        setAutoGenerate(true)
                    }
                } catch (e) { console.error('Failed to parse brainstorm context:', e) }
            }
            setSearchParams(prev => {
                const next = new URLSearchParams(prev)
                next.delete('fromBrainstorm')
                return next
            }, { replace: true })
        }
    }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

    async function loadImageBank(cat) {
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
    async function saveToImageBank(imageData) {
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






    // ── Client-side logo compositing (pixel-perfect, uses actual brand logo) ──
    function compositeLogoOnImage(imageUrl, logoUrl, position, size) {
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


    async function handleEnhancePrompt() {
        if (!prompt.trim() || !activeBrand || enhancing) return
        setEnhancing(true)
        try {
            // Build description of reference images for the enhancer
            const refDescs = []
            if (referenceImages.style) refDescs.push('A style reference image is attached — match its visual aesthetic, color palette, and mood')
            if (characters.length > 0) refDescs.push(`${characters.length} character reference image(s) are attached: ${characters.map(c => c.name).join(', ')} — include these characters in the design`)
            if (referenceImages.upload) refDescs.push('A general reference image is attached — use it as contextual inspiration')

            const signal = getSignal(aiCreateAbortRef)
            const data = await creativesAPI.enhancePrompt({
                brandId: activeBrand._id,
                prompt: prompt.trim(),
                style,
                format: selectedType,
                aspectRatio,
                referenceDescriptions: refDescs.length > 0 ? refDescs.join('. ') : '',
            }, { signal })
            if (data.enhancedPrompt) {
                setPrompt(data.enhancedPrompt)
            }
        } catch (err) {
            if (err.name === 'AbortError') return
            console.error('Enhance prompt failed:', err)
        } finally {
            setEnhancing(false)
        }
    }


    async function handleGenerate() {
        if (!prompt.trim() || !activeBrand) return
        setGenerating(true)
        setError('')
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
                imageModel,
            }
            if (designBaseImage) {
                // Use template inpainting mode — preserves layout, characters, products from the original image
                options.templateInpainting = true
                options.templateRefImageUrl = designBaseImage
                if (!fullPrompt.toLowerCase().includes('edit') && !fullPrompt.toLowerCase().includes('change') && !fullPrompt.toLowerCase().includes('modify')) {
                    fullPrompt = `Edit this image while keeping the same layout, composition, characters, and products. Apply these changes: ${fullPrompt}`
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

            setAiWarnings([])
            const signal = getSignal(aiCreateAbortRef)
            const data = await creativesAPI.generate({
                brandId: activeBrand._id,
                type: selectedType,
                prompt: fullPrompt,
                options,
            }, { signal })

            // Handle model busy notification
            if (data.modelBusy) {
                const busyModel = IMAGE_MODELS.find(m => m.id === data.busyModel) || { name: data.busyModel }
                setBusyModelInfo(busyModel)
                setShowBusyModal(true)
                return
            }

            let creative = data.creative
            if (data.warnings?.length > 0) {
                setAiWarnings(data.warnings)
            }

            setResult(creative)
            // Accumulate into in-session gallery
            if (creative?.imageUrl) {
                setGenerationHistory(prev => [{ ...creative, _prompt: prompt, _timestamp: Date.now() }, ...prev])
            }
        } catch (e) {
            if (e.name === 'AbortError') return
            console.error('❌ Generation error:', e)
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally {
            setGenerating(false)
        }
    }

    async function handleFeedback(signalType, extra = {}) {
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
    function setupPsMaskCanvas() {
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
        function getPos(e) {
            const rect = canvas.getBoundingClientRect()
            return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }
        }
        canvas.onmousedown = (e) => { psIsPainting.current = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
        canvas.onmousemove = (e) => { if (!psIsPainting.current) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke() }
        canvas.onmouseup = () => { psIsPainting.current = false }
        canvas.onmouseleave = () => { psIsPainting.current = false }
    }


    function teardownPsMaskCanvas() {
        if (psMaskCanvasRef.current) {
            psMaskCanvasRef.current.remove()
            psMaskCanvasRef.current = null
            psMaskCtxRef.current = null
        }
    }


    function getPsMaskDataUrl() {
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
    }


    // ── Photoshoot AI Edit Handler ──
    async function handlePsEdit() {
        if (!photoshootResult?.imageUrl) return
        setPsEditLoading(true)

        setPsEditError('')
        try {
            const imageBase64 = photoshootResult.imageUrl
            let resultUrl = null

            let data;
            if (psEditTool === 'prompt') {
                if (!psEditPrompt.trim()) throw new Error('Enter a prompt')
                data = await canvasAssets.aiEdit({ prompt: psEditPrompt, imageBase64 })
            } else if (psEditTool === 'visual') {
                if (!psEditPrompt.trim()) throw new Error('Enter a prompt')
                const maskDataUrl = getPsMaskDataUrl()
                if (!maskDataUrl) throw new Error('Paint a mask on the image first')
                data = await canvasAssets.aiEditVisual({ prompt: psEditPrompt, imageBase64, maskBase64: maskDataUrl })
            } else if (psEditTool === 'retouch') {
                const maskDataUrl = getPsMaskDataUrl()
                data = await canvasAssets.aiRetouch({ prompt: psEditPrompt || 'Retouch naturally', imageBase64, maskBase64: maskDataUrl })
            } else if (psEditTool === 'background') {
                data = await canvasAssets.aiBackground({ imageBase64, action: psBgAction, bgPrompt: psBgAction === 'replace' ? (psBgPrompt || psEditPrompt) : undefined })
            }

            if (data?.error) throw new Error(data.error)
            resultUrl = data?.imageUrl

            if (resultUrl) {
                // Auto-apply: replace the photoshoot result image
                setPhotoshootResult(prev => ({ ...prev, imageUrl: resultUrl }))
                teardownPsMaskCanvas()
                setPsMaskMode(false)
            }
        } catch (err) { 
            setPsEditError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        setPsEditLoading(false)
    }


    // ── Template Generation Handler ──
    async function handleTemplateGenerate(tmpl) {

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

            setAiWarnings([])
            const signal = getSignal(aiCreateAbortRef)
            const data = await creativesAPI.generate({
                brandId: activeBrand._id,
                type: tmpl.type,
                prompt: builtPrompt,
                options: { ...options, imageModel },
            }, { signal, timeout: 180000 })

            if (data.success && data.creative) {
                setTemplateResult(data.creative)
                if (data.warnings?.length > 0) {
                    setAiWarnings(data.warnings)
                }
            } else {
                throw new Error(data.error || 'Generation failed')
            }
        } catch (err) {
            if (err.name === 'AbortError') return
            console.error('❌ Template generation error:', err)
            setTemplateError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        setTemplateGenerating(false)
    }


    // ── Reverse Prompt Handler (analyze uploaded image to extract design formula) ──
    async function handleReversePrompt(imageSource, tmplId) {

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

            const data = await canvasAssets.aiAnalyze({
                prompt: analysisPrompt,
                ...(isBase64 ? { imageBase64: imageSource } : { imageUrl: imageSource }),
            })

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
            if (err.name === 'AbortError') return
            console.error('Reverse prompt error:', err)
            setTemplatePromptPreview(`Create a design matching the uploaded reference style for ${activeBrand.name}. Use brand colors. {{HEADLINE}} as the main text. {{SUBTEXT}} as supporting text. {{CTA}} as call-to-action.`)
        }
        setReversePrompting(false)
    }


    // ── Load custom templates for the active brand ──
    async function loadCustomTemplates() {

        if (!activeBrand?._id) return
        try {
            const data = await brandsAPI.getTemplates(activeBrand._id)
            if (data.success) setSavedTemplates(data.templates || [])
        } catch (err) {
            if (err.name === 'AbortError') return
            console.error('Load templates error:', err)
        }
    }


    // ── Create a new custom template ──
    async function handleCreateTemplate() {

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
    }


    // ── Analyze image for new template creation — SMART STRUCTURED ANALYSIS ──
    async function handleAnalyzeForTemplate(imageSource) {

        if (!activeBrand) return
        setAnalyzeLoading(true)
        setNewTmpl(prev => ({ ...prev, referenceImageUrl: imageSource }))
        setAnalyzedMeta({ colorPalette: [], layoutDescription: '' })

        const isBase64 = imageSource.startsWith('data:')
        const brandColors = activeBrand.dna?.colors?.map(c => c.hex).join(', ') || 'not specified'

        try {
            const data = await canvasAssets.aiAnalyzeTemplate({
                ...(isBase64 ? { imageBase64: imageSource } : { imageUrl: imageSource }),
                brandName: activeBrand.name,
                brandColors,
            })

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
    }


    // ── Load custom categories from DB ──
    async function loadCustomCategories() {

        if (!activeBrand?._id) return
        try {
            const data = await brandsAPI.getCategories(activeBrand._id)
            if (data.success) setSavedCategories(data.categories || [])
        } catch (err) { console.error('Load categories error:', err) }
    }


    // ── Create a new custom category ──
    async function handleCreateCategory() {

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
    }


    // ── Analyze image for category creation (reverse prompting) ──
    async function handleAnalyzeForCategory(imageSource) {

        if (!activeBrand) return
        setAnalyzeLoading(true)
        setNewCat(prev => ({ ...prev, referenceImageUrl: imageSource }))

        const isBase64 = imageSource.startsWith('data:')
        const brandColors = activeBrand.dna?.colors?.map(c => c.hex).join(', ') || 'not specified'

        try {
            const data = await canvasAssets.aiAnalyze({
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
            })
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
    }


    const selectedTypeInfo = creativeTypes.find(t => t.id === selectedType)

    // ── Smart format detection from prompt ──
    function detectFormatFromPrompt(text) {
        const lower = text.toLowerCase()
        if (/instagram\s*(post|feed|grid)/i.test(lower)) return 'instagram-post'
        if (/story|stories|reel/i.test(lower)) return 'instagram-story'
        if (/facebook|fb\s*ad/i.test(lower)) return 'facebook-ad'
        if (/linkedin/i.test(lower)) return 'linkedin-post'
        if (/youtube|thumbnail|thumb/i.test(lower)) return 'youtube-thumb'
        if (/banner|hero|header|website/i.test(lower)) return 'banner'
        return null // keep current selection
    }


    return (
        <DashboardLayout 
            title={<h1 className="text-2xl font-black m-0">Creative Studio</h1>} 
            subtitle="AI-powered image generation & design"
        >
            <SEOHead 
                title="Creative Studio — Mantram AI Design & Photoshoots" 
                description="Use Mantram AI Creative Studio to generate stunning, brand-aligned ad creatives, social media graphics, and AI product photoshoots without a graphic designer." 
                canonical="/creative-studio"
            />

            {/* ══ Unified Studio Navigation ══ */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel mb-6 fade-up overflow-x-auto scrollbar-hide whitespace-nowrap">
                {[
                    { id: 'create', icon: 'auto_awesome', label: 'AI Create' },
                    { id: 'photoshoot', icon: 'photo_camera', label: 'Photoshoot' },
                    { id: 'tryon', icon: 'checkroom', label: 'Try-On' },
                    { id: 'mockups', icon: 'landscape', label: 'Mockups' },
                    { id: 'campaigns', icon: 'campaign', label: 'Campaigns' },
                    { id: 'campaignlogo', icon: 'verified', label: 'Logo Gen' },
                    { id: 'templates', icon: 'dashboard_customize', label: 'Templates' },
                    { id: 'imagebank', icon: 'photo_library', label: 'Image Bank', badge: bankTotal > 0 ? bankTotal : null },
                    { id: 'canvas', icon: 'draw', label: 'AI Canvas', isNav: true },
                ].map(tab => (
                    <button key={tab.id}
                        onClick={() => {
                            if (tab.isNav) { navigate('/ai-canvas'); return }
                            setStudioMode(tab.id)
                            if (tab.id === 'imagebank') loadImageBank()
                        }}
                        className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
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

            {/* ── Cross-Tab Generation Indicator ── */}
            {(() => {
                const bgTasks = [];
                if (studioMode !== 'create' && generating) bgTasks.push({ label: 'AI Create', mode: 'create', icon: 'auto_awesome' })
                if (studioMode !== 'photoshoot' && photoshootGenerating) bgTasks.push({ label: 'Photoshoot', mode: 'photoshoot', icon: 'photo_camera' })
                if (studioMode !== 'campaigns' && campGenerating) bgTasks.push({ label: 'Campaign', mode: 'campaigns', icon: 'campaign' })
                if (bgTasks.length === 0) return null
                return (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500/10 via-violet-500/10 to-purple-500/10 border border-white/[0.06] flex items-center gap-3 animate-fade-in">
                        <span className="material-symbols-outlined text-blue-400 text-sm animate-spin">progress_activity</span>
                        <span className="text-xs text-slate-300 flex-1">{bgTasks.length} generation{bgTasks.length > 1 ? 's' : ''} running in background</span>
                        {bgTasks.map(t => (
                            <button key={t.mode} onClick={() => setStudioMode(t.mode)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white flex items-center gap-1 cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-xs">{t.icon}</span>
                                {t.label}
                            </button>
                        ))}
                    </div>
                )
            })()}

            {/* ====================== UNIFIED CREATE MODE — SPLIT PANEL ====================== */}
            {studioMode === 'create' && (
                <div className="creative-split fade-up">

                    {/* ═══════════ LEFT TOOLS PANEL ═══════════ */}
                    <div className="creative-tools-panel">

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
                                    <p className="text-sm font-bold text-white">✏️ Editing image as template</p>
                                    <p className="text-sm text-slate-400">Describe what to change — layout, characters & products will be preserved</p>
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

                        {/* ── Compact References Row ── */}
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Refs</span>

                            {/* Style Ref */}
                            {referenceImages.style ? (
                                <div className="relative flex-shrink-0 group">
                                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-amber-500/40">
                                        <img src={referenceImages.style} alt="Style" className="w-full h-full object-cover" />
                                    </div>
                                    <button onClick={() => setReferenceImages(prev => ({ ...prev, style: null }))}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                </div>
                            ) : (
                                <button onClick={() => { setRefPickerSlot('style'); setRefPickerTab('upload') }}
                                    className="flex-shrink-0 w-10 h-10 rounded-lg border border-dashed border-white/10 hover:border-amber-500/40 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/[0.02] group" title="Add style reference">
                                    <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-amber-400">brush</span>
                                    <span className="text-[7px] text-slate-600 group-hover:text-amber-400 font-bold leading-none">Style</span>
                                </button>
                            )}

                            {/* Characters */}
                            {characters.map((char, idx) => (
                                <div key={idx} className="relative flex-shrink-0 group">
                                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-violet-500/40">
                                        <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                                    </div>
                                    <button onClick={() => setCharacters(prev => prev.filter((_, i) => i !== idx))}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">×</button>
                                    <input
                                        value={char.name}
                                        onChange={e => setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                                        className="w-10 mt-0.5 text-[7px] text-center bg-transparent text-violet-300 outline-none font-bold truncate"
                                        placeholder="Name"
                                    />
                                </div>
                            ))}
                            {characters.length < 5 && (
                                <button onClick={() => { setRefPickerSlot(`character-${characters.length}`); setRefPickerTab('upload') }}
                                    className="flex-shrink-0 w-10 h-10 rounded-lg border border-dashed border-white/10 hover:border-violet-500/40 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/[0.02] group" title="Add character">
                                    <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-violet-400">person_add</span>
                                    <span className="text-[7px] text-slate-600 group-hover:text-violet-400 font-bold leading-none">Person</span>
                                </button>
                            )}

                            {/* Upload Ref */}
                            {referenceImages.upload ? (
                                <div className="relative flex-shrink-0 group">
                                    <div className="w-10 h-10 rounded-lg overflow-hidden border border-cyan-500/40">
                                        <img src={referenceImages.upload} alt="Ref" className="w-full h-full object-cover" />
                                    </div>
                                    <button onClick={() => setReferenceImages(prev => ({ ...prev, upload: null }))}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center cursor-pointer z-10 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                    <button onClick={() => { setCharacters(prev => [...prev, { name: `Character ${prev.length + 1}`, image: referenceImages.upload }]); setReferenceImages(prev => ({ ...prev, upload: null })) }}
                                        className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-violet-500 text-white text-[8px] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Use as Character">
                                        <span className="material-symbols-outlined text-[8px]">person_add</span>
                                    </button>
                                </div>
                            ) : (
                                <button onClick={() => { setRefPickerSlot('upload'); setRefPickerTab('upload') }}
                                    className="flex-shrink-0 w-10 h-10 rounded-lg border border-dashed border-white/10 hover:border-cyan-500/40 flex flex-col items-center justify-center cursor-pointer transition-all bg-white/[0.02] group" title="Upload reference image">
                                    <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-cyan-400">add_photo_alternate</span>
                                    <span className="text-[7px] text-slate-600 group-hover:text-cyan-400 font-bold leading-none">Upload</span>
                                </button>
                            )}
                        </div>
                        {characters.length > 0 && (
                            <p className="text-[9px] text-violet-400/50 mb-2 -mt-1 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[10px]">info</span>
                                Type <span className="font-bold text-violet-400">@name</span> in prompt to tag characters
                            </p>
                        )}

                        {/* ── Prompt Area ── */}
                        <div className="relative mb-3">
                            <textarea
                                value={prompt}
                                onChange={e => {
                                    const val = e.target.value
                                    setPrompt(val)
                                    // Auto-grow: reset height then set to scrollHeight
                                    e.target.style.height = 'auto'
                                    e.target.style.height = Math.min(e.target.scrollHeight, 400) + 'px'
                                    const cursor = e.target.selectionStart
                                    const textBefore = val.substring(0, cursor)
                                    const atMatch = textBefore.match(/@(\w*)$/)
                                    if (atMatch && (characters.length > 0 || referenceImages.upload)) {
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
                                    ? `Describe your visual for ${activeBrand.name}...`
                                    : "Create a brand first to start generating visuals"}
                                disabled={!activeBrand || generating}
                                className="input-glass w-full resize-none py-3.5 px-4 pr-14 pb-12 disabled:opacity-30 text-white text-sm leading-relaxed rounded-2xl overflow-hidden"
                                rows={4}
                                style={{ minHeight: '120px', maxHeight: '400px', overflowY: 'auto' }}
                                autoFocus
                                ref={promptTextareaRef}
                            />

                            {/* @character tag autocomplete dropdown */}
                            {showCharTags && (characters.length > 0 || referenceImages.upload) && (
                                <div className="absolute left-4 bottom-full mb-1 bg-[#1a1a2e] border border-violet-500/30 rounded-xl shadow-2xl shadow-violet-500/10 p-2 z-50 min-w-[200px] animate-fade-in">
                                    <p className="text-[10px] text-slate-500 mb-1.5 px-2">Tag a character</p>
                                    {characters
                                        .filter(c => !charTagFilter || c.name.toLowerCase().includes(charTagFilter))
                                        .map((char, idx) => (
                                            <button key={idx} onClick={() => {
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
                                    {referenceImages.upload && (!charTagFilter || 'upload'.includes(charTagFilter) || 'reference'.includes(charTagFilter)) && (
                                        <button onClick={() => {
                                            const textarea = promptTextareaRef.current
                                            if (!textarea) return
                                            const cursor = textarea.selectionStart
                                            const textBefore = prompt.substring(0, cursor)
                                            const textAfter = prompt.substring(cursor)
                                            const newBefore = textBefore.replace(/@\w*$/, '@Upload ')
                                            setPrompt(newBefore + textAfter)
                                            setShowCharTags(false)
                                            setTimeout(() => { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = newBefore.length }, 50)
                                        }}
                                            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-cyan-500/15 cursor-pointer transition-colors text-left">
                                            <img src={referenceImages.upload} alt="Upload" className="w-6 h-6 rounded-full object-cover border border-cyan-500/30" />
                                            <div>
                                                <span className="text-xs font-bold text-white">Reference Image</span>
                                                <span className="text-[10px] text-cyan-400 ml-1.5">@Upload</span>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Voice input — top right */}
                            <div className="absolute right-3 top-3">
                                <VoiceInput
                                    onResult={(text) => setPrompt(prev => prev ? prev + ' ' + text : text)}
                                    size="small"
                                />
                            </div>

                            {/* Bottom bar inside textarea: Enhance + Character tags */}
                            <div className="absolute left-2 right-2 bottom-2 flex items-center gap-1.5 pointer-events-none">
                                {prompt.trim() && (
                                    <button onClick={handleEnhancePrompt} disabled={enhancing || !activeBrand}
                                        className={`pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${enhancing
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-white/[0.06] text-slate-400 hover:text-amber-400 hover:bg-amber-500/10'}`}>
                                        <span className={`material-symbols-outlined text-xs ${enhancing ? 'animate-spin' : ''}`}>
                                            {enhancing ? 'progress_activity' : 'auto_awesome'}
                                        </span>
                                        {enhancing ? 'Enhancing...' : 'Enhance'}
                                    </button>
                                )}
                                {/* Quick tag chips */}
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
                                            className="pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-400 text-[9px] font-bold hover:bg-violet-500/20 cursor-pointer transition-all">
                                            <img src={char.image} alt="" className="w-3 h-3 rounded-full object-cover" />
                                            @{tagName}
                                        </button>
                                    )
                                })}
                                {referenceImages.upload && (
                                    <button onClick={() => {
                                        const textarea = promptTextareaRef.current
                                        const cursor = textarea?.selectionStart ?? prompt.length
                                        const before = prompt.substring(0, cursor)
                                        const after = prompt.substring(cursor)
                                        setPrompt(before + '@Upload ' + after)
                                        setTimeout(() => textarea?.focus(), 50)
                                    }}
                                        className="pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 text-[9px] font-bold hover:bg-cyan-500/20 cursor-pointer transition-all">
                                        <img src={referenceImages.upload} alt="" className="w-3 h-3 rounded-full object-cover" />
                                        @Upload
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── Action Row: Format + Model + Generate + Options ── */}
                        <div className="space-y-2">
                            {/* Format selector row */}
                            {selectedTypeInfo && (
                                <button onClick={() => setShowAdvanced(!showAdvanced)}
                                    className="flex items-center gap-1.5 w-full px-3 py-2 rounded-xl text-[11px] font-bold bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06] hover:border-white/10 transition-all cursor-pointer">
                                    <span className="material-symbols-outlined text-xs text-primary">{selectedTypeInfo.icon}</span>
                                    {selectedTypeInfo.label}
                                    <span className="text-[9px] text-slate-500">{selectedTypeInfo.size}</span>
                                    <span className="material-symbols-outlined text-[10px] text-slate-600 ml-auto">expand_more</span>
                                </button>
                            )}

                            {/* Model selector row */}
                            <div className="relative">
                                <button onClick={() => setShowModelMenu(!showModelMenu)}
                                    className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[11px] font-bold bg-white/[0.04] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/10 transition-all cursor-pointer">
                                    <span className="material-symbols-outlined text-xs" style={{ color: IMAGE_MODELS.find(m => m.id === imageModel)?.color || '#a855f7' }}>
                                        {IMAGE_MODELS.find(m => m.id === imageModel)?.icon || 'auto_awesome'}
                                    </span>
                                    <span>{IMAGE_MODELS.find(m => m.id === imageModel)?.name || 'NanoBanana 2'}</span>
                                    <span className="text-[9px] text-slate-500 ml-0.5">{IMAGE_MODELS.find(m => m.id === imageModel)?.provider}</span>
                                    <span className="material-symbols-outlined text-[10px] text-slate-600 ml-auto">{showModelMenu ? 'expand_less' : 'expand_more'}</span>
                                </button>
                                {showModelMenu && (
                                    <div className="absolute left-0 right-0 bottom-full mb-1 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ animation: 'fadeUp 0.15s ease-out' }}>
                                        <div className="p-1.5 space-y-0.5 max-h-[280px] overflow-y-auto">
                                            {IMAGE_MODELS.map(m => (
                                                <button key={m.id} onClick={() => { setImageModel(m.id); setShowModelMenu(false) }}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${imageModel === m.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
                                                    <span className="material-symbols-outlined text-sm" style={{ color: m.color }}>{m.icon}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] font-bold truncate">{m.name}</span>
                                                            {m.id === 'nanobanana-2' && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">DEFAULT</span>}
                                                        </div>
                                                        <span className="text-[9px] text-slate-500 block truncate">{m.desc}</span>
                                                    </div>
                                                    {imageModel === m.id && <span className="material-symbols-outlined text-xs text-primary">check_circle</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Generate + action icons row */}
                            <div className="flex items-center gap-2">
                                <CreditTooltipWrapper action="creative">
                                    <button onClick={handleGenerate} disabled={!prompt.trim() || !activeBrand || generating}
                                        className="btn-primary flex-1 py-3 px-5 rounded-xl disabled:opacity-30 justify-center text-sm font-bold cursor-pointer">
                                        {generating ? (
                                            <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Generating...</>
                                        ) : (
                                            <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate <CreditBadge action="creative" /></>
                                        )}
                                    </button>
                                </CreditTooltipWrapper>

                                <button onClick={() => setShowAdvanced(!showAdvanced)}
                                    className={`px-3 py-3 rounded-xl text-sm transition-all cursor-pointer flex-shrink-0 ${showAdvanced ? 'bg-white/10 text-white border border-white/20' : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/[0.06]'}`} title="Advanced options">
                                    <span className="material-symbols-outlined text-sm">tune</span>
                                </button>

                                <button onClick={() => {
                                    if (activeBrand?._id) {
                                        productsAPI.list({ brandId: activeBrand._id, limit: 50 })
                                            .then(res => setProductsList(res.products || []))
                                            .catch(() => { })
                                    }
                                    setShowProductPicker(true)
                                }}
                                    className="px-3 py-3 rounded-xl text-sm bg-white/[0.04] text-slate-400 hover:text-cyan-400 border border-white/[0.06] transition-all cursor-pointer flex-shrink-0" title="Select product">
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

                    </div>{/* ═══════════ END LEFT TOOLS PANEL ═══════════ */}


                    {/* ═══════════ RIGHT GALLERY PANEL ═══════════ */}
                    <div className="creative-gallery">

                        {/* ── Gallery Filter Bar ── */}
                        <div className="flex items-center justify-between mb-4 px-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                {['All', 'Social', 'Product', 'Promo', 'Quote', 'Event'].map(cat => (
                                    <button key={cat}
                                        onClick={() => setGalleryFilter(cat)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                            galleryFilter === cat
                                                ? 'bg-primary/15 text-primary border-primary/25'
                                                : 'bg-white/[0.04] text-slate-400 hover:text-white border-transparent hover:border-white/[0.08]'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
                                    <button onClick={() => setViewMode('list')}
                                        className={`p-1.5 cursor-pointer transition-all ${viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400'}`} title="List view">
                                        <span className="material-symbols-outlined text-sm">view_list</span>
                                    </button>
                                    <button onClick={() => setViewMode('grid')}
                                        className={`p-1.5 cursor-pointer transition-all ${viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400'}`} title="Grid view">
                                        <span className="material-symbols-outlined text-sm">grid_view</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── AI Provider Warnings ── */}
                        {aiWarnings.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {aiWarnings.map((warn, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2 animate-fade-in">
                                        <span className="material-symbols-outlined text-sm">warning</span>
                                        <span>{warn}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Error ── */}
                        {error && (
                            <div className={`mb-4 p-3 rounded-xl border flex items-center gap-2 ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                <span className="material-symbols-outlined text-sm">{error.isProviderError ? 'warning' : 'error'}</span>
                                <div className="flex-1">
                                    <span className="font-bold mr-1">{error.isProviderError ? `${error.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                    {error.message}
                                </div>
                            </div>
                        )}

                        {/* ── Current Result (newest generation, highlighted) ── */}
                        {result && !generating && (
                            <div className="generation-card generation-card--new mb-5">
                                {/* Prompt text */}
                                <p className="text-xs text-slate-400 mb-2.5 line-clamp-2 leading-relaxed">
                                    {prompt || 'Generated creative'}
                                </p>

                                {/* Generated Image */}
                                <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-pointer group mb-3"
                                    style={{ maxHeight: '500px' }}
                                    onClick={() => result.imageUrl && setZoomImage(result.imageUrl)}>
                                    {result.imageUrl ? (
                                        <>
                                            <img src={result.imageUrl} alt={result.title || 'Generated creative'} loading="lazy" decoding="async"
                                                className="w-full h-auto object-contain"
                                                style={{ maxHeight: '500px' }}
                                                onError={(e) => { e.target.style.display = 'none'; }} />
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

                                {/* Metadata Row */}
                                <div className="flex items-center gap-2 mb-3 flex-wrap">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/20">
                                        {selectedTypeInfo?.label || 'Creative'}
                                    </span>
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500">
                                        {style}
                                    </span>
                                    <span className="text-[10px] text-slate-600">Just now</span>
                                </div>

                                {/* Action Bar */}
                                <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.05]">
                                    <button onClick={() => handleFeedback('accept')}
                                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${feedbackState === 'accepted' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10'}`}>
                                        <span className="material-symbols-outlined text-sm">{feedbackState === 'accepted' ? 'check_circle' : 'check'}</span>
                                        {feedbackState === 'accepted' ? 'Accepted' : 'Accept'}
                                    </button>
                                    <button onClick={() => handleDownloadImage(result?.imageUrl, `${result?.title || 'creative'}.png`)}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all" title="Download">
                                        <span className="material-symbols-outlined text-sm">download</span>
                                    </button>
                                    <button onClick={() => setPublishData({ image: result?.imageUrl, text: result?.title || '' })}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#1877F2] hover:bg-[#1877F2]/10 cursor-pointer transition-all" title="Publish">
                                        <span className="material-symbols-outlined text-sm">share</span>
                                    </button>
                                    <button onClick={handleAnimateClick}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-400/10 cursor-pointer transition-all" title="Animate">
                                        <span className="material-symbols-outlined text-sm">animation</span>
                                    </button>
                                    <button onClick={() => {
                                        if (!result?.imageUrl) return
                                        const params = new URLSearchParams({ fromCreative: 'true', imageUrl: result.imageUrl })
                                        navigate(`/content-studio?${params.toString()}`)
                                    }}
                                        className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10 cursor-pointer transition-all" title="Get Caption in Content Studio">
                                        <span className="material-symbols-outlined text-sm">edit_note</span>
                                    </button>
                                    <button onClick={handleGenerate}
                                        className="ml-auto p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all" title="Regenerate">
                                        <span className="material-symbols-outlined text-sm">refresh</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ── Generating Indicator ── */}
                        <GlobalLoader 
                            isActive={generating} 
                            title="Creating your visual..." 
                            currentStage={`${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`}
                            icon="photo_camera"
                            estimatedDuration={30}
                        />

                        {/* ── In-Session Generation Gallery (scrollable grid) ── */}
                        {generationHistory.length > 1 && (
                            <div className="mb-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-sm text-violet-400">history</span>
                                        Session Gallery ({generationHistory.length})
                                    </h4>
                                    <button onClick={() => setGenerationHistory([])} className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer transition-all">Clear</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2.5 max-h-[600px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                                    {generationHistory.map((item, idx) => (
                                        <div key={item._id || idx} className={`group relative rounded-xl overflow-hidden border ${idx === 0 ? 'border-violet-500/30 ring-1 ring-violet-500/20' : 'border-white/[0.06]'} bg-black/20 cursor-pointer transition-all hover:border-white/[0.12]`}
                                            onClick={() => setZoomImage(item.imageUrl)}>
                                            <img src={item.imageUrl} alt={item._prompt || 'Creative'} loading="lazy" decoding="async" className="w-full aspect-square object-cover" />
                                            {idx === 0 && <span className="absolute top-1.5 left-1.5 text-[8px] font-bold text-violet-300 bg-violet-500/30 px-1.5 py-0.5 rounded-md">Latest</span>}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-2">
                                                <p className="text-[9px] text-white/80 line-clamp-2 mb-1.5 leading-tight">{item._prompt || 'AI Generated'}</p>
                                                <div className="flex gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(item.imageUrl, `creative-${idx}.png`) }}
                                                        className="p-1 rounded-md bg-white/10 text-white hover:bg-white/20 transition-all" title="Download">
                                                        <span className="material-symbols-outlined text-xs">download</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setDesignBaseImage(item.imageUrl); setPrompt(item._prompt || ''); }}
                                                        className="p-1 rounded-md bg-white/10 text-white hover:bg-primary/40 transition-all" title="Edit">
                                                        <span className="material-symbols-outlined text-xs">edit</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setPublishData({ image: item.imageUrl, text: item._prompt || '' }) }}
                                                        className="p-1 rounded-md bg-white/10 text-white hover:bg-[#1877F2]/40 transition-all" title="Publish">
                                                        <span className="material-symbols-outlined text-xs">share</span>
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setResult(item); }}
                                                        className="p-1 rounded-md bg-white/10 text-white hover:bg-emerald-500/40 transition-all" title="View full">
                                                        <span className="material-symbols-outlined text-xs">open_in_full</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Generation History (from Image Bank) ── */}
                        {(() => {
                            const allGenerated = bankImages.filter(img => img.source === 'ai-generated' || img.category === 'generated' || img.type === 'creative');
                            const filtered = galleryFilter === 'All' ? allGenerated : allGenerated.filter(img => {
                                const tags = (img.tags || []).map(t => t.toLowerCase());
                                const title = (img.title || '').toLowerCase();
                                const prmpt = (img.prompt || '').toLowerCase();
                                const filterLower = galleryFilter.toLowerCase();
                                return tags.some(t => t.includes(filterLower)) || title.includes(filterLower) || prmpt.includes(filterLower) || (img.type || '').toLowerCase().includes(filterLower);
                            });
                            if (filtered.length === 0 && allGenerated.length > 0) {
                                return (
                                    <div className="text-center py-10">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2 block">filter_alt_off</span>
                                        <p className="text-sm text-slate-500">No results matching "{galleryFilter}"</p>
                                        <button onClick={() => setGalleryFilter('All')} className="mt-2 text-xs text-primary hover:text-primary-light cursor-pointer">Show all</button>
                                    </div>
                                );
                            }
                            if (filtered.length === 0) return null;

                            {/* ── Grid View ── */}
                            if (viewMode === 'grid') {
                                return (
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {filtered.map(img => (
                                            <div key={img._id} className="group relative rounded-xl overflow-hidden border border-white/[0.06] bg-black/20 cursor-pointer transition-all hover:border-white/[0.12]"
                                                onClick={() => setZoomImage(img.imageUrl || img.thumbnailUrl)}>
                                                <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Creative'}
                                                    loading="lazy" decoding="async"
                                                    className="w-full aspect-square object-cover" />
                                                {/* Hover overlay with actions */}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-2">
                                                    <p className="text-[9px] text-white/80 line-clamp-2 mb-1.5 leading-tight">{img.prompt || img.title || 'AI Generated'}</p>
                                                    <div className="flex gap-1">
                                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(img.imageUrl || img.thumbnailUrl, `${img.title || 'creative'}.png`) }}
                                                            className="p-1 rounded-md bg-white/10 text-white hover:bg-white/20 transition-all" title="Download">
                                                            <span className="material-symbols-outlined text-xs">download</span>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setDesignBaseImage(img.imageUrl || img.thumbnailUrl); setPrompt(img.prompt || ''); }}
                                                            className="p-1 rounded-md bg-white/10 text-white hover:bg-primary/40 transition-all" title="Edit">
                                                            <span className="material-symbols-outlined text-xs">edit</span>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setPublishData({ image: img.imageUrl || img.thumbnailUrl, text: img.title || '' }) }}
                                                            className="p-1 rounded-md bg-white/10 text-white hover:bg-[#1877F2]/40 transition-all" title="Publish">
                                                            <span className="material-symbols-outlined text-xs">share</span>
                                                        </button>
                                                    </div>
                                                </div>
                                                {/* Time ago badge */}
                                                <span className="absolute top-1.5 right-1.5 text-[8px] text-white/60 bg-black/50 px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-all">{getTimeAgo(img.createdAt)}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            }

                            {/* ── List View (default) ── */}
                            return (
                                <div className="space-y-4">
                                    {filtered.map(img => (
                                    <div key={img._id} className="generation-card">
                                        {/* Prompt */}
                                        <p className="text-xs text-slate-400 mb-2 line-clamp-2 leading-relaxed">
                                            {img.prompt || img.title || 'AI Generated'}
                                        </p>

                                        {/* Image */}
                                        <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-black/20 cursor-pointer group mb-2.5"
                                            onClick={() => setZoomImage(img.imageUrl || img.thumbnailUrl)}>
                                            <img src={img.imageUrl || img.thumbnailUrl} alt={img.title || 'Creative'}
                                                loading="lazy" decoding="async"
                                                className="w-full h-full object-cover"
                                                style={{ maxHeight: '400px' }} />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                <span className="material-symbols-outlined text-2xl text-white bg-black/50 rounded-full p-2">zoom_in</span>
                                            </div>
                                        </div>

                                        {/* Metadata */}
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            {img.aspectRatio && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-300">
                                                    {img.aspectRatio}
                                                </span>
                                            )}
                                            {img.model && (
                                                <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500">
                                                    {img.model}
                                                </span>
                                            )}
                                            <span className="text-[10px] text-slate-600">{getTimeAgo(img.createdAt)}</span>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-1.5">
                                            <button onClick={() => handleDownloadImage(img.imageUrl || img.thumbnailUrl, `${img.title || 'creative'}.png`)}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all" title="Download">
                                                <span className="material-symbols-outlined text-sm">download</span>
                                            </button>
                                            <button onClick={() => { setDesignBaseImage(img.imageUrl || img.thumbnailUrl); setPrompt(img.prompt || ''); }}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-primary hover:bg-primary/10 cursor-pointer transition-all" title="Edit">
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button onClick={() => setPublishData({ image: img.imageUrl || img.thumbnailUrl, text: img.title || '' })}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1877F2] hover:bg-[#1877F2]/10 cursor-pointer transition-all" title="Publish">
                                                <span className="material-symbols-outlined text-sm">share</span>
                                            </button>
                                        </div>
                                    </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* ── Empty State with Inline Suggestions ── */}
                        {!result && !generating && bankImages.filter(img => img.source === 'ai-generated' || img.category === 'generated' || img.type === 'creative').length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 px-4">
                                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-3xl text-slate-600">palette</span>
                                </div>
                                <h3 className="text-base font-bold text-white mb-1">No generations yet</h3>
                                <p className="text-sm text-slate-500 max-w-xs text-center mb-6">Describe your vision in the prompt panel and hit Generate to create your first brand visual.</p>

                                <p className="text-[11px] text-slate-600 uppercase tracking-wider font-bold mb-3">Try a quick prompt</p>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {[
                                        { icon: 'share', label: 'Social Post', color: '#6366f1', prompt: `Create a visually stunning social media post for ${activeBrand?.name || 'the brand'}. Make it eye-catching, on-brand, and shareable.` },
                                        { icon: 'inventory_2', label: 'Product Shot', color: '#f59e0b', prompt: `Create a premium product showcase for ${activeBrand?.name || 'the brand'}. Feature the product prominently with brand colors.` },
                                        { icon: 'local_offer', label: 'Sale / Offer', color: '#ef4444', template: templateCategories.find(c => c.id === 'sales')?.subTemplates?.[0] },
                                        { icon: 'format_quote', label: 'Quote', color: '#10b981', template: templateCategories.find(c => c.id === 'quotes')?.subTemplates?.[0] },
                                        { icon: 'campaign', label: 'Announcement', color: '#8b5cf6', template: templateCategories.find(c => c.id === 'announcement')?.subTemplates?.[0] },
                                        { icon: 'auto_stories', label: 'Brand Story', color: '#f97316', prompt: `Create a compelling brand story visual for ${activeBrand?.name || 'the brand'}. Tell the brand narrative through imagery.` },
                                    ].map(chip => (
                                        <button key={chip.label} onClick={() => {
                                            if (chip.template && chip.template.fields?.length > 0) { setActiveQuickTemplate(chip.template); setTemplateFields({}); }
                                            else if (chip.prompt) setPrompt(chip.prompt);
                                        }}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer hover:scale-[1.03] border border-white/[0.06] hover:border-white/[0.12]"
                                            style={{ background: `linear-gradient(135deg, ${chip.color}08, ${chip.color}04)` }}>
                                            <span className="material-symbols-outlined text-sm" style={{ color: chip.color }}>{chip.icon}</span>
                                            <span className="text-slate-300">{chip.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>{/* ═══════════ END RIGHT GALLERY PANEL ═══════════ */}

                </div>
            )}




            {/* =================== AI PHOTOSHOOT MODE =================== */}
            {studioMode === 'photoshoot' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 fade-up">

                    {/* Recent Photoshoots */}
                    {(() => {
                        const recentPhotoshoots = bankImages.filter(i => i.type === 'ai-photoshoot' || i.type === 'photoshoot').slice(0, 8);
                        if (recentPhotoshoots.length === 0) return null;
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
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

                        {/* Model Selector for Photoshoot */}
                        <div className="relative mb-2">
                            <button onClick={() => setShowModelMenu(!showModelMenu)}
                                className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[11px] font-bold bg-white/[0.04] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/10 transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-xs" style={{ color: IMAGE_MODELS.find(m => m.id === imageModel)?.color || '#a855f7' }}>
                                    {IMAGE_MODELS.find(m => m.id === imageModel)?.icon || 'auto_awesome'}
                                </span>
                                <span>{IMAGE_MODELS.find(m => m.id === imageModel)?.name || 'NanoBanana 2'}</span>
                                <span className="text-[9px] text-slate-500 ml-0.5">{IMAGE_MODELS.find(m => m.id === imageModel)?.provider}</span>
                                <span className="material-symbols-outlined text-[10px] text-slate-600 ml-auto">{showModelMenu ? 'expand_less' : 'expand_more'}</span>
                            </button>
                            {showModelMenu && (
                                <div className="absolute left-0 right-0 bottom-full mb-1 bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ animation: 'fadeUp 0.15s ease-out' }}>
                                    <div className="p-1.5 space-y-0.5 max-h-[280px] overflow-y-auto">
                                        {IMAGE_MODELS.map(m => (
                                            <button key={m.id} onClick={() => { setImageModel(m.id); setShowModelMenu(false) }}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${imageModel === m.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
                                                <span className="material-symbols-outlined text-sm" style={{ color: m.color }}>{m.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] font-bold truncate">{m.name}</span>
                                                        {m.id === 'nanobanana-2' && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">DEFAULT</span>}
                                                    </div>
                                                    <span className="text-[9px] text-slate-500 block truncate">{m.desc}</span>
                                                </div>
                                                {imageModel === m.id && <span className="material-symbols-outlined text-xs text-primary">check_circle</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Generate Button */}
                        <CreditTooltipWrapper action="photoshoot">
                            <button
                                onClick={async () => {
                                    if (!productImage || !activeBrand) return
                                    setPhotoshootGenerating(true)
                                    setPhotoshootError('')
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
                                            imageModel,
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
                                            // Accumulate into in-session photoshoot gallery
                                            setPsHistory(prev => [{ ...data, _brief: photoshootBrief, _timestamp: Date.now() }, ...prev])
                                            // Auto-save to image bank
                                            saveToImageBank(data)
                                        } else if (data.modelBusy) {
                                            setPhotoshootError(`⚡ Model is busy — try switching to a different model using the selector above.`)
                                        } else {
                                            setPhotoshootError({
                                                message: data.error || 'Generation failed',
                                                isProviderError: data.isProviderError,
                                                provider: data.provider
                                            })
                                        }
                                    } catch (err) {
                                        setPhotoshootError({
                                            message: err.message,
                                            isProviderError: err.isProviderError,
                                            provider: err.provider
                                        })
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
                            <div className={`p-3 rounded-xl border flex items-center gap-2 ${photoshootError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                <span className="material-symbols-outlined text-sm">{photoshootError.isProviderError ? 'warning' : 'error'}</span>
                                <div className="flex-1 text-sm">
                                    <span className="font-bold mr-1">{photoshootError.isProviderError ? `${photoshootError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                    {photoshootError.message}
                                </div>
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

                            <GlobalLoader 
                                isActive={photoshootGenerating} 
                                title="Creating Your Photoshoot" 
                                currentStage="Gemini AI is styling your product with professional lighting and composition..."
                                icon="photo_camera"
                                estimatedDuration={30}
                            />

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
                                                <div className={`mt-3 p-3 rounded-xl border flex items-center gap-2 ${psEditError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                                    <span className="material-symbols-outlined text-sm">{psEditError.isProviderError ? 'warning' : 'error'}</span>
                                                    <div className="flex-1 text-xs">
                                                        <span className="font-bold mr-1">{psEditError.isProviderError ? `${psEditError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                                        {psEditError.message}
                                                    </div>
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

                            {/* ── In-Session Photoshoot Gallery ── */}
                            {psHistory.length > 1 && (
                                <div className="mt-6 w-full">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm text-emerald-400">photo_library</span>
                                            Session Photoshoots ({psHistory.length})
                                        </h4>
                                        <button onClick={() => setPsHistory([])} className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer transition-all">Clear</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                                        {psHistory.map((item, idx) => (
                                            <div key={item._id || idx} className={`group relative rounded-xl overflow-hidden border ${idx === 0 ? 'border-emerald-500/30 ring-1 ring-emerald-500/20' : 'border-white/[0.06]'} bg-black/20 cursor-pointer transition-all hover:border-white/[0.12]`}
                                                onClick={() => setZoomImage(item.imageUrl)}>
                                                <img src={item.imageUrl} alt={item._brief || 'Photoshoot'} loading="lazy" decoding="async" className="w-full aspect-square object-cover" />
                                                {idx === 0 && <span className="absolute top-1.5 left-1.5 text-[8px] font-bold text-emerald-300 bg-emerald-500/30 px-1.5 py-0.5 rounded-md">Latest</span>}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-2">
                                                    <p className="text-[9px] text-white/80 line-clamp-2 mb-1.5 leading-tight">{item._brief || item.description || 'AI Photoshoot'}</p>
                                                    <div className="flex gap-1">
                                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(item.imageUrl, `photoshoot-${idx}.png`) }}
                                                            className="p-1 rounded-md bg-white/10 text-white hover:bg-white/20 transition-all" title="Download">
                                                            <span className="material-symbols-outlined text-xs">download</span>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setPhotoshootResult(item); }}
                                                            className="p-1 rounded-md bg-white/10 text-white hover:bg-emerald-500/40 transition-all" title="View full">
                                                            <span className="material-symbols-outlined text-xs">open_in_full</span>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setPublishData({ image: item.imageUrl, text: item._brief || '' }) }}
                                                            className="p-1 rounded-md bg-white/10 text-white hover:bg-[#1877F2]/40 transition-all" title="Publish">
                                                            <span className="material-symbols-outlined text-xs">share</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* =================== CAMPAIGN LOGO GENERATOR =================== */}
            {studioMode === 'campaignlogo' && (
                <div className="max-w-6xl mx-auto fade-up">
                    <div className="glow-border rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(239,68,68,0.04), rgba(168,85,247,0.03))' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(245,158,11,0.08) 0%, transparent 50%)' }} />
                        <div className="relative">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-1">
                                <span className="material-symbols-outlined text-2xl text-amber-400">verified</span>
                                Campaign Logo Generator
                                <span className="text-xs font-medium bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">AI</span>
                            </h2>
                            <p className="text-sm text-slate-400">Generate event & campaign logos — Diwali Sale, Summer Fest, MEGA OFFER and more</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="col-span-12 lg:col-span-5 space-y-4">
                            {/* Text */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">title</span>Logo Text
                                </h3>
                                <input type="text" value={clgText} onChange={e => setClgText(e.target.value)} placeholder="e.g. MEGA SALE, Diwali Dhamaka, Summer Fest 2026" className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-400/30" />
                            </div>

                            {/* Style */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-violet-400 text-lg">palette</span>Style
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {[{id:'2d-flat',l:'2D Flat'},{id:'3d-render',l:'3D Rendered'},{id:'isometric',l:'Isometric'},{id:'hand-drawn',l:'Hand-drawn'},{id:'neon',l:'Neon Glow'},{id:'metallic',l:'Metallic'},{id:'gradient',l:'Gradient'},{id:'pixel',l:'Pixel Art'}].map(s=>(
                                        <button key={s.id} onClick={()=>setClgStyle(s.id)} className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${clgStyle===s.id?'border-violet-400/40 bg-violet-500/10 text-white':'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}>{s.l}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Occasion */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-rose-400 text-lg">celebration</span>Occasion
                                </h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {['Diwali','Christmas','New Year','Valentine\'s','Summer Sale','Eid','Independence Day','Black Friday','Anniversary','Flash Sale','Launch','Custom'].map(o=>(
                                        <button key={o} onClick={()=>setClgOccasion(o)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${clgOccasion===o?'border-rose-400/40 bg-rose-500/10 text-white':'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}>{o}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Icon Theme */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-cyan-400 text-lg">interests</span>Icon Theme <span className="text-xs text-slate-600 font-normal">(optional)</span>
                                </h3>
                                <div className="flex flex-wrap gap-1.5">
                                    {[{id:'sparkles',l:'✨ Sparkles'},{id:'fireworks',l:'🎆 Fireworks'},{id:'shopping',l:'🛍️ Shopping'},{id:'hearts',l:'❤️ Hearts'},{id:'stars',l:'⭐ Stars'},{id:'trophy',l:'🏆 Trophy'},{id:'gift',l:'🎁 Gift'},{id:'fire',l:'🔥 Fire'},{id:'ribbon',l:'🎀 Ribbon'},{id:'none',l:'None'}].map(i=>(
                                        <button key={i.id} onClick={()=>setClgIcon(i.id==='none'?'':i.id)} className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${clgIcon===i.id||(i.id==='none'&&!clgIcon)?'border-cyan-400/30 bg-cyan-500/10 text-white':'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}>{i.l}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Colors, Background, Shape */}
                            <div className="studio-card p-5 space-y-4">
                                <div>
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-emerald-400 text-lg">format_color_fill</span>Colors</h3>
                                    <div className="flex gap-2 mb-2">
                                        <button onClick={()=>setClgColorMode('brand')} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${clgColorMode==='brand'?'border-emerald-400/30 bg-emerald-500/10 text-white':'border-white/[0.06] text-slate-400'}`}>Brand Colors</button>
                                        <button onClick={()=>setClgColorMode('custom')} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${clgColorMode==='custom'?'border-emerald-400/30 bg-emerald-500/10 text-white':'border-white/[0.06] text-slate-400'}`}>Custom</button>
                                    </div>
                                    {clgColorMode==='custom'&&<input type="text" value={clgCustomColors} onChange={e=>setClgCustomColors(e.target.value)} placeholder="#FFD700, #FF4500" className="w-full px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs focus:outline-none focus:border-emerald-400/30" />}
                                    {clgColorMode==='brand'&&activeBrand?.dna?.colors?.length>0&&<div className="flex gap-1">{activeBrand.dna.colors.slice(0,6).map((c,i)=><div key={i} className="w-6 h-6 rounded-full border border-white/10" title={c} style={{backgroundColor:c}} />)}</div>}
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-blue-400 text-lg">layers</span>Background</h3>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['transparent','white','black','gradient'].map(b=>(
                                            <button key={b} onClick={()=>setClgBg(b)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer capitalize ${clgBg===b?'border-blue-400/30 bg-blue-500/10 text-white':'border-white/[0.06] text-slate-400'}`}>{b}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-pink-400 text-lg">shape_line</span>Shape</h3>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['freeform','circular badge','ribbon banner','diamond','shield','stamp'].map(sh=>(
                                            <button key={sh} onClick={()=>setClgShape(sh)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer capitalize ${clgShape===sh?'border-pink-400/30 bg-pink-500/10 text-white':'border-white/[0.06] text-slate-400'}`}>{sh}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* AI Enhancement */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-amber-400 text-lg">auto_awesome</span>AI Enhancement</h3>
                                <input type="text" value={clgEnhance} onChange={e=>setClgEnhance(e.target.value)} placeholder="e.g. bold, elegant, playful, luxury" className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-400/30" />
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {['bold','elegant','playful','luxury','minimalist','retro','futuristic','vibrant'].map(kw=>(
                                        <button key={kw} onClick={()=>setClgEnhance(p=>p?`${p}, ${kw}`:kw)} className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.04] border border-white/[0.06] text-slate-500 hover:text-amber-300 hover:border-amber-400/20 transition-all cursor-pointer">+{kw}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Generate */}
                            <button disabled={!clgText||clgLoading} onClick={async()=>{
                                setClgLoading(true);setClgError('');
                                try{
                                    const brandColors=clgColorMode==='brand'&&activeBrand?.dna?.colors?.length?activeBrand.dna.colors.map(c=>typeof c==='string'?c:c.hex||c.name||'').filter(Boolean).join(', '):clgCustomColors;
                                    const v=clgResults.length+1;
                                    const prompt=`Generate a CAMPAIGN LOGO / EVENT BADGE design.\n\nTEXT: "${clgText}"\nSTYLE: ${clgStyle||'modern'}\n${clgOccasion?`OCCASION: ${clgOccasion}\n`:''}${clgIcon?`ICON ELEMENTS: Include ${clgIcon} visual elements\n`:''}COLORS: Use ${brandColors||'vibrant, eye-catching colors'}\nBACKGROUND: ${clgBg==='transparent'?'transparent/alpha background (PNG-ready)':clgBg}\nSHAPE: ${clgShape}\n${clgEnhance?`STYLE KEYWORDS: ${clgEnhance}\n`:''}VARIANT: ${v} — create a unique, visually distinctive design\n\nCRITICAL RULES:\n- This is a LOGO/BADGE, not a poster — keep it compact and icon-like\n- The text "${clgText}" must be clearly readable and be the HERO element\n- Use professional typography — bold, impactful lettering\n- Make it suitable for use as a campaign identifier across marketing materials\n- ${clgBg==='transparent'?'Ensure the background is fully transparent':'Fill the background as specified'}\n- Do NOT add placeholder text or watermarks`;
                                    const res=await creativesAPI.generate({prompt,brandId:activeBrand?._id,type:'campaign-logo',options:{aspectRatio:'1:1',style:'logo',imageModel}}, { timeout: 180000 });
                                    if (res.warnings?.length > 0) {
                                        setAiWarnings(prev => [...new Set([...prev, ...res.warnings])]);
                                    }
                                    const url=res.creative?.imageUrl||res.imageUrl;
                                    if(url)setClgResults(prev=>[...prev,url]);
                                    else setClgError({
                                        message: 'No image returned — try again',
                                        isProviderError: false
                                    });
                                }catch(err){
                                    console.error('❌ Logo generation error:', err);
                                    setClgError({
                                        message: err.message,
                                        isProviderError: err.isProviderError,
                                        provider: err.provider
                                    });
                                } finally {
                                    setClgLoading(false);
                                }
                            }}
                            className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {clgLoading ? (
                                <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>Generating Logo...</>
                            ) : (
                                <><span className="material-symbols-outlined text-lg">auto_awesome</span>{clgResults.length > 0 ? 'Generate Another Variant' : 'Generate Campaign Logo'}<span className="text-xs opacity-60 ml-1">~₹0.25</span></>
                            )}
                        </button>

                            {clgLoading&&<div className="w-full bg-white/[0.06] rounded-full h-1 mt-4"><div className="bg-gradient-to-r from-amber-500 to-orange-500 h-1 rounded-full animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.3)]" style={{width:'100%'}}/></div>}

                            {aiWarnings.length > 0 && (
                                <div className="space-y-2 mt-4">
                                    {aiWarnings.map((warn, i) => (
                                        <div key={i} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] flex items-center gap-2 animate-fade-in font-medium">
                                            <span className="material-symbols-outlined text-sm">warning</span>
                                            <span>{warn}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {clgError && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${clgError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                                    <span className="material-symbols-outlined text-lg">{clgError.isProviderError ? 'warning' : 'error'}</span>
                                    <div className="flex-1 text-sm">
                                        <span className="font-bold mr-1">{clgError.isProviderError ? `${clgError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                        {clgError.message}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right — Results */}
                        <div className="col-span-12 lg:col-span-7">
                            <div className="studio-card p-5 min-h-[500px] flex flex-col">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-amber-400 text-lg">image</span>Logo Variants</h3>
                                {clgResults.length>0?(
                                    <div className="flex-1">
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            {clgResults.map((url,i)=>(
                                                <div key={i} className="rounded-xl overflow-hidden bg-[repeating-conic-gradient(#1a1a2e_0%_25%,#16162a_0%_50%)] bg-[length:16px_16px] group relative">
                                                    <img src={url} alt={`Variant ${i+1}`} className="w-full h-auto object-contain" />
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                        <a href={url} download={`campaign-logo-${i+1}.png`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-white/20 text-white text-xs font-medium backdrop-blur-sm hover:bg-white/30 transition-all cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-sm">download</span>Save</a>
                                                        <button onClick={()=>{setCampCampaignLogo(url);setStudioMode('campaigns');creativesAPI.saveToBank({imageUrl:url,brandId:activeBrand?._id,title:'Campaign Logo',source:'campaign-logo'}).catch(()=>{})}} className="px-3 py-1.5 rounded-lg bg-amber-500/30 text-amber-200 text-xs font-medium backdrop-blur-sm hover:bg-amber-500/50 transition-all cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-sm">campaign</span>Use in Campaign</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ):(
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mb-4"><span className="material-symbols-outlined text-4xl text-amber-400/40">verified</span></div>
                                        <p className="text-slate-400 text-sm font-medium mb-1">No logos generated yet</p>
                                        <p className="text-slate-600 text-xs">Enter your text, pick a style, and generate</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* =================== CAMPAIGN CREATIVES WIZARD =================== */}
            {studioMode === 'campaigns' && (
                <div className="max-w-6xl mx-auto fade-up">
                    {/* Header */}
                    <div className="glow-border rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.06), rgba(168,85,247,0.04), rgba(6,182,212,0.03))' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(59,130,246,0.08) 0%, transparent 50%)' }} />
                        <div className="relative">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-1">
                                <span className="material-symbols-outlined text-2xl text-blue-400">campaign</span>
                                Campaign Creatives
                                <span className="text-xs font-medium bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">AI Wizard</span>
                            </h2>
                            <p className="text-sm text-slate-400">Build coordinated campaign batches — trend-powered, AI-driven</p>
                        </div>
                    </div>

                    {/* Step Indicator — 3-step flow */}
                    <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide pb-2">
                        {[{n:1,l:'Intelligence Brief',icon:'psychology'},{n:2,l:'Copy & Style',icon:'palette'},{n:3,l:'Generate',icon:'auto_awesome'}].map((s,i)=>(
                            <Fragment key={s.n}>
                                <button onClick={()=>s.n<campStep&&setCampStep(s.n)} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${campStep===s.n?'bg-blue-500/20 text-blue-300 border border-blue-400/30':campStep>s.n?'bg-emerald-500/10 text-emerald-300 border border-emerald-400/20 cursor-pointer':'bg-white/[0.03] text-slate-600 border border-white/[0.05]'}`}>
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${campStep===s.n?'bg-blue-500 text-white':campStep>s.n?'bg-emerald-500 text-white':'bg-white/10 text-slate-600'}`}>{campStep>s.n?'✓':s.n}</span>{s.l}
                                </button>
                                {i<2&&<div className={`flex-1 min-w-[20px] h-px ${campStep>s.n?'bg-emerald-500/30':'bg-white/[0.06]'}`}/>}
                            </Fragment>
                        ))}
                    </div>

                    {/* ══ STEP 1: Intelligence Brief (merged Brief + Products) ══ */}
                    {campStep === 1 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="col-span-12 lg:col-span-7 space-y-4">
                                {/* Campaign Name + Goal */}
                                <div className="studio-card p-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-blue-400 text-lg">badge</span>Campaign Name</h3>
                                            <input type="text" value={campName} onChange={e=>setCampName(e.target.value)} placeholder="Auto-generated from keyword..." className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-400/30" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-emerald-400 text-lg">flag</span>Campaign Goal</h3>
                                            <div className="flex flex-wrap gap-1.5">
                                                {['Awareness','Engagement','Conversion','Product Launch','Sale / Offer','Seasonal','Trend Ride'].map(g=>(
                                                    <button key={g} onClick={()=>setCampGoal(g)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campGoal===g?'border-emerald-400/40 bg-emerald-500/10 text-white':'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}>{g}</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Keyword Intelligence Section ── */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-amber-400 text-lg">psychology</span>Keyword Intelligence <span className="text-[10px] text-amber-400/60 font-normal bg-amber-500/10 px-2 py-0.5 rounded-full">AI Agent</span></h3>
                                    <div className="flex gap-2 mb-4">
                                        {[{id:'product-trends',l:'🧠 Product Trends',icon:'trending_up'},{id:'trending',l:'🔥 Social Trends',icon:'whatshot'},{id:'seo',l:'🔍 SEO Keywords',icon:'search'},{id:'custom',l:'✍️ Custom',icon:'edit'}].map(t=>(
                                            <button key={t.id} onClick={async()=>{
                                                setCampKeywordSource(t.id);
                                                if(t.id==='product-trends'&&!campProductIntel){
                                                    setCampIntelLoading(true);
                                                    try{
                                                        const r=await trendsAPI.productIntelligence({brandId:activeBrand?._id});
                                                        setCampProductIntel(r);
                                                        setCampIntelProducts(r.products||{});
                                                        // Also load brand products for the inline selector
                                                        if(!campBrandProducts.length&&activeBrand?._id){
                                                            productsAPI.list({brandId:activeBrand._id,limit:50}).then(pr=>setCampBrandProducts(pr.products||[])).catch(()=>{});
                                                        }
                                                    }catch(e){console.error(e)}
                                                    finally{setCampIntelLoading(false)}
                                                }
                                                if(t.id==='trending'&&!campTrends.length){
                                                    setCampTrendsLoading(true);
                                                    try{const r=await trendsAPI.grokTopics({brandId:activeBrand?._id});setCampTrends(r.trends||r.trendingTopics||[])}catch(e){console.error(e)}
                                                    finally{setCampTrendsLoading(false)}
                                                }
                                                if(t.id==='seo'&&!campSeoKws.length){
                                                    setCampTrendsLoading(true);
                                                    try{const r=await trendsAPI.grokSeo({brandId:activeBrand?._id});setCampSeoKws(r.risingKeywords||r.keywords||[])}catch(e){console.error(e)}
                                                    finally{setCampTrendsLoading(false)}
                                                }
                                            }} className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border transition-all cursor-pointer ${campKeywordSource===t.id?'border-amber-400/30 bg-amber-500/10 text-amber-300':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>{t.l}</button>
                                        ))}
                                    </div>

                                    {/* ── Product Trends Tab (NEW — AI Agent) ── */}
                                    {campKeywordSource==='product-trends'&&(campIntelLoading?(
                                        <div className="text-center py-8">
                                            <span className="material-symbols-outlined animate-spin text-2xl text-amber-400 block mb-2">psychology</span>
                                            <p className="text-slate-400 text-sm">AI Agent analyzing your products & market trends...</p>
                                            <p className="text-slate-600 text-[10px] mt-1">Researching features, keywords & competitor data</p>
                                        </div>
                                    ):(
                                        <div className="space-y-3">
                                            {/* Category Insight */}
                                            {campProductIntel?.categoryInsight&&(
                                                <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10 text-amber-200/80 text-xs leading-relaxed">
                                                    <span className="material-symbols-outlined text-sm align-text-bottom mr-1 text-amber-400">lightbulb</span>{campProductIntel.categoryInsight}
                                                </div>
                                            )}
                                            {/* Top Recommendation */}
                                            {campProductIntel?.topRecommendation&&(
                                                <div className="px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-300/80 text-xs leading-relaxed">
                                                    <span className="material-symbols-outlined text-sm align-text-bottom mr-1 text-emerald-400">star</span><strong>Top Pick:</strong> {campProductIntel.topRecommendation}
                                                </div>
                                            )}
                                            {/* Trending Features Grid */}
                                            <div>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Trending Product Features</p>
                                                <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto">
                                                    {(campProductIntel?.trendingFeatures||[]).map((f,i)=>{
                                                        const matchCount=(f.matchingProductIds||[]).length;
                                                        return(
                                                            <button key={i} onClick={()=>{
                                                                setCampKeyword(f.feature);
                                                                if(!campName) setCampName(`${f.feature} Campaign`);
                                                                // Auto-select matching products
                                                                if(matchCount>0){
                                                                    const matchedProds=(f.matchingProductIds||[]).map(id=>{
                                                                        const pd=campIntelProducts[id];
                                                                        if(!pd) return null;
                                                                        return{productId:id,title:pd.title,image:pd.image,features:pd.features,price:pd.price,source:'catalog'};
                                                                    }).filter(Boolean);
                                                                    setCampProducts(matchedProds);
                                                                }
                                                            }} className={`group relative px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${campKeyword===f.feature?'border-amber-400/40 bg-amber-500/15 text-white ring-1 ring-amber-400/20':'border-white/[0.06] text-slate-300 hover:border-amber-400/20 hover:bg-amber-500/5'}`}>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-amber-400 text-[10px]">🔥{f.trendScore||'—'}</span>
                                                                    <span>{f.feature}</span>
                                                                    {matchCount>0&&<span className="text-[9px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full font-bold">{matchCount} product{matchCount>1?'s':''}</span>}
                                                                </div>
                                                                {f.whyTrending&&<p className="text-[9px] text-slate-500 mt-0.5 text-left max-w-[200px] line-clamp-1">{f.whyTrending}</p>}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                            {/* Trending Keywords */}
                                            {(campProductIntel?.trendingKeywords||[]).length>0&&(
                                                <div>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Trending Search Keywords</p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {(campProductIntel.trendingKeywords||[]).slice(0,12).map((k,i)=>(
                                                            <button key={i} onClick={()=>{
                                                                const kw=typeof k==='string'?k:k.keyword||'';
                                                                setCampKeyword(kw);
                                                                if(!campName) setCampName(`${kw} Campaign`);
                                                                // Auto-select matching products
                                                                const ids=k.matchingProductIds||[];
                                                                if(ids.length>0){
                                                                    const matchedProds=ids.map(id=>{const pd=campIntelProducts[id];return pd?{productId:id,title:pd.title,image:pd.image,features:pd.features,price:pd.price,source:'catalog'}:null}).filter(Boolean);
                                                                    setCampProducts(matchedProds);
                                                                }
                                                            }} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campKeyword===(typeof k==='string'?k:k.keyword)?'border-cyan-400/40 bg-cyan-500/10 text-white':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>
                                                                {typeof k==='string'?k:k.keyword||''}
                                                                {k.intent&&<span className="ml-1 text-[8px] text-slate-600">({k.intent})</span>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Viral Angles */}
                                            {(campProductIntel?.viralAngles||[]).length>0&&(
                                                <div>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Viral Content Angles</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {(campProductIntel.viralAngles||[]).slice(0,4).map((v,i)=>(
                                                            <button key={i} onClick={()=>{setCampKeyword(v.angle);if(!campName)setCampName(`${v.angle} Campaign`)}} className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${campKeyword===v.angle?'border-rose-400/40 bg-rose-500/10':'border-white/[0.06] hover:border-rose-400/20'}`}>
                                                                <p className="text-xs text-white font-medium">{v.angle}</p>
                                                                <p className="text-[9px] text-slate-500 mt-0.5">{v.format} • {v.whyViral?.slice(0,60)}</p>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* ── Social Trends Tab (existing, fallback) ── */}
                                    {campKeywordSource==='trending'&&(campTrendsLoading?<div className="text-center py-4 text-slate-500 text-sm"><span className="material-symbols-outlined animate-spin text-lg align-middle mr-1">progress_activity</span>Fetching social trends...</div>:<div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">{(Array.isArray(campTrends)?campTrends:[]).slice(0,20).map((t,i)=>{const label=typeof t==='string'?t:t.topic||t.name||t.title||'';return label?<button key={i} onClick={()=>{setCampKeyword(label);if(!campName)setCampName(`${label} Campaign`)}} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campKeyword===label?'border-amber-400/40 bg-amber-500/10 text-white':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>{label}</button>:null})}</div>)}

                                    {/* ── SEO Keywords Tab (existing) ── */}
                                    {campKeywordSource==='seo'&&(campTrendsLoading?<div className="text-center py-4 text-slate-500 text-sm"><span className="material-symbols-outlined animate-spin text-lg align-middle mr-1">progress_activity</span>Fetching SEO keywords...</div>:<div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">{(Array.isArray(campSeoKws)?campSeoKws:[]).slice(0,20).map((k,i)=>{const label=typeof k==='string'?k:k.keyword||k.term||k.name||'';return label?<button key={i} onClick={()=>{setCampKeyword(label);if(!campName)setCampName(`${label} Campaign`)}} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campKeyword===label?'border-amber-400/40 bg-amber-500/10 text-white':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>{label}</button>:null})}</div>)}

                                    {/* ── Custom Tab (existing) ── */}
                                    {campKeywordSource==='custom'&&<input type="text" value={campKeyword} onChange={e=>{setCampKeyword(e.target.value);if(!campName)setCampName(`${e.target.value} Campaign`)}} placeholder="Type your keyword or campaign topic..." className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-400/30" />}

                                    {/* Selected Keyword Badge */}
                                    {campKeyword&&<div className="mt-3 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs inline-flex items-center gap-1"><span className="material-symbols-outlined text-sm">check_circle</span>Selected: <strong>{campKeyword}</strong></div>}
                                </div>

                                {/* ── Suggested Products (inline — appears after keyword selection) ── */}
                                {campKeyword && (
                                    <div className="studio-card p-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-bold text-white text-sm flex items-center gap-2"><span className="material-symbols-outlined text-violet-400 text-lg">inventory_2</span>Matching Products {campProducts.length>0&&<span className="text-[10px] bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded-full font-bold">{campProducts.length} selected</span>}</h3>
                                            {campProducts.length>0&&<button onClick={()=>setCampProducts([])} className="text-[10px] text-red-400 hover:text-red-300 cursor-pointer">Clear all</button>}
                                        </div>

                                        {/* Load products if not loaded */}
                                        {campBrandProductsLoading?(
                                            <div className="text-center py-4 text-slate-500 text-sm"><span className="material-symbols-outlined animate-spin text-lg align-middle mr-1">progress_activity</span>Loading products...</div>
                                        ):(
                                            <div className="space-y-2">
                                                {/* Auto-suggested products from intelligence */}
                                                {campProducts.length>0&&(
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {campProducts.map((p,i)=>(
                                                            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                                                                {p.image&&<img src={p.image} alt="" className="w-6 h-6 rounded object-cover" />}
                                                                <span className="text-xs text-white font-medium">{p.title}</span>
                                                                {p.price?.amount&&<span className="text-[10px] text-emerald-400">₹{p.price.amount.toLocaleString('en-IN')}</span>}
                                                                <button onClick={()=>setCampProducts(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-300 cursor-pointer"><span className="material-symbols-outlined text-xs">close</span></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Product catalog browser (collapsed toggle) */}
                                                {campBrandProducts.length>0?(
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Add more from catalog ({campBrandProducts.length} available)</p>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[180px] overflow-y-auto">
                                                            {campBrandProducts.map(prod=>{
                                                                const isSelected=campProducts.some(p=>p.productId===prod._id);
                                                                return(
                                                                    <button key={prod._id} onClick={()=>{
                                                                        if(isSelected){setCampProducts(prev=>prev.filter(p=>p.productId!==prod._id))}
                                                                        else{setCampProducts(prev=>[...prev,{productId:prod._id,title:prod.title,image:prod.images?.[0]?.url||'',features:prod.features||[],price:prod.price,source:'catalog'}])}
                                                                    }} className={`flex items-center gap-2 p-2 rounded-lg text-left text-xs border transition-all cursor-pointer ${isSelected?'border-violet-400/30 bg-violet-500/10 text-white':'border-white/[0.06] text-slate-400 hover:border-violet-400/20'}`}>
                                                                        {prod.images?.[0]?.url?<img src={prod.images[0].url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0"/>:<div className="w-8 h-8 rounded bg-white/[0.05] flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-sm text-slate-600">inventory_2</span></div>}
                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-medium">{prod.title}</p>
                                                                            {prod.price?.amount&&<p className="text-[9px] text-emerald-400">₹{prod.price.amount.toLocaleString('en-IN')}</p>}
                                                                        </div>
                                                                        {isSelected&&<span className="material-symbols-outlined text-emerald-400 text-sm ml-auto flex-shrink-0">check_circle</span>}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    </div>
                                                ):(
                                                    <button onClick={()=>{
                                                        if(activeBrand?._id){setCampBrandProductsLoading(true);productsAPI.list({brandId:activeBrand._id,limit:50}).then(r=>setCampBrandProducts(r.products||[])).catch(()=>{}).finally(()=>setCampBrandProductsLoading(false))}
                                                    }} className="w-full py-2.5 rounded-xl border border-dashed border-white/[0.1] text-slate-500 text-xs hover:border-violet-400/20 hover:text-slate-300 cursor-pointer flex items-center justify-center gap-1.5">
                                                        <span className="material-symbols-outlined text-sm">add</span>Load product catalog
                                                    </button>
                                                )}

                                                {/* Upload / URL product options */}
                                                <div className="flex gap-2 mt-2">
                                                    <label className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/[0.06] text-slate-400 text-[10px] hover:border-amber-400/20 hover:text-slate-300 cursor-pointer">
                                                        <span className="material-symbols-outlined text-sm">upload</span>Upload Image
                                                        <input type="file" accept="image/*" className="hidden" onChange={async(e)=>{
                                                            const file=e.target.files[0]; if(!file) return;
                                                            const reader=new FileReader(); reader.onload=ev=>{
                                                                setCampProducts(prev=>[...prev,{title:file.name.replace(/\.\w+$/,''),image:ev.target.result,features:[],price:null,source:'upload'}]);
                                                            }; reader.readAsDataURL(file);
                                                        }} />
                                                    </label>
                                                    <div className="flex flex-1 gap-1">
                                                        <input type="text" value={campProductUrl} onChange={e=>setCampProductUrl(e.target.value)} placeholder="Paste product URL..." className="flex-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white text-[10px] placeholder:text-slate-600 focus:outline-none focus:border-amber-400/20" />
                                                        {campProductUrl&&<button onClick={async()=>{
                                                            try{const r=await productsAPI.scrapeUrl(campProductUrl);if(r?.product){setCampProducts(prev=>[...prev,{title:r.product.title||'Product',image:r.product.image||'',features:r.product.features||[],price:r.product.price,source:'url'}]);setCampProductUrl('')}}catch(e){console.error(e)}
                                                        }} className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-bold cursor-pointer">Fetch</button>}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="col-span-12 lg:col-span-5 space-y-4">
                                {/* Number of Creatives */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-violet-400 text-lg">grid_view</span>Number of Creatives</h3>
                                    <div className="flex items-center gap-3">
                                        <input type="range" min={1} max={10} value={campCount} onChange={e=>setCampCount(Number(e.target.value))} className="flex-1 accent-violet-500" />
                                        <span className="text-2xl font-bold text-white w-8 text-center">{campCount}</span>
                                    </div>
                                    <div className="flex gap-1 mt-2">{[1,3,5,8,10].map(n=><button key={n} onClick={()=>setCampCount(n)} className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer ${campCount===n?'border-violet-400/30 bg-violet-500/10 text-white':'border-white/[0.06] text-slate-500'}`}>{n}</button>)}</div>
                                </div>
                                {/* Sizes */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-cyan-400 text-lg">aspect_ratio</span>Creative Sizes</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {[{id:'4:5',l:'IG Post 4:5'},{id:'1:1',l:'Square 1:1'},{id:'9:16',l:'Story 9:16'},{id:'16:9',l:'YouTube 16:9'},{id:'2:3',l:'Pinterest 2:3'},{id:'1.91:1',l:'LinkedIn'}].map(sz=>(
                                            <button key={sz.id} onClick={()=>setCampSizes(p=>p.includes(sz.id)?p.filter(x=>x!==sz.id):[...p,sz.id])} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${campSizes.includes(sz.id)?'border-cyan-400/30 bg-cyan-500/10 text-white':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>{sz.l}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Product Strategy (show if multiple products) */}
                                {campProducts.length>1&&(
                                    <div className="studio-card p-4">
                                        <h3 className="font-bold text-white text-xs flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-amber-400 text-sm">tune</span>Product Strategy</h3>
                                        <div className="flex gap-2">
                                            {[{id:'same',l:'Same product all creatives'},{id:'different',l:'Rotate products across creatives'}].map(s=>(
                                                <button key={s.id} onClick={()=>setCampProductStrategy(s.id)} className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] border transition-all cursor-pointer ${campProductStrategy===s.id?'border-amber-400/30 bg-amber-500/10 text-white':'border-white/[0.06] text-slate-400'}`}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Next → Copy & Style */}
                                <button disabled={!campKeyword||!campGoal} onClick={()=>{
                                    setCampStep(2);
                                    // Auto-merge features from ALL selected products
                                    const merged=[];campProducts.forEach(p=>{(p.features||[]).forEach(f=>{if(!merged.includes(f))merged.push(f)})});if(merged.length>0)setCampFeatures(merged);
                                    // Auto-set price from first product if not set
                                    if(!campPrice){const p1=campProducts[0];if(p1?.price?.amount)setCampPrice(`₹${p1.price.amount.toLocaleString('en-IN')}`)}
                                    // Auto-switch strategy if multiple products
                                    if(campProducts.length>1)setCampProductStrategy('different');
                                    // Load products if not loaded for fallback
                                    if(!campBrandProducts.length&&activeBrand?._id){setCampBrandProductsLoading(true);productsAPI.list({brandId:activeBrand._id,limit:50}).then(r=>setCampBrandProducts(r.products||[])).catch(()=>{}).finally(()=>setCampBrandProductsLoading(false))}
                                }} className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                    Next: Copy & Style <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    )}



                    {/* ══ STEP 2: Copy & Style ══ */}
                    {campStep === 2 && (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="col-span-12 lg:col-span-7 space-y-4">
                                {/* AI Copy */}
                                <div className="studio-card p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-white text-sm flex items-center gap-2"><span className="material-symbols-outlined text-emerald-400 text-lg">smart_toy</span>AI-Generated Copies</h3>
                                        <button disabled={campCopyLoading} onClick={async()=>{
                                            setCampCopyLoading(true);
                                            try{
                                                // Use dedicated campaign copy endpoint with full Brand DNA injection
                                                const r = await creativesAPI.generateCampaignCopy({
                                                    brandId: activeBrand?._id,
                                                    campaignName: campName || campKeyword,
                                                    campaignGoal: campGoal,
                                                    keyword: campKeyword,
                                                    cta: campCta,
                                                    price: campPrice,
                                                    count: campCount,
                                                    features: campFeatures,
                                                    products: campProducts.map(p => ({
                                                        title: p.title,
                                                        features: p.features,
                                                        price: p.price,
                                                    })),
                                                    productStrategy: campProductStrategy,
                                                });
                                                if (r.copies && r.copies.length > 0) {
                                                    setCampCopies(r.copies.slice(0, campCount));
                                                } else if (r.raw) {
                                                    // Try parsing raw response
                                                    const jsonMatch = r.raw.match(/\[[\s\S]*\]/);
                                                    if (jsonMatch) {
                                                        try {
                                                            const parsed = JSON.parse(jsonMatch[0]);
                                                            setCampCopies(Array.isArray(parsed) ? parsed.slice(0, campCount) : []);
                                                        } catch { setCampCopies([]); }
                                                    }
                                                }
                                                // If still empty, use brand-aware fallback copies
                                                if (!r.copies?.length) {
                                                    const brandServices = activeBrand?.dna?.servicesOffered || [];
                                                    const brandUSPs = activeBrand?.dna?.uniqueSellingPoints || [];
                                                    const brandTagline = activeBrand?.dna?.tagline || '';
                                                    const fallback = Array.from({length: campCount}, (_, i) => {
                                                        const prod = campProducts.length > 1 ? campProducts[i % campProducts.length] : campProducts[0];
                                                        const pName = prod?.title || brandServices[i % Math.max(1, brandServices.length)] || activeBrand?.name || 'Our Products';
                                                        const pPrice = prod?.price?.amount ? `₹${prod.price.amount.toLocaleString('en-IN')}` : (campPrice || '');
                                                        const feat = prod?.features?.[i % Math.max(1, prod.features?.length || 1)] || campFeatures[i % Math.max(1, campFeatures.length)] || brandUSPs[i % Math.max(1, brandUSPs.length)] || '';
                                                        const angles = [
                                                            {h: `${feat || pName} — Reimagined for You`, b: `${brandTagline || `Discover ${pName}`}. ${feat ? feat + '. ' : ''}${pPrice ? pPrice + '. ' : ''}${campCta}.`, td: `Inspired by ${campKeyword} — warm, inviting tones`},
                                                            {h: `Elevate Your ${feat || 'Experience'}`, b: `${pName} from ${activeBrand?.name || 'us'}${feat ? ' with ' + feat : ''}. ${pPrice ? 'Just ' + pPrice + '. ' : ''}${campCta}.`, td: `${campKeyword}-themed mood, aspirational`},
                                                            {h: `The ${activeBrand?.name || 'Brand'} Difference`, b: `Loved by thousands. ${pName} delivers ${feat || 'excellence'}. ${pPrice ? pPrice + '. ' : ''}${campCta}.`, td: `Premium ${campKeyword} aesthetic, trust-building`},
                                                        ];
                                                        return {headline: angles[i % angles.length].h, body: angles[i % angles.length].b, cta: campCta, product: pName, feature: feat, theme_direction: angles[i % angles.length].td};
                                                    });
                                                    setCampCopies(fallback);
                                                }
                                            } catch(e) {
                                                console.error('Campaign copy generation error:', e);
                                                // Brand-aware error fallback
                                                const brandServices = activeBrand?.dna?.servicesOffered || [];
                                                const errCopies = Array.from({length: campCount}, (_, i) => {
                                                    const prod = campProducts.length > 1 ? campProducts[i % campProducts.length] : campProducts[0];
                                                    const pName = prod?.title || brandServices[i % Math.max(1, brandServices.length)] || activeBrand?.name || 'Our Products';
                                                    return {headline: `${pName} — Made for You`, body: `${prod?.features?.[0] || activeBrand?.dna?.tagline || 'Exceptional quality'}. ${prod?.price?.amount ? '₹' + prod.price.amount.toLocaleString('en-IN') + '. ' : ''}${campCta}.`, cta: campCta, product: pName, feature: prod?.features?.[0] || '', theme_direction: `${campKeyword}-inspired visual mood`};
                                                });
                                                setCampCopies(errCopies);
                                            }
                                            finally{setCampCopyLoading(false)}
                                        }} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1">
                                            {campCopyLoading?<><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>Generating...</>:<><span className="material-symbols-outlined text-sm">auto_awesome</span>Generate {campCount} Copies</>}
                                        </button>
                                    </div>
                                    {campCopies.length>0?(
                                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1" style={{scrollbarWidth:'thin',scrollbarColor:'rgba(255,255,255,0.1) transparent'}}>
                                            {campCopies.map((c,i)=>(
                                                <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[10px] font-bold text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded">#{i+1}</span>{c.product&&<span className="text-[9px] text-cyan-300 bg-cyan-500/15 px-1.5 py-0.5 rounded font-medium">📦 {c.product}</span>}{c.feature&&<span className="text-[9px] text-orange-300 bg-orange-500/15 px-1.5 py-0.5 rounded font-medium">⭐ {c.feature}</span>}</div>
                                                    <input value={c.headline||''} onChange={e=>{const u=[...campCopies];u[i]={...u[i],headline:e.target.value};setCampCopies(u)}} className="w-full px-2 py-1 mb-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white text-xs font-semibold focus:outline-none focus:border-blue-400/30" placeholder="Headline" />
                                                    <textarea value={c.body||''} onChange={e=>{const u=[...campCopies];u[i]={...u[i],body:e.target.value};setCampCopies(u)}} rows={2} className="w-full px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white text-[11px] focus:outline-none focus:border-blue-400/30 resize-none" placeholder="Body copy" />
                                                </div>
                                            ))}
                                        </div>
                                    ):(<p className="text-slate-600 text-xs text-center py-4">Click "Generate Copies" to create AI copy for each creative{campFeatures.length>0?` — each highlighting a different feature`:''}</p>)}
                                </div>
                                {/* Product Features */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-orange-400 text-lg">stars</span>Product Features<span className="text-[10px] text-slate-500 font-normal ml-1">distributed across creatives</span></h3>
                                    <p className="text-slate-500 text-[10px] mb-3">Add key features/USPs — each creative will highlight a different feature in its copy and visual.</p>
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {campFeatures.map((f,i)=>(
                                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-200 text-[11px] font-medium">
                                                <span className="text-[9px] text-orange-400/60 font-bold">#{i+1}</span>{f}
                                                <button onClick={()=>setCampFeatures(p=>p.filter((_,j)=>j!==i))} className="ml-0.5 text-orange-400/60 hover:text-orange-300 cursor-pointer text-xs">×</button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <input value={campFeatureInput} onChange={e=>setCampFeatureInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&campFeatureInput.trim()){setCampFeatures(p=>[...p,campFeatureInput.trim()]);setCampFeatureInput('')}}} className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white text-xs focus:outline-none focus:border-orange-400/30 placeholder:text-slate-600" placeholder="e.g. Noise cancellation, 40hr battery..." />
                                        <button disabled={!campFeatureInput.trim()} onClick={()=>{if(campFeatureInput.trim()){setCampFeatures(p=>[...p,campFeatureInput.trim()]);setCampFeatureInput('')}}} className="px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium hover:bg-orange-500/20 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">+ Add</button>
                                    </div>
                                    {campFeatures.length>0&&campFeatures.length<campCount&&<p className="text-yellow-400/60 text-[10px] mt-1.5">💡 {campFeatures.length} features for {campCount} creatives — features will cycle. Add {campCount-campFeatures.length} more for unique features per creative.</p>}
                                    {campFeatures.length>=campCount&&campFeatures.length>0&&<p className="text-emerald-400/60 text-[10px] mt-1.5">✅ {campFeatures.length} features for {campCount} creatives — each creative gets a unique feature!</p>}
                                </div>
                                {/* Price Point */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-green-400 text-lg">payments</span>Price Point<span className="text-[10px] text-slate-500 font-normal ml-1">optional — for pricing messaging</span></h3>
                                    <div className="flex gap-2 mb-2">
                                        <input value={campPrice} onChange={e=>setCampPrice(e.target.value)} className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white text-xs font-semibold focus:outline-none focus:border-green-400/30 placeholder:text-slate-600" placeholder="e.g. ₹2,999 or Starting at ₹999" />
                                        {campPrice&&<button onClick={()=>setCampPrice('')} className="px-2 py-1 text-xs text-red-400 hover:text-red-300 cursor-pointer">Clear</button>}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['₹499','₹999','₹1,999','₹2,999','₹4,999','₹9,999','Starting at ₹','Flat 50% Off','Buy 1 Get 1'].map(p=>(
                                            <button key={p} onClick={()=>setCampPrice(p)} className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer ${campPrice===p?'border-green-400/30 bg-green-500/10 text-green-300':'border-white/[0.06] text-slate-500 hover:text-slate-300'}`}>{p}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* CTA */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-rose-400 text-lg">touch_app</span>Call to Action</h3>
                                    <div className="flex flex-wrap gap-1.5">
                                        {['Shop Now','Learn More','Order Today','Grab Deal','Download','Sign Up','Book Now','Explore','Get Offer','Buy Now'].map(ct=>(
                                            <button key={ct} onClick={()=>setCampCta(ct)} className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campCta===ct?'border-rose-400/40 bg-rose-500/10 text-white':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>{ct}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="col-span-12 lg:col-span-5 space-y-4">
                                {/* Style */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-violet-400 text-lg">palette</span>Style</h3>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['Minimal','Bold','Elegant','Vibrant','Dark Luxury','Retro','Gradient Pop','Corporate'].map(st=>(
                                            <button key={st} onClick={()=>setCampStyle(st.toLowerCase())} className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${campStyle===st.toLowerCase()?'border-violet-400/40 bg-violet-500/10 text-white':'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}>{st}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Logo Placement */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-amber-400 text-lg">crop_free</span>Logo Placement</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                                        {[{id:'top-left',l:'↖ TL'},{id:'top-center',l:'↑ TC'},{id:'top-right',l:'↗ TR'},{id:'bottom-left',l:'↙ BL'},{id:'bottom-center',l:'↓ BC'},{id:'bottom-right',l:'↘ BR'},{id:'none',l:'None'}].map(p=>(
                                            <button key={p.id} onClick={()=>setCampLogoPlacement(p.id)} className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campLogoPlacement===p.id?'border-amber-400/40 bg-amber-500/10 text-white':'border-white/[0.06] text-slate-400'}`}>{p.l}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Creative Scene / Setting */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-teal-400 text-lg">photo_camera</span>Creative Scene</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                                        {[
                                            {id:'auto',l:'🎲 Auto',d:'AI picks best scene'},
                                            {id:'studio',l:'📸 Studio',d:'Clean studio backdrop'},
                                            {id:'outdoor',l:'🌿 Outdoor',d:'Natural outdoor setting'},
                                            {id:'indoor',l:'🏠 Indoor',d:'Styled interior'},
                                            {id:'podium',l:'🏆 Podium',d:'Product on pedestal'},
                                            {id:'hands',l:'🤲 Hands',d:'Product held in hands'},
                                            {id:'model',l:'👤 Model',d:'Person using product'},
                                            {id:'flatlay',l:'📐 Flat Lay',d:'Top-down arrangement'},
                                            {id:'lifestyle',l:'🏡 Lifestyle',d:'Real-life context'},
                                            {id:'urban',l:'🏙️ Urban',d:'City/street background'},
                                            {id:'nature',l:'🌊 Nature',d:'Natural landscape'},
                                            {id:'minimal',l:'✨ Minimal',d:'Clean, simple backdrop'},
                                        ].map(s=>(
                                            <button key={s.id} onClick={()=>setCampScene(s.id)} title={s.d} className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${campScene===s.id?'border-teal-400/40 bg-teal-500/10 text-white':'border-white/[0.06] text-slate-400 hover:text-slate-200'}`}>{s.l}</button>
                                        ))}
                                    </div>
                                </div>
                                {/* Style from Best Performing */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-yellow-400 text-lg">emoji_events</span>Style from Best Performing</h3>
                                    {campStyleRef?(
                                        <div className="relative rounded-xl overflow-hidden group">
                                            <img src={campStyleRef} alt="Style Ref" className="w-full h-20 object-cover rounded-xl" />
                                            <button onClick={()=>setCampStyleRef(null)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[10px]">✕</button>
                                        </div>
                                    ):(
                                        <button onClick={async()=>{
                                            setBplMode('style');setBplOpen(true);setBplLoading(true);
                                            try{const r=await creativesAPI.imageBank({brandId:activeBrand?._id,category:'generated',limit:20});setBplCreatives(r.creatives||[])}catch(e){console.error(e)}
                                            finally{setBplLoading(false)}
                                        }} className="w-full py-3 rounded-xl border-2 border-dashed border-white/10 hover:border-yellow-400/30 bg-white/[0.02] text-slate-400 hover:text-yellow-300 text-sm transition-all cursor-pointer flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-lg">photo_library</span>Browse Best Performing Creatives
                                        </button>
                                    )}
                                </div>
                                {/* Campaign Logo */}
                                <div className="studio-card p-5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-amber-400 text-lg">verified</span>Campaign Logo <span className="text-xs text-slate-600 font-normal">(optional)</span></h3>
                                    {campCampaignLogo?(
                                        <div className="relative rounded-xl overflow-hidden group">
                                            <img src={campCampaignLogo} alt="Campaign Logo" className="w-full h-24 object-contain rounded-xl bg-white/5" />
                                            <button onClick={()=>setCampCampaignLogo(null)} className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"><span className="material-symbols-outlined text-xs">close</span></button>
                                        </div>
                                    ):(
                                        <div className="grid grid-cols-2 gap-2">
                                            {activeBrand?.dna?.logo?.url&&(
                                                <button onClick={()=>setCampCampaignLogo(activeBrand.dna.logo.url)} className="flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-amber-400/20 hover:border-amber-400/40 bg-amber-500/5 cursor-pointer transition-all group">
                                                    <img src={activeBrand.dna.logo.url} alt="Brand logo" className="h-8 object-contain opacity-70 group-hover:opacity-100 transition-opacity" />
                                                    <span className="text-[10px] text-amber-300 mt-1">Brand Logo</span>
                                                </button>
                                            )}
                                            <label className="flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                                <span className="material-symbols-outlined text-xl text-slate-600 group-hover:text-amber-400">upload</span><span className="text-[10px] text-slate-500">Upload</span>
                                                <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onload=ev=>setCampCampaignLogo(ev.target.result);r.readAsDataURL(f)}}} />
                                            </label>
                                            <button onClick={()=>setStudioMode('campaignlogo')} className="flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                                <span className="material-symbols-outlined text-xl text-slate-600 group-hover:text-amber-400">auto_awesome</span><span className="text-[10px] text-slate-500">Generate</span>
                                            </button>
                                            <button onClick={async()=>{
                                                setBplMode('logo');setBplOpen(true);setBplLoading(true);
                                                try{
                                                    const r=await creativesAPI.imageBank({brandId:activeBrand?._id,category:'generated',limit:50});
                                                    const allImages=r.images||r.creatives||[];
                                                    const logoImages=allImages.filter(img=>img.type==='campaign-logo'||img.title?.toLowerCase().includes('logo'));
                                                    setBplCreatives(logoImages.length>0?logoImages:allImages);
                                                }catch(e){console.error(e)}
                                                finally{setBplLoading(false)}
                                            }} className="flex flex-col items-center justify-center h-20 rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                                <span className="material-symbols-outlined text-xl text-slate-600 group-hover:text-amber-400">photo_library</span><span className="text-[10px] text-slate-500">Saved Logos</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {/* Nav */}
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button onClick={()=>setCampStep(1)} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"><span className="material-symbols-outlined text-lg">arrow_back</span>Back</button>
                                    <button onClick={()=>setCampStep(3)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer">Next: Generate<span className="material-symbols-outlined text-lg">arrow_forward</span></button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ══ STEP 3: Generate & Review ══ */}
                    {campStep === 3 && (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-blue-400 text-lg">summarize</span>Campaign Summary</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center"><p className="text-slate-500 text-[10px] mb-0.5">Keyword</p><p className="text-white text-xs font-semibold truncate">{campKeyword}</p></div>
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center"><p className="text-slate-500 text-[10px] mb-0.5">Goal</p><p className="text-white text-xs font-semibold">{campGoal}</p></div>
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center"><p className="text-slate-500 text-[10px] mb-0.5">Creatives</p><p className="text-white text-xs font-semibold">{campCount} × {campSizes.length} sizes</p></div>
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center"><p className="text-slate-500 text-[10px] mb-0.5">Style</p><p className="text-white text-xs font-semibold capitalize">{campStyle}</p></div>
                                    {campFeatures.length>0&&<div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center"><p className="text-orange-400/60 text-[10px] mb-0.5">Features</p><p className="text-orange-200 text-xs font-semibold">{campFeatures.length} USPs</p></div>}
                                    {(campPrice||campProducts.some(p=>p.price?.amount))&&<div className="p-3 rounded-xl bg-green-500/5 border border-green-500/10 text-center"><p className="text-green-400/60 text-[10px] mb-0.5">Price{campProducts.length>1?' Range':''}</p><p className="text-green-200 text-xs font-semibold">{campProducts.length>1&&campProducts.some(p=>p.price?.amount)?(()=>{const prices=campProducts.filter(p=>p.price?.amount).map(p=>p.price.amount);const min=Math.min(...prices);const max=Math.max(...prices);return min===max?`₹${min.toLocaleString('en-IN')}`:`₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`})():campPrice}</p></div>}
                                </div>
                            </div>
                            {/* Generate */}
                            {campResults.length===0&&(
                                <button disabled={campGenerating} onClick={async()=>{
                                    setCampGenerating(true);setCampError('');setCampResults([]);setCampProgress(0);setAiWarnings([]);
                                    try{
                                        const results=[];
                                        const total=campCount*(campSizes.length||1);
                                        const angles=['Hero product shot — front-facing, centered, dramatic lighting, product as the star','Flat lay / top-down arrangement — product with lifestyle props, styled composition','Lifestyle context — product in-use by a person or in a real environment','Close-up detail — macro focus on product texture, craftsmanship, premium details','Dramatic side angle — dynamic 45° perspective with depth of field','Contextual scene — product placed in its natural habitat or aspirational setting','Overhead bird\'s-eye — clean arrangement with negative space, editorial feel','Artistic detail — selective focus on unique feature or design element','Environmental wide — product small in a beautiful, branded scene','Dynamic action — product in motion or being interacted with, energy and movement'];
                                        for(let i=0;i<campCount;i++){
                                            for(const size of (campSizes.length?campSizes:['4:5'])){
                                                const copy=campCopies[i]||{headline:campName||campKeyword,body:'',cta:campCta};
                                                // Per-product data: get the product for this creative
                                                const prodData=campProductStrategy==='same'?campProducts[0]:campProducts[i%campProducts.length];
                                                const productImg=prodData?.image||null;
                                                const prodFeatures=prodData?.features||[];
                                                const prodPrice=prodData?.price?.amount?`₹${prodData.price.amount.toLocaleString('en-IN')}`:campPrice;
                                                const angle=angles[i%angles.length];
                                                // Feature assignment: per-product features first, then campFeatures fallback
                                                const featurePool=prodFeatures.length>0?prodFeatures:campFeatures;
                                                const assignedFeature=featurePool.length>0?featurePool[i%featurePool.length]:null;
                                                let prompt=`CAMPAIGN CREATIVE #${i+1} for ${activeBrand?.name||'Brand'}${activeBrand?.dna?.industry ? ` (${activeBrand.dna.industry})` : ''}.${prodData?.title?` Product: ${prodData.title}.`:''}

CREATIVE THEME/MOOD: "${campKeyword}" — This is the CREATIVE DIRECTION for the visual. Do NOT put the word "${campKeyword}" as text on the image. Instead, visually EMBODY this theme:
- If "${campKeyword}" is a SEASON (summer, winter, monsoon): Use season-appropriate colors, lighting, props, and atmosphere. Summer = warm golden tones, sunshine, outdoor vibes, bright energy. Winter = cool tones, cozy textures, warm indoor lighting.
- If "${campKeyword}" is a TREND (fitness, wellness, eco): Use lifestyle imagery, aspirational settings, and emotionally resonant compositions that evoke the trend.
- If "${campKeyword}" is a FESTIVAL (diwali, christmas, eid): Use festive colors, cultural motifs, celebration imagery, and joyful composition.
- If "${campKeyword}" is a CONCEPT (luxury, innovation, trust): Use visual metaphors, premium aesthetics, and design elements that communicate the concept.
${copy.theme_direction ? `VISUAL DIRECTION FROM COPY: ${copy.theme_direction}\n` : ''}
BRAND CONTEXT:
- Brand: ${activeBrand?.name || 'Brand'}${activeBrand?.dna?.industry ? `, ${activeBrand.dna.industry}` : ''}
${activeBrand?.dna?.tagline ? `- Tagline: "${activeBrand.dna.tagline}"\n` : ''}${activeBrand?.dna?.voice?.personality ? `- Brand Personality: ${activeBrand.dna.voice.personality}\n` : ''}${activeBrand?.dna?.targetAudience ? `- Target Audience: ${activeBrand.dna.targetAudience}\n` : ''}${activeBrand?.dna?.colors?.primary || activeBrand?.dna?.colors?.secondary ? `- Brand Colors: Blend ${[activeBrand?.dna?.colors?.primary, activeBrand?.dna?.colors?.secondary, activeBrand?.dna?.colors?.accent].filter(Boolean).join(', ')} with the theme's mood palette\n` : ''}
TEXT OVERLAY (keep clean and minimal):
- Campaign Name: "${campName||campKeyword}" — display as elegant typography, NOT the largest element
- Headline: ${copy.headline}
- Body: ${copy.body}
${assignedFeature?`- Feature Highlight: "${assignedFeature}" — visually emphasize this through composition, callouts, or iconography\n`:''}${prodPrice?`- Price: ${prodPrice}\n`:''}CTA: ${copy.cta}

CAMPAIGN GOAL: ${campGoal}
DESIGN STYLE: ${campStyle}

PHOTOGRAPHY DIRECTION: ${angle}
SCENE/SETTING: ${campScene==='auto'?`AI decides the best scene that EMBODIES the "${campKeyword}" theme for maximum emotional impact`:campScene==='studio'?'Clean professional studio with neutral/gradient backdrop, controlled lighting':campScene==='outdoor'?'Natural outdoor setting — golden hour, lush greenery, or dramatic sky':campScene==='indoor'?'Styled interior — modern, cozy, or luxurious room setting':campScene==='podium'?'Product displayed on a sleek pedestal/podium with dramatic lighting':campScene==='hands'?'Product being held in elegant hands, human touch, clean background':campScene==='model'?'Attractive person using/wearing the product in a natural, aspirational way':campScene==='flatlay'?'Top-down flat lay arrangement with curated props and styling':campScene==='lifestyle'?'Product in real-life use context — home, office, on-the-go':campScene==='urban'?'Urban street/city background with modern architecture':campScene==='nature'?'Natural landscape — beach, mountains, forest, water':'Minimalist clean backdrop with ample negative space'}
${productImg?'Feature the provided product image as the hero element, shot from this specific angle/composition direction.\n':''}${campCampaignLogo&&campLogoPlacement!=='none'?`Campaign logo at ${campLogoPlacement} position.\n`:''}${campStyleRef?'Match the visual mood and design language of the provided style reference.\n':''}
DESIGN RULES:
- The VISUAL THEME inspired by "${campKeyword}" should dominate the creative's mood, color palette, and atmosphere
- Product/subject is the visual hero, with theme elements enhancing the composition
- Professional advertising creative — scroll-stopping, magazine-quality, emotionally resonant
- ${campStyle} design aesthetic with premium typography
- Visual hierarchy: Theme Mood → Product/Subject → Supporting Copy → CTA
- DO NOT literally write the word "${campKeyword}" as decorative text — let the visuals COMMUNICATE the theme
${prodPrice?`- PRICE CALLOUT: Display "${prodPrice}" as a stylish badge or callout that matches the theme\n`:''}- Aspect ratio: ${size}`;                                                const opts={aspectRatio:size,style:campStyle};
                                                if(productImg&&productImg.startsWith('data:'))opts.baseImage=productImg;
                                                else if(productImg)opts.productImageUrl=productImg;
                                                if(campStyleRef)opts.referenceImages={style:campStyleRef};
                                                // Logo overlay — use server-side overlay (addLogo flag), NOT referenceImages.logo
                                                if(campCampaignLogo&&campLogoPlacement!=='none'){
                                                    opts.addLogo=true;
                                                    opts.logoPosition=campLogoPlacement;
                                                }
                                                const payload={prompt,brandId:activeBrand?._id,type:'campaign',options:{...opts,imageModel}};
                                                // Retry up to 2 times per creative
                                                let res=null;
                                                for(let attempt=0;attempt<2;attempt++){
                                                    try{
                                                        res=await creativesAPI.generate(payload, { timeout: 180000 });
                                                        if (res.warnings?.length > 0) {
                                                            setAiWarnings(prev => [...new Set([...prev, ...res.warnings])]);
                                                        }
                                                        break; // success
                                                    }catch(retryErr){
                                                        if(attempt===0){console.warn(`⚠️ Creative #${i+1} attempt 1 failed, retrying...`,retryErr.message);await new Promise(r=>setTimeout(r,1500))}
                                                        else{
                                                            console.error(`❌ Creative #${i+1} failed after 2 attempts:`,retryErr.message);
                                                            if (retryErr.name === 'AbortError' || retryErr.message?.toLowerCase().includes('timeout') || retryErr.message?.toLowerCase().includes('failed to fetch') || retryErr.status === 504) {
                                                                setCampError({
                                                                    message: 'Generation is taking longer than usual. Your images are likely still processing — please check the Image Bank in a minute.',
                                                                    isProviderError: true,
                                                                    provider: 'Mantram AI'
                                                                });
                                                            }
                                                            res=null;
                                                        }
                                                    }
                                                }
                                                if(res){
                                                    const url=res.creative?.imageUrl||res.imageUrl;
                                                    if(url)results.push({url,copy,size,index:i,angle:angle.split('—')[0].trim(),feature:assignedFeature,product:prodData?.title||null,price:prodPrice||null});
                                                }
                                                setCampProgress(results.length/total*100);
                                            }
                                        }
                                        setCampResults(results);
                                    }catch(err){
                                        console.error('❌ Campaign generation error:', err);
                                        if (err.name === 'AbortError' || err.message?.toLowerCase().includes('timeout') || err.message?.toLowerCase().includes('failed to fetch') || err.status === 504) {
                                            setCampError({
                                                message: 'Generation is taking longer than usual. Your images are likely still processing — please check the Image Bank in a minute.',
                                                isProviderError: false
                                            });
                                        } else {
                                            setCampError({
                                                message: err.message,
                                                isProviderError: err.isProviderError,
                                                provider: err.provider
                                            });
                                        }
                                    }
                                    finally{setCampGenerating(false)}
                                }} className="w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 hover:from-blue-400 hover:via-indigo-400 hover:to-violet-400 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                    {campGenerating?(<><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>Generating... {Math.round(campProgress)}%</>):(<><span className="material-symbols-outlined text-lg">rocket_launch</span>Generate All {campCount * campSizes.length} Creatives<span className="text-xs opacity-60 ml-1">~₹{(campCount*campSizes.length*0.25).toFixed(2)}</span></>)}
                                </button>
                            )}
                            {campGenerating&&<div className="w-full bg-white/[0.06] rounded-full h-2 mt-4"><div className="bg-gradient-to-r from-blue-500 to-violet-500 h-2 rounded-full transition-all" style={{width:`${campProgress}%`}}/></div>}

                            {aiWarnings.length > 0 && (
                                <div className="space-y-2 mt-4">
                                    {aiWarnings.map((warn, i) => (
                                        <div key={i} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] flex items-center gap-2 animate-fade-in font-medium">
                                            <span className="material-symbols-outlined text-sm">warning</span>
                                            <span>{warn}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {campError && (
                                <div className={`mt-4 p-3 rounded-xl border flex items-center gap-2 ${campError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                    <span className="material-symbols-outlined text-sm">{campError.isProviderError ? 'warning' : 'error'}</span>
                                    <div className="flex-1 text-xs">
                                        <span className="font-bold mr-1">{campError.isProviderError ? `${campError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                        {campError.message}
                                    </div>
                                </div>
                            )}
                            {/* Results Grid */}
                            {campResults.length>0&&(
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-bold text-white text-sm flex items-center gap-2"><span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>{campResults.length} Creatives Generated</h3>
                                        <div className="flex gap-2">
                                            <button onClick={()=>{
                                                // Compose campaign caption with all copy variations
                                                const allUrls=campResults.map(r=>r.url).filter(Boolean);
                                                const copies=campResults.map(r=>r.copy?.body).filter(Boolean);
                                                const headlines=campResults.map(r=>r.copy?.headline).filter(Boolean);
                                                const heroLine=campCampaignName||campKeyword||'Campaign';
                                                const uniqueHeadlines=[...new Set(headlines)].slice(0,3).join(' | ');
                                                const bestCopy=copies[0]||'';
                                                const caption=`${heroLine}\n\n${uniqueHeadlines?uniqueHeadlines+'\n\n':''}${bestCopy}${campCTA?'\n\n'+campCTA:''}\n\n#${heroLine.replace(/\s+/g,'')} #Campaign #${campKeyword?.replace(/\s+/g,'')||'trending'}`;
                                                setPublishData({images:allUrls,text:caption});
                                            }} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500/20 to-violet-500/20 border border-blue-500/30 text-blue-200 text-xs font-bold hover:from-blue-500/30 hover:to-violet-500/30 transition-all cursor-pointer flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">view_carousel</span>Publish as Carousel</button>
                                            <button onClick={()=>{setCampResults([]);setCampStep(2)}} className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-white text-xs font-medium hover:bg-white/[0.1] transition-all cursor-pointer">Regenerate All</button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {campResults.map((r,i)=>(
                                            <div key={i} className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] group">
                                                <div className="relative"><img src={r.url} alt={`Creative ${i+1}`} className="w-full h-auto object-contain" />
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                        <a href={r.url} download={`campaign-${i+1}.png`} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-lg bg-white/20 text-white text-[10px] font-medium backdrop-blur-sm hover:bg-white/30 transition-all cursor-pointer"><span className="material-symbols-outlined text-xs align-middle">download</span></a>
                                                        <button onClick={()=>{setDesignBaseImage(r.url);setPrompt(r.copy?.headline||campName||campKeyword||'Edit this creative');setStudioMode('create');setShowQuickStart(false)}} className="px-2 py-1 rounded-lg bg-amber-500/30 text-amber-200 text-[10px] font-medium backdrop-blur-sm hover:bg-amber-500/50 transition-all cursor-pointer"><span className="material-symbols-outlined text-xs align-middle">edit</span></button>
                                                        <button onClick={()=>setPublishData({image:r.url,text:r.copy?.body||''})} className="px-2 py-1 rounded-lg bg-blue-500/30 text-blue-200 text-[10px] font-medium backdrop-blur-sm hover:bg-blue-500/50 transition-all cursor-pointer"><span className="material-symbols-outlined text-xs align-middle">share</span></button>
                                                    </div>
                                                </div>
                                                <div className="p-2"><p className="text-white text-[10px] font-semibold truncate">{r.copy?.headline||''}</p><div className="flex flex-wrap gap-1 mt-0.5">{r.product&&<span className="inline-block text-[8px] text-cyan-300 bg-cyan-500/15 px-1.5 py-0.5 rounded">📦 {r.product}</span>}{r.feature&&<span className="inline-block text-[8px] text-orange-300 bg-orange-500/15 px-1.5 py-0.5 rounded">⭐ {r.feature}</span>}{r.price&&<span className="inline-block text-[8px] text-green-300 bg-green-500/15 px-1.5 py-0.5 rounded">💰 {r.price}</span>}</div><p className="text-slate-500 text-[9px]">{r.size}</p></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <button onClick={()=>setCampStep(2)} className="py-2.5 px-6 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center gap-2 transition-all cursor-pointer"><span className="material-symbols-outlined text-lg">arrow_back</span>Back to Copy & Style</button>
                        </div>
                    )}

                    {/* ══ Best Performing Library Modal ══ */}
                    {bplOpen&&(
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={()=>setBplOpen(false)}>
                            <div className="bg-[#0f0f23] rounded-2xl border border-white/[0.08] w-full max-w-3xl max-h-[70vh] overflow-hidden" onClick={e=>e.stopPropagation()}>
                                <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                                    <h3 className="font-bold text-white text-base flex items-center gap-2"><span className="material-symbols-outlined text-yellow-400">emoji_events</span>Best Performing Creatives</h3>
                                    <button onClick={()=>setBplOpen(false)} className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white hover:bg-white/[0.1] transition-all cursor-pointer"><span className="material-symbols-outlined text-lg">close</span></button>
                                </div>
                                <div className="p-5 overflow-y-auto max-h-[55vh]">
                                    {bplLoading?<div className="text-center py-8 text-slate-500"><span className="material-symbols-outlined animate-spin text-2xl align-middle mr-2">progress_activity</span>Loading creatives...</div>:
                                    bplCreatives.length>0?(
                                        <div className="grid grid-cols-3 gap-3">
                                            {bplCreatives.map((c,i)=>(
                                                <button key={i} onClick={()=>{if(bplMode==='logo')setCampCampaignLogo(c.imageUrl);else setCampStyleRef(c.imageUrl);setBplOpen(false)}} className="rounded-xl overflow-hidden border border-white/[0.06] hover:border-yellow-400/30 transition-all cursor-pointer group">
                                                    <img src={c.imageUrl} alt={c.title||`Creative ${i+1}`} className="w-full h-32 object-cover" />
                                                    <div className="p-2 bg-white/[0.03]"><p className="text-white text-[10px] font-medium truncate">{c.title||c.type||'Creative'}</p><p className="text-emerald-400 text-[9px]">Click to use as style</p></div>
                                                </button>
                                            ))}
                                        </div>
                                    ):<p className="text-center text-slate-500 text-sm py-8">No creatives found. Generate some first!</p>}
                                </div>
                            </div>
                        </div>
                    )}
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
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-4">
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
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                                                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
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
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                                    <div className={`p-3 rounded-xl border flex items-center gap-2 mb-4 ${templateError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                        <span className="material-symbols-outlined text-sm">{templateError.isProviderError ? 'warning' : 'error'}</span>
                                        <div className="text-xs">
                                            <span className="font-bold mr-1">{templateError.isProviderError ? `${templateError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                            {templateError.message}
                                        </div>
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
                                <GlobalLoader 
                                    isActive={templateGenerating} 
                                    title={`Creating Your ${activeTemplate.label}`}
                                    currentStage={`AI is designing with ${activeBrand.name}'s brand identity...`}
                                    icon={activeTemplate.icon}
                                    estimatedDuration={25}
                                />

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
                                                navigate('/ai-canvas')
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
                        function handleRefillCreative(img) {
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
                                // Set image as template base for inpainting when re-generating
                                if (img.imageUrl) setDesignBaseImage(img.imageUrl);
                                setStudioMode('create');
                                setShowQuickStart(false);
                            }
                        }
                        async function handleDownloadImage(url, title) {
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
                        }
                        function handleCopyImagePrompt(text, id) {
                            if (!text) return;
                            navigator.clipboard.writeText(text).then(() => {
                                setBankCopiedId(id);
                                setTimeout(() => setBankCopiedId(null), 2000);
                            });
                        }

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
                                                    navigate('/ai-canvas')
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
                                                    <button onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('canvasEditorImage', img.imageUrl); navigate('/ai-canvas') }}
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
                                    <div className="mt-4 w-full max-w-2xl px-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                            <div>
                                                <p className="text-white font-bold text-sm">{img.title || 'AI Generated Image'}</p>
                                                <p className="text-slate-400 text-[11px]">
                                                    {img.type === 'ai-photoshoot' ? '📸 AI Photoshoot' : '🎨 Design Studio'} •{' '}
                                                    {new Date(img.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </p>
                                            </div>
                                            {img.prompt && (
                                                <p className="text-slate-500 text-xs sm:max-w-xs sm:text-right italic line-clamp-2" title={img.prompt}>"{img.prompt}"</p>
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
                                                navigate('/ai-canvas')
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

            {/* ═══ ZOOM LIGHTBOX (for generated result — global, all tabs) ═══ */}
            {zoomImage && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center animate-fade-in"
                    onClick={() => setZoomImage(null)}>
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
                    <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <img src={zoomImage} alt="Zoomed" className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl object-contain" />
                        <div className="absolute top-3 right-3 flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(zoomImage, 'mantram-creative.png') }}
                                className="p-2 rounded-full bg-black/60 text-white hover:bg-white/20 backdrop-blur-sm cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-lg">download</span>
                            </button>
                            <button onClick={(e) => {
                                e.stopPropagation()
                                if (navigator.share) {
                                    fetch(zoomImage).then(r => r.blob()).then(blob => {
                                        const file = new File([blob], 'creative.png', { type: blob.type })
                                        navigator.share({ title: 'Mantram Creative', files: [file] }).catch(() => {})
                                    }).catch(() => { window.open(zoomImage, '_blank') })
                                } else {
                                    navigator.clipboard.writeText(zoomImage).then(() => {
                                        setFeedbackToast('Link copied!')
                                        setTimeout(() => setFeedbackToast(''), 2000)
                                    })
                                }
                            }}
                                className="p-2 rounded-full bg-black/60 text-white hover:bg-white/20 backdrop-blur-sm cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-lg">share</span>
                            </button>
                            <button onClick={() => setZoomImage(null)}
                                className="p-2 rounded-full bg-black/60 text-white hover:bg-white/20 backdrop-blur-sm cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ ANIMATE MODAL ═══ */}
            {animateModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in"
                    onClick={() => { if (!animateGenerating) setAnimateModalOpen(false) }}>
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
                    <div className="relative w-full max-w-lg mx-4 bg-[#12121f] rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden animate-scale-in"
                        onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-purple-400">animation</span>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white">Animate Image</h3>
                                    <p className="text-[11px] text-slate-500">Turn your still image into video</p>
                                </div>
                            </div>
                            <button onClick={() => { if (!animateGenerating) setAnimateModalOpen(false) }}
                                className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">

                            {/* Preview */}
                            {result?.imageUrl && (
                                <div className="rounded-xl overflow-hidden border border-white/[0.06] mb-3">
                                    <img src={result.imageUrl} alt="Source" className="w-full h-32 object-cover" />
                                </div>
                            )}

                            {/* Prompt */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-1.5 block">Animation Prompt</label>
                                {animateAnalyzing ? (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                                        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} />
                                        <span className="text-xs text-purple-400">AI analyzing image for motion...</span>
                                    </div>
                                ) : (
                                    <textarea value={animatePrompt} onChange={e => setAnimatePrompt(e.target.value)}
                                        placeholder="Describe the motion you want..."
                                        className="input-glass w-full py-2.5 text-sm resize-none" rows={3} />
                                )}
                            </div>

                            {/* Model Selector */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 mb-1.5 block">Model</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(ANIMATE_MODELS).map(([id, m]) => (
                                        <button key={id} onClick={() => setAnimateModel(id)}
                                            className={`p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer border ${
                                                animateModel === id
                                                    ? 'bg-purple-500/15 border-purple-500/30 text-white'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:border-white/[0.12]'
                                            }`}>
                                            <span className="text-sm mr-1">{m.icon}</span>
                                            <span className="font-bold">{m.name}</span>
                                            <p className="text-[10px] text-slate-500 mt-0.5">{m.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Duration + Aspect Ratio */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-1.5 block">Duration (sec)</label>
                                    <input type="number" value={animateDuration}
                                        onChange={e => setAnimateDuration(Math.max(ANIMATE_MODELS[animateModel]?.dur?.[0] || 1, Math.min(ANIMATE_MODELS[animateModel]?.dur?.[1] || 15, Number(e.target.value))))}
                                        className="input-glass w-full py-2 text-sm text-center"
                                        min={ANIMATE_MODELS[animateModel]?.dur?.[0] || 1}
                                        max={ANIMATE_MODELS[animateModel]?.dur?.[1] || 15} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 mb-1.5 block">Aspect Ratio</label>
                                    <select value={animateAspectRatio} onChange={e => setAnimateAspectRatio(e.target.value)}
                                        className="input-glass w-full py-2 text-sm">
                                        {(ANIMATE_MODELS[animateModel]?.ratios || ['1:1', '16:9', '9:16']).map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Error */}
                            {animateError && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${animateError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                    <span className="material-symbols-outlined text-sm">{animateError.isProviderError ? 'warning' : 'error'}</span>
                                    <div className="flex-1 text-xs">
                                        <span className="font-bold mr-1">{animateError.isProviderError ? `${animateError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                        {animateError.message}
                                    </div>
                                </div>
                            )}

                            {/* Progress */}
                            {animateGenerating && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-purple-400 font-bold">Generating animation...</span>
                                        <span className="text-slate-500">{animateProgress}%</span>
                                    </div>
                                    <div className="progress-bar">
                                        <div className="progress-bar-fill" style={{ width: `${animateProgress}%`, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
                                    </div>
                                </div>
                            )}

                            {/* Result Video */}
                            {animateVideoUrl && (
                                <div className="rounded-xl overflow-hidden border border-emerald-500/20 bg-emerald-500/5">
                                    <video src={animateVideoUrl} controls autoPlay loop muted playsInline
                                        className="w-full rounded-xl" />
                                    <div className="p-3 flex gap-2">
                                        <a href={animateVideoUrl} download="animated-creative.mp4"
                                            className="flex-1 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-bold text-center hover:bg-emerald-500/25 transition-colors">
                                            <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>download</span>
                                            Download Video
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {!animateVideoUrl && (
                            <div className="p-5 border-t border-white/[0.06]">
                                <button onClick={handleAnimateGenerate}
                                    disabled={animateGenerating || animateAnalyzing || !animatePrompt.trim()}
                                    className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                                        animateGenerating || animateAnalyzing || !animatePrompt.trim()
                                            ? 'bg-white/[0.06] text-slate-600 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-purple-500 to-violet-500 text-white hover:from-purple-400 hover:to-violet-400 shadow-lg shadow-purple-500/20'
                                    }`}>
                                    {animateGenerating ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin 0.8s linear infinite' }} /> Generating...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-lg">play_arrow</span> Generate Animation</>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* ── Media Picker Modal ── */}
            {refPickerSlot && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
                    onClick={() => setRefPickerSlot(null)}>
                    <div className="bg-[#1a1a2e] rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col md:flex-row"
                        style={{ width: '720px', maxWidth: '92vw', height: '520px', maxHeight: '85vh' }}
                        onClick={e => e.stopPropagation()}>

                        {/* ── Left Sidebar ── */}
                        <div className="w-full md:w-[200px] flex-shrink-0 bg-[#12121f] border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-col">
                            {/* Header */}
                            <div className="p-4 pb-3">
                                <h3 className="text-sm font-extrabold text-white capitalize flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">image_search</span>
                                    {refPickerSlot?.startsWith('character-') ? 'Add Character' : refPickerSlot === 'style' ? 'Style Reference' : 'Reference Image'}
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-1 hidden md:block">
                                    {refPickerSlot?.startsWith('character-') ? 'Pick a person, mascot, or character to include in your design' : refPickerSlot === 'style' ? 'Pick an image to match its visual style' : 'Pick an image for context'}
                                </p>
                            </div>

                            {/* Source tabs — vertical on md+, horizontal on mobile */}
                            <div className="flex flex-row md:flex-col gap-1 px-3 pb-2 md:pb-0 overflow-x-auto md:overflow-x-visible scrollbar-hide">
                                {[
                                    { id: 'upload', icon: 'cloud_upload', label: 'Upload', subtitle: 'From device' },
                                    { id: 'bank', icon: 'photo_library', label: 'Library', subtitle: `${bankImages.length} images` },
                                    { id: 'brand', icon: 'domain', label: 'Brand Assets', subtitle: `${brandImages.length} images` },
                                ].map(t => (
                                    <button key={t.id} onClick={() => setRefPickerTab(t.id)}
                                        className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer
                                            ${refPickerTab === t.id
                                                ? 'bg-primary/15 text-white border border-primary/30'
                                                : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'}`}>
                                        <span className={`material-symbols-outlined text-base ${refPickerTab === t.id ? 'text-primary' : ''}`}>{t.icon}</span>
                                        <div>
                                            <p className="text-xs font-bold">{t.label}</p>
                                            <p className="text-[9px] text-slate-500 hidden md:block">{t.subtitle}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Upload panel always visible at bottom on desktop */}
                            <div className="mt-auto p-3 hidden md:block">
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

            {/* ====================== VIRTUAL TRY-ON MODE ====================== */}
            {studioMode === 'tryon' && (
                <div className="max-w-5xl mx-auto fade-up">
                    {/* Hero Header */}
                    <div className="glow-border rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(236,72,153,0.06), rgba(139,92,246,0.04), rgba(6,182,212,0.03))' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(236,72,153,0.08) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(139,92,246,0.06) 0%, transparent 50%)' }} />
                        <div className="relative">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-1">
                                <span className="material-symbols-outlined text-2xl text-pink-400">checkroom</span>
                                Virtual Try-On
                                <span className="text-xs font-medium bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">AI Powered</span>
                            </h2>
                            <p className="text-sm text-slate-400">Upload a person photo + clothing item — see them wearing it instantly</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left — Upload Zone */}
                        <div className="col-span-12 lg:col-span-5 space-y-4">
                            {/* Person Photo Upload */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-pink-400 text-lg">person</span>
                                    Person Photo
                                </h3>
                                {!vtoPersonImage ? (
                                    <label className="flex flex-col items-center justify-center h-40 rounded-xl border-2 border-dashed border-white/10 hover:border-pink-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                        <span className="material-symbols-outlined text-3xl text-slate-600 group-hover:text-pink-400 transition-colors mb-2">add_a_photo</span>
                                        <span className="text-sm text-slate-500 group-hover:text-slate-300">Upload person photo</span>
                                        <span className="text-xs text-slate-600 mt-1">Full body or half body</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const reader = new FileReader()
                                                reader.onload = (ev) => setVtoPersonImage(ev.target.result)
                                                reader.readAsDataURL(file)
                                            }
                                        }} />
                                    </label>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden group">
                                        <img src={vtoPersonImage} alt="Person" className="w-full h-40 object-cover rounded-xl" />
                                        <button onClick={() => { setVtoPersonImage(null); setVtoPreviewResult(null); setVtoHdResult(null) }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Garment Upload */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-violet-400 text-lg">checkroom</span>
                                    Clothing / Garment
                                </h3>
                                {!vtoGarmentImage ? (
                                    <label className="flex flex-col items-center justify-center h-40 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                        <span className="material-symbols-outlined text-3xl text-slate-600 group-hover:text-violet-400 transition-colors mb-2">upload</span>
                                        <span className="text-sm text-slate-500 group-hover:text-slate-300">Upload clothing item</span>
                                        <span className="text-xs text-slate-600 mt-1">T-shirt, dress, jacket, etc.</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const reader = new FileReader()
                                                reader.onload = (ev) => setVtoGarmentImage(ev.target.result)
                                                reader.readAsDataURL(file)
                                            }
                                        }} />
                                    </label>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden group">
                                        <img src={vtoGarmentImage} alt="Garment" className="w-full h-40 object-cover rounded-xl" />
                                        <button onClick={() => { setVtoGarmentImage(null); setVtoPreviewResult(null); setVtoHdResult(null) }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Sample Models — Quick Start */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">face</span>
                                    Quick Start — Sample Models
                                </h3>
                                <p className="text-xs text-slate-500 mb-3">Click to auto-generate a model photo (no upload needed)</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: 'Woman — Indian', desc: 'Young Indian woman, medium skin tone, full body front pose, plain white background, professional model photo, natural lighting, 5\'6" average build', icon: 'person', gender: 'female' },
                                        { label: 'Man — Indian', desc: 'Young Indian man, medium skin tone, full body front pose, plain white background, professional model photo, natural lighting, 5\'10" athletic build', icon: 'person', gender: 'male' },
                                        { label: 'Woman — Western', desc: 'Young Caucasian woman, fair skin, full body front pose, plain white background, professional model photo, natural lighting, 5\'7" slim build', icon: 'person', gender: 'female' },
                                        { label: 'Man — Western', desc: 'Young Caucasian man, fair skin, full body front pose, plain white background, professional model photo, natural lighting, 6\'0" athletic build', icon: 'person', gender: 'male' },
                                        { label: 'Woman — East Asian', desc: 'Young East Asian woman, light skin tone, full body front pose, plain white background, professional model photo, natural lighting, 5\'5" slim build', icon: 'person', gender: 'female' },
                                        { label: 'Man — Dark Skin', desc: 'Young African man, dark skin tone, full body front pose, plain white background, professional model photo, natural lighting, 6\'1" athletic build', icon: 'person', gender: 'male' },
                                        { label: 'Woman — Curvy', desc: 'Young woman, plus-size curvy body, full body front pose, plain white background, professional model photo, natural lighting, 5\'5" curvy build, wearing simple neutral tank top and jeans', icon: 'person', gender: 'female' },
                                        { label: 'Teen — Unisex', desc: 'Teenager 16-18 years old, androgynous look, full body front pose, plain white background, professional model photo, natural lighting, 5\'6" slim build', icon: 'person', gender: 'neutral' },
                                    ].map(m => (
                                        <button key={m.label}
                                            disabled={vtoLoading}
                                            onClick={async () => {
                                                setVtoLoading(true); setVtoError('')
                                                try {
                                                    const res = await creativesAPI.lifestyleMockup({
                                                        productImage: null,
                                                        scenePrompt: `Generate ONLY a photo of a person with NO product: ${m.desc}. The person should be wearing simple plain white or grey clothing. Full body visible from head to toe. Studio photo on pure white background. No props, no accessories. This is a reference photo for virtual try-on.`,
                                                        brandId: activeBrand?._id,
                                                        aspectRatio: '3:4'
                                                    })
                                                    if (res.success && res.imageUrl) {
                                                        setVtoPersonImage(res.imageUrl)
                                                    } else {
                                                        setVtoError({
                                                            message: 'Failed to generate model photo',
                                                            isProviderError: false
                                                        });
                                                    }
                                                } catch (err) { 
                                                    setVtoError({
                                                        message: err.message,
                                                        isProviderError: err.isProviderError,
                                                        provider: err.provider
                                                    })
                                                }
                                                finally { setVtoLoading(false) }
                                            }}
                                            className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2
                                                border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-pink-400/30 hover:text-slate-200
                                                disabled:opacity-40 disabled:cursor-not-allowed`}>
                                            <span className="material-symbols-outlined text-base">{m.icon}</span>
                                            <div>
                                                <span className="text-xs font-medium block">{m.label}</span>
                                                <span className="text-[10px] text-slate-600">{m.gender}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="space-y-2.5">
                                <button
                                    disabled={!vtoPersonImage || !vtoGarmentImage || vtoLoading}
                                    onClick={async () => {
                                        setVtoLoading(true); setVtoError(''); setVtoPreviewResult(null); setVtoHdResult(null)
                                        try {
                                            const res = await creativesAPI.virtualTryon({
                                                personImage: vtoPersonImage,
                                                garmentImage: vtoGarmentImage,
                                                brandId: activeBrand?._id,
                                                mode: 'preview'
                                            })
                                            if (res.success && res.imageUrl) setVtoPreviewResult(res.imageUrl)
                                            else setVtoError({
                                                message: res.error || 'Preview generation failed',
                                                isProviderError: res.isProviderError,
                                                provider: res.provider
                                            });
                                        } catch (err) {
                                            setVtoError({
                                                message: err.message,
                                                isProviderError: err.isProviderError,
                                                provider: err.provider
                                            });
                                        }
                                        finally { setVtoLoading(false) }
                                    }}
                                    className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                        bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-400 hover:to-violet-400 text-white
                                        disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                    {vtoLoading ? (
                                        <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> Generating Preview...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-lg">auto_awesome</span> Generate Preview<span className="text-xs opacity-60 ml-1">~₹0.25</span></>
                                    )}
                                </button>

                                {vtoPreviewResult && !vtoHdResult && (
                                    <button
                                        disabled={vtoHdLoading}
                                        onClick={async () => {
                                            setVtoHdLoading(true); setVtoError('')
                                            try {
                                                const res = await creativesAPI.virtualTryon({
                                                    personImage: vtoPersonImage,
                                                    garmentImage: vtoGarmentImage,
                                                    brandId: activeBrand?._id,
                                                    mode: 'hd'
                                                })
                                                if (res.success && res.requestId) {
                                                    // Poll for HD result
                                                    const poll = async () => {
                                                        try {
                                                            const status = await creativesAPI.vtoStatus(res.requestId, activeBrand?._id)
                                                            if (status.status === 'completed' && status.imageUrl) {
                                                                setVtoHdResult(status.imageUrl)
                                                                setVtoHdLoading(false)
                                                            } else if (status.status === 'failed') {
                                                                setVtoError('HD generation failed: ' + (status.error || ''))
                                                                setVtoHdLoading(false)
                                                            } else {
                                                                setTimeout(poll, 4000)
                                                            }
                                                        } catch { setTimeout(poll, 4000) }
                                                    }
                                                    setTimeout(poll, 5000)
                                                } else {
                                                    setVtoError(res.error || 'HD queuing failed')
                                                    setVtoHdLoading(false)
                                                }
                                            } catch (err) { 
                                                setVtoError({
                                                    message: err.message,
                                                    isProviderError: err.isProviderError,
                                                    provider: err.provider
                                                })
                                                setVtoHdLoading(false) 
                                            }
                                        }}
                                        className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                            bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white
                                            disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                        {vtoHdLoading ? (
                                            <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> Rendering HD... ~30s</>
                                        ) : (
                                            <><span className="material-symbols-outlined text-lg">hd</span> Generate HD Version<span className="text-xs opacity-60 ml-1">~₹3.5</span></>
                                        )}
                                    </button>
                                )}
                            </div>

                            {vtoError && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${vtoError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                                    <span className="material-symbols-outlined text-lg">{vtoError.isProviderError ? 'warning' : 'error'}</span>
                                    <div className="flex-1 text-sm">
                                        <span className="font-bold mr-1">{vtoError.isProviderError ? `${vtoError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                        {vtoError.message}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right — Result Preview */}
                        <div className="col-span-12 lg:col-span-7">
                            <div className="studio-card p-5 min-h-[400px] flex flex-col">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-cyan-400 text-lg">image</span>
                                    Try-On Result
                                    {vtoHdResult && <span className="text-xs font-medium bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">HD</span>}
                                    {vtoPreviewResult && !vtoHdResult && <span className="text-xs font-medium bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded-full">Preview</span>}
                                </h3>
                                {(vtoHdResult || vtoPreviewResult) ? (
                                    <div className="flex-1 flex flex-col">
                                        <div className="flex-1 rounded-xl overflow-hidden bg-black/20 mb-3">
                                            <img src={vtoHdResult || vtoPreviewResult} alt="Virtual Try-On Result" className="w-full h-full object-contain max-h-[500px]" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleDownloadImage(vtoHdResult || vtoPreviewResult, "try-on-result.png")}
                                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">download</span>Download
                                            </button>
                                            <button onClick={() => { setVtoPersonImage(null); setVtoGarmentImage(null); setVtoPreviewResult(null); setVtoHdResult(null); setVtoError('') }}
                                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">restart_alt</span>Start Over
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500/10 to-violet-500/10 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-4xl text-pink-400/40">checkroom</span>
                                        </div>
                                        <p className="text-slate-400 text-sm font-medium mb-1">No result yet</p>
                                        <p className="text-slate-600 text-xs">Upload a person photo and clothing item, then generate</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ====================== LIFESTYLE MOCKUPS MODE ====================== */}
            {studioMode === 'mockups' && (
                <div className="max-w-5xl mx-auto fade-up">
                    {/* Hero Header */}
                    <div className="glow-border rounded-2xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.06), rgba(59,130,246,0.04), rgba(139,92,246,0.03))' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(6,182,212,0.08) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(59,130,246,0.06) 0%, transparent 50%)' }} />
                        <div className="relative">
                            <h2 className="text-xl font-bold text-white flex items-center gap-3 mb-2">
                                <span className="material-symbols-outlined text-2xl text-cyan-400">landscape</span>
                                Mockup Studio
                                <span className="text-xs font-medium bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full">AI Powered</span>
                            </h2>
                            <p className="text-sm text-slate-400 mb-4">Generate product lifestyle scenes or place your logo on merchandise</p>
                            {/* Sub-mode Toggle */}
                            <div className="flex gap-2">
                                <button onClick={() => setMockupSubMode('lifestyle')}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                                        mockupSubMode === 'lifestyle'
                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                                            : 'bg-white/[0.04] text-slate-400 border border-white/[0.08] hover:text-slate-200'
                                    }`}>
                                    <span className="material-symbols-outlined text-lg">landscape</span>
                                    Product Lifestyle
                                </button>
                                <button onClick={() => setMockupSubMode('logo')}
                                    className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                                        mockupSubMode === 'logo'
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                            : 'bg-white/[0.04] text-slate-400 border border-white/[0.08] hover:text-slate-200'
                                    }`}>
                                    <span className="material-symbols-outlined text-lg">branding_watermark</span>
                                    Logo / Brand Mockup
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Product Lifestyle Sub-mode ── */}
                    {mockupSubMode === 'lifestyle' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left — Controls */}
                        <div className="col-span-12 lg:col-span-5 space-y-4">
                            {/* Product Upload */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-cyan-400 text-lg">add_a_photo</span>
                                    Product Image
                                </h3>
                                {!mockupProductImage ? (
                                    <label className="flex flex-col items-center justify-center h-40 rounded-xl border-2 border-dashed border-white/10 hover:border-cyan-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                        <span className="material-symbols-outlined text-3xl text-slate-600 group-hover:text-cyan-400 transition-colors mb-2">upload</span>
                                        <span className="text-sm text-slate-500 group-hover:text-slate-300">Upload product photo</span>
                                        <span className="text-xs text-slate-600 mt-1">Any product — cosmetics, electronics, food, etc.</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const reader = new FileReader()
                                                reader.onload = (ev) => setMockupProductImage(ev.target.result)
                                                reader.readAsDataURL(file)
                                            }
                                        }} />
                                    </label>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden group">
                                        <img src={mockupProductImage} alt="Product" className="w-full h-40 object-cover rounded-xl" />
                                        <button onClick={() => { setMockupProductImage(null); setMockupResult(null) }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Reference Scene Template */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-violet-400 text-lg">photo_library</span>
                                    Reference Scene
                                    <span className="text-[10px] font-medium bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full ml-auto">Optional</span>
                                </h3>
                                <p className="text-xs text-slate-500 mb-3 leading-relaxed">Upload a reference scene image — the product will be placed into this exact setting</p>
                                {!mockupTemplateImage ? (
                                    <label className="flex flex-col items-center justify-center h-28 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                        <span className="material-symbols-outlined text-2xl text-slate-600 group-hover:text-violet-400 transition-colors mb-1">add_photo_alternate</span>
                                        <span className="text-xs text-slate-500 group-hover:text-slate-300">Upload scene template</span>
                                        <span className="text-[10px] text-slate-600 mt-0.5">e.g. a lifestyle photo, store shelf, ad layout</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const reader = new FileReader()
                                                reader.onload = (ev) => setMockupTemplateImage(ev.target.result)
                                                reader.readAsDataURL(file)
                                            }
                                        }} />
                                    </label>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden group">
                                        <img src={mockupTemplateImage} alt="Template Scene" className="w-full h-28 object-cover rounded-xl" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all" />
                                        <button onClick={() => { setMockupTemplateImage(null); setMockupResult(null) }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-violet-500/80 text-white text-[10px] font-bold">Template Active</div>
                                    </div>
                                )}
                            </div>

                            {/* Scene Library */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">auto_fix_high</span>
                                    Scene Library
                                    <span className="text-xs text-slate-500 font-normal ml-auto">{(() => {
                                        const allScenes = {
                                            all: [],
                                            cosmetics: [
                                                { label: 'Marble Vanity', prompt: 'Elegant white marble bathroom vanity with soft diffused morning light, rose petals scattered, luxury cosmetics lifestyle', icon: 'spa' },
                                                { label: 'Rose Petals', prompt: 'Scattered pink and white rose petals on a soft silk fabric surface, romantic and luxurious beauty product setting, soft pink lighting', icon: 'local_florist' },
                                                { label: 'Skincare Shelf', prompt: 'Minimalist white bathroom shelf with green plants, soft towels, and natural light streaming through frosted glass window', icon: 'shelves' },
                                                { label: 'Gold Tray', prompt: 'Elegant brushed gold vanity tray on white marble, luxury perfume bottles nearby, warm golden hour light, high-end beauty editorial', icon: 'diamond' },
                                                { label: 'Tropical Spa', prompt: 'Tropical spa setting with fresh coconut shells, frangipani flowers, bamboo mat, warm natural sunlight, serene wellness atmosphere', icon: 'self_improvement' },
                                                { label: 'Dewy Leaves', prompt: 'Fresh green leaves with morning dew drops, natural organic skincare vibe, macro botanical detail, soft diffused daylight', icon: 'water_drop' },
                                                { label: 'Powder Cloud', prompt: 'Cosmetic product floating in a cloud of fine powder or shimmer particles, dark dramatic background, luxury makeup editorial', icon: 'blur_on' },
                                                { label: 'Mirror Reflection', prompt: 'Product reflected in a round vanity mirror on a clean marble counter, warm bathroom lighting, elegant and sophisticated setup', icon: 'looks' },
                                            ],
                                            electronics: [
                                                { label: 'Tech Desk', prompt: 'Clean modern desk setup with LED accent lighting, dark wood surface, minimal tech workspace, professional gadget photography', icon: 'computer' },
                                                { label: 'Neon Glow', prompt: 'Product illuminated by vibrant RGB neon lighting in purple and blue, dark background, futuristic cyberpunk tech vibe, dramatic reflections', icon: 'lightbulb' },
                                                { label: 'Floating Chrome', prompt: 'Product levitating on a sleek chrome surface with soft gradient background, futuristic floating product display, clean reflections', icon: 'rocket_launch' },
                                                { label: 'Dark Minimal', prompt: 'Ultra-minimal dark matte black surface, single dramatic spotlight from above, high-contrast tech product photography', icon: 'dark_mode' },
                                                { label: 'Circuit Board', prompt: 'Product placed on a stylized glowing circuit board pattern, blue and green LED traces, high-tech electronic engineering aesthetic', icon: 'memory' },
                                                { label: 'Smart Home', prompt: 'Modern smart home living room with ambient IoT lighting, sleek furniture, product on a side table, warm futuristic home atmosphere', icon: 'home' },
                                                { label: 'Transparent Glass', prompt: 'Product on a transparent glass shelf with soft under-lighting, clean modern retail display case, premium electronics showroom', icon: 'grid_view' },
                                            ],
                                            food: [
                                                { label: 'Kitchen Counter', prompt: 'Clean white marble kitchen counter with soft natural morning light, fresh herbs and wooden cutting board nearby', icon: 'kitchen' },
                                                { label: 'Rustic Wood', prompt: 'Rustic reclaimed wood table with linen napkin, vintage cutlery, warm farmhouse kitchen vibes, natural daylight', icon: 'table_restaurant' },
                                                { label: 'Breakfast Table', prompt: 'Sunny breakfast table with fresh orange juice, croissants, fresh flowers in a vase, bright morning sunlight streaming in', icon: 'breakfast_dining' },
                                                { label: 'Fresh Ingredients', prompt: 'Product surrounded by fresh ingredients — tomatoes, basil, olive oil, garlic on a wooden cutting board, food photography style', icon: 'restaurant' },
                                                { label: 'Picnic Blanket', prompt: 'Product on a checkered picnic blanket in a sunny park, fresh fruits and cheese nearby, warm outdoor golden hour light', icon: 'park' },
                                                { label: 'Dark Food Moody', prompt: 'Dark moody food photography, product on black slate with dramatic side lighting, scattered spices and herbs, editorial food styling', icon: 'restaurant_menu' },
                                                { label: 'Ice & Frost', prompt: 'Product surrounded by crushed ice and frost crystals on a cold surface, fresh chilled beverage photography, cool blue tones', icon: 'ac_unit' },
                                            ],
                                            fashion: [
                                                { label: 'Fashion Flat Lay', prompt: 'Stylish flat lay arrangement on white marble, sunglasses, watch, wallet nearby, fashion accessories editorial, golden hour light', icon: 'styler' },
                                                { label: 'Street Style', prompt: 'Urban street background with exposed brick wall and graffiti art, trendy street fashion vibe, natural city lighting', icon: 'location_city' },
                                                { label: 'Boutique Display', prompt: 'Luxury fashion boutique display shelf with velvet fabric and warm spotlighting, premium retail environment, elegant arrangement', icon: 'storefront' },
                                                { label: 'Wardrobe Rack', prompt: 'Minimalist clothing rack with curated garments, wooden hangers, soft natural light, Scandinavian style wardrobe', icon: 'checkroom' },
                                                { label: 'Beach Resort', prompt: 'Luxury beach resort lounge with white cabana, turquoise ocean view, straw hat nearby, summer fashion lifestyle vibe', icon: 'beach_access' },
                                                { label: 'Velvet Cushion', prompt: 'Product displayed on a rich dark velvet cushion, dramatic spotlight, luxury jewelry and accessories photography style', icon: 'chair' },
                                            ],
                                            home: [
                                                { label: 'Living Room', prompt: 'Cozy modern living room with soft neutral tones, plush sofa, throw blanket, warm ambient lighting, lifestyle home photography', icon: 'living' },
                                                { label: 'Boho Shelf', prompt: 'Bohemian-style wooden wall shelf with macramé, dried pampas grass, candles, warm earthy tones, natural light', icon: 'shelves' },
                                                { label: 'Scandinavian Desk', prompt: 'Clean Scandinavian home office desk, light oak wood, minimalist accessories, green plant, soft diffused daylight', icon: 'desk' },
                                                { label: 'Cozy Bedroom', prompt: 'Luxurious bedroom with crisp white linen sheets, fluffy pillows, soft morning sunlight through sheer curtains', icon: 'bed' },
                                                { label: 'Garden Table', prompt: 'Outdoor garden table with potted succulents, terracotta pots, fresh herbs, warm afternoon sunlight, natural organic feel', icon: 'yard' },
                                                { label: 'Fireplace Mantel', prompt: 'Product on a rustic stone fireplace mantel with lit candles, cozy winter atmosphere, warm amber lighting', icon: 'fireplace' },
                                            ],
                                            podiums: [
                                                { label: 'White Podium', prompt: 'Product on a clean white cylindrical podium, soft studio lighting, minimal pure white background, premium product display', icon: 'view_in_ar' },
                                                { label: 'Gold Podium', prompt: 'Product displayed on a luxurious brushed gold pedestal, soft warm lighting, dark navy background, premium award-style showcase', icon: 'emoji_events' },
                                                { label: 'Glass Platform', prompt: 'Transparent glass display platform with soft under-glow, floating product effect, clean modern museum-style display', icon: 'crop_square' },
                                                { label: 'Marble Column', prompt: 'Product on a classical white marble column pedestal, dramatic Roman-style architecture in background, luxury brand showcase', icon: 'account_balance' },
                                                { label: 'Floating Steps', prompt: 'Product on geometric floating steps/platforms in different heights, soft gradient background, 3D abstract modern display', icon: 'stairs' },
                                                { label: 'Neon Podium', prompt: 'Product on a dark podium with neon edge lighting in pink and blue, cyberpunk retail display, futuristic product launch', icon: 'blur_linear' },
                                                { label: 'Stone Pedestal', prompt: 'Raw natural stone pedestal with rough texture, surrounded by dried flowers and earthy elements, organic luxury display', icon: 'landscape' },
                                                { label: 'Acrylic Cube', prompt: 'Product on a transparent acrylic cube display, clean gallery lighting, contemporary art exhibition product showcase', icon: 'select_all' },
                                            ],
                                            seasonal: [
                                                { label: 'Christmas', prompt: 'Festive Christmas setting with pine branches, red ornaments, gold baubles, twinkling fairy lights, warm holiday atmosphere', icon: 'celebration' },
                                                { label: 'Diwali', prompt: 'Beautiful Diwali festival setting with lit diyas, marigold garlands, rangoli patterns, warm golden festive lighting', icon: 'local_fire_department' },
                                                { label: 'Valentine\'s', prompt: 'Romantic Valentine\'s setting with red roses, heart-shaped confetti, soft pink silk fabric, warm candlelight ambiance', icon: 'favorite' },
                                                { label: 'Spring Bloom', prompt: 'Fresh spring garden with cherry blossoms in full bloom, soft pastel colors, butterflies, warm spring morning light', icon: 'filter_vintage' },
                                                { label: 'Autumn Harvest', prompt: 'Autumn harvest setting with golden leaves, pumpkins, cinnamon sticks, warm amber tones, cozy fall atmosphere', icon: 'eco' },
                                                { label: 'Summer Splash', prompt: 'Bright summer pool party setting with splashing water, citrus fruits, tropical flowers, vivid blue sky, fun energetic vibe', icon: 'pool' },
                                                { label: 'New Year', prompt: 'Glamorous New Year celebration with champagne glasses, gold confetti, sparklers, midnight blue and gold color scheme', icon: 'nightlife' },
                                                { label: 'Back to School', prompt: 'Neat school desk with colorful stationery, notebooks, pencils, fresh apple, bright cheerful classroom lighting', icon: 'school' },
                                            ],
                                            luxury: [
                                                { label: 'Dark Luxury', prompt: 'Elegant dark wood table with subtle gold accents, luxury lifestyle, soft dramatic lighting, premium feel', icon: 'table_restaurant' },
                                                { label: 'Penthouse View', prompt: 'Luxury penthouse rooftop with city skyline at twilight, floor-to-ceiling windows, modern furniture, golden hour light', icon: 'apartment' },
                                                { label: 'Private Jet', prompt: 'Interior of a luxury private jet cabin, leather seats, champagne glass, window showing clouds, ultimate premium lifestyle', icon: 'flight' },
                                                { label: 'Yacht Deck', prompt: 'Sleek white yacht deck with turquoise sea in background, polished teak wood, luxury maritime lifestyle photography', icon: 'sailing' },
                                                { label: 'Art Gallery', prompt: 'Minimalist white-walled art gallery with dramatic spot lighting, product as centerpiece, contemporary exhibition style', icon: 'museum' },
                                                { label: 'Black Silk', prompt: 'Product draped in flowing black silk fabric, dramatic chiaroscuro lighting, ultra-premium luxury brand editorial', icon: 'looks' },
                                            ],
                                            nature: [
                                                { label: 'Nature & Greenery', prompt: 'Lush green botanical setting with natural leaves and flowers, soft dappled sunlight filtering through, organic fresh feel', icon: 'eco' },
                                                { label: 'Waterfall Rocks', prompt: 'Natural river rocks near a small waterfall, moss-covered stones, fresh flowing water, serene forest atmosphere', icon: 'water' },
                                                { label: 'Desert Sand', prompt: 'Clean desert sand dunes with golden hour sunlight, dramatic shadows, warm earthy minimalist backdrop', icon: 'landscape' },
                                                { label: 'Lavender Field', prompt: 'Product in a stunning lavender field at sunset, purple flowers stretching to horizon, warm golden light, French countryside', icon: 'grass' },
                                                { label: 'Mountain Lake', prompt: 'Serene mountain lake with mirror-like reflection, snow-capped peaks in background, crystal clear water, pristine nature', icon: 'terrain' },
                                                { label: 'Tropical Jungle', prompt: 'Dense tropical jungle with monstera and palm leaves, exotic flowers, humid atmosphere, vibrant green tone photography', icon: 'forest' },
                                            ],
                                            studio: [
                                                { label: 'Studio White', prompt: 'Professional photography studio with seamless white background, soft diffused studio lighting, clean minimal setup', icon: 'photo_camera' },
                                                { label: 'Studio Black', prompt: 'Professional studio with seamless black background, dramatic directional lighting, high-contrast product photography', icon: 'contrast' },
                                                { label: 'Gradient Sweep', prompt: 'Smooth gradient background transitioning from light blue to white, soft even lighting, clean e-commerce product photo style', icon: 'gradient' },
                                                { label: 'Color Pop', prompt: 'Vibrant solid color background (matching the product accent color), flat lay style, bold graphic editorial product photo', icon: 'palette' },
                                                { label: '360° Turntable', prompt: 'Product on a sleek turntable/lazy susan, clean white cyclorama background, even studio lighting, 3D product display feel', icon: '360' },
                                            ],
                                        };
                                        const filtered = mockupSceneCategory === 'all'
                                            ? Object.values(allScenes).flat()
                                            : allScenes[mockupSceneCategory] || [];
                                        return `${filtered.length} scenes`;
                                    })()}</span>
                                </h3>

                                {/* Category Tabs */}
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {[
                                        { id: 'all', label: 'All', icon: 'apps' },
                                        { id: 'cosmetics', label: 'Beauty', icon: 'spa' },
                                        { id: 'electronics', label: 'Tech', icon: 'devices' },
                                        { id: 'food', label: 'Food', icon: 'restaurant' },
                                        { id: 'fashion', label: 'Fashion', icon: 'checkroom' },
                                        { id: 'home', label: 'Home', icon: 'home' },
                                        { id: 'podiums', label: 'Podiums', icon: 'view_in_ar' },
                                        { id: 'seasonal', label: 'Seasonal', icon: 'celebration' },
                                        { id: 'luxury', label: 'Luxury', icon: 'diamond' },
                                        { id: 'nature', label: 'Nature', icon: 'eco' },
                                        { id: 'studio', label: 'Studio', icon: 'photo_camera' },
                                    ].map(cat => (
                                        <button key={cat.id}
                                            onClick={() => setMockupSceneCategory(cat.id)}
                                            className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                                                mockupSceneCategory === cat.id
                                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                                                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.05] hover:text-slate-300 hover:border-white/[0.12]'
                                            }`}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{cat.icon}</span>
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Scene Grid */}
                                <div className="grid grid-cols-2 gap-2 mb-3 max-h-[320px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                                    {(() => {
                                        const allScenes = {
                                            cosmetics: [
                                                { label: 'Marble Vanity', prompt: 'Elegant white marble bathroom vanity with soft diffused morning light, rose petals scattered, luxury cosmetics lifestyle', icon: 'spa' },
                                                { label: 'Rose Petals', prompt: 'Scattered pink and white rose petals on a soft silk fabric surface, romantic and luxurious beauty product setting, soft pink lighting', icon: 'local_florist' },
                                                { label: 'Skincare Shelf', prompt: 'Minimalist white bathroom shelf with green plants, soft towels, and natural light streaming through frosted glass window', icon: 'shelves' },
                                                { label: 'Gold Tray', prompt: 'Elegant brushed gold vanity tray on white marble, luxury perfume bottles nearby, warm golden hour light, high-end beauty editorial', icon: 'diamond' },
                                                { label: 'Tropical Spa', prompt: 'Tropical spa setting with fresh coconut shells, frangipani flowers, bamboo mat, warm natural sunlight, serene wellness atmosphere', icon: 'self_improvement' },
                                                { label: 'Dewy Leaves', prompt: 'Fresh green leaves with morning dew drops, natural organic skincare vibe, macro botanical detail, soft diffused daylight', icon: 'water_drop' },
                                                { label: 'Powder Cloud', prompt: 'Cosmetic product floating in a cloud of fine powder or shimmer particles, dark dramatic background, luxury makeup editorial', icon: 'blur_on' },
                                                { label: 'Mirror Reflection', prompt: 'Product reflected in a round vanity mirror on a clean marble counter, warm bathroom lighting, elegant and sophisticated setup', icon: 'looks' },
                                            ],
                                            electronics: [
                                                { label: 'Tech Desk', prompt: 'Clean modern desk setup with LED accent lighting, dark wood surface, minimal tech workspace, professional gadget photography', icon: 'computer' },
                                                { label: 'Neon Glow', prompt: 'Product illuminated by vibrant RGB neon lighting in purple and blue, dark background, futuristic cyberpunk tech vibe, dramatic reflections', icon: 'lightbulb' },
                                                { label: 'Floating Chrome', prompt: 'Product levitating on a sleek chrome surface with soft gradient background, futuristic floating product display, clean reflections', icon: 'rocket_launch' },
                                                { label: 'Dark Minimal', prompt: 'Ultra-minimal dark matte black surface, single dramatic spotlight from above, high-contrast tech product photography', icon: 'dark_mode' },
                                                { label: 'Circuit Board', prompt: 'Product placed on a stylized glowing circuit board pattern, blue and green LED traces, high-tech electronic engineering aesthetic', icon: 'memory' },
                                                { label: 'Smart Home', prompt: 'Modern smart home living room with ambient IoT lighting, sleek furniture, product on a side table, warm futuristic home atmosphere', icon: 'home' },
                                                { label: 'Transparent Glass', prompt: 'Product on a transparent glass shelf with soft under-lighting, clean modern retail display case, premium electronics showroom', icon: 'grid_view' },
                                            ],
                                            food: [
                                                { label: 'Kitchen Counter', prompt: 'Clean white marble kitchen counter with soft natural morning light, fresh herbs and wooden cutting board nearby', icon: 'kitchen' },
                                                { label: 'Rustic Wood', prompt: 'Rustic reclaimed wood table with linen napkin, vintage cutlery, warm farmhouse kitchen vibes, natural daylight', icon: 'table_restaurant' },
                                                { label: 'Breakfast Table', prompt: 'Sunny breakfast table with fresh orange juice, croissants, fresh flowers in a vase, bright morning sunlight streaming in', icon: 'breakfast_dining' },
                                                { label: 'Fresh Ingredients', prompt: 'Product surrounded by fresh ingredients — tomatoes, basil, olive oil, garlic on a wooden cutting board, food photography style', icon: 'restaurant' },
                                                { label: 'Picnic Blanket', prompt: 'Product on a checkered picnic blanket in a sunny park, fresh fruits and cheese nearby, warm outdoor golden hour light', icon: 'park' },
                                                { label: 'Dark Food Moody', prompt: 'Dark moody food photography, product on black slate with dramatic side lighting, scattered spices and herbs, editorial food styling', icon: 'restaurant_menu' },
                                                { label: 'Ice & Frost', prompt: 'Product surrounded by crushed ice and frost crystals on a cold surface, fresh chilled beverage photography, cool blue tones', icon: 'ac_unit' },
                                            ],
                                            fashion: [
                                                { label: 'Fashion Flat Lay', prompt: 'Stylish flat lay arrangement on white marble, sunglasses, watch, wallet nearby, fashion accessories editorial, golden hour light', icon: 'styler' },
                                                { label: 'Street Style', prompt: 'Urban street background with exposed brick wall and graffiti art, trendy street fashion vibe, natural city lighting', icon: 'location_city' },
                                                { label: 'Boutique Display', prompt: 'Luxury fashion boutique display shelf with velvet fabric and warm spotlighting, premium retail environment, elegant arrangement', icon: 'storefront' },
                                                { label: 'Wardrobe Rack', prompt: 'Minimalist clothing rack with curated garments, wooden hangers, soft natural light, Scandinavian style wardrobe', icon: 'checkroom' },
                                                { label: 'Beach Resort', prompt: 'Luxury beach resort lounge with white cabana, turquoise ocean view, straw hat nearby, summer fashion lifestyle vibe', icon: 'beach_access' },
                                                { label: 'Velvet Cushion', prompt: 'Product displayed on a rich dark velvet cushion, dramatic spotlight, luxury jewelry and accessories photography style', icon: 'chair' },
                                            ],
                                            home: [
                                                { label: 'Living Room', prompt: 'Cozy modern living room with soft neutral tones, plush sofa, throw blanket, warm ambient lighting, lifestyle home photography', icon: 'living' },
                                                { label: 'Boho Shelf', prompt: 'Bohemian-style wooden wall shelf with macramé, dried pampas grass, candles, warm earthy tones, natural light', icon: 'shelves' },
                                                { label: 'Scandinavian Desk', prompt: 'Clean Scandinavian home office desk, light oak wood, minimalist accessories, green plant, soft diffused daylight', icon: 'desk' },
                                                { label: 'Cozy Bedroom', prompt: 'Luxurious bedroom with crisp white linen sheets, fluffy pillows, soft morning sunlight through sheer curtains', icon: 'bed' },
                                                { label: 'Garden Table', prompt: 'Outdoor garden table with potted succulents, terracotta pots, fresh herbs, warm afternoon sunlight, natural organic feel', icon: 'yard' },
                                                { label: 'Fireplace Mantel', prompt: 'Product on a rustic stone fireplace mantel with lit candles, cozy winter atmosphere, warm amber lighting', icon: 'fireplace' },
                                            ],
                                            podiums: [
                                                { label: 'White Podium', prompt: 'Product on a clean white cylindrical podium, soft studio lighting, minimal pure white background, premium product display', icon: 'view_in_ar' },
                                                { label: 'Gold Podium', prompt: 'Product displayed on a luxurious brushed gold pedestal, soft warm lighting, dark navy background, premium award-style showcase', icon: 'emoji_events' },
                                                { label: 'Glass Platform', prompt: 'Transparent glass display platform with soft under-glow, floating product effect, clean modern museum-style display', icon: 'crop_square' },
                                                { label: 'Marble Column', prompt: 'Product on a classical white marble column pedestal, dramatic Roman-style architecture in background, luxury brand showcase', icon: 'account_balance' },
                                                { label: 'Floating Steps', prompt: 'Product on geometric floating steps/platforms in different heights, soft gradient background, 3D abstract modern display', icon: 'stairs' },
                                                { label: 'Neon Podium', prompt: 'Product on a dark podium with neon edge lighting in pink and blue, cyberpunk retail display, futuristic product launch', icon: 'blur_linear' },
                                                { label: 'Stone Pedestal', prompt: 'Raw natural stone pedestal with rough texture, surrounded by dried flowers and earthy elements, organic luxury display', icon: 'landscape' },
                                                { label: 'Acrylic Cube', prompt: 'Product on a transparent acrylic cube display, clean gallery lighting, contemporary art exhibition product showcase', icon: 'select_all' },
                                            ],
                                            seasonal: [
                                                { label: 'Christmas', prompt: 'Festive Christmas setting with pine branches, red ornaments, gold baubles, twinkling fairy lights, warm holiday atmosphere', icon: 'celebration' },
                                                { label: 'Diwali', prompt: 'Beautiful Diwali festival setting with lit diyas, marigold garlands, rangoli patterns, warm golden festive lighting', icon: 'local_fire_department' },
                                                { label: 'Valentine\'s', prompt: 'Romantic Valentine\'s setting with red roses, heart-shaped confetti, soft pink silk fabric, warm candlelight ambiance', icon: 'favorite' },
                                                { label: 'Spring Bloom', prompt: 'Fresh spring garden with cherry blossoms in full bloom, soft pastel colors, butterflies, warm spring morning light', icon: 'filter_vintage' },
                                                { label: 'Autumn Harvest', prompt: 'Autumn harvest setting with golden leaves, pumpkins, cinnamon sticks, warm amber tones, cozy fall atmosphere', icon: 'eco' },
                                                { label: 'Summer Splash', prompt: 'Bright summer pool party setting with splashing water, citrus fruits, tropical flowers, vivid blue sky, fun energetic vibe', icon: 'pool' },
                                                { label: 'New Year', prompt: 'Glamorous New Year celebration with champagne glasses, gold confetti, sparklers, midnight blue and gold color scheme', icon: 'nightlife' },
                                                { label: 'Back to School', prompt: 'Neat school desk with colorful stationery, notebooks, pencils, fresh apple, bright cheerful classroom lighting', icon: 'school' },
                                            ],
                                            luxury: [
                                                { label: 'Dark Luxury', prompt: 'Elegant dark wood table with subtle gold accents, luxury lifestyle, soft dramatic lighting, premium feel', icon: 'table_restaurant' },
                                                { label: 'Penthouse View', prompt: 'Luxury penthouse rooftop with city skyline at twilight, floor-to-ceiling windows, modern furniture, golden hour light', icon: 'apartment' },
                                                { label: 'Private Jet', prompt: 'Interior of a luxury private jet cabin, leather seats, champagne glass, window showing clouds, ultimate premium lifestyle', icon: 'flight' },
                                                { label: 'Yacht Deck', prompt: 'Sleek white yacht deck with turquoise sea in background, polished teak wood, luxury maritime lifestyle photography', icon: 'sailing' },
                                                { label: 'Art Gallery', prompt: 'Minimalist white-walled art gallery with dramatic spot lighting, product as centerpiece, contemporary exhibition style', icon: 'museum' },
                                                { label: 'Black Silk', prompt: 'Product draped in flowing black silk fabric, dramatic chiaroscuro lighting, ultra-premium luxury brand editorial', icon: 'looks' },
                                            ],
                                            nature: [
                                                { label: 'Greenery', prompt: 'Lush green botanical setting with natural leaves and flowers, soft dappled sunlight filtering through, organic fresh feel', icon: 'eco' },
                                                { label: 'Waterfall Rocks', prompt: 'Natural river rocks near a small waterfall, moss-covered stones, fresh flowing water, serene forest atmosphere', icon: 'water' },
                                                { label: 'Desert Sand', prompt: 'Clean desert sand dunes with golden hour sunlight, dramatic shadows, warm earthy minimalist backdrop', icon: 'landscape' },
                                                { label: 'Lavender Field', prompt: 'Product in a stunning lavender field at sunset, purple flowers stretching to horizon, warm golden light, French countryside', icon: 'grass' },
                                                { label: 'Mountain Lake', prompt: 'Serene mountain lake with mirror-like reflection, snow-capped peaks in background, crystal clear water, pristine nature', icon: 'terrain' },
                                                { label: 'Tropical Jungle', prompt: 'Dense tropical jungle with monstera and palm leaves, exotic flowers, humid atmosphere, vibrant green tone photography', icon: 'forest' },
                                            ],
                                            studio: [
                                                { label: 'Studio White', prompt: 'Professional photography studio with seamless white background, soft diffused studio lighting, clean minimal setup', icon: 'photo_camera' },
                                                { label: 'Studio Black', prompt: 'Professional studio with seamless black background, dramatic directional lighting, high-contrast product photography', icon: 'contrast' },
                                                { label: 'Gradient Sweep', prompt: 'Smooth gradient background transitioning from light blue to white, soft even lighting, clean e-commerce product photo style', icon: 'gradient' },
                                                { label: 'Color Pop', prompt: 'Vibrant solid color background (matching the product accent color), flat lay style, bold graphic editorial product photo', icon: 'palette' },
                                                { label: '360° Turntable', prompt: 'Product on a sleek turntable/lazy susan, clean white cyclorama background, even studio lighting, 3D product display feel', icon: '360' },
                                            ],
                                        };
                                        const scenes = mockupSceneCategory === 'all'
                                            ? Object.values(allScenes).flat()
                                            : allScenes[mockupSceneCategory] || [];
                                        return scenes.map(scene => (
                                            <button key={scene.label}
                                                onClick={() => setMockupScenePrompt(scene.prompt)}
                                                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                                                    mockupScenePrompt === scene.prompt
                                                        ? 'border-cyan-400/40 bg-cyan-500/10 text-white'
                                                        : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.15] hover:text-slate-200'
                                                }`}>
                                                <span className="material-symbols-outlined text-lg">{scene.icon}</span>
                                                <span className="text-xs font-medium">{scene.label}</span>
                                            </button>
                                        ));
                                    })()}
                                </div>

                                {/* Custom Scene Prompt */}
                                <textarea
                                    value={mockupScenePrompt}
                                    onChange={(e) => setMockupScenePrompt(e.target.value)}
                                    placeholder="Or describe your own scene... e.g. 'Rustic wooden shelf in a cozy bookshop'"
                                    rows={3}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-400/30 resize-none"
                                />
                            </div>

                            {/* Brand DNA Harmonize Toggle */}
                            <div className="studio-card p-5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-lg" style={{ color: activeBrand?.dna?.colors?.[0]?.hex || '#6366f1' }}>palette</span>
                                        <div>
                                            <h3 className="font-bold text-white text-sm">Brand Harmonize</h3>
                                            <p className="text-[10px] text-slate-500">Adapt scene colors to brand palette</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setMockupHarmonize(!mockupHarmonize)}
                                        className={`relative w-10 h-5.5 rounded-full transition-all cursor-pointer ${
                                            mockupHarmonize ? 'bg-primary' : 'bg-white/[0.1]'
                                        }`}
                                        style={{ width: '40px', height: '22px' }}>
                                        <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${
                                            mockupHarmonize ? 'left-[20px]' : 'left-[2px]'
                                        }`} style={{ width: '18px', height: '18px' }} />
                                    </button>
                                </div>
                                {mockupHarmonize && activeBrand?.dna?.colors?.length > 0 && (
                                    <div className="mt-3 flex items-center gap-1.5 pt-2.5 border-t border-white/[0.05]">
                                        <span className="text-[10px] text-slate-500 mr-1">Using:</span>
                                        {activeBrand.dna.colors.slice(0, 5).map((c, i) => (
                                            <div key={i} className="w-5 h-5 rounded-md border border-white/10 shadow-sm" style={{ background: c.hex }} title={c.name || c.hex} />
                                        ))}
                                        <span className="text-[10px] text-slate-600 ml-1">{activeBrand.name}</span>
                                    </div>
                                )}
                            </div>

                            {/* Aspect Ratio */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-blue-400 text-lg">aspect_ratio</span>
                                    Aspect Ratio
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {['1:1', '4:5', '16:9', '9:16', '3:4', '2:3'].map(r => (
                                        <button key={r}
                                            onClick={() => setMockupAspectRatio(r)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                                mockupAspectRatio === r
                                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                                                    : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-slate-200'
                                            }`}>{r}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Generate Button */}
                            <button
                                disabled={!mockupProductImage || mockupLoading}
                                onClick={async () => {
                                    setMockupLoading(true); setMockupError(''); setMockupResult(null)
                                    try {
                                        const res = await creativesAPI.lifestyleMockup({
                                            productImage: mockupProductImage,
                                            scenePrompt: mockupScenePrompt,
                                            brandId: activeBrand?._id,
                                            aspectRatio: mockupAspectRatio,
                                            templateImage: mockupTemplateImage || undefined,
                                            harmonizeWithBrand: mockupHarmonize || undefined
                                        })
                                        if (res.success && res.imageUrl) setMockupResult(res.imageUrl)
                                        else setMockupError({
                                            message: res.error || 'Mockup generation failed',
                                            isProviderError: res.isProviderError,
                                            provider: res.provider
                                        })
                                    } catch (err) { 
                                        setMockupError({
                                            message: err.message,
                                            isProviderError: err.isProviderError,
                                            provider: err.provider
                                        })
                                    }
                                    finally { setMockupLoading(false) }
                                }}
                                className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                    bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white
                                    disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                {mockupLoading ? (
                                    <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> Generating Mockup...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-lg">auto_awesome</span> Generate Mockup<span className="text-xs opacity-60 ml-1">~₹0.25</span></>
                                )}
                            </button>

                            {mockupError && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${mockupError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                                    <span className="material-symbols-outlined text-lg">{mockupError.isProviderError ? 'warning' : 'error'}</span>
                                    <div className="flex-1 text-sm">
                                        <span className="font-bold mr-1">{mockupError.isProviderError ? `${mockupError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                        {mockupError.message}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right — Result */}
                        <div className="col-span-12 lg:col-span-7">
                            <div className="studio-card p-5 min-h-[400px] flex flex-col">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-cyan-400 text-lg">image</span>
                                    Mockup Result
                                </h3>
                                {mockupResult ? (
                                    <div className="flex-1 flex flex-col">
                                        <div className="flex-1 rounded-xl overflow-hidden bg-black/20 mb-3">
                                            <img src={mockupResult} alt="Lifestyle Mockup" className="w-full h-full object-contain max-h-[500px]" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleDownloadImage(mockupResult, "lifestyle-mockup.png")}
                                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">download</span>Download
                                            </button>
                                            <button onClick={() => { setMockupResult(null); setMockupScenePrompt('') }}
                                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">restart_alt</span>Try Another Scene
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-4xl text-cyan-400/40">landscape</span>
                                        </div>
                                        <p className="text-slate-400 text-sm font-medium mb-1">No mockup yet</p>
                                        <p className="text-slate-600 text-xs">Upload a product photo, pick a scene, and generate</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    )}

                    {/* ── Logo / Brand Mockup Sub-mode ── */}
                    {mockupSubMode === 'logo' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Left — Controls */}
                        <div className="col-span-12 lg:col-span-5 space-y-4">
                            {/* Logo Upload */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">branding_watermark</span>
                                    Logo / Design
                                </h3>
                                {!logoImage ? (
                                    <>
                                        <label className="flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed border-white/10 hover:border-amber-400/30 bg-white/[0.02] cursor-pointer transition-all group mb-3">
                                            <span className="material-symbols-outlined text-3xl text-slate-600 group-hover:text-amber-400 transition-colors mb-2">upload</span>
                                            <span className="text-sm text-slate-500 group-hover:text-slate-300">Upload logo, badge, or design</span>
                                            <span className="text-xs text-slate-600 mt-1">PNG with transparent background works best</span>
                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                const file = e.target.files?.[0]
                                                if (file) {
                                                    const reader = new FileReader()
                                                    reader.onload = (ev) => { setLogoImage(ev.target.result); setLogoUrl('') }
                                                    reader.readAsDataURL(file)
                                                }
                                            }} />
                                        </label>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex-1 h-px bg-white/[0.06]"></div>
                                            <span className="text-xs text-slate-600">or paste URL</span>
                                            <div className="flex-1 h-px bg-white/[0.06]"></div>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                                                placeholder="https://example.com/logo.png"
                                                className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-400/30"
                                            />
                                            <button disabled={!logoUrl} onClick={() => { setLogoImage(logoUrl); setLogoUrl('') }}
                                                className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-medium hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                                                Use
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden group">
                                        <img src={logoImage} alt="Logo" className="w-full h-36 object-contain rounded-xl bg-white/5" />
                                        <button onClick={() => { setLogoImage(null); setLogoResult(null) }}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Surface Presets */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-cyan-400 text-lg">category</span>
                                    Mockup Surface
                                </h3>
                                {/* Category Tabs */}
                                <div className="flex flex-wrap gap-1 mb-3">
                                    {[
                                        { id: 'all', label: 'All', icon: 'apps' },
                                        { id: 'apparel', label: 'Apparel', icon: 'checkroom' },
                                        { id: 'drinkware', label: 'Drinkware', icon: 'coffee' },
                                        { id: 'stationery', label: 'Stationery', icon: 'edit_note' },
                                        { id: 'packaging', label: 'Packaging', icon: 'inventory_2' },
                                        { id: 'tech', label: 'Tech', icon: 'devices' },
                                        { id: 'promo', label: 'Promo', icon: 'campaign' },
                                        { id: 'signage', label: 'Signage', icon: 'signpost' },
                                    ].map(cat => (
                                        <button key={cat.id} onClick={() => setLogoSurfaceCategory(cat.id)}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                                                logoSurfaceCategory === cat.id
                                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.05] hover:text-slate-300'
                                            }`}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{cat.icon}</span>
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                                    {(() => {
                                        const surfaces = {
                                            apparel: [
                                                { label: 'T-Shirt (White)', prompt: 'Logo printed on the front of a plain white cotton t-shirt, flat lay on clean white background, professional t-shirt mockup', icon: 'checkroom' },
                                                { label: 'T-Shirt (Black)', prompt: 'Logo printed on the front chest area of a plain black cotton t-shirt, flat lay on dark surface, premium streetwear mockup', icon: 'checkroom' },
                                                { label: 'Hoodie', prompt: 'Logo embroidered on a premium heather grey hoodie, front view, folded on wooden surface, lifestyle fashion mockup', icon: 'apparel' },
                                                { label: 'Cap / Hat', prompt: 'Logo embroidered on the front panel of a structured baseball cap, 3/4 angle view, clean background, premium headwear mockup', icon: 'styler' },
                                                { label: 'Polo Shirt', prompt: 'Logo embroidered on the left chest of a premium cotton polo shirt, neatly folded, professional corporate merchandise mockup', icon: 'dry_cleaning' },
                                                { label: 'Tote Bag', prompt: 'Logo screen-printed on a natural canvas tote bag, hanging against white wall, eco-friendly merchandise mockup', icon: 'shopping_bag' },
                                            ],
                                            drinkware: [
                                                { label: 'Coffee Mug', prompt: 'Logo printed on a white ceramic coffee mug, steam rising, on a cozy wooden desk with books nearby, warm morning light mockup', icon: 'coffee' },
                                                { label: 'Travel Tumbler', prompt: 'Logo engraved on a sleek stainless steel travel tumbler, modern desk setting, premium drinkware branding mockup', icon: 'local_drink' },
                                                { label: 'Water Bottle', prompt: 'Logo printed on a matte sport water bottle, gym/outdoor fitness setting, active lifestyle branding mockup', icon: 'water_drop' },
                                                { label: 'Glass Cup', prompt: 'Logo frosted/engraved on a clear glass cup, café table setting with latte art, premium café branding mockup', icon: 'local_cafe' },
                                            ],
                                            stationery: [
                                                { label: 'Business Card', prompt: 'Logo printed on a premium thick business card with embossed texture, stack of cards on marble surface, luxury stationery mockup', icon: 'contact_page' },
                                                { label: 'Letterhead', prompt: 'Logo at the top of a clean white A4 letterhead, pen beside it on a wooden desk, corporate stationery mockup', icon: 'description' },
                                                { label: 'Notebook', prompt: 'Logo debossed on the cover of a premium leather notebook, pen on top, desk setting, executive stationery mockup', icon: 'book' },
                                                { label: 'Envelope', prompt: 'Logo printed on a premium kraft envelope with wax seal, vintage stationery flat lay mockup', icon: 'mail' },
                                                { label: 'Pen', prompt: 'Logo engraved on a sleek metal ballpoint pen, lying on a premium notebook, executive gift mockup', icon: 'edit' },
                                                { label: 'Stamp / Seal', prompt: 'Logo as a rubber stamp impression on textured cream paper, wax seal nearby, vintage branding mockup', icon: 'approval' },
                                            ],
                                            packaging: [
                                                { label: 'Cardboard Box', prompt: 'Logo printed on a kraft cardboard shipping box, clean white background, e-commerce packaging mockup, unboxing experience', icon: 'inventory_2' },
                                                { label: 'Gift Box', prompt: 'Logo foil-stamped on a luxury matte black gift box with ribbon, elegant packaging product mockup', icon: 'redeem' },
                                                { label: 'Paper Bag', prompt: 'Logo printed on a premium kraft paper shopping bag with twisted handles, retail store front mockup', icon: 'shopping_bag' },
                                                { label: 'Product Label', prompt: 'Logo on a clean minimalist product label stuck on a glass bottle/jar, close-up detail shot, artisan branding mockup', icon: 'label' },
                                                { label: 'Food Pouch', prompt: 'Logo printed on a premium standup pouch/food bag, surrounded by ingredients, food product packaging mockup', icon: 'takeout_dining' },
                                                { label: 'Tissue Paper', prompt: 'Logo repeated as a pattern on branded tissue paper inside an open gift box, luxury unboxing experience mockup', icon: 'note' },
                                            ],
                                            tech: [
                                                { label: 'Phone Case', prompt: 'Logo printed on the back of a smartphone case, phone standing on a clean desk, mobile accessories mockup', icon: 'smartphone' },
                                                { label: 'Laptop Sticker', prompt: 'Logo as a vinyl sticker on the top of a MacBook laptop lid, creative workspace, tech branding mockup', icon: 'laptop' },
                                                { label: 'USB Drive', prompt: 'Logo engraved on a premium wooden USB flash drive, on a desk, corporate technology gift mockup', icon: 'usb' },
                                                { label: 'Mouse Pad', prompt: 'Logo printed on a large desk mouse pad, gaming/office setup, tech accessories branding mockup', icon: 'mouse' },
                                            ],
                                            promo: [
                                                { label: 'Coaster', prompt: 'Logo embossed on a round leather coaster, on a dark wood bar counter with cocktail glass nearby, hospitality branding mockup', icon: 'radio_button_unchecked' },
                                                { label: 'Fridge Magnet', prompt: 'Logo on a custom-shaped fridge magnet placed on a stainless steel refrigerator door, promotional merchandise mockup', icon: 'push_pin' },
                                                { label: 'Keychain', prompt: 'Logo engraved on a premium metal keychain with car keys on a table, corporate gift merchandise mockup', icon: 'key' },
                                                { label: 'Umbrella', prompt: 'Logo printed on a large golf umbrella, person holding it in rain, outdoor promotional merchandise mockup', icon: 'umbrella' },
                                                { label: 'Lanyard / Badge', prompt: 'Logo printed on a fabric lanyard with ID badge holder, conference/event setting, corporate event branding mockup', icon: 'badge' },
                                            ],
                                            signage: [
                                                { label: 'Wall Sign', prompt: 'Logo as a 3D metallic wall sign on an exposed brick wall, reception area, premium office branding mockup', icon: 'signpost' },
                                                { label: 'Window Decal', prompt: 'Logo as a frosted glass window decal, modern glass office door, corporate office entrance branding mockup', icon: 'window' },
                                                { label: 'Banner / Flag', prompt: 'Logo on a vertical retractable banner stand, trade show booth setting, event marketing mockup', icon: 'flag' },
                                                { label: 'Neon Sign', prompt: 'Logo as a glowing LED neon sign on a dark wall, trendy restaurant/bar interior, nightlife branding mockup', icon: 'wb_iridescent' },
                                                { label: 'Vehicle Wrap', prompt: 'Logo applied as a vehicle wrap decal on the side of a modern delivery van, urban street setting, fleet branding mockup', icon: 'local_shipping' },
                                            ],
                                        };
                                        const items = logoSurfaceCategory === 'all'
                                            ? Object.values(surfaces).flat()
                                            : surfaces[logoSurfaceCategory] || [];
                                        return items.map(s => (
                                            <button key={s.label} onClick={() => setLogoSurface(s.prompt)}
                                                className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                                                    logoSurface === s.prompt
                                                        ? 'border-amber-400/40 bg-amber-500/10 text-white'
                                                        : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/[0.15] hover:text-slate-200'
                                                }`}>
                                                <span className="material-symbols-outlined text-base">{s.icon}</span>
                                                <span className="text-xs font-medium">{s.label}</span>
                                            </button>
                                        ));
                                    })()}
                                </div>
                                {/* Custom surface */}
                                <textarea value={logoSurface} onChange={(e) => setLogoSurface(e.target.value)}
                                    placeholder="Or describe your own surface... e.g. 'Embroidered on a denim jacket back panel'"
                                    rows={2} className="w-full mt-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-400/30 resize-none"
                                />
                            </div>

                            {/* Style Reference (optional) */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-violet-400 text-lg">style</span>
                                    Style Reference <span className="text-xs text-slate-600 font-normal">(optional)</span>
                                </h3>
                                {!logoStyleRef ? (
                                    <label className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed border-white/10 hover:border-violet-400/30 bg-white/[0.02] cursor-pointer transition-all group">
                                        <span className="material-symbols-outlined text-2xl text-slate-600 group-hover:text-violet-400 transition-colors mb-1">add_photo_alternate</span>
                                        <span className="text-xs text-slate-500 group-hover:text-slate-300">Upload a reference mockup style</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const reader = new FileReader()
                                                reader.onload = (ev) => setLogoStyleRef(ev.target.result)
                                                reader.readAsDataURL(file)
                                            }
                                        }} />
                                    </label>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden group">
                                        <img src={logoStyleRef} alt="Style Ref" className="w-full h-24 object-cover rounded-xl" />
                                        <button onClick={() => setLogoStyleRef(null)}
                                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-xs">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* AI Enhancement Keywords */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-emerald-400 text-lg">auto_awesome</span>
                                    AI Enhancement Keywords <span className="text-xs text-slate-600 font-normal">(optional)</span>
                                </h3>
                                <input type="text" value={logoKeywords} onChange={(e) => setLogoKeywords(e.target.value)}
                                    placeholder="e.g. minimalist, premium, vibrant colors, 3D embossed, gold foil"
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-400/30"
                                />
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {['minimalist', 'premium', '3D embossed', 'gold foil', 'photorealistic', 'vibrant colors', 'matte finish', 'glossy', 'vintage', 'neon glow'].map(kw => (
                                        <button key={kw} onClick={() => setLogoKeywords(prev => prev ? `${prev}, ${kw}` : kw)}
                                            className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.04] border border-white/[0.06] text-slate-500 hover:text-emerald-300 hover:border-emerald-400/20 transition-all cursor-pointer">
                                            +{kw}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Aspect Ratio */}
                            <div className="studio-card p-5">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-blue-400 text-lg">aspect_ratio</span>
                                    Aspect Ratio
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {['1:1', '4:5', '16:9', '9:16', '3:4', '2:3'].map(r => (
                                        <button key={r} onClick={() => setLogoAspectRatio(r)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                                                logoAspectRatio === r
                                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                                                    : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-slate-200'
                                            }`}>{r}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Generate Button */}
                            <button
                                disabled={!logoImage || !logoSurface || logoLoading}
                                onClick={async () => {
                                    setLogoLoading(true); setLogoError(''); setLogoResult(null)
                                    try {
                                        // Build the prompt
                                        let prompt = `LOGO/BRAND MOCKUP: Place the logo/design from the provided image onto the following surface/product.\n\nSURFACE: ${logoSurface}`
                                        if (logoKeywords) prompt += `\n\nSTYLE KEYWORDS: ${logoKeywords}`
                                        if (logoStyleRef) prompt += `\n\nMATCH THE STYLE from the provided style reference image.`
                                        prompt += `\n\nCRITICAL RULES:\n- Place the logo NATURALLY on the product surface — correct perspective, wrapping, and material interaction\n- The logo should look like it was actually printed/embossed/engraved on the product\n- Maintain correct color reproduction of the logo\n- Use professional product photography lighting\n- The mockup should look photorealistic, not like a flat overlay\n- Show realistic material textures (fabric weave, metal sheen, paper grain etc)\n- Make it look like a real professional product photograph`

                                        // Collect image parts
                                        const images = [logoImage]
                                        if (logoStyleRef) images.push(logoStyleRef)

                                        const res = await creativesAPI.lifestyleMockup({
                                            productImage: images[0],
                                            scenePrompt: prompt,
                                            brandId: activeBrand?._id,
                                            aspectRatio: logoAspectRatio,
                                            ...(logoStyleRef ? { styleRef: logoStyleRef } : {})
                                        })
                                        if (res.success && res.imageUrl) setLogoResult(res.imageUrl)
                                        else setLogoError({
                                            message: res.error || 'Logo mockup generation failed',
                                            isProviderError: res.isProviderError,
                                            provider: res.provider
                                        })
                                    } catch (err) { 
                                        setLogoError({
                                            message: err.message,
                                            isProviderError: err.isProviderError,
                                            provider: err.provider
                                        })
                                    }
                                    finally { setLogoLoading(false) }
                                }}
                                className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                                    bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white
                                    disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                                {logoLoading ? (
                                    <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> Generating Mockup...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-lg">auto_awesome</span> Generate Logo Mockup<span className="text-xs opacity-60 ml-1">~₹0.25</span></>
                                )}
                            </button>

                            {logoError && (
                                <div className={`p-3 rounded-xl border flex items-center gap-2 ${logoError.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
                                    <span className="material-symbols-outlined text-lg">{logoError.isProviderError ? 'warning' : 'error'}</span>
                                    <div className="flex-1 text-sm">
                                        <span className="font-bold mr-1">{logoError.isProviderError ? `${logoError.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                                        {logoError.message}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right — Result */}
                        <div className="col-span-12 lg:col-span-7">
                            <div className="studio-card p-5 min-h-[400px] flex flex-col">
                                <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">image</span>
                                    Logo Mockup Result
                                </h3>
                                {logoResult ? (
                                    <div className="flex-1 flex flex-col">
                                        <div className="flex-1 rounded-xl overflow-hidden bg-black/20 mb-3">
                                            <img src={logoResult} alt="Logo Mockup" className="w-full h-full object-contain max-h-[500px]" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleDownloadImage(logoResult, "logo-mockup.png")}
                                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">download</span>Download
                                            </button>
                                            <button onClick={() => { setLogoResult(null); setLogoSurface('') }}
                                                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">restart_alt</span>Try Another Surface
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 flex items-center justify-center mb-4">
                                            <span className="material-symbols-outlined text-4xl text-amber-400/40">branding_watermark</span>
                                        </div>
                                        <p className="text-slate-400 text-sm font-medium mb-1">No mockup yet</p>
                                        <p className="text-slate-600 text-xs">Upload your logo, pick a surface, and generate</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    )}

                </div>
            )}

            {/* ═══ UNIFIED PUBLISH MODAL (shared across all modes) ═══ */}
            <PublishModal
                isOpen={!!publishData}
                onClose={() => setPublishData(null)}
                defaultText={publishData?.text || ''}
                defaultImage={publishData?.image || null}
                defaultImages={publishData?.images || null}
                brandId={activeBrand?._id}
            />

            {/* ── Model Busy Warning Modal ── */}
            {showBusyModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setShowBusyModal(false)} />
                    
                    <div className="relative w-full max-w-md transform overflow-hidden rounded-3xl border border-white/10 bg-[#161b22] p-8 text-center shadow-2xl transition-all animate-in fade-in zoom-in duration-300">
                        {/* Premium Glow effect */}
                        <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-amber-500/10 blur-[80px]" />
                        <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-rose-500/10 blur-[80px]" />

                        {/* Icon */}
                        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5">
                            <span className="material-symbols-outlined text-4xl">hourglass_empty</span>
                        </div>

                        {/* Text Content */}
                        <h3 className="mb-2 text-2xl font-bold text-white">
                            {busyModelInfo?.name || 'Engine'} is Busy
                        </h3>
                        <p className="mb-8 text-slate-400 text-sm leading-relaxed">
                            We're experiencing unusually high demand for this specific AI model right now. 
                            Spikes in demand are usually temporary and last only a few minutes.
                        </p>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowBusyModal(false);
                                    setShowModelMenu(true); // Open the model picker
                                }}
                                className="w-full rounded-2xl bg-white px-6 py-4 text-sm font-bold text-black transition-all hover:bg-slate-100 active:scale-[0.98]"
                            >
                                Switch Engine
                            </button>
                            <button
                                onClick={() => setShowBusyModal(false)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-slate-300 transition-all hover:bg-white/10 active:scale-[0.98]"
                            >
                                Wait and Try Again
                            </button>
                        </div>

                        {/* Footer Hint */}
                        <div className="mt-6 flex items-center justify-center gap-2 text-[10px] uppercase tracking-widest text-slate-500">
                            <span className="h-1 w-1 rounded-full bg-amber-500" />
                            Mantram AI Premium Intelligence
                        </div>
                    </div>
                </div>
            )}

        </DashboardLayout>
    )
}

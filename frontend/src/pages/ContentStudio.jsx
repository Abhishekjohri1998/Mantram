import { useState, useRef, useEffect, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useSearchParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { content as contentAPI, agents as agentsAPI, creatives as creativesAPI, products as productsAPI, media as mediaAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { stripMarkdown } from '../utils/stripMarkdown'
import VoiceInput from '../components/VoiceInput'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import PublishModal from '../components/PublishModal'

// ============================================================================
// DATA: Goals, sub-types, channels, tones
// ============================================================================
const GOALS = [
    {
        id: 'promote', icon: 'campaign', label: 'Promote Something',
        desc: 'Product, service, offer, sale, or discount',
        color: 'from-orange-500/20 to-amber-500/10', accent: '#F59E0B',
        subTypes: [
            { id: 'product', icon: 'inventory_2', label: 'Product Push' },
            { id: 'service', icon: 'handyman', label: 'Service Highlight' },
            { id: 'offer', icon: 'sell', label: 'Offer / Discount' },
            { id: 'sale', icon: 'local_fire_department', label: 'Limited Time Sale' },
            { id: 'bundle', icon: 'shopping_bag', label: 'Bundle / Combo Deal' },
            { id: 'store', icon: 'storefront', label: 'Store Visit / Footfall' },
        ],
    },
    {
        id: 'celebrate', icon: 'celebration', label: 'Celebrate Something',
        desc: 'Festival, occasion, milestone, or trending event',
        color: 'from-pink-500/20 to-purple-500/10', accent: '#EC4899',
        subTypes: [
            { id: 'festival', icon: 'auto_awesome', label: 'Festival' },
            { id: 'national_day', icon: 'flag', label: 'National / World Day' },
            { id: 'trending', icon: 'trending_up', label: 'Trending Event' },
            { id: 'milestone', icon: 'emoji_events', label: 'Company Milestone' },
            { id: 'birthday', icon: 'cake', label: 'Founder / Team Birthday' },
            { id: 'appreciation', icon: 'favorite', label: 'Customer Appreciation' },
        ],
    },
    {
        id: 'launch', icon: 'rocket_launch', label: 'Launch Something',
        desc: 'New product, store, campaign, or announcement',
        color: 'from-blue-500/20 to-cyan-500/10', accent: '#3B82F6',
        subTypes: [
            { id: 'product_launch', icon: 'new_releases', label: 'Product Launch' },
            { id: 'store_launch', icon: 'store', label: 'Store Launch' },
            { id: 'brand_launch', icon: 'branding_watermark', label: 'Brand Launch' },
            { id: 'pr', icon: 'newspaper', label: 'PR / Press Release' },
            { id: 'collab', icon: 'handshake', label: 'Collaboration' },
            { id: 'campaign', icon: 'flag', label: 'Campaign Kickoff' },
        ],
    },
    {
        id: 'educate', icon: 'school', label: 'Educate / Inform',
        desc: 'Blog, SEO article, thought leadership, how-to guide',
        color: 'from-emerald-500/20 to-teal-500/10', accent: '#10B981',
        subTypes: [
            { id: 'seo_blog', icon: 'search', label: 'SEO Blog Article' },
            { id: 'thought_leader', icon: 'psychology', label: 'Thought Leadership' },
            { id: 'industry_insight', icon: 'insights', label: 'Industry Insight' },
            { id: 'case_study', icon: 'assignment', label: 'Case Study' },
            { id: 'how_to', icon: 'menu_book', label: 'How-To Guide' },
            { id: 'tips', icon: 'tips_and_updates', label: 'Tips & Listicle' },
        ],
    },
    {
        id: 'brand', icon: 'diamond', label: 'Build Brand',
        desc: 'Brand story, about us, website copy, taglines',
        color: 'from-violet-500/20 to-indigo-500/10', accent: '#8B5CF6',
        subTypes: [
            { id: 'about_us', icon: 'info', label: 'About Us' },
            { id: 'brand_story', icon: 'auto_stories', label: 'Brand Story' },
            { id: 'vision_mission', icon: 'visibility', label: 'Vision & Mission' },
            { id: 'website_copy', icon: 'web', label: 'Website Copy' },
            { id: 'taglines', icon: 'format_quote', label: 'Taglines / Slogans' },
            { id: 'voice_doc', icon: 'record_voice_over', label: 'Voice & Tone Doc' },
        ],
    },
    {
        id: 'press_release', icon: 'newspaper', label: 'Write Press Release',
        desc: 'Professional PR for launches, announcements, events',
        color: 'from-rose-500/20 to-pink-500/10', accent: '#F43F5E',
        subTypes: [
            { id: 'product_pr', icon: 'new_releases', label: 'Product / Service Launch' },
            { id: 'partnership_pr', icon: 'handshake', label: 'Partnership / Collaboration' },
            { id: 'event_pr', icon: 'event', label: 'Event Announcement' },
            { id: 'milestone_pr', icon: 'emoji_events', label: 'Company Milestone' },
            { id: 'funding_pr', icon: 'trending_up', label: 'Funding / Investment' },
            { id: 'crisis_pr', icon: 'shield', label: 'Crisis / Statement' },
            { id: 'award_pr', icon: 'military_tech', label: 'Award / Recognition' },
            { id: 'csr_pr', icon: 'volunteer_activism', label: 'CSR / Social Impact' },
        ],
    },
    {
        id: 'product_content', icon: 'shopping_bag', label: 'Write Product Content',
        desc: 'Platform-specific product descriptions, listings & pages',
        color: 'from-cyan-500/20 to-blue-500/10', accent: '#06B6D4',
        subTypes: [
            { id: 'amazon', icon: 'shopping_cart', label: 'Amazon Listing' },
            { id: 'flipkart', icon: 'storefront', label: 'Flipkart Listing' },
            { id: 'myntra', icon: 'checkroom', label: 'Myntra Listing' },
            { id: 'shopify', icon: 'store', label: 'Shopify Description' },
            { id: 'meesho', icon: 'local_mall', label: 'Meesho Listing' },
            { id: 'general_ecommerce', icon: 'public', label: 'General E-commerce' },
            { id: 'website', icon: 'web', label: 'Website Product Page' },
        ],
    },
    {
        id: 'youtube_content', icon: 'smart_display', label: 'YouTube Content',
        desc: 'Scripts, titles, descriptions, tags for Videos & Shorts',
        color: 'from-red-500/20 to-rose-500/10', accent: '#FF0000',
        subTypes: [
            { id: 'youtube_seo', icon: 'rocket_launch', label: '🚀 Publish Optimizer', desc: 'Title, description, tags & keywords — SEO only, no script' },
            { id: 'video_script', icon: 'movie', label: '📝 Video Script', desc: 'Full script + all metadata' },
            { id: 'shorts_script', icon: 'slow_motion_video', label: '📝 Shorts Script', desc: 'Short-form script + metadata' },
            { id: 'tutorial', icon: 'school', label: '📝 Tutorial / How-To' },
            { id: 'review', icon: 'rate_review', label: '📝 Review / Unboxing' },
            { id: 'vlog', icon: 'videocam', label: '📝 Vlog' },
            { id: 'podcast', icon: 'podcasts', label: '📝 Podcast Highlights' },
            { id: 'commentary', icon: 'chat', label: '📝 Commentary / Reaction' },
            { id: 'explainer', icon: 'lightbulb', label: '📝 Explainer Video' },
        ],
    },
]

const CHANNELS = [
    { id: 'instagram', icon: '/icons/instagram.svg', label: 'Instagram', fallbackIcon: 'photo_camera' },
    { id: 'facebook', icon: '/icons/facebook.svg', label: 'Facebook', fallbackIcon: 'thumb_up' },
    { id: 'linkedin', icon: '/icons/linkedin.svg', label: 'LinkedIn', fallbackIcon: 'work' },
    { id: 'twitter', icon: '/icons/twitter.svg', label: 'X (Twitter)', fallbackIcon: 'tag' },
    { id: 'youtube', icon: '/icons/youtube.svg', label: 'YouTube', fallbackIcon: 'play_circle' },
    { id: 'website', icon: '/icons/web.svg', label: 'Website / Blog', fallbackIcon: 'language' },
    { id: 'ecommerce', icon: '/icons/shop.svg', label: 'Amazon / Ecommerce', fallbackIcon: 'shopping_cart' },
    { id: 'email', icon: '/icons/email.svg', label: 'Email / Newsletter', fallbackIcon: 'mail' },
    { id: 'whatsapp', icon: '/icons/whatsapp.svg', label: 'WhatsApp', fallbackIcon: 'chat' },
    { id: 'multi', icon: '/icons/multi.svg', label: 'Multiple Platforms', fallbackIcon: 'hub' },
]

const TONES = [
    { id: 'bold', label: 'Bold & Direct', icon: 'bolt' },
    { id: 'premium', label: 'Premium & Elegant', icon: 'diamond' },
    { id: 'fun', label: 'Fun & Playful', icon: 'mood' },
    { id: 'emotional', label: 'Emotional & Warm', icon: 'favorite' },
    { id: 'professional', label: 'Professional', icon: 'business_center' },
    { id: 'storytelling', label: 'Storytelling', icon: 'auto_stories' },
]

const LENGTHS = [
    { id: 'short', label: 'Short & Punchy', desc: '1-2 lines', icon: 'short_text' },
    { id: 'medium', label: 'Medium', desc: '3-5 lines', icon: 'notes' },
    { id: 'detailed', label: 'Detailed', desc: 'Full copy', icon: 'article' },
]

const SELL_STYLES = [
    { id: 'direct', label: 'Direct Selling', desc: 'Clear CTA, urgency' },
    { id: 'soft', label: 'Soft Selling', desc: 'Value-first approach' },
    { id: 'story', label: 'Storytelling', desc: 'Narrative-driven' },
]

// ============================================================================
// STEP COMPONENTS
// ============================================================================

function SmartInput({ onParse, onSkip }) {
    const [input, setInput] = useState('')
    const [parsing, setParsing] = useState(false)

    async function handleSubmit() {
        if (!input.trim()) return
        setParsing(true)
        // For now, do basic keyword detection. In future, this hits AI.
        const lower = input.toLowerCase()
        let goal = null, subType = null, channel = null

        // Detect goal
        if (/promot|offer|sale|discount|deal|product/.test(lower)) goal = 'promote'
        else if (/festival|diwali|christmas|celebrat|occasion|milestone/.test(lower)) goal = 'celebrate'
        else if (/launch|new|announce|pr |press|collab/.test(lower)) goal = 'launch'
        else if (/blog|seo|article|guide|how.to|educat|tip/.test(lower)) goal = 'educate'
        else if (/brand|story|about|tagline|website|vision/.test(lower)) goal = 'brand'

        // Detect channel
        if (/instagram|insta/i.test(lower)) channel = 'instagram'
        else if (/facebook|fb/i.test(lower)) channel = 'facebook'
        else if (/linkedin/i.test(lower)) channel = 'linkedin'
        else if (/twitter|tweet/i.test(lower)) channel = 'twitter'
        else if (/email|newsletter/i.test(lower)) channel = 'email'
        else if (/amazon|ecommerce|shopify/i.test(lower)) channel = 'ecommerce'
        else if (/website|blog|web/i.test(lower)) channel = 'website'
        else if (/whatsapp/i.test(lower)) channel = 'whatsapp'
        else if (/youtube|yt |video script|shorts/i.test(lower)) channel = 'youtube'

        setTimeout(() => {
            setParsing(false)
            onParse({ goal, subType, channel, rawInput: input })
        }, 600)
    }

    return (
        <div className="max-w-2xl mx-auto text-center mb-10 animate-fade-in">
            <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-primary text-xl">auto_awesome</span>
                <input
                    value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="What do you want to create? Type or speak in any language..."
                    className="input-glass w-full pl-12 pr-28 py-4 text-white text-base rounded-2xl"
                    autoFocus
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <VoiceInput
                        onResult={(text) => setInput(prev => prev ? prev + ' ' + text : text)}
                        size="small"
                    />
                    <button onClick={handleSubmit} disabled={!input.trim() || parsing}
                        className="btn-primary py-2 px-4 rounded-xl text-sm disabled:opacity-30 cursor-pointer">
                        {parsing ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : 'Go →'}
                    </button>
                </div>
            </div>
            <p className="text-xs text-slate-600 mt-3">
                <span className="material-symbols-outlined text-xs align-middle mr-0.5">mic</span>
                Speak in Hindi, Tamil, Spanish, or any language • Or type below ↓
            </p>
        </div>
    )
}

function StepGoal({ onSelect }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 max-w-4xl mx-auto">
            {GOALS.map((g, i) => (
                <button key={g.id} onClick={() => onSelect(g.id)}
                    className="glass-panel rounded-2xl p-5 text-left hover:border-primary/30 hover:scale-[1.02] transition-all cursor-pointer group animate-fade-in"
                    style={{ animationDelay: `${i * 60}ms` }}>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <span className="material-symbols-outlined text-white text-lg">{g.icon}</span>
                    </div>
                    <h3 className="text-base font-bold text-white mb-1">{g.label}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{g.desc}</p>
                </button>
            ))}
        </div>
    )
}

function StepSubType({ goal, onSelect, onBack }) {
    const goalData = GOALS.find(g => g.id === goal)
    return (
        <div className="animate-fade-in max-w-3xl mx-auto">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <div className="flex items-center gap-3 mb-6">
                <span className="material-symbols-outlined text-2xl" style={{ color: goalData?.accent }}>{goalData?.icon}</span>
                <div>
                    <h3 className="text-xl font-extrabold text-white">{goalData?.label}</h3>
                    <p className="text-sm text-slate-400">What specifically?</p>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {goalData?.subTypes.map((st, i) => (
                    <button key={st.id} onClick={() => onSelect(st.id)}
                        className="glass-panel rounded-xl p-4 text-left hover:bg-white/[0.06] hover:border-primary/30 transition-all cursor-pointer animate-fade-in group"
                        style={{ animationDelay: `${i * 60}ms` }}>
                        <span className="material-symbols-outlined text-xl text-slate-400 group-hover:text-primary transition-colors mb-2 block">{st.icon}</span>
                        <p className="text-base font-bold text-white">{st.label}</p>
                    </button>
                ))}
            </div>
        </div>
    )
}

function StepChannel({ onSelect, onBack, goal }) {
    const [selected, setSelected] = useState([])
    const isMulti = goal === 'educate' || goal === 'brand'

    function handleToggle(id) {
        if (id === 'multi') {
            setSelected(CHANNELS.filter(c => c.id !== 'multi').map(c => c.id))
            return
        }
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    function handleContinue() {
        if (selected.length > 0) onSelect(selected.length === 1 ? selected[0] : selected)
    }

    return (
        <div className="animate-fade-in max-w-3xl mx-auto">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h3 className="text-xl font-extrabold text-white mb-2">Where will this be <span className="text-primary">published?</span></h3>
            <p className="text-sm text-slate-400 mb-6">Content will be auto-optimized for the selected platform{selected.length > 1 ? 's' : ''}.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {CHANNELS.map((ch, i) => (
                    <button key={ch.id} onClick={() => handleToggle(ch.id)}
                        className={`glass-panel rounded-xl p-4 text-center transition-all cursor-pointer animate-fade-in ${selected.includes(ch.id) || (ch.id === 'multi' && selected.length > 2)
                            ? 'bg-primary/15 border-primary/40'
                            : 'hover:bg-white/[0.05] hover:border-white/[0.15]'
                            }`}
                        style={{ animationDelay: `${i * 50}ms` }}>
                        <span className="material-symbols-outlined text-2xl mb-1.5 block" style={{
                            color: selected.includes(ch.id) ? '#2B4BEE' : '#64748b'
                        }}>{ch.fallbackIcon}</span>
                        <p className={`text-xs font-bold ${selected.includes(ch.id) ? 'text-white' : 'text-slate-400'} `}>{ch.label}</p>
                    </button>
                ))}
            </div>
            <button onClick={handleContinue} disabled={selected.length === 0}
                className="btn-primary w-full py-3.5 rounded-xl mt-6 text-sm font-bold disabled:opacity-30">
                Continue →
            </button>
        </div>
    )
}

function StepContext({ onComplete, onBack, goal, subType, initialImage, brandId }) {
    const [contextType, setContextType] = useState(initialImage ? 'upload' : 'manual')
    const [details, setDetails] = useState('')
    const [url, setUrl] = useState('')
    const [files, setFiles] = useState([])
    const [imagePreview, setImagePreview] = useState(initialImage || null)
    const [imageAnalysis, setImageAnalysis] = useState('')
    const [analyzing, setAnalyzing] = useState(false)
    const [analysisError, setAnalysisError] = useState('')
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [libraryCategory, setLibraryCategory] = useState('all')
    const [libraryCounts, setLibraryCounts] = useState({ all: 0, uploaded: 0, generated: 0 })
    // Smart product suggestions
    const [suggestedProducts, setSuggestedProducts] = useState([])
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)
    const [attachedProducts, setAttachedProducts] = useState([])
    const [showProductPanel, setShowProductPanel] = useState(false)

    // Auto-analyze if initialImage is provided (from Photoshoot)
    useEffect(() => {
        if (initialImage && !imageAnalysis && !analyzing) {
            const autoAnalyze = async () => {
                setAnalyzing(true)
                try {
                    const data = await agentsAPI.analyzeImage({ image: initialImage, goal, platform: '', brandId })
                    if (data.success) {
                        setImageAnalysis(data.analysis)
                        setDetails(data.analysis)
                    } else {
                        setAnalysisError(data.error || 'Analysis failed')
                    }
                } catch (err) {
                    setAnalysisError(err.message || 'Analysis failed')
                } finally {
                    setAnalyzing(false)
                }
            }
            autoAnalyze()
        }
    }, [initialImage]) // eslint-disable-line react-hooks/exhaustive-deps

    // Load library images when library tab is selected
    async function loadLibrary(cat = libraryCategory) {
        setLibraryLoading(true)
        try {
            const data = await creativesAPI.imageBank({ category: cat })
            if (data.success) {
                setLibraryImages(data.images || [])
                if (data.counts) setLibraryCounts(data.counts)
            }
        } catch (err) {
            console.error('Failed to load image bank:', err)
        } finally {
            setLibraryLoading(false)
        }
    }

    useEffect(() => {
        if (contextType === 'library') loadLibrary()
    }, [contextType]) // eslint-disable-line react-hooks/exhaustive-deps

    function handleDrop(e) {
        e.preventDefault()
        const dropped = Array.from(e.dataTransfer?.files || e.target.files || [])
        setFiles(prev => [...prev, ...dropped])
    }

    const needsContext = ['promote', 'launch', 'celebrate'].includes(goal)
    const placeholder = goal === 'promote' ? 'Describe your product, its features, pricing, USP...' :
        goal === 'launch' ? 'What are you launching? Key details, date, highlights...' :
            goal === 'celebrate' ? 'Which festival/occasion? Any specific message or offer to include?' :
                goal === 'educate' ? 'What topic? Target keywords? Any specific angle?' :
                    'Describe your brand, positioning, audience...'

    // Fetch smart product suggestions when details change
    async function fetchSuggestions() {
        if (!brandId || !details || details.length < 10) return
        setLoadingSuggestions(true)
        try {
            const data = await productsAPI.smartMatch({ brandId, context: details, limit: 6 })
            if (data.success && data.products?.length > 0) {
                setSuggestedProducts(data.products)
                setShowProductPanel(true)
            }
        } catch (err) {
            console.warn('Smart match failed:', err.message)
        } finally {
            setLoadingSuggestions(false)
        }
    }

    function toggleProduct(product) {
        setAttachedProducts(prev => {
            const exists = prev.find(p => p._id === product._id)
            if (exists) return prev.filter(p => p._id !== product._id)
            return [...prev, product]
        })
    }

    function handleContextComplete() {
        let ctx = { details, url, contextType }
        // Inject attached product data into context
        if (attachedProducts.length > 0) {
            const productContext = attachedProducts.map(p =>
                `PRODUCT: ${p.title} | ${p.shortDescription || p.description?.slice(0, 150) || ''} | ₹${p.price?.amount || 0} | Tags: ${(p.tags || []).join(', ')} `
            ).join('\n')
            ctx.details = `${details} \n\nATTACHED PRODUCTS FOR REFERENCE: \n${productContext} `
            ctx.attachedProducts = attachedProducts
        }
        if (imagePreview) ctx.imagePreview = imagePreview
        if (imageAnalysis) ctx.imageAnalysis = imageAnalysis
        onComplete(ctx)
    }

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h3 className="text-xl font-extrabold text-white mb-2">Add <span className="text-primary">context</span></h3>
            <p className="text-sm text-slate-400 mb-6">The more details you provide, the better the output.</p>

            {/* Context type tabs */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {[
                    { id: 'manual', icon: 'edit', label: 'Write Details' },
                    { id: 'url', icon: 'link', label: 'Paste Link' },
                    { id: 'upload', icon: 'upload', label: 'Upload Image' },
                    { id: 'library', icon: 'photo_library', label: 'Image Bank' },
                ].map(t => (
                    <button key={t.id} onClick={() => setContextType(t.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${contextType === t.id ? 'bg-primary text-white' : 'glass-panel text-slate-400 hover:text-white'
                            } `}>
                        <span className="material-symbols-outlined text-sm">{t.icon}</span> {t.label}
                        {t.id === 'library' && libraryCounts.all > 0 && (
                            <span className="bg-white/20 text-xs px-1.5 py-0.5 rounded-full">{libraryCounts.all}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Manual */}
            {contextType === 'manual' && (
                <div className="relative">
                    <textarea value={details} onChange={e => setDetails(e.target.value)}
                        placeholder={placeholder}
                        className="input-glass w-full py-4 pr-14 resize-none text-white" rows={5} autoFocus />
                    <div className="absolute right-3 top-3">
                        <VoiceInput
                            onResult={(text) => setDetails(prev => prev ? prev + ' ' + text : text)}
                            size="small"
                        />
                    </div>
                </div>
            )}

            {/* URL */}
            {contextType === 'url' && (
                <div className="space-y-3">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">link</span>
                        <input value={url} onChange={e => setUrl(e.target.value)}
                            placeholder="Paste product, page, or article URL"
                            className="input-glass w-full pl-12 py-3" autoFocus />
                    </div>
                    <textarea value={details} onChange={e => setDetails(e.target.value)}
                        placeholder="Any additional notes? (optional)"
                        className="input-glass w-full py-3 resize-none" rows={3} />
                </div>
            )}

            {/* Upload */}
            {contextType === 'upload' && (
                <div className="space-y-4">
                    {/* Drop zone */}
                    {!imagePreview && (
                        <div onDrop={(e) => {
                            e.preventDefault()
                            const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
                            if (file && file.type.startsWith('image/')) {
                                setFiles([file])
                                const reader = new FileReader()
                                reader.onload = async (ev) => {
                                    try {
                                        const { url } = await mediaAPI.upload({ imageData: ev.target.result, folder: 'content-refs' })
                                        setImagePreview(url)
                                    } catch { setImagePreview(ev.target.result) }
                                }
                                reader.readAsDataURL(file)
                            }
                        }} onDragOver={e => e.preventDefault()}
                            className="border-2 border-dashed border-white/[0.1] rounded-2xl p-6 sm:p-10 text-center hover:border-primary/40 transition-colors">
                            <span className="material-symbols-outlined text-4xl text-slate-600 mb-3 block">add_photo_alternate</span>
                            <p className="text-slate-400 mb-2 text-sm">Drag & drop a product image or creative</p>
                            <p className="text-xs text-slate-600 mb-3">AI will analyze the image and create a content brief</p>
                            <label className="btn-primary py-2 px-5 rounded-xl text-xs cursor-pointer inline-block">
                                Choose Image
                                <input type="file" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file && file.type.startsWith('image/')) {
                                        setFiles([file])
                                        const reader = new FileReader()
                                        reader.onload = async (ev) => {
                                            try {
                                                const { url } = await mediaAPI.upload({ imageData: ev.target.result, folder: 'content-refs' })
                                                setImagePreview(url)
                                            } catch { setImagePreview(ev.target.result) }
                                        }
                                        reader.readAsDataURL(file)
                                    }
                                }} accept="image/*" />
                            </label>
                        </div>
                    )}

                    {/* Image Preview + Analysis */}
                    {imagePreview && (
                        <div className="animate-fade-in">
                            {/* Preview */}
                            <div className="relative rounded-2xl overflow-hidden mb-4">
                                <img src={imagePreview} alt="Uploaded" className="w-full max-h-64 object-contain bg-black/20 rounded-2xl" />
                                <button onClick={() => { setImagePreview(null); setFiles([]); setImageAnalysis(''); setAnalysisError('') }}
                                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-500/80 transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                                {files[0] && (
                                    <div className="absolute bottom-3 left-3 bg-black/60 rounded-lg px-2.5 py-1">
                                        <span className="text-sm text-white">{files[0].name} • {(files[0].size / 1024).toFixed(0)} KB</span>
                                    </div>
                                )}
                            </div>

                            {/* Analyze Button */}
                            {!imageAnalysis && !analyzing && (
                                <button onClick={async () => {
                                    setAnalyzing(true)
                                    setAnalysisError('')
                                    try {
                                        const data = await agentsAPI.analyzeImage({ image: imagePreview, goal, platform: '', brandId })
                                        if (data.success) {
                                            setImageAnalysis(data.analysis)
                                            setDetails(data.analysis)
                                        } else {
                                            setAnalysisError(data.error || 'Analysis failed')
                                        }
                                    } catch (err) {
                                        setAnalysisError(err.message || 'Analysis failed')
                                    } finally {
                                        setAnalyzing(false)
                                    }
                                }} className="btn-primary w-full py-3 rounded-xl text-sm font-bold mb-4">
                                    <span className="material-symbols-outlined text-sm">psychology</span>
                                    Analyze Image with AI
                                </button>
                            )}

                            {/* Analyzing spinner */}
                            {analyzing && (
                                <div className="glass-panel rounded-2xl p-6 text-center mb-4 animate-fade-in">
                                    <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-2">progress_activity</span>
                                    <p className="text-base font-bold text-white">Analyzing image with <span className="text-primary">Gemini Vision AI</span></p>
                                    <p className="text-sm text-slate-500 mt-1">Detecting products, colors, mood, text, and marketing angles...</p>
                                </div>
                            )}

                            {/* Analysis Error */}
                            {analysisError && (
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-4">
                                    <span className="material-symbols-outlined align-middle mr-1 text-sm">error</span> {analysisError}
                                </div>
                            )}

                            {/* Analysis Result */}
                            {imageAnalysis && (
                                <div className="glass-panel rounded-2xl p-5 mb-4 animate-fade-in">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-emerald-400">check_circle</span>
                                        <h4 className="text-base font-bold text-white">AI Image Analysis</h4>
                                        <span className="text-sm text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full font-bold">Gemini Vision</span>
                                    </div>
                                    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                                        {imageAnalysis}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Additional notes */}
                    {imagePreview && imageAnalysis && (
                        <div className="relative">
                            <textarea value={details !== imageAnalysis ? details.replace(imageAnalysis, '').trim() : ''}
                                onChange={e => setDetails(imageAnalysis + (e.target.value ? '\n\nADDITIONAL NOTES: ' + e.target.value : ''))}
                                placeholder="Add any extra details or instructions... (optional)"
                                className="input-glass w-full py-3 pr-14 resize-none" rows={2} />
                            <div className="absolute right-3 top-3">
                                <VoiceInput
                                    onResult={(text) => setDetails(prev => prev + '\n\nADDITIONAL NOTES: ' + text)}
                                    size="small"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Image Bank Library */}
            {contextType === 'library' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Category tabs */}
                    <div className="flex gap-2">
                        {[
                            { id: 'all', label: 'All', count: libraryCounts.all },
                            { id: 'uploaded', label: 'Uploaded', count: libraryCounts.uploaded },
                            { id: 'generated', label: 'AI Generated', count: libraryCounts.generated },
                        ].map(cat => (
                            <button key={cat.id} onClick={() => { setLibraryCategory(cat.id); loadLibrary(cat.id) }}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${libraryCategory === cat.id ? 'bg-primary/20 text-primary border border-primary/30' : 'glass-panel text-slate-400 hover:text-white'} `}>
                                {cat.label}
                                <span className="ml-1.5 text-xs opacity-60">{cat.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Loading */}
                    {libraryLoading && (
                        <div className="text-center py-8">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-2">progress_activity</span>
                            <p className="text-sm text-slate-400">Loading your image library...</p>
                        </div>
                    )}

                    {/* Empty state */}
                    {!libraryLoading && libraryImages.length === 0 && (
                        <div className="text-center py-10 glass-panel rounded-2xl">
                            <span className="material-symbols-outlined text-4xl text-slate-700 mb-3 block">photo_library</span>
                            <h4 className="text-sm font-bold text-slate-500 mb-1">No images yet</h4>
                            <p className="text-xs text-slate-600">Generate images in AI Photoshoot or upload images to build your library.</p>
                        </div>
                    )}

                    {/* Image grid */}
                    {!libraryLoading && libraryImages.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-1">
                            {libraryImages.map(img => (
                                <button key={img._id} onClick={() => {
                                    setImagePreview(img.imageUrl)
                                    setContextType('upload')
                                    setImageAnalysis('')
                                    setAnalysisError('')
                                    setAnalyzing(true)
                                    agentsAPI.analyzeImage({ image: img.imageUrl, goal, platform: '', brandId, brief: img.title || '' })
                                        .then(data => {
                                            if (data.success) { setImageAnalysis(data.analysis); setDetails(data.analysis) }
                                            else setAnalysisError(data.error || 'Analysis failed')
                                        })
                                        .catch(err => setAnalysisError(err.message || 'Analysis failed'))
                                        .finally(() => setAnalyzing(false))
                                }}
                                    className="group relative rounded-xl overflow-hidden bg-black/20 cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 aspect-square">
                                    <img src={img.thumbnailUrl || img.imageUrl} alt={img.title}
                                        className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-sm text-white font-bold truncate">{img.title || 'Untitled'}</p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${img.type === 'uploaded' ? 'bg-blue-500/30 text-blue-300' : img.type === 'ai-photoshoot' ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300'} `}>
                                                {img.type === 'uploaded' ? 'Uploaded' : img.type === 'ai-photoshoot' ? 'Photoshoot' : 'Generated'}
                                            </span>
                                            <span className="text-[8px] text-slate-400">{new Date(img.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-symbols-outlined text-white text-2xl bg-primary/80 rounded-full p-2">check_circle</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Smart Product Suggestions */}
            {brandId && (
                <div className="mt-5">
                    {!showProductPanel && !loadingSuggestions && suggestedProducts.length === 0 && details.length > 5 && (
                        <button onClick={fetchSuggestions}
                            className="glass-panel w-full py-3 rounded-xl text-xs font-bold text-cyan-400 hover:bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center gap-2 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">smart_toy</span>
                            Find matching products from your catalog
                        </button>
                    )}

                    {loadingSuggestions && (
                        <div className="glass-panel p-4 rounded-xl border border-cyan-500/20 flex items-center gap-3 animate-fade-in">
                            <span className="material-symbols-outlined text-xl text-cyan-400 animate-spin">progress_activity</span>
                            <div>
                                <p className="text-base font-bold text-white">AI finding relevant products...</p>
                                <p className="text-sm text-slate-400">Matching your context to your product catalog</p>
                            </div>
                        </div>
                    )}

                    {showProductPanel && suggestedProducts.length > 0 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-cyan-400">smart_toy</span>
                                    <h4 className="text-base font-bold text-white">AI Product Match</h4>
                                    <span className="bg-cyan-500/20 text-cyan-400 text-xs px-2 py-0.5 rounded-full font-bold">{suggestedProducts.length} found</span>
                                </div>
                                <button onClick={() => setShowProductPanel(false)} className="text-slate-500 hover:text-white cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {suggestedProducts.map(p => {
                                    const isAttached = attachedProducts.some(ap => ap._id === p._id)
                                    return (
                                        <button key={p._id} onClick={() => toggleProduct(p)}
                                            className={`glass-panel rounded-xl p-2.5 text-left transition-all cursor-pointer border ${isAttached ? 'border-cyan-400/50 bg-cyan-400/5 ring-1 ring-cyan-400/30' : 'border-white/5 hover:border-cyan-400/20'
                                                } `}>
                                            {p.images?.[0]?.url && (
                                                <img src={p.images[0].url} alt={p.title}
                                                    className="w-full h-20 object-cover rounded-lg mb-2 bg-white/5" />
                                            )}
                                            <p className="text-sm font-bold text-white truncate">{p.title}</p>
                                            {p.price?.amount > 0 && (
                                                <p className="text-sm text-emerald-400 mt-0.5">₹{p.price.amount}</p>
                                            )}
                                            {isAttached && (
                                                <div className="flex items-center gap-1 mt-1.5">
                                                    <span className="material-symbols-outlined text-sm text-cyan-400">check_circle</span>
                                                    <span className="text-sm text-cyan-400 font-bold">Attached</span>
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                            {attachedProducts.length > 0 && (
                                <p className="text-sm text-cyan-400/70 mt-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">inventory_2</span>
                                    {attachedProducts.length} product{attachedProducts.length > 1 ? 's' : ''} will be included in your content
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <button onClick={handleContextComplete}
                className="btn-primary w-full py-3.5 rounded-xl mt-6 text-sm font-bold flex items-center justify-center gap-2">
                {attachedProducts.length > 0 && (
                    <span className="bg-white/20 text-xs px-2 py-0.5 rounded-full">{attachedProducts.length} product{attachedProducts.length > 1 ? 's' : ''}</span>
                )}
                Continue →
            </button>
        </div>
    )
}

function StepTone({ onComplete, onBack, goal, activeBrand, availableProviders, modelOverride, setModelOverride }) {
    const [tone, setTone] = useState('bold')
    const [length, setLength] = useState('medium')
    const [sellStyle, setSellStyle] = useState('direct')
    const showSellStyle = ['promote', 'launch'].includes(goal)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Language — default from brand profile
    const defaultLang = activeBrand?.dna?.defaultLanguage || 'english'
    const defaultStyle = activeBrand?.dna?.languageStyle || 'pure'
    const [language, setLanguage] = useState(defaultLang)
    const [langStyle, setLangStyle] = useState(defaultStyle)
    const [scriptType, setScriptType] = useState('regional')

    const LANGUAGES = [
        { id: 'english', label: 'English', flag: '🇬🇧' },
        { id: 'hindi', label: 'Hindi', flag: '🇮🇳' },
        { id: 'tamil', label: 'Tamil', flag: '🇮🇳' },
        { id: 'telugu', label: 'Telugu', flag: '🇮🇳' },
        { id: 'bengali', label: 'Bengali', flag: '🇮🇳' },
        { id: 'marathi', label: 'Marathi', flag: '🇮🇳' },
        { id: 'gujarati', label: 'Gujarati', flag: '🇮🇳' },
        { id: 'punjabi', label: 'Punjabi', flag: '🇮🇳' },
        { id: 'kannada', label: 'Kannada', flag: '🇮🇳' },
    ]

    const LANG_STYLES = [
        { id: 'pure', label: 'Pure Language', desc: 'शुद्ध भाषा', icon: 'translate' },
        { id: 'mixed', label: 'Mix with English', desc: 'Hinglish / Tanglish', icon: 'shuffle' },
        { id: 'slang', label: 'Local Slang Tone', desc: 'Casual & street', icon: 'record_voice_over' },
    ]

    const SCRIPT_SAMPLES = {
        hindi: { regional: 'हिन्दी में लिखें', roman: 'Hindi mein likhen' },
        tamil: { regional: 'தமிழில் எழுதுங்கள்', roman: 'Tamilil ezhuthungal' },
        telugu: { regional: 'తెలుగులో రాయండి', roman: 'Telugulo raayandi' },
        bengali: { regional: 'বাংলায় লিখুন', roman: 'Banglay likhun' },
        marathi: { regional: 'मराठीत लिहा', roman: 'Marathit liha' },
        gujarati: { regional: 'ગુજરાતીમાં લખો', roman: 'Gujarati maan lakho' },
        punjabi: { regional: 'ਪੰਜਾਬੀ ਵਿੱਚ ਲਿਖੋ', roman: 'Punjabi vich likho' },
        kannada: { regional: 'ಕನ್ನಡದಲ್ಲಿ ಬರೆಯಿರಿ', roman: 'Kannadadalli bareyiri' },
        arabic: { regional: 'اكتب بالعربية', roman: 'Uktub bil-arabiyya' },
        spanish: { regional: 'Escribe en español', roman: 'Escribe en español' },
        french: { regional: 'Écrivez en français', roman: 'Écrivez en français' },
        german: { regional: 'Schreib auf Deutsch', roman: 'Schreib auf Deutsch' },
        japanese: { regional: '日本語で書く', roman: 'Nihongo de kaku' },
        korean: { regional: '한국어로 쓰기', roman: 'Hangugeo-ro sseugi' },
    }

    const SCRIPT_OPTIONS = [
        { id: 'regional', label: 'Regional Script', icon: 'font_download', desc: SCRIPT_SAMPLES[language]?.regional || 'Native script' },
        { id: 'roman', label: 'Roman / English Font', icon: 'abc', desc: SCRIPT_SAMPLES[language]?.roman || 'English letters' },
    ]

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h3 className="text-xl font-extrabold text-white mb-2">Set the <span className="text-primary">vibe</span></h3>
            <p className="text-sm text-slate-400 mb-6">Language, tone, and style controls layer on top of your brand's voice.</p>

            {/* Language Selector */}
            <div className="mb-6">
                <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3">
                    <span className="material-symbols-outlined text-xs align-middle mr-1">translate</span>
                    Language
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                ${language === l.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'} `}>
                            <span className="text-sm">{l.flag}</span> {l.label}
                        </button>
                    ))}
                </div>

                {/* Language Style — only show for non-English */}
                {language !== 'english' && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 animate-fade-in">
                        {LANG_STYLES.map(s => (
                            <button key={s.id} onClick={() => setLangStyle(s.id)}
                                className={`glass-panel rounded-xl p-3 text-center transition-all cursor-pointer
                                    ${langStyle === s.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'} `}>
                                <span className={`material-symbols-outlined text-lg block mb-1 ${langStyle === s.id ? 'text-primary' : 'text-slate-500'} `}>{s.icon}</span>
                                <p className={`text-xs font-bold ${langStyle === s.id ? 'text-white' : 'text-slate-400'} `}>{s.label}</p>
                                <p className="text-xs text-slate-600">{s.desc}</p>
                            </button>
                        ))}
                    </div>
                )}

                {/* Script / Font — only for non-Latin regional languages */}
                {language !== 'english' && (
                    <div className="mt-4 animate-fade-in">
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">
                            <span className="material-symbols-outlined text-xs align-middle mr-1">font_download</span>
                            Script / Font
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {SCRIPT_OPTIONS.map(s => (
                                <button key={s.id} onClick={() => setScriptType(s.id)}
                                    className={`glass-panel rounded-xl p-3 text-center transition-all cursor-pointer
                                        ${scriptType === s.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'} `}>
                                    <span className={`material-symbols-outlined text-lg block mb-1 ${scriptType === s.id ? 'text-primary' : 'text-slate-500'} `}>{s.icon}</span>
                                    <p className={`text-xs font-bold ${scriptType === s.id ? 'text-white' : 'text-slate-400'} `}>{s.label}</p>
                                    <p className="text-xs text-slate-600 mt-0.5">{s.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Tone */}
            <div className="mb-6">
                <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3">Tone & Style</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TONES.map(t => (
                        <button key={t.id} onClick={() => setTone(t.id)}
                            className={`glass-panel rounded-xl p-3 text-center transition-all cursor-pointer ${tone === t.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'
                                } `}>
                            <span className={`material-symbols-outlined text-lg block mb-1 ${tone === t.id ? 'text-primary' : 'text-slate-500'} `}>{t.icon}</span>
                            <p className={`text-xs font-bold ${tone === t.id ? 'text-white' : 'text-slate-400'} `}>{t.label}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Length */}
            <div className="mb-6">
                <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3">Length</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {LENGTHS.map(l => (
                        <button key={l.id} onClick={() => setLength(l.id)}
                            className={`glass-panel rounded-xl p-3 text-center transition-all cursor-pointer ${length === l.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'
                                } `}>
                            <span className={`material-symbols-outlined text-lg block mb-1 ${length === l.id ? 'text-primary' : 'text-slate-500'} `}>{l.icon}</span>
                            <p className={`text-xs font-bold ${length === l.id ? 'text-white' : 'text-slate-400'} `}>{l.label}</p>
                            <p className="text-xs text-slate-600">{l.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Sell Style (for promote/launch) */}
            {showSellStyle && (
                <div className="mb-6">
                    <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3">Selling Approach</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {SELL_STYLES.map(s => (
                            <button key={s.id} onClick={() => setSellStyle(s.id)}
                                className={`glass-panel rounded-xl p-3 text-center transition-all cursor-pointer ${sellStyle === s.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'
                                    } `}>
                                <p className={`text-xs font-bold ${sellStyle === s.id ? 'text-white' : 'text-slate-400'} `}>{s.label}</p>
                                <p className="text-xs text-slate-600 mt-0.5">{s.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── AI Model (Advanced — collapsed by default) ── */}
            <div className="mb-6">
                <button onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-pointer w-full">
                    <span className="material-symbols-outlined text-xs">{showAdvanced ? 'expand_less' : 'tune'}</span>
                    <span className="uppercase tracking-widest font-bold">AI Model</span>
                    <span className="flex-1 h-px bg-white/[0.06]" />
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${modelOverride === 'auto' ? 'bg-primary/10 text-primary' : 'bg-amber-400/10 text-amber-400'} `}>
                        {modelOverride === 'auto' ? '🤖 Auto' : `👤 ${(availableProviders.find(p => p.id === modelOverride)?.label || modelOverride)} `}
                    </span>
                </button>
                {showAdvanced && (
                    <div className="mt-3 animate-fade-in">
                        <div className="grid grid-cols-2 gap-2">
                            {availableProviders.map(p => (
                                <button key={p.id} onClick={() => setModelOverride(p.id)}
                                    className={`glass-panel rounded-xl p-3 text-left transition-all cursor-pointer ${modelOverride === p.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'} `}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`material-symbols-outlined text-base ${modelOverride === p.id ? 'text-primary' : 'text-slate-500'} `}>{p.icon}</span>
                                        <span className={`text-xs font-bold ${modelOverride === p.id ? 'text-white' : 'text-slate-400'} `}>{p.label}</span>
                                    </div>
                                    <p className="text-xs text-slate-600">{p.desc}</p>
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-slate-600 mt-2 text-center">Auto mode picks the best model based on your language and content type</p>
                    </div>
                )}
            </div>

            <CreditTooltipWrapper action="content">
                <button onClick={() => onComplete({ tone, length, sellStyle, language, langStyle, scriptType })}
                    className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold">
                    <span className="material-symbols-outlined text-sm">auto_awesome</span> Generate Content <CreditBadge action="content" />
                </button>
            </CreditTooltipWrapper>
        </div>
    )
}

// ============================================================================
// PRESS RELEASE WIZARD
// ============================================================================

const PR_DISTRIBUTION = [
    { id: 'online', icon: 'language', label: 'Online Media', desc: 'TechCrunch, YourStory, Inc42, etc.' },
    { id: 'print', icon: 'newspaper', label: 'Print Media', desc: 'TOI, ET, Business Standard, etc.' },
    { id: 'tv', icon: 'live_tv', label: 'TV / Broadcast', desc: 'CNBC, NDTV, Republic, etc.' },
    { id: 'wire', icon: 'hub', label: 'News Wire', desc: 'PTI, ANI, PRNewswire, etc.' },
    { id: 'industry', icon: 'factory', label: 'Industry Publications', desc: 'Trade magazines & journals' },
    { id: 'social', icon: 'share', label: 'Social & Blog', desc: 'LinkedIn, Medium, company blog' },
]

function StepPressRelease({ onComplete, onBack, activeBrand, goal, availableProviders, modelOverride, setModelOverride }) {
    const [prStep, setPrStep] = useState(0)   // 0=purpose 1=distribution 2=quotes 3=details
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [headline, setHeadline] = useState('')
    const [purpose, setPurpose] = useState('')
    const [distribution, setDistribution] = useState([])
    const [quotes, setQuotes] = useState([{ name: '', title: '', quote: '' }])
    const [boilerplate, setBoilerplate] = useState(activeBrand?.dna?.aboutUs || '')
    const [contactName, setContactName] = useState('')
    const [contactEmail, setContactEmail] = useState('')
    const [contactPhone, setContactPhone] = useState('')
    const [city, setCity] = useState('')
    const [cta, setCta] = useState('')
    const [dateline, setDateline] = useState(new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
    const [embargo, setEmbargo] = useState(false)
    const [embargoDate, setEmbargoDate] = useState('')
    const [language, setLanguage] = useState('english')
    const [tone, setTone] = useState('professional')

    const LANGUAGES = [
        { id: 'english', label: 'English', flag: '🇬🇧' },
        { id: 'hindi', label: 'Hindi', flag: '🇮🇳' },
        { id: 'regional', label: 'Regional', flag: '🌏' },
    ]
    const PR_TONES = [
        { id: 'professional', label: 'Professional', icon: 'business_center' },
        { id: 'exciting', label: 'Exciting', icon: 'celebration' },
        { id: 'formal', label: 'Formal / Corporate', icon: 'gavel' },
        { id: 'storytelling', label: 'Storytelling', icon: 'auto_stories' },
    ]

    const toggleDistribution = (id) => {
        setDistribution(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
    }
    const addQuote = () => setQuotes(prev => [...prev, { name: '', title: '', quote: '' }])
    const updateQuote = (idx, field, val) => {
        setQuotes(prev => prev.map((q, i) => i === idx ? { ...q, [field]: val } : q))
    }
    const removeQuote = (idx) => setQuotes(prev => prev.filter((_, i) => i !== idx))

    const handleSubmit = () => {
        onComplete({
            headline,
            purpose,
            distribution,
            quotes: quotes.filter(q => q.name || q.quote),
            boilerplate,
            contact: { name: contactName, email: contactEmail, phone: contactPhone },
            city,
            dateline,
            embargo: embargo ? embargoDate : null,
            cta,
            language,
            tone,
        })
    }

    const stepTitles = ['Purpose & Headline', 'Distribution', 'Spokesperson Quotes', 'Details & Publish']

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <button onClick={prStep === 0 ? onBack : () => setPrStep(prStep - 1)}
                className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>

            <h3 className="text-xl font-extrabold text-white mb-1">
                <span className="text-rose-400">Press Release</span> — {stepTitles[prStep]}
            </h3>
            <p className="text-sm text-slate-400 mb-6">Step {prStep + 1} of 4</p>

            {/* Progress dots */}
            <div className="flex gap-1 mb-8">
                {stepTitles.map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= prStep ? 'bg-rose-400' : 'bg-white/[0.06]'} `} />
                ))}
            </div>

            {/* Step 0: Purpose & Headline */}
            {prStep === 0 && (
                <div className="space-y-5">
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Headline</p>
                        <input value={headline} onChange={e => setHeadline(e.target.value)}
                            placeholder="e.g. XYZ Corp Launches AI-Powered Platform for SMBs"
                            className="input-glass w-full py-3 px-4 rounded-xl text-sm" />
                        <p className="text-xs text-slate-600 mt-1">Leave blank to auto-generate from your description</p>
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">What is this press release about?</p>
                        <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={4}
                            placeholder="Describe the announcement in detail. What happened? Why is this important? Include key facts, numbers, dates."
                            className="input-glass w-full py-3 px-4 rounded-xl text-sm resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Language</p>
                            <div className="flex gap-2">
                                {LANGUAGES.map(l => (
                                    <button key={l.id} onClick={() => setLanguage(l.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                            ${language === l.id ? 'bg-rose-500 text-white' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'} `}>
                                        <span className="text-sm">{l.flag}</span> {l.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Tone</p>
                            <div className="flex gap-2 flex-wrap">
                                {PR_TONES.map(t => (
                                    <button key={t.id} onClick={() => setTone(t.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                            ${tone === t.id ? 'bg-rose-500 text-white' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'} `}>
                                        <span className="material-symbols-outlined text-xs">{t.icon}</span> {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setPrStep(1)} disabled={!purpose.trim()}
                        className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-30">
                        Continue → Distribution
                    </button>
                </div>
            )}

            {/* Step 1: Distribution Channels */}
            {prStep === 1 && (
                <div className="space-y-5">
                    <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3">
                        Where will this be distributed? <span className="text-slate-600 normal-case">Select all that apply</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {PR_DISTRIBUTION.map(d => (
                            <button key={d.id} onClick={() => toggleDistribution(d.id)}
                                className={`glass-panel rounded-xl p-4 text-left transition-all cursor-pointer ${distribution.includes(d.id) ? 'bg-rose-500/15 border-rose-400/40' : 'hover:bg-white/[0.05]'} `}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`material-symbols-outlined text-lg ${distribution.includes(d.id) ? 'text-rose-400' : 'text-slate-500'} `}>{d.icon}</span>
                                    <span className={`text-xs font-bold ${distribution.includes(d.id) ? 'text-white' : 'text-slate-400'} `}>{d.label}</span>
                                    {distribution.includes(d.id) && <span className="material-symbols-outlined text-rose-400 text-sm ml-auto">check_circle</span>}
                                </div>
                                <p className="text-xs text-slate-600">{d.desc}</p>
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setPrStep(2)} disabled={distribution.length === 0}
                        className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-30">
                        Continue → Quotes
                    </button>
                </div>
            )}

            {/* Step 2: Spokesperson Quotes */}
            {prStep === 2 && (
                <div className="space-y-5">
                    <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-1">Spokesperson Quotes</p>
                    <p className="text-xs text-slate-600 mb-3">Add quotes from key people. AI can also draft quotes if you leave the quote field blank.</p>

                    {quotes.map((q, idx) => (
                        <div key={idx} className="glass-panel rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-white font-bold">Quote #{idx + 1}</span>
                                {quotes.length > 1 && (
                                    <button onClick={() => removeQuote(idx)} className="text-slate-600 hover:text-rose-400 cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input value={q.name} onChange={e => updateQuote(idx, 'name', e.target.value)}
                                    placeholder="Full Name" className="input-glass py-2 px-3 rounded-lg text-xs" />
                                <input value={q.title} onChange={e => updateQuote(idx, 'title', e.target.value)}
                                    placeholder="Title (CEO, Founder, etc.)" className="input-glass py-2 px-3 rounded-lg text-xs" />
                            </div>
                            <textarea value={q.quote} onChange={e => updateQuote(idx, 'quote', e.target.value)} rows={2}
                                placeholder="Their quote (leave blank for AI to draft)"
                                className="input-glass w-full py-2 px-3 rounded-lg text-xs resize-none" />
                        </div>
                    ))}
                    <button onClick={addQuote}
                        className="text-sm text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span> Add Another Quote
                    </button>
                    <button onClick={() => setPrStep(3)}
                        className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold">
                        Continue → Details
                    </button>
                </div>
            )}

            {/* Step 3: Details & Publish */}
            {prStep === 3 && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">City / Dateline</p>
                            <input value={city} onChange={e => setCity(e.target.value)}
                                placeholder="e.g. Mumbai, New Delhi" className="input-glass w-full py-2.5 px-3 rounded-lg text-xs" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Date</p>
                            <input value={dateline} onChange={e => setDateline(e.target.value)}
                                className="input-glass w-full py-2.5 px-3 rounded-lg text-xs" />
                        </div>
                    </div>

                    {/* Embargo */}
                    <div className="glass-panel rounded-xl p-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={embargo} onChange={e => setEmbargo(e.target.checked)}
                                className="accent-rose-500" />
                            <div>
                                <p className="text-sm text-white font-bold">Embargoed Release</p>
                                <p className="text-xs text-slate-600">Not for publication until a specific date</p>
                            </div>
                        </label>
                        {embargo && (
                            <input type="datetime-local" value={embargoDate} onChange={e => setEmbargoDate(e.target.value)}
                                className="input-glass w-full py-2 px-3 rounded-lg text-xs mt-3" />
                        )}
                    </div>

                    {/* Company Boilerplate */}
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">About the Company (Boilerplate)</p>
                        <textarea value={boilerplate} onChange={e => setBoilerplate(e.target.value)} rows={3}
                            placeholder="Brief company description — auto-filled from brand profile if available"
                            className="input-glass w-full py-2 px-3 rounded-xl text-xs resize-none" />
                    </div>

                    {/* Media Contact */}
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Media Contact</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input value={contactName} onChange={e => setContactName(e.target.value)}
                                placeholder="Contact Name" className="input-glass py-2 px-3 rounded-lg text-xs" />
                            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                                placeholder="Email" className="input-glass py-2 px-3 rounded-lg text-xs" />
                            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                                placeholder="Phone" className="input-glass py-2 px-3 rounded-lg text-xs" />
                        </div>
                    </div>

                    {/* CTA */}
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2">Call to Action (Optional)</p>
                        <input value={cta} onChange={e => setCta(e.target.value)}
                            placeholder="e.g. Visit www.example.com for more info"
                            className="input-glass w-full py-2.5 px-3 rounded-lg text-xs" />
                    </div>

                    {/* ── AI Model (Advanced — collapsed by default) ── */}
                    <div className="mb-6">
                        <button onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-pointer w-full">
                            <span className="material-symbols-outlined text-xs">{showAdvanced ? 'expand_less' : 'tune'}</span>
                            <span className="uppercase tracking-widest font-bold">AI Model</span>
                            <span className="flex-1 h-px bg-white/[0.06]" />
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${modelOverride === 'auto' ? 'bg-primary/10 text-primary' : 'bg-amber-400/10 text-amber-400'} `}>
                                {modelOverride === 'auto' ? '🤖 Auto' : `👤 ${(availableProviders.find(p => p.id === modelOverride)?.label || modelOverride)} `}
                            </span>
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 animate-fade-in">
                                <div className="grid grid-cols-2 gap-2">
                                    {availableProviders.map(p => (
                                        <button key={p.id} onClick={() => setModelOverride(p.id)}
                                            className={`glass-panel rounded-xl p-3 text-left transition-all cursor-pointer ${modelOverride === p.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-white/[0.05]'} `}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`material-symbols-outlined text-base ${modelOverride === p.id ? 'text-primary' : 'text-slate-500'} `}>{p.icon}</span>
                                                <span className={`text-xs font-bold ${modelOverride === p.id ? 'text-white' : 'text-slate-400'} `}>{p.label}</span>
                                            </div>
                                            <p className="text-xs text-slate-600">{p.desc}</p>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-600 mt-2 text-center">Auto mode picks the best model based on your language and content type</p>
                            </div>
                        )}
                    </div>

                    <CreditTooltipWrapper action="content">
                        <button onClick={handleSubmit}
                            className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-600">
                            <span className="material-symbols-outlined text-sm">auto_awesome</span> Generate Press Release <CreditBadge action="content" />
                        </button>
                    </CreditTooltipWrapper>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// YOUTUBE CONTENT WIZARD
// ============================================================================

const YT_FORMATS = [
    { id: 'video', icon: 'movie', label: 'YouTube Video', desc: 'Long-form (5-60 min)', color: 'from-red-500/20 to-rose-500/10' },
    { id: 'shorts', icon: 'slow_motion_video', label: 'YouTube Shorts', desc: 'Under 60 seconds', color: 'from-pink-500/20 to-rose-500/10' },
]

const YT_LENGTHS = [
    { id: 'short', label: 'Short', desc: '5-8 min', icon: 'timer' },
    { id: 'medium', label: 'Medium', desc: '10-15 min', icon: 'schedule' },
    { id: 'long', label: 'Long', desc: '20+ min', icon: 'hourglass_top' },
]

const YT_STYLES = [
    { id: 'educational', label: 'Educational', icon: 'school' },
    { id: 'entertainment', label: 'Entertainment', icon: 'theater_comedy' },
    { id: 'storytelling', label: 'Storytelling', icon: 'auto_stories' },
    { id: 'tutorial', label: 'Tutorial', icon: 'construction' },
    { id: 'commentary', label: 'Commentary', icon: 'forum' },
    { id: 'review', label: 'Review', icon: 'star_rate' },
]

function StepYouTubeWizard({ onComplete, onBack, activeBrand, availableProviders, modelOverride, setModelOverride }) {
    const [brief, setBrief] = useState('')
    const [format, setFormat] = useState('video')
    const [videoLength, setVideoLength] = useState('medium')
    const [targetAudience, setTargetAudience] = useState('')
    const [style, setStyle] = useState('educational')
    const defaultLang = activeBrand?.dna?.defaultLanguage || 'english'
    const [language, setLanguage] = useState(defaultLang)

    const LANGUAGES = [
        { id: 'english', label: 'English', flag: '🇬🇧' },
        { id: 'hindi', label: 'Hindi', flag: '🇮🇳' },
        { id: 'tamil', label: 'Tamil', flag: '🇮🇳' },
        { id: 'telugu', label: 'Telugu', flag: '🇮🇳' },
        { id: 'bengali', label: 'Bengali', flag: '🇮🇳' },
        { id: 'marathi', label: 'Marathi', flag: '🇮🇳' },
    ]

    const handleSubmit = () => {
        if (!brief.trim()) return
        onComplete({ brief, format, videoLength: format === 'shorts' ? 'short' : videoLength, targetAudience, style, language })
    }

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl text-red-400">smart_display</span>
                </div>
                <div>
                    <h3 className="text-xl font-extrabold text-white">YouTube <span className="text-red-400">Content Creator</span></h3>
                    <p className="text-sm text-slate-400">Script, title, description, tags & keywords — YouTube algorithm optimized</p>
                </div>
            </div>

            {/* Brief Input */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Video Brief *</label>
                <div className="relative">
                    <textarea
                        value={brief} onChange={e => setBrief(e.target.value)}
                        placeholder="Describe your video idea... e.g. '5 productivity hacks for 2026 that actually work — backed by science'"
                        className="input-glass w-full py-4 pr-14 resize-none text-white" rows={4} autoFocus
                    />
                    <div className="absolute right-3 top-3">
                        <VoiceInput onResult={(text) => setBrief(prev => prev ? prev + ' ' + text : text)} size="small" />
                    </div>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">💡 Be specific — include the hook, key points, or angle you want</p>
            </div>

            {/* Format Selection */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Format</label>
                <div className="grid grid-cols-2 gap-3">
                    {YT_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setFormat(f.id)}
                            className={`glass-panel rounded-xl p-4 text-left transition-all cursor-pointer ${format === f.id ? 'bg-red-500/15 border-red-500/40 ring-1 ring-red-500/30' : 'hover:bg-white/[0.05]'}`}>
                            <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: format === f.id ? '#EF4444' : '#64748b' }}>{f.icon}</span>
                            <p className="text-sm font-bold text-white">{f.label}</p>
                            <p className="text-xs text-slate-500">{f.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Video Length (only for long-form) */}
            {format === 'video' && (
                <div className="mb-5 animate-fade-in">
                    <label className="text-sm font-bold text-slate-300 mb-2 block">Target Length</label>
                    <div className="flex gap-2">
                        {YT_LENGTHS.map(l => (
                            <button key={l.id} onClick={() => setVideoLength(l.id)}
                                className={`flex-1 glass-panel rounded-xl p-3 text-center transition-all cursor-pointer ${videoLength === l.id ? 'bg-red-500/15 border-red-500/40' : 'hover:bg-white/[0.05]'}`}>
                                <span className="material-symbols-outlined text-sm mb-1 block" style={{ color: videoLength === l.id ? '#EF4444' : '#64748b' }}>{l.icon}</span>
                                <p className="text-xs font-bold text-white">{l.label}</p>
                                <p className="text-[10px] text-slate-500">{l.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Style */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Content Style</label>
                <div className="flex flex-wrap gap-2">
                    {YT_STYLES.map(s => (
                        <button key={s.id} onClick={() => setStyle(s.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${style === s.id ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'glass-panel text-slate-400 hover:text-white'}`}>
                            <span className="material-symbols-outlined text-sm">{s.icon}</span> {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Audience */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Target Audience <span className="text-slate-600 font-normal">(optional)</span></label>
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                    placeholder="e.g. Entrepreneurs aged 25-40, tech enthusiasts, students"
                    className="input-glass w-full py-3 text-white"
                />
            </div>

            {/* Language */}
            <div className="mb-6">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Language</label>
                <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${language === l.id ? 'bg-primary/20 text-primary border border-primary/30' : 'glass-panel text-slate-400 hover:text-white'}`}>
                            {l.flag} {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Model Override */}
            {availableProviders.length > 1 && (
                <div className="mb-6 glass-panel rounded-xl p-4">
                    <label className="text-xs font-bold text-slate-400 mb-2 block flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">tune</span> AI Model
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {availableProviders.map(p => (
                            <button key={p.id} onClick={() => setModelOverride(p.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${modelOverride === p.id ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-white'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Generate Button */}
            <CreditTooltipWrapper action="content">
                <button onClick={handleSubmit} disabled={!brief.trim()}
                    className="btn-primary w-full py-4 rounded-xl text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-lg">smart_display</span>
                    Generate YouTube Content
                    <CreditBadge action="content" />
                </button>
            </CreditTooltipWrapper>
        </div>
    )
}

// ============================================================================
// YOUTUBE RESULT VIEW
// ============================================================================

function YouTubeResultView({ result, youtubeData, onNewContent, generating, activeBrand }) {
    const [copiedSection, setCopiedSection] = useState(null)
    const [expandedSections, setExpandedSections] = useState({ script: true, title: true, description: true, tags: true, keywords: true })

    const yt = youtubeData || result?.youtubeData || {}
    const meta = result?.youtubeMeta || {}

    const videoTitle = yt.videoTitle || meta.videoTitle || result?.title || ''
    const script = yt.script || result?.content || ''
    const description = yt.description || meta.description || ''
    const tags = yt.tags || meta.tags || []
    const keywords = yt.keywords || meta.keywords || {}
    const timestamps = yt.timestamps || meta.timestamps || []
    const thumbnailIdeas = yt.thumbnailTextSuggestions || meta.thumbnailIdeas || []
    const hookScript = yt.hookScript || meta.hookScript || ''
    const ctaText = yt.ctaText || meta.ctaText || ''
    const hashtags = yt.hashtags || meta.hashtags || []
    const estimatedDuration = yt.estimatedDuration || meta.estimatedDuration || ''

    const copySection = (text, section) => {
        navigator.clipboard.writeText(text)
        setCopiedSection(section)
        setTimeout(() => setCopiedSection(null), 2000)
    }

    const copyAll = () => {
        const allText = [
            `📌 TITLE:\n${videoTitle}`,
            `\n📝 SCRIPT:\n${script}`,
            `\n📋 DESCRIPTION:\n${description}`,
            `\n🏷️ TAGS:\n${tags.join(', ')}`,
            `\n🔑 KEYWORDS:\nPrimary: ${(keywords.primary || []).join(', ')}\nSecondary: ${(keywords.secondary || []).join(', ')}`,
            timestamps.length ? `\n⏱️ TIMESTAMPS:\n${timestamps.map(t => `${t.time} ${t.label}`).join('\n')}` : '',
            hashtags.length ? `\n# HASHTAGS:\n${hashtags.join(' ')}` : '',
        ].filter(Boolean).join('\n')
        copySection(allText, 'all')
    }

    const toggleSection = (key) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const SectionHeader = ({ icon, title, count, sectionKey, copyText, color = 'text-red-400' }) => (
        <div className="flex items-center justify-between mb-3">
            <button onClick={() => toggleSection(sectionKey)} className="flex items-center gap-2 cursor-pointer group">
                <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
                <h4 className="text-base font-bold text-white">{title}</h4>
                {count && <span className="text-xs bg-white/10 text-slate-400 px-2 py-0.5 rounded-full">{count}</span>}
                <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-white transition-colors">
                    {expandedSections[sectionKey] ? 'expand_less' : 'expand_more'}
                </span>
            </button>
            {copyText && (
                <button onClick={() => copySection(copyText, sectionKey)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer">
                    <span className="material-symbols-outlined text-sm">{copiedSection === sectionKey ? 'check' : 'content_copy'}</span>
                    {copiedSection === sectionKey ? 'Copied!' : 'Copy'}
                </button>
            )}
        </div>
    )

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-500/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl text-red-400">smart_display</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-extrabold text-white">YouTube Content <span className="text-red-400">Ready</span></h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            {estimatedDuration && <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold">{estimatedDuration}</span>}
                            <span className="text-xs text-slate-500">{script.split(/\s+/).length} words</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={copyAll} className="glass-panel px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all">
                        <span className="material-symbols-outlined text-sm">{copiedSection === 'all' ? 'check' : 'content_copy'}</span>
                        {copiedSection === 'all' ? 'Copied All!' : 'Copy All'}
                    </button>
                    <button onClick={onNewContent} className="glass-panel px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all">
                        <span className="material-symbols-outlined text-sm">add</span> New
                    </button>
                </div>
            </div>

            {/* Hook callout */}
            {hookScript && (
                <div className="glass-panel rounded-2xl p-4 mb-4 border border-amber-500/20 bg-amber-500/5 animate-fade-in">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-amber-400">bolt</span>
                        <h4 className="text-sm font-bold text-amber-400">Opening Hook — First 5 Seconds</h4>
                        <button onClick={() => copySection(hookScript, 'hook')}
                            className="ml-auto text-xs text-slate-500 hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'hook' ? 'check' : 'content_copy'}</span>
                        </button>
                    </div>
                    <p className="text-sm text-amber-200/80 italic leading-relaxed">"{hookScript}"</p>
                </div>
            )}

            {/* Title Section */}
            <div className="glass-panel rounded-2xl p-5 mb-4">
                <SectionHeader icon="title" title="Video Title" sectionKey="title" copyText={videoTitle} color="text-blue-400" />
                {expandedSections.title && (
                    <div className="animate-fade-in">
                        <p className="text-lg font-bold text-white leading-relaxed">{videoTitle}</p>
                        <div className="flex items-center gap-2 mt-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${videoTitle.length <= 70 ? 'bg-emerald-500/10 text-emerald-400' : videoTitle.length <= 100 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {videoTitle.length} chars {videoTitle.length <= 70 ? '✓ Optimal' : videoTitle.length <= 100 ? '⚠ Long' : '❌ Too long'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Script Section */}
            <div className="glass-panel rounded-2xl p-5 mb-4">
                <SectionHeader icon="movie" title="Video Script" count={`${script.split(/\s+/).length} words`} sectionKey="script" copyText={script} />
                {expandedSections.script && (
                    <div className="animate-fade-in text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                        {script}
                    </div>
                )}
            </div>

            {/* Description Section */}
            <div className="glass-panel rounded-2xl p-5 mb-4">
                <SectionHeader icon="description" title="YouTube Description" sectionKey="description" copyText={description} color="text-emerald-400" />
                {expandedSections.description && (
                    <div className="animate-fade-in text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {description}
                    </div>
                )}
            </div>

            {/* Tags Section */}
            {tags.length > 0 && (
                <div className="glass-panel rounded-2xl p-5 mb-4">
                    <SectionHeader icon="sell" title="Tags" count={`${tags.length} tags`} sectionKey="tags" copyText={tags.join(', ')} color="text-violet-400" />
                    {expandedSections.tags && (
                        <div className="animate-fade-in flex flex-wrap gap-2">
                            {tags.map((tag, i) => (
                                <button key={i} onClick={() => copySection(tag, `tag-${i}`)}
                                    className="px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors cursor-pointer border border-violet-500/20">
                                    {copiedSection === `tag-${i}` ? '✓' : ''} {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Keywords Section */}
            {(keywords.primary?.length > 0 || keywords.secondary?.length > 0) && (
                <div className="glass-panel rounded-2xl p-5 mb-4">
                    <SectionHeader icon="key" title="Keywords" sectionKey="keywords"
                        copyText={`Primary: ${(keywords.primary || []).join(', ')}\nSecondary: ${(keywords.secondary || []).join(', ')}`} color="text-cyan-400" />
                    {expandedSections.keywords && (
                        <div className="animate-fade-in space-y-3">
                            {keywords.primary?.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-cyan-400 mb-1.5">🎯 Primary Keywords</p>
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.primary.map((kw, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 text-xs font-bold border border-cyan-500/20">{kw}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {keywords.secondary?.length > 0 && (
                                <div>
                                    <p className="text-xs font-bold text-slate-500 mb-1.5">📌 Secondary Keywords</p>
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.secondary.map((kw, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 text-xs font-medium border border-white/10">{kw}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Timestamps + Thumbnail Ideas row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Timestamps */}
                {timestamps.length > 0 && (
                    <div className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-lg text-orange-400">schedule</span>
                            <h4 className="text-sm font-bold text-white">Timestamps</h4>
                            <button onClick={() => copySection(timestamps.map(t => `${t.time} ${t.label}`).join('\n'), 'timestamps')}
                                className="ml-auto text-xs text-slate-500 hover:text-white cursor-pointer">
                                <span className="material-symbols-outlined text-sm">{copiedSection === 'timestamps' ? 'check' : 'content_copy'}</span>
                            </button>
                        </div>
                        <div className="space-y-1.5">
                            {timestamps.map((ts, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="text-orange-400 font-mono font-bold min-w-[40px]">{ts.time}</span>
                                    <span className="text-slate-300">{ts.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Thumbnail Ideas */}
                {thumbnailIdeas.length > 0 && (
                    <div className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-lg text-pink-400">image</span>
                            <h4 className="text-sm font-bold text-white">Thumbnail Ideas</h4>
                        </div>
                        <div className="space-y-2">
                            {thumbnailIdeas.map((idea, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs">
                                    <span className="text-pink-400 font-bold mt-0.5">{i + 1}.</span>
                                    <span className="text-slate-300 leading-relaxed">{idea}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Hashtags + CTA */}
            {(hashtags.length > 0 || ctaText) && (
                <div className="glass-panel rounded-2xl p-5 mb-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {hashtags.length > 0 && (
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-500 mb-1.5">Hashtags</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {hashtags.map((h, i) => (
                                        <span key={i} className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg font-medium">{h}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {ctaText && (
                            <div className="flex-1 min-w-[200px]">
                                <p className="text-xs font-bold text-slate-500 mb-1.5">CTA</p>
                                <p className="text-sm text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded-xl font-medium leading-relaxed">{ctaText}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4 mt-6">
                <button onClick={copyAll}
                    className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer text-center group border border-white/[0.06]">
                    <span className="material-symbols-outlined text-2xl text-emerald-400 mb-2 block group-hover:scale-110 transition-transform">
                        {copiedSection === 'all' ? 'check_circle' : 'content_copy'}
                    </span>
                    <p className="text-sm font-bold text-white">{copiedSection === 'all' ? 'Copied!' : 'Copy Everything'}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Title + Script + Description + Tags</p>
                </button>
                <button onClick={onNewContent}
                    className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-red-500/30 transition-all cursor-pointer text-center group border border-white/[0.06]">
                    <span className="material-symbols-outlined text-2xl text-red-400 mb-2 block group-hover:scale-110 transition-transform">smart_display</span>
                    <p className="text-sm font-bold text-white">Create Another</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Start a new YouTube content</p>
                </button>
            </div>
        </div>
    )
}

// ============================================================================
// YOUTUBE SEO / PUBLISH OPTIMIZER WIZARD (metadata only — no script)
// ============================================================================

function StepYouTubeSeoWizard({ onComplete, onBack, activeBrand, availableProviders, modelOverride, setModelOverride }) {
    const [brief, setBrief] = useState('')
    const [format, setFormat] = useState('video')
    const [videoCategory, setVideoCategory] = useState('')
    const [targetAudience, setTargetAudience] = useState('')
    const defaultLang = activeBrand?.dna?.defaultLanguage || 'english'
    const [language, setLanguage] = useState(defaultLang)

    const VIDEO_CATEGORIES = [
        { id: 'music_video', icon: 'music_note', label: '🎵 Music Video / Song', desc: 'Music video, lyric video, song release' },
        { id: 'film_trailer', icon: 'movie', label: '🎬 Film / Trailer / Short Film', desc: 'Movie, web series, short film' },
        { id: 'review_unboxing', icon: 'rate_review', label: '📱 Review / Unboxing', desc: 'Product review, tech review, comparison' },
        { id: 'tutorial', icon: 'school', label: '📚 Tutorial / How-To', desc: 'Educational, how-to, guide' },
        { id: 'podcast_interview', icon: 'podcasts', label: '🎙️ Podcast / Interview', desc: 'Podcast episode, guest interview' },
        { id: 'vlog_travel', icon: 'videocam', label: '📷 Vlog / Travel / Lifestyle', desc: 'Daily vlog, travel, experience' },
        { id: 'gaming', icon: 'sports_esports', label: '🎮 Gaming / Entertainment', desc: 'Gameplay, walkthrough, reaction' },
        { id: 'business', icon: 'trending_up', label: '💼 Business / Motivational', desc: 'Marketing, business, motivation' },
    ]

    const LANGUAGES = [
        { id: 'english', label: 'English', flag: '🇬🇧' },
        { id: 'hindi', label: 'Hindi', flag: '🇮🇳' },
        { id: 'tamil', label: 'Tamil', flag: '🇮🇳' },
        { id: 'telugu', label: 'Telugu', flag: '🇮🇳' },
        { id: 'bengali', label: 'Bengali', flag: '🇮🇳' },
        { id: 'marathi', label: 'Marathi', flag: '🇮🇳' },
    ]

    const handleSubmit = () => {
        if (!brief.trim()) return
        onComplete({ brief, format, videoCategory, targetAudience, language })
    }

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-2xl text-emerald-400">rocket_launch</span>
                </div>
                <div>
                    <h3 className="text-xl font-extrabold text-white">YouTube <span className="text-emerald-400">Publish Optimizer</span></h3>
                    <p className="text-sm text-slate-400">Algorithm-optimized title, description, tags & keywords — no script needed</p>
                </div>
            </div>

            {/* Info callout */}
            <div className="glass-panel rounded-xl p-4 mb-5 border border-emerald-500/20 bg-emerald-500/5">
                <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-lg mt-0.5">info</span>
                    <div>
                        <p className="text-xs text-emerald-300 font-bold mb-1">Already have your video? Just need the SEO metadata.</p>
                        <p className="text-xs text-slate-400">We'll analyze YouTube search trends and generate 3 title options, a perfectly structured description, 20-30 tags, and keyword strategy — all optimized for the latest YouTube algorithm.</p>
                    </div>
                </div>
            </div>

            {/* Topic/Brief */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">What's your video about? *</label>
                <div className="relative">
                    <textarea
                        value={brief} onChange={e => setBrief(e.target.value)}
                        placeholder="e.g. 'Rambha Ho music video by Usha Uthup' or 'iPhone 17 Pro full review and comparison'"
                        className="input-glass w-full py-4 pr-14 resize-none text-white" rows={3} autoFocus
                    />
                    <div className="absolute right-3 top-3">
                        <VoiceInput onResult={(text) => setBrief(prev => prev ? prev + ' ' + text : text)} size="small" />
                    </div>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">💡 Include specific names — artists, products, brands, topics. We'll research them for accurate metadata</p>
            </div>

            {/* Video Category — CRITICAL for context-aware output */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Video Category *</label>
                <p className="text-xs text-slate-500 mb-3">This determines the metadata format — music videos get different SEO than tutorials</p>
                <div className="grid grid-cols-2 gap-2">
                    {VIDEO_CATEGORIES.map(cat => (
                        <button key={cat.id} onClick={() => setVideoCategory(cat.id)}
                            className={`glass-panel rounded-xl p-3 text-left transition-all cursor-pointer ${videoCategory === cat.id
                                ? 'bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30'
                                : 'hover:bg-white/[0.05]'}`}>
                            <p className="text-sm font-bold text-white">{cat.label}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">{cat.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Format */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Format</label>
                <div className="grid grid-cols-2 gap-3">
                    {YT_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setFormat(f.id)}
                            className={`glass-panel rounded-xl p-4 text-left transition-all cursor-pointer ${format === f.id ? 'bg-emerald-500/15 border-emerald-500/40 ring-1 ring-emerald-500/30' : 'hover:bg-white/[0.05]'}`}>
                            <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: format === f.id ? '#10B981' : '#64748b' }}>{f.icon}</span>
                            <p className="text-sm font-bold text-white">{f.label}</p>
                            <p className="text-xs text-slate-500">{f.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Audience */}
            <div className="mb-5">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Target Audience <span className="text-slate-600 font-normal">(optional)</span></label>
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                    placeholder="e.g. Entrepreneurs, tech enthusiasts, beginners, students"
                    className="input-glass w-full py-3 text-white"
                />
            </div>

            {/* Language */}
            <div className="mb-6">
                <label className="text-sm font-bold text-slate-300 mb-2 block">Language</label>
                <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${language === l.id ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'glass-panel text-slate-400 hover:text-white'}`}>
                            {l.flag} {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate Button */}
            <CreditTooltipWrapper action="content">
                <button onClick={handleSubmit} disabled={!brief.trim() || !videoCategory}
                    className="w-full py-4 rounded-xl text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-2 cursor-pointer bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white transition-all shadow-lg shadow-emerald-500/20">
                    <span className="material-symbols-outlined text-lg">rocket_launch</span>
                    Optimize for YouTube
                    <CreditBadge action="content" />
                </button>
            </CreditTooltipWrapper>
        </div>
    )
}

// ============================================================================
// YOUTUBE SEO RESULT VIEW (metadata only — no script)
// ============================================================================

function YouTubeSeoResultView({ result, youtubeSeoData, onNewContent }) {
    const [copiedSection, setCopiedSection] = useState(null)
    const [selectedTitle, setSelectedTitle] = useState(0)

    const seo = youtubeSeoData || result?.youtubeSeoData || {}
    const meta = result?.youtubeMeta || {}

    const titles = seo.titles || meta.titleOptions || []
    const description = seo.description || meta.description || ''
    const tags = seo.tags || meta.tags || []
    const keywords = seo.keywords || meta.keywords || {}
    const hashtags = seo.hashtags || meta.hashtags || []
    const seoScore = seo.seoScore || meta.seoScore || {}
    const competitorInsight = seo.competitorInsight || meta.competitorInsight || ''

    const copySection = (text, section) => {
        navigator.clipboard.writeText(text)
        setCopiedSection(section)
        setTimeout(() => setCopiedSection(null), 2000)
    }

    const copyAll = () => {
        const selectedTitleText = titles[selectedTitle]?.text || titles[0]?.text || ''
        const allText = [
            `📌 TITLE:\n${selectedTitleText}`,
            `\n📋 DESCRIPTION:\n${description}`,
            `\n🏷️ TAGS:\n${tags.join(', ')}`,
            `\n🔑 KEYWORDS:\nPrimary: ${(keywords.primary || []).join(', ')}\nSecondary: ${(keywords.secondary || []).join(', ')}`,
            hashtags.length ? `\n# HASHTAGS:\n${hashtags.join(' ')}` : '',
        ].filter(Boolean).join('\n')
        copySection(allText, 'all')
    }

    const getTitleColor = (charCount) => {
        if (charCount <= 55) return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: '✓ Optimal', border: 'border-emerald-500/30' }
        if (charCount <= 70) return { bg: 'bg-amber-500/10', text: 'text-amber-400', label: '⚠ Slightly long', border: 'border-amber-500/30' }
        return { bg: 'bg-rose-500/10', text: 'text-rose-400', label: '❌ Too long', border: 'border-rose-500/30' }
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-2xl text-emerald-400">rocket_launch</span>
                    </div>
                    <div>
                        <h3 className="text-xl font-extrabold text-white">YouTube SEO <span className="text-emerald-400">Ready</span></h3>
                        <p className="text-xs text-slate-500 mt-0.5">Copy-paste directly into YouTube Studio</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={copyAll} className="glass-panel px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all">
                        <span className="material-symbols-outlined text-sm">{copiedSection === 'all' ? 'check' : 'content_copy'}</span>
                        {copiedSection === 'all' ? 'Copied All!' : 'Copy All'}
                    </button>
                    <button onClick={onNewContent} className="glass-panel px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-all">
                        <span className="material-symbols-outlined text-sm">add</span> New
                    </button>
                </div>
            </div>

            {/* Title Options — the star of the show */}
            <div className="glass-panel rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-blue-400">title</span>
                        <h4 className="text-base font-bold text-white">Title Options</h4>
                        <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-bold">{titles.length} options</span>
                    </div>
                    {titles[selectedTitle]?.text && (
                        <button onClick={() => copySection(titles[selectedTitle].text, 'title')}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'title' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'title' ? 'Copied!' : 'Copy Selected'}
                        </button>
                    )}
                </div>
                <div className="space-y-3">
                    {titles.map((t, i) => {
                        const charCount = t.charCount || t.text?.length || 0
                        const color = getTitleColor(charCount)
                        return (
                            <button key={i} onClick={() => setSelectedTitle(i)}
                                className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedTitle === i
                                    ? `${color.bg} ${color.border} ring-1 ring-white/10`
                                    : 'border-transparent bg-white/[0.02] hover:bg-white/[0.04]'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <p className="text-base font-bold text-white leading-relaxed">{t.text}</p>
                                        {t.strategy && <p className="text-xs text-slate-500 mt-1.5 italic">💡 {t.strategy}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color.bg} ${color.text}`}>
                                            {charCount} chars {color.label}
                                        </span>
                                        {selectedTitle === i && (
                                            <span className="text-[10px] text-emerald-400 font-bold">✓ Selected</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Description */}
            <div className="glass-panel rounded-2xl p-5 mb-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-emerald-400">description</span>
                        <h4 className="text-base font-bold text-white">YouTube Description</h4>
                    </div>
                    <button onClick={() => copySection(description, 'description')}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">{copiedSection === 'description' ? 'check' : 'content_copy'}</span>
                        {copiedSection === 'description' ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto pr-2 custom-scrollbar bg-white/[0.02] rounded-xl p-4">
                    {description}
                </div>
                <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-slate-600">{description.length} chars • {description.split(/\s+/).length} words</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${description.length >= 300 && description.length <= 500 ? 'bg-emerald-500/10 text-emerald-400' : description.length > 500 ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>
                        {description.length >= 300 && description.length <= 500 ? '✓ Optimal length' : description.length > 500 ? '✓ Good length' : '⚠ Short — aim for 300-500 words'}
                    </span>
                </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
                <div className="glass-panel rounded-2xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-violet-400">sell</span>
                            <h4 className="text-base font-bold text-white">Tags</h4>
                            <span className="text-xs bg-violet-500/10 text-violet-400 px-2 py-0.5 rounded-full font-bold">{tags.length} tags</span>
                        </div>
                        <button onClick={() => copySection(tags.join(', '), 'tags')}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'tags' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'tags' ? 'Copied!' : 'Copy All Tags'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag, i) => (
                            <button key={i} onClick={() => copySection(tag, `tag-${i}`)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${i === 0
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-bold'
                                    : 'bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 border-violet-500/20'}`}>
                                {copiedSection === `tag-${i}` ? '✓' : ''} {tag}
                                {i === 0 && <span className="ml-1 text-[8px] text-emerald-400">PRIMARY</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Keywords */}
            {(keywords.primary?.length > 0 || keywords.secondary?.length > 0) && (
                <div className="glass-panel rounded-2xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-cyan-400">key</span>
                            <h4 className="text-base font-bold text-white">Keywords Strategy</h4>
                        </div>
                        <button onClick={() => copySection(`Primary: ${(keywords.primary || []).join(', ')}\nSecondary: ${(keywords.secondary || []).join(', ')}`, 'keywords')}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'keywords' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'keywords' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="space-y-3">
                        {keywords.primary?.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-cyan-400 mb-1.5">🎯 Primary — High Volume Search Terms</p>
                                <div className="flex flex-wrap gap-2">
                                    {keywords.primary.map((kw, i) => (
                                        <span key={i} className="px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-300 text-xs font-bold border border-cyan-500/20">{kw}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {keywords.secondary?.length > 0 && (
                            <div>
                                <p className="text-xs font-bold text-slate-500 mb-1.5">📌 Secondary — Long-Tail & LSI</p>
                                <div className="flex flex-wrap gap-2">
                                    {keywords.secondary.map((kw, i) => (
                                        <span key={i} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-400 text-xs font-medium border border-white/10">{kw}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SEO Score + Competitor Insight */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* SEO Score */}
                {seoScore.overallScore && (
                    <div className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-lg text-amber-400">analytics</span>
                            <h4 className="text-sm font-bold text-white">SEO Score</h4>
                        </div>
                        <div className="flex items-center justify-center mb-4">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black border-4 ${seoScore.overallScore >= 8 ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : seoScore.overallScore >= 6 ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-rose-500 text-rose-400 bg-rose-500/10'}`}>
                                {seoScore.overallScore}/10
                            </div>
                        </div>
                        <div className="space-y-1.5 text-xs">
                            {seoScore.titleOptimization && <p className="text-slate-400">📌 Title: <span className="text-white">{seoScore.titleOptimization}</span></p>}
                            {seoScore.descriptionOptimization && <p className="text-slate-400">📋 Desc: <span className="text-white">{seoScore.descriptionOptimization}</span></p>}
                            {seoScore.tagCoverage && <p className="text-slate-400">🏷️ Tags: <span className="text-white">{seoScore.tagCoverage}</span></p>}
                        </div>
                    </div>
                )}

                {/* Competitor Insight */}
                {competitorInsight && (
                    <div className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-lg text-pink-400">psychology</span>
                            <h4 className="text-sm font-bold text-white">Competitor Insight</h4>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed">{competitorInsight}</p>
                    </div>
                )}
            </div>

            {/* Hashtags */}
            {hashtags.length > 0 && (
                <div className="glass-panel rounded-2xl p-5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-blue-400">tag</span>
                            <h4 className="text-sm font-bold text-white">Hashtags</h4>
                        </div>
                        <button onClick={() => copySection(hashtags.join(' '), 'hashtags')}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'hashtags' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'hashtags' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {hashtags.map((h, i) => (
                            <span key={i} className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg font-medium border border-blue-500/20">{h}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4 mt-6">
                <button onClick={copyAll}
                    className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer text-center group border border-white/[0.06]">
                    <span className="material-symbols-outlined text-2xl text-emerald-400 mb-2 block group-hover:scale-110 transition-transform">
                        {copiedSection === 'all' ? 'check_circle' : 'content_copy'}
                    </span>
                    <p className="text-sm font-bold text-white">{copiedSection === 'all' ? 'Copied!' : 'Copy Everything'}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Title + Description + Tags + Keywords</p>
                </button>
                <button onClick={onNewContent}
                    className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer text-center group border border-white/[0.06]">
                    <span className="material-symbols-outlined text-2xl text-emerald-400 mb-2 block group-hover:scale-110 transition-transform">rocket_launch</span>
                    <p className="text-sm font-bold text-white">Optimize Another</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Generate SEO for a new video</p>
                </button>
            </div>
        </div>
    )
}

// ============================================================================
// RESULT VIEW (with Edit & AI Refine)
// ============================================================================

function ResultView({ result, onRegenerate, onFeedback, onNewContent, generating, activeBrand, onCreateVisual, accepted, onRefine, contentFeedback, imageUrl }) {
    const [copied, setCopied] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editContent, setEditContent] = useState(result?.content || '')
    const [refineInput, setRefineInput] = useState('')
    const [refining, setRefining] = useState(false)
    const [showPublish, setShowPublish] = useState(false)
    const refineRef = useRef(null)

    // Keep editContent in sync when result changes
    useEffect(() => { setEditContent(result?.content || '') }, [result?.content])

    function handleCopy() {
        navigator.clipboard.writeText(stripMarkdown(editing ? editContent : result.content))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    function handleSaveEdit() {
        if (editContent !== result.content) {
            // Save manual edit via callback
            onRefine && onRefine({ manualEdit: editContent })
        }
        setEditing(false)
    }

    async function handleAIRefine() {
        if (!refineInput.trim() || refining) return
        setRefining(true)
        try {
            const data = result._id
                ? await contentAPI.refine(result._id, { instruction: refineInput, currentContent: editContent })
                : await contentAPI.refineText({ instruction: refineInput, currentContent: editContent, brandId: activeBrand?._id })
            if (data.success && data.content) {
                setEditContent(data.content)
                onRefine && onRefine({ refined: data.content, aiMeta: data.aiMeta })
            }
        } catch (err) {
            console.error('Refine error:', err)
        } finally {
            setRefining(false)
            setRefineInput('')
        }
    }

    const REFINE_SUGGESTIONS = [
        'Make it shorter', 'Add urgency', 'Make it more professional',
        'Add emojis', 'More conversational', 'Add a hook at the start',
    ]

    // Post-accept success view
    if (accepted) {
        return (
            <div className="max-w-3xl mx-auto animate-fade-in">
                <div className="text-center mb-8">
                    <div className="size-16 rounded-full bg-emerald-400/20 flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-3xl text-emerald-400">check_circle</span>
                    </div>
                    <h3 className="text-2xl font-extrabold text-white">Content <span className="text-emerald-400">Saved!</span></h3>
                    <p className="text-sm text-slate-400 mt-2">Your content has been saved to history. What would you like to do next?</p>
                </div>

                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm text-emerald-400 font-bold bg-emerald-400/10 px-2.5 py-1 rounded-lg">✓ Approved</span>
                        <span className="text-sm text-primary font-bold bg-primary/10 px-2.5 py-1 rounded-lg">{result.type}</span>
                        <span className="text-sm text-slate-500">{result.content?.split(/\s+/).length} words</span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">{result.content}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <button onClick={onCreateVisual}
                        className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-primary/30 transition-all cursor-pointer text-left group border border-white/[0.06]">
                        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-2xl">image</span>
                        </div>
                        <h4 className="text-base font-bold text-white mb-1">Create Matching Visual</h4>
                        <p className="text-[11px] text-slate-500">Generate an image that matches this content in Creative Studio</p>
                    </button>
                    <button onClick={() => { navigator.clipboard.writeText(stripMarkdown(result.content)); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                        className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-emerald-500/30 transition-all cursor-pointer text-left group border border-white/[0.06]">
                        <div className="size-12 rounded-xl bg-emerald-400/10 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-2xl">{copied ? 'check' : 'content_copy'}</span>
                        </div>
                        <h4 className="text-base font-bold text-white mb-1">{copied ? 'Copied!' : 'Copy to Clipboard'}</h4>
                        <p className="text-[11px] text-slate-500">Copy the content to paste on your platform</p>
                    </button>
                    <button onClick={onNewContent}
                        className="glass-panel rounded-2xl p-5 hover:bg-white/[0.05] hover:border-violet-500/30 transition-all cursor-pointer text-left group border border-white/[0.06]">
                        <div className="size-12 rounded-xl bg-violet-400/10 flex items-center justify-center text-violet-400 mb-3 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-2xl">add_circle</span>
                        </div>
                        <h4 className="text-base font-bold text-white mb-1">Create New Content</h4>
                        <p className="text-[11px] text-slate-500">Start a new content generation from scratch</p>
                    </button>
                </div>
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                    <p className="text-sm text-primary font-bold">🧠 AI is learning from your acceptance</p>
                    <p className="text-sm text-slate-500">Future content will align closer to this style and tone</p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-xl font-extrabold text-white">Your Content is <span className="text-primary">Ready</span></h3>
                    <p className="text-sm text-slate-400 mt-1">
                        Generated for {activeBrand?.name} • Brand voice: {activeBrand?.dna?.voice?.personality || 'Active'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setEditing(!editing); if (!editing) setTimeout(() => refineRef.current?.focus(), 100) }}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${editing ? 'bg-amber-400/20 text-amber-400 border border-amber-400/30' : 'glass-panel text-slate-400 hover:text-white border border-white/[0.1]'} `}>
                        <span className="material-symbols-outlined text-sm">{editing ? 'edit_off' : 'edit'}</span>
                        {editing ? 'Done Editing' : 'Edit & Refine'}
                    </button>
                    <button onClick={onNewContent} className="btn-glass px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-white border border-white/[0.1] cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span> New
                    </button>
                </div>
            </div>

            {/* Content Card */}
            <div className="glass-panel rounded-2xl p-8 mb-4">
                {/* Meta */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-white/[0.06]">
                    <span className="text-sm text-primary font-bold bg-primary/10 px-2.5 py-1 rounded-lg">{result.type}</span>
                    <span className="text-sm text-slate-500">{(editing ? editContent : result.content)?.split(/\s+/).length} words</span>
                    {result.aiMeta?.provider && (
                        <span className="text-sm text-slate-500 bg-white/[0.04] px-2 py-0.5 rounded-full flex items-center gap-1">
                            {result.aiMeta.routingIcon || '🤖'} {result.aiMeta.provider}
                            {result.aiMeta.routingReason && <span className="text-slate-600">— {result.aiMeta.routingReason}</span>}
                        </span>
                    )}
                    {result.aiMeta?.brandAlignmentScore && (
                        <span className="ml-auto text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-lg">
                            {result.aiMeta.brandAlignmentScore}% Brand Match
                        </span>
                    )}
                </div>

                {/* Content — editable or read-only */}
                {editing ? (
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                        className="w-full bg-transparent text-white text-base leading-relaxed border border-white/[0.1] rounded-xl p-4 resize-none focus:border-primary/40 focus:outline-none transition-colors"
                        rows={Math.max(6, editContent.split('\n').length + 2)} />
                ) : (
                    <div className="text-white text-base leading-relaxed whitespace-pre-wrap">
                        {stripMarkdown(result.content)}
                    </div>
                )}
            </div>

            {/* AI Refine Bar — always visible when editing */}
            {editing && (
                <div className="glass-panel rounded-2xl p-4 mb-4 animate-fade-in">
                    <p className="text-sm text-amber-400 font-bold mb-3 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">auto_fix_high</span> AI Refine
                    </p>
                    {/* Quick suggestions */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {REFINE_SUGGESTIONS.map(s => (
                            <button key={s} onClick={() => { setRefineInput(s); }}
                                className="text-xs px-2.5 py-1 rounded-full bg-white/[0.04] text-slate-400 hover:bg-amber-400/10 hover:text-amber-400 transition-all cursor-pointer border border-white/[0.06] font-medium">
                                {s}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input ref={refineRef} value={refineInput} onChange={e => setRefineInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAIRefine()}
                            placeholder="Tell AI how to improve this... e.g. 'make it shorter and add CTA'"
                            className="input-glass flex-1 py-2.5 px-4 rounded-xl text-sm" />
                        <CreditTooltipWrapper action="contentRefine">
                            <button onClick={handleAIRefine} disabled={!refineInput.trim() || refining}
                                className="btn-primary px-5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-30 flex items-center gap-1.5">
                                {refining ? (
                                    <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Refining...</>
                                ) : (
                                    <><span className="material-symbols-outlined text-sm">auto_fix_high</span> Refine <CreditBadge action="contentRefine" /></>
                                )}
                            </button>
                        </CreditTooltipWrapper>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mb-4">
                <button onClick={handleCopy}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${copied ? 'bg-emerald-400/20 text-emerald-400 border border-emerald-400/30' : 'glass-panel text-white hover:bg-white/[0.06]'} `}>
                    <span className="material-symbols-outlined text-lg">{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'Copied!' : 'Copy'}
                </button>
                {editing ? (
                    <button onClick={handleSaveEdit}
                        className="flex-1 btn-primary py-3 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600">
                        <span className="material-symbols-outlined text-lg">save</span> Save Edits
                    </button>
                ) : (
                    <button onClick={() => onFeedback('accept')}
                        className="flex-1 btn-primary py-3 rounded-xl text-sm font-bold">
                        <span className="material-symbols-outlined text-lg">check</span> Accept & Save
                    </button>
                )}
                <button onClick={onCreateVisual}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold glass-panel text-primary hover:bg-primary/10 transition-all cursor-pointer border border-primary/20">
                    <span className="material-symbols-outlined text-lg">image</span> Create Visual
                </button>
                <button onClick={() => setShowPublish(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 transition-all cursor-pointer border border-[#1877F2]/30">
                    <span className="material-symbols-outlined text-lg">share</span> Publish
                </button>
            </div>

            <PublishModal
                isOpen={showPublish}
                onClose={() => setShowPublish(false)}
                defaultText={result?.content || ''}
                defaultImage={imageUrl}
                brandId={activeBrand?._id}
            />

            <div className="flex gap-2">
                <button onClick={() => onFeedback('thumbs', { thumbs: 'up' })}
                    className={`flex-1 glass-panel py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${contentFeedback === 'liked'
                        ? 'text-emerald-400 bg-emerald-400/15 border border-emerald-400/30'
                        : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/5'
                        } `}>
                    <span className="material-symbols-outlined text-sm">thumb_up</span> {contentFeedback === 'liked' ? 'Liked ✓' : 'Good'}
                </button>
                <button onClick={() => onFeedback('thumbs', { thumbs: 'down' })}
                    className={`flex-1 glass-panel py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${contentFeedback === 'disliked'
                        ? 'text-rose-400 bg-rose-400/15 border border-rose-400/30'
                        : 'text-slate-400 hover:text-rose-400 hover:bg-rose-400/5'
                        } `}>
                    <span className="material-symbols-outlined text-sm">thumb_down</span> {contentFeedback === 'disliked' ? 'Noted ✓' : 'Not Right'}
                </button>
                <CreditTooltipWrapper action="contentRefine">
                    <button onClick={onRegenerate} disabled={generating}
                        className="flex-1 glass-panel py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer font-bold disabled:opacity-30">
                        <span className={`material-symbols-outlined text-sm ${generating ? 'animate-spin' : ''}`}>{generating ? 'progress_activity' : 'refresh'}</span>
                        {generating ? 'Regenerating...' : 'Regenerate'} {!generating && <CreditBadge action="contentRefine" />}
                    </button>
                </CreditTooltipWrapper>
            </div>

            {/* Learning note */}
            <div className="mt-6 p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                <p className="text-sm text-primary font-bold">🧠 Every action teaches the AI your preferences</p>
                <p className="text-sm text-slate-500">Accept → AI replicates style • Edit → AI learns your preferences • Refine → AI adapts to your feedback</p>
            </div>
        </div>
    )
}

// ============================================================
// CONTENT HISTORY SIDEBAR
// ============================================================
function ContentHistory({ brandId, onSelect, visible, onToggle }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!visible || !brandId) return
        setLoading(true)
        contentAPI.list({ brandId, limit: 20 })
            .then(data => setItems(data.content || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false))
    }, [visible, brandId])

    if (!visible) return null

    return (
        <>
            {/* Backdrop overlay */}
            <div className="fixed inset-0 bg-black/40 z-40 animate-fade-in" onClick={onToggle} />
            <div className="fixed right-0 top-0 h-screen w-80 bg-[#0c0f1a]/95 backdrop-blur-xl border-l border-white/[0.08] z-50 flex flex-col animate-fade-in shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">history</span>
                        <h3 className="text-base font-bold text-white">Content History</h3>
                    </div>
                    <button onClick={onToggle} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                            <p className="text-sm text-slate-500 mt-2">Loading history...</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-4xl text-slate-700 block mb-2">inbox</span>
                            <p className="text-sm text-slate-500">No content generated yet</p>
                            <p className="text-xs text-slate-600 mt-1">Generated content will appear here</p>
                        </div>
                    ) : items.map(item => (
                        <button key={item._id} onClick={() => onSelect(item)}
                            className="w-full text-left glass-panel rounded-xl p-3 hover:bg-white/[0.05] transition-all cursor-pointer border border-white/[0.06] group">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.status === 'approved' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-primary/10 text-primary'}`}>
                                    {item.status === 'approved' ? '✓ Approved' : item.type}
                                </span>
                                {item.platform && <span className="text-sm text-slate-500">{item.platform}</span>}
                            </div>
                            <p className="text-sm text-white line-clamp-2 mb-1">{item.content}</p>
                            <p className="text-xs text-slate-600">
                                {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </button>
                    ))}
                </div>
            </div>
        </>
    )
}

// ============================================================================
// STEP: PRODUCT PICKER (Step 7 — for product_content goal)
// ============================================================================

function StepProductPicker({ brandId, selectedProduct, onSelect, onBack }) {
    const [productsList, setProductsList] = useState([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        if (!brandId) return
        setLoading(true)
        productsAPI.list({ brandId, limit: 50 })
            .then(res => setProductsList(res.products || []))
            .catch(err => console.error(err))
            .finally(() => setLoading(false))
    }, [brandId])

    const filtered = search
        ? productsList.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase()))
        : productsList

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="mb-6 text-center">
                <h3 className="text-xl font-extrabold text-white mb-1">
                    <span className="material-symbols-outlined text-primary align-middle mr-2">inventory_2</span>
                    Select a Product
                </h3>
                <p className="text-sm text-slate-400">Choose a product from your catalog to generate platform-specific content</p>
            </div>

            <div className="flex items-center gap-3 mb-5">
                <div className="relative flex-1">
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search products..."
                        className="input-glass w-full py-2.5 pl-9 pr-3 rounded-xl text-sm bg-white/[0.04]" />
                    <span className="material-symbols-outlined text-sm text-slate-500 absolute left-3 top-1/2 -translate-y-1/2">search</span>
                </div>
                <button onClick={onBack} className="glass-panel py-2.5 px-4 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm mr-1 align-middle">arrow_back</span> Back
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                    <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                    <span className="text-slate-400 text-sm">Loading products...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 glass-panel rounded-2xl">
                    <span className="material-symbols-outlined text-5xl text-slate-600 mb-3">inbox</span>
                    <p className="text-slate-400 text-sm mb-1">
                        {productsList.length === 0 ? 'No products in your catalog yet.' : 'No products match your search.'}
                    </p>
                    <p className="text-slate-600 text-xs mb-4">Add products in Brand DNA → Products & Services</p>
                    <button onClick={() => onSelect(null)}
                        className="glass-panel py-2.5 px-6 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm mr-1 align-middle">edit_note</span>
                        Write Without a Product
                    </button>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filtered.map(p => {
                            const isSelected = selectedProduct?._id === p._id
                            return (
                                <button key={p._id} onClick={() => onSelect(p)}
                                    className={`text-left glass-panel rounded-xl overflow-hidden transition-all cursor-pointer hover:scale-[1.02] ${isSelected ? 'ring-2 ring-primary border-primary/40' : 'hover:border-white/20'
                                        } `}>
                                    <div className="h-28 bg-gradient-to-br from-white/[0.03] to-white/[0.01] flex items-center justify-center overflow-hidden">
                                        {p.images?.[0]?.url ? (
                                            <img src={p.images[0].url} alt={p.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl text-slate-600">
                                                {p.type === 'service' ? 'handyman' : 'inventory_2'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <p className="text-sm font-bold text-white truncate">{p.title}</p>
                                        {p.category && <p className="text-sm text-slate-500 mt-0.5">{p.category}</p>}
                                        {p.price?.amount > 0 && (
                                            <p className="text-xs font-bold text-primary mt-1">₹{p.price.amount.toLocaleString()}</p>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    {/* Skip option */}
                    <div className="text-center mt-5">
                        <button onClick={() => onSelect(null)}
                            className="text-sm text-slate-500 hover:text-white transition-colors cursor-pointer underline underline-offset-4">
                            or write product content without selecting a specific product
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ContentStudio() {
    const { activeBrand } = useBrand()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const [step, setStep] = useState(0)   // 0=goal, 1=subtype, 2=channel, 3=context, 4=tone, 5=result, 6=PR, 7=product, 8=youtube wizard, 9=youtube result, 10=youtube SEO wizard, 11=youtube SEO result
    const [goal, setGoal] = useState(null)
    const [subType, setSubType] = useState(null)
    const [channel, setChannel] = useState(null)
    const [context, setContext] = useState(null)
    const [toneSettings, setToneSettings] = useState(null)
    const [result, setResult] = useState(null)
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState('')
    const [prefilledOccasion, setPrefilledOccasion] = useState(null)
    const [accepted, setAccepted] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [photoshootImage, setPhotoshootImage] = useState(null)
    const [modelOverride, setModelOverride] = useState('auto')
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [youtubeData, setYoutubeData] = useState(null)
    const [youtubeSeoData, setYoutubeSeoData] = useState(null)
    const [availableProviders, setAvailableProviders] = useState([
        { id: 'auto', label: 'Auto (Recommended)', icon: 'auto_awesome', desc: 'AI picks the best model' },
    ])

    // Fetch available providers on mount
    useEffect(() => {
        contentAPI.providers()
            .then(data => { if (data.providers?.length) setAvailableProviders(data.providers) })
            .catch(() => { })
    }, [])

    const abortControllerRef = useRef(null)
    const activeBrandIdRef = useRef(activeBrand?._id)

    function getSignal() {
        if (abortControllerRef.current) abortControllerRef.current.abort()
        abortControllerRef.current = new AbortController()
        return abortControllerRef.current.signal
    }

    useEffect(() => {
        return () => abortControllerRef.current?.abort()
    }, [])

    // Abort and reset on brand switch
    useEffect(() => {
        if (activeBrand?._id !== activeBrandIdRef.current) {
            console.log('Brand changed, aborting content processing...')
            abortControllerRef.current?.abort()
            activeBrandIdRef.current = activeBrand?._id
            if (generating) setGenerating(false)
        }
    }, [activeBrand?._id, generating])


    // Read URL params on mount (from Calendar, Dashboard, etc.)
    useEffect(() => {
        const occasion = searchParams.get('occasion')
        const tone = searchParams.get('tone')
        const prompt = searchParams.get('prompt')
        const emoji = searchParams.get('emoji')
        const type = searchParams.get('type')

        if (occasion) {
            // Coming from Calendar or Dashboard with an occasion
            setGoal('celebrate')
            setSubType('festival')
            setContext({ details: `Create content for ${occasion}.${emoji ? 'Emoji: ' + emoji + '. ' : ''}This is a ${tone || 'festive'} occasion.` })
            setPrefilledOccasion({ name: occasion, tone, emoji })
            setStep(2) // Jump to channel selection
            setSearchParams({}, { replace: true })
        } else if (searchParams.get('fromPhotoshoot')) {
            // Coming from AI Photoshoot — load image and auto-analyze
            const photoshootImg = window.sessionStorage.getItem('photoshootImage')
            if (photoshootImg) {
                setGoal('promote')
                setSubType('product')
                setPhotoshootImage(photoshootImg)
                setStep(3) // Jump to context step with image
                window.sessionStorage.removeItem('photoshootImage')
            }
            setSearchParams({}, { replace: true })
        } else if (searchParams.get('goal') === 'hijack' || searchParams.get('trend')) {
            // Coming from Dashboard Trending Now widget
            const trendTopic = searchParams.get('trend') || ''
            const trendPrompt = prompt || searchParams.get('prompt') || ''
            setGoal('hijack')
            setContext({ details: trendPrompt || `Create trending content about "${trendTopic}"` })
            setStep(2) // Jump to channel selection
            setSearchParams({}, { replace: true })
        } else if (prompt) {
            // Coming from Dashboard Quick Create
            // Feed through smart parser logic
            const lower = prompt.toLowerCase()
            let detectedGoal = null
            if (/promot|offer|sale|discount|deal|product/.test(lower)) detectedGoal = 'promote'
            else if (/festival|diwali|christmas|celebrat|occasion|milestone|holi|eid|navratri/.test(lower)) detectedGoal = 'celebrate'
            else if (/launch|new|announce|pr |press|collab/.test(lower)) detectedGoal = 'launch'
            else if (/blog|seo|article|guide|how.to|educat|tip/.test(lower)) detectedGoal = 'educate'
            else if (/brand|story|about|tagline|website|vision/.test(lower)) detectedGoal = 'brand'
            else if (/youtube|yt |video script|shorts script/.test(lower)) detectedGoal = 'youtube_content'

            let detectedChannel = null
            if (/instagram|insta/i.test(lower)) detectedChannel = 'instagram'
            else if (/facebook|fb/i.test(lower)) detectedChannel = 'facebook'
            else if (/linkedin/i.test(lower)) detectedChannel = 'linkedin'
            else if (/twitter|tweet/i.test(lower)) detectedChannel = 'twitter'
            else if (/email|newsletter/i.test(lower)) detectedChannel = 'email'
            else if (/whatsapp/i.test(lower)) detectedChannel = 'whatsapp'
            else if (/website|blog|web/i.test(lower)) detectedChannel = 'website'

            setContext({ details: prompt })
            if (detectedGoal === 'youtube_content') {
                setGoal('youtube_content')
                setStep(1)  // Show YouTube sub-types (Script vs SEO)
            } else if (detectedGoal) {
                setGoal(detectedGoal)
                if (detectedChannel) {
                    setChannel(detectedChannel)
                    setStep(4) // Jump to tone
                } else {
                    setStep(2) // Jump to channel
                }
            } else {
                setStep(0) // Show goal chooser
            }
            setSearchParams({}, { replace: true })
        } else if (searchParams.get('fromBrainstorm') === 'true') {
            const bsCtx = window.sessionStorage.getItem('brainstormContext')
            if (bsCtx) {
                try {
                    const parsed = JSON.parse(bsCtx)
                    if (parsed.description || parsed.prompt) {
                        setContext({ details: parsed.description || parsed.prompt })
                        setGoal('promote') // Default to promote for brainstorm ideas
                        setStep(1) // Go to sub-type selection
                    }
                } catch (e) { console.error('Failed to parse brainstorm context:', e) }
            }
            setSearchParams({}, { replace: true })
        }
    }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

    // Smart input handler
    function handleSmartParse(parsed) {
        if (parsed.goal) {
            setGoal(parsed.goal)
            if (parsed.channel) {
                setChannel(parsed.channel)
                setContext({ details: parsed.rawInput })
                setStep(4) // Jump to tone
            } else {
                setStep(1) // Go to sub-type
            }
        } else {
            setContext({ details: parsed.rawInput })
            setStep(0) // Show goal chooser with context saved
        }
    }

    // Build the full prompt from all selections
    function buildPrompt(settings) {
        // Use passed settings directly (React setState is async, can't rely on toneSettings state here)
        const ts = settings || toneSettings || {}
        const goalData = GOALS.find(g => g.id === goal)
        const subTypeData = goalData?.subTypes.find(s => s.id === subType)
        const channelName = Array.isArray(channel)
            ? channel.map(c => CHANNELS.find(ch => ch.id === c)?.label).join(', ')
            : CHANNELS.find(c => c.id === channel)?.label || channel
        const toneLabel = TONES.find(t => t.id === ts.tone)?.label || ''
        const lengthLabel = LENGTHS.find(l => l.id === ts.length)?.label || ''

        let prompt = `INTENT: ${goalData?.label || goal} \n`
        prompt += `SUB - TYPE: ${subTypeData?.label || subType || 'General'} \n`
        prompt += `PLATFORM: ${channelName} \n`
        prompt += `TONE: ${toneLabel} \n`
        prompt += `LENGTH: ${lengthLabel} \n`

        // Language instructions — CRITICAL: use passed settings, not stale state
        if (ts.language && ts.language !== 'english') {
            const langName = ts.language.charAt(0).toUpperCase() + ts.language.slice(1)
            const useRoman = ts.scriptType === 'roman'
            const scriptNote = useRoman
                ? ` IMPORTANT: Write using ROMAN / ENGLISH LETTERS (transliteration), NOT in ${langName} native script. For example, write Hindi as "Aaj ka din bahut khaas hai" not "आज का दिन बहुत खास है".`
                : ` Use the native ${langName} script (e.g., Devanagari for Hindi, Tamil script for Tamil, Arabic script for Arabic, etc.).`

            if (ts.langStyle === 'mixed') {
                prompt += `LANGUAGE: Write in ${langName} mixed with English (${langName === 'Hindi' ? 'Hinglish' : langName + '-English mix'}). Use a natural code-switching style that feels authentic. Mix English words naturally into ${langName} sentences.${scriptNote}\n`
            } else if (ts.langStyle === 'slang') {
                prompt += `LANGUAGE: Write in colloquial/street ${langName} with local slang and casual expressions. Keep it raw and authentic. Can mix some English slang too.${scriptNote}\n`
            } else {
                prompt += `LANGUAGE: Write entirely in ${langName} (pure, no English mixing). Use proper ${langName} vocabulary.${scriptNote}\n`
            }
        } else {
            prompt += `LANGUAGE: English\n`
        }

        if (ts.sellStyle && ['promote', 'launch'].includes(goal)) {
            const sellLabel = SELL_STYLES.find(s => s.id === ts.sellStyle)?.label || ''
            prompt += `SELLING APPROACH: ${sellLabel}\n`
        }

        if (context?.details) prompt += `\nCONTEXT: ${context.details}\n`
        if (context?.url) prompt += `REFERENCE URL: ${context.url}\n`

        // Product context injection for product_content goal
        if (goal === 'product_content' && selectedProduct) {
            prompt += `\nPRODUCT INFORMATION:\n`
            prompt += `- Product Name: ${selectedProduct.title}\n`
            if (selectedProduct.description) prompt += `- Description: ${selectedProduct.description}\n`
            if (selectedProduct.shortDescription) prompt += `- Short Description: ${selectedProduct.shortDescription}\n`
            if (selectedProduct.features?.length) prompt += `- Key Features: ${selectedProduct.features.join(', ')}\n`
            if (selectedProduct.category) prompt += `- Category: ${selectedProduct.category}${selectedProduct.subCategory ? ` > ${selectedProduct.subCategory}` : ''}\n`
            if (selectedProduct.price?.amount) prompt += `- Price: ₹${selectedProduct.price.amount}${selectedProduct.price.mrp ? ` (MRP: ₹${selectedProduct.price.mrp})` : ''}\n`
            if (selectedProduct.tags?.length) prompt += `- Tags: ${selectedProduct.tags.join(', ')}\n`
            if (selectedProduct.specifications && Object.keys(selectedProduct.specifications).length > 0) {
                prompt += `- Specifications: ${JSON.stringify(selectedProduct.specifications)}\n`
            }
            prompt += `\nWrite a complete, platform-specific listing using ALL the product information above.\n`
        }

        // Platform-specific auto-optimization
        if (channel === 'instagram' || (Array.isArray(channel) && channel.includes('instagram'))) {
            prompt += '\nAuto-include: caption, relevant hashtags (5-8), CTA, emoji styling appropriate for Instagram.'
        }
        if (channel === 'linkedin' || (Array.isArray(channel) && channel.includes('linkedin'))) {
            prompt += '\nAuto-include: professional hook, thought leadership angle, professional CTA.'
        }
        if (channel === 'twitter' || (Array.isArray(channel) && channel.includes('twitter'))) {
            prompt += '\nAuto-include: concise text under 280 chars, relevant hashtags (2-3), punchy hook.'
        }
        if (channel === 'email' || (Array.isArray(channel) && channel.includes('email'))) {
            prompt += '\nAuto-include: subject line, preview text, body copy, CTA button text.'
        }
        if (channel === 'ecommerce' || (Array.isArray(channel) && channel.includes('ecommerce'))) {
            prompt += '\nAuto-include: product title, bullet features, SEO description, key specs.'
        }

        return prompt
    }

    async function handleGenerate(settings) {
        setToneSettings(settings)
        if (!activeBrand) { setError('Please select a brand first.'); return }
        setGenerating(true)
        setError('')

        // Build structured prompt — pass settings directly (setState is async!)
        const prompt = buildPrompt(settings)

        try {
            const signal = getSignal()
            const data = await contentAPI.generate({
                brandId: activeBrand._id,
                type: goal,
                subType,
                platform: Array.isArray(channel) ? channel.join(',') : channel,
                prompt,
                toneSettings: settings,
                options: modelOverride !== 'auto' ? { modelOverride } : {},
            }, { signal })
            setResult(data.content)
            setStep(5)
        } catch (err) {
            setError(err.message || 'Generation failed.')
        } finally {
            setGenerating(false)
        }
    }

    async function handleRegenerate() {
        if (!result?._id) return
        setGenerating(true)
        try {
            const signal = getSignal()
            const data = await contentAPI.regenerate(result._id, {}, { signal })
            setResult(data.content)
        } catch (err) {
            console.error(err)
        } finally {
            setGenerating(false)
        }
    }

    const [contentFeedback, setContentFeedback] = useState(null) // 'liked' | 'disliked'

    async function handleFeedback(signalType, extra = {}) {
        // Immediate visual feedback regardless of _id
        if (signalType === 'thumbs') {
            setContentFeedback(extra.thumbs === 'up' ? 'liked' : 'disliked')
        }

        if (!result?._id) return
        try {
            await contentAPI.feedback(result._id, { signalType, ...extra })
            if (signalType === 'accept') {
                // Mark content as approved in DB
                try { await contentAPI.update(result._id, { status: 'approved' }) } catch (e) { /* ok */ }
                setAccepted(true)
            }
        } catch (err) {
            console.error(err)
        }
    }

    function handleCreateVisual() {
        // Navigate to Creative Studio with content context
        const contentSummary = result?.content?.substring(0, 200) || ''
        const params = new URLSearchParams({
            fromContent: 'true',
            prompt: `Create a visual for: ${contentSummary}`,
            type: goal || 'social',
        })
        navigate(`/creative-studio?${params.toString()}`)
    }

    // Press Release generation handler
    async function handleGeneratePR(prData) {
        if (!activeBrand) { setError('Please select a brand first.'); return }
        setGenerating(true)
        setError('')

        // Build structured press release prompt
        const distributionLabels = prData.distribution.map(d => {
            const found = [
                { id: 'online', label: 'Online Media' }, { id: 'print', label: 'Print Media' },
                { id: 'tv', label: 'TV / Broadcast' }, { id: 'wire', label: 'News Wire' },
                { id: 'industry', label: 'Industry Publications' }, { id: 'social', label: 'Social & Blog' },
            ].find(x => x.id === d)
            return found?.label || d
        }).join(', ')

        let prompt = `Write a PROFESSIONAL PRESS RELEASE for ${activeBrand.name}.

TYPE: Press Release
HEADLINE: ${prData.headline || '(Auto-generate a compelling headline)'}
ANNOUNCEMENT: ${prData.purpose}

DISTRIBUTION TARGET: ${distributionLabels}
TONE: ${prData.tone || 'professional'}
LANGUAGE: ${prData.language === 'english' ? 'English' : prData.language.charAt(0).toUpperCase() + prData.language.slice(1)}

DATELINE: ${prData.city ? prData.city + ', ' : ''}${prData.dateline}
${prData.embargo ? `EMBARGO: Not for publication until ${prData.embargo}` : ''}

SPOKESPERSON QUOTES:`
        if (prData.quotes?.length) {
            prData.quotes.forEach((q, i) => {
                if (q.name) {
                    prompt += `\n${i + 1}. ${q.name}${q.title ? `, ${q.title}` : ''}`
                    prompt += q.quote ? `: "${q.quote}"` : ` — (Draft an appropriate quote for this person)`
                }
            })
        } else {
            prompt += '\n(Draft appropriate spokesperson quotes based on the announcement)'
        }

        if (prData.boilerplate) prompt += `\n\nABOUT THE COMPANY:\n${prData.boilerplate}`
        if (prData.contact?.name || prData.contact?.email) {
            prompt += `\n\nMEDIA CONTACT:\n${prData.contact.name || ''}${prData.contact.email ? ` | ${prData.contact.email}` : ''}${prData.contact.phone ? ` | ${prData.contact.phone}` : ''}`
        }
        if (prData.cta) prompt += `\n\nCALL TO ACTION: ${prData.cta}`

        prompt += `\n\nFORMAT REQUIREMENTS:
- Follow standard press release format (headline, subheadline, dateline, body, boilerplate, contact)
- Include ### (end marker) at the bottom
- Professional AP-style writing
- Tailored for ${distributionLabels} distribution
- Include all provided quotes naturally within the body
- Make it newsworthy and compelling
- Output ONLY the press release — no explanations`

        try {
            const signal = getSignal()
            const data = await contentAPI.generate({
                brandId: activeBrand._id,
                type: 'press_release',
                subType: 'press_release',
                platform: prData.distribution.join(','),
                prompt,
                toneSettings: { language: prData.language, tone: prData.tone },
                options: modelOverride !== 'auto' ? { modelOverride } : {},
            }, { signal })
            setResult(data.content)
            setStep(5)
        } catch (err) {
            setError(err.message || 'Press release generation failed.')
        } finally {
            setGenerating(false)
        }
    }

    // Refine handler — updates content in-place
    function handleRefine(refineData) {
        if (refineData.manualEdit) {
            // User manually edited and saved
            setResult(prev => ({ ...prev, content: refineData.manualEdit }))
            if (result?._id) {
                contentAPI.update(result._id, { content: refineData.manualEdit }).catch(() => { })
            }
        } else if (refineData.refined) {
            // AI refined the content
            setResult(prev => ({
                ...prev,
                content: refineData.refined,
                aiMeta: { ...prev.aiMeta, ...refineData.aiMeta },
            }))
        }
    }

    function handleHistorySelect(item) {
        setResult(item)
        setStep(5)
        setAccepted(item.status === 'approved')
        setShowHistory(false)
    }

    function resetAll() {
        setStep(0); setGoal(null); setSubType(null); setChannel(null)
        setContext(null); setToneSettings(null); setResult(null); setError('')
        setAccepted(false); setPrefilledOccasion(null); setSelectedProduct(null)
        setYoutubeData(null); setYoutubeSeoData(null); setContentFeedback(null)
    }

    // YouTube content generation handler (Script & Ideation)
    async function handleGenerateYouTube(ytSettings) {
        if (!activeBrand) { setError('Please select a brand first.'); return }
        setGenerating(true)
        setError('')

        try {
            const signal = getSignal()
            const data = await contentAPI.youtube({
                brandId: activeBrand._id,
                brief: ytSettings.brief,
                format: ytSettings.format,
                videoLength: ytSettings.videoLength,
                targetAudience: ytSettings.targetAudience,
                style: ytSettings.style,
                language: ytSettings.language,
                subType: subType || '',
            }, { signal })
            setResult(data.content)
            setYoutubeData(data.content?.youtubeData || {})
            setStep(9)  // YouTube result view
        } catch (err) {
            setError(err.message || 'YouTube content generation failed.')
        } finally {
            setGenerating(false)
        }
    }

    // YouTube SEO / Publish Optimizer handler (metadata only)
    async function handleGenerateYouTubeSeo(seoSettings) {
        if (!activeBrand) { setError('Please select a brand first.'); return }
        setGenerating(true)
        setError('')

        try {
            const data = await contentAPI.youtubeSeo({
                brandId: activeBrand._id,
                brief: seoSettings.brief,
                format: seoSettings.format,
                videoCategory: seoSettings.videoCategory,
                targetAudience: seoSettings.targetAudience,
                language: seoSettings.language,
            })
            setResult(data.content)
            setYoutubeSeoData(data.content?.youtubeSeoData || {})
            setStep(11)  // YouTube SEO result view
        } catch (err) {
            setError(err.message || 'YouTube SEO generation failed.')
        } finally {
            setGenerating(false)
        }
    }

    // Step progress
    const stepLabels = ['Goal', 'Type', 'Channel', 'Context', 'Tone', 'Result']
    const totalSteps = 6

    return (
        <DashboardLayout title="Content Studio" subtitle="AI-powered content for every channel">
            <SEOHead title="Content Studio — Mantram AI" noIndex={true} />
            {/* Progress Stepper (shown at steps 1-4) */}
            {step > 0 && step < 5 && (
                <div className="flex items-center gap-2 mb-8 max-w-3xl mx-auto">
                    <button onClick={resetAll} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                    </button>
                    {stepLabels.slice(0, 5).map((lbl, i) => (
                        <div key={lbl} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                                ${step > i ? 'bg-primary text-white' : step === i ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-white/5 text-slate-600'}`}>
                                {step > i ? '✓' : i + 1}
                            </div>
                            <span className={`text-xs font-bold hidden sm:inline ${step >= i ? 'text-slate-300' : 'text-slate-600'}`}>{lbl}</span>
                            {i < 4 && <div className={`w-4 sm:w-8 h-px ${step > i ? 'bg-primary/40' : 'bg-white/5'}`} />}
                        </div>
                    ))}
                    <div className="ml-auto">
                        <button onClick={() => setShowHistory(!showHistory)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${showHistory ? 'bg-primary/20 text-primary' : 'glass-panel text-slate-400 hover:text-white'}`}>
                            <span className="material-symbols-outlined text-sm">history</span>
                            History
                        </button>
                    </div>
                </div>
            )}

            {/* ========== STEP 0: HERO + GOAL SELECTION ========== */}
            {step === 0 && (
                <div className="animate-fade-in">
                    {/* Hero Section */}
                    <div className="text-center mb-10">
                        <span className="material-symbols-outlined text-5xl text-primary mb-3 block">edit_note</span>
                        <h2 className="text-2xl font-black text-white mb-2">What do you want to <span className="text-primary">create?</span></h2>
                        <p className="text-sm text-slate-400 max-w-lg mx-auto">Tell us what you need — we'll handle the rest.</p>
                    </div>

                    {/* Smart Input */}
                    <SmartInput onParse={handleSmartParse} />

                    {/* Divider */}
                    <div className="flex items-center gap-3 max-w-4xl mx-auto mb-6">
                        <div className="flex-1 h-px bg-white/[0.06]" />
                        <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Or pick your content type</span>
                        <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>

                    {/* Pre-filled Context Banner */}
                    {prefilledOccasion && step >= 2 && step <= 4 && (
                        <div className="max-w-2xl mx-auto mb-6 animate-fade-in">
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/10 border border-primary/20">
                                <span className="text-2xl">{prefilledOccasion.emoji || '🎯'}</span>
                                <div className="flex-1">
                                    <p className="text-base font-bold text-white">Creating content for <span className="text-primary">{prefilledOccasion.name}</span></p>
                                    <p className="text-sm text-slate-400 mt-0.5">Suggested tone: {prefilledOccasion.tone || 'festive'} • Select your channel below</p>
                                </div>
                                <button onClick={() => { setPrefilledOccasion(null); setStep(0); setGoal(null); setContext(null) }}
                                    className="text-sm text-slate-500 hover:text-white transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Steps */}
                    <StepGoal onSelect={(g) => {
                        if (g === 'press_release') {
                            setGoal(g); setStep(6)  // Jump to PR wizard
                        } else if (g === 'product_content') {
                            setGoal(g); setStep(7)  // Jump to product picker
                        } else if (g === 'youtube_content') {
                            setGoal(g); setStep(1)  // Show YouTube sub-types (Script vs Publish Optimizer)
                        } else {
                            setGoal(g); setStep(1)
                        }
                    }} />
                </div>
            )}
            {step === 1 && <StepSubType goal={goal} onSelect={(s) => {
                setSubType(s);
                if (goal === 'youtube_content') {
                    // YouTube flow: SEO-only vs Script
                    if (s === 'youtube_seo') {
                        setStep(10)  // YouTube SEO / Publish Optimizer wizard
                    } else {
                        setStep(8)  // YouTube Script & Ideation wizard
                    }
                } else if (goal === 'product_content') {
                    // Platform IS the channel — auto-set and skip channel step
                    setChannel('ecommerce');
                    setStep(context ? 4 : 3);
                } else {
                    setStep(2);
                }
            }} onBack={() => goal === 'product_content' ? setStep(7) : setStep(0)} />}
            {step === 2 && <StepChannel goal={goal} onSelect={(c) => { setChannel(c); setStep(context ? 4 : 3) }} onBack={() => goal === 'product_content' ? setStep(7) : setStep(1)} />}
            {step === 3 && <StepContext goal={goal} subType={subType} brandId={activeBrand?._id} initialImage={photoshootImage} onComplete={(ctx) => { setContext(ctx); setPhotoshootImage(null); setStep(4) }} onBack={() => goal === 'product_content' ? setStep(1) : setStep(2)} />}
            {step === 4 && (
                <>
                    <StepTone goal={goal} activeBrand={activeBrand} onComplete={handleGenerate} onBack={() => setStep(3)}
                        availableProviders={availableProviders} modelOverride={modelOverride} setModelOverride={setModelOverride} />
                    {generating && (
                        <div className="max-w-2xl mx-auto mt-6 glass-panel rounded-2xl p-6 text-center animate-fade-in">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-3">progress_activity</span>
                            <p className="text-white font-bold">Generating with brand intelligence...</p>
                            <p className="text-sm text-slate-400 mt-1">
                                Using {activeBrand?.name}'s voice DNA + RLHF learnings for human-authentic output
                            </p>
                            <div className="flex items-center justify-center gap-2 mt-3">
                                <span className="text-sm text-primary/70 bg-primary/10 px-2.5 py-0.5 rounded-full font-medium">
                                    🤖 {modelOverride === 'auto'
                                        ? `Smart routing: ${toneSettings?.language !== 'english' ? toneSettings?.language?.charAt(0).toUpperCase() + toneSettings?.language?.slice(1) + ' → best model' : 'English → optimal model'}`
                                        : `Using: ${availableProviders.find(p => p.id === modelOverride)?.label || modelOverride}`}
                                </span>
                            </div>
                        </div>
                    )}
                    {error && (
                        <div className="max-w-2xl mx-auto mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
                            <span className="material-symbols-outlined align-middle mr-1">error</span> {error}
                        </div>
                    )}
                </>
            )}
            {/* Press Release Wizard */}
            {step === 6 && (
                <>
                    <StepPressRelease
                        activeBrand={activeBrand}
                        goal={goal}
                        onBack={() => { setGoal(null); setStep(0) }}
                        onComplete={handleGeneratePR}
                        availableProviders={availableProviders}
                        modelOverride={modelOverride}
                        setModelOverride={setModelOverride}
                    />
                    {generating && (
                        <div className="max-w-2xl mx-auto mt-6 glass-panel rounded-2xl p-6 text-center animate-fade-in">
                            <span className="material-symbols-outlined text-3xl text-rose-400 animate-spin block mb-3">progress_activity</span>
                            <p className="text-white font-bold">Crafting your press release...</p>
                            <p className="text-sm text-slate-400 mt-1">Using brand DNA + PR best practices for professional output</p>
                        </div>
                    )}
                    {error && (
                        <div className="max-w-2xl mx-auto mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
                            <span className="material-symbols-outlined align-middle mr-1">error</span> {error}
                        </div>
                    )}
                </>
            )}

            {/* Product Picker Step */}
            {step === 7 && (
                <StepProductPicker
                    brandId={activeBrand?._id}
                    selectedProduct={selectedProduct}
                    onSelect={(product) => {
                        setSelectedProduct(product)
                        setStep(1) // Go to sub-type (platform selection)
                    }}
                    onBack={() => { setGoal(null); setStep(0) }}
                />
            )}

            {step === 5 && result && (
                <ResultView
                    result={result}
                    activeBrand={activeBrand}
                    generating={generating}
                    accepted={accepted}
                    imageUrl={null}
                    onRegenerate={handleRegenerate}
                    onFeedback={handleFeedback}
                    onNewContent={resetAll}
                    onCreateVisual={handleCreateVisual}
                    onRefine={handleRefine}
                    contentFeedback={contentFeedback}
                />
            )}

            {/* YouTube Wizard */}
            {step === 8 && (
                <>
                    <StepYouTubeWizard
                        activeBrand={activeBrand}
                        onBack={() => { setGoal(null); setStep(0) }}
                        onComplete={handleGenerateYouTube}
                        availableProviders={availableProviders}
                        modelOverride={modelOverride}
                        setModelOverride={setModelOverride}
                    />
                    {generating && (
                        <div className="max-w-2xl mx-auto mt-6 glass-panel rounded-2xl p-6 text-center animate-fade-in">
                            <span className="material-symbols-outlined text-3xl text-red-400 animate-spin block mb-3">progress_activity</span>
                            <p className="text-white font-bold">Generating YouTube content...</p>
                            <p className="text-sm text-slate-400 mt-1">Running YouTube Research Agent → YouTube Writer Agent pipeline</p>
                            <p className="text-xs text-slate-600 mt-2">Script • Title • Description • Tags • Keywords • Timestamps</p>
                        </div>
                    )}
                    {error && (
                        <div className="max-w-2xl mx-auto mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
                            <span className="material-symbols-outlined align-middle mr-1">error</span> {error}
                        </div>
                    )}
                </>
            )}

            {/* YouTube Result View */}
            {step === 9 && result && (
                <YouTubeResultView
                    result={result}
                    youtubeData={youtubeData}
                    onNewContent={resetAll}
                    generating={generating}
                    activeBrand={activeBrand}
                />
            )}

            {/* YouTube SEO / Publish Optimizer Wizard */}
            {step === 10 && (
                <>
                    <StepYouTubeSeoWizard
                        activeBrand={activeBrand}
                        onBack={() => { setSubType(null); setStep(1) }}
                        onComplete={handleGenerateYouTubeSeo}
                        availableProviders={availableProviders}
                        modelOverride={modelOverride}
                        setModelOverride={setModelOverride}
                    />
                    {generating && (
                        <div className="max-w-2xl mx-auto mt-6 glass-panel rounded-2xl p-6 text-center animate-fade-in">
                            <span className="material-symbols-outlined text-3xl text-emerald-400 animate-spin block mb-3">progress_activity</span>
                            <p className="text-white font-bold">Optimizing for YouTube algorithm...</p>
                            <p className="text-sm text-slate-400 mt-1">Running YouTube Research Agent → SEO Optimizer Agent pipeline</p>
                            <p className="text-xs text-slate-600 mt-2">3 Title Options • Description • 20-30 Tags • Keywords • SEO Score</p>
                        </div>
                    )}
                    {error && (
                        <div className="max-w-2xl mx-auto mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
                            <span className="material-symbols-outlined align-middle mr-1">error</span> {error}
                        </div>
                    )}
                </>
            )}

            {/* YouTube SEO Result View */}
            {step === 11 && result && (
                <YouTubeSeoResultView
                    result={result}
                    youtubeSeoData={youtubeSeoData}
                    onNewContent={resetAll}
                />
            )}

            {/* Content History Sidebar */}
            <ContentHistory
                brandId={activeBrand?._id}
                visible={showHistory}
                onToggle={() => setShowHistory(false)}
                onSelect={handleHistorySelect}
            />
        </DashboardLayout>
    )
}


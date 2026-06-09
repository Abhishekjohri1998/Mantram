import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { content as contentAPI, agents as agentsAPI, creatives as creativesAPI, products as productsAPI, monthlyStrategy as monthlyStrategyAPI, API_BASE } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { stripMarkdown } from '../utils/stripMarkdown'
import VoiceInput from '../components/VoiceInput'
import GlobalLoader from '../components/GlobalLoader'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import PublishModal from '../components/PublishModal'
import Walkthrough from '../components/Walkthrough'
import TemplateLibrary from './TemplateLibrary'

import './ContentStudio.css'
// ============================================================================
// DATA: Goals, sub-types, channels, tones
// ============================================================================
const GOALS = [
    {
        id: 'promote', icon: 'campaign', label: 'Promote Something',
        desc: 'Product, service, offer, sale, or discount',
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#F59E0B',
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
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#EC4899',
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
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#3B82F6',
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
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#10B981',
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
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#8B5CF6',
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
        id: 'blog', icon: 'edit_note', label: 'Write Blog / Article',
        desc: 'Long-form blogs, SEO articles, listicles, pillar content',
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#14B8A6',
        subTypes: [
            { id: 'seo_blog', icon: 'search', label: 'SEO Blog Article' },
            { id: 'long_form', icon: 'article', label: 'Long-form Article' },
            { id: 'listicle', icon: 'format_list_numbered', label: 'Listicle (Top 10, Best Of)' },
            { id: 'case_study', icon: 'assignment', label: 'Case Study' },
            { id: 'comparison', icon: 'compare', label: 'Comparison / vs Article' },
            { id: 'pillar_content', icon: 'hub', label: 'Pillar Content (3000+ words)' },
        ],
    },
    {
        id: 'custom_blog', icon: 'draw', label: 'Write It Yourself',
        desc: 'Smart writing pad with AI synonyms, grammar check and image generation',
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#8B5CF6',
        subTypes: [],
    },
    {
        id: 'press_release', icon: 'newspaper', label: 'Write Press Release',
        desc: 'Professional PR for launches, announcements, events',
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#F43F5E',
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
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#06B6D4',
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
        glow: 'cs-glow-amber', iconColor: 'text-primary', accent: '#FF0000',
        subTypes: [
            { id: 'youtube_seo', icon: 'rocket_launch', label: 'Publish Optimizer', desc: 'Title, description, tags & keywords — SEO only, no script' },
            { id: 'video_script', icon: 'movie', label: 'Video Script', desc: 'Full script + all metadata' },
            { id: 'shorts_script', icon: 'slow_motion_video', label: 'Shorts Script', desc: 'Short-form script + metadata' },
            { id: 'tutorial', icon: 'school', label: 'Tutorial / How-To' },
            { id: 'review', icon: 'rate_review', label: 'Review / Unboxing' },
            { id: 'vlog', icon: 'videocam', label: 'Vlog' },
            { id: 'podcast', icon: 'podcasts', label: 'Podcast Highlights' },
            { id: 'commentary', icon: 'chat', label: 'Commentary / Reaction' },
            { id: 'explainer', icon: 'lightbulb', label: 'Explainer Video' },
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

// ── Quick-start chips for the new agentic brief ──────────────────────────────
const QUICK_CHIPS = [
    { id: 'promote', icon: 'campaign', label: 'Promote', accent: '#F59E0B' },
    { id: 'celebrate', icon: 'celebration', label: 'Celebrate', accent: '#EC4899' },
    { id: 'launch', icon: 'rocket_launch', label: 'Launch', accent: '#3B82F6' },
    { id: 'educate', icon: 'school', label: 'Educate', accent: '#10B981' },
    { id: 'brand', icon: 'diamond', label: 'Brand', accent: '#8B5CF6' },
    { id: 'blog', icon: 'edit_note', label: 'Blog', accent: '#14B8A6' },
    { id: 'press_release', icon: 'newspaper', label: 'Press Release', accent: '#F43F5E' },
    { id: 'product_content', icon: 'shopping_bag', label: 'Product', accent: '#06B6D4' },
    { id: 'youtube_content', icon: 'smart_display', label: 'YouTube', accent: '#FF0000' },
    { id: 'custom_blog', icon: 'draw', label: 'Write Yourself', accent: '#8B5CF6' },
]

function AgenticBrief({ onSubmit, onChipSelect, activeBrand }) {
    const [input, setInput] = useState('')
    const [parsing, setParsing] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [linkMode, setLinkMode] = useState(false)
    const [url, setUrl] = useState('')
    const [imagePreview, setImagePreview] = useState(null)
    const [imageFile, setImageFile] = useState(null)
    const textRef = useRef(null)

    const brandName = activeBrand?.name || ''
    const dna = activeBrand?.dna || {}
    const industry = dna.industry || dna.category || ''

    // ── Auto-analyze image with AI when uploaded ──
    const analyzeImage = async (imageData) => {
        setAnalyzing(true)
        try {
            const data = await agentsAPI.analyzeImage({
                image: imageData,
                brandId: activeBrand?._id || null,
                platform: 'instagram',
            })
            if (data.success && data.analysis) {
                // Extract the first (Instagram) caption as starting point
                // The user can then edit this before hitting Create
                const caption = data.analysis
                setInput(prev => prev ? prev + '\n\n' + caption : caption)
                // Auto-resize textarea
                setTimeout(() => {
                    if (textRef.current) {
                        textRef.current.style.height = 'auto'
                        textRef.current.style.height = Math.min(textRef.current.scrollHeight, 200) + 'px'
                    }
                }, 50)
            }
        } catch (err) {
            console.warn('Image analysis failed:', err.message)
        } finally {
            setAnalyzing(false)
        }
    }

    const handleSubmit = async () => {
        if (!input.trim() && !url.trim() && !imagePreview) return
        setParsing(true)
        const rawInput = input.trim() + (url ? `\nURL: ${url}` : '')
        try {
            const data = await contentAPI.parseIntent(rawInput)
            const p = data.parsed || {}
            onSubmit({
                goal: p.goal || null,
                subType: p.subType || null,
                channel: p.channel || null,
                tone: p.tone || null,
                rawInput,
                brief: p.brief || rawInput,
                confidence: p.confidence || 0.5,
                method: data.method || 'ai',
                url: url || null,
                imagePreview,
                imageFile,
            })
        } catch (err) {
            console.warn('AI intent parse failed, using regex:', err.message)
            const lower = rawInput.toLowerCase()
            let goal = null, channel = null
            if (/promot|offer|sale|discount|deal|product/.test(lower)) goal = 'promote'
            else if (/festival|diwali|christmas|celebrat/.test(lower)) goal = 'celebrate'
            else if (/launch|announce|pr |press/.test(lower)) goal = 'launch'
            else if (/blog|seo|article|guide|educat/.test(lower)) goal = 'blog'
            else if (/brand|story|about|tagline/.test(lower)) goal = 'brand'
            else if (/youtube|yt |video script/.test(lower)) goal = 'youtube_content'
            if (/instagram|insta/i.test(lower)) channel = 'instagram'
            else if (/linkedin/i.test(lower)) channel = 'linkedin'
            else if (/twitter|tweet/i.test(lower)) channel = 'twitter'
            else if (/youtube|yt /i.test(lower)) channel = 'youtube'
            else if (/website|blog|web/i.test(lower)) channel = 'website'
            onSubmit({ goal, subType: null, channel, rawInput, brief: rawInput, confidence: 0.3, method: 'regex', url: url || null, imagePreview, imageFile })
        } finally {
            setParsing(false)
        }
    }

    const handleImageDrop = (e) => {
        e.preventDefault()
        const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0]
        if (file && file.type.startsWith('image/')) {
            setImageFile(file)
            const reader = new FileReader()
            reader.onload = (ev) => {
                const dataUrl = ev.target.result
                setImagePreview(dataUrl)
                // Auto-analyze the image with AI
                analyzeImage(dataUrl)
            }
            reader.readAsDataURL(file)
        }
    }

    // ── Auto-analyze when link is an image URL ──
    const handleLinkBlur = () => {
        const trimmed = url.trim()
        if (!trimmed) return
        // Check if URL points to an image
        const isImageUrl = /\.(jpg|jpeg|png|gif|webp|svg|bmp|avif)(\?.*)?$/i.test(trimmed)
            || /images\.unsplash|pbs\.twimg|instagram.*\.jpg|cdn\.shopify.*\.jpg/i.test(trimmed)
        if (isImageUrl && !imagePreview) {
            setImagePreview(trimmed)
            analyzeImage(trimmed)
        }
    }

    return (
        <div data-wt="agentic-brief" className="ab-root animate-fade-in">
            {/* Hero */}
            <div className="ab-hero">
                <span className="material-symbols-outlined ab-hero-icon">auto_awesome</span>
                <h2 className="ab-hero-title">
                    What do you want to <span className="text-primary-fixed">create</span>?
                </h2>
                <p className="ab-hero-sub">
                    {brandName
                        ? `Describe your idea for ${brandName}${industry ? ` (${industry})` : ''} — Fidato will handle the rest.`
                        : 'Describe your content idea in any language — Fidato will classify, refine, and generate.'}
                </p>
            </div>

            {/* Main Input */}
            <div className="ab-input-card">
                <textarea
                    ref={textRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px' }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                    placeholder={brandName ? `"Write an Instagram post for ${brandName}'s Diwali sale..."` : '"Write a LinkedIn post about our new product launch..."'}
                    className="ab-textarea"
                    rows={3}
                    autoFocus
                />

                {/* Link input (toggle) */}
                {linkMode && (
                    <div className="ab-link-row animate-fade-in">
                        <span className="material-symbols-outlined ab-link-icon">link</span>
                        <input
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            onBlur={handleLinkBlur}
                            placeholder="Paste product, page, or image URL"
                            className="ab-link-input"
                        />
                        <button onClick={() => { setLinkMode(false); setUrl('') }} className="ab-link-close">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                    </div>
                )}

                {/* Image preview */}
                {imagePreview && (
                    <div className="ab-image-preview animate-fade-in">
                        <img src={imagePreview} alt="Attached" className="ab-image-thumb" />
                        <span className="ab-image-name">
                            {analyzing
                                ? <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 12, marginRight: 4 }}>progress_activity</span>Analyzing image...</>
                                : (imageFile?.name || 'Image attached — caption generated ✓')}
                        </span>
                        <button onClick={() => { setImagePreview(null); setImageFile(null); setInput('') }} className="ab-link-close" disabled={analyzing}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                    </div>
                )}

                {/* Toolbar */}
                <div className="ab-toolbar">
                    <div className="ab-toolbar-left">
                        <button className="ab-tool-btn" onClick={() => setLinkMode(l => !l)} title="Paste a link">
                            <span className="material-symbols-outlined">link</span>
                        </button>
                        <label className="ab-tool-btn" title="Upload image">
                            <span className="material-symbols-outlined">add_photo_alternate</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageDrop} />
                        </label>
                        <VoiceInput
                            onResult={(text) => setInput(prev => prev ? prev + ' ' + text : text)}
                            size="small"
                        />
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={(!input.trim() && !url.trim() && !imagePreview) || parsing || analyzing}
                        className="ab-submit-btn"
                    >
                        {parsing
                            ? <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span> Classifying...</>
                            : analyzing
                                ? <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span> Reading image...</>
                                : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span> Create →</>}
                    </button>
                </div>
            </div>

            {/* Quick-start chips */}
            <div className="ab-chips-wrap">
                <p className="ab-chips-label">Or pick a content type</p>
                <div className="ab-chips-grid">
                    {QUICK_CHIPS.map((c, i) => (
                        <button
                            key={c.id}
                            className="ab-chip"
                            style={{ animationDelay: `${i * 40}ms`, '--chip-accent': c.accent }}
                            onClick={() => onChipSelect(c.id)}
                        >
                            <span className="material-symbols-outlined ab-chip-icon">{c.icon}</span>
                            <span>{c.label}</span>
                        </button>
                    ))}
                </div>
            </div>

        </div>
    )
}

// ============================================================================
// AGENTIC REFINEMENT — Dynamic settings based on Classification
// ============================================================================
function AgenticRefinement({ parsed, onConfirm, onBack, activeBrand, availableProviders, modelOverride, setModelOverride }) {
    // Classification state (editable)
    const [contentType, setContentType] = useState(parsed.goal && ['blog', 'educate'].includes(parsed.goal) ? 'blog' : 'social')
    const [goal, setGoal] = useState(parsed.goal || 'promote')
    const [channel, setChannel] = useState(parsed.channel ? (Array.isArray(parsed.channel) ? parsed.channel : [parsed.channel]) : [])
    const [tone, setTone] = useState(parsed.tone || 'bold')
    const [length, setLength] = useState('medium')
    const [sellStyle, setSellStyle] = useState('direct')
    const [details, setDetails] = useState(parsed.rawInput || '')
    const [url, setUrl] = useState(parsed.url || '')
    const [imagePreview, setImagePreview] = useState(parsed.imagePreview || null)
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Blog-specific
    const [targetWordCount, setTargetWordCount] = useState(1200)
    const [keywords, setKeywords] = useState('')
    const [blogType, setBlogType] = useState('seo_blog')

    // Language — default from brand DNA
    const defaultLang = activeBrand?.dna?.defaultLanguage || 'english'
    const defaultStyle = activeBrand?.dna?.languageStyle || 'pure'
    const [language, setLanguage] = useState(defaultLang)
    const [langStyle, setLangStyle] = useState(defaultStyle)
    const [scriptType, setScriptType] = useState('regional')
    const [researchDepth, setResearchDepth] = useState(contentType === 'blog' ? 'deep' : 'quick')

    const confidence = parsed.confidence || 0.5
    const classLabel = contentType === 'blog' ? 'Blog / Article' : 'Social Post'
    const classIcon = contentType === 'blog' ? 'edit_note' : 'share'

    const handleConfirm = () => {
        onConfirm({
            contentType,
            goal,
            channel: channel.length === 1 ? channel[0] : channel.length > 1 ? channel : 'instagram',
            tone,
            length,
            sellStyle,
            language,
            langStyle,
            scriptType,
            researchDepth,
            details,
            url,
            imagePreview,
            // Blog specifics
            targetWordCount,
            keywords,
            blogType,
            rawInput: parsed.rawInput,
        })
    }

    const BLOG_TYPES = [
        { id: 'seo_blog', icon: 'search', label: 'SEO Blog' },
        { id: 'long_form', icon: 'article', label: 'Long-form' },
        { id: 'listicle', icon: 'format_list_numbered', label: 'Listicle' },
        { id: 'case_study', icon: 'assignment', label: 'Case Study' },
        { id: 'how_to', icon: 'menu_book', label: 'How-To' },
    ]

    return (
        <div className="ar-root animate-fade-in">
            <button onClick={onBack} className="ar-back-btn">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span> Back
            </button>

            {/* Classification chip */}
            <div className="ar-classification">
                <div className="ar-class-left">
                    <span className="material-symbols-outlined ar-class-icon">{classIcon}</span>
                    <div>
                        <span className="ar-class-label">Fidato detected:</span>
                        <span className="ar-class-type">{classLabel}</span>
                        {confidence < 0.7 && <span className="ar-class-low">Low confidence — verify below</span>}
                    </div>
                </div>
                <div className="ar-class-toggle">
                    <button
                        className={`ar-toggle-btn ${contentType === 'social' ? 'active' : ''}`}
                        onClick={() => { setContentType('social'); setResearchDepth('quick') }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>share</span> Social
                    </button>
                    <button
                        className={`ar-toggle-btn ${contentType === 'blog' ? 'active' : ''}`}
                        onClick={() => { setContentType('blog'); setResearchDepth('deep') }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit_note</span> Blog
                    </button>
                </div>
            </div>

            {/* Context summary (editable) */}
            <div className="ar-context-preview">
                <div className="ar-ctx-label">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
                    Your brief
                </div>
                <textarea
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                    className="ar-ctx-textarea"
                    rows={2}
                />
                {imagePreview && (
                    <div className="ar-ctx-image">
                        <img src={imagePreview} alt="ref" className="ar-ctx-img-thumb" />
                        <span className="ar-ctx-img-label">Image attached</span>
                    </div>
                )}
            </div>

            {/* ─── SOCIAL PATH ─── */}
            {contentType === 'social' && (
                <div className="ar-section-grid animate-fade-in">
                    {/* Platform */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>public</span> Platform
                        </p>
                        <div className="ar-platform-chips">
                            {CHANNELS.filter(c => c.id !== 'multi').map(ch => (
                                <button key={ch.id}
                                    className={`ar-plat-chip ${channel.includes(ch.id) ? 'active' : ''}`}
                                    onClick={() => setChannel(prev => prev.includes(ch.id) ? prev.filter(x => x !== ch.id) : [...prev, ch.id])}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{ch.fallbackIcon}</span>
                                    {ch.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tone */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>palette</span> Tone
                        </p>
                        <div className="ar-chip-row">
                            {TONES.map(t => (
                                <button key={t.id}
                                    className={`ar-opt-chip ${tone === t.id ? 'active' : ''}`}
                                    onClick={() => setTone(t.id)}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Length */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>short_text</span> Length
                        </p>
                        <div className="ar-chip-row">
                            {LENGTHS.map(l => (
                                <button key={l.id}
                                    className={`ar-opt-chip ${length === l.id ? 'active' : ''}`}
                                    onClick={() => setLength(l.id)}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{l.icon}</span> {l.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sell style (only for promote/launch) */}
                    {['promote', 'launch'].includes(goal) && (
                        <div className="ar-section">
                            <p className="ar-section-title">
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sell</span> Selling Approach
                            </p>
                            <div className="ar-chip-row">
                                {SELL_STYLES.map(s => (
                                    <button key={s.id}
                                        className={`ar-opt-chip ${sellStyle === s.id ? 'active' : ''}`}
                                        onClick={() => setSellStyle(s.id)}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ─── BLOG PATH ─── */}
            {contentType === 'blog' && (
                <div className="ar-section-grid animate-fade-in">
                    {/* Blog type */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>article</span> Blog Type
                        </p>
                        <div className="ar-chip-row">
                            {BLOG_TYPES.map(t => (
                                <button key={t.id}
                                    className={`ar-opt-chip ${blogType === t.id ? 'active' : ''}`}
                                    onClick={() => setBlogType(t.id)}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Word count */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>format_size</span>
                            Word Count — <strong style={{ color: 'var(--sys-primary)' }}>{targetWordCount.toLocaleString()}</strong>
                        </p>
                        <input type="range" min={800} max={3000} step={100} value={targetWordCount}
                            onChange={e => setTargetWordCount(Number(e.target.value))}
                            className="ar-range" />
                        <div className="ar-range-labels">
                            <span>800</span><span>1500</span><span>2000</span><span>3000</span>
                        </div>
                    </div>

                    {/* Keywords */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>key</span> Target Keywords
                        </p>
                        <input
                            value={keywords}
                            onChange={e => setKeywords(e.target.value)}
                            placeholder="e.g. digital marketing, brand strategy, SEO tips"
                            className="ar-keyword-input"
                        />
                    </div>

                    {/* Tone for blog */}
                    <div className="ar-section">
                        <p className="ar-section-title">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>palette</span> Tone
                        </p>
                        <div className="ar-chip-row">
                            {TONES.map(t => (
                                <button key={t.id}
                                    className={`ar-opt-chip ${tone === t.id ? 'active' : ''}`}
                                    onClick={() => setTone(t.id)}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{t.icon}</span> {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── SHARED: Language + Advanced ─── */}
            <div className="ar-footer-section">
                {/* Language chip */}
                <div className="ar-lang-row">
                    <span className="ar-section-title" style={{ marginBottom: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>translate</span> Language
                    </span>
                    <select value={language} onChange={e => setLanguage(e.target.value)} className="ar-lang-select">
                        <option value="english">🇬🇧 English</option>
                        <option value="hindi">🇮🇳 Hindi</option>
                        <option value="tamil">🇮🇳 Tamil</option>
                        <option value="telugu">🇮🇳 Telugu</option>
                        <option value="bengali">🇮🇳 Bengali</option>
                        <option value="marathi">🇮🇳 Marathi</option>
                        <option value="gujarati">🇮🇳 Gujarati</option>
                        <option value="punjabi">🇮🇳 Punjabi</option>
                        <option value="kannada">🇮🇳 Kannada</option>
                    </select>
                    {language !== 'english' && (
                        <select value={langStyle} onChange={e => setLangStyle(e.target.value)} className="ar-lang-select">
                            <option value="pure">Pure {language}</option>
                            <option value="mixed">Mix with English</option>
                            <option value="slang">Local Slang</option>
                        </select>
                    )}
                    {language !== 'english' && (
                        <select value={scriptType} onChange={e => setScriptType(e.target.value)} className="ar-lang-select">
                            <option value="regional">Regional Script</option>
                            <option value="roman">Roman Letters</option>
                        </select>
                    )}
                </div>

                {/* Advanced toggle */}
                <button onClick={() => setShowAdvanced(a => !a)} className="ar-advanced-toggle">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{showAdvanced ? 'expand_less' : 'tune'}</span>
                    Advanced Settings
                    <span className="ar-badge">{modelOverride === 'auto' ? 'Auto' : modelOverride}</span>

                </button>
                {showAdvanced && (
                    <div className="ar-advanced-panel animate-fade-in">
                        <div className="ar-section">
                            <p className="ar-section-title">Research Depth</p>
                            <div className="ar-chip-row">
                                <button className={`ar-opt-chip ${researchDepth === 'quick' ? 'active' : ''}`} onClick={() => setResearchDepth('quick')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span> Quick
                                </button>
                                <button className={`ar-opt-chip ${researchDepth === 'deep' ? 'active' : ''}`} onClick={() => setResearchDepth('deep')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>psychology</span> Deep Research
                                </button>
                            </div>
                        </div>
                        <div className="ar-section">
                            <p className="ar-section-title">AI Model</p>
                            <div className="ar-chip-row">
                                {availableProviders.map(p => (
                                    <button key={p.id} className={`ar-opt-chip ${modelOverride === p.id ? 'active' : ''}`}
                                        onClick={() => setModelOverride(p.id)}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{p.icon}</span> {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CTA */}
            <button onClick={handleConfirm} className="ar-cta-btn" disabled={contentType === 'social' && channel.length === 0}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
                Review Brief →
            </button>
        </div>
    )
}

// ============================================================================
// BRIEF REVIEW — Creative brief confirmation before generation
// ============================================================================
function BriefReview({ refinedData, activeBrand, onGenerate, onBack, generating }) {
    const brandName = activeBrand?.name || 'Your Brand'
    const dna = activeBrand?.dna || {}
    const isBlog = refinedData.contentType === 'blog'

    const channelLabel = Array.isArray(refinedData.channel)
        ? refinedData.channel.map(c => CHANNELS.find(ch => ch.id === c)?.label || c).join(', ')
        : CHANNELS.find(c => c.id === refinedData.channel)?.label || refinedData.channel || '—'
    const toneLabel = TONES.find(t => t.id === refinedData.tone)?.label || refinedData.tone
    const lengthLabel = LENGTHS.find(l => l.id === refinedData.length)?.label || refinedData.length
    const goalData = GOALS.find(g => g.id === refinedData.goal)

    return (
        <div className="br-root animate-fade-in">
            <button onClick={onBack} className="ar-back-btn">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span> Back
            </button>

            <div className="br-card">
                <div className="br-header">
                    <span className="material-symbols-outlined br-header-icon">assignment</span>
                    <div>
                        <h3 className="br-title">Creative Brief</h3>
                        <p className="br-subtitle">Review and confirm before Fidato generates</p>
                    </div>
                </div>

                <div className="br-body">
                    {/* Row: Type */}
                    <div className="br-row">
                        <span className="br-row-label">Type</span>
                        <span className="br-row-value">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{isBlog ? 'edit_note' : 'share'}</span>
                            {isBlog ? `${refinedData.blogType?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'SEO Blog'} • ${refinedData.targetWordCount?.toLocaleString() || '1,200'} words`
                                : `${goalData?.label || 'Social Post'} • ${lengthLabel}`}
                        </span>
                    </div>

                    {/* Row: Brand */}
                    <div className="br-row">
                        <span className="br-row-label">Brand</span>
                        <span className="br-row-value">
                            {brandName} • {toneLabel} tone
                            {dna.defaultLanguage && dna.defaultLanguage !== 'english' && ` • ${dna.defaultLanguage}`}
                        </span>
                    </div>

                    {/* Row: Platform / Channel */}
                    {!isBlog && (
                        <div className="br-row">
                            <span className="br-row-label">Platform</span>
                            <span className="br-row-value">{channelLabel}</span>
                        </div>
                    )}

                    {/* Row: Context */}
                    <div className="br-row">
                        <span className="br-row-label">Context</span>
                        <span className="br-row-value br-row-context">{refinedData.details || refinedData.rawInput || '—'}</span>
                    </div>

                    {/* Row: Keywords (blog) */}
                    {isBlog && refinedData.keywords && (
                        <div className="br-row">
                            <span className="br-row-label">Keywords</span>
                            <span className="br-row-value">{refinedData.keywords}</span>
                        </div>
                    )}

                    {/* Row: Language */}
                    <div className="br-row">
                        <span className="br-row-label">Language</span>
                        <span className="br-row-value">
                            {refinedData.language === 'english' ? 'English' :
                                `${refinedData.language?.charAt(0).toUpperCase() + refinedData.language?.slice(1)} (${refinedData.langStyle || 'pure'}) — ${refinedData.scriptType || 'regional'} script`}
                        </span>
                    </div>

                    {/* Row: Research */}
                    <div className="br-row">
                        <span className="br-row-label">Research</span>
                        <span className="br-row-value">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{refinedData.researchDepth === 'deep' ? 'psychology' : 'bolt'}</span>
                            {refinedData.researchDepth === 'deep' ? 'Deep Research (Web + SEO + Competitors)' : 'Quick Research (Trending + Brand DNA)'}
                        </span>
                    </div>

                    {/* Image */}
                    {refinedData.imagePreview && (
                        <div className="br-row">
                            <span className="br-row-label">Image</span>
                            <span className="br-row-value">
                                <img src={refinedData.imagePreview} alt="ref" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                                Image will be analyzed
                            </span>
                        </div>
                    )}
                </div>

                {/* CTA */}
                <div className="br-footer">
                    <button onClick={onBack} className="br-edit-btn">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span> Edit Brief
                    </button>
                    <CreditTooltipWrapper action="content">
                        <button onClick={() => onGenerate(refinedData)} className="br-generate-btn" disabled={generating}>
                            {generating
                                ? <><span className="material-symbols-outlined animate-spin" style={{ fontSize: 16 }}>progress_activity</span> Generating...</>
                                : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span> Looks Good — Generate <CreditBadge action="content" /></>}
                        </button>
                    </CreditTooltipWrapper>
                </div>
            </div>
        </div>
    )
}

function StepSubType({ goal, onSelect, onBack }) {
    const goalData = GOALS.find(g => g.id === goal)
    return (
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            
            <div className="cs-header flex items-center gap-4">
                <div className={`cs-btn-icon !w-12 !h-12 ${goalData?.glow}`}>
                    <span className={`material-symbols-outlined text-xl ${goalData?.iconColor}`}>{goalData?.icon}</span>
                </div>
                <div>
                    <h3 className="cs-title">{goalData?.label}</h3>
                    <p className="cs-subtitle">What specifically?</p>
                </div>
            </div>

            <div className="cs-grid-adaptive">
                {goalData?.subTypes.map((st, i) => (
                    <button key={st.id} onClick={() => onSelect(st.id)}
                        className={`cs-glass-card cs-card-interactive cs-animate-fade cs-delay-${(i % 3) + 1} group`}
                        style={{ animationDelay: `${i * 60}ms` }}>
                        <span className="material-symbols-outlined text-xl text-[var(--sys-text-muted)] group-hover:text-primary transition-colors mb-2 block">{st.icon}</span>
                        <p className="text-sm font-bold text-[var(--sys-text)]">{st.label}</p>
                    </button>
                ))}
            </div>
        </div>
    )
}

function StepChannel({ onSelect, onBack, goal }) {
    const [selected, setSelected] = useState([])
    const isMulti = goal === 'educate' || goal === 'brand'

    const handleToggle = (id) => {
        if (id === 'multi') {
            setSelected(CHANNELS.filter(c => c.id !== 'multi').map(c => c.id))
            return
        }
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const handleContinue = () => {
        if (selected.length > 0) onSelect(selected.length === 1 ? selected[0] : selected)
    }

    return (
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            
            <div className="cs-header">
                <h3 className="cs-title">Where will this be <span>published?</span></h3>
                <p className="cs-subtitle">Content will be auto-optimized for the selected platform{selected.length > 1 ? 's' : ''}.</p>
            </div>

            <div className="cs-grid-adaptive">
                {CHANNELS.map((ch, i) => (
                    <button key={ch.id} onClick={() => handleToggle(ch.id)}
                        className={`cs-glass-card cs-card-interactive text-center cs-animate-fade cs-delay-${(i % 3) + 1} ${
                            selected.includes(ch.id) || (ch.id === 'multi' && selected.length > 2) ? 'cs-card-active' : ''
                        }`}
                        style={{ animationDelay: `${i * 50}ms` }}>
                        <span className="material-symbols-outlined text-2xl mb-2 block" style={{
                            color: selected.includes(ch.id) ? 'var(--sys-primary)' : 'var(--sys-text-muted)'
                        }}>{ch.fallbackIcon}</span>
                        <p className={`text-xs font-bold ${selected.includes(ch.id) ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{ch.label}</p>
                    </button>
                ))}
            </div>
            
            <button onClick={handleContinue} disabled={selected.length === 0}
                className="cs-btn-primary mt-8">
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
    const [analysisError, setAnalysisError] = useState(null)
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
                const errMsg = data.error || 'Analysis failed'
                setAnalysisError({ message: errMsg, isProviderError: data.isProviderError, provider: data.provider })
            }
        } catch (err) {
            setAnalysisError({ 
                message: err.message || 'Analysis failed', 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            })
        } finally {
                    setAnalyzing(false)
                }
            }
            autoAnalyze()
        }
    }, [initialImage]) // eslint-disable-line react-hooks/exhaustive-deps

    // Load library images when library tab is selected
    const loadLibrary = async (cat = libraryCategory) => {
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

    const handleDrop = (e) => {
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
    const fetchSuggestions = async () => {
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

    const toggleProduct = (product) => {
        setAttachedProducts(prev => {
            const exists = prev.find(p => p._id === product._id)
            if (exists) return prev.filter(p => p._id !== product._id)
            return [...prev, product]
        })
    }

    const handleContextComplete = () => {
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
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <div className="cs-header">
                <h3 className="cs-title">Add <span>context</span></h3>
                <p className="cs-subtitle">The more details you provide, the better the output.</p>
            </div>

            {/* Context type tabs */}
            <div className="cs-context-tabs">
                {[
                    { id: 'manual', icon: 'edit', label: 'Write Details' },
                    { id: 'url', icon: 'link', label: 'Paste Link' },
                    { id: 'upload', icon: 'upload', label: 'Upload Image' },
                    { id: 'library', icon: 'photo_library', label: 'Image Bank' },
                ].map(t => (
                    <button key={t.id} onClick={() => setContextType(t.id)}
                        className={`cs-tab-btn ${contextType === t.id ? 'active' : ''}`}>
                        <span className="material-symbols-outlined text-sm">{t.icon}</span> {t.label}
                        {t.id === 'library' && libraryCounts.all > 0 && (
                            <span className="bg-[var(--sys-surface)] text-xs px-1.5 py-0.5 rounded-full">{libraryCounts.all}</span>
                        )}
                    </button>
                ))}
            </div>
﻿
            <div className="cs-card p-6 border-[var(--sys-border)] bg-[var(--sys-surface)]">
                {/* Manual */}
            {contextType === 'manual' && (
                <div className="relative">
                    <textarea value={details} onChange={e => setDetails(e.target.value.slice(0, 5000))}
                        placeholder={placeholder} maxLength={5000}
                        className="cs-input-field cs-textarea-premium px-4 pr-14 py-4" rows={5} autoFocus />
                    <div className="absolute right-4 top-4">
                        <VoiceInput
                            onResult={(text) => setDetails(prev => prev ? prev + ' ' + text : text)}
                            size="small"
                        />
                    </div>
                </div>
            )}

            {/* URL */}
            {contextType === 'url' && (
                <div className="space-y-4">
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)]">link</span>
                        <input value={url} onChange={e => setUrl(e.target.value)}
                            placeholder="Paste product, page, or article URL"
                            className="cs-input-field pl-12 py-3" autoFocus />
                    </div>
                    <textarea value={details} onChange={e => setDetails(e.target.value)}
                        placeholder="Any additional notes? (optional)"
                        className="cs-input-field cs-textarea-premium p-4" rows={3} />
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
                                reader.onload = (ev) => setImagePreview(ev.target.result)
                                reader.readAsDataURL(file)
                            }
                        }} onDragOver={e => e.preventDefault()}
                            className="cs-upload-zone">
                            <span className="material-symbols-outlined cs-upload-icon">add_photo_alternate</span>
                            <p className="cs-upload-text">Drag & drop a product image or creative</p>
                            <p className="cs-upload-subtext">AI will analyze the image and create a content brief</p>
                            <label className="cs-btn-primary !h-9 !px-5 text-[10px] cursor-pointer inline-flex items-center mt-3 mx-auto w-auto">
                                Choose Image
                                <input type="file" className="hidden" onChange={(e) => {
                                    const file = e.target.files?.[0]
                                    if (file && file.type.startsWith('image/')) {
                                        setFiles([file])
                                        const reader = new FileReader()
                                        reader.onload = (ev) => setImagePreview(ev.target.result)
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
                                <img src={imagePreview} alt="Uploaded" className="w-full max-h-64 object-contain bg-[var(--sys-surface)] rounded-2xl" />
                                <button onClick={() => { setImagePreview(null); setFiles([]); setImageAnalysis(''); setAnalysisError('') }}
                                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] hover:bg-[var(--sys-primary-dim)] transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                                {files[0] && (
                                    <div className="absolute bottom-3 left-3 bg-[var(--sys-surface)] rounded-lg px-2.5 py-1">
                                        <span className="text-sm text-[var(--sys-text)]">{files[0].name} • {(files[0].size / 1024).toFixed(0)} KB</span>
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
                            <GlobalLoader 
                                isActive={analyzing} 
                                title="Analyzing image with Gemini Vision AI" 
                                currentStage="Detecting products, colors, mood, text, and marketing angles..." 
                                icon="psychology"
                                estimatedDuration={15}
                                thinkingContext="content"
                            />

                            {/* Analysis Error */}
                            {analysisError && (
                                <div className={`p-3 rounded-xl border ${analysisError.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm mb-4`}>
                                    <span className="material-symbols-outlined align-middle mr-1 text-sm">
                                        {analysisError.isProviderError ? 'warning' : 'error'}
                                    </span> 
                                    {analysisError.isProviderError && <span className="font-bold mr-1">[{analysisError.provider || 'AI Provider'}]</span>}
                                    {analysisError.message}
                                </div>
                            )}

                            {/* Analysis Result */}
                            {imageAnalysis && (
                                <div className="glass-panel rounded-2xl p-5 mb-4 animate-fade-in">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-primary">check_circle</span>
                                        <h4 className="text-base font-bold text-[var(--sys-text)]">AI Image Analysis</h4>
                                        <span className="text-sm text-primary bg-[var(--sys-primary-dim)] px-2 py-0.5 rounded-full font-bold">Gemini Vision</span>
                                    </div>
                                    <div className="text-sm text-[var(--sys-text-muted)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
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
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${libraryCategory === cat.id ? 'bg-primary/20 text-primary border border-primary/30' : 'glass-panel text-[var(--sys-text-muted)] hover:text-white'} `}>
                                {cat.label}
                                <span className="ml-1.5 text-xs opacity-60">{cat.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Loading */}
                    {libraryLoading && (
                        <div className="text-center py-8">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-2">progress_activity</span>
                            <p className="text-sm text-[var(--sys-text-muted)]">Loading your image library...</p>
                        </div>
                    )}

                    {/* Empty state */}
                    {!libraryLoading && libraryImages.length === 0 && (
                        <div className="text-center py-10 glass-panel rounded-2xl">
                            <span className="material-symbols-outlined text-4xl text-slate-700 mb-3 block">photo_library</span>
                            <h4 className="text-sm font-bold text-[var(--sys-text-muted)] mb-1">No images yet</h4>
                            <p className="text-xs text-[var(--sys-text-muted)]">Generate images in AI Photoshoot or upload images to build your library.</p>
                        </div>
                    )}

                    {/* Image grid */}
                    {!libraryLoading && libraryImages.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
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
                                    className="group relative rounded-xl overflow-hidden bg-[var(--sys-surface)] cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 aspect-square">
                                    <img src={img.thumbnailUrl || img.imageUrl} alt={img.title}
                                        className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 border border-[var(--sys-border)] opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-sm text-[var(--sys-text)] font-bold truncate">{img.title || 'Untitled'}</p>
                                        <div className="flex items-center gap-1 mt-0.5">
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${img.type === 'uploaded' ? 'bg-[#FF4D00]/30 text-[#FF7A00]' : img.type === 'ai-photoshoot' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]'} `}>
                                                {img.type === 'uploaded' ? 'Uploaded' : img.type === 'ai-photoshoot' ? 'Photoshoot' : 'Generated'}
                                            </span>
                                            <span className="text-[8px] text-[var(--sys-text-muted)]">{new Date(img.createdAt).toLocaleDateString()}</span>
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
                            className="glass-panel w-full py-3 rounded-xl text-xs font-bold text-primary hover:bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] flex items-center justify-center gap-2 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">smart_toy</span>
                            Find matching products from your catalog
                        </button>
                    )}

                    <GlobalLoader 
                        isActive={loadingSuggestions} 
                        title="AI finding relevant products..." 
                        currentStage="Matching your context to your product catalog" 
                        icon="smart_toy"
                        estimatedDuration={10}
                        thinkingContext="content"
                    />

                    {showProductPanel && suggestedProducts.length > 0 && (
                        <div className="animate-fade-in">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-primary">smart_toy</span>
                                    <h4 className="text-base font-bold text-[var(--sys-text)]">AI Product Match</h4>
                                    <span className="bg-[var(--sys-primary-dim)] text-primary text-xs px-2 py-0.5 rounded-full font-bold">{suggestedProducts.length} found</span>
                                </div>
                                <button onClick={() => setShowProductPanel(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {suggestedProducts.map(p => {
                                    const isAttached = attachedProducts.some(ap => ap._id === p._id)
                                    return (
                                        <button key={p._id} onClick={() => toggleProduct(p)}
                                            className={`glass-panel rounded-xl p-2.5 text-left transition-all cursor-pointer border ${isAttached ? 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)] ' : 'border-[var(--sys-border)] hover:border-[var(--sys-border)]'
                                                } `}>
                                            {p.images?.[0]?.url && (
                                                <img src={p.images[0].url} alt={p.title}
                                                    className="w-full h-20 object-cover rounded-lg mb-2 bg-[var(--sys-surface)]" />
                                            )}
                                            <p className="text-sm font-bold text-[var(--sys-text)] truncate">{p.title}</p>
                                            {p.price?.amount > 0 && (
                                                <p className="text-sm text-primary mt-0.5">₹{p.price.amount}</p>
                                            )}
                                            {isAttached && (
                                                <div className="flex items-center gap-1 mt-1.5">
                                                    <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                                                    <span className="text-sm text-primary font-bold">Attached</span>
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                            {attachedProducts.length > 0 && (
                                <p className="text-sm text-primary/70 mt-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">inventory_2</span>
                                    {attachedProducts.length} product{attachedProducts.length > 1 ? 's' : ''} will be included in your content
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>

            <button onClick={handleContextComplete}
                className="cs-btn-primary mt-8">
                {attachedProducts.length > 0 && (
                    <span className="bg-[var(--sys-surface)] text-xs px-2 py-0.5 rounded-full mr-2">{attachedProducts.length} product{attachedProducts.length > 1 ? 's' : ''}</span>
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
    const [researchDepth, setResearchDepth] = useState('quick') // 'quick' (Grok) or 'deep' (Perplexity)

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
        marathi: { regional: 'मराठीত लिहा', roman: 'Marathit liha' },
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
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <div className="cs-header">
                <h3 className="cs-title">Set the <span>vibe</span></h3>
                <p className="cs-subtitle">Language, tone, and style controls layer on top of your brand's voice.</p>
            </div>

            {/* Language Selector */}
            <div className="mb-6">
                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-3">
                    <span className="material-symbols-outlined text-xs align-middle mr-1">translate</span>
                    Language
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                ${language === l.id ? 'bg-primary text-white shadow-none' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'} `}>
                            <span className="text-sm">{l.flag}</span> {l.label}
                        </button>
                    ))}
                </div>

                {/* Language Style — only show for non-English */}
                {language !== 'english' && (
                    <div className="cs-grid-adaptive mt-4 cs-animate-fade">
                        {LANG_STYLES.map(s => (
                            <button key={s.id} onClick={() => setLangStyle(s.id)}
                                className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                                    langStyle === s.id ? 'cs-card-active' : ''
                                }`}>
                                <span className={`material-symbols-outlined text-lg block mb-1 ${langStyle === s.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{s.icon}</span>
                                <p className={`text-xs font-bold ${langStyle === s.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{s.label}</p>
                                <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">{s.desc}</p>
                            </button>
                        ))}
                    </div>
                )}

                {/* Script / Font — only for non-Latin regional languages */}
                {language !== 'english' && (
                    <div className="mt-4 animate-fade-in">
                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">
                            <span className="material-symbols-outlined text-xs align-middle mr-1">font_download</span>
                            Script / Font
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {SCRIPT_OPTIONS.map(s => (
                                <button key={s.id} onClick={() => setScriptType(s.id)}
                                    className={`glass-panel rounded-xl p-3 text-center transition-all cursor-pointer
                                        ${scriptType === s.id ? 'bg-primary/15 border-primary/40' : 'hover:bg-[var(--sys-surface)]'} `}>
                                    <span className={`material-symbols-outlined text-lg block mb-1 ${scriptType === s.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'} `}>{s.icon}</span>
                                    <p className={`text-xs font-bold ${scriptType === s.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'} `}>{s.label}</p>
                                    <p className="text-xs text-[var(--sys-text-muted)] mt-0.5">{s.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Tone */}
            <div className="mb-6">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">Tone & Style</p>
                <div className="cs-grid-adaptive">
                    {TONES.map(t => (
                        <button key={t.id} onClick={() => setTone(t.id)}
                            className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                                tone === t.id ? 'cs-card-active' : ''
                            }`}>
                            <span className={`material-symbols-outlined text-lg block mb-1 ${tone === t.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{t.icon}</span>
                            <p className={`text-xs font-bold ${tone === t.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{t.label}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Length */}
            <div className="mb-6">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">Length</p>
                <div className="cs-grid-adaptive">
                    {LENGTHS.map(l => (
                        <button key={l.id} onClick={() => setLength(l.id)}
                            className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                                length === l.id ? 'cs-card-active' : ''
                            }`}>
                            <span className={`material-symbols-outlined text-lg block mb-1 ${length === l.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{l.icon}</span>
                            <p className={`text-xs font-bold ${length === l.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{l.label}</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">{l.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Sell Style (for promote/launch) */}
            {showSellStyle && (
                <div className="mb-6">
                    <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">Selling Approach</p>
                    <div className="cs-grid-adaptive">
                        {SELL_STYLES.map(s => (
                            <button key={s.id} onClick={() => setSellStyle(s.id)}
                                className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                                    sellStyle === s.id ? 'cs-card-active' : ''
                                }`}>
                                <p className={`text-xs font-bold ${sellStyle === s.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{s.label}</p>
                                <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">{s.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── AI Model (Advanced — collapsed by default) ── */}
            <div className="mb-6">
                <button onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-1.5 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer w-full">
                    <span className="material-symbols-outlined text-xs">{showAdvanced ? 'expand_less' : 'tune'}</span>
                    <span className="uppercase tracking-widest font-bold">AI Model</span>
                    <span className="flex-1 h-px bg-[var(--sys-surface)]" />
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${modelOverride === 'auto' ? 'bg-primary/10 text-primary' : 'bg-primary/20 text-primary'}`}>
                        {modelOverride === 'auto' ? 'Auto' : `${(availableProviders.find(p => p.id === modelOverride)?.label || modelOverride)}`}
                    </span>
                </button>
                {showAdvanced && (
                    <div className="mt-4 cs-animate-fade">
                        <div className="cs-grid-adaptive">
                            {availableProviders.map(p => (
                                <button key={p.id} onClick={() => setModelOverride(p.id)}
                                    className={`cs-glass-card cs-card-interactive p-3 text-left transition-all cursor-pointer ${
                                        modelOverride === p.id ? 'cs-card-active' : ''
                                    }`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`material-symbols-outlined text-base ${modelOverride === p.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{p.icon}</span>
                                        <span className={`text-xs font-bold ${modelOverride === p.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{p.label}</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--sys-text-muted)]">{p.desc}</p>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] text-[var(--sys-text-muted)] mt-3 text-center">Auto mode picks the best model based on your language and content type</p>
                    </div>
                )}
            </div>

            {/* ── Research Depth Toggle ── */}
            <div className="mb-6">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">
                    <span className="material-symbols-outlined text-xs align-middle mr-1">neurology</span>
                    Research Depth
                </p>
                <div className="cs-grid-adaptive">
                    <button onClick={() => setResearchDepth('quick')}
                        className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                            researchDepth === 'quick' ? 'cs-card-active' : ''
                        }`}>
                        <span className={`material-symbols-outlined text-lg block mb-1 ${researchDepth === 'quick' ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>bolt</span>
                        <p className={`text-xs font-bold ${researchDepth === 'quick' ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>Quick Research</p>
                        <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">Fast + trending data</p>
                    </button>
                    <button onClick={() => setResearchDepth('deep')}
                        className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                            researchDepth === 'deep' ? 'cs-card-active !border-[#FF4D00]/40 !bg-[#FF4D00]/10' : ''
                        }`}>
                        <span className={`material-symbols-outlined text-lg block mb-1 ${researchDepth === 'deep' ? 'text-[#FF4D00]' : 'text-[var(--sys-text-muted)]'}`}>psychology</span>
                        <p className={`text-xs font-bold ${researchDepth === 'deep' ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>Deep Research</p>
                        <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">Web search + competitor + SEO</p>
                    </button>
                </div>
                <p className="text-xs text-[var(--sys-text-muted)] mt-2 text-center">
                    {researchDepth === 'quick' ? 'Uses Grok for fast trending intelligence' : 'Uses Perplexity + full web research for deeper insights'}
                </p>
            </div>

            <CreditTooltipWrapper action="content">
                <button onClick={() => onComplete({ tone, length, sellStyle, language, langStyle, scriptType, researchDepth })}
                    className="cs-btn-primary mt-8">
                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                    {researchDepth === 'deep' ? 'Generate with Deep Research' : 'Generate Content'} <CreditBadge action="content" />
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
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={prStep === 0 ? onBack : () => setPrStep(prStep - 1)}
                className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>

            <div className="cs-header">
                <h3 className="cs-title">
                    <span className="text-primary">Press Release</span> — {stepTitles[prStep]}
                </h3>
                <p className="cs-subtitle">Step {prStep + 1} of 4</p>
            </div>

            {/* Progress dots */}
            <div className="flex gap-1 mb-8">
                {stepTitles.map((_, i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= prStep ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'} `} />
                ))}
            </div>

            {/* Step 0: Purpose & Headline */}
            {prStep === 0 && (
                <div className="space-y-5">
                    <div>
                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Headline</p>
                        <input value={headline} onChange={e => setHeadline(e.target.value)}
                            placeholder="e.g. XYZ Corp Launches AI-Powered Platform for SMBs"
                            className="cs-input-field" />
                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">Leave blank to auto-generate from your description</p>
                    </div>
                    <div>
                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">What is this press release about?</p>
                        <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={4}
                            placeholder="Describe the announcement in detail. What happened? Why is this important? Include key facts, numbers, dates."
                            className="cs-input-field min-h-[120px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Language</p>
                            <div className="flex gap-2">
                                {LANGUAGES.map(l => (
                                    <button key={l.id} onClick={() => setLanguage(l.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                            ${language === l.id ? 'bg-[var(--sys-surface)] text-[var(--sys-text)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'} `}>
                                        <span className="text-sm">{l.flag}</span> {l.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Tone</p>
                            <div className="flex gap-2 flex-wrap">
                                {PR_TONES.map(t => (
                                    <button key={t.id} onClick={() => setTone(t.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                            ${tone === t.id ? 'bg-[var(--sys-surface)] text-[var(--sys-text)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'} `}>
                                        <span className="material-symbols-outlined text-xs">{t.icon}</span> {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => setPrStep(1)} disabled={!purpose.trim()}
                        className="cs-btn-primary w-full py-4 mt-4">
                        Continue to Distribution Strategy
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                </div>
            )}

            {/* Step 1: Distribution Channels */}
            {prStep === 1 && (
                <div className="space-y-6">
                    <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">
                        Where will this be distributed? <span className="text-[var(--sys-text-muted)] normal-case">Select all that apply</span>
                    </p>
                    <div className="cs-grid-adaptive">
                        {PR_DISTRIBUTION.map(d => (
                            <button key={d.id} onClick={() => toggleDistribution(d.id)}
                                className={`cs-glass-card cs-card-interactive p-4 text-left transition-all cursor-pointer ${
                                    distribution.includes(d.id) ? 'cs-card-active' : ''
                                }`}>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`material-symbols-outlined text-lg ${distribution.includes(d.id) ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{d.icon}</span>
                                    <span className={`text-xs font-bold ${distribution.includes(d.id) ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{d.label}</span>
                                    {distribution.includes(d.id) && <span className="material-symbols-outlined text-primary text-sm ml-auto">check_circle</span>}
                                </div>
                                <p className="text-[10px] text-[var(--sys-text-muted)]">{d.desc}</p>
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setPrStep(2)} disabled={distribution.length === 0}
                        className="cs-btn-primary w-full py-4 mt-4">
                        Continue to Witness Quotes
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                </div>
            )}

            {/* Step 2: Spokesperson Quotes */}
            {prStep === 2 && (
                <div className="space-y-6">
                    <p className="cs-subtitle uppercase tracking-widest font-bold mb-1 !text-left">Spokesperson Quotes</p>
                    <p className="text-[10px] text-[var(--sys-text-muted)] mb-3">Add quotes from key people. AI can also draft quotes if you leave the quote field blank.</p>

                    {quotes.map((q, idx) => (
                        <div key={idx} className="cs-glass-card p-4 space-y-4 relative">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[var(--sys-text)] font-bold">Quote #{idx + 1}</span>
                                {quotes.length > 1 && (
                                    <button onClick={() => removeQuote(idx)} className="text-[var(--sys-text-muted)] hover:text-primary cursor-pointer transition-colors">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input value={q.name} onChange={e => updateQuote(idx, 'name', e.target.value)}
                                    placeholder="Full Name" className="cs-input-field py-2 px-3 text-xs" />
                                <input value={q.title} onChange={e => updateQuote(idx, 'title', e.target.value)}
                                    placeholder="Title (CEO, Founder, etc.)" className="cs-input-field py-2 px-3 text-xs" />
                            </div>
                            <textarea value={q.quote} onChange={e => updateQuote(idx, 'quote', e.target.value)} rows={2}
                                placeholder="Their quote (leave blank for AI to draft)"
                                className="cs-input-field w-full py-2 px-3 text-xs resize-none" />
                        </div>
                    ))}
                    <button onClick={addQuote}
                        className="text-sm text-primary hover:text-[var(--sys-primary)] flex items-center gap-1 cursor-pointer font-bold transition-colors">
                        <span className="material-symbols-outlined text-sm">add</span> Add Another Quote
                    </button>
                    <button onClick={() => setPrStep(3)}
                        className="cs-btn-primary mt-4">
                        Continue → Details
                    </button>
                </div>
            )}

            {/* Step 3: Details & Publish */}
            {prStep === 3 && (
                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">City / Dateline</p>
                            <input value={city} onChange={e => setCity(e.target.value)}
                                placeholder="e.g. Mumbai, New Delhi" className="input-glass w-full py-2.5 px-3 rounded-lg text-xs" />
                        </div>
                        <div>
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Date</p>
                            <input value={dateline} onChange={e => setDateline(e.target.value)}
                                className="input-glass w-full py-2.5 px-3 rounded-lg text-xs" />
                        </div>
                    </div>

                    {/* Embargo */}
                    <div className="cs-glass-card p-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={embargo} onChange={e => setEmbargo(e.target.checked)}
                                className="accent-primary" />
                            <div>
                                <p className="text-sm text-[var(--sys-text)] font-bold">Embargoed Release</p>
                                <p className="text-xs text-[var(--sys-text-muted)]">Hide from public until a specific date</p>
                            </div>
                        </label>
                        {embargo && (
                            <input type="datetime-local" value={embargoDate} onChange={e => setEmbargoDate(e.target.value)}
                                className="cs-input-field mt-3 !py-2 h-10" />
                        )}
                    </div>

                    {/* Company Boilerplate */}
                    <div>
                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">About the Company (Boilerplate)</p>
                        <textarea value={boilerplate} onChange={e => setBoilerplate(e.target.value)} rows={3}
                            placeholder="Brief company description — auto-filled from brand profile if available"
                            className="cs-input-field text-xs min-h-[100px]" />
                    </div>

                    {/* Media Contact */}
                    <div>
                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Media Contact</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <input value={contactName} onChange={e => setContactName(e.target.value)}
                                placeholder="Contact Name" className="cs-input-field !py-2 h-10 px-3 text-xs" />
                            <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                                placeholder="Email" className="cs-input-field !py-2 h-10 px-3 text-xs" />
                            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                                placeholder="Phone" className="cs-input-field !py-2 h-10 px-3 text-xs" />
                        </div>
                    </div>

                    {/* CTA */}
                    <div>
                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Call to Action (Optional)</p>
                        <input value={cta} onChange={e => setCta(e.target.value)}
                            placeholder="e.g. Visit www.example.com for more info"
                            className="cs-input-field !py-2 h-10" />
                    </div>

                    {/* ── AI Model (Advanced — collapsed by default) ── */}
                    <div className="mb-6">
                        <button onClick={() => setShowAdvanced(!showAdvanced)}
                            className="flex items-center gap-1.5 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer w-full">
                            <span className="material-symbols-outlined text-xs">{showAdvanced ? 'expand_less' : 'tune'}</span>
                            <span className="uppercase tracking-widest font-bold">AI Model</span>
                            <span className="flex-1 h-px bg-[var(--sys-surface)]" />
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${modelOverride === 'auto' ? 'bg-primary/10 text-primary' : 'bg-primary/20 text-primary'} `}>
                                {modelOverride === 'auto' ? 'Auto' : `${(availableProviders.find(p => p.id === modelOverride)?.label || modelOverride)}`}
                            </span>
                        </button>
                        {showAdvanced && (
                            <div className="mt-4 cs-animate-fade">
                                <div className="cs-grid-adaptive">
                                    {availableProviders.map(p => (
                                        <button key={p.id} onClick={() => setModelOverride(p.id)}
                                            className={`cs-glass-card cs-card-interactive p-3 text-left transition-all cursor-pointer ${
                                                modelOverride === p.id ? 'cs-card-active' : ''
                                            }`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`material-symbols-outlined text-base ${modelOverride === p.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{p.icon}</span>
                                                <span className={`text-xs font-bold ${modelOverride === p.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{p.label}</span>
                                            </div>
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">{p.desc}</p>
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-[var(--sys-text-muted)] mt-3 text-center">Auto mode picks the best model based on your language and content type</p>
                            </div>
                        )}
                    </div>

                    <CreditTooltipWrapper action="content">
                        <button onClick={handleSubmit}
                            className="cs-btn-primary w-full py-4 mt-6">
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
    { id: 'video', icon: 'movie', label: 'YouTube Video', desc: 'Long-form (5-60 min)', color: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
    { id: 'shorts', icon: 'slow_motion_video', label: 'YouTube Shorts', desc: 'Under 60 seconds', color: 'from-[#FF4D00]/20 to-rose-500/10' },
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
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>

            {/* Header */}
            <div className="cs-header">
                <h3 className="cs-title">YouTube <span>Content Creator</span></h3>
                <p className="cs-subtitle">Script, title, description, tags & keywords — YouTube algorithm optimized</p>
            </div>

            {/* Brief Input */}
            <div className="mb-5">
                <label className="text-sm font-bold text-[var(--sys-text-muted)] mb-2 block">Video Brief *</label>
                <div className="relative">
                    <textarea
                        value={brief} onChange={e => setBrief(e.target.value)}
                        placeholder="Describe your video idea... e.g. '5 productivity hacks for 2026 that actually work — backed by science'"
                        className="input-glass w-full py-4 pr-14 resize-none text-[var(--sys-text)]" rows={4} autoFocus
                    />
                    <div className="absolute right-3 top-3">
                        <VoiceInput onResult={(text) => setBrief(prev => prev ? prev + ' ' + text : text)} size="small" />
                    </div>
                </div>
                <p className="text-xs text-[var(--sys-text-muted)] mt-1.5 flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">lightbulb</span> Be specific — include the hook, key points, or angle you want</p>
            </div>

            {/* Format Selection */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">Format Selection</p>
                <div className="cs-grid-adaptive">
                    {YT_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setFormat(f.id)}
                            className={`cs-glass-card cs-card-interactive p-4 text-left transition-all cursor-pointer ${
                                format === f.id ? 'cs-card-active' : ''
                            }`}>
                            <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: format === f.id ? 'var(--sys-primary)' : 'var(--sys-text-muted)' }}>{f.icon}</span>
                            <p className="text-sm font-bold text-[var(--sys-text)]">{f.label}</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">{f.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Video Length (only for long-form) */}
            {format === 'video' && (
                <div className="mb-8 animate-fade-in">
                    <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">Target Length</p>
                    <div className="cs-grid-adaptive">
                        {YT_LENGTHS.map(l => (
                            <button key={l.id} onClick={() => setVideoLength(l.id)}
                                className={`cs-glass-card cs-card-interactive p-3 text-center transition-all cursor-pointer ${
                                    videoLength === l.id ? 'cs-card-active' : ''
                                }`}>
                                <span className={`material-symbols-outlined text-sm mb-1 block ${videoLength === l.id ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{l.icon}</span>
                                <p className={`text-xs font-bold ${videoLength === l.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{l.label}</p>
                                <p className="text-[10px] text-[var(--sys-text-muted)]">{l.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Style */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3">Content Style</p>
                <div className="flex flex-wrap gap-2">
                    {YT_STYLES.map(s => (
                        <button key={s.id} onClick={() => setStyle(s.id)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                style === s.id 
                                ? 'bg-primary/20 text-primary border border-primary/30' 
                                : 'cs-glass-card !bg-transparent text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'
                            }`}>
                            <span className="material-symbols-outlined text-sm">{s.icon}</span> {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Audience */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3">Target Audience <span className="text-[var(--sys-text-muted)] normal-case">(optional)</span></p>
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                    placeholder="e.g. Entrepreneurs aged 25-40, tech enthusiasts, students"
                    className="cs-input-field w-full py-3 text-[var(--sys-text)]"
                />
            </div>

            {/* Language */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3">Language</p>
                <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                language === l.id 
                                ? 'bg-primary/20 text-primary border border-primary/30' 
                                : 'cs-glass-card !bg-transparent text-[var(--sys-text-muted)] hover:text-white'
                            }`}>
                            {l.flag} {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Model Override */}
            {availableProviders.length > 1 && (
                <div className="cs-glass-card p-4 mb-6">
                    <label className="text-[10px] uppercase tracking-widest font-black text-[var(--sys-text-muted)] mb-3 block flex items-center gap-1 opacity-60">
                        <span className="material-symbols-outlined text-xs">tune</span> AI Model
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {availableProviders.map(p => (
                            <button key={p.id} onClick={() => setModelOverride(p.id)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${modelOverride === p.id ? 'bg-primary/10 text-primary border border-primary/20' : 'text-[var(--sys-text-muted)] hover:text-white'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Generate Button */}
            <CreditTooltipWrapper action="content">
                <button onClick={handleSubmit} disabled={!brief.trim()}
                    className="cs-btn-primary mt-8 disabled:opacity-30">
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

const YTSectionHeader = ({ icon, title, count, sectionKey, copyText, color = 'text-primary', expanded, onToggle, onCopy, copied }) => (
    <div className="flex items-center justify-between mb-3">
        <button onClick={() => onToggle(sectionKey)} className="flex items-center gap-2 cursor-pointer group">
            <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
            <h4 className="text-base font-bold text-[var(--sys-text)]">{title}</h4>
            {count && <span className="text-xs bg-[var(--sys-surface)] text-[var(--sys-text-muted)] px-2 py-0.5 rounded-full">{count}</span>}
            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] group-hover:text-[var(--sys-text)] transition-colors">
                {expanded ? 'expand_less' : 'expand_more'}
            </span>
        </button>
        {copyText && (
            <button onClick={() => onCopy(copyText, sectionKey)}
                className="flex items-center gap-1 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">{copied === sectionKey ? 'check' : 'content_copy'}</span>
                {copied === sectionKey ? 'Copied!' : 'Copy'}
            </button>
        )}
    </div>
)

function YouTubeResultView({ result, youtubeData, onNewContent }) {
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

    return (
        <div className="cs-animate-fade cs-centered-container !max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--sys-border)]">
                <div className="flex items-center gap-4">
                    <div className="cs-btn-icon !w-12 !h-12 bg-primary/10 border-primary/20">
                        <span className="material-symbols-outlined text-2xl text-primary">smart_display</span>
                    </div>
                    <div>
                        <h3 className="cs-title">YouTube Content <span className="text-primary">Ready</span></h3>
                        <div className="flex items-center gap-2 mt-1">
                            {estimatedDuration && <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{estimatedDuration}</span>}
                            <span className="text-[10px] text-[var(--sys-text-muted)]">{script.split(/\s+/).length} words</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={copyAll} className="cs-glass-card !py-2 !px-3 !flex-row !gap-1.5 text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                        <span className="material-symbols-outlined text-sm">{copiedSection === 'all' ? 'check' : 'content_copy'}</span>
                        {copiedSection === 'all' ? 'Copied All!' : 'Copy All'}
                    </button>
                    <button onClick={onNewContent} className="cs-glass-card !py-2 !px-3 !flex-row !gap-1.5 text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                        <span className="material-symbols-outlined text-sm">add</span> New
                    </button>
                </div>
            </div>

            {/* Hook callout */}
            {hookScript && (
                <div className="cs-glass-card p-5 mb-6 !bg-primary/5 !border-primary/20 animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-primary">bolt</span>
                        <h4 className="text-sm font-bold text-primary">Opening Hook — First 5 Seconds</h4>
                        <button onClick={() => copySection(hookScript, 'hook')}
                            className="ml-auto text-xs text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'hook' ? 'check' : 'content_copy'}</span>
                        </button>
                    </div>
                    <p className="text-sm italic leading-relaxed text-[var(--sys-text)] opacity-90">"{hookScript}"</p>
                </div>
            )}

            {/* Title Section */}
            <div className="cs-glass-card p-6 mb-6">
                <YTSectionHeader icon="title" title="Video Title" sectionKey="title" copyText={videoTitle} color="text-primary" 
                    expanded={expandedSections.title} onToggle={toggleSection} onCopy={copySection} copied={copiedSection} />
                {expandedSections.title && (
                    <div className="cs-animate-fade">
                        <p className="text-lg font-bold text-[var(--sys-text)] leading-relaxed">{videoTitle}</p>
                        <div className="flex items-center gap-2 mt-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20`}>
                                {videoTitle.length} chars {videoTitle.length <= 70 ? '✓ Optimal' : videoTitle.length <= 100 ? '⚠ Long' : '❌ Too long'}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Script Section */}
            <div className="cs-glass-card p-6 mb-6">
                <YTSectionHeader icon="movie" title="Video Script" count={`${script.split(/\s+/).length} words`} sectionKey="script" copyText={script} 
                    expanded={expandedSections.script} onToggle={toggleSection} onCopy={copySection} copied={copiedSection} />
                {expandedSections.script && (
                    <div className="cs-animate-fade text-sm text-[var(--sys-text-muted)] leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                        {script}
                    </div>
                )}
            </div>

            {/* Description Section */}
            <div className="cs-glass-card p-6 mb-6">
                <YTSectionHeader icon="description" title="YouTube Description" sectionKey="description" copyText={description} 
                    expanded={expandedSections.description} onToggle={toggleSection} onCopy={copySection} copied={copiedSection} />
                {expandedSections.description && (
                    <div className="cs-animate-fade text-sm text-[var(--sys-text-muted)] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {description}
                    </div>
                )}
            </div>

            {/* Tags Section */}
            {tags.length > 0 && (
                <div className="cs-glass-card p-6 mb-6">
                    <YTSectionHeader icon="sell" title="Tags" count={`${tags.length} tags`} sectionKey="tags" copyText={tags.join(', ')} color="text-primary" 
                        expanded={expandedSections.tags} onToggle={toggleSection} onCopy={copySection} copied={copiedSection} />
                    {expandedSections.tags && (
                        <div className="cs-animate-fade flex flex-wrap gap-2">
                            {tags.map((tag, i) => (
                                <button key={i} onClick={() => copySection(tag, `tag-${i}`)}
                                    className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors cursor-pointer border border-primary/20">
                                    {copiedSection === `tag-${i}` ? '✓' : ''} {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Keywords Section */}
            {(keywords.primary?.length > 0 || keywords.secondary?.length > 0) && (
                <div className="cs-glass-card p-6 mb-6">
                    <YTSectionHeader icon="key" title="Keywords" sectionKey="keywords"
                        copyText={`Primary: ${(keywords.primary || []).join(', ')}\nSecondary: ${(keywords.secondary || []).join(', ')}`} color="text-primary" 
                        expanded={expandedSections.keywords} onToggle={toggleSection} onCopy={copySection} copied={copiedSection} />
                    {expandedSections.keywords && (
                        <div className="cs-animate-fade space-y-3">
                            {keywords.primary?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 opacity-80 flex items-center gap-1"><span className="material-symbols-outlined text-xs">target</span> Primary Keywords</p>
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.primary.map((kw, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">{kw}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {keywords.secondary?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] mb-2 opacity-60">📌 Secondary Keywords</p>
                                    <div className="flex flex-wrap gap-2">
                                        {keywords.secondary.map((kw, i) => (
                                            <span key={i} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-[10px] font-medium border border-[var(--sys-border)]">{kw}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Timestamps + Thumbnail Ideas row */}
            <div className="cs-grid-adaptive !grid-cols-1 md:!grid-cols-2 mb-6">
                {/* Timestamps */}
                {timestamps.length > 0 && (
                    <div className="cs-glass-card p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-lg text-primary">schedule</span>
                            <h4 className="text-sm font-bold text-[var(--sys-text)]">Timestamps</h4>
                            <button onClick={() => copySection(timestamps.map(t => `${t.time} ${t.label}`).join('\n'), 'timestamps')}
                                className="ml-auto text-xs text-[var(--sys-text-muted)] hover:text-primary cursor-pointer transition-colors">
                                <span className="material-symbols-outlined text-sm">{copiedSection === 'timestamps' ? 'check' : 'content_copy'}</span>
                            </button>
                        </div>
                        <div className="space-y-2">
                            {timestamps.map((ts, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs">
                                    <span className="text-primary font-mono font-bold min-w-[45px] px-1.5 py-0.5 rounded bg-primary/5 border border-primary/10">{ts.time}</span>
                                    <span className="text-[var(--sys-text-muted)]">{ts.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Thumbnail Ideas */}
                {thumbnailIdeas.length > 0 && (
                    <div className="cs-glass-card p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-lg text-primary">image</span>
                            <h4 className="text-sm font-bold text-[var(--sys-text)]">Thumbnail Ideas</h4>
                        </div>
                        <div className="space-y-3">
                            {thumbnailIdeas.map((idea, i) => (
                                <div key={i} className="flex items-start gap-2.5 text-xs">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">{i + 1}</span>
                                    <span className="text-[var(--sys-text-muted)] leading-relaxed">{idea}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Hashtags + CTA */}
            {(hashtags.length > 0 || ctaText) && (
                <div className="cs-glass-card p-6 mb-6">
                    <div className="flex flex-wrap items-center gap-6">
                        {hashtags.length > 0 && (
                            <div className="flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] mb-3 opacity-60">Hashtags</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {hashtags.map((h, i) => (
                                        <span key={i} className="text-[11px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1.5 rounded-lg border border-emerald-400/20">{h}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {ctaText && (
                            <div className="flex-1 min-w-[200px]">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] mb-3 opacity-60">Call to Action</p>
                                <p className="text-sm text-primary font-bold bg-primary/5 px-4 py-3 rounded-xl border border-primary/10 leading-relaxed italic">"{ctaText}"</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="cs-grid-adaptive !grid-cols-2 mt-8">
                <button onClick={copyAll}
                    className="cs-glass-card cs-card-interactive p-6 text-center group">
                    <span className="material-symbols-outlined text-2xl text-primary mb-2 block group-hover:scale-110 transition-transform">
                        {copiedSection === 'all' ? 'check_circle' : 'content_copy'}
                    </span>
                    <p className="text-sm font-bold text-[var(--sys-text)]">{copiedSection === 'all' ? 'Copied!' : 'Copy Everything'}</p>
                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 opacity-70">Title + Script + Description + Tags</p>
                </button>
                <button onClick={onNewContent}
                    className="cs-glass-card cs-card-interactive p-6 text-center group">
                    <span className="material-symbols-outlined text-2xl text-primary mb-2 block group-hover:scale-110 transition-transform">smart_display</span>
                    <p className="text-sm font-bold text-[var(--sys-text)]">Create Another</p>
                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 opacity-70">Start a new YouTube content</p>
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
        { id: 'music_video', icon: 'music_note', label: 'Music Video / Song', desc: 'Music video, lyric video, song release' },
        { id: 'film_trailer', icon: 'movie', label: 'Film / Trailer / Short Film', desc: 'Movie, web series, short film' },
        { id: 'review_unboxing', icon: 'rate_review', label: 'Review / Unboxing', desc: 'Product review, tech review, comparison' },
        { id: 'tutorial', icon: 'school', label: 'Tutorial / How-To', desc: 'Educational, how-to, guide' },
        { id: 'podcast_interview', icon: 'podcasts', label: 'Podcast / Interview', desc: 'Podcast episode, guest interview' },
        { id: 'vlog_travel', icon: 'videocam', label: 'Vlog / Travel / Lifestyle', desc: 'Daily vlog, travel, experience' },
        { id: 'gaming', icon: 'sports_esports', label: 'Gaming / Entertainment', desc: 'Gameplay, walkthrough, reaction' },
        { id: 'business', icon: 'trending_up', label: 'Business / Motivational', desc: 'Marketing, business, motivation' },
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
        <div className="cs-animate-fade cs-centered-container">
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>

            {/* Header */}
            <div className="cs-header">
                <h3 className="cs-title">YouTube <span>Publish Optimizer</span></h3>
                <p className="cs-subtitle">Algorithm-optimized title, description, tags & keywords — no script needed</p>
            </div>

            {/* Info callout */}
            <div className="cs-glass-card p-5 mb-8 !bg-primary/5 !border-primary/20">
                <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary text-xl">info</span>
                    <div>
                        <p className="text-sm text-primary font-bold mb-1">Already have your video? Just need the SEO metadata.</p>
                        <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed">We'll analyze YouTube search trends and generate 3 title options, a perfectly structured description, 20-30 tags, and keyword strategy — all optimized for the latest YouTube algorithm.</p>
                    </div>
                </div>
            </div>

            {/* Topic/Brief */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">What's your video about? *</p>
                <div className="relative">
                    <textarea
                        value={brief} onChange={e => setBrief(e.target.value)}
                        placeholder="e.g. 'Rambha Ho music video by Usha Uthup' or 'iPhone 17 Pro full review and comparison'"
                        className="cs-input-field w-full py-4 pr-14 resize-none min-h-[100px]" rows={3} autoFocus
                    />
                    <div className="absolute right-3 top-3">
                        <VoiceInput onResult={(text) => setBrief(prev => prev ? prev + ' ' + text : text)} size="small" />
                    </div>
                </div>
                <p className="text-[10px] text-[var(--sys-text-muted)] mt-2 flex items-center gap-1 opacity-80"><span className="material-symbols-outlined text-[10px]">lightbulb</span> Include specific names — artists, products, brands, topics. We'll research them for accurate metadata</p>
            </div>

            {/* Video Category — CRITICAL for context-aware output */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-1 !text-left">Video Category *</p>
                <p className="text-[10px] text-[var(--sys-text-muted)] mb-4">This determines the metadata format — music videos get different SEO than tutorials</p>
                <div className="cs-grid-adaptive">
                    {VIDEO_CATEGORIES.map(cat => (
                        <button key={cat.id} onClick={() => setVideoCategory(cat.id)}
                            className={`cs-glass-card cs-card-interactive p-3 text-left transition-all cursor-pointer ${
                                videoCategory === cat.id ? 'cs-card-active' : ''
                            }`}>
                            <p className="text-sm font-bold text-[var(--sys-text)]">{cat.label}</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 leading-tight">{cat.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Format Selection */}
            <div className="mb-8">
                <p className="cs-subtitle uppercase tracking-widest font-bold mb-3 !text-left">Format</p>
                <div className="cs-grid-adaptive">
                    {YT_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setFormat(f.id)}
                            className={`cs-glass-card cs-card-interactive p-4 text-left transition-all cursor-pointer ${
                                format === f.id ? 'cs-card-active' : ''
                            }`}>
                            <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: format === f.id ? 'var(--sys-primary)' : 'var(--sys-text-muted)' }}>{f.icon}</span>
                            <p className="text-sm font-bold text-[var(--sys-text)]">{f.label}</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">{f.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Target Audience */}
            <div className="mb-6">
                <label className="text-sm font-bold text-[var(--sys-text-muted)] mb-3 block">Target Audience <span className="text-[var(--sys-text-muted)] font-normal">(optional)</span></label>
                <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                    placeholder="e.g. Entrepreneurs, tech enthusiasts, beginners, students"
                    className="cs-input-field"
                />
            </div>

            {/* Language */}
            <div className="mb-8">
                <label className="text-sm font-bold text-[var(--sys-text-muted)] mb-3 block">Language</label>
                <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${language === l.id ? 'bg-primary/20 text-primary border border-primary/30' : 'cs-glass-card !bg-transparent text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                            {l.flag} {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate Button */}
            <CreditTooltipWrapper action="content">
                <button onClick={handleSubmit} disabled={!brief.trim() || !videoCategory}
                    className="cs-btn-primary w-full py-4 tracking-wide">
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
        if (charCount <= 55) return { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', label: '✓ Optimal', border: 'border-[var(--sys-border)]' }
        if (charCount <= 70) return { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', label: '⚠ Slightly long', border: 'border-[var(--sys-border)]' }
        return { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', label: '❌ Too long', border: 'border-[var(--sys-border)]' }
    }

    return (
        <div className="cs-animate-fade cs-centered-container !max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-[var(--sys-border)]">
                <div className="flex items-center gap-4">
                    <div className="cs-btn-icon !w-12 !h-12 bg-primary/10 border-primary/20">
                        <span className="material-symbols-outlined text-2xl text-primary">rocket_launch</span>
                    </div>
                    <div>
                        <h3 className="cs-title">YouTube SEO <span className="text-primary">Ready</span></h3>
                        <p className="cs-subtitle">Copy-paste directly into YouTube Studio</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={copyAll} className="cs-glass-card !py-2 !px-3 !flex-row !gap-1.5 text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                        <span className="material-symbols-outlined text-sm">{copiedSection === 'all' ? 'check' : 'content_copy'}</span>
                        {copiedSection === 'all' ? 'Copied All!' : 'Copy All'}
                    </button>
                    <button onClick={onNewContent} className="cs-glass-card !py-2 !px-3 !flex-row !gap-1.5 text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                        <span className="material-symbols-outlined text-sm">add</span> New
                    </button>
                </div>
            </div>

            {/* Title Options — the star of the show */}
            <div className="cs-glass-card p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-primary">title</span>
                        <h4 className="text-base font-bold text-[var(--sys-text)]">Title Options</h4>
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{titles.length} options</span>
                    </div>
                    {titles[selectedTitle]?.text && (
                        <button onClick={() => copySection(titles[selectedTitle].text, 'title')}
                            className="flex items-center gap-1 text-xs text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
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
                                className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                                    selectedTitle === i
                                    ? 'bg-primary/10 border-primary/30'
                                    : 'border-[var(--sys-border)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface-hover)]'
                                }`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1">
                                        <p className="text-base font-bold text-[var(--sys-text)] leading-relaxed">{t.text}</p>
                                        {t.strategy && <p className="text-xs text-[var(--sys-text-muted)] mt-1.5 italic flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">lightbulb</span> {t.strategy}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20`}>
                                            {charCount} chars {color.label}
                                        </span>
                                        {selectedTitle === i && (
                                            <span className="text-[10px] text-primary font-bold">✓ Selected</span>
                                        )}
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Description */}
            <div className="cs-glass-card p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-primary">description</span>
                        <h4 className="text-base font-bold text-[var(--sys-text)]">YouTube Description</h4>
                    </div>
                    <button onClick={() => copySection(description, 'description')}
                        className="flex items-center gap-1 text-xs text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">{copiedSection === 'description' ? 'check' : 'content_copy'}</span>
                        {copiedSection === 'description' ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <div className="text-sm text-[var(--sys-text-muted)] leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto pr-2 custom-scrollbar bg-[var(--sys-surface)] rounded-xl p-4 border border-[var(--sys-border)]">
                    {description}
                </div>
                <div className="flex items-center gap-3 mt-3">
                    <span className="text-[10px] text-[var(--sys-text-muted)] opacity-70">{description.length} chars • {description.split(/\s+/).length} words</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary border border-primary/20`}>
                        {description.length >= 300 && description.length <= 500 ? '✓ Optimal length' : description.length > 500 ? '✓ Good length' : '⚠ Short — aim for 300-500 words'}
                    </span>
                </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
                <div className="cs-glass-card p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-primary">sell</span>
                            <h4 className="text-base font-bold text-[var(--sys-text)]">Tags</h4>
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{tags.length} tags</span>
                        </div>
                        <button onClick={() => copySection(tags.join(', '), 'tags')}
                            className="flex items-center gap-1 text-xs text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'tags' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'tags' ? 'Copied!' : 'Copy All Tags'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag, i) => (
                            <button key={i} onClick={() => copySection(tag, `tag-${i}`)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                                    i === 0
                                    ? 'bg-primary/20 text-primary border-primary/40 font-bold'
                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border-[var(--sys-border)]'
                                }`}>
                                {copiedSection === `tag-${i}` ? '✓' : ''} {tag}
                                {i === 0 && <span className="ml-1 text-[8px] opacity-70">PRIMARY</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Keywords */}
            {(keywords.primary?.length > 0 || keywords.secondary?.length > 0) && (
                <div className="cs-glass-card p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-primary">key</span>
                            <h4 className="text-base font-bold text-[var(--sys-text)]">Keywords Strategy</h4>
                        </div>
                        <button onClick={() => copySection(`Primary: ${(keywords.primary || []).join(', ')}\nSecondary: ${(keywords.secondary || []).join(', ')}`, 'keywords')}
                            className="flex items-center gap-1 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'keywords' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'keywords' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="space-y-4">
                        {keywords.primary?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 opacity-80 flex items-center gap-1"><span className="material-symbols-outlined text-xs">target</span> Primary — High Volume</p>
                                <div className="flex flex-wrap gap-2">
                                    {keywords.primary.map((kw, i) => (
                                        <span key={i} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[10px] font-bold border border-primary/20">{kw}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {keywords.secondary?.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] mb-2 opacity-60">📌 Secondary — Long-Tail</p>
                                <div className="flex flex-wrap gap-2">
                                    {keywords.secondary.map((kw, i) => (
                                        <span key={i} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-[10px] font-medium border border-[var(--sys-border)]">{kw}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SEO Score + Competitor Insight */}
            <div className="cs-grid-adaptive !grid-cols-1 md:!grid-cols-2 mb-6">
                {/* SEO Score */}
                {seoScore.overallScore && (
                    <div className="cs-glass-card p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-lg text-primary">analytics</span>
                            <h4 className="text-sm font-bold text-[var(--sys-text)]">SEO Score</h4>
                        </div>
                        <div className="flex items-center justify-center mb-6">
                            <div className="w-24 h-24 rounded-full flex flex-col items-center justify-center border-4 border-primary/20 bg-primary/5">
                                <span className="text-2xl font-black text-primary leading-none">{seoScore.overallScore}</span>
                                <span className="text-[10px] text-primary/60 font-bold uppercase tracking-widest mt-1">/ 10</span>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {seoScore.titleOptimization && (
                                <div className="flex items-start gap-2 text-xs">
                                    <span className="material-symbols-outlined text-xs text-primary mt-0.5">check_circle</span>
                                    <span className="text-[var(--sys-text-muted)]"><span className="text-[var(--sys-text)] font-semibold">Title:</span> {seoScore.titleOptimization}</span>
                                </div>
                            )}
                            {seoScore.descriptionOptimization && (
                                <div className="flex items-start gap-2 text-xs">
                                    <span className="material-symbols-outlined text-xs text-primary mt-0.5">check_circle</span>
                                    <span className="text-[var(--sys-text-muted)]"><span className="text-[var(--sys-text)] font-semibold">Desc:</span> {seoScore.descriptionOptimization}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Competitor Insight */}
                {competitorInsight && (
                    <div className="cs-glass-card p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-lg text-primary">psychology</span>
                            <h4 className="text-sm font-bold text-[var(--sys-text)]">Competitor Insight</h4>
                        </div>
                        <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                            <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed italic">"{competitorInsight}"</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Hashtags */}
            {hashtags.length > 0 && (
                <div className="cs-glass-card p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg text-emerald-400">tag</span>
                            <h4 className="text-base font-bold text-[var(--sys-text)]">Hashtags</h4>
                        </div>
                        <button onClick={() => copySection(hashtags.join(' '), 'hashtags')}
                            className="flex items-center gap-1 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                            <span className="material-symbols-outlined text-sm">{copiedSection === 'hashtags' ? 'check' : 'content_copy'}</span>
                            {copiedSection === 'hashtags' ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {hashtags.map((h, i) => (
                            <span key={i} className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-400/20">{h}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="cs-grid-adaptive !grid-cols-2 mt-8">
                <button onClick={copyAll}
                    className="cs-glass-card cs-card-interactive p-6 text-center group">
                    <span className="material-symbols-outlined text-2xl text-primary mb-2 block group-hover:scale-110 transition-transform">
                        {copiedSection === 'all' ? 'check_circle' : 'content_copy'}
                    </span>
                    <p className="text-sm font-bold text-[var(--sys-text)]">{copiedSection === 'all' ? 'Copied!' : 'Copy Everything'}</p>
                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 opacity-70">Title + Description + Tags + Keywords</p>
                </button>
                <button onClick={onNewContent}
                    className="cs-glass-card cs-card-interactive p-6 text-center group">
                    <span className="material-symbols-outlined text-2xl text-primary mb-2 block group-hover:scale-110 transition-transform">rocket_launch</span>
                    <p className="text-sm font-bold text-[var(--sys-text)]">Optimize Another</p>
                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 opacity-70">Generate SEO for a new video</p>
                </button>
            </div>
        </div>
    )
}

// ============================================================================
// STEP BLOG WIZARD (Topic, Type, Word Count, Keywords)
// ============================================================================

function StepBlogWizard({ activeBrand, blogType, onGenerate, onBack, generating }) {
    const [topic, setTopic] = useState('')
    const [targetWordCount, setTargetWordCount] = useState(1500)
    const [keywords, setKeywords] = useState('')
    const [audience, setAudience] = useState('')
    const defaultLang = activeBrand?.dna?.defaultLanguage?.toLowerCase() || 'english'
    const [language, setLanguage] = useState(defaultLang)
    const [tone, setTone] = useState('professional')

    const TONES = ['professional', 'conversational', 'authoritative', 'friendly', 'witty', 'inspirational']
    const WORD_MARKS = [800, 1200, 1500, 2000, 2500, 3000]

    return (
        <div className="cs-centered-container">
            <header className="cs-header">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="cs-btn-icon" data-wt="wizard-back">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="cs-title">Blog <span className="text-primary">Wizard</span></h2>
                        <p className="cs-subtitle">AI-powered long-form content generation with research intelligence</p>
                    </div>
                </div>
            </header>

            {/* Topic */}
            <div className="cs-glass-card p-8 mb-6">
                <label className="text-sm font-bold text-[var(--sys-text)] mb-3 block flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">edit_note</span>
                    What's your blog about?
                </label>
                <textarea
                    value={topic} onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g., '10 ways AI is transforming digital marketing in 2025' or 'Complete guide to building a D2C brand from scratch'"
                    className="cs-input-field min-h-[120px]"
                    rows={3}
                />
            </div>

            {/* Keywords & Audience Grid */}
            <div className="cs-grid-adaptive mb-6">
                <div className="cs-glass-card p-6">
                    <label className="text-sm font-bold text-[var(--sys-text)] mb-3 block">Target Keywords</label>
                    <input
                        value={keywords} onChange={(e) => setKeywords(e.target.value)}
                        placeholder="e.g., digital marketing, AI tools"
                        className="cs-input-field"
                    />
                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-2 opacity-60 italic">Comma separated keywords for SEO optimization</p>
                </div>

                <div className="cs-glass-card p-6">
                    <label className="text-sm font-bold text-[var(--sys-text)] mb-3 block">Target Audience</label>
                    <input value={audience} onChange={(e) => setAudience(e.target.value)}
                        placeholder="e.g., Startup founders, Gen Z"
                        className="cs-input-field" />
                </div>
            </div>

            <div className="cs-grid-adaptive mb-6">
                {/* Word Count */}
                <div className="cs-glass-card p-6">
                    <label className="text-sm font-bold text-[var(--sys-text)] mb-4 block flex items-center justify-between">
                        <span>Projected Length</span>
                        <span className="text-primary font-black">{targetWordCount}+ words</span>
                    </label>
                    <input type="range" min={800} max={3000} step={100} value={targetWordCount}
                        onChange={(e) => setTargetWordCount(Number(e.target.value))}
                        className="cs-range-slider mb-4" />
                    <div className="flex justify-between">
                        {WORD_MARKS.map(w => (
                            <button key={w} 
                                onClick={() => setTargetWordCount(w)}
                                className={`text-[10px] font-bold transition-all px-1.5 py-0.5 rounded-md ${targetWordCount === w ? 'bg-primary/10 text-primary' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                {w >= 1000 ? `${w/1000}k` : w}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tone */}
                <div className="cs-glass-card p-6">
                    <label className="text-sm font-bold text-[var(--sys-text)] mb-4 block text-center">Brand Tone</label>
                    <div className="flex flex-wrap gap-2 justify-center">
                        {TONES.map(t => (
                            <button key={t} onClick={() => setTone(t)}
                                className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all border ${tone === t ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-transparent text-[var(--sys-text-muted)] border-[var(--sys-border)] hover:border-primary/50'}`}>
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Language Selection */}
            <div className="cs-glass-card p-6 mb-8">
                <label className="text-sm font-bold text-[var(--sys-text)] mb-4 block text-center uppercase tracking-widest opacity-60">Output Language</label>
                <div className="flex flex-wrap gap-3 justify-center">
                    {[{id: 'english', label: 'English', flag: '🇬🇧'}, {id: 'hindi', label: 'Hindi', flag: '🇮🇳'}, {id: 'hinglish', label: 'Hinglish', flag: '🗣️'}, {id: 'regional', label: 'Regional', flag: '📍'}].map(l => (
                        <button key={l.id} onClick={() => setLanguage(l.id)}
                            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border-2 ${language === l.id ? 'border-primary bg-primary/5 text-[var(--sys-text)] shadow-md shadow-primary/10' : 'border-transparent text-[var(--sys-text-muted)] hover:border-[var(--sys-border)]'}`}>
                            <span className="text-base">{l.flag}</span>
                            {l.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Generate */}
            <button onClick={() => onGenerate({ topic, blogType, targetWordCount, keywords: keywords.split(',').map(k => k.trim()).filter(Boolean), targetAudience: audience, tone, language })}
                disabled={!topic.trim() || generating}
                className="cs-btn-primary w-full py-5 text-lg group" data-wt="wizard-generate">
                <span className={`material-symbols-outlined group-hover:rotate-12 transition-transform ${generating ? 'animate-spin' : ''}`}>{generating ? 'progress_activity' : 'rocket_launch'}</span>
                {generating ? 'Engine spinning up...' : 'Generate Full Blog Article'}
            </button>
        </div>
    )
}

// ============================================================================
// SMART BLOG WRITER — Custom write mode with AI assistance
// Features: Synonyms (debounced), grammar check, rephrase, expand, image gen
// ============================================================================

function SmartBlogWriter({ activeBrand, onBack, onGenerateImage }) {
    // (React hooks are imported at the top of this file)
    const [title, setTitle] = useState('')
    const [sections, setSections] = useState([{ heading: '', body: '', imageUrl: '', imageAlt: '', imageRatio: '' }])
    const [activeSection, setActiveSection] = useState(0)
    const [synonyms, setSynonyms] = useState([])
    const [grammarIssues, setGrammarIssues] = useState({}) // { sectionIdx: [{original, corrected, reason}] }
    const [rephraseSuggestions, setRephraseSuggestions] = useState(null)
    const [expandResult, setExpandResult] = useState(null)
    const [assistLoading, setAssistLoading] = useState('')
    const [imageStylePicker, setImageStylePicker] = useState(null) // null | -1 (hero) | sectionIdx
    const [heroImageUrl, setHeroImageUrl] = useState('')
    const [generatingImage, setGeneratingImage] = useState(null)
    const [selectedImageStyle, setSelectedImageStyle] = useState('editorial')
    const [selectedImageRatio, setSelectedImageRatio] = useState('9:16')
    const [showAssistPanel, setShowAssistPanel] = useState(true)
    const [assistQuery, setAssistQuery] = useState('')
    const [copied, setCopied] = useState('')
    const synonymTimerRef = useRef(null)
    const lastWordRef = useRef('')

    const IMAGE_STYLES = [
        { id: 'editorial', label: 'Editorial', icon: 'photo_camera' },
        { id: 'lifestyle', label: 'Lifestyle', icon: 'sunny' },
        { id: '3d', label: '3D Render', icon: 'view_in_ar' },
        { id: 'flat_illustration', label: 'Flat Art', icon: 'brush' },
    ]
    const IMAGE_RATIOS = [
        { id: '9:16', label: '9:16', icon: 'crop_portrait' },
        { id: '1:1', label: '1:1', icon: 'crop_square' },
        { id: '16:9', label: '16:9', icon: 'crop_landscape' },
    ]

    const totalWords = useMemo(() =>
        sections.reduce((sum, s) => sum + (s.body || '').split(/\s+/).filter(Boolean).length, 0)
    , [sections])

    const updateSection = (idx, key, val) => {
        setSections(prev => {
            const next = [...prev]
            next[idx] = { ...next[idx], [key]: val }
            return next
        })
    }

    const addSection = () => setSections(prev => [...prev, { heading: '', body: '', imageUrl: '', imageAlt: '', imageRatio: '' }])
    const removeSection = (idx) => setSections(prev => prev.filter((_, i) => i !== idx))

    // Synonym fetch on SPACE keyup — keyup fires AFTER the space is inserted, so val has the complete word
    const handleBodyKeyUp = (idx, e) => {
        if (e.key !== ' ' && e.key !== 'Space') return
        const val = e.target.value
        // The space just got inserted — find the word right before the cursor's space
        const cursorPos = e.target.selectionStart
        const textBeforeCursor = val.substring(0, cursorPos).trimEnd()
        const words = textBeforeCursor.split(/\s+/)
        const lastWord = words[words.length - 1]?.replace(/[^a-zA-Z]/g, '')
        if (!lastWord || lastWord.length < 3 || lastWord === lastWordRef.current) return
        lastWordRef.current = lastWord
        clearTimeout(synonymTimerRef.current)
        synonymTimerRef.current = setTimeout(async () => {
            try {
                const data = await contentAPI.blogAssist({ type: 'synonyms', text: lastWord, context: sections[idx]?.heading || title })
                if (data.success) {
                    // result may be an array directly, or { words: [] }, or the array is data.result itself
                    const arr = Array.isArray(data.result) ? data.result
                        : Array.isArray(data.result?.words) ? data.result.words
                        : []
                    if (arr.length > 0) setSynonyms(arr.slice(0, 5))
                }
            } catch (e) { console.warn('Synonym fetch failed:', e.message) }
        }, 50)
    }

    // Update body text on change (also clears synonyms on new typing)
    const handleBodyChange = (idx, val) => {
        updateSection(idx, 'body', val)
        // Clear synonyms when user resumes typing (not on space)
    }

    const insertSynonym = (idx, synonym) => {
        const body = sections[idx]?.body || ''
        const words = body.trimEnd().split(/\s+/)
        words[words.length - 1] = synonym
        updateSection(idx, 'body', words.join(' ') + ' ')
        setSynonyms([])
        lastWordRef.current = ''
    }

    // Grammar check on blur — uses contentAPI.blogAssist (JWT auth)
    const handleBodyBlur = async (idx) => {
        const text = sections[idx]?.body?.trim()
        if (!text || text.length < 20) return
        try {
            const data = await contentAPI.blogAssist({ type: 'grammar', text })
            if (data.success && data.result?.hasErrors) {
                setGrammarIssues(prev => ({ ...prev, [idx]: data.result.suggestions || [] }))
            } else {
                setGrammarIssues(prev => { const n = { ...prev }; delete n[idx]; return n })
            }
        } catch { /* silent */ }
    }

    const applyGrammarFix = (idx) => {
        contentAPI.blogAssist({ type: 'grammar', text: sections[idx]?.body })
            .then(data => {
                if (data.success && data.result?.cleanedText) {
                    updateSection(idx, 'body', data.result.cleanedText)
                    setGrammarIssues(prev => { const n = { ...prev }; delete n[idx]; return n })
                }
            }).catch(() => {})
    }

    // Rephrase selected text — uses contentAPI.blogAssist (JWT auth)
    const handleRephrase = async (idx) => {
        const el = document.getElementById(`sbw-body-${idx}`)
        const sel = el?.value?.substring(el.selectionStart, el.selectionEnd)?.trim()
        const text = sel || sections[idx]?.body?.trim()
        if (!text) return
        setAssistLoading('rephrase')
        try {
            const data = await contentAPI.blogAssist({ type: 'rephrase', text })
            if (data.success && Array.isArray(data.result)) setRephraseSuggestions({ idx, versions: data.result, original: text })
        } catch { /* silent */ }
        finally { setAssistLoading('') }
    }

    const applyRephrase = (version) => {
        if (!rephraseSuggestions) return
        const { idx, original } = rephraseSuggestions
        const body = sections[idx].body.replace(original, version.text)
        updateSection(idx, 'body', body)
        setRephraseSuggestions(null)
    }

    // Expand section — uses contentAPI.blogAssist (JWT auth)
    const handleExpand = async (idx) => {
        const text = sections[idx]?.body?.trim()
        if (!text) return
        setAssistLoading('expand')
        try {
            const data = await contentAPI.blogAssist({ type: 'expand', text, context: sections[idx]?.heading || title })
            if (data.success && data.result?.expanded) setExpandResult({ idx, expanded: data.result.expanded })
        } catch { /* silent */ }
        finally { setAssistLoading('') }
    }

    // Image generation
    const handleGenerateSectionImage = async (idx) => {
        if (!onGenerateImage) return
        setGeneratingImage(idx)
        setImageStylePicker(null)
        try {
            const isHero = idx === -1
            const ratio = isHero ? '16:9' : selectedImageRatio
            const result = await onGenerateImage(idx, selectedImageStyle, {}, ratio)
            if (result?.imageUrl) {
                if (isHero) setHeroImageUrl(result.imageUrl)
                else updateSection(idx, 'imageUrl', result.imageUrl)
                if (result.imageRatio || ratio) {
                    if (!isHero) updateSection(idx, 'imageRatio', result.aspectRatio || ratio)
                }
            }
        } catch (err) {
            console.error('Failed to generate image:', err)
        } finally {
            setGeneratingImage(null)
        }
    }

    const exportMarkdown = () => {
        let md = `# ${title || 'Untitled Blog'}\n\n`
        if (heroImageUrl) md += `![Hero](${heroImageUrl})\n\n`
        sections.forEach(s => {
            md += `## ${s.heading || ''}\n\n`
            if (s.imageUrl) md += `![${s.heading || 'Image'}](${s.imageUrl})\n\n`
            md += `${s.body}\n\n`
        })
        navigator.clipboard.writeText(md)
        setCopied('md'); setTimeout(() => setCopied(''), 2000)
    }

    return (
        <div className="cs-blog-canvas">
            {/* Header */}
            <header className="cs-header flex items-center justify-between mb-10 pb-4 border-b border-[var(--sys-border)]">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="cs-btn-secondary h-10 px-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>
                    <div>
                        <h3 className="cs-title">Manual <span className="text-primary">Draft</span></h3>
                        <p className="cs-subtitle">{totalWords} words · {sections.length} sections · Real-time AI assist</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={exportMarkdown} className="cs-btn-secondary h-10 px-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">{copied === 'md' ? 'check' : 'description'}</span>
                        {copied === 'md' ? 'Copied' : 'MD'}
                    </button>
                    <button onClick={() => setShowAssistPanel(p => !p)}
                        className={`cs-btn-secondary h-10 px-4 flex items-center gap-2 ${showAssistPanel ? '!text-primary !border-primary/20 !bg-primary/5' : ''}`}>
                        <span className="material-symbols-outlined text-sm">psychology</span>
                        Assist
                    </button>
                </div>
            </header>

            {/* Hero Cover */}
            <div className="mb-12">
                {heroImageUrl ? (
                    <div className="cs-blog-image-wrapper !ml-0 group border border-[var(--sys-border)]">
                        <img src={heroImageUrl} alt="Cover" className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                            <button onClick={() => setImageStylePicker(-1)} className="cs-btn-secondary h-10 px-4 !bg-white/10 !border-white/20 !text-white backdrop-blur-md">
                                <span className="material-symbols-outlined text-sm mr-1">refresh</span> REGENERATE
                            </button>
                            <button onClick={() => setHeroImageUrl('')} className="cs-btn-secondary h-10 px-4 !bg-red-500/10 !border-red-500/20 !text-red-400 backdrop-blur-md">
                                <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setImageStylePicker(-1)} className="w-full p-16 rounded-2xl border-2 border-dashed border-[var(--sys-border)] bg-[var(--sys-surface)]/30 hover:bg-[var(--sys-surface)] hover:border-primary/50 transition-all group flex flex-col items-center gap-3">
                        <span className={`material-symbols-outlined text-5xl text-[var(--sys-text-muted)] group-hover:text-primary transition-all ${generatingImage === -1 ? 'animate-spin' : ''}`}>
                            {generatingImage === -1 ? 'progress_activity' : 'add_photo_alternate'}
                        </span>
                        <div className="text-center">
                            <p className="text-sm font-bold text-[var(--sys-text)]">Generate Cover Image</p>
                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">Stunning 16:9 header for your article</p>
                        </div>
                    </button>
                )}
                {imageStylePicker === -1 && (
                    <div className="cs-glass-card p-6 mt-4 border-primary/20 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold">Image Style</span>
                            <button onClick={() => setImageStylePicker(null)} className="cs-btn-icon"><span className="material-symbols-outlined text-sm">close</span></button>
                        </div>
                        <div className="cs-grid-adaptive !grid-cols-4 mb-6">
                            {IMAGE_STYLES.map(s => (
                                <button key={s.id} onClick={() => setSelectedImageStyle(s.id)}
                                    className={`p-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 ${selectedImageStyle === s.id ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                    <span className="material-symbols-outlined text-xl">{s.icon}</span>
                                    <span className="text-[10px] font-bold">{s.label}</span>
                                </button>
                            ))}
                        </div>
                        <button onClick={() => handleGenerateSectionImage(-1)} disabled={generatingImage !== null}
                            className="cs-btn-primary py-4">
                            <span className={`material-symbols-outlined text-sm ${generatingImage === -1 ? 'animate-spin' : ''}`}>{generatingImage === -1 ? 'progress_activity' : 'auto_awesome'}</span>
                            {generatingImage === -1 ? 'Creating...' : 'Generate AI Image'}
                        </button>
                    </div>
                )}
            </div>

            {/* Title Input */}
            <input value={title} onChange={e => setTitle(e.target.value)}
                className="cs-blog-title-input" placeholder="Your blog title..." />

            {/* Sections Flow */}
            <div className="mt-12 space-y-12">
                {sections.map((section, i) => (
                    <div key={i} className="group/section relative" onFocus={() => setActiveSection(i)}>
                        {/* Section Controls */}
                        <div className="absolute -left-12 top-2 flex flex-col gap-2 opacity-0 group-hover/section:opacity-100 transition-opacity">
                            <button onClick={addSection} className="cs-btn-icon !size-8" title="Add Section"><span className="material-symbols-outlined text-sm">add</span></button>
                            {sections.length > 1 && <button onClick={() => removeSection(i)} className="cs-btn-icon !size-8 !text-red-400" title="Delete"><span className="material-symbols-outlined text-sm">close</span></button>}
                        </div>

                        {/* Heading */}
                        <input value={section.heading} onChange={e => updateSection(i, 'heading', e.target.value)}
                            onClick={() => setActiveSection(i)}
                            className="cs-blog-section-heading" placeholder="Section Subheading..." />

                        {/* Context Toolbar */}
                        {activeSection === i && (
                            <div className="cs-blog-toolbar">
                                <button onMouseDown={e => e.preventDefault()} onClick={() => handleRephrase(i)} disabled={assistLoading === 'rephrase'} className="cs-blog-toolbar-btn">
                                    <span className={`material-symbols-outlined text-sm mr-1 ${assistLoading === 'rephrase' ? 'animate-spin' : ''}`}>{assistLoading === 'rephrase' ? 'progress_activity' : 'autorenew'}</span>
                                    <span className="text-[10px] font-bold">Rephrase</span>
                                </button>
                                <button onMouseDown={e => e.preventDefault()} onClick={() => handleExpand(i)} disabled={assistLoading === 'expand'} className="cs-blog-toolbar-btn">
                                    <span className={`material-symbols-outlined text-sm mr-1 ${assistLoading === 'expand' ? 'animate-spin' : ''}`}>{assistLoading === 'expand' ? 'progress_activity' : 'expand_content'}</span>
                                    <span className="text-[10px] font-bold">Expand</span>
                                </button>
                                <div className="w-px h-4 bg-[var(--sys-border)] mx-1"></div>
                                <button onMouseDown={e => e.preventDefault()} onClick={() => setImageStylePicker(i)} className="cs-blog-toolbar-btn">
                                    <span className="material-symbols-outlined text-sm mr-1">add_photo_alternate</span>
                                    <span className="text-[10px] font-bold">Image</span>
                                </button>
                                <div className="flex-1"></div>
                                {grammarIssues[i]?.length > 0 && (
                                    <button onClick={() => applyGrammarFix(i)} className="px-2 py-1 rounded bg-orange-500/10 text-orange-400 text-[10px] font-bold hover:bg-orange-500/20 transition-colors">
                                        FIX {grammarIssues[i].length} ERRORS
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Synonym Chips */}
                        {activeSection === i && synonyms.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-4 animate-fade-in flex-wrap">
                                <span className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-widest font-bold opacity-60">Synonyms:</span>
                                {synonyms.map(syn => (
                                    <button key={syn} onClick={() => insertSynonym(i, syn)}
                                        className="text-[10px] px-2.5 py-1 rounded-lg font-bold bg-primary/5 text-primary border border-primary/20 hover:bg-primary/10 transition-all">
                                        {syn}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Body Textarea */}
                        <div className="cs-blog-section">
                            <textarea
                                id={`sbw-body-${i}`}
                                value={section.body}
                                onChange={e => handleBodyChange(i, e.target.value)}
                                onKeyUp={e => handleBodyKeyUp(i, e)}
                                onFocus={() => setActiveSection(i)}
                                onBlur={() => handleBodyBlur(i)}
                                className="cs-blog-body-text"
                                style={{ minHeight: '180px' }}
                                rows={Math.max(7, Math.ceil((section.body || '').length / 90))}
                                placeholder="Start writing here... press Space for AI synonyms"
                            />
                        </div>

                        {/* Rephrase options */}
                        {rephraseSuggestions?.idx === i && (
                            <div className="cs-glass-card mb-6 animate-fade-in border-primary/20 bg-primary/5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-bold text-primary">Improved Alternatives</span>
                                    <button onClick={() => setRephraseSuggestions(null)} className="cs-btn-icon"><span className="material-symbols-outlined text-xs">close</span></button>
                                </div>
                                <div className="space-y-2">
                                    {rephraseSuggestions.versions.map(v => (
                                        <div key={v.version} className="p-3 rounded-xl border border-[var(--sys-border)] bg-[var(--sys-surface)] cursor-pointer hover:border-primary/40 transition-all" onClick={() => applyRephrase(v)}>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-primary mb-1 block">{v.style}</span>
                                            <p className="text-[13px] leading-relaxed text-[var(--sys-text)]">{v.text}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Image Output */}
                        {section.imageUrl && (
                            <div className="cs-blog-image-wrapper group border border-[var(--sys-border)]">
                                <img src={section.imageUrl} alt={section.imageAlt || section.heading} />
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setImageStylePicker(i)} className="cs-btn-secondary !h-8 !px-2 !bg-black/60 !backdrop-blur-md !text-white !border-white/20"><span className="material-symbols-outlined text-sm">refresh</span></button>
                                </div>
                            </div>
                        )}

                        {/* Section Image Picker Inline */}
                        {imageStylePicker === i && (
                            <div className="cs-glass-card p-6 my-6 border-primary/20 animate-fade-in ml-[-2.5rem]">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-xs font-bold">Visual Style</span>
                                    <div className="flex gap-1">
                                        {IMAGE_RATIOS.map(r => (
                                            <button key={r.id} onClick={() => setSelectedImageRatio(r.id)}
                                                className={`p-1.5 rounded-lg border transition-all ${selectedImageRatio === r.id ? 'border-primary text-primary bg-primary/10' : 'text-[var(--sys-text-muted)] border-transparent hover:bg-[var(--sys-surface)]'}`}>
                                                <span className="material-symbols-outlined text-sm">{r.icon}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="cs-grid-adaptive !grid-cols-4 mb-6">
                                    {IMAGE_STYLES.map(s => (
                                        <button key={s.id} onClick={() => setSelectedImageStyle(s.id)}
                                            className={`p-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 ${selectedImageStyle === s.id ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                            <span className="material-symbols-outlined text-xl">{s.icon}</span>
                                            <span className="text-[10px] font-bold">{s.label}</span>
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => handleGenerateSectionImage(i)} disabled={generatingImage !== null}
                                    className="cs-btn-primary py-4">
                                    <span className={`material-symbols-outlined text-sm ${generatingImage === i ? 'animate-spin' : ''}`}>{generatingImage === i ? 'progress_activity' : 'auto_awesome'}</span>
                                    {generatingImage === i ? 'Creating...' : `Generate ${selectedImageRatio} Visual`}
                                </button>
                            </div>
                        )}

                        {!section.imageUrl && imageStylePicker !== i && (
                            <button onClick={() => setImageStylePicker(i)} className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] border border-dashed border-[var(--sys-border)] hover:border-primary/40 hover:text-primary transition-all ml-[-2.5rem]">
                                <span className="material-symbols-outlined text-sm">add_photo_alternate</span>
                                Add Section Visual
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Smart Assist Panel */}
            {showAssistPanel && (
                <div className="cs-assist-bar">
                    <div className="cs-assist-container">
                        <span className="material-symbols-outlined text-primary text-lg">psychology</span>
                        <input value={assistQuery} onChange={e => setAssistQuery(e.target.value)}
                            className="flex-1 bg-transparent text-sm text-[var(--sys-text)] focus:outline-none placeholder-slate-600"
                            placeholder={`Ask AI to improve Section ${activeSection + 1}...`}
                            onKeyDown={async e => {
                                if (e.key !== 'Enter' || !assistQuery.trim()) return
                                setAssistLoading('ai')
                                try {
                                    const data = await contentAPI.blogAssist({ type: 'rephrase', text: sections[activeSection]?.body || assistQuery, context: assistQuery })
                                    if (data.success && Array.isArray(data.result)) setRephraseSuggestions({ idx: activeSection, versions: data.result, original: sections[activeSection]?.body || '' })
                                    setAssistQuery('')
                                } catch { /* silent */ }
                                finally { setAssistLoading('') }
                            }} />
                        {assistLoading === 'ai' && <span className="material-symbols-outlined text-primary animate-spin text-sm">progress_activity</span>}
                        <div className="hidden sm:flex items-center gap-1 text-[10px] font-black text-[var(--sys-text-muted)] opacity-60">
                            <span className="material-symbols-outlined text-[10px]">keyboard_return</span>
                            ASK AI
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// BLOG EDITOR VIEW — Medium-Style Rich Editor
// Inline images, formatting toolbar, contentEditable, clean typography
// Image style picker renders INLINE at each section (not at top)
// ============================================================================

const BlogImageStylePicker = ({ 
    sectionIndex, 
    onClose, 
    pickerTab, 
    setPickerTab, 
    IMAGE_RATIOS, 
    selectedImageRatio, 
    setSelectedImageRatio, 
    IMAGE_STYLES, 
    selectedImageStyle, 
    setSelectedImageStyle, 
    onGenerate, 
    generatingSection, 
    brandImages, 
    onUseBrandDirect, 
    onUseBrandAI 
}) => {
    const isHeroSection = sectionIndex === -1
    return (
        <div className="cs-glass-card p-6 my-6 border-primary/20 animate-fade-in" style={!isHeroSection ? { marginLeft: '-2.5rem' } : {}}>
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-bold text-[var(--sys-text)] flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-primary">palette</span>
                    {isHeroSection ? 'Hero Image' : `Section Visual`}
                </h4>
                <button onClick={onClose} className="cs-btn-icon">
                    <span className="material-symbols-outlined text-sm">close</span>
                </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex gap-1 mb-6 p-1 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                <button onClick={() => setPickerTab('ai')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${pickerTab === 'ai' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                    <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Generate
                </button>
                <button onClick={() => setPickerTab('brand')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${pickerTab === 'brand' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                    <span className="material-symbols-outlined text-sm">photo_library</span> Brand Assets
                    {brandImages.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">{brandImages.length}</span>}
                </button>
            </div>

            {/* AI Generate Tab */}
            {pickerTab === 'ai' && (
                <>
                    {!isHeroSection && (
                        <div className="mb-6">
                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-3 opacity-60">Aspect Ratio</p>
                            <div className="flex gap-2">
                                {IMAGE_RATIOS.map(r => (
                                    <button key={r.id} onClick={() => setSelectedImageRatio(r.id)}
                                        className={`flex-1 flex flex-col items-center py-3 rounded-xl border transition-all ${selectedImageRatio === r.id ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                        <span className="material-symbols-outlined text-base mb-1">{r.icon}</span>
                                        <span className="text-[10px] font-bold">{r.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="cs-grid-adaptive !grid-cols-4 mb-6">
                        {IMAGE_STYLES.map(style => (
                            <button key={style.id} onClick={() => setSelectedImageStyle(style.id)}
                                className={`p-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 ${selectedImageStyle === style.id ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                <span className="material-symbols-outlined text-xl">{style.icon}</span>
                                <span className="text-[10px] font-bold">{style.label}</span>
                            </button>
                        ))}
                    </div>
                    <button onClick={() => onGenerate(sectionIndex, selectedImageStyle)}
                        disabled={generatingSection !== null}
                        className="cs-btn-primary py-4">
                        <span className={`material-symbols-outlined text-sm ${generatingSection !== null ? 'animate-spin' : ''}`}>
                            {generatingSection !== null ? 'progress_activity' : 'auto_awesome'}
                        </span>
                        {generatingSection !== null ? 'Painting Masterpiece...' : `Generate ${IMAGE_STYLES.find(s => s.id === selectedImageStyle)?.label} Visual`}
                    </button>
                </>
            )}

            {/* Brand Gallery Tab */}
            {pickerTab === 'brand' && (
                <>
                    {brandImages.length > 0 ? (
                        <div className="cs-grid-adaptive !grid-cols-3 mb-4">
                            {brandImages.map((img, idx) => (
                                <div key={idx} className="group/brand rounded-xl overflow-hidden relative border border-[var(--sys-border)] aspect-square bg-black/20">
                                    <img src={img.url} alt={img.label} className="w-full h-full object-cover" loading="lazy" />
                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover/brand:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                                        <button onClick={() => onUseBrandDirect(sectionIndex, img.url)}
                                            disabled={generatingSection !== null}
                                            className="w-full py-1.5 rounded-lg text-[9px] font-black text-white bg-emerald-600/80 backdrop-blur-sm">
                                            USE DIRECT
                                        </button>
                                        <button onClick={() => onUseBrandAI(sectionIndex, img.url, selectedImageStyle)}
                                            disabled={generatingSection !== null}
                                            className="w-full py-1.5 rounded-lg text-[9px] font-black text-white bg-primary/80 backdrop-blur-sm">
                                            AI ENHANCE
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 opacity-40">
                            <span className="material-symbols-outlined text-4xl block mb-2">cloud_off</span>
                            <p className="text-sm font-bold">No Brand Assets Found</p>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function BlogEditorView({ content, activeBrand, onNewContent, onGenerateImage }) {
    const [blogData, setBlogData] = useState(() => ({
        title: content?.title || '',
        subtitle: content?.blogMeta?.subtitle || '',
        slug: content?.blogMeta?.slug || '',
        metaTitle: content?.blogMeta?.metaTitle || '',
        metaDescription: content?.blogMeta?.metaDescription || '',
        keywords: content?.blogMeta?.keywords || [],
        heroImageUrl: content?.blogMeta?.heroImageUrl || '',
        heroImageAlt: content?.blogMeta?.heroImageAlt || '',
        sections: (content?.blogMeta?.sections || []).map(s => ({
            ...s,
            imageAlt: s.imageAlt || '',
        })),
        estimatedReadTime: content?.blogMeta?.estimatedReadTime || '',
    }))
    const [showSeo, setShowSeo] = useState(false)
    const [copied, setCopied] = useState('')
    const [generatingSection, setGeneratingSection] = useState(null)
    const [editingSection, setEditingSection] = useState(null)
    const [linkDialog, setLinkDialog] = useState(null)
    const [linkUrl, setLinkUrl] = useState('')
    const [linkText, setLinkText] = useState('')
    // Image style picker — renders inline per section
    const [imageStylePicker, setImageStylePicker] = useState(null) // sectionIndex or -1 for hero
    const [selectedImageStyle, setSelectedImageStyle] = useState('editorial')
    const [selectedImageRatio, setSelectedImageRatio] = useState('9:16') // default 9:16 for sections; hero uses 16:9

    const IMAGE_RATIOS = [
        { id: '9:16', label: '9:16', desc: 'Portrait', icon: 'crop_portrait' },
        { id: '1:1',  label: '1:1',  desc: 'Square',   icon: 'crop_square' },
        { id: '16:9', label: '16:9', desc: 'Landscape', icon: 'crop_landscape' },
        { id: '4:3',  label: '4:3',  desc: 'Standard', icon: 'crop_54' },
    ]

    const IMAGE_STYLES = [
        { id: 'editorial', label: 'Editorial', icon: 'photo_camera', desc: 'Magazine-style photography' },
        { id: 'infographic', label: 'Infographic', icon: 'bar_chart', desc: 'Charts & data visualization' },
        { id: 'lifestyle', label: 'Lifestyle', icon: 'sunny', desc: 'Candid, warm photography' },
        { id: '3d', label: '3D Render', icon: 'view_in_ar', desc: 'Glossy 3D illustration' },
        { id: 'line_drawing', label: 'Line Art', icon: 'draw', desc: 'Minimalist ink sketches' },
        { id: 'flat_illustration', label: 'Flat Art', icon: 'palette', desc: 'Modern vector illustration' },
        { id: 'photorealistic', label: 'Stock Photo', icon: 'image', desc: 'Ultra-realistic stock photography' },
        { id: 'watercolor', label: 'Watercolor', icon: 'brush', desc: 'Artistic watercolor painting' },
    ]

    const totalWords = blogData.sections.reduce((sum, s) => sum + (s.body || '').split(/\s+/).filter(Boolean).length, 0)
    const readTime = Math.max(1, Math.ceil(totalWords / 200))

    const updateSection = (index, field, value) => {
        setBlogData(prev => {
            const sections = [...prev.sections]
            sections[index] = { ...sections[index], [field]: value }
            return { ...prev, sections, tableOfContents: sections.map(s => s.heading) }
        })
    }

    const addSection = (afterIndex) => {
        setBlogData(prev => {
            const sections = [...prev.sections]
            sections.splice(afterIndex + 1, 0, { heading: 'New Section', body: 'Start writing here...', imageUrl: '', imagePrompt: '', imageAlt: '' })
            return { ...prev, sections }
        })
        setEditingSection(afterIndex + 1)
    }

    const deleteSection = (index) => {
        if (blogData.sections.length <= 1) return
        setBlogData(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== index) }))
    }

    const moveSection = (index, direction) => {
        const newIndex = index + direction
        if (newIndex < 0 || newIndex >= blogData.sections.length) return
        setBlogData(prev => {
            const sections = [...prev.sections]
            const [moved] = sections.splice(index, 1)
            sections.splice(newIndex, 0, moved)
            return { ...prev, sections }
        })
    }

    const handleGenerateImage = async (sectionIndex, style) => {
        setGeneratingSection(sectionIndex)
        setImageStylePicker(null)
        try {
            const isHero = sectionIndex === -1
            const ratio = isHero ? '16:9' : selectedImageRatio
            const result = await onGenerateImage(sectionIndex, style || selectedImageStyle, {}, ratio)
            if (result?.imageUrl) {
                if (isHero) {
                    setBlogData(prev => ({ ...prev, heroImageUrl: result.imageUrl, heroImageAlt: result.altText || '' }))
                } else {
                    setBlogData(prev => {
                        const sections = [...prev.sections]
                        sections[sectionIndex] = { ...sections[sectionIndex], imageUrl: result.imageUrl, imageAlt: result.altText || '', imageRatio: result.aspectRatio || ratio }
                        return { ...prev, sections }
                    })
                }
            }
        } catch (err) { console.error('Image gen error:', err) }
        finally { setGeneratingSection(null) }
    }

    const openImageStylePicker = (sectionIndex) => {
        setImageStylePicker(sectionIndex)
    }

    const insertLink = (sectionIndex) => {
        if (!linkUrl.trim()) return
        const text = linkText.trim() || linkUrl
        const markdown = `[${text}](${linkUrl})`
        const el = document.getElementById(`blog-body-${sectionIndex}`)
        if (el) {
            const start = el.selectionStart || el.value.length
            const before = el.value.substring(0, start)
            const after = el.value.substring(start)
            updateSection(sectionIndex, 'body', before + markdown + after)
        } else {
            const body = blogData.sections[sectionIndex]?.body || ''
            updateSection(sectionIndex, 'body', body + ' ' + markdown)
        }
        setLinkDialog(null); setLinkUrl(''); setLinkText('')
    }

    const applyFormatting = (sectionIndex, format) => {
        if (format === 'link') { setLinkDialog({ sectionIndex, show: true }); return }
        if (format === 'image') { openImageStylePicker(sectionIndex); return }
        const el = document.getElementById(`blog-body-${sectionIndex}`)
        if (!el) return
        const start = el.selectionStart
        const end = el.selectionEnd
        const text = el.value
        const selected = text.substring(start, end)
        let replacement = ''
        if (format === 'bold') replacement = `**${selected || 'bold text'}**`
        else if (format === 'italic') replacement = `*${selected || 'italic text'}*`
        else if (format === 'heading') replacement = `\n### ${selected || 'Subheading'}\n`
        else if (format === 'list') replacement = `\n- ${selected || 'List item'}\n- \n`
        else if (format === 'quote') replacement = `\n> ${selected || 'Quote text'}\n`
        const newText = text.substring(0, start) + replacement + text.substring(end)
        updateSection(sectionIndex, 'body', newText)
        setTimeout(() => { el.focus(); el.setSelectionRange(start + replacement.length, start + replacement.length) }, 50)
    }

    const renderMarkdown = (text) => {
        if (!text) return ''
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-primary underline underline-offset-4 decoration-primary/30">$1</a>')
            .replace(/^- (.+)$/gm, '<li class="ml-6 list-disc mb-1">$1</li>')
            .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-primary/20 pl-4 my-6 text-[var(--sys-text-muted)] italic">$1</blockquote>')
            .replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-[var(--sys-text)] mt-8 mb-2">$1</h3>')
            .replace(/\n\n/g, '</p><p class="mb-4">')
            .replace(/\n/g, '<br />')
            .replace(/^/, '<p class="mb-4">')
            .replace(/$/, '</p>')
    }

    const [pickerTab, setPickerTab] = useState('ai') // 'ai' or 'brand'

    const brandImages = useMemo(() => {
        const imgs = []
        if (activeBrand?.dna?.logo?.url) {
            imgs.push({ url: activeBrand.dna.logo.url, label: 'Brand Logo', source: 'logo' })
        }
        if (activeBrand?.dna?.brandImages?.length) {
            activeBrand.dna.brandImages.forEach((bi, idx) => {
                if (bi.url) imgs.push({ url: bi.url, label: bi.alt || `Brand Image ${idx + 1}`, source: bi.source || 'website' })
            })
        }
        return imgs
    }, [activeBrand])

    const handleUseBrandImageDirect = async (sectionIndex, imgUrl) => {
        setGeneratingSection(sectionIndex)
        setImageStylePicker(null)
        try {
            const isHero = sectionIndex === -1
            const ratio = isHero ? '16:9' : selectedImageRatio
            const result = await onGenerateImage(sectionIndex, 'editorial', { brandImageUrl: imgUrl }, ratio)
            if (result?.imageUrl) {
                if (sectionIndex === -1) {
                    setBlogData(prev => ({ ...prev, heroImageUrl: result.imageUrl, heroImageAlt: result.altText || '' }))
                } else {
                    setBlogData(prev => {
                        const sections = [...prev.sections]
                        sections[sectionIndex] = { ...sections[sectionIndex], imageUrl: result.imageUrl, imageAlt: result.altText || '', imageRatio: result.aspectRatio || ratio }
                        return { ...prev, sections }
                    })
                }
            }
        } catch (err) { console.error('Brand image direct use error:', err) }
        finally { setGeneratingSection(null) }
    }

    const handleUseBrandImageAI = async (sectionIndex, imgUrl, style) => {
        setGeneratingSection(sectionIndex)
        setImageStylePicker(null)
        try {
            const isHero = sectionIndex === -1
            const ratio = isHero ? '16:9' : selectedImageRatio
            const result = await onGenerateImage(sectionIndex, style || selectedImageStyle, { brandImageRef: imgUrl }, ratio)
            if (result?.imageUrl) {
                if (sectionIndex === -1) {
                    setBlogData(prev => ({ ...prev, heroImageUrl: result.imageUrl, heroImageAlt: result.altText || '' }))
                } else {
                    setBlogData(prev => {
                        const sections = [...prev.sections]
                        sections[sectionIndex] = { ...sections[sectionIndex], imageUrl: result.imageUrl, imageAlt: result.altText || '', imageRatio: result.aspectRatio || ratio }
                        return { ...prev, sections }
                    })
                }
            }
        } catch (err) { console.error('Brand image AI enhance error:', err) }
        finally { setGeneratingSection(null) }
    }

    const copyAsHtml = () => {
        let html = `<article style="max-width:720px;margin:0 auto;font-family:Georgia,serif;color:#1a1a1a;line-height:1.8">\n`
        html += `<h1 style="font-size:2.5rem;font-weight:800;margin-bottom:0.5rem">${blogData.title}</h1>\n`
        if (blogData.subtitle) html += `<p style="font-size:1.25rem;color:#666;margin-bottom:2rem">${blogData.subtitle}</p>\n`
        if (blogData.heroImageUrl) html += `<img src="${blogData.heroImageUrl}" alt="${blogData.heroImageAlt || blogData.title}" style="width:100%;border-radius:8px;margin-bottom:2rem" />\n`
        blogData.sections.forEach(s => {
            html += `\n<h2 style="font-size:1.75rem;font-weight:700;margin:2rem 0 1rem">${s.heading}</h2>\n`
            if (s.imageUrl) html += `<figure style="margin:1.5rem 0"><img src="${s.imageUrl}" alt="${s.imageAlt || s.heading}" style="width:100%;border-radius:8px" /><figcaption style="text-align:center;color:#999;font-size:0.85rem;margin-top:0.5rem">${s.heading}</figcaption></figure>\n`
            let body = (s.body || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
                .replace(/^- (.+)$/gm, '<li>$1</li>')
                .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #ddd;padding-left:1rem;color:#666;font-style:italic">$1</blockquote>')
                .replace(/\n\n/g, '</p>\n<p>').replace(/^/, '<p>').replace(/$/, '</p>')
            html += body + '\n'
        })
        html += `</article>`
        navigator.clipboard.writeText(html)
        setCopied('html'); setTimeout(() => setCopied(''), 2000)
    }

    const copyAsMarkdown = () => {
        let md = `# ${blogData.title}\n\n`
        if (blogData.subtitle) md += `*${blogData.subtitle}*\n\n`
        if (blogData.heroImageUrl) md += `![${blogData.heroImageAlt || 'Hero'}](${blogData.heroImageUrl})\n\n`
        blogData.sections.forEach(s => {
            md += `## ${s.heading}\n\n`
            if (s.imageUrl) md += `![${s.imageAlt || s.heading}](${s.imageUrl})\n\n`
            md += `${s.body}\n\n`
        })
        navigator.clipboard.writeText(md)
        setCopied('md'); setTimeout(() => setCopied(''), 2000)
    }

    const preventBlur = (e) => { e.preventDefault() }

    return (
        <div className="cs-blog-canvas">
            {/* Top Action Bar */}
            <header className="flex items-center justify-between mb-12 pb-4 border-b border-[var(--sys-border)]">
                <div className="flex items-center gap-4">
                    <button onClick={onNewContent} className="cs-btn-secondary h-9 px-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-black text-[var(--sys-text-muted)] opacity-50">
                        <span>{totalWords} words</span>
                        <span className="size-1 rounded-full bg-current"></span>
                        <span>{readTime} min read</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowSeo(!showSeo)}
                        className={`cs-btn-secondary h-9 px-3 flex items-center gap-2 ${showSeo ? '!text-primary !border-primary/30 !bg-primary/5' : ''}`}>
                        <span className="material-symbols-outlined text-sm">search</span> SEO
                    </button>
                    <button onClick={copyAsHtml} className="cs-btn-secondary h-9 px-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">{copied === 'html' ? 'check' : 'code'}</span> {copied === 'html' ? 'Copied' : 'HTML'}
                    </button>
                    <button onClick={copyAsMarkdown} className="cs-btn-secondary h-9 px-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">{copied === 'md' ? 'check' : 'description'}</span> {copied === 'md' ? 'Copied' : 'MD'}
                    </button>
                    <button onClick={async () => {
                        try {
                            const res = await contentAPI.blogPublishWebsite(content._id)
                            if (res.success) { navigator.clipboard.writeText(res.html); setCopied('publish'); setTimeout(() => setCopied(''), 3000) }
                        } catch (e) { console.error(e) }
                    }} className="cs-btn-primary h-9 px-4 !w-auto text-xs font-black">
                        <span className="material-symbols-outlined text-sm">{copied === 'publish' ? 'check_circle' : 'rocket_launch'}</span>
                        {copied === 'publish' ? 'PUBLISHED' : 'PUBLISH'}
                    </button>
                </div>
            </header>

            {/* SEO Panel */}
            {showSeo && (
                <div className="cs-blog-seo-panel animate-fade-in mb-10">
                    <h4 className="text-xs font-black text-emerald-400 mb-6 flex items-center gap-2 uppercase tracking-widest">
                        <span className="material-symbols-outlined text-base">analytics</span> Search Optimization
                    </h4>
                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="text-[10px] font-black text-[var(--sys-text-muted)] mb-2 block uppercase tracking-widest opacity-60">URL Slug</label>
                            <input value={blogData.slug} onChange={(e) => setBlogData(p => ({ ...p, slug: e.target.value }))} className="cs-input-field" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-[var(--sys-text-muted)] mb-2 block uppercase tracking-widest opacity-60">Meta Title <span className="float-right text-emerald-400">{(blogData.metaTitle || '').length}/60</span></label>
                            <input value={blogData.metaTitle} onChange={(e) => setBlogData(p => ({ ...p, metaTitle: e.target.value }))} className="cs-input-field" />
                        </div>
                    </div>
                    <div className="mb-6">
                        <label className="text-[10px] font-black text-[var(--sys-text-muted)] mb-2 block uppercase tracking-widest opacity-60">Meta Description <span className="float-right text-emerald-400">{(blogData.metaDescription || '').length}/160</span></label>
                        <textarea value={blogData.metaDescription} onChange={(e) => setBlogData(p => ({ ...p, metaDescription: e.target.value }))} rows={2} className="cs-input-field resize-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-[var(--sys-text-muted)] mb-3 block uppercase tracking-widest opacity-60">Focus Keywords</label>
                        <div className="flex flex-wrap gap-2">
                            {blogData.keywords.map((kw, i) => (
                                <span key={i} className="text-[10px] px-3 py-1.5 rounded-full font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{kw}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Hero Image */}
            <div className="mb-12">
                {blogData.heroImageUrl ? (
                    <div className="cs-blog-image-wrapper !ml-0 group border border-[var(--sys-border)]">
                        <img src={blogData.heroImageUrl} alt={blogData.heroImageAlt || blogData.title} />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                            <button onClick={() => openImageStylePicker(-1)} disabled={generatingSection === -1}
                                className="cs-btn-secondary h-10 px-4 !bg-white/10 !border-white/20 !text-white backdrop-blur-md">
                                <span className={`material-symbols-outlined text-sm ${generatingSection === -1 ? 'animate-spin' : ''}`}>{generatingSection === -1 ? 'progress_activity' : 'refresh'}</span>
                                REGENERATE
                            </button>
                            <button onClick={() => setBlogData(p => ({ ...p, heroImageUrl: '', heroImageAlt: '' }))}
                                className="cs-btn-secondary h-10 px-4 !bg-red-500/10 !border-red-500/20 !text-red-400 backdrop-blur-md">
                                <span className="material-symbols-outlined text-sm">delete</span>
                                REMOVE
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => openImageStylePicker(-1)} disabled={generatingSection === -1}
                        className="w-full flex flex-col items-center justify-center gap-4 p-16 rounded-2xl border-2 border-dashed border-[var(--sys-border)] bg-[var(--sys-surface)]/30 hover:bg-[var(--sys-surface)] hover:border-primary/50 transition-all group">
                        <span className={`material-symbols-outlined text-5xl text-[var(--sys-text-muted)] group-hover:text-primary transition-all ${generatingSection === -1 ? 'animate-spin' : ''}`}>
                            {generatingSection === -1 ? 'progress_activity' : 'add_photo_alternate'}
                        </span>
                        <div className="text-center">
                            <p className="text-sm font-bold text-[var(--sys-text)]">Generate AI Hero Header</p>
                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">Stunning 16:9 contextual visual for your article</p>
                        </div>
                    </button>
                )}
                {imageStylePicker === -1 && <BlogImageStylePicker sectionIndex={-1} 
                    onClose={() => setImageStylePicker(null)} pickerTab={pickerTab} setPickerTab={setPickerTab} 
                    IMAGE_RATIOS={IMAGE_RATIOS} selectedImageRatio={selectedImageRatio} setSelectedImageRatio={setSelectedImageRatio} 
                    IMAGE_STYLES={IMAGE_STYLES} selectedImageStyle={selectedImageStyle} setSelectedImageStyle={setSelectedImageStyle} 
                    onGenerate={handleGenerateImage} generatingSection={generatingSection} brandImages={brandImages} 
                    onUseBrandDirect={handleUseBrandImageDirect} onUseBrandAI={handleUseBrandImageAI} />}
            </div>

            {/* Title & Subtitle */}
            <div className="mb-12">
                <input value={blogData.title} onChange={(e) => setBlogData(p => ({ ...p, title: e.target.value }))}
                    className="cs-blog-title-input" placeholder="Untitled Article" />
                <input value={blogData.subtitle} onChange={(e) => setBlogData(p => ({ ...p, subtitle: e.target.value }))}
                    className="cs-blog-subtitle-input" placeholder="Add a compelling subtitle..." />
            </div>

            {/* Table of Contents */}
            {blogData.sections.length > 2 && (
                <div className="cs-blog-toc mb-12">
                    <p className="text-[10px] font-black text-[var(--sys-text-muted)] uppercase tracking-[0.2em] mb-4 opacity-50 text-center">Outline</p>
                    <div className="space-y-2">
                        {blogData.sections.map((s, i) => (
                            <a key={i} href={`#blog-section-${i}`} className="cs-blog-toc-link">
                                <span className="text-[10px] font-mono opacity-50 w-6">{(i + 1).toString().padStart(2, '0')}</span>
                                <span className="font-bold">{s.heading}</span>
                            </a>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Flow */}
            <div className="space-y-16">
                {blogData.sections.map((section, i) => (
                    <div key={i} id={`blog-section-${i}`} className="cs-blog-section group/section">
                        {/* Toolbar */}
                        {editingSection === i && (
                            <div className="cs-blog-toolbar absolute left-10 -top-10">
                                <button onMouseDown={preventBlur} onClick={() => applyFormatting(i, 'bold')} className="cs-blog-toolbar-btn" title="Bold"><span className="material-symbols-outlined text-sm">format_bold</span></button>
                                <button onMouseDown={preventBlur} onClick={() => applyFormatting(i, 'italic')} className="cs-blog-toolbar-btn" title="Italic"><span className="material-symbols-outlined text-sm">format_italic</span></button>
                                <div className="w-px h-4 bg-[var(--sys-border)] mx-1"></div>
                                <button onMouseDown={preventBlur} onClick={() => applyFormatting(i, 'heading')} className="cs-blog-toolbar-btn" title="Heading"><span className="material-symbols-outlined text-sm">title</span></button>
                                <button onMouseDown={preventBlur} onClick={() => applyFormatting(i, 'list')} className="cs-blog-toolbar-btn" title="List"><span className="material-symbols-outlined text-sm">format_list_bulleted</span></button>
                                <button onMouseDown={preventBlur} onClick={() => applyFormatting(i, 'quote')} className="cs-blog-toolbar-btn" title="Quote"><span className="material-symbols-outlined text-sm">format_quote</span></button>
                                <div className="w-px h-4 bg-[var(--sys-border)] mx-1"></div>
                                <button onMouseDown={preventBlur} onClick={() => applyFormatting(i, 'link')} className="cs-blog-toolbar-btn" title="Link"><span className="material-symbols-outlined text-sm">link</span></button>
                                <button onMouseDown={preventBlur} onClick={() => openImageStylePicker(i)} className="cs-blog-toolbar-btn" title="Image"><span className="material-symbols-outlined text-sm">add_photo_alternate</span></button>
                            </div>
                        )}

                        <input value={section.heading} onChange={(e) => updateSection(i, 'heading', e.target.value)}
                            onClick={() => setEditingSection(i)} className="cs-blog-section-heading" placeholder="Section Subheading..." />

                        {/* Relative Editor Wrapper */}
                        <div className="relative">
                            {editingSection === i ? (
                                <textarea
                                    id={`blog-body-${i}`}
                                    value={section.body}
                                    onChange={(e) => updateSection(i, 'body', e.target.value)}
                                    onBlur={(e) => {
                                        const related = e.relatedTarget
                                        if (related && related.closest(`#blog-section-${i}`)) return
                                        setTimeout(() => setEditingSection(null), 300)
                                    }}
                                    autoFocus
                                    className="cs-blog-body-text h-[200px]"
                                    rows={8}
                                />
                            ) : (
                                <div onClick={() => setEditingSection(i)}
                                    className="cs-blog-body-text cursor-text min-h-[60px]"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) || '<span class="opacity-30 italic font-mono text-sm">Click to begin drafting...</span>' }} />
                            )}
                        </div>

                        {/* Section Media */}
                        {section.imageUrl && (
                            <div className="cs-blog-image-wrapper group border border-[var(--sys-border)]">
                                <img src={section.imageUrl} alt={section.imageAlt || section.heading} />
                                {section.imageRatio && <span className="absolute top-4 left-4 text-[9px] font-black p-1.5 rounded bg-black/60 backdrop-blur-md text-primary">{section.imageRatio}</span>}
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openImageStylePicker(i)} className="cs-btn-secondary !h-8 !px-2 !bg-black/40 !backdrop-blur-md"><span className="material-symbols-outlined text-sm">refresh</span></button>
                                </div>
                                <p className="cs-blog-caption">{section.imageAlt || section.heading}</p>
                            </div>
                        )}

                        {imageStylePicker === i && <BlogImageStylePicker sectionIndex={i} 
                            onClose={() => setImageStylePicker(null)} pickerTab={pickerTab} setPickerTab={setPickerTab} 
                            IMAGE_RATIOS={IMAGE_RATIOS} selectedImageRatio={selectedImageRatio} setSelectedImageRatio={setSelectedImageRatio} 
                            IMAGE_STYLES={IMAGE_STYLES} selectedImageStyle={selectedImageStyle} setSelectedImageStyle={setSelectedImageStyle} 
                            onGenerate={handleGenerateImage} generatingSection={generatingSection} brandImages={brandImages} 
                            onUseBrandDirect={handleUseBrandImageDirect} onUseBrandAI={handleUseBrandImageAI} />}

                        {/* Divider & Add Controls */}
                        <div className="absolute left-0 top-0 flex flex-col gap-2 opacity-0 group-hover/section:opacity-100 transition-all ml-[-2.5rem]">
                            <button onClick={() => moveSection(i, -1)} className="cs-btn-icon !size-8" title="Move Top"><span className="material-symbols-outlined !text-sm">arrow_upward</span></button>
                            <button onClick={() => moveSection(i, 1)} className="cs-btn-icon !size-8" title="Move Down"><span className="material-symbols-outlined !text-sm">arrow_downward</span></button>
                            <button onClick={() => deleteSection(i)} className="cs-btn-icon !size-8 !text-red-400" title="Delete"><span className="material-symbols-outlined !text-sm">delete</span></button>
                        </div>

                        <div className="relative h-px bg-[var(--sys-border)] my-12 group/divider ml-[-2.5rem]">
                            <button onClick={() => addSection(i)}
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--sys-bg)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-[10px] font-black opacity-0 group-hover/divider:opacity-100 transition-all hover:border-primary hover:text-primary">
                                <span className="material-symbols-outlined text-xs">add</span> INSERT SECTION
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer Sign-off */}
            <footer className="mt-20 py-12 text-center border-t border-[var(--sys-border)] opacity-40">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                    <span className="text-xs font-black uppercase tracking-[0.3em]">Neural Publication</span>
                </div>
                <p className="text-[10px] font-bold">Drafted with Mantram Content Intelligence · Visuals by NanoBanana 2</p>
            </footer>
        </div>
    )
}


// ============================================================================
// RESULT VIEW (with Edit & AI Refine)
// ============================================================================


function ResultView({ result, onRegenerate, onFeedback, onNewContent, generating, activeBrand, onCreateVisual, accepted, onRefine, contentFeedback, imageUrl, onABTest, abTestData, abTestLoading, generatingVisualPrompt, onGenerateVisual, inlineVisualUrl, inlineVisualActive, inlineVisualProgress, brandId }) {
    const [copied, setCopied] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editContent, setEditContent] = useState(result?.content || '')
    const [refineInput, setRefineInput] = useState('')
    const [refining, setRefining] = useState(false)
    const [showPublish, setShowPublish] = useState(false)
    const [visualElapsed, setVisualElapsed] = useState(0)
    const refineRef = useRef(null)

    useEffect(() => {
        let interval;
        if (generatingVisualPrompt) {
            setVisualElapsed(0);
            interval = setInterval(() => {
                setVisualElapsed(prev => prev + 1);
            }, 1000);
        } else {
            setVisualElapsed(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        }
    }, [generatingVisualPrompt])

    // Keep editContent in sync when result changes
    useEffect(() => { setEditContent(result?.content || '') }, [result?.content])

    const handleCopy = () => {
        navigator.clipboard.writeText(stripMarkdown(editing ? editContent : result.content))
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleSaveEdit = async () => {
        if (editContent !== result.content) {
            // Use agentic edit endpoint for re-critique
            if (result._id) {
                try {
                    const data = await contentAPI.agenticEdit(result._id, { editedContent: editContent, editedTitle: result.title })
                    if (data.success) {
                        onRefine && onRefine({ manualEdit: editContent, aiMeta: data.content?.aiMeta })
                    }
                } catch {
                    // Fallback to generic save
                    onRefine && onRefine({ manualEdit: editContent })
                }
            } else {
                onRefine && onRefine({ manualEdit: editContent })
            }
        }
        setEditing(false)
    }

    const handleAIRefine = async () => {
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
                    <div className="size-16 rounded-full bg-[var(--sys-primary-dim)] flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-3xl text-primary">check_circle</span>
                    </div>
                    <h3 className="text-2xl font-extrabold text-[var(--sys-text)]">Content <span className="text-primary">Saved!</span></h3>
                    <p className="text-sm text-[var(--sys-text-muted)] mt-2">Your content has been saved to history. What would you like to do next?</p>
                </div>

                {/* Generated Visual Result / Progress */}
                {(inlineVisualActive || inlineVisualUrl) && (
                    <div className="mb-6 rounded-2xl overflow-hidden glass-panel border border-[var(--sys-border)] relative w-full flex items-center justify-center bg-[var(--sys-surface)] min-h-[300px]">
                        {inlineVisualUrl ? (
                            <>
                                <img src={inlineVisualUrl} alt="Generated visual preview" className="w-full h-auto object-cover max-h-[500px]" />
                                <button onClick={onGenerateVisual} disabled={generatingVisualPrompt}
                                        className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 backdrop-blur-md transition-all cursor-pointer shadow-lg disabled:opacity-50">
                                    <span className={`material-symbols-outlined text-sm block ${generatingVisualPrompt ? 'animate-spin' : ''}`}>{generatingVisualPrompt ? 'progress_activity' : 'refresh'}</span>
                                </button>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-primary">
                                <span className="material-symbols-outlined text-4xl animate-spin mb-4">progress_activity</span>
                                <div className="w-48 h-1.5 bg-primary/20 rounded-full overflow-hidden mt-2">
                                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${inlineVisualProgress}%` }}></div>
                                </div>
                                <h4 className="text-sm font-bold mt-4">Generating Visual...</h4>
                                <p className="text-[10px] opacity-70 mt-1">Elapsed time: {visualElapsed}s</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm text-primary font-bold bg-[var(--sys-primary-dim)] px-2.5 py-1 rounded-lg">✓ Approved</span>
                        <span className="text-sm text-primary font-bold bg-primary/10 px-2.5 py-1 rounded-lg">{result.type}</span>
                        <span className="text-sm text-[var(--sys-text-muted)]">{result.content?.split(/\s+/).length} words</span>
                    </div>
                    <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed line-clamp-3">{result.content}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    {!(inlineVisualActive || inlineVisualUrl) && (
                        <button onClick={onGenerateVisual} disabled={generatingVisualPrompt}
                            className="glass-panel rounded-2xl p-5 hover:bg-[var(--sys-surface)] hover:border-primary/30 transition-all cursor-pointer text-left group border border-[var(--sys-border)]">
                            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-110 transition-transform">
                                <span className={`material-symbols-outlined text-2xl ${generatingVisualPrompt ? 'animate-spin' : ''}`}>{generatingVisualPrompt ? 'progress_activity' : 'image'}</span>
                            </div>
                            <h4 className="text-base font-bold text-[var(--sys-text)] mb-1">Create Matching Visual</h4>
                            <p className="text-[11px] text-[var(--sys-text-muted)]">Generate an image that matches this content</p>
                        </button>
                    )}
                    <button onClick={() => { navigator.clipboard.writeText(stripMarkdown(result.content)); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                        className="glass-panel rounded-2xl p-5 hover:bg-[var(--sys-surface)] hover:border-[var(--sys-border)] transition-all cursor-pointer text-left group border border-[var(--sys-border)]">
                        <div className="size-12 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center text-primary mb-3 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-2xl">{copied ? 'check' : 'content_copy'}</span>
                        </div>
                        <h4 className="text-base font-bold text-[var(--sys-text)] mb-1">{copied ? 'Copied!' : 'Copy to Clipboard'}</h4>
                        <p className="text-[11px] text-[var(--sys-text-muted)]">Copy the content to paste on your platform</p>
                    </button>
                    <button onClick={onNewContent}
                        className="glass-panel rounded-2xl p-5 hover:bg-[var(--sys-surface)] hover:border-[#FF4D00]/30 transition-all cursor-pointer text-left group border border-[var(--sys-border)]">
                        <div className="size-12 rounded-xl bg-[#FF4D00]/10 flex items-center justify-center text-[#FF4D00] mb-3 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-2xl">add_circle</span>
                        </div>
                        <h4 className="text-base font-bold text-[var(--sys-text)] mb-1">Create New Content</h4>
                        <p className="text-[11px] text-[var(--sys-text-muted)]">Start a new content generation from scratch</p>
                    </button>
                    {result?._id && (
                        <button onClick={onABTest} disabled={abTestLoading}
                            className="glass-panel rounded-2xl p-5 hover:bg-[var(--sys-surface)] hover:border-[#FF4D00]/30 transition-all cursor-pointer text-left group border border-[var(--sys-border)] disabled:opacity-40">
                            <div className="size-12 rounded-xl bg-[#FF4D00]/10 flex items-center justify-center text-[#FF4D00] mb-3 group-hover:scale-110 transition-transform">
                                <span className={`material-symbols-outlined text-2xl ${abTestLoading ? 'animate-spin' : ''}`}>{abTestLoading ? 'progress_activity' : 'science'}</span>
                            </div>
                            <h4 className="text-base font-bold text-[var(--sys-text)] mb-1 flex items-center gap-1">{abTestLoading ? 'Creating...' : <><span className="material-symbols-outlined text-sm">science</span> A/B Test</>}</h4>
                            <p className="text-[11px] text-[var(--sys-text-muted)]">Generate 2-3 variants to test what performs best</p>
                        </button>
                    )}
                    <button onClick={() => setShowPublish(true)}
                        className="glass-panel rounded-2xl p-5 hover:bg-[var(--sys-surface)] hover:border-[#FF4D00]/30 transition-all cursor-pointer text-left group border border-[var(--sys-border)]">
                        <div className="size-12 rounded-xl bg-[#FF4D00]/10 flex items-center justify-center text-[#FF4D00] mb-3 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-2xl">share</span>
                        </div>
                        <h4 className="text-base font-bold text-[var(--sys-text)] mb-1">Publish Now</h4>
                        <p className="text-[11px] text-[var(--sys-text-muted)]">Post directly to your social media accounts</p>
                    </button>
                </div>



                <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                    <p className="text-sm text-primary font-bold flex items-center gap-1"><span className="material-symbols-outlined text-sm">psychology</span> AI is learning from your acceptance</p>
                    <p className="text-sm text-[var(--sys-text-muted)]">Future content will align closer to this style and tone</p>
                </div>

                {/* A/B Test Variants in accepted view */}
                {abTestData && abTestData.variants && abTestData.variants.length > 0 && (
                    <div className="mt-6 glass-panel rounded-2xl p-5 border border-[#FF4D00]/20">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-[#FF4D00]">science</span>
                            <h4 className="text-sm font-bold text-[var(--sys-text)]">A/B Test Variants</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20">
                                {abTestData.variants.length} variants generated
                            </span>
                        </div>
                        <div className="space-y-3">
                            {abTestData.variants.map((v, i) => (
                                <div key={i} className={`rounded-xl p-4 border transition-all ${v.isControl ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] border-[var(--sys-border)]'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.isControl ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[#FF4D00]/10 text-[#FF4D00]'}`}>
                                            {v.variantLabel || `Variant ${String.fromCharCode(65 + i)}`}
                                        </span>
                                        {v.abTestChangeType && v.abTestChangeType !== 'control' && (
                                            <span className="text-[10px] text-[var(--sys-text-muted)]">{v.abTestChangeType} change</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[var(--sys-text-muted)] whitespace-pre-line line-clamp-4">{v.content}</p>
                                    {v.abTestHypothesis && (
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-2 italic flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">lightbulb</span> {v.abTestHypothesis}</p>
                                    )}
                                    <button onClick={() => { navigator.clipboard.writeText(v.content); }}
                                        className="mt-2 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] flex items-center gap-1 transition-colors cursor-pointer">
                                        <span className="material-symbols-outlined text-xs">content_copy</span> Copy variant
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <PublishModal
                    isOpen={showPublish}
                    onClose={() => setShowPublish(false)}
                    defaultText={result?.content || ''}
                    defaultImage={inlineVisualUrl || null}
                    brandId={activeBrand?._id}
                />
            </div>
        )
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-xl font-extrabold text-[var(--sys-text)]">Your Content is <span className="text-primary">Ready</span></h3>
                    <p className="text-sm text-[var(--sys-text-muted)] mt-1">
                        Generated for {activeBrand?.name} • Brand voice: {activeBrand?.dna?.voice?.personality || 'Active'}
                    </p>
                    {/* Intelligence Sources */}
                    {result?.agenticData?.research?.sources && result.agenticData.research.sources.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-[10px] text-[var(--sys-text-muted)]">Powered by:</span>
                            {result.agenticData.research.sources.map(s => (
                                <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
                                    s === 'Playbook' ? 'bg-[#FF4D00]/10 text-[#FF4D00] border-[#FF4D00]/20' :
                                    s === 'GA4' ? 'bg-[#FF4D00]/10 text-[#FF4D00] border-[#FF4D00]/20' :
                                    s === 'Competitors' ? 'bg-[var(--sys-surface)] text-[var(--sys-primary)] border-[var(--sys-border)]' :
                                    'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border-[var(--sys-border)]'
                                }`}>
                                    {s === 'Playbook' ? '' : s === 'GA4' ? '' : s === 'Competitors' ? '' : s === 'Trending' ? '' : s === 'SEO Audit' ? '' : s === 'Web' ? '' : ''} {s}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setEditing(!editing); if (!editing) setTimeout(() => refineRef.current?.focus(), 100) }}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${editing ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'glass-panel text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border border-[var(--sys-border)]'} `}>
                        <span className="material-symbols-outlined text-sm">{editing ? 'edit_off' : 'edit'}</span>
                        {editing ? 'Done Editing' : 'Edit & Refine'}
                    </button>
                    <button onClick={onNewContent} className="btn-glass px-4 py-2 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border border-[var(--sys-border)] cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span> New
                    </button>
                </div>
            </div>

            {/* Content Card */}
            <div className="glass-panel rounded-2xl p-8 mb-4">
                {/* Meta */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--sys-border)]">
                    <span className="text-sm text-primary font-bold bg-primary/10 px-2.5 py-1 rounded-lg">{result.type}</span>
                    <span className="text-sm text-[var(--sys-text-muted)]">{(editing ? editContent : result.content)?.split(/\s+/).length} words</span>
                    {result.aiMeta?.provider && (
                        <span className="text-sm text-[var(--sys-text-muted)] bg-[var(--sys-surface)] px-2 py-0.5 rounded-full flex items-center gap-1">
                            {result.aiMeta.routingIcon || ''} {result.aiMeta.provider}
                            {result.aiMeta.routingReason && <span className="text-[var(--sys-text-muted)]">— {result.aiMeta.routingReason}</span>}
                        </span>
                    )}
                    {result.aiMeta?.brandAlignmentScore && (
                        <span className="ml-auto text-xs font-bold text-primary bg-[var(--sys-primary-dim)] px-2.5 py-1 rounded-lg">
                            {result.aiMeta.brandAlignmentScore}% Brand Match
                        </span>
                    )}
                </div>

                {/* Content — editable or read-only */}
                {editing ? (
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                        className="w-full bg-transparent text-[var(--sys-text)] text-base leading-relaxed border border-[var(--sys-border)] rounded-xl p-4 resize-none focus:border-primary/40 focus:outline-none transition-colors"
                        rows={Math.max(6, editContent.split('\n').length + 2)} />
                ) : (
                    <div className="text-[var(--sys-text)] text-base leading-relaxed whitespace-pre-wrap">
                        {stripMarkdown(result.content)}
                    </div>
                )}
            </div>

            {/* AI Refine Bar — always visible when editing */}
            {editing && (
                <div className="glass-panel rounded-2xl p-4 mb-4 animate-fade-in">
                    <p className="text-sm text-primary font-bold mb-3 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">auto_fix_high</span> AI Refine
                    </p>
                    {/* Quick suggestions */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {REFINE_SUGGESTIONS.map(s => (
                            <button key={s} onClick={() => { setRefineInput(s); }}
                                className="text-xs px-2.5 py-1 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-primary-dim)] hover:text-primary transition-all cursor-pointer border border-[var(--sys-border)] font-medium">
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

            {/* Generated Visual Result / Progress (Unaccepted View) */}
            {(inlineVisualActive || inlineVisualUrl) && (
                <div className="mb-6 mt-4 rounded-2xl overflow-hidden glass-panel border border-[var(--sys-border)] relative w-full flex items-center justify-center bg-[var(--sys-surface)] min-h-[300px]">
                    {inlineVisualUrl ? (
                        <>
                            <img src={inlineVisualUrl} alt="Generated visual preview" className="w-full h-auto object-cover max-h-[500px]" />
                            <button onClick={onGenerateVisual} disabled={generatingVisualPrompt}
                                    className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 backdrop-blur-md transition-all cursor-pointer shadow-lg disabled:opacity-50">
                                <span className={`material-symbols-outlined text-sm block ${generatingVisualPrompt ? 'animate-spin' : ''}`}>{generatingVisualPrompt ? 'progress_activity' : 'refresh'}</span>
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-primary">
                            <span className="material-symbols-outlined text-4xl animate-spin mb-4">progress_activity</span>
                            <div className="w-48 h-1.5 bg-primary/20 rounded-full overflow-hidden mt-2">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${inlineVisualProgress}%` }}></div>
                            </div>
                            <h4 className="text-sm font-bold mt-4">Generating Visual...</h4>
                            <p className="text-[10px] opacity-70 mt-1">This usually takes 15-30s</p>
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mb-4">
                <button onClick={handleCopy}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${copied ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'glass-panel text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'} `}>
                    <span className="material-symbols-outlined text-lg">{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'Copied!' : 'Copy'}
                </button>
                {editing ? (
                    <button onClick={handleSaveEdit}
                        className="flex-1 btn-primary py-3 rounded-xl text-sm font-bold bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)]">
                        <span className="material-symbols-outlined text-lg">save</span> Save Edits
                    </button>
                ) : (
                    <button onClick={() => onFeedback('accept')}
                        className="flex-1 btn-primary py-3 rounded-xl text-sm font-bold">
                        <span className="material-symbols-outlined text-lg">check</span> Accept & Save
                    </button>
                )}
                {!(inlineVisualActive || inlineVisualUrl) && (
                    <button onClick={onGenerateVisual} disabled={generatingVisualPrompt}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold glass-panel text-primary hover:bg-primary/10 transition-all cursor-pointer border border-primary/20">
                        <span className={`material-symbols-outlined text-lg ${generatingVisualPrompt ? 'animate-spin' : ''}`}>{generatingVisualPrompt ? 'progress_activity' : 'image'}</span>
                        {generatingVisualPrompt ? 'Generating...' : 'Create Visual'}
                    </button>
                )}
                <button onClick={() => setShowPublish(true)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-[#1877F2]/10 text-[#1877F2] hover:bg-[#1877F2]/20 transition-all cursor-pointer border border-[#1877F2]/30">
                    <span className="material-symbols-outlined text-lg">share</span> Publish
                </button>
                {result?._id && (
                    <button onClick={onABTest} disabled={abTestLoading}
                        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-[#FF4D00]/10 text-[#FF4D00] hover:bg-[#FF4D00]/20 transition-all cursor-pointer border border-[#FF4D00]/30 disabled:opacity-30">
                        <span className={`material-symbols-outlined text-lg ${abTestLoading ? 'animate-spin' : ''}`}>{abTestLoading ? 'progress_activity' : 'science'}</span>
                        {abTestLoading ? 'Creating...' : 'A/B Test'}
                    </button>
                )}
            </div>

            <PublishModal
                isOpen={showPublish}
                onClose={() => setShowPublish(false)}
                defaultText={result?.content || ''}
                defaultImage={inlineVisualUrl || imageUrl}
                brandId={activeBrand?._id}
            />

            <div className="flex gap-2">
                <button onClick={() => onFeedback('thumbs', { thumbs: 'up' })}
                    className={`flex-1 glass-panel py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${contentFeedback === 'liked'
                        ? 'text-primary bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]'
                        : 'text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)]'
                        } `}>
                    <span className="material-symbols-outlined text-sm">thumb_up</span> {contentFeedback === 'liked' ? 'Liked ✓' : 'Good'}
                </button>
                <button onClick={() => onFeedback('thumbs', { thumbs: 'down' })}
                    className={`flex-1 glass-panel py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${contentFeedback === 'disliked'
                        ? 'text-primary bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]'
                        : 'text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)]'
                        } `}>
                    <span className="material-symbols-outlined text-sm">thumb_down</span> {contentFeedback === 'disliked' ? 'Noted ✓' : 'Not Right'}
                </button>
                <CreditTooltipWrapper action="contentRefine">
                    <button onClick={onRegenerate} disabled={generating}
                        className="flex-1 glass-panel py-2.5 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer font-bold disabled:opacity-30">
                        <span className={`material-symbols-outlined text-sm ${generating ? 'animate-spin' : ''}`}>{generating ? 'progress_activity' : 'refresh'}</span>
                        {generating ? 'Regenerating...' : 'Regenerate'} {!generating && <CreditBadge action="contentRefine" />}
                    </button>
                </CreditTooltipWrapper>
            </div>

            {/* A/B Test Variants */}
            {abTestData && abTestData.variants && abTestData.variants.length > 0 && (
                <div className="mt-6 glass-panel rounded-2xl p-5 border border-[#FF4D00]/20">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-[#FF4D00]">science</span>
                        <h4 className="text-sm font-bold text-[var(--sys-text)]">A/B Test Variants</h4>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20">
                            {abTestData.testPlan?.primaryMetric?.replace('_', ' ')} • {abTestData.testPlan?.testDuration}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {abTestData.variants.map((v, i) => (
                            <div key={i} className={`rounded-xl p-4 border transition-all ${
                                v.isControl ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] border-[var(--sys-border)] hover:border-[#FF4D00]/30'
                            }`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${v.isControl ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[#FF4D00]/10 text-[#FF4D00]'}`}>
                                        {v.variantLabel || `Variant ${String.fromCharCode(65 + i)}`}
                                    </span>
                                    {v.abTestChangeType && v.abTestChangeType !== 'control' && (
                                        <span className="text-[10px] text-[var(--sys-text-muted)]">{v.abTestChangeType} change</span>
                                    )}
                                </div>
                                <p className="text-sm text-[var(--sys-text-muted)] whitespace-pre-line line-clamp-4">{v.content}</p>
                                {v.abTestHypothesis && (
                                    <p className="text-xs text-[var(--sys-text-muted)] mt-2 italic">💡 {v.abTestHypothesis}</p>
                                )}
                                <button onClick={() => { navigator.clipboard.writeText(v.content); }}
                                    className="mt-2 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] flex items-center gap-1 transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-xs">content_copy</span> Copy variant
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Intelligence Sources */}
            {result?.agenticData?.research?.sources && result.agenticData.research.sources.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[var(--sys-text-muted)] font-medium">Data sources:</span>
                    {result.agenticData.research.sources.map(s => (
                        <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] font-medium">
                            {s === 'Playbook' ? '📊 ' : s === 'GA4' ? '📈 ' : s === 'Competitors' ? '🔍 ' : s === 'Trending' ? '📰 ' : s === 'SEO Audit' ? '🔧 ' : ''}{s}
                        </span>
                    ))}
                </div>
            )}

            {/* Learning note */}
            <div className="mt-6 p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                <p className="text-sm text-primary font-bold"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">psychology</span> Every action teaches the AI your preferences</p>
                <p className="text-sm text-[var(--sys-text-muted)]">Accept → AI replicates style • Edit → AI learns your preferences • Refine → AI adapts to your feedback</p>
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
        if (!visible) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true)
        // Load all content for the active brand, or all user content as fallback
        const params = { limit: 30 }
        if (brandId) params.brandId = brandId
        contentAPI.list(params)
            .then(data => setItems(data.content || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false))
    }, [visible, brandId])

    if (!visible) return null

    return (
        <>
            {/* Backdrop overlay */}
            <div className="fixed inset-0 bg-[var(--sys-surface)] z-40 animate-fade-in" onClick={onToggle} />
            <div className="fixed right-0 top-0 h-screen w-80 bg-[#0c0f1a]/95 border-l border-[var(--sys-border)] z-50 flex flex-col animate-fade-in shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--sys-border)]">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">history</span>
                        <h3 className="text-base font-bold text-[var(--sys-text)]">Content History</h3>
                    </div>
                    <button onClick={onToggle} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {loading ? (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                            <p className="text-sm text-[var(--sys-text-muted)] mt-2">Loading history...</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-4xl text-slate-700 block mb-2">inbox</span>
                            <p className="text-sm text-[var(--sys-text-muted)]">No content generated yet</p>
                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">Generated content will appear here</p>
                        </div>
                    ) : items.map(item => {
                        const typeLabels = { blog: '📝 Blog', social: '💬 Social', youtube: '▶️ YouTube', press_release: '📰 Press Release', product: '🛍️ Product', youtube_seo: '▶️ YT SEO' }
                        const typeLabel = typeLabels[item.type] || item.type || 'Content'
                        const preview = item.title || item.content || item.prompt || '(no preview)'
                        return (
                        <button key={item._id} onClick={() => onSelect(item)}
                            className="w-full text-left glass-panel rounded-xl p-3 hover:bg-[var(--sys-surface)] transition-all cursor-pointer border border-[var(--sys-border)] group">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status === 'approved' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-primary/10 text-primary'}`}>
                                    {item.status === 'approved' ? '✓ Approved' : typeLabel}
                                </span>
                                {item.platform && <span className="text-[10px] text-[var(--sys-text-muted)] capitalize">{item.platform}</span>}
                                {item.brand?.name && <span className="text-[10px] text-[var(--sys-text-muted)] ml-auto truncate max-w-[80px]">{item.brand.name}</span>}
                            </div>
                            <p className="text-sm text-[var(--sys-text)] line-clamp-2 mb-1 leading-snug">{preview}</p>
                            <p className="text-xs text-[var(--sys-text-muted)]">
                                {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </button>
                        )
                    })}
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
                <h3 className="text-xl font-extrabold text-[var(--sys-text)] mb-1">
                    <span className="material-symbols-outlined text-primary align-middle mr-2">inventory_2</span>
                    Select a Product
                </h3>
                <p className="text-sm text-[var(--sys-text-muted)]">Choose a product from your catalog to generate platform-specific content</p>
            </div>

            <div className="flex items-center gap-3 mb-5">
                <div className="relative flex-1">
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search products..."
                        className="input-glass w-full py-2.5 pl-9 pr-3 rounded-xl text-sm bg-[var(--sys-surface)]" />
                    <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] absolute left-3 top-1/2 -translate-y-1/2">search</span>
                </div>
                <button onClick={onBack} className="glass-panel py-2.5 px-4 rounded-xl text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm mr-1 align-middle">arrow_back</span> Back
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                    <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                    <span className="text-[var(--sys-text-muted)] text-sm">Loading products...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 glass-panel rounded-2xl">
                    <span className="material-symbols-outlined text-5xl text-[var(--sys-text-muted)] mb-3">inbox</span>
                    <p className="text-[var(--sys-text-muted)] text-sm mb-1">
                        {productsList.length === 0 ? 'No products in your catalog yet.' : 'No products match your search.'}
                    </p>
                    <p className="text-[var(--sys-text-muted)] text-xs mb-4">Add products in Brand DNA → Products & Services</p>
                    <button onClick={() => onSelect(null)}
                        className="glass-panel py-2.5 px-6 rounded-xl text-sm font-bold text-primary hover:bg-primary/10 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm mr-1 align-middle">edit_note</span>
                        Write Without a Product
                    </button>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {filtered.map(p => {
                            const isSelected = selectedProduct?._id === p._id
                            return (
                                <button key={p._id} onClick={() => onSelect(p)}
                                    className={`text-left glass-panel rounded-xl overflow-hidden transition-all cursor-pointer hover:scale-[1.02] ${isSelected ? 'ring-2 ring-primary border-primary/40' : 'hover:border-[var(--sys-border)]'
                                        } `}>
                                    <div className="h-28 bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center overflow-hidden">
                                        {p.images?.[0]?.url ? (
                                            <img src={p.images[0].url} alt={p.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)]">
                                                {p.type === 'service' ? 'handyman' : 'inventory_2'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="p-3">
                                        <p className="text-sm font-bold text-[var(--sys-text)] truncate">{p.title}</p>
                                        {p.category && <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">{p.category}</p>}
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
                            className="text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer underline underline-offset-4">
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
    const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)
    const { activeBrand } = useBrand()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    // Restore step from sessionStorage — but only for wizard steps (0-2).
    // Result steps (5+) reset to 0 because the result data isn't persisted.
    const [step, setStep] = useState(() => {
        const saved = parseInt(sessionStorage.getItem('cnt-step'), 10)
        return !isNaN(saved) && saved >= 0 && saved <= 2 ? saved : 0
    })   // 0=brief, 1=refinement, 2=brief-review, 5=result, 6=PR, 7=product, 8=youtube, 9=yt-result, 10=yt-seo, 11=yt-seo-result, 12=blog wizard, 13=blog editor, 14=custom blog
    const [goal, setGoal] = useState(null)
    const [subType, setSubType] = useState(null)
    const [channel, setChannel] = useState(null)
    const [context, setContext] = useState(null)
    const [toneSettings, setToneSettings] = useState(null)
    const [parsedBrief, setParsedBrief] = useState(null)   // AI-classified intent from AgenticBrief
    const [refinedData, setRefinedData] = useState(null)    // Full settings from AgenticRefinement
    const [result, setResult] = useState(null)
    // ── Monthly Strategy writeback — fires when content result is set from calendar ──
    useEffect(() => {
        if (!result) return
        const ctxRaw = window.sessionStorage.getItem('ms_strategy_ctx')
        if (!ctxRaw) return
        try {
            const { strategyId, itemId } = JSON.parse(ctxRaw)
            if (!strategyId || !itemId) return
            window.sessionStorage.removeItem('ms_strategy_ctx')
            // Content result may have text (caption) or imageUrl (visual)
            const assetUrl = result.imageUrl || result.visualUrl || ''
            const assetText = result.caption || result.text || result.body || ''
            monthlyStrategyAPI.updateAsset(strategyId, itemId, {
                type:  assetUrl ? 'image' : 'text',
                url:   assetUrl,
                title: assetText.slice(0, 80) || 'Content Studio output',
                body:  assetText,
            }).catch(e => console.warn('[ContentStudio] strategy writeback failed:', e))
        } catch {}
    }, [result]) // eslint-disable-line react-hooks/exhaustive-deps
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState(null)
    const [prefilledOccasion, setPrefilledOccasion] = useState(null)
    const [accepted, setAccepted] = useState(false)
    const [generatingVisualPrompt, setGeneratingVisualPrompt] = useState(false)
    const [inlineVisualActive, setInlineVisualActive] = useState(false)
    const [inlineVisualProgress, setInlineVisualProgress] = useState(0)
    const [inlineVisualUrl, setInlineVisualUrl] = useState(null)
    const [showHistory, setShowHistory] = useState(() => sessionStorage.getItem('cnt-showHistory') === 'true')
    const [photoshootImage, setPhotoshootImage] = useState(null)
    const [modelOverride, setModelOverride] = useState('auto')
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [youtubeData, setYoutubeData] = useState(null)
    const [youtubeSeoData, setYoutubeSeoData] = useState(null)
    const [blogResult, setBlogResult] = useState(null)
    const [availableProviders, setAvailableProviders] = useState([
        { id: 'auto', label: 'Auto (Recommended)', icon: 'auto_awesome', desc: 'AI picks the best model' },
    ])

    // Blog Module State

    const [selectedKeywords, setSelectedKeywords] = useState([])
    const [trendingData, setTrendingData] = useState(null)

    const abortControllerRef = useRef(null)
    const activeBrandIdRef = useRef(activeBrand?._id)
    // Phase 3: SSE pipeline step state fed into GlobalLoader
    const [pipelineSteps, setPipelineSteps] = useState([])
    const [generatingStartedAt, setGeneratingStartedAt] = useState(null)

    const getSignal = useCallback(() => {
        if (abortControllerRef.current) abortControllerRef.current.abort()
        abortControllerRef.current = new AbortController()
        return abortControllerRef.current.signal
    }, [])

    // Fetch available providers on mount
    useEffect(() => {
        contentAPI.providers()
            .then(data => { if (data.providers?.length) setAvailableProviders(data.providers) })
            .catch(() => { })
    }, [])

    // ── Persist wizard state to sessionStorage ──
    useEffect(() => { sessionStorage.setItem('cnt-step', String(step)) }, [step])
    useEffect(() => { sessionStorage.setItem('cnt-showHistory', showHistory ? 'true' : 'false') }, [showHistory])

    // Read URL params on mount (from Calendar, Dashboard, etc.)
    useEffect(() => {
        const occasion = searchParams.get('occasion')
        const tone = searchParams.get('tone')
        const prompt = searchParams.get('prompt')
        const emoji = searchParams.get('emoji')
        const type = searchParams.get('type')

        // ── Monthly Strategy handoff ──────────────────────────────────────────
        if (searchParams.get('from') === 'monthly_strategy') {
            try {
                const raw = window.sessionStorage.getItem('ms_brief_handoff')
                if (raw) {
                    const brief = JSON.parse(raw)
                    // Build a rich brief string from the strategy brief data
                    const parts = []
                    if (brief.angle) parts.push(`Angle: ${brief.angle}`)
                    if (brief.caption) parts.push(`Draft caption: ${brief.caption}`)
                    if (brief.cta) parts.push(`CTA: ${brief.cta}`)
                    if (brief.hashtags?.length) parts.push(`Hashtags: ${brief.hashtags.join(' ')}`)
                    if (brief.tone) parts.push(`Tone: ${brief.tone}`)
                    const briefText = parts.join('\n') || brief.angle || 'Create content from monthly strategy brief'

                    const detectedChannel = brief.platform ? brief.platform.toLowerCase() : null
                    setGoal('promote')
                    setContext({ details: briefText })
                    setParsedBrief({
                        goal: 'promote',
                        rawInput: briefText,
                        confidence: 1,
                        method: 'monthly_strategy',
                        channel: detectedChannel,
                    })
                    if (detectedChannel) setChannel(detectedChannel)
                    setStep(1)
                    window.sessionStorage.removeItem('ms_brief_handoff')
                }
            } catch (e) {
                console.error('[ContentStudio] Failed to read ms_brief_handoff:', e)
            }
            setSearchParams({}, { replace: true })
            return
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Template Routing Hydration ──
        const templateId = searchParams.get('templateId')
        if (templateId) {
            import('../services/api').then(({ templates }) => {
                if (!templates) return;
                templates.get(templateId).then(res => {
                    const tpl = res.template;
                    if (tpl) {
                        const briefText = tpl.promptTemplate || tpl.savedPrompt || '';
                        const assets = tpl.templateAssets || [];
                        const prodImg = assets.find(a => a.role === 'product')?.url || tpl.savedProductImageUrls?.[0] || '';
                        
                        setContext({ details: briefText });
                        setGoal('promote');
                        
                        let parsedData = { goal: 'promote', rawInput: briefText, confidence: 1, method: 'template', channel: null };
                        if (prodImg) {
                            parsedData.imagePreview = prodImg;
                        }
                        
                        setParsedBrief(parsedData);
                        setStep(1); // Go to AgenticRefinement step
                    }
                }).catch(err => console.error("[ContentStudio] Failed to load template", err));
            }).catch(() => {});
            
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                next.delete('templateId');
                return next;
            }, { replace: true });
            return;
        }

        if (occasion) {
            // Coming from Calendar or Dashboard with an occasion
            const briefText = `Create content for ${occasion}.${emoji ? 'Emoji: ' + emoji + '. ' : ''}This is a ${tone || 'festive'} occasion.`
            setGoal('celebrate')
            setContext({ details: briefText })
            setPrefilledOccasion({ name: occasion, tone, emoji })
            setParsedBrief({ goal: 'celebrate', rawInput: briefText, confidence: 1, method: 'url', channel: null })
            setStep(1) // → AgenticRefinement
            setSearchParams({}, { replace: true })
        } else if (searchParams.get('fromPhotoshoot')) {
            // Coming from AI Photoshoot — load image and auto-analyze
            const photoshootImg = window.sessionStorage.getItem('photoshootImage')
            if (photoshootImg) {
                setGoal('promote')
                const briefText = 'Write a compelling social media post for this product image. Include relevant hashtags and a strong CTA.'
                setContext({ details: briefText })
                setParsedBrief({ goal: 'promote', rawInput: briefText, confidence: 1, method: 'url', channel: null, imagePreview: photoshootImg })
                setStep(1) // → AgenticRefinement
                window.sessionStorage.removeItem('photoshootImage')
            }
            setSearchParams({}, { replace: true })
        } else if (searchParams.get('fromCreative')) {
            // Coming from Creative Studio — generate caption for generated image
            const creativeImageUrl = searchParams.get('imageUrl')
            if (creativeImageUrl) {
                const briefText = 'Write a compelling social media caption for this creative. Include relevant hashtags and a strong CTA.'
                setGoal('promote')
                setContext({ details: briefText })
                setParsedBrief({ goal: 'promote', rawInput: briefText, confidence: 1, method: 'url', channel: null, imagePreview: creativeImageUrl })
                setStep(1) // → AgenticRefinement
            }
            setSearchParams({}, { replace: true })
        } else if (searchParams.get('goal') === 'hijack' || searchParams.get('trend')) {
            // Coming from Dashboard Trending Now widget
            const trendTopic = searchParams.get('trend') || ''
            const trendPrompt = prompt || searchParams.get('prompt') || ''
            const briefText = trendPrompt || `Create trending content about "${trendTopic}"`
            setGoal('hijack')
            setContext({ details: briefText })
            setParsedBrief({ goal: 'hijack', rawInput: briefText, confidence: 1, method: 'url', channel: null })
            setStep(1) // → AgenticRefinement
            setSearchParams({}, { replace: true })
        } else if (prompt) {
            // Coming from Dashboard Quick Create — route through new agentic flow
            const lower = prompt.toLowerCase()
            let detectedGoal = null
            if (/promot|offer|sale|discount|deal|product/.test(lower)) detectedGoal = 'promote'
            else if (/festival|diwali|christmas|celebrat|occasion|milestone|holi|eid|navratri/.test(lower)) detectedGoal = 'celebrate'
            else if (/launch|new|announce|pr |press|collab/.test(lower)) detectedGoal = 'launch'
            else if (/blog|seo|article|guide|how.to|educat|tip/.test(lower)) detectedGoal = 'blog'
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
                setStep(15)  // YouTube sub-type picker
            } else {
                setParsedBrief({ goal: detectedGoal || 'promote', rawInput: prompt, confidence: 0.6, method: 'regex', channel: detectedChannel })
                setGoal(detectedGoal || 'promote')
                setStep(1) // → AgenticRefinement
            }
            setSearchParams({}, { replace: true })
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Smart input handler — routes through new agentic flow
    const handleSmartParse = (parsed) => {
        // Specialized flows bypass the new pipeline
        if (parsed.goal === 'press_release') {
            setGoal('press_release'); setStep(6); return
        }
        if (parsed.goal === 'product_content') {
            setGoal('product_content'); setStep(7); return
        }
        if (parsed.goal === 'youtube_content') {
            setGoal('youtube_content'); setStep(15); return  // step 15 = youtube sub-type picker
        }
        if (parsed.goal === 'custom_blog') {
            setGoal('custom_blog'); setStep(14); return
        }
        // Everything else → new agentic refinement flow
        setParsedBrief(parsed)
        setGoal(parsed.goal)
        if (parsed.channel) setChannel(parsed.channel)
        setContext({ details: parsed.rawInput, url: parsed.url })
        setStep(1) // → AgenticRefinement
    }

    // Chip quick-select from AgenticBrief
    const handleChipSelect = (chipId) => {
        if (chipId === 'press_release') { setGoal('press_release'); setStep(6); return }
        if (chipId === 'product_content') { setGoal('product_content'); setStep(7); return }
        if (chipId === 'youtube_content') { setGoal('youtube_content'); setStep(15); return }
        if (chipId === 'custom_blog') { setGoal('custom_blog'); setStep(14); return }
        // For social/blog/brand/etc → go to refinement with basic parsed data
        const isBlog = ['blog', 'educate'].includes(chipId)
        setParsedBrief({ goal: chipId, rawInput: '', confidence: 1, method: 'chip', channel: null })
        setGoal(chipId)
        setStep(1)
    }

    // Agentic generate — bridge from BriefReview to existing generate pipeline
    const handleAgenticGenerate = async (data) => {
        if (data.contentType === 'blog') {
            // Route to blog pipeline
            setGoal('blog')
            handleGenerateBlog({
                topic: data.details || data.rawInput,
                blogType: data.blogType || 'seo_blog',
                targetWordCount: data.targetWordCount || 1200,
                keywords: data.keywords ? data.keywords.split(',').map(k => k.trim()) : [],
                targetAudience: activeBrand?.dna?.targetAudience || '',
                tone: data.tone || 'bold',
                language: data.language || 'english',
            })
            return
        }
        // Social content → bridge to existing handleGenerate
        setGoal(data.goal || 'promote')
        setChannel(data.channel)
        setContext({ details: data.details || data.rawInput, url: data.url })
        handleGenerate({
            tone: data.tone || 'bold',
            length: data.length || 'medium',
            sellStyle: data.sellStyle || 'direct',
            language: data.language || 'english',
            langStyle: data.langStyle || 'pure',
            scriptType: data.scriptType || 'regional',
            researchDepth: data.researchDepth || 'quick',
        })
    }

    // Build the full prompt from all selections
    const buildPrompt = (settings) => {
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

    const handleGenerate = async (settings) => {
        setToneSettings(settings)
        if (!activeBrand) { setError({ message: 'Please select a brand first.', isProviderError: false }); return }
        setGenerating(true)
        setError('')
        setPipelineSteps([])
        setGeneratingStartedAt(Date.now())

        const prompt = buildPrompt(settings)
        const token = localStorage.getItem('mantram_token') || sessionStorage.getItem('mantram_token')
        try {
            // ── Phase 3: SSE streaming pipeline ──
            const response = await fetch(`${API_BASE}/content/agentic/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    brandId: activeBrand._id,
                    brief: prompt,
                    contentType: goal,
                    platform: Array.isArray(channel) ? channel.join(',') : channel,
                    tone: settings.tone || 'bold',
                    language: settings.language || 'english',
                    targetAudience: activeBrand?.dna?.targetAudience || '',
                    researchDepth: settings.researchDepth || 'quick',
                }),
                signal: AbortSignal.timeout(180000), // 3min hard cap
            })

            if (!response.ok) throw new Error(`Stream failed: ${response.statusText}`)

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            const processLine = (line) => {
                if (!line.startsWith('data: ')) return
                try {
                    const event = JSON.parse(line.slice(6))

                    if (event.type === 'pipeline_step') {
                        // Feed GlobalLoader — deduplicate by agent key
                        setPipelineSteps(prev => {
                            const next = prev.filter(s => s.agent !== event.agent)
                            return [...next, { agent: event.agent, message: event.message, status: event.status, durationMs: event.durationMs }]
                        })
                    } else if (event.type === 'done') {
                        const agenticContent = event.content
                        setResult({
                            _id: agenticContent._id,
                            content: agenticContent.agenticData?.draft?.content || agenticContent.content,
                            title: agenticContent.agenticData?.draft?.title || agenticContent.title,
                            hookLine: agenticContent.agenticData?.draft?.hookLine || '',
                            cta: agenticContent.agenticData?.draft?.cta || '',
                            hashtags: agenticContent.agenticData?.draft?.hashtags || [],
                            agenticData: agenticContent.agenticData,
                        })
                        setStep(5)
                    } else if (event.type === 'error') {
                        throw new Error(event.message || 'Generation failed')
                    }
                } catch (parseErr) {
                    if (parseErr.message?.includes('Generation failed') || parseErr.message?.includes('failed')) throw parseErr
                    // else skip malformed SSE line
                }
            }

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    processLine(line)
                }
            }

            // Flush remaining buffer
            buffer += decoder.decode()
            if (buffer.trim()) {
                const lines = buffer.split('\n')
                for (const line of lines) {
                    processLine(line)
                }
            }
        } catch (streamErr) {
            // ── Fallback 1: blocking agenticStart ──
            console.warn('[ContentStudio] SSE stream failed, falling back to /start:', streamErr.message)
            try {
                const data = await contentAPI.agenticStart({
                    brandId: activeBrand._id,
                    brief: prompt,
                    contentType: goal,
                    platform: Array.isArray(channel) ? channel.join(',') : channel,
                    tone: settings.tone || 'bold',
                    language: settings.language || 'english',
                    targetAudience: activeBrand?.dna?.targetAudience || '',
                    researchDepth: settings.researchDepth || 'quick',
                })
                const agenticContent = data.content
                setResult({
                    _id: agenticContent._id,
                    content: agenticContent.agenticData?.draft?.content || agenticContent.content,
                    title: agenticContent.agenticData?.draft?.title || agenticContent.title,
                    hookLine: agenticContent.agenticData?.draft?.hookLine || '',
                    cta: agenticContent.agenticData?.draft?.cta || '',
                    hashtags: agenticContent.agenticData?.draft?.hashtags || [],
                    agenticData: agenticContent.agenticData,
                })
                setStep(5)
            } catch (fallbackErr) {
                // ── Fallback 2: single-shot generate ──
                try {
                    const data = await contentAPI.generate({
                        brandId: activeBrand._id,
                        type: goal,
                        subType,
                        platform: Array.isArray(channel) ? channel.join(',') : channel,
                        prompt,
                        toneSettings: settings,
                        options: modelOverride !== 'auto' ? { modelOverride } : {},
                    })
                    setResult(data.content)
                    setStep(5)
                } catch (singleShotErr) {
                    setError({
                        message: singleShotErr.message || 'Generation failed.',
                        isProviderError: singleShotErr.isProviderError,
                        provider: singleShotErr.provider,
                    })
                }
            }
        } finally {
            setGenerating(false)
        }
    }


    const handleRegenerate = async () => {
        if (!result?._id) return
        setGenerating(true)
        try {
            const data = await contentAPI.regenerate(result._id, {})
            setResult(data.content)
        } catch (err) {
            console.error(err)
        } finally {
            setGenerating(false)
        }
    }

    const [contentFeedback, setContentFeedback] = useState(null) // 'liked' | 'disliked'
    const [abTestData, setAbTestData] = useState(null)
    const [abTestLoading, setAbTestLoading] = useState(false)

    const handleABTest = async () => {
        if (!result?._id || abTestLoading) return
        setAbTestLoading(true)
        try {
            const data = await contentAPI.agenticABVariants(result._id)
            if (data.success) {
                setAbTestData(data)
            }
        } catch (err) {
            console.error('A/B test error:', err)
        } finally {
            setAbTestLoading(false)
        }
    }

    const handleFeedback = async (signalType, extra = {}) => {
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

    const handleCreateVisual = async () => {
        if (!result?.content) return;
        setGeneratingVisualPrompt(true);
        setInlineVisualActive(true);
        setInlineVisualUrl(null);
        setInlineVisualProgress(10);
        
        try {
            // STEP 1: Generate Visual Prompt via Agentic Engine
            const brandIdentityStr = activeBrand ? `Brand Name: ${activeBrand.name}. Target Audience: ${activeBrand.dna?.audience?.demographic || ''} ${activeBrand.dna?.audience?.psychographic || ''}` : '';
            const data = await contentAPI.generateVisualPrompt({
                brief: context?.details || '',
                content: result.content,
                type: goal || 'social',
                brandContext: brandIdentityStr
            });
            let visualPrompt = data.prompt || result.content.substring(0, 200);
            
            // INJECT BRAND DNA
            const brandColors = activeBrand?.dna?.colors?.map(c => c.hex).join(', ') || ''
            const brandName = activeBrand?.name || ''
            const personality = activeBrand?.dna?.voice?.personality || ''

            if (brandName) visualPrompt += `. Brand: ${brandName}.`
            if (personality) visualPrompt += ` Style: ${personality}.`
            if (brandColors) visualPrompt += ` Use brand colors: ${brandColors}.`

            setInlineVisualProgress(30);

            // STEP 2: Trigger Generation directly using creativesAPI
            const jobData = await creativesAPI.createJob({
                brandId: activeBrand?._id,
                type: 'instagram-post', // Valid enum type
                prompt: visualPrompt,
                options: {
                    dimensions: '1080x1080',
                    model: 'nanobanana-2',
                }
            });

            if (jobData?.success && jobData?.jobId) {
                const localJobId = jobData.jobId;
                
                // STEP 3: Poll until completion
                const pollInterval = setInterval(async () => {
                    try {
                        const pollData = await creativesAPI.pollJob(localJobId);
                        if (!pollData?.success) return;
                        const job = pollData.job;
                        
                        setInlineVisualProgress(Math.max(40, job.progress || 0));
                        
                        if (job.status === 'completed') {
                            clearInterval(pollInterval);
                            const finalUrl = job.result?.creative?.imageUrl || job.imageUrl;
                            const creativeId = job.result?.creative?._id;
                            
                            if (finalUrl) {
                                setInlineVisualUrl(finalUrl);
                                setInlineVisualProgress(100);
                                setGeneratingVisualPrompt(false);
                                setInlineVisualActive(false);
                            } else if (creativeId) {
                                // S3 Upload pending — wait explicitly just like Creative Studio
                                let retries = 0;
                                const waitForS3 = setInterval(async () => {
                                    retries++;
                                    if (retries > 12) {
                                        clearInterval(waitForS3);
                                        setGeneratingVisualPrompt(false);
                                        setInlineVisualActive(false);
                                        return;
                                    }
                                    try {
                                        const repoll = await creativesAPI.pollJob(localJobId);
                                        const freshJob = repoll?.job;
                                        const freshUrl = freshJob?.result?.creative?.imageUrl || freshJob?.imageUrl;
                                        if (freshUrl) {
                                            clearInterval(waitForS3);
                                            setInlineVisualUrl(freshUrl);
                                            setInlineVisualProgress(100);
                                            setGeneratingVisualPrompt(false);
                                            setInlineVisualActive(false);
                                        }
                                    } catch (err) { /* ignore single poll failure */ }
                                }, 5000);
                            } else {
                                setGeneratingVisualPrompt(false);
                                setInlineVisualActive(false);
                            }
                        } else if (job.status === 'failed') {
                            clearInterval(pollInterval);
                            console.error('Inline visual job failed');
                            setGeneratingVisualPrompt(false);
                            setInlineVisualActive(false);
                            setError({ message: job.errorMessage || 'Visual generation failed. The AI provider may be busy. Please try again.', isProviderError: true });
                        }
                    } catch (e) {
                         console.error('Inline Visual Poll error:', e);
                    }
                }, 3000);
            } else {
                setGeneratingVisualPrompt(false);
                setInlineVisualActive(false);
                setError({ message: jobData?.error || 'Failed to start visual generation.', isProviderError: true });
            }
        } catch (err) {
            console.error('Failed to generate visual inline:', err);
            setGeneratingVisualPrompt(false);
            setInlineVisualActive(false);
            setError({ message: err.message || 'Failed to generate visual inline.', isProviderError: true });
        }
    }



    // Press Release generation handler
    const handleGeneratePR = async (prData) => {
        if (!activeBrand) { setError({ message: 'Please select a brand first.', isProviderError: false }); return }
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
            const data = await contentAPI.generate({
                brandId: activeBrand._id,
                type: 'press_release',
                subType: 'press_release',
                platform: prData.distribution.join(','),
                prompt,
                toneSettings: { language: prData.language, tone: prData.tone },
                options: modelOverride !== 'auto' ? { modelOverride } : {},
            })
            setResult(data.content)
            setStep(5)
        } catch (err) {
            setError({ 
                message: err.message || 'Press release generation failed.', 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            })
        } finally {
            setGenerating(false)
        }
    }

    // Refine handler — updates content in-place
    const handleRefine = (refineData) => {
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

    const handleHistorySelect = async (item) => {
        setShowHistory(false)
        // Blog content → fetch full blogMeta and open in Blog Editor (Step 13)
        if (item.type === 'blog' && item._id) {
            try {
                const data = await contentAPI.get(item._id)
                const fullContent = data.content || item
                if (fullContent.blogMeta?.sections?.length) {
                    setBlogResult(fullContent)
                    setGoal('blog')
                    setStep(13)
                    return
                }
            } catch (err) {
                console.warn('Failed to load full blog data, falling back to ResultView:', err)
            }
        }
        // All other content → generic ResultView (Step 5)
        setResult(item)
        setStep(5)
        setAccepted(item.status === 'approved')
    }

    const resetAll = () => {
        setStep(0); setGoal(null); setSubType(null); setChannel(null)
        setContext(null); setToneSettings(null); setResult(null); setError('')
        setAccepted(false); setPrefilledOccasion(null); setSelectedProduct(null)
        setYoutubeData(null); setYoutubeSeoData(null); setContentFeedback(null)
        setBlogResult(null); setParsedBrief(null); setRefinedData(null)
    }

    // Blog generation handler
    const handleGenerateBlog = async (blogSettings) => {
        if (!activeBrand) { setError({ message: 'Please select a brand first.', isProviderError: false }); return }
        setGenerating(true)
        setError('')

        try {
            const data = await contentAPI.blogGenerate({
                brandId: activeBrand._id,
                topic: blogSettings.topic,
                blogType: blogSettings.blogType || subType || 'seo_blog',
                targetWordCount: blogSettings.targetWordCount,
                keywords: blogSettings.keywords,
                targetAudience: blogSettings.targetAudience,
                tone: blogSettings.tone,
                language: blogSettings.language,
            })
            if (data.success && data.content) {
                setBlogResult(data.content)
                setStep(13) // Jump to blog editor
            } else {
                setError({ message: data.error || 'Blog generation failed', isProviderError: false })
            }
        } catch (err) {
            console.error('Blog generation error:', err)
            setError({ message: err.message || 'Blog generation failed', isProviderError: false })
        } finally {
            setGenerating(false)
        }
    }

    // Smart Blog Writer: create a temp blog record on demand for image gen, then pass through
    const handleSmartWriterImageGenerate = async (sectionIndex, imageStyle, opts = {}, aspectRatio) => {
        // Use existing blogResult if already created, otherwise create a minimal placeholder
        let targetContent = blogResult
        if (!targetContent?._id) {
            try {
                const data = await contentAPI.blogGenerate({
                    brandId: activeBrand?._id,
                    topic: 'Smart Writer Image Placeholder',
                    blogType: subType || 'seo_blog',
                    targetWordCount: 500,
                    keywords: [],
                    targetAudience: '',
                    tone: 'professional',
                })
                if (data?.content) {
                    targetContent = data.content
                    setBlogResult(data.content) // update state for subsequent calls
                }
            } catch { /* fall through silently — image gen will return null gracefully */ }
        }
        if (!targetContent?._id) return null

        // Call image generation directly with the resolved ID (avoids stale state)
        try {
            const payload = { sectionIndex, imageStyle: imageStyle || 'editorial' }
            if (opts.brandImageUrl) payload.brandImageUrl = opts.brandImageUrl
            if (opts.brandImageRef) payload.brandImageRef = opts.brandImageRef
            if (aspectRatio) payload.aspectRatio = aspectRatio
            return await contentAPI.blogGenerateImage(targetContent._id, payload)
        } catch (err) {
            console.error('Smart writer image gen error:', err)
            return null
        }
    }

    const handleBlogImageGenerate = async (sectionIndex, imageStyle, opts = {}, aspectRatio) => {
        try {
            const payload = { sectionIndex, imageStyle: imageStyle || 'editorial' }
            if (opts.brandImageUrl) payload.brandImageUrl = opts.brandImageUrl
            if (opts.brandImageRef) payload.brandImageRef = opts.brandImageRef
            if (aspectRatio) payload.aspectRatio = aspectRatio
            const data = await contentAPI.blogGenerateImage(blogResult._id, payload)
            return data // { success, imageUrl, altText, sectionIndex, aspectRatio, model }
        } catch (err) {
            console.error('Blog image gen error:', err)
            return null
        }
    }

    // YouTube content generation handler (Script & Ideation)
    const handleGenerateYouTube = async (ytSettings) => {
        if (!activeBrand) { setError({ message: 'Please select a brand first.', isProviderError: false }); return }
        setGenerating(true)
        setError('')

        try {
            const data = await contentAPI.youtube({
                brandId: activeBrand._id,
                brief: ytSettings.brief,
                format: ytSettings.format,
                videoLength: ytSettings.videoLength,
                targetAudience: ytSettings.targetAudience,
                style: ytSettings.style,
                language: ytSettings.language,
                subType: subType || '',
            })
            setResult(data.content)
            setYoutubeData(data.content?.youtubeData || {})
            setStep(9)  // YouTube result view
        } catch (err) {
            setError({ 
                message: err.message || 'YouTube content generation failed.', 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            })
        } finally {
            setGenerating(false)
        }
    }

    // YouTube SEO / Publish Optimizer handler (metadata only)
    const handleGenerateYouTubeSeo = async (seoSettings) => {
        if (!activeBrand) { setError({ message: 'Please select a brand first.', isProviderError: false }); return }
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
            setError({ 
                message: err.message || 'YouTube SEO generation failed.', 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            })
        } finally {
            setGenerating(false)
        }
    }

    // Step progress (new 3-step flow)
    const stepLabels = ['Brief', 'Refine', 'Review']

    return (
        <DashboardLayout title="Content Studio" subtitle="AI-powered content for every channel">
            <Walkthrough studioId="contentStudio" />

            {/* Progress Stepper (shown at steps 1-2) */}
            {step > 0 && step < 3 && (
                <div className="flex items-center gap-2 mb-8 max-w-3xl mx-auto">
                    <button onClick={resetAll} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                    </button>
                    {stepLabels.map((lbl, i) => (
                        <div key={lbl} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                                ${step > i ? 'bg-primary text-white' : step === i ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'}`}>
                                {step > i ? <span className="material-symbols-outlined text-sm">check</span> : i + 1}
                            </div>
                            <span className={`text-xs font-bold ${step >= i ? 'text-[var(--sys-text-muted)]' : 'text-[var(--sys-text-muted)]'}`}>{lbl}</span>
                            {i < 2 && <div className={`w-8 h-px ${step > i ? 'bg-primary/40' : 'bg-[var(--sys-surface)]'}`} />}
                        </div>
                    ))}
                    <div className="ml-auto flex items-center gap-3">
                        <button onClick={() => setShowTemplateLibrary(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--sys-primary)] text-white hover:bg-[var(--sys-primary)]/90 transition-all cursor-pointer font-semibold shadow-sm text-xs">
                            <span className="material-symbols-outlined text-[16px]">grid_view</span>
                            <span className="hidden sm:inline">Start from template ↗</span>
                        </button>
                        <button onClick={() => setShowHistory(!showHistory)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${showHistory ? 'bg-primary/20 text-primary' : 'glass-panel text-[var(--sys-text-muted)] hover:text-white'}`}>
                            <span className="material-symbols-outlined text-sm">history</span>
                            History
                        </button>
                    </div>
                </div>
            )}

            {/* ========== STEP 0: THE BRIEF (Context-First) ========== */}
            {step === 0 && (
                <AgenticBrief
                    onSubmit={handleSmartParse}
                    onChipSelect={handleChipSelect}
                    activeBrand={activeBrand}
                />
            )}

            {/* ========== STEP 1: THE REFINEMENT (Dynamic Settings) ========== */}
            {step === 1 && parsedBrief && (
                <AgenticRefinement
                    parsed={parsedBrief}
                    onConfirm={(data) => { setRefinedData(data); setStep(2) }}
                    onBack={() => { setStep(0); setParsedBrief(null) }}
                    activeBrand={activeBrand}
                    availableProviders={availableProviders}
                    modelOverride={modelOverride}
                    setModelOverride={setModelOverride}
                />
            )}

            {/* ========== STEP 2: BRIEF REVIEW (Confirm & Generate) ========== */}
            {step === 2 && refinedData && (
                <>
                    <BriefReview
                        refinedData={refinedData}
                        activeBrand={activeBrand}
                        onGenerate={handleAgenticGenerate}
                        onBack={() => setStep(1)}
                        generating={generating}
                    />
                    <GlobalLoader
                        isActive={generating}
                        title="Generating with brand intelligence..."
                        currentStage={`Using ${activeBrand?.name}'s voice DNA for human-authentic output`}
                        icon="auto_awesome"
                        estimatedDuration={45}
                        pipelineSteps={pipelineSteps}
                        startedAt={generatingStartedAt}
                        thinkingContext="content"
                    />
                    {error && (
                        <div className={`max-w-2xl mx-auto mt-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm text-center`}>
                            <span className="material-symbols-outlined align-middle mr-1">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                            {error.message}
                        </div>
                    )}
                </>
            )}

            {/* YouTube Sub-Type Picker (step 15) */}
            {step === 15 && <StepSubType goal="youtube_content" onSelect={(s) => {
                setSubType(s);
                if (s === 'youtube_seo') {
                    setStep(10)  // YouTube SEO wizard
                } else {
                    setStep(8)  // YouTube Script wizard
                }
            }} onBack={() => setStep(0)} />}
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
                    <GlobalLoader 
                        isActive={generating} 
                        title="Crafting your press release..." 
                        currentStage="Using brand DNA + PR best practices for professional output"
                        icon="newspaper"
                        estimatedDuration={45}
                        thinkingContext="content"
                    />
                    {error && (
                        <div className={`max-w-2xl mx-auto mt-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm text-center`}>
                            <span className="material-symbols-outlined align-middle mr-1">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                            {error.message}
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
                <>
                    <ResultView
                        result={result}
                        activeBrand={activeBrand}
                        generating={generating}
                        generatingVisualPrompt={generatingVisualPrompt}
                        accepted={accepted}
                        imageUrl={null}
                        onRegenerate={handleRegenerate}
                        onFeedback={handleFeedback}
                        onNewContent={resetAll}
                        onGenerateVisual={handleCreateVisual}
                        onCreateVisual={handleCreateVisual}
                        onRefine={handleRefine}
                        contentFeedback={contentFeedback}
                        onABTest={handleABTest}
                        abTestData={abTestData}
                        abTestLoading={abTestLoading}
                        inlineVisualUrl={inlineVisualUrl}
                        inlineVisualActive={inlineVisualActive}
                        inlineVisualProgress={inlineVisualProgress}
                        brandId={activeBrand?._id}
                    />
                    {error && (
                        <div className={`max-w-2xl mx-auto mt-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm text-center`}>
                            <span className="material-symbols-outlined align-middle mr-1">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            {error.message}
                        </div>
                    )}
                </>
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
                    <GlobalLoader 
                        isActive={generating} 
                        title="Generating YouTube content..." 
                        currentStage="Running YouTube Research Agent → YouTube Writer Agent pipeline"
                        icon="smart_display"
                        estimatedDuration={60}
                        thinkingContext="content"
                    />
                    {error && (
                        <div className={`max-w-2xl mx-auto mt-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm text-center`}>
                            <span className="material-symbols-outlined align-middle mr-1">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                            {error.message}
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
                    <GlobalLoader 
                        isActive={generating} 
                        title="Optimizing for YouTube algorithm..." 
                        currentStage="Running YouTube Research Agent → SEO Optimizer Agent pipeline"
                        icon="troubleshoot"
                        estimatedDuration={60}
                        thinkingContext="content"
                    />
                    {error && (
                        <div className={`max-w-2xl mx-auto mt-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm text-center`}>
                            <span className="material-symbols-outlined align-middle mr-1">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                            {error.message}
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

            {/* Blog Wizard (step 12) */}
            {step === 12 && (
                <>
                    <StepBlogWizard
                        activeBrand={activeBrand}
                        blogType={subType || 'seo_blog'}
                        onGenerate={handleGenerateBlog}
                        onBack={() => { setGoal(null); setStep(0) }}
                        generating={generating}
                    />
                    <GlobalLoader 
                        isActive={generating} 
                        title="Writing your blog article..." 
                        currentStage="Research Agent → Blog Writer generating structured content with SEO"
                        icon="edit_note"
                        estimatedDuration={60}
                        thinkingContext="content"
                    />
                    {error && (
                        <div className={`max-w-2xl mx-auto mt-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm text-center`}>
                            <span className="material-symbols-outlined align-middle mr-1">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            {error.message}
                        </div>
                    )}
                </>
            )}

            {/* Blog Editor (step 13) */}
            {step === 13 && blogResult && (
                <BlogEditorView
                    content={blogResult}
                    activeBrand={activeBrand}
                    onNewContent={resetAll}
                    onGenerateImage={handleBlogImageGenerate}
                />
            )}

            {/* Custom Blog Writer (step 14) — standalone "Write It Yourself" mode */}
            {step === 14 && (
                <SmartBlogWriter
                    activeBrand={activeBrand}
                    onBack={() => { setGoal(null); setStep(0) }}
                    onGenerateImage={handleSmartWriterImageGenerate}
                />
            )}

            {/* Content History Sidebar */}
            <ContentHistory
                brandId={activeBrand?._id}
                visible={showHistory}
                onToggle={() => setShowHistory(false)}
                onSelect={handleHistorySelect}
            />
            {/* ========== TEMPLATE LIBRARY OVERLAY ========== */}
            {showTemplateLibrary && (
                <TemplateLibrary overlayMode={true} studioFilter="content" onCloseOverlay={() => setShowTemplateLibrary(false)} />
            )}
        </DashboardLayout>
    )
}

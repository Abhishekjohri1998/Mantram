import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import SEOHead from '../components/SEOHead'

/* ────────────────────────────────────────────── */
/*  STUDIO PREVIEW — SEO TEASER PAGE              */
/*  Public page for each studio — builds curiosity */
/* ────────────────────────────────────────────── */

const STUDIO_DATA = {
    'content-studio': {
        name: 'Content Studio',
        tagline: 'AI-Powered Writing for Every Channel',
        icon: 'draw',
        gradient: 'from-[#FF4D00] to-[#FF7A00]',
        accentHex: '#8b5cf6',
        metaDesc: 'Generate brand-aligned blog posts, social captions, ad copy & emails with Mantram AI Content Studio. AI writing that sounds like you.',
        heroLine: 'What if every piece of content your brand publishes was perfectly aligned to your voice — written in seconds, not hours?',
        capabilities: [
            { icon: 'article', label: 'Long-form Blog Posts' },
            { icon: 'tag', label: 'Social Media Captions' },
            { icon: 'ads_click', label: 'High-Converting Ad Copy' },
            { icon: 'mail', label: 'Email Sequences' },
            { icon: 'translate', label: 'Multi-Language Support' },
            { icon: 'verified', label: 'Brand Voice Lock' },
        ],
        teaser: 'Content Studio doesn\'t just write — it thinks. Powered by multi-model AI, it extracts your brand DNA and produces content that\'s indistinguishable from your best writer.',
        stat: { value: '10x', label: 'Faster Content Creation' },
        aiSummary: 'Mantram AI Content Studio is an AI-powered copywriting tool that generates brand-aligned blog posts, social media captions, ad copy, email sequences, and more. Uses multi-model AI (Gemini, Claude, Grok) with Brand DNA to ensure voice consistency. Supports 20+ languages.',
    },
    'creative-studio': {
        name: 'Creative Studio',
        tagline: 'Design That Scales with AI',
        icon: 'auto_fix_high',
        gradient: 'from-[#FF4D00] to-rose-600',
        accentHex: '#ec4899',
        metaDesc: 'Design social posts, banners, ads & AI photoshoots with brand consistency using Mantram AI Creative Studio.',
        heroLine: 'What if every visual your brand produces maintains pixel-perfect brand consistency — without a design team?',
        capabilities: [
            { icon: 'image', label: 'Social Post Templates' },
            { icon: 'photo_camera', label: 'AI Photoshoots' },
            { icon: 'web_stories', label: 'Story & Reel Creatives' },
            { icon: 'rectangle', label: 'Banner & Ad Design' },
            { icon: 'palette', label: 'Brand Kit Auto-Apply' },
            { icon: 'burst_mode', label: 'Batch Generation' },
        ],
        teaser: 'From Instagram carousels to product photoshoots — Creative Studio generates visuals that look agency-quality, powered by your brand\'s exact colors, fonts & style.',
        stat: { value: '100+', label: 'Design Templates' },
        aiSummary: 'Mantram AI Creative Studio generates brand-consistent social media graphics, banners, ad creatives, and AI photoshoots. Powered by Google Imagen and Gemini, it auto-applies your brand kit (colors, fonts, logo) to every design. Supports batch generation and multiple aspect ratios.',
    },
    'video-studio': {
        name: 'Video Studio',
        tagline: 'Multi-Model Video Generation',
        icon: 'smart_display',
        gradient: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]',
        accentHex: '#f59e0b',
        metaDesc: 'Generate cinematic videos with Seedance, Kling & Veo 2. Text-to-video, image-to-video & video extend — all in one studio.',
        heroLine: 'What if you could go from a text prompt to a cinematic video — with the world\'s best AI video models at your fingertips?',
        capabilities: [
            { icon: 'movie', label: 'Text-to-Video' },
            { icon: 'add_photo_alternate', label: 'Image-to-Video' },
            { icon: 'fast_forward', label: 'Video Extend' },
            { icon: 'tune', label: 'Multi-Model Selection' },
            { icon: 'high_quality', label: 'Up to 4K Output' },
            { icon: 'theaters', label: 'Reference Image Guidance' },
        ],
        teaser: 'Access Seedance 2.0, Kling & Veo 2 in one studio. Generate product videos, ad creatives & social content — then extend and refine until it\'s perfect.',
        stat: { value: '3', label: 'AI Video Models' },
        aiSummary: 'Mantram AI Video Studio offers text-to-video, image-to-video, and video extend capabilities using three AI video models: Seedance 2.0 (ByteDance), Kling, and Veo 2 (Google). Supports reference images, multiple aspect ratios, and resolutions up to 4K. Ideal for product videos, ad creatives, and social content.',
    },
    'performance-studio': {
        name: 'Performance Studio',
        tagline: 'AI Ad Strategist & Campaign Builder',
        icon: 'campaign',
        gradient: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]',
        accentHex: '#10b981',
        metaDesc: 'AI-powered ad strategy, competitor research, budget planning & Meta/Google campaign generation with Mantram AI Performance Studio.',
        heroLine: 'What if your ad campaigns were built by an AI that researches competitors, plans budgets & optimizes ROAS — automatically?',
        capabilities: [
            { icon: 'search', label: 'Competitor Research' },
            { icon: 'account_balance', label: 'Budget Planning' },
            { icon: 'groups', label: 'Audience Targeting' },
            { icon: 'edit_note', label: 'Ad Copy Generation' },
            { icon: 'trending_up', label: 'ROAS Optimization' },
            { icon: 'hub', label: 'Meta & Google Ads' },
        ],
        teaser: 'Performance Studio is your AI CMO. It analyzes competitors, identifies market gaps, plans budgets and generates complete ad campaigns — from strategy to creative.',
        stat: { value: '4.2x', label: 'Average ROAS' },
        aiSummary: 'Mantram AI Performance Studio is an AI ad strategist that researches competitors, plans budgets, generates audience targeting, creates ad copy, and builds complete Meta and Google ad campaigns. Acts as an AI CMO for ROAS optimization.',
    },
    'seo-studio': {
        name: 'SEO Studio',
        tagline: 'AI-Powered Search Intelligence',
        icon: 'query_stats',
        gradient: 'from-[#FF4D00] to-[#FF7A00]',
        accentHex: '#3b82f6',
        metaDesc: 'AI keyword research, site audits, content gap analysis & competitive intelligence with Mantram AI SEO Studio.',
        heroLine: 'What if your SEO strategy was powered by AI that understands search intent, competitor gaps & ranking opportunities?',
        capabilities: [
            { icon: 'key', label: 'Keyword Research' },
            { icon: 'bug_report', label: 'Site Audit' },
            { icon: 'compare_arrows', label: 'Competitive Analysis' },
            { icon: 'find_in_page', label: 'Content Gap Analysis' },
            { icon: 'speed', label: 'Core Web Vitals' },
            { icon: 'link', label: 'Backlink Intelligence' },
        ],
        teaser: 'SEO Studio combines AI-powered analysis with real-time search data. Find keyword opportunities, fix technical issues & outrank competitors — all from one dashboard.',
        stat: { value: '87+', label: 'Health Score Target' },
        aiSummary: 'Mantram AI SEO Studio provides AI-powered keyword research, comprehensive site audits, content gap analysis, competitive intelligence, Core Web Vitals monitoring, and backlink analysis. Uses strategic persona methodology for targeted SEO strategies.',
    },
    'd2c-studio': {
        name: 'D2C Studio',
        tagline: 'Shopify Intelligence Hub',
        icon: 'storefront',
        gradient: 'from-cyan-500 to-sky-600',
        accentHex: '#06b6d4',
        metaDesc: 'Shopify analytics, product velocity, abandonment signals & AI-powered e-commerce insights with Mantram AI D2C Studio.',
        heroLine: 'What if your Shopify store had an AI analyst tracking every metric — product velocity, cart abandonment, revenue trends — in real-time?',
        capabilities: [
            { icon: 'shopping_cart', label: 'Product Velocity' },
            { icon: 'remove_shopping_cart', label: 'Abandonment Signals' },
            { icon: 'trending_up', label: 'Revenue Analytics' },
            { icon: 'inventory', label: 'Inventory Intelligence' },
            { icon: 'people', label: 'Customer Segments' },
            { icon: 'integration_instructions', label: 'Shopify Sync' },
        ],
        teaser: 'D2C Studio connects directly to your Shopify store. Track product performance, identify abandonment patterns & get AI-powered recommendations to boost revenue.',
        stat: { value: '23%', label: 'Revenue Lift' },
        aiSummary: 'Mantram AI D2C Studio connects to Shopify stores for real-time analytics: product velocity, cart abandonment signals, revenue trends, inventory intelligence, and customer segments. Provides AI-powered recommendations to boost D2C revenue.',
    },
    'conversation-studio': {
        name: 'Conversation Studio',
        tagline: 'AI Auto-Responder for Social DMs',
        icon: 'forum',
        gradient: 'from-[#FF4D00] to-[#FF7A00]',
        accentHex: '#d946ef',
        metaDesc: 'AI auto-responder for Instagram & Facebook DMs. Route leads, answer FAQs & never miss a message with Mantram AI.',
        heroLine: 'What if every DM your brand receives gets an intelligent, on-brand response — instantly, 24/7, without human intervention?',
        capabilities: [
            { icon: 'smart_toy', label: 'AI Auto-Responses' },
            { icon: 'route', label: 'Lead Routing' },
            { icon: 'quiz', label: 'FAQ Handling' },
            { icon: 'schedule', label: '24/7 Availability' },
            { icon: 'insights', label: 'Conversation Analytics' },
            { icon: 'link', label: 'Instagram & Facebook' },
        ],
        teaser: 'Stop losing leads to unanswered DMs. Conversation Studio uses AI to respond instantly, route hot leads to your team & handle FAQs — across Instagram & Facebook.',
        stat: { value: '847+', label: 'DMs Handled Daily' },
        aiSummary: 'Mantram AI Conversation Studio is an AI auto-responder for Instagram and Facebook DMs. Provides instant brand-aligned responses, lead routing, FAQ handling, and conversation analytics with 24/7 availability.',
    },
    'brainstorm-studio': {
        name: 'Brainstorm Studio',
        tagline: 'AI Creative Director & Brand Strategist',
        icon: 'lightbulb',
        gradient: 'from-yellow-500 to-amber-600',
        accentHex: '#eab308',
        metaDesc: 'AI-powered brand strategy, campaign ideas, ad concepts, mood boards & content calendars with Mantram AI Brainstorm Studio.',
        heroLine: 'What if your next viral campaign was ideated by an AI that understands your brand, your market & what\'s trending — right now?',
        capabilities: [
            { icon: 'strategy', label: 'Brand Strategy' },
            { icon: 'campaign', label: 'Campaign Ideation' },
            { icon: 'movie_creation', label: 'Ad Film Concepts' },
            { icon: 'dashboard', label: 'Mood Boards' },
            { icon: 'calendar_month', label: 'Content Calendars' },
            { icon: 'trending_up', label: 'Trend-Aware Ideas' },
        ],
        teaser: 'Brainstorm Studio is your AI creative director. It generates brand strategies, campaign concepts, ad film scripts & content calendars — all aligned to what\'s trending.',
        stat: { value: '∞', label: 'Creative Possibilities' },
        aiSummary: 'Mantram AI Brainstorm Studio acts as an AI creative director and brand strategist. Generates brand strategies, campaign ideas, ad film concepts, mood boards, and content calendars — all trend-aware and brand-aligned.',
    },
    'smart-calendar': {
        name: 'Smart Calendar',
        tagline: 'Marketing Intelligence Calendar',
        icon: 'calendar_month',
        gradient: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]',
        accentHex: '#14b8a6',
        metaDesc: 'AI-powered marketing calendar with trending moments, festivals & content date suggestions. Never miss a marketing moment.',
        heroLine: 'What if your content calendar automatically knew every festival, trending moment & optimal posting date — tailored for Indian D2C brands?',
        capabilities: [
            { icon: 'celebration', label: 'Festival Intelligence' },
            { icon: 'trending_up', label: 'Trend-Based Dates' },
            { icon: 'schedule_send', label: 'Auto-Scheduling' },
            { icon: 'flag', label: 'Campaign Milestones' },
            { icon: 'notifications_active', label: 'Smart Reminders' },
            { icon: 'auto_awesome', label: 'AI Suggestions' },
        ],
        teaser: 'Smart Calendar combines festival data, trending moments & AI intelligence to suggest the perfect dates for every piece of content. Never miss a marketing moment.',
        stat: { value: '365', label: 'Days Optimized' },
        aiSummary: 'Mantram AI Smart Calendar is a marketing intelligence calendar that tracks Indian festivals (Diwali, Holi, Navratri), trending moments, and optimal posting dates. Provides AI-powered content scheduling suggestions.',
    },
    'analytics': {
        name: 'Analytics',
        tagline: 'Traffic Intelligence & Growth Insights',
        icon: 'analytics',
        gradient: 'from-[#FF4D00] to-[#FF7A00]',
        accentHex: '#6366f1',
        metaDesc: 'AI-powered traffic analytics, audience insights, Google Analytics integration & growth strategies with Mantram AI.',
        heroLine: 'What if your analytics dashboard didn\'t just show numbers — but told you exactly what to do next to grow faster?',
        capabilities: [
            { icon: 'monitoring', label: 'Real-Time Traffic' },
            { icon: 'groups', label: 'Audience Insights' },
            { icon: 'conversion_path', label: 'Conversion Tracking' },
            { icon: 'integration_instructions', label: 'GA4 Integration' },
            { icon: 'auto_graph', label: 'AI Growth Advice' },
            { icon: 'compare_arrows', label: 'Competitor Benchmarks' },
        ],
        teaser: 'Analytics goes beyond dashboards. It connects to Google Analytics, analyzes your traffic patterns & gives you AI-powered recommendations to accelerate growth.',
        stat: { value: '24.8K', label: 'Avg. Visitors Tracked' },
        aiSummary: 'Mantram AI Analytics provides real-time traffic monitoring, audience insights, conversion tracking, Google Analytics 4 integration, AI growth recommendations, and competitor benchmarking.',
    },
    'skills-hub': {
        name: 'Skills Hub',
        tagline: 'Custom AI Marketing Workflows',
        icon: 'build_circle',
        gradient: 'from-lime-500 to-green-600',
        accentHex: '#84cc16',
        metaDesc: 'Build custom AI marketing skills — reusable workflows with AI-enhanced instructions that execute on demand. Mantram AI Skills Hub.',
        heroLine: 'What if you could teach AI your exact marketing playbook — then run it on demand with a single click?',
        capabilities: [
            { icon: 'build', label: 'Custom Skill Builder' },
            { icon: 'auto_awesome', label: 'AI-Enhanced Instructions' },
            { icon: 'replay', label: 'Reusable Workflows' },
            { icon: 'bolt', label: 'One-Click Execution' },
            { icon: 'share', label: 'Skill Templates' },
            { icon: 'tune', label: 'Configurable Inputs' },
        ],
        teaser: 'Skills Hub lets you build custom AI marketing workflows. Write rough instructions, enhance them with AI, then run them on demand — festival campaigns, product launches, email sequences.',
        stat: { value: '50+', label: 'Ready-Made Skills' },
        aiSummary: 'Mantram AI Skills Hub lets marketers build custom AI workflows (Skills). Write rough instructions, enhance with AI, configure inputs, and run on demand. Ideal for festival campaigns, product launches, email sequences, and repetitive marketing tasks.',
    },
    'fidato': {
        name: 'Fidato',
        tagline: 'Your AI Brand OS Concierge',
        icon: 'smart_toy',
        gradient: 'from-sky-500 to-[#FF7A00]',
        accentHex: '#0ea5e9',
        metaDesc: 'Meet Fidato — your personal AI marketing assistant. One command bar to orchestrate all 12 studios. Mantram AI.',
        heroLine: 'What if one intelligent command could orchestrate your entire marketing stack — content, creative, video, ads, SEO — all at once?',
        capabilities: [
            { icon: 'bolt', label: 'Instant Answers' },
            { icon: 'hub', label: 'Cross-Studio Orchestration' },
            { icon: 'build_circle', label: 'Run Skills on Demand' },
            { icon: 'psychology', label: 'Brand-Aware Context' },
            { icon: 'translate', label: 'Multi-Language' },
            { icon: 'terminal', label: '⌘K Command Bar' },
        ],
        teaser: 'Fidato is your AI marketing concierge. One prompt, and it plans, delegates & combines outputs across all 12 studios — like having an entire marketing team on call.',
        stat: { value: '12', label: 'Studios Orchestrated' },
        aiSummary: 'Fidato is Mantram AI\'s intelligent marketing concierge. Accessible via ⌘K command bar, it orchestrates tasks across all 12 studios, runs custom skills, generates content, and provides strategic recommendations — like an AI CMO on call 24/7.',
    },
}

export default function StudioPreview() {
    const { slug } = useParams()
    const navigate = useNavigate()
    const studio = STUDIO_DATA[slug]
    const [email, setEmail] = useState('')
    const [submitted, setSubmitted] = useState(false)

    /* ── Scroll to top on mount ── */
    useEffect(() => { window.scrollTo(0, 0) }, [slug])

    if (!studio) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#07070f' }}>
                <div className="text-center">
                    <h1 className="text-4xl font-black text-[var(--sys-text)] mb-4">Studio Not Found</h1>
                    <Link to="/" className="text-primary hover:underline">← Back to Home</Link>
                </div>
            </div>
        )
    }

    /* ── Per-page JSON-LD ── */
    const studioJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": `${studio.name} — Mantram AI`,
        "description": studio.metaDesc,
        "url": `https://mantram.ai/studio/${slug}`,
        "isPartOf": { "@type": "WebSite", "name": "Mantram AI", "url": "https://mantram.ai/" },
        "about": {
            "@type": "SoftwareApplication",
            "name": `Mantram AI ${studio.name}`,
            "applicationCategory": "BusinessApplication",
            "operatingSystem": "Web",
            "description": studio.teaser,
            "featureList": studio.capabilities.map(c => c.label),
            "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR", "description": "Free tier available" }
        },
        "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
                { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mantram.ai/" },
                { "@type": "ListItem", "position": 2, "name": "Studios", "item": "https://mantram.ai/#studios" },
                { "@type": "ListItem", "position": 3, "name": studio.name, "item": `https://mantram.ai/studio/${slug}` }
            ]
        },
        "speakable": {
            "@type": "SpeakableSpecification",
            "cssSelector": ["h1", "h2", ".text-lg"]
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!email.trim()) return
        try {
            const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
            await fetch(`${apiBaseUrl}/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name: '', type: 'individual', source: `studio-${slug}` })
            })
            setSubmitted(true)
        } catch { setSubmitted(true) }
    }

    return (
        <>
            <SEOHead
                title={`${studio.name} — Mantram AI | ${studio.tagline}`}
                description={studio.metaDesc}
                canonical={`/studio/${slug}`}
                ogTitle={`${studio.name} — Mantram AI`}
                ogDescription={studio.teaser}
                ogImage="https://mantram.ai/mantram-logo.png"
                twitterTitle={`${studio.name} — Mantram AI`}
                twitterDescription={studio.tagline}
                aiSummary={studio.aiSummary}
                jsonLd={studioJsonLd}
            />
            <div className="min-h-screen flex flex-col" style={{ background: '#07070f' }}>
                {/* Ambient background */}
                <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                    <div className="absolute top-[10%] left-[20%] w-[50%] h-[50%] rounded-full blur-[150px]" style={{ background: `${studio.accentHex}08` }} />
                    <div className="absolute bottom-[20%] right-[10%] w-[40%] h-[40%] rounded-full blur-[120px]" style={{ background: `${studio.accentHex}05` }} />
                </div>

                {/* Nav */}
                <nav className="sticky top-0 z-50 w-full px-4 py-3 backdrop-blur-2xl bg-[#07070f]/80" aria-label="Studio navigation">
                    <header className="max-w-5xl mx-auto flex items-center justify-between px-6 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Link to="/" className="flex items-center gap-3" aria-label="Back to Mantram AI homepage">
                            <div className="size-9 rounded-xl overflow-hidden shadow-none">
                                <img src="/mantram-logo.png" alt="Mantram AI Logo" className="size-9" width="36" height="36" />
                            </div>
                            <h2 className="text-[var(--sys-text)] text-xl font-bold tracking-tight">Mantram <span className="text-primary">AI</span></h2>
                        </Link>
                        <div className="flex items-center gap-3">
                            <Link to="/" className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] text-sm font-medium transition-colors">← All Studios</Link>
                            <button onClick={() => document.getElementById('studio-cta')?.scrollIntoView({ behavior: 'smooth' })}
                                className="bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:from-[#FF4D00] hover:to-primary-light text-[var(--sys-text)] text-sm font-bold py-2.5 px-6 rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-none cursor-pointer"
                                aria-label="Scroll to early access signup">
                                Get Early Access
                            </button>
                        </div>
                    </header>
                </nav>

                <main className="relative z-10 flex-1" role="main">
                    {/* ── Hero Section ── */}
                    <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center" aria-labelledby="studio-title">
                        {/* Studio icon */}
                        <div className={`size-20 rounded-3xl bg-gradient-to-br ${studio.gradient} flex items-center justify-center mx-auto mb-8 shadow-2xl`}
                            style={{ boxShadow: `0 20px 60px ${studio.accentHex}30` }} role="img" aria-label={`${studio.name} icon`}>
                            <span className="material-symbols-outlined text-[var(--sys-text)] text-4xl" aria-hidden="true">{studio.icon}</span>
                        </div>

                        <p className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: studio.accentHex }}>{studio.tagline}</p>

                        <h1 id="studio-title" className="text-5xl md:text-6xl font-black text-[var(--sys-text)] mb-8 leading-tight max-w-3xl mx-auto">
                            {studio.name}
                        </h1>

                        <p className="text-xl md:text-2xl text-[var(--sys-text-muted)] max-w-2xl mx-auto leading-relaxed italic font-light">
                            "{studio.heroLine}"
                        </p>
                    </section>

                    {/* ── Capabilities Grid — Blurred Tease ── */}
                    <section className="max-w-4xl mx-auto px-6 py-16" aria-labelledby="capabilities-title">
                        <h2 id="capabilities-title" className="text-center text-2xl font-bold text-[var(--sys-text)] mb-10">What's Inside</h2>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 relative" role="list" aria-label={`${studio.name} capabilities`}>
                            {studio.capabilities.map((c, i) => (
                                <div key={i} className="rounded-2xl p-5 transition-all group" role="listitem"
                                    style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${studio.accentHex}15` }}>
                                    <span className="material-symbols-outlined text-2xl mb-3 block" style={{ color: studio.accentHex }} aria-hidden="true">{c.icon}</span>
                                    <p className="text-[var(--sys-text)] font-semibold text-sm">{c.label}</p>
                                </div>
                            ))}

                            {/* Blur overlay on bottom row */}
                            <div className="absolute bottom-0 left-0 right-0 h-28 bg-[var(--sys-surface)] border border-[var(--sys-border)] z-10 flex items-end justify-center pb-4">
                                <button onClick={() => document.getElementById('studio-cta')?.scrollIntoView({ behavior: 'smooth' })}
                                    className="text-sm font-bold px-6 py-2.5 rounded-full cursor-pointer transition-all hover:scale-105"
                                    style={{ background: `${studio.accentHex}15`, border: `1px solid ${studio.accentHex}30`, color: studio.accentHex }}
                                    aria-label="Unlock full access to all capabilities">
                                    <span className="material-symbols-outlined text-sm align-middle mr-1" aria-hidden="true">lock</span>
                                    Unlock Full Access
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* ── Teaser Quote ── */}
                    <section className="max-w-3xl mx-auto px-6 py-16 text-center" aria-label="Studio overview">
                        <div className="rounded-3xl p-8 md:p-12 relative overflow-hidden"
                            style={{ background: `var(--sys-primary)`, border: `1px solid ${studio.accentHex}15` }}>
                            <div className="absolute top-4 left-6 text-6xl font-serif opacity-10" style={{ color: studio.accentHex }} aria-hidden="true">"</div>
                            <p className="text-lg md:text-xl text-[var(--sys-text-muted)] leading-relaxed relative z-10 italic">
                                {studio.teaser}
                            </p>
                            <div className="mt-8 flex items-center justify-center gap-6">
                                <div className="text-center">
                                    <p className="text-3xl font-black text-[var(--sys-text)]">{studio.stat.value}</p>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--sys-text-muted)]">{studio.stat.label}</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ── CTA Section ── */}
                    <section id="studio-cta" className="max-w-2xl mx-auto px-6 py-20 text-center" aria-labelledby="cta-title">
                        <div className="rounded-3xl p-8 md:p-10"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div className={`size-14 rounded-2xl bg-gradient-to-br ${studio.gradient} flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                                <span className="material-symbols-outlined text-[var(--sys-text)] text-2xl" aria-hidden="true">{studio.icon}</span>
                            </div>

                            <h2 id="cta-title" className="text-3xl font-black text-[var(--sys-text)] mb-3">
                                Ready to try {studio.name}?
                            </h2>
                            <p className="text-[var(--sys-text-muted)] mb-8">
                                Join the waitlist to be among the first to experience the future of AI-powered marketing.
                            </p>

                            {!submitted ? (
                                <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto" aria-label="Early access waitlist signup">
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                        placeholder="Enter your email" required
                                        aria-label="Email address for early access"
                                        className="flex-1 px-5 py-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary focus:outline-none placeholder:text-[var(--sys-text-muted)]" />
                                    <button type="submit"
                                        className="bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:from-[#FF4D00] hover:to-primary-light text-[var(--sys-text)] font-bold py-3.5 px-7 rounded-xl transition-all transform hover:scale-105 active:scale-95 shadow-none cursor-pointer text-sm whitespace-nowrap">
                                        Get Access
                                    </button>
                                </form>
                            ) : (
                                <div className="rounded-xl p-5 flex items-center justify-center gap-3" role="alert" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                    <span className="material-symbols-outlined text-primary" aria-hidden="true">check_circle</span>
                                    <p className="text-[var(--sys-primary)] font-semibold">You're on the list! We'll notify you when {studio.name} is ready.</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── Other Studios ── */}
                    <section className="max-w-5xl mx-auto px-6 pb-20" aria-labelledby="other-studios-title">
                        <h3 id="other-studios-title" className="text-center text-lg font-bold text-[var(--sys-text-muted)] mb-8">Explore Other Studios</h3>
                        <nav className="flex flex-wrap justify-center gap-3" aria-label="Other Mantram AI studios">
                            {Object.entries(STUDIO_DATA).filter(([k]) => k !== slug).map(([k, s]) => (
                                <Link key={k} to={`/studio/${k}`}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:bg-[var(--sys-surface)] hover:scale-105"
                                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className="material-symbols-outlined text-base" style={{ color: s.accentHex }} aria-hidden="true">{s.icon}</span>
                                    <span className="text-[var(--sys-text-muted)] text-xs font-semibold">{s.name}</span>
                                </Link>
                            ))}
                        </nav>
                    </section>
                </main>

                {/* Footer */}
                <footer className="border-t border-[var(--sys-border)] py-8 text-center relative z-10" role="contentinfo">
                    <p className="text-[var(--sys-text-muted)] text-xs">© {new Date().getFullYear()} Mantram AI. All rights reserved.</p>
                </footer>
            </div>
        </>
    )
}


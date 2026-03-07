import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/* ────────────────────────────────────────────── */
/*  MANTRAM AI — PREMIUM LANDING PAGE            */
/* ────────────────────────────────────────────── */

export default function Landing() {
    const navigate = useNavigate()
    const { isAuthenticated } = useAuth()

    /* ── Early-access form state ── */
    const [showWaitlist, setShowWaitlist] = useState(false)
    const [waitlistType, setWaitlistType] = useState('individual') // 'individual' | 'enterprise'
    const [waitlistForm, setWaitlistForm] = useState({ name: '', email: '', company: '', role: '', phone: '', teamSize: '', message: '' })
    const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
    const [waitlistLoading, setWaitlistLoading] = useState(false)

    /* ── Hero carousel ── */
    const [heroSlide, setHeroSlide] = useState(0)
    const heroInterval = useRef(null)
    const heroSlides = [
        { type: 'gradient', gradient: 'from-violet-600/30 via-primary/20 to-cyan-600/30', icon: 'hub', label: 'Agentic AI Platform' },
        { type: 'gradient', gradient: 'from-rose-600/30 via-amber-500/20 to-emerald-600/30', icon: 'auto_awesome', label: 'AI-Powered Content' },
        { type: 'gradient', gradient: 'from-cyan-600/30 via-blue-500/20 to-violet-600/30', icon: 'smart_display', label: 'Multi-Model Video' },
    ]
    useEffect(() => {
        heroInterval.current = setInterval(() => setHeroSlide(p => (p + 1) % heroSlides.length), 5000)
        return () => clearInterval(heroInterval.current)
    }, [])

    /* ── Nav scroll effect ── */
    const [scrolled, setScrolled] = useState(false)
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 30)
        window.addEventListener('scroll', onScroll)
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    /* ── Waitlist submit ── */
    const handleWaitlistSubmit = async (e) => {
        e.preventDefault()
        setWaitlistLoading(true)
        // simulate API call (replace with real endpoint later)
        await new Promise(r => setTimeout(r, 1500))
        setWaitlistSubmitted(true)
        setWaitlistLoading(false)
    }

    const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

    /* ── Studios data ── */
    const studios = [
        { icon: 'draw', name: 'Content Studio', desc: 'AI-generated blog posts, social captions, ad copy & emails — perfectly aligned to your brand voice.', color: 'from-violet-500 to-purple-600', tag: 'Writing' },
        { icon: 'auto_fix_high', name: 'Creative Studio', desc: 'Design social posts, stories, ads, banners & AI photoshoots with one-click brand consistency.', color: 'from-pink-500 to-rose-600', tag: 'Design' },
        { icon: 'smart_display', name: 'Video Studio', desc: 'Multi-model video generation — Seedance, Kling, Veo 2 — from brief to cinematic final cut.', color: 'from-amber-500 to-orange-600', tag: 'Video' },
        { icon: 'campaign', name: 'Performance Studio', desc: 'AI ad strategist that researches competitors, plans budgets & generates Meta/Google ad campaigns.', color: 'from-emerald-500 to-teal-600', tag: 'Ads' },
        { icon: 'query_stats', name: 'SEO Studio', desc: 'AI-powered keyword research, site audits, content gap analysis & competitive intelligence.', color: 'from-blue-500 to-indigo-600', tag: 'SEO' },
        { icon: 'storefront', name: 'D2C Studio', desc: 'Shopify Intelligence Hub — product velocity, abandonment signals & AI-powered e-commerce insights.', color: 'from-cyan-500 to-sky-600', tag: 'Commerce' },
        { icon: 'forum', name: 'Conversation Studio', desc: 'AI auto-responder for Instagram & Facebook DMs — route leads, answer FAQs, never miss a message.', color: 'from-fuchsia-500 to-pink-600', tag: 'DMs' },
        { icon: 'lightbulb', name: 'Brainstorm Studio', desc: 'AI creative director — generate campaign ideas, ad films, mood boards & content calendars.', color: 'from-yellow-500 to-amber-600', tag: 'Ideas' },
        { icon: 'calendar_month', name: 'Smart Calendar', desc: 'Marketing intelligence calendar — trending moments, festivals & AI-suggested content dates.', color: 'from-teal-500 to-emerald-600', tag: 'Planning' },
        { icon: 'analytics', name: 'Analytics', desc: 'Traffic intelligence, audience insights, Google Analytics integration & AI-powered growth strategies.', color: 'from-indigo-500 to-violet-600', tag: 'Insights' },
    ]

    const usps = [
        { icon: 'hub', title: 'Agentic AI Architecture', desc: 'Not prompts — entire AI agent teams. Each studio runs a chain of specialized agents (Researcher, Strategist, Creator) that collaborate like a real marketing team.', gradient: 'from-violet-500/20 to-purple-500/20', iconColor: 'text-violet-400' },
        { icon: 'genetics', title: 'Brand DNA Engine', desc: 'Scan any website in 60 seconds. AI extracts logo, colors, fonts, voice, tone & visual identity — then uses it across every piece of content you create.', gradient: 'from-primary/20 to-blue-500/20', iconColor: 'text-primary' },
        { icon: 'auto_awesome', title: 'Multi-Model Intelligence', desc: 'Access Gemini, Claude, GPT-4o, Grok & Imagen in one platform. Each task routes to the best model — no lock-in, maximum quality.', gradient: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-400' },
        { icon: 'trending_up', title: 'Real-Time Trending', desc: 'Google Trends + Grok-powered intelligence feeds every studio with what\'s trending NOW — so your content is always relevant.', gradient: 'from-emerald-500/20 to-teal-500/20', iconColor: 'text-emerald-400' },
        { icon: 'groups', title: 'Team Collaboration', desc: 'Multi-user workspaces, approval workflows, brand-level permissions & team chat — built for marketing teams, not solo users.', gradient: 'from-cyan-500/20 to-sky-500/20', iconColor: 'text-cyan-400' },
        { icon: 'lock', title: 'Enterprise-Ready', desc: 'SOC 2 compliance, SSO, dedicated support, white-labeling & custom integrations. Scale from startup to enterprise.', gradient: 'from-rose-500/20 to-pink-500/20', iconColor: 'text-rose-400' },
    ]

    return (
        <div className="relative min-h-screen w-full flex flex-col overflow-x-hidden" style={{ background: '#07070f' }}>
            {/* Ambient background */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute -top-[30%] -left-[15%] w-[70%] h-[70%] bg-violet-600/[0.07] rounded-full blur-[150px]" />
                <div className="absolute top-[30%] -right-[15%] w-[60%] h-[60%] bg-primary/[0.06] rounded-full blur-[150px]" />
                <div className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] bg-cyan-600/[0.04] rounded-full blur-[120px]" />
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/*  NAVBAR                                                */}
            {/* ═══════════════════════════════════════════════════════ */}
            <nav className={`sticky top-0 z-50 w-full px-4 py-3 transition-all duration-500 ${scrolled ? 'backdrop-blur-2xl bg-[#07070f]/80' : ''}`}>
                <header className="max-w-7xl mx-auto flex items-center justify-between px-6 py-2.5 rounded-2xl" style={scrolled ? { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' } : {}}>
                    <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl overflow-hidden shadow-lg shadow-primary/20">
                            <img src="/mantram-logo.png" alt="Mantram AI" className="size-9" />
                        </div>
                        <h2 className="text-white text-xl font-bold tracking-tight">Mantram <span className="text-primary">AI</span></h2>
                    </div>
                    <div className="hidden md:flex items-center gap-8">
                        <button onClick={() => scrollTo('studios')} className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Studios</button>
                        <button onClick={() => scrollTo('usps')} className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Why Mantram</button>
                        <button onClick={() => scrollTo('how-it-works')} className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">How It Works</button>
                        <button onClick={() => scrollTo('early-access')} className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Early Access</button>
                    </div>
                    <div className="flex items-center gap-3">
                        {isAuthenticated ? (
                            <Link to="/dashboard" className="hidden sm:block text-slate-300 text-sm font-medium px-4 hover:text-white transition-colors">Dashboard</Link>
                        ) : (
                            <Link to="/auth" className="hidden sm:block text-slate-300 text-sm font-medium px-4 hover:text-white transition-colors">Login</Link>
                        )}
                        <button onClick={() => { setShowWaitlist(true); setTimeout(() => scrollTo('early-access'), 100) }}
                            className="bg-gradient-to-r from-violet-600 to-primary hover:from-violet-500 hover:to-primary-light text-white text-sm font-bold py-2.5 px-6 rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-violet-500/20 cursor-pointer">
                            Get Early Access
                        </button>
                    </div>
                </header>
            </nav>

            {/* ═══════════════════════════════════════════════════════ */}
            {/*  HERO SECTION                                          */}
            {/* ═══════════════════════════════════════════════════════ */}
            <main className="relative z-10 flex-shrink-0">
                <section className="max-w-7xl mx-auto px-6 pt-16 pb-24">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        {/* Left: Copy */}
                        <div className="space-y-8">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
                                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                                </span>
                                Now Accepting Early Access
                            </div>

                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight">
                                Your entire<br />
                                marketing team,<br />
                                <span className="bg-gradient-to-r from-violet-400 via-primary to-cyan-400 bg-clip-text text-transparent">powered by AI.</span>
                            </h1>

                            <p className="text-slate-400 text-lg md:text-xl max-w-lg leading-relaxed">
                                10 AI studios. One platform. From brand DNA extraction to content creation, video production, ad optimization & e-commerce intelligence — Mantram AI is your full-stack marketing operating system.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <button onClick={() => { setShowWaitlist(true); setTimeout(() => scrollTo('early-access'), 100) }}
                                    className="bg-gradient-to-r from-violet-600 to-primary hover:from-violet-500 hover:to-primary-light text-white font-bold py-4 px-8 rounded-2xl transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-violet-500/20 text-lg flex items-center justify-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined">rocket_launch</span>
                                    Join the Waitlist
                                </button>
                                <button onClick={() => scrollTo('studios')}
                                    className="py-4 px-8 rounded-2xl text-lg font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all hover:bg-white/[0.05]"
                                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <span className="material-symbols-outlined">play_circle</span>
                                    Explore Studios
                                </button>
                            </div>

                            {/* Trust strip */}
                            <div className="flex items-center gap-6 pt-4">
                                {[
                                    { icon: 'verified_user', text: 'Enterprise Secure' },
                                    { icon: 'memory', text: '10 AI Studios' },
                                    { icon: 'speed', text: 'Real-Time Intelligence' },
                                ].map((b, i) => (
                                    <div key={i} className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                                        <span className="material-symbols-outlined text-sm">{b.icon}</span>{b.text}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Hero Media Carousel */}
                        <div className="relative">
                            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                {/* Carousel slides */}
                                {heroSlides.map((slide, idx) => (
                                    <div key={idx} className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ${heroSlide === idx ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                                        <div className={`absolute inset-0 bg-gradient-to-br ${slide.gradient}`} />
                                        <div className="relative z-10 text-center">
                                            <span className="material-symbols-outlined text-white/20" style={{ fontSize: '120px' }}>{slide.icon}</span>
                                            <p className="text-white/40 text-sm font-bold uppercase tracking-widest mt-4">{slide.label}</p>
                                            <p className="text-white/20 text-xs mt-2">Replace with your hero image, video, or carousel media</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Slide indicators */}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                                    {heroSlides.map((_, idx) => (
                                        <button key={idx} onClick={() => { setHeroSlide(idx); clearInterval(heroInterval.current); heroInterval.current = setInterval(() => setHeroSlide(p => (p + 1) % heroSlides.length), 5000) }}
                                            className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${heroSlide === idx ? 'w-8 bg-violet-400' : 'w-3 bg-white/20 hover:bg-white/30'}`} />
                                    ))}
                                </div>
                            </div>

                            {/* Floating feature cards */}
                            <div className="absolute -bottom-6 -left-6 px-4 py-3 rounded-2xl backdrop-blur-xl shadow-2xl animate-float" style={{ background: 'rgba(15,15,30,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-violet-400">genetics</span>
                                    </div>
                                    <div>
                                        <p className="text-white text-sm font-bold">Brand DNA</p>
                                        <p className="text-slate-500 text-[10px]">60-second website scan</p>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute -top-4 -right-4 px-4 py-3 rounded-2xl backdrop-blur-xl shadow-2xl" style={{ background: 'rgba(15,15,30,0.85)', border: '1px solid rgba(255,255,255,0.08)', animation: 'float 3s ease-in-out 1s infinite' }}>
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-emerald-400">trending_up</span>
                                    </div>
                                    <div>
                                        <p className="text-white text-sm font-bold">Live Trends</p>
                                        <p className="text-slate-500 text-[10px]">Grok-powered intelligence</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  STATS STRIP                                           */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section className="border-y border-white/[0.04] py-10" style={{ background: 'rgba(255,255,255,0.01)' }}>
                    <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
                        {[
                            { value: '10+', label: 'AI Studios', icon: 'dashboard' },
                            { value: '6+', label: 'AI Models', icon: 'psychology' },
                            { value: '50+', label: 'Content Types', icon: 'article' },
                            { value: '∞', label: 'Possibilities', icon: 'all_inclusive' },
                        ].map((s, i) => (
                            <div key={i} className="text-center group">
                                <span className="material-symbols-outlined text-white/10 text-3xl mb-2 block group-hover:text-primary/30 transition-colors">{s.icon}</span>
                                <p className="text-4xl font-black text-white mb-1">{s.value}</p>
                                <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">{s.label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  STUDIOS SHOWCASE                                      */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section id="studios" className="max-w-7xl mx-auto px-6 py-24">
                    <div className="text-center mb-16">
                        <p className="text-primary text-sm font-bold uppercase tracking-widest mb-3">The Studio Ecosystem</p>
                        <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                            10 Studios. <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">One Platform.</span>
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">Every marketing function — content, design, video, ads, SEO, e-commerce, conversations — powered by specialized AI agent teams.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {studios.map((s, i) => (
                            <div key={i} className="group relative rounded-2xl p-6 transition-all duration-300 hover:translate-y-[-4px] cursor-default"
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}>
                                <div className="flex items-start gap-4">
                                    <div className={`size-12 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform`}>
                                        <span className="material-symbols-outlined text-white text-2xl">{s.icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <h3 className="text-white font-bold text-lg">{s.name}</h3>
                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-500">{s.tag}</span>
                                        </div>
                                        <p className="text-slate-400 text-sm leading-relaxed">{s.desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  PLATFORM USPs                                         */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section id="usps" className="py-24" style={{ background: 'rgba(255,255,255,0.01)' }}>
                    <div className="max-w-7xl mx-auto px-6">
                        <div className="text-center mb-16">
                            <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest mb-3">Why Mantram AI</p>
                            <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                                Not another AI tool.<br /><span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">A marketing operating system.</span>
                            </h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {usps.map((u, i) => (
                                <div key={i} className="rounded-2xl p-7 transition-all duration-300 hover:translate-y-[-2px]"
                                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div className={`size-14 rounded-2xl bg-gradient-to-br ${u.gradient} flex items-center justify-center mb-5`}
                                        style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span className={`material-symbols-outlined text-3xl ${u.iconColor}`}>{u.icon}</span>
                                    </div>
                                    <h3 className="text-white font-bold text-xl mb-3">{u.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{u.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  HOW IT WORKS                                          */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-24">
                    <div className="text-center mb-16">
                        <p className="text-amber-400 text-sm font-bold uppercase tracking-widest mb-3">Getting Started</p>
                        <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                            Three steps to <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">marketing magic.</span>
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { step: '01', icon: 'language', title: 'Scan Your Brand', desc: 'Paste your website URL. Our AI scans every page to extract your brand DNA — logo, colors, fonts, voice, tone & visual identity. Takes 60 seconds.', gradient: 'from-violet-500 to-purple-600' },
                            { step: '02', icon: 'hub', title: 'Explore Studios', desc: 'Access 10 AI studios — each with specialized agent teams. Generate content, design creatives, produce videos, plan ads, optimize SEO & more.', gradient: 'from-primary to-blue-600' },
                            { step: '03', icon: 'rocket_launch', title: 'Publish & Scale', desc: 'Connect your social accounts, Shopify store & ad platforms. Publish directly, schedule content & let AI optimize your campaigns in real-time.', gradient: 'from-cyan-500 to-teal-600' },
                        ].map((s, i) => (
                            <div key={i} className="relative rounded-2xl p-8 transition-all duration-300 group"
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div className="text-7xl font-black text-white/[0.04] absolute top-4 right-6">{s.step}</div>
                                <div className={`size-14 rounded-2xl bg-gradient-to-br ${s.gradient} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                                    <span className="material-symbols-outlined text-white text-3xl">{s.icon}</span>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
                                <p className="text-slate-400 leading-relaxed">{s.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  EARLY ACCESS WAITLIST                                 */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section id="early-access" className="py-24" style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.03) 0%, rgba(43,75,238,0.05) 50%, rgba(6,182,212,0.03) 100%)' }}>
                    <div className="max-w-4xl mx-auto px-6">
                        <div className="text-center mb-12">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
                                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                                </span>
                                Limited Spots Available
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                                Get <span className="bg-gradient-to-r from-violet-400 via-primary to-cyan-400 bg-clip-text text-transparent">early access.</span>
                            </h2>
                            <p className="text-slate-400 text-lg max-w-xl mx-auto">
                                Join the waitlist for exclusive early access. Be among the first to experience the future of AI-powered marketing.
                            </p>
                        </div>

                        {!waitlistSubmitted ? (
                            <div className="rounded-3xl p-8 md:p-10" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                {/* Individual / Enterprise toggle */}
                                <div className="flex justify-center mb-8">
                                    <div className="flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        {[
                                            { id: 'individual', icon: 'person', label: 'Individual / Freelancer' },
                                            { id: 'enterprise', icon: 'business', label: 'Enterprise / Agency' },
                                        ].map(t => (
                                            <button key={t.id} onClick={() => setWaitlistType(t.id)}
                                                className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${waitlistType === t.id
                                                    ? 'bg-gradient-to-r from-violet-600 to-primary text-white shadow-lg shadow-violet-500/20'
                                                    : 'text-slate-500 hover:text-white'}`}>
                                                <span className="material-symbols-outlined text-base">{t.icon}</span>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <form onSubmit={handleWaitlistSubmit} className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">Full Name *</label>
                                            <input type="text" required value={waitlistForm.name} onChange={e => setWaitlistForm(p => ({ ...p, name: e.target.value }))}
                                                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all"
                                                placeholder="John Doe" />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">Email *</label>
                                            <input type="email" required value={waitlistForm.email} onChange={e => setWaitlistForm(p => ({ ...p, email: e.target.value }))}
                                                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all"
                                                placeholder="john@company.com" />
                                        </div>
                                    </div>

                                    {waitlistType === 'enterprise' && (
                                        <>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div>
                                                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">Company Name *</label>
                                                    <input type="text" required value={waitlistForm.company} onChange={e => setWaitlistForm(p => ({ ...p, company: e.target.value }))}
                                                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all"
                                                        placeholder="Acme Inc." />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">Your Role</label>
                                                    <select value={waitlistForm.role} onChange={e => setWaitlistForm(p => ({ ...p, role: e.target.value }))}
                                                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all cursor-pointer appearance-none">
                                                        <option value="" className="bg-[#12122a]">Select role</option>
                                                        <option value="founder" className="bg-[#12122a]">Founder / CEO</option>
                                                        <option value="cmo" className="bg-[#12122a]">CMO / Marketing Head</option>
                                                        <option value="manager" className="bg-[#12122a]">Marketing Manager</option>
                                                        <option value="agency" className="bg-[#12122a]">Agency Owner</option>
                                                        <option value="other" className="bg-[#12122a]">Other</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                <div>
                                                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">Phone</label>
                                                    <input type="tel" value={waitlistForm.phone} onChange={e => setWaitlistForm(p => ({ ...p, phone: e.target.value }))}
                                                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all"
                                                        placeholder="+91 98765 43210" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">Team Size</label>
                                                    <select value={waitlistForm.teamSize} onChange={e => setWaitlistForm(p => ({ ...p, teamSize: e.target.value }))}
                                                        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all cursor-pointer appearance-none">
                                                        <option value="" className="bg-[#12122a]">Select size</option>
                                                        <option value="1-5" className="bg-[#12122a]">1 – 5 people</option>
                                                        <option value="6-20" className="bg-[#12122a]">6 – 20 people</option>
                                                        <option value="21-50" className="bg-[#12122a]">21 – 50 people</option>
                                                        <option value="50+" className="bg-[#12122a]">50+ people</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <div>
                                        <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5 block">
                                            {waitlistType === 'enterprise' ? 'What are you looking for?' : 'Tell us about your brand (optional)'}
                                        </label>
                                        <textarea value={waitlistForm.message} onChange={e => setWaitlistForm(p => ({ ...p, message: e.target.value }))}
                                            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 focus:ring-2 focus:ring-violet-500/10 transition-all resize-none"
                                            rows={3}
                                            placeholder={waitlistType === 'enterprise' ? 'Custom integrations, white-labeling, team requirements...' : 'Your website URL, industry, or what you would like to achieve...'} />
                                    </div>

                                    <button type="submit" disabled={waitlistLoading}
                                        className="w-full bg-gradient-to-r from-violet-600 to-primary hover:from-violet-500 hover:to-primary-light text-white font-bold py-4 rounded-xl text-lg transition-all transform hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-violet-500/20 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                        {waitlistLoading ? (
                                            <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> Submitting...</>
                                        ) : (
                                            <><span className="material-symbols-outlined text-lg">rocket_launch</span> Request Early Access</>
                                        )}
                                    </button>

                                    <p className="text-center text-slate-600 text-xs">No credit card required. We'll reach out when your spot opens up.</p>
                                </form>
                            </div>
                        ) : (
                            /* ── Success state ── */
                            <div className="rounded-3xl p-12 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="size-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-6">
                                    <span className="material-symbols-outlined text-emerald-400 text-5xl">check_circle</span>
                                </div>
                                <h3 className="text-3xl font-black text-white mb-3">You're on the list! 🚀</h3>
                                <p className="text-slate-400 text-lg max-w-md mx-auto mb-6">
                                    We've received your request. You'll be among the first to get access when we launch. Keep an eye on your inbox.
                                </p>
                                <div className="flex justify-center gap-4">
                                    <button onClick={() => { setWaitlistSubmitted(false); setWaitlistForm({ name: '', email: '', company: '', role: '', phone: '', teamSize: '', message: '' }) }}
                                        className="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                                        Submit Another
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {/* ═══════════════════════════════════════════════════════ */}
            {/*  FOOTER                                                */}
            {/* ═══════════════════════════════════════════════════════ */}
            <footer className="relative z-10 w-full border-t border-white/[0.04] py-16 px-6 mt-auto">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                        <div className="md:col-span-2">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="size-8 rounded-lg overflow-hidden">
                                    <img src="/mantram-logo.png" alt="Mantram AI" className="size-8" />
                                </div>
                                <span className="text-white text-xl font-bold">Mantram <span className="text-primary">AI</span></span>
                            </div>
                            <p className="text-slate-500 text-sm max-w-sm leading-relaxed mb-6">
                                The AI-powered marketing operating system. 10 studios, infinite possibilities. From brand DNA to published content in minutes.
                            </p>
                            <div className="flex gap-3">
                                {['share', 'mail', 'code'].map((icon, i) => (
                                    <a key={i} className="size-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-all cursor-pointer" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span className="material-symbols-outlined text-lg">{icon}</span>
                                    </a>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Platform</h4>
                            <ul className="space-y-3">
                                {['Studios', 'Brand DNA', 'Team Dashboard', 'Integrations', 'Analytics'].map(item => (
                                    <li key={item}><a className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">{item}</a></li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Company</h4>
                            <ul className="space-y-3">
                                {['Privacy Policy', 'Terms of Service', 'Security', 'API Docs', 'Contact'].map(item => (
                                    <li key={item}><a className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">{item}</a></li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-white/[0.04] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-slate-600 text-xs">© {new Date().getFullYear()} Mantram AI. All rights reserved.</p>
                        <p className="text-slate-700 text-xs">Built with ❤️ for marketers, by marketers.</p>
                    </div>
                </div>
            </footer>

            {/* Inline CSS for animations */}
            <style>{`
                @keyframes float { 0%, 100% { transform: translateY(0px) } 50% { transform: translateY(-10px) } }
                .animate-float { animation: float 3s ease-in-out infinite }
            `}</style>
        </div>
    )
}

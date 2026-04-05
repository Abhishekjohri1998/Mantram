import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'

/* ──────────────────────────────────────────────────────── */
/*  MANTRAM AI — PREMIUM IMMERSIVE ABOUT PAGE              */
/* ──────────────────────────────────────────────────────── */

export default function About() {
    const [scrolled, setScrolled] = useState(false)
    const [visibleSections, setVisibleSections] = useState(new Set())
    const sectionRefs = useRef({})

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 30)
        window.addEventListener('scroll', onScroll)
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    /* ── Intersection Observer for scroll-reveal ── */
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        setVisibleSections(prev => new Set([...prev, entry.target.dataset.section]))
                    }
                })
            },
            { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
        )
        Object.values(sectionRefs.current).forEach(el => el && observer.observe(el))
        return () => observer.disconnect()
    }, [])

    const isVisible = (id) => visibleSections.has(id)
    const assignRef = (id) => (el) => { if (el) { el.dataset.section = id; sectionRefs.current[id] = el } }

    /* ── Brand logos the founders worked with ── */
    const brandLogos = ['Starbucks', 'Reliance Life Insurance', 'Future Group', 'Zee', 'SaReGaMa']
    const orgPartners = ['Zee TV', 'Zee5', 'Cinevistas', 'Mirum', 'EPAM', 'ACwO', 'Mobilla', 'Big Trunk', 'Opportune']

    return (
        <div className="min-h-screen bg-[#08080c] text-white overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
            <SEOHead
                title="About Mantram AI — The Operating System for Modern Brands"
                description="Mantram AI is an AI-powered Brand Operating System. 8 AI Studios, 20+ models, built by founders with 18+ years of branding experience."
                canonical="/about"
                ogTitle="About Mantram AI"
                ogDescription="The Operating System for Modern Brands — where human creativity meets intelligent systems."
                jsonLd={{
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "Organization",
                            "@id": "https://mantram.ai/#organization",
                            "name": "Mantram AI",
                            "url": "https://mantram.ai",
                            "logo": "https://mantram.ai/vite.svg",
                            "description": "Mantram AI is an AI-powered Brand Operating System featuring 8 interconnected AI Studios.",
                            "founders": [
                                {
                                    "@type": "Person",
                                    "name": "Arjun Kumar"
                                },
                                {
                                    "@type": "Person",
                                    "name": "Abhishek Johri"
                                }
                            ]
                        },
                        {
                            "@type": "AboutPage",
                            "@id": "https://mantram.ai/about/#webpage",
                            "url": "https://mantram.ai/about",
                            "name": "About Mantram AI — The Operating System for Modern Brands",
                            "isPartOf": {
                                "@id": "https://mantram.ai/#website"
                            },
                            "about": {
                                "@id": "https://mantram.ai/#organization"
                            }
                        }
                    ]
                }}
            />

            {/* ── Ambient Background ── */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, #2b4bee 0%, transparent 70%)' }} />
                <div className="absolute bottom-1/4 right-1/5 w-[500px] h-[500px] rounded-full opacity-[0.02]" style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }} />
                <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] rounded-full opacity-[0.015] -translate-x-1/2 -translate-y-1/2" style={{ background: 'radial-gradient(circle, #2b4bee 0%, transparent 60%)' }} />
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  NAV BAR                                                  */}
            {/* ══════════════════════════════════════════════════════════ */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#08080c]/90 backdrop-blur-xl border-b border-[#48474c]/20 shadow-2xl' : ''}`}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-3 group">
                        <img src="/mantram-logo.png" alt="Mantram AI" className="h-8 w-8 group-hover:scale-110 transition-transform" onError={(e) => e.target.style.display = 'none'} />
                        <span className="text-lg font-bold tracking-tight">Mantram <span className="text-[#ff4d00]">AI</span></span>
                    </Link>
                    <div className="flex items-center gap-6">
                        <Link to="/" className="text-sm text-[#acaab0] hover:text-white transition-colors">Home</Link>
                        <Link to="/auth" className="text-sm text-[#acaab0] hover:text-white transition-colors">Login</Link>
                        <Link to="/auth" className="px-5 py-2.5 text-sm font-semibold rounded-full bg-gradient-to-r from-[#ff4d00] to-[#ff7a00] hover:shadow-lg hover:shadow-[#ff4d00]/25 transition-all hover:-translate-y-0.5">Get Started</Link>
                    </div>
                </div>
            </nav>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  HERO — CINEMATIC OPENING                                */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative pt-40 pb-28 px-6" ref={assignRef('hero')}>
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-[#48474c]/30 mb-8 abt-fade-up" style={{ animationDelay: '0.1s' }}>
                        <span className="w-2 h-2 rounded-full bg-[#4d6bff] animate-pulse" />
                        <span className="text-xs font-medium text-[#acaab0] tracking-widest uppercase">About Mantram AI</span>
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-8 abt-fade-up" style={{ animationDelay: '0.3s' }}>
                        The Operating System<br />for{' '}
                        <span className="bg-gradient-to-r from-[#4d6bff] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">Modern Brands</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-[#acaab0] max-w-2xl mx-auto leading-relaxed abt-fade-up" style={{ animationDelay: '0.5s' }}>
                        Mantram AI was built on a simple belief: <strong className="text-white">Great brands aren't limited by creativity — they're limited by systems.</strong>
                    </p>
                </div>

                {/* Decorative orbital rings */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                    <div className="w-[700px] h-[700px] rounded-full border border-white/[0.02] abt-spin-slow" />
                    <div className="absolute w-[500px] h-[500px] rounded-full border border-white/[0.03] abt-spin-slow-reverse" />
                    <div className="absolute w-[300px] h-[300px] rounded-full border border-[#4d6bff]/[0.04]" />
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  THE PROBLEM — FRAGMENTED MARKETING                     */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-28 px-6" ref={assignRef('problem')}>
                <div className="max-w-5xl mx-auto">
                    <div className={`grid md:grid-cols-2 gap-16 items-center transition-all duration-1000 ${isVisible('problem') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <div>
                            <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#f43f5e] mb-4 block">The Problem</span>
                            <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-6">
                                Marketing is <span className="text-[#f43f5e]">fragmented</span>
                            </h2>
                            <div className="space-y-4 text-[#acaab0] text-lg leading-relaxed">
                                <p>Teams juggle multiple tools, repeat workflows, and struggle to maintain consistency.</p>
                                <p><span className="text-gray-200 font-medium">Content feels disconnected.</span><br />Design lacks cohesion.<br />AI outputs lack brand understanding.</p>
                                <div className="pt-4 border-t border-[#48474c]/30">
                                    <p className="text-white font-semibold text-xl">The problem isn't effort.<br />The problem is the absence of a unified, intelligent system.</p>
                                </div>
                            </div>
                        </div>
                        {/* Pain points visual */}
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { icon: '🔌', label: 'Disconnected tools', sublabel: '10+ platforms' },
                                { icon: '🔁', label: 'Repetitive workflows', sublabel: 'Wasted hours' },
                                { icon: '🎨', label: 'Inconsistent branding', sublabel: 'Off-brand outputs' },
                                { icon: '🤖', label: 'AI without context', sublabel: 'Generic results' },
                            ].map((p, i) => (
                                <div key={i} className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-[#f43f5e]/20 transition-all duration-500 group" style={{ transitionDelay: `${i * 100}ms` }}>
                                    <div className="text-2xl mb-3">{p.icon}</div>
                                    <div className="text-sm font-semibold text-gray-200">{p.label}</div>
                                    <div className="text-xs text-gray-500 mt-1">{p.sublabel}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Transition statement */}
                    <div className={`mt-20 text-center transition-all duration-1000 delay-300 ${isVisible('problem') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <p className="text-2xl md:text-3xl font-bold">
                            That's where{' '}
                            <span className="bg-gradient-to-r from-[#4d6bff] to-[#8b5cf6] bg-clip-text text-transparent">Mantram</span>{' '}
                            comes in.
                        </p>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  WHAT IS MANTRAM — BRAND OS                              */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-28 px-6" ref={assignRef('what')}>
                <div className="max-w-5xl mx-auto">
                    <div className={`text-center mb-16 transition-all duration-1000 ${isVisible('what') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#ff4d00] mb-4 block">What is Mantram AI?</span>
                        <h2 className="text-3xl md:text-5xl font-black leading-tight mb-6">
                            An AI-Powered<br />
                            <span className="bg-gradient-to-r from-[#4d6bff] via-[#8b5cf6] to-[#10b981] bg-clip-text text-transparent">Brand Operating System</span>
                        </h2>
                        <p className="text-xl text-[#acaab0] max-w-3xl mx-auto leading-relaxed">
                            Mantram replaces your fragmented marketing stack with one unified platform. From content and design to ads, analytics, and automation — everything works together through a shared intelligence layer called <strong className="text-white">Brand DNA</strong>.
                        </p>
                    </div>

                    {/* Three pillars */}
                    <div className={`grid md:grid-cols-3 gap-6 transition-all duration-1000 delay-200 ${isVisible('what') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        {[
                            { icon: '🧬', title: 'No repeated brand inputs', desc: 'Brand DNA captures your identity once — every studio uses it automatically.', color: '#4d6bff' },
                            { icon: '✦', title: 'No off-brand outputs', desc: 'Every piece of content, design, and ad is aligned to your brand voice and style.', color: '#8b5cf6' },
                            { icon: '⚡', title: 'No disconnected workflows', desc: 'One system. All studios connected. Insights flow between them.', color: '#10b981' },
                        ].map((item, i) => (
                            <div key={i} className="relative p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden group hover:border-opacity-20 transition-all duration-500" style={{ '--accent': item.color }}>
                                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent" style={{ background: `linear-gradient(90deg, transparent, ${item.color}40, transparent)` }} />
                                <div className="text-3xl mb-4">{item.icon}</div>
                                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                                <p className="text-[#acaab0] text-sm leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* One-liner */}
                    <div className={`mt-16 text-center transition-all duration-1000 delay-500 ${isVisible('what') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <div className="inline-block px-8 py-5 rounded-2xl bg-gradient-to-r from-[#4d6bff]/10 to-[#8b5cf6]/10 border border-[#4d6bff]/15">
                            <p className="text-lg font-semibold text-gray-200">Just one system that <span className="text-[#ff4d00]">understands</span> and <span className="text-[#8b5cf6]">grows</span> with your brand.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  OUR PURPOSE                                              */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-28 px-6" ref={assignRef('purpose')}>
                <div className="max-w-5xl mx-auto">
                    <div className={`text-center mb-16 transition-all duration-1000 ${isVisible('purpose') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#f59e0b] mb-4 block">Our Purpose</span>
                        <h2 className="text-3xl md:text-4xl font-black leading-tight mb-6 max-w-3xl mx-auto">
                            To empower <span className="text-[#f59e0b]">anyone and everyone</span> in branding and marketing to overcome their weaknesses, unlock their creative potential, and take their brand to the next level.
                        </h2>
                    </div>

                    {/* Audience cards */}
                    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 transition-all duration-1000 delay-200 ${isVisible('purpose') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        {[
                            { icon: '🚀', label: 'Founders', desc: 'Building with limited resources' },
                            { icon: '📊', label: 'Marketing Teams', desc: 'Scaling execution' },
                            { icon: '🏢', label: 'Agencies', desc: 'Managing multiple brands' },
                            { icon: '🛍️', label: 'D2C Businesses', desc: 'Driving growth' },
                        ].map((a, i) => (
                            <div key={i} className="text-center p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all duration-500 group">
                                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{a.icon}</div>
                                <div className="font-bold text-sm mb-1">{a.label}</div>
                                <div className="text-xs text-gray-500">{a.desc}</div>
                            </div>
                        ))}
                    </div>

                    <p className={`text-center text-lg text-[#acaab0] mt-10 transition-all duration-1000 delay-400 ${isVisible('purpose') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        We simplify complexity so you can focus on what matters — <strong className="text-white">building your brand.</strong>
                    </p>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  HUMAN + AI CO-CREATION                                   */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-28 px-6" ref={assignRef('cocreation')}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0c0e1a] to-transparent pointer-events-none" />
                <div className="max-w-5xl mx-auto relative z-10">
                    <div className={`grid md:grid-cols-2 gap-16 items-center transition-all duration-1000 ${isVisible('cocreation') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        {/* Visual */}
                        <div className="relative flex items-center justify-center">
                            <div className="relative w-72 h-72">
                                {/* Outer ring */}
                                <div className="absolute inset-0 rounded-full border border-[#8b5cf6]/10 abt-spin-slow" />
                                <div className="absolute inset-4 rounded-full border border-[#4d6bff]/15 abt-spin-slow-reverse" />
                                <div className="absolute inset-8 rounded-full border border-[#10b981]/10 abt-spin-slow" style={{ animationDuration: '25s' }} />
                                {/* Center */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#4d6bff]/15 to-[#8b5cf6]/15 flex items-center justify-center border border-[#4d6bff]/20">
                                        <span className="text-3xl">🤝</span>
                                    </div>
                                </div>
                                {/* Orbiting dots */}
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 abt-spin-slow" style={{ transformOrigin: '0 142px' }}>
                                    <div className="w-8 h-8 rounded-full bg-[#4d6bff]/20 flex items-center justify-center text-sm abt-spin-slow-reverse">🧠</div>
                                </div>
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 abt-spin-slow-reverse" style={{ transformOrigin: '0 -130px', animationDelay: '3s' }}>
                                    <div className="w-8 h-8 rounded-full bg-[#8b5cf6]/20 flex items-center justify-center text-sm abt-spin-slow">⚡</div>
                                </div>
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 abt-spin-slow" style={{ transformOrigin: '-128px 0', animationDelay: '6s' }}>
                                    <div className="w-8 h-8 rounded-full bg-[#10b981]/20 flex items-center justify-center text-sm abt-spin-slow-reverse">✦</div>
                                </div>
                            </div>
                        </div>

                        <div>
                            <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#8b5cf6] mb-4 block">Philosophy</span>
                            <h2 className="text-3xl md:text-4xl font-black leading-tight mb-6">
                                Built for <span className="bg-gradient-to-r from-[#4d6bff] to-[#8b5cf6] bg-clip-text text-transparent">Human + AI</span> Co-Creation
                            </h2>
                            <p className="text-lg text-[#acaab0] mb-8">Most platforms treat AI as a feature. Mantram is built on a different foundation: <strong className="text-white">AI is a creative partner — not just a tool.</strong></p>
                            <div className="space-y-4">
                                {[
                                    { icon: '🎯', label: 'Human intent and strategy', color: '#4d6bff' },
                                    { icon: '⚙️', label: 'AI-powered execution', color: '#8b5cf6' },
                                    { icon: '📈', label: 'Continuous learning and improvement', color: '#10b981' },
                                ].map((item, i) => (
                                    <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg" style={{ background: `${item.color}15` }}>{item.icon}</div>
                                        <span className="text-gray-200 font-medium">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                            <p className="mt-6 text-[#acaab0]">You don't just generate content. You build a system that <strong className="text-white">gets better over time.</strong></p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  WHY MANTRAM EXISTS                                       */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-28 px-6" ref={assignRef('why')}>
                <div className="max-w-4xl mx-auto text-center">
                    <div className={`transition-all duration-1000 ${isVisible('why') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#06b6d4] mb-4 block">Why We Exist</span>
                        <h2 className="text-3xl md:text-4xl font-black leading-tight mb-8">
                            Not another tool.<br />
                            A <span className="text-[#06b6d4]">system</span>.
                        </h2>
                        <p className="text-xl text-[#acaab0] max-w-2xl mx-auto leading-relaxed mb-12">
                            Mantram was built as a response to years of real-world challenges: disconnected tools, repetitive workflows, inconsistent brand communication, and AI without context.
                        </p>

                        {/* Statement block */}
                        <div className="relative p-10 rounded-3xl bg-gradient-to-br from-[#06b6d4]/5 to-[#ff7a00]/5 border border-[#06b6d4]/10 overflow-hidden">
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#06b6d4]/30 to-transparent" />
                            <p className="text-lg text-[#acaab0] mb-4">The insight was simple:</p>
                            <p className="text-2xl md:text-3xl font-black leading-tight">
                                Marketing doesn't need more tools.<br />
                                It needs <span className="bg-gradient-to-r from-[#06b6d4] to-[#ff7a00] bg-clip-text text-transparent">a system</span>.
                            </p>
                            <p className="mt-6 text-2xl font-bold text-[#06b6d4]">Mantram is that system.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  MEET THE TEAM — FOUNDERS                                 */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-28 px-6" ref={assignRef('team')}>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#090b16] to-transparent pointer-events-none" />
                <div className="max-w-6xl mx-auto relative z-10">
                    <div className={`text-center mb-20 transition-all duration-1000 ${isVisible('team') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#ff4d00] mb-4 block">Meet The Team</span>
                        <h2 className="text-3xl md:text-5xl font-black leading-tight mb-6">
                            Built by <span className="bg-gradient-to-r from-[#4d6bff] to-[#8b5cf6] bg-clip-text text-transparent">Founders</span> who know the game
                        </h2>
                        <p className="text-lg text-[#acaab0] max-w-3xl mx-auto">
                            Mantram AI is built by founders who have spent years working at the intersection of branding, creativity, technology, and business execution.
                        </p>
                    </div>

                    {/* Experience banner */}
                    <div className={`mb-16 p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] transition-all duration-1000 delay-200 ${isVisible('team') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <h3 className="text-center text-sm font-bold tracking-[0.2em] uppercase text-[#acaab0] mb-6">A System Built from Experience</h3>
                        <p className="text-center text-[#acaab0] max-w-2xl mx-auto mb-8">
                            With <strong className="text-white">18+ years</strong> of experience across creativity, filmmaking, advertising, and brand building, the founding team has worked with:
                        </p>
                        {/* Brand logos */}
                        <div className="flex flex-wrap justify-center gap-3 mb-6">
                            {brandLogos.map((b, i) => (
                                <span key={i} className="px-4 py-2 rounded-full bg-white/[0.04] border border-[#48474c]/30 text-sm text-gray-300 font-medium hover:bg-white/[0.06] transition-colors">{b}</span>
                            ))}
                        </div>
                        <p className="text-center text-gray-500 text-sm mb-4">And collaborated with organizations including:</p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {orgPartners.map((o, i) => (
                                <span key={i} className="px-3 py-1.5 rounded-lg bg-white/[0.02] border border-[#48474c]/20 text-xs text-gray-500 font-medium">{o}</span>
                            ))}
                        </div>
                        <p className="text-center text-gray-500 text-sm mt-4">Supported <strong className="text-gray-300">200+ SMBs</strong> and growing brands.</p>

                        <div className="mt-8 text-center">
                            <div className="inline-block px-6 py-3 rounded-xl bg-[#4d6bff]/8 border border-[#4d6bff]/12">
                                <p className="text-sm text-gray-300 font-semibold italic">"Creativity scales only when systems support it."</p>
                            </div>
                        </div>
                    </div>

                    {/* Founder Cards */}
                    <div className={`grid md:grid-cols-2 gap-8 transition-all duration-1000 delay-400 ${isVisible('team') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

                        {/* DA SACHIN */}
                        <div className="relative p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden group hover:border-[#4d6bff]/15 transition-all duration-700">
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#4d6bff]/30 to-transparent" />
                            <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[#4d6bff]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                            <div className="relative z-10">
                                <div className="flex items-start gap-5 mb-6">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#4d6bff] to-[#8b5cf6] flex items-center justify-center text-2xl font-black shrink-0">DA</div>
                                    <div>
                                        <h3 className="text-xl font-black">DA Sachin</h3>
                                        <p className="text-[#ff4d00] text-sm font-semibold">Co-Founder & CEO</p>
                                    </div>
                                </div>

                                <p className="text-[#acaab0] text-sm leading-relaxed mb-5">
                                    Leads the vision, product philosophy, and brand intelligence behind Mantram AI. With <strong className="text-gray-200">18+ years</strong> in creativity, filmmaking, advertising, and brand building.
                                </p>

                                <div className="flex flex-wrap gap-2 mb-5">
                                    {['🎨 Human Creativity', '⚙️ AI Intelligence', '📈 Business Impact'].map((tag, i) => (
                                        <span key={i} className="px-3 py-1.5 rounded-lg bg-[#4d6bff]/8 border border-[#4d6bff]/12 text-xs font-semibold text-[#93a8ff]">{tag}</span>
                                    ))}
                                </div>

                                <div className="space-y-2 text-sm text-[#acaab0] mb-5">
                                    <p>✦ Designed AI-powered marketing and content systems</p>
                                    <p>✦ Built frameworks for brand consistency at scale</p>
                                    <p>✦ Trained teams across marketing, strategy, design & leadership</p>
                                    <p>✦ Consulted organizations on AI adoption and workflow transformation</p>
                                </div>

                                <div className="p-4 rounded-xl bg-white/[0.02] border border-[#48474c]/20 mb-4">
                                    <p className="text-xs text-gray-500 mb-2">Also known as</p>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-xs px-2 py-1 rounded bg-[#8b5cf6]/10 text-[#a78bfa]">Author — Creativity DOT AI</span>
                                        <span className="text-xs px-2 py-1 rounded bg-[#8b5cf6]/10 text-[#a78bfa]">Author — Prompt DOT AI</span>
                                        <span className="text-xs px-2 py-1 rounded bg-[#f59e0b]/10 text-[#fbbf24]">Creator — India's first AI song</span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-gradient-to-r from-[#4d6bff]/6 to-[#8b5cf6]/6 border border-[#4d6bff]/10">
                                    <p className="text-sm italic text-gray-300 font-medium">"AI won't replace you. Someone who knows how to think, observe, and solve with AI will."</p>
                                </div>
                            </div>
                        </div>

                        {/* ABHISHEK JOHRI */}
                        <div className="relative p-8 rounded-3xl bg-white/[0.02] border border-white/[0.05] overflow-hidden group hover:border-[#10b981]/15 transition-all duration-700">
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#10b981]/30 to-transparent" />
                            <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-[#10b981]/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                            <div className="relative z-10">
                                <div className="flex items-start gap-5 mb-6">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10b981] to-[#06b6d4] flex items-center justify-center text-2xl font-black shrink-0">AJ</div>
                                    <div>
                                        <h3 className="text-xl font-black">Abhishek Johri</h3>
                                        <p className="text-[#10b981] text-sm font-semibold">Co-Founder & CTO</p>
                                    </div>
                                </div>

                                <p className="text-[#acaab0] text-sm leading-relaxed mb-5">
                                    Leads the technology, architecture, and engineering vision behind Mantram AI. A seasoned full-stack developer and tech entrepreneur with <strong className="text-gray-200">5+ years</strong> of experience building scalable, production-grade applications.
                                </p>

                                <div className="p-4 rounded-xl bg-white/[0.02] border border-[#48474c]/20 mb-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-2xl font-black text-[#10b981]">110+</span>
                                        <span className="text-sm text-[#acaab0]">Projects delivered</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {['Healthcare', 'Travel', 'Real Estate', 'Automotive', 'Enterprise'].map((d, i) => (
                                            <span key={i} className="px-2 py-1 rounded bg-[#10b981]/8 border border-[#10b981]/12 text-xs text-[#6ee7b7]">{d}</span>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm text-[#acaab0] mb-5">
                                    <p>✦ Backend architecture and APIs</p>
                                    <p>✦ Cloud infrastructure (AWS, GCP)</p>
                                    <p>✦ AI/ML integrations</p>
                                    <p>✦ Cross-platform development</p>
                                </div>

                                <div className="p-4 rounded-xl bg-gradient-to-r from-[#10b981]/6 to-[#06b6d4]/6 border border-[#10b981]/10">
                                    <p className="text-sm italic text-gray-300 font-medium">Ensures every idea is backed by robust, scalable, and future-ready technology — enabling complexity while delivering simplicity.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Team philosophy */}
                    <div className={`mt-12 text-center transition-all duration-1000 delay-600 ${isVisible('team') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <p className="text-[#acaab0] text-lg max-w-2xl mx-auto">
                            Built by founders who have <strong className="text-white">worked inside the chaos of modern marketing</strong>, understood where systems fail, and designed a platform to fix it.
                        </p>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  THE FUTURE — VISION                                      */}
            {/* ══════════════════════════════════════════════════════════ */}
            <section className="relative py-32 px-6" ref={assignRef('future')}>
                <div className="max-w-4xl mx-auto text-center relative z-10">
                    <div className={`transition-all duration-1000 ${isVisible('future') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <span className="text-xs font-bold tracking-[0.3em] uppercase text-[#ec4899] mb-4 block">The Future</span>
                        <h2 className="text-3xl md:text-5xl font-black leading-tight mb-8">
                            More than a product.<br />
                            <span className="bg-gradient-to-r from-[#4d6bff] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">The operating system</span> for modern brands.
                        </h2>
                        <p className="text-xl text-[#acaab0] max-w-2xl mx-auto mb-14 leading-relaxed">
                            Where every action, every creation, and every decision is powered by intelligence.
                        </p>
                    </div>

                    {/* Vision pillars */}
                    <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 mb-16 transition-all duration-1000 delay-200 ${isVisible('future') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        {[
                            { icon: '🧬', label: 'Understands your brand', color: '#4d6bff' },
                            { icon: '🎨', label: 'Creates with you', color: '#8b5cf6' },
                            { icon: '📚', label: 'Learns from you', color: '#10b981' },
                            { icon: '📈', label: 'Scales with you', color: '#ec4899' },
                        ].map((v, i) => (
                            <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] group hover:scale-105 transition-all duration-500" style={{ transitionDelay: `${i * 100}ms` }}>
                                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{v.icon}</div>
                                <p className="text-sm font-semibold" style={{ color: v.color }}>{v.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Final statement */}
                    <div className={`transition-all duration-1000 delay-500 ${isVisible('future') ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                        <div className="relative p-12 rounded-3xl overflow-hidden">
                            {/* Background gradient */}
                            <div className="absolute inset-0 bg-gradient-to-br from-[#4d6bff]/8 via-[#8b5cf6]/5 to-[#ec4899]/5 rounded-3xl" />
                            <div className="absolute inset-0 border border-[#4d6bff]/10 rounded-3xl" />
                            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#4d6bff]/40 to-transparent" />

                            <div className="relative z-10">
                                <p className="text-2xl md:text-3xl font-black leading-tight">
                                    Mantram AI is where{' '}
                                    <span className="bg-gradient-to-r from-[#4d6bff] via-[#8b5cf6] to-[#ec4899] bg-clip-text text-transparent">human creativity</span>{' '}
                                    meets{' '}
                                    <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">intelligent systems</span>{' '}
                                    — to build brands that truly stand out.
                                </p>

                                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                                    <Link to="/auth" className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold rounded-full bg-gradient-to-r from-[#ff4d00] to-[#ff7a00] hover:shadow-xl hover:shadow-[#2b4bee]/30 transition-all hover:-translate-y-1">
                                        <span className="material-symbols-rounded text-lg">rocket_launch</span>
                                        Start Building
                                    </Link>
                                    <Link to="/" className="inline-flex items-center gap-2 px-8 py-4 text-sm font-bold rounded-full bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all hover:-translate-y-1">
                                        <span className="material-symbols-rounded text-lg">play_circle</span>
                                        Explore Studios
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  FOOTER                                                   */}
            {/* ══════════════════════════════════════════════════════════ */}
            <footer className="border-t border-[#48474c]/20 py-12 px-6">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <img src="/mantram-logo.png" alt="Mantram AI" className="h-6 w-6" onError={(e) => e.target.style.display = 'none'} />
                        <span className="text-sm font-bold">Mantram <span className="text-[#ff4d00]">AI</span></span>
                    </div>
                    <div className="flex gap-6 text-sm text-gray-500">
                        <Link to="/" className="hover:text-white transition-colors">Home</Link>
                        <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy</Link>
                        <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
                    </div>
                    <p className="text-xs text-gray-600">© {new Date().getFullYear()} Mantram AI. All rights reserved.</p>
                </div>
            </footer>

            {/* ══════════════════════════════════════════════════════════ */}
            {/*  ANIMATIONS                                               */}
            {/* ══════════════════════════════════════════════════════════ */}
            <style>{`
                @keyframes abt-fade-up-anim {
                    0% { opacity: 0; transform: translateY(30px) }
                    100% { opacity: 1; transform: translateY(0) }
                }
                .abt-fade-up {
                    animation: abt-fade-up-anim 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
                }

                @keyframes abt-spin-slow-anim {
                    0% { transform: rotate(0deg) }
                    100% { transform: rotate(360deg) }
                }
                .abt-spin-slow {
                    animation: abt-spin-slow-anim 30s linear infinite;
                }

                @keyframes abt-spin-slow-rev {
                    0% { transform: rotate(360deg) }
                    100% { transform: rotate(0deg) }
                }
                .abt-spin-slow-reverse {
                    animation: abt-spin-slow-rev 20s linear infinite;
                }

                /* Smooth scroll reveal */
                section {
                    will-change: transform, opacity;
                }

                /* Premium text selection */
                ::selection {
                    background: rgba(77, 107, 255, 0.3);
                }
            `}</style>
        </div>
    )
}

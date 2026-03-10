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

    /* ── Active studio for interactive section ── */
    const [activeStudio, setActiveStudio] = useState(0)

    /* ── Hero carousel state ── */
    const [heroSlide, setHeroSlide] = useState(0)
    const heroInterval = useRef(null)

    const heroSlides = [
        { img: '/screenshots/dashboard.png', label: 'AI Command Center', sub: 'Your intelligent dashboard with Brand Health, trending insights & 1-click studio access' },
        { img: '/screenshots/content-studio.png', label: 'Content Studio', sub: 'AI-powered writing for every channel — blog posts, social captions, ad copy & emails' },
        { img: '/screenshots/creative-studio.png', label: 'Creative Studio', sub: 'Design social posts, banners, ads & AI photoshoots with brand consistency' },
        { img: '/screenshots/video-studio.png', label: 'Video Studio', sub: 'Multi-model video generation — Seedance, Kling, Veo 2 — from brief to final cut' },
        { img: '/screenshots/performance-studio.png', label: 'Performance Studio', sub: 'AI ad strategist — research, strategy, campaigns & ROAS optimization' },
        { img: '/screenshots/seo-studio.png', label: 'SEO Studio', sub: 'AI-powered keyword research, site audits & competitive intelligence' },
    ]

    useEffect(() => {
        heroInterval.current = setInterval(() => setHeroSlide(p => (p + 1) % 6), 4000)
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
        try {
            const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
            const response = await fetch(`${apiBaseUrl}/waitlist`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...waitlistForm, type: waitlistType })
            })

            const data = await response.json()

            if (data.success) {
                setWaitlistSubmitted(true)
            } else {
                alert(data.message || 'Something went wrong. Please try again.')
            }
        } catch (error) {
            console.error('Submission error:', error)
            alert('Failed to submit. Please check your connection and try again.')
        } finally {
            setWaitlistLoading(false)
        }
    }

    const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

    /* ── Studios data with SVG conceptual animations ── */
    const studios = [
        {
            icon: 'draw', name: 'Content Studio', slug: 'content-studio', desc: 'AI-generated blog posts, social captions, ad copy & emails — perfectly aligned to your brand voice.', color: 'from-violet-500 to-purple-600', tag: 'Writing', accentHex: '#8b5cf6',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(139,92,246,0.08) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Floating content type bubbles */}
                        <g className="st-float" style={{ animationDuration: '4s' }}><rect x="20" y="35" width="55" height="22" rx="11" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth=".5" /><text x="47" y="50" textAnchor="middle" fill="#a78bfa" fontSize="9" fontWeight="600">Blog</text></g>
                        <g className="st-float" style={{ animationDuration: '5s', animationDelay: '1s' }}><rect x="310" y="25" width="70" height="22" rx="11" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth=".5" /><text x="345" y="40" textAnchor="middle" fill="#a78bfa" fontSize="9" fontWeight="600">Ad Copy</text></g>
                        <g className="st-float" style={{ animationDuration: '4.5s', animationDelay: '.5s' }}><rect x="140" y="12" width="60" height="22" rx="11" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth=".5" /><text x="170" y="27" textAnchor="middle" fill="#a78bfa" fontSize="9" fontWeight="600">Social</text></g>
                        <g className="st-float" style={{ animationDuration: '3.8s', animationDelay: '1.5s' }}><rect x="230" y="8" width="55" height="22" rx="11" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth=".5" /><text x="257" y="23" textAnchor="middle" fill="#a78bfa" fontSize="9" fontWeight="600">Email</text></g>
                        {/* Document */}
                        <rect x="90" y="55" width="220" height="180" rx="10" fill="rgba(139,92,246,0.03)" stroke="rgba(139,92,246,0.1)" strokeWidth=".5" />
                        {/* Title */}
                        <rect x="110" y="75" width="100" height="7" rx="3.5" fill="rgba(139,92,246,0.2)" className="st-type" />
                        {/* Text lines typing */}
                        <rect x="110" y="98" width="180" height="4" rx="2" fill="rgba(139,92,246,0.12)" className="st-type" style={{ animationDelay: '.4s' }} />
                        <rect x="110" y="110" width="165" height="4" rx="2" fill="rgba(139,92,246,0.10)" className="st-type" style={{ animationDelay: '.7s' }} />
                        <rect x="110" y="122" width="175" height="4" rx="2" fill="rgba(139,92,246,0.09)" className="st-type" style={{ animationDelay: '1s' }} />
                        <rect x="110" y="134" width="140" height="4" rx="2" fill="rgba(139,92,246,0.08)" className="st-type" style={{ animationDelay: '1.3s' }} />
                        <rect x="110" y="146" width="120" height="4" rx="2" fill="rgba(139,92,246,0.07)" className="st-type" style={{ animationDelay: '1.6s' }} />
                        {/* Blinking cursor */}
                        <rect x="230" y="143" width="2" height="10" rx="1" fill="#8b5cf6" className="st-blink" />
                        {/* AI sparkle */}
                        <g className="st-pulse" style={{ transformOrigin: '280px 75px' }}>
                            <circle cx="280" cy="75" r="16" fill="rgba(139,92,246,0.08)" /><circle cx="280" cy="75" r="8" fill="rgba(139,92,246,0.15)" />
                            <text x="280" y="80" textAnchor="middle" fill="#a78bfa" fontSize="11">✦</text>
                        </g>
                        {/* Badges */}
                        <g className="st-fade-in" style={{ animationDelay: '2s' }}><rect x="110" y="195" width="55" height="20" rx="10" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.2)" strokeWidth=".5" /><text x="137" y="209" textAnchor="middle" fill="#34d399" fontSize="8" fontWeight="700">SEO: 92</text></g>
                        <g className="st-fade-in" style={{ animationDelay: '2.3s' }}><rect x="175" y="195" width="70" height="20" rx="10" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth=".5" /><text x="210" y="209" textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="700">Professional</text></g>
                        <g className="st-fade-in" style={{ animationDelay: '2.6s' }}><rect x="255" y="195" width="50" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth=".5" /><text x="280" y="209" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">847w</text></g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'auto_fix_high', name: 'Creative Studio', slug: 'creative-studio', desc: 'Design social posts, stories, ads, banners & AI photoshoots with one-click brand consistency.', color: 'from-pink-500 to-rose-600', tag: 'Design', accentHex: '#ec4899',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(236,72,153,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Floating shapes */}
                        <g className="st-orbit" style={{ transformOrigin: '200px 120px', animationDuration: '12s' }}>
                            <rect x="80" y="60" width="40" height="40" rx="8" fill="rgba(236,72,153,0.12)" stroke="rgba(236,72,153,0.25)" strokeWidth=".5" transform="rotate(15 100 80)" />
                        </g>
                        <g className="st-orbit-reverse" style={{ transformOrigin: '200px 120px', animationDuration: '15s' }}>
                            <circle cx="300" cy="80" r="22" fill="rgba(168,85,247,0.1)" stroke="rgba(168,85,247,0.2)" strokeWidth=".5" />
                        </g>
                        <g className="st-orbit" style={{ transformOrigin: '200px 130px', animationDuration: '10s' }}>
                            <polygon points="320,200 340,170 360,200" fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.2)" strokeWidth=".5" />
                        </g>
                        <g className="st-float" style={{ animationDuration: '5s' }}>
                            <circle cx="70" cy="190" r="18" fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.2)" strokeWidth=".5" />
                        </g>
                        {/* Central canvas */}
                        <rect x="130" y="60" width="140" height="140" rx="14" fill="rgba(236,72,153,0.03)" stroke="rgba(236,72,153,0.12)" strokeWidth=".5" />
                        {/* Canvas content - Instagram post mockup */}
                        <rect x="145" y="75" width="110" height="110" rx="8" fill="rgba(236,72,153,0.06)" className="st-scale-in" />
                        <circle cx="200" cy="120" r="20" fill="rgba(236,72,153,0.12)" className="st-pulse" style={{ transformOrigin: '200px 120px' }} />
                        <text x="200" y="126" textAnchor="middle" fill="#ec4899" fontSize="16" className="st-scale-in" style={{ animationDelay: '.5s' }}>✦</text>
                        {/* Brush stroke path */}
                        <path d="M 60 140 Q 100 100 160 130 T 260 110 T 360 140" stroke="rgba(236,72,153,0.15)" strokeWidth="2" strokeLinecap="round" fill="none" className="st-draw-path" strokeDasharray="400" strokeDashoffset="400" />
                        {/* Color palette */}
                        <g className="st-fade-in" style={{ animationDelay: '1s' }}>
                            <circle cx="150" cy="230" r="10" fill="#8b5cf6" className="st-pulse-color" style={{ animationDelay: '0s' }} />
                            <circle cx="178" cy="230" r="10" fill="#ec4899" className="st-pulse-color" style={{ animationDelay: '.2s' }} />
                            <circle cx="206" cy="230" r="10" fill="#f59e0b" className="st-pulse-color" style={{ animationDelay: '.4s' }} />
                            <circle cx="234" cy="230" r="10" fill="#10b981" className="st-pulse-color" style={{ animationDelay: '.6s' }} />
                        </g>
                        {/* Brand kit label */}
                        <g className="st-fade-in" style={{ animationDelay: '1.5s' }}><rect x="140" y="252" width="120" height="20" rx="10" fill="rgba(236,72,153,0.08)" stroke="rgba(236,72,153,0.15)" strokeWidth=".5" /><text x="200" y="266" textAnchor="middle" fill="#f472b6" fontSize="8" fontWeight="600">Brand Kit Applied ✓</text></g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'smart_display', name: 'Video Studio', slug: 'video-studio', desc: 'Multi-model video generation — Seedance, Kling, Veo 2 — from brief to cinematic final cut.', color: 'from-amber-500 to-orange-600', tag: 'Video', accentHex: '#f59e0b',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(245,158,11,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Film strip frames scrolling */}
                        <g className="st-scroll-left">
                            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                                <g key={i}><rect x={30 + i * 48} y="30" width="40" height="30" rx="4" fill={`rgba(245,158,11,${0.05 + i * 0.02})`} stroke="rgba(245,158,11,0.15)" strokeWidth=".5" /><rect x={38 + i * 48} y="35" width="24" height="20" rx="2" fill={`rgba(245,158,11,${0.08 + i * 0.015})`} /></g>
                            ))}
                        </g>
                        {/* Central screen */}
                        <rect x="100" y="80" width="200" height="120" rx="12" fill="rgba(245,158,11,0.03)" stroke="rgba(245,158,11,0.12)" strokeWidth=".5" />
                        <defs><linearGradient id="vg" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stopColor="rgba(245,158,11,0.08)" /><stop offset="100%" stopColor="transparent" /></linearGradient></defs>
                        <rect x="100" y="80" width="200" height="120" rx="12" fill="url(#vg)" />
                        {/* Play button */}
                        <circle cx="200" cy="140" r="24" fill="rgba(245,158,11,0.1)" stroke="rgba(245,158,11,0.3)" strokeWidth="1" className="st-pulse" style={{ transformOrigin: '200px 140px' }} />
                        <circle cx="200" cy="140" r="32" fill="none" stroke="rgba(245,158,11,0.08)" strokeWidth=".5" className="st-ripple" style={{ transformOrigin: '200px 140px' }} />
                        <polygon points="193,128 193,152 213,140" fill="#fbbf24" />
                        {/* Timeline */}
                        <rect x="100" y="215" width="200" height="3" rx="1.5" fill="rgba(245,158,11,0.1)" />
                        <rect x="100" y="215" width="70" height="3" rx="1.5" fill="rgba(245,158,11,0.4)" className="st-progress" />
                        <circle cx="170" cy="216.5" r="5" fill="#f59e0b" className="st-progress-dot" />
                        {/* Model badges */}
                        <g className="st-fade-in" style={{ animationDelay: '1s' }}><rect x="100" y="240" width="58" height="20" rx="10" fill="rgba(245,158,11,0.12)" stroke="rgba(245,158,11,0.25)" strokeWidth=".5" /><text x="129" y="254" textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="700">Seedance</text></g>
                        <g className="st-fade-in" style={{ animationDelay: '1.3s' }}><rect x="168" y="240" width="50" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth=".5" /><text x="193" y="254" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600">Kling</text></g>
                        <g className="st-fade-in" style={{ animationDelay: '1.6s' }}><rect x="228" y="240" width="50" height="20" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth=".5" /><text x="253" y="254" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="600">Veo 2</text></g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'campaign', name: 'Performance Studio', slug: 'performance-studio', desc: 'AI ad strategist that researches competitors, plans budgets & generates Meta/Google ad campaigns.', color: 'from-emerald-500 to-teal-600', tag: 'Ads', accentHex: '#10b981',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(16,185,129,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Metric cards */}
                        <g className="st-slide-up" style={{ animationDelay: '0s' }}><rect x="30" y="20" width="80" height="45" rx="8" fill="rgba(16,185,129,0.04)" stroke="rgba(16,185,129,0.1)" strokeWidth=".5" /><text x="70" y="40" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">ROAS</text><text x="70" y="56" textAnchor="middle" fill="#34d399" fontSize="14" fontWeight="800">4.2x</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '.2s' }}><rect x="120" y="20" width="80" height="45" rx="8" fill="rgba(16,185,129,0.04)" stroke="rgba(16,185,129,0.1)" strokeWidth=".5" /><text x="160" y="40" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">CTR</text><text x="160" y="56" textAnchor="middle" fill="#34d399" fontSize="14" fontWeight="800">3.8%</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '.4s' }}><rect x="210" y="20" width="80" height="45" rx="8" fill="rgba(16,185,129,0.04)" stroke="rgba(16,185,129,0.1)" strokeWidth=".5" /><text x="250" y="40" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">CPC</text><text x="250" y="56" textAnchor="middle" fill="#34d399" fontSize="14" fontWeight="800">$0.42</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '.6s' }}><rect x="300" y="20" width="80" height="45" rx="8" fill="rgba(16,185,129,0.04)" stroke="rgba(16,185,129,0.1)" strokeWidth=".5" /><text x="340" y="40" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">SPEND</text><text x="340" y="56" textAnchor="middle" fill="#34d399" fontSize="14" fontWeight="800">$2.4K</text></g>
                        {/* Bar chart */}
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                            const heights = [60, 85, 70, 100, 55, 90, 75, 110]
                            return <rect key={i} x={60 + i * 38} y={200 - heights[i]} width="22" height={heights[i]} rx="4" fill={`rgba(16,185,129,${0.1 + i * 0.03})`} stroke="rgba(16,185,129,0.15)" strokeWidth=".5" className="st-grow-bar" style={{ transformOrigin: `${71 + i * 38}px 200px`, animationDelay: `${i * 0.15}s` }} />
                        })}
                        <line x1="50" y1="200" x2="370" y2="200" stroke="rgba(16,185,129,0.1)" strokeWidth=".5" />
                        {/* Trend line */}
                        <path d="M 71 160 L 109 135 L 147 150 L 185 120 L 223 165 L 261 130 L 299 145 L 337 110" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none" className="st-draw-path" strokeDasharray="500" strokeDashoffset="500" />
                        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                            const ys = [160, 135, 150, 120, 165, 130, 145, 110]
                            return <circle key={i} cx={71 + i * 38} cy={ys[i]} r="3" fill="#10b981" className="st-scale-in" style={{ transformOrigin: `${71 + i * 38}px ${ys[i]}px`, animationDelay: `${1.5 + i * 0.1}s` }} />
                        })}
                        {/* AI badge */}
                        <g className="st-fade-in" style={{ animationDelay: '2.5s' }}><rect x="120" y="220" width="160" height="22" rx="11" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.15)" strokeWidth=".5" /><text x="200" y="235" textAnchor="middle" fill="#34d399" fontSize="8" fontWeight="600">✦ AI optimized 3 campaigns</text></g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'query_stats', name: 'SEO Studio', slug: 'seo-studio', desc: 'AI-powered keyword research, site audits, content gap analysis & competitive intelligence.', color: 'from-blue-500 to-indigo-600', tag: 'SEO', accentHex: '#3b82f6',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Search bar */}
                        <rect x="60" y="20" width="280" height="36" rx="18" fill="rgba(59,130,246,0.04)" stroke="rgba(59,130,246,0.15)" strokeWidth=".5" />
                        <circle cx="88" cy="38" r="10" fill="none" stroke="rgba(59,130,246,0.3)" strokeWidth="1.5" />
                        <line x1="95" y1="45" x2="100" y2="50" stroke="rgba(59,130,246,0.3)" strokeWidth="1.5" strokeLinecap="round" />
                        <rect x="110" y="33" width="80" height="4" rx="2" fill="rgba(59,130,246,0.15)" className="st-type" />
                        <rect x="190" y="33" width="2" height="10" rx="1" fill="#3b82f6" className="st-blink" />
                        {/* Rankings */}
                        {[{ kw: 'ai marketing tool', pos: '#3', change: '↑2', y: 80 }, { kw: 'content automation', pos: '#7', change: '↑5', y: 115 }, { kw: 'social media ai', pos: '#12', change: '↑8', y: 150 }].map((r, i) => (
                            <g key={i} className="st-slide-up" style={{ animationDelay: `${0.8 + i * 0.3}s` }}>
                                <rect x="60" y={r.y} width="280" height="28" rx="8" fill="rgba(59,130,246,0.02)" stroke="rgba(59,130,246,0.06)" strokeWidth=".5" />
                                <text x="80" y={r.y + 18} fill="#cbd5e1" fontSize="10">{r.kw}</text>
                                <text x="280" y={r.y + 18} textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="700">{r.pos}</text>
                                <text x="320" y={r.y + 18} textAnchor="middle" fill="#34d399" fontSize="9" fontWeight="700">{r.change}</text>
                            </g>
                        ))}
                        {/* Score circles */}
                        {[{ label: 'Health', value: '87', x: 110, color: '#10b981', pct: 0.87 }, { label: 'Speed', value: '94', x: 200, color: '#3b82f6', pct: 0.94 }, { label: 'Authority', value: '72', x: 290, color: '#8b5cf6', pct: 0.72 }].map((s, i) => (
                            <g key={i} className="st-fade-in" style={{ animationDelay: `${2 + i * 0.3}s` }}>
                                <circle cx={s.x} cy="225" r="24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                                <circle cx={s.x} cy="225" r="24" fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${s.pct * 150} 150`} transform={`rotate(-90 ${s.x} 225)`} className="st-circle-fill" />
                                <text x={s.x} y="229" textAnchor="middle" fill="white" fontSize="12" fontWeight="800">{s.value}</text>
                                <text x={s.x} y="260" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">{s.label}</text>
                            </g>
                        ))}
                    </svg>
                </div>
            )
        },
        {
            icon: 'storefront', name: 'D2C Studio', slug: 'd2c-studio', desc: 'Shopify Intelligence Hub — product velocity, abandonment signals & AI-powered e-commerce insights.', color: 'from-cyan-500 to-sky-600', tag: 'Commerce', accentHex: '#06b6d4',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 60%, rgba(6,182,212,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Revenue header */}
                        <g className="st-fade-in"><text x="60" y="35" fill="#64748b" fontSize="9" fontWeight="600">REVENUE TODAY</text><text x="60" y="58" fill="white" fontSize="22" fontWeight="800">$12,847</text><rect x="190" y="40" width="45" height="18" rx="9" fill="rgba(16,185,129,0.1)" stroke="rgba(16,185,129,0.2)" strokeWidth=".5" /><text x="212" y="53" textAnchor="middle" fill="#34d399" fontSize="8" fontWeight="700">+23%</text></g>
                        {/* Revenue chart */}
                        <path d="M 60 170 Q 90 140 120 155 T 180 130 T 240 120 T 300 100 T 350 90" stroke="#06b6d4" strokeWidth="2" fill="none" strokeLinecap="round" className="st-draw-path" strokeDasharray="400" strokeDashoffset="400" />
                        <path d="M 60 170 Q 90 140 120 155 T 180 130 T 240 120 T 300 100 T 350 90 L 350 180 L 60 180 Z" fill="rgba(6,182,212,0.05)" className="st-fade-in" style={{ animationDelay: '2s' }} />
                        <line x1="55" y1="180" x2="355" y2="180" stroke="rgba(6,182,212,0.08)" strokeWidth=".5" />
                        {/* Data points */}
                        {[[120, 155], [180, 130], [240, 120], [300, 100], [350, 90]].map(([x, y], i) => (
                            <circle key={i} cx={x} cy={y} r="3" fill="#06b6d4" className="st-scale-in" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${1.5 + i * 0.2}s` }} />
                        ))}
                        {/* Metric cards */}
                        <g className="st-slide-up" style={{ animationDelay: '1s' }}><rect x="60" y="200" width="85" height="40" rx="8" fill="rgba(6,182,212,0.04)" stroke="rgba(6,182,212,0.1)" strokeWidth=".5" /><text x="102" y="218" textAnchor="middle" fill="white" fontSize="13" fontWeight="800">184</text><text x="102" y="232" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">ORDERS</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '1.2s' }}><rect x="155" y="200" width="85" height="40" rx="8" fill="rgba(6,182,212,0.04)" stroke="rgba(6,182,212,0.1)" strokeWidth=".5" /><text x="197" y="218" textAnchor="middle" fill="white" fontSize="13" fontWeight="800">$69.8</text><text x="197" y="232" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">AVG ORDER</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '1.4s' }}><rect x="250" y="200" width="85" height="40" rx="8" fill="rgba(6,182,212,0.04)" stroke="rgba(6,182,212,0.1)" strokeWidth=".5" /><text x="292" y="218" textAnchor="middle" fill="white" fontSize="13" fontWeight="800">18%</text><text x="292" y="232" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">CART DROP</text></g>
                        {/* Shopify icon area */}
                        <g className="st-float" style={{ animationDuration: '4s' }}><rect x="310" y="20" width="60" height="30" rx="8" fill="rgba(6,182,212,0.06)" stroke="rgba(6,182,212,0.12)" strokeWidth=".5" /><text x="340" y="40" textAnchor="middle" fill="#22d3ee" fontSize="8" fontWeight="700">Shopify</text></g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'forum', name: 'Conversation Studio', slug: 'conversation-studio', desc: 'AI auto-responder for Instagram & Facebook DMs — route leads, answer FAQs, never miss a message.', color: 'from-fuchsia-500 to-pink-600', tag: 'DMs', accentHex: '#d946ef',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(217,70,239,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* User bubble 1 */}
                        <g className="st-slide-up" style={{ animationDelay: '0s' }}>
                            <rect x="150" y="20" width="200" height="35" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth=".5" />
                            <text x="250" y="42" textAnchor="middle" fill="#cbd5e1" fontSize="9">Do you ship internationally? 🌍</text>
                            <text x="340" y="62" fill="#475569" fontSize="7">2:34 PM</text>
                        </g>
                        {/* AI bubble */}
                        <g className="st-slide-up" style={{ animationDelay: '.8s' }}>
                            <rect x="50" y="70" width="260" height="50" rx="12" fill="rgba(217,70,239,0.06)" stroke="rgba(217,70,239,0.15)" strokeWidth=".5" />
                            <text x="180" y="90" textAnchor="middle" fill="#e2e8f0" fontSize="9">Yes! We ship to 50+ countries.</text>
                            <text x="180" y="105" textAnchor="middle" fill="#e2e8f0" fontSize="9">Standard delivery is 7-12 days 📦</text>
                            <rect x="50" y="116" width="30" height="14" rx="7" fill="rgba(217,70,239,0.1)" /><text x="65" y="126" textAnchor="middle" fill="#d946ef" fontSize="7" fontWeight="600">AI</text>
                        </g>
                        {/* User bubble 2 */}
                        <g className="st-slide-up" style={{ animationDelay: '1.6s' }}>
                            <rect x="200" y="140" width="150" height="35" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth=".5" />
                            <text x="275" y="162" textAnchor="middle" fill="#cbd5e1" fontSize="9">What about returns?</text>
                        </g>
                        {/* Typing indicator */}
                        <g className="st-fade-in" style={{ animationDelay: '2.4s' }}>
                            <rect x="50" y="185" width="60" height="28" rx="12" fill="rgba(217,70,239,0.06)" stroke="rgba(217,70,239,0.12)" strokeWidth=".5" />
                            <circle cx="68" cy="199" r="3" fill="#d946ef" className="st-bounce" style={{ animationDelay: '2.5s' }} />
                            <circle cx="80" cy="199" r="3" fill="#d946ef" className="st-bounce" style={{ animationDelay: '2.7s' }} />
                            <circle cx="92" cy="199" r="3" fill="#d946ef" className="st-bounce" style={{ animationDelay: '2.9s' }} />
                        </g>
                        {/* Stats bar */}
                        <g className="st-fade-in" style={{ animationDelay: '2s' }}>
                            <rect x="80" y="235" width="240" height="28" rx="14" fill="rgba(217,70,239,0.05)" stroke="rgba(217,70,239,0.12)" strokeWidth=".5" />
                            <text x="200" y="253" textAnchor="middle" fill="#e879f9" fontSize="9" fontWeight="600">🤖 AI handled 847 DMs today</text>
                        </g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'lightbulb', name: 'Brainstorm Studio', slug: 'brainstorm-studio', desc: 'AI creative director & strategist — brand strategy, campaign ideas, ad concepts, mood boards & content calendars.', color: 'from-yellow-500 to-amber-600', tag: 'Strategy', accentHex: '#eab308',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(234,179,8,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Central lightbulb */}
                        <circle cx="200" cy="130" r="40" fill="rgba(234,179,8,0.06)" className="st-glow" style={{ transformOrigin: '200px 130px' }} />
                        <circle cx="200" cy="130" r="25" fill="rgba(234,179,8,0.1)" className="st-pulse" style={{ transformOrigin: '200px 130px' }} />
                        <text x="200" y="138" textAnchor="middle" fontSize="24">💡</text>
                        {/* Orbiting idea nodes */}
                        {[
                            { label: 'Campaign', angle: 0, dist: 90, delay: 0 },
                            { label: 'Ad Film', angle: 60, dist: 100, delay: .4 },
                            { label: 'Mood Board', angle: 120, dist: 95, delay: .8 },
                            { label: 'Calendar', angle: 180, dist: 90, delay: 1.2 },
                            { label: 'Strategy', angle: 240, dist: 100, delay: 1.6 },
                            { label: 'Content', angle: 300, dist: 95, delay: 2 },
                        ].map((n, i) => {
                            const x = 200 + n.dist * Math.cos(n.angle * Math.PI / 180)
                            const y = 130 + n.dist * Math.sin(n.angle * Math.PI / 180) * 0.7
                            return (
                                <g key={i} className="st-scale-in" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${n.delay}s` }}>
                                    <line x1="200" y1="130" x2={x} y2={y} stroke="rgba(234,179,8,0.12)" strokeWidth=".5" strokeDasharray="3 3" />
                                    <rect x={x - 32} y={y - 11} width="64" height="22" rx="11" fill="rgba(234,179,8,0.06)" stroke="rgba(234,179,8,0.15)" strokeWidth=".5" />
                                    <text x={x} y={y + 4} textAnchor="middle" fill="#fbbf24" fontSize="8" fontWeight="600">{n.label}</text>
                                </g>
                            )
                        })}
                        {/* Sparkle particles */}
                        {[{ x: 120, y: 60 }, { x: 280, y: 70 }, { x: 90, y: 200 }, { x: 310, y: 190 }].map((p, i) => (
                            <text key={i} x={p.x} y={p.y} fill="rgba(234,179,8,0.3)" fontSize="10" className="st-sparkle" style={{ animationDelay: `${i * 0.5}s` }}>✦</text>
                        ))}
                    </svg>
                </div>
            )
        },
        {
            icon: 'calendar_month', name: 'Smart Calendar', slug: 'smart-calendar', desc: 'Marketing intelligence calendar — trending moments, festivals & AI-suggested content dates.', color: 'from-teal-500 to-emerald-600', tag: 'Planning', accentHex: '#14b8a6',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(20,184,166,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Calendar frame */}
                        <rect x="60" y="20" width="280" height="220" rx="12" fill="rgba(20,184,166,0.03)" stroke="rgba(20,184,166,0.1)" strokeWidth=".5" />
                        {/* Header */}
                        <rect x="60" y="20" width="280" height="35" rx="12" fill="rgba(20,184,166,0.06)" />
                        <text x="200" y="43" textAnchor="middle" fill="#5eead4" fontSize="11" fontWeight="700">March 2026</text>
                        {/* Day headers */}
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                            <text key={i} x={90 + i * 35} y="72" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="600">{d}</text>
                        ))}
                        {/* Calendar grid */}
                        {Array.from({ length: 28 }, (_, i) => {
                            const col = i % 7, row = Math.floor(i / 7)
                            const x = 90 + col * 35, y = 85 + row * 32
                            const day = i + 1
                            const isFestival = [8, 15, 22].includes(day)
                            const isAI = [5, 12, 19, 26].includes(day)
                            const isToday = day === 8
                            return (
                                <g key={i} className="st-scale-in" style={{ transformOrigin: `${x}px ${y + 8}px`, animationDelay: `${i * 0.04}s` }}>
                                    {isToday && <circle cx={x} cy={y + 8} r="13" fill="rgba(20,184,166,0.15)" stroke="rgba(20,184,166,0.3)" strokeWidth=".5" />}
                                    {isFestival && !isToday && <circle cx={x} cy={y + 8} r="12" fill="rgba(20,184,166,0.08)" />}
                                    {isAI && <circle cx={x} cy={y + 8} r="12" fill="rgba(139,92,246,0.08)" />}
                                    <text x={x} y={y + 12} textAnchor="middle" fill={isToday ? '#5eead4' : isFestival ? '#2dd4bf' : isAI ? '#a78bfa' : '#64748b'} fontSize="9" fontWeight={isToday || isFestival || isAI ? '700' : '400'}>{day}</text>
                                </g>
                            )
                        })}
                        {/* Legend */}
                        <g className="st-fade-in" style={{ animationDelay: '1.5s' }}>
                            <circle cx="120" cy="255" r="4" fill="#14b8a6" /><text x="130" y="258" fill="#94a3b8" fontSize="8">Festival</text>
                            <circle cx="200" cy="255" r="4" fill="#8b5cf6" /><text x="210" y="258" fill="#94a3b8" fontSize="8">AI Suggested</text>
                        </g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'analytics', name: 'Analytics', slug: 'analytics', desc: 'Traffic intelligence, audience insights, Google Analytics integration & AI-powered growth strategies.', color: 'from-indigo-500 to-violet-600', tag: 'Insights', accentHex: '#6366f1',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(99,102,241,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Multiple chart panels */}
                        {/* Bar chart */}
                        <rect x="30" y="20" width="170" height="120" rx="10" fill="rgba(99,102,241,0.03)" stroke="rgba(99,102,241,0.08)" strokeWidth=".5" />
                        <text x="50" y="40" fill="#64748b" fontSize="8" fontWeight="600">TRAFFIC</text>
                        {[40, 55, 45, 70, 65, 85, 75].map((h, i) => (
                            <rect key={i} x={50 + i * 20} y={120 - h * 0.8} width="12" height={h * 0.8} rx="3" className="st-grow-bar" style={{ fill: `rgba(99,102,241,${0.15 + i * 0.04})`, transformOrigin: `${56 + i * 20}px 120px`, animationDelay: `${i * 0.12}s` }} />
                        ))}
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                            <text key={i} x={56 + i * 20} y="132" textAnchor="middle" fill="#475569" fontSize="6">{d}</text>
                        ))}
                        {/* Pie chart */}
                        <rect x="210" y="20" width="170" height="120" rx="10" fill="rgba(99,102,241,0.03)" stroke="rgba(99,102,241,0.08)" strokeWidth=".5" />
                        <text x="230" y="40" fill="#64748b" fontSize="8" fontWeight="600">SOURCES</text>
                        <circle cx="295" cy="85" r="30" fill="none" stroke="rgba(99,102,241,0.08)" strokeWidth="8" />
                        <circle cx="295" cy="85" r="30" fill="none" stroke="#6366f1" strokeWidth="8" strokeDasharray="75 113" strokeLinecap="round" transform="rotate(-90 295 85)" className="st-circle-fill" />
                        <circle cx="295" cy="85" r="30" fill="none" stroke="#8b5cf6" strokeWidth="8" strokeDasharray="38 150" strokeLinecap="round" transform="rotate(45 295 85)" className="st-circle-fill" style={{ animationDelay: '.3s' }} />
                        <circle cx="295" cy="85" r="30" fill="none" stroke="#c084fc" strokeWidth="8" strokeDasharray="25 163" strokeLinecap="round" transform="rotate(135 295 85)" className="st-circle-fill" style={{ animationDelay: '.6s' }} />
                        {/* Metrics row */}
                        <g className="st-slide-up" style={{ animationDelay: '.6s' }}><rect x="30" y="155" width="105" height="50" rx="10" fill="rgba(99,102,241,0.03)" stroke="rgba(99,102,241,0.08)" strokeWidth=".5" /><text x="82" y="178" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">24.8K</text><text x="82" y="195" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">VISITORS</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '.8s' }}><rect x="145" y="155" width="105" height="50" rx="10" fill="rgba(99,102,241,0.03)" stroke="rgba(99,102,241,0.08)" strokeWidth=".5" /><text x="197" y="178" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">32%</text><text x="197" y="195" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">BOUNCE</text></g>
                        <g className="st-slide-up" style={{ animationDelay: '1s' }}><rect x="260" y="155" width="105" height="50" rx="10" fill="rgba(99,102,241,0.03)" stroke="rgba(99,102,241,0.08)" strokeWidth=".5" /><text x="312" y="178" textAnchor="middle" fill="white" fontSize="16" fontWeight="800">4:23</text><text x="312" y="195" textAnchor="middle" fill="#64748b" fontSize="7" fontWeight="600">DURATION</text></g>
                        {/* Line chart at bottom */}
                        <rect x="30" y="218" width="350" height="50" rx="10" fill="rgba(99,102,241,0.03)" stroke="rgba(99,102,241,0.08)" strokeWidth=".5" />
                        <path d="M 50 255 Q 80 235 130 245 T 230 230 T 300 238 T 360 225" stroke="#6366f1" strokeWidth="1.5" fill="none" strokeLinecap="round" className="st-draw-path" strokeDasharray="400" strokeDashoffset="400" />
                    </svg>
                </div>
            )
        },
        {
            icon: 'build_circle', name: 'Skills Hub', slug: 'skills-hub', desc: 'Build custom AI marketing skills — reusable workflows with AI-enhanced instructions that run on demand.', color: 'from-lime-500 to-green-600', tag: 'Automation', accentHex: '#84cc16',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(132,204,22,0.06) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Skill cards grid */}
                        {[
                            { x: 45, y: 30, label: 'WhatsApp\nBroadcast', icon: '💬', delay: 0 },
                            { x: 165, y: 30, label: 'Festival\nCampaign', icon: '🎉', delay: .3 },
                            { x: 285, y: 30, label: 'Product\nLaunch', icon: '🚀', delay: .6 },
                            { x: 45, y: 120, label: 'Email\nSequence', icon: '📧', delay: .9 },
                            { x: 165, y: 120, label: 'Social\nCalendar', icon: '📅', delay: 1.2 },
                            { x: 285, y: 120, label: 'Ad Copy\nGenerator', icon: '✍️', delay: 1.5 },
                        ].map((c, i) => (
                            <g key={i} className="st-scale-in" style={{ transformOrigin: `${c.x + 45}px ${c.y + 35}px`, animationDelay: `${c.delay}s` }}>
                                <rect x={c.x} y={c.y} width="90" height="70" rx="10" fill="rgba(132,204,22,0.04)" stroke="rgba(132,204,22,0.12)" strokeWidth=".5" />
                                <text x={c.x + 45} y={c.y + 28} textAnchor="middle" fontSize="18">{c.icon}</text>
                                {c.label.split('\n').map((line, li) => (
                                    <text key={li} x={c.x + 45} y={c.y + 45 + li * 12} textAnchor="middle" fill="#a3e635" fontSize="8" fontWeight="600">{line}</text>
                                ))}
                            </g>
                        ))}
                        {/* Enhance with AI bar */}
                        <g className="st-fade-in" style={{ animationDelay: '2s' }}>
                            <rect x="80" y="220" width="240" height="34" rx="17" fill="rgba(132,204,22,0.06)" stroke="rgba(132,204,22,0.2)" strokeWidth=".5" />
                            <text x="200" y="241" textAnchor="middle" fill="#a3e635" fontSize="10" fontWeight="700">✦ Enhance Instructions with AI</text>
                        </g>
                    </svg>
                </div>
            )
        },
        {
            icon: 'smart_toy', name: 'Fidato — AI Assistant', slug: 'fidato', desc: 'Your personal AI marketing assistant — ask anything, run skills, switch studios, all from a single command bar.', color: 'from-sky-500 to-blue-600', tag: 'Assistant', accentHex: '#0ea5e9',
            preview: () => (
                <div className="h-full w-full flex items-center justify-center relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at 50% 45%, rgba(14,165,233,0.07) 0%, transparent 70%)' }}>
                    <svg viewBox="0 0 400 280" className="w-full h-auto max-h-full p-4" fill="none">
                        {/* Central Fidato orb */}
                        <circle cx="200" cy="120" r="45" fill="rgba(14,165,233,0.06)" className="st-glow" style={{ transformOrigin: '200px 120px' }} />
                        <circle cx="200" cy="120" r="28" fill="rgba(14,165,233,0.12)" className="st-pulse" style={{ transformOrigin: '200px 120px' }} />
                        <text x="200" y="127" textAnchor="middle" fill="#38bdf8" fontSize="22" fontWeight="800">F</text>
                        {/* Orbiting studio connections */}
                        {[
                            { label: 'Content', angle: 0, dist: 95 },
                            { label: 'Creative', angle: 51, dist: 100 },
                            { label: 'Video', angle: 102, dist: 95 },
                            { label: 'Ads', angle: 153, dist: 100 },
                            { label: 'SEO', angle: 204, dist: 95 },
                            { label: 'Skills', angle: 255, dist: 100 },
                            { label: 'Calendar', angle: 306, dist: 95 },
                        ].map((n, i) => {
                            const x = 200 + n.dist * Math.cos(n.angle * Math.PI / 180)
                            const y = 120 + n.dist * Math.sin(n.angle * Math.PI / 180) * 0.65
                            return (
                                <g key={i} className="st-scale-in" style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.25}s` }}>
                                    <line x1="200" y1="120" x2={x} y2={y} stroke="rgba(14,165,233,0.1)" strokeWidth=".5" strokeDasharray="3 3" />
                                    <rect x={x - 26} y={y - 10} width="52" height="20" rx="10" fill="rgba(14,165,233,0.06)" stroke="rgba(14,165,233,0.15)" strokeWidth=".5" />
                                    <text x={x} y={y + 4} textAnchor="middle" fill="#38bdf8" fontSize="7" fontWeight="600">{n.label}</text>
                                </g>
                            )
                        })}
                        {/* Command bar */}
                        <g className="st-slide-up" style={{ animationDelay: '2s' }}>
                            <rect x="70" y="225" width="260" height="36" rx="18" fill="rgba(14,165,233,0.04)" stroke="rgba(14,165,233,0.15)" strokeWidth=".5" />
                            <circle cx="98" cy="243" r="10" fill="rgba(14,165,233,0.12)" />
                            <text x="98" y="247" textAnchor="middle" fill="#38bdf8" fontSize="9" fontWeight="700">F</text>
                            <rect x="118" y="238" width="90" height="4" rx="2" fill="rgba(14,165,233,0.15)" className="st-type" />
                            <rect x="210" y="238" width="2" height="10" rx="1" fill="#0ea5e9" className="st-blink" />
                            <text x="280" y="247" textAnchor="middle" fill="#64748b" fontSize="8">⌘K</text>
                        </g>
                    </svg>
                </div>
            )
        },
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
                                12 AI studios. One platform. From brand DNA extraction to content creation, video production, ad optimization, strategy & e-commerce intelligence — Mantram AI is your full-stack marketing operating system.
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
                                    { icon: 'memory', text: '12 AI Studios' },
                                    { icon: 'speed', text: 'Real-Time Intelligence' },
                                ].map((b, i) => (
                                    <div key={i} className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                                        <span className="material-symbols-outlined text-sm">{b.icon}</span>{b.text}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right: Hero Carousel Showcase */}
                        <div className="relative">
                            {/* Glow frame */}
                            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-violet-500/30 via-primary/20 to-cyan-500/30 blur-xl animate-glow-pulse" />

                            <div className="relative aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl shadow-violet-500/10" style={{ border: '1px solid rgba(139,92,246,0.25)' }}>
                                {/* Carousel slides */}
                                {heroSlides.map((slide, i) => (
                                    <div key={i} className={`absolute inset-0 transition-all duration-700 ease-in-out ${heroSlide === i ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}>
                                        <img src={slide.img} alt={slide.label} className="w-full h-full object-cover object-top" loading={i === 0 ? 'eager' : 'lazy'} />
                                    </div>
                                ))}

                                {/* Overlay gradient */}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#07070f]/80 via-[#07070f]/10 to-transparent" />

                                {/* Navigation arrows */}
                                <button onClick={() => { setHeroSlide(p => (p - 1 + heroSlides.length) % heroSlides.length); clearInterval(heroInterval.current); heroInterval.current = setInterval(() => setHeroSlide(p => (p + 1) % heroSlides.length), 4000) }}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white/70 hover:text-white hover:bg-black/50 transition-all z-20 cursor-pointer">
                                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                                </button>
                                <button onClick={() => { setHeroSlide(p => (p + 1) % heroSlides.length); clearInterval(heroInterval.current); heroInterval.current = setInterval(() => setHeroSlide(p => (p + 1) % heroSlides.length), 4000) }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white/70 hover:text-white hover:bg-black/50 transition-all z-20 cursor-pointer">
                                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                                </button>

                                {/* Bottom label bar */}
                                <div className="absolute bottom-0 inset-x-0 p-4 z-10">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="text-white text-sm font-bold">{heroSlides[heroSlide]?.label}</p>
                                            <p className="text-slate-400 text-[11px] max-w-sm">{heroSlides[heroSlide]?.sub}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        {heroSlides.map((_, i) => (
                                            <button key={i} onClick={() => { setHeroSlide(i); clearInterval(heroInterval.current); heroInterval.current = setInterval(() => setHeroSlide(p => (p + 1) % heroSlides.length), 4000) }}
                                                className={`h-1 rounded-full transition-all duration-300 cursor-pointer ${heroSlide === i ? 'w-6 bg-violet-500' : 'w-2 bg-white/20 hover:bg-white/40'}`} />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Floating feature cards */}
                            <div className="absolute -bottom-6 -left-6 px-4 py-3 rounded-2xl backdrop-blur-xl shadow-2xl animate-float z-20" style={{ background: 'rgba(15,15,30,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}>
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
                            <div className="absolute -top-4 -right-4 px-4 py-3 rounded-2xl backdrop-blur-xl shadow-2xl z-20" style={{ background: 'rgba(15,15,30,0.9)', border: '1px solid rgba(255,255,255,0.08)', animation: 'float 3s ease-in-out 1s infinite' }}>
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
                            { value: '12+', label: 'AI Studios', icon: 'dashboard' },
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
                            12 Studios. <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">One Platform.</span>
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">Every marketing function — content, design, video, ads, SEO, e-commerce, conversations, strategy, skills & AI assistant — powered by specialized AI agent teams.</p>
                    </div>

                    {/* Interactive tabbed studio explorer */}
                    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
                        {/* Left: Studio selector tabs */}
                        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-4 lg:pb-0 lg:max-h-[600px] lg:overflow-y-auto studio-scrollbar">
                            {studios.map((s, i) => (
                                <button key={i} onClick={() => setActiveStudio(i)}
                                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 cursor-pointer text-left flex-shrink-0 lg:flex-shrink group ${activeStudio === i ? 'scale-[1.02]' : 'hover:bg-white/[0.03]'}`}
                                    style={{
                                        background: activeStudio === i ? `linear-gradient(135deg, ${s.accentHex}10, ${s.accentHex}05)` : 'transparent',
                                        border: activeStudio === i ? `1px solid ${s.accentHex}30` : '1px solid transparent',
                                    }}>
                                    <div className={`size-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center flex-shrink-0 shadow-lg transition-transform ${activeStudio === i ? 'scale-110' : 'group-hover:scale-105'}`}>
                                        <span className="material-symbols-outlined text-white text-xl">{s.icon}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className={`font-bold text-sm whitespace-nowrap ${activeStudio === i ? 'text-white' : 'text-slate-400'}`}>{s.name}</h3>
                                            <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-500 hidden lg:inline">{s.tag}</span>
                                        </div>
                                        <p className="text-slate-600 text-[11px] truncate hidden lg:block mt-0.5">{s.desc.slice(0, 50)}...</p>
                                    </div>
                                    {activeStudio === i && <div className="hidden lg:block ml-auto"><span className="material-symbols-outlined text-sm" style={{ color: s.accentHex }}>chevron_right</span></div>}
                                </button>
                            ))}
                        </div>

                        {/* Right: Studio preview panel */}
                        <div className="relative min-h-[400px] lg:min-h-[600px]">
                            {studios.map((s, i) => (
                                <div key={i} className={`${activeStudio === i ? 'opacity-100 scale-100 z-10' : 'opacity-0 scale-95 z-0 pointer-events-none'} absolute inset-0 transition-all duration-500`}>
                                    <div className="rounded-3xl p-6 md:p-8 h-full flex flex-col" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${s.accentHex}20` }}>
                                        {/* Preview header */}
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className={`size-12 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-lg`}>
                                                    <span className="material-symbols-outlined text-white text-2xl">{s.icon}</span>
                                                </div>
                                                <div>
                                                    <h3 className="text-white font-bold text-xl">{s.name}</h3>
                                                    <p className="text-slate-500 text-xs">{s.tag} • AI-Powered</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex gap-1.5">
                                                    <div className="size-3 rounded-full bg-red-500/40" />
                                                    <div className="size-3 rounded-full bg-yellow-500/40" />
                                                    <div className="size-3 rounded-full bg-green-500/40" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Animated SVG preview */}
                                        <div className="flex-1 rounded-2xl overflow-hidden relative" style={{ border: `1px solid ${s.accentHex}15` }}>
                                            {s.preview()}
                                        </div>

                                        {/* Preview footer */}
                                        <div className="mt-6 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                            <p className="text-slate-500 text-xs max-w-md">{s.desc}</p>
                                            <Link to={`/studio/${s.slug}`} className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors" style={{ color: s.accentHex }}>
                                                <span>Explore</span>
                                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  FIDATO AI ASSISTANT HIGHLIGHT                         */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section className="py-24 relative overflow-hidden">
                    {/* Ambient glow */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sky-500/[0.04] rounded-full blur-[120px]" />
                    </div>

                    <div className="max-w-5xl mx-auto px-6 relative z-10">
                        <div className="text-center mb-12">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
                                style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', color: '#38bdf8' }}>
                                <span className="material-symbols-outlined text-sm">smart_toy</span>
                                Meet Your AI Marketing Partner
                            </div>
                            <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                                Fidato. <span className="bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">Your Brand OS Concierge.</span>
                            </h2>
                            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                                One command bar to rule all 12 studios. Ask anything, run skills, generate content, switch studios — Fidato orchestrates your entire marketing stack.
                            </p>
                        </div>

                        {/* Command bar mockup */}
                        <div className="max-w-2xl mx-auto mb-12">
                            <div className="rounded-2xl p-1" style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.15), rgba(139,92,246,0.1))', border: '1px solid rgba(14,165,233,0.2)' }}>
                                <div className="rounded-xl px-5 py-4 flex items-center gap-4" style={{ background: 'rgba(7,7,15,0.9)' }}>
                                    <div className="size-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-sky-500/20">
                                        <span className="text-white font-black text-lg">F</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white text-sm font-medium">"Create a Diwali campaign for my skincare brand with posts, reels & ad copy"</p>
                                        <p className="text-sky-400/60 text-[10px] mt-1 font-semibold">Fidato will auto-route to Brainstorm → Content → Creative → Calendar</p>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-600 text-xs font-mono px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        ⌘K
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Three capability highlights */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { icon: 'bolt', title: 'Instant Answers', desc: 'Ask brand questions, get instant strategy advice, competitive insights & trend analysis — all contextual to your brand.', color: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-400' },
                                { icon: 'hub', title: 'Cross-Studio Orchestration', desc: 'One prompt triggers multiple studios. Fidato plans, delegates & combines outputs — like having a marketing team on call.', color: 'from-sky-500/20 to-blue-500/20', iconColor: 'text-sky-400' },
                                { icon: 'build_circle', title: 'Skills on Demand', desc: 'Run any custom skill directly from the command bar. Festival campaigns, product launches, email sequences — one command away.', color: 'from-lime-500/20 to-green-500/20', iconColor: 'text-lime-400' },
                            ].map((c, i) => (
                                <div key={i} className="rounded-2xl p-6 transition-all hover:translate-y-[-2px]" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div className={`size-12 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center mb-4`} style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span className={`material-symbols-outlined text-2xl ${c.iconColor}`}>{c.icon}</span>
                                    </div>
                                    <h3 className="text-white font-bold text-lg mb-2">{c.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{c.desc}</p>
                                </div>
                            ))}
                        </div>
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
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Legal</h4>
                            <ul className="space-y-3">
                                <li><Link to="/privacy-policy" className="text-slate-500 hover:text-primary text-sm transition-colors">Privacy Policy</Link></li>
                                <li><Link to="/terms" className="text-slate-500 hover:text-primary text-sm transition-colors">Terms of Service</Link></li>
                                <li><Link to="/data-deletion" className="text-slate-500 hover:text-primary text-sm transition-colors">Data Deletion</Link></li>
                                <li><a href="mailto:support@mantram.ai" className="text-slate-500 hover:text-primary text-sm transition-colors">Support</a></li>
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
                .animate-float, .st-float { animation: float 3s ease-in-out infinite }

                @keyframes glow-pulse { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
                .animate-glow-pulse { animation: glow-pulse 3s ease-in-out infinite }

                /* Studio SVG animations */
                @keyframes st-type-anim { 0% { transform: scaleX(0); opacity: 0 } 40% { opacity: 1 } 100% { transform: scaleX(1); opacity: 1 } }
                .st-type { transform-origin: left center; animation: st-type-anim 2s ease-out forwards; opacity: 0 }

                @keyframes st-blink-anim { 0%, 100% { opacity: 0 } 50% { opacity: 1 } }
                .st-blink { animation: st-blink-anim 1s step-end infinite }

                @keyframes st-pulse-anim { 0%, 100% { transform: scale(1); opacity: 0.7 } 50% { transform: scale(1.15); opacity: 1 } }
                .st-pulse { animation: st-pulse-anim 2.5s ease-in-out infinite }

                @keyframes st-fade-in-anim { 0% { opacity: 0; transform: translateY(6px) } 100% { opacity: 1; transform: translateY(0) } }
                .st-fade-in { animation: st-fade-in-anim 0.8s ease-out forwards; opacity: 0 }

                @keyframes st-scale-in-anim { 0% { transform: scale(0); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
                .st-scale-in { animation: st-scale-in-anim 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; opacity: 0 }

                @keyframes st-slide-up-anim { 0% { opacity: 0; transform: translateY(15px) } 100% { opacity: 1; transform: translateY(0) } }
                .st-slide-up { animation: st-slide-up-anim 0.7s ease-out forwards; opacity: 0 }

                @keyframes st-orbit-anim { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
                .st-orbit { animation: st-orbit-anim 12s linear infinite }
                @keyframes st-orbit-rev { 0% { transform: rotate(360deg) } 100% { transform: rotate(0deg) } }
                .st-orbit-reverse { animation: st-orbit-rev 15s linear infinite }

                @keyframes st-draw-anim { 0% { stroke-dashoffset: 500 } 100% { stroke-dashoffset: 0 } }
                .st-draw-path { animation: st-draw-anim 2.5s ease-out forwards }

                @keyframes st-grow-bar-anim { 0% { transform: scaleY(0) } 100% { transform: scaleY(1) } }
                .st-grow-bar { animation: st-grow-bar-anim 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; transform: scaleY(0) }

                @keyframes st-ripple-anim { 0% { transform: scale(1); opacity: 0.5 } 100% { transform: scale(1.6); opacity: 0 } }
                .st-ripple { animation: st-ripple-anim 2s ease-out infinite }

                @keyframes st-progress-anim { 0% { width: 0 } 100% { width: 70px } }
                .st-progress { animation: st-progress-anim 3s ease-in-out infinite alternate }
                @keyframes st-progress-dot-anim { 0% { cx: 100 } 100% { cx: 170 } }
                .st-progress-dot { animation: st-progress-dot-anim 3s ease-in-out infinite alternate }

                @keyframes st-scroll-anim { 0% { transform: translateX(0) } 100% { transform: translateX(-96px) } }
                .st-scroll-left { animation: st-scroll-anim 4s linear infinite }

                @keyframes st-bounce-anim { 0%, 100% { transform: translateY(0); opacity: 0.3 } 50% { transform: translateY(-4px); opacity: 1 } }
                .st-bounce { animation: st-bounce-anim 1.2s ease-in-out infinite }

                @keyframes st-glow-anim { 0%, 100% { transform: scale(1); opacity: 0.4 } 50% { transform: scale(1.3); opacity: 0.8 } }
                .st-glow { animation: st-glow-anim 3s ease-in-out infinite }

                @keyframes st-sparkle-anim { 0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg) } 50% { opacity: 1; transform: scale(1.2) rotate(180deg) } }
                .st-sparkle { animation: st-sparkle-anim 2s ease-in-out infinite }

                @keyframes st-pulse-color-anim { 0%, 100% { opacity: 0.7; r: 10 } 50% { opacity: 1; r: 12 } }
                .st-pulse-color { animation: st-pulse-color-anim 2s ease-in-out infinite }

                @keyframes st-circle-fill-anim { 0% { stroke-dashoffset: 188 } 100% { stroke-dashoffset: 0 } }
                .st-circle-fill { animation: st-circle-fill-anim 1.5s ease-out forwards; stroke-dashoffset: 188 }

                .studio-scrollbar::-webkit-scrollbar { width: 4px; height: 4px }
                .studio-scrollbar::-webkit-scrollbar-track { background: transparent }
                .studio-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px }
                .studio-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15) }
            `}</style>
        </div>
    )
}

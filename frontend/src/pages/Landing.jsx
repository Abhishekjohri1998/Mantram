import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SEOHead from '../components/SEOHead'

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
            <SEOHead
                title="Mantram AI — AI-Powered Marketing Operating System | 8 Studios, One Platform"
                description="Mantram AI is an AI-powered marketing operating system with 8 specialized studios — Content, Creative, Video, Performance Ads, SEO, D2C, Conversations & Brainstorm. Plus Skill Hub, GEO, Fidato AI & more. Generate brand-aligned content at scale."
                canonical="/"
                ogTitle="Mantram AI — AI-Powered Marketing Operating System"
                ogDescription="8 AI studios. One platform. From brand DNA extraction to content creation, video production, ad optimization, SEO intelligence & e-commerce analytics — Mantram AI is your full-stack marketing OS."
                ogImage="https://mantram.ai/mantram-logo.png"
                twitterTitle="Mantram AI — 8 AI Studios + Skill Hub & GEO"
                twitterDescription="AI content, design, video, ads, SEO, D2C intelligence, Skill Hub & GEO — 8 studios, all brand-aligned, one platform."
                aiSummary="Mantram AI is a full-stack AI marketing platform with 8 studios: Content Studio, Creative Studio, Video Studio, Performance Studio, SEO Studio, D2C Studio, Conversation Studio, Brainstorm Studio. Platform features include Skill Hub (custom AI workflows), GEO (Generative Engine Optimization), Fidato AI Assistant, Smart Calendar, Analytics, Brand DNA Engine, and Multi-Model AI. Built for D2C brands, agencies, and marketers."
            />
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
                        <Link to="/about" className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">About Us</Link>
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
                        <div className="space-y-7">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest"
                                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa' }}>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                                </span>
                                Now Accepting Early Access
                            </div>

                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-[1.05] tracking-tight">
                                Your brand’s<br />
                                <span className="bg-gradient-to-r from-violet-400 via-primary to-cyan-400 bg-clip-text text-transparent">AI marketing team.</span>
                            </h1>

                            <p className="text-slate-400 text-lg md:text-xl max-w-lg leading-relaxed">
                                8 AI studios. 20+ models. 20+ languages. From brand intelligence to ad films, social posts, SEO strategy & e-commerce analytics — Mantram AI is<span className="text-white font-semibold"> your strategic brand consultant</span>, not just another tool.
                            </p>

                            <div className="flex flex-wrap gap-2">
                                {['🎬 Ad Films', '📱 Social Posts', '🌐 20+ Languages', '📊 Performance Analytics', '🔍 GEO'].map((t, i) => (
                                    <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.12)', color: '#c4b5fd' }}>{t}</span>
                                ))}
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4">
                                <button onClick={() => navigate('/auth')} className="px-8 py-4 bg-gradient-to-r from-violet-600 to-primary hover:from-violet-500 hover:to-primary-light text-white font-bold text-lg rounded-xl shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-2 justify-center">
                                    <span className="material-symbols-outlined">rocket_launch</span>
                                    Start Building
                                </button>
                                <button onClick={() => scrollTo('studios')} className="px-8 py-4 bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold text-lg rounded-xl transition-all cursor-pointer flex items-center gap-2 justify-center" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <span className="material-symbols-outlined">play_circle</span>
                                    Explore Studios
                                </button>
                            </div>

                            <div className="flex flex-wrap items-center gap-4 md:gap-6 pt-2">
                                {[
                                    { icon: 'psychology', text: '20+ AI Models' },
                                    { icon: 'translate', text: '20+ Languages' },
                                    { icon: 'insights', text: 'Deep Analytics' },
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
                            { value: '8', label: 'AI Studios', icon: 'dashboard' },
                            { value: '20+', label: 'AI Models', icon: 'psychology' },
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
                {/*  SOCIAL MEDIA PLATFORMS MARQUEE                         */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section className="py-14 overflow-hidden">
                    <p className="text-center text-slate-600 text-xs font-bold uppercase tracking-[0.25em] mb-10">Create & publish content for every platform</p>
                    <div className="relative">
                        {/* Fade edges */}
                        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#07070f] to-transparent z-10" />
                        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#07070f] to-transparent z-10" />
                        <div className="flex gap-12 animate-marquee">
                            {[...Array(2)].map((_, setIdx) => (
                                <div key={setIdx} className="flex gap-12 shrink-0">
                                    {[
                                        { name: 'Instagram', color: '#E4405F', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
                                        { name: 'Facebook', color: '#1877F2', path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z' },
                                        { name: 'LinkedIn', color: '#0A66C2', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
                                        { name: 'X (Twitter)', color: '#ffffff', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
                                        { name: 'YouTube', color: '#FF0000', path: 'M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z' },
                                        { name: 'TikTok', color: '#ffffff', path: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z' },
                                        { name: 'Pinterest', color: '#E60023', path: 'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24 18.635 24 24 18.633 24 12.013 24 5.393 18.635 0 12.017 0z' },
                                        { name: 'WhatsApp', color: '#25D366', path: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z' },
                                        { name: 'Threads', color: '#ffffff', path: 'M12.186 24h-.007C5.461 23.986.057 18.575.043 11.839.039 8.669 1.224 5.696 3.379 3.444 5.533 1.188 8.414-.003 11.587 0H12c3.193 0 6.087 1.194 8.252 3.459A11.797 11.797 0 0123.957 12v.014c-.012 6.715-5.402 12.14-12.07 12.186h-.701zm.393-5.345c3.527 0 5.672-2.003 5.672-5.299 0-2.108-1.044-3.662-3.022-4.503-.367-.154-.762-.284-1.17-.395a8.37 8.37 0 00-.102-.532c-.433-1.882-1.548-2.916-3.14-2.916-1.622 0-2.809 1.074-2.809 2.543 0 1.302.858 2.191 2.087 2.191.49 0 .897-.145 1.224-.365-.075-.504-.11-.737-.11-.998 0-.937.535-1.472 1.463-1.472.855 0 1.413.66 1.672 1.978.091.462.143.963.155 1.49-1.348-.142-2.571-.134-3.647.031-2.188.335-3.573 1.667-3.573 3.44 0 1.25.58 2.318 1.583 2.917.85.507 1.898.727 3.016.627 1.654-.148 2.86-.926 3.588-2.312.063.506.184.923.378 1.272.358.643.987 1.017 1.726 1.024h.01c.8 0 1.464-.401 1.868-1.129l-1.325-.842c-.177.298-.406.44-.688.44-.319 0-.553-.21-.7-.624-.12-.34-.18-.796-.18-1.353V12c0-.156-.004-.312-.012-.465a7.358 7.358 0 00-.108-1.106c.538.122 1.04.279 1.499.475 1.488.635 2.268 1.685 2.268 3.049 0 2.59-1.664 4.101-4.57 4.101-3.466.001-5.545-2.319-5.545-6.199 0-3.939 2.093-6.329 5.522-6.335h.023c2.19 0 3.863.89 4.975 2.647l1.354-.89C17.803 4.927 15.61 3.755 12.88 3.75h-.027C8.618 3.758 6.026 6.612 6.026 11.855c0 5.186 2.579 8.025 7.265 8.025h-.712z' },
                                        { name: 'Google Business', color: '#4285F4', path: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z' },
                                    ].map((p, i) => (
                                        <div key={`${setIdx}-${i}`} className="flex flex-col items-center gap-3 group cursor-pointer" title={p.name}>
                                            <div className="size-16 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                <svg viewBox="0 0 24 24" className="size-8 transition-colors" style={{ fill: p.color, opacity: 0.8 }}>
                                                    <path d={p.path} />
                                                </svg>
                                            </div>
                                            <span className="text-[11px] text-slate-500 font-semibold whitespace-nowrap">{p.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  STUDIOS SHOWCASE                                      */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section id="studios" className="max-w-7xl mx-auto px-6 py-24">
                    <div className="text-center mb-16">
                        <p className="text-primary text-sm font-bold uppercase tracking-widest mb-3">The Studio Ecosystem</p>
                        <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                            8 Studios. <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">One Platform.</span>
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">Every marketing function — content, design, video, ads, SEO, e-commerce, conversations & strategy — each powered by specialized AI agent teams.</p>
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
                {/*  SKILL HUB — FLAGSHIP HIGHLIGHT                        */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section className="py-24 relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-lime-500/[0.04] rounded-full blur-[150px]" />
                    </div>
                    <div className="max-w-6xl mx-auto px-6 relative z-10">
                        <div className="rounded-3xl p-1 mb-16" style={{ background: 'linear-gradient(135deg, rgba(132,204,22,0.25), rgba(16,185,129,0.15), rgba(132,204,22,0.25))', boxShadow: '0 0 60px rgba(132,204,22,0.08)' }}>
                            <div className="rounded-[20px] p-8 md:p-12" style={{ background: 'rgba(7,7,15,0.95)' }}>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                                    <div>
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-5"
                                            style={{ background: 'rgba(132,204,22,0.12)', border: '1px solid rgba(132,204,22,0.25)', color: '#a3e635' }}>
                                            <span>⭐</span> Flagship Feature
                                        </div>
                                        <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                                            What if <span className="bg-gradient-to-r from-lime-400 to-emerald-400 bg-clip-text text-transparent">you could build your own AI marketing team?</span>
                                        </h2>
                                        <p className="text-slate-400 text-base leading-relaxed mb-4">
                                            Skill Hub isn't just another automation tool — it's your personal marketing skill factory. Build custom AI workflows that think, create and execute like your best team member, on demand, every time.
                                        </p>
                                        <p className="text-slate-500 text-sm leading-relaxed mb-6 italic">
                                            "Create a Diwali campaign" → Your skill generates 10 posts, 5 reels, ad copy, email sequence & a content calendar. In 60 seconds. Every year.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {['Product Launch', 'Festival Campaign', 'Email Sequence', 'WhatsApp Broadcast', 'Social Calendar', 'Ad Copy Generator'].map((skill, i) => (
                                                <span key={i} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(132,204,22,0.08)', border: '1px solid rgba(132,204,22,0.15)', color: '#a3e635' }}>
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        {[
                                            { icon: '🚀', label: 'Product\nLaunch' },
                                            { icon: '🎉', label: 'Festival\nCampaign' },
                                            { icon: '📧', label: 'Email\nSequence' },
                                            { icon: '💬', label: 'WhatsApp\nBroadcast' },
                                            { icon: '📅', label: 'Social\nCalendar' },
                                            { icon: '✍️', label: 'Ad Copy\nGenerator' },
                                        ].map((s, i) => (
                                            <div key={i} className="rounded-xl p-4 text-center transition-all hover:scale-105" style={{ background: 'rgba(132,204,22,0.04)', border: '1px solid rgba(132,204,22,0.1)' }}>
                                                <span className="text-2xl block mb-2">{s.icon}</span>
                                                <span className="text-[10px] text-lime-300/80 font-semibold whitespace-pre-line leading-tight">{s.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* GEO Highlight */}
                        <div className="rounded-3xl p-1 mb-16" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15), rgba(6,182,212,0.2))', boxShadow: '0 0 60px rgba(59,130,246,0.06)' }}>
                            <div className="rounded-[20px] p-8 md:p-12" style={{ background: 'rgba(7,7,15,0.95)' }}>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                                    <div>
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-5"
                                            style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
                                            <span className="material-symbols-outlined text-xs">travel_explore</span> The Future of Search
                                        </div>
                                        <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                                            Google is <span className="line-through text-slate-600">not</span> the only search engine anymore. <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">Is your brand ready?</span>
                                        </h2>
                                        <p className="text-slate-400 text-base leading-relaxed mb-4">
                                            When someone asks ChatGPT, Perplexity or Claude about your industry — does your brand show up? GEO (Generative Engine Optimization) ensures your content is visible where the next billion searches happen.
                                        </p>
                                        <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.1)' }}>
                                            <p className="text-blue-300/80 text-sm font-medium italic">"🔍 What's the best skincare brand for oily skin in India?"</p>
                                            <p className="text-slate-500 text-xs mt-2">GEO ensures your brand appears in AI-generated answers, not just traditional search results.</p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                                            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" /> AI Search Visibility</span>
                                            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-violet-500" /> LLM Brand Probe</span>
                                            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-cyan-500" /> Prompt Mining</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <div className="relative">
                                            <div className="size-44 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.1), transparent 70%)', border: '1px solid rgba(59,130,246,0.1)' }}>
                                                <div className="size-28 rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)', border: '1px solid rgba(139,92,246,0.1)' }}>
                                                    <span className="text-4xl">🌐</span>
                                                </div>
                                            </div>
                                            {[
                                                { label: 'ChatGPT', x: -70, y: -50 },
                                                { label: 'Perplexity', x: 70, y: -50 },
                                                { label: 'Gemini', x: -65, y: 50 },
                                                { label: 'Claude', x: 65, y: 50 },
                                            ].map((ai, i) => (
                                                <div key={i} className="absolute px-2.5 py-1 rounded-lg text-[10px] font-bold" style={{ left: `calc(50% + ${ai.x}px)`, top: `calc(50% + ${ai.y}px)`, transform: 'translate(-50%, -50%)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', color: '#93c5fd' }}>
                                                    {ai.label}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Fidato + Other Features Grid */}
                        <div className="text-center mb-10">
                            <p className="text-cyan-400 text-sm font-bold uppercase tracking-widest mb-3">Platform Features</p>
                            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                                Beyond Studios. <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">Powerful Platform Features.</span>
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {[
                                { icon: 'smart_toy', title: 'Fidato AI Assistant', desc: 'One command bar to rule all studios. Ask anything, run skills, generate content — Fidato orchestrates your entire marketing stack.', color: 'from-sky-500/20 to-blue-500/20', iconColor: 'text-sky-400', accent: 'rgba(14,165,233,0.15)' },
                                { icon: 'calendar_month', title: 'Smart Calendar', desc: 'Marketing intelligence calendar — trending moments, festivals, and AI-suggested content dates with platform-aware scheduling.', color: 'from-teal-500/20 to-emerald-500/20', iconColor: 'text-teal-400', accent: 'rgba(20,184,166,0.15)' },
                                { icon: 'analytics', title: 'Analytics Intelligence', desc: 'Traffic intelligence, audience insights, Google Analytics integration & AI-powered growth strategies.', color: 'from-indigo-500/20 to-violet-500/20', iconColor: 'text-indigo-400', accent: 'rgba(99,102,241,0.15)' },
                                { icon: 'genetics', title: 'Brand DNA Engine', desc: 'Scan any website in 60 seconds. AI extracts logo, colors, fonts, voice & visual identity — used across every studio.', color: 'from-violet-500/20 to-purple-500/20', iconColor: 'text-violet-400', accent: 'rgba(139,92,246,0.15)' },
                                { icon: 'auto_awesome', title: 'Multi-Model AI', desc: 'Access Gemini, Claude, GPT-4o, Grok & Imagen in one platform. Each task routes to the best model automatically.', color: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-400', accent: 'rgba(245,158,11,0.15)' },
                                { icon: 'trending_up', title: 'Real-Time Trends', desc: 'Google Trends + Grok-powered intelligence feeds every studio with what\'s trending NOW — always relevant content.', color: 'from-emerald-500/20 to-teal-500/20', iconColor: 'text-emerald-400', accent: 'rgba(16,185,129,0.15)' },
                            ].map((f, i) => (
                                <div key={i} className="rounded-2xl p-6 transition-all duration-300 hover:translate-y-[-3px] group" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div className={`size-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`} style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span className={`material-symbols-outlined text-2xl ${f.iconColor}`}>{f.icon}</span>
                                    </div>
                                    <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
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
                {/*  BUILT FOR EVERY BUSINESS                              */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section className="max-w-7xl mx-auto px-6 py-24">
                    <div className="text-center mb-16">
                        <p className="text-pink-400 text-sm font-bold uppercase tracking-widest mb-3">One Platform, Every Scale</p>
                        <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                            Built for <span className="bg-gradient-to-r from-pink-400 via-rose-400 to-orange-400 bg-clip-text text-transparent">every business.</span>
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            Whether you're a solo creator or a Fortune 500 brand — Mantram AI adapts to your scale, your goals, and your ambition.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {[
                            { emoji: '🚀', segment: 'Solopreneurs', tagline: 'Your entire team, for one', desc: 'Content, design, video, ads — all from one dashboard. No freelancers, no agencies. Just you and your AI marketing team.', highlights: ['1-click content', 'Brand consistency', 'Zero learning curve'], gradient: 'from-violet-500/20 to-purple-500/20', border: 'rgba(139,92,246,0.2)' },
                            { emoji: '📈', segment: 'SMBs', tagline: 'Enterprise power, startup speed', desc: 'Compete with brands 10x your size. AI-powered strategy, analytics & content production at a fraction of the cost.', highlights: ['Market intelligence', 'Competitor tracking', 'Budget-smart campaigns'], gradient: 'from-blue-500/20 to-cyan-500/20', border: 'rgba(59,130,246,0.2)' },
                            { emoji: '🛒', segment: 'D2C Brands', tagline: 'From product to purchase', desc: 'Shopify intelligence, product campaigns, catalog content, performance analytics & conversion optimization — all connected.', highlights: ['Shopify integration', 'Product velocity', 'ROAS optimization'], gradient: 'from-emerald-500/20 to-teal-500/20', border: 'rgba(16,185,129,0.2)' },
                            { emoji: '🏢', segment: 'Agencies', tagline: 'Scale without hiring', desc: 'Manage multiple brands, each with unique DNA. White-label quality output, team collaboration & client-ready reports.', highlights: ['Multi-brand mgmt', 'Team collaboration', 'White-label output'], gradient: 'from-amber-500/20 to-orange-500/20', border: 'rgba(245,158,11,0.2)' },
                            { emoji: '🌐', segment: 'Corporates', tagline: 'Enterprise intelligence', desc: 'Deep market analytics, brand governance, multi-region campaigns, vernacular localization & ad platform optimization at scale.', highlights: ['Brand governance', 'Multi-region', '20+ languages'], gradient: 'from-rose-500/20 to-pink-500/20', border: 'rgba(244,63,94,0.2)' },
                        ].map((s, i) => (
                            <div key={i} className="rounded-2xl p-6 transition-all duration-300 hover:translate-y-[-4px] flex flex-col"
                                style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${s.border}` }}>
                                <span className="text-3xl mb-3">{s.emoji}</span>
                                <h3 className="text-white font-bold text-lg mb-1">{s.segment}</h3>
                                <p className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider mb-3">{s.tagline}</p>
                                <p className="text-slate-400 text-sm leading-relaxed mb-4 flex-grow">{s.desc}</p>
                                <div className="space-y-1.5">
                                    {s.highlights.map((h, j) => (
                                        <div key={j} className="flex items-center gap-2 text-xs text-slate-500">
                                            <span className="size-1.5 rounded-full bg-current shrink-0" />
                                            {h}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  AD FILMS + VERNACULAR + CONTENT HIGHLIGHTS            */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section className="py-20" style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.03) 0%, transparent 100%)' }}>
                    <div className="max-w-7xl mx-auto px-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Ad Films & Social Content */}
                            <div className="rounded-2xl p-8 transition-all hover:translate-y-[-2px]"
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="size-12 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-2xl text-rose-400">movie</span>
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold text-xl">Ad Films & Social Posts</h3>
                                        <p className="text-slate-500 text-xs">Create studio-quality content at scale</p>
                                    </div>
                                </div>
                                <p className="text-slate-400 text-sm leading-relaxed mb-5">
                                    From scroll-stopping reels to brand ad films — generate professional video content, carousel posts, story templates & ad creatives. Multi-model video AI (Seedance, Kling, Veo 2) meets your brand DNA.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {['🎬 Ad Films', '📱 Reels & Stories', '🎨 Carousels', '📸 AI Photoshoots', '🖼️ Banner Ads'].map((t, i) => (
                                        <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.12)', color: '#fda4af' }}>{t}</span>
                                    ))}
                                </div>
                            </div>

                            {/* Vernacular & Global */}
                            <div className="rounded-2xl p-8 transition-all hover:translate-y-[-2px]"
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="size-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-2xl text-cyan-400">translate</span>
                                    </div>
                                    <div>
                                        <h3 className="text-white font-bold text-xl">20+ Languages, One Brand Voice</h3>
                                        <p className="text-slate-500 text-xs">Vernacular content that actually sounds local</p>
                                    </div>
                                </div>
                                <p className="text-slate-400 text-sm leading-relaxed mb-5">
                                    Create content in Hindi, Tamil, Telugu, Bengali, Marathi, Spanish, French, Arabic, Japanese & 15+ more languages. Not just translation — culturally localized, market-aware content that resonates with local audiences globally.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {['हिन्दी', 'தமிழ்', 'తెలుగు', 'বাংলা', 'Español', 'Français', 'العربية', '日本語', 'Deutsch', 'Português'].map((lang, i) => (
                                        <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.12)', color: '#67e8f9' }}>{lang}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════ */}
                {/*  HOW IT WORKS                                          */}
                {/* ═══════════════════════════════════════════════════════ */}
                <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-24">
                    <div className="text-center mb-16">
                        <p className="text-amber-400 text-sm font-bold uppercase tracking-widest mb-3">Your Strategic Journey</p>
                        <h2 className="text-4xl md:text-5xl font-black text-white mb-5">
                            Three steps to <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">strategic growth.</span>
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { step: '01', icon: 'genetics', title: 'Deep Brand Intelligence', desc: 'Paste your website URL. Our AI runs a 360° brand scan — extracting DNA, competitive landscape, market positioning, audience insights & growth opportunities. Not just colors and fonts — strategic intelligence.', gradient: 'from-violet-500 to-purple-600' },
                            { step: '02', icon: 'psychology', title: 'Strategize & Create', desc: '8 AI studios act as your strategic team — each with specialized agents for content strategy, visual identity, video production, ad optimization, SEO intelligence & market analysis. Every output is data-informed.', gradient: 'from-primary to-blue-600' },
                            { step: '03', icon: 'insights', title: 'Analyze, Optimize & Scale', desc: 'Real-time performance analytics, D2C intelligence, GEO optimization & AI-powered growth strategies. Connect ad platforms, Shopify & social accounts — Mantram analyzes what works and amplifies it automatically.', gradient: 'from-cyan-500 to-teal-600' },
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
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
                        <div className="col-span-2">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="size-8 rounded-lg overflow-hidden">
                                    <img src="/mantram-logo.png" alt="Mantram AI" className="size-8" />
                                </div>
                                <span className="text-white text-xl font-bold">Mantram <span className="text-primary">AI</span></span>
                            </div>
                            <p className="text-slate-500 text-sm max-w-sm leading-relaxed mb-6">
                                The AI-powered marketing operating system. 8 studios, Skill Hub, GEO & infinite possibilities. From brand DNA to published content in minutes.
                            </p>
                            <div className="flex gap-3">
                                {[
                                    { label: 'X / Twitter', href: 'https://twitter.com/mantram_ai', path: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' },
                                    { label: 'LinkedIn', href: 'https://linkedin.com/company/mantram-ai', path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z' },
                                    { label: 'Instagram', href: 'https://instagram.com/mantram.ai', path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z' },
                                ].map((s, i) => (
                                    <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="size-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-all cursor-pointer" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d={s.path} /></svg>
                                    </a>
                                ))}
                                <a href="mailto:support@mantram.ai" aria-label="Email" className="size-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-white transition-all cursor-pointer" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span className="material-symbols-outlined text-lg">mail</span>
                                </a>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Platform</h4>
                            <ul className="space-y-3">
                                <li><button onClick={() => scrollTo('studios')} className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">Studios</button></li>
                                <li><Link to="/onboarding" className="text-slate-500 hover:text-primary text-sm transition-colors">Brand DNA</Link></li>
                                <li><button onClick={() => scrollTo('early-access')} className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">Skill Hub</button></li>
                                <li><button onClick={() => scrollTo('early-access')} className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">GEO</button></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-4">Resources</h4>
                            <ul className="space-y-3">
                                <li><Link to="/about" className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">About Us</Link></li>
                                <li><button onClick={() => scrollTo('how-it-works')} className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">How It Works</button></li>
                                <li><button onClick={() => scrollTo('usps')} className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">Why Mantram</button></li>
                                <li><button onClick={() => scrollTo('early-access')} className="text-slate-500 hover:text-primary text-sm transition-colors cursor-pointer">Early Access</button></li>
                                <li><a href="mailto:support@mantram.ai" className="text-slate-500 hover:text-primary text-sm transition-colors">Contact Us</a></li>
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

                @keyframes marquee { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
                .animate-marquee { animation: marquee 30s linear infinite; display: flex; width: max-content; }
                .animate-marquee:hover { animation-play-state: paused; }

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

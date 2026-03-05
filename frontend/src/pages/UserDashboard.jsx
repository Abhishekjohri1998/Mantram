import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, creatives as creativesAPI, trends as trendsAPI, dashboardSummary, shopifyAnalytics } from '../services/api'
import { getUpcomingEvents, EVENT_COLORS } from '../data/calendarData'
import SmartCommandBox from '../components/SmartCommandBox'

// ── Helpers ──
function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good Morning'
    if (h < 17) return 'Good Afternoon'
    return 'Good Evening'
}

function getDateString() {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Typewriter Hook ──
function useTypewriter(text, speed = 40) {
    const [displayed, setDisplayed] = useState('')
    const [done, setDone] = useState(false)
    useEffect(() => {
        setDisplayed('')
        setDone(false)
        if (!text) return
        let i = 0
        const interval = setInterval(() => {
            setDisplayed(text.slice(0, i + 1))
            i++
            if (i >= text.length) { clearInterval(interval); setDone(true) }
        }, speed)
        return () => clearInterval(interval)
    }, [text, speed])
    return { displayed, done }
}

// ── Apple-Watch Health Ring ──
function HealthRing({ score, radius, strokeWidth, color, label, delay = 0 }) {
    const circumference = 2 * Math.PI * radius
    const [animated, setAnimated] = useState(0)
    useEffect(() => {
        const t = setTimeout(() => setAnimated(score), 300 + delay)
        return () => clearTimeout(t)
    }, [score, delay])
    return (
        <g>
            <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
            <circle cx="90" cy="90" r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
                strokeDasharray={circumference} strokeDashoffset={circumference - (animated / 100) * circumference}
                strokeLinecap="round" transform="rotate(-90 90 90)"
                style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)', filter: `drop-shadow(0 0 6px ${color}40)` }} />
        </g>
    )
}

// ── Ticker Item ──
function TickerItem({ icon, value, label, color }) {
    return (
        <div className="flex items-center gap-2.5 px-5 py-2.5 shrink-0">
            <span className="material-symbols-outlined text-lg" style={{ color }}>{icon}</span>
            <span className="text-lg font-extrabold text-white">{value}</span>
            <span className="text-sm text-slate-500 whitespace-nowrap">{label}</span>
        </div>
    )
}

// ═════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═════════════════════════════════════════════════════════════════════
export default function UserDashboard() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { brands, activeBrand, selectBrand, loading: brandsLoading } = useBrand()

    const [summary, setSummary] = useState(null)
    const [loadingSummary, setLoadingSummary] = useState(true)
    const [trendingTopics, setTrendingTopics] = useState([])
    const [trendsLoading, setTrendsLoading] = useState(false)
    const [recentContent, setRecentContent] = useState([])
    const [stats, setStats] = useState({ content: 0, creatives: 0 })
    const [activeTab, setActiveTab] = useState('trends')
    const [radarHover, setRadarHover] = useState(null)
    const [d2cSnapshot, setD2cSnapshot] = useState(null)



    const country = activeBrand?.dna?.country || activeBrand?.country || 'India'
    const upcoming = useMemo(() => getUpcomingEvents(country, 14), [country])
    const greetingText = `${getGreeting()}, ${user?.name?.split(' ')[0] || 'Creator'}`
    const { displayed: typedGreeting, done: greetingDone } = useTypewriter(greetingText)

    // ── Loaders ──
    const loadSummary = useCallback(async () => {
        setLoadingSummary(true)
        try { setSummary(await dashboardSummary.get(activeBrand?._id)) }
        catch (e) { console.warn('Dashboard summary error:', e.message) }
        finally { setLoadingSummary(false) }
    }, [activeBrand?._id])

    const loadTrends = useCallback(async () => {
        setTrendsLoading(true)
        try {
            const data = activeBrand?._id ? await trendsAPI.brandMatch(activeBrand._id) : await trendsAPI.now()
            setTrendingTopics(data.trends || [])
        } catch (e) { console.warn('Trends error:', e.message) }
        finally { setTrendsLoading(false) }
    }, [activeBrand?._id])

    // Clear stale data and re-fetch when brand changes
    useEffect(() => {
        setSummary(null)
        setTrendingTopics([])
        setRecentContent([])
        setStats({ content: 0, creatives: 0 })
    }, [activeBrand?._id])

    useEffect(() => {
        async function fetchBasicData() {
            try {
                const params = { limit: 5 }
                if (activeBrand?._id) params.brandId = activeBrand._id
                const [c, cr] = await Promise.all([
                    contentAPI.list(params).catch(() => ({ content: [], total: 0 })),
                    creativesAPI.list(params).catch(() => ({ creatives: [], total: 0 })),
                ])
                setRecentContent(c.content || [])
                setStats({ content: c.total || 0, creatives: cr.total || 0 })
            } catch (e) { console.warn(e) }
        }
        fetchBasicData()
    }, [activeBrand?._id])

    useEffect(() => {
        loadSummary(); loadTrends()
        shopifyAnalytics.snapshot().then(d => setD2cSnapshot(d)).catch(() => { })
        const interval = setInterval(() => { loadTrends(); loadSummary() }, 30 * 60 * 1000)
        return () => clearInterval(interval)
    }, [loadSummary, loadTrends])

    const insight = summary?.dailyInsight
    const health = summary?.healthScores || {}
    const grokTrends = summary?.grokTrends || []
    const grokSeo = summary?.grokSeo || {}
    const grokContent = summary?.grokContent || []
    const businessNews = summary?.businessNews || []
    const didYouKnow = summary?.didYouKnow || []
    const activity = summary?.activity || { content: {}, creatives: {} }
    const streak = summary?.streak || 0
    const radar = summary?.strikesRadar || null

    const studios = [
        { icon: 'psychology', label: 'Brainstorm', path: '/brainstorm', color: '#8b5cf6', bg: 'from-violet-500/15 to-purple-500/5' },
        { icon: 'edit_note', label: 'Content', path: '/content-studio', color: '#34d399', bg: 'from-emerald-500/15 to-emerald-500/5' },
        { icon: 'auto_fix_high', label: 'Creative', path: '/creative-studio', color: '#ec4899', bg: 'from-pink-500/15 to-pink-500/5' },
        { icon: 'movie', label: 'Video', path: '/video-studio', color: '#f59e0b', bg: 'from-amber-500/15 to-amber-500/5' },
        { icon: 'search_insights', label: 'SEO', path: '/seo-studio', color: '#06b6d4', bg: 'from-cyan-500/15 to-cyan-500/5' },
        { icon: 'campaign', label: 'Ads', path: '/performance-marketing', color: '#f43f5e', bg: 'from-rose-500/15 to-rose-500/5' },
        { icon: 'calendar_month', label: 'Calendar', path: '/smart-calendar', color: '#fb923c', bg: 'from-orange-500/15 to-orange-500/5' },
        { icon: 'forum', label: 'Inbox', path: '/conversations', color: '#3b82f6', bg: 'from-blue-500/15 to-blue-500/5' },
    ]

    // Intelligence tab content
    const intelTabs = [
        { id: 'trends', label: '🔥 Trending', count: grokTrends.length + trendingTopics.length },
        { id: 'news', label: '📰 News', count: businessNews.length },
        { id: 'trivia', label: '🧠 Trivia', count: didYouKnow.length },
    ]

    return (
        <DashboardLayout>
            {/* ═══════ CSS Animations ═══════ */}
            <style>{`
                @keyframes gradient-shift { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
                @keyframes glow-pulse { 0%,100% { box-shadow: 0 0 20px rgba(139,92,246,0.15) } 50% { box-shadow: 0 0 40px rgba(139,92,246,0.3), 0 0 60px rgba(6,182,212,0.1) } }
                @keyframes slide-up { from { opacity:0; transform: translateY(20px) } to { opacity:1; transform: translateY(0) } }
                @keyframes ticker-scroll { from { transform: translateX(0) } to { transform: translateX(-50%) } }
                @keyframes border-glow { 0%,100% { border-color: rgba(139,92,246,0.3) } 33% { border-color: rgba(6,182,212,0.3) } 66% { border-color: rgba(52,211,153,0.3) } }
                @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
                @keyframes cursor-blink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
                .anim-slide-up { animation: slide-up 0.6s ease-out both }
                .anim-glow { animation: glow-pulse 3s ease-in-out infinite }
                .anim-border-glow { animation: border-glow 4s ease-in-out infinite }
                .anim-float { animation: float 3s ease-in-out infinite }
                .studio-card { transition: all 0.3s cubic-bezier(0.4,0,0.2,1) }
                .studio-card:hover { transform: translateY(-4px) scale(1.02); box-shadow: 0 12px 40px rgba(0,0,0,0.3) }
                .intel-tab { transition: all 0.25s ease }
                .intel-tab.active { background: rgba(139,92,246,0.15); color: white; border-color: rgba(139,92,246,0.4) }
                .ticker-track { animation: ticker-scroll 30s linear infinite }
                .ticker-track:hover { animation-play-state: paused }
                @keyframes radar-sweep { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
                @keyframes blip-ping { 0%,100% { opacity:0.4; transform: scale(0.8) } 50% { opacity:1; transform: scale(1.3) } }
                .radar-sweep-arm { animation: radar-sweep 4s linear infinite }
                .radar-blip { animation: blip-ping 2s ease-in-out infinite }
            `}</style>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 1. HERO GREETING + STREAK                                      */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-5 gap-3 anim-slide-up">
                <div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
                        {typedGreeting}
                        {!greetingDone && <span className="inline-block w-0.5 h-7 bg-violet-400 ml-1 align-middle" style={{ animation: 'cursor-blink 0.8s step-end infinite' }} />}
                    </h2>
                    <div className="flex items-center gap-3 mt-2">
                        <p className="text-slate-500 text-base">{getDateString()}</p>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">AI Active</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {streak > 0 && (
                        <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 anim-float">
                            <span className="text-xl">🔥</span>
                            <div>
                                <p className="text-sm font-extrabold text-amber-400">{streak}-Day Streak</p>
                                <p className="text-xs text-amber-500/60">Keep creating!</p>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* Smart Command Box */}
            <SmartCommandBox variant="dashboard" className="mb-5" />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 2. MISSION CONTROL — DAILY AI INSIGHT                          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {insight && (
                <div className="mb-6 anim-slide-up" style={{ animationDelay: '100ms' }}>
                    <div className="relative p-6 rounded-2xl overflow-hidden anim-border-glow anim-glow border-2"
                        style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(6,182,212,0.08) 50%, rgba(52,211,153,0.06) 100%)' }}>
                        {/* Ambient orbs */}
                        <div className="absolute -top-24 -right-24 size-48 bg-gradient-to-br from-violet-500/15 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-16 -left-16 size-32 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                            <div className="shrink-0">
                                <div className="size-18 rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-500/25 flex items-center justify-center text-4xl border border-violet-500/20 backdrop-blur-sm anim-float"
                                    style={{ width: '72px', height: '72px' }}>
                                    {insight.emoji || '💡'}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span className="text-xs px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 font-bold uppercase tracking-widest">🤖 AI Mission</span>
                                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${insight.category === 'trend' ? 'bg-orange-500/15 text-orange-300'
                                        : insight.category === 'growth' ? 'bg-emerald-500/15 text-emerald-300'
                                            : insight.category === 'seasonal' ? 'bg-amber-500/15 text-amber-300'
                                                : 'bg-cyan-500/15 text-cyan-300'
                                        }`}>{insight.category}</span>
                                </div>
                                <h3 className="text-xl font-extrabold text-white mb-1">{insight.title}</h3>
                                <p className="text-base text-slate-300 leading-relaxed">{insight.tip}</p>
                            </div>
                            <button onClick={() => navigate(insight.actionPath || '/content-studio')}
                                className="shrink-0 px-7 py-3.5 rounded-xl text-white text-base font-bold transition-all cursor-pointer flex items-center gap-2 hover:scale-105 active:scale-95"
                                style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
                                <span className="material-symbols-outlined text-lg">rocket_launch</span>
                                {insight.actionLabel || 'Act Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 3. LIVE TICKER BAR                                             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="mb-6 rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden anim-slide-up" style={{ animationDelay: '200ms' }}>
                <div className="flex overflow-hidden">
                    <div className="flex ticker-track">
                        {[0, 1].map(dup => (
                            <div key={dup} className="flex">
                                <TickerItem icon="article" value={activity.content?.thisWeek || 0} label="Content this week" color="#8b5cf6" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="image" value={activity.creatives?.thisWeek || 0} label="Creatives this week" color="#06b6d4" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="storefront" value={brands.length} label="Active brands" color="#f59e0b" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="trending_up" value={grokTrends.length + trendingTopics.length} label="Live trends" color="#f43f5e" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="article" value={activity.content?.total || stats.content} label="Total content" color="#8b5cf6" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="image" value={activity.creatives?.total || stats.creatives} label="Total creatives" color="#06b6d4" />
                                <div className="w-px bg-white/[0.06] my-2" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* MAIN COLUMN                                                 */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="col-span-12 lg:col-span-8 space-y-6">

                    {/* ── 4. BRAND HEALTH RINGS ── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-white/[0.06] anim-slide-up" style={{ animationDelay: '250ms' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-emerald-400">monitoring</span>
                            <span className="text-lg font-bold text-white">Brand Health</span>
                            <span className="text-2xl font-extrabold text-white ml-auto">{health.overallScore || 0}<span className="text-sm text-slate-500 font-medium">/100</span></span>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-6">
                            <div className="shrink-0">
                                <svg width="180" height="180" viewBox="0 0 180 180">
                                    <HealthRing score={health.contentVelocity || 0} radius={78} strokeWidth={8} color="#8b5cf6" label="Content" delay={0} />
                                    <HealthRing score={health.creativeOutput || 0} radius={66} strokeWidth={8} color="#06b6d4" label="Creative" delay={100} />
                                    <HealthRing score={health.brandCompleteness || 0} radius={54} strokeWidth={8} color="#f59e0b" label="DNA" delay={200} />
                                    <HealthRing score={health.trendReadiness || 0} radius={42} strokeWidth={8} color="#34d399" label="Trends" delay={300} />
                                </svg>
                            </div>
                            <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                                {[
                                    { label: 'Content Velocity', score: health.contentVelocity, color: '#8b5cf6', icon: 'article' },
                                    { label: 'Creative Output', score: health.creativeOutput, color: '#06b6d4', icon: 'image' },
                                    { label: 'Brand DNA', score: health.brandCompleteness, color: '#f59e0b', icon: 'fingerprint' },
                                    { label: 'Trend Readiness', score: health.trendReadiness, color: '#34d399', icon: 'trending_up' },
                                ].map((m, i) => (
                                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <div className="size-3 rounded-full shrink-0" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}60` }} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-400 truncate">{m.label}</p>
                                            <p className="text-lg font-extrabold text-white">{Math.round(m.score || 0)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── 4b. STRIKES RADAR ── */}
                    {radar && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-white/[0.06] anim-slide-up cursor-pointer group"
                            style={{ animationDelay: '300ms' }}
                            onClick={() => navigate('/d2c-analytics')}>
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-400">radar</span>
                                    <span className="text-lg font-bold text-white">Strikes Radar</span>
                                    <span className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">Live</span>
                                </div>
                                <div className="flex items-center gap-1 text-sm text-slate-500 group-hover:text-primary transition-colors">
                                    <span>Deep Dive</span>
                                    <span className="material-symbols-outlined text-sm group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                </div>
                            </div>

                            {/* Key Metrics Bar */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                {[
                                    { label: 'Total Visitors', value: radar.totalVisitors?.toLocaleString(), icon: 'group', color: '#8b5cf6' },
                                    { label: 'Weekly Growth', value: `${radar.weeklyGrowth > 0 ? '+' : ''}${radar.weeklyGrowth}%`, icon: 'trending_up', color: '#34d399' },
                                    { label: 'Bounce Rate', value: `${radar.bounceRate}%`, icon: 'exit_to_app', color: '#f59e0b' },
                                    { label: 'Avg Session', value: radar.avgSession, icon: 'timer', color: '#06b6d4' },
                                ].map((m, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="material-symbols-outlined text-sm" style={{ color: m.color }}>{m.icon}</span>
                                            <span className="text-xs text-slate-500">{m.label}</span>
                                        </div>
                                        <p className="text-xl font-extrabold text-white">{m.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Charts Row */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                                {/* Animated ATS Radar */}
                                <div className="md:col-span-5">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Traffic Sources</p>
                                    <div className="flex items-center gap-4">
                                        <div className="relative shrink-0" style={{ width: 150, height: 150 }}>
                                            <svg width="150" height="150" viewBox="0 0 150 150" className="absolute inset-0">
                                                {/* Background rings */}
                                                <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                                <circle cx="75" cy="75" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                <circle cx="75" cy="75" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                                <circle cx="75" cy="75" r="20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                {/* Crosshairs */}
                                                <line x1="75" y1="5" x2="75" y2="145" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                <line x1="5" y1="75" x2="145" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                {/* Outer glow ring */}
                                                <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(52,211,153,0.15)" strokeWidth="1.5" />
                                            </svg>
                                            {/* Sweep arm */}
                                            <svg width="150" height="150" viewBox="0 0 150 150" className="absolute inset-0 radar-sweep-arm">
                                                <defs>
                                                    <linearGradient id="sweepGrad" gradientTransform="rotate(90)">
                                                        <stop offset="0%" stopColor="rgba(52,211,153,0.35)" />
                                                        <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                                                    </linearGradient>
                                                </defs>
                                                <path d="M75,75 L75,7 A68,68 0 0,1 139,55 Z" fill="url(#sweepGrad)" />
                                                <line x1="75" y1="75" x2="75" y2="7" stroke="rgba(52,211,153,0.8)" strokeWidth="1.5" />
                                            </svg>
                                            {/* Blips for traffic sources */}
                                            <svg width="150" height="150" viewBox="0 0 150 150" className="absolute inset-0">
                                                {radar.sources?.map((src, i) => {
                                                    const angle = (i / (radar.sources.length)) * 2 * Math.PI - Math.PI / 2
                                                    const dist = 20 + (src.value / 100) * 48
                                                    const cx = 75 + Math.cos(angle) * dist
                                                    const cy = 75 + Math.sin(angle) * dist
                                                    return (
                                                        <g key={i}>
                                                            <circle cx={cx} cy={cy} r={Math.max(3, src.value / 8)} fill={src.color} className="radar-blip"
                                                                style={{ animationDelay: `${i * 400}ms` }} opacity="0.9" />
                                                            <circle cx={cx} cy={cy} r={Math.max(5, src.value / 5)} fill="none" stroke={src.color} strokeWidth="0.5" className="radar-blip"
                                                                style={{ animationDelay: `${i * 400 + 200}ms` }} opacity="0.4" />
                                                        </g>
                                                    )
                                                })}
                                                {/* Center dot */}
                                                <circle cx="75" cy="75" r="3" fill="#34d399" />
                                                <circle cx="75" cy="75" r="6" fill="none" stroke="#34d399" strokeWidth="0.5" opacity="0.5" />
                                            </svg>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            {radar.sources?.map((s, i) => (
                                                <div key={i} className="flex items-center gap-2 cursor-default"
                                                    onMouseEnter={() => setRadarHover(`src-${i}`)} onMouseLeave={() => setRadarHover(null)}>
                                                    <div className="size-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: radarHover === `src-${i}` ? `0 0 8px ${s.color}` : 'none' }} />
                                                    <span className={`text-xs truncate transition-colors ${radarHover === `src-${i}` ? 'text-white' : 'text-slate-400'}`}>{s.name}</span>
                                                    <span className="text-xs font-bold text-white ml-auto">{s.value}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Location Bars */}
                                <div className="md:col-span-3">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Top Locations</p>
                                    <div className="flex flex-col gap-2">
                                        {radar.locations?.slice(0, 5).map((loc, i) => (
                                            <div key={i}>
                                                <div className="flex justify-between mb-0.5">
                                                    <span className="text-xs text-slate-400">{loc.name}</span>
                                                    <span className="text-xs font-bold text-white">{loc.value}%</span>
                                                </div>
                                                <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${loc.value}%`, background: `linear-gradient(90deg, #8b5cf6, #06b6d4)` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Gender + Device Split */}
                                <div className="md:col-span-4 flex flex-col gap-4">
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Gender Split</p>
                                        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                                            {radar.gender?.map((g, i) => (
                                                <div key={i} className="h-full transition-all duration-500" title={`${g.name}: ${g.value}%`}
                                                    style={{ width: `${g.value}%`, background: g.color, borderRadius: i === 0 ? '9999px 0 0 9999px' : i === radar.gender.length - 1 ? '0 9999px 9999px 0' : '0' }} />
                                            ))}
                                        </div>
                                        <div className="flex justify-between mt-2">
                                            {radar.gender?.map((g, i) => (
                                                <div key={i} className="flex items-center gap-1">
                                                    <div className="size-2 rounded-full" style={{ background: g.color }} />
                                                    <span className="text-[10px] text-slate-500">{g.name}</span>
                                                    <span className="text-[10px] font-bold text-white">{g.value}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Devices</p>
                                        <div className="flex gap-2">
                                            {radar.devices?.map((d, i) => (
                                                <div key={i} className="flex-1 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                                                    <span className="material-symbols-outlined text-lg" style={{ color: d.color }}>
                                                        {d.name === 'Mobile' ? 'smartphone' : d.name === 'Desktop' ? 'computer' : 'tablet'}
                                                    </span>
                                                    <p className="text-sm font-extrabold text-white mt-1">{d.value}%</p>
                                                    <p className="text-[10px] text-slate-500">{d.name}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CTA hint */}
                            <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-center gap-2 text-sm text-slate-500 group-hover:text-primary transition-colors">
                                <span className="material-symbols-outlined text-sm">analytics</span>
                                <span>Click to dive deeper into analytics & build strategy with AI</span>
                            </div>
                        </div>
                    )}

                    {/* ── 5. INTELLIGENCE HUB (TABBED) ── */}
                    <div className="glass-panel rounded-2xl border border-white/[0.06] overflow-hidden anim-slide-up" style={{ animationDelay: '350ms' }}>
                        {/* Tab bar */}
                        <div className="flex border-b border-white/[0.06] bg-white/[0.01]">
                            {intelTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`intel-tab flex-1 px-4 py-3.5 text-sm font-bold cursor-pointer flex items-center justify-center gap-2 border-b-2 ${activeTab === tab.id ? 'active border-violet-500' : 'text-slate-500 border-transparent hover:text-white hover:bg-white/[0.02]'}`}>
                                    {tab.label}
                                    {tab.count > 0 && <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-xs">{tab.count}</span>}
                                </button>
                            ))}
                            <button onClick={() => { loadSummary(); loadTrends() }}
                                className="px-4 text-slate-500 hover:text-white cursor-pointer transition-colors">
                                <span className={`material-symbols-outlined text-lg ${loadingSummary ? 'animate-spin' : ''}`}>refresh</span>
                            </button>
                        </div>

                        <div className="p-5 lg:p-6">
                            {/* ── TRENDS TAB ── */}
                            {activeTab === 'trends' && (
                                <div className="space-y-4">
                                    {/* Grok AI Topics */}
                                    {grokTrends.length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                                            {grokTrends.slice(0, 4).map((t, i) => (
                                                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-orange-500/20 transition-all"
                                                    style={{ animation: `slide-up 0.4s ease-out ${i * 60}ms both` }}>
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <h4 className="text-base font-bold text-white leading-tight">{t.topic}</h4>
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${t.urgency === 'now' ? 'bg-rose-500/15 text-rose-400'
                                                            : t.urgency === 'today' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                                            {t.urgency === 'now' ? '🔴 NOW' : t.urgency === 'today' ? '🟡 Today' : '📅 Week'}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-400 mb-2 line-clamp-2">{t.description}</p>
                                                    {t.marketingAngle && <p className="text-sm text-emerald-400 mb-2">💡 {t.marketingAngle}</p>}
                                                    {t.hashtags?.length > 0 && (
                                                        <div className="flex flex-wrap gap-1.5">{t.hashtags.slice(0, 3).map((h, hi) => (
                                                            <span key={hi} className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 text-xs">{h}</span>
                                                        ))}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Google + Grok merged list */}
                                    {(trendsLoading && trendingTopics.length === 0) ? (
                                        <div className="flex items-center justify-center py-8 text-slate-500">
                                            <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                            <span className="text-base">Scanning trends across Google, Grok AI & social media...</span>
                                        </div>
                                    ) : trendingTopics.length > 0 ? (
                                        <div className="space-y-2.5">
                                            {trendingTopics.slice(0, 5).map((trend, i) => (
                                                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-rose-500/15 transition-all group"
                                                    style={{ animation: `slide-up 0.4s ease-out ${i * 60}ms both` }}>
                                                    <span className={`material-symbols-outlined text-xl mt-0.5 shrink-0 ${trend.source === 'Grok xAI' ? 'text-orange-400' : 'text-rose-400'}`}>
                                                        {trend.source === 'Grok xAI' ? 'smart_toy' : (trend.sourceIcon || 'trending_up')}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <p className="text-base font-bold text-white truncate">{trend.title}</p>
                                                            {trend.urgency === 'high' && <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold shrink-0">🔥</span>}
                                                        </div>
                                                        {(trend.contentIdea || trend.angle) && <p className="text-sm text-slate-400 truncate">💡 {trend.contentIdea || trend.angle}</p>}
                                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                            <span className="text-sm text-slate-500">{trend.source}</span>
                                                            {trend.traffic && <span className="text-sm text-slate-500">• {trend.traffic}</span>}
                                                            {trend.relevance && <span className={`text-xs px-2 py-0.5 rounded font-bold ${trend.relevance >= 80 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>{trend.relevance}% match</span>}
                                                        </div>
                                                    </div>
                                                    <button onClick={() => navigate(`/content-studio?goal=hijack&trend=${encodeURIComponent(trend.title)}&prompt=${encodeURIComponent(trend.contentIdea || `Create trending content about "${trend.title}"`)}`)}
                                                        className="shrink-0 px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-sm font-bold hover:bg-rose-500/20 transition-all cursor-pointer opacity-50 group-hover:opacity-100 flex items-center gap-1.5 border border-rose-500/15">
                                                        <span className="material-symbols-outlined text-sm">auto_awesome</span>Create
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-base text-slate-500 text-center py-4">Loading trends...</p>}
                                </div>
                            )}

                            {/* ── NEWS TAB ── */}
                            {activeTab === 'news' && (
                                <div className="space-y-3">
                                    {businessNews.length > 0 ? businessNews.slice(0, 5).map((n, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-emerald-500/15 transition-all"
                                            style={{ animation: `slide-up 0.4s ease-out ${i * 80}ms both` }}>
                                            <div className="flex items-start gap-3">
                                                <span className="text-2xl shrink-0 mt-0.5">{n.emoji || '📰'}</span>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                        <h4 className="text-base font-bold text-white leading-snug">{n.headline}</h4>
                                                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${n.category === 'funding' ? 'bg-green-500/10 text-green-400'
                                                            : n.category === 'policy' ? 'bg-blue-500/10 text-blue-400'
                                                                : n.category === 'competitor' ? 'bg-rose-500/10 text-rose-400'
                                                                    : n.category === 'technology' ? 'bg-violet-500/10 text-violet-400'
                                                                        : 'bg-cyan-500/10 text-cyan-400'}`}>{n.category}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-400 mb-2">{n.summary}</p>
                                                    <p className="text-sm text-emerald-400 font-medium">💡 {n.relevance}</p>
                                                    {n.source && <p className="text-xs text-slate-600 mt-1">Source: {n.source}</p>}
                                                </div>
                                            </div>
                                        </div>
                                    )) : <p className="text-base text-slate-500 text-center py-8">No news available yet. Refresh to fetch latest.</p>}
                                </div>
                            )}

                            {/* ── TRIVIA TAB ── */}
                            {activeTab === 'trivia' && (
                                <div className="space-y-3">
                                    {didYouKnow.length > 0 ? didYouKnow.slice(0, 4).map((d, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-amber-500/15 transition-all"
                                            style={{ animation: `slide-up 0.4s ease-out ${i * 80}ms both` }}>
                                            <div className="flex items-start gap-3">
                                                <span className="text-2xl shrink-0 mt-0.5">{d.emoji || '💡'}</span>
                                                <div className="flex-1 min-w-0">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-2 ${d.category === 'history' ? 'bg-orange-500/10 text-orange-400'
                                                        : d.category === 'science' ? 'bg-cyan-500/10 text-cyan-400'
                                                            : d.category === 'psychology' ? 'bg-violet-500/10 text-violet-400'
                                                                : 'bg-emerald-500/10 text-emerald-400'}`}>{d.category}</span>
                                                    <p className="text-sm text-slate-300 mb-2 leading-relaxed">{d.fact}</p>
                                                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                                        <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5 shrink-0">campaign</span>
                                                        <p className="text-sm text-amber-300 font-medium">{d.postIdea}</p>
                                                    </div>
                                                    <button onClick={() => navigate(`/content-studio?topic=${encodeURIComponent(d.fact.substring(0, 100))}`)}
                                                        className="mt-3 text-sm text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer transition-colors">
                                                        <span className="material-symbols-outlined text-sm">edit_note</span>Create Post from This
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )) : <p className="text-base text-slate-500 text-center py-8">No trivia available yet. Refresh to fetch.</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── 6. GROK CONTENT IDEAS ── */}
                    {grokContent.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-cyan-500/15 anim-slide-up" style={{ animationDelay: '450ms' }}>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-cyan-400">tips_and_updates</span>
                                Content Ideas for You
                                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold">AI POWERED</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {grokContent.slice(0, 4).map((s, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-cyan-500/15 transition-all"
                                        style={{ animation: `slide-up 0.4s ease-out ${i * 60}ms both` }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400'
                                                : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-slate-400'}`}>{s.platform}</span>
                                            <span className="text-sm text-slate-500">{s.format}</span>
                                            {s.viralPotential === 'high' && <span className="text-sm text-orange-400">🔥 viral</span>}
                                        </div>
                                        <h4 className="text-base font-bold text-white mb-1">{s.title}</h4>
                                        <p className="text-sm text-slate-400 mb-2 line-clamp-2">{s.hook}</p>
                                        {s.trendConnection && <p className="text-sm text-emerald-400">📈 {s.trendConnection}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 7. UPCOMING EVENTS CAROUSEL ── */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '500ms' }}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">celebration</span>
                                    Upcoming Opportunities
                                </h3>
                                <button onClick={() => navigate('/smart-calendar')} className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-bold">View Calendar →</button>
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
                                {upcoming.slice(0, 8).map((e, i) => {
                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                    return (
                                        <button key={i} onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(e.name)}&tone=${e.tone}`)}
                                            className="shrink-0 w-44 glass-panel rounded-xl p-4 text-left hover:bg-white/[0.05] transition-all cursor-pointer group border"
                                            style={{ animation: `slide-up 0.4s ease-out ${i * 60}ms both`, borderColor: color.border + '20' }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-2xl">{e.emoji}</span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/20 text-primary'}`}>
                                                    {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `${e.daysUntil}d`}
                                                </span>
                                            </div>
                                            <p className="text-sm font-bold text-white truncate">{e.name}</p>
                                            <p className="text-xs text-slate-500 truncate mt-0.5">{e.tone}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── 8. YOUR BRANDS ── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '550ms' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">storefront</span>Your Brands
                            </h3>
                            <button onClick={() => navigate('/onboarding')} className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">add</span>Add
                            </button>
                        </div>
                        {brandsLoading ? (
                            <div className="flex items-center justify-center py-8 text-slate-500"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...</div>
                        ) : brands.length === 0 ? (
                            <div className="text-center py-8">
                                <span className="material-symbols-outlined text-4xl text-slate-600 mb-2 block">storefront</span>
                                <p className="text-base text-slate-400 mb-3">No brands yet. Create your first brand!</p>
                                <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-base">Create Brand</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {brands.map((brand, i) => (
                                    <div key={brand._id} onClick={() => { selectBrand(brand); navigate('/nexus') }}
                                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer hover:bg-white/[0.04] hover:scale-[1.01] ${activeBrand?._id === brand._id ? 'border-primary/30 bg-primary/5' : 'border-white/[0.06] bg-white/[0.02]'}`}
                                        style={{ animation: `slide-up 0.4s ease-out ${i * 50}ms both` }}>
                                        <div className="size-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shrink-0"
                                            style={{ background: brand.dna?.colors?.[0]?.hex || '#2B4BEE' }}>{brand.name?.charAt(0)?.toUpperCase()}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-bold text-white truncate">{brand.name}</p>
                                            <p className="text-sm text-slate-500 truncate">{brand.website || brand.dna?.industry || 'No details'}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-600">chevron_right</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* RIGHT SIDEBAR                                               */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="col-span-12 lg:col-span-4 space-y-6">

                    {/* ── STUDIOS GRID ── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '200ms' }}>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">apps</span>Studios
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                            {studios.map((a, i) => (
                                <button key={i} onClick={() => navigate(a.path)}
                                    className={`studio-card flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-br ${a.bg} border border-white/[0.04] hover:border-white/[0.15] cursor-pointer text-left`}
                                    style={{ animation: `slide-up 0.4s ease-out ${i * 50}ms both` }}>
                                    <span className="material-symbols-outlined text-xl" style={{ color: a.color }}>{a.icon}</span>
                                    <span className="text-base text-white font-medium">{a.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── D2C PULSE ── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-emerald-500/10 anim-slide-up" style={{ animationDelay: '250ms' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-400">storefront</span>D2C Pulse
                            </h3>
                            {d2cSnapshot?.connected && <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live</span>}
                        </div>
                        {d2cSnapshot?.connected ? (
                            <>
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {[
                                        { label: 'Revenue', value: `₹${(d2cSnapshot.weeklyRevenue || 0).toLocaleString()}`, icon: 'payments', color: '#34d399' },
                                        { label: 'Orders', value: d2cSnapshot.weeklyOrders || 0, icon: 'shopping_bag', color: '#8b5cf6' },
                                        { label: 'AOV', value: `₹${d2cSnapshot.aov || 0}`, icon: 'trending_up', color: '#06b6d4' },
                                    ].map((m, i) => (
                                        <div key={i} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                                            <span className="material-symbols-outlined text-sm block mb-1" style={{ color: m.color }}>{m.icon}</span>
                                            <p className="text-lg font-extrabold text-white">{m.value}</p>
                                            <p className="text-[10px] text-slate-500 uppercase">{m.label}</p>
                                        </div>
                                    ))}
                                </div>
                                {d2cSnapshot.topProducts?.length > 0 && (
                                    <div className="space-y-1.5 mb-3">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">🔥 Top Products</p>
                                        {d2cSnapshot.topProducts.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                                                <span className="text-xs font-bold text-slate-500 w-4">#{i + 1}</span>
                                                <span className="text-sm text-white truncate flex-1">{p.title}</span>
                                                <span className="text-xs font-bold text-emerald-400">₹{Math.round(p.revenue).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <button onClick={() => navigate('/d2c-analytics')} className="w-full py-2.5 rounded-xl bg-emerald-500/5 text-emerald-400 text-sm font-bold hover:bg-emerald-500/10 transition-all cursor-pointer border border-emerald-500/10">Open D2C Analytics →</button>
                            </>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    {[
                                        { label: 'Revenue', icon: 'payments', color: '#34d399' },
                                        { label: 'Orders', icon: 'shopping_bag', color: '#8b5cf6' },
                                        { label: 'AOV', icon: 'trending_up', color: '#06b6d4' },
                                    ].map((m, i) => (
                                        <div key={i} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center opacity-40">
                                            <span className="material-symbols-outlined text-sm block mb-1" style={{ color: m.color }}>{m.icon}</span>
                                            <p className="text-lg font-extrabold text-white">—</p>
                                            <p className="text-[10px] text-slate-500 uppercase">{m.label}</p>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm text-slate-400 mb-3 text-center">Connect your Shopify store to unlock real-time D2C analytics, product velocity, geo insights & more.</p>
                                <button onClick={() => navigate('/d2c-analytics')} className="w-full py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 transition-all cursor-pointer border border-emerald-500/20 flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm">link</span>Connect & Explore D2C →
                                </button>
                            </>
                        )}
                    </div>

                    {/* ── SEO KEYWORD NUGGETS ── */}
                    {grokSeo?.risingKeywords?.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-amber-500/10 anim-slide-up" style={{ animationDelay: '300ms' }}>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-amber-400">search</span>Trending Keywords
                            </h3>
                            <div className="space-y-2.5">
                                {grokSeo.risingKeywords.slice(0, 5).map((k, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">"{k.keyword}"</p>
                                            <p className="text-sm text-slate-500">{k.intent} intent • {k.difficulty}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ml-2 ${k.trend === 'breakout' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{k.growthRate}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/seo-studio')} className="w-full mt-3 py-2.5 rounded-xl bg-amber-500/5 text-amber-400 text-sm font-bold hover:bg-amber-500/10 transition-all cursor-pointer border border-amber-500/10">Open SEO Studio →</button>
                        </div>
                    )}

                    {/* ── QUICK WIN ── */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10 anim-slide-up" style={{ animationDelay: '350ms' }}>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-400">tips_and_updates</span>Quick Win
                            </h3>
                            <p className="text-base text-slate-300 mb-2"><span className="text-xl mr-1">{upcoming[0].emoji}</span>
                                <strong>{upcoming[0].name}</strong> is {upcoming[0].daysUntil === 0 ? 'today' : upcoming[0].daysUntil === 1 ? 'tomorrow' : `in ${upcoming[0].daysUntil} days`}!</p>
                            <p className="text-sm text-slate-500 mb-3">Tone: <span className="text-amber-400">{upcoming[0].tone}</span> • {upcoming[0].formats?.join(', ')}</p>
                            <button onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(upcoming[0].name)}&tone=${upcoming[0].tone}`)}
                                className="w-full py-2.5 rounded-xl bg-amber-500/10 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 border border-amber-500/20">
                                <span className="material-symbols-outlined">auto_awesome</span>Generate Content
                            </button>
                        </div>
                    )}

                    {/* ── PLAN ── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '400ms' }}>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-amber-400">diamond</span>Plan
                        </h3>
                        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
                            <p className="text-lg font-extrabold text-white capitalize">{user?.plan || 'Starter'}</p>
                            <p className="text-sm text-slate-400 mt-1">{user?.plan === 'enterprise' ? 'Unlimited access' : user?.plan === 'professional' ? '50 generations/month' : '10 generations/month'}</p>
                        </div>
                        {user?.plan !== 'enterprise' && (
                            <button className="w-full mt-3 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/10 transition-all cursor-pointer">Upgrade Plan</button>
                        )}
                    </div>

                    {/* ── RECENT WORK ── */}
                    {recentContent.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '450ms' }}>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary">history</span>Recent Work
                            </h3>
                            <div className="space-y-2">
                                {recentContent.slice(0, 4).map((c, i) => (
                                    <div key={c._id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                                        <div className="size-8 rounded-lg flex items-center justify-center bg-primary/10">
                                            <span className="material-symbols-outlined text-sm text-primary">{c.type === 'social' ? 'share' : c.type === 'blog' ? 'article' : 'description'}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{c.content?.substring(0, 60)}</p>
                                            <p className="text-xs text-slate-500">{c.type} • {new Date(c.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/content-studio')} className="w-full mt-3 text-sm text-primary font-bold hover:text-primary-light cursor-pointer transition-colors">View All →</button>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* QUICK ACTION FLOATING BAR                                       */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/[0.08] backdrop-blur-xl"
                style={{ background: 'rgba(15,15,25,0.85)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                {[
                    { icon: 'edit_note', label: 'New Post', path: '/content-studio', color: '#34d399' },
                    { icon: 'auto_fix_high', label: 'Generate Image', path: '/creative-studio', color: '#ec4899' },
                    { icon: 'psychology', label: 'Brainstorm', path: '/brainstorm', color: '#8b5cf6' },
                    { icon: 'movie', label: 'Create Video', path: '/video-studio', color: '#f59e0b' },
                ].map((a, i) => (
                    <button key={i} onClick={() => navigate(a.path)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer group"
                        title={a.label}>
                        <span className="material-symbols-outlined text-lg transition-transform group-hover:scale-110" style={{ color: a.color }}>{a.icon}</span>
                        <span className="text-sm font-medium text-slate-400 group-hover:text-white transition-colors hidden sm:inline">{a.label}</span>
                    </button>
                ))}
            </div>

            {/* Bottom spacer for floating bar */}
            <div className="h-20" />
        </DashboardLayout>
    )
}

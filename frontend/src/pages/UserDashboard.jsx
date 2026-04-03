import { useState, useEffect, useMemo, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, creatives as creativesAPI, trends as trendsAPI, dashboardSummary, shopifyAnalytics, pmStudio, funnelStudio } from '../services/api'
import { getUpcomingEvents, EVENT_COLORS } from '../data/calendarData'
import SmartCommandBox from '../components/SmartCommandBox'
import IntelReportViewer from '../components/IntelReportViewer'

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
function HealthRing({ score, radius, strokeWidth, color, label, delay = 0, loading = false }) {
    const circumference = 2 * Math.PI * radius
    const [animated, setAnimated] = useState(0)
    useEffect(() => {
        if (loading) return
        const t = setTimeout(() => setAnimated(score), 300 + delay)
        return () => clearTimeout(t)
    }, [score, delay, loading])

    if (loading) {
        return (
            <g className="animate-pulse">
                <circle cx="90" cy="90" r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeWidth} />
            </g>
        )
    }

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

// ── Skeleton UI Helper ──
function Skeleton({ className, circle = false }) {
    return (
        <div className={`relative overflow-hidden bg-white/[0.03] ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
        </div>
    )
}

function SkeletonHero() {
    return (
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-4">
            <div className="flex-1 space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-64" />
            </div>
            <Skeleton className="h-12 w-32 rounded-xl" />
        </div>
    )
}

function SkeletonStats({ count = 4 }) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[...Array(count)].map((_, i) => (
                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <Skeleton className="h-3 w-16 mb-3" />
                    <Skeleton className="h-7 w-24" />
                </div>
            ))}
        </div>
    )
}

function SkeletonRings() {
    return (
        <div className="flex flex-col sm:flex-row items-center gap-8 p-6 glass-panel rounded-2xl border border-white/[0.06]">
            <Skeleton className="size-32 rounded-full shrink-0" />
            <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <Skeleton className="size-3 rounded-full" />
                        <div className="space-y-2 flex-1">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-5 w-10" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function SkeletonHub() {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
                        <div className="flex justify-between items-start">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-4 w-12 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </div>
                ))}
            </div>
        </div>
    )
}

function SkeletonPulse() {
    return (
        <div className="grid grid-cols-3 gap-3 mb-5">
            {[1, 2, 3].map(i => (
                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col items-center gap-2">
                    <Skeleton className="size-5 rounded-md" />
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-3 w-10" />
                </div>
            ))}
        </div>
    )
}

function SkeletonBrands() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <Skeleton className="size-12 sm:size-14 rounded-2xl shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Ticker Item ──
function TickerItem({ icon, value, label, color }) {
    return (
        <div className="flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-5 py-2 sm:py-2.5 shrink-0">
            <span className="material-symbols-outlined text-base sm:text-lg" style={{ color }}>{icon}</span>
            <span className="text-base sm:text-lg font-extrabold text-white">{value}</span>
            <span className="text-[10px] sm:text-xs md:text-sm text-slate-500 whitespace-nowrap uppercase tracking-tight">{label}</span>
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
    const [error, setError] = useState(null)

    // ── Analytics state (Funnel + Performance + ROAS) ──
    const [funnelData, setFunnelData] = useState(null)
    const [perfData, setPerfData] = useState(null)
    const [anomalies, setAnomalies] = useState([])
    const [blendedRoas, setBlendedRoas] = useState(null)
    const [loadingAnalytics, setLoadingAnalytics] = useState(true)
    const [loadingD2C, setLoadingD2C] = useState(true)

    // Intel state
    const [intelMissions, setIntelMissions] = useState([])
    const [loadingIntel, setLoadingIntel] = useState(true)
    const [intelReport, setIntelReport] = useState(null) // { mission, findings }
    const [showIntelReport, setShowIntelReport] = useState(false)


    const country = activeBrand?.dna?.country || activeBrand?.country || 'India'
    const upcoming = useMemo(() => getUpcomingEvents(country, 14), [country])
    const greetingText = `${getGreeting()}, ${user?.name?.split(' ')[0] || 'Creator'}`
    const { displayed: typedGreeting, done: greetingDone } = useTypewriter(greetingText)

    // ── Loaders ──
    const loadSummary = useCallback(async () => {
        setLoadingSummary(true)
        try { setSummary(await dashboardSummary.get(activeBrand?._id)) }
        catch (err) {
            console.warn('Dashboard summary error:', err.message)
            setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider })
        }
        finally { setLoadingSummary(false) }
    }, [activeBrand?._id])

    const loadTrends = useCallback(async () => {
        setTrendsLoading(true)
        try {
            const data = activeBrand?._id ? await trendsAPI.brandMatch(activeBrand._id) : await trendsAPI.now()
            setTrendingTopics(data.trends || [])
        } catch (err) {
            console.warn('Trends error:', err.message)
            setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider })
        }
        finally { setTrendsLoading(false) }
    }, [activeBrand?._id])

    // ── Analytics loader (Funnel + Performance + ROAS) ──
    const loadAnalytics = useCallback(async () => {
        if (!activeBrand?._id) return
        setLoadingAnalytics(true)
        const brandId = activeBrand._id
        try {
            const [funnelRes, perfRes, anomalyRes, roasRes] = await Promise.allSettled([
                funnelStudio.list({ brandId }).then(async (data) => {
                    const funnels = data.funnels || []
                    if (funnels.length === 0) return null
                    // Pick the best funnel (highest entries or first active)
                    const best = funnels.sort((a, b) => (b.metrics?.totalEntries || 0) - (a.metrics?.totalEntries || 0))[0]
                    const analyticsRes = await funnelStudio.analytics(best._id)
                    return { funnel: best, analytics: analyticsRes.analytics }
                }),
                pmStudio.dashboard({ brandId }),
                pmStudio.anomalies({ brandId }),
                pmStudio.blendedRoas({ brandId }),
            ])
            if (funnelRes.status === 'fulfilled' && funnelRes.value) setFunnelData(funnelRes.value)
            if (perfRes.status === 'fulfilled') setPerfData(perfRes.value?.dashboard || null)
            if (anomalyRes.status === 'fulfilled') setAnomalies(anomalyRes.value?.anomalies || [])
            if (roasRes.status === 'fulfilled') setBlendedRoas(roasRes.value || null)

            // Check for rejected promises that might be provider errors
            const rejected = [funnelRes, perfRes, anomalyRes, roasRes].find(r => r.status === 'rejected')
            if (rejected && rejected.reason?.isProviderError) {
                setError({
                    message: rejected.reason.message,
                    isProviderError: true,
                    provider: rejected.reason.provider
                })
            }
        } catch (err) {
            setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider })
        }
        finally { setLoadingAnalytics(false) }
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
            } catch (err) {
                console.warn(err)
                setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider })
            }
        }
        fetchBasicData()
    }, [activeBrand?._id])

    useEffect(() => {
        loadSummary(); loadTrends(); loadAnalytics()
        setLoadingD2C(true)
        shopifyAnalytics.snapshot()
            .then(d => setD2cSnapshot(d))
            .catch(err => {
                setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider })
            })
            .finally(() => setLoadingD2C(false))
        const interval = setInterval(() => { loadTrends(); loadSummary(); loadAnalytics() }, 30 * 60 * 1000)
        return () => clearInterval(interval)
    }, [loadSummary, loadTrends, loadAnalytics])

    // Redirect to onboarding if no brands found (and not loading)
    useEffect(() => {
        if (!brandsLoading && brands && brands.length === 0) {
            navigate('/onboarding')
        }
    }, [brands, brandsLoading, navigate])

    // ── Load intel missions ──
    useEffect(() => {
        async function fetchIntelData() {
            if (!activeBrand?._id) return
            setLoadingIntel(true)
            try {
                const token = localStorage.getItem('mantram_token')
                const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
                const resp = await fetch(`${API_BASE}/intel/missions?brandId=${activeBrand._id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (resp.ok) {
                    const data = await resp.json()
                    setIntelMissions(data.missions || [])
                }
            } catch { /* silent */ }
            finally { setLoadingIntel(false) }
        }
        fetchIntelData()
    }, [activeBrand?._id])

    const openIntelReport = async (mission) => {
        try {
            const token = localStorage.getItem('mantram_token')
            const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
            const resp = await fetch(`${API_BASE}/intel/missions/${mission._id}/findings`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (resp.ok) {
                const data = await resp.json()
                setIntelReport({ mission, findings: data })
                setShowIntelReport(true)
            }
        } catch { /* silent */ }
    }

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

    // ── Intel tabs (Trends / News / Ideas) ──
    const intelTabs = [
        { id: 'trends', label: '🔥 Trending' },
        { id: 'news',   label: '📰 News' },
        { id: 'ideas',  label: '💡 Ideas' },
    ]

    return (
        <DashboardLayout title="Dashboard" subtitle="Your AI command center">
            <SEOHead title="Dashboard — Mantram AI" noIndex={true} />

            {/* ═══ CSS ═══ */}
            <style>{`
                @keyframes shimmer { 100% { transform: translateX(100%) } }
                @keyframes slide-up { from { opacity:0; transform: translateY(16px) } to { opacity:1; transform: translateY(0) } }
                @keyframes cursor-blink { 0%,100% { opacity:1 } 50% { opacity:0 } }
                @keyframes float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-4px) } }
                @keyframes glow-pulse { 0%,100%{box-shadow:0 0 20px rgba(139,92,246,.12)}50%{box-shadow:0 0 36px rgba(139,92,246,.25)} }
                .anim-up { animation: slide-up .5s ease-out both }
                .anim-float { animation: float 3s ease-in-out infinite }
                .anim-glow { animation: glow-pulse 3s ease-in-out infinite }
                .studio-btn { transition: all .25s cubic-bezier(.4,0,.2,1) }
                .studio-btn:hover { transform:translateY(-3px) scale(1.03); box-shadow:0 10px 30px rgba(0,0,0,.3) }
                .intel-tab { transition: all .2s ease }
                .intel-tab.active { background:rgba(139,92,246,.12); color:#fff; border-color:rgba(139,92,246,.35) }
                .dash-card { background:rgba(255,255,255,.015); border:1px solid rgba(255,255,255,.06); border-radius:16px; padding:20px }
            `}</style>

            {/* ── 0. ERROR BANNER ── */}
            {error && (
                <div className={`mb-5 p-3.5 rounded-xl border flex items-center gap-3 anim-up ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                    <span className="material-symbols-outlined text-lg">{error.isProviderError ? 'warning' : 'error'}</span>
                    <p className="flex-1 text-sm">{error.isProviderError && <span className="font-bold mr-1">[{error.provider}]</span>}{error.message}</p>
                    <button onClick={() => setError(null)}><span className="material-symbols-outlined text-sm text-slate-500 hover:text-white transition-colors">close</span></button>
                </div>
            )}

            {/* ── 1. HERO GREETING ── */}
            <div className="flex items-center justify-between mb-5 anim-up">
                <div>
                    <p className="text-slate-500 text-xs font-medium mb-1">{getDateString()}</p>
                    {loadingSummary ? (
                        <div className="h-8 w-56 rounded-lg bg-white/[.03] animate-pulse" />
                    ) : (
                        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                            {typedGreeting}
                            {!greetingDone && <span className="inline-block w-1 h-6 bg-violet-500 rounded-full animate-[cursor-blink_1s_step-end_infinite]" />}
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />AI Active
                            </span>
                        </h1>
                    )}
                </div>
                {streak > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 anim-float">
                        <span className="text-lg">🔥</span>
                        <div>
                            <p className="text-xs font-extrabold text-amber-400">{streak}-Day Streak</p>
                            <p className="text-[10px] text-amber-600">Keep going!</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 2. COMMAND BOX ── */}
            <SmartCommandBox variant="dashboard" className="mb-5" />

            {/* ── 3. MAIN GRID ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-8">

                {/* ════ LEFT COLUMN (8 cols) ════ */}
                <div className="lg:col-span-8 space-y-4">

                    {/* ── AI MISSION ── */}
                    {loadingSummary ? (
                        <div className="dash-card space-y-3 anim-up">
                            <div className="h-3 w-20 rounded bg-white/[.04] animate-pulse" />
                            <div className="h-6 w-3/4 rounded bg-white/[.04] animate-pulse" />
                            <div className="h-4 w-full rounded bg-white/[.04] animate-pulse" />
                            <div className="h-9 w-28 rounded-xl bg-white/[.04] animate-pulse" />
                        </div>
                    ) : insight ? (
                        <div className="anim-glow rounded-2xl p-5 border border-violet-500/20 anim-up"
                            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,.07) 0%, rgba(6,182,212,.06) 100%)' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold uppercase tracking-widest">🤖 AI Mission</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${insight.category === 'trend' ? 'bg-orange-500/15 text-orange-300' : insight.category === 'growth' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-cyan-500/15 text-cyan-300'}`}>
                                    {insight.category}
                                </span>
                            </div>
                            <div className="flex items-start gap-4">
                                <span className="text-3xl shrink-0 anim-float">{insight.emoji || '💡'}</span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-extrabold text-white mb-1 leading-snug">{insight.title}</h3>
                                    <p className="text-sm text-slate-300 leading-relaxed mb-4">{insight.tip}</p>
                                    <button onClick={() => navigate(insight.actionPath || '/content-studio')}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:scale-[1.03] active:scale-95"
                                        style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', boxShadow: '0 4px 18px rgba(139,92,246,.3)' }}>
                                        <span className="material-symbols-outlined text-base">rocket_launch</span>
                                        {insight.actionLabel || 'Act Now'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* ── BRAND HEALTH PILLS ── */}
                    {loadingSummary ? (
                        <div className="dash-card anim-up">
                            <div className="h-4 w-24 rounded bg-white/[.04] animate-pulse mb-3" />
                            <div className="grid grid-cols-4 gap-2">
                                {[1,2,3,4].map(i => <div key={i} className="h-16 rounded-xl bg-white/[.03] animate-pulse" />)}
                            </div>
                        </div>
                    ) : (
                        <div className="dash-card anim-up" style={{ animationDelay: '60ms' }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-400 text-lg">monitoring</span>
                                    <span className="text-sm font-bold text-white">Brand Health</span>
                                </div>
                                <span className="text-xl font-black text-white">{health.overallScore || 0}<span className="text-xs text-slate-500 font-medium ml-0.5">/100</span></span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { label: 'Content', score: health.contentVelocity, color: '#8b5cf6', icon: 'article' },
                                    { label: 'Creative', score: health.creativeOutput, color: '#06b6d4', icon: 'image' },
                                    { label: 'Brand DNA', score: health.brandCompleteness, color: '#f59e0b', icon: 'fingerprint' },
                                    { label: 'Trends', score: health.trendReadiness, color: '#34d399', icon: 'trending_up' },
                                ].map((m, i) => (
                                    <div key={i} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/[.02] border border-white/[.04] hover:bg-white/[.05] transition-all">
                                        {/* mini progress bar */}
                                        <div className="w-full h-1 rounded-full bg-white/[.06] overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-700"
                                                style={{ width: `${Math.round(m.score || 0)}%`, background: m.color }} />
                                        </div>
                                        <span className="text-base font-black text-white">{Math.round(m.score || 0)}</span>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">{m.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── PERFORMANCE SNAPSHOT (compact) ── */}
                    {(perfData || funnelData || blendedRoas) && (
                        <div className="dash-card anim-up" style={{ animationDelay: '100ms' }}>
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-rose-400 text-lg">campaign</span>
                                    <span className="text-sm font-bold text-white">Performance</span>
                                    {anomalies.length > 0 && (
                                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
                                            {anomalies.length} alert{anomalies.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => navigate('/performance-marketing')}
                                    className="text-xs text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1">
                                    Deep Dive <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </button>
                            </div>
                            {loadingAnalytics ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[1,2,3,4].map(i => <div key={i} className="h-14 rounded-xl bg-white/[.03] animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[
                                        { label: 'Ad Spend', value: `₹${(perfData?.stats?.totalSpend || 0).toLocaleString()}`, color: '#f59e0b', icon: 'account_balance' },
                                        { label: 'ROAS', value: `${blendedRoas?.mer?.toFixed(1) || perfData?.stats?.avgRoas || '—'}x`, color: parseFloat(perfData?.stats?.avgRoas) >= 2 ? '#34d399' : '#f43f5e', icon: 'show_chart' },
                                        { label: 'Funnel CVR', value: `${funnelData?.analytics?.overview?.conversionRate || 0}%`, color: '#6366f1', icon: 'filter_alt' },
                                        { label: 'Campaigns', value: perfData?.stats?.activeCampaigns || 0, color: '#8b5cf6', icon: 'campaign' },
                                    ].map((m, i) => (
                                        <div key={i} className="p-3 rounded-xl bg-white/[.02] border border-white/[.04] hover:bg-white/[.04] transition-all">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="material-symbols-outlined text-xs" style={{ color: m.color }}>{m.icon}</span>
                                                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{m.label}</span>
                                            </div>
                                            <p className="text-base font-black text-white">{m.value}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── INTELLIGENCE HUB (Trends / News / Ideas) ── */}
                    <div className="dash-card overflow-hidden !p-0 anim-up" style={{ animationDelay: '140ms' }}>
                        {/* Tab bar */}
                        <div className="flex border-b border-white/[.05] bg-white/[.01]">
                            {intelTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`intel-tab flex-1 px-4 py-3 text-xs font-black cursor-pointer border-b-2 transition-all ${activeTab === tab.id ? 'active border-violet-500 text-white' : 'text-slate-500 border-transparent hover:text-white'}`}>
                                    {tab.label}
                                </button>
                            ))}
                            <button onClick={() => { loadSummary(); loadTrends() }}
                                className="px-4 text-slate-500 hover:text-white cursor-pointer transition-colors border-l border-white/[.05]">
                                <span className={`material-symbols-outlined text-lg ${loadingSummary ? 'animate-spin' : ''}`}>refresh</span>
                            </button>
                        </div>

                        <div className="p-5">
                            {/* ── TRENDS TAB ── */}
                            {activeTab === 'trends' && (
                                <div className="space-y-2.5">
                                    {(trendsLoading && trendingTopics.length === 0) ? (
                                        <div className="flex items-center gap-2 py-6 text-slate-500 text-sm">
                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            Scanning trends…
                                        </div>
                                    ) : trendingTopics.length > 0 ? trendingTopics.slice(0, 5).map((trend, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[.02] border border-white/[.04] hover:bg-white/[.04] hover:border-rose-500/15 transition-all group"
                                            style={{ animation: `slide-up .35s ease-out ${i * 50}ms both` }}>
                                            <span className={`material-symbols-outlined text-xl shrink-0 ${trend.source === 'Grok xAI' ? 'text-orange-400' : 'text-rose-400'}`}>
                                                {trend.source === 'Grok xAI' ? 'smart_toy' : 'trending_up'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="text-sm font-bold text-white truncate">{trend.title}</p>
                                                    {trend.urgency === 'high' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold shrink-0">🔥</span>}
                                                </div>
                                                {(trend.contentIdea || trend.angle) && (
                                                    <p className="text-xs text-slate-500 truncate">💡 {trend.contentIdea || trend.angle}</p>
                                                )}
                                            </div>
                                            <button onClick={() => navigate(`/content-studio?trend=${encodeURIComponent(trend.title)}&prompt=${encodeURIComponent(trend.contentIdea || `Create content about "${trend.title}"`)}`)}
                                                className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all cursor-pointer border border-rose-500/15 opacity-60 group-hover:opacity-100 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                                <span className="hidden sm:inline">Create</span>
                                            </button>
                                        </div>
                                    )) : grokTrends.slice(0, 4).map((t, i) => (
                                        <div key={i} className="p-3.5 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-orange-500/20 transition-all"
                                            style={{ animation: `slide-up .35s ease-out ${i * 50}ms both` }}>
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <p className="text-sm font-bold text-white">{t.topic}</p>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${t.urgency === 'now' ? 'bg-rose-500/15 text-rose-400' : t.urgency === 'today' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                                    {t.urgency === 'now' ? '🔴 NOW' : t.urgency === 'today' ? '🟡 Today' : '📅 This week'}
                                                </span>
                                            </div>
                                            {t.marketingAngle && <p className="text-xs text-emerald-400">💡 {t.marketingAngle}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── NEWS TAB ── */}
                            {activeTab === 'news' && (
                                <div className="space-y-2.5">
                                    {loadingSummary ? (
                                        [1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-white/[.03] animate-pulse" />)
                                    ) : businessNews.length > 0 ? businessNews.slice(0, 5).map((n, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-emerald-500/15 transition-all"
                                            style={{ animation: `slide-up .35s ease-out ${i * 60}ms both` }}>
                                            <span className="text-xl shrink-0">{n.emoji || '📰'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-bold text-white leading-snug">{n.headline}</p>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${n.category === 'funding' ? 'bg-green-500/10 text-green-400' : n.category === 'competitor' ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-400'}`}>{n.category}</span>
                                                </div>
                                                <p className="text-xs text-emerald-400 mt-1">💡 {n.relevance}</p>
                                            </div>
                                        </div>
                                    )) : <p className="text-sm text-slate-500 py-6 text-center">No news yet — refresh to fetch latest.</p>}
                                </div>
                            )}

                            {/* ── IDEAS TAB ── */}
                            {activeTab === 'ideas' && (
                                <div className="space-y-2.5">
                                    {loadingSummary ? (
                                        [1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-white/[.03] animate-pulse" />)
                                    ) : grokContent.length > 0 ? grokContent.slice(0, 5).map((s, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[.02] border border-white/[.04] hover:bg-white/[.04] hover:border-cyan-500/20 transition-all cursor-pointer group"
                                            onClick={() => navigate(`/content-studio?goal=write&prompt=${encodeURIComponent(s.hook || s.title)}`)}
                                            style={{ animation: `slide-up .35s ease-out ${i * 60}ms both` }}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400' : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-slate-400'}`}>{s.platform}</span>
                                                    <span className="text-[10px] text-slate-600 font-bold">{s.format}</span>
                                                    {s.viralPotential === 'high' && <span className="text-[10px] text-orange-400 font-bold ml-auto">🔥 Viral</span>}
                                                </div>
                                                <p className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-1">{s.title}</p>
                                                <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{s.hook}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-cyan-400 transition-colors shrink-0 mt-1">arrow_forward</span>
                                        </div>
                                    )) : <p className="text-sm text-slate-500 py-6 text-center">No content ideas yet — refresh to generate.</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── UPCOMING OPPORTUNITIES ── */}
                    {upcoming.length > 0 && (
                        <div className="dash-card anim-up" style={{ animationDelay: '180ms' }}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-lg">celebration</span>
                                    <span className="text-sm font-bold text-white">Upcoming Opportunities</span>
                                </div>
                                <button onClick={() => navigate('/smart-calendar')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-bold cursor-pointer">View All →</button>
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                                {upcoming.slice(0, 7).map((e, i) => {
                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                    return (
                                        <button key={i} onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(e.name)}&tone=${e.tone}`)}
                                            className="shrink-0 w-36 rounded-xl p-3 text-left bg-white/[.02] hover:bg-white/[.05] transition-all cursor-pointer border flex flex-col gap-2"
                                            style={{ borderColor: color.border + '25', animation: `slide-up .35s ease-out ${i * 40}ms both` }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xl">{e.emoji}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-violet-500/15 text-violet-400'}`}>
                                                    {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TMR' : `${e.daysUntil}d`}
                                                </span>
                                            </div>
                                            <p className="text-xs font-bold text-white leading-tight line-clamp-2">{e.name}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ════ RIGHT COLUMN (4 cols) ════ */}
                <div className="lg:col-span-4 space-y-4">

                    {/* ── STUDIOS GRID ── */}
                    <div className="dash-card anim-up" style={{ animationDelay: '40ms' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-violet-400 text-lg">apps</span>
                            <span className="text-sm font-bold text-white">Studios</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {studios.map((s, i) => (
                                <button key={i} onClick={() => navigate(s.path)}
                                    className={`studio-btn flex items-center gap-2.5 p-3 rounded-xl bg-gradient-to-br ${s.bg} border border-white/[.04] hover:border-white/[.12] cursor-pointer active:scale-95`}
                                    style={{ animation: `slide-up .4s ease-out ${i * 40}ms both` }}>
                                    <span className="material-symbols-outlined text-xl" style={{ color: s.color }}>{s.icon}</span>
                                    <span className="text-xs font-black text-white uppercase tracking-tight">{s.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── ALERTS / ALL CLEAR ── */}
                    {(() => {
                        const alerts = []
                        anomalies.forEach(a => alerts.push({ icon: 'warning', title: a.title || 'Anomaly Detected', desc: a.description || `${a.metric} is ${a.direction || 'abnormal'}`, color: '#f43f5e', path: '/performance-marketing' }))
                        if (funnelData?.analytics?.overview?.conversionRate < 15 && funnelData?.analytics?.overview?.totalEntries > 5)
                            alerts.push({ icon: 'filter_alt', title: `Low Funnel CVR: ${funnelData.analytics.overview.conversionRate}%`, desc: 'Below 15% benchmark.', color: '#6366f1', path: '/funnel-studio' })
                        if (perfData?.stats?.totalSpend > 0 && (perfData?.stats?.avgRoas || 0) < 1)
                            alerts.push({ icon: 'trending_down', title: 'ROAS Below 1x', desc: 'Ad spend exceeds returns.', color: '#f43f5e', path: '/performance-marketing' })

                        return alerts.length > 0 ? (
                            <div className="dash-card border border-rose-500/15 anim-up" style={{ animationDelay: '80ms' }}>
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-rose-400 text-lg">notifications_active</span>
                                    <span className="text-sm font-bold text-white">Alerts</span>
                                    <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-black">{alerts.length}</span>
                                </div>
                                <div className="space-y-2">
                                    {alerts.slice(0, 4).map((a, i) => (
                                        <button key={i} onClick={() => navigate(a.path)}
                                            className="w-full flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[.02] border border-white/[.04] hover:border-rose-500/20 transition-all text-left cursor-pointer group">
                                            <span className="material-symbols-outlined text-base mt-0.5 shrink-0" style={{ color: a.color }}>{a.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white">{a.title}</p>
                                                <p className="text-[11px] text-slate-500">{a.desc}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-rose-400 transition-colors shrink-0 mt-0.5">arrow_forward</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="dash-card border border-emerald-500/10 anim-up" style={{ animationDelay: '80ms' }}>
                                <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-emerald-400">verified</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">All Clear</p>
                                        <p className="text-xs text-slate-500">No alerts across your studios</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })()}

                    {/* ── D2C PULSE ── */}
                    <div className="dash-card border border-emerald-500/10 anim-up" style={{ animationDelay: '120ms' }}>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-400 text-lg">storefront</span>
                                <span className="text-sm font-bold text-white">D2C Pulse</span>
                            </div>
                            {d2cSnapshot?.connected && <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live</span>}
                        </div>
                        {loadingD2C ? (
                            <div className="grid grid-cols-3 gap-2">
                                {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-white/[.03] animate-pulse" />)}
                            </div>
                        ) : d2cSnapshot?.connected ? (
                            <>
                                <div className="grid grid-cols-3 gap-2 mb-3">
                                    {[
                                        { label: 'Revenue', value: `₹${(d2cSnapshot.weeklyRevenue || 0).toLocaleString()}`, color: '#34d399' },
                                        { label: 'Orders', value: d2cSnapshot.weeklyOrders || 0, color: '#8b5cf6' },
                                        { label: 'AOV', value: `₹${d2cSnapshot.aov || 0}`, color: '#06b6d4' },
                                    ].map((m, i) => (
                                        <div key={i} className="p-2.5 rounded-xl bg-white/[.02] border border-white/[.04] text-center">
                                            <p className="text-sm font-black text-white">{m.value}</p>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{m.label}</p>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => navigate('/d2c-analytics')} className="w-full py-2 rounded-xl bg-emerald-500/5 text-emerald-400 text-xs font-bold hover:bg-emerald-500/10 transition-all cursor-pointer border border-emerald-500/10">
                                    Open D2C Studio →
                                </button>
                            </>
                        ) : (
                            <div className="text-center py-3">
                                <p className="text-xs text-slate-500 mb-3">Connect Shopify for real-time D2C intelligence</p>
                                <button onClick={() => navigate('/d2c-analytics')} className="w-full py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all cursor-pointer border border-emerald-500/20 flex items-center justify-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm">link</span>Connect Store →
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── TRENDING KEYWORDS ── */}
                    {grokSeo?.risingKeywords?.length > 0 && (
                        <div className="dash-card border border-amber-500/10 anim-up" style={{ animationDelay: '160ms' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-400 text-lg">search</span>
                                <span className="text-sm font-bold text-white">Trending Keywords</span>
                            </div>
                            <div className="space-y-2">
                                {grokSeo.risingKeywords.slice(0, 5).map((k, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-white/[.02] hover:bg-white/[.04] transition-all">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-white truncate">"{k.keyword}"</p>
                                            <p className="text-[10px] text-slate-500">{k.intent} intent</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ml-2 ${k.trend === 'breakout' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{k.growthRate}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/seo-studio')} className="w-full mt-3 py-2 rounded-xl bg-amber-500/5 text-amber-400 text-xs font-bold hover:bg-amber-500/10 transition-all cursor-pointer border border-amber-500/10">
                                Open SEO Studio →
                            </button>
                        </div>
                    )}

                    {/* ── QUICK WIN (next event) ── */}
                    {upcoming.length > 0 && (
                        <div className="dash-card bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10 anim-up" style={{ animationDelay: '200ms' }}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-amber-400 text-lg">tips_and_updates</span>
                                <span className="text-sm font-bold text-white">Quick Win</span>
                            </div>
                            <p className="text-sm text-slate-300 mb-3">
                                <span className="text-base mr-1">{upcoming[0].emoji}</span>
                                <strong>{upcoming[0].name}</strong> is {upcoming[0].daysUntil === 0 ? 'today' : upcoming[0].daysUntil === 1 ? 'tomorrow' : `in ${upcoming[0].daysUntil} days`}
                            </p>
                            <button onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(upcoming[0].name)}&tone=${upcoming[0].tone}`)}
                                className="w-full py-2 rounded-xl bg-amber-500/10 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-amber-500/20">
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>Generate Content
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Intel Report Overlay */}
            {showIntelReport && intelReport && (
                <IntelReportViewer
                    mission={intelReport.mission}
                    findings={intelReport.findings}
                    onClose={() => { setShowIntelReport(false); setIntelReport(null) }}
                />
            )}
        </DashboardLayout>
    )
}


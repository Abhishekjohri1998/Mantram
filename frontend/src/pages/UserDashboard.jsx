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
        <div className={`relative overflow-hidden bg-[var(--sys-surface)] ${circle ? 'rounded-full' : 'rounded-lg'} ${className}`}>
            <div className="absolute inset-0 bg-[var(--sys-surface)] border border-[var(--sys-border)] -translate-x-full animate-[shimmer_2s_infinite]" />
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
                <div key={i} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                    <Skeleton className="h-3 w-16 mb-3" />
                    <Skeleton className="h-7 w-24" />
                </div>
            ))}
        </div>
    )
}

function SkeletonRings() {
    return (
        <div className="flex flex-col sm:flex-row items-center gap-8 p-6 glass-panel rounded-2xl border border-[var(--sys-border)]">
            <Skeleton className="size-32 rounded-full shrink-0" />
            <div className="grid grid-cols-2 gap-3 flex-1 w-full">
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
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
                    <div key={i} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] space-y-3">
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
                <div key={i} className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex flex-col items-center gap-2">
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
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-[var(--sys-border)] bg-[var(--sys-surface)]">
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
            <span className="text-base sm:text-lg font-extrabold text-[var(--sys-text)]">{value}</span>
            <span className="text-[10px] sm:text-xs md:text-sm text-[var(--sys-text-muted)] whitespace-nowrap uppercase tracking-tight">{label}</span>
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
        { icon: 'psychology', label: 'Brainstorm', path: '/brainstorm', color: '#FF4D00', bg: 'from-[#FF4D00]/15 to-[#FF7A00]/5' },
        { icon: 'edit_note', label: 'Content', path: '/content-studio', color: '#34d399', bg: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
        { icon: 'auto_fix_high', label: 'Creative', path: '/creative-studio', color: '#ec4899', bg: 'from-[#FF4D00]/15 to-[#FF7A00]/5' },
        { icon: 'movie', label: 'Video', path: '/video-studio', color: '#f59e0b', bg: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
        { icon: 'search_insights', label: 'SEO', path: '/seo-studio', color: '#06b6d4', bg: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
        { icon: 'campaign', label: 'Ads', path: '/performance-marketing', color: '#f43f5e', bg: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
        { icon: 'calendar_month', label: 'Calendar', path: '/smart-calendar', color: '#fb923c', bg: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
        { icon: 'forum', label: 'Inbox', path: '/conversations', color: '#FF4D00', bg: 'from-[#FF4D00]/15 to-[#FF7A00]/5' },
    ]

    // ── Intel tabs (Trends / News / Ideas) ──
    const intelTabs = [
        { id: 'trends', label: '🔥 Trending' },
        { id: 'news',   label: '📰 News' },
        { id: 'ideas',  label: '💡 Ideas' },
    ]

    return (
        <DashboardLayout title="Command Center" subtitle="Your AI-driven operational hub">
            <SEOHead title="Command Center — Mantram AI" noIndex={true} />

            {/* ERROR BANNER */}
            {error && (
                <div className={`mb-6 p-4 rounded-xl border flex items-center gap-4 ${error.isProviderError ? 'bg-[#ff7a00]/10 border-[#ff7a00]/20 text-[#ff7a00]' : 'bg-[#ff4d00]/10 border-[#ff4d00]/20 text-[#ff4d00]'}`}>
                    <span className="material-symbols-outlined text-xl">{error.isProviderError ? 'warning' : 'error'}</span>
                    <p className="flex-1 text-sm font-medium">{error.isProviderError && <span className="font-bold mr-1">[{error.provider}]</span>}{error.message}</p>
                    <button onClick={() => setError(null)}><span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] opacity-70 hover:text-[var(--sys-text)] transition-colors">close</span></button>
                </div>
            )}

            {/* COMMAND BOX / GLOBAL SCAN */}
            <div className="mb-8 relative">
                <SmartCommandBox variant="dashboard" className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl p-4 text-[var(--sys-text)] placeholder-[#48474c] focus:border-[#ff4d00]/50 shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)]" />
            </div>

            {/* 12-COLUMN GRID CORE */}
            <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6 pb-12">
                
                {/* ════ LEFT COLUMN (8 cols) ════ */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    
                    {/* 1. HERO INSIGHT (AI Mission Feed) */}
                    {loadingSummary ? (
                        <div className="relative overflow-hidden rounded-3xl border border-[var(--sys-border)] bg-[var(--sys-bg)] p-8 h-[200px] flex items-center justify-center">
                            <span className="material-symbols-outlined text-[var(--sys-text-muted)] opacity-70 text-3xl animate-spin">progress_activity</span>
                        </div>
                    ) : insight ? (
                        <div className="relative overflow-hidden rounded-3xl border border-[#ff4d00]/20 bg-[var(--sys-bg)] p-8 mt-[2px] shadow-[0_8px_32px_rgba(255,77,0,0.05)] group">
                            {/* Glass overlay */}
                            <div className="absolute inset-0 bg-[var(--sys-surface)] border border-[var(--sys-border)] pointer-events-none"></div>
                            {/* Ambient glow tracking group hover */}
                            <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-[radial-gradient(circle,rgba(255,77,0,0.1)_0%,transparent_70%)] rounded-full -translate-y-1/2 translate-x-1/3 group-hover:scale-110 transition-transform duration-700 pointer-events-none blur-3xl"></div>
                            
                            <div className="relative z-10">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="material-symbols-outlined text-[#ff4d00] animate-pulse">crisis_alert</span>
                                    <span className="text-xs font-bold uppercase tracking-widest text-[#ff4d00]">Active Objective • {insight.category}</span>
                                </div>
                                <h2 className="text-3xl lg:text-4xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)] leading-tight mb-4 tracking-tighter">
                                    {insight.title}
                                </h2>
                                <p className="text-[var(--sys-text-muted)] text-lg max-w-2xl leading-relaxed mb-8">
                                    {insight.tip}
                                </p>
                                <button 
                                    onClick={() => navigate(insight.actionPath || '/content-studio')}
                                    className="bg-white text-black px-6 py-3 rounded-lg font-bold hover:bg-[#acaab0] transition-colors flex items-center gap-2 group/btn cursor-pointer">
                                    <span>{insight.actionLabel || 'Initiate Scan'}</span>
                                    <span className="material-symbols-outlined group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {/* 2. TELEMETRY GRID (Brand Health) */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: 'Content Velocity', score: health?.contentVelocity, color: '#ff4d00', icon: 'speed' },
                            { label: 'Creative DNA', score: health?.creativeOutput, color: '#8ff5ff', icon: 'fingerprint' },
                            { label: 'Brand Matrix', score: health?.brandCompleteness, color: '#f3eff6', icon: 'grid_view' },
                            { label: 'Trend Alignment', score: health?.trendReadiness, color: '#ff906d', icon: 'trending_up' },
                        ].map((m, i) => (
                            <div key={i} className="rounded-3xl border border-[var(--sys-border)] bg-[var(--sys-bg)] p-5 relative overflow-hidden group hover:border-[var(--sys-border)] transition-all">
                                <span className="material-symbols-outlined absolute top-4 right-4 text-[var(--sys-text-muted)] opacity-70 text-3xl opacity-20 group-hover:text-[var(--sys-text)]/10 group-hover:scale-110 transition-all duration-500">{m.icon}</span>
                                <p className="text-[var(--sys-text-muted)] text-xs font-bold uppercase tracking-widest mb-1">{m.label}</p>
                                <p className="text-4xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)] mb-3">
                                    {Math.round(m.score || 0)}<span className="text-lg text-[var(--sys-text-muted)] opacity-70 ml-1">/100</span>
                                </p>
                                {/* Micro progress bar */}
                                <div className="h-1 w-full bg-[var(--sys-surface)] rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${m.score || 0}%`, background: m.color, boxShadow: `0 0 10px ${m.color}` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 3. PERFORMANCE ARCHITECTURE */}
                    {(perfData || funnelData || blendedRoas) && (
                        <div className="rounded-3xl border border-[var(--sys-border)] bg-[var(--sys-bg)] p-6 shadow-2xl overflow-hidden relative">
                            {/* Glass highlights */}
                            <div className="absolute top-0 inset-x-0 h-[1px] bg-[var(--sys-surface)] border border-[var(--sys-border)]"></div>
                            
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-[#8ff5ff]">finance</span>
                                    <h3 className="text-lg font-bold text-[var(--sys-text)]">Performance Vector</h3>
                                </div>
                                <button className="text-xs text-[var(--sys-text-muted)] opacity-70 hover:text-[var(--sys-text)] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 cursor-pointer" onClick={() => navigate('/performance-marketing')}>
                                    Deep Dive <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-8 gap-x-4">
                                <div>
                                    <p className="text-[var(--sys-text-muted)] text-xs font-bold uppercase tracking-widest mb-1">Total Ad Spend</p>
                                    <p className="text-3xl font-['Space_Grotesk'] font-bold text-[#ff4d00]">₹{(perfData?.stats?.totalSpend || 0).toLocaleString()}</p>
                                    <p className="text-[var(--sys-text-muted)] opacity-70 text-[10px] uppercase font-bold mt-1 tracking-wider"><span className="text-green-500">Live</span> Meta + Google</p>
                                </div>
                                <div>
                                    <p className="text-[var(--sys-text-muted)] text-xs font-bold uppercase tracking-widest mb-1">Blended ROAS</p>
                                    <p className="text-3xl font-['Space_Grotesk'] font-bold text-[#8ff5ff]">{blendedRoas?.mer?.toFixed(1) || perfData?.stats?.avgRoas || '—'}x</p>
                                    <p className="text-[var(--sys-text-muted)] opacity-70 text-[10px] uppercase font-bold mt-1 tracking-wider">Across Network</p>
                                </div>
                                <div>
                                    <p className="text-[var(--sys-text-muted)] text-xs font-bold uppercase tracking-widest mb-1">Funnel CVP</p>
                                    <p className="text-3xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)]">{funnelData?.analytics?.overview?.conversionRate || 0}%</p>
                                    <p className="text-[var(--sys-text-muted)] opacity-70 text-[10px] uppercase font-bold mt-1 tracking-wider">Macro Conversion</p>
                                </div>
                                <div>
                                    <p className="text-[var(--sys-text-muted)] text-xs font-bold uppercase tracking-widest mb-1">Active Flights</p>
                                    <p className="text-3xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)]">{perfData?.stats?.activeCampaigns || 0}</p>
                                    <p className="text-[var(--sys-text-muted)] opacity-70 text-[10px] uppercase font-bold mt-1 tracking-wider">Campaigns Live</p>
                                </div>
                            </div>
                        </div>
                    )}
                
                    {/* ── INTELLIGENCE HUB (Trends / News / Ideas) ── */}
                    <div className="dash-card overflow-hidden !p-0 anim-up" style={{ animationDelay: '140ms' }}>
                        {/* Tab bar */}
                        <div className="flex border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                            {intelTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`intel-tab flex-1 px-4 py-3 text-xs font-black cursor-pointer border-b-2 transition-all ${activeTab === tab.id ? 'active border-violet-500 text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)] border-transparent hover:text-[var(--sys-text)]'}`}>
                                    {tab.label}
                                </button>
                            ))}
                            <button onClick={() => { loadSummary(); loadTrends() }}
                                className="px-4 text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-colors border-l border-[var(--sys-border)]">
                                <span className={`material-symbols-outlined text-lg ${loadingSummary ? 'animate-spin' : ''}`}>refresh</span>
                            </button>
                        </div>

                        <div className="p-5">
                            {/* ── TRENDS TAB ── */}
                            {activeTab === 'trends' && (
                                <div className="space-y-2.5">
                                    {(trendsLoading && trendingTopics.length === 0) ? (
                                        <div className="flex items-center gap-2 py-6 text-[var(--sys-text-muted)] text-sm">
                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            Scanning trends…
                                        </div>
                                    ) : trendingTopics.length > 0 ? trendingTopics.slice(0, 5).map((trend, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] hover:border-rose-500/15 transition-all group"
                                            style={{ animation: `slide-up .35s ease-out ${i * 50}ms both` }}>
                                            <span className={`material-symbols-outlined text-xl shrink-0 ${trend.source === 'Grok xAI' ? 'text-orange-400' : 'text-rose-400'}`}>
                                                {trend.source === 'Grok xAI' ? 'smart_toy' : 'trending_up'}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <p className="text-sm font-bold text-[var(--sys-text)] truncate">{trend.title}</p>
                                                    {trend.urgency === 'high' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold shrink-0">🔥</span>}
                                                </div>
                                                {(trend.contentIdea || trend.angle) && (
                                                    <p className="text-xs text-[var(--sys-text-muted)] truncate">💡 {trend.contentIdea || trend.angle}</p>
                                                )}
                                            </div>
                                            <button onClick={() => navigate(`/content-studio?trend=${encodeURIComponent(trend.title)}&prompt=${encodeURIComponent(trend.contentIdea || `Create content about "${trend.title}"`)}`)}
                                                className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all cursor-pointer border border-rose-500/15 opacity-60 group-hover:opacity-100 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                                <span className="hidden sm:inline">Create</span>
                                            </button>
                                        </div>
                                    )) : grokTrends.slice(0, 4).map((t, i) => (
                                        <div key={i} className="p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-orange-500/20 transition-all"
                                            style={{ animation: `slide-up .35s ease-out ${i * 50}ms both` }}>
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <p className="text-sm font-bold text-[var(--sys-text)]">{t.topic}</p>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${t.urgency === 'now' ? 'bg-rose-500/15 text-rose-400' : t.urgency === 'today' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/10 text-[var(--sys-text-muted)]'}`}>
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
                                        [1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-[var(--sys-surface)] animate-pulse" />)
                                    ) : businessNews.length > 0 ? businessNews.slice(0, 5).map((n, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-emerald-500/15 transition-all"
                                            style={{ animation: `slide-up .35s ease-out ${i * 60}ms both` }}>
                                            <span className="text-xl shrink-0">{n.emoji || '📰'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-bold text-[var(--sys-text)] leading-snug">{n.headline}</p>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${n.category === 'funding' ? 'bg-green-500/10 text-green-400' : n.category === 'competitor' ? 'bg-rose-500/10 text-rose-400' : 'bg-cyan-500/10 text-cyan-400'}`}>{n.category}</span>
                                                </div>
                                                <p className="text-xs text-emerald-400 mt-1">💡 {n.relevance}</p>
                                            </div>
                                        </div>
                                    )) : <p className="text-sm text-[var(--sys-text-muted)] py-6 text-center">No news yet — refresh to fetch latest.</p>}
                                </div>
                            )}

                            {/* ── IDEAS TAB ── */}
                            {activeTab === 'ideas' && (
                                <div className="space-y-2.5">
                                    {loadingSummary ? (
                                        [1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl bg-[var(--sys-surface)] animate-pulse" />)
                                    ) : grokContent.length > 0 ? grokContent.slice(0, 5).map((s, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] hover:border-cyan-500/20 transition-all cursor-pointer group"
                                            onClick={() => navigate(`/content-studio?goal=write&prompt=${encodeURIComponent(s.hook || s.title)}`)}
                                            style={{ animation: `slide-up .35s ease-out ${i * 60}ms both` }}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400' : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-[var(--sys-text-muted)]'}`}>{s.platform}</span>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)] font-bold">{s.format}</span>
                                                    {s.viralPotential === 'high' && <span className="text-[10px] text-orange-400 font-bold ml-auto">🔥 Viral</span>}
                                                </div>
                                                <p className="text-sm font-bold text-[var(--sys-text)] group-hover:text-cyan-400 transition-colors line-clamp-1">{s.title}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)] line-clamp-2 mt-0.5">{s.hook}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] group-hover:text-cyan-400 transition-colors shrink-0 mt-1">arrow_forward</span>
                                        </div>
                                    )) : <p className="text-sm text-[var(--sys-text-muted)] py-6 text-center">No content ideas yet — refresh to generate.</p>}
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
                                    <span className="text-sm font-bold text-[var(--sys-text)]">Upcoming Opportunities</span>
                                </div>
                                <button onClick={() => navigate('/smart-calendar')} className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-bold cursor-pointer">View All →</button>
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                                {upcoming.slice(0, 7).map((e, i) => {
                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                    return (
                                        <button key={i} onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(e.name)}&tone=${e.tone}`)}
                                            className="shrink-0 w-36 rounded-xl p-3 text-left bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer border flex flex-col gap-2"
                                            style={{ borderColor: color.border + '25', animation: `slide-up .35s ease-out ${i * 40}ms both` }}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xl">{e.emoji}</span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-violet-500/15 text-violet-400'}`}>
                                                    {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TMR' : `${e.daysUntil}d`}
                                                </span>
                                            </div>
                                            <p className="text-xs font-bold text-[var(--sys-text)] leading-tight line-clamp-2">{e.name}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* ════ RIGHT COLUMN (4 cols) ════ */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                    
                    {/* ACTIVE STUDIOS LIST */}
                    <div className="rounded-3xl border border-[var(--sys-border)] bg-[var(--sys-bg)] p-6 relative overflow-hidden">
                        <h3 className="text-sm font-bold text-[var(--sys-text)] uppercase tracking-widest mb-6">Active Studios</h3>
                        <div className="space-y-1">
                            {studios.slice(0, 5).map((s, i) => (
                                <button key={i} onClick={() => navigate(s.path)}
                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[var(--sys-surface)] transition-colors group cursor-pointer border border-transparent hover:border-[#48474c]/30">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center border border-[var(--sys-border)] group-hover:border-[#ff4d00]/50 transition-colors">
                                            <span className="material-symbols-outlined text-[16px] text-[var(--sys-text-muted)] group-hover:text-[#ff4d00]" style={s.color === '#FF4D00' ? {color: '#FF4D00'} : {}}>{s.icon}</span>
                                        </div>
                                        <span className="text-sm font-medium text-[var(--sys-text-muted)] group-hover:text-[var(--sys-text)] transition-colors">{s.label}</span>
                                    </div>
                                    <span className="material-symbols-outlined text-[var(--sys-text-muted)] opacity-70 group-hover:text-[var(--sys-text)] transition-colors">arrow_forward</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* D2C PULSE */}
                    <div className="rounded-3xl border border-[var(--sys-border)] bg-[var(--sys-bg)] p-6 relative">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#8ff5ff] text-xl">storefront</span>
                                <h3 className="text-sm font-bold text-[var(--sys-text)] uppercase tracking-widest">D2C Pulse</h3>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${d2cSnapshot?.connected ? 'bg-[#8ff5ff] animate-pulse' : 'bg-[var(--sys-surface)]'}`}></div>
                                <span className="text-[10px] font-bold text-[var(--sys-text-muted)] opacity-70 uppercase">{d2cSnapshot?.connected ? 'Live Sync' : 'Disconnected'}</span>
                            </div>
                        </div>

                        {d2cSnapshot?.connected ? (
                            <div className="space-y-4">
                                <div className="border border-[var(--sys-border)] rounded-2xl p-4 bg-[var(--sys-surface)]">
                                    <p className="text-[var(--sys-text-muted)] text-[10px] font-bold uppercase tracking-widest mb-1">Weekly Volume</p>
                                    <p className="text-2xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)] flex items-baseline gap-1">
                                        ₹{(d2cSnapshot.weeklyRevenue || 0).toLocaleString()} <span className="text-xs text-[#8ff5ff]">+4.2%</span>
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="border border-[var(--sys-border)] rounded-2xl p-4 bg-[var(--sys-surface)]">
                                        <p className="text-[var(--sys-text-muted)] text-[10px] font-bold uppercase tracking-widest mb-1">Orders</p>
                                        <p className="text-xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)]">{d2cSnapshot.weeklyOrders || 0}</p>
                                    </div>
                                    <div className="border border-[var(--sys-border)] rounded-2xl p-4 bg-[var(--sys-surface)]">
                                        <p className="text-[var(--sys-text-muted)] text-[10px] font-bold uppercase tracking-widest mb-1">Velocity</p>
                                        <p className="text-xl font-['Space_Grotesk'] font-bold text-[var(--sys-text)]">High</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-6">
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] opacity-70 text-3xl mb-2">sync_disabled</span>
                                <p className="text-[var(--sys-text-muted)] text-xs mb-4">Shopify API disconnected.</p>
                                <button className="px-4 py-2 bg-[var(--sys-surface)] border border-[#48474c]/30 rounded-lg text-xs font-bold text-[var(--sys-text)] hover:bg-[#48474c]/20 transition-colors" onClick={() => navigate('/d2c-analytics')}>Configure Source</button>
                            </div>
                        )}
                    </div>

                                        {/* ── TRENDING KEYWORDS ── */}
                    {grokSeo?.risingKeywords?.length > 0 && (
                        <div className="dash-card border border-amber-500/10 anim-up" style={{ animationDelay: '160ms' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-400 text-lg">search</span>
                                <span className="text-sm font-bold text-[var(--sys-text)]">Trending Keywords</span>
                            </div>
                            <div className="space-y-2">
                                {grokSeo.risingKeywords.slice(0, 5).map((k, i) => (
                                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-[var(--sys-text)] truncate">"{k.keyword}"</p>
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">{k.intent} intent</p>
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
                                <span className="text-sm font-bold text-[var(--sys-text)]">Quick Win</span>
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

                    {/* SYSTEM STATUS */}
                    <div className="rounded-3xl border border-[var(--sys-border)] bg-[var(--sys-bg)] p-6 relative overflow-hidden">
                        <div className="flex items-center gap-2 mb-6">
                            <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-xl">router</span>
                            <h3 className="text-sm font-bold text-[var(--sys-text)] uppercase tracking-widest">System Matrix</h3>
                        </div>

                        <div className="space-y-4">
                            {/* Threat / Alerts */}
                            {anomalies.length > 0 ? (
                                <div className="flex items-start gap-3 p-3 bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-xl">
                                    <span className="material-symbols-outlined text-primary text-sm mt-0.5">warning</span>
                                    <div>
                                        <p className="text-xs font-bold text-primary">Anomaly Detected</p>
                                        <p className="text-[10px] text-primary/80">{anomalies[0]?.metric || 'Data drift'} threshold breached</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--sys-text-muted)] text-xs font-bold">Network Anomalies</span>
                                    <span className="text-[#8ff5ff] text-xs font-bold px-2 py-0.5 bg-[#8ff5ff]/10 rounded border border-[#8ff5ff]/20">0 Threats</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between">
                                <span className="text-[var(--sys-text-muted)] text-xs font-bold">API Router</span>
                                <span className="text-xs font-bold text-[var(--sys-text)]">Optimal</span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                                <span className="text-[var(--sys-text-muted)] text-xs font-bold text-nowrap">Local Context</span>
                                <span className="text-[10px] font-mono text-[var(--sys-text-muted)] opacity-70 bg-[var(--sys-surface)] px-2 py-0.5 rounded border border-[var(--sys-border)]">0x{activeBrand?._id?.slice(-6) || 'a82f3'}</span>
                            </div>
                            
                            {/* Visual Divider */}
                            <div className="h-[1px] w-full bg-[#48474c]/20 my-2"></div>
                            
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[var(--sys-text-muted)] opacity-70">System Check</span>
                                <span className="text-[var(--sys-text-muted)] opacity-70 text-[10px] font-bold tracking-widest uppercase">Pass</span>
                            </div>
                        </div>
                    </div>

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


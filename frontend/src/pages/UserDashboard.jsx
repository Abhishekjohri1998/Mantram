import { useState, useEffect, useMemo, useCallback, memo } from 'react'

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

const TypingGreeting = memo(({ text, speed = 40 }) => {
    const { displayed, done } = useTypewriter(text, speed)
    return (
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight truncate">
            {displayed}
            {!done && <span className="inline-block w-1.5 h-6 sm:h-8 bg-violet-500 ml-1 rounded-full animate-[cursor-blink_1s_step-end_infinite]" />}
        </h1>
    )
})
TypingGreeting.displayName = 'TypingGreeting'


// ── Apple-Watch Health Ring ──
const HealthRing = memo(({ score, radius, strokeWidth, color, label, delay = 0, loading = false }) => {
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
})
HealthRing.displayName = 'HealthRing'


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
const TickerItem = memo(({ icon, value, label, color }) => {
    return (
        <div className="flex items-center gap-1.5 sm:gap-2.5 px-3 sm:px-5 py-2 sm:py-2.5 shrink-0">
            <span className="material-symbols-outlined text-base sm:text-lg" style={{ color }}>{icon}</span>
            <span className="text-base sm:text-lg font-extrabold text-white">{value}</span>
            <span className="text-[10px] sm:text-xs md:text-sm text-slate-500 whitespace-nowrap uppercase tracking-tight">{label}</span>
        </div>
    )
})
TickerItem.displayName = 'TickerItem'

const AnalyticsSection = memo(({ radar, radarHover, setRadarHover }) => {
    if (!radar) return null;
    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Animated ATS Radar */}
            <div className="xl:col-span-5 flex flex-col gap-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-l-2 border-rose-500 pl-2">Realtime Traffic</p>
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
                    <div className="relative shrink-0 w-full max-w-[160px] sm:max-w-[180px] aspect-square">
                        <svg viewBox="0 0 150 150" className="absolute inset-0 w-full h-full">
                            <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                            <circle cx="75" cy="75" r="52" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                            <circle cx="75" cy="75" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            <circle cx="75" cy="75" r="20" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                            <line x1="75" y1="5" x2="75" y2="145" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                            <line x1="5" y1="75" x2="145" y2="75" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                            <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(244,63,94,0.1)" strokeWidth="1.5" />
                        </svg>
                        <svg viewBox="0 0 150 150" className="absolute inset-0 w-full h-full radar-sweep-arm">
                            <defs>
                                <linearGradient id="sweepGrad" gradientTransform="rotate(90)">
                                    <stop offset="0%" stopColor="rgba(244,63,94,0.2)" />
                                    <stop offset="100%" stopColor="rgba(244,63,94,0)" />
                                </linearGradient>
                            </defs>
                            <path d="M75,75 L75,7 A68,68 0 0,1 139,55 Z" fill="url(#sweepGrad)" />
                            <line x1="75" y1="75" x2="75" y2="7" stroke="rgba(244,63,94,0.6)" strokeWidth="1.5" />
                        </svg>
                        <svg viewBox="0 0 150 150" className="absolute inset-0 w-full h-full">
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
                            <circle cx="75" cy="75" r="3" fill="#f43f94" />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-2 flex-1 min-w-0">
                        {radar.sources?.slice(0, 4).map((s, i) => (
                            <div key={i} className="flex items-center gap-2 cursor-default group/src"
                                onMouseEnter={() => setRadarHover(`src-${i}`)} onMouseLeave={() => setRadarHover(null)}>
                                <div className="size-1.5 rounded-full shrink-0 group-hover/src:scale-125 transition-transform" style={{ background: s.color, boxShadow: radarHover === `src-${i}` ? `0 0 8px ${s.color}` : 'none' }} />
                                <span className={`text-[10px] font-bold truncate transition-colors ${radarHover === `src-${i}` ? 'text-white' : 'text-slate-400'}`}>{s.name}</span>
                                <span className="text-[10px] font-black text-white ml-auto">{s.value}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Location Bars */}
            <div className="xl:col-span-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-l-2 border-indigo-500 pl-2 mb-4">Top Geos</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-1 gap-3 sm:gap-4">
                    {radar.locations?.slice(0, 5).map((loc, i) => (
                        <div key={i} className="group/loc">
                            <div className="flex justify-between mb-1.5">
                                <span className="text-[10px] font-bold text-slate-400 group-hover/loc:text-white transition-colors truncate w-20">{loc.name}</span>
                                <span className="text-[10px] font-black text-white">{loc.value}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                                    style={{ width: `${loc.value}%`, background: `linear-gradient(90deg, #8b5cf6, #06b6d4)` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Audience Split */}
            <div className="xl:col-span-4 flex flex-col gap-5">
                <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-l-2 border-emerald-500 pl-2 mb-4">Audience Split</p>
                    <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-white/[0.02]">
                        {radar.gender?.map((g, i) => (
                            <div key={i} className="h-full transition-all duration-500 hover:brightness-125" title={`${g.name}: ${g.value}%`}
                                style={{ width: `${g.value}%`, background: g.color, borderRadius: i === 0 ? '9999px 0 0 9999px' : i === radar.gender.length - 1 ? '0 9999px 9999px 0' : '0' }} />
                        ))}
                    </div>
                    <div className="flex justify-between mt-3 flex-wrap gap-x-4 gap-y-1">
                        {radar.gender?.map((g, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="size-1.5 rounded-full" style={{ background: g.color }} />
                                <span className="text-[10px] font-bold text-slate-500">{g.name}</span>
                                <span className="text-[10px] font-black text-white">{g.value}%</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {radar.devices?.map((d, i) => (
                        <div key={i} className="p-2 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center hover:bg-white/5 transition-all group/dev">
                            <span className="material-symbols-outlined text-base group-hover/dev:scale-110 transition-transform block mb-1" style={{ color: d.color }}>
                                {d.name === 'Mobile' ? 'smartphone' : d.name === 'Desktop' ? 'computer' : 'tablet'}
                            </span>
                            <p className="text-[10px] font-black text-white">{d.value}%</p>
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">{d.name}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
})
AnalyticsSection.displayName = 'AnalyticsSection'


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
    const greetingText = useMemo(() => `${getGreeting()}, ${user?.name?.split(' ')[0] || 'Creator'}`, [user?.name])


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
        const loadInitial = async () => {
            // Tier 1: Summary (Hero + Daily Insight)
            await loadSummary()
            
            // Tier 2: Real-time Analytics & Shopify
            loadAnalytics()
            setLoadingD2C(true)
            shopifyAnalytics.snapshot()
                .then(d => setD2cSnapshot(d))
                .catch(err => setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }))
                .finally(() => setLoadingD2C(false))

            // Tier 3: General Trends (last priority)
            setTimeout(() => loadTrends(), 1000)
        }

        loadInitial()

        // Background refresh every 60 minutes instead of 30
        const interval = setInterval(() => { 
            loadSummary()
            loadAnalytics()
            setTimeout(() => loadTrends(), 5000)
        }, 60 * 60 * 1000)
        
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

    // Intelligence tab content
    const intelTabs = [
        { id: 'trends', label: '🔥 Trending', count: grokTrends.length + trendingTopics.length },
        { id: 'news', label: '📰 News', count: businessNews.length },
        { id: 'trivia', label: '🧠 Trivia', count: didYouKnow.length },
    ]

    return (
        <DashboardLayout title="Dashboard" subtitle="Your AI command center">
            <SEOHead title="Dashboard — Mantram AI" noIndex={true} />
            {/* ═══════ CSS Animations ═══════ */}
            <style>{`
                @keyframes shimmer { 100% { transform: translateX(100%) } }
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
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 0. ERROR BANNER                                                */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {error && (
                <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 animate-fade-in ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                    <span className="material-symbols-outlined">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError(null)} className="text-slate-500 hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* 1. HERO GREETING + STREAK                                      */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {loadingSummary ? (
                <SkeletonHero />
            ) : (
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-5 sm:mb-6 gap-3 anim-slide-up">
                    <div className="min-w-0">
                        <p className="text-slate-400 text-sm sm:text-base font-medium mb-1">{getDateString()}</p>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <TypingGreeting text={greetingText} />
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 shrink-0">

                                <span className={`size-2 rounded-full bg-emerald-400 animate-pulse`} />
                                <span className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider">AI Active</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {streak > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 anim-float">
                                <span className="text-lg sm:text-xl">🔥</span>
                                <div className="min-w-0">
                                    <p className="text-xs sm:text-sm font-extrabold text-amber-400 truncate">{streak}-Day Streak</p>
                                    <p className="text-[10px] sm:text-xs text-amber-500/60 truncate">Keep creating!</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Smart Command Box */}
            <SmartCommandBox variant="dashboard" className="mb-5" />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 2. MISSION CONTROL — DAILY AI INSIGHT                          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {loadingSummary ? (
                <div className="mb-6 anim-slide-up" style={{ animationDelay: '100ms' }}>
                    <div className="glass-panel p-6 rounded-2xl border-2 border-white/[0.04] space-y-4">
                        <Skeleton className="h-4 w-32" />
                        <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-6 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                            </div>
                            <Skeleton className="size-16 rounded-2xl shrink-0" />
                        </div>
                        <div className="flex gap-3">
                            <Skeleton className="h-9 w-28 rounded-xl" />
                            <Skeleton className="h-9 w-28 rounded-xl" />
                        </div>
                    </div>
                </div>
            ) : insight ? (
                <div className="mb-6 anim-slide-up" style={{ animationDelay: '100ms' }}>
                    <div className="relative p-4 sm:p-5 lg:p-6 rounded-2xl overflow-hidden anim-border-glow anim-glow border-2"
                        style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(6,182,212,0.08) 50%, rgba(52,211,153,0.06) 100%)' }}>
                        {/* Ambient orbs */}
                        <div className="absolute -top-24 -right-24 size-48 bg-gradient-to-br from-violet-500/15 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-16 -left-16 size-32 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                        <div className="relative flex flex-col md:flex-row md:items-center gap-4 sm:gap-5">
                            <div className="shrink-0 flex items-center md:block">
                                <div className="size-14 sm:size-16 md:size-18 rounded-2xl bg-gradient-to-br from-violet-500/25 to-cyan-500/25 flex items-center justify-center text-3xl sm:text-4xl border border-violet-500/20 backdrop-blur-sm anim-float">
                                    {insight.emoji || '💡'}
                                </div>
                                <div className="ml-3 md:hidden">
                                     <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-bold uppercase tracking-widest">🤖 AI Mission</span>
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="hidden md:flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 font-bold uppercase tracking-widest">🤖 AI Mission</span>
                                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase ${insight.category === 'trend' ? 'bg-orange-500/15 text-orange-300'
                                        : insight.category === 'growth' ? 'bg-emerald-500/15 text-emerald-300'
                                            : insight.category === 'seasonal' ? 'bg-amber-500/15 text-amber-300'
                                                : 'bg-cyan-500/15 text-cyan-300'
                                        }`}>{insight.category}</span>
                                </div>
                                <h3 className="text-lg sm:text-xl font-extrabold text-white mb-1 group-hover:text-primary transition-colors">{insight.title}</h3>
                                <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-medium">{insight.tip}</p>
                            </div>
                            <button onClick={() => navigate(insight.actionPath || '/content-studio')}
                                className="w-full md:w-auto shrink-0 px-6 py-3 rounded-xl text-white text-sm sm:text-base font-bold transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.03] active:scale-95 group"
                                style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>
                                <span className="material-symbols-outlined text-lg group-hover:rotate-12 transition-transform">rocket_launch</span>
                                {insight.actionLabel || 'Act Now'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 3. REVENUE COMMAND STRIP                                       */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="mb-6 rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden anim-slide-up" style={{ animationDelay: '200ms' }}>
                <div className="flex overflow-hidden">
                    <div className="flex ticker-track">
                        {(loadingSummary || loadingD2C) ? (
                            <div className="flex gap-12 px-6 py-3.5">
                                {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-6 w-36" />)}
                            </div>
                        ) : [0, 1].map(dup => (
                            <div key={dup} className="flex">
                                <TickerItem icon="payments" value={`₹${(d2cSnapshot?.weeklyRevenue || 0).toLocaleString()}`} label="D2C Revenue" color="#34d399" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="show_chart" value={`${blendedRoas?.mer?.toFixed(1) || perfData?.stats?.avgRoas || '0'}x`} label="Blended ROAS" color="#f43f5e" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="account_balance" value={`₹${(perfData?.stats?.totalSpend || 0).toLocaleString()}`} label="Ad Spend" color="#f59e0b" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="campaign" value={perfData?.stats?.activeCampaigns || 0} label="Active Campaigns" color="#8b5cf6" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="filter_alt" value={`${funnelData?.analytics?.overview?.conversionRate || 0}%`} label="Funnel Conversion" color="#6366f1" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="shopping_bag" value={d2cSnapshot?.weeklyOrders || 0} label="Weekly Orders" color="#06b6d4" />
                                <div className="w-px bg-white/[0.06] my-2" />
                                <TickerItem icon="trending_up" value={`₹${d2cSnapshot?.aov || 0}`} label="AOV" color="#34d399" />
                                <div className="w-px bg-white/[0.06] my-2" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20 sm:pb-0">
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* MAIN COLUMN                                                 */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="col-span-1 lg:col-span-8 space-y-6">

                    {/* ── 4. BRAND HEALTH RINGS ── */}
                    {loadingSummary ? (
                        <SkeletonRings />
                    ) : (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-white/[0.06] anim-slide-up" style={{ animationDelay: '250ms' }}>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-emerald-400">monitoring</span>
                                <span className="text-base sm:text-lg font-bold text-white">Brand Health</span>
                                <span className="text-lg sm:text-xl md:text-2xl font-extrabold text-white ml-auto">{health.overallScore || 0}<span className="text-[10px] sm:text-xs sm:text-sm text-slate-500 font-medium ml-1">/100</span></span>
                            </div>
                            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                                <div className="shrink-0 w-full max-w-[140px] sm:max-w-[160px] md:max-w-none md:w-[150px] lg:w-[180px] aspect-square flex items-center justify-center">
                                    <svg viewBox="0 0 180 180" className="w-full h-full">
                                        <HealthRing score={health.contentVelocity || 0} radius={78} strokeWidth={8} color="#8b5cf6" label="Content" delay={0} />
                                        <HealthRing score={health.creativeOutput || 0} radius={66} strokeWidth={8} color="#06b6d4" label="Creative" delay={100} />
                                        <HealthRing score={health.brandCompleteness || 0} radius={54} strokeWidth={8} color="#f59e0b" label="DNA" delay={200} />
                                        <HealthRing score={health.trendReadiness || 0} radius={42} strokeWidth={8} color="#34d399" label="Trends" delay={300} />
                                    </svg>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 flex-1 w-full mt-4 md:mt-0">
                                    {[
                                        { label: 'Content Velocity', score: health.contentVelocity, color: '#8b5cf6', icon: 'article' },
                                        { label: 'Creative Output', score: health.creativeOutput, color: '#06b6d4', icon: 'image' },
                                        { label: 'Brand DNA', score: health.brandCompleteness, color: '#f59e0b', icon: 'fingerprint' },
                                        { label: 'Trend Readiness', score: health.trendReadiness, color: '#34d399', icon: 'trending_up' },
                                    ].map((m, i) => (
                                        <div key={i} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] transition-all hover:bg-white/[0.05]">
                                            <div className="size-2 sm:size-3 rounded-full shrink-0" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}60` }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[9px] sm:text-xs text-slate-400 truncate uppercase mt-0.5">{m.label}</p>
                                                <p className="text-sm sm:text-lg font-extrabold text-white leading-tight">{Math.round(m.score || 0)}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── 4a. FUNNEL VELOCITY ── */}
                    {funnelData && (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-indigo-500/15 anim-slide-up cursor-pointer group hover:bg-indigo-500/[0.02] transition-colors"
                            style={{ animationDelay: '275ms' }}
                            onClick={() => navigate('/funnel-studio')}>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-6">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-indigo-400 shrink-0">filter_alt</span>
                                    <span className="text-base sm:text-lg font-bold text-white truncate">Funnel Velocity</span>
                                    <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 truncate max-w-[120px]">
                                        {funnelData.funnel?.name || 'Active'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-xs sm:text-sm text-slate-500 group-hover:text-indigo-400 transition-colors shrink-0">
                                    <span className="hidden xs:inline">Open Studio</span>
                                    <span className="material-symbols-outlined text-sm group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                </div>
                            </div>

                            {/* ── Side-by-side: Funnel left, Stats right ── */}
                            <div className="flex flex-col md:flex-row gap-6 lg:gap-8">
                                {/* LEFT: Animated SVG Funnel */}
                                <div className="shrink-0 flex justify-center md:justify-start">
                                    {(() => {
                                        const stages = funnelData.analytics?.stages || []
                                        if (stages.length === 0) return null
                                        const svgW = 280, svgH = stages.length * 52 + 36
                                        const funnelCenter = svgW / 2
                                        const maxW = svgW - 20
                                        const topCount = Math.max(stages[0]?.everEntered || stages[0]?.currentCount || 1, 1)
                                        const stageColors = ['#818cf8', '#6366f1', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9']
                                        const glowColors = ['#818cf860', '#6366f160', '#a78bfa60', '#8b5cf660', '#7c3aed60', '#6d28d960']

                                        return (
                                            <svg className="w-full max-w-[240px] sm:max-w-[280px] h-auto" viewBox={`0 0 ${svgW} ${svgH}`}>
                                                <defs>
                                                    {stages.map((_, i) => (
                                                        <linearGradient key={`fg${i}`} id={`funnelGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor={stageColors[i % stageColors.length]} stopOpacity="0.85" />
                                                            <stop offset="100%" stopColor={stageColors[i % stageColors.length]} stopOpacity="0.35" />
                                                        </linearGradient>
                                                    ))}
                                                    <linearGradient id="funnelShimmer" x1="0" y1="0" x2="1" y2="1">
                                                        <stop offset="0%" stopColor="white" stopOpacity="0">
                                                            <animate attributeName="offset" values="-0.5;1.5" dur="3s" repeatCount="indefinite" />
                                                        </stop>
                                                        <stop offset="50%" stopColor="white" stopOpacity="0.12">
                                                            <animate attributeName="offset" values="0;2" dur="3s" repeatCount="indefinite" />
                                                        </stop>
                                                        <stop offset="100%" stopColor="white" stopOpacity="0">
                                                            <animate attributeName="offset" values="0.5;2.5" dur="3s" repeatCount="indefinite" />
                                                        </stop>
                                                    </linearGradient>
                                                    <filter id="funnelGlow">
                                                        <feGaussianBlur stdDeviation="4" result="blur" />
                                                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                                    </filter>
                                                </defs>

                                                {stages.map((stage, i) => {
                                                    const count = stage.everEntered || stage.currentCount || 0
                                                    const nextCount = stages[i + 1] ? (stages[i + 1].everEntered || stages[i + 1].currentCount || 0) : count * 0.5
                                                    const widthPct = Math.max(0.18, count / topCount)
                                                    const nextWidthPct = Math.max(0.12, nextCount / topCount)
                                                    const y = i * 52 + 12
                                                    const h = 40
                                                    const topHalf = (maxW * widthPct) / 2
                                                    const botHalf = (maxW * nextWidthPct) / 2
                                                    const tl = funnelCenter - topHalf, tr = funnelCenter + topHalf
                                                    const bl = funnelCenter - botHalf, br = funnelCenter + botHalf
                                                    const dropOff = stage.dropOffRate || 0
                                                    const color = stageColors[i % stageColors.length]

                                                    return (
                                                        <g key={i}>
                                                            <polygon points={`${tl},${y} ${tr},${y} ${br},${y + h} ${bl},${y + h}`}
                                                                fill={glowColors[i % glowColors.length]} filter="url(#funnelGlow)"
                                                                style={{ animation: `pulse 3s ease-in-out ${i * 0.4}s infinite` }} />
                                                            <polygon points={`${tl},${y} ${tr},${y} ${br},${y + h} ${bl},${y + h}`}
                                                                fill={`url(#funnelGrad${i})`} stroke={color} strokeWidth="1" strokeOpacity="0.4"
                                                                style={{ cursor: 'pointer' }} />
                                                            <polygon points={`${tl},${y} ${tr},${y} ${br},${y + h} ${bl},${y + h}`}
                                                                fill="url(#funnelShimmer)" />
                                                            {/* Stage name inside trapezoid */}
                                                            <text x={funnelCenter} y={y + h / 2 - 6} textAnchor="middle" fill="white" fontSize="14" fontStyle="italic" fontWeight="900" dominantBaseline="middle">
                                                                {count.toLocaleString()}
                                                            </text>
                                                            <text x={funnelCenter} y={y + h / 2 + 8} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontWeight="800" dominantBaseline="middle" style={{ textTransform: 'uppercase' }}>
                                                                {stage.stageName}
                                                            </text>
                                                            {/* Drop-off badge */}
                                                            {dropOff > 0 && i < stages.length - 1 && (
                                                                <g>
                                                                    <rect x={tr + 4} y={y + h - 6} width={dropOff > 9 ? 38 : 32} height={16} rx="8" fill="#f43f5e" fillOpacity="0.15" stroke="#f43f5e" strokeWidth="0.5" strokeOpacity="0.3" />
                                                                    <text x={tr + 4 + (dropOff > 9 ? 19 : 16)} y={y + h + 2} textAnchor="middle" fill="#fb7185" fontSize="8" fontWeight="800" dominantBaseline="middle">
                                                                        −{dropOff}%
                                                                    </text>
                                                                </g>
                                                            )}
                                                            {/* Animated particles */}
                                                            {[0, 1, 2].map(p => {
                                                                const px = funnelCenter + (p - 1) * 14
                                                                return (
                                                                    <circle key={p} cx={px} cy={y} r="1.5" fill="white" opacity="0">
                                                                        <animate attributeName="cy" values={`${y};${y + h}`} dur={`${1.8 + p * 0.3}s`} begin={`${p * 0.5 + i * 0.3}s`} repeatCount="indefinite" />
                                                                        <animate attributeName="opacity" values="0;0.5;0" dur={`${1.8 + p * 0.3}s`} begin={`${p * 0.5 + i * 0.3}s`} repeatCount="indefinite" />
                                                                        <animate attributeName="r" values="1;2;1" dur={`${1.8 + p * 0.3}s`} begin={`${p * 0.5 + i * 0.3}s`} repeatCount="indefinite" />
                                                                    </circle>
                                                                )
                                                            })}
                                                        </g>
                                                    )
                                                })}

                                                {/* Conversion drip */}
                                                {(() => {
                                                    const lastStage = stages[stages.length - 1]
                                                    const lastCount = lastStage?.everEntered || lastStage?.currentCount || 0
                                                    const lastWidthPct = Math.max(0.12, lastCount / topCount)
                                                    const lastBotHalf = (maxW * lastWidthPct * 0.5) / 2
                                                    const lastY = stages.length * 52 + 6
                                                    return (
                                                        <g>
                                                            <polygon points={`${funnelCenter - lastBotHalf},${lastY - 8} ${funnelCenter + lastBotHalf},${lastY - 8} ${funnelCenter},${lastY + 8}`}
                                                                fill="#34d399" fillOpacity="0.3" stroke="#34d399" strokeWidth="1" strokeOpacity="0.4" />
                                                            <circle cx={funnelCenter} cy={lastY + 14} r="3" fill="#34d399" opacity="0.8">
                                                                <animate attributeName="r" values="2;5;2" dur="2s" repeatCount="indefinite" />
                                                                <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
                                                            </circle>
                                                        </g>
                                                    )
                                                })()}
                                            </svg>
                                        )
                                    })()}
                                </div>

                                {/* RIGHT: Stats + Sources */}
                                <div className="flex-1 flex flex-col justify-between gap-5 min-w-0">
                                    {/* Conversion Ring + Key Metrics */}
                                    <div className="flex items-center gap-4 sm:gap-6 mb-1">
                                        <div className="shrink-0">
                                            <svg className="w-14 h-14 sm:w-[72px] sm:h-[72px]" viewBox="0 0 72 72">
                                                <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                                                <circle cx="36" cy="36" r="30" fill="none" stroke="#6366f1" strokeWidth="6" strokeLinecap="round"
                                                    strokeDasharray={`${(funnelData.analytics?.overview?.conversionRate || 0) / 100 * 188} 188`}
                                                    transform="rotate(-90 36 36)"
                                                    style={{ transition: 'stroke-dasharray 1s ease-out 0.3s' }} />
                                                <text x="36" y="33" textAnchor="middle" fill="white" fontSize="16" fontWeight="900" dominantBaseline="middle">
                                                    {funnelData.analytics?.overview?.conversionRate || 0}%
                                                </text>
                                                <text x="36" y="46" textAnchor="middle" fill="#94a3b8" fontSize="7" fontWeight="800" dominantBaseline="middle">
                                                    CR RATE
                                                </text>
                                            </svg>
                                        </div>
                                        <div className="flex-1 grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                                                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest mb-1">Leads</p>
                                                <p className="text-lg sm:text-xl font-black text-white">{funnelData.analytics?.overview?.totalEntries || 0}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                                                <p className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest mb-1">Sale</p>
                                                <p className="text-lg sm:text-xl font-black text-emerald-400">{funnelData.analytics?.overview?.convertedEntries || 0}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stage breakdown list */}
                                    <div className="space-y-2">
                                        {(funnelData.analytics?.stages || []).slice(0, 4).map((stage, i) => {
                                            const maxCount = Math.max(...(funnelData.analytics?.stages || []).map(s => s.everEntered || s.currentCount || 1))
                                            const pct = Math.round(((stage.everEntered || stage.currentCount || 0) / maxCount) * 100)
                                            const stageColors = ['#818cf8', '#6366f1', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9']
                                            return (
                                                <div key={i} className="flex items-center gap-3">
                                                    <span className="text-[10px] sm:text-xs font-bold text-slate-400 w-20 truncate uppercase tracking-tight">{stage.stageName}</span>
                                                    <div className="flex-1 h-1.5 sm:h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                                                            style={{ width: `${pct}%`, background: stageColors[i % stageColors.length] }} />
                                                    </div>
                                                    <span className="text-[10px] sm:text-xs font-black text-white w-8 text-right">{stage.everEntered || stage.currentCount || 0}</span>
                                                    {stage.dropOffRate > 0 && (
                                                        <span className="text-[9px] font-black text-rose-500/80 w-8">−{stage.dropOffRate}%</span>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Revenue + Source Breakdown */}
                                    <div className="flex items-center gap-3 flex-wrap mt-1">
                                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                            <span className="material-symbols-outlined text-sm text-amber-400">payments</span>
                                            <span className="text-[10px] text-amber-500/60 font-bold uppercase tracking-tight">Rev</span>
                                            <span className="text-sm font-black text-white">₹{(funnelData.analytics?.overview?.totalRevenue || 0).toLocaleString()}</span>
                                        </div>
                                        {(funnelData.analytics?.sourceBreakdown || []).slice(0, 3).map((src, i) => {
                                            const srcColors = ['#818cf8', '#34d399', '#f59e0b', '#f43f5e']
                                            return (
                                                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.1] hover:bg-white/[0.04] transition-colors">
                                                    <div className="size-1.5 rounded-full" style={{ background: srcColors[i % srcColors.length] }} />
                                                    <span className="text-[10px] text-slate-400 font-bold capitalize tracking-tight">{src.source}</span>
                                                    <span className="text-[10px] font-black text-white">{src.count}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── 4b. PERFORMANCE COCKPIT ── */}
                    {perfData && (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-rose-500/15 anim-slide-up group"
                            style={{ animationDelay: '290ms' }}>
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-rose-400 shrink-0">campaign</span>
                                    <span className="text-base sm:text-lg font-bold text-white truncate">Performance Cockpit</span>
                                    {anomalies.length > 0 && (
                                        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse shrink-0">
                                            {anomalies.length} Alert{anomalies.length > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 text-sm text-slate-500 group-hover:text-rose-400 transition-colors">
                                    <span>Deep Dive</span>
                                    <span className="material-symbols-outlined text-sm group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                </div>
                            </div>

                            {loadingAnalytics ? (
                                <SkeletonStats />
                            ) : (perfData.stats?.totalCampaigns || 0) > 0 ? (
                                <>
                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
                                        {[
                                            { label: 'Total Spend', value: `₹${(perfData.stats?.totalSpend || 0).toLocaleString()}`, icon: 'account_balance', color: '#f59e0b' },
                                            { label: 'ROAS', value: `${perfData.stats?.avgRoas || '0'}x`, icon: 'show_chart', color: parseFloat(perfData.stats?.avgRoas) >= 2 ? '#34d399' : '#f43f5e' },
                                            { label: 'CTR', value: `${perfData.stats?.avgCtr || '0'}%`, icon: 'ads_click', color: '#06b6d4' },
                                            { label: 'Sales', value: perfData.stats?.totalConversions || 0, icon: 'shopping_bag', color: '#8b5cf6' },
                                        ].map((m, i) => (
                                            <div key={i} className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] transition-all hover:bg-white/[0.05]">
                                                <div className="flex items-center gap-2 mb-1.5 min-w-0">
                                                    <span className="material-symbols-outlined text-xs sm:text-sm shrink-0" style={{ color: m.color }}>{m.icon}</span>
                                                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider truncate">{m.label}</span>
                                                </div>
                                                <p className="text-base sm:text-xl font-black text-white">{m.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Campaign List */}
                                    {perfData.campaigns?.length > 0 && (
                                        <div>
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Top Campaigns</p>
                                            <div className="space-y-2">
                                                {perfData.campaigns.slice(0, 4).map((c, i) => {
                                                    const platformColors = { meta: '#e879f9', google: '#60a5fa', tiktok: '#34d399' }
                                                    const statusColors = { active: 'bg-emerald-500/15 text-emerald-400', paused: 'bg-amber-500/15 text-amber-400', draft: 'bg-slate-500/15 text-slate-400' }
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-rose-500/15 transition-all"
                                                            style={{ animation: `slide-up 0.3s ease-out ${i * 50}ms both` }}>
                                                            <div className="size-8 rounded-lg flex items-center justify-center shrink-0"
                                                                style={{ background: `${platformColors[c.platform] || '#8b5cf6'}15` }}>
                                                                <span className="material-symbols-outlined text-sm" style={{ color: platformColors[c.platform] || '#8b5cf6' }}>
                                                                    {c.platform === 'meta' ? 'group' : c.platform === 'google' ? 'search' : 'campaign'}
                                                                </span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-bold text-white truncate">{c.title}</p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColors[c.status] || statusColors.draft}`}>
                                                                        {c.status}
                                                                    </span>
                                                                    <span className="text-[11px] text-slate-500 capitalize">{c.platform}</span>
                                                                </div>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-sm font-extrabold text-white">{c.roas ? `${c.roas}x` : '—'}</p>
                                                                <p className="text-[10px] text-slate-500">₹{(c.spend || 0).toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Blended ROAS footer */}
                                    {blendedRoas && (
                                        <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm text-amber-400">insights</span>
                                                <span className="text-xs text-slate-500">Blended MER</span>
                                                <span className="text-sm font-extrabold text-white">{blendedRoas.mer?.toFixed(2) || '—'}x</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-500">Revenue / Spend</span>
                                                <span className="text-sm font-bold text-emerald-400">₹{(blendedRoas.totalRevenue || 0).toLocaleString()} / ₹{(blendedRoas.totalSpend || 0).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Empty state — no campaigns yet */
                                <div className="text-center py-6 sm:py-10 max-w-lg mx-auto">
                                    <div className="size-16 sm:size-20 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto mb-5 group-hover:scale-110 transition-transform duration-500">
                                        <span className="material-symbols-outlined text-3xl sm:text-4xl text-rose-400">ads_click</span>
                                    </div>
                                    <p className="text-lg sm:text-xl font-black text-white mb-2 underline decoration-rose-500/30">Connect Your Ad Platforms</p>
                                    <p className="text-sm sm:text-base text-slate-400 leading-relaxed mb-8">
                                        Link Meta Ads or Google Ads to unlock live ROAS tracking, anomaly detection, and automated campaign insights.
                                    </p>
                                    <div className="flex flex-col xs:flex-row justify-center gap-3 px-4">
                                        {[
                                            { name: 'Meta Ads', icon: 'group', color: '#e879f9' },
                                            { name: 'Google Ads', icon: 'search', color: '#60a5fa' },
                                        ].map((p, i) => (
                                            <button key={i} className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-rose-500/10 hover:border-rose-500/30 transition-all group/btn">
                                                <span className="material-symbols-outlined text-lg group-hover/btn:scale-110 transition-transform" style={{ color: p.color }}>{p.icon}</span>
                                                <span className="text-sm font-bold text-white">{p.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[10px] sm:text-xs font-bold text-slate-500">
                                        <span className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"><span className="material-symbols-outlined text-sm text-emerald-400">bolt</span>LIVE ROAS</span>
                                        <span className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"><span className="material-symbols-outlined text-sm text-amber-400">warning</span>ANOMALY ALERTS</span>
                                        <span className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"><span className="material-symbols-outlined text-sm text-indigo-400">auto_fix_high</span>AI OPTIMIZATION</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── 4c. STRIKES RADAR ── */}
                    {radar && (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-white/[0.06] anim-slide-up cursor-pointer group hover:bg-white/[0.02] transition-all"
                            style={{ animationDelay: '300ms' }}
                            onClick={() => navigate('/d2c-analytics')}>
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-rose-400 shrink-0">radar</span>
                                    <span className="text-base sm:text-lg font-bold text-white truncate">Strikes Radar</span>
                                    <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-widest rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">Live</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs sm:text-sm text-slate-500 group-hover:text-primary transition-colors shrink-0">
                                    <span className="hidden xs:inline">Deep Dive</span>
                                    <span className="material-symbols-outlined text-sm group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                </div>
                            </div>

                            {/* Key Metrics Bar */}
                            <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 mb-5">
                                {loadingAnalytics ? (
                                    [1, 2, 3, 4].map(i => (
                                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] flex flex-col gap-2">
                                            <Skeleton className="h-3 w-16" />
                                            <Skeleton className="h-5 w-20" />
                                        </div>
                                    ))
                                ) : (
                                    [
                                        { label: 'Total Visitors', value: radar.totalVisitors?.toLocaleString(), icon: 'group', color: '#8b5cf6' },
                                        { label: 'Weekly Growth', value: `${radar.weeklyGrowth > 0 ? '+' : ''}${radar.weeklyGrowth}%`, icon: 'trending_up', color: '#34d399' },
                                        { label: 'Bounce Rate', value: `${radar.bounceRate}%`, icon: 'exit_to_app', color: '#f59e0b' },
                                        { label: 'Avg Session', value: radar.avgSession, icon: 'timer', color: '#06b6d4' },
                                    ].map((m, i) => (
                                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="material-symbols-outlined text-[10px] sm:text-xs" style={{ color: m.color }}>{m.icon}</span>
                                                <span className="text-[10px] sm:text-xs text-slate-500">{m.label}</span>
                                            </div>
                                            <p className="text-base sm:text-xl font-extrabold text-white">{m.value}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            <AnalyticsSection radar={radar} radarHover={radarHover} setRadarHover={setRadarHover} />

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
                        <div className="flex border-b border-white/[0.06] bg-white/[0.01] overflow-x-auto no-scrollbar scroll-smooth">
                            {intelTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                    className={`intel-tab flex-1 min-w-[100px] sm:min-w-0 px-3 sm:px-4 py-3.5 text-[11px] sm:text-xs md:text-sm font-black cursor-pointer flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === tab.id ? 'active border-violet-500 text-white bg-violet-500/5' : 'text-slate-500 border-transparent hover:text-white hover:bg-white/[0.02]'}`}>
                                    {tab.label}
                                    {tab.count > 0 && <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] opacity-70 font-bold">{tab.count}</span>}
                                </button>
                            ))}
                            <button onClick={() => { loadSummary(); loadTrends() }}
                                className="px-5 text-slate-500 hover:text-white cursor-pointer transition-colors border-l border-white/[0.06] shrink-0">
                                <span className={`material-symbols-outlined text-lg ${loadingSummary ? 'animate-spin' : ''}`}>refresh</span>
                            </button>
                        </div>

                        <div className="p-5 lg:p-6">
                            {/* ── TRENDS TAB ── */}
                            {activeTab === 'trends' && (
                                <div className="space-y-4">
                                    {loadingIntel ? (
                                        <SkeletonHub />
                                    ) : (
                                        <>
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
                                                        className="shrink-0 px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-sm font-bold hover:bg-rose-500/20 transition-all cursor-pointer opacity-100 md:opacity-50 group-hover:opacity-100 flex items-center gap-1.5 border border-rose-500/15">
                                                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                                        <span className="hidden xs:inline">Create</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-base text-slate-500 text-center py-4">No trends available yet.</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                            {/* ── NEWS TAB ── */}
                            {activeTab === 'news' && (
                                <div className="space-y-3">
                                    {loadingIntel ? (
                                        [1, 2, 3].map(i => (
                                            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
                                                <div className="flex gap-3">
                                                    <Skeleton className="size-8 rounded-lg shrink-0" />
                                                    <div className="flex-1 space-y-2">
                                                        <Skeleton className="h-5 w-full" />
                                                        <Skeleton className="h-4 w-3/4" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : businessNews.length > 0 ? businessNews.slice(0, 5).map((n, i) => (
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
                                     {loadingIntel ? (
                                         [1, 2, 3, 4].map(i => (
                                             <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-3">
                                                 <div className="flex items-start gap-3">
                                                     <Skeleton className="size-8 rounded-full shrink-0" />
                                                     <div className="flex-1 space-y-2">
                                                         <Skeleton className="h-4 w-1/4 rounded" />
                                                         <Skeleton className="h-4 w-full" />
                                                         <Skeleton className="h-12 w-full rounded-lg" />
                                                     </div>
                                                 </div>
                                             </div>
                                         ))
                                     ) : didYouKnow.length > 0 ? (
                                         didYouKnow.slice(0, 4).map((d, i) => (
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
                                         ))
                                     ) : (
                                         <p className="text-base text-slate-500 text-center py-8">No trivia available yet. Refresh to fetch.</p>
                                     )}
                                 </div>
                             )}
                        </div>
                    </div>

                    {/* ── 6. GROK CONTENT IDEAS ── */}
                    {grokContent.length > 0 && (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-cyan-500/15 anim-slide-up" style={{ animationDelay: '450ms' }}>
                            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-cyan-400 shrink-0">tips_and_updates</span>
                                <span className="truncate">Content Ideas for You</span>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-widest shrink-0">AI Powered</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2 xl:grid-cols-4">
                                {grokContent.slice(0, 4).map((s, i) => (
                                    <div key={i} className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-cyan-500/20 transition-all cursor-pointer group flex flex-col h-full"
                                        style={{ animation: `slide-up 0.4s ease-out ${i * 60}ms both` }}>
                                        <div className="flex items-center gap-2 mb-2.5">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400'
                                                : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-slate-400'}`}>{s.platform}</span>
                                            <span className="text-[10px] text-slate-500 font-bold">{s.format}</span>
                                            {s.viralPotential === 'high' && <span className="text-[10px] text-orange-400 font-bold ml-auto flex items-center gap-1">🔥 Viral</span>}
                                        </div>
                                        <h4 className="text-sm sm:text-base font-bold text-white mb-1.5 group-hover:text-cyan-400 transition-colors leading-tight line-clamp-2">{s.title}</h4>
                                        <p className="text-xs sm:text-sm text-slate-400 mb-3 line-clamp-3 leading-relaxed">{s.hook}</p>
                                        <div className="mt-auto">
                                            {s.trendConnection && <p className="text-[10px] text-emerald-400 font-black tracking-wide uppercase">📈 {s.trendConnection}</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── 7. UPCOMING OPPORTUNITIES CAROUSEL ── */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '500ms' }}>
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 shrink-0">celebration</span>
                                    <span className="truncate">Upcoming Opportunities</span>
                                </h3>
                                <button onClick={() => navigate('/smart-calendar')} className="text-xs sm:text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-black uppercase tracking-wider shrink-0">View All →</button>
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth -mx-1 px-1">
                                {upcoming.slice(0, 8).map((e, i) => {
                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                    return (
                                        <button key={i} onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(e.name)}&tone=${e.tone}`)}
                                            className="shrink-0 w-40 sm:w-44 glass-panel rounded-xl p-3.5 sm:p-4 text-left hover:bg-white/[0.05] transition-all cursor-pointer group border flex flex-col min-h-[140px]"
                                            style={{ animation: `slide-up 0.4s ease-out ${i * 60}ms both`, borderColor: color.border + '20' }}>
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xl sm:text-2xl">{e.emoji}</span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/20 text-primary'}`}>
                                                    {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `${e.daysUntil}d`}
                                                </span>
                                            </div>
                                            <p className="text-xs sm:text-sm font-bold text-white line-clamp-2 mb-1">{e.name}</p>
                                            <p className="mt-auto text-[10px] text-slate-500 truncate">{e.tone}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── 8. YOUR BRANDS ── */}
                    <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '550ms' }}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary shrink-0">storefront</span>Your Brands
                            </h3>
                            <button onClick={() => navigate('/onboarding')} className="px-3 py-1.5 text-xs font-black text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 uppercase tracking-wider">
                                <span className="material-symbols-outlined text-sm">add</span>Add
                            </button>
                        </div>
                        {brandsLoading ? (
                            <SkeletonBrands />
                        ) : brands.length === 0 ? (
                            <div className="text-center py-10 border-2 border-dashed border-white/5 rounded-2xl">
                                <div className="size-16 rounded-full bg-white/[0.02] flex items-center justify-center mx-auto mb-4 border border-white/5">
                                    <span className="material-symbols-outlined text-3xl text-slate-600">storefront</span>
                                </div>
                                <p className="text-base font-bold text-white mb-4">No brands yet.</p>
                                <button onClick={() => navigate('/onboarding')} className="btn-primary py-3 px-8 rounded-xl text-sm font-black uppercase tracking-widest">Create Brand</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                                {brands.map((brand, i) => (
                                    <div key={brand._id} onClick={() => { selectBrand(brand); navigate('/nexus') }}
                                        className={`flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer hover:bg-white/[0.05] hover:scale-[1.02] hover:shadow-2xl shadow-primary/5 ${activeBrand?._id === brand._id ? 'border-primary/40 bg-primary/10' : 'border-white/[0.06] bg-white/[0.02]'}`}
                                        style={{ animation: `slide-up 0.4s ease-out ${i * 50}ms both` }}>
                                        <div className="size-11 sm:size-14 rounded-2xl flex items-center justify-center font-black text-white text-lg sm:text-xl shrink-0 shadow-lg"
                                            style={{ background: brand.dna?.colors?.[0]?.hex || '#2B4BEE', textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{brand.name?.charAt(0)?.toUpperCase()}</div>
                                        <div className="flex-1 min-w-0" style={{ pointerEvents: 'none' }}>
                                            <p className="text-sm sm:text-base font-black text-white truncate">{brand.name}</p>
                                            <p className="text-[10px] sm:text-xs text-slate-500 font-bold truncate uppercase tracking-tight mt-0.5">{brand.website || brand.dna?.industry || 'Uncategorized'}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-600 group-hover:text-primary transition-colors shrink-0 text-sm sm:text-base">chevron_right</span>
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
                    <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 anim-slide-up" style={{ animationDelay: '200ms' }}>
                        <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-5">
                            <span className="material-symbols-outlined text-primary shrink-0">apps</span>Studios
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 sm:gap-3">
                            {studios.map((a, i) => (
                                <button key={i} onClick={() => navigate(a.path)}
                                    className={`studio-card flex flex-col xs:flex-row items-center gap-1.5 xs:gap-3 p-3 sm:p-3.5 rounded-xl bg-gradient-to-br ${a.bg} border border-white/[0.04] hover:border-white/[0.15] cursor-pointer text-center xs:text-left active:scale-95 transition-all duration-300`}
                                    style={{ animation: `slide-up 0.4s ease-out ${i * 50}ms both` }}>
                                    <span className="material-symbols-outlined text-lg sm:text-xl lg:text-2xl" style={{ color: a.color }}>{a.icon}</span>
                                    <span className="text-[10px] sm:text-xs lg:text-sm text-white font-black uppercase tracking-tight">{a.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── D2C PULSE (Enhanced) ── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-emerald-500/10 anim-slide-up" style={{ animationDelay: '250ms' }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-400">storefront</span>D2C Pulse
                            </h3>
                            {d2cSnapshot?.connected && <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live</span>}
                        </div>
                        {loadingD2C ? (
                            <SkeletonPulse />
                        ) : d2cSnapshot?.connected ? (
                            <>
                                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
                                    {[
                                        { label: 'Revenue', value: `₹${(d2cSnapshot.weeklyRevenue || 0).toLocaleString()}`, icon: 'payments', color: '#34d399' },
                                        { label: 'Orders', value: d2cSnapshot.weeklyOrders || 0, icon: 'shopping_bag', color: '#8b5cf6' },
                                        { label: 'AOV', value: `₹${d2cSnapshot.aov || 0}`, icon: 'trending_up', color: '#06b6d4' },
                                    ].map((m, i) => (
                                        <div key={i} className="p-2 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center hover:bg-white/[0.04] transition-all">
                                            <span className="material-symbols-outlined text-xs sm:text-sm block mb-1.5" style={{ color: m.color }}>{m.icon}</span>
                                            <p className="text-sm sm:text-lg font-black text-white">{m.value}</p>
                                            <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest">{m.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* D2C Health Badge (based on AOV + orders) */}
                                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-3">
                                    <span className="material-symbols-outlined text-sm text-emerald-400">health_and_safety</span>
                                    <span className="text-xs text-slate-400">D2C Health</span>
                                    <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        (d2cSnapshot.aov || 0) >= 2000 && (d2cSnapshot.weeklyOrders || 0) > 10 ? 'bg-emerald-500/15 text-emerald-400'
                                        : (d2cSnapshot.aov || 0) >= 500 ? 'bg-amber-500/15 text-amber-400'
                                        : 'bg-rose-500/15 text-rose-400'
                                    }`}>
                                        {(d2cSnapshot.aov || 0) >= 2000 && (d2cSnapshot.weeklyOrders || 0) > 10 ? '✓ Healthy' : (d2cSnapshot.aov || 0) >= 500 ? '● Average' : '⚠ Low AOV'}
                                    </span>
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
                                <button onClick={() => navigate('/d2c-analytics')} className="w-full py-2.5 rounded-xl bg-emerald-500/5 text-emerald-400 text-sm font-bold hover:bg-emerald-500/10 transition-all cursor-pointer border border-emerald-500/10">Open D2C Studio →</button>
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
                                <p className="text-sm text-slate-400 mb-3 text-center">Connect your Shopify store to unlock real-time D2C intelligence, product velocity, geo insights & more.</p>
                                <button onClick={() => navigate('/d2c-analytics')} className="w-full py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-bold hover:bg-emerald-500/20 transition-all cursor-pointer border border-emerald-500/20 flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-sm">link</span>Connect & Explore D2C →
                                </button>
                            </>
                        )}
                    </div>

                    {/* ── RED FLAGS & ALERTS ── */}
                    {(() => {
                        const alerts = []
                        // PM anomalies
                        anomalies.forEach(a => alerts.push({ type: 'performance', severity: 'high', icon: 'warning', title: a.title || a.metric || 'Anomaly Detected', desc: a.description || `${a.metric} is ${a.direction || 'abnormal'}`, color: '#f43f5e', path: '/performance-marketing' }))
                        // Low funnel conversion
                        if (funnelData?.analytics?.overview?.conversionRate < 15 && funnelData?.analytics?.overview?.totalEntries > 5) {
                            alerts.push({ type: 'funnel', severity: 'medium', icon: 'filter_alt', title: `Low Funnel Conversion: ${funnelData.analytics.overview.conversionRate}%`, desc: 'Below 15% benchmark. Review bottleneck stages.', color: '#6366f1', path: '/funnel-studio' })
                        }
                        // High lost rate in funnel
                        if (funnelData?.analytics?.overview?.lostEntries > 3) {
                            const lostPct = Math.round((funnelData.analytics.overview.lostEntries / funnelData.analytics.overview.totalEntries) * 100)
                            if (lostPct > 25) {
                                alerts.push({ type: 'funnel', severity: 'medium', icon: 'person_off', title: `${lostPct}% Leads Lost`, desc: `${funnelData.analytics.overview.lostEntries} leads dropped. Set up win-back sequences.`, color: '#f59e0b', path: '/funnel-studio' })
                            }
                        }
                        // Zero ROAS
                        if (perfData?.stats?.totalSpend > 0 && (perfData?.stats?.avgRoas || 0) < 1) {
                            alerts.push({ type: 'performance', severity: 'high', icon: 'trending_down', title: 'ROAS Below 1x', desc: 'Ad spend exceeds returns. Review campaign targeting.', color: '#f43f5e', path: '/performance-marketing' })
                        }

                        return alerts.length > 0 ? (
                            <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-rose-500/15 anim-slide-up" style={{ animationDelay: '275ms' }}>
                                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-5">
                                    <span className="material-symbols-outlined text-rose-400 shrink-0">notifications_active</span>
                                    <span className="truncate">Red Flags</span>
                                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-black">{alerts.length}</span>
                                </h3>
                                <div className="space-y-3">
                                    {alerts.slice(0, 5).map((a, i) => (
                                        <button key={i} onClick={() => navigate(a.path)}
                                            className="w-full flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-rose-500/20 transition-all text-left cursor-pointer group"
                                            style={{ animation: `slide-up 0.3s ease-out ${i * 60}ms both` }}>
                                            <span className="material-symbols-outlined text-lg mt-0.5 shrink-0" style={{ color: a.color }}>{a.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-white">{a.title}</p>
                                                <p className="text-xs text-slate-500 mt-0.5">{a.desc}</p>
                                            </div>
                                            <span className="material-symbols-outlined text-sm text-slate-600 group-hover:text-rose-400 transition-colors shrink-0 mt-1">arrow_forward</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-emerald-500/10 anim-slide-up" style={{ animationDelay: '275ms' }}>
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-emerald-400">verified</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-white">All Clear</p>
                                        <p className="text-xs text-slate-500">No red flags detected across your studios</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })()}

                    {/* ── SEO KEYWORD NUGGETS ── */}
                    {grokSeo?.risingKeywords?.length > 0 && (
                        <div className="glass-panel rounded-2xl p-4 sm:p-5 lg:p-6 border border-amber-500/10 anim-slide-up" style={{ animationDelay: '300ms' }}>
                            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-amber-400 shrink-0">search</span>Trending Keywords
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
                            <p className="text-lg font-extrabold text-white capitalize">Mantram Unlimited</p>
                            <p className="text-sm text-slate-400 mt-1">Full access to all AI studios & features</p>
                        </div>
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
            {/* QUICK ACTION FLOATING BAR */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-2xl border border-white/[0.12] backdrop-blur-2xl w-auto max-w-[calc(100%-2.5rem)] overflow-x-auto no-scrollbar shadow-[0_20px_50px_rgba(0,0,0,0.6)] group/bar hover:scale-[1.02] transition-transform duration-500"
                style={{ background: 'rgba(15,15,30,0.85)' }}>
                {[
                    { icon: 'edit_note', label: 'Draft', path: '/content-studio', color: '#34d399' },
                    { icon: 'brush', label: 'Design', path: '/creative-studio', color: '#ec4899' },
                    { icon: 'psychology', label: 'Brain', path: '/brainstorm', color: '#8b5cf6' },
                    { icon: 'movie', label: 'Clip', path: '/video-studio', color: '#f59e0b' },
                ].map((a, i) => (
                    <button key={i} onClick={() => navigate(a.path)}
                        className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl hover:bg-white/[0.08] transition-all cursor-pointer group flex-shrink-0 relative overflow-hidden active:scale-95"
                        title={a.label}>
                        <div className="absolute inset-0 bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="material-symbols-outlined text-xl sm:text-2xl group-hover:scale-110 transition-transform duration-300" style={{ color: a.color }}>{a.icon}</span>
                        <span className="text-[9px] sm:text-xs font-black uppercase tracking-tighter sm:tracking-widest text-slate-300 group-hover:text-white transition-colors">{a.label}</span>
                    </button>
                ))}
            </div>

            {/* Bottom spacer for floating bar */}
            <div className="h-20" />
            
            {/* Cinematic Intel Report Overlay */}
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

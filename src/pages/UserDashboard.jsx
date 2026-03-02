import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, creatives as creativesAPI, trends as trendsAPI, dashboardSummary } from '../services/api'
import { getUpcomingEvents, EVENT_COLORS } from '../data/calendarData'
import SmartCommandBox from '../components/SmartCommandBox'

// ── Greeting helper ──
function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good Morning'
    if (h < 17) return 'Good Afternoon'
    return 'Good Evening'
}

function getDateString() {
    return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Health gauge mini component ──
function HealthGauge({ label, icon, score, color }) {
    return (
        <div className="flex flex-col items-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
            <div className="relative size-14 mb-2">
                <svg className="size-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="4" />
                    <circle cx="28" cy="28" r="24" fill="none" stroke={color} strokeWidth="4"
                        strokeDasharray={`${(score / 100) * 150.8} 150.8`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-white">{score}</span>
            </div>
            <span className="material-symbols-outlined text-base mb-0.5" style={{ color }}>{icon}</span>
            <span className="text-xs text-slate-500 text-center leading-tight">{label}</span>
        </div>
    )
}

export default function UserDashboard() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { brands, activeBrand, selectBrand, loading: brandsLoading } = useBrand()

    // State
    const [summary, setSummary] = useState(null)
    const [loadingSummary, setLoadingSummary] = useState(true)
    const [trendingTopics, setTrendingTopics] = useState([])
    const [trendsLoading, setTrendsLoading] = useState(false)
    const [recentContent, setRecentContent] = useState([])
    const [stats, setStats] = useState({ content: 0, creatives: 0 })

    const country = activeBrand?.dna?.country || activeBrand?.country || 'India'
    const upcoming = useMemo(() => getUpcomingEvents(country, 14), [country])

    // ── Load dashboard summary ──
    const loadSummary = useCallback(async () => {
        setLoadingSummary(true)
        try {
            const data = await dashboardSummary.get(activeBrand?._id)
            setSummary(data)
        } catch (e) {
            console.warn('Dashboard summary error:', e.message)
        } finally {
            setLoadingSummary(false)
        }
    }, [activeBrand?._id])

    // ── Load brand-matched trends ──
    const loadTrends = useCallback(async () => {
        setTrendsLoading(true)
        try {
            const data = activeBrand?._id
                ? await trendsAPI.brandMatch(activeBrand._id)
                : await trendsAPI.now()
            setTrendingTopics(data.trends || [])
        } catch (e) {
            console.warn('Trends error:', e.message)
        } finally {
            setTrendsLoading(false)
        }
    }, [activeBrand?._id])

    // ── Load basic stats ──
    useEffect(() => {
        async function fetchBasicData() {
            try {
                const [c, cr] = await Promise.all([
                    contentAPI.list({ limit: 5 }).catch(() => ({ content: [], total: 0 })),
                    creativesAPI.list({ limit: 5 }).catch(() => ({ creatives: [], total: 0 })),
                ])
                setRecentContent(c.content || [])
                setStats({ content: c.total || 0, creatives: cr.total || 0 })
            } catch (e) { console.warn(e) }
        }
        fetchBasicData()
    }, [])

    useEffect(() => {
        loadSummary()
        loadTrends()
        const interval = setInterval(() => { loadTrends(); loadSummary(); }, 30 * 60 * 1000)
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

    return (
        <DashboardLayout>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* HEADER                                                          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-2">
                <div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">
                        {getGreeting()}, <span className="bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">{user?.name?.split(' ')[0] || 'Creator'}</span>
                    </h2>
                    <p className="text-slate-500 text-base mt-1">{getDateString()}</p>
                </div>
                {activeBrand && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <div className="size-7 rounded-lg flex items-center justify-center text-sm font-bold text-white"
                            style={{ background: activeBrand.dna?.colors?.[0]?.hex || '#2B4BEE' }}>
                            {activeBrand.name?.charAt(0)}
                        </div>
                        <span className="text-base font-medium text-white">{activeBrand.name}</span>
                    </div>
                )}
            </div>

            {/* Smart Command Box */}
            <SmartCommandBox variant="dashboard" className="mb-6" />

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 1. DAILY AI INSIGHT                                             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {insight && (
                <div className="mb-6 p-6 rounded-2xl bg-gradient-to-r from-violet-600/10 via-cyan-600/10 to-emerald-600/10 border border-violet-500/20 animate-fade-in relative overflow-hidden">
                    <div className="absolute -top-20 -right-20 size-40 bg-gradient-to-br from-violet-500/10 to-cyan-500/10 rounded-full blur-3xl" />
                    <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="shrink-0">
                            <div className="size-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center text-3xl border border-violet-500/20">
                                {insight.emoji || '💡'}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 font-bold uppercase tracking-wider">Today's Insight</span>
                                <span className={`text-sm px-2.5 py-1 rounded-full font-bold ${insight.category === 'trend' ? 'bg-orange-500/10 text-orange-400'
                                    : insight.category === 'growth' ? 'bg-emerald-500/10 text-emerald-400'
                                        : insight.category === 'seasonal' ? 'bg-amber-500/10 text-amber-400'
                                            : 'bg-cyan-500/10 text-cyan-400'
                                    }`}>{insight.category}</span>
                            </div>
                            <h3 className="text-xl font-extrabold text-white mb-1">{insight.title}</h3>
                            <p className="text-base text-slate-300 leading-relaxed">{insight.tip}</p>
                        </div>
                        <button
                            onClick={() => navigate(insight.actionPath || '/content-studio')}
                            className="shrink-0 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-base font-bold hover:shadow-lg hover:shadow-violet-500/20 transition-all cursor-pointer flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">auto_awesome</span>
                            {insight.actionLabel || 'Act Now'}
                        </button>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 2. BRAND HEALTH SCORE + STATS                                   */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-12 gap-4 mb-6">
                {/* Overall Score */}
                <div className="col-span-12 sm:col-span-6 lg:col-span-3 glass-panel rounded-2xl p-5 border border-white/[0.06] animate-fade-in">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-emerald-400">monitoring</span>
                        <span className="text-base font-bold text-white">Brand Health</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative size-20">
                            <svg className="size-20 -rotate-90" viewBox="0 0 80 80">
                                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
                                <circle cx="40" cy="40" r="34" fill="none"
                                    stroke={health.overallScore >= 70 ? '#34d399' : health.overallScore >= 40 ? '#fbbf24' : '#f87171'}
                                    strokeWidth="6"
                                    strokeDasharray={`${(health.overallScore || 0) / 100 * 213.6} 213.6`}
                                    strokeLinecap="round" />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-2xl font-extrabold text-white">{health.overallScore || 0}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 flex-1">
                            <HealthGauge label="Content" icon="article" score={Math.round(health.contentVelocity || 0)} color="#8b5cf6" />
                            <HealthGauge label="Creative" icon="image" score={Math.round(health.creativeOutput || 0)} color="#06b6d4" />
                            <HealthGauge label="Brand DNA" icon="fingerprint" score={Math.round(health.brandCompleteness || 0)} color="#f59e0b" />
                            <HealthGauge label="Trends" icon="trending_up" score={Math.round(health.trendReadiness || 0)} color="#34d399" />
                        </div>
                    </div>
                </div>

                {/* Stats cards */}
                {[
                    { label: 'Content This Week', value: activity.content?.thisWeek || 0, total: `${activity.content?.total || stats.content} total`, icon: 'article', color: '#8b5cf6', gradient: 'from-violet-600/10 to-violet-600/5' },
                    { label: 'Creatives This Week', value: activity.creatives?.thisWeek || 0, total: `${activity.creatives?.total || stats.creatives} total`, icon: 'image', color: '#06b6d4', gradient: 'from-cyan-600/10 to-cyan-600/5' },
                    { label: 'Brands Active', value: brands.length, total: activeBrand?.name || 'Select a brand', icon: 'storefront', color: '#f59e0b', gradient: 'from-amber-600/10 to-amber-600/5' },
                ].map((s, i) => (
                    <div key={i} className={`col-span-6 sm:col-span-6 lg:col-span-3 glass-panel rounded-2xl p-5 border border-white/[0.06] bg-gradient-to-br ${s.gradient} animate-fade-in`}
                        style={{ animationDelay: `${(i + 1) * 80}ms` }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="material-symbols-outlined text-2xl" style={{ color: s.color }}>{s.icon}</span>
                        </div>
                        <p className="text-3xl lg:text-4xl font-extrabold text-white mb-1">{s.value}</p>
                        <p className="text-base text-slate-400">{s.label}</p>
                        <p className="text-sm text-slate-500 mt-1">{s.total}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* ═══════════════════════════════════════════════════════════ */}
                {/* MAIN COLUMN                                                 */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="col-span-12 lg:col-span-8 space-y-6">

                    {/* ─── 🔥 GROK TRENDING INTELLIGENCE ─── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-orange-500/15 bg-gradient-to-br from-orange-500/[0.03] to-rose-500/[0.03]">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-orange-400">whatshot</span>
                                Trending Intelligence
                                <span className="flex items-center gap-1">
                                    <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-sm text-emerald-400 font-bold uppercase tracking-wider">Live</span>
                                </span>
                                {summary?.grokAvailable && <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs font-bold">GROK AI</span>}
                            </h3>
                            <button onClick={() => { loadSummary(); loadTrends(); }}
                                className="text-sm text-orange-400 hover:text-orange-300 transition-colors cursor-pointer font-bold flex items-center gap-1">
                                <span className={`material-symbols-outlined text-lg ${loadingSummary ? 'animate-spin' : ''}`}>refresh</span> Refresh
                            </button>
                        </div>

                        {/* Grok Topics Grid */}
                        {grokTrends.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                                {grokTrends.slice(0, 4).map((t, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-orange-500/20 transition-all animate-fade-in"
                                        style={{ animationDelay: `${i * 60}ms` }}>
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h4 className="text-base font-bold text-white leading-tight">{t.topic}</h4>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${t.urgency === 'now' ? 'bg-rose-500/10 text-rose-400'
                                                : t.urgency === 'today' ? 'bg-amber-500/10 text-amber-400'
                                                    : 'bg-slate-500/10 text-slate-400'
                                                }`}>
                                                {t.urgency === 'now' ? '🔴 NOW' : t.urgency === 'today' ? '🟡 Today' : '📅 Week'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400 mb-2 line-clamp-2">{t.description}</p>
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${t.category === 'entertainment' ? 'bg-pink-500/10 text-pink-400'
                                                : t.category === 'tech' ? 'bg-cyan-500/10 text-cyan-400'
                                                    : t.category === 'sports' ? 'bg-green-500/10 text-green-400'
                                                        : t.category === 'viral' ? 'bg-orange-500/10 text-orange-400'
                                                            : 'bg-slate-500/10 text-slate-400'
                                                }`}>{t.category}</span>
                                            {t.format && <span className="text-sm text-slate-500">📱 {t.format}</span>}
                                        </div>
                                        {t.marketingAngle && <p className="text-sm text-emerald-400 mb-2">💡 {t.marketingAngle}</p>}
                                        {t.hashtags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {t.hashtags.slice(0, 3).map((h, hi) => (
                                                    <span key={hi} className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 text-sm">{h}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {/* Google + Grok merged trend list */}
                        {(trendsLoading && trendingTopics.length === 0) ? (
                            <div className="flex items-center justify-center py-8 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                <span className="text-base">Scanning trends across Google, Grok AI & social media...</span>
                            </div>
                        ) : trendingTopics.length > 0 ? (
                            <div className="space-y-2.5">
                                {trendingTopics.slice(0, 5).map((trend, i) => (
                                    <div key={i}
                                        className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-rose-500/15 transition-all group animate-fade-in"
                                        style={{ animationDelay: `${i * 60}ms` }}>
                                        <span className={`material-symbols-outlined text-xl mt-0.5 shrink-0 ${trend.source === 'Grok xAI' ? 'text-orange-400' :
                                            trend.sourceIcon === 'trending_up' ? 'text-rose-400' :
                                                trend.sourceIcon === 'search' ? 'text-blue-400' : 'text-slate-400'
                                            }`}>{trend.source === 'Grok xAI' ? 'smart_toy' : (trend.sourceIcon || 'trending_up')}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="text-base font-bold text-white truncate">{trend.title}</p>
                                                {trend.urgency === 'high' && (
                                                    <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold shrink-0">🔥</span>
                                                )}
                                                {trend.source === 'Grok xAI' && (
                                                    <span className="text-xs px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-bold shrink-0">Grok</span>
                                                )}
                                            </div>
                                            {(trend.contentIdea || trend.angle) && (
                                                <p className="text-sm text-slate-400 truncate">💡 {trend.contentIdea || trend.angle}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <span className="text-sm text-slate-500">{trend.source}</span>
                                                {trend.traffic && <span className="text-sm text-slate-500">• {trend.traffic}</span>}
                                                {trend.relevance && (
                                                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${trend.relevance >= 80 ? 'bg-emerald-500/15 text-emerald-400' :
                                                        trend.relevance >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/10 text-slate-400'
                                                        }`}>{trend.relevance}% match</span>
                                                )}
                                                {trend.hashtags?.length > 0 && (
                                                    <span className="text-sm text-blue-400/50">{trend.hashtags.slice(0, 2).join(' ')}</span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => navigate(`/content-studio?goal=hijack&trend=${encodeURIComponent(trend.title)}&prompt=${encodeURIComponent(trend.contentIdea || `Create trending content about "${trend.title}"`)}`)}
                                            className="shrink-0 px-4 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-sm font-bold hover:bg-rose-500/20 transition-all cursor-pointer opacity-50 group-hover:opacity-100 flex items-center gap-1.5 border border-rose-500/15"
                                        >
                                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                            Create
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-base text-slate-500 text-center py-4">Loading trends...</p>
                        )}
                    </div>

                    {/* ─── 💡 GROK CONTENT IDEAS ─── */}
                    {grokContent.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-cyan-500/15">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-cyan-400">tips_and_updates</span>
                                Content Ideas for You
                                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold">AI POWERED</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {grokContent.slice(0, 4).map((s, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-cyan-500/15 transition-all animate-fade-in"
                                        style={{ animationDelay: `${i * 60}ms` }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400'
                                                : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400'
                                                    : 'bg-slate-500/10 text-slate-400'
                                                }`}>{s.platform}</span>
                                            <span className="text-sm text-slate-500">{s.format}</span>
                                            {s.viralPotential === 'high' && <span className="text-sm text-orange-400">🔥 viral</span>}
                                        </div>
                                        <h4 className="text-base font-bold text-white mb-1">{s.title}</h4>
                                        <p className="text-sm text-slate-400 mb-2 line-clamp-2">{s.hook}</p>
                                        {s.trendConnection && <p className="text-sm text-emerald-400">📈 {s.trendConnection}</p>}
                                        {s.hashtags?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {s.hashtags.slice(0, 4).map((h, hi) => (
                                                    <span key={hi} className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400 text-sm">{h}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── 📰 BUSINESS NEWS ─── */}
                    {businessNews.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-emerald-500/15">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-emerald-400">newspaper</span>
                                Business News
                                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-1">
                                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    LIVE
                                </span>
                            </h3>
                            <div className="space-y-3">
                                {businessNews.slice(0, 5).map((n, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-emerald-500/15 transition-all animate-fade-in"
                                        style={{ animationDelay: `${i * 80}ms` }}>
                                        <div className="flex items-start gap-3">
                                            <span className="text-2xl shrink-0 mt-0.5">{n.emoji || '📰'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1">
                                                    <h4 className="text-base font-bold text-white leading-snug">{n.headline}</h4>
                                                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${n.category === 'funding' ? 'bg-green-500/10 text-green-400'
                                                            : n.category === 'policy' ? 'bg-blue-500/10 text-blue-400'
                                                                : n.category === 'competitor' ? 'bg-rose-500/10 text-rose-400'
                                                                    : n.category === 'technology' ? 'bg-violet-500/10 text-violet-400'
                                                                        : n.category === 'economy' ? 'bg-amber-500/10 text-amber-400'
                                                                            : 'bg-cyan-500/10 text-cyan-400'
                                                        }`}>{n.category}</span>
                                                </div>
                                                <p className="text-sm text-slate-400 mb-2">{n.summary}</p>
                                                <p className="text-sm text-emerald-400 font-medium">💡 {n.relevance}</p>
                                                {n.source && <p className="text-xs text-slate-600 mt-1">Source: {n.source}</p>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── 🧠 DID YOU KNOW ─── */}
                    {didYouKnow.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-amber-500/15">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-amber-400">psychology</span>
                                Did You Know?
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">DAILY TRIVIA</span>
                            </h3>
                            <div className="space-y-3">
                                {didYouKnow.slice(0, 4).map((d, i) => (
                                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-amber-500/15 transition-all animate-fade-in"
                                        style={{ animationDelay: `${i * 80}ms` }}>
                                        <div className="flex items-start gap-3">
                                            <span className="text-2xl shrink-0 mt-0.5">{d.emoji || '💡'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${d.category === 'history' ? 'bg-orange-500/10 text-orange-400'
                                                            : d.category === 'science' ? 'bg-cyan-500/10 text-cyan-400'
                                                                : d.category === 'culture' ? 'bg-pink-500/10 text-pink-400'
                                                                    : d.category === 'psychology' ? 'bg-violet-500/10 text-violet-400'
                                                                        : d.category === 'innovation' ? 'bg-emerald-500/10 text-emerald-400'
                                                                            : 'bg-slate-500/10 text-slate-400'
                                                        }`}>{d.category}</span>
                                                </div>
                                                <p className="text-sm text-slate-300 mb-2 leading-relaxed">{d.fact}</p>
                                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                                    <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5 shrink-0">campaign</span>
                                                    <p className="text-sm text-amber-300 font-medium">{d.postIdea}</p>
                                                </div>
                                                {d.hashtags?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                                        {d.hashtags.slice(0, 5).map((h, hi) => (
                                                            <span key={hi} className="px-2 py-0.5 rounded bg-white/[0.04] text-slate-500 text-xs">{h}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/content-studio?topic=${encodeURIComponent(d.fact.substring(0, 100))}`)}
                                                    className="mt-3 text-sm text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">edit_note</span>
                                                    Create Post from This
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ─── 📅 UPCOMING EVENTS ─── */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">celebration</span>
                                    Upcoming Opportunities
                                </h3>
                                <button onClick={() => navigate('/smart-calendar')} className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-bold flex items-center gap-1">
                                    View Calendar →
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {upcoming.slice(0, 6).map((e, i) => {
                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                    return (
                                        <button key={i}
                                            onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(e.name)}&tone=${e.tone}`)}
                                            className="glass-panel rounded-xl p-4 text-left hover:bg-white/[0.05] transition-all cursor-pointer group animate-fade-in border"
                                            style={{ animationDelay: `${i * 60}ms`, borderColor: color.border + '20' }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-2xl">{e.emoji}</span>
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' :
                                                    e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' :
                                                        'bg-primary/20 text-primary'
                                                    }`}>{e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `${e.daysUntil}d`}</span>
                                            </div>
                                            <p className="text-base font-bold text-white truncate">{e.name}</p>
                                            <p className="text-sm text-slate-500">{e.tone} • {e.formats?.join(', ')}</p>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* ─── 🏪 YOUR BRANDS ─── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">storefront</span>
                                Your Brands
                            </h3>
                            <button onClick={() => navigate('/onboarding')} className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">add</span> Add
                            </button>
                        </div>
                        {brandsLoading ? (
                            <div className="flex items-center justify-center py-8 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span> Loading...
                            </div>
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
                                        className={`flex items-center gap-3 p-4 rounded-xl border transition-all cursor-pointer hover:bg-white/[0.04] animate-fade-in ${activeBrand?._id === brand._id ? 'border-primary/30 bg-primary/5' : 'border-white/[0.06] bg-white/[0.02]'
                                            }`}
                                        style={{ animationDelay: `${i * 50}ms` }}>
                                        <div className="size-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shrink-0"
                                            style={{ background: brand.dna?.colors?.[0]?.hex || '#2B4BEE' }}>
                                            {brand.name?.charAt(0)?.toUpperCase()}
                                        </div>
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

                    {/* ─── 🎯 STUDIOS ─── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">apps</span>
                            Studios
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                            {[
                                { icon: 'psychology', label: 'Brainstorm', path: '/brainstorm', color: 'from-violet-500/10 to-violet-500/5', iconColor: 'text-violet-400' },
                                { icon: 'edit_note', label: 'Content', path: '/content-studio', color: 'from-emerald-500/10 to-emerald-500/5', iconColor: 'text-emerald-400' },
                                { icon: 'auto_fix_high', label: 'Creative', path: '/creative-studio', color: 'from-pink-500/10 to-pink-500/5', iconColor: 'text-pink-400' },
                                { icon: 'movie', label: 'Video', path: '/video-studio', color: 'from-amber-500/10 to-amber-500/5', iconColor: 'text-amber-400' },
                                { icon: 'search_insights', label: 'SEO', path: '/seo-studio', color: 'from-cyan-500/10 to-cyan-500/5', iconColor: 'text-cyan-400' },
                                { icon: 'campaign', label: 'Ads', path: '/performance-marketing', color: 'from-rose-500/10 to-rose-500/5', iconColor: 'text-rose-400' },
                                { icon: 'calendar_month', label: 'Calendar', path: '/smart-calendar', color: 'from-orange-500/10 to-orange-500/5', iconColor: 'text-orange-400' },
                                { icon: 'forum', label: 'Inbox', path: '/conversations', color: 'from-blue-500/10 to-blue-500/5', iconColor: 'text-blue-400' },
                            ].map((a, i) => (
                                <button key={i} onClick={() => navigate(a.path)}
                                    className={`flex items-center gap-3 p-3.5 rounded-xl bg-gradient-to-br ${a.color} border border-white/[0.04] hover:border-white/[0.12] transition-all cursor-pointer text-left`}>
                                    <span className={`material-symbols-outlined text-xl ${a.iconColor}`}>{a.icon}</span>
                                    <span className="text-base text-white font-medium">{a.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ─── 🔍 SEO KEYWORD NUGGETS ─── */}
                    {grokSeo?.risingKeywords?.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 border border-amber-500/10">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-amber-400">search</span>
                                Trending Keywords
                            </h3>
                            <div className="space-y-2.5">
                                {grokSeo.risingKeywords.slice(0, 5).map((k, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02]">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-white truncate">"{k.keyword}"</p>
                                            <p className="text-sm text-slate-500">{k.intent} intent • {k.difficulty}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ml-2 ${k.trend === 'breakout' ? 'bg-rose-500/10 text-rose-400'
                                            : k.trend === 'rising' ? 'bg-emerald-500/10 text-emerald-400'
                                                : 'bg-amber-500/10 text-amber-400'
                                            }`}>
                                            {k.growthRate}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/seo-studio')} className="w-full mt-3 py-2.5 rounded-xl bg-amber-500/5 text-amber-400 text-sm font-bold hover:bg-amber-500/10 transition-all cursor-pointer border border-amber-500/10">
                                Open SEO Studio →
                            </button>
                        </div>
                    )}

                    {/* ─── 📈 QUICK WIN ─── */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-400">tips_and_updates</span>
                                Quick Win
                            </h3>
                            <p className="text-base text-slate-300 mb-2">
                                <span className="text-xl mr-1">{upcoming[0].emoji}</span>
                                <strong>{upcoming[0].name}</strong> is {upcoming[0].daysUntil === 0 ? 'today' : upcoming[0].daysUntil === 1 ? 'tomorrow' : `in ${upcoming[0].daysUntil} days`}!
                            </p>
                            <p className="text-sm text-slate-500 mb-3">
                                Tone: <span className="text-amber-400">{upcoming[0].tone}</span> • {upcoming[0].formats?.join(', ')}
                            </p>
                            <button onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(upcoming[0].name)}&tone=${upcoming[0].tone}`)}
                                className="w-full py-2.5 rounded-xl bg-amber-500/10 text-amber-300 text-sm font-bold hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-2 border border-amber-500/20">
                                <span className="material-symbols-outlined">auto_awesome</span>
                                Generate Content
                            </button>
                        </div>
                    )}

                    {/* ─── 💎 PLAN ─── */}
                    <div className="glass-panel rounded-2xl p-5 lg:p-6">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-amber-400">diamond</span>
                            Plan
                        </h3>
                        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
                            <p className="text-lg font-extrabold text-white capitalize">{user?.plan || 'Starter'}</p>
                            <p className="text-sm text-slate-400 mt-1">
                                {user?.plan === 'enterprise' ? 'Unlimited access' : user?.plan === 'professional' ? '50 generations/month' : '10 generations/month'}
                            </p>
                        </div>
                        {user?.plan !== 'enterprise' && (
                            <button className="w-full mt-3 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/10 transition-all cursor-pointer">
                                Upgrade Plan
                            </button>
                        )}
                    </div>

                    {/* ─── RECENT WORK ─── */}
                    {recentContent.length > 0 && (
                        <div className="glass-panel rounded-2xl p-5 lg:p-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary">history</span>
                                Recent Work
                            </h3>
                            <div className="space-y-2">
                                {recentContent.slice(0, 4).map((c, i) => (
                                    <div key={c._id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                                        <span className="material-symbols-outlined text-lg text-primary">
                                            {c.type === 'social' ? 'share' : c.type === 'blog' ? 'article' : 'description'}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{c.content?.substring(0, 60)}</p>
                                            <p className="text-sm text-slate-500">{c.type} • {new Date(c.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => navigate('/content-studio')} className="w-full mt-3 text-sm text-primary font-bold hover:text-primary-light cursor-pointer transition-colors">
                                View All →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, creatives as creativesAPI, trends as trendsAPI } from '../services/api'
import { getUpcomingEvents, EVENT_COLORS } from '../data/calendarData'
import SmartCommandBox from '../components/SmartCommandBox'

export default function UserDashboard() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { brands, activeBrand, selectBrand, loading: brandsLoading } = useBrand()
    const [recentContent, setRecentContent] = useState([])
    const [stats, setStats] = useState({ content: 0, creatives: 0 })
    const [loadingContent, setLoadingContent] = useState(true)
    const [trendingTopics, setTrendingTopics] = useState([])
    const [trendsLoading, setTrendsLoading] = useState(false)
    const [trendsError, setTrendsError] = useState('')

    const country = activeBrand?.dna?.country || activeBrand?.country || 'India'

    // Upcoming festivals
    const upcoming = useMemo(() => getUpcomingEvents(country, 14), [country])

    useEffect(() => {
        async function fetchData() {
            try {
                const [contentData, creativeData] = await Promise.all([
                    contentAPI.list({ limit: 5 }).catch(() => ({ content: [], total: 0 })),
                    creativesAPI.list({ limit: 5 }).catch(() => ({ creatives: [], total: 0 })),
                ])
                setRecentContent(contentData.content || [])
                setStats({ content: contentData.total || 0, creatives: creativeData.total || 0 })
            } catch (err) {
                console.error('Dashboard fetch error:', err)
            } finally {
                setLoadingContent(false)
            }
        }
        fetchData()
    }, [])

    // Fetch trending topics (brand-matched if brand active)
    useEffect(() => {
        async function fetchTrends() {
            setTrendsLoading(true)
            setTrendsError('')
            try {
                let data
                if (activeBrand?._id) {
                    data = await trendsAPI.brandMatch(activeBrand._id)
                } else {
                    data = await trendsAPI.now()
                }
                setTrendingTopics(data.trends || [])
            } catch (err) {
                console.warn('Trends fetch failed:', err.message)
                setTrendsError('Could not load trends')
            } finally {
                setTrendsLoading(false)
            }
        }
        fetchTrends()
        // Auto-refresh every 30 min
        const interval = setInterval(fetchTrends, 30 * 60 * 1000)
        return () => clearInterval(interval)
    }, [activeBrand?._id])



    return (
        <DashboardLayout>
            {/* Welcome Header */}
            <div className="mb-6 lg:mb-8">
                <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight mb-1">
                    Welcome back, <span className="text-primary">{user?.name || 'User'}</span>
                </h2>
                <p className="text-slate-400 text-xs sm:text-sm">Your AI marketing command center.</p>
            </div>

            {/* 🤖 Smart Command Box — Agentic AI Assistant */}
            <SmartCommandBox variant="dashboard" className="mb-6" />

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Brands', value: brands.length, icon: 'storefront', color: 'text-primary' },
                    { label: 'Content Created', value: user?.usage?.contentGenerated || stats.content, icon: 'article', color: 'text-emerald-400' },
                    { label: 'Creatives Made', value: user?.usage?.creativesGenerated || stats.creatives, icon: 'image', color: 'text-purple-400' },
                    { label: 'Upcoming Events', value: upcoming.length, icon: 'calendar_month', color: 'text-amber-400' },
                ].map((s, i) => (
                    <div key={i} className="glass-panel rounded-2xl p-4 lg:p-5 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className={`material-symbols-outlined text-xl ${s.color}`}>{s.icon}</span>
                        </div>
                        <p className="text-xl lg:text-2xl font-extrabold text-white">{s.value}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* Main Column */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    {/* Upcoming Festivals */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-4 lg:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-white flex items-center gap-2">
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
                                            className="glass-panel rounded-xl p-3.5 text-left hover:bg-white/[0.05] transition-all cursor-pointer group animate-fade-in border"
                                            style={{ animationDelay: `${i * 60}ms`, borderColor: color.border + '20' }}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-xl">{e.emoji}</span>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full
                                                    ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' :
                                                        e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' :
                                                            'bg-primary/20 text-primary'}`}>
                                                    {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `${e.daysUntil}d`}
                                                </span>
                                            </div>
                                            <p className="text-base font-bold text-white truncate">{e.name}</p>
                                            <p className="text-sm text-slate-500">Suggested: {e.tone} • {e.formats?.join(', ')}</p>
                                            <div className="flex items-center gap-1 mt-2 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-xs">auto_awesome</span> Generate Content
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* 🔥 Trending Now */}
                    <div className="glass-panel rounded-2xl p-4 lg:p-6 border border-rose-500/10 bg-gradient-to-br from-rose-500/[0.03] to-orange-500/[0.03]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-rose-400">local_fire_department</span>
                                Trending Now
                                <span className="flex items-center gap-1 ml-1">
                                    <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-sm text-emerald-400 font-bold uppercase tracking-wider">Live</span>
                                </span>
                            </h3>
                            <button
                                onClick={async () => {
                                    setTrendsLoading(true)
                                    try {
                                        await trendsAPI.refresh()
                                        const data = activeBrand?._id
                                            ? await trendsAPI.brandMatch(activeBrand._id)
                                            : await trendsAPI.now()
                                        setTrendingTopics(data.trends || [])
                                    } catch { } finally { setTrendsLoading(false) }
                                }}
                                className="text-sm text-rose-400 hover:text-rose-300 transition-colors cursor-pointer font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                            </button>
                        </div>

                        {trendsLoading ? (
                            <div className="flex items-center justify-center py-10 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                <span className="text-sm">Scanning trends across Google, news & social...</span>
                            </div>
                        ) : trendsError ? (
                            <p className="text-sm text-slate-500 text-center py-6">{trendsError}</p>
                        ) : trendingTopics.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-6">No trending topics found right now.</p>
                        ) : (
                            <div className="space-y-2.5">
                                {trendingTopics.slice(0, 6).map((trend, i) => (
                                    <div key={i}
                                        className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-rose-500/20 transition-all group animate-fade-in"
                                        style={{ animationDelay: `${i * 80}ms` }}>
                                        <div className="shrink-0 mt-0.5">
                                            <span className={`material-symbols-outlined text-lg ${trend.sourceIcon === 'bolt' ? 'text-amber-400' :
                                                trend.sourceIcon === 'trending_up' ? 'text-rose-400' :
                                                    trend.sourceIcon === 'search' ? 'text-blue-400' :
                                                        trend.sourceIcon === 'computer' ? 'text-purple-400' : 'text-slate-400'
                                                }`}>{trend.sourceIcon || 'trending_up'}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="text-base font-bold text-white truncate">{trend.title}</p>
                                                {trend.urgency === 'high' && (
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 font-bold shrink-0">🔥 HOT</span>
                                                )}
                                            </div>
                                            {trend.contentIdea && (
                                                <p className="text-sm text-slate-400 truncate">💡 {trend.contentIdea}</p>
                                            )}
                                            {trend.angle && (
                                                <p className="text-sm text-slate-500 truncate mt-0.5">🎯 {trend.angle}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                <span className="text-xs text-slate-600">{trend.source}</span>
                                                {trend.traffic && (
                                                    <span className="text-xs text-slate-600">• {trend.traffic}</span>
                                                )}
                                                {trend.relevance && (
                                                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${trend.relevance >= 80 ? 'bg-emerald-500/15 text-emerald-400' :
                                                        trend.relevance >= 60 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'
                                                        }`}>{trend.relevance}% match</span>
                                                )}
                                                {trend.format && (
                                                    <span className="text-sm text-primary/60 font-medium">{trend.format}</span>
                                                )}
                                            </div>
                                            {trend.hashtags?.length > 0 && (
                                                <p className="text-sm text-blue-400/50 mt-1 truncate">{trend.hashtags.slice(0, 3).join(' ')}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                const params = new URLSearchParams({
                                                    goal: 'hijack',
                                                    trend: trend.title,
                                                    prompt: trend.contentIdea || `Create trending content about "${trend.title}"`,
                                                })
                                                navigate(`/content-studio?${params.toString()}`)
                                            }}
                                            className="shrink-0 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all cursor-pointer opacity-60 group-hover:opacity-100 flex items-center gap-1 border border-rose-500/20">
                                            <span className="material-symbols-outlined text-xs">auto_awesome</span>
                                            Create
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Brand Projects */}
                    <div className="glass-panel rounded-2xl p-4 lg:p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">storefront</span>
                                Your Brands
                            </h3>
                            <button onClick={() => navigate('/onboarding')} className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">add</span> Add Brand
                            </button>
                        </div>

                        {brandsLoading ? (
                            <div className="flex items-center justify-center py-12 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span> Loading brands...
                            </div>
                        ) : brands.length === 0 ? (
                            <div className="text-center py-12">
                                <span className="material-symbols-outlined text-4xl text-slate-600 mb-3 block">storefront</span>
                                <p className="text-slate-400 mb-4">No brands yet. Create your first brand to get started!</p>
                                <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm">
                                    <span className="material-symbols-outlined text-sm">add</span> Create Brand
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {brands.map((brand, i) => (
                                    <div key={brand._id} onClick={() => { selectBrand(brand); navigate('/nexus') }}
                                        className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer hover:bg-white/[0.04] animate-fade-in ${activeBrand?._id === brand._id
                                            ? 'border-primary/30 bg-primary/5'
                                            : 'border-white/[0.06] bg-white/[0.02]'
                                            }`}
                                        style={{ animationDelay: `${i * 60}ms` }}>
                                        <div className="size-12 rounded-xl flex items-center justify-center font-bold text-white text-lg shrink-0"
                                            style={{ background: brand.dna?.colors?.[0]?.hex || '#2B4BEE' }}>
                                            {brand.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-white">{brand.name}</p>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${brand.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500'
                                                    }`}>{brand.status || 'active'}</span>
                                            </div>
                                            <p className="text-sm text-slate-500">{brand.website || brand.onboardingMethod || 'No website'}</p>
                                        </div>
                                        <div className="text-right">
                                            {brand.dna?.voice?.personality && (
                                                <p className="text-sm text-primary font-medium">{brand.dna.voice.personality}</p>
                                            )}
                                            <p className="text-xs text-slate-600 mt-0.5">{new Date(brand.updatedAt || brand.createdAt).toLocaleDateString()}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-600">chevron_right</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Recent Content */}
                    <div className="glass-panel rounded-2xl p-4 lg:p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">history</span>
                                Recent Content
                            </h3>
                            <button onClick={() => navigate('/content-studio')} className="text-sm text-primary hover:text-primary-light transition-colors cursor-pointer font-bold">
                                View All →
                            </button>
                        </div>

                        {loadingContent ? (
                            <div className="flex items-center justify-center py-8 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span> Loading...
                            </div>
                        ) : recentContent.length === 0 ? (
                            <div className="text-center py-8">
                                <span className="material-symbols-outlined text-3xl text-slate-600 mb-2 block">edit_note</span>
                                <p className="text-sm text-slate-400">No content created yet. Head to Content Studio to start!</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {recentContent.map((c, i) => (
                                    <div key={c._id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all">
                                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                            <span className="material-symbols-outlined text-sm">
                                                {c.type === 'social' ? 'share' : c.type === 'blog' ? 'article' : c.type === 'ad' ? 'campaign' : 'description'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{c.content?.substring(0, 80)}</p>
                                            <p className="text-sm text-slate-500">{c.type} • {c.brand?.name || ''} • {new Date(c.createdAt).toLocaleDateString()}</p>
                                        </div>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.status === 'published' ? 'bg-emerald-400/10 text-emerald-400' :
                                            c.status === 'approved' ? 'bg-primary/10 text-primary' :
                                                'bg-slate-500/10 text-slate-500'
                                            }`}>{c.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    {/* Quick Actions */}
                    <div className="glass-panel rounded-2xl p-4 lg:p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">flash_on</span>
                            Quick Actions
                        </h3>
                        <div className="space-y-2">
                            {[
                                { icon: 'psychology', label: 'Brainstorm Ideas', desc: 'AI-guided ideation', path: '/nexus' },
                                { icon: 'edit_note', label: 'Create Content', desc: 'AI text generation', path: '/content-studio' },
                                { icon: 'auto_fix_high', label: 'Create Visual', desc: 'AI image generation', path: '/creative-studio' },
                                { icon: 'calendar_month', label: 'Smart Calendar', desc: 'Plan by occasions', path: '/smart-calendar' },
                                { icon: 'badge', label: 'Add Brand', desc: 'Onboard a new brand', path: '/onboarding' },
                            ].map((a, i) => (
                                <button key={i} onClick={() => navigate(a.path)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.05] hover:border-primary/20 transition-all cursor-pointer text-left">
                                    <span className="material-symbols-outlined text-primary">{a.icon}</span>
                                    <div>
                                        <p className="text-sm text-white font-medium">{a.label}</p>
                                        <p className="text-sm text-slate-500">{a.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Today's Suggestion */}
                    {upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-4 lg:p-6 bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/10">
                            <h3 className="font-bold text-white flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-amber-400">tips_and_updates</span>
                                AI Suggestion
                            </h3>
                            <div className="space-y-3">
                                <p className="text-sm text-slate-300">
                                    <span className="text-lg mr-1">{upcoming[0].emoji}</span>
                                    <strong>{upcoming[0].name}</strong> is {upcoming[0].daysUntil === 0 ? 'today' : upcoming[0].daysUntil === 1 ? 'tomorrow' : `in ${upcoming[0].daysUntil} days`}!
                                </p>
                                <p className="text-sm text-slate-500">
                                    Suggested tone: <span className="text-amber-400">{upcoming[0].tone}</span> • Best formats: {upcoming[0].formats?.join(', ')}
                                </p>
                                <button onClick={() => navigate(`/content-studio?occasion=${encodeURIComponent(upcoming[0].name)}&tone=${upcoming[0].tone}`)}
                                    className="w-full py-2.5 rounded-xl bg-amber-500/10 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-amber-500/20">
                                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                    Generate {upcoming[0].name} Content
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Subscription */}
                    <div className="glass-panel rounded-2xl p-4 lg:p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-amber-400">diamond</span>
                            Subscription
                        </h3>
                        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-purple-500/10 border border-primary/20">
                            <p className="text-lg font-extrabold text-white capitalize">{user?.plan || 'Starter'} Plan</p>
                            <p className="text-sm text-slate-400 mt-1">
                                {user?.plan === 'enterprise' ? 'Unlimited access' :
                                    user?.plan === 'professional' ? '50 generations/month' : '10 generations/month'}
                            </p>
                        </div>
                        {user?.plan !== 'enterprise' && (
                            <button className="w-full mt-3 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold hover:bg-primary/10 transition-all cursor-pointer">
                                Upgrade Plan
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}

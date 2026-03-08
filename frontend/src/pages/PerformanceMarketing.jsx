import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import DashboardLayout from '../components/DashboardLayout'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

// ── API helper ──
async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

// ── Tab config ──
const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { id: 'research', label: 'Research', icon: 'search_insights' },
    { id: 'strategy', label: 'Strategy', icon: 'strategy' },
    { id: 'campaigns', label: 'Campaigns', icon: 'campaign' },
    { id: 'ab-tests', label: 'A/B Tests', icon: 'science' },
    { id: 'learnings', label: 'Learnings', icon: 'psychology' },
    { id: 'reports', label: 'Reports', icon: 'summarize' },
]

// ── Metric card ──
function MetricCard({ icon, label, value, sub, color = 'emerald' }) {
    return (
        <div className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-all group">
            <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 flex items-center justify-center`}>
                    <span className={`material-symbols-outlined text-${color}-400`}>{icon}</span>
                </div>
                {sub && <span className="text-xs text-slate-500">{sub}</span>}
            </div>
            <p className="text-2xl font-bold text-white mb-1">{value}</p>
            <p className="text-sm text-slate-400">{label}</p>
        </div>
    )
}

export default function PerformanceMarketing() {
    const { user } = useAuth()
    const { activeBrand } = useBrand()
    const navigate = useNavigate()

    const [tab, setTab] = useState('dashboard')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Dashboard state
    const [dashboard, setDashboard] = useState(null)
    // Research state
    const [researchQuery, setResearchQuery] = useState('')
    const [competitors, setCompetitors] = useState('')
    const [researchResult, setResearchResult] = useState(null)
    // Strategy state
    const [strategyObjective, setStrategyObjective] = useState('traffic')
    const [strategyBudget, setStrategyBudget] = useState('')
    const [strategyDuration, setStrategyDuration] = useState('30 days')
    const [strategyResult, setStrategyResult] = useState(null)
    // Campaigns state
    const [campaigns, setCampaigns] = useState([])
    // Reports state
    const [reports, setReports] = useState([])
    const [selectedReport, setSelectedReport] = useState(null)
    // Trends state (Enhancement 1)
    const [trendData, setTrendData] = useState(null)
    // Learnings state (Enhancement 4)
    const [learnings, setLearnings] = useState([])
    // Ad image generation state (Enhancement 3)
    const [adImagePrompt, setAdImagePrompt] = useState('')
    const [adImageUrl, setAdImageUrl] = useState('')
    const [generatingImage, setGeneratingImage] = useState(false)
    // Platform connections state
    const [connections, setConnections] = useState({ meta: { status: 'disconnected' }, google: { status: 'disconnected' } })
    const [connectingPlatform, setConnectingPlatform] = useState(null)
    // Grok trending data
    const [grokTopics, setGrokTopics] = useState([])
    const [grokSeoKeywords, setGrokSeoKeywords] = useState(null)
    const [grokContent, setGrokContent] = useState([])
    const [loadingGrok, setLoadingGrok] = useState(false)

    // ── Load dashboard data ──
    const loadDashboard = useCallback(async () => {
        try {
            const data = await api(`/pm-studio/dashboard${activeBrand ? `?brandId=${activeBrand._id}` : ''}`)
            setDashboard(data.dashboard)
        } catch (e) {
            console.warn('Dashboard load error:', e.message)
        }
    }, [activeBrand])

    // ── Load campaigns ──
    const loadCampaigns = useCallback(async () => {
        try {
            const data = await api(`/pm-studio/campaigns${activeBrand ? `?brandId=${activeBrand._id}` : ''}`)
            setCampaigns(data.campaigns || [])
        } catch (e) { console.warn('Campaigns load error:', e.message) }
    }, [activeBrand])

    // ── Load reports ──
    const loadReports = useCallback(async () => {
        try {
            const data = await api(`/pm-studio/reports${activeBrand ? `?brandId=${activeBrand._id}` : ''}`)
            setReports(data.reports || [])
        } catch (e) { console.warn('Reports load error:', e.message) }
    }, [activeBrand])

    // ── Load learnings ──
    const loadLearnings = useCallback(async () => {
        try {
            const data = await api(`/pm-studio/learnings${activeBrand ? `?brandId=${activeBrand._id}` : ''}`)
            setLearnings(data.learnings || [])
        } catch (e) { console.warn('Learnings load error:', e.message) }
    }, [activeBrand])

    // ── Load platform connections (brand-aware) ──
    const loadConnections = useCallback(async () => {
        try {
            const data = await api(`/pm-studio/connect/status${activeBrand ? `?brandId=${activeBrand._id}` : ''}`)
            if (data.connections) setConnections(data.connections)
        } catch (e) { console.warn('Connections load error:', e.message) }
    }, [activeBrand])

    // ── Load Grok trending data ──
    const loadGrokTrends = useCallback(async () => {
        setLoadingGrok(true)
        try {
            const brandParam = activeBrand ? `brandId=${activeBrand._id}` : ''
            const [topicsRes, seoRes, contentRes] = await Promise.allSettled([
                api(`/trends/grok-topics?${brandParam}`),
                api(`/trends/grok-seo?${brandParam}`),
                activeBrand ? api(`/trends/grok-content?${brandParam}`) : Promise.resolve({ suggestions: [] }),
            ])
            if (topicsRes.status === 'fulfilled') setGrokTopics(topicsRes.value?.trends || [])
            if (seoRes.status === 'fulfilled') setGrokSeoKeywords(seoRes.value || null)
            if (contentRes.status === 'fulfilled') setGrokContent(contentRes.value?.suggestions || [])
        } catch (e) { console.warn('Grok trends error:', e.message) }
        finally { setLoadingGrok(false) }
    }, [activeBrand])

    useEffect(() => {
        loadDashboard()
        loadCampaigns()
        loadReports()
        loadLearnings()
        loadConnections()
        loadGrokTrends()
    }, [loadDashboard, loadCampaigns, loadReports, loadLearnings, loadConnections, loadGrokTrends])

    // ── Listen for OAuth popup messages ──
    useEffect(() => {
        const handler = (event) => {
            if (event.data?.type === 'PM_PLATFORM_CONNECTED') {
                setConnectingPlatform(null)
                loadConnections()
            }
        }
        window.addEventListener('message', handler)
        return () => window.removeEventListener('message', handler)
    }, [loadConnections])

    // ── Run Competitor Research ──
    const handleResearch = async () => {
        if (!researchQuery.trim() && !competitors.trim()) return
        setLoading(true); setError('')
        try {
            const data = await api('/pm-studio/research', {
                method: 'POST',
                body: JSON.stringify({
                    query: researchQuery,
                    competitors: competitors.split(',').map(c => c.trim()).filter(Boolean),
                    platforms: ['meta', 'google'],
                    brandId: activeBrand?._id,
                }),
            })
            setResearchResult(data.report)
            setTrendData(data.trendData || null)
            setTab('strategy')
            loadReports()
            loadLearnings()
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Generate Strategy ──
    const handleStrategy = async () => {
        setLoading(true); setError('')
        try {
            const data = await api('/pm-studio/strategy', {
                method: 'POST',
                body: JSON.stringify({
                    reportId: researchResult?._id,
                    objective: strategyObjective,
                    budget: Number(strategyBudget) || 50000,
                    duration: strategyDuration,
                    platforms: ['meta', 'google'],
                    brandId: activeBrand?._id,
                }),
            })
            setStrategyResult(data.report)
            loadReports()
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Generate Budget Plan ──
    const handleBudget = async () => {
        setLoading(true); setError('')
        try {
            const data = await api('/pm-studio/budget', {
                method: 'POST',
                body: JSON.stringify({
                    reportId: strategyResult?._id || researchResult?._id,
                    budget: Number(strategyBudget) || 50000,
                    currency: 'INR',
                    duration: strategyDuration,
                    objective: strategyObjective,
                    brandId: activeBrand?._id,
                }),
            })
            setStrategyResult(prev => ({ ...prev, ...data.report }))
            loadReports()
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Generate Ad Creatives ──
    const handleGenerateCreatives = async () => {
        setLoading(true); setError('')
        try {
            const data = await api('/pm-studio/generate-creatives', {
                method: 'POST',
                body: JSON.stringify({
                    objective: strategyObjective,
                    platforms: ['meta', 'google'],
                    reportId: strategyResult?._id || researchResult?._id,
                    brandId: activeBrand?._id,
                }),
            })
            // Show creatives in campaigns tab
            if (data.creatives?.length) {
                setTab('campaigns')
            }
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Generate Ad Image (Enhancement 3) ──
    const handleGenerateAdImage = async () => {
        if (!adImagePrompt.trim()) return
        setGeneratingImage(true); setAdImageUrl('')
        try {
            const data = await api('/pm-studio/generate-ad-image', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: adImagePrompt,
                    brandId: activeBrand?._id,
                    platform: 'meta-feed',
                }),
            })
            setAdImageUrl(data.imageUrl || '')
        } catch (e) {
            setError(e.message)
        } finally {
            setGeneratingImage(false)
        }
    }

    return (
        <DashboardLayout title="Performance Studio" subtitle="AI-powered ad research, strategy & management">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* ── Error display ── */}
                {error && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError('')} className="text-rose-400 hover:text-rose-300 cursor-pointer">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB NAVIGATION                                             */}
                {/* ════════════════════════════════════════════════════════════ */}
                <div className="flex gap-1 p-1.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${tab === t.id
                                ? 'bg-gradient-to-r from-violet-500/20 to-cyan-500/20 text-white border border-violet-500/30'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                                }`}
                        >
                            <span className="material-symbols-outlined text-lg">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: DASHBOARD                                             */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'dashboard' && (
                    <div className="space-y-6">
                        {/* Metric Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricCard icon="campaign" label="Total Campaigns" value={dashboard?.stats?.totalCampaigns || 0} sub="all time" color="violet" />
                            <MetricCard icon="trending_up" label="Active" value={dashboard?.stats?.activeCampaigns || 0} sub="running now" color="emerald" />
                            <MetricCard icon="payments" label="Total Spend" value={`₹${(dashboard?.stats?.totalSpend || 0).toLocaleString()}`} sub="all time" color="amber" />
                            <MetricCard icon="ads_click" label="Avg CTR" value={`${dashboard?.stats?.avgCtr || 0}%`} sub="across all" color="cyan" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Quick Actions */}
                            <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-violet-400">bolt</span>
                                    Quick Actions
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { icon: 'search_insights', label: 'Research Competitors', action: () => setTab('research'), color: 'violet' },
                                        { icon: 'strategy', label: 'Build Strategy', action: () => setTab('strategy'), color: 'cyan' },
                                        { icon: 'add_circle', label: 'Create Campaign', action: () => setTab('campaigns'), color: 'emerald' },
                                        { icon: 'summarize', label: 'View Reports', action: () => setTab('reports'), color: 'amber' },
                                    ].map(qa => (
                                        <button
                                            key={qa.label}
                                            onClick={qa.action}
                                            className={`p-4 rounded-xl bg-${qa.color}-500/5 border border-${qa.color}-500/10 hover:border-${qa.color}-500/30 hover:bg-${qa.color}-500/10 transition-all cursor-pointer text-left group`}
                                        >
                                            <span className={`material-symbols-outlined text-${qa.color}-400 text-2xl mb-2 block`}>{qa.icon}</span>
                                            <p className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">{qa.label}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Connected Platforms — Read-Only Status */}
                            <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-400">electrical_services</span>
                                        Ad Platforms
                                    </h3>
                                    <button onClick={() => navigate('/integrations')} className="text-xs text-primary hover:text-white cursor-pointer flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-all">
                                        <span className="material-symbols-outlined text-xs">settings</span> Manage in Integrations
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {[
                                        { name: 'Meta Ads', icon: '📘', key: 'meta' },
                                        { name: 'Google Ads', icon: '🔍', key: 'google' },
                                    ].map(p => {
                                        const conn = connections[p.key] || {}
                                        const isConnected = conn.status === 'connected'
                                        return (
                                            <div key={p.key} className={`p-4 rounded-xl border transition-all ${isConnected
                                                ? 'bg-emerald-500/5 border-emerald-500/20'
                                                : 'bg-white/[0.02] border-white/[0.04]'
                                                }`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl">{p.icon}</span>
                                                        <div>
                                                            <p className="text-sm font-medium text-white">{p.name}</p>
                                                            {isConnected ? (
                                                                <p className="text-xs text-emerald-400">✓ {conn.displayName || conn.email || 'Connected'}</p>
                                                            ) : (
                                                                <p className="text-xs text-slate-500">Not connected</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-slate-600'}`} />
                                                </div>

                                                {/* Account details when connected */}
                                                {isConnected && conn.adAccounts?.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                                        <p className="text-xs text-slate-500 mb-1">Ad Accounts:</p>
                                                        {conn.adAccounts.slice(0, 3).map(a => (
                                                            <p key={a.id} className="text-xs text-slate-400">
                                                                {a.name} <span className="text-slate-600">({a.id})</span>
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                                {isConnected && conn.customerIds?.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                                        <p className="text-xs text-slate-500 mb-1">Customer IDs:</p>
                                                        {conn.customerIds.slice(0, 3).map(id => (
                                                            <p key={id} className="text-xs text-slate-400">{id}</p>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Link to Integrations for non-connected */}
                                                {!isConnected && (
                                                    <div className="mt-3">
                                                        <button onClick={() => navigate('/integrations')}
                                                            className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600/20 to-cyan-600/20 text-white/80 text-sm font-medium hover:from-violet-600/30 hover:to-cyan-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 border border-violet-500/20">
                                                            <span className="material-symbols-outlined text-sm">link</span>Connect in Integrations
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                    <p className="text-sm text-slate-500 mt-2">
                                        💡 Research & Strategy work without connections. Connect for live campaign management.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ── 🔥 GROK TRENDING NOW ── */}
                        <div className="glass-panel rounded-2xl p-6 border border-orange-500/20">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-orange-400">whatshot</span>
                                    Trending Now
                                    <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-xs font-bold">LIVE via Grok</span>
                                </h3>
                                <button
                                    onClick={loadGrokTrends}
                                    disabled={loadingGrok}
                                    className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-slate-400 text-sm hover:bg-white/[0.08] transition-all cursor-pointer flex items-center gap-1"
                                >
                                    <span className={`material-symbols-outlined text-sm ${loadingGrok ? 'animate-spin' : ''}`}>refresh</span>
                                    Refresh
                                </button>
                            </div>

                            {loadingGrok && grokTopics.length === 0 ? (
                                <div className="flex items-center justify-center py-8 gap-3">
                                    <span className="material-symbols-outlined animate-spin text-orange-400">progress_activity</span>
                                    <span className="text-base text-slate-400">Fetching live trends from Grok AI...</span>
                                </div>
                            ) : grokTopics.length > 0 ? (
                                <div className="space-y-4">
                                    {/* Trending Topics */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {grokTopics.slice(0, 6).map((t, i) => (
                                            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-orange-500/20 transition-all">
                                                <div className="flex items-start justify-between mb-2">
                                                    <h4 className="text-base font-bold text-white leading-tight">{t.topic}</h4>
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ml-2 ${t.urgency === 'now' ? 'bg-rose-500/10 text-rose-400'
                                                        : t.urgency === 'today' ? 'bg-amber-500/10 text-amber-400'
                                                            : 'bg-slate-500/10 text-slate-400'
                                                        }`}>
                                                        {t.urgency === 'now' ? '🔴 NOW' : t.urgency === 'today' ? '🟡 Today' : '📅 This week'}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-400 mb-2 line-clamp-2">{t.description}</p>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs ${t.category === 'entertainment' ? 'bg-pink-500/10 text-pink-400'
                                                        : t.category === 'tech' ? 'bg-cyan-500/10 text-cyan-400'
                                                            : t.category === 'sports' ? 'bg-green-500/10 text-green-400'
                                                                : t.category === 'viral' ? 'bg-orange-500/10 text-orange-400'
                                                                    : t.category === 'lifestyle' ? 'bg-violet-500/10 text-violet-400'
                                                                        : 'bg-slate-500/10 text-slate-400'
                                                        }`}>{t.category}</span>
                                                    {t.format && <span className="text-sm text-slate-500">📱 {t.format}</span>}
                                                </div>
                                                {t.marketingAngle && (
                                                    <p className="text-sm text-emerald-400 mb-2">💡 {t.marketingAngle}</p>
                                                )}
                                                {t.hashtags?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {t.hashtags.slice(0, 4).map((h, hi) => (
                                                            <span key={hi} className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-sm">{h}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-6">
                                    <p className="text-base text-slate-500">No trending data available. Click Refresh to fetch.</p>
                                </div>
                            )}
                        </div>

                        {/* ── 💡 GROK CONTENT IDEAS ── */}
                        {grokContent.length > 0 && (
                            <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-cyan-400">tips_and_updates</span>
                                    AI Content Suggestions
                                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold">Grok</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {grokContent.slice(0, 4).map((s, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-cyan-500/20 transition-all">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.platform === 'instagram' ? 'bg-pink-500/10 text-pink-400'
                                                    : s.platform === 'twitter' ? 'bg-sky-500/10 text-sky-400'
                                                        : s.platform === 'linkedin' ? 'bg-blue-500/10 text-blue-400'
                                                            : 'bg-slate-500/10 text-slate-400'
                                                    }`}>{s.platform}</span>
                                                <span className="text-sm text-slate-500">{s.format}</span>
                                                {s.viralPotential === 'high' && <span className="text-sm text-orange-400">🔥 High viral</span>}
                                            </div>
                                            <h4 className="text-base font-bold text-white mb-1">{s.title}</h4>
                                            <p className="text-sm text-slate-400 mb-2">{s.hook}</p>
                                            {s.trendConnection && (
                                                <p className="text-sm text-emerald-400 mb-2">📈 Trend: {s.trendConnection}</p>
                                            )}
                                            {s.hashtags?.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {s.hashtags.slice(0, 5).map((h, hi) => (
                                                        <span key={hi} className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-sm">{h}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Recent Reports */}
                        {(dashboard?.recentReports?.length > 0) && (
                            <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-cyan-400">history</span>
                                    Recent Reports
                                </h3>
                                <div className="space-y-2">
                                    {dashboard.recentReports.map(r => (
                                        <button
                                            key={r._id}
                                            onClick={() => { setSelectedReport(r); setTab('reports') }}
                                            className="w-full flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all cursor-pointer text-left"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-white">{r.title}</p>
                                                <p className="text-xs text-slate-500">{r.type} · {new Date(r.createdAt).toLocaleDateString()}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                {r.status}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: RESEARCH                                              */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'research' && (
                    <div className="space-y-6">

                        {/* ── 🔍 GROK TRENDING SEO KEYWORDS ── */}
                        {grokSeoKeywords?.risingKeywords?.length > 0 && (
                            <div className="glass-panel rounded-2xl p-6 border border-amber-500/20">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">trending_up</span>
                                    Trending SEO Keywords
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">LIVE via Grok</span>
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                                    {grokSeoKeywords.risingKeywords.slice(0, 6).map((k, i) => (
                                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-medium text-white">"{k.keyword}"</p>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${k.trend === 'breakout' ? 'bg-rose-500/10 text-rose-400'
                                                    : k.trend === 'rising' ? 'bg-emerald-500/10 text-emerald-400'
                                                        : k.trend === 'seasonal' ? 'bg-amber-500/10 text-amber-400'
                                                            : 'bg-cyan-500/10 text-cyan-400'
                                                    }`}>
                                                    {k.trend === 'breakout' ? '🚀' : k.trend === 'rising' ? '📈' : '📅'} {k.trend}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-500 mb-1">{k.growthRate} · {k.intent} intent · {k.difficulty} difficulty</p>
                                            <p className="text-sm text-slate-400">{k.whyTrending}</p>
                                            {k.semOpportunity && <p className="text-sm text-cyan-400 mt-1">💰 {k.semOpportunity}</p>}
                                        </div>
                                    ))}
                                </div>

                                {/* Question Queries */}
                                {grokSeoKeywords.questionQueries?.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-white/[0.04]">
                                        <p className="text-sm font-bold text-violet-400 mb-3">❓ People Are Asking</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            {grokSeoKeywords.questionQueries.slice(0, 6).map((q, i) => (
                                                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.01]">
                                                    <span className="text-violet-400 mt-0.5 text-sm">Q:</span>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{q.question}</p>
                                                        <p className="text-sm text-slate-500">{q.searchVolume} volume · {q.answerAngle}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Seasonal Keywords */}
                                {grokSeoKeywords.seasonalUpcoming?.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-white/[0.04]">
                                        <p className="text-sm font-bold text-amber-400 mb-3">📅 Upcoming Seasonal Peaks</p>
                                        <div className="flex flex-wrap gap-2">
                                            {grokSeoKeywords.seasonalUpcoming.slice(0, 6).map((s, i) => (
                                                <div key={i} className="px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                    <p className="text-sm font-bold text-white">{s.keyword}</p>
                                                    <p className="text-sm text-amber-400">Peak: {s.peakMonth} · {s.event}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="glass-panel rounded-2xl p-6 border border-violet-500/20">
                            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-violet-400">search_insights</span>
                                Competitor Research
                            </h2>
                            <p className="text-sm text-slate-400 mb-6">AI-powered analysis of competitor ad strategies across Meta & Google</p>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">What do you want to research?</label>
                                    <textarea
                                        value={researchQuery}
                                        onChange={e => setResearchQuery(e.target.value)}
                                        placeholder="e.g., Analyze performance marketing strategies of D2C skincare brands in India targeting Gen Z..."
                                        className="w-full h-24 px-4 py-3 rounded-xl bg-black/30 border border-violet-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-violet-400/50 resize-y"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Competitors (comma-separated)</label>
                                    <input
                                        value={competitors}
                                        onChange={e => setCompetitors(e.target.value)}
                                        placeholder="e.g., Minimalist, mCaffeine, Plum Goodness"
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-violet-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-violet-400/50"
                                    />
                                </div>
                                <button
                                    onClick={handleResearch}
                                    disabled={loading || (!researchQuery.trim() && !competitors.trim())}
                                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-sm hover:shadow-xl hover:shadow-violet-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><span className="material-symbols-outlined animate-spin">progress_activity</span>Analyzing competitors with AI...</>
                                    ) : (
                                        <><span className="material-symbols-outlined">rocket_launch</span>Run Competitor Research</>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Research Results */}
                        {researchResult && (
                            <div className="space-y-4">
                                <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-400">analytics</span>
                                        Research Findings
                                    </h3>

                                    {/* Key Findings */}
                                    {researchResult.aiAnalysis?.keyFindings?.length > 0 && (
                                        <div className="mb-6">
                                            <p className="text-sm font-bold text-cyan-400 mb-2">🔍 Key Findings</p>
                                            <div className="space-y-2">
                                                {researchResult.aiAnalysis.keyFindings.map((f, i) => (
                                                    <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                        <span className="text-cyan-400 mt-0.5">▸</span>
                                                        <span>{typeof f === 'string' ? f : f.title || JSON.stringify(f)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Recommendations */}
                                    {researchResult.aiAnalysis?.recommendations?.length > 0 && (
                                        <div>
                                            <p className="text-sm font-bold text-amber-400 mb-2">💡 Recommendations</p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {researchResult.aiAnalysis.recommendations.map((r, i) => (
                                                    <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                        <p className="text-sm font-medium text-white mb-1">{r.title}</p>
                                                        <p className="text-xs text-slate-400">{r.description}</p>
                                                        <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-bold ${r.priority === 'high' ? 'bg-rose-500/10 text-rose-400' : r.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                                            {r.priority} priority
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ── LIVE TREND DATA (Enhancement 1) ── */}
                                {trendData?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20">
                                        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400">trending_up</span>
                                            Live Google Trends
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {trendData.map((t, i) => (
                                                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                    <p className="text-sm font-medium text-white mb-2">"{t.keyword}"</p>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${t.trend === 'rising' ? 'bg-emerald-500/10 text-emerald-400'
                                                            : t.trend === 'declining' ? 'bg-rose-500/10 text-rose-400'
                                                                : 'bg-slate-500/10 text-slate-400'
                                                            }`}>
                                                            {t.trend === 'rising' ? '📈' : t.trend === 'declining' ? '📉' : '➡️'} {t.trend}
                                                        </span>
                                                        <span className="text-xs text-slate-500">
                                                            {t.trendStrength > 0 ? '+' : ''}{t.trendStrength}%
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-xs text-slate-500">
                                                        <span>Interest: {t.currentInterest}/100</span>
                                                        <span>Peak: {t.peakInterest}</span>
                                                    </div>
                                                    {/* Mini bar */}
                                                    <div className="w-full h-1.5 rounded-full bg-white/[0.06] mt-2 overflow-hidden">
                                                        <div className={`h-full rounded-full ${t.trend === 'rising' ? 'bg-emerald-500' : t.trend === 'declining' ? 'bg-rose-500' : 'bg-slate-500'
                                                            }`} style={{ width: `${t.currentInterest}%` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => setTab('strategy')}
                                    className="w-full py-3 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-sm border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                    Build Strategy from Research →
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: STRATEGY                                              */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'strategy' && (
                    <div className="space-y-6">
                        <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20">
                            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-400">strategy</span>
                                AI Strategy Builder
                            </h2>
                            <p className="text-sm text-slate-400 mb-6">Generate a data-driven performance marketing strategy</p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Campaign Objective</label>
                                    <select
                                        value={strategyObjective}
                                        onChange={e => setStrategyObjective(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white text-sm outline-none focus:border-cyan-400/50 cursor-pointer"
                                    >
                                        <option value="awareness">Brand Awareness</option>
                                        <option value="traffic">Website Traffic</option>
                                        <option value="engagement">Engagement</option>
                                        <option value="leads">Lead Generation</option>
                                        <option value="conversions">Conversions</option>
                                        <option value="sales">Sales / ROAS</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Total Budget (₹)</label>
                                    <input
                                        type="number"
                                        value={strategyBudget}
                                        onChange={e => setStrategyBudget(e.target.value)}
                                        placeholder="50000"
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-cyan-400/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Duration</label>
                                    <select
                                        value={strategyDuration}
                                        onChange={e => setStrategyDuration(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white text-sm outline-none focus:border-cyan-400/50 cursor-pointer"
                                    >
                                        <option value="7 days">7 Days</option>
                                        <option value="14 days">14 Days</option>
                                        <option value="30 days">30 Days</option>
                                        <option value="60 days">60 Days</option>
                                        <option value="90 days">90 Days</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleStrategy}
                                    disabled={loading}
                                    className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:shadow-xl hover:shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><span className="material-symbols-outlined animate-spin">progress_activity</span>AI is building strategy...</>
                                    ) : (
                                        <><span className="material-symbols-outlined">auto_awesome</span>Generate Strategy</>
                                    )}
                                </button>
                                <button
                                    onClick={handleBudget}
                                    disabled={loading || !strategyResult}
                                    className="px-6 py-4 rounded-2xl bg-amber-500/10 text-amber-400 font-bold text-sm border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">payments</span>
                                    Budget Plan
                                </button>
                            </div>
                        </div>

                        {/* Strategy Results */}
                        {strategyResult?.strategyPlan && (
                            <div className="space-y-4">
                                {/* Goals */}
                                {strategyResult.strategyPlan.goals?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400">flag</span>
                                            Campaign Goals
                                        </h3>
                                        <div className="space-y-2">
                                            {strategyResult.strategyPlan.goals.map((g, i) => (
                                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                    <span className="text-emerald-400 font-bold text-sm mt-0.5">{i + 1}</span>
                                                    <p className="text-sm text-slate-300">{typeof g === 'string' ? g : g.goal || JSON.stringify(g)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Channel Allocation */}
                                {strategyResult.strategyPlan.channelAllocation?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-violet-400">donut_large</span>
                                            Channel Allocation
                                        </h3>
                                        <div className="space-y-3">
                                            {strategyResult.strategyPlan.channelAllocation.map((ch, i) => (
                                                <div key={i} className="flex items-center gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <p className="text-sm font-medium text-white">{ch.channel}</p>
                                                            <p className="text-sm font-bold text-violet-400">{ch.budgetPercent}%</p>
                                                        </div>
                                                        <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all" style={{ width: `${ch.budgetPercent}%` }} />
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1">{ch.rationale}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Timeline */}
                                {strategyResult.strategyPlan.timeline?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-400">timeline</span>
                                            Launch Timeline
                                        </h3>
                                        <div className="space-y-4">
                                            {strategyResult.strategyPlan.timeline.map((phase, i) => (
                                                <div key={i} className="relative pl-8 pb-4 border-l-2 border-white/[0.08] last:border-l-0">
                                                    <div className="absolute left-0 top-0 -translate-x-1/2 w-4 h-4 rounded-full bg-amber-500/20 border-2 border-amber-500" />
                                                    <h4 className="text-sm font-bold text-white">{phase.phase}</h4>
                                                    <p className="text-xs text-amber-400 mb-2">{phase.duration}</p>
                                                    <ul className="space-y-1">
                                                        {(phase.activities || []).map((a, j) => (
                                                            <li key={j} className="text-xs text-slate-400 flex items-start gap-1.5">
                                                                <span className="text-slate-600 mt-0.5">•</span>{a}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* KPIs */}
                                {strategyResult.strategyPlan.kpis?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-cyan-400">speed</span>
                                            Key Performance Indicators
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {strategyResult.strategyPlan.kpis.map((kpi, i) => (
                                                <div key={i} className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-center">
                                                    <p className="text-xs text-slate-500 uppercase tracking-wide">{kpi.metric}</p>
                                                    <p className="text-lg font-bold text-white mt-1">{kpi.target}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Budget Plan */}
                                {strategyResult.budgetPlan?.allocation?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-amber-500/20">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-400">account_balance</span>
                                            Budget Allocation — ₹{(strategyResult.budgetPlan.totalBudget || 0).toLocaleString()} for {strategyResult.budgetPlan.duration}
                                        </h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-white/[0.06]">
                                                        <th className="text-left py-2 text-slate-500 font-medium">Platform</th>
                                                        <th className="text-left py-2 text-slate-500 font-medium">Campaign</th>
                                                        <th className="text-right py-2 text-slate-500 font-medium">Daily Budget</th>
                                                        <th className="text-right py-2 text-slate-500 font-medium">Expected ROAS</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {strategyResult.budgetPlan.allocation.map((a, i) => (
                                                        <tr key={i} className="border-b border-white/[0.04]">
                                                            <td className="py-2 text-slate-300">{a.platform}</td>
                                                            <td className="py-2 text-white font-medium">{a.campaign}</td>
                                                            <td className="py-2 text-right text-amber-400">₹{(a.amount || 0).toLocaleString()}</td>
                                                            <td className="py-2 text-right text-emerald-400">{a.expectedRoas || '–'}x</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Generate Creatives CTA */}
                                <button
                                    onClick={handleGenerateCreatives}
                                    disabled={loading}
                                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-sm hover:shadow-xl hover:shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">auto_fix_high</span>
                                    Generate Ad Creatives from Strategy
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: CAMPAIGNS                                             */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'campaigns' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-emerald-400">campaign</span>
                                Campaigns
                            </h2>
                            <button
                                onClick={() => setTab('strategy')}
                                className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-sm font-medium border border-emerald-500/20 hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>
                                New Campaign
                            </button>
                        </div>

                        {campaigns.length === 0 ? (
                            <div className="glass-panel rounded-2xl p-12 border border-white/[0.06] text-center">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-4 block">campaign</span>
                                <h3 className="text-lg font-bold text-white mb-2">No Campaigns Yet</h3>
                                <p className="text-sm text-slate-400 mb-6">Start by researching competitors and building a strategy, then create your first campaign.</p>
                                <button
                                    onClick={() => setTab('research')}
                                    className="px-6 py-3 rounded-xl bg-violet-500/10 text-violet-400 font-medium text-sm border border-violet-500/20 hover:bg-violet-500/20 transition-all cursor-pointer"
                                >
                                    Start with Research →
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {campaigns.map(c => (
                                    <div key={c._id} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-all">
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <h4 className="text-base font-bold text-white">{c.title}</h4>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-xs text-slate-500">{c.platform === 'meta' ? '📘 Meta' : c.platform === 'google' ? '🔍 Google' : '📢 Both'}</span>
                                                    <span className="text-xs text-slate-500">·</span>
                                                    <span className="text-xs text-slate-500">{c.objective}</span>
                                                </div>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400'
                                                : c.status === 'draft' ? 'bg-slate-500/10 text-slate-400'
                                                    : c.status === 'paused' ? 'bg-amber-500/10 text-amber-400'
                                                        : 'bg-violet-500/10 text-violet-400'
                                                }`}>
                                                {c.status}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-4">
                                            <div><p className="text-xs text-slate-500">Spend</p><p className="text-sm font-bold text-white">₹{(c.performance?.spend || 0).toLocaleString()}</p></div>
                                            <div><p className="text-xs text-slate-500">Impressions</p><p className="text-sm font-bold text-white">{(c.performance?.impressions || 0).toLocaleString()}</p></div>
                                            <div><p className="text-xs text-slate-500">Clicks</p><p className="text-sm font-bold text-white">{(c.performance?.clicks || 0).toLocaleString()}</p></div>
                                            <div><p className="text-xs text-slate-500">ROAS</p><p className="text-sm font-bold text-emerald-400">{c.performance?.roas || '–'}x</p></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── AD IMAGE GENERATOR (Enhancement 3) ── */}
                        <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20">
                            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-400">auto_awesome</span>
                                AI Ad Image Generator
                            </h3>
                            <p className="text-sm text-slate-400 mb-4">Generate scroll-stopping ad visuals using your brand style</p>
                            <div className="flex gap-3 mb-4">
                                <input
                                    value={adImagePrompt}
                                    onChange={e => setAdImagePrompt(e.target.value)}
                                    placeholder="e.g., Summer sale banner with vibrant product showcase..."
                                    className="flex-1 px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-cyan-400/50"
                                />
                                <button
                                    onClick={handleGenerateAdImage}
                                    disabled={generatingImage || !adImagePrompt.trim()}
                                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 text-white font-bold text-sm hover:shadow-xl hover:shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                                >
                                    {generatingImage ? (
                                        <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>Generating...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-sm">image</span>Generate</>
                                    )}
                                </button>
                            </div>
                            {adImageUrl && (
                                <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                                    <img src={adImageUrl} alt="Generated ad" className="w-full max-h-96 object-contain bg-black/40" />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: A/B TESTS                                             */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'ab-tests' && (
                    <div className="space-y-6">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-purple-400">science</span>
                            A/B Testing
                        </h2>

                        {campaigns.filter(c => c.abTest?.enabled).length === 0 ? (
                            <div className="glass-panel rounded-2xl p-12 border border-white/[0.06] text-center">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-4 block">science</span>
                                <h3 className="text-lg font-bold text-white mb-2">No A/B Tests Running</h3>
                                <p className="text-sm text-slate-400 mb-6">Create a campaign first, then design an A/B test to optimize your ad performance.</p>
                                <button
                                    onClick={() => setTab('campaigns')}
                                    className="px-6 py-3 rounded-xl bg-purple-500/10 text-purple-400 font-medium text-sm border border-purple-500/20 hover:bg-purple-500/20 transition-all cursor-pointer"
                                >
                                    Go to Campaigns
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {campaigns.filter(c => c.abTest?.enabled).map(c => (
                                    <div key={c._id} className="glass-panel rounded-2xl p-6 border border-purple-500/20">
                                        <h3 className="text-base font-bold text-white mb-4">{c.title} — A/B Test</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {(c.abTest.variants || []).map((v, i) => (
                                                <div key={i} className={`p-4 rounded-xl border ${c.abTest.winnerVariant === v.name ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                                                    <p className="text-sm font-bold text-white mb-2">
                                                        {v.name}
                                                        {c.abTest.winnerVariant === v.name && <span className="ml-2 text-emerald-400">🏆 Winner</span>}
                                                    </p>
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        <div><span className="text-slate-500">Clicks</span><p className="text-white font-bold">{v.performance?.clicks || 0}</p></div>
                                                        <div><span className="text-slate-500">CTR</span><p className="text-white font-bold">{v.performance?.ctr || 0}%</p></div>
                                                        <div><span className="text-slate-500">Spend</span><p className="text-white font-bold">₹{v.performance?.spend || 0}</p></div>
                                                        <div><span className="text-slate-500">Conversions</span><p className="text-white font-bold">{v.performance?.conversions || 0}</p></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-3">Primary metric: <span className="text-purple-400 font-bold">{c.abTest.metric?.toUpperCase()}</span></p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: LEARNINGS (Enhancement 4)                              */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'learnings' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-purple-400">psychology</span>
                                AI Learnings
                            </h2>
                            <p className="text-xs text-slate-500">{learnings.length} insights stored</p>
                        </div>

                        {learnings.length === 0 ? (
                            <div className="glass-panel rounded-2xl p-12 border border-white/[0.06] text-center">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-4 block">psychology</span>
                                <h3 className="text-lg font-bold text-white mb-2">No Learnings Yet</h3>
                                <p className="text-sm text-slate-400 mb-6">Run competitor research or create campaigns — the AI will automatically extract insights and get smarter over time.</p>
                                <button
                                    onClick={() => setTab('research')}
                                    className="px-6 py-3 rounded-xl bg-violet-500/10 text-violet-400 font-medium text-sm border border-violet-500/20 hover:bg-violet-500/20 transition-all cursor-pointer"
                                >
                                    Start with Research →
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {learnings.map(l => (
                                    <div key={l._id} className="glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-purple-500/20 transition-all">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${l.type === 'campaign-result' ? 'bg-emerald-500/10 text-emerald-400'
                                                    : l.type === 'audience-insight' ? 'bg-cyan-500/10 text-cyan-400'
                                                        : l.type === 'creative-insight' ? 'bg-violet-500/10 text-violet-400'
                                                            : l.type === 'competitor-pattern' ? 'bg-rose-500/10 text-rose-400'
                                                                : 'bg-amber-500/10 text-amber-400'
                                                    }`}>
                                                    {l.type.replace(/-/g, ' ')}
                                                </span>
                                                <span className={`w-1.5 h-1.5 rounded-full ${l.insight?.confidence === 'high' ? 'bg-emerald-400' : l.insight?.confidence === 'medium' ? 'bg-amber-400' : 'bg-slate-500'}`} />
                                            </div>
                                            <span className="text-xs text-slate-600">{new Date(l.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <h4 className="text-sm font-bold text-white mb-1">{l.title}</h4>
                                        <p className="text-xs text-slate-400 mb-2">{l.insight?.summary}</p>
                                        {l.insight?.actionable && (
                                            <p className="text-xs text-purple-400">💡 {l.insight.actionable}</p>
                                        )}
                                        {l.metrics?.roas && (
                                            <div className="flex gap-4 mt-2 text-xs text-slate-500">
                                                <span>ROAS: <span className="text-emerald-400 font-bold">{l.metrics.roas.toFixed(1)}x</span></span>
                                                {l.metrics.ctr && <span>CTR: <span className="text-white font-bold">{l.metrics.ctr.toFixed(2)}%</span></span>}
                                                {l.metrics.spend && <span>Spend: <span className="text-white font-bold">₹{l.metrics.spend.toLocaleString()}</span></span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: REPORTS                                                */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'reports' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400">summarize</span>
                                Reports
                            </h2>
                            <button
                                onClick={async () => {
                                    setLoading(true)
                                    try {
                                        await api('/pm-studio/report', {
                                            method: 'POST',
                                            body: JSON.stringify({ brandId: activeBrand?._id }),
                                        })
                                        loadReports()
                                    } catch (e) { setError(e.message) }
                                    finally { setLoading(false) }
                                }}
                                disabled={loading}
                                className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 text-sm font-medium border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                Generate Report
                            </button>
                        </div>

                        {/* Selected Report Detail View */}
                        {selectedReport && (
                            <div className="glass-panel rounded-2xl p-6 border border-amber-500/20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base font-bold text-white">{selectedReport.title}</h3>
                                    <button onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                                <div className="text-sm text-slate-300 space-y-3">
                                    {selectedReport.aiAnalysis?.summary && (
                                        <p className="text-white font-medium">{selectedReport.aiAnalysis.summary}</p>
                                    )}
                                    {selectedReport.aiAnalysis?.keyFindings?.map((f, i) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <span className="text-amber-400 mt-0.5">▸</span>
                                            <span>{typeof f === 'string' ? f : f.title || JSON.stringify(f)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reports List */}
                        {reports.length === 0 ? (
                            <div className="glass-panel rounded-2xl p-12 border border-white/[0.06] text-center">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-4 block">summarize</span>
                                <h3 className="text-lg font-bold text-white mb-2">No Reports Yet</h3>
                                <p className="text-sm text-slate-400">Reports are generated automatically from research and campaign data.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {reports.map(r => (
                                    <button
                                        key={r._id}
                                        onClick={() => setSelectedReport(r)}
                                        className="w-full glass-panel rounded-2xl p-5 border border-white/[0.06] hover:border-white/[0.12] transition-all cursor-pointer text-left flex items-center justify-between"
                                    >
                                        <div>
                                            <h4 className="text-sm font-bold text-white">{r.title}</h4>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.type === 'competitor-research' ? 'bg-violet-500/10 text-violet-400'
                                                    : r.type === 'strategy' ? 'bg-cyan-500/10 text-cyan-400'
                                                        : r.type === 'budget-plan' ? 'bg-amber-500/10 text-amber-400'
                                                            : 'bg-emerald-500/10 text-emerald-400'
                                                    }`}>
                                                    {r.type}
                                                </span>
                                                <span className="text-xs text-slate-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-600">chevron_right</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}

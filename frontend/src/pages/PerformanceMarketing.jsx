import { useState, useEffect, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import DashboardLayout from '../components/DashboardLayout'
import StudioReportButton from '../components/reports/StudioReportButton'
import GlobalLoader from '../components/GlobalLoader'
import { apiFetch as api, googleAnalytics } from '../services/api'


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
    const [error, setError] = useState(null)

    // Dashboard state
    const [dashboard, setDashboard] = useState(null)
    // Research state
    const [researchQuery, setResearchQuery] = useState('')
    const [competitors, setCompetitors] = useState('')
    const [researchResult, setResearchResult] = useState(null)
    // Strategy state
    const [strategyGoals, setStrategyGoals] = useState(['traffic'])
    const [strategyBudget, setStrategyBudget] = useState('')
    const [strategyDuration, setStrategyDuration] = useState('30 days')
    const [strategyTargetAudience, setStrategyTargetAudience] = useState('')
    const [strategyTargetGeo, setStrategyTargetGeo] = useState('')
    const [strategyCurrency, setStrategyCurrency] = useState('INR')
    const [strategyCustomKeywords, setStrategyCustomKeywords] = useState('')
    const [showStrategyPresentation, setShowStrategyPresentation] = useState(false)
    const [strategyResult, setStrategyResult] = useState(null)
    // Strategy health
    const [strategyHealth, setStrategyHealth] = useState(null)
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
    
    // AdSense state
    const [adsenseAccounts, setAdsenseAccounts] = useState([])
    const [adsenseSelected, setAdsenseSelected] = useState('')
    const [adsenseReport, setAdsenseReport] = useState(null)
    const [adsenseLoading, setAdsenseLoading] = useState(false)
    const [adsenseError, setAdsenseError] = useState('')

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

    // ── Load AdSense data ──
    const loadAdSense = useCallback(async () => {
        setAdsenseLoading(true); setAdsenseError('');
        try {
            const data = await googleAnalytics.adsenseAccounts(activeBrand?._id)
            if (data.accounts?.length > 0) {
                setAdsenseAccounts(data.accounts)
                const first = data.accounts[0].id
                setAdsenseSelected(first)
                const rep = await googleAnalytics.adsenseReport({ accountId: first, brandId: activeBrand?._id })
                if (rep.success) setAdsenseReport(rep.report)
            } else {
                setAdsenseError('No AdSense accounts found.')
            }
        } catch (e) {
            setAdsenseError(e.message.includes('expired') || e.message.includes('connected') || e.message.includes('401') ? 'Google connection expired or missing AdSense permissions. Reconnect Google Ads.' : 'Failed to load AdSense.')
        } finally {
            setAdsenseLoading(false)
        }
    }, [activeBrand])

    useEffect(() => {
        loadDashboard()
        loadCampaigns()
        loadReports()
        loadLearnings()
        loadConnections()
        loadGrokTrends()
        loadStrategyHealth()
    }, [loadDashboard, loadCampaigns, loadReports, loadLearnings, loadConnections, loadGrokTrends])

    useEffect(() => {
        if (connections.google?.status === 'connected') {
            loadAdSense()
        }
    }, [connections.google?.status, loadAdSense])

    // ── Load strategy health ──
    const loadStrategyHealth = useCallback(async () => {
        try {
            const data = await api(`/pm-studio/strategy-health${activeBrand ? `?brandId=${activeBrand._id}` : ''}`)
            if (data.health !== null && data.health !== undefined) setStrategyHealth(data)
        } catch (e) { /* strategy health is optional */ }
    }, [activeBrand])

    // ── Listen for OAuth popup messages & Broadcasts ──
    useEffect(() => {
        const syncChannel = new BroadcastChannel('mantram_sync')
        const handler = (event) => {
            if (event.data?.type === 'PM_PLATFORM_CONNECTED') {
                setConnectingPlatform(null)
                loadConnections()
                // If this tab received a postMessage (e.g. from a popup), broadcast it to other tabs
                if (event.source) {
                    syncChannel.postMessage(event.data)
                }
            }
        }
        window.addEventListener('message', handler)
        syncChannel.addEventListener('message', handler)
        return () => {
            window.removeEventListener('message', handler)
            syncChannel.removeEventListener('message', handler)
            syncChannel.close()
        }
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
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
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
                    goals: strategyGoals,
                    objective: strategyGoals[0] || 'traffic',
                    budget: Number(strategyBudget) || 50000,
                    currency: strategyCurrency,
                    duration: strategyDuration,
                    platforms: ['meta', 'google'],
                    brandId: activeBrand?._id,
                    targetAudience: strategyTargetAudience || undefined,
                    targetGeo: strategyTargetGeo || undefined,
                    customKeywords: strategyCustomKeywords ? strategyCustomKeywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
                }),
            })
            setStrategyResult(data.report)
            loadReports()
        } catch (e) {
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
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
                    objective: strategyGoals[0] || 'traffic',
                    brandId: activeBrand?._id,
                }),
            })
            setStrategyResult(prev => ({ ...prev, ...data.report }))
            loadReports()
        } catch (e) {
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
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
                    objective: strategyGoals[0] || 'traffic',
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
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
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
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally {
            setGeneratingImage(false)
        }
    }

    if (!activeBrand) {
        return (
            <DashboardLayout title="Performance Studio" subtitle="AI-powered ad research, strategy & management">
                <SEOHead title="Performance Studio — Mantram AI" noIndex={true} />
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                    <div className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-4xl text-violet-400">brand_awareness</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">Select a Brand to Continue</h2>
                    <p className="text-slate-400 max-w-md mx-auto">
                        Performance marketing insights and strategies are brand-specific. Please select or create a brand to access the Performance Studio.
                    </p>
                    <button onClick={() => navigate('/dashboard')} className="px-6 py-3 rounded-xl bg-primary text-white font-bold hover:shadow-lg transition-all cursor-pointer">
                        Go to Dashboard
                    </button>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout 
            title={<h1 className="text-2xl font-black m-0">Performance Studio</h1>} 
            subtitle="AI-powered ad research, strategy & management"
        >
            <SEOHead 
                title="Performance Studio — AI Ad Management for Google Ads & Meta" 
                description="Use Mantram AI Performance Studio to completely automate media buying. Conduct AI competitor research, generate cross-platform ad strategies, and manage Google Ads and Meta Ads campaigns." 
                canonical="/performance-marketing"
            />
            <div className="max-w-7xl mx-auto space-y-6">
                {/* ── Error display ── */}
                {error && (
                    <div className={`p-4 rounded-2xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'} text-sm flex items-center gap-2`}>
                        <span className="material-symbols-outlined text-base">
                            {error.isProviderError ? 'warning' : 'error'}
                        </span>
                        <div className="flex-1">
                            {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                            {error.message}
                        </div>
                        <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100 cursor-pointer">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* ═══ Report Button ═══ */}
                <div className="flex justify-end">
                    <StudioReportButton studio="pm" brandId={activeBrand?._id} />
                </div>

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
                    <button onClick={() => setTab('help')}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all cursor-pointer ${tab === 'help' ? 'bg-gradient-to-r from-violet-500/20 to-cyan-500/20 text-white border border-violet-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'}`}>
                        <span className="material-symbols-outlined text-lg">menu_book</span>
                        How It Works
                    </button>
                </div>

                {/* ════════════════════════════════════════════════════════════ */}
                {/* TAB: HELP                                                   */}
                {/* ════════════════════════════════════════════════════════════ */}
                {tab === 'help' && (
                    <div className="animate-fade-in">
                        <PMHelpView onBack={() => setTab('dashboard')} />
                    </div>
                )}

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

                        {/* ── 🔥 ADSENSE REVENUE (Conditionally rendered if connected) ── */}
                        {connections.google?.status === 'connected' && (adsenseLoading || adsenseReport || adsenseError) && (
                            <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-400">monetization_on</span>
                                        Google AdSense Revenue
                                    </h3>
                                    {adsenseAccounts.length > 1 && (
                                        <select
                                            value={adsenseSelected}
                                            onChange={(e) => {
                                                setAdsenseSelected(e.target.value);
                                                setAdsenseLoading(true);
                                                googleAnalytics.adsenseReport({ accountId: e.target.value, brandId: activeBrand?._id })
                                                    .then(res => setAdsenseReport(res.report))
                                                    .finally(() => setAdsenseLoading(false));
                                            }}
                                            className="bg-slate-800/50 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 transition-colors"
                                        >
                                            {adsenseAccounts.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                                        </select>
                                    )}
                                </div>
                                
                                {adsenseLoading ? (
                                    <div className="flex items-center justify-center p-8">
                                        <span className="material-symbols-outlined animate-spin text-emerald-400 text-3xl">progress_activity</span>
                                    </div>
                                ) : adsenseError ? (
                                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                                        {adsenseError}
                                    </div>
                                ) : adsenseReport ? (
                                    <div className="space-y-6">
                                        {/* AdSense KPI Summary */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Estimated Earnings', value: `₹${parseFloat(adsenseReport.totals?.cells?.[5]?.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: 'payments', color: 'emerald' },
                                                { label: 'Page Views', value: parseInt(adsenseReport.totals?.cells?.[1]?.value || 0).toLocaleString(), icon: 'visibility', color: 'blue' },
                                                { label: 'Clicks', value: parseInt(adsenseReport.totals?.cells?.[3]?.value || 0).toLocaleString(), icon: 'ads_click', color: 'amber' },
                                                { label: 'Avg CTR', value: `${(parseFloat(adsenseReport.totals?.cells?.[3]?.value || 0) / parseFloat(adsenseReport.totals?.cells?.[1]?.value || 1) * 100).toFixed(2)}%`, icon: 'percent', color: 'violet' }
                                            ].map((s, i) => (
                                                <div key={i} className={`p-4 rounded-xl border border-${s.color}-500/20 bg-${s.color}-500/5 text-center`}>
                                                    <span className={`material-symbols-outlined text-2xl text-${s.color}-400 mb-2 block`}>{s.icon}</span>
                                                    <p className="text-xl font-black text-white">{s.value}</p>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">{s.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                        {/* AdSense Trend Sparkline */}
                                        <div className="p-4 bg-white/[0.02] border border-white/[0.05] rounded-xl">
                                            <p className="text-xs text-slate-400 font-bold uppercase mb-4">Daily Revenue (Last 30 Days)</p>
                                            <div className="h-24 w-full relative">
                                                {(() => {
                                                    const rows = adsenseReport.rows || [];
                                                    if (rows.length < 2) return <p className="text-slate-500 text-xs text-center pt-8">Not enough data to trend</p>;
                                                    const maxV = Math.max(...rows.map(r => parseFloat(r.cells[5].value)), 1);
                                                    const minV = Math.min(...rows.map(r => parseFloat(r.cells[5].value)));
                                                    const w = 100, h = 100;
                                                    const points = rows.map((r, i) => {
                                                        const x = (i / (rows.length - 1)) * w;
                                                        const y = h - ((parseFloat(r.cells[5].value) - minV) / (maxV - minV || 1)) * (h - 10) - 5;
                                                        return `${x},${y}`;
                                                    }).join(' ');
                                                    const areaPath = `M 0,${h} L ${rows.map((r, i) => { const x = (i / (rows.length - 1)) * w; const y = h - ((parseFloat(r.cells[5].value) - minV) / (maxV - minV || 1)) * (h - 10) - 5; return `${x},${y}`; }).join(' L ')} L ${w},${h} Z`;
                                                    return (
                                                        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
                                                            <defs>
                                                                <linearGradient id="adsenseGrad" x1="0" y1="0" x2="0" y2="1">
                                                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                                                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                                                </linearGradient>
                                                            </defs>
                                                            <path d={areaPath} fill="url(#adsenseGrad)" />
                                                            <polyline points={points} fill="none" stroke="#34d399" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                                                        </svg>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Monetization Insights */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Ad Blindness Alert */}
                                            {(() => {
                                                const ctr = (parseFloat(adsenseReport.totals?.cells?.[3]?.value || 0) / parseFloat(adsenseReport.totals?.cells?.[1]?.value || 1)) * 100;
                                                const impressions = parseInt(adsenseReport.totals?.cells?.[2]?.value || 0);
                                                
                                                return (
                                                    <div className="p-4 bg-violet-500/5 border border-violet-500/10 rounded-xl relative overflow-hidden group">
                                                        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 blur-2xl rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
                                                        <h4 className="text-sm font-bold text-violet-400 flex items-center gap-2 mb-2">
                                                            <span className="material-symbols-outlined text-base">visibility_off</span>
                                                            Ad Blindness Risk
                                                        </h4>
                                                        {(ctr < 1.0 && impressions > 1000) ? (
                                                            <p className="text-xs text-slate-300 mb-2">Your ad CTR is low (<span className="font-bold text-violet-400">{ctr.toFixed(2)}%</span>). Visitors might be experiencing ad blindness. Consider testing new ad placements.</p>
                                                        ) : (
                                                            <p className="text-xs text-emerald-400 mb-2">Ad engagement is healthy. CTR is stable relative to your page views.</p>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            {/* Revenue Potential */}
                                            {(() => {
                                                const rpm = (parseFloat(adsenseReport.totals?.cells?.[5]?.value || 0) / parseFloat(adsenseReport.totals?.cells?.[1]?.value || 1)) * 1000;

                                                
                                                return (
                                                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/10 rounded-xl relative overflow-hidden group">
                                                        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 blur-2xl rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
                                                        <h4 className="text-sm font-bold text-cyan-400 flex items-center gap-2 mb-2">
                                                            <span className="material-symbols-outlined text-base">trending_up</span>
                                                            Revenue Potential (RPM)
                                                        </h4>
                                                        <p className="text-xs text-slate-300 mb-2">You are earning <span className="font-bold text-cyan-400">₹{rpm.toFixed(2)}</span> per 1,000 page views. Focus on driving organic traffic to high-RPM pages to scale earnings.</p>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}

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
                        {loading && (
                            <GlobalLoader
                                isActive={true}
                                title="Analyzing Competitors with AI..."
                                icon="search_insights"
                                estimatedDuration={45}
                                stages={['Gathering Intel', 'Analyzing Ads', 'Building Report']}
                                currentStage={loading ? 'Analyzing Ads' : ''}
                            />
                        )}

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
                        {loading && (
                            <GlobalLoader
                                isActive={true}
                                title="Building Expert Ad Strategy..."
                                icon="strategy"
                                estimatedDuration={60}
                                stages={['Research Review', 'Channel Allocation', 'Budget Optimization', 'Report Generation']}
                                currentStage={loading ? 'Channel Allocation' : ''}
                            />
                        )}
                        {/* Strategy Health Banner */}
                        {strategyHealth && strategyHealth.health !== null && (
                            <div className={`glass-panel rounded-2xl p-5 border ${
                                strategyHealth.alertLevel === 'excellent' ? 'border-emerald-500/30 bg-emerald-500/[0.04]' :
                                strategyHealth.alertLevel === 'critical' ? 'border-rose-500/30 bg-rose-500/[0.04]' :
                                strategyHealth.alertLevel === 'warning' ? 'border-amber-500/30 bg-amber-500/[0.04]' :
                                'border-cyan-500/20'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black ${
                                            strategyHealth.health >= 80 ? 'bg-emerald-500/15 text-emerald-400' :
                                            strategyHealth.health >= 50 ? 'bg-amber-500/15 text-amber-400' :
                                            'bg-rose-500/15 text-rose-400'
                                        }`}>
                                            {strategyHealth.health}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                Strategy Health
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                                    strategyHealth.alertLevel === 'excellent' ? 'bg-emerald-500/15 text-emerald-400' :
                                                    strategyHealth.alertLevel === 'healthy' ? 'bg-cyan-500/15 text-cyan-400' :
                                                    strategyHealth.alertLevel === 'warning' ? 'bg-amber-500/15 text-amber-400' :
                                                    'bg-rose-500/15 text-rose-400'
                                                }`}>
                                                    {strategyHealth.alertLevel?.toUpperCase()}
                                                </span>
                                            </h3>
                                            <p className="text-xs text-slate-400">{strategyHealth.strategyTitle} • Running {strategyHealth.strategyAge} days • {strategyHealth.campaignsAnalyzed} campaigns</p>
                                        </div>
                                    </div>
                                    {strategyHealth.message && (
                                        <p className="text-xs text-slate-400 max-w-md text-right">{strategyHealth.message}</p>
                                    )}
                                </div>
                                {/* KPI Results */}
                                {strategyHealth.kpiResults?.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                                        {strategyHealth.kpiResults.map((kpi, i) => (
                                            <div key={i} className={`p-2.5 rounded-xl text-center border ${
                                                kpi.status === 'on-track' ? 'border-emerald-500/15 bg-emerald-500/[0.03]' :
                                                kpi.status === 'warning' ? 'border-amber-500/15 bg-amber-500/[0.03]' :
                                                'border-rose-500/15 bg-rose-500/[0.03]'
                                            }`}>
                                                <p className="text-[10px] text-slate-500 uppercase">{kpi.metric}</p>
                                                <p className="text-sm font-bold text-white">{kpi.actual}</p>
                                                <p className="text-[10px] text-slate-500">Target: {kpi.target}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20">
                            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-400">strategy</span>
                                AI Strategy Builder
                            </h2>
                            <p className="text-sm text-slate-400 mb-6">Generate a data-driven performance marketing strategy with Meta vs Google breakout</p>

                            {/* Multi-Goal Selection */}
                            <div className="mb-5">
                                <label className="text-sm text-slate-300 font-medium mb-2 block">Campaign Goals (select multiple)</label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { id: 'awareness', label: 'Brand Awareness', icon: 'visibility' },
                                        { id: 'traffic', label: 'Website Traffic', icon: 'web' },
                                        { id: 'engagement', label: 'Engagement', icon: 'thumb_up' },
                                        { id: 'leads', label: 'Lead Generation', icon: 'contacts' },
                                        { id: 'conversions', label: 'Conversions', icon: 'shopping_cart' },
                                        { id: 'sales', label: 'Sales / ROAS', icon: 'payments' },
                                        { id: 'app_installs', label: 'App Installs', icon: 'install_mobile' },
                                    ].map(goal => {
                                        const isSelected = strategyGoals.includes(goal.id)
                                        return (
                                            <button
                                                key={goal.id}
                                                type="button"
                                                onClick={() => {
                                                    setStrategyGoals(prev =>
                                                        isSelected
                                                            ? prev.filter(g => g !== goal.id)
                                                            : [...prev, goal.id]
                                                    )
                                                }}
                                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border ${
                                                    isSelected
                                                        ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                                        : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-slate-300'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-sm">{goal.icon}</span>
                                                {goal.label}
                                                {isSelected && <span className="material-symbols-outlined text-sm text-cyan-400">check_circle</span>}
                                            </button>
                                        )
                                    })}
                                </div>
                                {strategyGoals.length === 0 && <p className="text-xs text-rose-400 mt-1">Select at least one goal</p>}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Total Budget</label>
                                    <input
                                        type="number"
                                        value={strategyBudget}
                                        onChange={e => setStrategyBudget(e.target.value)}
                                        placeholder="50000"
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-cyan-400/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Currency</label>
                                    <select
                                        value={strategyCurrency}
                                        onChange={e => setStrategyCurrency(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white text-sm outline-none focus:border-cyan-400/50 cursor-pointer"
                                    >
                                        <option value="INR">₹ INR (India)</option>
                                        <option value="AED">د.إ AED (UAE)</option>
                                        <option value="USD">$ USD (US)</option>
                                        <option value="EUR">€ EUR (Europe)</option>
                                        <option value="GBP">£ GBP (UK)</option>
                                        <option value="SAR">﷼ SAR (Saudi)</option>
                                        <option value="SGD">S$ SGD (Singapore)</option>
                                        <option value="AUD">A$ AUD (Australia)</option>
                                    </select>
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
                                <div>
                                    <label className="text-sm text-slate-300 font-medium mb-2 block">Target Location</label>
                                    <input
                                        value={strategyTargetGeo}
                                        onChange={e => setStrategyTargetGeo(e.target.value)}
                                        placeholder="e.g. Dubai, Abu Dhabi"
                                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-cyan-400/50"
                                    />
                                </div>
                            </div>

                            {/* Custom Keywords */}
                            <div className="mb-4">
                                <label className="text-sm text-slate-300 font-medium mb-2 block flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm text-amber-400">key</span>
                                    Keywords to Research (optional)
                                </label>
                                <input
                                    value={strategyCustomKeywords}
                                    onChange={e => setStrategyCustomKeywords(e.target.value)}
                                    placeholder="e.g. bluetooth speakers, wireless earbuds, premium headphones, noise cancelling, audio equipment"
                                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-amber-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-amber-400/50"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">Comma-separated keywords you want included in the strategy. AI will also discover additional keywords.</p>
                            </div>

                            <div className="mb-6">
                                <label className="text-sm text-slate-300 font-medium mb-2 block">Target Audience (optional)</label>
                                <input
                                    value={strategyTargetAudience}
                                    onChange={e => setStrategyTargetAudience(e.target.value)}
                                    placeholder="e.g. Men 25-35, tech enthusiasts, metro cities, HNI"
                                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-cyan-500/20 text-white placeholder-slate-600 text-sm outline-none focus:border-cyan-400/50"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleStrategy}
                                    disabled={loading || strategyGoals.length === 0}
                                    className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:shadow-xl hover:shadow-cyan-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <><span className="material-symbols-outlined animate-spin">progress_activity</span>AI is building expert strategy...</>
                                    ) : (
                                        <><span className="material-symbols-outlined">auto_awesome</span>Generate Expert Strategy</>
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
                                {/* Strategy Action Bar */}
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-cyan-400">strategy</span>
                                        Your Strategy Blueprint
                                    </h2>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                const printWindow = window.open('', '_blank')
                                                const sp = strategyResult.strategyPlan
                                                const curr = strategyCurrency || 'INR'
                                                const sym = { INR: '₹', AED: 'د.إ', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', SGD: 'S$', AUD: 'A$' }[curr] || curr
                                                
                                                // Build keyword table rows
                                                const kwRows = (sp.keywordStrategy?.keywordTable || []).map(kw =>
                                                    `<tr><td>${kw.keyword}</td><td><span class="cat-badge">${kw.category || '-'}</span></td><td class="mono">${kw.cpc || 'N/A'}</td><td class="mono">${kw.volume || 'N/A'}</td><td>${kw.intent || '-'}</td><td>${kw.matchType || '-'}</td><td>${kw.geoRelevance || '-'}</td><td class="pri-${(kw.priority||'').toLowerCase()}">${kw.priority || '-'}</td></tr>`
                                                ).join('')
                                                
                                                // Build competitor rows
                                                const compRows = (sp.competitiveEdge?.competitorAnalysis || []).map(c =>
                                                    `<div class="comp-card"><div><h4>${c.competitor}</h4><p>${c.whatTheyDo}</p></div><div class="weakness"><h5>Weakness</h5><p>${c.theirWeakness}</p></div><div class="advantage"><h5>Our Advantage</h5><p>${c.ourAdvantage}</p>${c.actionItem ? `<p class="action">→ ${c.actionItem}</p>` : ''}</div></div>`
                                                ).join('')
                                                
                                                // Build location cards
                                                const locCards = (sp.locationStrategy?.locationBreakdown || []).map(l =>
                                                    `<div class="loc-card"><h4>${l.location} — ${l.budgetPercent}%</h4><p class="amount">${l.budgetAmount}</p>${l.cpcAdjustment ? `<p class="adj">${l.cpcAdjustment}</p>` : ''}<p class="rationale">${l.rationale}</p></div>`
                                                ).join('')
                                                
                                                const html = `<!DOCTYPE html><html><head><title>Strategy - ${strategyResult.title || 'Performance Marketing'}</title>
                                                <style>
                                                    * { margin: 0; padding: 0; box-sizing: border-box; }
                                                    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; padding: 40px; line-height: 1.6; }
                                                    h1 { font-size: 28px; margin-bottom: 5px; color: #0f0e17; }
                                                    h2 { font-size: 20px; color: #0f0e17; margin: 30px 0 12px; padding-bottom: 6px; border-bottom: 2px solid #e0e0e0; }
                                                    h3 { font-size: 16px; color: #333; margin: 18px 0 8px; }
                                                    h4 { font-size: 14px; color: #444; margin: 0 0 4px; }
                                                    h5 { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 3px; }
                                                    p { font-size: 13px; color: #555; }
                                                    .subtitle { color: #777; font-size: 14px; margin-bottom: 30px; }
                                                    .meta-bar { display: flex; gap: 20px; margin-bottom: 25px; padding: 12px 16px; background: #f5f5f5; border-radius: 8px; }
                                                    .meta-bar span { font-size: 12px; color: #666; }
                                                    .meta-bar strong { color: #222; }
                                                    .goal-card { padding: 12px 16px; border-left: 3px solid #10b981; background: #f0fdf4; margin-bottom: 8px; border-radius: 0 6px 6px 0; }
                                                    .goal-card .conf { float: right; font-weight: 800; }
                                                    .goal-card .conf.high { color: #10b981; }
                                                    .goal-card .conf.med { color: #f59e0b; }
                                                    .goal-card .conf.low { color: #ef4444; }
                                                    .goal-card .baseline { font-size: 11px; color: #888; }
                                                    .goal-card .planb { font-size: 11px; color: #b45309; background: #fffbeb; padding: 4px 8px; margin-top: 6px; border-radius: 4px; }
                                                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 10px 0 20px; }
                                                    th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; }
                                                    td { padding: 6px 10px; border-bottom: 1px solid #eee; }
                                                    td.mono { font-family: monospace; }
                                                    .cat-badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 10px; background: #e2e8f0; }
                                                    .pri-critical { color: #ef4444; font-weight: 700; }
                                                    .pri-high { color: #f59e0b; font-weight: 700; }
                                                    .pri-medium { color: #06b6d4; }
                                                    .pri-test { color: #94a3b8; }
                                                    .comp-card { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 14px; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 10px; }
                                                    .comp-card .weakness h5 { color: #ef4444; }
                                                    .comp-card .advantage h5 { color: #10b981; }
                                                    .comp-card .action { color: #06b6d4; font-size: 11px; margin-top: 4px; }
                                                    .loc-card { display: inline-block; width: 30%; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; margin: 0 1.5% 10px 0; vertical-align: top; }
                                                    .loc-card .amount { font-family: monospace; color: #10b981; font-weight: 700; }
                                                    .loc-card .adj { font-size: 11px; color: #f59e0b; }
                                                    .loc-card .rationale { font-size: 11px; color: #888; }
                                                    .audit-score { display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 12px; font-size: 22px; font-weight: 900; margin-right: 16px; }
                                                    .audit-score.high { background: #d1fae5; color: #10b981; }
                                                    .audit-score.med { background: #fef3c7; color: #f59e0b; }
                                                    .audit-score.low { background: #fee2e2; color: #ef4444; }
                                                    .platform-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
                                                    .platform-card { padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; }
                                                    .platform-card h3 { margin-top: 0; }
                                                    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 11px; color: #aaa; text-align: center; }
                                                    @media print { body { padding: 20px; } .no-print { display: none; } }
                                                </style></head><body>
                                                <div class="no-print" style="margin-bottom:20px"><button onclick="window.print()" style="padding:10px 24px;background:#0ea5e9;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">📥 Download as PDF</button></div>
                                                <h1>${strategyResult.title || 'Performance Marketing Strategy'}</h1>
                                                <p class="subtitle">Generated by Mantram AI • ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                                <div class="meta-bar">
                                                    <span>Budget: <strong>${sym}${strategyResult.strategyPlan.platformBreakout?.meta?.budgetAmount ? (Number(String(strategyResult.strategyPlan.platformBreakout.meta.budgetAmount).replace(/[^\d]/g,'')) + Number(String(strategyResult.strategyPlan.platformBreakout.google?.budgetAmount || '0').replace(/[^\d]/g,''))).toLocaleString() : (strategyBudget || '50,000')}</strong></span>
                                                    <span>Currency: <strong>${curr}</strong></span>
                                                    <span>Duration: <strong>${strategyDuration}</strong></span>
                                                    <span>Location: <strong>${strategyTargetGeo || 'Not specified'}</strong></span>
                                                </div>
                                                
                                                <h2>🎯 Campaign Goals</h2>
                                                ${(sp.goals || []).map(g => {
                                                    const goal = typeof g === 'string' ? { goal: g } : g
                                                    const c = goal.confidenceScore || 5
                                                    return `<div class="goal-card"><span class="conf ${c >= 7 ? 'high' : c >= 5 ? 'med' : 'low'}">${c}/10</span><strong>${goal.goal}</strong>${goal.currentBaseline || goal.target ? `<br/><span class="baseline">${goal.currentBaseline || ''} → ${goal.target || ''} (${goal.timeframe || ''})</span>` : ''}${goal.planB ? `<div class="planb">Plan B: ${goal.planB}</div>` : ''}</div>`
                                                }).join('')}
                                                
                                                ${sp.platformBreakout ? `<h2>📊 Platform Breakout</h2><div class="platform-grid">${sp.platformBreakout.meta ? `<div class="platform-card"><h3>Meta (${sp.platformBreakout.meta.budgetPercent || 0}% — ${sp.platformBreakout.meta.budgetAmount || ''})</h3><p>${sp.platformBreakout.meta.rationale || ''}</p>` + (sp.platformBreakout.meta.campaigns || []).map(c => `<p>• <strong>${c.name}</strong>: ${c.objective} — ${c.dailyBudget}/day</p>`).join('') + '</div>' : ''}${sp.platformBreakout.google ? `<div class="platform-card"><h3>Google (${sp.platformBreakout.google.budgetPercent || 0}% — ${sp.platformBreakout.google.budgetAmount || ''})</h3><p>${sp.platformBreakout.google.rationale || ''}</p>` + (sp.platformBreakout.google.campaigns || []).map(c => `<p>• <strong>${c.name}</strong>: ${c.objective} — ${c.dailyBudget}/day</p>`).join('') + '</div>' : ''}</div>` : ''}
                                                
                                                ${kwRows ? `<h2>🔑 Keyword Strategy (${(sp.keywordStrategy?.keywordTable || []).length} keywords)</h2><table><thead><tr><th>Keyword</th><th>Category</th><th>CPC</th><th>Volume</th><th>Intent</th><th>Match</th><th>Geo</th><th>Priority</th></tr></thead><tbody>${kwRows}</tbody></table>` : ''}
                                                
                                                ${compRows ? `<h2>⚔️ Competitive Edge</h2>${compRows}` : ''}
                                                
                                                ${locCards ? `<h2>📍 Location Strategy</h2>${locCards}` : ''}
                                                
                                                ${sp.achievabilityAudit ? `<h2>✅ Achievability Audit</h2><div style="display:flex;align-items:center;margin-bottom:16px"><div class="audit-score ${sp.achievabilityAudit.overallScore >= 7 ? 'high' : sp.achievabilityAudit.overallScore >= 5 ? 'med' : 'low'}">${sp.achievabilityAudit.overallScore}/10</div><div><strong>Implementation Confidence</strong><br/><span style="font-size:12px;color:#666">${sp.achievabilityAudit.overallAssessment || ''}</span></div></div>` : ''}
                                                
                                                <div class="footer">Generated by Mantram AI — Performance Marketing Studio</div>
                                                </body></html>`
                                                printWindow.document.write(html)
                                                printWindow.document.close()
                                            }}
                                            className="px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.08] text-slate-300 text-xs font-medium hover:bg-white/[0.1] transition-all flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                                            Download PDF
                                        </button>
                                        <button
                                            onClick={() => setShowStrategyPresentation(true)}
                                            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600/80 to-indigo-600/80 text-white text-xs font-medium hover:shadow-lg hover:shadow-violet-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <span className="material-symbols-outlined text-sm">slideshow</span>
                                            Present Strategy
                                        </button>
                                    </div>
                                </div>
                                {/* Goals with Confidence Scores */}
                                {strategyResult.strategyPlan.goals?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400">flag</span>
                                            Campaign Goals
                                        </h3>
                                        <div className="space-y-3">
                                            {strategyResult.strategyPlan.goals.map((g, i) => {
                                                const goal = typeof g === 'string' ? { goal: g } : g
                                                const conf = goal.confidenceScore || 5
                                                return (
                                                    <div key={i} className="p-4 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="text-emerald-400 font-bold text-sm">{i + 1}</span>
                                                                    <p className="text-sm font-medium text-white">{goal.goal}</p>
                                                                </div>
                                                                {(goal.currentBaseline || goal.target) && (
                                                                    <p className="text-xs text-slate-400 ml-6">
                                                                        {goal.currentBaseline && <span>Baseline: {goal.currentBaseline}</span>}
                                                                        {goal.target && <span> → Target: <span className="text-emerald-300 font-medium">{goal.target}</span></span>}
                                                                        {goal.timeframe && <span className="text-slate-500"> ({goal.timeframe})</span>}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {/* Confidence Score */}
                                                            <div className="text-center min-w-[50px]">
                                                                <div className={`text-lg font-black ${
                                                                    conf >= 7 ? 'text-emerald-400' : conf >= 5 ? 'text-amber-400' : 'text-rose-400'
                                                                }`}>{conf}/10</div>
                                                                <p className="text-[9px] text-slate-500 uppercase">Confidence</p>
                                                            </div>
                                                        </div>
                                                        {/* Confidence Bar */}
                                                        <div className="mt-2 ml-6">
                                                            <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                                                <div className={`h-full rounded-full transition-all ${
                                                                    conf >= 7 ? 'bg-emerald-500' : conf >= 5 ? 'bg-amber-500' : 'bg-rose-500'
                                                                }`} style={{ width: `${conf * 10}%` }} />
                                                            </div>
                                                        </div>
                                                        {goal.confidenceReason && <p className="text-[11px] text-slate-500 mt-1.5 ml-6">{goal.confidenceReason}</p>}
                                                        {goal.riskFactors?.length > 0 && (
                                                            <div className="mt-2 ml-6 flex flex-wrap gap-1.5">
                                                                {goal.riskFactors.map((r, j) => (
                                                                    <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/15">⚠ {r}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {goal.planB && (
                                                            <div className="mt-2 ml-6 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                                                <p className="text-[10px] text-amber-500 uppercase font-medium">Plan B</p>
                                                                <p className="text-xs text-slate-400">{goal.planB}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
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

                                {/* ═══ PLATFORM BREAKOUT: Meta vs Google ═══ */}
                                {strategyResult.strategyPlan.platformBreakout && (strategyResult.strategyPlan.platformBreakout.meta || strategyResult.strategyPlan.platformBreakout.google) && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-orange-400">compare</span>
                                            Platform Spend Breakout — Meta vs Google
                                        </h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                            {/* Meta Card */}
                                            {strategyResult.strategyPlan.platformBreakout.meta && (() => {
                                                const meta = strategyResult.strategyPlan.platformBreakout.meta
                                                return (
                                                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-5">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                                                <span className="material-symbols-outlined text-blue-400 text-lg">campaign</span>
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-white">Meta Ads</h4>
                                                                <p className="text-xs text-blue-400">{meta.budgetPercent}% of budget • {meta.budgetAmount || ''}</p>
                                                            </div>
                                                        </div>

                                                        {/* Expected Metrics */}
                                                        {meta.expectedMetrics && (
                                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                                {Object.entries(meta.expectedMetrics).map(([key, val]) => (
                                                                    <div key={key} className="p-2 rounded-lg bg-black/20 text-center">
                                                                        <p className="text-[10px] text-slate-500 uppercase">{key}</p>
                                                                        <p className="text-sm font-bold text-white">{typeof val === 'object' ? JSON.stringify(val) : val}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Projections */}
                                                        {meta.projections && Object.keys(meta.projections).length > 0 && (
                                                            <div className="mb-3">
                                                                <p className="text-xs text-slate-400 font-medium mb-1.5">📊 Projections (math-backed)</p>
                                                                <div className="grid grid-cols-2 gap-1.5">
                                                                    {Object.entries(meta.projections).map(([key, val]) => (
                                                                        <div key={key} className="flex justify-between text-xs p-1.5 rounded bg-black/10">
                                                                            <span className="text-slate-500">{key}</span>
                                                                            <span className="text-blue-300 font-medium">{typeof val === 'object' ? JSON.stringify(val) : val}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Campaigns */}
                                                        {meta.campaigns?.length > 0 && (
                                                            <div className="mb-3">
                                                                <p className="text-xs text-slate-400 font-medium mb-1.5">📋 Campaigns</p>
                                                                {meta.campaigns.map((c, i) => (
                                                                    <div key={i} className="flex justify-between text-xs py-1.5 border-b border-white/[0.04] last:border-0">
                                                                        <span className="text-white font-medium">{c.name}</span>
                                                                        <span className="text-slate-400">{c.dailyBudget || c.format || ''}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Creative Formats */}
                                                        {meta.creativeFormats?.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mb-2">
                                                                {meta.creativeFormats.map((f, i) => (
                                                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">{f}</span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {meta.rationale && <p className="text-xs text-slate-500 italic">{meta.rationale}</p>}
                                                    </div>
                                                )
                                            })()}

                                            {/* Google Card */}
                                            {strategyResult.strategyPlan.platformBreakout.google && (() => {
                                                const google = strategyResult.strategyPlan.platformBreakout.google
                                                return (
                                                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                                <span className="material-symbols-outlined text-emerald-400 text-lg">search</span>
                                                            </div>
                                                            <div>
                                                                <h4 className="text-sm font-bold text-white">Google Ads</h4>
                                                                <p className="text-xs text-emerald-400">{google.budgetPercent}% of budget • {google.budgetAmount || ''}</p>
                                                            </div>
                                                        </div>

                                                        {/* Expected Metrics */}
                                                        {google.expectedMetrics && (
                                                            <div className="grid grid-cols-2 gap-2 mb-3">
                                                                {Object.entries(google.expectedMetrics).map(([key, val]) => (
                                                                    <div key={key} className="p-2 rounded-lg bg-black/20 text-center">
                                                                        <p className="text-[10px] text-slate-500 uppercase">{key}</p>
                                                                        <p className="text-sm font-bold text-white">{typeof val === 'object' ? JSON.stringify(val) : val}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Projections */}
                                                        {google.projections && Object.keys(google.projections).length > 0 && (
                                                            <div className="mb-3">
                                                                <p className="text-xs text-slate-400 font-medium mb-1.5">📊 Projections (math-backed)</p>
                                                                <div className="grid grid-cols-2 gap-1.5">
                                                                    {Object.entries(google.projections).map(([key, val]) => (
                                                                        <div key={key} className="flex justify-between text-xs p-1.5 rounded bg-black/10">
                                                                            <span className="text-slate-500">{key}</span>
                                                                            <span className="text-emerald-300 font-medium">{typeof val === 'object' ? JSON.stringify(val) : val}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Campaigns */}
                                                        {google.campaigns?.length > 0 && (
                                                            <div className="mb-3">
                                                                <p className="text-xs text-slate-400 font-medium mb-1.5">📋 Campaigns</p>
                                                                {google.campaigns.map((c, i) => (
                                                                    <div key={i} className="flex justify-between text-xs py-1.5 border-b border-white/[0.04] last:border-0">
                                                                        <span className="text-white font-medium">{c.name}</span>
                                                                        <span className="text-slate-400">{c.dailyBudget || c.campaignType || ''}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Keyword Plan */}
                                                        {google.keywordPlan?.length > 0 && (
                                                            <div className="mb-3">
                                                                <p className="text-xs text-slate-400 font-medium mb-1.5">🔑 Keyword Plan</p>
                                                                <div className="space-y-1">
                                                                    {google.keywordPlan.slice(0, 6).map((kw, i) => (
                                                                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-white/[0.04] last:border-0">
                                                                            <span className="text-white font-medium flex-1 truncate">{kw.keyword}</span>
                                                                            <span className="text-emerald-300 ml-2">CPC: {kw.estimatedCpc || kw.cpc || 'N/A'}</span>
                                                                            <span className="text-slate-400 ml-2">{kw.monthlyVolume || kw.volume || ''}/mo</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {google.biddingStrategy && (
                                                            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 mb-2">
                                                                <p className="text-[10px] text-slate-500 uppercase mb-0.5">Bidding Strategy</p>
                                                                <p className="text-xs text-emerald-300">{google.biddingStrategy}</p>
                                                            </div>
                                                        )}

                                                        {google.rationale && <p className="text-xs text-slate-500 italic">{google.rationale}</p>}
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* ═══ KEYWORD STRATEGY (Detailed Table) ═══ */}
                                {strategyResult.strategyPlan.keywordStrategy && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-400">key</span>
                                            Keyword Strategy
                                        </h3>

                                        {/* Keyword Table */}
                                        {strategyResult.strategyPlan.keywordStrategy.keywordTable?.length > 0 && (
                                            <div className="overflow-x-auto mb-4">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="border-b border-white/[0.08]">
                                                            <th className="text-left py-2 pr-3 text-slate-400 font-medium">Keyword</th>
                                                            <th className="text-left py-2 px-2 text-slate-400 font-medium">Category</th>
                                                            <th className="text-right py-2 px-2 text-slate-400 font-medium">CPC</th>
                                                            <th className="text-right py-2 px-2 text-slate-400 font-medium">Volume</th>
                                                            <th className="text-center py-2 px-2 text-slate-400 font-medium">Intent</th>
                                                            <th className="text-center py-2 px-2 text-slate-400 font-medium">Match</th>
                                                            <th className="text-left py-2 px-2 text-slate-400 font-medium">Geo</th>
                                                            <th className="text-center py-2 pl-2 text-slate-400 font-medium">Priority</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {strategyResult.strategyPlan.keywordStrategy.keywordTable.map((kw, i) => {
                                                            const catColor = {
                                                                'Branded': 'bg-violet-500/15 text-violet-400',
                                                                'Generic-High Intent': 'bg-cyan-500/15 text-cyan-400',
                                                                'Long-tail': 'bg-teal-500/15 text-teal-400',
                                                                'Competitor': 'bg-rose-500/15 text-rose-400',
                                                                'Vernacular': 'bg-amber-500/15 text-amber-400',
                                                            }[kw.category] || 'bg-white/[0.06] text-slate-400'
                                                            const priColor = {
                                                                'Critical': 'text-rose-400',
                                                                'High': 'text-amber-400',
                                                                'Medium': 'text-cyan-400',
                                                                'Test': 'text-slate-500',
                                                            }[kw.priority] || 'text-slate-400'
                                                            return (
                                                                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                                                    <td className="py-2 pr-3 text-white font-medium">{kw.keyword}</td>
                                                                    <td className="py-2 px-2"><span className={`px-1.5 py-0.5 rounded-full text-[10px] ${catColor}`}>{kw.category}</span></td>
                                                                    <td className="py-2 px-2 text-right text-emerald-300 font-mono">{kw.cpc || 'N/A'}</td>
                                                                    <td className="py-2 px-2 text-right text-slate-300 font-mono">{kw.volume || 'N/A'}</td>
                                                                    <td className="py-2 px-2 text-center"><span className="text-[10px] text-slate-400">{kw.intent || '-'}</span></td>
                                                                    <td className="py-2 px-2 text-center"><span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300">{kw.matchType || '-'}</span></td>
                                                                    <td className="py-2 px-2 text-slate-400 text-[10px]">{kw.geoRelevance || '-'}</td>
                                                                    <td className={`py-2 pl-2 text-center font-medium ${priColor}`}>{kw.priority || '-'}</td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Category Breakdown */}
                                        {strategyResult.strategyPlan.keywordStrategy.categoryBreakdown && (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                                {Object.entries(strategyResult.strategyPlan.keywordStrategy.categoryBreakdown).map(([cat, data]) => (
                                                    <div key={cat} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                                        <p className="text-[10px] text-slate-500 uppercase mb-1">{cat.replace(/([A-Z])/g, ' $1')}</p>
                                                        <p className="text-sm font-bold text-white">{typeof data === 'object' ? data.totalBudget || data.count : data}</p>
                                                        {data.expectedClicks && <p className="text-[10px] text-slate-400">{data.expectedClicks} expected clicks</p>}
                                                        {data.strategy && <p className="text-[10px] text-cyan-400/60 mt-1">{data.strategy}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Legacy: mustTarget/avoid fallback */}
                                        {!strategyResult.strategyPlan.keywordStrategy.keywordTable && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {strategyResult.strategyPlan.keywordStrategy.mustTarget?.length > 0 && (
                                                    <div>
                                                        <p className="text-xs font-medium text-emerald-400 mb-2">Must Target</p>
                                                        <div className="space-y-1.5">
                                                            {strategyResult.strategyPlan.keywordStrategy.mustTarget.map((kw, i) => (
                                                                <div key={i} className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                                                    <div className="flex justify-between">
                                                                        <span className="text-xs text-white font-medium">{kw.keyword}</span>
                                                                        <span className="text-xs text-emerald-300">CPC: {kw.cpc || 'N/A'}</span>
                                                                    </div>
                                                                    {kw.reason && <p className="text-[10px] text-slate-500 mt-0.5">{kw.reason}</p>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {strategyResult.strategyPlan.keywordStrategy.avoid?.length > 0 && (
                                                    <div>
                                                        <p className="text-xs font-medium text-rose-400 mb-2">Avoid</p>
                                                        <div className="space-y-1.5">
                                                            {strategyResult.strategyPlan.keywordStrategy.avoid.map((kw, i) => (
                                                                <div key={i} className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/10">
                                                                    <span className="text-xs text-white font-medium">{kw.keyword}</span>
                                                                    {kw.reason && <p className="text-[10px] text-slate-500 mt-0.5">{kw.reason}</p>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Negative Keywords */}
                                        {strategyResult.strategyPlan.keywordStrategy.negativeKeywords?.length > 0 && (
                                            <div className="mt-3">
                                                <p className="text-xs font-medium text-slate-400 mb-1.5">Negative Keywords</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {strategyResult.strategyPlan.keywordStrategy.negativeKeywords.map((kw, i) => (
                                                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-400 border border-white/[0.06]">-{kw}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {(strategyResult.strategyPlan.keywordStrategy.matchTypes || strategyResult.strategyPlan.keywordStrategy.matchTypeStrategy) && (
                                            <p className="text-xs text-slate-500 mt-3 italic">{strategyResult.strategyPlan.keywordStrategy.matchTypeStrategy || strategyResult.strategyPlan.keywordStrategy.matchTypes}</p>
                                        )}
                                    </div>
                                )}

                                {/* ═══ COMPETITIVE EDGE ═══ */}
                                {strategyResult.strategyPlan.competitiveEdge && (
                                    <div className="glass-panel rounded-2xl p-6 border border-rose-500/15">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-rose-400">swords</span>
                                            Competitive Edge Analysis
                                        </h3>
                                        {/* Competitor Cards */}
                                        {strategyResult.strategyPlan.competitiveEdge.competitorAnalysis?.length > 0 && (
                                            <div className="space-y-3 mb-4">
                                                {strategyResult.strategyPlan.competitiveEdge.competitorAnalysis.map((comp, i) => (
                                                    <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                        <div>
                                                            <p className="text-[10px] text-slate-500 uppercase mb-1">🏢 {comp.competitor}</p>
                                                            <p className="text-xs text-slate-300">{comp.whatTheyDo}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-rose-400 uppercase mb-1">Their Weakness</p>
                                                            <p className="text-xs text-slate-300">{comp.theirWeakness}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-emerald-400 uppercase mb-1">Our Advantage</p>
                                                            <p className="text-xs text-white font-medium">{comp.ourAdvantage}</p>
                                                            {comp.actionItem && <p className="text-[10px] text-cyan-400 mt-1">→ {comp.actionItem}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Market Gaps & Differentiators */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {strategyResult.strategyPlan.competitiveEdge.uniqueAngles?.length > 0 && (
                                                <div className="p-3 rounded-xl bg-white/[0.02]">
                                                    <p className="text-[10px] text-violet-400 uppercase mb-1.5">Unique Angles</p>
                                                    {strategyResult.strategyPlan.competitiveEdge.uniqueAngles.map((a, i) => (
                                                        <p key={i} className="text-xs text-slate-300 mb-1">• {a}</p>
                                                    ))}
                                                </div>
                                            )}
                                            {strategyResult.strategyPlan.competitiveEdge.marketGaps?.length > 0 && (
                                                <div className="p-3 rounded-xl bg-white/[0.02]">
                                                    <p className="text-[10px] text-amber-400 uppercase mb-1.5">Market Gaps</p>
                                                    {strategyResult.strategyPlan.competitiveEdge.marketGaps.map((g, i) => (
                                                        <p key={i} className="text-xs text-slate-300 mb-1">• {g}</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ═══ LOCATION STRATEGY ═══ */}
                                {strategyResult.strategyPlan.locationStrategy && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-teal-400">location_on</span>
                                            Location Strategy
                                        </h3>
                                        {strategyResult.strategyPlan.locationStrategy.locationBreakdown?.length > 0 && (
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                                                {strategyResult.strategyPlan.locationStrategy.locationBreakdown.map((loc, i) => (
                                                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-teal-500/10">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-sm font-bold text-white">{loc.location}</span>
                                                            <span className="text-sm font-bold text-teal-400">{loc.budgetPercent}%</span>
                                                        </div>
                                                        <p className="text-xs text-emerald-300 font-mono mb-1">{loc.budgetAmount}</p>
                                                        {loc.cpcAdjustment && <p className="text-[10px] text-amber-400 mb-1">{loc.cpcAdjustment}</p>}
                                                        <p className="text-[10px] text-slate-500">{loc.rationale}</p>
                                                        {loc.keywordsForLocation?.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {loc.keywordsForLocation.map((kw, j) => (
                                                                    <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400">{kw}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {strategyResult.strategyPlan.locationStrategy.geoTargetingStrategy && (
                                            <p className="text-xs text-slate-400 italic">{strategyResult.strategyPlan.locationStrategy.geoTargetingStrategy}</p>
                                        )}
                                        {strategyResult.strategyPlan.locationStrategy.exclusions?.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                <span className="text-[10px] text-rose-400 mr-1">Exclude:</span>
                                                {strategyResult.strategyPlan.locationStrategy.exclusions.map((e, i) => (
                                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400">{e}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ═══ ACHIEVABILITY AUDIT ═══ */}
                                {strategyResult.strategyPlan.achievabilityAudit && (
                                    <div className="glass-panel rounded-2xl p-6 border border-violet-500/15">
                                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-violet-400">verified</span>
                                            Achievability Audit
                                        </h3>
                                        {/* Overall Score */}
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${
                                                strategyResult.strategyPlan.achievabilityAudit.overallScore >= 7 ? 'bg-emerald-500/15 text-emerald-400' :
                                                strategyResult.strategyPlan.achievabilityAudit.overallScore >= 5 ? 'bg-amber-500/15 text-amber-400' :
                                                'bg-rose-500/15 text-rose-400'
                                            }`}>
                                                {strategyResult.strategyPlan.achievabilityAudit.overallScore}/10
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-white">Implementation Confidence</p>
                                                <p className="text-xs text-slate-400">{strategyResult.strategyPlan.achievabilityAudit.overallAssessment}</p>
                                            </div>
                                        </div>
                                        {/* Per-Goal Confidence */}
                                        {strategyResult.strategyPlan.achievabilityAudit.perGoalConfidence?.length > 0 && (
                                            <div className="space-y-2 mb-4">
                                                {strategyResult.strategyPlan.achievabilityAudit.perGoalConfidence.map((pgc, i) => (
                                                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02]">
                                                        <div className={`text-sm font-bold min-w-[35px] text-center ${
                                                            pgc.score >= 7 ? 'text-emerald-400' : pgc.score >= 5 ? 'text-amber-400' : 'text-rose-400'
                                                        }`}>{pgc.score}/10</div>
                                                        <div className="flex-1">
                                                            <p className="text-xs text-white">{pgc.goal}</p>
                                                            <p className="text-[10px] text-slate-500">{pgc.reasoning}</p>
                                                        </div>
                                                        {pgc.risk && <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 whitespace-nowrap">⚠ {pgc.risk}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Assumptions & Prerequisites */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {strategyResult.strategyPlan.achievabilityAudit.assumptions?.length > 0 && (
                                                <div className="p-3 rounded-xl bg-white/[0.02]">
                                                    <p className="text-[10px] text-amber-400 uppercase mb-1.5">Key Assumptions</p>
                                                    {strategyResult.strategyPlan.achievabilityAudit.assumptions.map((a, i) => (
                                                        <p key={i} className="text-xs text-slate-300 mb-1">• {a}</p>
                                                    ))}
                                                </div>
                                            )}
                                            {strategyResult.strategyPlan.achievabilityAudit.prerequisites?.length > 0 && (
                                                <div className="p-3 rounded-xl bg-white/[0.02]">
                                                    <p className="text-[10px] text-violet-400 uppercase mb-1.5">Prerequisites</p>
                                                    {strategyResult.strategyPlan.achievabilityAudit.prerequisites.map((p, i) => (
                                                        <p key={i} className="text-xs text-slate-300 mb-1">• {p}</p>
                                                    ))}
                                                </div>
                                            )}
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
                                    } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
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


// ═══════════════════════════════════════════════════════════════
// PERFORMANCE MARKETING — Help Documentation View
// ═══════════════════════════════════════════════════════════════
const PM_HELP_SECTIONS = [
    {
        id: 'getting-started',
        icon: 'rocket_launch',
        color: '#8b5cf6',
        title: 'Getting Started',
        subtitle: 'Understand Performance Marketing Studio',
        steps: [
            { icon: 'campaign', title: 'What is PM Studio?', description: 'Performance Marketing Studio is your AI-powered advertising command center. It handles competitor research, strategy generation, campaign creation, A/B testing, and performance analysis — all from one place.' },
            { icon: 'link', title: 'Connect Platforms', description: 'Connect Meta Ads and Google Ads from the Dashboard tab. Platform connections enable real campaign management and performance tracking.' },
            { icon: 'space_dashboard', title: 'Dashboard Overview', description: 'The Dashboard tab shows overall performance metrics (Total Spend, Impressions, Clicks, CTR, ROAS), platform connection status, and quick actions.' },
        ]
    },
    {
        id: 'research',
        icon: 'search_insights',
        color: '#3b82f6',
        title: 'Research',
        subtitle: 'AI-powered competitor and market research',
        steps: [
            { icon: 'search', title: 'Research Query', description: 'Enter a research focus (e.g., "Instagram ads for fitness brands") and list competitors. The AI analyzes competitor strategies, ad creatives, targeting patterns, and budget estimates.' },
            { icon: 'trending_up', title: 'Trend Data', description: 'Research results include trend data: market movements, seasonal patterns, and emerging opportunities in your category.' },
            { icon: 'auto_awesome', title: 'Grok AI Trends', description: 'The Dashboard shows Grok-powered trending topics, SEO keywords, and content ideas relevant to your brand. Updated in real-time from X/Twitter trends.' },
            { icon: 'summarize', title: 'Saved Reports', description: 'Research and strategy results are automatically saved as reports. Access them from the Reports tab to reference past insights.' },
        ]
    },
    {
        id: 'strategy',
        icon: 'strategy',
        color: '#10b981',
        title: 'Strategy Generation',
        subtitle: 'AI-generated marketing strategies',
        steps: [
            { icon: 'target', title: 'Set Objective', description: 'Choose your campaign objective: Traffic, Conversions, Brand Awareness, Engagement, or App Installs. Each objective shapes the AI\'s strategy differently.' },
            { icon: 'payments', title: 'Budget & Duration', description: 'Specify your budget and campaign duration (7, 14, 30, 60, or 90 days). The AI distributes budget across platforms and campaigns optimally.' },
            { icon: 'auto_awesome', title: 'AI Strategy', description: 'The AI generates a complete strategy: audience targeting, platform mix, budget allocation, creative direction, bidding strategy, and expected outcomes. Based on your brand DNA and research data.' },
            { icon: 'edit', title: 'Customize & Iterate', description: 'Review the generated strategy. Run new strategies with different objectives or budgets to compare approaches. Each strategy builds on previous research.' },
        ]
    },
    {
        id: 'campaigns',
        icon: 'campaign',
        color: '#f59e0b',
        title: 'Campaigns',
        subtitle: 'Manage ad campaigns across platforms',
        steps: [
            { icon: 'add_circle', title: 'Create Campaign', description: 'Create campaigns manually or from a strategy recommendation. Fill in campaign name, platform (Meta/Google), objective, budget, and targeting details.' },
            { icon: 'play_arrow', title: 'Launch & Monitor', description: 'Launch campaigns to your connected platforms. Monitor performance in real-time: spend, impressions, clicks, CTR, conversions, and ROAS.' },
            { icon: 'pause', title: 'Manage State', description: 'Pause, resume, or stop campaigns. View campaign status (Active, Paused, Draft, Completed) and make adjustments based on performance.' },
            { icon: 'bar_chart', title: 'Performance Cards', description: 'Each campaign has a performance card showing key metrics. Color-coded ROAS indicators: Green (profitable), Amber (break-even), Red (unprofitable).' },
        ]
    },
    {
        id: 'ab-tests',
        icon: 'science',
        color: '#ec4899',
        title: 'A/B Testing',
        subtitle: 'Test variations to optimize performance',
        steps: [
            { icon: 'compare', title: 'Create Tests', description: 'Set up A/B tests to compare different ad creatives, copy, targeting, or landing pages. The system tracks which variation performs better.' },
            { icon: 'analytics', title: 'Statistical Significance', description: 'Tests run until statistically significant results are achieved. The AI declares a winner and provides insights on why one variation outperformed.' },
            { icon: 'auto_awesome', title: 'AI Recommendations', description: 'Based on test results, the AI suggests optimizations: scale the winner, test new variations, or adjust targeting.' },
        ]
    },
    {
        id: 'learnings',
        icon: 'psychology',
        color: '#06b6d4',
        title: 'Learnings',
        subtitle: 'AI-compiled insights from your campaigns',
        steps: [
            { icon: 'school', title: 'Automatic Learning', description: 'The AI analyzes all your campaigns, tests, and strategies to extract actionable learnings. What works for your brand, what doesn\'t, and why.' },
            { icon: 'lightbulb', title: 'Pattern Detection', description: 'Identifies patterns across campaigns: best performing platforms, optimal budgets, winning audience segments, and seasonal trends.' },
            { icon: 'trending_up', title: 'Improvement Tracking', description: 'Track how your performance marketing improves over time. The learnings feed back into new strategy generation.' },
        ]
    },
    {
        id: 'ad-creative',
        icon: 'image',
        color: '#f43f5e',
        title: 'AI Ad Creative',
        subtitle: 'Generate ad images with AI',
        steps: [
            { icon: 'auto_awesome', title: 'Prompt-Based Generation', description: 'Enter a description of the ad image you want. Example: "Minimalist product shot of a fitness tracker on a marble surface with warm lighting."' },
            { icon: 'image', title: 'AI-Generated Images', description: 'The AI generates high-quality ad images based on your prompt. Download and use them directly in your Meta or Google ad campaigns.' },
            { icon: 'palette', title: 'Brand Consistency', description: 'The generator considers your brand DNA to ensure generated images align with your brand\'s visual identity and tone.' },
        ]
    },
]

const PM_PRO_TIPS = [
    { icon: '🔍', tip: 'Always start with Research before creating a Strategy. Research data makes strategies 10x more effective.' },
    { icon: '🎯', tip: 'Match your campaign objective to your business goal. Traffic ≠ Conversions ≠ Brand Awareness.' },
    { icon: '🧪', tip: 'Run A/B tests on everything. Small improvements in CTR compound into massive ROAS gains.' },
    { icon: '📊', tip: 'Check Grok trends daily. Being first to trend-jack gives you 3x cheaper CPMs.' },
    { icon: '🧠', tip: 'Review Learnings before creating new campaigns. Your past data is your biggest competitive advantage.' },
    { icon: '🖼️', tip: 'Use AI Ad Creative to generate multiple variations quickly, then A/B test the best ones.' },
]

function PMHelpView({ onBack }) {
    const [expanded, setExpanded] = useState('getting-started')
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="size-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-slate-400">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">menu_book</span> Performance Marketing Guide
                        </h2>
                        <p className="text-sm text-slate-500">Master AI-powered ad strategies, campaigns, and optimization</p>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 mb-6" style={{ background: 'linear-gradient(135deg, #8b5cf608, #3b82f608, #10b98108)' }}>
                <h3 className="text-white font-bold mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary">info</span> What is Performance Marketing Studio?</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                    Performance Marketing Studio is your <strong className="text-white">AI advertising command center</strong>.
                    Run <strong className="text-white">competitor research</strong>, generate <strong className="text-white">AI strategies</strong>,
                    create and manage <strong className="text-white">campaigns on Meta & Google</strong>,
                    <strong className="text-white"> A/B test</strong> variations, and track <strong className="text-white">learnings</strong> —
                    all powered by AI with your brand context. Plus <strong className="text-white">Grok-powered real-time trends</strong>.
                </p>
                <div className="flex flex-wrap gap-2">
                    {['Research', 'Strategy', 'Campaigns', 'A/B Tests', 'Learnings', 'Reports', 'Ad Creative', 'Grok Trends'].map(t => (
                        <span key={t} className="px-3 py-1 rounded-full text-xs font-bold bg-white/[0.04] border border-white/[0.06] text-slate-400">{t}</span>
                    ))}
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 mb-6">
                <h3 className="text-white font-bold mb-4 text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400 text-lg">account_tree</span> Typical Workflow
                </h3>
                <div className="flex items-center gap-0 overflow-x-auto pb-2">
                    {[
                        { label: 'Research', icon: 'search_insights', color: '#3b82f6' },
                        { label: 'Strategy', icon: 'strategy', color: '#10b981' },
                        { label: 'Create Ads', icon: 'image', color: '#f43f5e' },
                        { label: 'Launch', icon: 'campaign', color: '#f59e0b' },
                        { label: 'A/B Test', icon: 'science', color: '#ec4899' },
                        { label: 'Optimize', icon: 'trending_up', color: '#8b5cf6' },
                    ].map((step, idx, arr) => (
                        <div key={step.label} className="flex items-center shrink-0">
                            <div className="flex flex-col items-center gap-1.5 w-20">
                                <div className="size-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${step.color}15` }}>
                                    <span className="material-symbols-outlined text-lg" style={{ color: step.color }}>{step.icon}</span>
                                </div>
                                <p className="text-xs text-slate-400 text-center leading-tight font-medium">{step.label}</p>
                            </div>
                            {idx < arr.length - 1 && <span className="material-symbols-outlined text-slate-700 text-sm mx-1 shrink-0">chevron_right</span>}
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3 mb-6">
                {PM_HELP_SECTIONS.map(section => (
                    <div key={section.id} className="glass-panel rounded-2xl overflow-hidden">
                        <button onClick={() => setExpanded(expanded === section.id ? null : section.id)}
                            className="w-full flex items-center gap-3 p-5 text-left hover:bg-white/[0.02] transition-all cursor-pointer">
                            <div className="size-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${section.color}15` }}>
                                <span className="material-symbols-outlined" style={{ color: section.color }}>{section.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-sm">{section.title}</p>
                                <p className="text-slate-500 text-xs">{section.subtitle}</p>
                            </div>
                            <span className="text-xs text-slate-600 font-bold mr-1">{section.steps.length} topics</span>
                            <span className={`material-symbols-outlined text-slate-500 transition-transform ${expanded === section.id ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>
                        {expanded === section.id && (
                            <div className="px-5 pb-5 space-y-3 border-t border-white/[0.04] pt-4">
                                {section.steps.map((step, idx) => (
                                    <div key={idx} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${section.color}10` }}>
                                                <span className="material-symbols-outlined text-sm" style={{ color: section.color }}>{step.icon}</span>
                                            </div>
                                            {idx < section.steps.length - 1 && <div className="w-px flex-1 mt-1" style={{ backgroundColor: `${section.color}20` }} />}
                                        </div>
                                        <div className="pb-3">
                                            <p className="text-white font-bold text-sm mb-0.5">{step.title}</p>
                                            <p className="text-slate-400 text-xs leading-relaxed">{step.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="glass-panel rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #f59e0b08, #ef444408)' }}>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400">emoji_objects</span> Pro Tips
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PM_PRO_TIPS.map((tip, idx) => (
                        <div key={idx} className="flex gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-lg shrink-0 mt-0.5">{tip.icon}</span>
                            <p className="text-xs text-slate-400 leading-relaxed">{tip.tip}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="text-center mt-6 py-6">
                <p className="text-slate-500 text-sm mb-3">Ready to advertise?</p>
                <button onClick={onBack} className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-purple-500 text-white cursor-pointer hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2 mx-auto">
                    <span className="material-symbols-outlined text-sm">space_dashboard</span> Go to Dashboard
                </button>
            </div>
        </div>
    )
}

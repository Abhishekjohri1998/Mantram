import { useState, useEffect, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import AgentFidatoPanel from '../components/AgentFidatoPanel'
import { shopifyAnalytics } from '../services/api'

export default function D2CAnalytics() {
    const { activeBrand } = useBrand()
    const navigate = useNavigate()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [days, setDays] = useState(60)
    const [activeTab, setActiveTab] = useState('overview')
    const [insights, setInsights] = useState(null)
    const [insightsLoading, setInsightsLoading] = useState(false)
    const [boostPlan, setBoostPlan] = useState(null)
    const [boostLoading, setBoostLoading] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [creativeData, setCreativeData] = useState(null)
    const [cohortData, setCohortData] = useState(null)
    const [profitData, setProfitData] = useState(null)
    const [copilotMessages, setCopilotMessages] = useState([])
    const [copilotInput, setCopilotInput] = useState('')
    const [copilotLoading, setCopilotLoading] = useState(false)
    const [tabDataLoading, setTabDataLoading] = useState(null)

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const result = await shopifyAnalytics.overview({ brandId: activeBrand?._id, days })
            setData(result)
        } catch (e) { console.error('D2C analytics load error:', e) }
        finally { setLoading(false) }
    }, [activeBrand?._id, days])

    useEffect(() => { loadData() }, [loadData])

    const handleSync = async () => {
        setSyncing(true)
        try {
            await shopifyAnalytics.sync()
            await loadData()
        } catch (e) { console.error(e) }
        finally { setSyncing(false) }
    }

    const handleAiInsights = async () => {
        if (!data) return
        setInsightsLoading(true)
        try {
            const result = await shopifyAnalytics.aiInsights({ overview: data, brandId: activeBrand?._id })
            setInsights(result.insights)
        } catch (e) {
            console.error(e)
            setInsights({ summary: 'Unable to generate insights right now.', whatsWorking: [], whatsNot: [], actionPlan: [] })
        }
        finally { setInsightsLoading(false) }
    }

    const handleBoost = async (product) => {
        setBoostLoading(product.productId)
        try {
            const result = await shopifyAnalytics.boostPlan({ product, brandId: activeBrand?._id, kpis: data?.kpis })
            setBoostPlan(result.boostPlan)
        } catch (e) { console.error(e) }
        finally { setBoostLoading(null) }
    }

    const kpiCards = data?.kpis ? [
        { label: 'Revenue', value: `₹${data.kpis.totalRevenue?.toLocaleString()}`, icon: 'payments', color: '#8b5cf6', sub: `${data.kpis.revenueGrowth > 0 ? '+' : ''}${data.kpis.revenueGrowth}% WoW`, subColor: data.kpis.revenueGrowth >= 0 ? '#34d399' : '#f43f5e' },
        { label: 'Orders', value: data.kpis.totalOrders?.toLocaleString(), icon: 'shopping_cart', color: '#06b6d4', sub: `${days}d` },
        { label: 'AOV', value: `₹${data.kpis.avgOrderValue?.toLocaleString()}`, icon: 'receipt_long', color: '#f59e0b', sub: 'avg order' },
        { label: 'Customers', value: data.kpis.totalCustomers?.toLocaleString(), icon: 'group', color: '#ec4899', sub: `${data.kpis.newCustomers} new` },
        { label: 'Repeat Rate', value: `${data.kpis.repeatRate}%`, icon: 'autorenew', color: data.kpis.repeatRate > 20 ? '#34d399' : '#f59e0b', sub: data.kpis.repeatRate > 20 ? 'Healthy' : 'Needs work' },
        { label: 'Refund Rate', value: `${data.kpis.refundRate}%`, icon: 'undo', color: data.kpis.refundRate < 5 ? '#34d399' : '#f43f5e', sub: data.kpis.refundRate < 5 ? 'Excellent' : 'High' },
    ] : []

    // Load tab-specific data on tab switch
    useEffect(() => {
        if (!data?.connected) return
        const brandId = activeBrand?._id
        const loadTab = async () => {
            setTabDataLoading(activeTab)
            try {
                if (activeTab === 'creative' && !creativeData) {
                    setCreativeData(await shopifyAnalytics.creativeCockpit({ brandId }))
                } else if (activeTab === 'cohort' && !cohortData) {
                    setCohortData(await shopifyAnalytics.cohortLtv({ brandId }))
                } else if (activeTab === 'profit' && !profitData) {
                    setProfitData(await shopifyAnalytics.profitability({ brandId, days }))
                }
            } catch (e) { console.error('Tab data load:', e) }
            finally { setTabDataLoading(null) }
        }
        loadTab()
    }, [activeTab, data?.connected])

    const handleCopilotSend = async () => {
        if (!copilotInput.trim()) return
        const q = copilotInput.trim()
        setCopilotInput('')
        setCopilotMessages(prev => [...prev, { role: 'user', text: q }])
        setCopilotLoading(true)
        try {
            const result = await shopifyAnalytics.aiCopilot({ question: q, context: data })
            setCopilotMessages(prev => [...prev, { role: 'ai', text: result.answer, sources: result.sources, actions: result.actions, aiPowered: result.aiPowered }])
        } catch (e) {
            setCopilotMessages(prev => [...prev, { role: 'ai', text: 'Sorry, I couldn\'t process that. Try again.', sources: [] }])
        }
        finally { setCopilotLoading(false) }
    }

    const tabs = [
        { id: 'overview', label: '📊 Overview', icon: 'dashboard' },
        { id: 'products', label: '📦 Products', icon: 'inventory_2' },
        { id: 'customers', label: '👥 Customers', icon: 'group' },
        { id: 'alerts', label: '🚨 Red Flags', icon: 'warning', badge: data?.redFlags?.length },
        { id: 'creative', label: '🎨 Creative Cockpit', icon: 'palette' },
        { id: 'cohort', label: '📈 Cohort & LTV', icon: 'timeline' },
        { id: 'profit', label: '💰 Profitability', icon: 'account_balance' },
        { id: 'copilot', label: '🤖 AI Co-Pilot', icon: 'smart_toy' },
    ]

    const severityColors = { high: 'border-rose-500/30 bg-rose-500/5', medium: 'border-amber-500/30 bg-amber-500/5', low: 'border-emerald-500/30 bg-emerald-500/5' }
    const severityText = { high: 'text-rose-400', medium: 'text-amber-400', low: 'text-emerald-400' }
    const healthColors = { hot: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', label: '🟢 Hot' }, warm: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: '🟡 Warm' }, cold: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', label: '🔴 Cold' } }

    return (
        <DashboardLayout title="D2C Studio" subtitle="Shopify Intelligence Hub">
            <SEOHead title="D2C Analytics — Mantram AI" noIndex={true} />
            <style>{`
                @keyframes radar-sweep { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
                @keyframes blip-ping { 0%,100% { opacity:0.4; transform: scale(0.8) } 50% { opacity:1; transform: scale(1.3) } }
                .radar-sweep-arm { animation: radar-sweep 4s linear infinite }
                .radar-blip { animation: blip-ping 2s ease-in-out infinite }
            `}</style>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-3">
                <div></div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setActiveTab('help')}
                        className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400 text-xs font-bold hover:bg-white/[0.08] cursor-pointer transition-all flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">menu_book</span> How It Works
                    </button>
                    <select value={days} onChange={e => setDays(parseInt(e.target.value))}
                        className="input-glass py-2 px-3 rounded-xl text-xs bg-white/[0.04] cursor-pointer">
                        <option value={7}>Last 7 days</option>
                        <option value={30}>Last 30 days</option>
                        <option value={60}>Last 60 days</option>
                        <option value={90}>Last 90 days</option>
                    </select>
                    {data?.connected && (
                        <button onClick={handleSync} disabled={syncing}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-300 hover:bg-white/[0.08] transition-all cursor-pointer disabled:opacity-50">
                            <span className={`material-symbols-outlined text-sm ${syncing ? 'animate-spin' : ''}`}>{syncing ? 'progress_activity' : 'sync'}</span>
                            Refresh
                        </button>
                    )}
                </div>
            </div>

            {/* Agent Fidato — Competitive Intelligence */}
            <AgentFidatoPanel studio="d2c" />

            {/* Help View */}
            {activeTab === 'help' ? (
                <div className="animate-fade-in">
                    <D2CHelpView onBack={() => setActiveTab('overview')} />
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-24 text-slate-400">
                    <span className="material-symbols-outlined animate-spin mr-3 text-3xl">progress_activity</span>
                    <span className="text-lg">Loading D2C Studio...</span>
                </div>
            ) : !data?.connected ? (
                /* Not Connected State */
                <div className="glass-panel rounded-2xl p-10 text-center border border-white/[0.06]">
                    <div className="size-20 rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 flex items-center justify-center mx-auto mb-5 border border-violet-500/20">
                        <span className="material-symbols-outlined text-4xl text-violet-400">storefront</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Connect Your Shopify Store</h3>
                    <p className="text-slate-400 max-w-md mx-auto mb-6">
                        Link your Shopify store to unlock powerful D2C intelligence — revenue tracking, product health scores, customer insights, red flag alerts, and AI-powered growth strategies.
                    </p>
                    <button onClick={() => navigate('/integrations')}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white font-bold hover:shadow-lg hover:shadow-primary/20 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm align-middle mr-1">link</span>
                        Connect Shopify
                    </button>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 max-w-2xl mx-auto">
                        {['Revenue Tracking', 'Product Health', 'Red Flag Alerts', 'AI Strategy'].map((f, i) => (
                            <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                                <span className="material-symbols-outlined text-xl text-primary mb-1 block">{['payments', 'inventory_2', 'warning', 'auto_awesome'][i]}</span>
                                <p className="text-xs text-slate-400">{f}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                        {kpiCards.map((kpi, i) => (
                            <div key={i} className="glass-panel rounded-xl p-4 hover:bg-white/[0.04] transition-all">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <span className="material-symbols-outlined text-sm" style={{ color: kpi.color }}>{kpi.icon}</span>
                                    <span className="text-xs text-slate-500">{kpi.label}</span>
                                </div>
                                <p className="text-xl font-extrabold text-white">{kpi.value}</p>
                                <p className="text-[10px] mt-0.5 font-medium" style={{ color: kpi.subColor || '#64748b' }}>{kpi.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Tab Bar */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-6 overflow-x-auto">
                        {tabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${activeTab === tab.id ? 'bg-primary/15 text-white border border-primary/30' : 'text-slate-500 hover:text-slate-300'}`}>
                                {tab.label}
                                {tab.badge > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/20 text-rose-400">{tab.badge}</span>}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[400px]">
                        {/* OVERVIEW TAB */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Revenue Chart */}
                                <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-violet-400 text-lg">show_chart</span>
                                            Revenue Trend ({days} days)
                                        </h3>
                                        <button onClick={handleAiInsights} disabled={insightsLoading}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary/20 to-violet-500/20 border border-primary/30 text-primary font-medium text-xs hover:from-primary/30 transition-all cursor-pointer disabled:opacity-50">
                                            <span className="material-symbols-outlined text-sm">{insightsLoading ? 'progress_activity' : 'auto_awesome'}</span>
                                            {insightsLoading ? 'Analyzing...' : 'AI Insights'}
                                        </button>
                                    </div>
                                    {/* Mini bar chart */}
                                    <div className="flex items-end gap-[2px] h-32">
                                        {(data.dailyRevenue || []).map((d, i) => {
                                            const maxRev = Math.max(...(data.dailyRevenue || []).map(x => x.revenue), 1)
                                            const h = Math.max(2, (d.revenue / maxRev) * 100)
                                            return (
                                                <div key={i} className="flex-1 group relative cursor-default">
                                                    <div className="w-full rounded-t-sm transition-all group-hover:opacity-80"
                                                        style={{ height: `${h}%`, background: 'linear-gradient(180deg, #8b5cf6, #2B4BEE)', minHeight: '2px' }}
                                                        title={`${d.date}: ₹${d.revenue.toLocaleString()} (${d.orders} orders)`} />
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                                        <span>{data.dailyRevenue?.[0]?.date}</span>
                                        <span>{data.dailyRevenue?.[data.dailyRevenue.length - 1]?.date}</span>
                                    </div>
                                </div>

                                {/* AI Insights Panel */}
                                {insights && (
                                    <div className="glass-panel rounded-2xl p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-primary">auto_awesome</span>
                                            <h3 className="text-sm font-bold text-white">AI Intelligence Report</h3>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-5 leading-relaxed">{insights.summary}</p>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                                            {insights.whatsWorking?.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">✅ What's Working</p>
                                                    <div className="space-y-2">
                                                        {insights.whatsWorking.map((item, i) => (
                                                            <div key={i} className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                                                <p className="text-sm font-medium text-white">{item.title}</p>
                                                                <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {insights.whatsNot?.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">⚠️ What's Not</p>
                                                    <div className="space-y-2">
                                                        {insights.whatsNot.map((item, i) => (
                                                            <div key={i} className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
                                                                <p className="text-sm font-medium text-white">{item.title}</p>
                                                                <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {insights.actionPlan?.length > 0 && (
                                            <div>
                                                <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">🎯 Action Plan</p>
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                    {insights.actionPlan.map((item, i) => (
                                                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="material-symbols-outlined text-sm text-primary">{item.icon || 'lightbulb'}</span>
                                                                <p className="text-sm font-bold text-white">{item.title}</p>
                                                            </div>
                                                            <p className="text-xs text-slate-400">{item.desc}</p>
                                                            {item.priority && <span className={`inline-block mt-1.5 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${item.priority === 'high' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : item.priority === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>{item.priority}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Hot Products Radar */}
                                <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-rose-400">radar</span>
                                        Hot Products Radar
                                    </h3>
                                    <div className="flex items-center justify-center gap-8 flex-wrap">
                                        <div className="relative" style={{ width: 220, height: 220 }}>
                                            <svg width="220" height="220" viewBox="0 0 220 220" className="absolute inset-0">
                                                <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                                <circle cx="110" cy="110" r="75" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                <circle cx="110" cy="110" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                                <circle cx="110" cy="110" r="25" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                <line x1="110" y1="8" x2="110" y2="212" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                <line x1="8" y1="110" x2="212" y2="110" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="2" />
                                            </svg>
                                            <svg width="220" height="220" viewBox="0 0 220 220" className="absolute inset-0 radar-sweep-arm">
                                                <defs>
                                                    <linearGradient id="d2cSweep" gradientTransform="rotate(90)">
                                                        <stop offset="0%" stopColor="rgba(139,92,246,0.3)" />
                                                        <stop offset="100%" stopColor="rgba(139,92,246,0)" />
                                                    </linearGradient>
                                                </defs>
                                                <path d="M110,110 L110,10 A100,100 0 0,1 195,65 Z" fill="url(#d2cSweep)" />
                                                <line x1="110" y1="110" x2="110" y2="10" stroke="rgba(139,92,246,0.7)" strokeWidth="1.5" />
                                            </svg>
                                            <svg width="220" height="220" viewBox="0 0 220 220" className="absolute inset-0">
                                                {data.productHealth?.slice(0, 5).map((p, i) => {
                                                    const angle = (i / 5) * 2 * Math.PI - Math.PI / 2
                                                    const dist = 25 + (p.healthScore / 100) * 72
                                                    const cx = 110 + Math.cos(angle) * dist
                                                    const cy = 110 + Math.sin(angle) * dist
                                                    const color = p.healthBadge === 'hot' ? '#34d399' : p.healthBadge === 'warm' ? '#f59e0b' : '#f43f5e'
                                                    return (
                                                        <g key={i}>
                                                            <circle cx={cx} cy={cy} r={Math.max(4, p.healthScore / 12)} fill={color} className="radar-blip" style={{ animationDelay: `${i * 350}ms` }} opacity="0.9" />
                                                            <circle cx={cx} cy={cy} r={Math.max(7, p.healthScore / 8)} fill="none" stroke={color} strokeWidth="0.5" className="radar-blip" style={{ animationDelay: `${i * 350 + 175}ms` }} opacity="0.4" />
                                                        </g>
                                                    )
                                                })}
                                                <circle cx="110" cy="110" r="3" fill="#8b5cf6" />
                                                <circle cx="110" cy="110" r="6" fill="none" stroke="#8b5cf6" strokeWidth="0.5" opacity="0.5" />
                                            </svg>
                                        </div>
                                        <div className="flex flex-col gap-2 min-w-[200px]">
                                            {data.productHealth?.slice(0, 5).map((p, i) => {
                                                const hc = healthColors[p.healthBadge] || healthColors.warm
                                                return (
                                                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]">
                                                        <span className="text-sm font-bold text-slate-500 w-4">#{i + 1}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs text-white font-medium truncate">{p.title}</p>
                                                            <p className="text-[10px] text-slate-500">₹{p.revenue.toLocaleString()} · {p.unitsSold} sold</p>
                                                        </div>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${hc.bg} ${hc.text} ${hc.border}`}>{hc.label}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* ── ORDER GEO RADAR ── */}
                                {data.geoRadar?.cities?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <div className="flex items-center gap-2 mb-5">
                                            <span className="material-symbols-outlined text-cyan-400">public</span>
                                            <h3 className="text-sm font-bold text-white">Order Geo Radar</h3>
                                            <span className="ml-auto text-xs text-slate-500">{data.geoRadar.totalLocations} locations</span>
                                        </div>
                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                            {/* Animated radar */}
                                            <div className="relative shrink-0" style={{ width: 200, height: 200 }}>
                                                <svg width="200" height="200" viewBox="0 0 200 200" className="absolute inset-0">
                                                    <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                                    <circle cx="100" cy="100" r="68" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                    <circle cx="100" cy="100" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                                    <circle cx="100" cy="100" r="22" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                    <line x1="100" y1="8" x2="100" y2="192" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                    <line x1="8" y1="100" x2="192" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                    <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="1.5" />
                                                </svg>
                                                <svg width="200" height="200" viewBox="0 0 200 200" className="absolute inset-0 radar-sweep-arm">
                                                    <defs>
                                                        <linearGradient id="geoSweep" gradientTransform="rotate(90)">
                                                            <stop offset="0%" stopColor="rgba(6,182,212,0.3)" />
                                                            <stop offset="100%" stopColor="rgba(6,182,212,0)" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path d="M100,100 L100,10 A90,90 0 0,1 177,57 Z" fill="url(#geoSweep)" />
                                                    <line x1="100" y1="100" x2="100" y2="10" stroke="rgba(6,182,212,0.7)" strokeWidth="1.5" />
                                                </svg>
                                                <svg width="200" height="200" viewBox="0 0 200 200" className="absolute inset-0">
                                                    {data.geoRadar.cities.slice(0, 10).map((c, i) => {
                                                        const angle = (i / 10) * 2 * Math.PI - Math.PI / 2;
                                                        const dist = 22 + (c.pct / 100) * 65;
                                                        const cx = 100 + Math.cos(angle) * dist;
                                                        const cy = 100 + Math.sin(angle) * dist;
                                                        return (
                                                            <g key={i}>
                                                                <circle cx={cx} cy={cy} r={Math.max(3, c.pct / 3)} fill={c.color} className="radar-blip" style={{ animationDelay: `${i * 300}ms` }} opacity="0.9" />
                                                                <circle cx={cx} cy={cy} r={Math.max(5, c.pct / 2)} fill="none" stroke={c.color} strokeWidth="0.5" className="radar-blip" style={{ animationDelay: `${i * 300 + 150}ms` }} opacity="0.4" />
                                                            </g>
                                                        );
                                                    })}
                                                    <circle cx="100" cy="100" r="3" fill="#06b6d4" />
                                                    <circle cx="100" cy="100" r="6" fill="none" stroke="#06b6d4" strokeWidth="0.5" opacity="0.5" />
                                                </svg>
                                            </div>
                                            {/* City list */}
                                            <div className="flex-1 grid grid-cols-2 gap-2 w-full">
                                                {data.geoRadar.cities.slice(0, 8).map((c, i) => (
                                                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02]">
                                                        <div className="size-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                                                        <span className="text-xs text-white truncate flex-1">{c.name}</span>
                                                        <span className="text-xs font-bold text-white">{c.orders}</span>
                                                        <span className="text-[10px] text-slate-500">{c.pct}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── PRODUCT VELOCITY ── */}
                                {data.productVelocity?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-amber-400">speed</span>
                                            <h3 className="text-sm font-bold text-white">Product Velocity</h3>
                                            <span className="text-xs text-slate-500 ml-auto">Week-over-Week</span>
                                        </div>
                                        <div className="space-y-2">
                                            {data.productVelocity.slice(0, 8).map((p, i) => (
                                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                    <span className={`material-symbols-outlined text-lg ${p.status === 'accelerating' ? 'text-emerald-400' : p.status === 'decelerating' ? 'text-rose-400' : 'text-slate-400'}`}>
                                                        {p.status === 'accelerating' ? 'rocket_launch' : p.status === 'decelerating' ? 'trending_down' : 'trending_flat'}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-white font-medium truncate">{p.title}</p>
                                                        <p className="text-[10px] text-slate-500">This week: {p.thisWeekUnits} units • Last: {p.lastWeekUnits}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className={`text-sm font-extrabold ${p.change > 0 ? 'text-emerald-400' : p.change < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                                                            {p.change > 0 ? '+' : ''}{p.change}%
                                                        </p>
                                                        <p className="text-[10px] text-slate-500">₹{(p.thisWeekRevenue || 0).toLocaleString()}</p>
                                                    </div>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${p.status === 'accelerating' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : p.status === 'decelerating' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-slate-400 bg-white/[0.04] border-white/[0.08]'}`}>
                                                        {p.status}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── POPULAR VARIANTS ── */}
                                {data.popularVariants?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-pink-400">palette</span>
                                            <h3 className="text-sm font-bold text-white">Popular Variants</h3>
                                            <span className="text-xs text-slate-500 ml-auto">Colors · Sizes · Options</span>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {data.popularVariants.map((v, i) => {
                                                const chipColors = ['bg-violet-500/15 text-violet-300 border-violet-500/20', 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20', 'bg-amber-500/15 text-amber-300 border-amber-500/20', 'bg-rose-500/15 text-rose-300 border-rose-500/20', 'bg-pink-500/15 text-pink-300 border-pink-500/20', 'bg-blue-500/15 text-blue-300 border-blue-500/20'];
                                                return (
                                                    <div key={i} className={`px-3 py-1.5 rounded-xl border text-xs font-medium ${chipColors[i % chipColors.length]}`}>
                                                        {v.name} <span className="font-extrabold ml-1">{v.units}</span>
                                                        <span className="text-[9px] opacity-60 ml-1">({v.productCount} products)</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ── ABANDONMENT SIGNALS ── */}
                                {data.abandonmentSignals?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-rose-500/10">
                                        <div className="flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-rose-400">remove_shopping_cart</span>
                                            <h3 className="text-sm font-bold text-white">Abandonment Signals</h3>
                                            <span className="text-xs text-slate-500 ml-auto">Stocked but not selling</span>
                                        </div>
                                        <div className="space-y-2">
                                            {data.abandonmentSignals.map((p, i) => (
                                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/[0.03] border border-rose-500/10">
                                                    {p.image ? (
                                                        <img src={p.image} alt="" className="size-10 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="size-10 rounded-lg bg-white/[0.04] flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-slate-600 text-sm">image</span>
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-white font-medium truncate">{p.title}</p>
                                                        <p className="text-[10px] text-rose-400">{p.reason}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-bold text-white">{p.inventory} units</p>
                                                        <p className="text-[10px] text-slate-500">₹{p.stuckValue.toLocaleString()} stuck</p>
                                                    </div>
                                                    <div className="shrink-0 max-w-[140px]">
                                                        <p className="text-[10px] text-amber-400 leading-tight">💡 {p.suggestion}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* PRODUCTS TAB */}
                        {activeTab === 'products' && (
                            <div className="space-y-4">
                                <div className="glass-panel rounded-2xl border border-white/[0.06] overflow-hidden">
                                    <div className="p-4 border-b border-white/[0.04]">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-violet-400">inventory_2</span>
                                            Product Intelligence ({data.productHealth?.length || 0} products)
                                        </h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/[0.04]">
                                                    <th className="text-left py-3 px-4">#</th>
                                                    <th className="text-left py-3 px-2">Product</th>
                                                    <th className="text-right py-3 px-3">Revenue</th>
                                                    <th className="text-right py-3 px-3">Units</th>
                                                    <th className="text-right py-3 px-3">Price</th>
                                                    <th className="text-right py-3 px-3">Stock</th>
                                                    <th className="text-center py-3 px-3">Health</th>
                                                    <th className="text-center py-3 px-3">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(data.productHealth || []).map((p, i) => {
                                                    const hc = healthColors[p.healthBadge] || healthColors.warm
                                                    return (
                                                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-all">
                                                            <td className="py-3 px-4 text-slate-500 font-bold">{i + 1}</td>
                                                            <td className="py-3 px-2">
                                                                <div className="flex items-center gap-3">
                                                                    {p.image ? (
                                                                        <img src={p.image} alt="" className="size-10 rounded-lg object-cover" />
                                                                    ) : (
                                                                        <div className="size-10 rounded-lg bg-white/[0.04] flex items-center justify-center">
                                                                            <span className="material-symbols-outlined text-slate-600 text-sm">image</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="min-w-0">
                                                                        <p className="text-white font-medium truncate max-w-[200px]">{p.title}</p>
                                                                        <p className="text-[10px] text-slate-500">{p.variant !== 'Default Title' ? p.variant : ''}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-3 text-right text-white font-bold">₹{p.revenue.toLocaleString()}</td>
                                                            <td className="py-3 px-3 text-right text-slate-300">{p.unitsSold}</td>
                                                            <td className="py-3 px-3 text-right text-slate-300">₹{p.price?.toLocaleString()}</td>
                                                            <td className="py-3 px-3 text-right">
                                                                <span className={p.inventory < 5 ? 'text-rose-400 font-bold' : 'text-slate-300'}>{p.inventory}</span>
                                                            </td>
                                                            <td className="py-3 px-3 text-center">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${hc.bg} ${hc.text} ${hc.border}`}>{p.healthScore}%</span>
                                                            </td>
                                                            <td className="py-3 px-3 text-center">
                                                                {p.needsBoost && (
                                                                    <button onClick={(e) => { e.stopPropagation(); handleBoost(p) }}
                                                                        disabled={boostLoading === p.productId}
                                                                        className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-all cursor-pointer disabled:opacity-50">
                                                                        {boostLoading === p.productId ? '...' : '🚀 Boost'}
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Boost Plan Panel */}
                                {boostPlan && (
                                    <div className="glass-panel rounded-2xl p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary">rocket_launch</span>
                                                <h3 className="text-sm font-bold text-white">Boost Plan: {boostPlan.product}</h3>
                                            </div>
                                            <button onClick={() => setBoostPlan(null)} className="text-slate-500 hover:text-white transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                            {(boostPlan.campaigns || []).map((c, i) => (
                                                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                    <p className="text-sm font-bold text-white mb-1">{c.channel}</p>
                                                    <p className="text-xs text-primary font-medium mb-2">{c.type}</p>
                                                    <div className="space-y-1 text-xs text-slate-400">
                                                        <p><strong className="text-slate-300">Budget:</strong> {c.budget}</p>
                                                        <p><strong className="text-slate-300">Targeting:</strong> {c.targeting}</p>
                                                        <p><strong className="text-slate-300">ROAS:</strong> {c.expectedROAS}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {boostPlan.quickWins?.length > 0 && (
                                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                <p className="text-xs font-bold text-amber-400 mb-2">⚡ Quick Wins</p>
                                                <ul className="space-y-1">
                                                    {boostPlan.quickWins.map((w, i) => (
                                                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                                                            <span className="text-primary mt-0.5">•</span>{w}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        <button onClick={() => navigate('/performance-marketing')}
                                            className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white text-sm font-bold hover:shadow-lg transition-all cursor-pointer">
                                            Launch Campaign in Performance Studio →
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* CUSTOMERS TAB */}
                        {activeTab === 'customers' && data.customerAnalytics && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div className="space-y-6">
                                    {/* Customer KPIs */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-pink-400">group</span>Customer Overview
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            {[
                                                { label: 'Total', value: data.customerAnalytics.totalCustomers, color: '#ec4899' },
                                                { label: 'New (30d)', value: data.customerAnalytics.newCustomers, color: '#34d399' },
                                                { label: 'Returning', value: data.customerAnalytics.returningCustomers, color: '#8b5cf6' },
                                                { label: 'Avg LTV', value: `₹${data.customerAnalytics.avgLTV?.toLocaleString()}`, color: '#f59e0b' },
                                            ].map((m, i) => (
                                                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                                                    <p className="text-2xl font-extrabold text-white">{m.value}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{m.label}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* LTV Tiers */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white mb-4">Customer Tiers</h3>
                                        {[
                                            { label: '👑 VIP (5+ orders)', value: data.customerAnalytics.ltvTiers.vip, color: '#f59e0b' },
                                            { label: '🔁 Regular (2+ orders)', value: data.customerAnalytics.ltvTiers.regular, color: '#8b5cf6' },
                                            { label: '1️⃣ One-Time', value: data.customerAnalytics.ltvTiers.oneTime, color: '#64748b' },
                                        ].map((t, i) => {
                                            const total = data.customerAnalytics.totalCustomers || 1
                                            return (
                                                <div key={i} className="mb-3">
                                                    <div className="flex justify-between mb-1">
                                                        <span className="text-xs text-slate-300">{t.label}</span>
                                                        <span className="text-xs font-bold text-white">{t.value} ({Math.round((t.value / total) * 100)}%)</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(t.value / total) * 100}%`, background: t.color }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {/* Top Cities */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-cyan-400">public</span>Top Cities
                                        </h3>
                                        <div className="space-y-2.5">
                                            {(data.customerAnalytics.topCities || []).slice(0, 8).map((city, i) => (
                                                <div key={i}>
                                                    <div className="flex justify-between mb-0.5">
                                                        <span className="text-xs text-slate-300 flex items-center gap-1.5">
                                                            <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                                                            {city.name}
                                                        </span>
                                                        <span className="text-xs font-bold text-white">{city.count} ({city.pct}%)</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${(city.count / (data.customerAnalytics.topCities[0]?.count || 1)) * 100}%`, background: 'linear-gradient(90deg, #06b6d4, #8b5cf6)' }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Marketing Consent */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined text-emerald-400">email</span>Email Marketing
                                        </h3>
                                        <div className="flex items-center gap-4">
                                            <div className="flex-1">
                                                <p className="text-3xl font-extrabold text-white">{data.customerAnalytics.marketingConsent}</p>
                                                <p className="text-xs text-slate-500">Opted-in subscribers</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-emerald-400">{Math.round((data.customerAnalytics.marketingConsent / (data.customerAnalytics.totalCustomers || 1)) * 100)}%</p>
                                                <p className="text-xs text-slate-500">opt-in rate</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* RED FLAGS TAB */}
                        {activeTab === 'alerts' && (
                            <div className="space-y-4">
                                {(data.redFlags || []).length === 0 ? (
                                    <div className="glass-panel rounded-2xl p-10 text-center border border-white/[0.06]">
                                        <span className="material-symbols-outlined text-5xl text-emerald-400 mb-3 block">verified</span>
                                        <h3 className="text-lg font-bold text-white mb-1">All Clear! 🎉</h3>
                                        <p className="text-sm text-slate-400">No red flags detected. Your store is performing well.</p>
                                    </div>
                                ) : (
                                    data.redFlags.map((flag, i) => (
                                        <div key={i} className={`glass-panel rounded-2xl p-5 border ${severityColors[flag.severity]}`}>
                                            <div className="flex items-start gap-3">
                                                <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${flag.severity === 'high' ? 'bg-rose-500/10' : flag.severity === 'medium' ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                                                    <span className={`material-symbols-outlined ${severityText[flag.severity]}`}>{flag.icon}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="text-sm font-bold text-white">{flag.title}</h4>
                                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${flag.severity === 'high' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : flag.severity === 'medium' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'}`}>{flag.severity}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 leading-relaxed mb-2">{flag.desc}</p>
                                                    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                                        <p className="text-xs text-primary"><strong>💡 Recommendation:</strong> {flag.action}</p>
                                                    </div>
                                                    {flag.products?.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {flag.products.map((p, j) => (
                                                                <span key={j} className="px-2 py-0.5 text-[10px] rounded-full bg-white/[0.04] text-slate-400 border border-white/[0.06]">
                                                                    {p.title} ({p.inventory} in stock)
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {/* CREATIVE COCKPIT TAB */}
                        {activeTab === 'creative' && (
                            tabDataLoading === 'creative' ? (
                                <div className="flex items-center justify-center py-16 text-slate-400"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading Creative Cockpit...</div>
                            ) : creativeData ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Published Content', value: creativeData.totalContent, icon: 'article', color: '#8b5cf6' },
                                            { label: 'Ad Campaigns', value: creativeData.totalCampaigns, icon: 'campaign', color: '#06b6d4' },
                                            { label: 'Total Ad Spend', value: `₹${creativeData.totalAdSpend?.toLocaleString()}`, icon: 'payments', color: '#f59e0b' },
                                            { label: 'Winning Format', value: creativeData.winningFormat, icon: 'emoji_events', color: '#34d399' },
                                        ].map((m, i) => (
                                            <div key={i} className="glass-panel rounded-xl p-4"><span className="material-symbols-outlined text-sm mb-1 block" style={{ color: m.color }}>{m.icon}</span><p className="text-lg font-extrabold text-white">{m.value}</p><p className="text-[10px] text-slate-500">{m.label}</p></div>
                                        ))}
                                    </div>
                                    {/* Content Type Ranking */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-violet-400">bar_chart</span>Content Type Performance</h3>
                                        <div className="space-y-3">
                                            {(creativeData.contentTypeRanking || []).map((t, i) => {
                                                const maxEng = creativeData.contentTypeRanking[0]?.totalEngagement || 1
                                                return (
                                                    <div key={i}>
                                                        <div className="flex justify-between mb-1">
                                                            <span className="text-xs text-white font-medium capitalize flex items-center gap-2">{i === 0 && <span className="text-amber-400">🏆</span>}{t.type} <span className="text-[10px] text-slate-500">({t.count} posts)</span></span>
                                                            <span className="text-xs font-bold text-slate-300">Eng: {t.totalEngagement} · Views: {t.totalViews.toLocaleString()}</span>
                                                        </div>
                                                        <div className="h-2.5 rounded-full bg-white/[0.04] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(t.totalEngagement / maxEng) * 100}%`, background: 'linear-gradient(90deg, #8b5cf6, #2B4BEE)' }} /></div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    {/* Top Creatives */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white mb-4">🔥 Top Performing Creatives</h3>
                                        <div className="space-y-2">
                                            {(creativeData.topCreatives || []).slice(0, 8).map((c, i) => (
                                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                                                    <span className="text-sm font-bold text-slate-500 w-6">#{i + 1}</span>
                                                    <div className="flex-1 min-w-0"><p className="text-xs text-white font-medium truncate">{c.title}</p><p className="text-[10px] text-slate-500">{c.platform} · {c.type}</p></div>
                                                    <div className="text-right text-[10px]"><p className="text-white font-bold">Score: {c.engagement?.score}</p><p className="text-slate-500">♥{c.engagement?.likes} 💬{c.engagement?.comments} 🔄{c.engagement?.shares}</p></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Ad Creative ROAS */}
                                    {creativeData.adCreativePerf?.length > 0 && (
                                        <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                            <h3 className="text-sm font-bold text-white mb-4">📢 Ad Creative ROAS Ranking</h3>
                                            <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-slate-500 uppercase border-b border-white/[0.04]"><th className="text-left py-2 px-3">Campaign</th><th className="text-center py-2 px-2">Format</th><th className="text-right py-2 px-2">ROAS</th><th className="text-right py-2 px-2">CTR</th><th className="text-right py-2 px-2">Spend</th></tr></thead><tbody>
                                                {creativeData.adCreativePerf.slice(0, 10).map((a, i) => (
                                                    <tr key={i} className="border-b border-white/[0.02]"><td className="py-2 px-3 text-white">{a.campaignTitle}</td><td className="py-2 px-2 text-center text-slate-400">{a.format}</td><td className="py-2 px-2 text-right font-bold" style={{ color: a.roas > 3 ? '#34d399' : a.roas > 1 ? '#f59e0b' : '#f43f5e' }}>{a.roas}x</td><td className="py-2 px-2 text-right text-slate-300">{a.ctr}%</td><td className="py-2 px-2 text-right text-slate-400">₹{a.spend?.toLocaleString()}</td></tr>
                                                ))}
                                            </tbody></table></div>
                                        </div>
                                    )}
                                </div>
                            ) : <div className="text-center py-16 text-slate-500">No creative data available</div>
                        )}

                        {/* COHORT & LTV TAB */}
                        {activeTab === 'cohort' && (
                            tabDataLoading === 'cohort' ? (
                                <div className="flex items-center justify-center py-16 text-slate-400"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading Cohort Analysis...</div>
                            ) : cohortData?.connected ? (
                                <div className="space-y-6">
                                    {/* LTV Metrics Row */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Avg LTV', value: `₹${cohortData.ltvMetrics?.avgLTV?.toLocaleString()}`, color: '#8b5cf6' },
                                            { label: 'Median LTV', value: `₹${cohortData.ltvMetrics?.medianLTV?.toLocaleString()}`, color: '#06b6d4' },
                                            { label: 'Top 10% LTV', value: `₹${cohortData.ltvMetrics?.top10PctLTV?.toLocaleString()}`, color: '#f59e0b' },
                                            { label: 'Churn Rate', value: `${cohortData.churn?.churnRate}%`, color: cohortData.churn?.churnRate < 30 ? '#34d399' : '#f43f5e' },
                                        ].map((m, i) => (
                                            <div key={i} className="glass-panel rounded-xl p-4 text-center"><p className="text-2xl font-extrabold text-white">{m.value}</p><p className="text-[10px] text-slate-500">{m.label}</p></div>
                                        ))}
                                    </div>
                                    {/* Cohort Retention Grid */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-violet-400">grid_on</span>Monthly Cohort Retention</h3>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead><tr className="text-slate-500"><th className="text-left py-2 px-2">Cohort</th><th className="text-center py-2 px-2">Size</th>{[0, 1, 2, 3, 4, 5].map(m => <th key={m} className="text-center py-2 px-2">M{m}</th>)}</tr></thead>
                                                <tbody>
                                                    {(cohortData.cohorts || []).map((c, ci) => (
                                                        <tr key={ci} className="border-b border-white/[0.02]">
                                                            <td className="py-2 px-2 text-white font-medium">{c.label}</td>
                                                            <td className="py-2 px-2 text-center text-slate-400">{c.size}</td>
                                                            {[0, 1, 2, 3, 4, 5].map(m => {
                                                                const r = c.retention?.[m]
                                                                if (!r) return <td key={m} className="py-2 px-2 text-center text-slate-600">—</td>
                                                                const bg = r.rate >= 80 ? 'bg-emerald-500/30' : r.rate >= 50 ? 'bg-emerald-500/15' : r.rate >= 20 ? 'bg-amber-500/15' : r.rate > 0 ? 'bg-rose-500/10' : ''
                                                                return <td key={m} className={`py-2 px-2 text-center font-bold ${bg} rounded`} style={{ color: r.rate >= 50 ? '#34d399' : r.rate >= 20 ? '#f59e0b' : '#f43f5e' }}>{r.rate}%</td>
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    {/* Revenue Split */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                            <h3 className="text-sm font-bold text-white mb-4">Revenue: New vs Returning</h3>
                                            {(() => {
                                                const total = (cohortData.revenueSplit?.new || 0) + (cohortData.revenueSplit?.returning || 0) || 1; const newPct = Math.round((cohortData.revenueSplit?.new / total) * 100); return (
                                                    <div>
                                                        <div className="flex gap-4 mb-3">{[{ label: 'New Customers', value: `₹${cohortData.revenueSplit?.new?.toLocaleString()}`, pct: newPct, color: '#06b6d4' }, { label: 'Returning', value: `₹${cohortData.revenueSplit?.returning?.toLocaleString()}`, pct: 100 - newPct, color: '#8b5cf6' }].map((s, i) => <div key={i} className="flex-1 p-3 rounded-xl bg-white/[0.02] text-center"><p className="text-lg font-extrabold text-white">{s.value}</p><p className="text-[10px] text-slate-500">{s.label} ({s.pct}%)</p></div>)}</div>
                                                        <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden flex"><div style={{ width: `${newPct}%`, background: '#06b6d4' }} className="h-full" /><div style={{ width: `${100 - newPct}%`, background: '#8b5cf6' }} className="h-full" /></div>
                                                    </div>
                                                )
                                            })()}
                                        </div>
                                        <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                            <h3 className="text-sm font-bold text-white mb-4">Churn Analysis</h3>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="p-3 rounded-xl bg-white/[0.02] text-center"><p className="text-2xl font-extrabold text-rose-400">{cohortData.churn?.churned}</p><p className="text-[10px] text-slate-500">Churned Customers</p></div>
                                                <div className="p-3 rounded-xl bg-white/[0.02] text-center"><p className="text-2xl font-extrabold text-white">{cohortData.churn?.previouslyActive}</p><p className="text-[10px] text-slate-500">Were Active (30-120d)</p></div>
                                            </div>
                                            <p className="text-xs text-slate-400 mt-3">Customers who ordered 30-120 days ago but haven't returned in the last 30 days.</p>
                                        </div>
                                    </div>
                                </div>
                            ) : <div className="text-center py-16 text-slate-500">Connect Shopify to view cohort data</div>
                        )}

                        {/* PROFITABILITY TAB */}
                        {activeTab === 'profit' && (
                            tabDataLoading === 'profit' ? (
                                <div className="flex items-center justify-center py-16 text-slate-400"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Calculating Profitability...</div>
                            ) : profitData?.connected ? (
                                <div className="space-y-6">
                                    {/* Profit Header */}
                                    <div className={`glass-panel rounded-2xl p-6 border ${profitData.health === 'excellent' ? 'border-emerald-500/20 bg-emerald-500/5' : profitData.health === 'good' ? 'border-emerald-500/15' : profitData.health === 'warning' ? 'border-amber-500/20 bg-amber-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                                        <div className="flex items-center justify-between">
                                            <div><p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Net Profit ({profitData.period}d)</p><p className={`text-3xl font-extrabold ${profitData.profit?.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>₹{profitData.profit?.net?.toLocaleString()}</p></div>
                                            <div className="text-right"><span className={`text-sm font-bold px-3 py-1 rounded-full ${profitData.health === 'excellent' ? 'bg-emerald-500/15 text-emerald-400' : profitData.health === 'good' ? 'bg-emerald-500/10 text-emerald-400' : profitData.health === 'warning' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{profitData.health === 'excellent' ? '🟢' : profitData.health === 'good' ? '🟡' : profitData.health === 'warning' ? '🟠' : '🔴'} {profitData.profit?.netMargin}% margin</span></div>
                                        </div>
                                    </div>
                                    {/* Efficiency Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { label: 'Revenue', value: `₹${profitData.revenue?.total?.toLocaleString()}`, color: '#8b5cf6' },
                                            { label: 'MER', value: `${profitData.efficiency?.mer}x`, color: '#06b6d4', sub: 'Marketing Efficiency' },
                                            { label: 'Blended ROAS', value: `${profitData.efficiency?.blendedROAS}x`, color: '#34d399' },
                                            { label: 'CAC', value: `₹${profitData.efficiency?.cac?.toLocaleString()}`, color: '#f59e0b', sub: 'Cost per Acq.' },
                                        ].map((m, i) => (
                                            <div key={i} className="glass-panel rounded-xl p-4 text-center"><p className="text-2xl font-extrabold text-white">{m.value}</p><p className="text-[10px] text-slate-500">{m.label}</p>{m.sub && <p className="text-[9px] text-slate-600">{m.sub}</p>}</div>
                                        ))}
                                    </div>
                                    {/* Cost Breakdown */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white mb-4">Cost Breakdown</h3>
                                        <div className="space-y-2.5">
                                            {(profitData.costBreakdown || []).map((c, i) => {
                                                const total = profitData.revenue?.total || 1
                                                return (
                                                    <div key={i}><div className="flex justify-between mb-0.5"><span className="text-xs text-slate-300 flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: c.color }} />{c.name}</span><span className="text-xs font-bold text-white">₹{c.value?.toLocaleString()} ({Math.round((c.value / total) * 100)}%)</span></div>
                                                        <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.value / total) * 100)}%`, background: c.color }} /></div></div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    {/* Product Margins */}
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h3 className="text-sm font-bold text-white mb-4">Product Profitability</h3>
                                        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-slate-500 uppercase border-b border-white/[0.04]"><th className="text-left py-2 px-3">Product</th><th className="text-right py-2 px-2">Revenue</th><th className="text-right py-2 px-2">Est. Cost</th><th className="text-right py-2 px-2">Profit</th><th className="text-right py-2 px-2">Margin</th></tr></thead><tbody>
                                            {(profitData.productProfitability || []).map((p, i) => (
                                                <tr key={i} className="border-b border-white/[0.02]"><td className="py-2 px-3 text-white">{p.title}</td><td className="py-2 px-2 text-right text-slate-300">₹{Math.round(p.revenue).toLocaleString()}</td><td className="py-2 px-2 text-right text-slate-400">₹{Math.round(p.estimatedCost).toLocaleString()}</td><td className="py-2 px-2 text-right font-bold" style={{ color: p.profit > 0 ? '#34d399' : '#f43f5e' }}>₹{p.profit?.toLocaleString()}</td><td className="py-2 px-2 text-right font-bold" style={{ color: p.margin > 30 ? '#34d399' : p.margin > 15 ? '#f59e0b' : '#f43f5e' }}>{p.margin}%</td></tr>
                                            ))}
                                        </tbody></table></div>
                                    </div>
                                </div>
                            ) : <div className="text-center py-16 text-slate-500">Connect Shopify to view profitability</div>
                        )}

                        {/* AI CO-PILOT TAB */}
                        {activeTab === 'copilot' && (
                            <div className="space-y-4">
                                <div className="glass-panel rounded-2xl p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="size-10 rounded-xl bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center"><span className="material-symbols-outlined text-white text-xl">smart_toy</span></div>
                                        <div><h3 className="text-sm font-bold text-white">AI Co-Pilot</h3><p className="text-[10px] text-slate-500">Ask anything about your store's performance</p></div>
                                    </div>
                                    {/* Suggested questions */}
                                    {copilotMessages.length === 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                                            {['Why did revenue change this week?', 'Which product should I push next?', 'How can I improve repeat rate?', 'What creative format works best?', 'Give me a growth strategy', 'Which customers are churning?'].map((q, i) => (
                                                <button key={i} onClick={() => { setCopilotInput(q); setTimeout(() => { setCopilotInput(q); document.getElementById('copilot-send')?.click() }, 100) }}
                                                    className="text-left p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-400 hover:bg-white/[0.06] hover:text-white transition-all cursor-pointer">💡 {q}</button>
                                            ))}
                                        </div>
                                    )}
                                    {/* Chat Messages */}
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                                        {copilotMessages.map((msg, i) => (
                                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-primary/20 text-white' : 'bg-white/[0.04] text-slate-300 border border-white/[0.06]'}`}>
                                                    <p className="leading-relaxed">{msg.text}</p>
                                                    {msg.actions?.length > 0 && (
                                                        <div className="mt-2 space-y-1">{msg.actions.map((a, j) => <p key={j} className="text-xs text-primary flex items-start gap-1"><span>→</span>{a}</p>)}</div>
                                                    )}
                                                    {msg.sources?.length > 0 && <p className="text-[10px] text-slate-500 mt-2">Sources: {msg.sources.join(', ')}</p>}
                                                </div>
                                            </div>
                                        ))}
                                        {copilotLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>Thinking...</div>}
                                    </div>
                                    {/* Input */}
                                    <div className="flex gap-2">
                                        <input value={copilotInput} onChange={e => setCopilotInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCopilotSend()}
                                            placeholder="Ask about your store..." className="flex-1 px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder-slate-500 outline-none focus:border-primary/40" />
                                        <button id="copilot-send" onClick={handleCopilotSend} disabled={copilotLoading || !copilotInput.trim()}
                                            className="px-4 py-3 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white font-bold text-sm hover:shadow-lg transition-all cursor-pointer disabled:opacity-50">
                                            <span className="material-symbols-outlined text-sm">send</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </DashboardLayout>
    )
}


// ═══════════════════════════════════════════════════════════════
// D2C STUDIO — Help Documentation View
// ═══════════════════════════════════════════════════════════════
const D2C_HELP_SECTIONS = [
    {
        id: 'getting-started',
        icon: 'rocket_launch',
        color: '#8b5cf6',
        title: 'Getting Started',
        subtitle: 'Connect your Shopify store and get started',
        steps: [
            { icon: 'storefront', title: 'Connect Shopify', description: 'Go to Integrations and connect your Shopify store. D2C Studio pulls real-time data from your store — orders, products, customers, and inventory.' },
            { icon: 'dashboard', title: 'Overview Dashboard', description: 'Once connected, the Overview tab shows your key KPIs: Revenue, Orders, AOV, Customers, Repeat Rate, and Refund Rate. Each card is color-coded with trend indicators.' },
            { icon: 'date_range', title: 'Time Range', description: 'Use the dropdown in the header to switch between 7, 30, 60, or 90 day views. All KPIs and insights update to reflect the selected period.' },
            { icon: 'sync', title: 'Refresh Data', description: 'Click the Refresh button to pull the latest data from Shopify. Data is cached for performance but can be force-refreshed anytime.' },
        ]
    },
    {
        id: 'products',
        icon: 'inventory_2',
        color: '#06b6d4',
        title: 'Product Intelligence',
        subtitle: 'Product health radar & performance tracking',
        steps: [
            { icon: 'radar', title: 'Product Health Radar', description: 'A visual radar shows your product portfolio health. Products are plotted based on sales velocity, revenue contribution, and inventory status. Hot 🟢, Warm 🟡, Cold 🔴 classification.' },
            { icon: 'speed', title: 'Velocity Scoring', description: 'Each product gets a velocity score based on sales frequency. High velocity = consistent sellers. Track velocity trends to identify rising and declining products.' },
            { icon: 'trending_down', title: 'Slow Movers', description: 'Easily identify products that aren\'t selling. The Products tab highlights cold products that may need promotion, discounting, or discontinuation.' },
            { icon: 'auto_awesome', title: 'AI Boost Plans', description: 'Click "Boost" on any product to generate an AI-powered marketing plan. The AI analyzes the product\'s data and creates a customized growth strategy.' },
        ]
    },
    {
        id: 'customers',
        icon: 'group',
        color: '#ec4899',
        title: 'Customer Analytics',
        subtitle: 'Understand your customers deeply',
        steps: [
            { icon: 'person', title: 'Customer Overview', description: 'See total customers, new vs returning, repeat purchase rate, and customer lifetime value metrics. Understand who your best customers are.' },
            { icon: 'autorenew', title: 'Repeat Rate', description: 'The repeat rate KPI is one of the most important D2C metrics. Above 20% is healthy. Below that, you need retention strategies. The AI Co-Pilot can help.' },
            { icon: 'monetization_on', title: 'AOV Analysis', description: 'Average Order Value tracking helps you understand purchasing behavior. Compare AOV across time periods to identify trends and optimize pricing.' },
        ]
    },
    {
        id: 'alerts',
        icon: 'warning',
        color: '#f43f5e',
        title: 'Red Flag Alerts',
        subtitle: 'Catch problems before they hurt your business',
        steps: [
            { icon: 'notification_important', title: 'Automatic Detection', description: 'D2C Studio continuously monitors your store data for anomalies: sudden revenue drops, high refund rates, inventory issues, declining repeat rates, and more.' },
            { icon: 'priority_high', title: 'Severity Levels', description: 'Alerts are classified as High (needs immediate action), Medium (investigate soon), and Low (monitor). High severity alerts have red borders, medium amber, low green.' },
            { icon: 'build', title: 'AI Recommendations', description: 'Each alert comes with AI-generated recommendations on how to fix the issue. These are specific, actionable steps tailored to your store\'s data.' },
        ]
    },
    {
        id: 'creative',
        icon: 'palette',
        color: '#f59e0b',
        title: 'Creative Cockpit & Advanced Tabs',
        subtitle: 'Creative performance, cohorts, and profitability',
        steps: [
            { icon: 'palette', title: 'Creative Cockpit', description: 'Track which product visuals and descriptions drive the most sales. Optimize your creative assets based on actual conversion data.' },
            { icon: 'timeline', title: 'Cohort & LTV', description: 'Cohort analysis shows customer retention over time. Lifetime Value projections help you understand how much each customer is worth and optimize acquisition costs.' },
            { icon: 'account_balance', title: 'Profitability', description: 'See your true profitability after COGS, shipping, returns, and marketing costs. Identify which products and channels are actually profitable.' },
        ]
    },
    {
        id: 'copilot',
        icon: 'smart_toy',
        color: '#10b981',
        title: 'AI Co-Pilot',
        subtitle: 'Ask anything about your store',
        steps: [
            { icon: 'chat', title: 'Chat Interface', description: 'The AI Co-Pilot tab opens a chat interface. Ask any question about your store: "Why did revenue drop last week?" "Which products should I discount?" "How can I improve repeat rate?"' },
            { icon: 'auto_awesome', title: 'Data-Grounded', description: 'The Co-Pilot has access to all your store data. Its answers are grounded in your actual metrics, not generic advice. It references specific products, time periods, and customer segments.' },
            { icon: 'lightbulb', title: 'Proactive Insights', description: 'The AI Insights panel automatically generates insights when you load the Overview. It identifies what\'s working, what\'s not, and provides an action plan without you having to ask.' },
        ]
    },
]

const D2C_PRO_TIPS = [
    { icon: '📊', tip: 'Check the Overview tab daily. Revenue trends and red flags are your early warning system.' },
    { icon: '🟢', tip: 'Focus on products with Hot health status. They\'re your money makers — double down on their promotion.' },
    { icon: '🔄', tip: 'Repeat Rate below 20%? Use AI Co-Pilot to generate a retention strategy tailored to your data.' },
    { icon: '🚨', tip: 'Never ignore High severity red flags. They indicate revenue-threatening issues that need immediate action.' },
    { icon: '🚀', tip: 'Use AI Boost Plans on cold products. The AI might find untapped potential you\'re missing.' },
    { icon: '💰', tip: 'Check Profitability tab monthly. Revenue growth means nothing if margins are shrinking.' },
]

function D2CHelpView({ onBack }) {
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
                            <span className="material-symbols-outlined text-primary">menu_book</span> D2C Studio Guide
                        </h2>
                        <p className="text-sm text-slate-500">Master Shopify intelligence and grow your D2C brand</p>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 mb-6" style={{ background: 'linear-gradient(135deg, #8b5cf608, #06b6d408, #ec489808)' }}>
                <h3 className="text-white font-bold mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary">info</span> What is D2C Studio?</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                    D2C Studio is your <strong className="text-white">Shopify intelligence hub</strong>.
                    It connects to your store and provides <strong className="text-white">real-time KPIs</strong>, a <strong className="text-white">product health radar</strong>,
                    <strong className="text-white"> customer analytics</strong>, <strong className="text-white">automated red flag alerts</strong>,
                    and an <strong className="text-white">AI Co-Pilot</strong> that knows your data.
                    From revenue tracking to profitability analysis, everything is AI-powered and brand-aware.
                </p>
                <div className="flex flex-wrap gap-2">
                    {['Shopify Connected', 'Real-time KPIs', 'Product Radar', 'Customer Insights', 'Red Flag Alerts', 'AI Co-Pilot', 'Cohort & LTV', 'Profitability'].map(t => (
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
                        { label: 'Connect Store', icon: 'storefront', color: '#8b5cf6' },
                        { label: 'Check KPIs', icon: 'dashboard', color: '#06b6d4' },
                        { label: 'Review Alerts', icon: 'warning', color: '#f43f5e' },
                        { label: 'Analyze Products', icon: 'inventory_2', color: '#f59e0b' },
                        { label: 'Ask AI', icon: 'smart_toy', color: '#10b981' },
                        { label: 'Take Action', icon: 'rocket_launch', color: '#ec4899' },
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
                {D2C_HELP_SECTIONS.map(section => (
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
                    {D2C_PRO_TIPS.map((tip, idx) => (
                        <div key={idx} className="flex gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-lg shrink-0 mt-0.5">{tip.icon}</span>
                            <p className="text-xs text-slate-400 leading-relaxed">{tip.tip}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="text-center mt-6 py-6">
                <p className="text-slate-500 text-sm mb-3">Ready to grow?</p>
                <button onClick={onBack} className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-purple-500 text-white cursor-pointer hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2 mx-auto">
                    <span className="material-symbols-outlined text-sm">dashboard</span> Go to Dashboard
                </button>
            </div>
        </div>
    )
}

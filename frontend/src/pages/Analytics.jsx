import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'
import { content as contentAPI, creatives as creativesAPI, dashboardSummary } from '../services/api'

export default function Analytics() {
    const { activeBrand } = useBrand()
    const { user } = useAuth()
    const [contentList, setContentList] = useState([])
    const [creativeList, setCreativeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [timeRange, setTimeRange] = useState('30d')
    const [radar, setRadar] = useState(null)
    const [radarLoading, setRadarLoading] = useState(true)
    const [activeRadarTab, setActiveRadarTab] = useState('sources')
    const [aiStrategy, setAiStrategy] = useState(null)
    const [strategyLoading, setStrategyLoading] = useState(false)
    const [radarHover, setRadarHover] = useState(null)

    // Load content & creative stats
    useEffect(() => {
        async function fetchData() {
            setLoading(true)
            try {
                const params = { limit: 50 }
                if (activeBrand?._id) params.brandId = activeBrand._id
                const [cData, crData] = await Promise.all([
                    contentAPI.list(params).catch(() => ({ content: [], total: 0 })),
                    creativesAPI.list(params).catch(() => ({ creatives: [], total: 0 })),
                ])
                setContentList(cData.content || [])
                setCreativeList(crData.creatives || [])
            } catch (err) { console.error(err) }
            finally { setLoading(false) }
        }
        fetchData()
    }, [activeBrand?._id])

    // Load radar data from dashboard summary
    const loadRadar = useCallback(async () => {
        setRadarLoading(true)
        try {
            const data = await dashboardSummary.get(activeBrand?._id)
            setRadar(data?.strikesRadar || null)
        } catch (e) { console.warn('Radar load error:', e.message) }
        finally { setRadarLoading(false) }
    }, [activeBrand?._id])

    useEffect(() => { loadRadar() }, [loadRadar])

    // Compute stats
    const totalContent = contentList.length
    const totalCreatives = creativeList.length
    const published = contentList.filter(c => c.status === 'published').length
    const drafts = contentList.filter(c => c.status === 'draft').length
    const avgScore = contentList.length > 0
        ? Math.round(contentList.reduce((s, c) => s + (c.aiMeta?.brandAlignmentScore || 0), 0) / contentList.length)
        : 0
    const typeBreakdown = contentList.reduce((acc, c) => { acc[c.type] = (acc[c.type] || 0) + 1; return acc }, {})

    // AI Strategy Generator
    const generateStrategy = async () => {
        if (!radar) return
        setStrategyLoading(true)
        try {
            const resp = await fetch('/api/dashboard-summary/strategy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({
                    brandId: activeBrand?._id,
                    radarData: radar,
                    contentStats: { totalContent, totalCreatives, published, drafts, avgScore, typeBreakdown },
                }),
            })
            const data = await resp.json()
            setAiStrategy(data.strategy || data)
        } catch (e) {
            setAiStrategy({
                summary: 'Based on your traffic data, here are strategic recommendations:',
                actions: [
                    { title: 'Double Down on Top Source', desc: `Your top traffic source is ${radar.sources?.[0]?.name} at ${radar.sources?.[0]?.value}%. Create more content optimized for this channel.`, priority: 'high', icon: 'trending_up' },
                    { title: 'Expand Geographic Reach', desc: `Your top location is ${radar.locations?.[0]?.name}. Consider local language content and geo-targeted campaigns for the next 3 cities.`, priority: 'medium', icon: 'public' },
                    { title: 'Mobile-First Content', desc: `${radar.devices?.find(d => d.name === 'Mobile')?.value || 60}% of traffic is mobile. Ensure your creatives are mobile-optimized with vertical formats.`, priority: 'high', icon: 'smartphone' },
                    { title: 'Gender-Balanced Messaging', desc: `Your audience is ${radar.gender?.[0]?.value}% ${radar.gender?.[0]?.name}. Consider creating content that resonates across demographics.`, priority: 'low', icon: 'diversity_3' },
                    { title: 'Reduce Bounce Rate', desc: `Your bounce rate is ${radar.bounceRate}%. Improve landing page loading speed and add engaging CTAs above the fold.`, priority: radar.bounceRate > 50 ? 'high' : 'medium', icon: 'speed' },
                ],
            })
        }
        finally { setStrategyLoading(false) }
    }

    const radarTabs = [
        { id: 'sources', label: '📡 Sources', icon: 'cell_tower' },
        { id: 'locations', label: '🌍 Locations', icon: 'public' },
        { id: 'demographics', label: '👥 Demographics', icon: 'diversity_3' },
        { id: 'devices', label: '📱 Devices', icon: 'devices' },
    ]

    const priorityColors = { high: 'text-rose-400 bg-rose-500/10 border-rose-500/20', medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20', low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }

    return (
        <DashboardLayout title="Analytics" subtitle="Platform-wide performance insights">
            <style>{`
                @keyframes radar-sweep { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
                @keyframes blip-ping { 0%,100% { opacity:0.4; transform: scale(0.8) } 50% { opacity:1; transform: scale(1.3) } }
                @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 0.5 } 50% { transform: scale(1.1); opacity: 1 } 100% { transform: scale(0.8); opacity: 0.5 } }
                .radar-sweep-arm { animation: radar-sweep 4s linear infinite }
                .radar-blip { animation: blip-ping 2s ease-in-out infinite }
                .pulse-ring { animation: pulse-ring 3s ease-in-out infinite }
            `}</style>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-6 gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Live</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <select value={timeRange} onChange={e => setTimeRange(e.target.value)}
                        className="input-glass py-2 px-3 rounded-xl text-xs bg-white/[0.04] cursor-pointer">
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                        <option value="all">All time</option>
                    </select>
                </div>
            </div>

            {/* ═══════════ STRIKES RADAR DEEP DIVE ═══════════ */}
            <div className="glass-panel rounded-2xl p-6 mb-6 border border-white/[0.06] overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-violet-500/20 flex items-center justify-center border border-rose-500/20">
                            <span className="material-symbols-outlined text-rose-400">radar</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Strikes Radar</h3>
                            <p className="text-xs text-slate-500">Real-time audience & traffic intelligence</p>
                        </div>
                    </div>
                    <button onClick={generateStrategy} disabled={strategyLoading || !radar}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary/20 to-violet-500/20 border border-primary/30 text-primary font-medium text-sm hover:from-primary/30 hover:to-violet-500/30 transition-all cursor-pointer disabled:opacity-50">
                        <span className="material-symbols-outlined text-sm">{strategyLoading ? 'progress_activity' : 'auto_awesome'}</span>
                        {strategyLoading ? 'Analyzing...' : 'Generate AI Strategy'}
                    </button>
                </div>

                {radarLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <span className="material-symbols-outlined animate-spin mr-2 text-2xl">progress_activity</span>
                        Loading radar data...
                    </div>
                ) : radar ? (
                    <>
                        {/* Key Metrics Row */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                            {[
                                { label: 'Total Visitors', value: radar.totalVisitors?.toLocaleString(), icon: 'group', color: '#8b5cf6', sub: 'this period' },
                                { label: 'Weekly Growth', value: `${radar.weeklyGrowth > 0 ? '+' : ''}${radar.weeklyGrowth}%`, icon: 'trending_up', color: radar.weeklyGrowth > 0 ? '#34d399' : '#f43f5e', sub: 'vs last week' },
                                { label: 'Bounce Rate', value: `${radar.bounceRate}%`, icon: 'exit_to_app', color: radar.bounceRate < 40 ? '#34d399' : '#f59e0b', sub: radar.bounceRate < 40 ? 'Excellent' : 'Needs work' },
                                { label: 'Avg Session', value: radar.avgSession, icon: 'timer', color: '#06b6d4', sub: 'duration' },
                                { label: 'Top Page', value: radar.topPage, icon: 'web', color: '#ec4899', sub: 'most visited' },
                            ].map((m, i) => (
                                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <span className="material-symbols-outlined text-sm" style={{ color: m.color }}>{m.icon}</span>
                                        <span className="text-xs text-slate-500">{m.label}</span>
                                    </div>
                                    <p className="text-xl font-extrabold text-white truncate">{m.value}</p>
                                    <p className="text-[10px] text-slate-600 mt-0.5">{m.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Radar Tabs */}
                        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-6 overflow-x-auto">
                            {radarTabs.map(tab => (
                                <button key={tab.id} onClick={() => setActiveRadarTab(tab.id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${activeRadarTab === tab.id ? 'bg-primary/15 text-white border border-primary/30' : 'text-slate-500 hover:text-slate-300'}`}>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[300px]">
                            {/* SOURCES TAB */}
                            {activeRadarTab === 'sources' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {/* Large Animated Radar */}
                                    <div className="flex items-center justify-center">
                                        <div className="relative" style={{ width: 280, height: 280 }}>
                                            <svg width="280" height="280" viewBox="0 0 280 280" className="absolute inset-0">
                                                <circle cx="140" cy="140" r="128" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                                <circle cx="140" cy="140" r="100" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                <circle cx="140" cy="140" r="72" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                                <circle cx="140" cy="140" r="44" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                                <circle cx="140" cy="140" r="16" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                                <line x1="140" y1="8" x2="140" y2="272" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                <line x1="8" y1="140" x2="272" y2="140" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                                                <line x1="46" y1="46" x2="234" y2="234" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                                                <line x1="234" y1="46" x2="46" y2="234" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
                                                <circle cx="140" cy="140" r="128" fill="none" stroke="rgba(52,211,153,0.12)" strokeWidth="2" />
                                            </svg>
                                            <svg width="280" height="280" viewBox="0 0 280 280" className="absolute inset-0 radar-sweep-arm">
                                                <defs>
                                                    <linearGradient id="sweepGradLg" gradientTransform="rotate(90)">
                                                        <stop offset="0%" stopColor="rgba(52,211,153,0.3)" />
                                                        <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                                                    </linearGradient>
                                                </defs>
                                                <path d="M140,140 L140,12 A128,128 0 0,1 260,90 Z" fill="url(#sweepGradLg)" />
                                                <line x1="140" y1="140" x2="140" y2="12" stroke="rgba(52,211,153,0.7)" strokeWidth="1.5" />
                                            </svg>
                                            <svg width="280" height="280" viewBox="0 0 280 280" className="absolute inset-0">
                                                {radar.sources?.map((src, i) => {
                                                    const angle = (i / radar.sources.length) * 2 * Math.PI - Math.PI / 2
                                                    const dist = 30 + (src.value / 100) * 95
                                                    const cx = 140 + Math.cos(angle) * dist
                                                    const cy = 140 + Math.sin(angle) * dist
                                                    const r = Math.max(4, src.value / 6)
                                                    return (
                                                        <g key={i} onMouseEnter={() => setRadarHover(`src-${i}`)} onMouseLeave={() => setRadarHover(null)} style={{ cursor: 'pointer' }}>
                                                            <circle cx={cx} cy={cy} r={r + 8} fill="none" stroke={src.color} strokeWidth="0.5" className="radar-blip" style={{ animationDelay: `${i * 300}ms` }} opacity="0.3" />
                                                            <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={src.color} strokeWidth="0.5" className="radar-blip" style={{ animationDelay: `${i * 300 + 150}ms` }} opacity="0.5" />
                                                            <circle cx={cx} cy={cy} r={r} fill={src.color} className="radar-blip" style={{ animationDelay: `${i * 300}ms` }} opacity={radarHover === `src-${i}` ? 1 : 0.85} />
                                                            {radarHover === `src-${i}` && (
                                                                <text x={cx} y={cy - r - 6} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{src.name}: {src.value}%</text>
                                                            )}
                                                        </g>
                                                    )
                                                })}
                                                <circle cx="140" cy="140" r="4" fill="#34d399" />
                                                <circle cx="140" cy="140" r="8" fill="none" stroke="#34d399" strokeWidth="0.5" opacity="0.5" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Sources Detail */}
                                    <div className="flex flex-col justify-center gap-3">
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Traffic by Source</h4>
                                        {radar.sources?.map((s, i) => {
                                            const isHover = radarHover === `src-${i}`
                                            return (
                                                <div key={i} className={`p-3 rounded-xl border transition-all cursor-default ${isHover ? 'bg-white/[0.04] border-white/[0.1]' : 'bg-white/[0.01] border-white/[0.04]'}`}
                                                    onMouseEnter={() => setRadarHover(`src-${i}`)} onMouseLeave={() => setRadarHover(null)}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="size-3 rounded-full" style={{ background: s.color, boxShadow: isHover ? `0 0 12px ${s.color}` : 'none' }} />
                                                            <span className={`text-sm font-medium transition-colors ${isHover ? 'text-white' : 'text-slate-300'}`}>{s.name}</span>
                                                        </div>
                                                        <span className="text-lg font-extrabold text-white">{s.value}%</span>
                                                    </div>
                                                    <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${s.value}%`, background: s.color }} />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* LOCATIONS TAB */}
                            {activeRadarTab === 'locations' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Traffic by Location</h4>
                                        <div className="space-y-3">
                                            {radar.locations?.map((loc, i) => (
                                                <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                                                            <span className="text-sm font-medium text-white">{loc.name}</span>
                                                        </div>
                                                        <span className="text-lg font-extrabold text-white">{loc.value}%</span>
                                                    </div>
                                                    <div className="h-2.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                        <div className="h-full rounded-full transition-all duration-700"
                                                            style={{ width: `${(loc.value / (radar.locations?.[0]?.value || 1)) * 100}%`, background: `linear-gradient(90deg, #8b5cf6, #06b6d4)` }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="p-5 rounded-xl bg-gradient-to-br from-violet-500/5 to-cyan-500/5 border border-violet-500/10">
                                            <h4 className="text-sm font-bold text-violet-400 flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-sm">lightbulb</span>Location Insights
                                            </h4>
                                            <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
                                                <p>• <strong className="text-white">{radar.locations?.[0]?.name}</strong> leads with {radar.locations?.[0]?.value}% of traffic</p>
                                                <p>• Top 3 locations account for <strong className="text-white">{(radar.locations?.[0]?.value || 0) + (radar.locations?.[1]?.value || 0) + (radar.locations?.[2]?.value || 0)}%</strong> of total audience</p>
                                                <p>• Consider regional campaigns and local language content for untapped markets</p>
                                            </div>
                                        </div>
                                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            <h4 className="text-sm font-bold text-white mb-3">🎯 Recommendation</h4>
                                            <p className="text-sm text-slate-400 leading-relaxed">Strengthen presence in <strong className="text-primary">{radar.locations?.[3]?.name || 'emerging cities'}</strong> and <strong className="text-primary">{radar.locations?.[4]?.name || 'beyond'}</strong> — these regions show growth potential with existing brand awareness.</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DEMOGRAPHICS TAB */}
                            {activeRadarTab === 'demographics' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Gender Distribution</h4>
                                        {/* Large Gender Bar */}
                                        <div className="flex h-8 rounded-xl overflow-hidden gap-1 mb-4">
                                            {radar.gender?.map((g, i) => (
                                                <div key={i} className="h-full flex items-center justify-center transition-all duration-500 hover:scale-y-110 cursor-default"
                                                    title={`${g.name}: ${g.value}%`}
                                                    style={{ width: `${g.value}%`, background: g.color, borderRadius: i === 0 ? '12px 0 0 12px' : i === radar.gender.length - 1 ? '0 12px 12px 0' : '0' }}>
                                                    <span className="text-xs font-bold text-white drop-shadow-md">{g.value}%</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {radar.gender?.map((g, i) => (
                                                <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] text-center">
                                                    <div className="size-10 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: `${g.color}20`, border: `1px solid ${g.color}40` }}>
                                                        <span className="material-symbols-outlined text-lg" style={{ color: g.color }}>
                                                            {g.name === 'Male' ? 'male' : g.name === 'Female' ? 'female' : 'diversity_1'}
                                                        </span>
                                                    </div>
                                                    <p className="text-2xl font-extrabold text-white">{g.value}%</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">{g.name}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="p-5 rounded-xl bg-gradient-to-br from-pink-500/5 to-blue-500/5 border border-pink-500/10">
                                            <h4 className="text-sm font-bold text-pink-400 flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-sm">psychology</span>Demographic Insights
                                            </h4>
                                            <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
                                                <p>• Primary audience: <strong className="text-white">{radar.gender?.[0]?.name} ({radar.gender?.[0]?.value}%)</strong></p>
                                                <p>• Gender ratio is {Math.abs((radar.gender?.[0]?.value || 50) - 50) < 10 ? 'relatively balanced' : 'skewed — consider diversifying content appeal'}</p>
                                                <p>• Tailor messaging tone based on primary demographic preferences</p>
                                            </div>
                                        </div>
                                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            <h4 className="text-sm font-bold text-white mb-3">💡 Content Tip</h4>
                                            <p className="text-sm text-slate-400 leading-relaxed">
                                                Create A/B test campaigns with messaging variants targeting different demographics.
                                                Your <strong className="text-primary">{radar.gender?.sort((a, b) => a.value - b.value)?.[0]?.name}</strong> audience segment at {radar.gender?.sort((a, b) => a.value - b.value)?.[0]?.value}% represents an untapped growth opportunity.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DEVICES TAB */}
                            {activeRadarTab === 'devices' && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    <div className="grid grid-cols-3 gap-4">
                                        {radar.devices?.map((d, i) => (
                                            <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-center hover:bg-white/[0.04] transition-all">
                                                <div className="size-16 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${d.color}15`, border: `1px solid ${d.color}30` }}>
                                                    <span className="material-symbols-outlined text-3xl" style={{ color: d.color }}>
                                                        {d.name === 'Mobile' ? 'smartphone' : d.name === 'Desktop' ? 'computer' : 'tablet'}
                                                    </span>
                                                </div>
                                                <p className="text-3xl font-extrabold text-white">{d.value}%</p>
                                                <p className="text-sm text-slate-500 mt-1">{d.name}</p>
                                                <div className="h-1.5 rounded-full bg-white/[0.04] mt-3 overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${d.value}%`, background: d.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-500/5 to-violet-500/5 border border-cyan-500/10">
                                            <h4 className="text-sm font-bold text-cyan-400 flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-sm">analytics</span>Device Insights
                                            </h4>
                                            <div className="space-y-2 text-sm text-slate-300 leading-relaxed">
                                                <p>• <strong className="text-white">{radar.devices?.[0]?.name}</strong> dominates at {radar.devices?.[0]?.value}% of sessions</p>
                                                <p>• {(radar.devices?.find(d => d.name === 'Mobile')?.value || 0) > 50 ? 'Mobile-first strategy is essential — optimize all content for vertical formats' : 'Desktop-heavy audience — long-form content performs well'}</p>
                                                <p>• Test responsive designs across all three device categories</p>
                                            </div>
                                        </div>
                                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                            <h4 className="text-sm font-bold text-white mb-3">📐 Format Guide</h4>
                                            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
                                                <div className="p-2 rounded-lg bg-white/[0.02]">
                                                    <p className="font-bold text-white">9:16</p>
                                                    <p>Reels/Shorts</p>
                                                </div>
                                                <div className="p-2 rounded-lg bg-white/[0.02]">
                                                    <p className="font-bold text-white">1:1</p>
                                                    <p>Posts/Carousels</p>
                                                </div>
                                                <div className="p-2 rounded-lg bg-white/[0.02]">
                                                    <p className="font-bold text-white">16:9</p>
                                                    <p>YouTube/Blog</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="text-center py-16">
                        <span className="material-symbols-outlined text-5xl text-slate-600 mb-3 block">radar</span>
                        <p className="text-slate-500">No radar data available yet. Check back after the dashboard loads.</p>
                    </div>
                )}
            </div>

            {/* ═══════════ AI STRATEGY ═══════════ */}
            {aiStrategy && (
                <div className="glass-panel rounded-2xl p-6 mb-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-violet-500/5">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="size-10 rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/30 flex items-center justify-center border border-primary/30">
                            <span className="material-symbols-outlined text-primary">auto_awesome</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">AI Strategy Recommendations</h3>
                            <p className="text-xs text-slate-500">{aiStrategy.summary}</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(aiStrategy.actions || []).map((action, i) => (
                            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                                <div className="flex items-start gap-3">
                                    <div className="size-9 rounded-lg bg-white/[0.05] flex items-center justify-center shrink-0 mt-0.5">
                                        <span className="material-symbols-outlined text-primary text-lg">{action.icon || 'lightbulb'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="text-sm font-bold text-white">{action.title}</p>
                                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${priorityColors[action.priority] || priorityColors.medium}`}>{action.priority}</span>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed">{action.desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════ CONTENT ANALYTICS ═══════════ */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <span className="material-symbols-outlined animate-spin mr-2 text-2xl">progress_activity</span>
                    Loading content analytics...
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        {[
                            { label: 'Total Content', value: totalContent, icon: 'article', color: 'text-primary' },
                            { label: 'Total Creatives', value: totalCreatives, icon: 'image', color: 'text-purple-400' },
                            { label: 'Published', value: published, icon: 'publish', color: 'text-emerald-400' },
                            { label: 'Drafts', value: drafts, icon: 'edit_note', color: 'text-amber-400' },
                            { label: 'Brand Alignment', value: avgScore ? `${avgScore}%` : '—', icon: 'verified', color: 'text-primary' },
                        ].map((s, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-5">
                                <span className={`material-symbols-outlined text-xl ${s.color} mb-2 block`}>{s.icon}</span>
                                <p className="text-2xl font-extrabold text-white">{s.value}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-12 gap-6">
                        <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6">
                            <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-primary">pie_chart</span> Content by Type
                            </h3>
                            {Object.keys(typeBreakdown).length > 0 ? (
                                <div className="space-y-3">
                                    {Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                                        const pct = Math.round((count / totalContent) * 100)
                                        const colors = { social: '#2B4BEE', blog: '#8B5CF6', ad: '#F59E0B', email: '#10B981', seo: '#EF4444', caption: '#06B6D4' }
                                        return (
                                            <div key={type}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm text-white capitalize font-medium">{type}</span>
                                                    <span className="text-sm text-slate-400">{count} ({pct}%)</span>
                                                </div>
                                                <div className="w-full h-2 rounded-full bg-white/[0.05]">
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[type] || '#2B4BEE' }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : <p className="text-slate-500 text-sm text-center py-8">No content data yet.</p>}
                        </div>

                        <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6">
                            <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-primary">psychology</span> AI Performance
                            </h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-white/[0.03] text-center">
                                        <p className="text-2xl font-extrabold text-primary">{avgScore || '—'}%</p>
                                        <p className="text-sm text-slate-500 mt-1">Avg Brand Alignment</p>
                                    </div>
                                    <div className="p-4 rounded-xl bg-white/[0.03] text-center">
                                        <p className="text-2xl font-extrabold text-emerald-400">{activeBrand?.aiContext?.totalFeedback || 0}</p>
                                        <p className="text-sm text-slate-500 mt-1">Feedback Signals</p>
                                    </div>
                                </div>
                                <div className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10">
                                    <p className="text-sm text-primary font-bold mb-1">📈 AI Improvement</p>
                                    <p className="text-sm text-slate-400 leading-relaxed">
                                        {(activeBrand?.aiContext?.totalFeedback || 0) > 10
                                            ? 'AI has enough feedback to produce brand-aligned content.'
                                            : 'Keep providing feedback — AI improves after ~10 interactions.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </DashboardLayout>
    )
}

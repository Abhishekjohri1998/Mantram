import { useState, useEffect } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, creatives as creativesAPI } from '../services/api'

export default function Analytics() {
    const { activeBrand, brands, selectBrand } = useBrand()
    const [contentList, setContentList] = useState([])
    const [creativeList, setCreativeList] = useState([])
    const [loading, setLoading] = useState(true)
    const [timeRange, setTimeRange] = useState('30d')

    useEffect(() => {
        async function fetch() {
            setLoading(true)
            try {
                const [cData, crData] = await Promise.all([
                    contentAPI.list({ limit: 50 }).catch(() => ({ content: [], total: 0 })),
                    creativesAPI.list({ limit: 50 }).catch(() => ({ creatives: [], total: 0 })),
                ])
                setContentList(cData.content || [])
                setCreativeList(crData.creatives || [])
            } catch (err) { console.error(err) }
            finally { setLoading(false) }
        }
        fetch()
    }, [activeBrand])

    // Compute analytics from real data
    const totalContent = contentList.length
    const totalCreatives = creativeList.length
    const published = contentList.filter(c => c.status === 'published').length
    const drafts = contentList.filter(c => c.status === 'draft').length
    const avgScore = contentList.length > 0
        ? Math.round(contentList.reduce((s, c) => s + (c.aiMeta?.brandAlignmentScore || 0), 0) / contentList.length)
        : 0

    const typeBreakdown = contentList.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1
        return acc
    }, {})

    return (
        <DashboardLayout>
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">
                        <span className="text-primary">Analytics</span>
                    </h2>
                    <p className="text-slate-400 text-sm">Content performance and AI generation insights.</p>
                </div>
                <div className="flex items-center gap-3">
                    <select value={timeRange} onChange={e => setTimeRange(e.target.value)}
                        className="input-glass py-2 px-3 rounded-xl text-xs bg-white/[0.04] cursor-pointer">
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                        <option value="all">All time</option>
                    </select>
                    <select value={activeBrand?._id || ''} onChange={e => { const b = brands.find(b => b._id === e.target.value); if (b) selectBrand(b) }}
                        className="input-glass py-2 px-3 rounded-xl text-xs bg-white/[0.04] cursor-pointer">
                        {brands.length === 0 && <option value="">No brands</option>}
                        {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <span className="material-symbols-outlined animate-spin mr-2 text-2xl">progress_activity</span>
                    Loading analytics...
                </div>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                        {[
                            { label: 'Total Content', value: totalContent, icon: 'article', color: 'text-primary' },
                            { label: 'Total Creatives', value: totalCreatives, icon: 'image', color: 'text-purple-400' },
                            { label: 'Published', value: published, icon: 'publish', color: 'text-emerald-400' },
                            { label: 'Drafts', value: drafts, icon: 'edit_note', color: 'text-amber-400' },
                            { label: 'Brand Alignment', value: avgScore ? `${avgScore}%` : '—', icon: 'verified', color: 'text-primary' },
                        ].map((s, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                                <span className={`material-symbols-outlined text-xl ${s.color} mb-2 block`}>{s.icon}</span>
                                <p className="text-2xl font-extrabold text-white">{s.value}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-12 gap-6">
                        {/* Content Type Breakdown */}
                        <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '200ms' }}>
                            <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-primary">pie_chart</span> Content by Type
                            </h3>
                            {Object.keys(typeBreakdown).length > 0 ? (
                                <div className="space-y-3">
                                    {Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]).map(([type, count], i) => {
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
                            ) : (
                                <p className="text-slate-500 text-sm text-center py-8">No content data yet.</p>
                            )}
                        </div>

                        {/* AI Performance */}
                        <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '280ms' }}>
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
                                            ? 'The AI has received enough feedback to start producing noticeably better content aligned with your brand.'
                                            : 'Keep using the Content Studio and providing feedback — the AI improves after ~10 interactions.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Recent Content Table */}
                        <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '360ms' }}>
                            <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-primary">history</span> Recent Content
                            </h3>
                            {contentList.length === 0 ? (
                                <p className="text-slate-500 text-sm text-center py-8">No content generated yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    <div className="grid grid-cols-12 text-sm text-slate-500 uppercase tracking-widest font-bold px-4 py-2">
                                        <div className="col-span-1">Type</div>
                                        <div className="col-span-5">Preview</div>
                                        <div className="col-span-2">Status</div>
                                        <div className="col-span-2">Score</div>
                                        <div className="col-span-2">Created</div>
                                    </div>
                                    {contentList.slice(0, 10).map((c, i) => (
                                        <div key={c._id} className="grid grid-cols-12 items-center p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                            <div className="col-span-1">
                                                <span className="material-symbols-outlined text-primary text-sm">
                                                    {c.type === 'social' ? 'share' : c.type === 'blog' ? 'article' : c.type === 'ad' ? 'campaign' : 'description'}
                                                </span>
                                            </div>
                                            <div className="col-span-5">
                                                <p className="text-sm text-white truncate">{c.content?.substring(0, 60)}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.status === 'published' ? 'bg-emerald-400/10 text-emerald-400' :
                                                        c.status === 'approved' ? 'bg-primary/10 text-primary' :
                                                            'bg-slate-500/10 text-slate-500'
                                                    }`}>{c.status}</span>
                                            </div>
                                            <div className="col-span-2">
                                                {c.aiMeta?.brandAlignmentScore ? (
                                                    <span className="text-sm text-emerald-400 font-bold">{c.aiMeta.brandAlignmentScore}%</span>
                                                ) : <span className="text-sm text-slate-500">—</span>}
                                            </div>
                                            <div className="col-span-2">
                                                <span className="text-sm text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </DashboardLayout>
    )
}

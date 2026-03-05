import { useState, useEffect } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { credits as creditsAPI, payments as paymentsAPI } from '../services/api'

const ACTION_ICONS = {
    content: 'edit_note', contentRefine: 'auto_fix',
    creative: 'palette', photoshoot: 'photo_camera',
    seoHealthCheck: 'health_and_safety', seoTraffic: 'trending_up',
    seoCompetitors: 'groups', seoAiVisibility: 'visibility',
    seoAsk: 'forum', seoAuditPage: 'fact_check',
    seoCompetitorDiscover: 'person_search',
    brainstorm: 'psychology', brainstormRefine: 'auto_fix_high',
    brainstormChat: 'chat', brainstormScreenplay: 'movie',
    trendRefresh: 'trending_up',
}

const ACTION_COLORS = {
    content: 'indigo', contentRefine: 'indigo',
    creative: 'pink', photoshoot: 'pink',
    seoHealthCheck: 'emerald', seoTraffic: 'emerald', seoCompetitors: 'emerald',
    seoAiVisibility: 'emerald', seoAsk: 'emerald', seoAuditPage: 'emerald', seoCompetitorDiscover: 'emerald',
    brainstorm: 'amber', brainstormRefine: 'amber', brainstormChat: 'amber', brainstormScreenplay: 'amber',
    trendRefresh: 'cyan',
}

export default function CreditsPage() {
    const [summary, setSummary] = useState(null)
    const [usage, setUsage] = useState([])
    const [usageTotal, setUsageTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('overview')

    useEffect(() => { loadSummary(); loadUsage() }, [])
    useEffect(() => { loadUsage() }, [page])

    const loadSummary = async () => {
        try {
            const data = await creditsAPI.summary()
            setSummary(data)
        } catch (e) { console.error(e) } finally { setLoading(false) }
    }

    const loadUsage = async () => {
        try {
            const data = await creditsAPI.usage({ page, limit: 15 })
            setUsage(data.records || [])
            setUsageTotal(data.total || 0)
            setPages(data.pages || 1)
        } catch (e) { console.error(e) }
    }

    const [packages, setPackages] = useState([])
    const [packagesLoading, setPackagesLoading] = useState(false)

    useEffect(() => {
        if (tab === 'plans' && packages.length === 0) {
            loadPackages()
        }
    }, [tab])

    const loadPackages = async () => {
        setPackagesLoading(true)
        try {
            const { packages: pkgs } = await paymentsAPI.getPackages()
            setPackages(pkgs)
        } catch (e) { console.error(e) } finally { setPackagesLoading(false) }
    }

    const handleUpgrade = async (pkg) => {
        try {
            const { orderId, amount, currency } = await paymentsAPI.createOrder(pkg._id)

            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_live_SNWgwltU4JKol6',
                amount,
                currency,
                name: 'Mantram AI',
                description: `Upgrade to ${pkg.name} Plan`,
                order_id: orderId,
                handler: async (response) => {
                    try {
                        await paymentsAPI.verify({
                            ...response,
                            packageId: pkg._id,
                            billingCycle: 'monthly'
                        })
                        alert(`Successfully upgraded to ${pkg.name}!`)
                        window.location.reload()
                    } catch (e) {
                        alert('Payment verification failed: ' + e.message)
                    }
                },
                prefill: {
                    name: summary?.userName,
                    email: summary?.userEmail,
                },
                theme: { color: '#2b4bee' }
            }

            const rzp = new window.Razorpay(options)
            rzp.open()
        } catch (e) {
            alert('Failed to initialize payment: ' + e.message)
        }
    }

    const balance = summary?.balance
    const creditPercent = balance && !balance.unlimited ? Math.min(100, (balance.remaining / balance.total) * 100) : 100
    const creditColor = creditPercent > 50 ? 'emerald' : creditPercent > 20 ? 'amber' : 'rose'

    const formatTime = (dateStr) => {
        const d = new Date(dateStr)
        const now = new Date()
        const diff = now - d
        if (diff < 60000) return 'Just now'
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    }

    return (
        <DashboardLayout title="Credit Usage" subtitle="Track your AI generation credits">
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Top Balance Card */}
                    <div className="glass-panel rounded-2xl border border-white/[0.08] p-6">
                        <div className="flex flex-wrap items-center gap-8">
                            {/* Main balance */}
                            <div className="flex-1 min-w-[200px]">
                                <p className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1">Credit Balance</p>
                                {balance?.unlimited ? (
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-3xl text-amber-400">all_inclusive</span>
                                        <span className="text-3xl font-black text-amber-400">Unlimited</span>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-4xl font-black text-${creditColor}-400`}>{balance?.remaining || 0}</span>
                                            <span className="text-lg text-slate-600 font-medium">/ {balance?.total || 0}</span>
                                            <span className="text-sm text-slate-600">credits remaining</span>
                                        </div>
                                        <div className="mt-3 w-full max-w-md h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 bg-${creditColor}-500`}
                                                style={{ width: `${creditPercent}%` }}
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600">
                                            {balance?.used || 0} credits used this cycle • {balance?.total ? Math.round(((balance.used || 0) / balance.total) * 100) : 0}% consumed
                                        </p>
                                    </>
                                )}
                            </div>

                            {/* Quick Stats */}
                            <div className="flex gap-4">
                                {[
                                    { label: 'Today', value: summary?.today?.credits || 0, sub: `${summary?.today?.operations || 0} ops`, icon: 'today', color: 'indigo' },
                                    { label: 'This Week', value: summary?.week?.credits || 0, sub: `${summary?.week?.operations || 0} ops`, icon: 'date_range', color: 'cyan' },
                                    { label: 'This Month', value: summary?.month?.credits || 0, sub: `${summary?.month?.operations || 0} ops`, icon: 'calendar_month', color: 'purple' },
                                ].map(s => (
                                    <div key={s.label} className="text-center p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] min-w-[120px]">
                                        <span className={`material-symbols-outlined text-xl text-${s.color}-400 mb-1`}>{s.icon}</span>
                                        <p className="text-xl font-black text-white">{s.value}</p>
                                        <p className="text-sm text-slate-500 uppercase font-bold">{s.label}</p>
                                        <p className="text-xs text-slate-600">{s.sub}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2">
                        {['overview', 'plans', 'history'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'text-slate-400 hover:bg-white/[0.04] border border-transparent'
                                    }`}
                            >
                                {t === 'overview' ? '📊 Usage Breakdown' : t === 'plans' ? '💎 Upgrade Plans' : '📋 Transaction History'}
                            </button>
                        ))}
                    </div>

                    {tab === 'overview' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Usage by Action */}
                            <div className="glass-panel rounded-2xl border border-white/[0.08] p-6">
                                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-lg text-primary">pie_chart</span>
                                    Credits by Operation
                                </h3>
                                {(summary?.byAction || []).length === 0 ? (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">analytics</span>
                                        <p className="text-sm text-slate-500">No usage data yet</p>
                                        <p className="text-xs text-slate-600 mt-1">Credits used for AI operations will appear here</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {summary.byAction.map(a => {
                                            const maxCredits = Math.max(...summary.byAction.map(x => x.total))
                                            const pct = maxCredits > 0 ? (a.total / maxCredits) * 100 : 0
                                            const color = ACTION_COLORS[a._id] || 'slate'
                                            return (
                                                <div key={a._id} className="group">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`material-symbols-outlined text-sm text-${color}-400`}>
                                                                {ACTION_ICONS[a._id] || 'token'}
                                                            </span>
                                                            <span className="text-sm text-slate-300 font-medium">{a.description || a._id}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-slate-500">{a.count} ops</span>
                                                            <span className={`text-xs font-bold text-${color}-400`}>{a.total}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full bg-${color}-500/60 transition-all duration-500`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Daily Trend */}
                            <div className="glass-panel rounded-2xl border border-white/[0.08] p-6">
                                <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-lg text-cyan-400">show_chart</span>
                                    Daily Usage (Last 7 Days)
                                </h3>
                                {(summary?.dailyTrend || []).length === 0 ? (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">timeline</span>
                                        <p className="text-sm text-slate-500">No trend data yet</p>
                                        <p className="text-xs text-slate-600 mt-1">Daily credit usage will show here after your first operations</p>
                                    </div>
                                ) : (
                                    <div className="flex items-end gap-2 h-40">
                                        {(() => {
                                            const maxVal = Math.max(...summary.dailyTrend.map(d => d.total), 1)
                                            return summary.dailyTrend.map(d => {
                                                const h = Math.max(8, (d.total / maxVal) * 100)
                                                const day = new Date(d._id).toLocaleDateString('en-IN', { weekday: 'short' })
                                                return (
                                                    <div key={d._id} className="flex-1 flex flex-col items-center gap-1">
                                                        <span className="text-sm text-slate-500 font-bold">{d.total}</span>
                                                        <div className="w-full rounded-t-md bg-primary/30 hover:bg-primary/50 transition-all"
                                                            style={{ height: `${h}%` }} />
                                                        <span className="text-xs text-slate-600 font-medium">{day}</span>
                                                    </div>
                                                )
                                            })
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : tab === 'plans' ? (
                        <div className="space-y-6">
                            {packagesLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {packages.map((pkg) => (
                                        <div key={pkg._id} className={`glass-panel p-6 rounded-2xl border transition-all hover:scale-[1.02] flex flex-col ${pkg.slug === balance?.plan ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-white/[0.08]'}`}>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between mb-4">
                                                    <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
                                                    {pkg.slug === balance?.plan && <span className="badge badge-primary scale-75 origin-right">Current</span>}
                                                </div>
                                                <p className="text-sm text-slate-500 mb-6">{pkg.description}</p>
                                                <div className="mb-6">
                                                    <span className="text-3xl font-black text-white">{pkg.pricing.currency === 'INR' ? '₹' : '$'}{pkg.pricing.monthly}</span>
                                                    <span className="text-slate-500 text-sm">/mo</span>
                                                </div>
                                                <ul className="space-y-3 mb-8">
                                                    <li className="flex items-center gap-2 text-sm text-slate-300">
                                                        <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                                                        {pkg.credits.monthly} Credits / mo
                                                    </li>
                                                    <li className="flex items-center gap-2 text-sm text-slate-300">
                                                        <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                                                        {pkg.limits.brands} Brand Profiles
                                                    </li>
                                                    {pkg.features.map((f, j) => (
                                                        <li key={j} className="flex items-center gap-2 text-sm text-slate-300">
                                                            <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                                                            {f.name || f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                            <button
                                                disabled={pkg.slug === balance?.plan}
                                                onClick={() => handleUpgrade(pkg)}
                                                className={`w-full py-3 rounded-xl font-bold text-sm text-center block transition-all cursor-pointer ${pkg.slug === balance?.plan
                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                                                    : 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-light'
                                                    }`}
                                            >
                                                {pkg.slug === balance?.plan ? 'Current Plan' : 'Upgrade Now'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Transaction History */
                        <div className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
                            <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg text-primary">receipt_long</span>
                                    Recent Transactions
                                    <span className="text-sm text-slate-500 font-normal ml-1">({usageTotal} total)</span>
                                </h3>
                            </div>

                            {usage.length === 0 ? (
                                <div className="p-12 text-center">
                                    <span className="material-symbols-outlined text-5xl text-slate-700">receipt_long</span>
                                    <p className="text-sm text-slate-500 mt-2">No transactions yet</p>
                                    <p className="text-xs text-slate-600">Start using AI features to see your credit history</p>
                                </div>
                            ) : (
                                <>
                                    <div className="divide-y divide-white/[0.04]">
                                        {usage.map((u, i) => {
                                            const color = ACTION_COLORS[u.action] || 'slate'
                                            return (
                                                <div key={u._id || i} className="px-4 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                                                    <div className={`size-9 rounded-lg bg-${color}-500/10 flex items-center justify-center flex-shrink-0`}>
                                                        <span className={`material-symbols-outlined text-lg text-${color}-400`}>
                                                            {ACTION_ICONS[u.action] || 'token'}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-white font-medium truncate">{u.description || u.action}</p>
                                                        <p className="text-xs text-slate-600 truncate">
                                                            {u.metadata?.route || ''} {u.metadata?.brandName ? `• ${u.metadata.brandName}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-sm font-bold text-rose-400">-{u.cost}</p>
                                                        <p className="text-xs text-slate-600">{formatTime(u.createdAt)}</p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 w-16">
                                                        <p className="text-sm text-slate-500">Balance</p>
                                                        <p className="text-xs font-bold text-slate-400">{u.balanceAfter}</p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    {pages > 1 && (
                                        <div className="p-4 border-t border-white/[0.06] flex items-center justify-between">
                                            <p className="text-sm text-slate-500">
                                                Page {page} of {pages} ({usageTotal} records)
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                                    disabled={page <= 1}
                                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] disabled:opacity-30 transition-all"
                                                >← Previous</button>
                                                <button
                                                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                                                    disabled={page >= pages}
                                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] disabled:opacity-30 transition-all"
                                                >Next →</button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </DashboardLayout>
    )
}

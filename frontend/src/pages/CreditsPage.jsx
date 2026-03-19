import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { credits as creditsAPI, payments as paymentsAPI, rewards as rewardsAPI } from '../services/api'

const ACTION_ICONS = {
    content: 'edit_note', contentRefine: 'auto_fix',
    creative: 'palette', photoshoot: 'photo_camera',
    seoHealthCheck: 'health_and_safety', seoTraffic: 'trending_up',
    seoCompetitors: 'groups', seoAiVisibility: 'visibility',
    seoAsk: 'forum', seoAuditPage: 'fact_check',
    seoCompetitorDiscover: 'person_search',
    brainstorm: 'psychology', brainstormRefine: 'auto_fix_high',
    brainstormChat: 'chat', brainstormScreenplay: 'movie',
    trendRefresh: 'trending_up', videoGenerate: 'movie',
    videoEdit: 'movie_edit', videoBrainstorm: 'movie',
    voiceClone: 'mic', voiceTranscribe: 'record_voice_over',
    canvasGenerate: 'brush', canvasBgRemove: 'auto_fix_high', canvasExtend: 'aspect_ratio',
    adCreative: 'campaign', socialMedia: 'share', socialMediaCalendar: 'calendar_month',
    socialMediaAudit: 'checklist', socialMediaCompetitor: 'groups', socialMediaScore: 'score',
}

const ACTION_COLORS = {
    content: 'indigo', contentRefine: 'indigo',
    creative: 'pink', photoshoot: 'pink',
    seoHealthCheck: 'emerald', seoTraffic: 'emerald', seoCompetitors: 'emerald',
    seoAiVisibility: 'emerald', seoAsk: 'emerald', seoAuditPage: 'emerald', seoCompetitorDiscover: 'emerald',
    brainstorm: 'amber', brainstormRefine: 'amber', brainstormChat: 'amber', brainstormScreenplay: 'amber',
    trendRefresh: 'cyan', videoGenerate: 'purple', videoEdit: 'purple', videoBrainstorm: 'purple',
    voiceClone: 'rose', voiceTranscribe: 'rose',
    canvasGenerate: 'fuchsia', canvasBgRemove: 'fuchsia', canvasExtend: 'fuchsia',
    adCreative: 'orange', socialMedia: 'sky', socialMediaCalendar: 'sky',
    socialMediaAudit: 'sky', socialMediaCompetitor: 'sky', socialMediaScore: 'sky',
}

export default function CreditsPage() {
    const [summary, setSummary] = useState(null)
    const [usage, setUsage] = useState([])
    const [usageTotal, setUsageTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('overview')

    // Top-up state (Kling-style promo + standard sections)
    const [promoPacks, setPromoPacks] = useState([])
    const [standardPacks, setStandardPacks] = useState([])
    const [isFirstPurchase, setIsFirstPurchase] = useState(false)

    // Rewards state
    const [rewardStatus, setRewardStatus] = useState(null)
    const [referralInput, setReferralInput] = useState('')
    const [referralMsg, setReferralMsg] = useState('')

    // Daily reward toast
    const [dailyToast, setDailyToast] = useState(null)

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

    // Check for daily reward on mount
    useEffect(() => {
        (async () => {
            try {
                const data = await creditsAPI.balance()
                if (data.dailyReward?.awarded) {
                    setDailyToast(data.dailyReward)
                    setTimeout(() => setDailyToast(null), 6000)
                }
            } catch { }
        })()
    }, [])

    // Plans tab
    const [packages, setPackages] = useState([])
    const [packagesLoading, setPackagesLoading] = useState(false)

    useEffect(() => {
        if (tab === 'plans' && packages.length === 0) loadPackages()
        if (tab === 'topup' && standardPacks.length === 0) loadTopupPacks()
        if (tab === 'rewards' && !rewardStatus) loadRewards()
    }, [tab])

    const loadPackages = async () => {
        setPackagesLoading(true)
        try {
            const { packages: pkgs } = await paymentsAPI.getPackages()
            setPackages(pkgs)
        } catch (e) { console.error(e) } finally { setPackagesLoading(false) }
    }

    const loadTopupPacks = async () => {
        try {
            const data = await paymentsAPI.getTopupPacks()
            setPromoPacks(data.promoPacks || [])
            setStandardPacks(data.standardPacks || [])
            setIsFirstPurchase(data.isFirstPurchase || false)
        } catch (e) { console.error(e) }
    }

    const loadRewards = async () => {
        try {
            const data = await rewardsAPI.status()
            setRewardStatus(data)
        } catch (e) { console.error(e) }
    }

    const handleUpgrade = async (pkg) => {
        try {
            const { orderId, amount, currency } = await paymentsAPI.createOrder(pkg._id)
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                amount,
                currency,
                name: 'Mantram AI',
                description: `Upgrade to ${pkg.name} Plan`,
                order_id: orderId,
                handler: async (response) => {
                    try {
                        await paymentsAPI.verify({ ...response, packageId: pkg._id, billingCycle: 'monthly' })
                        alert(`Successfully upgraded to ${pkg.name}!`)
                        window.location.reload()
                    } catch (e) { alert('Payment verification failed: ' + e.message) }
                },
                prefill: { name: summary?.userName, email: summary?.userEmail },
                theme: { color: '#2b4bee' }
            }
            const rzp = new window.Razorpay(options)
            rzp.open()
        } catch (e) { alert('Failed to initialize payment: ' + e.message) }
    }

    const handleTopup = async (pack) => {
        try {
            const { orderId, amount, currency, creditsToAdd } = await paymentsAPI.createTopupOrder(pack.id)
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                amount,
                currency,
                name: 'Mantram AI',
                description: `Buy ${creditsToAdd} AI Credits`,
                order_id: orderId,
                handler: async (response) => {
                    try {
                        await paymentsAPI.verifyTopup({ ...response, packId: pack.id })
                        alert(`Successfully added ${creditsToAdd} credits!`)
                        window.location.reload()
                    } catch (e) { alert('Top-up verification failed: ' + e.message) }
                },
                prefill: { name: summary?.userName, email: summary?.userEmail },
                theme: { color: '#f59e0b' }
            }
            const rzp = new window.Razorpay(options)
            rzp.open()
        } catch (e) { alert('Failed to initialize top-up: ' + e.message) }
    }

    const handleClaimMilestone = async (id) => {
        try {
            const data = await rewardsAPI.claimMilestone(id)
            alert(data.message)
            loadRewards()
            loadSummary()
        } catch (e) { alert(e.message) }
    }

    const handleApplyReferral = async () => {
        if (!referralInput.trim()) return
        try {
            const data = await rewardsAPI.applyReferral(referralInput.trim())
            setReferralMsg(data.message)
            setReferralInput('')
            loadRewards()
            loadSummary()
        } catch (e) { setReferralMsg(e.message) }
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
            <SEOHead title="Credit Usage — Mantram AI" noIndex={true} />

            {/* Daily Reward Toast */}
            {dailyToast && (
                <div className="fixed top-4 right-4 z-50 animate-slide-in bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white rounded-2xl px-6 py-4 shadow-2xl shadow-amber-500/30 flex items-center gap-3 max-w-sm">
                    <span className="material-symbols-outlined text-2xl animate-pulse">local_fire_department</span>
                    <div>
                        <p className="font-bold text-sm">{dailyToast.message}</p>
                        <p className="text-xs opacity-80">🔥 Streak: {dailyToast.streak} days</p>
                    </div>
                    <button onClick={() => setDailyToast(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
                </div>
            )}

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
                                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                                            <div className="flex items-baseline gap-2">
                                                <span className={`text-4xl font-black text-${creditColor}-400`}>{balance?.remaining || 0}</span>
                                                <span className="text-lg text-slate-600 font-medium">/ {balance?.total || 0}</span>
                                                <span className="text-sm text-slate-600">Total Credits</span>
                                            </div>
                                            {balance?.bonus > 0 && (
                                                <div className="px-2 py-0.5 rounded-md bg-amber-400/10 border border-amber-400/20">
                                                    <span className="text-xs font-bold text-amber-400">+{balance.bonus} Bonus</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-3 w-full max-w-md h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 bg-${creditColor}-500`}
                                                style={{ width: `${creditPercent}%` }}
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-slate-600">
                                            {balance?.bonusUsed || 0} / {balance?.bonus || 0} bonus used • {balance?.used || 0} used this cycle
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
                    <div className="flex gap-2 flex-wrap">
                        {['overview', 'plans', 'topup', 'rewards', 'history'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'text-slate-400 hover:bg-white/[0.04] border border-transparent'
                                    }`}
                            >
                                {t === 'overview' ? '📊 Usage Breakdown' : t === 'plans' ? '💎 Upgrade Plans' : t === 'topup' ? '⚡ Quick Top-up' : t === 'rewards' ? '🎯 Rewards' : '📋 History'}
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

                    ) : tab === 'topup' ? (
                        /* ══════════ Top-Up Store (Kling-inspired) ══════════ */
                        <div className="space-y-6">
                            {/* First Purchase Banner */}
                            {isFirstPurchase && (
                                <div className="bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-500/30 p-6 rounded-2xl flex items-center gap-4">
                                    <span className="material-symbols-outlined text-4xl text-amber-400 animate-pulse">celebration</span>
                                    <div>
                                        <h3 className="text-lg font-black text-amber-400">🎉 First Purchase — 2× Credits!</h3>
                                        <p className="text-sm text-slate-400">Your first top-up gets double credits. This offer applies once, on any pack.</p>
                                    </div>
                                </div>
                            )}

                            {/* ── Promo Section (Kling-style green border) ── */}
                            {promoPacks.length > 0 && (
                                <div className="bg-gradient-to-r from-emerald-500/10 to-green-500/5 border border-emerald-500/30 rounded-2xl p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="material-symbols-outlined text-2xl text-emerald-400">diamond</span>
                                        <div>
                                            <h3 className="text-lg font-black text-emerald-400">◆ Exclusive Promo For You ◆</h3>
                                            <p className="text-xs text-slate-400">Limited time offers. Credits purchased via promo are valid for 31 days.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {promoPacks.map(pack => (
                                            <div key={pack.id} className="bg-emerald-500/5 border-2 border-emerald-500/30 rounded-xl p-5 flex flex-col hover:border-emerald-400/50 transition-all">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-2xl text-emerald-400">{pack.icon}</span>
                                                        <span className="text-2xl font-black text-emerald-400">{pack.total?.toLocaleString()}</span>
                                                    </div>
                                                    {pack.promoLabel && (
                                                        <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-[10px] font-black text-white uppercase tracking-wider">
                                                            {pack.promoLabel}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 mb-2">
                                                    ₹{pack.perCredit} / credit, valid for {pack.validityDays} days
                                                </p>
                                                {pack.promoOriginalPrice > 0 && (
                                                    <p className="text-xs text-slate-600 line-through mb-1">₹{pack.promoOriginalPrice?.toLocaleString()}</p>
                                                )}
                                                <div className="flex items-center justify-between mt-auto pt-3">
                                                    <span className="text-xl font-black text-white">₹ {pack.price?.toLocaleString()}</span>
                                                    <button
                                                        onClick={() => handleTopup(pack)}
                                                        className="px-5 py-2 rounded-lg text-sm font-bold bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all"
                                                    >
                                                        Purchase
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Note */}
                            <p className="text-xs text-slate-500 text-center">
                                Credits cannot be exchanged for memberships, nor refunded, transferred, or withdrawn.
                                {' '}<span className="text-primary cursor-pointer hover:underline">Credits Policy</span>
                            </p>

                            {/* ── Standard Packs (8-tier grid) ── */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {standardPacks.map(pack => (
                                    <div key={pack.id} className={`glass-panel p-5 rounded-2xl border transition-all hover:scale-[1.02] flex flex-col ${pack.badge === 'Best Value' ? 'border-amber-400 ring-1 ring-amber-400/20 bg-amber-400/[0.03]' : 'border-white/[0.08]'}`}>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-2xl text-amber-400">{pack.icon}</span>
                                                    <span className="text-xl font-black text-white">{pack.total?.toLocaleString()}</span>
                                                </div>
                                                {pack.badge && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase text-white tracking-wider" style={{ backgroundColor: pack.badgeColor || '#ef4444' }}>
                                                        {pack.badge}
                                                    </span>
                                                )}
                                            </div>
                                            {pack.bonus > 0 && (
                                                <p className="text-xs text-emerald-400 font-bold mb-2">
                                                    Total: {pack.credits?.toLocaleString()} + <span className="text-amber-400">{pack.bonus?.toLocaleString()} Bonus</span>
                                                </p>
                                            )}
                                            {isFirstPurchase && pack.firstPurchaseTotal && (
                                                <p className="text-xs text-amber-400 font-bold mb-2">→ 2× = {pack.firstPurchaseTotal?.toLocaleString()} credits!</p>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
                                            <div>
                                                <span className="text-lg font-black text-white">₹ {pack.price?.toLocaleString()}</span>
                                                <p className="text-[10px] text-slate-500">₹{pack.perCredit}/cr • {pack.validityDays}d</p>
                                            </div>
                                            <button
                                                onClick={() => handleTopup(pack)}
                                                className="px-5 py-2 rounded-lg text-sm font-bold bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all"
                                            >
                                                Purchase
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    ) : tab === 'rewards' ? (
                        /* ══════════ Rewards & Gamification ══════════ */
                        <div className="space-y-6">
                            {!rewardStatus ? (
                                <div className="flex items-center justify-center h-40">
                                    <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <>
                                    {/* Streak Card */}
                                    <div className="glass-panel rounded-2xl border border-white/[0.08] p-6">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-lg text-orange-400">local_fire_department</span>
                                            Daily Login Streak
                                        </h3>
                                        <div className="flex items-center gap-8">
                                            <div className="text-center">
                                                <p className="text-5xl font-black text-orange-400">{rewardStatus.streak?.current || 0}</p>
                                                <p className="text-sm text-slate-500 font-bold mt-1">day streak</p>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className={`size-3 rounded-full ${rewardStatus.streak?.loggedInToday ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                                                    <span className="text-sm text-slate-300">{rewardStatus.streak?.loggedInToday ? 'Logged in today ✓' : 'Log in daily to keep streak!'}</span>
                                                </div>
                                                <p className="text-xs text-slate-500">
                                                    2 credits/day • +5 at 7-day streak • +25 at 30-day streak
                                                </p>
                                                {rewardStatus.streak?.nextReward && (
                                                    <p className="text-xs text-amber-400 mt-1">
                                                        Next bonus: +{rewardStatus.streak.nextReward.bonus} credits at day {rewardStatus.streak.nextReward.at}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Milestones */}
                                    <div className="glass-panel rounded-2xl border border-white/[0.08] p-6">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-lg text-emerald-400">emoji_events</span>
                                            First-Time Milestones
                                            <span className="text-xs text-slate-500 font-normal ml-2">
                                                {rewardStatus.totalMilestoneCredits} / {rewardStatus.totalMilestoneCredits + rewardStatus.availableMilestoneCredits} credits earned
                                            </span>
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {(rewardStatus.milestones || []).map(m => (
                                                <div key={m.id}
                                                    className={`p-4 rounded-xl border transition-all ${m.claimed
                                                        ? 'bg-emerald-500/5 border-emerald-500/20'
                                                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12]'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`material-symbols-outlined text-xl ${m.claimed ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                            {m.claimed ? 'check_circle' : m.icon}
                                                        </span>
                                                        <span className={`text-xs font-bold ${m.claimed ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                            +{m.credits} cr
                                                        </span>
                                                    </div>
                                                    <p className={`text-sm font-medium ${m.claimed ? 'text-emerald-300' : 'text-slate-300'}`}>{m.label}</p>
                                                    {!m.claimed && (
                                                        <button
                                                            onClick={() => handleClaimMilestone(m.id)}
                                                            className="mt-2 text-xs text-primary font-bold hover:underline"
                                                        >
                                                            Claim Reward →
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Referral */}
                                    <div className="glass-panel rounded-2xl border border-white/[0.08] p-6">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-lg text-purple-400">group_add</span>
                                            Referral Program
                                        </h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* Your code */}
                                            <div>
                                                <p className="text-sm text-slate-400 mb-2">Share your code — earn <span className="font-bold text-amber-400">50 credits</span> per friend who subscribes!</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] font-mono text-amber-400 font-bold text-sm tracking-wider">
                                                        {rewardStatus.referral?.code || '—'}
                                                    </div>
                                                    <button
                                                        onClick={() => { navigator.clipboard.writeText(rewardStatus.referral?.code); alert('Copied!') }}
                                                        className="px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-bold text-sm border border-primary/20 hover:bg-primary/20 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">content_copy</span>
                                                    </button>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-2">
                                                    {rewardStatus.referral?.count || 0} referrals • {rewardStatus.referral?.creditsEarned || 0} credits earned
                                                </p>
                                            </div>

                                            {/* Apply a code */}
                                            <div>
                                                <p className="text-sm text-slate-400 mb-2">Have a referral code? Get <span className="font-bold text-emerald-400">30 bonus credits</span>!</p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={referralInput}
                                                        onChange={e => setReferralInput(e.target.value)}
                                                        placeholder="Enter code..."
                                                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-primary/40"
                                                    />
                                                    <button
                                                        onClick={handleApplyReferral}
                                                        className="px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 font-bold text-sm border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                                                    >
                                                        Apply
                                                    </button>
                                                </div>
                                                {referralMsg && <p className="text-xs text-amber-400 mt-2">{referralMsg}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Top-up Balance Info */}
                                    {rewardStatus.topUp?.balance > 0 && (
                                        <div className="glass-panel rounded-2xl border border-white/[0.08] p-4 flex items-center gap-4">
                                            <span className="material-symbols-outlined text-2xl text-amber-400">account_balance_wallet</span>
                                            <div>
                                                <p className="text-sm text-white font-bold">{rewardStatus.topUp.balance} purchased credits</p>
                                                <p className="text-xs text-slate-500">
                                                    {rewardStatus.topUp.expired
                                                        ? '⚠️ Expired — purchase new credits'
                                                        : `Expires: ${new Date(rewardStatus.topUp.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                    ) : tab === 'plans' ? (
                        <div className="space-y-6">
                            {packagesLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {packages.map((pkg) => {
                                        const isCurrent = pkg.slug === balance?.plan;
                                        const currentTier = packages.find(p => p.slug === balance?.plan)?.tier || 0;
                                        const isUpgrade = pkg.tier > currentTier;

                                        return (
                                            <div key={pkg._id} className={`glass-panel p-6 rounded-2xl border transition-all hover:scale-[1.02] flex flex-col ${isCurrent ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-white/[0.08]'}`}>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-xl font-bold text-white">{pkg.name}</h3>
                                                        {isCurrent && <span className="px-2 py-0.5 rounded-full bg-primary text-[10px] font-black uppercase text-white tracking-wider">Current Plan</span>}
                                                    </div>
                                                    <p className="text-sm text-slate-500 mb-6">{pkg.description}</p>
                                                    <div className="mb-6">
                                                        <span className="text-3xl font-black text-white">{pkg.pricing.currency === 'INR' ? '₹' : '$'}{pkg.pricing.monthly?.toLocaleString()}</span>
                                                        <span className="text-slate-500 text-sm">/mo</span>
                                                    </div>
                                                    <ul className="space-y-3 mb-8">
                                                        <li className="flex items-center gap-2 text-sm text-slate-300">
                                                            <span className="material-symbols-outlined text-primary text-lg">{pkg.credits?.monthly >= 999999 ? 'all_inclusive' : 'check_circle'}</span>
                                                            {pkg.credits?.monthly >= 999999 ? 'Unlimited' : pkg.credits?.monthly?.toLocaleString()} Credits / mo
                                                        </li>
                                                        {pkg.features?.map((f, j) => (
                                                            <li key={j} className="flex items-center gap-2 text-sm text-slate-300">
                                                                <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                                                                {typeof f === 'object' ? (f.name || 'Feature') : f}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <button
                                                    onClick={() => !isCurrent && handleUpgrade(pkg)}
                                                    disabled={isCurrent}
                                                    className={`w-full py-3 rounded-xl font-bold text-sm text-center block transition-all cursor-pointer ${isCurrent
                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                                                        : isUpgrade
                                                            ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-light'
                                                            : 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                                                        }`}
                                                >
                                                    {isCurrent ? 'Current Plan' : isUpgrade ? `Upgrade to ${pkg.name}` : `Switch to ${pkg.name}`}
                                                </button>
                                            </div>
                                        )
                                    })}
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

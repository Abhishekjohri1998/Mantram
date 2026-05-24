import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { credits as creditsAPI, payments as paymentsAPI, rewards as rewardsAPI } from '../services/api'
import { useRazorpay } from '../hooks/useRazorpay'
import { useShopify } from '../context/ShopifyContext'


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

const CANCEL_REASONS = [
    'Too expensive for my needs',
    'Not using it enough',
    'Switching to a competitor',
    'Missing features I need',
    'Temporary pause — will come back',
    'Other',
]

export default function CreditsPage() {
    const [searchParams] = useSearchParams()
    const [summary, setSummary] = useState(null)
    const [usage, setUsage] = useState([])
    const [usageTotal, setUsageTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pages, setPages] = useState(1)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState(() => {
        const urlTab = searchParams.get('tab')
        return ['overview', 'plans', 'topup', 'rewards', 'history'].includes(urlTab) ? urlTab : 'overview'
    })

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

    // Store visibility (controlled by SuperAdmin)
    const [storeVisibility, setStoreVisibility] = useState({ showSubscriptionPlans: true, showCreditPacks: true })

    // Billing cycle toggle
    const [billingCycle, setBillingCycle] = useState('monthly')

    // Subscription status + cancel flow
    const [subStatus, setSubStatus] = useState(null)
    const [cancelModal, setCancelModal] = useState(null) // null | { step: 'reason' | 'offer' | 'confirm' | 'done', ... }
    const [cancelReason, setCancelReason] = useState('')
    const [cancelLoading, setCancelLoading] = useState(false)

    // Coupon state
    const [couponInput, setCouponInput] = useState('')
    const [appliedCoupon, setAppliedCoupon] = useState(null) // { coupon, discount, finalPrice, originalPrice }
    const [couponLoading, setCouponLoading] = useState(false)
    const [couponError, setCouponError] = useState('')

    // Checkout Modal state
    const [showCheckout, setShowCheckout] = useState(false)
    const [checkoutItem, setCheckoutItem] = useState(null) // { type: 'topup' | 'subscription', ...item }
    const { loadRazorpay } = useRazorpay()
    const [billingProvider, setBillingProvider] = useState(null)
    const [shopDomain, setShopDomain] = useState(null)

    const shopifyContext = useShopify() || {};
    const { isEmbedded } = shopifyContext;
    const activeBillingProvider = isEmbedded ? 'shopify' : billingProvider;



    useEffect(() => { loadSummary(); loadUsage(); loadStoreVisibility(); loadSubStatus(); detectBillingProvider() }, [])
    useEffect(() => { loadUsage() }, [page])

    useEffect(() => {
        const billingResult = searchParams.get('shopify_billing')
        const topupResult = searchParams.get('shopify_topup')
        const errorResult = searchParams.get('error')
        const detailResult = searchParams.get('detail')

        if (billingResult === 'success') {
            const plan = searchParams.get('plan') || ''
            alert(`Successfully subscribed to the ${plan} plan via Shopify!`)
        } else if (topupResult === 'success') {
            const credits = searchParams.get('credits') || ''
            alert(`Successfully added ${credits} credits via Shopify!`)
        } else if (errorResult) {
            let msg = 'Billing failed: '
            if (errorResult === 'charge_not_approved') msg += 'Charge not approved.'
            else if (errorResult === 'integration_not_found') msg += 'Shopify integration not found.'
            else if (errorResult === 'subscription_inactive') msg += 'Subscription not active.'
            else if (errorResult === 'purchase_inactive') msg += 'Purchase not active.'
            else msg += errorResult
            if (detailResult) msg += ` (${detailResult})`
            alert(msg)
        }
    }, [searchParams])

    const detectBillingProvider = async () => {
        try {
            const data = await paymentsAPI.billingProvider()
            if (data.success && data.provider) {
                setBillingProvider(data.provider)
                setShopDomain(data.shopDomain)
            }
        } catch (e) {
            console.error('Failed to detect billing provider:', e)
        }
    }

    const getDisplayPrice = (item, type, cycle = billingCycle) => {
        if (activeBillingProvider === 'shopify') {
            if (type === 'subscription') {
                const usdPrices = {
                    creator: { monthly: 19.99, quarterly: 49.99, yearly: 199.99 },
                    professional: { monthly: 49.99, quarterly: 129.99, yearly: 499.99 }
                };
                const slug = item.slug;
                if (usdPrices[slug] && usdPrices[slug][cycle]) {
                    return { amount: usdPrices[slug][cycle], currency: 'USD', symbol: '$' };
                }
                const inrPrice = item.pricing?.[cycle] || item.pricing?.monthly || 0;
                return { amount: parseFloat((inrPrice / 90).toFixed(2)), currency: 'USD', symbol: '$' };
            } else {
                const usdPrices = {
                    'festive-special': 29.99,
                    'micro': 1.99,
                    'spark': 3.99,
                    'boost': 9.99,
                    'power': 19.99,
                    'ultra': 24.99,
                    'stellar': 29.99,
                    'mega': 49.99,
                    'elite': 99.99,
                    'enterprise-pack': 179.99,
                };
                const slug = item.slug;
                if (usdPrices[slug]) {
                    return { amount: usdPrices[slug], currency: 'USD', symbol: '$' };
                }
                const inrPrice = item.price || 0;
                return { amount: parseFloat((inrPrice / 90).toFixed(2)), currency: 'USD', symbol: '$' };
            }
        }
        const amount = type === 'subscription' 
            ? (item.pricing?.[cycle] || item.pricing?.monthly || 0)
            : (item.price || 0);
        return { amount, currency: 'INR', symbol: '₹' };
    };

    const getPerCredit = (pack, usdPriceObj) => {
        const total = pack.total || (pack.credits + (pack.bonusCredits || 0));
        if (total === 0) return 0;
        return parseFloat((usdPriceObj.amount / total).toFixed(4));
    };

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

    const loadStoreVisibility = async () => {
        try {
            const data = await paymentsAPI.getStoreVisibility()
            setStoreVisibility({ showSubscriptionPlans: data.showSubscriptionPlans !== false, showCreditPacks: data.showCreditPacks !== false })
        } catch { /* defaults to both visible */ }
    }

    const loadSubStatus = async () => {
        try {
            const data = await paymentsAPI.subscriptionStatus()
            setSubStatus(data)
        } catch { /* ignore */ }
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

    const handleUpgrade = (pkg) => {
        setCheckoutItem({ type: 'subscription', ...pkg })
        setShowCheckout(true)
        setAppliedCoupon(null) // Reset coupon for new selection
        setCouponInput('')
        setCouponError('')
    }

    const confirmUpgrade = async (pkg) => {
        if (activeBillingProvider === 'shopify') {
            try {
                const data = await paymentsAPI.shopifyCreateSubscription(pkg._id, billingCycle)
                if (data.success && data.confirmationUrl) {
                    window.location.href = data.confirmationUrl
                } else {
                    alert('Failed to initialize Shopify billing redirect')
                }
            } catch (e) {
                alert('Failed to initialize Shopify billing: ' + e.message)
            }
            return
        }
        try {
            const { orderId, amount, currency, proRata } = await paymentsAPI.createOrder(pkg._id, billingCycle, appliedCoupon?.coupon?.code)
            const options = {
                key: import.meta.env.VITE_RAZORPAY_KEY_ID,
                amount,
                currency,
                name: 'Mantram AI',
                description: proRata?.unusedCredit > 0
                    ? `Upgrade to ${pkg.name} (₹${proRata.unusedCredit} credit applied)`
                    : `Upgrade to ${pkg.name} Plan`,
                order_id: orderId,
                handler: async (response) => {
                    try {
                        await paymentsAPI.verify({ ...response })
                        alert(`Successfully upgraded to ${pkg.name}!`)
                        window.location.reload()
                    } catch (e) { alert('Payment verification failed: ' + e.message) }
                },
                prefill: { name: summary?.userName, email: summary?.userEmail },
                theme: { color: '#2b4bee' }
            }
            const Razorpay = await loadRazorpay()
            const rzp = new Razorpay(options)
            rzp.open()
        } catch (e) { alert('Failed to initialize payment: ' + e.message) }

    }

    const handleCancelSubscription = async () => {
        setCancelLoading(true)
        try {
            const isShopify = subStatus?.paymentMethod === 'shopify'
            const data = isShopify 
                ? await paymentsAPI.shopifyCancelSubscription(cancelReason)
                : await paymentsAPI.cancelSubscription(cancelReason)
            setCancelModal({
                step: data.retentionOffer ? 'offer' : 'done',
                ...data,
            })
            loadSubStatus()
        } catch (e) {
            alert('Cancellation failed: ' + e.message)
            setCancelModal(null)
        } finally {
            setCancelLoading(false)
        }
    }

    const handleAcceptRetention = async (offerId) => {
        setCancelLoading(true)
        try {
            const data = await paymentsAPI.acceptRetentionOffer(offerId)
            alert(data.message)
            setCancelModal(null)
            loadSubStatus()
            loadSummary()
        } catch (e) {
            alert('Failed: ' + e.message)
        } finally {
            setCancelLoading(false)
        }
    }

    const handleTopup = (pack) => {
        setCheckoutItem({ type: 'topup', ...pack })
        setShowCheckout(true)
        setAppliedCoupon(null) // Reset coupon for new selection
        setCouponInput('')
        setCouponError('')
    }

    const confirmTopup = async (pack) => {
        if (activeBillingProvider === 'shopify') {
            try {
                const data = await paymentsAPI.shopifyCreateTopup(pack.id || pack._id)
                if (data.success && data.confirmationUrl) {
                    window.location.href = data.confirmationUrl
                } else {
                    alert('Failed to initialize Shopify payment redirect')
                }
            } catch (e) {
                alert('Failed to initialize Shopify payment: ' + e.message)
            }
            return
        }
        try {
            const { orderId, amount, currency, creditsToAdd } = await paymentsAPI.createTopupOrder(pack.id, appliedCoupon?.coupon?.code)
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
            const Razorpay = await loadRazorpay()
            const rzp = new Razorpay(options)
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

    const handleApplyCoupon = async () => {
        if (!couponInput.trim() || !checkoutItem) return
        setCouponLoading(true)
        setCouponError('')
        try {
            const data = await paymentsAPI.validateCoupon({ 
                code: couponInput.trim(),
                planId: checkoutItem.type === 'subscription' ? checkoutItem._id : null,
                packId: checkoutItem.type === 'topup' ? (checkoutItem.id || checkoutItem._id) : null
            })
            setAppliedCoupon(data)
            setCouponInput('')
        } catch (e) {
            setCouponError(e.message)
            setAppliedCoupon(null)
        } finally {
            setCouponLoading(false)
        }
    }

    const removeCoupon = () => {
        setAppliedCoupon(null)
        setCouponError('')
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
    <>
        <DashboardLayout title="Credit Usage" subtitle="Track your AI generation credits">
            <SEOHead title="Credit Usage — Mantram AI" noIndex={true} />

            {/* Daily Reward Toast */}
            {dailyToast && (
                <div className="fixed top-4 right-4 z-50 animate-slide-in bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] rounded-2xl px-6 py-4 shadow-none flex items-center gap-3 max-w-sm">
                    <span className="material-symbols-outlined text-2xl animate-pulse">local_fire_department</span>
                    <div>
                        <p className="font-bold text-sm">{dailyToast.message}</p>
                        <p className="text-xs opacity-80"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">local_fire_department</span> Streak: {dailyToast.streak} days</p>
                    </div>
                    <button onClick={() => setDailyToast(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="size-8 border border-primary border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Top Balance Card */}
                    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
                        <div className="flex flex-wrap items-center gap-8">
                            {/* Main balance */}
                            <div className="flex-1 min-w-[200px]">
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-wider font-bold mb-1">Credit Balance</p>
                                {balance?.unlimited ? (
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-3xl text-primary">all_inclusive</span>
                                        <span className="text-3xl font-black text-primary">Unlimited</span>
                                    </div>
                                ) : (
                                    <>
                                         <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                                            <div className="flex items-baseline gap-2">
                                                <span className={`text-4xl font-black text-${creditColor}-400`}>{balance?.remaining || 0}</span>
                                                <span className="text-lg text-[var(--sys-text-muted)] font-medium">/ {balance?.total || 0}</span>
                                                <span className="text-sm text-[var(--sys-text-muted)]">Monthly Credits</span>
                                            </div>
                                            {subStatus?.plan && (
                                                <div className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-xs text-primary">verified</span>
                                                    <span className="text-xs font-black text-primary uppercase tracking-wider">{subStatus.plan} Plan</span>
                                                </div>
                                            )}
                                            {balance?.bonus > 0 && (
                                                <div className="px-2 py-1 rounded-lg bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                                    <span className="text-xs font-bold text-primary">+{balance.bonus} Bonus</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-3 w-full max-w-md h-2.5 rounded-full bg-[var(--sys-surface)] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 bg-${creditColor}-500`}
                                                style={{ width: `${creditPercent}%` }}
                                            />
                                        </div>
                                        <p className="mt-2 text-xs text-[var(--sys-text-muted)] font-medium">
                                            {subStatus?.daysRemaining !== undefined && (
                                                <span className="mr-3">
                                                    <span className="material-symbols-outlined text-[10px] align-middle mr-1">history</span>
                                                    Resets in <strong>{subStatus.daysRemaining} days</strong> ({new Date(subStatus.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
                                                </span>
                                            )}
                                            <span>{balance?.used || 0} used this cycle</span>
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
                                    <div key={s.label} className="text-center p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] min-w-[120px]">
                                        <span className={`material-symbols-outlined text-xl text-${s.color}-400 mb-1`}>{s.icon}</span>
                                        <p className="text-xl font-black text-[var(--sys-text)]">{s.value}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)] uppercase font-bold">{s.label}</p>
                                        <p className="text-xs text-[var(--sys-text-muted)]">{s.sub}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 flex-wrap">
                        {['overview',
                          ...(storeVisibility.showSubscriptionPlans ? ['plans'] : []),
                          ...(storeVisibility.showCreditPacks ? ['topup'] : []),
                          'rewards', 'history'
                        ].map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${tab === t
                                    ? 'bg-primary/10 text-primary border border-primary/20'
                                    : 'text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-transparent'
                                    }`}
                            >
                                {t === 'overview' ? '📊 Usage Breakdown' : t === 'plans' ? '💎 Upgrade Plans' : t === 'topup' ? '⚡ Quick Top-up' : t === 'rewards' ? '🎯 Rewards' : '📋 History'}
                            </button>
                        ))}
                    </div>

                    {tab === 'overview' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Usage by Action */}
                            <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
                                <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-lg text-primary">pie_chart</span>
                                    Credits by Operation
                                </h3>
                                {(summary?.byAction || []).length === 0 ? (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">analytics</span>
                                        <p className="text-sm text-[var(--sys-text-muted)]">No usage data yet</p>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">Credits used for AI operations will appear here</p>
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
                                                            <span className="text-sm text-[var(--sys-text-muted)] font-medium">{a.description || a._id}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-[var(--sys-text-muted)]">{a.count} ops</span>
                                                            <span className={`text-xs font-bold text-${color}-400`}>{a.total}</span>
                                                        </div>
                                                    </div>
                                                    <div className="w-full h-1.5 rounded-full bg-[var(--sys-surface)] overflow-hidden">
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
                            <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
                                <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-lg text-primary">show_chart</span>
                                    Daily Usage (Last 7 Days)
                                </h3>
                                {(summary?.dailyTrend || []).length === 0 ? (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">timeline</span>
                                        <p className="text-sm text-[var(--sys-text-muted)]">No trend data yet</p>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">Daily credit usage will show here after your first operations</p>
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
                                                        <span className="text-sm text-[var(--sys-text-muted)] font-bold">{d.total}</span>
                                                        <div className="w-full rounded-t-md bg-primary/30 hover:bg-primary/50 transition-all"
                                                            style={{ height: `${h}%` }} />
                                                        <span className="text-xs text-[var(--sys-text-muted)] font-medium">{day}</span>
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
                                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] p-6 rounded-2xl flex items-center gap-4">
                                    <span className="material-symbols-outlined text-4xl text-primary animate-pulse">celebration</span>
                                    <div>
                                        <h3 className="text-lg font-black text-primary">🎉 First Purchase — 2× Credits!</h3>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Your first top-up gets double credits. This offer applies once, on any pack.</p>
                                    </div>
                                </div>
                            )}



                            {/* ── Promo Section (Kling-style green border) ── */}
                            {promoPacks.length > 0 && (
                                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] rounded-2xl p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <span className="material-symbols-outlined text-2xl text-primary">diamond</span>
                                        <div>
                                            <h3 className="text-lg font-black text-primary">◆ Exclusive Promo For You ◆</h3>
                                            <p className="text-xs text-[var(--sys-text-muted)]">Limited time offers. Credits purchased via promo are valid for 31 days.</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {promoPacks.map(pack => (
                                            <div key={pack.id} className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-xl p-5 flex flex-col hover:border-[var(--sys-border)] transition-all">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-2xl text-primary">{pack.icon}</span>
                                                        <span className="text-2xl font-black text-primary">{pack.total?.toLocaleString()}</span>
                                                    </div>
                                                    {pack.promoLabel && (
                                                        <span className="px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[10px] font-black text-[var(--sys-text)] uppercase tracking-wider">
                                                            {pack.promoLabel}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-[var(--sys-text-muted)] mb-2">
                                                    {(() => {
                                                        const priceObj = getDisplayPrice(pack, 'topup');
                                                        const perCredit = getPerCredit(pack, priceObj);
                                                        return `${priceObj.symbol}${perCredit} / credit, valid for ${pack.validityDays} days`;
                                                    })()}
                                                </p>
                                                {pack.promoOriginalPrice > 0 && (
                                                    <p className="text-xs text-[var(--sys-text-muted)] line-through mb-1">
                                                        {(() => {
                                                            const originalPriceObj = activeBillingProvider === 'shopify' 
                                                                ? { amount: parseFloat((pack.promoOriginalPrice / 90).toFixed(2)), symbol: '$' } 
                                                                : { amount: pack.promoOriginalPrice, symbol: '₹' };
                                                            return `${originalPriceObj.symbol}${originalPriceObj.amount.toLocaleString(undefined, { minimumFractionDigits: activeBillingProvider === 'shopify' ? 2 : 0 })}`;
                                                        })()}
                                                    </p>
                                                )}
                                                <div className="flex items-center justify-between mt-auto pt-3">
                                                    {(() => {
                                                        const priceObj = getDisplayPrice(pack, 'topup');
                                                        return (
                                                            <span className="text-xl font-black text-[var(--sys-text)]">
                                                                {priceObj.symbol} {priceObj.currency === 'USD' ? priceObj.amount.toFixed(2) : priceObj.amount.toLocaleString()}
                                                            </span>
                                                        );
                                                    })()}
                                                    <button
                                                        onClick={() => handleTopup(pack)}
                                                        className="px-5 py-2 rounded-lg text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all"
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
                            <p className="text-xs text-[var(--sys-text-muted)] text-center">
                                Credits cannot be exchanged for memberships, nor refunded, transferred, or withdrawn.
                                {' '}<span className="text-primary cursor-pointer hover:underline">Credits Policy</span>
                            </p>

                            {/* ── Standard Packs (8-tier grid) ── */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {standardPacks.map(pack => (
                                    <div key={pack.id} className={`glass-panel p-5 rounded-2xl border transition-all hover:scale-[1.02] flex flex-col ${pack.badge === 'Best Value' ? 'border-[var(--sys-border)]  bg-[var(--sys-surface)]/[0.03]' : 'border-[var(--sys-border)]'}`}>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-2xl text-primary">{pack.icon}</span>
                                                    <span className="text-xl font-black text-[var(--sys-text)]">{pack.total?.toLocaleString()}</span>
                                                </div>
                                                {pack.badge && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase text-[var(--sys-text)] tracking-wider" style={{ backgroundColor: pack.badgeColor || '#ef4444' }}>
                                                        {pack.badge}
                                                    </span>
                                                )}
                                            </div>
                                            {pack.bonus > 0 && (
                                                <p className="text-xs text-primary font-bold mb-2">
                                                    Total: {pack.credits?.toLocaleString()} + <span className="text-primary">{pack.bonus?.toLocaleString()} Bonus</span>
                                                </p>
                                            )}
                                            {isFirstPurchase && pack.firstPurchaseTotal && (
                                                <p className="text-xs text-primary font-bold mb-2">→ 2× = {pack.firstPurchaseTotal?.toLocaleString()} credits!</p>
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--sys-border)]">
                                            {(() => {
                                                const priceObj = getDisplayPrice(pack, 'topup');
                                                const perCredit = getPerCredit(pack, priceObj);
                                                return (
                                                    <>
                                                        <div>
                                                            <span className="text-lg font-black text-[var(--sys-text)]">
                                                                {priceObj.symbol} {priceObj.currency === 'USD' ? priceObj.amount.toFixed(2) : priceObj.amount.toLocaleString()}
                                                            </span>
                                                            <p className="text-[10px] text-[var(--sys-text-muted)]">
                                                                {priceObj.symbol}{perCredit}/cr • {pack.validityDays}d
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleTopup(pack)}
                                                            className="px-5 py-2 rounded-lg text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all"
                                                        >
                                                            Purchase
                                                        </button>
                                                    </>
                                                );
                                            })()}
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
                                    <div className="size-8 border border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <>
                                    {/* Streak Card */}
                                    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
                                        <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-lg text-[var(--sys-primary)]">local_fire_department</span>
                                            Daily Login Streak
                                        </h3>
                                        <div className="flex items-center gap-8">
                                            <div className="text-center">
                                                <p className="text-5xl font-black text-[var(--sys-primary)]">{rewardStatus.streak?.current || 0}</p>
                                                <p className="text-sm text-[var(--sys-text-muted)] font-bold mt-1">day streak</p>
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className={`size-3 rounded-full ${rewardStatus.streak?.loggedInToday ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-border)]'}`} />
                                                    <span className="text-sm text-[var(--sys-text-muted)]">{rewardStatus.streak?.loggedInToday ? 'Logged in today ✓' : 'Log in daily to keep streak!'}</span>
                                                </div>
                                                <p className="text-xs text-[var(--sys-text-muted)]">
                                                    2 credits/day • +5 at 7-day streak • +25 at 30-day streak
                                                </p>
                                                {rewardStatus.streak?.nextReward && (
                                                    <p className="text-xs text-primary mt-1">
                                                        Next bonus: +{rewardStatus.streak.nextReward.bonus} credits at day {rewardStatus.streak.nextReward.at}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Milestones */}
                                    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
                                        <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-lg text-primary">emoji_events</span>
                                            First-Time Milestones
                                            <span className="text-xs text-[var(--sys-text-muted)] font-normal ml-2">
                                                {rewardStatus.totalMilestoneCredits} / {rewardStatus.totalMilestoneCredits + rewardStatus.availableMilestoneCredits} credits earned
                                            </span>
                                        </h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {(rewardStatus.milestones || []).map(m => (
                                                <div key={m.id}
                                                    className={`p-4 rounded-xl border transition-all ${m.claimed
                                                        ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]'
                                                        : 'bg-[var(--sys-surface)] border-[var(--sys-border)] hover:border-[var(--sys-border)]'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`material-symbols-outlined text-xl ${m.claimed ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>
                                                            {m.claimed ? 'check_circle' : m.icon}
                                                        </span>
                                                        <span className={`text-xs font-bold ${m.claimed ? 'text-primary' : 'text-primary'}`}>
                                                            +{m.credits} cr
                                                        </span>
                                                    </div>
                                                    <p className={`text-sm font-medium ${m.claimed ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)]'}`}>{m.label}</p>
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
                                    <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-6">
                                        <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                            <span className="material-symbols-outlined text-lg text-[#FF4D00]">group_add</span>
                                            Referral Program
                                        </h3>
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* Your code */}
                                            <div>
                                                <p className="text-sm text-[var(--sys-text-muted)] mb-2">Share your code — earn <span className="font-bold text-primary">50 credits</span> per friend who subscribes!</p>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] font-mono text-primary font-bold text-sm tracking-wider">
                                                        {rewardStatus.referral?.code || '—'}
                                                    </div>
                                                    <button
                                                        onClick={() => { navigator.clipboard.writeText(rewardStatus.referral?.code); alert('Copied!') }}
                                                        className="px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-bold text-sm border border-primary/20 hover:bg-primary/20 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">content_copy</span>
                                                    </button>
                                                </div>
                                                <p className="text-xs text-[var(--sys-text-muted)] mt-2">
                                                    {rewardStatus.referral?.count || 0} referrals • {rewardStatus.referral?.creditsEarned || 0} credits earned
                                                </p>
                                            </div>

                                            {/* Apply a code */}
                                            <div>
                                                <p className="text-sm text-[var(--sys-text-muted)] mb-2">Have a referral code? Get <span className="font-bold text-primary">30 bonus credits</span>!</p>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={referralInput}
                                                        onChange={e => setReferralInput(e.target.value)}
                                                        placeholder="Enter code..."
                                                        className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:outline-none focus:border-primary/40"
                                                    />
                                                    <button
                                                        onClick={handleApplyReferral}
                                                        className="px-4 py-2.5 rounded-xl bg-[var(--sys-primary-dim)] text-primary font-bold text-sm border border-[var(--sys-border)] hover:bg-[var(--sys-primary-dim)] transition-all"
                                                    >
                                                        Apply
                                                    </button>
                                                </div>
                                                {referralMsg && <p className="text-xs text-primary mt-2">{referralMsg}</p>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Top-up Balance Info */}
                                    {rewardStatus.topUp?.balance > 0 && (
                                        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] p-4 flex items-center gap-4">
                                            <span className="material-symbols-outlined text-2xl text-primary">account_balance_wallet</span>
                                            <div>
                                                <p className="text-sm text-[var(--sys-text)] font-bold">{rewardStatus.topUp.balance} purchased credits</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">
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
                            {/* ── Cancelled Subscription Banner ── */}
                            {subStatus?.isCancelled && subStatus?.isInGracePeriod && (
                                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] p-5 rounded-2xl flex items-center gap-4">
                                    <span className="material-symbols-outlined text-3xl text-primary">warning</span>
                                    <div className="flex-1">
                                        <h3 className="text-base font-bold text-primary">Subscription Cancelled</h3>
                                        <p className="text-sm text-[var(--sys-text-muted)]">
                                            You have access to <span className="font-bold text-[var(--sys-text)]">{subStatus.plan}</span> features until{' '}
                                            <span className="font-bold text-[var(--sys-text)]">
                                                {new Date(subStatus.gracePeriodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                            </span>
                                            {' '}— <span className="font-bold text-primary">{subStatus.daysRemaining} days remaining</span>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* ── Billing Cycle Toggle ── */}
                            <div className="flex items-center justify-center gap-1 bg-[var(--sys-surface)] rounded-xl p-1 w-fit mx-auto">
                                {[{k: 'monthly', l: 'Monthly'}, {k: 'quarterly', l: 'Quarterly', save: '10%'}, {k: 'yearly', l: 'Annual', save: '20%'}].map(c => (
                                    <button
                                        key={c.k}
                                        onClick={() => setBillingCycle(c.k)}
                                        className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all relative ${billingCycle === c.k
                                            ? 'bg-primary text-white shadow-none'
                                            : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'
                                        }`}
                                    >
                                        {c.l}
                                        {c.save && billingCycle === c.k && (
                                            <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-[var(--sys-surface)] text-[9px] font-black text-[var(--sys-text)]">Save {c.save}</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Coupon Section (Plans) */}
                            {activeBillingProvider !== 'shopify' && (
                                <div className="glass-panel p-6 rounded-2xl border border-[var(--sys-border)] flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-2xl text-primary">local_offer</span>
                                        <div>
                                            <h4 className="text-sm font-bold text-[var(--sys-text)]">Have a Coupon?</h4>
                                            <p className="text-xs text-[var(--sys-text-muted)]">Get additional discounts on your subscription.</p>
                                        </div>
                                    </div>
                                    {appliedCoupon ? (
                                        <div className="flex items-center gap-3 bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] px-4 py-2 rounded-xl">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-primary">{appliedCoupon.coupon.code}</span>
                                                <span className="text-xs text-primary">Applied</span>
                                            </div>
                                            <button onClick={removeCoupon} className="material-symbols-outlined text-sm text-primary hover:text-[var(--sys-text)] transition-all">cancel</button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Enter code..." 
                                                value={couponInput}
                                                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                                                className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2 text-sm text-[var(--sys-text)] focus:outline-none focus:border-primary/50"
                                            />
                                            <button 
                                                onClick={handleApplyCoupon}
                                                disabled={couponLoading || !couponInput.trim()}
                                                className="px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-bold hover:bg-primary/20 transition-all disabled:opacity-50"
                                            >
                                                {couponLoading ? '...' : 'Apply'}
                                            </button>
                                        </div>
                                    )}
                                    {couponError && <p className="w-full text-xs text-primary">{couponError}</p>}
                                </div>
                            )}

                            {packagesLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <div className="size-8 border border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {packages.map((pkg) => {
                                        const isCurrent = pkg.slug === balance?.plan;
                                        const currentTier = packages.find(p => p.slug === balance?.plan)?.tier || 0;
                                        const isUpgrade = pkg.tier > currentTier;

                                        // ── Contact-for-pricing card (Agency / Enterprise) ──
                                        if (pkg.contactForPricing) {
                                            return (
                                                <div key={pkg._id} className="glass-panel p-6 rounded-2xl border border-[var(--sys-border)] flex flex-col relative overflow-hidden hover:scale-[1.02] transition-all"
                                                    style={{ borderColor: `${pkg.color}40` }}>
                                                    {/* Subtle gradient shimmer */}
                                                    <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
                                                        style={{ background: `radial-gradient(ellipse at top left, ${pkg.color}, transparent 70%)` }} />

                                                    <div className="flex-1 relative">
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-2xl" style={{ color: pkg.color }}>{pkg.icon}</span>
                                                                <h3 className="text-xl font-bold text-[var(--sys-text)]">{pkg.name}</h3>
                                                            </div>
                                                            {pkg.badge && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                                                                    style={{ backgroundColor: pkg.color }}>
                                                                    {pkg.badge}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-[var(--sys-text-muted)] mb-6">{pkg.description || pkg.tagline}</p>

                                                        {/* Price row — "Custom Pricing" */}
                                                        <div className="mb-6 flex items-center gap-3">
                                                            <div className="px-4 py-2 rounded-xl border text-sm font-black tracking-wide"
                                                                style={{ borderColor: `${pkg.color}50`, color: pkg.color, backgroundColor: `${pkg.color}10` }}>
                                                                Custom Pricing
                                                            </div>
                                                            <span className="text-xs text-[var(--sys-text-muted)]">Starting from {pkg.credits?.monthly?.toLocaleString()} credits/mo</span>
                                                        </div>

                                                        {/* Features list */}
                                                        <ul className="space-y-2.5 mb-8">
                                                            {pkg.features?.map((f, j) => (
                                                                <li key={j} className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)]">
                                                                    <span className="material-symbols-outlined text-lg" style={{ color: pkg.color }}>check_circle</span>
                                                                    {typeof f === 'object' ? (f.name || 'Feature') : f}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    {/* CTA — Contact Sales */}
                                                    <a
                                                        href={`mailto:${pkg.contactEmail || 'sales@mantram.ai'}?subject=Mantram AI ${pkg.name} Plan Enquiry&body=Hi, I'm interested in the ${pkg.name} plan. Please share pricing details.`}
                                                        className="w-full py-3 rounded-xl font-bold text-sm text-center block transition-all text-white hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
                                                        style={{ backgroundColor: pkg.color }}
                                                    >
                                                        <span className="material-symbols-outlined text-base align-middle mr-1.5">mail</span>
                                                        Contact Sales
                                                    </a>
                                                    <p className="text-[10px] text-[var(--sys-text-muted)] text-center mt-2">
                                                        {pkg.contactEmail || 'sales@mantram.ai'} · We respond within 24 hrs
                                                    </p>
                                                </div>
                                            );
                                        }

                                        // ── Standard plan card ──
                                        return (
                                            <div key={pkg._id} className={`glass-panel p-6 rounded-2xl border transition-all hover:scale-[1.02] flex flex-col ${isCurrent ? 'border-primary  ring-primary/20 bg-primary/5' : 'border-[var(--sys-border)]'}`}>
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h3 className="text-xl font-bold text-[var(--sys-text)]">{pkg.name}</h3>
                                                        {isCurrent && <span className="px-2 py-0.5 rounded-full bg-primary text-[10px] font-black uppercase text-white tracking-wider">Current Plan</span>}
                                                        {!isCurrent && pkg.badge && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                                                                style={{ backgroundColor: pkg.color || '#6366f1' }}>
                                                                {pkg.badge}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-[var(--sys-text-muted)] mb-6">{pkg.description}</p>
                                                    <div className="mb-6">
                                                        {(() => {
                                                            const priceObj = getDisplayPrice(pkg, 'subscription', billingCycle);
                                                            const price = priceObj.amount;
                                                            const monthlyEquiv = billingCycle === 'yearly' ? (price / 12) : billingCycle === 'quarterly' ? (price / 3) : price;
                                                            const monthlyPriceObj = getDisplayPrice(pkg, 'subscription', 'monthly');
                                                            const monthlyPrice = monthlyPriceObj.amount;
                                                            const savings = billingCycle !== 'monthly' && monthlyPrice > 0 && price > 0 ? Math.round((1 - (price / (billingCycle === 'yearly' ? 12 : 3)) / monthlyPrice) * 100) : 0;
                                                            return (
                                                                <>
                                                                    <span className="text-3xl font-black text-[var(--sys-text)]">
                                                                        {priceObj.symbol}{priceObj.currency === 'USD' ? price.toFixed(2) : price.toLocaleString()}
                                                                    </span>
                                                                    <span className="text-[var(--sys-text-muted)] text-sm">/{billingCycle === 'yearly' ? 'yr' : billingCycle === 'quarterly' ? 'qtr' : 'mo'}</span>
                                                                    {savings > 0 && (
                                                                        <span className="ml-2 px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary text-xs font-bold">
                                                                            Save {savings}%
                                                                        </span>
                                                                    )}
                                                                    {billingCycle !== 'monthly' && monthlyEquiv > 0 && (
                                                                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">
                                                                            ≈ {priceObj.symbol}{priceObj.currency === 'USD' ? monthlyEquiv.toFixed(2) : Math.round(monthlyEquiv).toLocaleString()}/mo
                                                                        </p>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                    <ul className="space-y-3 mb-8">
                                                        <li className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)]">
                                                            <span className="material-symbols-outlined text-primary text-lg">{pkg.credits?.monthly >= 999999 ? 'all_inclusive' : 'check_circle'}</span>
                                                            {pkg.credits?.monthly >= 999999 ? 'Unlimited' : pkg.credits?.monthly?.toLocaleString()} Credits / mo
                                                        </li>
                                                        {pkg.features?.map((f, j) => (
                                                            <li key={j} className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)]">
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
                                                        ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)] cursor-default'
                                                        : isUpgrade
                                                            ? 'bg-primary text-white shadow-none hover:bg-primary-light'
                                                            : 'bg-[var(--sys-surface)] text-[var(--sys-text)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)]'
                                                    }`}
                                                >
                                                    {isCurrent ? 'Current Plan' : isUpgrade ? `Upgrade to ${pkg.name}` : `Switch to ${pkg.name}`}
                                                </button>
                                                {/* Cancel button for current plan */}
                                                {isCurrent && subStatus?.hasSubscription && subStatus?.status === 'active' && (
                                                    <button
                                                        onClick={() => setCancelModal({ step: 'reason' })}
                                                        className="mt-3 w-full py-2 text-xs text-[var(--sys-text-muted)] hover:text-primary transition-all"
                                                    >
                                                        Cancel Subscription
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                            )}
                        </div>
                    ) : (
                        /* Transaction History */
                        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] overflow-hidden">
                            <div className="p-4 border-b border-[var(--sys-border)] flex items-center justify-between">
                                <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg text-primary">receipt_long</span>
                                    Recent Transactions
                                    <span className="text-sm text-[var(--sys-text-muted)] font-normal ml-1">({usageTotal} total)</span>
                                </h3>
                            </div>

                            {usage.length === 0 ? (
                                <div className="p-12 text-center">
                                    <span className="material-symbols-outlined text-5xl text-slate-700">receipt_long</span>
                                    <p className="text-sm text-[var(--sys-text-muted)] mt-2">No transactions yet</p>
                                    <p className="text-xs text-[var(--sys-text-muted)]">Start using AI features to see your credit history</p>
                                </div>
                            ) : (
                                <>
                                    <div className="divide-y divide-white/[0.04]">
                                        {usage.map((u, i) => {
                                            const color = ACTION_COLORS[u.action] || 'slate'
                                            return (
                                                <div key={u._id || i} className="px-4 py-3 flex items-center gap-4 hover:bg-[var(--sys-surface)] transition-colors">
                                                    <div className={`size-9 rounded-lg bg-${color}-500/10 flex items-center justify-center flex-shrink-0`}>
                                                        <span className={`material-symbols-outlined text-lg text-${color}-400`}>
                                                            {ACTION_ICONS[u.action] || 'token'}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-[var(--sys-text)] font-medium truncate">{u.description || u.action}</p>
                                                        <p className="text-xs text-[var(--sys-text-muted)] truncate">
                                                            {u.metadata?.route || ''} {u.metadata?.brandName ? `• ${u.metadata.brandName}` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-sm font-bold text-primary">-{u.cost}</p>
                                                        <p className="text-xs text-[var(--sys-text-muted)]">{formatTime(u.createdAt)}</p>
                                                    </div>
                                                    <div className="text-right flex-shrink-0 w-16">
                                                        <p className="text-sm text-[var(--sys-text-muted)]">Balance</p>
                                                        <p className="text-xs font-bold text-[var(--sys-text-muted)]">{u.balanceAfter}</p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* Pagination */}
                                    {pages > 1 && (
                                        <div className="p-4 border-t border-[var(--sys-border)] flex items-center justify-between">
                                            <p className="text-sm text-[var(--sys-text-muted)]">
                                                Page {page} of {pages} ({usageTotal} records)
                                            </p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                                    disabled={page <= 1}
                                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] disabled:opacity-30 transition-all"
                                                >← Previous</button>
                                                <button
                                                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                                                    disabled={page >= pages}
                                                    className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] disabled:opacity-30 transition-all"
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

        {/* ═══ Cancel Subscription Modal ═══ */}
        {cancelModal && (
            <div className="fixed inset-0 z-[999] bg-[var(--sys-surface)] flex items-center justify-center p-4" onClick={() => !cancelLoading && setCancelModal(null)}>
                <div className="bg-[#0e1117] border border-[var(--sys-border)] rounded-3xl max-w-md w-full p-8 shadow-2xl" onClick={e => e.stopPropagation()}>

                    {/* Step 1: Reason */}
                    {cancelModal.step === 'reason' && (
                        <>
                            <div className="text-center mb-6">
                                <span className="material-symbols-outlined text-4xl text-primary mb-3 block">sentiment_dissatisfied</span>
                                <h2 className="text-xl font-bold text-[var(--sys-text)]">Cancel Subscription?</h2>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-2">We're sorry to see you go. Please tell us why:</p>
                            </div>
                            <div className="space-y-2 mb-6">
                                {CANCEL_REASONS.map(r => (
                                    <button
                                        key={r}
                                        onClick={() => setCancelReason(r)}
                                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all border ${cancelReason === r
                                            ? 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)] text-[var(--sys-text)]'
                                            : 'border-[var(--sys-border)] bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'
                                        }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setCancelModal(null)}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all"
                                >
                                    Keep Subscription
                                </button>
                                <button
                                    onClick={handleCancelSubscription}
                                    disabled={!cancelReason || cancelLoading}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] disabled:opacity-40 transition-all"
                                >
                                    {cancelLoading ? 'Processing...' : 'Continue'}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Step 2: Retention Offer */}
                    {cancelModal.step === 'offer' && cancelModal.retentionOffer && (
                        <>
                            <div className="text-center mb-6">
                                <span className="material-symbols-outlined text-4xl text-primary mb-3 block">{cancelModal.retentionOffer.icon || 'local_offer'}</span>
                                <h2 className="text-xl font-bold text-[var(--sys-text)]">{cancelModal.retentionOffer.headline || 'Wait! We have a special offer'}</h2>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-2">{cancelModal.retentionOffer.description}</p>
                            </div>
                            <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] rounded-2xl p-6 mb-6 text-center">
                                <p className="text-2xl font-black text-[var(--sys-text)] mb-1">
                                    {cancelModal.retentionOffer.offerType === 'discount' && `${cancelModal.retentionOffer.value}% OFF`}
                                    {cancelModal.retentionOffer.offerType === 'bonus_credits' && `+${cancelModal.retentionOffer.value} Credits`}
                                    {cancelModal.retentionOffer.offerType === 'free_month' && `${cancelModal.retentionOffer.value} Free Month(s)`}
                                    {cancelModal.retentionOffer.offerType === 'downgrade' && `Switch to ${cancelModal.retentionOffer.value}`}
                                </p>
                                <p className="text-xs text-primary/80">{cancelModal.retentionOffer.name}</p>
                            </div>
                            <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-4 mb-6">
                                <p className="text-sm text-[var(--sys-text-muted)]">
                                    <span className="material-symbols-outlined text-sm text-primary align-middle mr-1">schedule</span>
                                    Your <span className="text-[var(--sys-text)] font-bold">{cancelModal.plan}</span> access continues until end of billing period
                                    {cancelModal.daysRemaining > 0 && <> — <span className="text-primary font-bold">{cancelModal.daysRemaining} days remaining</span></>}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setCancelModal({ ...cancelModal, step: 'done' })}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all"
                                >
                                    No thanks, cancel
                                </button>
                                <button
                                    onClick={() => handleAcceptRetention(cancelModal.retentionOffer.id)}
                                    disabled={cancelLoading}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] disabled:opacity-40 transition-all"
                                >
                                    {cancelLoading ? 'Applying...' : 'Accept Offer!'}
                                </button>
                            </div>
                        </>
                    )}

                    {/* Step 3: Done */}
                    {cancelModal.step === 'done' && (
                        <>
                            <div className="text-center mb-6">
                                <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3 block">check_circle</span>
                                <h2 className="text-xl font-bold text-[var(--sys-text)]">Subscription Cancelled</h2>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-2">
                                    {cancelModal.message || `Your subscription has been cancelled. You'll continue to have access until the end of your billing period.`}
                                </p>
                            </div>
                            {cancelModal.daysRemaining > 0 && (
                                <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-xl p-4 mb-6 text-center">
                                    <p className="text-3xl font-black text-primary">{cancelModal.daysRemaining}</p>
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-wider font-bold mt-1">Days Remaining</p>
                                </div>
                            )}
                            <button
                                onClick={() => { setCancelModal(null); loadSubStatus() }}
                                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-light transition-all"
                            >
                                Got it
                            </button>
                        </>
                    )}
                </div>
            </div>
        )}
        {/* ══════════ Checkout Modal ══════════ */}
        {showCheckout && checkoutItem && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <div 
                    className="absolute inset-0 bg-[var(--sys-surface)] animate-fade-in" 
                    onClick={() => setShowCheckout(false)} 
                />
                <div className="relative w-full max-w-md bg-[#0f172a] border border-[var(--sys-border)] rounded-3xl overflow-hidden shadow-2xl animate-scale-in">
                    {/* Header */}
                    <div className="p-6 pb-4 border-b border-[var(--sys-border)] flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">shopping_cart</span>
                            Review Order
                        </h3>
                        <button onClick={() => setShowCheckout(false)} className="material-symbols-outlined text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all">close</button>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Item Summary */}
                        {(() => {
                            const priceObj = getDisplayPrice(checkoutItem, checkoutItem.type, checkoutItem.type === 'subscription' ? billingCycle : undefined);
                            const displayPriceStr = `${priceObj.symbol}${priceObj.currency === 'USD' ? priceObj.amount.toFixed(2) : priceObj.amount.toLocaleString()}`;
                            const subtotal = priceObj.amount;
                            const totalAmount = appliedCoupon?.finalPrice || subtotal;
                            
                            return (
                                <>
                                    <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl p-4 flex items-center gap-4">
                                        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-2xl text-primary">
                                                {checkoutItem.type === 'subscription' ? 'diamond' : (checkoutItem.icon || 'token')}
                                            </span>
                                        </div>
                                        <div className="flex-1">
                                            <h4 className="text-[var(--sys-text)] font-bold">{checkoutItem.name || (checkoutItem.type === 'subscription' ? 'Subscription Upgrade' : `${checkoutItem.total} Credits`)}</h4>
                                            <p className="text-xs text-[var(--sys-text-muted)]">
                                                {checkoutItem.type === 'subscription' ? `Billed ${billingCycle}` : `${checkoutItem.validityDays} Days Validity`}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-[var(--sys-text)]">{displayPriceStr}</p>
                                        </div>
                                    </div>

                                    {/* Coupon Section */}
                                    {activeBillingProvider !== 'shopify' && (
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider px-1">Promo Code</h4>
                                            {appliedCoupon ? (
                                                <div className="flex items-center justify-between bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] px-4 py-3 rounded-2xl">
                                                    <div className="flex items-center gap-3">
                                                        <span className="material-symbols-outlined text-primary">local_offer</span>
                                                        <div>
                                                            <p className="text-sm font-bold text-primary">{appliedCoupon.coupon.code}</p>
                                                            <p className="text-[10px] text-primary/80">
                                                                {appliedCoupon.coupon.discountType === 'percentage' 
                                                                    ? `${appliedCoupon.coupon.discountValue}% OFF Applied` 
                                                                    : `₹${appliedCoupon.coupon.discountValue} OFF Applied`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={removeCoupon}
                                                        className="text-xs font-bold text-primary hover:text-primary transition-all"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="relative group">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Enter coupon code..." 
                                                        value={couponInput}
                                                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                                                        className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl px-5 py-3.5 pr-24 text-sm text-[var(--sys-text)] focus:outline-none focus:border-primary/50 transition-all"
                                                    />
                                                    <button 
                                                        onClick={handleApplyCoupon}
                                                        disabled={couponLoading || !couponInput.trim()}
                                                        className="absolute right-2 top-2 bottom-2 px-4 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-bold hover:bg-primary/20 transition-all disabled:opacity-50"
                                                    >
                                                        {couponLoading ? '...' : 'Apply'}
                                                    </button>
                                                </div>
                                            )}
                                            {couponError && <p className="text-[10px] text-primary px-1">{couponError}</p>}
                                        </div>
                                    )}

                                    {/* Totals */}
                                    <div className="space-y-3 pt-2">
                                        <div className="flex justify-between text-sm text-[var(--sys-text-muted)]">
                                            <span>Subtotal</span>
                                            <span>{displayPriceStr}</span>
                                        </div>
                                        {appliedCoupon && (
                                            <div className="flex justify-between text-sm text-primary">
                                                <span>Discount ({appliedCoupon.coupon.code})</span>
                                                <span>-{priceObj.symbol}{appliedCoupon.discount?.toLocaleString()}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center pt-3 border-t border-[var(--sys-border)]">
                                            <span className="text-[var(--sys-text)] font-bold">Total Amount</span>
                                            <span className="text-2xl font-black text-[var(--sys-text)]">
                                                {priceObj.symbol}{priceObj.currency === 'USD' ? totalAmount.toFixed(2) : totalAmount.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}

                        {/* Action */}
                        <button 
                            onClick={() => {
                                if (checkoutItem.type === 'topup') confirmTopup(checkoutItem)
                                else confirmUpgrade(checkoutItem)
                                setShowCheckout(false)
                            }}
                            className="w-full py-4 bg-primary text-black font-black rounded-2xl shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            Proceed to Payment
                        </button>
                        
                        <p className="text-[10px] text-[var(--sys-text-muted)] text-center">
                            By proceeding, you agree to our Terms of Service. Payments are processed securely via {activeBillingProvider === 'shopify' ? 'Shopify Billing' : 'Razorpay'}.
                        </p>
                    </div>
                </div>
            </div>
        )}
    </>
    )
}

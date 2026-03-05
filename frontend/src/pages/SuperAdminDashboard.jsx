import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { superadmin as API } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function SuperAdminDashboard() {
    const navigate = useNavigate()
    const { user, login } = useAuth()
    const [tab, setTab] = useState('overview')
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [totalUsers, setTotalUsers] = useState(0)
    const [coupons, setCoupons] = useState([])
    const [brands, setBrands] = useState([])
    const [totalBrands, setTotalBrands] = useState(0)
    const [content, setContent] = useState([])
    const [totalContent, setTotalContent] = useState(0)
    const [subscriptions, setSubscriptions] = useState([])
    const [integrations, setIntegrations] = useState(null)
    const [aiHealth, setAiHealth] = useState(null)
    const [systemSettings, setSystemSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [planFilter, setPlanFilter] = useState('')
    const [userPage, setUserPage] = useState(1)
    const [toast, setToast] = useState(null)
    const [couponForm, setCouponForm] = useState({ code: '', discountType: 'credits', discountValue: '', maxUses: '', validUntil: '', description: '' })
    const [showCouponForm, setShowCouponForm] = useState(false)
    const [creditModal, setCreditModal] = useState(null)
    const [creditAmount, setCreditAmount] = useState('')
    const [planModal, setPlanModal] = useState(null)
    const [subForm, setSubForm] = useState({ userId: '', plan: 'professional', billingCycle: 'monthly', price: '', credits: '' })
    const [showSubForm, setShowSubForm] = useState(false)
    // Package Builder state
    const [packages, setPackages] = useState([])
    const [aiSuggestions, setAiSuggestions] = useState(null)
    const [aiAnalytics, setAiAnalytics] = useState(null)
    const [suggestingAI, setSuggestingAI] = useState(false)
    const [showPkgForm, setShowPkgForm] = useState(false)
    const [editingPkg, setEditingPkg] = useState(null)
    const [pkgForm, setPkgForm] = useState({
        name: '', description: '', tagline: '', tier: 1,
        studios: { contentStudio: false, creativeStudio: false, seoStudio: false, brainstormStudio: false },
        credits: { monthly: 50, rollover: false, bonusOnSignup: 0 },
        creditCosts: { content: 2, creative: 5, seo: 3, brainstorm: 3, photoshoot: 10 },
        limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 50, maxScheduledPosts: 10, socialIntegrations: 1 },
        features: [],
        pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' },
        badge: '', color: '#6366f1', icon: 'star',
    })
    const [newFeature, setNewFeature] = useState('')
    // Credit cost management state (must be before early return)
    const [creditCosts, setCreditCosts] = useState(null)
    const [editingCosts, setEditingCosts] = useState(null)

    if (user?.role !== 'superadmin') {
        return <DashboardLayout><div className="flex items-center justify-center h-screen"><div className="text-center"><span className="material-symbols-outlined text-6xl text-rose-500 mb-4">shield</span><h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2><p className="text-slate-500">Super Admin access required</p></div></div></DashboardLayout>
    }

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: 'dashboard' },
        { id: 'users', label: 'Users', icon: 'group' },
        { id: 'packages', label: 'Packages', icon: 'inventory_2' },
        { id: 'subscriptions', label: 'Subscriptions', icon: 'card_membership' },
        { id: 'coupons', label: 'Coupons', icon: 'confirmation_number' },
        { id: 'content', label: 'Content & Brands', icon: 'article' },
        { id: 'ai', label: 'AI & System', icon: 'smart_toy' },
        { id: 'integrations', label: 'Integrations', icon: 'hub' },
    ]

    useEffect(() => { loadStats() }, [])
    useEffect(() => {
        if (tab === 'users') loadUsers()
        if (tab === 'coupons') loadCoupons()
        if (tab === 'content') { loadBrands(); loadContent() }
        if (tab === 'subscriptions') loadSubscriptions()
        if (tab === 'ai') { loadAIHealth(); loadSettings(); loadCreditCosts() }
        if (tab === 'integrations') loadIntegrations()
        if (tab === 'packages') loadPackages()
    }, [tab, search, planFilter, userPage])

    const loadStats = async () => { try { const d = await API.getStats(); setStats(d.stats) } catch (e) { console.error(e) } finally { setLoading(false) } }
    const loadUsers = async () => { try { const d = await API.getUsers({ page: userPage, limit: 20, search, plan: planFilter }); setUsers(d.users || []); setTotalUsers(d.total || 0) } catch (e) { console.error(e) } }
    const loadCoupons = async () => { try { const d = await API.getCoupons(); setCoupons(d.coupons || []) } catch (e) { console.error(e) } }
    const loadBrands = async () => { try { const d = await API.getBrands({ limit: 50 }); setBrands(d.brands || []); setTotalBrands(d.total || 0) } catch (e) { console.error(e) } }
    const loadContent = async () => { try { const d = await API.getContent({ limit: 50 }); setContent(d.content || []); setTotalContent(d.total || 0) } catch (e) { console.error(e) } }
    const loadSubscriptions = async () => { try { const d = await API.getSubscriptions(); setSubscriptions(d.subscriptions || []) } catch (e) { console.error(e) } }
    const loadAIHealth = async () => { try { const d = await API.getAIHealth(); setAiHealth(d.aiHealth) } catch (e) { console.error(e) } }
    const loadSettings = async () => { try { const d = await API.getSystemSettings(); setSystemSettings(d.settings) } catch (e) { console.error(e) } }
    const loadIntegrations = async () => { try { const d = await API.getIntegrations(); setIntegrations(d) } catch (e) { console.error(e) } }
    const loadPackages = async () => { try { const d = await API.getPackages(); setPackages(d.packages || []) } catch (e) { console.error(e) } }
    const handleAISuggest = async () => { setSuggestingAI(true); try { const d = await API.aiSuggestPackages(); setAiSuggestions(d.suggestions || []); setAiAnalytics(d.analytics) } catch (e) { showToast('AI suggestion failed', 'error') } finally { setSuggestingAI(false) } }
    const handleSeedDefaults = async () => { if (!confirm('Seed default packages?')) return; try { const d = await API.seedDefaultPackages(packages.length > 0); showToast(d.message || 'Packages seeded'); loadPackages() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleSavePkg = async (e) => { e.preventDefault(); try { if (editingPkg) { await API.updatePackage(editingPkg._id, pkgForm); showToast('Package updated') } else { await API.createPackage(pkgForm); showToast('Package created') } setShowPkgForm(false); setEditingPkg(null); resetPkgForm(); loadPackages() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleDeletePkg = async (id, name) => { if (!confirm(`Delete package "${name}"?`)) return; try { await API.deletePackage(id); showToast('Deleted'); loadPackages() } catch { showToast('Failed', 'error') } }
    const handleEditPkg = (pkg) => { setEditingPkg(pkg); setPkgForm({ name: pkg.name, description: pkg.description || '', tagline: pkg.tagline || '', tier: pkg.tier || 1, studios: pkg.studios || {}, credits: pkg.credits || { monthly: 50, rollover: false, bonusOnSignup: 0 }, creditCosts: pkg.creditCosts || { content: 2, creative: 5, seo: 3, brainstorm: 3, photoshoot: 10 }, limits: pkg.limits || {}, features: pkg.features || [], pricing: pkg.pricing || { monthly: 0, quarterly: 0, yearly: 0 }, badge: pkg.badge || '', color: pkg.color || '#6366f1', icon: pkg.icon || 'star' }); setShowPkgForm(true) }
    const handleAdoptSuggestion = async (s) => { try { await API.createPackage({ ...s, createdBy: undefined }); showToast(`"${s.name}" adopted`); loadPackages() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const resetPkgForm = () => setPkgForm({ name: '', description: '', tagline: '', tier: 1, studios: { contentStudio: false, creativeStudio: false, seoStudio: false, brainstormStudio: false }, credits: { monthly: 50, rollover: false, bonusOnSignup: 0 }, creditCosts: { content: 2, creative: 5, seo: 3, brainstorm: 3, photoshoot: 10 }, limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 50, maxScheduledPosts: 10, socialIntegrations: 1 }, features: [], pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' }, badge: '', color: '#6366f1', icon: 'star' })
    // Credit cost management functions (useState moved to top with other hooks)
    const loadCreditCosts = async () => { try { const d = await API.getCreditCosts(); setCreditCosts(d.costs); } catch (e) { console.error(e) } }
    const handleSaveCosts = async () => { try { await API.updateCreditCosts(editingCosts); showToast('Credit costs updated'); setEditingCosts(null); loadCreditCosts() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleResetCosts = async () => { if (!confirm('Reset all credit costs to defaults?')) return; try { await API.resetCreditCosts(); showToast('Reset to defaults'); setEditingCosts(null); loadCreditCosts() } catch { showToast('Failed', 'error') } }
    const creditCostLabels = { content: 'Content Generate', contentRefine: 'Content Refine/Regen', creative: 'Creative (Image)', photoshoot: 'AI Photoshoot', seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic', seoCompetitors: 'SEO Competitors', seoAiVisibility: 'SEO AI Visibility', seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit', seoCompetitorDiscover: 'SEO Discover', brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine', brainstormChat: 'Brainstorm Chat', brainstormScreenplay: 'Screenplay', trendRefresh: 'Trend Refresh' }
    const addFeature = () => { if (!newFeature.trim()) return; setPkgForm(f => ({ ...f, features: [...f.features, { name: newFeature.trim(), included: true }] })); setNewFeature('') }
    const removeFeature = (i) => setPkgForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }))
    const studioNames = { contentStudio: 'Content Studio', creativeStudio: 'Creative Studio', seoStudio: 'SEO Studio', brainstormStudio: 'Brainstorm Studio' }

    // Actions
    const handleImpersonate = async (id, name) => { if (!confirm(`Login as ${name}?`)) return; try { const d = await API.impersonateUser(id); login(d.token, d.user); navigate('/dashboard') } catch { showToast('Failed', 'error') } }
    const handleAddCredits = async () => { if (!creditModal || !creditAmount) return; try { await API.addCredits(creditModal._id, { amount: parseInt(creditAmount), reason: 'Super admin' }); showToast(`+${creditAmount} credits`); setCreditModal(null); setCreditAmount(''); loadUsers() } catch { showToast('Failed', 'error') } }
    const handleResetCredits = async (id) => { if (!confirm('Reset used credits to 0?')) return; try { await API.resetCredits(id); showToast('Reset done'); loadUsers() } catch { showToast('Failed', 'error') } }
    const handleChangePlan = async (id, plan) => { try { await API.updateUser(id, { plan }); showToast(`Plan → ${plan}`); setPlanModal(null); loadUsers(); loadStats() } catch { showToast('Failed', 'error') } }
    const handleDeleteUser = async (id, name) => { if (!confirm(`DELETE ${name} and ALL data?`)) return; try { await API.deleteUser(id); showToast('Deleted'); loadUsers(); loadStats() } catch { showToast('Failed', 'error') } }
    const handleDeleteBrand = async (id, name) => { if (!confirm(`Delete brand "${name}" and all data?`)) return; try { await API.deleteBrand(id); showToast('Brand deleted'); loadBrands(); loadStats() } catch { showToast('Failed', 'error') } }
    const handleDeleteContent = async (id) => { if (!confirm('Delete this content?')) return; try { await API.deleteContent(id); showToast('Deleted'); loadContent() } catch { showToast('Failed', 'error') } }
    const handleCreateCoupon = async (e) => { e.preventDefault(); try { await API.createCoupon({ ...couponForm, discountValue: Number(couponForm.discountValue), maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : 0, validUntil: couponForm.validUntil || null }); showToast('Coupon created'); setShowCouponForm(false); setCouponForm({ code: '', discountType: 'credits', discountValue: '', maxUses: '', validUntil: '', description: '' }); loadCoupons() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleToggleCoupon = async (id, isActive) => { try { await API.updateCoupon(id, { isActive: !isActive }); loadCoupons() } catch { showToast('Failed', 'error') } }
    const handleDeleteCoupon = async (id) => { if (!confirm('Delete coupon?')) return; try { await API.deleteCoupon(id); showToast('Deleted'); loadCoupons() } catch { showToast('Failed', 'error') } }
    const handleCreateSub = async (e) => { e.preventDefault(); try { await API.createSubscription({ ...subForm, price: Number(subForm.price || 0), credits: subForm.credits ? Number(subForm.credits) : undefined }); showToast('Subscription created'); setShowSubForm(false); loadSubscriptions(); loadUsers() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleToggleSetting = async (key, val) => { try { await API.updateSystemSettings({ [key]: val }); showToast('Updated'); loadSettings() } catch { showToast('Failed', 'error') } }

    const pc = { starter: { c: 'slate', cr: 50, p: 'Free' }, professional: { c: 'blue', cr: 500, p: '₹999/mo' }, enterprise: { c: 'amber', cr: '∞', p: '₹4,999/mo' } }
    const platformIcons = { instagram: '📸', facebook: '📘', linkedin: '💼', twitter: '🐦', shopify: '🛍️', 'google-analytics': '📊' }

    const Card = ({ icon, color, value, label }) => (
        <div className="glass-panel rounded-2xl p-5">
            <span className={`material-symbols-outlined text-2xl mb-3 block ${color}`}>{icon}</span>
            <p className="text-3xl font-extrabold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-sm text-slate-500 mt-1">{label}</p>
        </div>
    )

    return (
        <DashboardLayout>
            <div className="p-8 max-w-[1400px] mx-auto">
                {toast && <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-xl ${toast.type === 'error' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>{toast.msg}</div>}

                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-400 text-3xl">shield_person</span>
                            Super Admin
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Complete platform management</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] overflow-x-auto">
                    {tabs.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer
                                ${tab === t.id ? 'bg-amber-500/20 text-amber-400 shadow-lg' : 'text-slate-400 hover:bg-white/[0.04]'}`}>
                            <span className="material-symbols-outlined text-base">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ════════════ OVERVIEW ════════════ */}
                {tab === 'overview' && (
                    <div>
                        {loading ? <div className="flex items-center justify-center py-20 text-slate-500"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...</div> : stats && (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                                    <Card icon="group" color="text-blue-400" value={stats.totalUsers} label="Users" />
                                    <Card icon="branding_watermark" color="text-purple-400" value={stats.totalBrands} label="Brands" />
                                    <Card icon="article" color="text-emerald-400" value={stats.totalContent} label="Content" />
                                    <Card icon="image" color="text-pink-400" value={stats.totalCreatives} label="Creatives" />
                                    <Card icon="inventory_2" color="text-cyan-400" value={stats.totalProducts} label="Products" />
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-amber-400">payments</span><span className="text-sm font-bold text-white">Revenue</span></div>
                                        <p className="text-2xl font-extrabold text-amber-400">₹{(stats.totalRevenue || 0).toLocaleString()}</p>
                                        <p className="text-xs text-slate-600 mt-1">{stats.totalSubscriptions} active subs</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-cyan-400">token</span><span className="text-sm font-bold text-white">Credits Used</span></div>
                                        <p className="text-2xl font-extrabold text-cyan-400">{(stats.totalCreditsUsed || 0).toLocaleString()}</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-emerald-400">hub</span><span className="text-sm font-bold text-white">Integrations</span></div>
                                        <p className="text-2xl font-extrabold text-emerald-400">{stats.totalIntegrations}</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-rose-400">rate_review</span><span className="text-sm font-bold text-white">AI Feedback</span></div>
                                        <p className="text-2xl font-extrabold text-rose-400">{stats.totalFeedback}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-lg">pie_chart</span>Plan Distribution</h3>
                                        <div className="flex gap-3">{(stats.planDistribution || []).map(p => (
                                            <div key={p._id || 'none'} className="flex-1 glass-panel rounded-xl p-3 text-center">
                                                <p className="text-xl font-extrabold text-white">{p.count}</p>
                                                <p className="text-xs font-bold mt-1 capitalize text-slate-400">{p._id || 'None'}</p>
                                            </div>
                                        ))}</div>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-emerald-400 text-lg">bar_chart</span>Content by Type</h3>
                                        <div className="space-y-2">{(stats.contentByType || []).map(c => (
                                            <div key={c._id} className="flex items-center justify-between">
                                                <span className="text-sm text-slate-400 capitalize">{c._id}</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.count / Math.max(1, stats.totalContent)) * 100)}%` }} /></div>
                                                    <span className="text-sm font-bold text-white w-6 text-right">{c.count}</span>
                                                </div>
                                            </div>
                                        ))}</div>
                                    </div>
                                </div>
                                <div className="glass-panel rounded-2xl p-5">
                                    <h3 className="font-bold text-white text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-blue-400 text-lg">group</span>Recent Users</h3>
                                    <div className="space-y-1">{(stats.recentUsers || []).map(u => (
                                        <div key={u._id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/[0.03] transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{u.name?.[0]?.toUpperCase()}</div>
                                                <div><p className="text-sm font-bold text-white">{u.name}</p><p className="text-xs text-slate-600">{u.email}</p></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-bold capitalize ${u.plan === 'enterprise' ? 'bg-amber-500/15 text-amber-400' : u.plan === 'professional' ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-500/15 text-slate-400'}`}>{u.plan}</span>
                                                <span className="text-xs text-slate-600">{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                            </div>
                                        </div>
                                    ))}</div>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ USERS ════════════ */}
                {tab === 'users' && (
                    <div>
                        <div className="flex gap-3 mb-5">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg">search</span>
                                <input type="text" value={search} onChange={e => { setSearch(e.target.value); setUserPage(1) }} placeholder="Search name, email, company..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none focus:border-primary/50" />
                            </div>
                            <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setUserPage(1) }} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none cursor-pointer">
                                <option value="">All Plans</option><option value="starter">Starter</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option>
                            </select>
                        </div>
                        <p className="text-xs text-slate-600 mb-3">{totalUsers} users</p>
                        <div className="space-y-2">{users.map(u => (
                            <div key={u._id} className="glass-panel rounded-2xl p-4 hover:bg-white/[0.03] transition-all">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">{u.name?.[0]?.toUpperCase()}</div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-base font-bold text-white truncate">{u.name}</p>
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-bold capitalize ${u.plan === 'enterprise' ? 'bg-amber-500/15 text-amber-400' : u.plan === 'professional' ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-500/15 text-slate-400'}`}>{u.plan}</span>
                                                <span className="text-xs px-1.5 py-0.5 rounded font-bold capitalize bg-white/[0.05] text-slate-500">{u.role}</span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 truncate">{u.email} {u.company ? `• ${u.company}` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="text-center mx-4 shrink-0">
                                        <p className="text-base font-bold text-white">{u.creditBalance?.unlimited ? '∞' : `${u.creditBalance?.remaining || 0}`}</p>
                                        <p className="text-xs text-slate-600">credits</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={() => setCreditModal(u)} title="Add Credits" className="p-2 rounded-lg hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">add_circle</span></button>
                                        <button onClick={() => handleResetCredits(u._id)} title="Reset Credits" className="p-2 rounded-lg hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">restart_alt</span></button>
                                        <button onClick={() => setPlanModal(u)} title="Change Plan" className="p-2 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">upgrade</span></button>
                                        <button onClick={() => handleImpersonate(u._id, u.name)} title="Login as User" className="p-2 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">login</span></button>
                                        <button onClick={() => handleDeleteUser(u._id, u.name)} title="Delete" className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">delete</span></button>
                                    </div>
                                </div>
                            </div>
                        ))}</div>
                        {totalUsers > 20 && <div className="flex justify-center gap-2 mt-6">
                            <button disabled={userPage <= 1} onClick={() => setUserPage(p => p - 1)} className="px-4 py-2 rounded-lg bg-white/[0.04] text-sm text-slate-400 disabled:opacity-30 cursor-pointer">← Prev</button>
                            <span className="px-4 py-2 text-sm text-slate-500">Page {userPage}</span>
                            <button disabled={users.length < 20} onClick={() => setUserPage(p => p + 1)} className="px-4 py-2 rounded-lg bg-white/[0.04] text-sm text-slate-400 disabled:opacity-30 cursor-pointer">Next →</button>
                        </div>}
                    </div>
                )}

                {/* ════════════ PACKAGES ════════════ */}
                {tab === 'packages' && (
                    <div>
                        {/* Header row */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-400">inventory_2</span>
                                    Subscription Packages ({packages.length})
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">AI-driven package builder — design, suggest, and manage subscription tiers</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSeedDefaults} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 text-xs font-medium hover:bg-white/[0.06] flex items-center gap-1.5 cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">database</span>Seed Defaults
                                </button>
                                <button onClick={handleAISuggest} disabled={suggestingAI} className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-300 text-xs font-bold hover:from-purple-500/30 hover:to-indigo-500/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                    <span className={`material-symbols-outlined text-sm ${suggestingAI ? 'animate-spin' : ''}`}>{suggestingAI ? 'progress_activity' : 'auto_awesome'}</span>
                                    {suggestingAI ? 'Analyzing...' : 'AI Suggest Packages'}
                                </button>
                                <button onClick={() => { resetPkgForm(); setEditingPkg(null); setShowPkgForm(!showPkgForm) }} className="btn-primary py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">add</span>New Package
                                </button>
                            </div>
                        </div>

                        {/* AI Suggestions Panel */}
                        {aiSuggestions && aiSuggestions.length > 0 && (
                            <div className="mb-6">
                                <div className="glass-panel rounded-2xl p-5 border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-purple-400">auto_awesome</span>
                                        <h4 className="font-bold text-white text-sm">AI-Recommended Packages</h4>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold">Based on platform analytics</span>
                                        <button onClick={() => setAiSuggestions(null)} className="ml-auto text-slate-600 hover:text-slate-400 cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button>
                                    </div>
                                    {/* Analytics summary */}
                                    {aiAnalytics && (
                                        <div className="flex gap-3 mb-4">
                                            {[{ l: 'Users', v: aiAnalytics.totalUsers, c: 'text-blue-400' }, { l: 'Content', v: aiAnalytics.totalContent, c: 'text-emerald-400' }, { l: 'Creatives', v: aiAnalytics.totalCreatives, c: 'text-pink-400' }, { l: 'SEO Audits', v: aiAnalytics.seoUsage, c: 'text-cyan-400' }].map(a => (
                                                <div key={a.l} className="px-3 py-2 rounded-lg bg-white/[0.03] text-center">
                                                    <p className={`text-sm font-bold ${a.c}`}>{a.v}</p>
                                                    <p className="text-xs text-slate-600">{a.l}</p>
                                                </div>
                                            ))}
                                            {aiAnalytics.contentHeavy && <span className="self-center text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-bold">Content-Heavy</span>}
                                            {aiAnalytics.creativeHeavy && <span className="self-center text-xs px-2 py-1 rounded bg-pink-500/10 text-pink-400 font-bold">Creative-Heavy</span>}
                                            {aiAnalytics.seoActive && <span className="self-center text-xs px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 font-bold">SEO Active</span>}
                                        </div>
                                    )}
                                    {/* Suggestion cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {aiSuggestions.map((s, i) => (
                                            <div key={i} className="relative rounded-xl border border-white/[0.08] p-4 hover:border-purple-500/30 transition-all" style={{ background: `linear-gradient(135deg, ${s.color}08, transparent)` }}>
                                                {s.badge && <span className="absolute -top-2 right-3 text-[8px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: s.color }}>{s.badge}</span>}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="material-symbols-outlined text-lg" style={{ color: s.color }}>{s.icon || 'star'}</span>
                                                    <h5 className="font-bold text-white text-sm">{s.name}</h5>
                                                </div>
                                                <p className="text-sm text-slate-500 mb-3 line-clamp-2">{s.description}</p>
                                                {/* Studios */}
                                                <div className="flex gap-1 mb-2">
                                                    {Object.entries(s.studios || {}).map(([k, v]) => (
                                                        <span key={k} className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${v ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.04] text-slate-700 line-through'}`}>{studioNames[k]?.split(' ')[0]}</span>
                                                    ))}
                                                </div>
                                                <div className="flex items-baseline gap-2 mb-2">
                                                    <span className="text-lg font-extrabold text-white">₹{s.pricing?.monthly?.toLocaleString()}</span>
                                                    <span className="text-xs text-slate-600">/mo</span>
                                                    <span className="text-sm text-slate-500 ml-auto">{s.credits?.monthly >= 999999 ? '∞' : s.credits?.monthly} credits</span>
                                                </div>
                                                {/* AI rationale */}
                                                <p className="text-xs text-purple-400/70 italic mb-3 line-clamp-2">🤖 {s.aiRationale}</p>
                                                <button onClick={() => handleAdoptSuggestion(s)} className="w-full py-2 rounded-lg text-sm font-bold text-white cursor-pointer hover:opacity-90 transition-all" style={{ background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)` }}>
                                                    Adopt This Package
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Package Creation / Edit Form */}
                        {showPkgForm && (
                            <form onSubmit={handleSavePkg} className="glass-panel rounded-2xl p-6 mb-6 border border-primary/20">
                                <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">{editingPkg ? 'edit' : 'add_circle'}</span>
                                    {editingPkg ? `Edit: ${editingPkg.name}` : 'Create New Package'}
                                </h4>
                                {/* Row 1: Basic info */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    <input type="text" placeholder="Package Name *" value={pkgForm.name} onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" required />
                                    <input type="text" placeholder="Tagline" value={pkgForm.tagline} onChange={e => setPkgForm(f => ({ ...f, tagline: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    <select value={pkgForm.tier} onChange={e => setPkgForm(f => ({ ...f, tier: Number(e.target.value) }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none cursor-pointer">
                                        <option value={1}>Tier 1 — Basic</option><option value={2}>Tier 2 — Pro</option><option value={3}>Tier 3 — Enterprise</option>
                                    </select>
                                    <input type="text" placeholder="Badge (POPULAR, etc)" value={pkgForm.badge} onChange={e => setPkgForm(f => ({ ...f, badge: e.target.value.toUpperCase() }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                </div>
                                <textarea placeholder="Description" value={pkgForm.description} onChange={e => setPkgForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full mb-4 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none resize-none" />

                                {/* Row 2: Studio Access */}
                                <h5 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-indigo-400">apps</span>Studio Access</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    {Object.entries(studioNames).map(([key, label]) => (
                                        <button key={key} type="button" onClick={() => setPkgForm(f => ({ ...f, studios: { ...f.studios, [key]: !f.studios[key] } }))}
                                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${pkgForm.studios[key] ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-bold text-white">{label}</span>
                                                <span className={`material-symbols-outlined text-sm ${pkgForm.studios[key] ? 'text-emerald-400' : 'text-slate-700'}`}>{pkgForm.studios[key] ? 'check_circle' : 'cancel'}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Row 3: Credits */}
                                <h5 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-amber-400">token</span>Credits & Costs</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                                    <div>
                                        <label className="text-xs text-slate-600 block mb-1">Monthly Credits</label>
                                        <input type="number" value={pkgForm.credits.monthly} onChange={e => setPkgForm(f => ({ ...f, credits: { ...f.credits, monthly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-600 block mb-1">Signup Bonus</label>
                                        <input type="number" value={pkgForm.credits.bonusOnSignup} onChange={e => setPkgForm(f => ({ ...f, credits: { ...f.credits, bonusOnSignup: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    </div>
                                    <div className="flex items-end">
                                        <button type="button" onClick={() => setPkgForm(f => ({ ...f, credits: { ...f.credits, rollover: !f.credits.rollover } }))}
                                            className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${pkgForm.credits.rollover ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.04] text-slate-500 border border-white/[0.08]'}`}>
                                            <span className="material-symbols-outlined text-sm">{pkgForm.credits.rollover ? 'check' : 'close'}</span>Rollover
                                        </button>
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-600 block mb-1">Content Cost</label>
                                        <input type="number" value={pkgForm.creditCosts.content} onChange={e => setPkgForm(f => ({ ...f, creditCosts: { ...f.creditCosts, content: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-slate-600 block mb-1">Creative Cost</label>
                                        <input type="number" value={pkgForm.creditCosts.creative} onChange={e => setPkgForm(f => ({ ...f, creditCosts: { ...f.creditCosts, creative: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    </div>
                                </div>

                                {/* Row 4: Limits + Pricing */}
                                <h5 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-blue-400">tune</span>Limits & Pricing</h5>
                                <div className="grid grid-cols-7 gap-3 mb-4">
                                    <div><label className="text-xs text-slate-600 block mb-1">Max Brands</label><input type="number" value={pkgForm.limits.maxBrands} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxBrands: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">Team Seats</label><input type="number" value={pkgForm.limits.maxTeamMembers} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxTeamMembers: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">Products</label><input type="number" value={pkgForm.limits.maxProducts} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxProducts: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">Sched. Posts</label><input type="number" value={pkgForm.limits.maxScheduledPosts} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxScheduledPosts: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">Social Accs</label><input type="number" value={pkgForm.limits.socialIntegrations} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, socialIntegrations: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">₹ Monthly</label><input type="number" value={pkgForm.pricing.monthly} onChange={e => setPkgForm(f => ({ ...f, pricing: { ...f.pricing, monthly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">₹ Quarterly</label><input type="number" value={pkgForm.pricing.quarterly} onChange={e => setPkgForm(f => ({ ...f, pricing: { ...f.pricing, quarterly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                    <div><label className="text-xs text-slate-600 block mb-1">₹ Yearly</label><input type="number" value={pkgForm.pricing.yearly} onChange={e => setPkgForm(f => ({ ...f, pricing: { ...f.pricing, yearly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" /></div>
                                </div>

                                {/* Row 5: Features */}
                                <h5 className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-emerald-400">checklist</span>Features</h5>
                                <div className="flex gap-2 mb-2">
                                    <input type="text" value={newFeature} onChange={e => setNewFeature(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())} placeholder="Add feature (e.g. AI Photoshoot)" className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    <button type="button" onClick={addFeature} className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold cursor-pointer">+ Add</button>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    {pkgForm.features.map((f, i) => (
                                        <span key={i} className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center gap-1">
                                            {f.name}
                                            <button type="button" onClick={() => removeFeature(i)} className="text-emerald-600 hover:text-rose-400 cursor-pointer">×</button>
                                        </span>
                                    ))}
                                </div>

                                {/* Row 6: Color + actions */}
                                <div className="flex items-center gap-3">
                                    <label className="text-xs text-slate-600">Color</label>
                                    <input type="color" value={pkgForm.color} onChange={e => setPkgForm(f => ({ ...f, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                                    <input type="text" placeholder="Icon name" value={pkgForm.icon} onChange={e => setPkgForm(f => ({ ...f, icon: e.target.value }))} className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none w-32" />
                                    <div className="flex-1" />
                                    <button type="button" onClick={() => { setShowPkgForm(false); setEditingPkg(null) }} className="px-4 py-2 rounded-lg text-sm text-slate-400 cursor-pointer">Cancel</button>
                                    <button type="submit" className="btn-primary px-6 py-2 rounded-lg text-sm cursor-pointer">{editingPkg ? 'Update' : 'Create'} Package</button>
                                </div>
                            </form>
                        )}

                        {/* Existing Packages Grid */}
                        {packages.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {packages.map(pkg => (
                                    <div key={pkg._id} className="relative glass-panel rounded-2xl overflow-hidden hover:border-white/[0.12] transition-all" style={{ borderTop: `3px solid ${pkg.color || '#6366f1'}` }}>
                                        {pkg.badge && <span className="absolute top-3 right-3 text-[8px] px-2 py-0.5 rounded-full font-bold text-white" style={{ background: pkg.color }}>{pkg.badge}</span>}
                                        <div className="p-5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="material-symbols-outlined" style={{ color: pkg.color }}>{pkg.icon || 'star'}</span>
                                                <h4 className="text-base font-extrabold text-white">{pkg.name}</h4>
                                                {pkg.generatedByAI && <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold">AI</span>}
                                            </div>
                                            {pkg.tagline && <p className="text-sm text-slate-500 mb-3">{pkg.tagline}</p>}

                                            {/* Price */}
                                            <div className="flex items-baseline gap-1 mb-3">
                                                <span className="text-2xl font-extrabold text-white">₹{(pkg.pricing?.monthly || 0).toLocaleString()}</span>
                                                <span className="text-xs text-slate-600">/mo</span>
                                                {pkg.pricing?.quarterly > 0 && <span className="text-sm text-slate-500 ml-1">₹{(pkg.pricing?.quarterly || 0).toLocaleString()}/qtr</span>}
                                                {pkg.pricing?.yearly > 0 && <span className="text-sm text-slate-500 ml-1">₹{(pkg.pricing?.yearly || 0).toLocaleString()}/yr</span>}
                                            </div>

                                            {/* Studios */}
                                            <div className="flex gap-1 mb-3">
                                                {Object.entries(pkg.studios || {}).map(([k, v]) => (
                                                    <span key={k} className={`text-xs px-2 py-0.5 rounded-full font-bold ${v ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/[0.04] text-slate-700 line-through'}`}>{studioNames[k]?.split(' ')[0]}</span>
                                                ))}
                                            </div>

                                            {/* Credits */}
                                            <div className="flex gap-3 mb-3 text-center">
                                                <div className="flex-1 p-2 rounded-lg bg-white/[0.03]">
                                                    <p className="text-sm font-bold text-amber-400">{pkg.credits?.monthly >= 999999 ? '∞' : pkg.credits?.monthly || 0}</p>
                                                    <p className="text-[8px] text-slate-600">credits/mo</p>
                                                </div>
                                                <div className="flex-1 p-2 rounded-lg bg-white/[0.03]">
                                                    <p className="text-base font-bold text-white">{pkg.limits?.maxBrands >= 999 ? '∞' : pkg.limits?.maxBrands || 0}</p>
                                                    <p className="text-[8px] text-slate-600">brands</p>
                                                </div>
                                                <div className="flex-1 p-2 rounded-lg bg-white/[0.03]">
                                                    <p className="text-base font-bold text-white">{pkg.limits?.maxTeamMembers || 0}</p>
                                                    <p className="text-[8px] text-slate-600">seats</p>
                                                </div>
                                            </div>

                                            {/* Features */}
                                            {pkg.features?.length > 0 && (
                                                <div className="space-y-1 mb-3">
                                                    {pkg.features.slice(0, 5).map((f, i) => (
                                                        <div key={i} className="flex items-center gap-1.5">
                                                            <span className={`material-symbols-outlined text-xs ${f.included ? 'text-emerald-400' : 'text-slate-700'}`}>{f.included ? 'check' : 'close'}</span>
                                                            <span className={`text-xs ${f.included ? 'text-slate-400' : 'text-slate-700 line-through'}`}>{f.name}</span>
                                                        </div>
                                                    ))}
                                                    {pkg.features.length > 5 && <p className="text-xs text-slate-600 pl-5">+{pkg.features.length - 5} more</p>}
                                                </div>
                                            )}

                                            {/* Rollover + subscriber badge */}
                                            <div className="flex items-center gap-2 mb-3">
                                                {pkg.credits?.rollover && <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-bold">Rollover</span>}
                                                {pkg.isDefault && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold">DEFAULT</span>}
                                                <span className="text-xs text-slate-600 ml-auto">{pkg.subscriberCount || 0} users</span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
                                                <button onClick={() => handleEditPkg(pkg)} className="flex-1 py-2 rounded-lg bg-white/[0.04] text-xs font-bold text-slate-400 hover:text-white hover:bg-white/[0.06] flex items-center justify-center gap-1 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">edit</span>Edit
                                                </button>
                                                <button onClick={() => handleDeletePkg(pkg._id, pkg.name)} className="py-2 px-3 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 glass-panel rounded-2xl">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">inventory_2</span>
                                <h3 className="text-lg font-bold text-white mb-1">No Packages Yet</h3>
                                <p className="text-sm text-slate-500 mb-4">Use AI to suggest packages based on usage patterns, or create one manually</p>
                                <button onClick={handleAISuggest} disabled={suggestingAI} className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 text-purple-300 text-sm font-bold cursor-pointer">
                                    <span className="material-symbols-outlined text-sm align-middle mr-1">auto_awesome</span>Generate AI Suggestions
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ SUBSCRIPTIONS ════════════ */}
                {tab === 'subscriptions' && (
                    <div>
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold text-white">{subscriptions.length} Subscriptions</h3>
                            <button onClick={() => setShowSubForm(!showSubForm)} className="btn-primary py-2.5 px-5 rounded-xl text-sm flex items-center gap-2 cursor-pointer"><span className="material-symbols-outlined text-sm">add</span>Assign Subscription</button>
                        </div>
                        {showSubForm && (
                            <form onSubmit={handleCreateSub} className="glass-panel rounded-2xl p-6 mb-5 border border-primary/20">
                                <h4 className="font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-lg">card_membership</span>Assign Subscription</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <select value={subForm.userId} onChange={e => setSubForm(f => ({ ...f, userId: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" required>
                                        <option value="">Select User</option>
                                        {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
                                    </select>
                                    <select value={subForm.plan} onChange={e => setSubForm(f => ({ ...f, plan: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none">
                                        <option value="starter">Starter (50 credits)</option><option value="professional">Professional (500 credits)</option><option value="enterprise">Enterprise (Unlimited)</option>
                                    </select>
                                    <select value={subForm.billingCycle} onChange={e => setSubForm(f => ({ ...f, billingCycle: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none">
                                        <option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="lifetime">Lifetime</option>
                                    </select>
                                    <input type="number" placeholder="Price (₹)" value={subForm.price} onChange={e => setSubForm(f => ({ ...f, price: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    <input type="number" placeholder="Custom credits (optional)" value={subForm.credits} onChange={e => setSubForm(f => ({ ...f, credits: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    <div className="flex gap-2 justify-end items-center">
                                        <button type="button" onClick={() => setShowSubForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/[0.04] cursor-pointer">Cancel</button>
                                        <button type="submit" className="btn-primary px-6 py-2 rounded-lg text-sm cursor-pointer">Create</button>
                                    </div>
                                </div>
                            </form>
                        )}
                        <div className="space-y-2">{subscriptions.map(s => (
                            <div key={s._id} className="glass-panel rounded-2xl p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><span className="material-symbols-outlined text-blue-400">card_membership</span></div>
                                        <div>
                                            <p className="text-base font-bold text-white">{s.user?.name || 'Unknown'} <span className="text-slate-500 text-xs font-normal">({s.user?.email})</span></p>
                                            <p className="text-[11px] text-slate-500 capitalize">{s.plan} • {s.billingCycle} • {s.status}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-center"><p className="text-base font-bold text-white">{s.credits?.used || 0}/{s.credits?.total || 0}</p><p className="text-xs text-slate-600">credits used</p></div>
                                        <div className="text-center"><p className="text-sm font-bold text-amber-400">₹{(s.price || 0).toLocaleString()}</p><p className="text-xs text-slate-600">paid</p></div>
                                        <div className="text-center"><p className="text-sm text-slate-400">{s.endDate ? new Date(s.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p><p className="text-xs text-slate-600">expires</p></div>
                                    </div>
                                </div>
                            </div>
                        ))}</div>
                        {subscriptions.length === 0 && <div className="text-center py-16 glass-panel rounded-2xl"><span className="material-symbols-outlined text-5xl text-slate-700 mb-3">card_membership</span><h3 className="text-lg font-bold text-white mb-1">No Subscriptions</h3><p className="text-sm text-slate-500">Assign subscriptions to users</p></div>}
                    </div>
                )}

                {/* ════════════ COUPONS ════════════ */}
                {tab === 'coupons' && (
                    <div>
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-lg font-bold text-white">{coupons.length} Coupons</h3>
                            <button onClick={() => setShowCouponForm(!showCouponForm)} className="btn-primary py-2.5 px-5 rounded-xl text-sm flex items-center gap-2 cursor-pointer"><span className="material-symbols-outlined text-sm">add</span>New Coupon</button>
                        </div>
                        {showCouponForm && (
                            <form onSubmit={handleCreateCoupon} className="glass-panel rounded-2xl p-6 mb-5 border border-primary/20">
                                <h4 className="font-bold text-white mb-4">Create Coupon</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <input type="text" placeholder="CODE (e.g. WELCOME50)" value={couponForm.code} onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none uppercase" required />
                                    <select value={couponForm.discountType} onChange={e => setCouponForm(f => ({ ...f, discountType: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none cursor-pointer">
                                        <option value="credits">Bonus Credits</option><option value="percentage">% Discount</option><option value="fixed">Fixed ₹ Off</option>
                                    </select>
                                    <input type="number" placeholder="Value" value={couponForm.discountValue} onChange={e => setCouponForm(f => ({ ...f, discountValue: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" required />
                                    <input type="number" placeholder="Max uses (0=unlimited)" value={couponForm.maxUses} onChange={e => setCouponForm(f => ({ ...f, maxUses: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    <input type="date" value={couponForm.validUntil} onChange={e => setCouponForm(f => ({ ...f, validUntil: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                    <input type="text" placeholder="Description" value={couponForm.description} onChange={e => setCouponForm(f => ({ ...f, description: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none" />
                                </div>
                                <div className="flex justify-end gap-3 mt-4">
                                    <button type="button" onClick={() => setShowCouponForm(false)} className="px-4 py-2 rounded-lg text-sm text-slate-400 cursor-pointer">Cancel</button>
                                    <button type="submit" className="btn-primary px-6 py-2 rounded-lg text-sm cursor-pointer">Create</button>
                                </div>
                            </form>
                        )}
                        <div className="space-y-2">{coupons.map(c => (
                            <div key={c._id} className={`glass-panel rounded-2xl p-4 ${!c.isActive ? 'opacity-50' : ''}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center"><span className="material-symbols-outlined text-primary">confirmation_number</span></div>
                                        <div>
                                            <div className="flex items-center gap-2"><p className="text-base font-bold text-white font-mono">{c.code}</p>
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${c.isValid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{c.isValid ? 'ACTIVE' : 'INACTIVE'}</span></div>
                                            <p className="text-sm text-slate-500">{c.discountType === 'credits' ? `+${c.discountValue} credits` : c.discountType === 'percentage' ? `${c.discountValue}% off` : `₹${c.discountValue} off`}{c.description && ` — ${c.description}`}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-center"><p className="text-base font-bold text-white">{c.usedCount || 0}{c.maxUses > 0 ? `/${c.maxUses}` : ''}</p><p className="text-xs text-slate-600">uses</p></div>
                                        <div className="flex gap-1">
                                            <button onClick={() => handleToggleCoupon(c._id, c.isActive)} className={`p-2 rounded-lg cursor-pointer ${c.isActive ? 'hover:bg-amber-500/10 text-amber-400' : 'hover:bg-emerald-500/10 text-emerald-400'}`}><span className="material-symbols-outlined text-base">{c.isActive ? 'pause' : 'play_arrow'}</span></button>
                                            <button onClick={() => handleDeleteCoupon(c._id)} className="p-2 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-base">delete</span></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}</div>
                        {coupons.length === 0 && <div className="text-center py-16 glass-panel rounded-2xl"><span className="material-symbols-outlined text-5xl text-slate-700 mb-3">confirmation_number</span><h3 className="text-lg font-bold text-white mb-1">No Coupons</h3></div>}
                    </div>
                )}

                {/* ════════════ CONTENT & BRANDS ════════════ */}
                {tab === 'content' && (
                    <div>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-purple-400">branding_watermark</span>{totalBrands} Brands</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">{brands.map(b => (
                            <div key={b._id} className="glass-panel rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">{b.name?.[0]?.toUpperCase()}</div>
                                        <div><p className="text-base font-bold text-white">{b.name}</p><p className="text-xs text-slate-600">{b.user?.name} • {b.user?.email}</p></div>
                                    </div>
                                    <button onClick={() => handleDeleteBrand(b._id, b.name)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
                                </div>
                                <div className="flex gap-3 text-center">
                                    <div className="flex-1 p-2 rounded-lg bg-white/[0.02]"><p className="text-base font-bold text-white">{b.contentCount}</p><p className="text-xs text-slate-600">Content</p></div>
                                    <div className="flex-1 p-2 rounded-lg bg-white/[0.02]"><p className="text-base font-bold text-white">{b.creativeCount}</p><p className="text-xs text-slate-600">Creatives</p></div>
                                    <div className="flex-1 p-2 rounded-lg bg-white/[0.02]"><p className="text-base font-bold text-white">{b.productCount}</p><p className="text-xs text-slate-600">Products</p></div>
                                </div>
                            </div>
                        ))}</div>
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-emerald-400">article</span>{totalContent} Content Pieces</h3>
                        <div className="space-y-2">{content.map(c => (
                            <div key={c._id} className="glass-panel rounded-2xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold capitalize ${c.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : c.status === 'approved' ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-500/15 text-slate-400'}`}>{c.status}</span>
                                    <p className="text-sm text-white truncate max-w-[300px]">{c.title || c.prompt?.slice(0, 60) || 'Untitled'}</p>
                                    <span className="text-xs text-slate-600 capitalize">{c.type}</span>
                                    <span className="text-xs text-slate-700">{c.brand?.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-slate-600">{c.user?.name}</span>
                                    <span className="text-xs text-slate-700">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                    <button onClick={() => handleDeleteContent(c._id)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
                                </div>
                            </div>
                        ))}</div>
                    </div>
                )}

                {/* ════════════ AI & SYSTEM ════════════ */}
                {tab === 'ai' && (
                    <div>
                        {/* AI Providers */}
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-cyan-400">smart_toy</span>AI Providers</h3>
                        {aiHealth && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">{Object.entries(aiHealth.providers || {}).map(([p, active]) => (
                                <div key={p} className={`glass-panel rounded-2xl p-5 ${active ? 'border border-emerald-500/20' : 'border border-rose-500/20 opacity-60'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-base font-bold text-white capitalize">{p}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{active ? 'ACTIVE' : 'NO KEY'}</span>
                                    </div>
                                    {aiHealth.providerUsage?.find(u => u._id === p) && (
                                        <div><p className="text-sm text-slate-500">{aiHealth.providerUsage.find(u => u._id === p).count} generations</p>
                                            <p className="text-sm text-slate-500">Sentiment: {aiHealth.providerUsage.find(u => u._id === p).avgSentiment?.toFixed(2)}</p></div>
                                    )}
                                </div>
                            ))}</div>
                        )}

                        {/* Feedback Breakdown */}
                        {aiHealth?.recentFeedback?.length > 0 && (
                            <div className="glass-panel rounded-2xl p-5 mb-6">
                                <h4 className="font-bold text-white text-sm mb-3">Feedback (Last 24h)</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{aiHealth.recentFeedback.map(f => (
                                    <div key={f._id} className="p-3 rounded-xl bg-white/[0.02] text-center">
                                        <p className="text-lg font-bold text-white">{f.count}</p>
                                        <p className="text-sm text-slate-500 capitalize">{f._id?.replace('_', ' ')}</p>
                                        <p className={`text-xs font-bold ${f.avgSentiment > 0 ? 'text-emerald-400' : f.avgSentiment < 0 ? 'text-rose-400' : 'text-slate-500'}`}>{f.avgSentiment?.toFixed(2)}</p>
                                    </div>
                                ))}</div>
                            </div>
                        )}

                        {/* System Settings */}
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-amber-400">settings</span>System Settings</h3>
                        {systemSettings && (
                            <div className="glass-panel rounded-2xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div><p className="text-base font-bold text-white">Watermark on Creatives</p><p className="text-sm text-slate-500">Add brand watermark to generated images</p></div>
                                    <button onClick={() => handleToggleSetting('watermarkEnabled', !systemSettings.watermarkEnabled)}
                                        className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.watermarkEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.watermarkEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div><p className="text-base font-bold text-white">Maintenance Mode</p><p className="text-sm text-slate-500">Block access for regular users</p></div>
                                    <button onClick={() => handleToggleSetting('maintenanceMode', !systemSettings.maintenanceMode)}
                                        className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.maintenanceMode ? 'bg-rose-500' : 'bg-slate-700'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.maintenanceMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div><p className="text-base font-bold text-white">Default AI Provider</p><p className="text-sm text-slate-500">Primary model for content generation</p></div>
                                    <select value={systemSettings.defaultProvider || 'gemini'} onChange={e => handleToggleSetting('defaultProvider', e.target.value)}
                                        className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none cursor-pointer">
                                        <option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option>
                                    </select>
                                </div>
                                <div className="pt-2 border-t border-white/[0.06]">
                                    <div className="flex items-center justify-between mb-3">
                                        <div><p className="text-base font-bold text-white">Credit Costs</p><p className="text-sm text-slate-500">Credits deducted per AI operation</p></div>
                                        <div className="flex gap-2">
                                            {!editingCosts ? (
                                                <button onClick={() => setEditingCosts({ ...(creditCosts || {}) })} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-sm">edit</span>Edit</button>
                                            ) : (
                                                <>
                                                    <button onClick={handleResetCosts} className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:text-rose-400 cursor-pointer">Reset Defaults</button>
                                                    <button onClick={() => setEditingCosts(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-400 cursor-pointer">Cancel</button>
                                                    <button onClick={handleSaveCosts} className="btn-primary px-4 py-1.5 rounded-lg text-xs cursor-pointer">Save</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {Object.entries(editingCosts || creditCosts || {}).map(([key, val]) => (
                                            <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                                <span className="text-sm text-slate-400">{creditCostLabels[key] || key}</span>
                                                {editingCosts ? (
                                                    <input type="number" min={0} value={editingCosts[key] ?? val} onChange={e => setEditingCosts(prev => ({ ...prev, [key]: Number(e.target.value) }))} className="w-12 text-right text-xs font-bold text-amber-400 bg-transparent outline-none border-b border-amber-500/30" />
                                                ) : (
                                                    <span className="text-xs font-bold text-amber-400">{val}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ INTEGRATIONS ════════════ */}
                {tab === 'integrations' && (
                    <div>
                        {integrations && (
                            <>
                                <div className="grid grid-cols-6 gap-3 mb-6">{Object.entries(integrations.summary?.byPlatform || {}).map(([p, count]) => (
                                    <div key={p} className="glass-panel rounded-2xl p-4 text-center">
                                        <p className="text-2xl mb-1">{platformIcons[p] || '🔌'}</p>
                                        <p className="text-lg font-extrabold text-white">{count}</p>
                                        <p className="text-sm text-slate-500 capitalize">{p}</p>
                                    </div>
                                ))}</div>
                                <div className="space-y-2">{(integrations.integrations || []).map(i => (
                                    <div key={i._id} className="glass-panel rounded-2xl p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">{platformIcons[i.platform] || '🔌'}</span>
                                            <div>
                                                <p className="text-base font-bold text-white capitalize">{i.platform} {i.displayName && `• ${i.displayName}`}</p>
                                                <p className="text-[11px] text-slate-600">{i.user?.name} ({i.user?.email}) {i.brand?.name ? `• ${i.brand.name}` : ''}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${i.status === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : i.status === 'expired' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'}`}>{i.status}</span>
                                            {i.publishCount > 0 && <span className="text-sm text-slate-500">{i.publishCount} published</span>}
                                            <span className="text-xs text-slate-700">{i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Never synced'}</span>
                                        </div>
                                    </div>
                                ))}</div>
                                {(integrations.integrations || []).length === 0 && <div className="text-center py-16 glass-panel rounded-2xl"><span className="material-symbols-outlined text-5xl text-slate-700 mb-3">hub</span><h3 className="text-lg font-bold text-white mb-1">No Integrations</h3><p className="text-sm text-slate-500">Users haven't connected any platforms yet</p></div>}
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ MODALS ════════════ */}
                {creditModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setCreditModal(null)}>
                        <div className="glass-panel rounded-2xl p-6 w-[400px] border border-primary/20" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-emerald-400">add_circle</span>Add Credits — {creditModal.name}</h3>
                            <p className="text-sm text-slate-500 mb-4">Current: {creditModal.creditBalance?.remaining || 0} credits</p>
                            <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} placeholder="Credits to add" className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none mb-4" />
                            <div className="flex gap-3 mb-4">{[25, 50, 100, 500].map(n => (
                                <button key={n} onClick={() => setCreditAmount(String(n))} className="flex-1 py-2 rounded-lg bg-white/[0.04] text-slate-400 text-xs font-bold hover:bg-primary/10 hover:text-primary cursor-pointer">+{n}</button>
                            ))}</div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setCreditModal(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 cursor-pointer">Cancel</button>
                                <button onClick={handleAddCredits} disabled={!creditAmount} className="btn-primary px-6 py-2 rounded-lg text-sm cursor-pointer disabled:opacity-30">Add</button>
                            </div>
                        </div>
                    </div>
                )}
                {planModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setPlanModal(null)}>
                        <div className="glass-panel rounded-2xl p-6 w-[420px] border border-primary/20" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-blue-400">upgrade</span>Change Plan — {planModal.name}</h3>
                            <p className="text-sm text-slate-500 mb-4">Current: <strong className="text-white capitalize">{planModal.plan}</strong></p>
                            <div className="space-y-2">{Object.entries(pc).map(([plan, cfg]) => (
                                <button key={plan} onClick={() => handleChangePlan(planModal._id, plan)} className={`w-full p-4 rounded-xl text-left transition-all cursor-pointer border ${planModal.plan === plan ? 'border-primary/40 bg-primary/10' : 'border-white/[0.06] hover:bg-white/[0.04]'}`}>
                                    <div className="flex justify-between items-center">
                                        <div><p className="text-base font-bold text-white capitalize">{plan}</p><p className="text-[11px] text-slate-500">{cfg.cr} credits • {cfg.p}</p></div>
                                        {planModal.plan === plan && <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">CURRENT</span>}
                                    </div>
                                </button>
                            ))}</div>
                            <div className="flex justify-end mt-4"><button onClick={() => setPlanModal(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 cursor-pointer">Close</button></div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}

const CREDIT_COSTS = { content: 2, creative: 5, brainstorm: 3, seo: 3, photoshoot: 10, trendMatch: 1 }

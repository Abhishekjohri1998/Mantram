import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { superadmin as API } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function SuperAdminDashboard() {
    const navigate = useNavigate()
    const { user, loginWithToken, logout } = useAuth()
    const [tab, setTab] = useState('overview')
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [pendingUsers, setPendingUsers] = useState([])
    const [waitlist, setWaitlist] = useState([])
    const [totalUsers, setTotalUsers] = useState(0)
    const [coupons, setCoupons] = useState([])
    const [brands, setBrands] = useState([])
    const [totalBrands, setTotalBrands] = useState(0)
    const [content, setContent] = useState([])
    const [totalContent, setTotalContent] = useState(0)
    const [integrations, setIntegrations] = useState(null)
    const [aiHealth, setAiHealth] = useState(null)
    const [systemSettings, setSystemSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [planFilter, setPlanFilter] = useState('')
    const [userPage, setUserPage] = useState(1)
    const [toast, setToast] = useState(null)
    const [couponForm, setCouponForm] = useState({ code: '', discountType: 'credits', discountValue: '', maxUses: '', validUntil: '', description: '' })
    const [showCouponForm, setShowCouponForm] = useState(false)
    const [creditModal, setCreditModal] = useState(null)
    const [creditAmount, setCreditAmount] = useState('')
    const [planModal, setPlanModal] = useState(null)
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
    const [tokenData, setTokenData] = useState(null)
    const [tokenDays, setTokenDays] = useState(30)
    const [syncingCredits, setSyncingCredits] = useState(false)
    // Audit Log state
    const [logs, setLogs] = useState([])
    const [logsPage, setLogsPage] = useState(1)
    const [totalLogs, setTotalLogs] = useState(0)
    const [logsLoading, setLogsLoading] = useState(false)
    const [showBudgetModal, setShowBudgetModal] = useState(false)
    const [budgetForm, setBudgetForm] = useState({ anthropic: 0, openai: 0, gemini: 0, xai: 0, grok: 0, sarvam: 0 })
    // Pricing Calculator state
    const [pricingData, setPricingData] = useState(null)
    const [pricingPrice, setPricingPrice] = useState(2)
    const [pricingLoading, setPricingLoading] = useState(false)
    const [pricingStudioFilter, setPricingStudioFilter] = useState('all')
    // API Key Management state
    const [apiProviders, setApiProviders] = useState([])
    const [editingProvider, setEditingProvider] = useState(null)
    const [editProviderKeys, setEditProviderKeys] = useState({})
    const [testingProvider, setTestingProvider] = useState(null)
    const [testResults, setTestResults] = useState({})
    // Watermark Management state
    const [watermarkLogoPreview, setWatermarkLogoPreview] = useState('')
    // Provider Usage state
    const [providerUsageData, setProviderUsageData] = useState(null)
    const [providerUsageDays, setProviderUsageDays] = useState(30)
    const [providerUsageLoading, setProviderUsageLoading] = useState(false)
    // Pricing Command Center state
    const [policyData, setPolicyData] = useState(null)
    const [monitorData, setMonitorData] = useState(null)
    const [monitorChecking, setMonitorChecking] = useState(false)
    const [calcCreditPrice, setCalcCreditPrice] = useState(5)
    const [calcMargin, setCalcMargin] = useState(60)
    const [calcExRate, setCalcExRate] = useState(85)
    const [policySection, setPolicySection] = useState('calculator')
    // Impersonation search
    const [impersonateSearch, setImpersonateSearch] = useState('')
    const [impersonateResults, setImpersonateResults] = useState([])
    const [impersonateLoading, setImpersonateLoading] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    // Credit Packs management
    const [creditPacksList, setCreditPacksList] = useState([])
    const [showPackForm, setShowPackForm] = useState(false)
    const [editingPack, setEditingPack] = useState(null)
    const [packForm, setPackForm] = useState({ name: '', slug: '', credits: 100, bonusCredits: 0, price: 499, validityDays: 180, icon: 'bolt', badge: '', description: '', isPromo: false, promoDiscount: 0, promoOriginalPrice: 0, promoLabel: '', displayOrder: 0, isActive: true, isFirstPurchaseEligible: true })
    // Studio Visibility (3-tier access control)
    const [studioVisibility, setStudioVisibility] = useState(null)
    const [studioKeys, setStudioKeys] = useState([])
    const [studioLabels, setStudioLabels] = useState({})
    // Per-user studio access modal
    const [userStudioModal, setUserStudioModal] = useState(null)

    if (user?.role !== 'superadmin') {
        return <DashboardLayout><div className="flex items-center justify-center h-screen"><div className="text-center"><span className="material-symbols-outlined text-6xl text-rose-500 mb-4">shield</span><h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2><p className="text-slate-500">Super Admin access required</p></div></div></DashboardLayout>
    }

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

    const navGroups = [
        { label: 'Command Center', icon: 'command_bar', items: [
            { id: 'overview', label: 'Overview', icon: 'dashboard' },
        ]},
        { label: 'People', icon: 'group', items: [
            { id: 'approvals', label: 'Approvals', icon: 'how_to_reg', badge: pendingUsers?.length },
            { id: 'waitlist', label: 'Waitlist', icon: 'list_alt', badge: waitlist?.length },
            { id: 'users', label: 'Users', icon: 'person_search' },
            { id: 'ai-credits', label: 'AI Usage', icon: 'token' },
        ]},
        { label: 'Monetization', icon: 'monetization_on', items: [
            { id: 'packages', label: 'Plans & Packages', icon: 'inventory_2' },
            { id: 'creditPacks', label: 'Credit Store', icon: 'shopping_cart' },
            { id: 'coupons', label: 'Coupons', icon: 'confirmation_number' },
            { id: 'pricing', label: 'Pricing Strategy', icon: 'calculate' },
        ]},
        { label: 'AI Operations', icon: 'smart_toy', items: [
            { id: 'ai', label: 'AI & System', icon: 'psychology' },
            { id: 'tokenUsage', label: 'Token Usage', icon: 'monitoring' },
        ]},
        { label: 'Platform', icon: 'settings', items: [
            { id: 'content', label: 'Content & Brands', icon: 'article' },
            { id: 'integrations', label: 'Integrations', icon: 'hub' },
            { id: 'logs', label: 'Audit Logs', icon: 'history' },
        ]},
    ]

    useEffect(() => { loadStats(); loadPackages(); loadTokenUsage() }, [])
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(handler);
    }, [search])

    useEffect(() => {
        if (tab === 'users' || tab === 'ai-credits') loadUsers()
        if (tab === 'tokenUsage' || tab === 'overview') loadTokenUsage()
        if (tab === 'approvals') loadPendingUsers()
        if (tab === 'waitlist') loadWaitlist()
        if (tab === 'coupons') loadCoupons()
        if (tab === 'content') { loadBrands(); loadContent() }
        if (tab === 'ai') { loadAIHealth(); loadSettings(); loadCreditCosts(); loadApiKeys() }
        if (tab === 'users' || tab === 'ai-credits') loadUsers()
        if (tab === 'approvals') loadPendingUsers()
        if (tab === 'coupons') loadCoupons()
        if (tab === 'content') { loadBrands(); loadContent() }
        if (tab === 'ai') { loadAIHealth(); loadSettings(); loadCreditCosts(); loadApiKeys(); loadStudioVisibility() }
        if (tab === 'integrations') loadIntegrations()
        if (tab === 'packages') loadPackages()
        if (tab === 'logs') loadLogs()
        if (tab === 'pricing') { loadPolicyData(); loadMonitorData(); loadPricingData(calcCreditPrice) }
        if (tab === 'creditPacks') loadCreditPacks()
    }, [tab, debouncedSearch, planFilter, userPage, logsPage])

    const loadStats = async () => { try { const d = await API.getStats(); setStats(d.stats) } catch (e) { console.error(e) } finally { setLoading(false) } }
    const loadUsers = async () => { try { const d = await API.getUsers({ page: userPage, limit: 20, search: debouncedSearch, plan: planFilter }); setUsers(d.users || []); setTotalUsers(d.total || 0) } catch (e) { console.error(e) } }
    const loadLogs = async () => { setLogsLoading(true); try { const d = await API.getSystemLogs({ page: logsPage, limit: 50 }); setLogs(d.logs || []); setTotalLogs(d.total || 0) } catch (e) { console.error(e) } finally { setLogsLoading(false) } }
    const loadPendingUsers = async () => { try { const d = await API.getUsers({ approvalStatus: 'pending', limit: 50 }); setPendingUsers(d.users || []) } catch (e) { console.error(e) } }
    const loadWaitlist = async () => { try { const d = await API.getWaitlist(); setWaitlist(d.waitlist || []) } catch (e) { console.error(e) } }
    const loadCoupons = async () => { try { const d = await API.getCoupons(); setCoupons(d.coupons || []) } catch (e) { console.error(e) } }
    const loadBrands = async () => { try { const d = await API.getBrands({ limit: 50 }); setBrands(d.brands || []); setTotalBrands(d.total || 0) } catch (e) { console.error(e) } }
    const loadContent = async () => { try { const d = await API.getContent({ limit: 50 }); setContent(d.content || []); setTotalContent(d.total || 0) } catch (e) { console.error(e) } }
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
    const creditCostLabels = { content: 'Content Generate', contentRefine: 'Content Refine/Regen', creative: 'Creative (Image)', photoshoot: 'AI Photoshoot', seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic', seoCompetitors: 'SEO Competitors', seoAiVisibility: 'SEO AI Visibility', seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit', seoCompetitorDiscover: 'SEO Discover', seoBacklinks: 'SEO Backlinks', seoWarRoom: 'SEO War Room', seoLlmProbe: 'SEO LLM Probe', seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining', brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine', brainstormChat: 'Brainstorm Chat', brainstormScreenplay: 'Screenplay', trendRefresh: 'Trend Refresh', videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generate', videoEdit: 'Video Edit', socialMedia: 'Social Strategy', socialMediaCalendar: 'Social Calendar', socialMediaAudit: 'Social Audit', socialMediaCompetitor: 'Social Competitor', socialMediaScore: 'Social Score', canvasGenerate: 'Canvas AI Gen', canvasBgRemove: 'Canvas BG Remove', canvasExtend: 'Canvas Extend', adCreative: 'Ad Creative', voiceClone: 'Voice Clone', voiceTranscribe: 'Voice Transcribe' }
    const loadPricingData = async (price, margin, exRate) => { setPricingLoading(true); try { const d = await API.getPricingCalculator({ creditPriceINR: price || calcCreditPrice, usdToInr: exRate || calcExRate, targetMargin: margin || calcMargin }); setPricingData(d) } catch (e) { console.error('Pricing calc error:', e) } finally { setPricingLoading(false) } }
    const loadPolicyData = async () => { try { const d = await API.getPricingPolicy(); setPolicyData(d.policy) } catch (e) { console.error(e) } }
    const loadMonitorData = async () => { try { const d = await API.getPricingMonitor(); setMonitorData(d) } catch (e) { console.error(e) } }
    const handlePricingCheck = async () => { setMonitorChecking(true); try { const d = await API.triggerPricingCheck(); showToast(d.message); loadMonitorData() } catch (e) { showToast(e.error || 'Check failed', 'error') } finally { setMonitorChecking(false) } }
    const handleDismissAlerts = async () => { try { await API.dismissPricingAlerts(); showToast('Alerts dismissed'); loadMonitorData() } catch { showToast('Failed', 'error') } }
    // Studio visibility
    const loadStudioVisibility = async () => { try { const d = await API.getStudioVisibility(); setStudioVisibility(d.portalVisibility); setStudioKeys(d.studioKeys || []); setStudioLabels(d.studioLabels || {}) } catch (e) { console.error(e) } }
    const handleStudioVisibilityChange = async (key, newState) => {
        const updated = { ...studioVisibility, [key]: newState }
        setStudioVisibility(updated)
        try { await API.updateStudioVisibility(updated); showToast(`${studioLabels[key] || key} → ${newState}`) } catch { showToast('Failed', 'error') }
    }
    const openUserStudioModal = async (userId) => {
        try {
            const d = await API.getUserStudioAccess(userId)
            setUserStudioModal({ ...d, userId })
        } catch { showToast('Failed to load studio access', 'error') }
    }
    const handleUserStudioOverride = async (key, val) => {
        if (!userStudioModal) return
        const userId = userStudioModal.userId
        try {
            const d = await API.updateUserStudioAccess(userId, { [key]: val })
            setUserStudioModal(prev => ({ ...prev, resolvedAccess: d.resolvedAccess, userOverrides: { ...prev.userOverrides, [key]: val } }))
            showToast(`${studioLabels[key] || key} → ${val === true ? 'granted' : val === false ? 'revoked' : 'reset'}`)
        } catch { showToast('Failed', 'error') }
    }
    // Credit Pack management
    const loadCreditPacks = async () => { try { const d = await API.getCreditPacks(); setCreditPacksList(d.packs || d.creditPacks || []) } catch (e) { console.error(e) } }
    const handleSavePack = async (e) => { e.preventDefault(); try { if (editingPack) { await API.updateCreditPack(editingPack._id, packForm); showToast('Pack updated') } else { await API.createCreditPack(packForm); showToast('Pack created') } setShowPackForm(false); setEditingPack(null); loadCreditPacks() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleDeletePack = async (id, name) => { if (!confirm(`Delete pack "${name}"?`)) return; try { await API.deleteCreditPack(id); showToast('Deleted'); loadCreditPacks() } catch { showToast('Failed', 'error') } }
    const handleTogglePack = async (id) => { try { await API.toggleCreditPack(id); loadCreditPacks() } catch { showToast('Failed', 'error') } }
    const handleSeedPacks = async () => { if (!confirm('Seed default credit packs? This will add standard packs.')) return; try { const d = await API.seedCreditPacks(creditPacksList.length > 0); showToast(d.message || 'Packs seeded'); loadCreditPacks() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleEditPack = (p) => { setEditingPack(p); setPackForm({ name: p.name, slug: p.slug, credits: p.credits, bonusCredits: p.bonusCredits || 0, price: p.price, validityDays: p.validityDays || 180, icon: p.icon || 'bolt', badge: p.badge || '', description: p.description || '', isPromo: p.isPromo || false, promoDiscount: p.promoDiscount || 0, promoOriginalPrice: p.promoOriginalPrice || 0, promoLabel: p.promoLabel || '', displayOrder: p.displayOrder || 0, isActive: p.isActive !== false, isFirstPurchaseEligible: p.isFirstPurchaseEligible !== false }); setShowPackForm(true) }
    // API Key Management functions
    const loadApiKeys = async () => { try { const d = await API.getApiKeys(); setApiProviders(d.providers || []) } catch (e) { console.error(e) } }
    const handleSaveApiKey = async (provider) => { try { await API.updateApiKeys(provider, editProviderKeys); showToast('API key updated'); setEditingProvider(null); setEditProviderKeys({}); loadApiKeys() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleDeleteApiKey = async (provider) => { if (!confirm(`Remove stored key for ${provider}? Env vars will still apply.`)) return; try { await API.deleteApiKeys(provider); showToast('Key removed'); loadApiKeys() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleTestApiKey = async (provider) => { setTestingProvider(provider); try { const d = await API.testApiKey(provider); setTestResults(r => ({ ...r, [provider]: d })) } catch (e) { setTestResults(r => ({ ...r, [provider]: { success: false, status: 'error', message: e.message } })) } finally { setTestingProvider(null) } }
    // Watermark functions
    const handleWatermarkLogoUpload = async (e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (ev) => { const dataUrl = ev.target.result; setWatermarkLogoPreview(dataUrl); try { const d = await API.uploadWatermarkLogo(dataUrl); showToast('Watermark logo uploaded'); loadSettings() } catch (err) { showToast(err.error || 'Upload failed', 'error') } }; reader.readAsDataURL(file) }
    const handleWatermarkSettingsUpdate = async (updates) => { try { await API.updateWatermarkSettings(updates); showToast('Watermark settings updated'); loadSettings() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    // Provider Usage functions
    const loadProviderUsage = async (days) => { setProviderUsageLoading(true); try { const d = await API.getProviderUsage(days || providerUsageDays); setProviderUsageData(d) } catch (e) { console.error(e) } finally { setProviderUsageLoading(false) } }
    const loadTokenUsage = async () => { try { const d = await API.getTokenUsage(tokenDays); setTokenData(d); if (d.providerWallets) { const b = {}; d.providerWallets.forEach(w => b[w.provider] = w.budget); setBudgetForm(b) } } catch (e) { console.error(e) } }
    const handleSaveBudgets = async (e) => { e.preventDefault(); try { await API.updateProviderBudgets(budgetForm); showToast('Provider budgets updated'); setShowBudgetModal(false); loadTokenUsage() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const addFeature = () => { if (!newFeature.trim()) return; setPkgForm(f => ({ ...f, features: [...f.features, { name: newFeature.trim(), included: true }] })); setNewFeature('') }
    const removeFeature = (i) => setPkgForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }))
    const studioNames = { contentStudio: 'Content Studio', creativeStudio: 'Creative Studio', seoStudio: 'SEO Studio', brainstormStudio: 'Brainstorm Studio' }

    // Actions
    const handleImpersonate = async (id, name) => {
        if (!confirm(`View platform as ${name}?`)) return;
        try {
            // Save current superadmin token so we can return later
            const currentToken = localStorage.getItem('mantram_token');
            if (currentToken) sessionStorage.setItem('mantram_superadmin_token', currentToken);
            const d = await API.impersonateUser(id);
            // Use hard reload to clear ALL cached React state (brands, credits, etc.)
            localStorage.setItem('mantram_token', d.token);
            // Store impersonation flag so the app knows to show the banner
            sessionStorage.setItem('mantram_impersonated_user', JSON.stringify({ name: d.user.name, email: d.user.email }));
            window.location.href = '/dashboard';
        } catch { showToast('Impersonation failed', 'error') }
    }
    const handleExitImpersonation = () => {
        const superadminToken = sessionStorage.getItem('mantram_superadmin_token');
        if (superadminToken) {
            sessionStorage.removeItem('mantram_superadmin_token');
            localStorage.setItem('mantram_token', superadminToken);
            window.location.href = '/superadmin';
        } else {
            logout();
            navigate('/login');
        }
    }
    const handleAddCredits = async () => { if (!creditModal || !creditAmount) return; try { await API.addCredits(creditModal._id, { amount: parseInt(creditAmount), reason: 'Super admin' }); showToast(`+${creditAmount} credits`); setCreditModal(null); setCreditAmount(''); loadUsers() } catch { showToast('Failed', 'error') } }
    const handleResetCredits = async (id) => { if (!confirm('Reset used credits to 0?')) return; try { await API.resetCredits(id); showToast('Reset done'); loadUsers() } catch { showToast('Failed', 'error') } }
    const handleChangePlan = async (id, plan) => { try { await API.updateUser(id, { plan }); showToast(`Plan → ${plan}`); setPlanModal(null); loadUsers(); loadStats() } catch { showToast('Failed', 'error') } }
    const handleDeleteUser = async (id, name) => { 
        if (!confirm(`DELETE ${name} and ALL data?`)) return; 
        try { 
            await API.deleteUser(id); 
            showToast('User deleted'); 
            loadUsers(); 
            loadStats();
        } catch (e) { 
            showToast(e.message || 'Deletion failed', 'error');
        } 
    }

    const handleDeleteWaitlist = async (id) => {
        if (!confirm('Remove this entry from waitlist?')) return;
        try {
            await API.deleteWaitlist(id);
            showToast('Waitlist entry removed');
            loadWaitlist();
            loadStats();
        } catch (e) {
            showToast(e.message || 'Failed to remove entry', 'error');
        }
    }

    const handleApproveWaitlist = async (id) => {
        try {
            await API.approveWaitlist(id);
            showToast('Invitation email sent!');
            loadWaitlist();
        } catch (e) {
            showToast(e.message || 'Failed to send invite', 'error');
        }
    }
    
    const handleApproveUser = async (id) => { 
        try { 
            await API.approveUser(id); 
            showToast('User approved and notified'); 
            if (tab === 'approvals') loadPendingUsers();
            else loadUsers();
            loadStats();
        } catch (e) { showToast(e.message || 'Approval failed', 'error') } 
    }

    const handleRejectUser = async (id) => { 
        if (!confirm('Reject this user registration?')) return;
        try { 
            await API.rejectUser(id); 
            showToast('User rejected'); 
            if (tab === 'approvals') loadPendingUsers();
            else loadUsers();
        } catch (e) { showToast(e.message || 'Rejection failed', 'error') } 
    }

    const handleSyncCredits = async () => {
        if (!confirm('This will synchronize all user credit data based on usage logs and plans. Proceed?')) return;
        setSyncingCredits(true);
        try {
            const d = await API.syncCredits();
            showToast(`${d.stats.success} users synced, ${d.stats.failed} failed`);
            loadUsers();
            loadStats();
        } catch (e) {
            showToast(e.message || 'Sync failed', 'error');
        } finally {
            setSyncingCredits(false);
        }
    }

    const handleDeleteBrand = async (brand, name) => { 
        const brandId = brand?._id || brand?.id || brand;
        if (!brandId || brandId === 'undefined') {
            console.error('Attempted to delete brand with undefined ID', { brand, name });
            showToast(`Invalid Brand ID (${brandId})`, 'error');
            return;
        }
        const brandName = name || brand?.name || 'this brand';
        if (!confirm(`Delete brand "${brandName}" and all data?`)) return; 
        try { 
            await API.deleteBrand(brandId); 
            showToast('Brand deleted'); 
            loadBrands(); 
            loadStats();
        } catch (e) { 
            showToast(e.message || 'Failed to delete brand', 'error');
        } 
    }

    const handleDeleteContent = async (item) => { 
        const contentId = item?._id || item?.id || item;
        if (!contentId || contentId === 'undefined') {
            showToast(`Invalid Content ID (${contentId})`, 'error');
            return;
        }
        if (!confirm('Delete this content?')) return; 
        try { 
            await API.deleteContent(contentId); 
            showToast('Deleted'); 
            loadContent();
        } catch (e) { 
            showToast(e.message || 'Failed to delete content', 'error');
        } 
    }
    const handleCreateCoupon = async (e) => { e.preventDefault(); try { await API.createCoupon({ ...couponForm, discountValue: Number(couponForm.discountValue), maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : 0, validUntil: couponForm.validUntil || null }); showToast('Coupon created'); setShowCouponForm(false); setCouponForm({ code: '', discountType: 'credits', discountValue: '', maxUses: '', validUntil: '', description: '' }); loadCoupons() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleToggleCoupon = async (id, isActive) => { try { await API.updateCoupon(id, { isActive: !isActive }); loadCoupons() } catch { showToast('Failed', 'error') } }
    const handleDeleteCoupon = async (id) => { if (!confirm('Delete coupon?')) return; try { await API.deleteCoupon(id); showToast('Deleted'); loadCoupons() } catch { showToast('Failed', 'error') } }
    const handleToggleSetting = async (key, val) => { try { await API.updateSystemSettings({ [key]: val }); showToast('Updated'); loadSettings() } catch { showToast('Failed', 'error') } }

    const platformIcons = { instagram: '📸', facebook: '📘', linkedin: '💼', twitter: '🐦', shopify: '🛍️', 'google-analytics': '📊', 'meta-ads': '📱', 'google-ads': '🔍', meta: '📱', google: '🔍' }

    // Impersonation search handler
    useEffect(() => {
        if (!impersonateSearch || impersonateSearch.length < 2) { setImpersonateResults([]); return }
        const timer = setTimeout(async () => {
            setImpersonateLoading(true)
            try {
                const d = await API.getUsers({ search: impersonateSearch, limit: 5 })
                setImpersonateResults(d.users || [])
            } catch { setImpersonateResults([]) }
            finally { setImpersonateLoading(false) }
        }, 300)
        return () => clearTimeout(timer)
    }, [impersonateSearch])

    const Card = ({ icon, color, value, label }) => (
        <div className="glass-panel rounded-2xl p-5">
            <span className={`material-symbols-outlined text-2xl mb-3 block ${color}`}>{icon}</span>
            <p className="text-3xl font-extrabold text-white">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-sm text-slate-500 mt-1">{label}</p>
        </div>
    )

    return (
        <DashboardLayout>
            <SEOHead title="Super Admin — Mantram AI" noIndex={true} />
            <div className="flex min-h-screen">
                {toast && <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-xl ${toast.type === 'error' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'}`}>{toast.msg}</div>}

                {/* Per-User Studio Access Modal */}
                {userStudioModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setUserStudioModal(null)}>
                        <div className="w-full max-w-lg bg-[#0e1025] border border-white/[0.08] rounded-2xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><span className="material-symbols-outlined text-violet-400">shield_person</span>Studio Access</h3>
                                    <p className="text-sm text-slate-500 mt-1">{userStudioModal.userName} ({userStudioModal.userEmail}) — {userStudioModal.userPlan} plan</p>
                                </div>
                                <button onClick={() => setUserStudioModal(null)} className="p-2 rounded-lg hover:bg-white/[0.08] text-slate-500 cursor-pointer"><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <div className="space-y-2">
                                {(userStudioModal.studioKeys || studioKeys).map(key => {
                                    const portalStatus = userStudioModal.portalVisibility?.[key] || 'public';
                                    const hasOverride = userStudioModal.userOverrides?.[key] !== undefined && userStudioModal.userOverrides?.[key] !== null;
                                    const overrideVal = userStudioModal.userOverrides?.[key];
                                    const resolved = userStudioModal.resolvedAccess?.[key];
                                    const label = (userStudioModal.studioLabels || studioLabels)[key] || key;
                                    const isHidden = portalStatus === 'hidden';

                                    let statusBadge, statusColor;
                                    if (isHidden) { statusBadge = '🔒 Hidden (global)'; statusColor = 'text-rose-400'; }
                                    else if (hasOverride && overrideVal === true) { statusBadge = '✅ Granted'; statusColor = 'text-emerald-400'; }
                                    else if (hasOverride && overrideVal === false) { statusBadge = '❌ Revoked'; statusColor = 'text-rose-400'; }
                                    else if (portalStatus === 'private') { statusBadge = '🔐 Private (no access)'; statusColor = 'text-amber-400'; }
                                    else { statusBadge = '✅ Plan (public)'; statusColor = 'text-emerald-400'; }

                                    return (
                                        <div key={key} className={`flex items-center justify-between px-4 py-3 rounded-xl ${resolved ? 'bg-white/[0.02]' : 'bg-rose-500/5'} border border-white/[0.06]`}>
                                            <div>
                                                <p className="text-sm font-bold text-white">{label}</p>
                                                <p className={`text-xs ${statusColor}`}>{statusBadge}</p>
                                            </div>
                                            {!isHidden && (
                                                <div className="flex gap-1">
                                                    <button onClick={() => handleUserStudioOverride(key, true)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${hasOverride && overrideVal === true ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-600 hover:text-emerald-400 border border-transparent'}`}
                                                    >Grant</button>
                                                    <button onClick={() => handleUserStudioOverride(key, false)}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${hasOverride && overrideVal === false ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'text-slate-600 hover:text-rose-400 border border-transparent'}`}
                                                    >Revoke</button>
                                                    {hasOverride && (
                                                        <button onClick={() => handleUserStudioOverride(key, null)}
                                                            className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer text-slate-600 hover:text-amber-400 border border-transparent"
                                                        >Reset</button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════ SIDEBAR NAVIGATION ═══════ */}
                <aside className={`${sidebarCollapsed ? 'w-[60px]' : 'w-[240px]'} flex-shrink-0 bg-gradient-to-b from-white/[0.03] to-transparent border-r border-white/[0.06] transition-all duration-300 sticky top-0 self-start h-screen overflow-y-auto`} style={{ scrollbarWidth: 'none' }}>
                    {/* Sidebar Header */}
                    <div className="p-4 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between">
                            {!sidebarCollapsed && (
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-xl">shield_person</span>
                                    <span className="text-sm font-black text-white uppercase tracking-wider">Admin</span>
                                </div>
                            )}
                            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-white transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-base">{sidebarCollapsed ? 'chevron_right' : 'chevron_left'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Nav Groups */}
                    <nav className="p-2 space-y-1">
                        {navGroups.map((group, gi) => (
                            <div key={gi} className="mb-1">
                                {!sidebarCollapsed && (
                                    <p className="px-3 pt-4 pb-1 text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">{group.label}</p>
                                )}
                                {sidebarCollapsed && gi > 0 && <div className="border-t border-white/[0.04] mx-2 my-2" />}
                                {group.items.map(item => (
                                    <button key={item.id} onClick={() => setTab(item.id)}
                                        title={sidebarCollapsed ? item.label : undefined}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer group relative
                                            ${tab === item.id
                                                ? 'bg-amber-500/15 text-amber-400 shadow-sm shadow-amber-500/10'
                                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>
                                        <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                                        {item.badge > 0 && (
                                            <span className={`${sidebarCollapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto'} min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-black px-1`}>
                                                {item.badge > 99 ? '99+' : item.badge}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* ═══════ MAIN CONTENT ═══════ */}
                <div className="flex-1 min-w-0 p-6 lg:p-8">
                    {/* ─── TOP BAR: Header + View as User ─── */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400 text-2xl">shield_person</span>
                                    Super Admin
                                </h1>
                                <p className="text-slate-500 text-xs mt-0.5">Platform management & operations</p>
                            </div>
                        </div>

                        {/* ─── VIEW AS USER — Command Bar ─── */}
                        <div className="relative">
                            <div className="flex items-center gap-3 bg-white/[0.03] rounded-xl border border-white/[0.06] px-4 py-2.5 focus-within:border-amber-500/30 transition-all">
                                <span className="material-symbols-outlined text-amber-400 text-lg">person_search</span>
                                <input
                                    type="text"
                                    placeholder="Search user by name or email → View as User..."
                                    value={impersonateSearch}
                                    onChange={e => setImpersonateSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                                />
                                {impersonateLoading && <span className="material-symbols-outlined text-sm animate-spin text-slate-500">progress_activity</span>}
                                <span className="text-[9px] text-slate-600 bg-white/[0.04] px-2 py-1 rounded font-mono">⌘K</span>
                            </div>
                            {/* Results Dropdown */}
                            {impersonateResults.length > 0 && impersonateSearch.length >= 2 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900/95 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-40 backdrop-blur-xl">
                                    {impersonateResults.map(u => (
                                        <div key={u._id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-all cursor-pointer group" onClick={() => { handleImpersonate(u._id, u.name); setImpersonateSearch(''); setImpersonateResults([]) }}>
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white text-xs font-black">
                                                {u.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-white truncate">{u.name}</p>
                                                <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-bold">{u.plan || 'free'}</span>
                                                <span className="text-[10px] text-slate-500">{u.credits?.balance || 0} cr</span>
                                                <span className="material-symbols-outlined text-base text-amber-400 opacity-0 group-hover:opacity-100 transition-all">login</span>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="px-4 py-2 border-t border-white/[0.06] text-[9px] text-slate-600">
                                        Click user to impersonate • See exactly what they see
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Impersonation Warning Banner */}
                    {user?.isImpersonated && (
                        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 shadow-lg shadow-amber-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-white text-2xl">error</span>
                                <div>
                                    <p className="text-white font-black text-sm uppercase tracking-wider">Active Impersonation Session</p>
                                    <p className="text-white/80 text-xs">You are currently viewing the platform as <strong>{user.name}</strong>. All actions are logged.</p>
                                </div>
                            </div>
                            <button onClick={handleExitImpersonation} className="px-4 py-2 bg-white text-rose-500 rounded-xl text-xs font-black uppercase hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                                Back to SuperAdmin
                            </button>
                        </div>
                    )}

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

                                {/* API Wallet / Provider Health Summary (Promoted to Overview) */}
                                {tokenData?.providerWallets && (
                                    <div className="mb-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-tighter">
                                                <span className="material-symbols-outlined text-amber-400 text-lg">account_balance_wallet</span>
                                                API Provider Wallet (Real-time)
                                            </h4>
                                            <button onClick={() => setTab('tokenUsage')} className="text-[10px] font-bold text-amber-500 hover:text-amber-400 transition-all flex items-center gap-1 cursor-pointer">
                                                Full Analytics <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                                            {tokenData.providerWallets.map(w => {
                                                if (w.budget === 0 && w.consumed === 0) return null;
                                                const remaining = Math.max(0, w.budget - w.consumed);
                                                const isLow = w.budget > 0 && (remaining / w.budget) < 0.15;
                                                const colors = { anthropic: 'text-orange-400', openai: 'text-emerald-400', gemini: 'text-blue-400', xai: 'text-slate-200', grok: 'text-slate-200', sarvam: 'text-rose-400' };
                                                const bgHighlights = { anthropic: 'border-orange-500/10', openai: 'border-emerald-500/10', gemini: 'border-blue-500/10', xai: 'border-slate-500/10', grok: 'border-slate-500/10', sarvam: 'border-rose-500/10' };
                                                
                                                return (
                                                    <div key={w.provider} className={`glass-panel border-white/[0.04] rounded-xl p-3 flex flex-col justify-between transition-all ${isLow ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.01]'}`}>
                                                        <div className="flex items-center justify-between gap-2 mb-2">
                                                            <p className={`text-[10px] font-black uppercase tracking-widest truncate ${colors[w.provider] || 'text-slate-400'}`}>{w.provider === 'xai' ? 'Grok (xAI)' : w.provider}</p>
                                                            {isLow && <span className="material-symbols-outlined text-amber-500 text-xs animate-pulse">warning</span>}
                                                        </div>
                                                        <div>
                                                            <p className="text-lg font-black text-white tracking-tighter">${remaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Remaining</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
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
                                    <div className="glass-panel rounded-2xl p-5 border border-indigo-500/10">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-indigo-400">trending_up</span><span className="text-sm font-bold text-white">Retention Rate</span></div>
                                        <p className="text-2xl font-extrabold text-indigo-400">{stats.usageAnalytics?.retentionRate || '0%'}</p>
                                        <p className="text-xs text-slate-600 mt-1">{stats.usageAnalytics?.churnedUsersCount || 0} churned (20d+)</p>
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
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-white mb-1">{u.credits?.used || 0} / {u.credits?.total + (u.credits?.bonus || 0)} used</p>
                                                    <div className="w-24 h-1 rounded-full bg-white/[0.06]">
                                                        <div
                                                            className={`h-full rounded-full ${((u.credits?.used || 0) / (u.credits?.total + (u.credits?.bonus || 0))) > 0.9 ? 'bg-rose-500' : 'bg-primary'}`}
                                                            style={{ width: `${Math.min(100, ((u.credits?.used || 0) / (u.credits?.total + (u.credits?.bonus || 0))) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                    (u.approvalStatus === 'approved') ? 'bg-emerald-500/10 text-emerald-500' :
                                                    (u.approvalStatus === 'rejected') ? 'bg-rose-500/10 text-rose-500' :
                                                    'bg-amber-500/10 text-amber-500'
                                                }`}>
                                                    {u.approvalStatus || 'pending'}
                                                </span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                    u.plan === 'enterprise' ? 'bg-amber-500/15 text-amber-400' : 
                                                    u.plan === 'professional' ? 'bg-blue-500/15 text-blue-400' : 
                                                    u.plan === 'test' ? 'bg-rose-500/15 text-rose-400' :
                                                    'bg-slate-500/15 text-slate-400'
                                                }`}>Plan: {u.plan}</span>
                                                <span className="text-xs text-slate-600">{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    ))}</div>
                                </div>

                                {/* AI Usage Insights */}
                                {stats.usageAnalytics && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
                                        <div className="lg:col-span-1 glass-panel rounded-2xl p-5 border border-rose-500/10">
                                            <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-rose-500 text-lg">error</span>
                                                Quota Alerts
                                            </h3>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-rose-500">block</span>
                                                        <span className="text-sm font-bold text-white">Full Exhaustion</span>
                                                    </div>
                                                    <span className="text-lg font-black text-rose-500">{stats.usageAnalytics.exhaustedCount}</span>
                                                </div>
                                                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-amber-500">warning</span>
                                                        <span className="text-sm font-bold text-white">Near Exhaustion (&gt;90%)</span>
                                                    </div>
                                                    <span className="text-lg font-black text-amber-500">{stats.usageAnalytics.nearEmptyCount}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border border-primary/10">
                                            <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-lg">leaderboard</span>
                                                Top AI Consumers (Leaderboard)
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left">
                                                    <thead>
                                                        <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-white/[0.04]">
                                                            <th className="pb-2">User</th>
                                                            <th className="pb-2">Plan</th>
                                                            <th className="pb-2 text-right">Credits Used</th>
                                                            <th className="pb-2 text-right">Remaining</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/[0.04]">
                                                        {(stats.usageAnalytics.topUsers || []).map(u => (
                                                            <tr key={u._id} className="text-sm group hover:bg-white/[0.02] transition-all">
                                                                <td className="py-2.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{u.name?.[0]}</div>
                                                                        <div><p className="font-bold text-white text-xs">{u.name}</p><p className="text-[10px] text-slate-600">{u.email}</p></div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-white/[0.05] text-slate-400 capitalize">{u.plan}</span></td>
                                                                <td className="py-2.5 text-right font-bold text-white">{u.credits?.used?.toLocaleString()}</td>
                                                                <td className="py-2.5 text-right font-bold text-emerald-400">
                                                                    {u.creditBalance?.unlimited ? '∞' : u.creditBalance?.remaining?.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ APPROVALS ════════════ */}
                {tab === 'approvals' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">how_to_reg</span>
                                    Pending Approvals ({pendingUsers.length})
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Review and approve new user registrations to grant platform access</p>
                            </div>
                            <button onClick={loadPendingUsers} className="p-2 rounded-lg bg-white/[0.04] text-slate-400 hover:text-white cursor-pointer"><span className="material-symbols-outlined text-sm">refresh</span></button>
                        </div>

                        {pendingUsers.length > 0 ? (
                            <div className="space-y-3">
                                {pendingUsers.map(u => (
                                    <div key={u._id} className="glass-panel rounded-2xl p-5 border border-amber-500/10 hover:border-amber-500/30 transition-all bg-gradient-to-r from-amber-500/[0.02] to-transparent">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 font-bold text-lg">{u.name?.[0]?.toUpperCase()}</div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <p className="text-base font-bold text-white">{u.name}</p>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold tracking-wider uppercase">Position #{u.queueNumber}</span>
                                                    </div>
                                                     <p className="text-sm text-slate-400">
                                                        {u.email} • {u.company || 'Individual'} 
                                                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                            u.plan === 'enterprise' ? 'bg-amber-500/15 text-amber-400' : 
                                                            u.plan === 'professional' ? 'bg-blue-500/15 text-blue-400' : 
                                                            u.plan === 'test' ? 'bg-rose-500/15 text-rose-400' :
                                                            'bg-slate-500/15 text-slate-400'
                                                        }`}>Plan: {u.plan}</span>
                                                     </p>
                                                    <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-widest">Registered {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => handleRejectUser(u._id)} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold hover:bg-rose-500/20 transition-all flex items-center gap-1.5 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">close</span>Reject
                                                </button>
                                                <button onClick={() => handleApproveUser(u._id)} className="px-6 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm font-bold">check</span>Approve User
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 glass-panel rounded-2xl border border-dashed border-white/[0.06]">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">verified_user</span>
                                <h3 className="text-lg font-bold text-white mb-1">Queue is Empty</h3>
                                <p className="text-sm text-slate-500">All users have been processed. Great job!</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ WAITLIST ════════════ */}
                {tab === 'waitlist' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-400">list_alt</span>
                                    Waitlist Submissions ({waitlist.length})
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Direct early access requests from the landing page waitlist</p>
                            </div>
                            <button onClick={loadWaitlist} className="p-2 rounded-lg bg-white/[0.04] text-slate-400 hover:text-white cursor-pointer"><span className="material-symbols-outlined text-sm">refresh</span></button>
                        </div>

                        {waitlist.length > 0 ? (
                            <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] text-slate-500 font-black uppercase tracking-[0.1em] border-b border-white/[0.06] bg-white/[0.02]">
                                                <th className="px-6 py-4">Name & Email</th>
                                                <th className="px-6 py-4">Company</th>
                                                <th className="px-6 py-4">Message / Note</th>
                                                <th className="px-6 py-4">Submitted At</th>
                                                <th className="px-6 py-4 text-center">Status</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {waitlist.map(entry => (
                                                <tr key={entry._id} className="text-sm group hover:bg-white/[0.01] transition-all">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-black shadow-lg">
                                                                {entry.name?.[0]?.toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-white truncate">{entry.name}</p>
                                                                <p className="text-[10px] text-slate-600 truncate">{entry.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-slate-400">{entry.company || '—'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 max-w-xs">
                                                        <p className="text-slate-500 truncate" title={entry.message}>{entry.message || '—'}</p>
                                                    </td>
                                                    <td className="px-6 py-4 text-[11px] text-slate-600">
                                                        {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {entry.status === 'registered' ? (
                                                            <div className="inline-flex flex-col items-center">
                                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-wider border border-emerald-500/20">Registered</span>
                                                            </div>
                                                        ) : entry.status === 'invited' ? (
                                                            <div className="inline-flex flex-col items-center gap-1">
                                                                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-wider border border-indigo-500/20">Invited</span>
                                                                {entry.invitedAt && <span className="text-[9px] text-slate-700">{new Date(entry.invitedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                                            </div>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 text-[10px] font-black uppercase tracking-wider border border-slate-500/20">Pending</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {entry.status !== 'registered' && (
                                                                <button 
                                                                    onClick={() => handleApproveWaitlist(entry._id)}
                                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border cursor-pointer ${
                                                                        entry.status === 'invited' 
                                                                        ? 'bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border-indigo-500/20' 
                                                                        : 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border-emerald-500/20'
                                                                    }`}
                                                                    title={entry.status === 'invited' ? 'Resend Invitation' : 'Send Invitation'}
                                                                >
                                                                    {entry.status === 'invited' ? 'Resend' : 'Invite'}
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => handleDeleteWaitlist(entry._id)}
                                                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all border border-rose-500/20 cursor-pointer"
                                                                title="Remove Entry"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-20 glass-panel rounded-2xl border border-dashed border-white/[0.06]">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">inbox</span>
                                <h3 className="text-lg font-bold text-white mb-1">Waitlist is Empty</h3>
                                <p className="text-sm text-slate-500">No new early access requests found.</p>
                            </div>
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
                            <button onClick={loadUsers} className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white transition-all cursor-pointer" title="Refresh Users"><span className="material-symbols-outlined text-sm">refresh</span></button>
                            <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setUserPage(1) }} className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none cursor-pointer">
                                <option value="">All Plans</option>
                                {packages.map(p => (
                                    <option key={p._id} value={p.slug}>{p.name}</option>
                                ))}
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
                                                <span className={`text-xs px-1.5 py-0.5 rounded font-bold capitalize ${
                                                    u.plan === 'enterprise' ? 'bg-amber-500/15 text-amber-400' : 
                                                    u.plan === 'professional' ? 'bg-blue-500/15 text-blue-400' : 
                                                    u.plan === 'test' ? 'bg-rose-500/15 text-rose-400' :
                                                    'bg-slate-500/15 text-slate-400'
                                                }`}>Plan: {u.plan}</span>
                                                <span className="text-xs px-1.5 py-0.5 rounded font-bold border border-white/10 text-slate-500 uppercase tracking-tighter text-[9px]">{u.role}</span>
                                                {(!u.approvalStatus || u.approvalStatus === 'pending') && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400">PENDING</span>}
                                                {u.approvalStatus === 'rejected' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-400">REJECTED</span>}
                                            </div>
                                            <p className="text-[11px] text-slate-600 truncate">{u.email} {u.company ? `• ${u.company}` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="text-center mx-4 shrink-0 flex items-center gap-4">
                                        <div className="text-right">
                                            <p className="text-xs font-bold text-white mb-1">{u.credits?.used || 0} / {u.credits?.total + (u.credits?.bonus || 0)} used</p>
                                            <div className="w-24 h-1.5 rounded-full bg-white/[0.06]">
                                                <div
                                                    className={`h-full rounded-full ${u.creditBalance?.remaining <= 5 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-primary'}`}
                                                    style={{ width: `${Math.min(100, ((u.credits?.used || 0) / (u.credits?.total + (u.credits?.bonus || 0))) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="w-16">
                                            <p className="text-base font-bold text-white">{u.creditBalance?.unlimited ? '∞' : `${u.creditBalance?.remaining || 0}`}</p>
                                            <p className="text-[10px] text-slate-600 uppercase tracking-tighter">remaining</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                         <button onClick={() => setCreditModal(u)} title="Add Credits" className="p-2 rounded-lg hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">add_circle</span></button>
                                        <button onClick={() => handleResetCredits(u._id)} title="Reset Credits" className="p-2 rounded-lg hover:bg-cyan-500/10 text-slate-500 hover:text-cyan-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">restart_alt</span></button>
                                        <button onClick={() => setPlanModal(u)} title="Change Plan" className="p-2 rounded-lg hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">upgrade</span></button>
                                        
                                        {(!u.approvalStatus || u.approvalStatus === 'pending') ? (
                                            <div className="flex gap-1 border-x border-white/[0.04] px-1 mx-1">
                                                <button onClick={() => handleApproveUser(u._id)} title="Approve User" className="p-2 rounded-lg hover:bg-emerald-500/10 text-emerald-500 transition-all cursor-pointer shadow-sm"><span className="material-symbols-outlined text-base font-bold">check_circle</span></button>
                                                <button onClick={() => handleRejectUser(u._id)} title="Reject User" className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-500 transition-all cursor-pointer shadow-sm"><span className="material-symbols-outlined text-base font-bold">cancel</span></button>
                                            </div>
                                        ) : u.approvalStatus === 'approved' ? (
                                            <div className="px-2 border-x border-white/[0.04] mx-1">
                                                <span className="text-[9px] font-black text-emerald-500/50 bg-emerald-500/5 px-2 py-1 rounded-md border border-emerald-500/10 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[10px]">verified</span>
                                                    APPROVED
                                                </span>
                                            </div>
                                        ) : (
                                            <div className="px-2 border-x border-white/[0.04] mx-1">
                                                <span className="text-[9px] font-black text-rose-500/50 bg-rose-500/5 px-2 py-1 rounded-md border border-rose-500/10 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[10px]">block</span>
                                                    REJECTED
                                                </span>
                                            </div>
                                        )}

                                        <button onClick={() => handleImpersonate(u._id, u.name)} title="Login as User" className="p-2 rounded-lg hover:bg-amber-500/10 text-slate-500 hover:text-amber-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">login</span></button>
                                        <button onClick={() => openUserStudioModal(u._id)} title="Studio Access" className="p-2 rounded-lg hover:bg-violet-500/10 text-slate-500 hover:text-violet-400 transition-all cursor-pointer"><span className="material-symbols-outlined text-base">shield_person</span></button>
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

                {/* ════════════ AI USAGE & CREDITS ════════════ */}
                {tab === 'ai-credits' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Summary Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div className="glass-panel rounded-2xl p-5 border border-primary/10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">token</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">System Credits Used</p>
                                        <h4 className="text-2xl font-black text-white">
                                            {stats?.totalCreditsUsed?.toLocaleString() || '—'}
                                        </h4>
                                    </div>
                                </div>
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                     <div className="h-full bg-primary" style={{ width: '65%' }} />
                                </div>
                            </div>

                            <div className="glass-panel rounded-2xl p-5 border border-rose-500/10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-rose-400">battery_alert</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Exhausted Accounts</p>
                                        <h4 className="text-2xl font-black text-white">
                                            {stats?.usageAnalytics?.exhaustedCount || 0}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-[10px] text-rose-400/60 font-medium">Require immediate recharge or plan upgrade</p>
                            </div>

                            <div className="glass-panel rounded-2xl p-5 border border-amber-500/10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-amber-400">warning</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Low Balance (&lt;10%)</p>
                                        <h4 className="text-2xl font-black text-white">
                                            {stats?.usageAnalytics?.nearEmptyCount || 0}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-[10px] text-amber-400/60 font-medium">Approaching credit limits</p>
                            </div>

                            <div className="glass-panel rounded-2xl p-5 border border-emerald-500/10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-emerald-400">trending_up</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Top Consumers</p>
                                        <h4 className="text-2xl font-black text-white">
                                            {stats?.usageAnalytics?.topUsers?.length || 0}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-[10px] text-emerald-400/60 font-medium">Power users with high generation volume</p>
                            </div>
                        </div>

                        {/* Search & Utility Bar */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                                <input 
                                    type="text" 
                                    value={search} 
                                    onChange={e => { setSearch(e.target.value); setUserPage(1) }} 
                                    placeholder="Search users to manage credits..." 
                                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none focus:border-primary/50 transition-all shadow-inner" 
                                />
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => { setPlanFilter('exhausted'); setUserPage(1) }}
                                    className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${planFilter === 'exhausted' ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:bg-white/[0.08]'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">error</span>
                                    Exhausted
                                </button>
                                <button 
                                    onClick={() => { setPlanFilter('low'); setUserPage(1) }}
                                    className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${planFilter === 'low' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:bg-white/[0.08]'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    Low Balance
                                </button>
                                <button 
                                    onClick={() => { setPlanFilter(''); setSearch(''); setUserPage(1) }}
                                    className="px-4 py-3 rounded-2xl text-xs font-bold bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:bg-white/[0.08] transition-all"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* Detailed Usage Table */}
                        <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-[10px] text-slate-500 font-black uppercase tracking-[0.1em] border-b border-white/[0.06] bg-white/[0.02]">
                                            <th className="px-6 py-4">User Identity</th>
                                            <th className="px-6 py-4">Subscription Plan</th>
                                            <th className="px-6 py-4">AI Usage (Used/Total)</th>
                                            <th className="px-6 py-4">Remaining</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Credit Control</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.04]">
                                        {users.length > 0 ? users.map(u => {
                                            const total = (u.credits?.total || 0) + (u.credits?.bonus || 0);
                                            const used = u.credits?.used || 0;
                                            const remaining = u.creditBalance?.remaining || 0;
                                            const percent = Math.min(100, (used / total) * 100);
                                            const isLow = remaining <= 5 || percent >= 90;
                                            const isExhausted = remaining <= 0;

                                            return (
                                                <tr key={u._id} className="text-sm group hover:bg-white/[0.01] transition-all">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-indigo-500/10 flex items-center justify-center text-primary font-black shadow-lg">
                                                                {u.name?.[0]?.toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-white truncate">{u.name}</p>
                                                                <p className="text-[10px] text-slate-600 truncate">{u.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-[9px] px-2 py-1 rounded-lg font-black uppercase tracking-wider border ${
                                                            u.plan === 'enterprise' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 
                                                            u.plan === 'professional' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 
                                                            u.plan === 'test' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                                                            'bg-slate-500/10 border-white/10 text-slate-400'
                                                        }`}>
                                                            {u.plan}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="w-32">
                                                            <div className="flex justify-between items-center mb-1.5">
                                                                <p className="text-[10px] font-bold text-white">{used} / {total}</p>
                                                                <p className="text-[9px] text-slate-600 font-bold">{Math.round(percent)}%</p>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full transition-all duration-700 ${
                                                                        isExhausted ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 
                                                                        isLow ? 'bg-amber-500' : 
                                                                        'bg-primary'
                                                                    }`}
                                                                    style={{ width: `${percent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-base font-black ${isExhausted ? 'text-rose-500' : isLow ? 'text-amber-500' : 'text-emerald-400'}`}>
                                                            {u.creditBalance?.unlimited ? '∞' : remaining}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {isExhausted ? (
                                                            <div className="flex items-center gap-1 text-rose-500">
                                                                <span className="material-symbols-outlined text-sm">cancel</span>
                                                                <span className="text-[10px] font-black uppercase tracking-tighter">Expired</span>
                                                            </div>
                                                        ) : isLow ? (
                                                            <div className="flex items-center gap-1 text-amber-500">
                                                                <span className="material-symbols-outlined text-sm">history_toggle_off</span>
                                                                <span className="text-[10px] font-black uppercase tracking-tighter">Low Balance</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1 text-emerald-500">
                                                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                                                <span className="text-[10px] font-black uppercase tracking-tighter">Healthy</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button 
                                                            onClick={() => setCreditModal(u)}
                                                            className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-white text-xs font-black transition-all border border-emerald-500/20 flex items-center gap-2 ml-auto cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">add_card</span>
                                                            Recharge
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr><td colSpan="6" className="py-20 text-center text-slate-600 font-medium tracking-wide">No users matching current filters</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {totalUsers > 20 && (
                            <div className="flex justify-center gap-4 mt-8">
                                <button 
                                    disabled={userPage <= 1} 
                                    onClick={() => setUserPage(p => p - 1)} 
                                    className="px-6 py-3 rounded-2xl bg-white/[0.04] text-xs font-bold text-slate-400 disabled:opacity-30 border border-white/[0.08] hover:border-white/[0.2] transition-all cursor-pointer"
                                >
                                    ← Previous Page
                                </button>
                                <div className="px-6 py-3 rounded-2xl bg-primary/10 border border-primary/20 text-xs font-black text-primary">
                                    Page {userPage}
                                </div>
                                <button 
                                    disabled={users.length < 20} 
                                    onClick={() => setUserPage(p => p + 1)} 
                                    className="px-6 py-3 rounded-2xl bg-white/[0.04] text-xs font-bold text-slate-400 disabled:opacity-30 border border-white/[0.08] hover:border-white/[0.2] transition-all cursor-pointer"
                                >
                                    Next Page →
                                </button>
                            </div>
                        )}
                    </div>
                )}


                {/* ════════════ TOKEN USAGE ════════════ */}
                {tab === 'tokenUsage' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-cyan-400">monitoring</span>
                                    AI Token Usage &amp; Cost Analytics
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Track actual AI API token consumption, costs, and profitability</p>
                            </div>
                            <div className="flex gap-2">
                                {[7, 30, 90].map(d => (
                                    <button key={d} onClick={() => { setTokenDays(d); setTimeout(() => loadTokenUsage(), 50) }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${tokenDays === d ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 bg-white/[0.03] border border-white/[0.06]'}`}>
                                        {d}d
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!tokenData ? (
                            <div className="flex items-center justify-center py-20 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading token analytics...
                            </div>
                        ) : (
                            <>
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-cyan-400 text-lg mb-1 block">token</span>
                                        <p className="text-xl font-extrabold text-white">{(tokenData.totals?.totalTokens || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-500">Total Tokens</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-blue-400 text-lg mb-1 block">input</span>
                                        <p className="text-xl font-extrabold text-white">{(tokenData.totals?.inputTokens || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-500">Input Tokens</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-purple-400 text-lg mb-1 block">output</span>
                                        <p className="text-xl font-extrabold text-white">{(tokenData.totals?.outputTokens || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-500">Output Tokens</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-amber-400 text-lg mb-1 block">payments</span>
                                        <p className="text-xl font-extrabold text-amber-400">${tokenData.totals?.estimatedCostUSD || 0}</p>
                                        <p className="text-[10px] text-slate-500">Est. Cost (USD)</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-emerald-400 text-lg mb-1 block">bolt</span>
                                        <p className="text-xl font-extrabold text-white">{(tokenData.totals?.totalCalls || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-slate-500">AI Calls</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-lg mb-1 block" style={{ color: (tokenData.profitability?.margin || 0) > 50 ? '#34d399' : (tokenData.profitability?.margin || 0) > 0 ? '#fbbf24' : '#fb7185' }}>trending_up</span>
                                        <p className="text-xl font-extrabold" style={{ color: (tokenData.profitability?.margin || 0) > 50 ? '#34d399' : (tokenData.profitability?.margin || 0) > 0 ? '#fbbf24' : '#fb7185' }}>{tokenData.profitability?.margin || 0}%</p>
                                        <p className="text-[10px] text-slate-500">Profit Margin</p>
                                    </div>
                                </div>

                                {/* Provider Portfolio Section */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-400 text-lg">account_balance_wallet</span>
                                            Provider Portfolio (Prepaid Balances)
                                        </h4>
                                        <button onClick={() => setShowBudgetModal(true)} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-slate-400 text-[10px] font-bold hover:bg-white/[0.06] transition-all flex items-center gap-1.5 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">settings</span>
                                            Configure Budgets
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {tokenData.providerWallets?.length > 0 ? tokenData.providerWallets.map(w => {
                                            const pct = w.budget > 0 ? Math.min(100, (w.consumed / w.budget) * 100) : 0;
                                            const remaining = Math.max(0, w.budget - w.consumed);
                                            const isLow = w.budget > 0 && (remaining / w.budget) < 0.15;
                                            const colors = { anthropic: 'text-orange-400', openai: 'text-emerald-400', gemini: 'text-blue-400', xai: 'text-slate-200', grok: 'text-slate-200', sarvam: 'text-rose-400' };
                                            const bgColors = { anthropic: 'bg-orange-500', openai: 'bg-emerald-500', gemini: 'bg-blue-500', xai: 'bg-slate-500', grok: 'bg-slate-500', sarvam: 'bg-rose-500' };
                                            
                                            return (
                                                <div key={w.provider} className={`glass-panel rounded-2xl p-5 border transition-all ${isLow ? 'border-amber-500/30' : 'border-white/[0.06]'}`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <p className={`text-xs font-black uppercase tracking-widest ${colors[w.provider] || 'text-slate-400'}`}>{w.provider === 'xai' ? 'Grok (xAI)' : w.provider}</p>
                                                        {isLow && <span className="material-symbols-outlined text-amber-500 text-sm animate-pulse">warning</span>}
                                                    </div>
                                                    <div className="flex items-baseline gap-1 mb-1">
                                                        <span className="text-2xl font-black text-white">${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        <span className="text-[10px] text-slate-500 font-bold tracking-tighter uppercase">Left</span>
                                                    </div>
                                                    <div className="flex justify-between items-center mb-4">
                                                        <p className="text-[10px] text-slate-600 font-medium">of ${w.budget?.toLocaleString()} purchased</p>
                                                        <p className="text-[9px] font-bold text-slate-500 bg-white/[0.04] px-1.5 py-0.5 rounded uppercase tracking-tighter">{w.tokens?.toLocaleString() || 0} tokens</p>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
                                                            <span className="text-slate-600">Consumed: ${w.consumed?.toLocaleString()}</span>
                                                            <span className={pct > 90 ? 'text-rose-400' : pct > 75 ? 'text-amber-400' : 'text-slate-600'}>{Math.round(pct)}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-1000 ${pct > 90 ? 'bg-rose-500' : pct > 75 ? 'bg-amber-500' : bgColors[w.provider] || 'bg-primary'}`} 
                                                                style={{ width: `${pct}%` }} 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="col-span-full py-8 text-center glass-panel rounded-2xl border border-white/[0.04] text-slate-600 text-xs">
                                                No provider budgets configured yet. Click "Configure Budgets" to start tracking.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Profitability Banner */}
                                <div className="glass-panel rounded-2xl p-5 mb-5 border border-emerald-500/10 bg-gradient-to-r from-emerald-500/[0.03] to-transparent">
                                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-400 text-lg">account_balance</span>
                                        Profitability Analysis
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Monthly Revenue</p>
                                            <p className="text-lg font-extrabold text-emerald-400">₹{(tokenData.profitability?.monthlyRevenue || 0).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Est. AI Cost (INR)</p>
                                            <p className="text-lg font-extrabold text-rose-400">₹{(tokenData.profitability?.estimatedCostINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Net Profit</p>
                                            <p className="text-lg font-extrabold" style={{ color: ((tokenData.profitability?.monthlyRevenue || 0) - (tokenData.profitability?.estimatedCostINR || 0)) > 0 ? '#34d399' : '#fb7185' }}>
                                                ₹{((tokenData.profitability?.monthlyRevenue || 0) - (tokenData.profitability?.estimatedCostINR || 0)).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                                    {/* Per-Studio Breakdown */}
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-indigo-400 text-lg">apps</span>
                                            Usage by Studio
                                        </h4>
                                        {(tokenData.byStudio || []).length > 0 ? (
                                            <div className="space-y-2">
                                                {tokenData.byStudio.map(s => {
                                                    const maxTokens = Math.max(...tokenData.byStudio.map(x => x.totalTokens || 0));
                                                    const pct = maxTokens > 0 ? ((s.totalTokens || 0) / maxTokens) * 100 : 0;
                                                    const colors = { seo: '#6366f1', content: '#10b981', creative: '#f472b6', brainstorm: '#f59e0b', video: '#06b6d4', unknown: '#64748b' };
                                                    return (
                                                        <div key={s._id || 'unknown'} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className="text-sm font-bold text-white capitalize">{s._id || 'Other'}</span>
                                                                <span className="text-xs text-slate-400">{(s.totalTokens || 0).toLocaleString()} tokens</span>
                                                            </div>
                                                            <div className="w-full h-1.5 rounded-full bg-white/[0.06] mb-1">
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[s._id] || colors.unknown }} />
                                                            </div>
                                                            <div className="flex items-center justify-between text-[10px] text-slate-600">
                                                                <span>{s.calls} calls • {s.credits} credits</span>
                                                                <span className="text-amber-400">${(s.estimatedCost || 0).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-600 text-center py-8">No token usage data yet. Generate some reports to see studio breakdown.</p>
                                        )}
                                    </div>

                                    {/* Per-Model Breakdown */}
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-purple-400 text-lg">smart_toy</span>
                                            Usage by Model
                                        </h4>
                                        {(tokenData.byModel || []).length > 0 ? (
                                            <div className="space-y-2">
                                                {tokenData.byModel.map((m, i) => {
                                                    const provColors = { openai: '#10b981', xai: '#3b82f6', gemini: '#f59e0b' };
                                                    return (
                                                        <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full" style={{ background: provColors[m._id?.provider] || '#64748b' }} />
                                                                    <span className="text-sm font-bold text-white">{m._id?.model || 'Unknown'}</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-500 uppercase">{m._id?.provider}</span>
                                                                </div>
                                                                <span className="text-xs font-bold text-amber-400">${(m.estimatedCost || 0).toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-[10px] text-slate-500">
                                                                <span>{(m.totalTokens || 0).toLocaleString()} total</span>
                                                                <span>↓{(m.inputTokens || 0).toLocaleString()} in</span>
                                                                <span>↑{(m.outputTokens || 0).toLocaleString()} out</span>
                                                                <span>{m.calls} calls</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-slate-600 text-center py-8">No model usage data yet.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Top Token Consumers */}
                                <div className="glass-panel rounded-2xl p-5">
                                    <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-rose-400 text-lg">leaderboard</span>
                                        Top Token Consumers
                                    </h4>
                                    {(tokenData.topUsers || []).length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-white/[0.04]">
                                                        <th className="pb-2">User</th>
                                                        <th className="pb-2">Plan</th>
                                                        <th className="pb-2 text-right">Tokens Used</th>
                                                        <th className="pb-2 text-right">AI Calls</th>
                                                        <th className="pb-2 text-right">Credits Used</th>
                                                        <th className="pb-2 text-right">Est. Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.04]">
                                                    {tokenData.topUsers.map((u, i) => (
                                                        <tr key={u._id || i} className="text-sm hover:bg-white/[0.02] transition-all">
                                                            <td className="py-2.5">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded bg-cyan-500/10 flex items-center justify-center text-[10px] font-bold text-cyan-400">{u.name?.[0] || '?'}</div>
                                                                    <div><p className="font-bold text-white text-xs">{u.name || 'Unknown'}</p><p className="text-[10px] text-slate-600">{u.email}</p></div>
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-white/[0.05] text-slate-400 capitalize">{u.plan}</span></td>
                                                            <td className="py-2.5 text-right font-bold text-white">{(u.totalTokens || 0).toLocaleString()}</td>
                                                            <td className="py-2.5 text-right text-slate-400">{u.calls}</td>
                                                            <td className="py-2.5 text-right text-slate-400">{u.credits}</td>
                                                            <td className="py-2.5 text-right font-bold text-amber-400">${(u.estimatedCost || 0).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-600 text-center py-8">No user token data yet. Users need to generate reports to see their consumption.</p>
                                    )}
                                </div>
                            </>
                        )}
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
                                    <button onClick={() => handleDeleteBrand(b, b.name)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
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
                                    <button onClick={() => handleDeleteContent(c)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-600 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
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
                                <div className="pt-2 border-t border-white/[0.06]">
                                    <p className="text-xs text-slate-600 uppercase font-bold tracking-wider mb-3">Store Visibility</p>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div><p className="text-base font-bold text-white">Show Subscription Plans</p><p className="text-sm text-slate-500">Users can see & purchase subscription packages</p></div>
                                            <button onClick={() => handleToggleSetting('showSubscriptionPlans', !systemSettings.showSubscriptionPlans)}
                                                className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.showSubscriptionPlans ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.showSubscriptionPlans ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div><p className="text-base font-bold text-white">Show Credit Packs (Top-up Store)</p><p className="text-sm text-slate-500">Users can buy additional credit packs</p></div>
                                            <button onClick={() => handleToggleSetting('showCreditPacks', !systemSettings.showCreditPacks)}
                                                className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.showCreditPacks !== false ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.showCreditPacks !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Studio Launch Control - 3-tier visibility */}
                                {studioVisibility && (
                                    <div className="pt-4 border-t border-white/[0.06]">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-violet-400">rocket_launch</span>
                                                <p className="text-base font-bold text-white">Studio Launch Control</p>
                                            </div>
                                            <div className="flex gap-3 text-xs">
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Public</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Private</span>
                                                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />Hidden</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-500 mb-4">Control which studios are available portal-wide. <b className="text-slate-400">Public</b> = everyone (per plan), <b className="text-amber-400">Private</b> = whitelisted users only, <b className="text-rose-400">Hidden</b> = off for all.</p>
                                        <div className="space-y-2">
                                            {studioKeys.map(key => {
                                                const status = studioVisibility[key] || 'public';
                                                const rowBorder = { public: 'border-emerald-500/20', private: 'border-amber-500/20', hidden: 'border-rose-500/20' };
                                                const dotColor = { public: 'bg-emerald-500', private: 'bg-amber-500', hidden: 'bg-rose-500' };
                                                const activeClasses = {
                                                    public: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
                                                    private: 'bg-amber-500/20 text-amber-400 border border-amber-500/40',
                                                    hidden: 'bg-rose-500/20 text-rose-400 border border-rose-500/40',
                                                };
                                                return (
                                                    <div key={key} className={`flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border ${rowBorder[status]} transition-all`}>
                                                        <div className="flex items-center gap-3">
                                                            <span className={`w-2.5 h-2.5 rounded-full ${dotColor[status]}`} />
                                                            <span className="text-sm font-bold text-white">{studioLabels[key] || key}</span>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            {['public', 'private', 'hidden'].map(state => (
                                                                <button key={state} onClick={() => handleStudioVisibilityChange(key, state)}
                                                                    className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${status === state
                                                                        ? activeClasses[state]
                                                                        : 'text-slate-600 hover:text-slate-400 border border-transparent'
                                                                    }`}
                                                                >
                                                                    {state.charAt(0).toUpperCase() + state.slice(1)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
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

                                <div className="glass-panel rounded-2xl p-6 border border-primary/10">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-amber-400">sync_problem</span>
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-white">Credit Integrity Sync</p>
                                                <p className="text-sm text-slate-500">Repair and synchronize credit data system-wide</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleSyncCredits} 
                                            disabled={syncingCredits}
                                            className="px-6 py-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-sm font-bold border border-amber-500/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            <span className={`material-symbols-outlined text-base ${syncingCredits ? 'animate-spin' : ''}`}>
                                                {syncingCredits ? 'progress_activity' : 'database_sync'}
                                            </span>
                                            {syncingCredits ? 'Syncing...' : 'Start Integrity Sync'}
                                        </button>
                                    </div>
                                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                        <div className="flex gap-2">
                                            <span className="material-symbols-outlined text-amber-400 text-sm">info</span>
                                            <p className="text-xs text-amber-400/80 leading-relaxed">
                                                This utility walks through all users, verifies their active subscription allocation, and matches their `used` credits against the `CreditUsage` logs for the current cycle. Use this if you notice discrepancies between plan limits and actual credit balances.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ──────── PRICING CALCULATOR ──────── */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-emerald-400">calculate</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-white">Pricing Calculator</p>
                                        <p className="text-sm text-slate-500">API cost vs credit revenue — per action profitability</p>
                                    </div>
                                </div>
                                <button onClick={() => loadPricingData()} disabled={pricingLoading} className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:from-emerald-500/20 hover:to-cyan-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                                    <span className={`material-symbols-outlined text-sm ${pricingLoading ? 'animate-spin' : ''}`}>{pricingLoading ? 'progress_activity' : 'refresh'}</span>
                                    {pricingLoading ? 'Loading...' : pricingData ? 'Refresh' : 'Load Pricing Data'}
                                </button>
                            </div>

                            {pricingData && (
                                <div className="space-y-4">
                                    {/* Credit Price Slider */}
                                    <div className="glass-panel rounded-2xl p-5 border border-emerald-500/10">
                                        <label className="text-xs font-bold text-slate-400 mb-2 block">PRICE PER CREDIT (₹)</label>
                                        <div className="flex items-center gap-4">
                                            <input type="range" min="0.5" max="10" step="0.5" value={pricingPrice} onChange={e => { setPricingPrice(parseFloat(e.target.value)); loadPricingData(parseFloat(e.target.value)) }} className="flex-1 accent-emerald-500 cursor-pointer" />
                                            <span className="text-2xl font-extrabold text-emerald-400 min-w-[60px] text-center">₹{pricingPrice}</span>
                                        </div>
                                    </div>

                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[{ l: 'Profitable', v: pricingData.summary?.profitableActions, c: 'text-emerald-400', bg: 'from-emerald-500/10', i: 'trending_up' },
                                          { l: 'Break-even', v: pricingData.summary?.breakevenActions, c: 'text-amber-400', bg: 'from-amber-500/10', i: 'trending_flat' },
                                          { l: 'Loss', v: pricingData.summary?.lossActions, c: 'text-rose-400', bg: 'from-rose-500/10', i: 'trending_down' },
                                          { l: 'Overall Margin', v: `${pricingData.summary?.overallMarginPct || 0}%`, c: (pricingData.summary?.overallMarginPct || 0) >= 50 ? 'text-emerald-400' : (pricingData.summary?.overallMarginPct || 0) >= 20 ? 'text-amber-400' : 'text-rose-400', bg: 'from-indigo-500/10', i: 'donut_large' },
                                        ].map(s => (
                                            <div key={s.l} className={`glass-panel rounded-xl p-4 bg-gradient-to-br ${s.bg} to-transparent`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`material-symbols-outlined text-sm ${s.c}`}>{s.i}</span>
                                                    <span className="text-xs text-slate-500 font-bold">{s.l}</span>
                                                </div>
                                                <p className={`text-2xl font-extrabold ${s.c}`}>{s.v}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Monthly Projection */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">Est. Monthly API Cost</p>
                                            <p className="text-lg font-extrabold text-rose-400">₹{(pricingData.summary?.estimatedMonthlyAPICostINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">Est. Monthly Revenue</p>
                                            <p className="text-lg font-extrabold text-emerald-400">₹{(pricingData.summary?.estimatedMonthlyRevenueINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">Est. Monthly Profit</p>
                                            <p className={`text-lg font-extrabold ${((pricingData.summary?.estimatedMonthlyRevenueINR || 0) - (pricingData.summary?.estimatedMonthlyAPICostINR || 0)) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>₹{((pricingData.summary?.estimatedMonthlyRevenueINR || 0) - (pricingData.summary?.estimatedMonthlyAPICostINR || 0)).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* Studio Filter */}
                                    <div className="flex gap-2 flex-wrap">
                                        {['all', ...Object.keys(pricingData.studioSummary || {})].map(s => (
                                            <button key={s} onClick={() => setPricingStudioFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${pricingStudioFilter === s ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/[0.04] text-slate-500 border border-white/[0.08] hover:text-white'}`}>
                                                {s === 'all' ? 'All Studios' : s}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Per-Action Table */}
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06]">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-white/[0.06] bg-white/[0.02]">
                                                        <th className="px-4 py-3">Action</th>
                                                        <th className="px-3 py-3">Studio</th>
                                                        <th className="px-3 py-3 text-right">Credits</th>
                                                        <th className="px-3 py-3 text-right">API Cost ($)</th>
                                                        <th className="px-3 py-3 text-right">API Cost (₹)</th>
                                                        <th className="px-3 py-3 text-right">Revenue (₹)</th>
                                                        <th className="px-3 py-3 text-right">Profit (₹)</th>
                                                        <th className="px-3 py-3 text-right">Margin</th>
                                                        <th className="px-3 py-3 text-center">30d Uses</th>
                                                        <th className="px-3 py-3 text-center">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.04]">
                                                    {(pricingData.actions || []).filter(a => pricingStudioFilter === 'all' || a.studio === pricingStudioFilter).map(a => (
                                                        <tr key={a.action} className="text-sm hover:bg-white/[0.02] transition-all">
                                                            <td className="px-4 py-2.5"><span className="font-bold text-white text-xs">{a.label}</span></td>
                                                            <td className="px-3 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 font-bold">{a.studio}</span></td>
                                                            <td className="px-3 py-2.5 text-right font-bold text-amber-400">{a.creditCost}</td>
                                                            <td className="px-3 py-2.5 text-right text-slate-400 font-mono text-xs">${a.apiCostUSD}</td>
                                                            <td className="px-3 py-2.5 text-right text-slate-400">₹{a.apiCostINR}</td>
                                                            <td className="px-3 py-2.5 text-right text-white font-bold">₹{a.revenueINR}</td>
                                                            <td className={`px-3 py-2.5 text-right font-bold ${a.profitINR >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>₹{a.profitINR}</td>
                                                            <td className={`px-3 py-2.5 text-right font-extrabold ${a.marginPct >= 50 ? 'text-emerald-400' : a.marginPct >= 20 ? 'text-amber-400' : 'text-rose-400'}`}>{a.marginPct}%</td>
                                                            <td className="px-3 py-2.5 text-center text-slate-500">{a.last30d?.count || 0}</td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${a.status === 'profitable' ? 'bg-emerald-500/15 text-emerald-400' : a.status === 'breakeven' ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                                    {a.status === 'profitable' ? '🟢' : a.status === 'breakeven' ? '🟡' : '🔴'} {a.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Studio Summary Cards */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                        {Object.entries(pricingData.studioSummary || {}).map(([studio, data]) => (
                                            <div key={studio} className="glass-panel rounded-xl p-3">
                                                <p className="text-xs font-bold text-white mb-1">{studio}</p>
                                                <div className="flex items-baseline gap-2">
                                                    <span className={`text-lg font-extrabold ${data.avgMargin >= 50 ? 'text-emerald-400' : data.avgMargin >= 20 ? 'text-amber-400' : 'text-rose-400'}`}>{data.avgMargin}%</span>
                                                    <span className="text-[10px] text-slate-600">avg margin</span>
                                                </div>
                                                <p className="text-[10px] text-slate-600">{data.actions} actions{data.losses > 0 ? ` • ${data.losses} loss` : ''}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ──────── API KEY MANAGEMENT ──────── */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-violet-400">key</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-white">API Key Management</p>
                                        <p className="text-sm text-slate-500">Manage external API keys — DB overrides env vars</p>
                                    </div>
                                </div>
                                <button onClick={loadApiKeys} className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold hover:bg-violet-500/20 cursor-pointer flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {apiProviders.map(p => (
                                    <div key={p.id} className="glass-panel rounded-xl p-4 border border-white/[0.06] hover:border-violet-500/20 transition-all">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-violet-400 text-lg">{p.icon}</span>
                                                <span className="text-sm font-bold text-white">{p.label}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                {p.canTest && (
                                                    <button onClick={() => handleTestApiKey(p.id)} disabled={testingProvider === p.id} className="p-1 rounded hover:bg-white/[0.05] cursor-pointer" title="Test">
                                                        <span className={`material-symbols-outlined text-sm ${testingProvider === p.id ? 'animate-spin text-amber-400' : 'text-slate-500'}`}>{testingProvider === p.id ? 'progress_activity' : 'speed'}</span>
                                                    </button>
                                                )}
                                                <button onClick={() => { setEditingProvider(p.id); setEditProviderKeys({}) }} className="p-1 rounded hover:bg-white/[0.05] cursor-pointer" title="Edit">
                                                    <span className="material-symbols-outlined text-sm text-slate-500">edit</span>
                                                </button>
                                            </div>
                                        </div>
                                        {p.fields.map(f => (
                                            <div key={f.key} className="flex items-center justify-between py-1.5 border-t border-white/[0.04]">
                                                <span className="text-[10px] text-slate-500 font-bold">{f.label}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400 font-mono">{f.masked || '—'}</span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${f.source === 'database' ? 'bg-violet-500/15 text-violet-400' : f.source === 'env' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>{f.source}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {testResults[p.id] && (
                                            <div className={`mt-2 p-2 rounded-lg text-[10px] font-bold ${testResults[p.id].success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                {testResults[p.id].status === 'connected' ? '🟢' : testResults[p.id].status === 'no_key' ? '⚫' : '🔴'} {testResults[p.id].message}
                                            </div>
                                        )}
                                        {editingProvider === p.id && (
                                            <div className="mt-3 pt-3 border-t border-violet-500/20 space-y-2">
                                                {p.fields.map(f => (
                                                    <input key={f.key} type="password" placeholder={`New ${f.label}`} value={editProviderKeys[f.key] || ''} onChange={e => setEditProviderKeys(k => ({ ...k, [f.key]: e.target.value }))} className="w-full px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs focus:border-violet-500/50 outline-none" />
                                                ))}
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleSaveApiKey(p.id)} className="flex-1 px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-400 text-xs font-bold hover:bg-violet-500/30 cursor-pointer">Save</button>
                                                    <button onClick={() => handleDeleteApiKey(p.id)} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 cursor-pointer">Remove</button>
                                                    <button onClick={() => setEditingProvider(null)} className="px-3 py-1.5 rounded-lg bg-white/[0.05] text-slate-500 text-xs font-bold hover:bg-white/[0.1] cursor-pointer">Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ──────── WATERMARK CONFIGURATION ──────── */}
                        {systemSettings && (
                            <div className="mt-8">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-cyan-400">branding_watermark</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-white">Watermark Configuration</p>
                                        <p className="text-sm text-slate-500">Logo, position, opacity — applied to images & videos</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
                                        <label className="text-xs font-bold text-slate-400 mb-2 block">WATERMARK LOGO</label>
                                        <div className="flex flex-col items-center gap-3">
                                            {(watermarkLogoPreview || systemSettings.watermarkLogoUrl) ? (
                                                <div className="w-full h-24 rounded-lg bg-slate-800/50 flex items-center justify-center overflow-hidden border border-white/[0.06]">
                                                    <img src={watermarkLogoPreview || systemSettings.watermarkLogoUrl} alt="Watermark" className="max-h-20 max-w-full object-contain" />
                                                </div>
                                            ) : (
                                                <div className="w-full h-24 rounded-lg bg-slate-800/50 flex items-center justify-center border border-dashed border-white/[0.1]">
                                                    <span className="text-slate-600 text-xs">No logo — text watermark active</span>
                                                </div>
                                            )}
                                            <label className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 cursor-pointer flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-sm">upload</span> Upload Logo
                                                <input type="file" accept="image/*" onChange={handleWatermarkLogoUpload} className="hidden" />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
                                        <label className="text-xs font-bold text-slate-400 mb-2 block">POSITION</label>
                                        <select value={systemSettings.watermarkPosition || 'bottom-right'} onChange={e => handleWatermarkSettingsUpdate({ position: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs mb-4 cursor-pointer outline-none">
                                            {['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'].map(pos => (
                                                <option key={pos} value={pos} className="bg-slate-900">{pos.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                                            ))}
                                        </select>
                                        <label className="text-xs font-bold text-slate-400 mb-2 block">OPACITY ({Math.round((systemSettings.watermarkOpacity || 0.4) * 100)}%)</label>
                                        <input type="range" min="0.1" max="1" step="0.05" value={systemSettings.watermarkOpacity || 0.4} onChange={e => handleWatermarkSettingsUpdate({ opacity: parseFloat(e.target.value) })} className="w-full accent-cyan-500 cursor-pointer" />
                                    </div>

                                    <div className="glass-panel rounded-xl p-4 border border-white/[0.06]">
                                        <label className="text-xs font-bold text-slate-400 mb-3 block">WATERMARK STATUS</label>
                                        <div className="flex items-center gap-3 mb-4">
                                            <button onClick={() => handleWatermarkSettingsUpdate({ enabled: !systemSettings.watermarkEnabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${systemSettings.watermarkEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}>
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${systemSettings.watermarkEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                            <span className={`text-sm font-bold ${systemSettings.watermarkEnabled ? 'text-cyan-400' : 'text-slate-500'}`}>{systemSettings.watermarkEnabled ? 'ON — All Outputs' : 'OFF — No Watermarks'}</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-[10px]"><span className="material-symbols-outlined text-xs text-cyan-400">image</span><span className="text-slate-400">Applied to generated images</span></div>
                                            <div className="flex items-center gap-2 text-[10px]"><span className="material-symbols-outlined text-xs text-cyan-400">movie</span><span className="text-slate-400">Applied to generated videos</span></div>
                                            <div className="flex items-center gap-2 text-[10px]"><span className="material-symbols-outlined text-xs text-amber-400">tune</span><span className="text-slate-400">Per-brand/user overrides available</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ──────── PROVIDER USAGE INTELLIGENCE ──────── */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-orange-400">monitoring</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-white">Provider Usage Intelligence</p>
                                        <p className="text-sm text-slate-500">Real API usage data from providers + internal logs</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select value={providerUsageDays} onChange={e => { setProviderUsageDays(parseInt(e.target.value)); loadProviderUsage(parseInt(e.target.value)) }} className="px-2 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs cursor-pointer outline-none">
                                        {[7, 14, 30, 60, 90].map(d => <option key={d} value={d} className="bg-slate-900">{d} days</option>)}
                                    </select>
                                    <button onClick={() => loadProviderUsage()} disabled={providerUsageLoading} className="px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold hover:bg-orange-500/20 cursor-pointer flex items-center gap-1 disabled:opacity-50">
                                        <span className={`material-symbols-outlined text-sm ${providerUsageLoading ? 'animate-spin' : ''}`}>{providerUsageLoading ? 'progress_activity' : 'refresh'}</span>
                                        {providerUsageLoading ? 'Loading...' : providerUsageData ? 'Refresh' : 'Load Usage'}
                                    </button>
                                </div>
                            </div>

                            {providerUsageData && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">Total API Cost (Est.)</p>
                                            <p className="text-xl font-extrabold text-rose-400">${providerUsageData.totalEstimatedCostUSD}</p>
                                            <p className="text-[10px] text-slate-600">≈ ₹{Math.round((providerUsageData.totalEstimatedCostUSD || 0) * 85).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">Total API Calls</p>
                                            <p className="text-xl font-extrabold text-amber-400">{(providerUsageData.totalCalls || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-slate-500 mb-1">Credits Consumed</p>
                                            <p className="text-xl font-extrabold text-indigo-400">{(providerUsageData.totalCreditsUsed || 0).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {Object.entries(providerUsageData.providerUsage || {}).map(([prov, data]) => (
                                            <div key={prov} className={`glass-panel rounded-xl p-4 border ${data.calls > 0 ? 'border-orange-500/10' : 'border-white/[0.04]'}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold text-white capitalize">{prov}</span>
                                                    {data.calls > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400 font-bold">ACTIVE</span>}
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Calls</span><span className="text-white font-bold">{data.calls.toLocaleString()}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Tokens</span><span className="text-white font-bold">{(data.totalTokens || 0).toLocaleString()}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Est. Cost</span><span className="text-rose-400 font-bold">${data.estimatedCostUSD}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-slate-500">Credits</span><span className="text-amber-400 font-bold">{data.creditsUsed}</span></div>
                                                </div>
                                                {data.models?.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-white/[0.04]">
                                                        {data.models.slice(0, 3).map(m => (
                                                            <div key={m.model} className="flex justify-between text-[9px] py-0.5">
                                                                <span className="text-slate-600 truncate max-w-[60%]">{m.model}</span>
                                                                <span className="text-slate-500">{m.calls} calls</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {providerUsageData.piapiBalance && (
                                        <div className="glass-panel rounded-xl p-4 border border-orange-500/10">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="material-symbols-outlined text-orange-400 text-sm">account_balance_wallet</span>
                                                <span className="text-xs font-bold text-white">PiAPI Account Balance</span>
                                            </div>
                                            <pre className="text-[10px] text-slate-400 bg-white/[0.02] p-2 rounded overflow-auto max-h-24">{JSON.stringify(providerUsageData.piapiBalance, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════ INTEGRATIONS ════════════ */}
                {tab === 'integrations' && (
                    <div>
                        {integrations && (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">{Object.entries(integrations.summary?.byPlatform || {}).map(([p, count]) => (
                                    <div key={p} className="glass-panel rounded-2xl p-4 text-center">
                                        <p className="text-2xl mb-1">{platformIcons[p] || '🔌'}</p>
                                        <p className="text-lg font-extrabold text-white">{count}</p>
                                        <p className="text-sm text-slate-500 capitalize">{p.replace('-', ' ')}</p>
                                    </div>
                                ))}</div>

                                {/* Search + Filter */}
                                <div className="flex gap-3 mb-5">
                                    <div className="flex-1 relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg">search</span>
                                        <input
                                            type="text"
                                            placeholder="Search by user, email, or brand..."
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none focus:border-primary/50"
                                            id="integration-search"
                                            onChange={e => {
                                                const q = e.target.value.toLowerCase()
                                                document.querySelectorAll('[data-integration-row]').forEach(row => {
                                                    row.style.display = row.dataset.integrationRow.includes(q) ? '' : 'none'
                                                })
                                            }}
                                        />
                                    </div>
                                    <select
                                        className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none cursor-pointer"
                                        onChange={e => {
                                            const f = e.target.value
                                            document.querySelectorAll('[data-integration-row]').forEach(row => {
                                                row.style.display = (!f || row.dataset.platform === f) ? '' : 'none'
                                            })
                                        }}
                                    >
                                        <option value="">All Platforms</option>
                                        {Object.keys(integrations.summary?.byPlatform || {}).map(p => (
                                            <option key={p} value={p}>{p.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Table Header */}
                                <div className="grid grid-cols-[2fr_1.5fr_1fr_0.8fr_1.5fr_1fr] gap-3 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-white/[0.06] mb-2">
                                    <span>User</span><span>Brand</span><span>Platform</span><span>Status</span><span>Account</span><span>Last Synced</span>
                                </div>

                                {/* Table Rows */}
                                <div className="space-y-1.5">
                                    {(integrations.integrations || []).map(i => (
                                        <div
                                            key={i._id}
                                            data-integration-row={`${i.user?.name || ''} ${i.user?.email || ''} ${i.brand?.name || ''} ${i.platform || ''}`.toLowerCase()}
                                            data-platform={i.platform}
                                            className="grid grid-cols-[2fr_1.5fr_1fr_0.8fr_1.5fr_1fr] gap-3 items-center glass-panel rounded-xl px-4 py-3 hover:bg-white/[0.03] transition-all"
                                        >
                                            {/* User */}
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                                                    {i.user?.name?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{i.user?.name || 'Unknown'}</p>
                                                    <p className="text-[10px] text-slate-600 truncate">{i.user?.email}</p>
                                                </div>
                                            </div>
                                            {/* Brand */}
                                            <div className="min-w-0">
                                                <p className="text-sm text-slate-300 truncate">{i.brand?.name || '—'}</p>
                                            </div>
                                            {/* Platform */}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-lg">{platformIcons[i.platform] || '🔌'}</span>
                                                <span className="text-xs text-slate-400 capitalize">{(i.platform || '').replace('-', ' ')}</span>
                                            </div>
                                            {/* Status */}
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold w-fit ${i.status === 'connected' ? 'bg-emerald-500/15 text-emerald-400' : i.status === 'expired' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'}`}>{i.status}</span>
                                            {/* Account */}
                                            <p className="text-xs text-slate-400 truncate">{i.displayName || i.email || '—'}</p>
                                            {/* Last Synced */}
                                            <span className="text-xs text-slate-600">{i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Never'}</span>
                                        </div>
                                    ))}
                                </div>

                                {(integrations.integrations || []).length === 0 && (
                                    <div className="text-center py-16 glass-panel rounded-2xl mt-4">
                                        <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">hub</span>
                                        <h3 className="text-lg font-bold text-white mb-1">No Integrations</h3>
                                        <p className="text-sm text-slate-500">Users haven't connected any platforms yet</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ AUDIT LOGS ════════════ */}
                {tab === 'logs' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-400">history</span>
                                    System Audit Logs
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Immutable record of all administrative actions performed on the platform</p>
                            </div>
                            <button onClick={loadLogs} className="p-2 rounded-lg bg-white/[0.04] text-slate-400 hover:text-white cursor-pointer transition-all"><span className={`${logsLoading ? 'animate-spin' : ''} material-symbols-outlined text-sm`}>refresh</span></button>
                        </div>

                        <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06]">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-xs text-slate-500 font-bold uppercase tracking-wider border-b border-white/[0.06] bg-white/[0.02]">
                                            <th className="px-5 py-4">Action & Target</th>
                                            <th className="px-5 py-4">Admin</th>
                                            <th className="px-5 py-4">Severity</th>
                                            <th className="px-5 py-4">IP Address</th>
                                            <th className="px-5 py-4 text-right">Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.04]">
                                        {logsLoading ? (
                                            <tr><td colSpan="5" className="py-20 text-center text-slate-500 capitalize"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading Audit Trail...</td></tr>
                                        ) : logs.length > 0 ? logs.map(log => (
                                            <tr key={log._id} className="text-sm hover:bg-white/[0.01] transition-all group">
                                                <td className="px-5 py-4">
                                                    <div>
                                                        <span className="font-bold text-white uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] mr-2">{log.action?.replace(/_/g, ' ')}</span>
                                                        <span className="text-slate-400 text-xs">{log.targetModel} ({log.targetId?.slice(-6)})</span>
                                                        {log.metadata?.reason && <p className="text-[10px] text-slate-600 mt-1 italic">"{log.metadata.reason}"</p>}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded bg-indigo-500/10 flex items-center justify-center text-[10px] font-bold text-indigo-400">{log.admin?.name?.[0]}</div>
                                                        <span className="text-slate-300 font-medium">{log.admin?.name || 'System'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                                        log.severity === 'high' ? 'bg-rose-500/20 text-rose-400' :
                                                        log.severity === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                                                        'bg-emerald-500/20 text-emerald-400'
                                                    }`}>{log.severity?.toUpperCase()}</span>
                                                </td>
                                                <td className="px-5 py-4 font-mono text-xs text-slate-600">{log.ipAddress || '—'}</td>
                                                <td className="px-5 py-4 text-right text-slate-500 text-xs">
                                                    {new Date(log.createdAt).toLocaleString('en-IN', { 
                                                        day: '2-digit', 
                                                        month: 'short', 
                                                        year: 'numeric',
                                                        hour: '2-digit', 
                                                        minute: '2-digit', 
                                                        second: '2-digit',
                                                        hour12: true 
                                                    })}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="5" className="py-20 text-center text-slate-600">No audit logs found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        {totalLogs > 50 && (
                            <div className="flex justify-center gap-2 mt-6">
                                <button disabled={logsPage <= 1} onClick={() => setLogsPage(p => p - 1)} className="px-4 py-2 rounded-lg bg-white/[0.04] text-sm text-slate-400 disabled:opacity-30 cursor-pointer">← Prev</button>
                                <span className="px-4 py-2 text-sm text-slate-500">Page {logsPage}</span>
                                <button disabled={logs.length < 50} onClick={() => setLogsPage(p => p + 1)} className="px-4 py-2 rounded-lg bg-white/[0.04] text-sm text-slate-400 disabled:opacity-30 cursor-pointer">Next →</button>
                            </div>
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
                            <div className="space-y-2">
                                {packages.length > 0 ? packages.map((pkg) => (
                                    <button 
                                        key={pkg._id} 
                                        onClick={() => handleChangePlan(planModal._id, pkg.slug)} 
                                        className={`w-full p-4 rounded-xl text-left transition-all cursor-pointer border ${planModal.plan === pkg.slug ? 'border-primary/40 bg-primary/10' : 'border-white/[0.06] hover:bg-white/[0.04]'}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-base font-bold text-white capitalize">{pkg.name}</p>
                                                <p className="text-[11px] text-slate-500">
                                                    {pkg.credits?.monthly} credits • {pkg.pricing?.monthly > 0 ? `₹${pkg.pricing.monthly}/mo` : 'Free'}
                                                </p>
                                            </div>
                                            {planModal.plan === pkg.slug && <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">CURRENT</span>}
                                        </div>
                                    </button>
                                )) : (
                                    <div className="text-center py-4 text-slate-500 text-sm">No packages found. Create one in the Packages tab.</div>
                                )}
                            </div>
                            <div className="flex justify-end mt-4"><button onClick={() => setPlanModal(null)} className="px-4 py-2 rounded-lg text-sm text-slate-400 cursor-pointer">Close</button></div>
                        </div>
                    </div>
                )}
                {/* Provider Budgets Modal */}
                {showBudgetModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="glass-panel rounded-3xl w-full max-w-md border border-white/10 shadow-2xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">account_balance_wallet</span>
                                    Configure Provider Budgets
                                </h3>
                                <button onClick={() => setShowBudgetModal(false)} className="text-slate-600 hover:text-white cursor-pointer transition-all"><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">Enter the total dollar amount you have recharged for each provider. We'll track your platform's consumption against these limits.</p>
                            
                            <form onSubmit={handleSaveBudgets} className="space-y-4">
                                {Object.keys(budgetForm).map(provider => (
                                    <div key={provider}>
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 ml-1">{provider}</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">$</span>
                                            <input 
                                                type="number" 
                                                value={budgetForm[provider]} 
                                                onChange={e => setBudgetForm(f => ({ ...f, [provider]: Number(e.target.value) }))}
                                                className="w-full pl-8 pr-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none focus:border-amber-500/50 transition-all"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                ))}
                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={() => setShowBudgetModal(false)} className="flex-1 py-3 bg-white/[0.04] text-white text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-white/[0.08] transition-all border border-white/[0.06] cursor-pointer">Cancel</button>
                                    <button type="submit" className="flex-1 py-3 bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 cursor-pointer">Save Budgets</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ════════════ PRICING STRATEGY COMMAND CENTER ════════════ */}
                {tab === 'pricing' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">calculate</span>
                                    Pricing Strategy Command Center
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Policy, margin calculator, and LLM price monitoring</p>
                            </div>
                        </div>

                        {/* Sub-nav */}
                        <div className="flex gap-2 mb-6">
                            {[{ id: 'calculator', label: '🧮 Margin Calculator', icon: 'tune' },
                              { id: 'policy', label: '📋 Pricing Policy', icon: 'description' },
                              { id: 'monitor', label: '🤖 Price Monitor', icon: 'monitoring' }].map(s => (
                                <button key={s.id} onClick={() => setPolicySection(s.id)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        policySection === s.id ? 'bg-amber-500/20 text-amber-400' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        {/* ─── SECTION 1: INTERACTIVE MARGIN CALCULATOR ─── */}
                        {policySection === 'calculator' && (
                            <div className="space-y-6">
                                {/* Slider Controls */}
                                <div className="glass-panel rounded-2xl p-6 border border-amber-500/10">
                                    <h4 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-400">tune</span>
                                        Adjust Parameters — See Real-Time Impact
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-slate-400">₹ per Credit</label>
                                                <span className="text-lg font-black text-amber-400">₹{calcCreditPrice}</span>
                                            </div>
                                            <input type="range" min="1" max="10" step="0.5" value={calcCreditPrice}
                                                onChange={e => { setCalcCreditPrice(parseFloat(e.target.value)); loadPricingData(parseFloat(e.target.value), calcMargin, calcExRate) }}
                                                className="w-full accent-amber-500" />
                                            <div className="flex justify-between text-[9px] text-slate-600 mt-1"><span>₹1</span><span>₹5 (floor)</span><span>₹10</span></div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-slate-400">Target Margin %</label>
                                                <span className="text-lg font-black text-emerald-400">{calcMargin}%</span>
                                            </div>
                                            <input type="range" min="20" max="80" step="5" value={calcMargin}
                                                onChange={e => { setCalcMargin(parseInt(e.target.value)); loadPricingData(calcCreditPrice, parseInt(e.target.value), calcExRate) }}
                                                className="w-full accent-emerald-500" />
                                            <div className="flex justify-between text-[9px] text-slate-600 mt-1"><span>20%</span><span>50% (target)</span><span>80%</span></div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-slate-400">USD/INR Rate</label>
                                                <span className="text-lg font-black text-blue-400">₹{calcExRate}</span>
                                            </div>
                                            <input type="range" min="80" max="95" step="1" value={calcExRate}
                                                onChange={e => { setCalcExRate(parseInt(e.target.value)); loadPricingData(calcCreditPrice, calcMargin, parseInt(e.target.value)) }}
                                                className="w-full accent-blue-500" />
                                            <div className="flex justify-between text-[9px] text-slate-600 mt-1"><span>₹80</span><span>₹85 (default)</span><span>₹95</span></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Summary Cards */}
                                {pricingData?.summary && (
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        <div className="glass-panel rounded-xl p-4 border border-emerald-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Profitable</p>
                                            <p className="text-2xl font-black text-emerald-400">{pricingData.summary.profitableActions}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 border border-amber-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Breakeven</p>
                                            <p className="text-2xl font-black text-amber-400">{pricingData.summary.breakevenActions}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 border border-rose-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Loss</p>
                                            <p className="text-2xl font-black text-rose-400">{pricingData.summary.lossActions}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Est Monthly API Cost</p>
                                            <p className="text-2xl font-black text-white">₹{(pricingData.summary.estimatedMonthlyAPICostINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Overall Margin</p>
                                            <p className={`text-2xl font-black ${pricingData.summary.overallMarginPct >= 50 ? 'text-emerald-400' : pricingData.summary.overallMarginPct >= 20 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                {pricingData.summary.overallMarginPct}%
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Studio Summary */}
                                {pricingData?.studioSummary && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {Object.entries(pricingData.studioSummary).map(([studio, s]) => (
                                            <div key={studio} className={`glass-panel rounded-xl p-4 border ${s.avgMargin >= 50 ? 'border-emerald-500/10' : s.avgMargin >= 20 ? 'border-amber-500/10' : 'border-rose-500/10'}`}>
                                                <p className="text-xs font-bold text-white truncate">{studio}</p>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className={`text-lg font-black ${s.avgMargin >= 50 ? 'text-emerald-400' : s.avgMargin >= 20 ? 'text-amber-400' : 'text-rose-400'}`}>{s.avgMargin}%</span>
                                                    <span className="text-[10px] text-slate-500">{s.actions} actions{s.losses > 0 ? `, ${s.losses} loss` : ''}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Per-Action Table */}
                                {pricingData?.actions && (
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06]">
                                        <div className="flex items-center justify-between p-4 border-b border-white/[0.04]">
                                            <h4 className="text-sm font-black text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-lg">table_chart</span>
                                                Per-Action Cost vs Revenue
                                            </h4>
                                            <select value={pricingStudioFilter} onChange={e => setPricingStudioFilter(e.target.value)}
                                                className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-white cursor-pointer">
                                                <option value="all">All Studios</option>
                                                {Object.keys(pricingData.studioSummary || {}).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] text-slate-500 font-black uppercase tracking-wider border-b border-white/[0.04] bg-white/[0.02]">
                                                        <th className="px-4 py-3">Action</th>
                                                        <th className="px-4 py-3">Studio</th>
                                                        <th className="px-4 py-3 text-right">Credits</th>
                                                        <th className="px-4 py-3 text-right">API Cost</th>
                                                        <th className="px-4 py-3 text-right">Revenue</th>
                                                        <th className="px-4 py-3 text-right">Profit</th>
                                                        <th className="px-4 py-3 text-right">Margin</th>
                                                        <th className="px-4 py-3 text-center">Status</th>
                                                        <th className="px-4 py-3 text-right">30d Uses</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {pricingData.actions
                                                        .filter(a => pricingStudioFilter === 'all' || a.studio === pricingStudioFilter)
                                                        .map(a => (
                                                        <tr key={a.action} className="text-sm hover:bg-white/[0.02] transition-all">
                                                            <td className="px-4 py-2.5 font-medium text-white text-xs">{a.label}</td>
                                                            <td className="px-4 py-2.5 text-[10px] text-slate-500">{a.studio}</td>
                                                            <td className="px-4 py-2.5 text-right font-bold text-white text-xs">{a.creditCost}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-400">₹{a.apiCostINR}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-emerald-400">₹{a.revenueINR}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: a.profitINR >= 0 ? '#34d399' : '#f87171' }}>₹{a.profitINR}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: a.marginPct >= 50 ? '#34d399' : a.marginPct >= 20 ? '#fbbf24' : '#f87171' }}>{a.marginPct}%</td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                                                    a.status === 'profitable' ? 'bg-emerald-500/15 text-emerald-400' :
                                                                    a.status === 'breakeven' ? 'bg-amber-500/15 text-amber-400' :
                                                                    'bg-rose-500/15 text-rose-400'}`}>
                                                                    {a.status === 'profitable' ? '🟢' : a.status === 'breakeven' ? '🟡' : '🔴'} {a.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right text-[10px] text-slate-500">{a.last30d?.count || 0}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── SECTION 2: PRICING POLICY DOCUMENT ─── */}
                        {policySection === 'policy' && policyData && (
                            <div className="space-y-6">
                                {/* Formula */}
                                <div className="glass-panel rounded-2xl p-6 border border-indigo-500/10">
                                    <h4 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-400">function</span>
                                        Pricing Formula & Guardrails
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                        <div className="bg-indigo-500/5 rounded-xl p-4 border border-indigo-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Formula</p>
                                            <p className="text-sm font-black text-indigo-400 mt-1">{policyData.formula?.text}</p>
                                        </div>
                                        <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Floor Price</p>
                                            <p className="text-sm font-black text-emerald-400 mt-1">{policyData.formula?.floorPrice}</p>
                                        </div>
                                        <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Target Margin</p>
                                            <p className="text-sm font-black text-amber-400 mt-1">{policyData.formula?.targetMargin}</p>
                                        </div>
                                        <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/10">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">Exchange Rate</p>
                                            <p className="text-sm font-black text-blue-400 mt-1">{policyData.formula?.exchangeRate}</p>
                                        </div>
                                    </div>
                                    {policyData.guardrails && (
                                        <div className="space-y-2">
                                            {policyData.guardrails.map((g, i) => (
                                                <div key={i} className="flex items-center gap-3 bg-white/[0.02] rounded-lg p-3">
                                                    <span className="material-symbols-outlined text-amber-400 text-base">shield</span>
                                                    <div className="flex-1">
                                                        <span className="text-xs font-bold text-white">{g.rule}: </span>
                                                        <span className="text-xs text-amber-400 font-bold">{g.value}</span>
                                                        <span className="text-xs text-slate-500"> — {g.reason}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Credit Costs by Studio */}
                                {policyData.creditCostsByStudio && (
                                    <div className="glass-panel rounded-2xl p-6">
                                        <h4 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400">token</span>
                                            Credit Costs by Studio
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {Object.entries(policyData.creditCostsByStudio).map(([studio, actions]) => (
                                                <div key={studio} className="bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
                                                    <h5 className="text-xs font-black text-primary uppercase mb-3">{studio}</h5>
                                                    <div className="space-y-1.5">
                                                        {actions.map(a => (
                                                            <div key={a.action} className="flex items-center justify-between">
                                                                <span className="text-xs text-slate-400">{a.label}</span>
                                                                <span className="text-xs font-bold text-white bg-white/[0.05] px-2 py-0.5 rounded">
                                                                    {typeof a.credits === 'string' ? a.credits : `${a.credits} cr`}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Video Model Matrix */}
                                {policyData.videoMatrix?.length > 0 && (
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06]">
                                        <div className="p-4 border-b border-white/[0.04]">
                                            <h4 className="text-sm font-black text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-rose-400">videocam</span>
                                                Video Model Cost Matrix
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] text-slate-500 font-black uppercase tracking-wider border-b border-white/[0.04] bg-white/[0.02]">
                                                        <th className="px-4 py-3">Model</th>
                                                        <th className="px-4 py-3 text-right">Fast $/sec</th>
                                                        <th className="px-4 py-3 text-right">Quality $/sec</th>
                                                        <th className="px-4 py-3 text-right">5s Fast 1080p</th>
                                                        <th className="px-4 py-3 text-right">10s Fast 1080p</th>
                                                        <th className="px-4 py-3 text-right">15s Fast 1080p</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {policyData.videoMatrix.map(v => (
                                                        <tr key={v.model} className="text-sm hover:bg-white/[0.02] transition-all">
                                                            <td className="px-4 py-2.5 font-bold text-white text-xs">{v.name}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-400">${v.fastPerSec}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-400">${v.qualityPerSec}</td>
                                                            {v.examples.map(ex => (
                                                                <td key={ex.duration} className="px-4 py-2.5 text-right text-xs">
                                                                    <span className="text-white font-bold">{ex.fast1080?.credits || '—'} cr</span>
                                                                    <span className="text-[9px] text-slate-600 ml-1">(${ex.fast1080?.usd || '—'})</span>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Top-Up Packs */}
                                {policyData.creditPacks?.length > 0 && (
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.06]">
                                        <div className="p-4 border-b border-white/[0.04]">
                                            <h4 className="text-sm font-black text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-amber-400">shopping_cart</span>
                                                Credit Top-Up Packs ({policyData.creditPacks.length} tiers)
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="text-[10px] text-slate-500 font-black uppercase tracking-wider border-b border-white/[0.04] bg-white/[0.02]">
                                                        <th className="px-4 py-3">Pack</th>
                                                        <th className="px-4 py-3 text-right">Credits</th>
                                                        <th className="px-4 py-3 text-right">Bonus</th>
                                                        <th className="px-4 py-3 text-right">Total</th>
                                                        <th className="px-4 py-3 text-right">Price</th>
                                                        <th className="px-4 py-3 text-right">₹/Credit</th>
                                                        <th className="px-4 py-3 text-right">Validity</th>
                                                        <th className="px-4 py-3">Badge</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {policyData.creditPacks.map(p => (
                                                        <tr key={p.slug} className="text-sm hover:bg-white/[0.02] transition-all">
                                                            <td className="px-4 py-2.5 font-bold text-white text-xs">{p.name}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-white">{p.credits?.toLocaleString()}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-amber-400 font-bold">{p.bonus > 0 ? `+${p.bonus?.toLocaleString()}` : '—'}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-emerald-400 font-bold">{p.total?.toLocaleString()}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-white font-bold">₹{p.price?.toLocaleString()}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-400">₹{p.perCredit}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-slate-500">{p.validity}d</td>
                                                            <td className="px-4 py-2.5 text-xs">{p.badge ? <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[9px] font-bold">{p.badge}</span> : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── SECTION 3: LLM PRICE MONITOR ─── */}
                        {policySection === 'monitor' && (
                            <div className="space-y-6">
                                {/* Controls */}
                                <div className="flex items-center gap-3">
                                    <button onClick={handlePricingCheck} disabled={monitorChecking}
                                        className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-2">
                                        {monitorChecking ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">radar</span>}
                                        {monitorChecking ? 'Checking...' : 'Check Now'}
                                    </button>
                                    {monitorData?.lastCheck && (
                                        <span className="text-xs text-slate-500">
                                            Last checked: {new Date(monitorData.lastCheck).toLocaleString('en-IN')}
                                        </span>
                                    )}
                                    {monitorData?.alertCount > 0 && (
                                        <button onClick={handleDismissAlerts} className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[10px] font-bold border border-rose-500/20 hover:bg-rose-500/20 transition-all cursor-pointer">
                                            Dismiss {monitorData.alertCount} alerts
                                        </button>
                                    )}
                                </div>

                                {/* Alerts */}
                                {monitorData?.alerts?.length > 0 && (
                                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5">
                                        <h4 className="text-sm font-black text-rose-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-rose-400">emergency</span>
                                            Price Change Alerts ({monitorData.alerts.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {monitorData.alerts.slice(0, 10).map((a, i) => (
                                                <div key={i} className="flex items-center gap-3 bg-rose-500/5 rounded-lg p-3">
                                                    <span className={`material-symbols-outlined text-base ${a.type === 'price_increase' ? 'text-rose-400' : a.type === 'price_decrease' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                        {a.type === 'price_increase' ? 'trending_up' : a.type === 'price_decrease' ? 'trending_down' : 'new_releases'}
                                                    </span>
                                                    <div className="flex-1">
                                                        <span className="text-xs font-bold text-white">{a.model}: </span>
                                                        <span className="text-xs text-slate-400">{a.details}</span>
                                                    </div>
                                                    <span className="text-[9px] text-slate-600">{a.detectedAt ? new Date(a.detectedAt).toLocaleDateString('en-IN') : ''}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Provider Grid */}
                                {monitorData?.providers && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {Object.entries(monitorData.providers).map(([providerId, provider]) => (
                                            <div key={providerId} className="glass-panel rounded-2xl p-5 border border-white/[0.06]">
                                                <div className="flex items-center gap-2 mb-4">
                                                    <span className="text-xl">{provider.icon}</span>
                                                    <h5 className="text-sm font-black text-white">{provider.provider}</h5>
                                                </div>
                                                <div className="space-y-3">
                                                    {Object.entries(provider.models).map(([modelId, model]) => (
                                                        <div key={modelId} className="bg-white/[0.02] rounded-lg p-3">
                                                            <p className="text-xs font-bold text-white mb-1">{model.name}</p>
                                                            <div className="flex flex-wrap gap-2 text-[10px]">
                                                                {model.inputPer1M !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">In: ${model.inputPer1M}/1M</span>
                                                                )}
                                                                {model.outputPer1M !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-400">Out: ${model.outputPer1M}/1M</span>
                                                                )}
                                                                {model.flatCostUSD !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">${model.flatCostUSD}/image</span>
                                                                )}
                                                                {model.costPerSecFast !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">Fast: ${model.costPerSecFast}/s</span>
                                                                )}
                                                                {model.costPerSecQuality !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400">Qual: ${model.costPerSecQuality}/s</span>
                                                                )}
                                                                {model.costPerMinute !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">${model.costPerMinute}/min</span>
                                                                )}
                                                                {model.costPerSecond !== undefined && (
                                                                    <span className="px-2 py-0.5 rounded bg-pink-500/10 text-pink-400">${model.costPerSecond}/sec</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-slate-600 mt-1.5">
                                                                <a href={model.pricingUrl} target="_blank" rel="noopener" className="hover:text-amber-400 transition-colors">View pricing →</a>
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ CREDIT STORE MANAGEMENT ════════════ */}
                {tab === 'creditPacks' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-400">shopping_cart</span>
                                    Credit Store Management
                                </h3>
                                <p className="text-sm text-slate-500 mt-1">Manage additional credit packs users can purchase</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSeedPacks} className="px-3 py-2 rounded-lg bg-white/[0.04] text-slate-400 text-xs font-bold hover:bg-white/[0.08] transition-all cursor-pointer border border-white/[0.06]">
                                    <span className="material-symbols-outlined text-sm mr-1 align-middle">database</span>Seed Defaults
                                </button>
                                <button onClick={() => { setEditingPack(null); setPackForm({ name: '', slug: '', credits: 100, bonusCredits: 0, price: 499, validityDays: 180, icon: 'bolt', badge: '', description: '', isPromo: false, promoDiscount: 0, promoOriginalPrice: 0, promoLabel: '', displayOrder: 0, isActive: true, isFirstPurchaseEligible: true }); setShowPackForm(true) }}
                                    className="px-4 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 cursor-pointer">
                                    + New Pack
                                </button>
                            </div>
                        </div>

                        {/* Pack Grid */}
                        {creditPacksList.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                            {creditPacksList.map(p => (
                                <div key={p._id} className={`glass-panel rounded-2xl overflow-hidden border transition-all ${p.isActive ? 'border-white/[0.06]' : 'border-rose-500/20 opacity-60'}`}>
                                    {/* Pack Header */}
                                    <div className="p-4 border-b border-white/[0.04]" style={{ background: `linear-gradient(135deg, ${p.color || '#f59e0b'}15, transparent)` }}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-xl" style={{ color: p.color || '#f59e0b' }}>{p.icon || 'bolt'}</span>
                                                <h4 className="text-sm font-black text-white">{p.name}</h4>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {p.badge && <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${p.badgeColor || '#f59e0b'}20`, color: p.badgeColor || '#f59e0b' }}>{p.badge}</span>}
                                                {p.isPromo && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-bold">PROMO</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-white">₹{p.price?.toLocaleString()}</span>
                                            {p.isPromo && p.promoOriginalPrice > 0 && <span className="text-sm text-slate-500 line-through">₹{p.promoOriginalPrice}</span>}
                                        </div>
                                    </div>
                                    {/* Pack Details */}
                                    <div className="p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold">Credits</span>
                                            <span className="text-sm font-bold text-white">{p.credits?.toLocaleString()}{p.bonusCredits > 0 && <span className="text-amber-400"> +{p.bonusCredits}</span>}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold">₹/Credit</span>
                                            <span className="text-xs text-slate-400">₹{(p.price / ((p.credits || 1) + (p.bonusCredits || 0))).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold">Validity</span>
                                            <span className="text-xs text-slate-400">{p.validityDays || 180} days</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold">Sales</span>
                                            <span className="text-xs text-emerald-400 font-bold">{p.purchaseCount || 0} sold · ₹{(p.totalRevenue || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    {/* Pack Actions */}
                                    <div className="p-3 border-t border-white/[0.04] flex gap-2">
                                        <button onClick={() => handleEditPack(p)} className="flex-1 py-1.5 rounded-lg bg-white/[0.04] text-xs text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer">Edit</button>
                                        <button onClick={() => handleTogglePack(p._id)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${p.isActive ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'}`}>
                                            {p.isActive ? 'Active' : 'Inactive'}
                                        </button>
                                        <button onClick={() => handleDeletePack(p._id, p.name)} className="py-1.5 px-3 rounded-lg bg-rose-500/10 text-rose-400 text-xs hover:bg-rose-500/20 transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        )}

                        {creditPacksList.length === 0 && (
                            <div className="text-center py-16 glass-panel rounded-2xl">
                                <span className="material-symbols-outlined text-5xl text-slate-600 mb-3 block">shopping_cart</span>
                                <p className="text-slate-400 text-sm font-bold mb-1">No credit packs yet</p>
                                <p className="text-slate-600 text-xs mb-4">Create packs or seed defaults to get started</p>
                                <button onClick={handleSeedPacks} className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 cursor-pointer">
                                    Seed Default Packs
                                </button>
                            </div>
                        )}

                        {/* Create/Edit Pack Modal */}
                        {showPackForm && (
                            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowPackForm(false)}>
                                <div className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" style={{ scrollbarWidth: 'thin' }}>
                                    <div className="p-5 border-b border-white/[0.06] flex items-center justify-between sticky top-0 bg-slate-900 z-10">
                                        <h4 className="text-sm font-black text-white uppercase tracking-wider">{editingPack ? 'Edit Pack' : 'New Credit Pack'}</h4>
                                        <button onClick={() => setShowPackForm(false)} className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-500 cursor-pointer"><span className="material-symbols-outlined">close</span></button>
                                    </div>
                                    <form onSubmit={handleSavePack} className="p-5 space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Name *</label>
                                                <input value={packForm.name} onChange={e => setPackForm(f => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-amber-500/30" placeholder="⚡ Spark" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Slug *</label>
                                                <input value={packForm.slug} onChange={e => setPackForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} required className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-amber-500/30" placeholder="spark" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Credits *</label>
                                                <input type="number" value={packForm.credits} onChange={e => setPackForm(f => ({ ...f, credits: parseInt(e.target.value) || 0 }))} required className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Bonus</label>
                                                <input type="number" value={packForm.bonusCredits} onChange={e => setPackForm(f => ({ ...f, bonusCredits: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Price (₹) *</label>
                                                <input type="number" value={packForm.price} onChange={e => setPackForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} required className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Validity (days)</label>
                                                <input type="number" value={packForm.validityDays} onChange={e => setPackForm(f => ({ ...f, validityDays: parseInt(e.target.value) || 180 }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Icon</label>
                                                <input value={packForm.icon} onChange={e => setPackForm(f => ({ ...f, icon: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" placeholder="bolt" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Display Order</label>
                                                <input type="number" value={packForm.displayOrder} onChange={e => setPackForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Badge</label>
                                                <input value={packForm.badge} onChange={e => setPackForm(f => ({ ...f, badge: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" placeholder="Best Value, Popular..." />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Description</label>
                                                <input value={packForm.description} onChange={e => setPackForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" placeholder="Great for casual creators" />
                                            </div>
                                        </div>
                                        {/* Promo Section */}
                                        <div className="border border-white/[0.06] rounded-xl p-4">
                                            <label className="flex items-center gap-2 cursor-pointer mb-3">
                                                <input type="checkbox" checked={packForm.isPromo} onChange={e => setPackForm(f => ({ ...f, isPromo: e.target.checked }))} className="accent-amber-500" />
                                                <span className="text-xs font-bold text-white">Enable Promo Mode</span>
                                            </label>
                                            {packForm.isPromo && (
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Discount %</label>
                                                        <input type="number" value={packForm.promoDiscount} onChange={e => setPackForm(f => ({ ...f, promoDiscount: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Original ₹</label>
                                                        <input type="number" value={packForm.promoOriginalPrice} onChange={e => setPackForm(f => ({ ...f, promoOriginalPrice: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Promo Label</label>
                                                        <input value={packForm.promoLabel} onChange={e => setPackForm(f => ({ ...f, promoLabel: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none" placeholder="33% off!" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* Toggles */}
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={packForm.isActive} onChange={e => setPackForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-emerald-500" />
                                                <span className="text-xs text-slate-400">Active</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={packForm.isFirstPurchaseEligible} onChange={e => setPackForm(f => ({ ...f, isFirstPurchaseEligible: e.target.checked }))} className="accent-amber-500" />
                                                <span className="text-xs text-slate-400">2× First Purchase</span>
                                            </label>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button type="button" onClick={() => setShowPackForm(false)} className="flex-1 py-3 bg-white/[0.04] text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-white/[0.08] transition-all border border-white/[0.06] cursor-pointer">Cancel</button>
                                            <button type="submit" className="flex-1 py-3 bg-amber-500 text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20 cursor-pointer">{editingPack ? 'Update Pack' : 'Create Pack'}</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>{/* end flex-1 content */}
            </div>{/* end flex min-h-screen */}
        </DashboardLayout>
    )
}

const CREDIT_COSTS = { content: 2, creative: 5, brainstorm: 3, seo: 3, photoshoot: 10, trendMatch: 1 }

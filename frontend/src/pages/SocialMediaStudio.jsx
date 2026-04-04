import { useState, useEffect, useCallback, useMemo } from 'react'
import SEOHead from '../components/SEOHead'
import DashboardLayout from '../components/DashboardLayout'
import GlobalLoader from '../components/GlobalLoader'
import { useBrand } from '../context/BrandContext'
import { socialMediaStudio as api, social, content as contentAPI } from '../services/api'
import { CreditBadge } from '../components/CreditBadge'
import PublishModal from '../components/PublishModal'
import { getEventsForMonth, getUpcomingEvents, EVENT_COLORS, COUNTRIES } from '../data/calendarData'

const PLATFORMS = [
    { id: 'instagram', label: 'Instagram', icon: '📸', color: '#E1306C', gradient: 'from-[#FF4D00] to-[#FF7A00]' },
    { id: 'facebook', label: 'Facebook', icon: '📘', color: '#1877F2', gradient: 'from-[#FF4D00] to-[#FF7A00]' },
    { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0A66C2', gradient: 'from-sky-500 to-[#FF7A00]' },
    { id: 'twitter', label: 'Twitter / X', icon: '🐦', color: '#1DA1F2', gradient: 'from-slate-400 to-slate-600' },
    { id: 'youtube', label: 'YouTube', icon: 'movie', color: '#FF0000', gradient: 'from-red-500 to-red-700' },
]

const TABS = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'strategy', label: 'Strategy', icon: 'psychology' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
    { id: 'publish', label: 'Publish', icon: 'schedule_send' },
    { id: 'audit', label: 'Audit', icon: 'verified' },
    { id: 'competitor', label: 'Competitors', icon: 'compare_arrows' },
    { id: 'accounts', label: 'Accounts', icon: 'link' },
]

export default function SocialMediaStudio() {
    const { activeBrand } = useBrand()
    const [tab, setTab] = useState('dashboard')
    const [loading, setLoading] = useState(false)
    const [loadingMsg, setLoadingMsg] = useState('')
    const [error, setError] = useState(null)
    const [connectedAccounts, setConnectedAccounts] = useState([])
    const [accountsLoading, setAccountsLoading] = useState(true)
    const [selectedPlatforms, setSelectedPlatforms] = useState([])
    const [timeframe, setTimeframe] = useState('monthly')
    const [goals, setGoals] = useState('')
    const [currentMetrics, setCurrentMetrics] = useState('')
    const [strategyResult, setStrategyResult] = useState(null)
    const today = new Date()
    const [currentMonth, setCurrentMonth] = useState(today.getMonth())
    const [currentYear, setCurrentYear] = useState(today.getFullYear())
    const [selectedDate, setSelectedDate] = useState(null)
    const [showPanel, setShowPanel] = useState(false)
    const [calendarResult, setCalendarResult] = useState(null)
    const brandCountry = activeBrand?.dna?.country || 'India'
    const [socialPosts, setSocialPosts] = useState([])
    const [readyContent, setReadyContent] = useState([])
    const [postsLoading, setPostsLoading] = useState(true)
    const [publishTab, setPublishTab] = useState('published')
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
    const [publishItem, setPublishItem] = useState(null)
    const [cancellingId, setCancellingId] = useState(null)
    const [auditPlatform, setAuditPlatform] = useState('instagram')
    const [auditResult, setAuditResult] = useState(null)
    const [profileScore, setProfileScore] = useState(null)
    const [profileScoreLoading, setProfileScoreLoading] = useState(false)
    const [expandedParam, setExpandedParam] = useState(null)
    const [auditView, setAuditView] = useState('score')
    const [competitors, setCompetitors] = useState([''])
    const [compResult, setCompResult] = useState(null)
    const [history, setHistory] = useState([])
    const [fullAnalysisRunning, setFullAnalysisRunning] = useState(false)
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

    const fetchAccounts = useCallback(async () => {
        setAccountsLoading(true)
        try {
            const data = await social.accounts()
            const raw = data?.data || data?.accounts || []
            const accts = Array.isArray(raw) ? raw : []
            setConnectedAccounts(accts)
            const detected = [...new Set(accts.map(a => a.platform).filter(Boolean))]
            if (detected.length > 0) setSelectedPlatforms(detected)
            if (detected[0]) setAuditPlatform(detected[0])
        } catch (e) {
            console.warn('Auto-sync:', e)
            setConnectedAccounts([])
        } finally {
            setAccountsLoading(false)
        }
    }, [])

    // AGENTIC: Auto-sync connected accounts
    useEffect(() => {
        fetchAccounts()
    }, [fetchAccounts])

    // Listen for OAuth success message from popup and broadcasts
    useEffect(() => {
        const syncChannel = new BroadcastChannel('mantram_sync')
        const handleMessage = (event) => {
            if (event.data?.type === 'SOCIAL_PLATFORM_CONNECTED' || event.data?.type === 'SOCIAL_CONNECTED') {
                fetchAccounts()
                // If this tab received a postMessage (e.g. from a popup), broadcast it to other tabs
                if (event.source) {
                    syncChannel.postMessage(event.data)
                }
            }
        }
        window.addEventListener('message', handleMessage)
        syncChannel.addEventListener('message', handleMessage)
        return () => {
            window.removeEventListener('message', handleMessage)
            syncChannel.removeEventListener('message', handleMessage)
            syncChannel.close()
        }
    }, [fetchAccounts])

    // AGENTIC: Auto-fill from Brand DNA
    useEffect(() => {
        if (activeBrand?.dna) {
            const d = activeBrand.dna
            if (!goals && d.targetAudience) setGoals('Reach ' + d.targetAudience)
            if (d.competitors?.length && competitors.length === 1 && !competitors[0])
                setCompetitors(d.competitors.map(c => c.name || c).filter(Boolean).slice(0, 5))
        }
    }, [activeBrand?._id])

    const fetchPosts = useCallback(async () => {
        setPostsLoading(true)
        try {
            const [p, c] = await Promise.all([social.publishHistory({}), contentAPI.list({ limit: 100 })])
            setSocialPosts(p.posts || [])
            setReadyContent((c.content || []).filter(x => x.status === 'approved'))
        } catch (e) { console.warn(e) }
        finally { setPostsLoading(false) }
    }, [])
    useEffect(() => { fetchPosts() }, [fetchPosts])

    const loadHistory = useCallback(async () => {
        if (!activeBrand?._id) return
        try { const d = await api.list({ brandId: activeBrand._id }); setHistory(d?.strategies || d || []) } catch (e) { setHistory([]) }
    }, [activeBrand?._id])
    useEffect(() => { loadHistory() }, [loadHistory])

    const monthEvents = useMemo(() => getEventsForMonth(brandCountry, currentMonth + 1), [brandCountry, currentMonth])
    const scheduledForMonth = useMemo(() => socialPosts.filter(p => {
        const d = new Date(p.scheduledFor || p.publishedAt || p.createdAt)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    }).map(p => {
        const d = new Date(p.scheduledFor || p.publishedAt || p.createdAt)
        const pl = PLATFORMS.find(x => x.id === p.platform) || {}
        return { ...p, _day: d.getDate(), _icon: pl.icon || 'smartphone', _label: pl.label || p.platform }
    }), [socialPosts, currentMonth, currentYear])

    const calendarDays = useMemo(() => {
        const f = new Date(currentYear, currentMonth, 1).getDay()
        const dim = new Date(currentYear, currentMonth + 1, 0).getDate()
        const days = []
        for (let i = f - 1; i >= 0; i--) days.push({ day: new Date(currentYear, currentMonth, 0).getDate() - i, other: true, events: [], posts: [] })
        for (let d = 1; d <= dim; d++) days.push({ day: d, other: false, isToday: d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear(), events: monthEvents.filter(e => e.day === d), posts: scheduledForMonth.filter(p => p._day === d) })
        while (days.length < 42) { const n = days.length - f - dim + 1; days.push({ day: n, other: true, events: [], posts: [] }) }
        return days
    }, [currentMonth, currentYear, monthEvents, scheduledForMonth])

    const publishedPosts = socialPosts.filter(p => p.status === 'published')
    const scheduledPosts = socialPosts.filter(p => p.status === 'scheduled')
    const failedPosts = socialPosts.filter(p => p.status === 'failed')
    const togglePlatform = (id) => setSelectedPlatforms(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
    const formatTimeAgo = (d) => { const s = Math.floor((Date.now() - new Date(d)) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.floor(s/60) + 'm ago' : s < 86400 ? Math.floor(s/3600) + 'h ago' : Math.floor(s/86400) + 'd ago' }

    // === GENERATORS ===
    const generateStrategy = async () => {
        if (!selectedPlatforms.length) return setError({ message: 'Select at least one platform' })
        setLoading(true); setError(null); setLoadingMsg('Building your social media strategy...')
        try {
            const d = await api.generateStrategy({ platforms: selectedPlatforms, timeframe, goals, currentMetrics, brand: activeBrand, brandId: activeBrand?._id, industry: activeBrand?.dna?.industry })
            if (d.success) { setStrategyResult(d.strategy); loadHistory() } else setError({
                message: d.error || 'Failed',
                isProviderError: d.isProviderError,
                provider: d.provider
            })
        } catch (e) {
            if (e.name === 'AbortError') return
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally { setLoading(false); setLoadingMsg('') }
    }
    const generateCalendar = async () => {
        if (!selectedPlatforms.length) return setError({ message: 'Select at least one platform' })
        setLoading(true); setError(null); setLoadingMsg('Creating your content calendar...')
        try {
            const d = await api.generateCalendar({ platforms: selectedPlatforms, month: currentMonth + 1, year: currentYear, brand: activeBrand, brandId: activeBrand?._id })
            if (d.success) { setCalendarResult(d.calendar); loadHistory() } else setError({
                message: d.error || 'Failed',
                isProviderError: d.isProviderError,
                provider: d.provider
            })
        } catch (e) {
            if (e.name === 'AbortError') return
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally { setLoading(false); setLoadingMsg('') }
    }
    const runAudit = async () => {
        setLoading(true); setError(null); setLoadingMsg('AI is auditing your account...')
        try {
            const acct = Array.isArray(connectedAccounts) ? connectedAccounts.find(a => a.platform === auditPlatform) : null
            const metrics = acct ? { followers: acct.followers || '', engagementRate: acct.engagementRate || '', postsPerWeek: '', avgLikes: '', avgComments: '' } : {}
            const d = await api.accountAudit({ platform: auditPlatform, metrics, brand: activeBrand, brandId: activeBrand?._id })
            if (d.success) { setAuditResult(d.audit); loadHistory() } else setError({
                message: d.error || 'Failed',
                isProviderError: d.isProviderError,
                provider: d.provider
            })
        } catch (e) {
            if (e.name === 'AbortError') return
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally { setLoading(false); setLoadingMsg('') }
    }
    const runProfileScore = async () => {
        setProfileScoreLoading(true); setError(null); setLoadingMsg('Scoring your ' + auditPlatform + ' profile...')
        try {
            const d = await api.profileScore({ platform: auditPlatform, brand: activeBrand, brandId: activeBrand?._id })
            if (d.success) { setProfileScore(d.scoreCard); loadHistory() } else setError({
                message: d.error || 'Failed',
                isProviderError: d.isProviderError,
                provider: d.provider
            })
        } catch (e) {
            if (e.name === 'AbortError') return
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally { setProfileScoreLoading(false); setLoadingMsg('') }
    }
    const runCompetitorAnalysis = async () => {
        const valid = competitors.filter(c => c.trim())
        if (!valid.length) return setError({ message: 'Add at least one competitor' })
        setLoading(true); setError(null); setLoadingMsg('Analyzing competitors...')
        try {
            const d = await api.competitorAnalysis({ competitors: valid.map(c => ({ name: c })), platforms: selectedPlatforms.length ? selectedPlatforms : ['instagram','linkedin'], brand: activeBrand, brandId: activeBrand?._id })
            if (d.success) { setCompResult(d.analysis); loadHistory() } else setError({
                message: d.error || 'Failed',
                isProviderError: d.isProviderError,
                provider: d.provider
            })
        } catch (e) {
            if (e.name === 'AbortError') return
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        } finally { setLoading(false); setLoadingMsg('') }
    }

    // AGENTIC: One-click Full Analysis
    const runFullAnalysis = async () => {
        setFullAnalysisRunning(true); setLoading(true); setLoadingMsg('Running Full Analysis — Strategy + Audit + Competitor...')
        setError(null)
        try {
            const plats = selectedPlatforms.length ? selectedPlatforms : ['instagram','linkedin']
            const validComps = competitors.filter(c => c.trim())
            const [strat, aud, comp] = await Promise.allSettled([
                api.generateStrategy({ platforms: plats, timeframe: 'monthly', goals, currentMetrics, brand: activeBrand, brandId: activeBrand?._id, industry: activeBrand?.dna?.industry }),
                api.accountAudit({ platform: plats[0] || 'instagram', metrics: {}, brand: activeBrand, brandId: activeBrand?._id }),
                validComps.length ? api.competitorAnalysis({ competitors: validComps.map(c => ({ name: c })), platforms: plats, brand: activeBrand, brandId: activeBrand?._id }) : Promise.resolve(null),
            ])
            if (strat.status === 'fulfilled' && strat.value?.success) setStrategyResult(strat.value.strategy)
            if (aud.status === 'fulfilled' && aud.value?.success) setAuditResult(aud.value.audit)
            if (comp.status === 'fulfilled' && comp.value?.success) setCompResult(comp.value.analysis)
            loadHistory()
        } catch (e) {
            if (e.name === 'AbortError') return
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        }
        finally { setLoading(false); setLoadingMsg(''); setFullAnalysisRunning(false) }
    }

    const handleCancel = async (id) => {
        setCancellingId(id)
        try { await social.cancelScheduled(id); setSocialPosts(p => p.map(x => x._id === id ? { ...x, status: 'cancelled' } : x)) }
        catch (e) { alert(e.message || 'Failed') }
        finally { setCancellingId(null) }
    }

    const handleConnect = async (platform) => {
        try {
            const d = await social.connect(platform)
            if (d.authUrl) {
                const width = 600, height = 700
                const left = window.screenX + (window.outerWidth - width) / 2
                const top = window.screenY + (window.outerHeight - height) / 2
                window.open(d.authUrl, `Connect ${platform}`, `width=${width},height=${height},left=${left},top=${top}`)
            }
        } catch (e) {
            setError({
                message: e.message,
                isProviderError: e.isProviderError,
                provider: e.provider
            })
        }
    }

    const PlatformSelector = ({ auto }) => (
        <div className="space-y-2">
            {auto && Array.isArray(connectedAccounts) && connectedAccounts.length > 0 && <p className="text-[11px] text-emerald-400 flex items-center gap-1"><span className="material-symbols-outlined text-xs">auto_awesome</span> Auto-detected from your connected accounts</p>}
            <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => (
                    <button key={p.id} onClick={() => togglePlatform(p.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer border ${selectedPlatforms.includes(p.id) ? 'bg-white/[0.08] border-white/20 text-white shadow-lg' : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.04]'}`}
                        style={selectedPlatforms.includes(p.id) ? { borderColor: p.color + '60', boxShadow: `0 0 20px ${p.color}15` } : {}}>
                        <span className="text-lg">{p.icon}</span> {p.label}
                        {Array.isArray(connectedAccounts) && connectedAccounts.some(a => a.platform === p.id) && <span className="w-2 h-2 rounded-full bg-emerald-400" title="Connected" />}
                    </button>
                ))}
            </div>
        </div>
    )
    return (
        <DashboardLayout title="Social Media Studio" subtitle="AI-powered social strategy, calendar & publishing — all in one">
            <SEOHead title="Social Media Studio — Mantram AI" noIndex={true} />
            <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}.shimmer-loading{background:linear-gradient(90deg,rgba(255,255,255,0.02) 25%,rgba(255,255,255,0.06) 50%,rgba(255,255,255,0.02) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite}@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>

            {/* TAB BAR */}
            <div className="flex gap-1 p-1.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-6 overflow-x-auto">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => { setTab(t.id); setError(null) }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${tab === t.id ? 'bg-gradient-to-r from-primary/15 to-[#FF7A00]/15 text-white border border-primary/30' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'}`}>
                        <span className="material-symbols-outlined text-base">{t.icon}</span>
                        <span className="hidden md:inline">{t.label}</span>
                        {t.id === 'accounts' && connectedAccounts.length > 0 && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                    </button>
                ))}
            </div>

            {error && (
                <div className={`mb-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} text-sm flex items-center gap-2`}>
                    <span className="material-symbols-outlined text-base">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100 cursor-pointer">
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            )}

            {loading && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"><div className="max-w-md w-full mx-4"><GlobalLoader isActive={true} title={loadingMsg || 'AI is thinking...'} icon="psychology" estimatedDuration={fullAnalysisRunning ? 90 : 45} stages={fullAnalysisRunning ? ['Strategy', 'Account Audit', 'Competitor Intel'] : ['Analyzing Data', 'Building Report']} currentStage={fullAnalysisRunning ? 'Strategy' : 'Analyzing Data'} /></div></div>}

            {/* ═══════ DASHBOARD ═══════ */}
            {tab === 'dashboard' && (
                <div className="space-y-6">
                    {/* Connected Accounts Banner */}
                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06] bg-gradient-to-br from-primary/5 via-violet-500/5 to-[#FF7A00]/5">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            <div>
                                <h2 className="text-2xl font-extrabold text-white mb-2">Social Media Command Center</h2>
                                <p className="text-slate-400 max-w-xl">AI-powered strategy, calendar, publishing, auditing & competitor intelligence — auto-synced with your connected accounts.</p>
                                {connectedAccounts.length > 0 && (
                                    <div className="flex items-center gap-2 mt-3">
                                        <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
                                        <span className="text-sm text-emerald-400 font-medium">{connectedAccounts.length} account{connectedAccounts.length > 1 ? 's' : ''} connected</span>
                                        <div className="flex -space-x-1 ml-2">{connectedAccounts.slice(0, 4).map((a, i) => { const p = PLATFORMS.find(x => x.id === a.platform); return <span key={i} className="text-base" title={p?.label}>{p?.icon || 'smartphone'}</span> })}</div>
                                    </div>
                                )}
                                {connectedAccounts.length === 0 && !accountsLoading && (
                                    <button onClick={() => setTab('accounts')} className="mt-3 flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 cursor-pointer"><span className="material-symbols-outlined text-sm">warning</span>No accounts connected — click to connect</button>
                                )}
                            </div>
                            <div className="flex flex-col gap-3">
                                {/* AGENTIC: Full Analysis Button */}
                                <button onClick={runFullAnalysis} disabled={loading}
                                    className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-primary via-violet-500 to-[#FF7A00] text-white font-bold text-sm hover:opacity-90 transition-all cursor-pointer shadow-xl shadow-primary/25 disabled:opacity-40">
                                    <span className="material-symbols-outlined text-xl">rocket_launch</span>
                                    <div className="text-left"><p className="font-extrabold">Full Analysis</p><p className="text-[10px] text-white/70 font-normal">Strategy + Audit + Competitor — One Click</p></div>
                                </button>
                                <div className="flex gap-2">
                                    <button onClick={() => setTab('strategy')} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-xs font-medium hover:bg-white/[0.08] cursor-pointer"><span className="material-symbols-outlined text-sm">psychology</span>Strategy</button>
                                    <button onClick={() => setTab('calendar')} className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-xs font-medium hover:bg-white/[0.08] cursor-pointer"><span className="material-symbols-outlined text-sm">calendar_month</span>Calendar</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: 'Connected', value: connectedAccounts.length, icon: 'link', color: '#10b981' },
                            { label: 'Published', value: publishedPosts.length, icon: 'task_alt', color: '#06b6d4' },
                            { label: 'Scheduled', value: scheduledPosts.length, icon: 'schedule_send', color: '#8b5cf6' },
                            { label: 'Strategies', value: history.filter(h => h.type === 'strategy').length, icon: 'psychology', color: '#f59e0b' },
                            { label: 'Ready to Post', value: readyContent.length, icon: 'check_circle', color: '#3b82f6' },
                        ].map((s, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-5 hover:bg-white/[0.04] transition-all">
                                <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: s.color }}>{s.icon}</span>
                                <p className="text-2xl font-extrabold text-white">{s.value}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Results Summary if Full Analysis ran */}
                    {(strategyResult || auditResult || compResult) && (
                        <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-teal-500/5">
                            <h3 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-emerald-400">check_circle</span>Analysis Results Ready</h3>
                            <div className="flex flex-wrap gap-3">
                                {strategyResult && <button onClick={() => setTab('strategy')} className="px-4 py-2.5 rounded-xl bg-[#FF4D00]/15 border border-[#FF4D00]/20 text-[#FF7A00] text-xs font-bold cursor-pointer hover:bg-[#FF4D00]/25"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Strategy Generated — View</button>}
                                {auditResult && <button onClick={() => setTab('audit')} className="px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/20 text-amber-300 text-xs font-bold cursor-pointer hover:bg-amber-500/25"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Audit Score: {auditResult.overallScore}/100 — View</button>}
                                {compResult && <button onClick={() => setTab('competitor')} className="px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-300 text-xs font-bold cursor-pointer hover:bg-rose-500/25"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Competitor Intel — View</button>}
                            </div>
                        </div>
                    )}

                    {/* Recent Activity */}
                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-primary">history</span>Recent Activity</h3>
                        {history.length > 0 ? (
                            <div className="space-y-2">{history.slice(0, 8).map((item, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] transition-all">
                                    <span className="material-symbols-outlined text-base" style={{ color: item.type === 'strategy' ? '#8b5cf6' : item.type === 'calendar' ? '#10b981' : item.type === 'audit' ? '#f59e0b' : '#ef4444' }}>
                                        {item.type === 'strategy' ? 'psychology' : item.type === 'calendar' ? 'calendar_month' : item.type === 'audit' ? 'verified' : 'compare_arrows'}
                                    </span>
                                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{item.title}</p><p className="text-xs text-slate-500">{item.platforms?.join(', ')} · {new Date(item.createdAt).toLocaleDateString()}</p></div>
                                    <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full bg-white/[0.05] text-slate-400">{item.type}</span>
                                </div>
                            ))}</div>
                        ) : <div className="text-center py-8"><span className="material-symbols-outlined text-4xl text-slate-700 mb-2 block">share</span><p className="text-slate-500">No activity yet. Hit Full Analysis to get started!</p></div>}
                    </div>
                </div>
            )}

            {/* ═══════ STRATEGY ═══════ */}
            {tab === 'strategy' && (
                <div className="space-y-6">
                    {!strategyResult ? (
                        <div className="glass-panel rounded-2xl p-8 border border-white/[0.06]">
                            <h3 className="text-xl font-extrabold text-white mb-1">Generate Social Media Strategy</h3>
                            <p className="text-sm text-slate-400 mb-6">AI creates a comprehensive strategy using your Brand DNA + connected account data</p>
                            <div className="space-y-6">
                                <div><label className="text-sm font-bold text-slate-300 mb-3 block">Platforms</label><PlatformSelector auto /></div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="text-sm font-bold text-slate-300 mb-2 block">Timeframe</label>
                                        <select value={timeframe} onChange={e => setTimeframe(e.target.value)} className="w-full input-glass py-3 px-4 rounded-xl bg-white/[0.04] text-white cursor-pointer"><option value="monthly">1 Month</option><option value="quarterly">3 Months</option></select></div>
                                    <div><label className="text-sm font-bold text-slate-300 mb-2 block">Goals {activeBrand?.dna?.targetAudience && <span className="text-emerald-400 text-[10px] ml-1"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">auto_awesome</span> auto-filled</span>}</label>
                                        <input value={goals} onChange={e => setGoals(e.target.value)} placeholder="e.g., 10K followers, 5% engagement" className="w-full input-glass py-3 px-4 rounded-xl bg-white/[0.04] text-white placeholder:text-slate-600" /></div>
                                </div>
                                <div><label className="text-sm font-bold text-slate-300 mb-2 block">Current Metrics (optional)</label>
                                    <textarea value={currentMetrics} onChange={e => setCurrentMetrics(e.target.value)} rows={2} placeholder="e.g., 2K Instagram, 500 LinkedIn, 3x/week" className="w-full input-glass py-3 px-4 rounded-xl bg-white/[0.04] text-white placeholder:text-slate-600 resize-none" /></div>
                                <button onClick={generateStrategy} disabled={loading || !selectedPlatforms.length} className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary to-[#FF7A00] text-white font-bold text-sm hover:opacity-90 transition-all cursor-pointer disabled:opacity-40 shadow-lg shadow-primary/25">
                                    <span className="material-symbols-outlined text-base">auto_awesome</span>Generate Strategy <CreditBadge action="socialMedia" /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between"><h3 className="text-xl font-extrabold text-white">Your Strategy</h3>
                                <button onClick={() => setStrategyResult(null)} className="text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-base">arrow_back</span>New</button></div>
                            <div className="glass-panel rounded-2xl p-6 border border-primary/20 bg-gradient-to-br from-primary/5 to-[#FF7A00]/5"><p className="text-slate-300 leading-relaxed">{strategyResult.overview}</p></div>

                            {/* ── Data Insights (NEW) ── */}
                            {strategyResult.dataInsights?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-amber-400">insights</span>Data Insights</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{strategyResult.dataInsights.map((d, i) => <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-amber-500/10">
                                    <div className="flex items-start gap-3"><span className="text-2xl">{d.icon || 'bar_chart'}</span><div className="flex-1"><p className="text-sm font-semibold text-white mb-1">{d.insight}</p><p className="text-xs text-slate-400 mb-2">{d.recommendation}</p>{d.impact && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">⚡ {d.impact}</span>}</div></div>
                                </div>)}</div></div>}

                            {strategyResult.contentPillars?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-primary">category</span>Content Pillars</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{strategyResult.contentPillars.map((p, i) => <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]"><div className="flex items-center gap-2 mb-2"><span className="text-2xl">{p.icon || '📌'}</span><div><p className="text-sm font-bold text-white">{p.name}</p><p className="text-xs text-primary font-bold">{p.percentage}%</p></div></div><p className="text-xs text-slate-400 leading-relaxed">{p.description}</p>{p.examples?.map((ex,j) => <p key={j} className="text-[11px] text-slate-500 mt-1">• {ex}</p>)}</div>)}</div></div>}

                            {/* ── Calendar Hooks (NEW) ── */}
                            {strategyResult.calendarHooks?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 to-[#FF7A00]/5"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-cyan-400">calendar_month</span>Calendar Hooks — Moments to Leverage</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{strategyResult.calendarHooks.map((ch, i) => <div key={i} className="p-4 rounded-xl bg-white/[0.03] border border-cyan-500/10">
                                    <div className="flex items-center justify-between mb-2"><span className="text-xs font-mono text-cyan-400">{ch.date}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${ch.priority === 'high' ? 'bg-red-500/15 text-red-400' : ch.priority === 'medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'}`}>{ch.priority || 'medium'}</span></div>
                                    <p className="text-sm font-bold text-white mb-1">{ch.event}</p>
                                    <p className="text-xs text-slate-400 mb-2">{ch.contentIdea}</p>
                                    {ch.platforms?.length > 0 && <div className="flex gap-1 flex-wrap">{ch.platforms.map((cp,j) => { const plt = PLATFORMS.find(pp => pp.id === cp); return <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400">{plt?.icon || 'smartphone'} {cp}</span> })}</div>}
                                </div>)}</div></div>}

                            {strategyResult.platformStrategies?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-primary">devices</span>Platform Strategies</h4>
                                <div className="space-y-4">{strategyResult.platformStrategies.map((ps, i) => { const pl = PLATFORMS.find(p => p.id === ps.platform) || { icon:'smartphone',label:ps.platform }; return <div key={i} className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]"><div className="flex items-center gap-3 mb-3"><span className="text-2xl">{pl.icon}</span><div><h5 className="font-bold text-white">{pl.label}</h5><p className="text-xs text-slate-400">{ps.frequency}</p>{ps.currentCadence && <p className="text-[10px] text-amber-400/80 mt-0.5">📌 Current: {ps.currentCadence}</p>}</div></div>
                                    {ps.toneGuide && <p className="text-xs text-slate-400 mb-2 italic border-l-2 border-primary/30 pl-3">{ps.toneGuide}</p>}
                                    {ps.bestTimes?.length > 0 && <div className="flex items-center gap-2 mb-2 flex-wrap"><span className="text-[10px] text-slate-500">🕐 Best Times:</span>{ps.bestTimes.map((t,j) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{t}</span>)}</div>}
                                    {ps.bestDays?.length > 0 && <div className="flex items-center gap-2 mb-2 flex-wrap"><span className="text-[10px] text-slate-500"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">calendar_month</span> Best Days:</span>{ps.bestDays.map((d,j) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00]">{d}</span>)}</div>}
                                    {ps.formatMix && <div className="flex items-center gap-2 mb-3 flex-wrap">{Object.entries(ps.formatMix).map(([k,v],j) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00]">{k}: {v}%</span>)}</div>}
                                    {ps.growthTactics?.map((t,j) => <p key={j} className="text-xs text-slate-400">✦ {t}</p>)}
                                    {ps.doNot?.length > 0 && <div className="mt-2 pt-2 border-t border-white/[0.04]">{ps.doNot.map((d,j) => <p key={j} className="text-xs text-red-400/70">✕ {d}</p>)}</div>}
                                    {ps.hashtags && <div className="mt-3 flex flex-wrap gap-1.5">{[...(ps.hashtags.branded||[]),...(ps.hashtags.niche||[]),...(ps.hashtags.trending||[])].slice(0,15).map((h,j) => <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{h}</span>)}</div>}
                                </div> })}</div></div>}

                            {/* ── D2C Strategy (NEW — conditional) ── */}
                            {strategyResult.d2cStrategy && <div className="glass-panel rounded-2xl p-6 border border-[#FF4D00]/20 bg-gradient-to-br from-[#FF4D00]/5 to-rose-500/5"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-[#FF7A00]">storefront</span>D2C Strategy</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {strategyResult.d2cStrategy.saleCalendar?.length > 0 && <div className="p-4 rounded-xl bg-white/[0.03] border border-[#FF4D00]/10"><h5 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5"><span className="text-sm">🏷️</span>Sale Calendar</h5>
                                        {strategyResult.d2cStrategy.saleCalendar.map((s,i) => <div key={i} className="mb-2 last:mb-0"><p className="text-xs font-semibold text-white">{s.event} <span className="text-slate-500 font-normal">({s.timing})</span></p><p className="text-[11px] text-slate-400">Prep {s.prepDays || '?'} days — {s.contentPlan}</p></div>)}</div>}
                                    {strategyResult.d2cStrategy.collectionDrops?.length > 0 && <div className="p-4 rounded-xl bg-white/[0.03] border border-[#FF4D00]/10"><h5 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5"><span className="text-sm"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">auto_awesome</span></span>Collection Drops</h5>
                                        {strategyResult.d2cStrategy.collectionDrops.map((c,i) => <p key={i} className="text-xs text-slate-400 mb-1">• {c}</p>)}</div>}
                                    {strategyResult.d2cStrategy.loyaltyTactics?.length > 0 && <div className="p-4 rounded-xl bg-white/[0.03] border border-[#FF4D00]/10"><h5 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5"><span className="text-sm">💎</span>Loyalty Tactics</h5>
                                        {strategyResult.d2cStrategy.loyaltyTactics.map((l,i) => <p key={i} className="text-xs text-slate-400 mb-1">• {l}</p>)}</div>}
                                    {strategyResult.d2cStrategy.retentionContent?.length > 0 && <div className="p-4 rounded-xl bg-white/[0.03] border border-[#FF4D00]/10"><h5 className="text-sm font-bold text-white mb-3 flex items-center gap-1.5"><span className="text-sm">🔁</span>Retention Content</h5>
                                        {strategyResult.d2cStrategy.retentionContent.map((r,i) => <p key={i} className="text-xs text-slate-400 mb-1">• {r}</p>)}</div>}
                                </div></div>}

                            {strategyResult.growthProjections?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-emerald-400">trending_up</span>Growth Projections</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{strategyResult.growthProjections.map((gp, i) => <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]"><p className="text-sm font-bold text-white mb-1">{gp.metric}</p><div className="flex items-baseline gap-2"><span className="text-slate-500 text-xs">{gp.current||'—'}</span><span className="text-primary">→</span><span className="text-emerald-400 font-bold text-lg">{gp.target}</span></div><p className="text-[11px] text-slate-500">{gp.assumption}</p></div>)}</div></div>}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ CALENDAR (Merged Smart Calendar) ═══════ */}
            {tab === 'calendar' && (
                <div className="space-y-6">
                    {/* Month Nav + AI Generate */}
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-3">
                            <button onClick={() => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y-1) } else setCurrentMonth(m => m-1) }} className="p-2 rounded-xl hover:bg-white/[0.06] cursor-pointer text-slate-400 hover:text-white"><span className="material-symbols-outlined">chevron_left</span></button>
                            <h2 className="text-xl font-bold text-white min-w-[200px] text-center">{monthNames[currentMonth]} {currentYear}</h2>
                            <button onClick={() => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y+1) } else setCurrentMonth(m => m+1) }} className="p-2 rounded-xl hover:bg-white/[0.06] cursor-pointer text-slate-400 hover:text-white"><span className="material-symbols-outlined">chevron_right</span></button>
                            <button onClick={() => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()) }} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 cursor-pointer">Today</button>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={generateCalendar} disabled={loading || !selectedPlatforms.length} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs hover:opacity-90 cursor-pointer disabled:opacity-40 shadow-lg"><span className="material-symbols-outlined text-sm">auto_awesome</span>AI Generate Posts <CreditBadge action="socialMedia" /></button>
                        </div>
                    </div>

                    {/* Upcoming Marketing Events */}
                    {(() => { const upcoming = getUpcomingEvents(brandCountry, 14); return upcoming.length > 0 && (
                        <div className="glass-panel rounded-2xl p-4 border border-primary/10"><div className="flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-primary text-sm">trending_up</span><h3 className="text-sm font-bold text-white">Upcoming Opportunities</h3></div>
                        <div className="flex gap-3 overflow-x-auto pb-1">{upcoming.slice(0,6).map((e,i) => <div key={i} className="flex-shrink-0 rounded-xl p-3 min-w-[160px] bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] transition-all"><div className="flex items-center justify-between mb-1"><span className="text-lg">{e.emoji}</span><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : 'bg-primary/20 text-primary'}`}>{e.daysUntil === 0 ? 'TODAY' : e.daysUntil + 'd'}</span></div><p className="text-xs font-bold text-white truncate">{e.name}</p><p className="text-[10px] text-slate-500">{e.tone}</p></div>)}</div></div>
                    ) })()}

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-px mb-1">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center text-xs text-slate-600 font-bold py-2 uppercase tracking-wider">{d}</div>)}</div>
                    <div className="grid grid-cols-7 gap-px bg-white/[0.03] rounded-2xl overflow-hidden border border-white/[0.06]">
                        {calendarDays.map((dy, i) => (
                            <button key={i} onClick={() => { if (!dy.other) { setSelectedDate(dy.day); setShowPanel(true) } }}
                                className={`min-h-[85px] p-2 text-left transition-all cursor-pointer relative group ${dy.other ? 'bg-[#080a14]/80 text-slate-700' : 'bg-[#0c0f1a] hover:bg-white/[0.04]'} ${dy.isToday ? 'ring-2 ring-primary/50 ring-inset' : ''} ${selectedDate === dy.day && !dy.other ? 'bg-primary/10' : ''}`}>
                                <span className={`text-sm font-semibold ${dy.isToday ? 'text-primary' : dy.other ? 'text-slate-700' : 'text-slate-300'}`}>{dy.day}</span>
                                {(dy.events.length + dy.posts.length) > 0 && <div className="mt-1 space-y-0.5">
                                    {dy.events.slice(0,2).map((e,j) => { const c = EVENT_COLORS[e.type] || EVENT_COLORS.global; return <div key={j} className="flex items-center gap-1 truncate"><div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:c.dot}} /><span className="text-[10px] truncate" style={{color:c.dot}}>{e.emoji} {e.name}</span></div> })}
                                    {dy.posts.slice(0,2).map((p,j) => <div key={j} className="flex items-center gap-1 truncate"><div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[#FF4D00]" /><span className="text-[10px] text-[#FF7A00] truncate">{p._icon} {p._label}</span></div>)}
                                </div>}
                            </button>
                        ))}
                    </div>

                    {/* AI Calendar Result */}
                    {calendarResult?.weeks?.map((week, wi) => (
                        <div key={wi} className="glass-panel rounded-2xl p-5 border border-white/[0.06]"><h4 className="font-bold text-white mb-1">Week {week.weekNumber}</h4><p className="text-xs text-primary mb-4">{week.theme}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{week.posts?.map((post, pi) => { const pl = PLATFORMS.find(p => p.id === post.platform) || { icon:'smartphone' }; return (
                                <div key={pi} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all">
                                    <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><span>{pl.icon}</span><span className="text-xs text-white font-bold">{post.day}</span></div><span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400 capitalize">{post.type}</span></div>
                                    <p className="text-xs text-slate-300 leading-relaxed mb-2">{post.captionAngle}</p>
                                    <div className="flex items-center justify-between"><span className="text-[10px] text-slate-600">⏰ {post.bestTime}</span>
                                        <button onClick={() => { setPublishItem({ content: post.captionAngle, type: 'social' }); setIsPublishModalOpen(true) }} className="text-[10px] text-primary hover:underline cursor-pointer flex items-center gap-0.5"><span className="material-symbols-outlined text-[10px]">send</span>Publish</button>
                                    </div>
                                </div>
                            ) })}</div>
                        </div>
                    ))}

                    {/* Side Panel */}
                    {showPanel && selectedDate && <div className="fixed right-0 top-0 h-full w-[340px] glass-panel border-l border-white/[0.06] z-40 p-5 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-white">{monthNames[currentMonth]} {selectedDate}</h3><button onClick={() => setShowPanel(false)} className="text-slate-500 hover:text-white cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button></div>
                        {(() => { const dayPosts = scheduledForMonth.filter(p => p._day === selectedDate); const dayEvents = monthEvents.filter(e => e.day === selectedDate); return <>
                            {dayPosts.length > 0 && <div className="mb-5"><h4 className="text-xs font-bold text-[#FF7A00] uppercase mb-2">Scheduled Posts</h4>{dayPosts.map(p => <div key={p._id} className="p-3 rounded-xl bg-[#FF4D00]/[0.06] border border-[#FF4D00]/15 mb-2"><p className="text-xs text-white font-bold">{p._icon} {p._label}</p><p className="text-[11px] text-slate-400 mt-1 line-clamp-3">{p.caption}</p></div>)}</div>}
                            {dayEvents.length > 0 && <div><h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Marketing Events</h4>{dayEvents.map((e,i) => { const c = EVENT_COLORS[e.type] || EVENT_COLORS.global; return <div key={i} className="p-3 rounded-xl border mb-2" style={{background:c.bg, borderColor:c.border+'40'}}><p className="text-sm font-bold text-white">{e.emoji} {e.name}</p><p className="text-[11px] text-slate-400">Tone: {e.tone}</p></div> })}</div>}
                            {dayPosts.length === 0 && dayEvents.length === 0 && <div className="text-center py-8"><p className="text-slate-500 text-sm">No events or posts</p></div>}
                        </> })()}
                    </div>}
                </div>
            )}

            {/* ═══════ PUBLISH (Merged Publish Schedule) ═══════ */}
            {tab === 'publish' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[{ label:'Published', count:publishedPosts.length, icon:'task_alt', hex:'#10b981' },{ label:'Scheduled', count:scheduledPosts.length, icon:'schedule_send', hex:'#8b5cf6' },{ label:'Ready', count:readyContent.length, icon:'check_circle', hex:'#0ea5e9' },{ label:'Failed', count:failedPosts.length, icon:'error_outline', hex:'#f43f5e' }].map((s,i) => (
                            <div key={i} className="rounded-2xl p-5 transition-all" style={{ background: s.hex + '0f', border: `1px solid ${s.hex}1a` }}>
                                <div className="flex items-center gap-3 mb-2"><div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: s.hex + '26' }}><span className="material-symbols-outlined" style={{ color: s.hex }}>{s.icon}</span></div><span className="text-xs font-bold text-slate-500 uppercase">{s.label}</span></div>
                                <p className="text-2xl font-black text-white">{s.count}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-1.5 bg-white/[0.02] p-1.5 rounded-2xl border border-white/[0.06]">
                        {[{ id:'published', label:'Published', icon:'task_alt' },{ id:'scheduled', label:'Scheduled', icon:'schedule_send' },{ id:'ready', label:'Ready', icon:'check_circle' },{ id:'failed', label:'Failed', icon:'error_outline' }].map(t => (
                            <button key={t.id} onClick={() => setPublishTab(t.id)} className={`flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all ${publishTab === t.id ? 'bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}>
                                <span className="material-symbols-outlined text-lg">{t.icon}</span><span className="hidden sm:inline">{t.label}</span>
                            </button>
                        ))}
                    </div>

                    {postsLoading ? <div className="text-center py-16"><span className="material-symbols-outlined text-4xl animate-spin text-primary/60">progress_activity</span></div> : (
                        <div className="space-y-3">
                            {publishTab === 'published' && publishedPosts.map((post,i) => { const m = PLATFORMS.find(x => x.id === post.platform) || {}; return (
                                <div key={post._id} className="group rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] p-5 transition-all" style={{animation:`fadeUp 0.4s ease-out ${i*60}ms both`}}>
                                    <div className="flex items-start gap-4">{post.imageUrl && <img src={post.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/10" onError={e => e.target.style.display='none'} />}
                                        <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-2"><span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r ${m.gradient||'from-primary to-primary-light'} text-white`}>{m.icon} {m.label||post.platform}</span><span className="text-xs text-slate-500">{post.accountName}</span><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">✓ Live</span></div>
                                        <p className="text-[13px] text-slate-300 line-clamp-2">{post.caption?.substring(0,250)}</p><span className="text-[11px] text-slate-600 mt-2 block">{formatTimeAgo(post.publishedAt||post.createdAt)}</span></div>
                                    </div>
                                </div>
                            )})}
                            {publishTab === 'scheduled' && scheduledPosts.map((post,i) => { const m = PLATFORMS.find(x => x.id === post.platform) || {}; return (
                                <div key={post._id} className="group rounded-2xl bg-[#FF4D00]/[0.03] border border-[#FF4D00]/10 hover:border-[#FF4D00]/20 p-5 transition-all" style={{animation:`fadeUp 0.4s ease-out ${i*60}ms both`}}>
                                    <div className="flex items-start gap-4"><div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-2"><span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r ${m.gradient||'from-[#FF4D00] to-[#FF7A00]'} text-white`}>{m.icon} {m.label||post.platform}</span><span className="text-xs text-slate-500">{post.accountName}</span></div>
                                        <p className="text-[13px] text-slate-300 line-clamp-2">{post.caption?.substring(0,250)}</p><span className="text-[11px] text-[#FF4D00] mt-2 block">{new Date(post.scheduledFor).toLocaleString('en-IN',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</span></div>
                                        <button onClick={() => handleCancel(post._id)} disabled={cancellingId===post._id} className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 cursor-pointer border border-rose-500/15 disabled:opacity-30">{cancellingId===post._id ? '...' : '✕ Cancel'}</button>
                                    </div>
                                </div>
                            )})}
                            {publishTab === 'ready' && readyContent.map((item,i) => (
                                <div key={item._id} className="group rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-primary/20 p-5 transition-all" style={{animation:`fadeUp 0.4s ease-out ${i*60}ms both`}}>
                                    <div className="flex items-start justify-between gap-4"><div className="flex-1 min-w-0"><h3 className="font-bold text-white text-[15px] mb-1">{item.title || `${item.type} content`}</h3><p className="text-[13px] text-slate-400 line-clamp-2">{item.content?.substring(0,280)}</p></div>
                                        <button onClick={() => { setPublishItem(item); setIsPublishModalOpen(true) }} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-light text-white text-xs font-bold hover:shadow-lg cursor-pointer flex items-center gap-2"><span className="material-symbols-outlined text-sm">send</span>Publish</button>
                                    </div>
                                </div>
                            ))}
                            {publishTab === 'failed' && failedPosts.map((post,i) => (
                                <div key={post._id} className="rounded-2xl bg-rose-500/[0.03] border border-rose-500/10 p-5 transition-all" style={{animation:`fadeUp 0.4s ease-out ${i*60}ms both`}}>
                                    <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold text-rose-400"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">cancel</span> {PLATFORMS.find(x=>x.id===post.platform)?.label||post.platform}</span><span className="text-xs text-slate-500">{post.accountName}</span></div>
                                    <p className="text-[13px] text-slate-400 line-clamp-2">{post.caption?.substring(0,200)}</p>{post.error && <p className="text-xs text-rose-300/80 mt-2">{post.error}</p>}
                                </div>
                            ))}
                            {((publishTab==='published'&&!publishedPosts.length)||(publishTab==='scheduled'&&!scheduledPosts.length)||(publishTab==='ready'&&!readyContent.length)||(publishTab==='failed'&&!failedPosts.length)) && <div className="text-center py-16 glass-panel rounded-2xl"><span className="material-symbols-outlined text-4xl text-slate-700 mb-2 block">inbox</span><p className="text-slate-500">Nothing here yet</p></div>}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ AUDIT (Profile Score + Deep Audit) ═══════ */}
            {tab === 'audit' && (
                <div className="space-y-6">
                    {/* Audit view toggle */}
                    <div className="flex gap-2">
                        <button onClick={() => setAuditView('score')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer border ${auditView === 'score' ? 'bg-gradient-to-r from-[#FF4D00]/20 to-[#FF7A00]/20 border-[#FF4D00]/30 text-white' : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.04]'}`}>
                            <span className="flex items-center gap-2"><span className="material-symbols-outlined text-base">speed</span>Profile Score Card</span></button>
                        <button onClick={() => setAuditView('deep')} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer border ${auditView === 'deep' ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/30 text-white' : 'bg-white/[0.02] border-white/[0.06] text-slate-400 hover:bg-white/[0.04]'}`}>
                            <span className="flex items-center gap-2"><span className="material-symbols-outlined text-base">query_stats</span>Deep Account Audit</span></button>
                    </div>

                    {/* ═══ PROFILE SCORE CARD ═══ */}
                    {auditView === 'score' && (
                        !profileScore ? (
                            <div className="glass-panel rounded-2xl p-8 border border-white/[0.06] bg-gradient-to-br from-[#FF4D00]/[0.03] to-[#FF7A00]/[0.03]">
                                <div className="flex items-start gap-4 mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF4D00]/20 to-[#FF7A00]/20 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-[#FF4D00] text-2xl">speed</span></div>
                                    <div><h3 className="text-xl font-extrabold text-white mb-1">Profile Score Card</h3><p className="text-sm text-slate-400">AI grades your profile on platform-specific parameters — like LinkedIn's profile strength, but for every platform. Each parameter scored 0-10 with <span className="text-[#FF4D00] font-semibold">measurable, data-driven recommendations</span>.</p></div>
                                </div>
                                <div className="space-y-6">
                                    <div><label className="text-sm font-bold text-slate-300 mb-3 block">Select Platform to Score</label>
                                        <div className="flex flex-wrap gap-2">{PLATFORMS.map(p => (
                                            <button key={p.id} onClick={() => { setAuditPlatform(p.id); setProfileScore(null) }}
                                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer border ${auditPlatform === p.id ? 'bg-white/[0.08] border-white/20 text-white' : 'bg-white/[0.02] border-white/[0.06] text-slate-400'}`} style={auditPlatform === p.id ? { borderColor: p.color + '60' } : {}}>
                                                <span className="text-lg">{p.icon}</span>{p.label}
                                                {Array.isArray(connectedAccounts) && connectedAccounts.some(a => a.platform === p.id) && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                            </button>
                                        ))}</div>
                                    </div>
                                    <button onClick={runProfileScore} disabled={profileScoreLoading || loading} className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#FF4D00] to-[#FF7A00] text-white font-bold text-sm hover:opacity-90 cursor-pointer disabled:opacity-40 shadow-lg shadow-[#FF4D00]/20">
                                        {profileScoreLoading ? <><span className="animate-spin">⏳</span>Scoring...</> : <><span className="material-symbols-outlined text-base">speed</span>Scan Profile</>} <CreditBadge action="socialMedia" /></button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                                        <span className="text-lg">{PLATFORMS.find(p => p.id === auditPlatform)?.icon}</span>
                                        {profileScore.platformLabel || auditPlatform} Profile Score
                                    </h3>
                                    <button onClick={() => setProfileScore(null)} className="text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-base">arrow_back</span>New Scan</button>
                                </div>

                                {/* Overall Score Circle + Grade */}
                                <div className="glass-panel rounded-2xl p-8 border border-white/[0.06] bg-gradient-to-br from-[#FF4D00]/[0.04] to-[#FF7A00]/[0.04]">
                                    <div className="flex flex-col md:flex-row items-center gap-8">
                                        <div className="relative">
                                            <svg width="160" height="160" viewBox="0 0 160 160">
                                                <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
                                                <circle cx="80" cy="80" r="70" fill="none" strokeWidth="12" strokeLinecap="round"
                                                    stroke={profileScore.overallScore >= 80 ? '#10b981' : profileScore.overallScore >= 60 ? '#f59e0b' : profileScore.overallScore >= 40 ? '#f97316' : '#ef4444'}
                                                    strokeDasharray={`${(profileScore.overallScore / 100) * 440} 440`}
                                                    transform="rotate(-90 80 80)" style={{ transition: 'stroke-dasharray 1s ease' }} />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <p className="text-4xl font-black text-white">{profileScore.overallScore}</p>
                                                <p className="text-xs text-slate-400 font-bold">/100</p>
                                            </div>
                                        </div>
                                        <div className="flex-1 text-center md:text-left">
                                            <div className="flex items-center gap-3 justify-center md:justify-start mb-2">
                                                <span className="text-3xl font-black" style={{ color: profileScore.overallScore >= 80 ? '#10b981' : profileScore.overallScore >= 60 ? '#f59e0b' : '#ef4444' }}>Grade: {profileScore.grade}</span>
                                            </div>
                                            <p className="text-sm text-slate-400 max-w-lg">{profileScore.summary}</p>
                                            {/* Estimated Impact */}
                                            {profileScore.estimatedImpact && (
                                                <div className="flex flex-wrap gap-3 mt-4">
                                                    {Object.entries(profileScore.estimatedImpact).map(([k,v]) => (
                                                        <div key={k} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                                            <span className="text-[10px] text-slate-400 uppercase font-bold">{k.replace(/([A-Z])/g, ' $1')}</span>
                                                            <p className="text-sm font-bold text-emerald-400">{v}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Parameter Breakdown */}
                                <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                    <h4 className="font-bold text-white flex items-center gap-2 mb-5"><span className="material-symbols-outlined text-[#FF4D00]">tune</span>Parameter Breakdown</h4>
                                    <div className="space-y-3">
                                        {(profileScore.parameters || []).map((param, i) => {
                                            const scoreColor = param.score >= 8 ? '#10b981' : param.score >= 5 ? '#f59e0b' : '#ef4444'
                                            const statusIcon = param.score >= 8 ? 'check_circle' : param.score >= 5 ? 'warning' : 'error'
                                            const isExpanded = expandedParam === i
                                            return (
                                                <div key={i} className="rounded-xl border border-white/[0.06] overflow-hidden transition-all hover:border-white/10">
                                                    <button onClick={() => setExpandedParam(isExpanded ? null : i)} className="w-full flex items-center gap-4 p-4 cursor-pointer text-left">
                                                        <span className="material-symbols-outlined text-lg" style={{ color: scoreColor }}>{statusIcon}</span>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className="text-sm font-bold text-white">{param.name}</span>
                                                                <span className="text-lg font-black" style={{ color: scoreColor }}>{param.score}<span className="text-xs text-slate-500 font-medium">/10</span></span>
                                                            </div>
                                                            <div className="h-2 rounded-full bg-white/[0.04] overflow-hidden">
                                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(param.score / 10) * 100}%`, background: scoreColor }} />
                                                            </div>
                                                        </div>
                                                        <span className={`material-symbols-outlined text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.04] pt-3">
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                <div className="rounded-lg bg-white/[0.02] p-3">
                                                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Current State</p>
                                                                    <p className="text-xs text-white">{param.current}</p>
                                                                </div>
                                                                <div className="rounded-lg bg-white/[0.02] p-3">
                                                                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Benchmark</p>
                                                                    <p className="text-xs text-white">{param.benchmark}</p>
                                                                </div>
                                                            </div>
                                                            <div className="rounded-lg bg-[#FF4D00]/[0.06] border border-[#FF4D00]/10 p-3">
                                                                <p className="text-[10px] text-[#FF4D00] uppercase font-bold mb-1 flex items-center gap-1"><span className="material-symbols-outlined text-xs">trending_up</span>Measurable Impact</p>
                                                                <p className="text-xs text-white font-medium">{param.impact}</p>
                                                            </div>
                                                            {param.fix && (
                                                                <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/10 p-3">
                                                                    <p className="text-[10px] text-emerald-400 uppercase font-bold mb-1 flex items-center gap-1"><span className="material-symbols-outlined text-xs">auto_fix_high</span>AI-Generated Fix</p>
                                                                    <p className="text-xs text-white whitespace-pre-wrap">{param.fix}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Quick Wins */}
                                {profileScore.quickWins?.length > 0 && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06] bg-gradient-to-br from-emerald-500/[0.03] to-teal-500/[0.03]">
                                        <h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-emerald-400">bolt</span>Quick Wins — Highest Impact</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {profileScore.quickWins.map((w, i) => (
                                                <div key={i} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className="text-sm font-bold text-white">{w.parameter}</span>
                                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{w.effort}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-sm font-bold text-red-400">{w.currentScore}</span>
                                                        <span className="material-symbols-outlined text-xs text-slate-500">arrow_forward</span>
                                                        <span className="text-sm font-bold text-emerald-400">{w.potentialScore}</span>
                                                        <span className="text-[10px] text-slate-500">/10</span>
                                                    </div>
                                                    <p className="text-xs text-slate-300 mb-2">{w.action}</p>
                                                    <p className="text-[10px] text-emerald-400 font-semibold">⚡ {w.expectedLift}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Generated Assets */}
                                {profileScore.generatedAssets && Object.values(profileScore.generatedAssets).some(v => v && !v.includes('If ')) && (
                                    <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]">
                                        <h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-[#FF4D00]">auto_awesome</span>AI-Generated Profile Assets</h4>
                                        <div className="space-y-4">
                                            {Object.entries(profileScore.generatedAssets).filter(([,v]) => v && !v.includes('If ')).map(([key, val]) => (
                                                <div key={key} className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs text-slate-400 uppercase font-bold">Optimized {key}</span>
                                                        <button onClick={() => { navigator.clipboard.writeText(val) }} className="text-[10px] text-[#FF4D00] hover:text-[#FF7A00] cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-xs">content_copy</span>Copy</button>
                                                    </div>
                                                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{val}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    )}

                    {/* ═══ DEEP ACCOUNT AUDIT ═══ */}
                    {auditView === 'deep' && (
                        !auditResult ? (
                            <div className="glass-panel rounded-2xl p-8 border border-white/[0.06]">
                                <h3 className="text-xl font-extrabold text-white mb-1">Deep Account Audit</h3>
                                <p className="text-sm text-slate-400 mb-2">Full account health check — engagement, growth, content, and strategy</p>
                                {Array.isArray(connectedAccounts) && connectedAccounts.length > 0 && <p className="text-xs text-emerald-400 flex items-center gap-1 mb-6"><span className="material-symbols-outlined text-xs">auto_awesome</span>Metrics will be auto-synced from your connected accounts</p>}
                                <div className="space-y-6">
                                    <div><label className="text-sm font-bold text-slate-300 mb-3 block">Platform to Audit</label>
                                        <div className="flex flex-wrap gap-2">{PLATFORMS.map(p => (
                                            <button key={p.id} onClick={() => setAuditPlatform(p.id)}
                                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer border ${auditPlatform === p.id ? 'bg-white/[0.08] border-white/20 text-white' : 'bg-white/[0.02] border-white/[0.06] text-slate-400'}`} style={auditPlatform === p.id ? { borderColor: p.color + '60' } : {}}>
                                                <span className="text-lg">{p.icon}</span>{p.label}
                                                {Array.isArray(connectedAccounts) && connectedAccounts.some(a => a.platform === p.id) && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                            </button>
                                        ))}</div>
                                    </div>
                                    <button onClick={runAudit} disabled={loading} className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 cursor-pointer disabled:opacity-40 shadow-lg">
                                        <span className="material-symbols-outlined text-base">auto_awesome</span>Run Deep Audit <CreditBadge action="socialMedia" /></button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between"><h3 className="text-xl font-extrabold text-white">Deep Audit Results</h3><button onClick={() => setAuditResult(null)} className="text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-base">arrow_back</span>New</button></div>
                                <div className="glass-panel rounded-2xl p-8 border border-white/[0.06] text-center bg-gradient-to-br from-amber-500/5 to-orange-500/5">
                                    <div className="inline-flex items-center justify-center size-28 rounded-full border-4 mb-4" style={{borderColor: auditResult.overallScore >= 70 ? '#10b981' : auditResult.overallScore >= 40 ? '#f59e0b' : '#ef4444'}}>
                                        <div><p className="text-4xl font-extrabold text-white">{auditResult.overallScore}</p><p className="text-xs text-slate-400">/100</p></div>
                                    </div>
                                    <p className="text-2xl font-extrabold text-white mb-1">Grade: {auditResult.grade}</p><p className="text-sm text-slate-400 max-w-lg mx-auto">{auditResult.summary}</p>
                                </div>
                                {auditResult.dimensions?.length > 0 && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{auditResult.dimensions.map((d,i) => (
                                    <div key={i} className="glass-panel rounded-xl p-4 border border-white/[0.06]"><div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-white">{d.icon} {d.name}</span><span className="text-lg font-extrabold" style={{color:d.score>=70?'#10b981':d.score>=40?'#f59e0b':'#ef4444'}}>{d.score}</span></div>
                                        <div className="h-2 rounded-full bg-white/[0.04] mb-2 overflow-hidden"><div className="h-full rounded-full" style={{width:`${d.score}%`,background:d.score>=70?'#10b981':d.score>=40?'#f59e0b':'#ef4444'}} /></div>
                                        <p className="text-[10px] text-slate-500">{d.benchmark}</p><p className="text-xs text-white mt-1 font-medium">{d.verdict}</p></div>))}</div>}
                                {auditResult.actionPlan?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-emerald-400">checklist</span>Action Plan</h4>
                                    <div className="space-y-3">{auditResult.actionPlan.map((a,i) => <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02]"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-0.5 ${a.priority==='high'?'bg-rose-500/10 text-rose-400':'bg-amber-500/10 text-amber-400'}`}>{a.priority}</span><div><p className="text-sm text-white font-medium">{a.action}</p><p className="text-xs text-slate-500">{a.impact} · {a.timeline}</p></div></div>)}</div></div>}
                            </div>
                        )
                    )}
                </div>
            )}

            {/* ═══════ COMPETITOR (Auto-filled from Brand DNA) ═══════ */}
            {tab === 'competitor' && (
                <div className="space-y-6">
                    {!compResult ? (
                        <div className="glass-panel rounded-2xl p-8 border border-white/[0.06]">
                            <h3 className="text-xl font-extrabold text-white mb-1">Competitor Intelligence</h3>
                            <p className="text-sm text-slate-400 mb-6">AI analyzes competitors and finds content gaps</p>
                            <div className="space-y-6">
                                <div><label className="text-sm font-bold text-slate-300 mb-3 block">Platforms</label><PlatformSelector auto /></div>
                                <div><label className="text-sm font-bold text-slate-300 mb-3 block">Competitors {activeBrand?.dna?.competitors?.length > 0 && <span className="text-emerald-400 text-[10px] ml-1"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">auto_awesome</span> auto-filled from Brand DNA</span>}</label>
                                    {competitors.map((c,i) => <div key={i} className="flex items-center gap-2 mb-2"><input value={c} onChange={e=>{const nc=[...competitors];nc[i]=e.target.value;setCompetitors(nc)}} placeholder={`Competitor ${i+1}`} className="flex-1 input-glass py-2.5 px-3 rounded-lg bg-white/[0.04] text-white text-sm placeholder:text-slate-600" />{competitors.length > 1 && <button onClick={()=>setCompetitors(p=>p.filter((_,j)=>j!==i))} className="text-slate-500 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-base">close</span></button>}</div>)}
                                    {competitors.length < 5 && <button onClick={()=>setCompetitors(p=>[...p,''])} className="text-xs text-primary hover:underline cursor-pointer mt-1">+ Add competitor</button>}
                                </div>
                                <button onClick={runCompetitorAnalysis} disabled={loading} className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-rose-500 to-[#FF7A00] text-white font-bold text-sm hover:opacity-90 cursor-pointer disabled:opacity-40 shadow-lg">
                                    <span className="material-symbols-outlined text-base">auto_awesome</span>Analyze <CreditBadge action="socialMedia" /></button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between"><h3 className="text-xl font-extrabold text-white">Competitor Analysis</h3><button onClick={()=>setCompResult(null)} className="text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-base">arrow_back</span>New</button></div>
                            <div className="glass-panel rounded-2xl p-6 border border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-[#FF7A00]/5"><p className="text-slate-300 leading-relaxed">{compResult.overview}</p></div>
                            {compResult.competitors?.map((comp,i) => <div key={i} className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="text-lg font-bold text-white mb-2">{comp.name}</h4><p className="text-sm text-slate-400 mb-4">{comp.overallStrategy}</p>
                                {comp.vulnerabilities?.map((v,j) => <p key={j} className="text-xs text-amber-400 mb-1"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">ads_click</span> {v}</p>)}</div>)}
                            {compResult.contentGaps?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-amber-400">lightbulb</span>Content Gaps</h4>
                                {compResult.contentGaps.map((g,i) => <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-2"><p className="text-sm font-bold text-white">{g.gap}</p><p className="text-xs text-slate-400 mt-1">{g.opportunity}</p></div>)}</div>}
                            {compResult.stealablePlaybook?.length > 0 && <div className="glass-panel rounded-2xl p-6 border border-white/[0.06]"><h4 className="font-bold text-white flex items-center gap-2 mb-4"><span className="material-symbols-outlined text-[#FF4D00]">content_copy</span>Steal Their Playbook</h4>
                                {compResult.stealablePlaybook.map((p,i) => <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-2"><div className="flex items-center justify-between"><p className="text-sm font-bold text-white">{p.tactic}</p><span className={`text-[10px] px-2 py-0.5 rounded-full ${p.difficulty==='Easy'?'bg-emerald-500/10 text-emerald-400':'bg-amber-500/10 text-amber-400'}`}>{p.difficulty}</span></div><p className="text-xs text-slate-400 mt-1">{p.adaptation}</p></div>)}</div>}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════ ACCOUNTS (Inline Connect/Manage) ═══════ */}
            {tab === 'accounts' && (
                <div className="space-y-6">
                    <div className="glass-panel rounded-2xl p-8 border border-white/[0.06]">
                        <h3 className="text-xl font-extrabold text-white mb-1">Connected Social Accounts</h3>
                        <p className="text-sm text-slate-400 mb-6">Connect your accounts for auto-sync and one-click publishing</p>
                        {accountsLoading ? <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-xl shimmer-loading" />)}</div> : (
                            <div className="space-y-3">
                                {PLATFORMS.map(p => {
                                    const accts = connectedAccounts.filter(a => a.platform === p.id)
                                    return (
                                        <div key={p.id} className={`p-5 rounded-xl border transition-all ${accts.length > 0 ? 'bg-emerald-500/[0.04] border-emerald-500/15' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3"><span className="text-2xl">{p.icon}</span><div><p className="text-sm font-bold text-white">{p.label}</p>{accts.length > 0 ? <p className="text-xs text-emerald-400">{accts.length} account{accts.length > 1 ? 's' : ''} connected</p> : <p className="text-xs text-slate-500">Not connected</p>}</div></div>
                                                {accts.length > 0 ? (
                                                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" /><span className="text-xs text-emerald-400 font-bold">Active</span></div>
                                                ) : (
                                                    <button onClick={() => handleConnect(p.id)}
                                                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-[#FF7A00] text-white text-xs font-bold hover:opacity-90 cursor-pointer">Connect</button>
                                                )}
                                            </div>
                                            {accts.length > 0 && <div className="mt-3 space-y-1">{accts.map((a,i) => (
                                                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.03]"><span className="text-xs text-white">{a.accountName || a.username || 'Account'}</span>
                                                    <button onClick={async () => { try { await social.disconnect(a._id); setConnectedAccounts(prev => prev.filter(x => x._id !== a._id)) } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) } }}
                                                        className="text-[10px] text-rose-400 hover:text-rose-300 cursor-pointer">Disconnect</button>
                                                </div>
                                            ))}</div>}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <PublishModal isOpen={isPublishModalOpen} onClose={() => { setIsPublishModalOpen(false); fetchPosts() }} defaultText={publishItem?.content || ''} defaultImage={publishItem?.imageUrl || publishItem?.files?.[0]?.url || ''} brandId={activeBrand?._id} />
        </DashboardLayout>
    )
}

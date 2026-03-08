import { useState, useRef, useEffect } from 'react'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import { useBrand } from '../context/BrandContext'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { seoStudio as seoAPI, googleAnalytics as gaAPI } from '../services/api'

// ── Constants ──────────────────────────────────────────────────────────────
const WORKFLOWS = [
    { id: 'health-check', icon: 'health_and_safety', title: 'Health Check', subtitle: 'Is my website OK?', desc: 'Full SEO + AI visibility audit with fix recommendations', color: 'emerald', creditAction: 'seoHealthCheck' },
    { id: 'traffic', icon: 'trending_up', title: 'Get Me Traffic', subtitle: 'What should I rank for?', desc: 'Keyword clusters, content gaps & topic suggestions', color: 'blue', creditAction: 'seoTraffic' },
    { id: 'competitors', icon: 'swords', title: 'Beat Competitors', subtitle: 'Why are they ahead?', desc: 'Competitor gap analysis & outrank plan', color: 'amber', creditAction: 'seoCompetitors' },
    { id: 'ai-visibility', icon: 'smart_toy', title: 'AI Visibility', subtitle: 'Will AI recommend my brand?', desc: 'AI search optimization & LLM discoverability', color: 'violet', creditAction: 'seoAiVisibility' },
    { id: 'competitor-warroom', icon: 'shield', title: 'Competitor War Room', subtitle: 'Side-by-side battle analysis', desc: 'Scoring matrix, keyword battles & 90-day playbook', color: 'rose', creditAction: 'seoCompetitors' },
    { id: 'llm-probe', icon: 'psychology', title: 'LLM Brand Probe', subtitle: 'Do AI models know your brand?', desc: 'Live test: asks AI about your brand & checks if you get mentioned', color: 'cyan', creditAction: 'seoAiVisibility' },
    { id: 'auto-fix', icon: 'build', title: 'Auto-Fix Issues', subtitle: 'Copy-paste code fixes', desc: 'Generate ready-to-implement fixes from your last audit', color: 'teal', creditAction: 'seoAuditPage' },
    { id: 'prompt-mining', icon: 'chat_bubble', title: 'AI Prompt Mining', subtitle: 'What prompts should cite you?', desc: 'Discover AI prompts where your brand should be recommended', color: 'orange', creditAction: 'seoAiVisibility' },
]

const ADV_MENU = [
    { id: 'overview', icon: 'space_dashboard', label: 'Overview Dashboard' },
    { id: 'site-audit', icon: 'bug_report', label: 'Site Audit' },
    { id: 'keywords', icon: 'key', label: 'Keyword Intelligence' },
    { id: 'content-ops', icon: 'article', label: 'Content Opportunities' },
    { id: 'ai-seo', icon: 'smart_toy', label: 'AI SEO Optimization' },
    { id: 'competitor-detail', icon: 'groups', label: 'Competitors' },
    { id: 'on-page', icon: 'tune', label: 'On-Page Fixer' },
    { id: 'reports', icon: 'summarize', label: 'Reports & Plans' },
]

const SEVERITY_COLORS = { critical: 'rose', high: 'orange', medium: 'amber', low: 'slate' }
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low']

// ── Score Ring Component ──────────────────────────────────────────────────
function ScoreRing({ score, size = 100, label, color = 'primary' }) {
    const r = (size - 12) / 2, c = 2 * Math.PI * r, offset = c - (score / 100) * c
    const colorMap = { primary: '#a78bfa', emerald: '#34d399', blue: '#60a5fa', amber: '#fbbf24', rose: '#fb7185', violet: '#a78bfa' }
    return (
        <div className="flex flex-col items-center gap-1">
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colorMap[color] || colorMap.primary}
                    strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <span className="text-2xl font-black text-white -mt-16">{score}</span>
            {label && <p className="text-sm text-slate-500 mt-3 font-bold">{label}</p>}
        </div>
    )
}

// ── Issue Badge ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
    const c = SEVERITY_COLORS[severity] || 'slate'
    return <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full bg-${c}-500/10 text-${c}-400 uppercase`}>{severity}</span>
}

// ── Main Component ────────────────────────────────────────────────────────
export default function SeoStudio() {
    const { activeBrand } = useBrand()
    const navigate = useNavigate()

    // View management
    const [view, setView] = useState('home')
    const [activeWorkflow, setActiveWorkflow] = useState(null)
    const [advPage, setAdvPage] = useState('overview')
    const [showAdvMenu, setShowAdvMenu] = useState(false)

    // Competitor management
    const [competitors, setCompetitors] = useState(activeBrand?.competitors || [])
    const [newCompUrl, setNewCompUrl] = useState('')
    const [compLoading, setCompLoading] = useState(false)
    const [showCompetitors, setShowCompetitors] = useState(true)

    // Input state
    const [askQuery, setAskQuery] = useState('')

    // Results state
    const [loading, setLoading] = useState(false)
    const [loadingStage, setLoadingStage] = useState('')
    const [results, setResults] = useState(null)
    const [askResult, setAskResult] = useState(null)
    const [error, setError] = useState('')

    // Google Analytics state
    const [gaConnected, setGaConnected] = useState(false)
    const [gaEmail, setGaEmail] = useState('')
    const [gaProperties, setGaProperties] = useState([])
    const [gaSelectedProp, setGaSelectedProp] = useState('')
    const [gaReport, setGaReport] = useState(null)
    const [gaSites, setGaSites] = useState([])
    const [gaSelectedSite, setGaSelectedSite] = useState('')
    const [gscReport, setGscReport] = useState(null)
    const [gaLoading, setGaLoading] = useState(false)

    const resultRef = useRef(null)
    const website = activeBrand?.website || ''

    useEffect(() => { if (activeBrand?.competitors) setCompetitors(activeBrand.competitors) }, [activeBrand])
    useEffect(() => { if (results) resultRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [results])

    // Check GA connection on mount AND on brand change
    useEffect(() => {
        // Reset GA state on brand switch
        setGaConnected(false); setGaEmail(''); setGaProperties([]); setGaSelectedProp(''); setGaReport(null); setGaSites([]); setGaSelectedSite(''); setGscReport(null);
        const brandId = activeBrand?._id;
        gaAPI.status(brandId).then(d => {
            setGaConnected(d.connected); setGaEmail(d.email || '')
            if (d.connected) { loadGAProperties(); loadGSCSites() }
        }).catch(() => { })
        const handler = (e) => { if (e.data?.type === 'GOOGLE_ANALYTICS_CONNECTED') { setGaConnected(true); setGaEmail(e.data.email || ''); loadGAProperties(); loadGSCSites() } }
        window.addEventListener('message', handler)
        return () => window.removeEventListener('message', handler)
    }, [activeBrand])

    const loadGAProperties = async () => {
        try { const d = await gaAPI.properties(activeBrand?._id); setGaProperties(d.properties || []) } catch { }
    }
    const loadGSCSites = async () => {
        try { const d = await gaAPI.searchConsoleSites(activeBrand?._id); setGaSites(d.sites || []) } catch { }
    }
    const loadGAReport = async (propId) => {
        if (!propId) return; setGaLoading(true)
        try { const d = await gaAPI.report({ propertyId: propId, brandId: activeBrand?._id }); if (d.success) setGaReport(d) } catch { }
        finally { setGaLoading(false) }
    }
    const loadGSCReport = async (siteUrl) => {
        if (!siteUrl) return; setGaLoading(true)
        try { const d = await gaAPI.searchConsoleReport({ siteUrl, brandId: activeBrand?._id }); if (d.success) setGscReport(d) } catch { }
        finally { setGaLoading(false) }
    }
    // Connect/disconnect now happens in the Integrations hub — SEO Studio only reads status

    const brandPayload = activeBrand ? { name: activeBrand.name, website: activeBrand.website, _id: activeBrand._id, dna: activeBrand.dna } : null

    // ── Competitor Management ──────────────────────────────────────────────
    const addCompetitor = async () => {
        if (!newCompUrl.trim() || !activeBrand?._id) return
        setCompLoading(true)
        try {
            const d = await seoAPI.manageCompetitors({ brandId: activeBrand._id, action: 'add', competitor: { url: newCompUrl.trim() } })
            if (d.competitors) { setCompetitors(d.competitors); setNewCompUrl('') }
        } catch (e) { setError(e.message) }
        finally { setCompLoading(false) }
    }
    const removeCompetitor = async (url) => {
        if (!activeBrand?._id) return
        try {
            const d = await seoAPI.manageCompetitors({ brandId: activeBrand._id, action: 'remove', competitor: { url } })
            if (d.competitors) setCompetitors(d.competitors)
        } catch { }
    }
    const discoverCompetitors = async () => {
        if (!activeBrand?._id) return
        setCompLoading(true)
        try {
            const d = await seoAPI.discoverCompetitors({ brandId: activeBrand._id })
            if (d.competitors) setCompetitors(d.competitors)
        } catch (e) { setError(e.message) }
        finally { setCompLoading(false) }
    }

    // ── Workflow runners ──────────────────────────────────────────────────
    const STAGE_MESSAGES = {
        'health-check': ['Crawling your website...', 'Analyzing page structure & meta tags...', 'Checking schema & structured data...', 'Running AI SEO analysis...', 'Building action plan...'],
        'traffic': ['Crawling your website content...', 'Analyzing existing topics & gaps...', 'Researching keyword opportunities...', 'Building traffic strategy...'],
        'competitors': ['Crawling your website...', 'Researching competitor sites...', 'Comparing content & structure...', 'Building outrank plan...'],
        'ai-visibility': ['Crawling your website...', 'Checking schema & JSON-LD...', 'Analyzing heading structure & FAQs...', 'Evaluating AI discoverability...', 'Generating optimization templates...'],
        'competitor-warroom': ['Crawling your website...', 'Crawling competitor sites in parallel...', 'Building scoring matrix...', 'Analyzing keyword battles...', 'Creating 90-day battle plan...'],
        'llm-probe': ['Preparing brand probes...', 'Asking AI Model 1 about your brand...', 'Asking AI Model 2 about your brand...', 'Analyzing mention patterns...', 'Scoring visibility & sentiment...', 'Generating strategic analysis...'],
        'auto-fix': ['Analyzing issues...', 'Generating code fixes...', 'Building schema blocks...', 'Creating implementation guide...'],
        'prompt-mining': ['Analyzing your industry...', 'Mining AI prompt patterns...', 'Scoring visibility per prompt...', 'Building content calendar...'],
    }

    const runWorkflow = async (workflowId) => {
        if (!website) { setError('No website URL found. Please add a website to your brand.'); return }
        setError(''); setResults(null); setActiveWorkflow(workflowId); setView('workflow-result'); setLoading(true)

        const stages = STAGE_MESSAGES[workflowId] || ['Processing...']
        let stageIdx = 0
        setLoadingStage(stages[0])
        const interval = setInterval(() => { stageIdx = Math.min(stageIdx + 1, stages.length - 1); setLoadingStage(stages[stageIdx]) }, 5000)

        try {
            const payload = { url: website, brand: brandPayload, brandId: activeBrand?._id, country: activeBrand?.dna?.country || 'India', industry: activeBrand?.dna?.industry }
            if (workflowId === 'competitors' || workflowId === 'competitor-warroom') payload.competitorUrls = competitors.map(c => c.url).filter(Boolean)

            // Auto-fix needs previous issues
            if (workflowId === 'auto-fix') {
                const lastIssues = results?.issues || []
                if (lastIssues.length === 0) { setError('Run a Health Check first to find issues, then use Auto-Fix.'); setLoading(false); clearInterval(interval); return }
                payload.issues = lastIssues
            }

            const apiFn = {
                'health-check': seoAPI.healthCheck, 'traffic': seoAPI.traffic,
                'competitors': seoAPI.competitors, 'ai-visibility': seoAPI.aiVisibility,
                'competitor-warroom': seoAPI.competitorWarRoom, 'llm-probe': seoAPI.llmProbe,
                'auto-fix': seoAPI.autoFix, 'prompt-mining': seoAPI.promptMining,
            }[workflowId]
            const data = await apiFn(payload)
            if (data.success !== false) {
                setResults(data)
                // Refresh competitors if competitor analysis discovered new ones
                if (workflowId === 'competitors' && data.discoveredCompetitors?.length) {
                    // Refresh competitor state from the discovered ones
                    try {
                        const newComps = data.discoveredCompetitors.map(c => ({ name: c.name, url: c.url, addedBy: 'ai' }));
                        setCompetitors(prev => {
                            const urls = new Set(prev.map(p => p.url));
                            return [...prev, ...newComps.filter(n => !urls.has(n.url))].slice(0, 8);
                        });
                    } catch { }
                }
            } else setError(data.error || 'Analysis failed')
        } catch (e) { setError(e.message) }
        finally { clearInterval(interval); setLoading(false) }
    }

    const runAsk = async () => {
        if (!askQuery.trim()) return
        setAskResult(null); setLoading(true); setLoadingStage('Thinking...')
        try {
            const data = await seoAPI.ask({ question: askQuery.trim(), brand: brandPayload, url: website })
            if (data.success !== false) setAskResult(data)
            else setError(data.error)
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
    }

    const goHome = () => { setView('home'); setResults(null); setActiveWorkflow(null); setAskResult(null); setError(''); setShowAdvMenu(false) }

    // ── RENDER ────────────────────────────────────────────────────────────
    return (
        <DashboardLayout title="SEO Studio" subtitle="AI-Powered SEO Intelligence">
            <div className="max-w-7xl mx-auto">

                {/* ═══ ASK BAR (always visible) ═══ */}
                <div className="glass-panel rounded-2xl p-4 mb-6 flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-xl">search</span>
                    <input type="text" value={askQuery} onChange={e => setAskQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && runAsk()}
                        placeholder="What do you want to achieve? e.g., 'Find trending keywords for my category'" className="input-glass flex-1 py-2.5 text-sm border-0 bg-transparent focus:ring-0" />
                    <button onClick={runAsk} disabled={loading || !askQuery.trim()}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${askQuery.trim() ? 'bg-primary text-white hover:bg-primary-light' : 'bg-white/5 text-slate-600'}`}>
                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                    </button>
                </div>

                {/* Ask result */}
                {askResult && (
                    <div className="glass-panel rounded-2xl p-6 mb-6 animate-fade-in">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2"><span className="material-symbols-outlined text-primary text-sm">psychology</span> AI Answer</h3>
                            <button onClick={() => setAskResult(null)} className="text-slate-500 hover:text-slate-300 cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button>
                        </div>
                        <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-4">{askResult.answer}</div>
                        {askResult.actionItems?.length > 0 && (
                            <div className="space-y-2 mb-4">{askResult.actionItems.map((a, i) => (
                                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/3"><span className="text-primary text-xs mt-0.5">▸</span><div><p className="text-sm font-bold text-white">{a.title}</p><p className="text-[11px] text-slate-400">{a.description}</p></div></div>
                            ))}</div>
                        )}
                        {askResult.followUpQuestions?.length > 0 && (
                            <div className="flex flex-wrap gap-2">{askResult.followUpQuestions.map((q, i) => (
                                <button key={i} onClick={() => { setAskQuery(q); setAskResult(null) }}
                                    className="text-xs px-3 py-1.5 rounded-full bg-white/5 text-slate-400 hover:bg-primary/10 hover:text-primary border border-white/5 cursor-pointer transition-all">{q}</button>
                            ))}</div>
                        )}
                        {askResult.suggestedWorkflow && (
                            <button onClick={() => runWorkflow(askResult.suggestedWorkflow)}
                                className="mt-4 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 cursor-pointer transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">play_arrow</span> Run {WORKFLOWS.find(w => w.id === askResult.suggestedWorkflow)?.title || 'Workflow'}
                            </button>
                        )}
                    </div>
                )}

                {/* ═══ HOME VIEW ═══ */}
                {view === 'home' && (
                    <div className="animate-fade-in">
                        {/* No brand guard */}
                        {!activeBrand ? (
                            <div className="glass-panel rounded-2xl p-10 mb-8 text-center">
                                <span className="material-symbols-outlined text-slate-600 text-5xl block mb-3">domain</span>
                                <h3 className="text-lg font-bold text-white mb-2">Select or Create a Brand</h3>
                                <p className="text-sm text-slate-400 mb-4">SEO Studio needs a brand with a website to analyze. Please select an existing brand or create a new one.</p>
                                <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm cursor-pointer">Create Brand</button>
                            </div>
                        ) : (
                            <>
                                {/* Brand Header Badge */}
                                <div className="glass-panel rounded-2xl p-5 mb-6 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-primary text-2xl">domain</span>
                                        </div>
                                        <div>
                                            <h3 className="text-base font-bold text-white">{activeBrand.name}</h3>
                                            <p className="text-sm text-slate-400 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-400 text-xs">language</span>
                                                {website || 'No website set'}
                                                {activeBrand.dna?.industry && <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs">{activeBrand.dna.industry}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    {!website && <button onClick={() => navigate(`/brand-dna`)} className="text-sm text-primary hover:text-primary-light cursor-pointer font-bold">Add Website →</button>}
                                </div>

                                {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-4"><p className="text-rose-400 text-xs">{error}</p></div>}

                                {/* Competitor Management */}
                                <div className="glass-panel rounded-2xl p-5 mb-6">
                                    <button onClick={() => setShowCompetitors(!showCompetitors)} className="flex items-center justify-between w-full cursor-pointer">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-amber-400 text-lg">swords</span>
                                            Competitors ({competitors.length})
                                        </h3>
                                        <span className="material-symbols-outlined text-slate-500 text-sm">{showCompetitors ? 'expand_less' : 'expand_more'}</span>
                                    </button>
                                    {showCompetitors && (
                                        <div className="mt-4 space-y-3 animate-fade-in">
                                            {competitors.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {competitors.map((c, i) => (
                                                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
                                                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${c.addedBy === 'user' ? 'bg-blue-500/10 text-blue-400' : 'bg-violet-500/10 text-violet-400'}`}>{c.addedBy === 'user' ? 'YOU' : 'AI'}</span>
                                                            <span className="text-sm text-slate-300">{c.name || c.url}</span>
                                                            <button onClick={(e) => { e.stopPropagation(); removeCompetitor(c.url) }} className="text-slate-600 hover:text-rose-400 cursor-pointer transition-colors">
                                                                <span className="material-symbols-outlined text-xs">close</span>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-[11px] text-slate-500">No competitors mapped yet. Add manually or let AI discover them.</p>
                                            )}
                                            <div className="flex gap-2">
                                                <input type="text" value={newCompUrl} onChange={e => setNewCompUrl(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && addCompetitor()}
                                                    placeholder="Add competitor URL (e.g. competitor.com)" className="input-glass flex-1 py-2 text-xs" />
                                                <button onClick={addCompetitor} disabled={compLoading || !newCompUrl.trim()}
                                                    className="px-3 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-primary/10 hover:text-primary cursor-pointer transition-all font-bold disabled:opacity-30">Add</button>
                                                <button onClick={discoverCompetitors} disabled={compLoading}
                                                    className="px-3 py-2 rounded-xl bg-violet-500/10 text-sm text-violet-400 hover:bg-violet-500/20 cursor-pointer transition-all font-bold flex items-center gap-1 disabled:opacity-30">
                                                    {compLoading ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-xs">auto_awesome</span>}
                                                    Auto-Discover
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 4 Workflow Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                                    {WORKFLOWS.map(w => (
                                        <CreditTooltipWrapper key={w.id} action={w.creditAction}>
                                            <button onClick={() => runWorkflow(w.id)} disabled={!website}
                                                className={`glass-panel rounded-2xl p-6 text-left hover:bg-white/[0.04] transition-all group cursor-pointer border border-white/[0.06] hover:border-${w.color}-500/20 disabled:opacity-40 disabled:cursor-not-allowed`}>
                                                <div className="flex items-start gap-4">
                                                    <div className={`w-12 h-12 rounded-2xl bg-${w.color}-500/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                                        <span className={`material-symbols-outlined text-${w.color}-400 text-2xl`}>{w.icon}</span>
                                                    </div>
                                                    <div className="flex-1">
                                                        <h3 className="text-base font-bold text-white mb-0.5">{w.title}</h3>
                                                        <p className={`text-xs text-${w.color}-400 font-semibold mb-1`}>{w.subtitle}</p>
                                                        <p className="text-[11px] text-slate-500">{w.desc}</p>
                                                        <CreditBadge action={w.creditAction} />
                                                    </div>
                                                    <span className="material-symbols-outlined text-slate-600 group-hover:text-slate-300 transition-colors">arrow_forward</span>
                                                </div>
                                            </button>
                                        </CreditTooltipWrapper>
                                    ))}
                                </div>

                                {/* ═══ GOOGLE ANALYTICS & SEARCH CONSOLE DASHBOARD ═══ */}
                                <div className="glass-panel rounded-2xl p-6 mb-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-blue-400 text-lg">monitoring</span> Analytics & Search Performance
                                        </h3>
                                        {gaConnected ? (
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Connected — {gaEmail}</span>
                                                <button onClick={() => navigate('/integrations')} className="text-xs text-primary hover:text-white cursor-pointer flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-primary/10 transition-all">
                                                    <span className="material-symbols-outlined text-xs">settings</span> Manage in Integrations
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={() => navigate('/integrations')} className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-bold hover:bg-blue-500/20 cursor-pointer transition-all flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">link</span> Connect in Integrations
                                            </button>
                                        )}
                                    </div>

                                    {gaConnected ? (
                                        <div>
                                            {/* Property & Site selectors */}
                                            <div className="flex gap-3 mb-4">
                                                <div className="flex-1">
                                                    <label className="text-sm text-slate-500 font-bold mb-1 block">GA4 Property</label>
                                                    <select value={gaSelectedProp} onChange={e => { setGaSelectedProp(e.target.value); loadGAReport(e.target.value) }}
                                                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none cursor-pointer">
                                                        <option value="">Select property...</option>
                                                        {gaProperties.map((p, i) => <option key={i} value={p.propertyId}>{p.propertyName} ({p.accountName})</option>)}
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-sm text-slate-500 font-bold mb-1 block">Search Console Site</label>
                                                    <select value={gaSelectedSite} onChange={e => { setGaSelectedSite(e.target.value); loadGSCReport(e.target.value) }}
                                                        className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none cursor-pointer">
                                                        <option value="">Select site...</option>
                                                        {gaSites.map((s, i) => <option key={i} value={s.siteUrl}>{s.siteUrl}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            {gaLoading && <div className="text-center py-8"><span className="material-symbols-outlined text-primary animate-spin text-2xl">progress_activity</span><p className="text-sm text-slate-500 mt-2">Loading analytics...</p></div>}

                                            {/* GA4 Report */}
                                            {gaReport && !gaLoading && (
                                                <div className="space-y-4">
                                                    {/* Summary stats */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        {[{ label: 'Users', value: gaReport.summary.totalUsers?.toLocaleString(), icon: 'person', color: 'blue' },
                                                        { label: 'Sessions', value: gaReport.summary.totalSessions?.toLocaleString(), icon: 'browse_activity', color: 'emerald' },
                                                        { label: 'Page Views', value: gaReport.summary.totalPageViews?.toLocaleString(), icon: 'visibility', color: 'violet' },
                                                        { label: 'Bounce Rate', value: `${(gaReport.summary.avgBounceRate * 100).toFixed(1)}%`, icon: 'exit_to_app', color: 'amber' },
                                                        ].map(s => (
                                                            <div key={s.label} className={`p-3 rounded-xl bg-${s.color}-500/5 border border-${s.color}-500/10`}>
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`material-symbols-outlined text-${s.color}-400 text-sm`}>{s.icon}</span>
                                                                    <span className="text-sm text-slate-500 font-bold">{s.label}</span>
                                                                </div>
                                                                <p className="text-lg font-black text-white">{s.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Traffic Sparkline */}
                                                    {gaReport.traffic?.length > 0 && (
                                                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                            <h4 className="text-sm text-slate-500 font-bold mb-3">DAILY TRAFFIC (Last 30 days)</h4>
                                                            <div className="flex items-end gap-0.5 h-16">
                                                                {gaReport.traffic.map((d, i) => {
                                                                    const max = Math.max(...gaReport.traffic.map(t => t.sessions || 1))
                                                                    const h = Math.max(4, (d.sessions / max) * 100)
                                                                    return <div key={i} className="flex-1 bg-primary/60 rounded-t hover:bg-primary transition-all cursor-pointer" style={{ height: `${h}%` }} title={`${d.date}: ${d.sessions} sessions`} />
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Channels + Top Pages side by side */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {gaReport.channels?.length > 0 && (
                                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                                <h4 className="text-sm text-slate-500 font-bold mb-2">TRAFFIC CHANNELS</h4>
                                                                <div className="space-y-1.5">{gaReport.channels.slice(0, 6).map((c, i) => {
                                                                    const max = gaReport.channels[0]?.sessions || 1
                                                                    return (<div key={i} className="flex items-center gap-2">
                                                                        <span className="text-sm text-slate-400 w-24 truncate">{c.channel}</span>
                                                                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-primary/60 rounded-full" style={{ width: `${(c.sessions / max) * 100}%` }} /></div>
                                                                        <span className="text-sm text-white font-bold w-10 text-right">{c.sessions}</span>
                                                                    </div>)
                                                                })}</div>
                                                            </div>
                                                        )}
                                                        {gaReport.topPages?.length > 0 && (
                                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                                <h4 className="text-sm text-slate-500 font-bold mb-2">TOP PAGES</h4>
                                                                <div className="space-y-1.5">{gaReport.topPages.slice(0, 6).map((p, i) => (
                                                                    <div key={i} className="flex items-center justify-between">
                                                                        <span className="text-sm text-slate-300 truncate flex-1 mr-2">{p.path}</span>
                                                                        <span className="text-sm text-primary font-bold">{p.views}</span>
                                                                    </div>
                                                                ))}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Search Console Report */}
                                            {gscReport && !gaLoading && (
                                                <div className="space-y-4 mt-4">
                                                    <h4 className="text-sm font-bold text-white flex items-center gap-2"><span className="material-symbols-outlined text-emerald-400 text-sm">search</span> Search Console — SERP Performance</h4>
                                                    {/* Summary */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        {[{ label: 'Clicks', value: gscReport.summary.totalClicks?.toLocaleString(), color: 'blue' },
                                                        { label: 'Impressions', value: gscReport.summary.totalImpressions?.toLocaleString(), color: 'violet' },
                                                        { label: 'Avg Position', value: gscReport.summary.avgPosition?.toFixed(1), color: 'amber' },
                                                        { label: 'Avg CTR', value: `${(gscReport.summary.avgCtr * 100).toFixed(1)}%`, color: 'emerald' },
                                                        ].map(s => (
                                                            <div key={s.label} className={`p-3 rounded-xl bg-${s.color}-500/5 border border-${s.color}-500/10`}>
                                                                <span className="text-sm text-slate-500 font-bold">{s.label}</span>
                                                                <p className="text-lg font-black text-white">{s.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Keywords and Pages */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        {gscReport.keywords?.length > 0 && (
                                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                                <h4 className="text-sm text-slate-500 font-bold mb-2">TOP KEYWORDS (SERP Positions)</h4>
                                                                <div className="space-y-1.5">{gscReport.keywords.slice(0, 10).map((k, i) => (
                                                                    <div key={i} className="flex items-center gap-2">
                                                                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold min-w-[32px] text-center ${k.position <= 3 ? 'bg-emerald-500/10 text-emerald-400' : k.position <= 10 ? 'bg-blue-500/10 text-blue-400' : k.position <= 20 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>#{k.position.toFixed(0)}</span>
                                                                        <span className="text-sm text-slate-300 flex-1 truncate">{k.keyword}</span>
                                                                        <span className="text-sm text-primary font-bold">{k.clicks}</span>
                                                                    </div>
                                                                ))}</div>
                                                            </div>
                                                        )}
                                                        {gscReport.pages?.length > 0 && (
                                                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                                                <h4 className="text-sm text-slate-500 font-bold mb-2">TOP PAGES (by Clicks)</h4>
                                                                <div className="space-y-1.5">{gscReport.pages.slice(0, 10).map((p, i) => (
                                                                    <div key={i} className="flex items-center gap-2">
                                                                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold min-w-[32px] text-center ${p.position <= 10 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>#{p.position.toFixed(0)}</span>
                                                                        <span className="text-sm text-slate-300 flex-1 truncate">{new URL(p.page).pathname}</span>
                                                                        <span className="text-sm text-primary font-bold">{p.clicks}</span>
                                                                    </div>
                                                                ))}</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6">
                                            <span className="material-symbols-outlined text-slate-600 text-4xl block mb-2">monitoring</span>
                                            <p className="text-sm text-slate-500 mb-1">Connect Google Analytics & Search Console to see real data</p>
                                            <p className="text-xs text-slate-600 mb-3">Traffic trends, SERP positions, top pages, keyword rankings & more</p>
                                            <button onClick={() => navigate('/integrations')} className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-400 text-xs font-bold hover:bg-blue-500/20 cursor-pointer transition-all inline-flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">link</span> Connect in Integrations →
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Advanced menu toggle */}
                                <button onClick={() => setShowAdvMenu(!showAdvMenu)}
                                    className="text-sm text-slate-500 hover:text-slate-300 font-bold mb-4 flex items-center gap-1 cursor-pointer transition-all">
                                    <span className="material-symbols-outlined text-sm">{showAdvMenu ? 'expand_less' : 'expand_more'}</span> Advanced Tools
                                </button>
                                {showAdvMenu && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in">
                                        {ADV_MENU.map(m => (
                                            <button key={m.id} onClick={() => { setAdvPage(m.id); setView('advanced-page') }}
                                                className="glass-panel rounded-xl p-4 text-left hover:bg-white/[0.04] cursor-pointer transition-all flex items-center gap-3">
                                                <span className="material-symbols-outlined text-slate-400 text-lg">{m.icon}</span>
                                                <span className="text-sm text-slate-300 font-medium">{m.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ═══ LOADING STATE ═══ */}
                {loading && view === 'workflow-result' && (
                    <div className="flex flex-col items-center justify-center py-32 animate-fade-in">
                        <div className="relative mb-8">
                            <div className="w-24 h-24 rounded-full border-4 border-white/5 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-4xl animate-spin">progress_activity</span>
                            </div>
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">Running {WORKFLOWS.find(w => w.id === activeWorkflow)?.title}...</h3>
                        <p className="text-sm text-primary animate-pulse">{loadingStage}</p>
                        <div className="flex gap-2 mt-6">{STAGE_MESSAGES[activeWorkflow]?.map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-all ${STAGE_MESSAGES[activeWorkflow]?.indexOf(loadingStage) >= i ? 'bg-primary' : 'bg-white/10'}`} />
                        ))}</div>
                    </div>
                )}

                {/* ═══ WORKFLOW RESULTS ═══ */}
                {view === 'workflow-result' && !loading && results && (
                    <div ref={resultRef} className="animate-fade-in">
                        <button onClick={goHome} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold mb-6 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Back to SEO Studio
                        </button>

                        {/* Research Sources Badge */}
                        {results.researchSources?.length > 0 && (
                            <div className="glass-panel rounded-xl p-3 mb-4 flex items-start gap-2">
                                <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5">verified</span>
                                <div>
                                    <p className="text-sm text-emerald-400 font-bold">GROUNDED IN REAL RESEARCH</p>
                                    <p className="text-sm text-slate-500">{results.researchSources.length} pages crawled: {results.researchSources.slice(0, 4).join(', ')}{results.researchSources.length > 4 ? ` +${results.researchSources.length - 4} more` : ''}</p>
                                </div>
                            </div>
                        )}

                        {activeWorkflow === 'health-check' && <HealthCheckResults results={results} />}
                        {activeWorkflow === 'traffic' && <TrafficResults results={results} />}
                        {activeWorkflow === 'competitors' && <CompetitorResults results={results} />}
                        {activeWorkflow === 'ai-visibility' && <AIVisibilityResults results={results} />}
                        {activeWorkflow === 'competitor-warroom' && <WarRoomResults results={results} />}
                        {activeWorkflow === 'llm-probe' && <LLMProbeResults results={results} />}
                        {activeWorkflow === 'auto-fix' && <AutoFixResults results={results} />}
                        {activeWorkflow === 'prompt-mining' && <PromptMiningResults results={results} />}
                    </div>
                )}

                {error && view === 'workflow-result' && !loading && (
                    <div className="text-center py-20">
                        <span className="material-symbols-outlined text-rose-400 text-4xl mb-4 block">error</span>
                        <p className="text-rose-400 text-sm mb-4">{error}</p>
                        <button onClick={goHome} className="text-sm text-slate-400 hover:text-white cursor-pointer">← Back</button>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}


// ══════════════════════════════════════════════════════════════════════════
// RESULT SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function HealthCheckResults({ results }) {
    const [issueFilter, setIssueFilter] = useState('all')
    const issues = results.issues || []
    const filtered = issueFilter === 'all' ? issues : issues.filter(i => i.severity === issueFilter)

    return (<>
        {/* Summary */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
            <p className="text-sm text-slate-300 leading-relaxed">{results.summary}</p>
            <p className="text-sm text-primary font-bold mt-2">{results.topOpportunity}</p>
        </div>

        {/* Score Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[{ s: results.seoHealthScore, l: 'SEO Health', c: 'emerald' }, { s: results.aiVisibilityScore, l: 'AI Visibility', c: 'violet' },
            { s: results.technicalScore, l: 'Technical', c: 'blue' }, { s: results.contentScore, l: 'Content', c: 'amber' },
            { s: results.authorityScore, l: 'Authority', c: 'rose' }].map(x => (
                <div key={x.l} className="glass-panel rounded-2xl p-4 flex flex-col items-center">
                    <ScoreRing score={x.s || 0} size={80} label={x.l} color={x.c} />
                </div>
            ))}
        </div>

        {/* Action Board */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <ActionBucket title="🔧 Fix Now" items={results.fixNow} color="rose" />
            <ActionBucket title="✏️ Create Next" items={results.createNext} color="emerald" />
            <ActionBucket title="👁️ Monitor" items={results.monitor} color="blue" />
        </div>

        {/* Issues List */}
        <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">{issues.length} Issues Found</h3>
                <div className="flex gap-1">
                    {['all', ...SEVERITY_ORDER].map(s => (
                        <button key={s} onClick={() => setIssueFilter(s)}
                            className={`text-xs px-2.5 py-1 rounded-full font-bold cursor-pointer transition-all ${issueFilter === s ? 'bg-primary/20 text-primary' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}>
                            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} {s !== 'all' && `(${issues.filter(i => i.severity === s).length})`}
                        </button>
                    ))}
                </div>
            </div>
            <div className="space-y-3">
                {filtered.map((issue, i) => <IssueCard key={i} issue={issue} />)}
            </div>
        </div>
    </>)
}

function TrafficResults({ results }) {
    return (<>
        <div className="glass-panel rounded-2xl p-6 mb-6">
            <p className="text-sm text-slate-300 leading-relaxed">{results.summary}</p>
        </div>

        {/* Quick Wins */}
        {results.quickWins?.length > 0 && (
            <div className="glass-panel rounded-2xl p-6 mb-6">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><span className="text-lg">⚡</span> Quick Wins</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {results.quickWins.map((w, i) => (
                        <div key={i} className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                            <p className="text-xs font-bold text-emerald-400 mb-1">{w.action}</p>
                            <p className="text-[11px] text-slate-400">{w.keyword && <span className="text-primary">"{w.keyword}" — </span>}{w.expectedImpact}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Keyword Clusters */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
            <h3 className="text-base font-bold text-white mb-4">Keyword Clusters</h3>
            <div className="space-y-4">
                {(results.keywordClusters || []).map((cluster, i) => (
                    <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-bold text-white">{cluster.clusterName}</h4>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cluster.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-400' : cluster.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{cluster.difficulty}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-bold">{cluster.intent}</span>
                                <span className="text-sm text-primary font-bold">{cluster.opportunityScore}/100</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-2">{cluster.keywords?.map((k, j) => (
                            <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{typeof k === 'string' ? k : k.keyword}</span>
                        ))}</div>
                        {cluster.suggestedTitle && <p className="text-[11px] text-slate-500">📝 <span className="text-slate-300">{cluster.suggestedTitle}</span> ({cluster.recommendedPageType})</p>}
                    </div>
                ))}
            </div>
        </div>

        {/* Rising Keywords + Seasonal */}
        <div className="grid grid-cols-2 gap-4 mb-6">
            {results.risingKeywords?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-3">📈 Rising Keywords</h3>
                    <div className="space-y-2">{results.risingKeywords.map((k, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/3">
                            <span className="text-sm text-white font-medium">{k.keyword}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${k.trend === 'breakout' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{k.trend}</span>
                        </div>
                    ))}</div>
                </div>
            )}
            {results.seasonalPeaks?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-3">🗓️ Seasonal Peaks</h3>
                    <div className="space-y-2">{results.seasonalPeaks.map((p, i) => (
                        <div key={i} className="p-2 rounded-lg bg-white/3">
                            <p className="text-sm text-white font-medium">{p.keyword} <span className="text-primary text-xs">→ {p.peakMonth}</span></p>
                            <p className="text-sm text-slate-500">{p.reason}</p>
                        </div>
                    ))}</div>
                </div>
            )}
        </div>

        {/* 30-day plan */}
        {results.thirtyDayPlan?.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-4">📅 30-Day Traffic Plan</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{results.thirtyDayPlan.map((w, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <p className="text-sm text-primary font-bold mb-2">Week {w.week}</p>
                        <ul className="space-y-1">{w.actions?.map((a, j) => <li key={j} className="text-[11px] text-slate-400 flex items-start gap-1"><span className="text-primary mt-0.5">▸</span>{a}</li>)}</ul>
                    </div>
                ))}</div>
            </div>
        )}
    </>)
}

function CompetitorResults({ results }) {
    return (<>
        <div className="glass-panel rounded-2xl p-6 mb-6"><p className="text-sm text-slate-300 leading-relaxed">{results.summary}</p></div>

        {/* Competitors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {(results.competitors || []).map((c, i) => (
                <div key={i} className="glass-panel rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-base font-bold text-white">{c.name}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${c.estimatedAuthority === 'high' ? 'bg-rose-500/10 text-rose-400' : c.estimatedAuthority === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{c.estimatedAuthority} authority</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">{c.url} • {c.contentVelocity}</p>
                    <div className="grid grid-cols-2 gap-2">
                        <div><p className="text-sm text-emerald-400 font-bold mb-1">STRENGTHS</p>{c.strengths?.map((s, j) => <p key={j} className="text-sm text-slate-400">+ {s}</p>)}</div>
                        <div><p className="text-sm text-rose-400 font-bold mb-1">WEAKNESSES</p>{c.weaknesses?.map((w, j) => <p key={j} className="text-sm text-slate-400">- {w}</p>)}</div>
                    </div>
                </div>
            ))}
        </div>

        {/* Why They Win + Outrank Plan */}
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-3">❌ Why They Win</h3>
                <div className="space-y-3">{(results.whyTheyWin || []).map((w, i) => (
                    <div key={i} className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/10">
                        <p className="text-xs font-bold text-rose-400 mb-1">{w.reason}</p>
                        <p className="text-sm text-slate-400 mb-1">{w.evidence}</p>
                        <p className="text-sm text-emerald-400">✓ Fix: {w.fix}</p>
                    </div>
                ))}</div>
            </div>
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-3">🎯 Outrank Plan</h3>
                <div className="space-y-2">{(results.outrankPlan || []).map((p, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-white/3">
                        <span className="text-xs font-black text-primary w-5">{p.priority}</span>
                        <div><p className="text-sm font-bold text-white">{p.action}</p><p className="text-sm text-slate-500">{p.timeline} • {p.effort}</p></div>
                    </div>
                ))}</div>
            </div>
        </div>

        {/* Gap Opportunities */}
        {results.gapOpportunities?.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-3">💡 Gap Opportunities</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{results.gapOpportunities.map((g, i) => (
                    <div key={i} className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                        <p className="text-sm font-bold text-white mb-1">{g.topic}</p>
                        <p className="text-sm text-slate-400">{g.strategy}</p>
                        <p className="text-sm text-emerald-400 mt-1">→ {g.suggestedContent}</p>
                    </div>
                ))}</div>
            </div>
        )}
    </>)
}

function AIVisibilityResults({ results }) {
    const bd = results.breakdown || {}
    const sections = [
        { key: 'schemaReadiness', icon: '🏗️', label: 'Schema Readiness' },
        { key: 'qnaPresence', icon: '❓', label: 'Q&A Presence' },
        { key: 'entityCoverage', icon: '🔗', label: 'Entity Coverage' },
        { key: 'snippetStructure', icon: '📋', label: 'Snippet Structure' },
        { key: 'trustSignals', icon: '🛡️', label: 'Trust Signals' },
    ]
    return (<>
        <div className="glass-panel rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-6">
                <ScoreRing score={results.aiVisibilityScore || 0} size={100} label="AI Visibility" color="violet" />
                <p className="text-sm text-slate-300 leading-relaxed flex-1">{results.summary}</p>
            </div>
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {sections.map(s => bd[s.key] && (
                <div key={s.key} className="glass-panel rounded-2xl p-4 text-center">
                    <span className="text-lg">{s.icon}</span>
                    <p className="text-xl font-black text-white mt-1">{bd[s.key].score}</p>
                    <p className="text-sm text-slate-500">{s.label}</p>
                </div>
            ))}
        </div>

        {/* Detailed sections */}
        <div className="space-y-4 mb-6">
            {sections.map(s => bd[s.key] && (
                <div key={s.key} className="glass-panel rounded-2xl p-5">
                    <h4 className="text-sm font-bold text-white mb-2">{s.icon} {s.label} — <span className="text-primary">{bd[s.key].score}/100</span></h4>
                    <p className="text-[11px] text-slate-400 mb-3">{bd[s.key].currentState}</p>
                    {bd[s.key].recommendations && <div className="space-y-2">{(Array.isArray(bd[s.key].recommendations) ? bd[s.key].recommendations : []).map((r, i) => (
                        <div key={i} className="text-[11px] text-slate-300 flex items-start gap-2"><span className="text-emerald-400">✓</span>{typeof r === 'string' ? r : r.title || r.description}</div>
                    ))}</div>}
                    {bd[s.key].suggestions && <div className="space-y-2 mt-2">{bd[s.key].suggestions.map((sg, i) => (
                        <div key={i} className="text-[11px] text-slate-300 flex items-start gap-2"><span className="text-primary">▸</span>{typeof sg === 'string' ? sg : sg.question}</div>
                    ))}</div>}
                </div>
            ))}
        </div>

        {/* AI-Ready Templates */}
        {results.aiReadyTemplates?.length > 0 && (
            <div className="glass-panel rounded-2xl p-6 mb-6">
                <h3 className="text-base font-bold text-white mb-4">📝 AI-Ready Templates</h3>
                <div className="space-y-3">{results.aiReadyTemplates.map((t, i) => (
                    <div key={i} className="p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                        <p className="text-xs font-bold text-violet-400 mb-1">{t.name}</p>
                        <p className="text-sm text-slate-500 mb-2">{t.description}</p>
                        <pre className="text-sm text-slate-300 bg-black/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{t.template}</pre>
                        {t.example && <div className="mt-2"><p className="text-xs text-slate-600 font-bold">EXAMPLE:</p><p className="text-sm text-slate-400 italic">{t.example}</p></div>}
                    </div>
                ))}</div>
            </div>
        )}

        {/* Priority Actions */}
        {results.priorityActions?.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-3">🎯 Priority Actions</h3>
                <div className="space-y-2">{results.priorityActions.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <span className="text-xs font-black text-primary w-5">{p.priority}</span>
                        <div className="flex-1"><p className="text-sm font-bold text-white">{p.action}</p><p className="text-sm text-slate-400">{p.details}</p></div>
                        <div className="flex gap-1"><span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.impact === 'high' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{p.impact}</span></div>
                    </div>
                ))}</div>
            </div>
        )}
    </>)
}


// ── Shared sub-components ─────────────────────────────────────────────────

function ActionBucket({ title, items, color }) {
    return (
        <div className={`glass-panel rounded-2xl p-5 border border-${color}-500/10`}>
            <h4 className="text-sm font-bold text-white mb-3">{title}</h4>
            <div className="space-y-2">{(items || []).map((item, i) => (
                <div key={i} className="p-2 rounded-lg bg-white/3">
                    <p className="text-[11px] font-bold text-white">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.description || item.keyword || item.metric}</p>
                </div>
            ))}</div>
        </div>
    )
}

function IssueCard({ issue }) {
    const [expanded, setExpanded] = useState(false)
    return (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04] transition-all" onClick={() => setExpanded(!expanded)}>
            <div className="flex items-center gap-3">
                <SeverityBadge severity={issue.severity} />
                <span className={`text-xs px-1.5 py-0.5 rounded-full bg-white/5 text-slate-500`}>{issue.category}</span>
                <p className="text-sm text-white font-medium flex-1">{issue.title}</p>
                <span className="material-symbols-outlined text-slate-600 text-sm">{expanded ? 'expand_less' : 'expand_more'}</span>
            </div>
            {expanded && (
                <div className="mt-3 ml-6 space-y-2 animate-fade-in">
                    <p className="text-[11px] text-slate-400">{issue.description}</p>
                    {issue.impact && <p className="text-[11px] text-amber-400">⚡ Impact: {issue.impact}</p>}
                    {issue.fix && <p className="text-[11px] text-emerald-400">✓ Fix: {issue.fix}</p>}
                    {issue.effort && <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${issue.effort === 'quick-fix' ? 'bg-emerald-500/10 text-emerald-400' : issue.effort === 'moderate' ? 'bg-amber-500/10 text-amber-400' : 'bg-rose-500/10 text-rose-400'}`}>{issue.effort}</span>}
                </div>
            )}
        </div>
    )
}


// ══════════════════════════════════════════════════════════════════════════
// WAR ROOM RESULTS
// ══════════════════════════════════════════════════════════════════════════

function WarRoomResults({ results }) {
    const r = results
    const VERDICT_COLORS = { 'winning': 'emerald', 'competitive': 'blue', 'behind': 'amber', 'far-behind': 'rose' }
    const verdictColor = VERDICT_COLORS[r.overallVerdict] || 'slate'

    return (
        <div className="space-y-6">
            {/* Executive Summary */}
            <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                    <span className="material-symbols-outlined text-rose-400 text-2xl">shield</span>
                    <h2 className="text-xl font-black text-white">Competitor War Room</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold bg-${verdictColor}-500/15 text-${verdictColor}-400 uppercase`}>{r.overallVerdict}</span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{r.executiveSummary}</p>
            </div>

            {/* Scoring Matrix */}
            {r.brandScore && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-primary">grid_view</span> Scoring Matrix</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-500 text-xs text-left">
                                    <th className="p-2">Entity</th>
                                    {['technical', 'content', 'schema', 'aiReadiness', 'authority', 'overall'].map(k => (
                                        <th key={k} className="p-2 text-center capitalize">{k.replace('aiReadiness', 'AI Ready')}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-t border-white/5">
                                    <td className="p-2 text-white font-bold flex items-center gap-1"><span className="material-symbols-outlined text-primary text-xs">star</span> Your Brand</td>
                                    {['technical', 'content', 'schema', 'aiReadiness', 'authority', 'overall'].map(k => (
                                        <td key={k} className="p-2 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${r.brandScore[k] >= 70 ? 'bg-emerald-400/10 text-emerald-400' : r.brandScore[k] >= 40 ? 'bg-amber-400/10 text-amber-400' : 'bg-rose-400/10 text-rose-400'}`}>{r.brandScore[k]}</span>
                                        </td>
                                    ))}
                                </tr>
                                {r.competitorScores?.map((c, i) => (
                                    <tr key={i} className="border-t border-white/5">
                                        <td className="p-2 text-slate-300 font-medium">{c.name}</td>
                                        {['technical', 'content', 'schema', 'aiReadiness', 'authority', 'overall'].map(k => (
                                            <td key={k} className="p-2 text-center">
                                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${c.scores?.[k] >= 70 ? 'bg-emerald-400/10 text-emerald-400' : c.scores?.[k] >= 40 ? 'bg-amber-400/10 text-amber-400' : 'bg-rose-400/10 text-rose-400'}`}>{c.scores?.[k] || '—'}</span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Keyword Battles */}
            {r.keywordBattles?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-amber-400">flash_on</span> Keyword Battles</h3>
                    <div className="space-y-3">
                        {r.keywordBattles.map((kb, i) => (
                            <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-white">{kb.keyword}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${kb.priority === 'critical' ? 'bg-rose-400/10 text-rose-400' : kb.priority === 'high' ? 'bg-amber-400/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>{kb.priority}</span>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${kb.brandPosition === 'dominant' || kb.brandPosition === 'strong' ? 'bg-emerald-400/10 text-emerald-400' : kb.brandPosition === 'absent' ? 'bg-rose-400/10 text-rose-400' : 'bg-amber-400/10 text-amber-400'}`}>You: {kb.brandPosition}</span>
                                </div>
                                {kb.competitors?.map((c, j) => (
                                    <p key={j} className="text-[11px] text-slate-500"><span className="text-slate-400 font-bold">{c.name}</span>: {c.position} — {c.whyTheyRank}</p>
                                ))}
                                <p className="text-xs text-primary mt-1 font-medium">→ {kb.winStrategy}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Offensive Playbook */}
            {r.offensivePlaybook?.length > 0 && (
                <ActionBucket title="🗡️ Offensive Playbook" items={r.offensivePlaybook.map(a => ({
                    title: `#${a.priority} ${a.action}`,
                    description: `Target: ${a.target} | Timeline: ${a.timeline} | Impact: ${a.expectedImpact}`
                }))} color="rose" />
            )}

            {/* Defensive Playbook */}
            {r.defensivePlaybook?.length > 0 && (
                <ActionBucket title="🛡️ Defensive Playbook" items={r.defensivePlaybook.map(a => ({
                    title: a.risk, description: `Defense: ${a.defense} | Urgency: ${a.urgency}`
                }))} color="amber" />
            )}

            {/* 90-Day Plan */}
            {r.ninety_day_battleplan && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-cyan-400">calendar_month</span> 90-Day Battle Plan</h3>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{r.ninety_day_battleplan}</p>
                </div>
            )}
        </div>
    )
}


// ══════════════════════════════════════════════════════════════════════════
// LLM BRAND PROBE RESULTS
// ══════════════════════════════════════════════════════════════════════════

function LLMProbeResults({ results }) {
    const r = results
    return (
        <div className="space-y-6">
            {/* Visibility Dashboard */}
            <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-cyan-400 text-2xl">psychology</span>
                    <h2 className="text-xl font-black text-white">LLM Brand Probe — {r.brandName}</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-4 rounded-xl bg-white/[0.03]">
                        <ScoreRing score={r.visibilityScore} size={70} label="Visibility" color={r.visibilityScore >= 50 ? 'emerald' : r.visibilityScore >= 25 ? 'amber' : 'rose'} />
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/[0.03]">
                        <ScoreRing score={r.sentimentScore} size={70} label="Sentiment" color={r.sentimentScore >= 50 ? 'emerald' : 'amber'} />
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/[0.03]">
                        <p className="text-3xl font-black text-white">{r.mentionCount}<span className="text-lg text-slate-500">/{r.totalProbes}</span></p>
                        <p className="text-xs text-slate-500 mt-1">Mentions</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-white/[0.03]">
                        <p className="text-sm font-bold text-slate-400">{r.industry}</p>
                        <p className="text-xs text-slate-600">{r.location}</p>
                    </div>
                </div>
            </div>

            {/* Probe Results */}
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-cyan-400">quiz</span> Probe Results</h3>
                <div className="space-y-3">
                    {r.probeResults?.map((p, i) => (
                        <div key={i} className={`p-4 rounded-xl border transition-all ${p.mentioned ? 'bg-emerald-400/5 border-emerald-400/20' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm text-white font-medium">"{p.prompt}"</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.mentioned ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'}`}>
                                    {p.mentioned ? '✓ MENTIONED' : '✗ NOT FOUND'}
                                </span>
                            </div>
                            {p.mentioned && <p className="text-xs text-slate-500">Sentiment: <span className={`font-bold ${p.sentiment === 'positive' ? 'text-emerald-400' : p.sentiment === 'mixed' ? 'text-amber-400' : 'text-slate-400'}`}>{p.sentiment}</span> | Position: {p.position}</p>}
                            {p.competitorsMentioned?.length > 0 && <p className="text-xs text-amber-400 mt-1">⚠ Competitors also cited: {p.competitorsMentioned.join(', ')}</p>}
                            {p.responseSnippet && <p className="text-xs text-slate-600 mt-2 italic line-clamp-2">{p.responseSnippet}</p>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Strategic Analysis */}
            {r.strategicAnalysis && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-violet-400">strategy</span> Strategic Analysis</h3>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{r.strategicAnalysis}</p>
                </div>
            )}

            {/* Improvement Actions */}
            {r.improvementActions?.length > 0 && (
                <ActionBucket title="🎯 How to Get Cited" items={r.improvementActions.map(a => ({
                    title: `#${a.priority} ${a.action}`, description: `${a.why} → ${a.expectedOutcome}`
                }))} color="cyan" />
            )}

            {/* Content to Create */}
            {r.contentToCreate?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-3">📝 Content to Create for AI Citation</h3>
                    <div className="space-y-2">
                        {r.contentToCreate.map((c, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.03]">
                                <span className="text-cyan-400 text-xs mt-0.5">▸</span>
                                <p className="text-sm text-slate-300">{c}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}


// ══════════════════════════════════════════════════════════════════════════
// AUTO-FIX RESULTS
// ══════════════════════════════════════════════════════════════════════════

function AutoFixResults({ results }) {
    const r = results
    const [copiedIdx, setCopiedIdx] = useState(null)

    const copyCode = (code, idx) => {
        navigator.clipboard.writeText(code)
        setCopiedIdx(idx)
        setTimeout(() => setCopiedIdx(null), 2000)
    }

    return (
        <div className="space-y-6">
            <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-teal-400 text-2xl">build</span>
                    <h2 className="text-xl font-black text-white">Auto-Fix — Ready-to-Implement</h2>
                </div>
                {r.priorityOrder && <p className="text-sm text-slate-400 mb-4">{r.priorityOrder}</p>}
            </div>

            {/* Combined Schema Block */}
            {r.combinedSchemaBlock && (
                <div className="glass-panel rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-base font-bold text-white flex items-center gap-2"><span className="material-symbols-outlined text-sm text-violet-400">data_object</span> Combined Schema Block</h3>
                        <button onClick={() => copyCode(r.combinedSchemaBlock, 'combined')} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 cursor-pointer transition-all">
                            {copiedIdx === 'combined' ? '✓ Copied!' : 'Copy All Schema'}
                        </button>
                    </div>
                    <pre className="bg-[#0a0d1a] rounded-xl p-4 overflow-x-auto text-xs text-slate-300 font-mono border border-white/5">{r.combinedSchemaBlock}</pre>
                </div>
            )}

            {/* Individual Fixes */}
            {r.fixes?.map((fix, i) => (
                <div key={i} className="glass-panel rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <SeverityBadge severity={fix.severity} />
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-400/10 text-teal-400 font-bold">{fix.fixType}</span>
                            <h4 className="text-sm font-bold text-white">{fix.issueTitle}</h4>
                        </div>
                        <span className="text-xs text-slate-500">{fix.effort}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">{fix.description}</p>

                    {/* Code Block */}
                    <div className="relative mb-3">
                        <button onClick={() => copyCode(fix.code, i)}
                            className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-white/10 text-xs text-slate-300 hover:bg-primary/20 hover:text-primary cursor-pointer transition-all z-10">
                            {copiedIdx === i ? '✓ Copied!' : 'Copy'}
                        </button>
                        <pre className="bg-[#0a0d1a] rounded-xl p-4 overflow-x-auto text-xs text-emerald-300 font-mono border border-white/5 max-h-60">{fix.code}</pre>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                        <span>📍 {fix.implementationGuide}</span>
                        <span>📈 {fix.expectedImpact}</span>
                    </div>
                </div>
            ))}
        </div>
    )
}


// ══════════════════════════════════════════════════════════════════════════
// PROMPT MINING RESULTS
// ══════════════════════════════════════════════════════════════════════════

function PromptMiningResults({ results }) {
    const r = results
    const VIS_COLORS = { 'likely-cited': 'emerald', 'possibly-cited': 'amber', 'unlikely-cited': 'orange', 'definitely-not-cited': 'rose' }

    return (
        <div className="space-y-6">
            {/* Summary Dashboard */}
            <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-orange-400 text-2xl">chat_bubble</span>
                    <h2 className="text-xl font-black text-white">AI Prompt Mining — {r.industry}</h2>
                </div>
                {r.visibilitySummary && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="text-center p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/10">
                            <p className="text-2xl font-black text-emerald-400">{r.visibilitySummary.likelyCitedCount}</p>
                            <p className="text-[10px] text-slate-500 font-bold">LIKELY CITED</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-amber-400/5 border border-amber-400/10">
                            <p className="text-2xl font-black text-amber-400">{r.visibilitySummary.possiblyCitedCount}</p>
                            <p className="text-[10px] text-slate-500 font-bold">POSSIBLY CITED</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-rose-400/5 border border-rose-400/10">
                            <p className="text-2xl font-black text-rose-400">{r.visibilitySummary.unlikelyCitedCount}</p>
                            <p className="text-[10px] text-slate-500 font-bold">UNLIKELY CITED</p>
                        </div>
                        <div className="text-center p-3 rounded-xl bg-white/[0.03]">
                            <p className={`text-lg font-bold ${r.visibilitySummary.overallReadiness === 'ready' ? 'text-emerald-400' : r.visibilitySummary.overallReadiness === 'partially-ready' ? 'text-amber-400' : 'text-rose-400'}`}>{r.visibilitySummary.overallReadiness?.replace('-', ' ').toUpperCase()}</p>
                            <p className="text-[10px] text-slate-500 font-bold">READINESS</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Prompt Categories */}
            {r.promptCategories?.map((cat, ci) => (
                <div key={ci} className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-orange-400">category</span> {cat.category}
                    </h3>
                    <div className="space-y-3">
                        {cat.prompts?.map((p, pi) => {
                            const visColor = VIS_COLORS[p.currentVisibility] || 'slate'
                            return (
                                <div key={pi} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm text-white font-medium flex-1">"{p.prompt}"</p>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-2 whitespace-nowrap bg-${visColor}-400/10 text-${visColor}-400`}>{p.currentVisibility?.replace(/-/g, ' ')}</span>
                                    </div>
                                    <p className="text-xs text-slate-500 mb-1">{p.whyOrWhyNot}</p>
                                    <p className="text-xs text-primary font-medium">→ {p.actionableStrategy}</p>
                                    {p.competitorsLikelyCited?.length > 0 && <p className="text-[10px] text-amber-400 mt-1">Competitors: {p.competitorsLikelyCited.join(', ')}</p>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}

            {/* Priority Actions */}
            {r.topPriorityActions?.length > 0 && (
                <ActionBucket title="🎯 Top Priority Actions" items={r.topPriorityActions.map(a => ({
                    title: `#${a.priority} ${a.action}`,
                    description: `Covers ${a.promptsCovered} prompts | Effort: ${a.effort} | ${a.expectedOutcome}`
                }))} color="orange" />
            )}

            {/* Content Calendar */}
            {r.contentCalendar?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-blue-400">event</span> Content Calendar</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {r.contentCalendar.map((w, i) => (
                            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <p className="text-xs text-primary font-bold mb-1">WEEK {w.week}</p>
                                <p className="text-sm text-white font-bold mb-1">{w.content}</p>
                                <p className="text-xs text-slate-500">Format: {w.format} | Targets: {w.targetPrompts?.join(', ').substring(0, 80)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

import { useState, useRef, useEffect } from 'react'
import SEOHead from '../components/SEOHead'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import { useBrand } from '../context/BrandContext'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { seoStudio as seoAPI, googleAnalytics as gaAPI } from '../services/api'
import StudioReportButton from '../components/reports/StudioReportButton'
import SeoAdvancedTools from '../components/seo/SeoAdvancedTools'

import GlobalLoader from '../components/GlobalLoader'

// ── Sidebar Navigation ────────────────────────────────────────────────────
const SIDEBAR_SECTIONS = [
    { title: 'Quick Actions', items: [
        { id: 'health-check', icon: 'health_and_safety', label: 'Health Check', desc: 'Full SEO + AI audit', color: '#10b981', creditAction: 'seoHealthCheck', type: 'workflow' },
        { id: 'traffic', icon: 'trending_up', label: 'Get Me Traffic', desc: 'Keywords & gaps', color: '#3b82f6', creditAction: 'seoTraffic', type: 'workflow' },
        { id: 'ai-visibility', icon: 'smart_toy', label: 'AI Visibility', desc: 'AI search opt.', color: '#8b5cf6', creditAction: 'seoAiVisibility', type: 'workflow' },
    ]},
    { title: 'Audit & Fix', items: [
        { id: 'site-audit', icon: 'bug_report', label: 'Site Audit', desc: 'Technical audit', color: '#f43f5e', type: 'advanced' },
        { id: 'on-page', icon: 'tune', label: 'On-Page Fixer', desc: 'Page-level fixes', color: '#06b6d4', type: 'advanced' },
        { id: 'auto-fix', icon: 'build', label: 'Auto-Fix Code', desc: 'Copy-paste fixes', color: '#14b8a6', creditAction: 'seoAuditPage', type: 'workflow' },
    ]},
    { title: 'Intelligence', items: [
        { id: 'keywords', icon: 'key', label: 'Keywords', desc: 'Keyword research', color: '#f59e0b', type: 'advanced' },
        { id: 'content-ops', icon: 'article', label: 'Content Gaps', desc: 'Opportunities', color: '#10b981', type: 'advanced' },
        { id: 'geo', icon: 'travel_explore', label: 'GEO — AI Search', desc: 'Gen. engine opt.', color: '#6366f1', type: 'advanced' },
        { id: 'llm-probe', icon: 'psychology', label: 'LLM Probe', desc: 'AI brand check', color: '#06b6d4', creditAction: 'seoAiVisibility', type: 'workflow' },
        { id: 'prompt-mining', icon: 'chat_bubble', label: 'Prompt Mining', desc: 'AI citation prompts', color: '#f97316', creditAction: 'seoAiVisibility', type: 'workflow' },
    ]},
    { title: 'Competitors', items: [
        { id: 'competitors', icon: 'swords', label: 'Beat Competitors', desc: 'Gap & outrank', color: '#f59e0b', creditAction: 'seoCompetitors', type: 'workflow' },
        { id: 'competitor-warroom', icon: 'shield', label: 'War Room', desc: '90-day battle plan', color: '#f43f5e', creditAction: 'seoCompetitors', type: 'workflow' },
        { id: 'competitor-detail', icon: 'groups', label: 'Competitor Intel', desc: 'Deep comparison', color: '#a855f7', type: 'advanced' },
    ]},
    { title: 'Link Building', items: [
        { id: 'backlinks', icon: 'link', label: 'Backlinks', desc: 'Backlink intel', color: '#3b82f6', type: 'advanced' },
    ]},
    { title: 'Reports', items: [
        { id: 'overview', icon: 'space_dashboard', label: 'Overview', desc: 'All SEO metrics', color: '#8b5cf6', type: 'advanced' },
        { id: 'reports', icon: 'summarize', label: 'Reports & Plans', desc: 'Generated reports', color: '#64748b', type: 'advanced' },
    ]},
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

    // Navigation — single active section drives all content
    const [activeSection, setActiveSection] = useState('overview')
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [showGuide, setShowGuide] = useState(false)
    const [showSetup, setShowSetup] = useState(false)

    // Competitor management
    const [competitors, setCompetitors] = useState(activeBrand?.competitors || [])
    const [newCompUrl, setNewCompUrl] = useState('')
    const [compLoading, setCompLoading] = useState(false)

    // Input state
    const [askQuery, setAskQuery] = useState('')

    // Results state
    const [loading, setLoading] = useState(false)
    const [loadingStage, setLoadingStage] = useState('')
    const [loadingElapsed, setLoadingElapsed] = useState(0)
    const [results, setResults] = useState(null)
    const [askResult, setAskResult] = useState(null)
    const [error, setError] = useState('')
    const abortRef = useRef(null)
    const elapsedTimerRef = useRef(null)

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
        'health-check': ['Crawling your website (800+ pages)...', 'Discovering pages from sitemap...', 'Deep-crawling subpages (batch 1/70)...', 'Analyzing page structure & meta tags...', 'Probing internal links for broken URLs...', 'Detecting duplicate content & headings...', 'Checking schema & structured data...', 'Running AI SEO analysis...', 'Building action plan & trend deltas...'],
        'traffic': ['Crawling your website content...', 'Analyzing existing topics & gaps...', 'Researching keyword opportunities...', 'Building traffic strategy...'],
        'competitors': ['Crawling your website...', 'Researching competitor sites...', 'Comparing content & structure...', 'Building outrank plan...'],
        'ai-visibility': ['Crawling your website...', 'Checking schema & JSON-LD...', 'Analyzing heading structure & FAQs...', 'Evaluating AI discoverability...', 'Generating optimization templates...'],
        'competitor-warroom': ['Crawling your website...', 'Crawling competitor sites in parallel...', 'Building scoring matrix...', 'Analyzing keyword battles...', 'Creating 90-day battle plan...'],
        'llm-probe': ['Preparing brand probes...', 'Asking AI Model 1 about your brand...', 'Asking AI Model 2 about your brand...', 'Analyzing mention patterns...', 'Scoring visibility & sentiment...', 'Generating strategic analysis...'],
        'auto-fix': ['Analyzing issues...', 'Generating code fixes...', 'Building schema blocks...', 'Creating implementation guide...'],
        'prompt-mining': ['Analyzing your industry...', 'Mining AI prompt patterns...', 'Scoring visibility per prompt...', 'Building content calendar...'],
    }

    const cancelWorkflow = () => {
        if (abortRef.current) abortRef.current.abort()
        clearInterval(elapsedTimerRef.current)
        setLoading(false); setLoadingStage(''); setLoadingElapsed(0)
    }

    // Cleanup on unmount
    useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); clearInterval(elapsedTimerRef.current) }, [])

    // ── Auto-load saved results when switching to a workflow section ──
    const [savedAt, setSavedAt] = useState(null)
    useEffect(() => {
        const WORKFLOW_IDS = ['health-check', 'traffic', 'competitors', 'ai-visibility', 'competitor-warroom', 'llm-probe', 'auto-fix', 'prompt-mining']
        if (!activeBrand?._id || !WORKFLOW_IDS.includes(activeSection)) return
        // Don't overwrite if user literally just generated fresh results
        if (results && !savedAt) return

        let cancelled = false
        setResults(null); setSavedAt(null)
        seoAPI.getSavedReport(activeBrand._id, activeSection)
            .then(data => {
                if (cancelled) return
                if (data?.found && data.report) {
                    setResults({ success: true, ...data.report })
                    setSavedAt(data.generatedAt)
                }
            })
            .catch(() => { /* silently fail — just means no saved data */ })
        return () => { cancelled = true }
    }, [activeSection, activeBrand?._id])

    const runWorkflow = async (workflowId) => {
        if (!website) { setError('No website URL found. Please add a website to your brand.'); return }
        // Cancel any running workflow first
        if (abortRef.current) abortRef.current.abort()
        clearInterval(elapsedTimerRef.current)

        setError(''); setResults(null); setSavedAt(null); setLoading(true); setLoadingElapsed(0)

        const stages = STAGE_MESSAGES[workflowId] || ['Processing...']
        let stageIdx = 0
        setLoadingStage(stages[0])
        const stageInterval = setInterval(() => { stageIdx = Math.min(stageIdx + 1, stages.length - 1); setLoadingStage(stages[stageIdx]) }, 8000)
        elapsedTimerRef.current = setInterval(() => setLoadingElapsed(prev => prev + 1), 1000)

        try {
            const payload = { url: website, brand: brandPayload, brandId: activeBrand?._id, country: activeBrand?.dna?.country || 'India', industry: activeBrand?.dna?.industry }
            if (workflowId === 'competitors' || workflowId === 'competitor-warroom') payload.competitorUrls = competitors.map(c => c.url).filter(Boolean)

            // Auto-fix needs previous issues
            if (workflowId === 'auto-fix') {
                console.log('🛠️ [SeoStudio] Auto-fix triggered. Checking issues in memory...', results?.issues?.length || 0)
                let lastIssues = results?.issues || []
                // If no issues in memory, try fetching saved health-check report
                if (lastIssues.length === 0) {
                    try {
                        console.log(`🔍 [SeoStudio] No issues in memory. Fetching saved 'health-check' report for brand: ${activeBrand._id}`)
                        const saved = await seoAPI.getSavedReport(activeBrand._id, 'health-check')
                        console.log('📡 [SeoStudio] Health-check fetch result:', saved)
                        if (saved?.found && saved.report?.issues?.length > 0) {
                            lastIssues = saved.report.issues
                            console.log('✅ [SeoStudio] Found issues in saved report:', lastIssues.length)
                        } else {
                            console.warn('⚠️ [SeoStudio] No saved health-check report found or it has no issues.')
                        }
                    } catch (err) { 
                        console.error('❌ [SeoStudio] Error fetching saved health-check:', err.message)
                    }
                }
                if (lastIssues.length === 0) { 
                    console.error('🛑 [SeoStudio] Blocking execution: No issues found for Auto-Fix.')
                    setError('Run a Health Check first to find issues, then use Auto-Fix.'); 
                    setLoading(false); clearInterval(stageInterval); clearInterval(elapsedTimerRef.current); return 
                }
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
                    try {
                        const newComps = data.discoveredCompetitors.map(c => ({ name: c.name, url: c.url, addedBy: 'ai' }));
                        setCompetitors(prev => {
                            const urls = new Set(prev.map(p => p.url));
                            return [...prev, ...newComps.filter(n => !urls.has(n.url))].slice(0, 8);
                        });
                    } catch { }
                }
            } else setError(data.error || 'Analysis failed')
        } catch (e) {
            if (e.name !== 'AbortError') setError(e.message)
        }
        finally { clearInterval(stageInterval); clearInterval(elapsedTimerRef.current); setLoading(false); setLoadingElapsed(0) }
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

    // Determine what the content panel should show
    const WORKFLOW_IDS = ['health-check', 'traffic', 'competitors', 'ai-visibility', 'competitor-warroom', 'llm-probe', 'auto-fix', 'prompt-mining']
    const isWorkflow = WORKFLOW_IDS.includes(activeSection)
    const isAdvanced = !isWorkflow
    const currentItem = SIDEBAR_SECTIONS.flatMap(s => s.items).find(i => i.id === activeSection)

    // ── PDF Download ───────────────────────────────────────────────────────
    const downloadSeoPdf = (type, data, brand) => {
        const title = { 'health-check': 'SEO Health Check', 'traffic': 'Traffic Strategy', 'competitors': 'Competitor Analysis', 'ai-visibility': 'AI Visibility Audit', 'competitor-warroom': 'Competitor War Room', 'llm-probe': 'LLM Brand Probe', 'auto-fix': 'Auto-Fix Report', 'prompt-mining': 'Prompt Mining' }[type] || 'SEO Report'
        const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
        const brandName = brand?.name || 'Brand'
        const brandLogo = brand?.dna?.logo?.url || ''
        const brandWebsite = brand?.website || ''
        const appOrigin = window.location.origin
        const mantramLogo = `${appOrigin}/mantram-logo.png`

        // Score color grading
        const scoreColor = (s) => s >= 80 ? '#16a34a' : s >= 60 ? '#f59e0b' : s >= 40 ? '#f97316' : '#e11d48'
        const scoreGrade = (s) => s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : 'D'

        // ── Build Cover Page — Dedicated First Page with Dual Branding ──
        let body = `
        <div class="cover-page">
            <div class="cover-gradient">
                <div class="cover-logos">
                    <div class="cover-mantram">
                        <img src="${mantramLogo}" class="cover-mantram-logo" alt="Mantram AI" onerror="this.style.display='none'" />
                        <span class="cover-mantram-label">Mantram AI</span>
                    </div>
                    <span class="cover-x">×</span>
                    <div class="cover-brand">
                        ${brandLogo ? `<img src="${brandLogo}" class="cover-brand-logo" alt="${brandName}" onerror="this.style.display='none'" />` : `<div class="cover-brand-initial">${brandName.charAt(0)}</div>`}
                        <span class="cover-brand-name">${brandName}</span>
                    </div>
                </div>
                <div class="cover-title-block">
                    <h1 class="cover-title">${title}</h1>
                    <p class="cover-subtitle">${brandWebsite}</p>
                </div>
                <div class="cover-meta">
                    <span class="cover-date">${date}</span>
                    <span class="cover-confidential">Confidential</span>
                </div>
                <div class="cover-powered">Powered by Mantram AI — SEO Studio</div>
            </div>
        </div>
        <div class="section-break"></div>

        <div class="report-masthead">
            <div class="masthead-bar">
                <div class="masthead-left">
                    <img src="${mantramLogo}" class="mantram-header-logo" alt="Mantram AI" onerror="this.style.display='none'" />
                    <span class="masthead-divider">|</span>
                    <span class="masthead-studio">SEO Studio</span>
                </div>
                <div class="masthead-right">
                    ${brandLogo ? `<img src="${brandLogo}" class="masthead-brand-logo" alt="${brandName}" onerror="this.style.display='none'" />` : ''}
                    <span class="masthead-brand-name">${brandName}</span>
                    <span class="masthead-date">${date}</span>
                </div>
            </div>
        </div>
        <div class="report-header">
            <div class="header-left">
                ${brandLogo ? `<img src="${brandLogo}" class="brand-logo" alt="${brandName}" />` : `<div class="brand-initial">${brandName.charAt(0)}</div>`}
                <div>
                    <h1 class="brand-name">${brandName}</h1>
                    <p class="brand-url">${brandWebsite}</p>
                </div>
            </div>
            <div class="header-right">
                <div class="report-badge">${title}</div>
                <p class="report-date">Report generated ${date}</p>
            </div>
        </div>
        <div class="divider"></div>`

        // ── Executive Summary ──
        body += `<div class="exec-summary">
            <div class="exec-label">EXECUTIVE SUMMARY</div>
            <p class="exec-text">${data.summary || ''}</p>
        </div>`

        // Scores for health-check
        if (type === 'health-check') {
            body += `<div class="scores">`
            const td = data.trendDelta || {}
            ;[['SEO Health', data.seoHealthScore, '🏥', td.scoreChange], ['AI Visibility', data.aiVisibilityScore, '🤖', null], ['Technical', data.technicalScore, '⚙️', td.technicalChange], ['Content', data.contentScore, '📝', td.contentChange], ['Authority', data.authorityScore, '🏛️', td.authorityChange]].forEach(([l, s, icon, delta]) => {
                if (s !== undefined) {
                    const c = scoreColor(s)
                    const trendArrow = delta ? (delta > 0 ? `<span class="trend-up">▲${Math.abs(delta)}</span>` : delta < 0 ? `<span class="trend-down">▼${Math.abs(delta)}</span>` : '') : ''
                    body += `<div class="score-card">
                        <div class="score-ring" style="--score:${s};--color:${c}">
                            <span class="score-num">${s}</span>
                        </div>
                        <div class="score-label">${l}</div>
                        <div class="score-grade" style="color:${c}">${scoreGrade(s)} ${trendArrow}</div>
                    </div>`
                }
            })
            body += `</div>`

            // Strategic Brief
            if (data.strategicBrief) {
                body += `<div class="strategic-brief">
                    <div class="brief-header"><span class="brief-icon">📊</span> Strategic Brief</div>
                    <p>${data.strategicBrief}</p>
                </div>`
            }

            // Crawl Intelligence
            const stats = data.siteStats || {}
            if (stats.pagesCrawled) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">🕷️</span> Crawl Intelligence</h2><div class="stats-grid">`
                ;[
                    ['Pages Crawled', stats.pagesCrawled, '📄'],
                    ['Avg Response', `${stats.responseTimeAvg || 0}ms`, '⏱️'],
                    ['Avg Page Size', `${stats.pageSizeAvg || 0}KB`, '📦'],
                    ['Thin Pages', stats.thinPageCount || 0, '📃'],
                    ['Orphan Pages', stats.orphanPageCount || 0, '🔗'],
                    ['Security', stats.securityHeaderScore || '0/7', '🔒'],
                    ['Avg Words', stats.avgWordCount || 0, '📝'],
                    ['Mixed Content', stats.mixedContentCount || 0, '⚠️'],
                    ['Redirect Chains', stats.redirectChainCount || 0, '🔀'],
                    ['Duplicates', stats.duplicateContentCount || 0, '📋'],
                    ['Noindex', stats.noindexPageCount || 0, '🚫'],
                    ['Long URLs', stats.urlTooLongCount || 0, '🔗'],
                    ['Broken External', stats.brokenExternalCount || 0, '💔'],
                    ['Empty Anchors', stats.emptyAnchorCount || 0, '⚓'],
                    ['Nofollow Internal', stats.nofollowInternalCount || 0, '🔇'],
                    ['Canon. Conflicts', stats.conflictingCanonicalCount || 0, '⚡'],
                    ['Browser Cache', stats.cacheControlPresent ? '✅ Yes' : '❌ No', '💾'],
                    ['llms.txt', stats.llmsTxtFound ? '✅ Found' : '❌ Missing', '🤖'],
                    // Moz Domain Authority
                    ...(stats.mozAvailable ? [
                        ['Domain Auth.', stats.domainAuthority || 0, '🏛️'],
                        ['Page Auth.', stats.pageAuthority || 0, '📄'],
                        ['Spam Score', `${stats.spamScore || 0}%`, '🛡️'],
                    ] : []),
                    // DataForSEO Backlinks
                    ...(stats.backlinkDataAvailable ? [
                        ['Total Backlinks', (stats.totalBacklinks || 0).toLocaleString(), '🔗'],
                        ['Referring Domains', (stats.referringDomains || 0).toLocaleString(), '🌐'],
                    ] : []),
                ].forEach(([l, v, icon]) => {
                    const isAlert = (typeof v === 'number' && v > 0 && ['Thin Pages', 'Orphan Pages', 'Mixed Content', 'Duplicates', 'Broken External', 'Empty Anchors', 'Long URLs', 'Canon. Conflicts', 'Nofollow Internal'].includes(l))
                    body += `<div class="stat-card ${isAlert ? 'stat-alert' : ''}">
                        <div class="stat-icon">${icon}</div>
                        <div class="stat-value">${v}</div>
                        <div class="stat-label">${l}</div>
                    </div>`
                })
                body += `</div>`

                // Resource Scanning
                if (stats.blockedResourceCount || stats.uncachedResourceCount || stats.unminifiedResourceCount) {
                    body += `<div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-top:8px">`
                    ;[['Blocked Resources', stats.blockedResourceCount || 0, '🚫'], ['Uncached JS/CSS', stats.uncachedResourceCount || 0, '💾'], ['Unminified JS/CSS', stats.unminifiedResourceCount || 0, '📦']].forEach(([l, v, icon]) => {
                        body += `<div class="stat-card ${v > 0 ? 'stat-alert' : ''}"><div class="stat-icon">${icon}</div><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`
                    })
                    body += `</div>`
                }

                // Page Status Distribution
                const psd = stats.pageStatusDistribution || {}
                if (psd.status200 || psd.status301 || psd.status404 || psd.status5xx) {
                    body += `<div class="status-bar">`
                    if (psd.status200) body += `<span class="status-pill status-2xx">${psd.status200} × 2xx</span>`
                    if (psd.status301) body += `<span class="status-pill status-3xx">${psd.status301} × 3xx</span>`
                    if (psd.status404) body += `<span class="status-pill status-4xx">${psd.status404} × 404</span>`
                    if (psd.status5xx) body += `<span class="status-pill status-5xx">${psd.status5xx} × 5xx</span>`
                    body += `</div>`
                }
            }

            // Security Headers
            if (stats.securityHeaders?.length) {
                body += `<h2><span class="h2-icon">🔒</span> Security Headers</h2><div class="stats-grid">`
                stats.securityHeaders.forEach(h => {
                    body += `<div class="stat-card" style="background:${h.present ? '#f0fdf4' : '#fef2f2'}"><div class="stat-value" style="font-size:20px">${h.present ? '✅' : '❌'}</div><div class="stat-label">${h.name}</div></div>`
                })
                body += `</div>`
            }

            // Action Buckets
            const hasActions = data.fixNow?.length || data.createNext?.length || data.monitor?.length
            if (hasActions) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">🎯</span> Action Plan</h2><div class="action-grid">`
                if (data.fixNow?.length) {
                    body += `<div class="action-card action-fix"><div class="action-header"><span>🔧</span> Fix Now</div><ul>`
                    data.fixNow.forEach(f => { body += `<li><strong>${typeof f === 'string' ? f : f.title}</strong>${f.description ? `<br><small>${f.description}</small>` : ''}</li>` })
                    body += `</ul></div>`
                }
                if (data.createNext?.length) {
                    body += `<div class="action-card action-create"><div class="action-header"><span>✏️</span> Create Next</div><ul>`
                    data.createNext.forEach(c => { body += `<li><strong>${typeof c === 'string' ? c : c.title}</strong>${c.reason ? `<br><small>${c.reason}</small>` : ''}</li>` })
                    body += `</ul></div>`
                }
                if (data.monitor?.length) {
                    body += `<div class="action-card action-monitor"><div class="action-header"><span>👁️</span> Monitor</div><ul>`
                    data.monitor.forEach(m => { body += `<li><strong>${typeof m === 'string' ? m : m.title}</strong>${m.metric ? `<br><small>${m.metric}</small>` : ''}</li>` })
                    body += `</ul></div>`
                }
                body += `</div>`
            }

            // Per-Page Report Cards
            const pr = data.pageReports || []
            if (pr.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">📄</span> Per-Page Analysis <span class="count-badge">${pr.length} pages</span></h2>
                <table><thead><tr><th style="width:40%">Page</th><th>Response</th><th>Size</th><th>Words</th><th>Issues</th></tr></thead><tbody>`
                pr.forEach((p, i) => {
                    const issues = []
                    if (!p.hasH1) issues.push('No H1')
                    if (p.h1Count > 1) issues.push(`${p.h1Count} H1s`)
                    if (!p.headingHierarchyValid) issues.push('Heading Skip')
                    if (p.titleLength === 0) issues.push('No Title')
                    if (p.titleLength > 60) issues.push('Title Long')
                    if (p.metaDescLength === 0) issues.push('No Meta')
                    if (p.wordCount < 300 && p.wordCount > 0) issues.push('Thin')
                    if (p.responseTimeMs > 3000) issues.push('Slow')
                    body += `<tr class="${i % 2 ? 'alt-row' : ''}"><td><strong>${(p.title || 'Untitled').substring(0, 45)}</strong><br><small>${(p.url || '').substring(0, 65)}</small></td><td>${p.responseTimeMs}ms</td><td>${p.pageSizeKB}KB</td><td>${p.wordCount}</td><td>${issues.length ? `<span class="issue-pill">${issues.join(', ')}</span>` : '<span class="ok-pill">✅ OK</span>'}</td></tr>`
                })
                body += `</tbody></table>`
            }

            // Algorithm Risks
            if (data.algorithmRisks?.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">⚠️</span> Algorithm Risk Assessment</h2>
                <table><thead><tr><th>Algorithm</th><th>Risk</th><th>Why</th><th>Action</th></tr></thead><tbody>`
                data.algorithmRisks.forEach((r, i) => {
                    body += `<tr class="${i % 2 ? 'alt-row' : ''}"><td><strong>${r.algorithm}</strong></td><td><span class="risk-${r.riskLevel}">${r.riskLevel}</span></td><td>${r.why || ''}</td><td>${r.action || ''}</td></tr>`
                })
                body += `</tbody></table>`
            }

            // ── Grouped Issues (Errors / Warnings / Notices — Semrush parity) ──
            const gi = data.groupedIssues || {}
            const hasGrouped = (gi.errorCount || 0) + (gi.warningCount || 0) + (gi.noticeCount || 0) > 0
            if (hasGrouped) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">🔍</span> Site Audit Issues</h2>`
                body += `<div class="issue-summary-bar">
                    <div class="issue-summary-pill iss-error">🔴 ${gi.errorCount || 0} Errors</div>
                    <div class="issue-summary-pill iss-warning">🟡 ${gi.warningCount || 0} Warnings</div>
                    <div class="issue-summary-pill iss-notice">🔵 ${gi.noticeCount || 0} Notices</div>
                </div>`
                // Errors
                if (gi.errors?.length) {
                    body += `<div class="issue-group issue-group-error"><div class="issue-group-header">🔴 Errors (${gi.errors.length})</div>`
                    gi.errors.forEach(e => {
                        body += `<div class="issue-item">
                            <div class="issue-title">${e.check}</div>
                            <div class="issue-about"><strong>About this issue:</strong> ${e.aboutThisIssue || ''}</div>
                            <div class="issue-fix"><strong>How to fix:</strong> ${e.howToFix || ''}</div>
                        </div>`
                    })
                    body += `</div>`
                }
                // Warnings
                if (gi.warnings?.length) {
                    body += `<div class="issue-group issue-group-warning"><div class="issue-group-header">🟡 Warnings (${gi.warnings.length})</div>`
                    gi.warnings.forEach(w => {
                        body += `<div class="issue-item">
                            <div class="issue-title">${w.check}</div>
                            <div class="issue-about"><strong>About this issue:</strong> ${w.aboutThisIssue || ''}</div>
                            <div class="issue-fix"><strong>How to fix:</strong> ${w.howToFix || ''}</div>
                        </div>`
                    })
                    body += `</div>`
                }
                // Notices
                if (gi.notices?.length) {
                    body += `<div class="issue-group issue-group-notice"><div class="issue-group-header">🔵 Notices (${gi.notices.length})</div>`
                    gi.notices.forEach(n => {
                        body += `<div class="issue-item">
                            <div class="issue-title">${n.check}</div>
                            <div class="issue-about"><strong>About this issue:</strong> ${n.aboutThisIssue || ''}</div>
                            <div class="issue-fix"><strong>How to fix:</strong> ${n.howToFix || ''}</div>
                        </div>`
                    })
                    body += `</div>`
                }
            } else if (data.issues?.length) {
                // Fallback to old flat issues if groupedIssues not present
                body += `<div class="section-break"></div><h2><span class="h2-icon">🐛</span> Issues <span class="count-badge">${data.issues.length}</span></h2>
                <table><thead><tr><th style="width:10%">Severity</th><th style="width:45%">Issue</th><th style="width:45%">Fix</th></tr></thead><tbody>`
                data.issues.forEach((i, idx) => {
                    body += `<tr class="${idx % 2 ? 'alt-row' : ''}"><td><span class="sev-pill sev-${i.severity}">${i.severity}</span></td><td><strong>${i.title}</strong><br><small>${i.description || ''}</small>${i.aboutThisIssue ? `<br><em class="about-issue">${i.aboutThisIssue}</em>` : ''}</td><td>${i.fix || i.howToFix || ''}</td></tr>`
                })
                body += `</tbody></table>`
            }

            // AI Insights
            const ai = data.aiInsights
            if (ai && (ai.trendSummary || ai.fixPriorities?.length || ai.duplicateValidation)) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">🤖</span> AI Insights <span class="ai-badge">Mantram AI Exclusive</span></h2>`
                if (ai.trendSummary) body += `<div class="ai-card"><div class="ai-card-label">Trend Analysis</div><p>${ai.trendSummary}</p></div>`
                if (ai.fixPriorities?.length) {
                    body += `<div class="ai-card"><div class="ai-card-label">Top Fixes by Traffic Impact</div><ol>`
                    ai.fixPriorities.forEach(p => { body += `<li><strong>${p.title}</strong> — ${p.reason} <span class="badge">+${p.estimatedScoreGain}pts</span></li>` })
                    body += `</ol></div>`
                }
                if (ai.duplicateValidation) {
                    body += `<div class="ai-card"><div class="ai-card-label">Duplicate Validation</div><p>${ai.duplicateValidation.summary}</p></div>`
                }
            }
        }

        // Keywords for traffic
        if (type === 'traffic') {
            if (data.quickWins?.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">⚡</span> Quick Wins</h2>
                <table><thead><tr><th>Action</th><th>Keyword</th><th>Impact</th></tr></thead><tbody>`
                data.quickWins.forEach((w, i) => { body += `<tr class="${i % 2 ? 'alt-row' : ''}"><td>${w.action}</td><td><strong>${w.keyword || ''}</strong></td><td>${w.expectedImpact}</td></tr>` })
                body += `</tbody></table>`
            }
            if (data.keywordClusters?.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">🎯</span> Keyword Clusters</h2>`
                data.keywordClusters.forEach(c => {
                    body += `<div class="cluster-card"><div class="cluster-header"><strong>${c.clusterName}</strong> <span class="badge">${c.difficulty}</span> <span class="badge">${c.intent}</span> <span class="badge">${c.estimatedMonthlySearches || '?'}/mo</span></div>`
                    body += `<p class="cluster-kws">${(c.keywords || []).map(k => typeof k === 'string' ? k : k.keyword).join(' • ')}</p>`
                    if (c.suggestedTitle) body += `<p class="cluster-suggest">📝 ${c.suggestedTitle} <small>(${c.recommendedPageType})</small></p>`
                    body += `</div>`
                })
            }
            if (data.peopleAlsoAsk?.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">❓</span> People Also Ask</h2><div class="paa-grid">`
                data.peopleAlsoAsk.forEach(q => { body += `<div class="paa-card">${q}</div>` })
                body += `</div>`
            }
        }

        // Competitors
        if (type === 'competitors' || type === 'competitor-warroom') {
            if (data.competitors?.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">⚔️</span> Competitor Analysis</h2>`
                data.competitors.forEach(c => {
                    body += `<div class="comp-card"><div class="comp-header"><strong>${c.name}</strong><small>${c.url}</small><span class="threat-${c.threatLevel || 'medium'}">${c.threatLevel || 'medium'} threat</span></div>
                    <p><strong>Strengths:</strong> ${(c.strengths || []).join(', ')}</p>
                    <p><strong>Weaknesses:</strong> ${(c.weaknesses || []).join(', ')}</p>
                    ${c.howToBeat ? `<p class="beat-tip"><strong>How to beat:</strong> ${c.howToBeat}</p>` : ''}</div>`
                })
            }
            if (data.outrankPlan?.length) {
                body += `<div class="section-break"></div><h2><span class="h2-icon">🏆</span> Outrank Plan</h2><ol class="outrank-list">`
                data.outrankPlan.forEach(p => { body += `<li><strong>${p.action}</strong> — ${p.timeline} <span class="badge">${p.effort}</span><br><small>${p.expectedOutcome || ''}</small></li>` })
                body += `</ol>`
            }
        }

        // AI Visibility
        if (type === 'ai-visibility') {
            body += `<div class="scores"><div class="score-card"><div class="score-ring" style="--score:${data.aiVisibilityScore || 0};--color:${scoreColor(data.aiVisibilityScore || 0)}"><span class="score-num">${data.aiVisibilityScore || 0}</span></div><div class="score-label">AI Visibility</div></div></div>`
            const bd = data.breakdown || {}
            ;['schemaReadiness', 'qnaPresence', 'entityCoverage', 'snippetStructure', 'trustSignals'].forEach(k => {
                if (bd[k]) body += `<div class="ai-breakdown"><h3>${k.replace(/([A-Z])/g, ' $1').trim()} — ${bd[k].score}/100</h3><p>${bd[k].currentState || ''}</p></div>`
            })
        }

        // 30-day plan
        if (data.thirtyDayPlan?.length) {
            body += `<div class="section-break"></div><h2><span class="h2-icon">📅</span> 30-Day Plan</h2><div class="week-grid">`
            data.thirtyDayPlan.forEach(w => {
                body += `<div class="week-card"><div class="week-badge">Week ${w.week}</div><div class="week-theme">${w.theme || ''}</div><ul>${(w.actions || []).map(a => `<li>${a}</li>`).join('')}</ul>${w.expectedOutcome ? `<p class="week-outcome">Expected: ${w.expectedOutcome}</p>` : ''}</div>`
            })
            body += `</div>`
        }

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} — ${brandName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;color:#1e293b;padding:0;font-size:12px;line-height:1.65;background:#fff}
.page{max-width:850px;margin:0 auto;padding:40px 48px}

/* ── Header ── */
.report-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px}
.header-left{display:flex;align-items:center;gap:14px}
.brand-logo{width:52px;height:52px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0}
.brand-initial{width:52px;height:52px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900}
.brand-name{font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px}
.brand-url{font-size:11px;color:#64748b;margin-top:2px}
.header-right{text-align:right}
.report-badge{display:inline-block;padding:6px 16px;border-radius:20px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
.report-date{font-size:10px;color:#94a3b8;margin-top:6px}
.divider{height:2px;background:linear-gradient(90deg,#6366f1 0%,#8b5cf6 50%,#e2e8f0 100%);margin-bottom:24px;border-radius:2px}

/* ── Executive Summary ── */
.exec-summary{background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-left:4px solid #6366f1;padding:16px 20px;border-radius:0 12px 12px 0;margin-bottom:28px}
.exec-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#6366f1;margin-bottom:6px}
.exec-text{font-size:13px;color:#334155;line-height:1.7}

/* ── Scores ── */
.scores{display:flex;gap:16px;justify-content:center;margin:24px 0;flex-wrap:wrap}
.score-card{text-align:center;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;min-width:110px}
.score-ring{position:relative;width:72px;height:72px;margin:0 auto 8px;border-radius:50%;background:conic-gradient(var(--color) calc(var(--score) * 3.6deg), #e2e8f0 0);display:flex;align-items:center;justify-content:center}
.score-ring::before{content:'';position:absolute;width:56px;height:56px;border-radius:50%;background:#fff}
.score-num{position:relative;z-index:1;font-size:22px;font-weight:900;color:#1e293b}
.score-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px}
.score-grade{font-size:11px;font-weight:800;margin-top:2px}

/* ── Strategic Brief ── */
.strategic-brief{background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:16px 20px;margin:16px 0}
.brief-header{font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.brief-icon{font-size:16px}
.strategic-brief p{font-size:12px;color:#4c1d95;line-height:1.7}

/* ── Sections ── */
h2{font-size:15px;font-weight:800;color:#0f172a;margin:28px 0 14px;padding-bottom:8px;border-bottom:2px solid #e2e8f0;display:flex;align-items:center;gap:8px}
.h2-icon{font-size:16px}
.section-break{height:1px;background:linear-gradient(90deg,transparent,#cbd5e1,transparent);margin:32px 0}
.count-badge{font-size:10px;font-weight:600;background:#e0e7ff;color:#4338ca;padding:2px 10px;border-radius:12px;margin-left:auto}

/* ── Stats Grid ── */
.stats-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:12px 0}
.stat-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 8px;text-align:center;transition:all 0.2s}
.stat-alert{background:#fef2f2;border-color:#fecaca}
.stat-icon{font-size:14px;margin-bottom:2px}
.stat-value{font-size:16px;font-weight:900;color:#1e293b}
.stat-label{font-size:8px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;margin-top:2px}

/* ── Status Bar ── */
.status-bar{display:flex;gap:8px;margin:12px 0;align-items:center}
.status-pill{padding:3px 10px;border-radius:8px;font-size:10px;font-weight:700}
.status-2xx{background:#d1fae5;color:#059669}.status-3xx{background:#fef3c7;color:#d97706}.status-4xx{background:#fee2e2;color:#dc2626}.status-5xx{background:#fee2e2;color:#dc2626}

/* ── Tables ── */
table{width:100%;border-collapse:separate;border-spacing:0;margin:12px 0;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}
thead{background:linear-gradient(135deg,#f1f5f9,#e2e8f0)}
th{padding:10px 14px;text-align:left;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;color:#475569}
td{padding:10px 14px;border-top:1px solid #f1f5f9;font-size:11px;vertical-align:top}
.alt-row{background:#fafbfc}
small{color:#94a3b8;font-size:10px}

/* ── Severity / Risk Pills ── */
.sev-pill{display:inline-block;padding:2px 10px;border-radius:8px;font-size:9px;font-weight:800;text-transform:uppercase}
.sev-critical{background:#fce7f3;color:#be185d}.sev-high{background:#ffedd5;color:#c2410c}.sev-medium{background:#fef3c7;color:#b45309}.sev-low{background:#f0fdf4;color:#16a34a}
.issue-pill{display:inline-block;padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700;background:#fef2f2;color:#dc2626}
.ok-pill{font-size:10px;color:#16a34a;font-weight:700}
.risk-high{color:#dc2626;font-weight:800}.risk-medium{color:#f59e0b;font-weight:700}.risk-low{color:#16a34a;font-weight:600}
.about-issue{font-size:10px;color:#6366f1;font-style:italic}
.badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:9px;font-weight:700;background:#e0e7ff;color:#4338ca;margin-left:4px}

/* ── Action Cards ── */
.action-grid{display:flex;gap:12px;flex-wrap:wrap}
.action-card{flex:1;min-width:220px;border-radius:12px;padding:14px 16px;border:1px solid #e2e8f0}
.action-header{font-size:12px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:6px}
.action-fix{border-left:4px solid #ef4444;background:#fef2f2}.action-fix .action-header{color:#dc2626}
.action-create{border-left:4px solid #22c55e;background:#f0fdf4}.action-create .action-header{color:#16a34a}
.action-monitor{border-left:4px solid #3b82f6;background:#eff6ff}.action-monitor .action-header{color:#2563eb}
.action-card ul{padding-left:16px;font-size:11px;color:#334155}
.action-card li{margin:4px 0}

/* ── AI Insights ── */
.ai-badge{font-size:9px;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#fff;padding:3px 10px;border-radius:10px;font-weight:700;margin-left:auto}
.ai-card{background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:14px 18px;margin:10px 0}
.ai-card-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#7c3aed;margin-bottom:6px}
.ai-card p,.ai-card li{font-size:11px;color:#4c1d95}

/* ── Competitor / Cluster / Week Cards ── */
.comp-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin:10px 0}
.comp-header{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}
.comp-header strong{font-size:14px}.comp-header small{color:#64748b}
.threat-high{color:#dc2626;font-weight:800;font-size:10px;padding:2px 8px;background:#fef2f2;border-radius:8px}
.threat-medium{color:#f59e0b;font-weight:700;font-size:10px;padding:2px 8px;background:#fffbeb;border-radius:8px}
.threat-low{color:#16a34a;font-weight:600;font-size:10px;padding:2px 8px;background:#f0fdf4;border-radius:8px}
.beat-tip{background:#e0f2fe;border-radius:8px;padding:8px 12px;font-size:11px;color:#0c4a6e;margin-top:8px}
.cluster-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin:8px 0}
.cluster-header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.cluster-kws{font-size:11px;color:#475569;margin:4px 0}.cluster-suggest{font-size:11px;color:#6366f1;margin-top:4px}
.paa-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.paa-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:11px}
.week-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.week-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;text-align:center}
.week-badge{display:inline-block;padding:3px 12px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:10px;font-weight:800;margin-bottom:6px}
.week-theme{font-size:12px;font-weight:700;color:#334155;margin-bottom:6px}
.week-card ul{text-align:left;padding-left:16px;font-size:10px}.week-outcome{font-size:9px;color:#6366f1;margin-top:6px;font-style:italic}
.outrank-list li{margin:10px 0;font-size:12px;line-height:1.6}
.ai-breakdown{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin:8px 0}
.ai-breakdown h3{font-size:12px;font-weight:700;color:#334155;text-transform:capitalize}

/* ── Cover Page ── */
.cover-page{page-break-after:always;margin:-24px -32px 0 -32px;padding:0}
.cover-gradient{min-height:92vh;background:linear-gradient(160deg,#0f0a2e 0%,#1e1b4b 30%,#312e81 60%,#4338ca 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 40px;border-radius:0}
.cover-logos{display:flex;align-items:center;gap:28px;margin-bottom:48px}
.cover-mantram,.cover-brand{display:flex;flex-direction:column;align-items:center;gap:10px}
.cover-mantram-logo{height:48px;filter:brightness(10)}
.cover-mantram-text{font-size:28px;font-weight:900;color:#fff;letter-spacing:1px}
.cover-mantram-label{font-size:14px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:1px;text-transform:uppercase}
.cover-brand-logo{height:48px;max-width:140px;object-fit:contain;border-radius:8px}
.cover-brand-initial{width:56px;height:56px;border-radius:14px;background:rgba(255,255,255,0.15);color:#fff;font-size:28px;font-weight:900;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px)}
.cover-brand-name{font-size:14px;font-weight:700;color:rgba(255,255,255,0.8);letter-spacing:0.5px}
.cover-x{font-size:24px;color:rgba(255,255,255,0.25);font-weight:300;margin:0 8px}
.cover-title-block{margin-bottom:40px}
.cover-title{font-size:34px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin:0 0 8px 0;text-shadow:0 2px 4px rgba(0,0,0,0.2)}
.cover-subtitle{font-size:14px;color:rgba(255,255,255,0.5);margin:0;letter-spacing:0.5px}
.cover-meta{display:flex;gap:20px;margin-bottom:48px}
.cover-date,.cover-confidential{font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1.5px;font-weight:600}
.cover-powered{font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:1.5px;text-transform:uppercase}

/* ── Mantram Masthead ── */
.report-masthead{margin:-32px -40px 20px -40px;padding:0}
.masthead-bar{display:flex;justify-content:space-between;align-items:center;padding:10px 40px;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px 12px 0 0}
.masthead-left{display:flex;align-items:center;gap:10px}
.mantram-header-logo{height:22px;filter:brightness(10)}
.mantram-text-logo{font-size:14px;font-weight:900;color:#fff;letter-spacing:0.5px}
.masthead-divider{color:rgba(255,255,255,0.3);font-size:16px}
.masthead-studio{font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px}
.masthead-brand-logo{height:18px;max-width:80px;object-fit:contain;border-radius:4px;margin-right:6px}
.masthead-brand-name{font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);margin-right:10px}
.masthead-date{font-size:10px;color:rgba(255,255,255,0.5)}
.masthead-right{display:flex;align-items:center;text-align:right}

/* ── Trend Arrows ── */
.trend-up{color:#16a34a;font-size:10px;font-weight:800;margin-left:4px}
.trend-down{color:#dc2626;font-size:10px;font-weight:800;margin-left:4px}

/* ── Issue Groups (Errors/Warnings/Notices) ── */
.issue-summary-bar{display:flex;gap:12px;margin:12px 0 16px 0}
.issue-summary-pill{padding:8px 16px;border-radius:10px;font-size:12px;font-weight:800;text-align:center;flex:1}
.iss-error{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
.iss-warning{background:#fffbeb;color:#d97706;border:1px solid #fde68a}
.iss-notice{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe}
.issue-group{border-radius:12px;padding:16px 20px;margin:12px 0}
.issue-group-error{background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626}
.issue-group-warning{background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b}
.issue-group-notice{background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #3b82f6}
.issue-group-header{font-size:13px;font-weight:800;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.06)}
.issue-group-error .issue-group-header{color:#dc2626}
.issue-group-warning .issue-group-header{color:#d97706}
.issue-group-notice .issue-group-header{color:#2563eb}
.issue-item{padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.04)}
.issue-item:last-child{border-bottom:none;padding-bottom:0}
.issue-title{font-size:12px;font-weight:700;color:#1e293b;margin-bottom:4px}
.issue-about{font-size:10px;color:#475569;margin:4px 0;line-height:1.5}
.issue-fix{font-size:10px;color:#059669;margin:4px 0;line-height:1.5}
.issue-about strong,.issue-fix strong{font-size:9px;text-transform:uppercase;letter-spacing:0.5px}

/* ── Footer ── */
.report-footer{margin-top:48px;padding-top:16px;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}
.footer-brand{display:flex;align-items:center;gap:8px}
.footer-logo{height:18px;opacity:0.6}
.footer-text{font-size:9px;color:#94a3b8}
.footer-right{font-size:9px;color:#cbd5e1;text-align:right}

/* ── Print ── */
@media print{
    body{padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{padding:24px 32px}
    .cover-page{page-break-after:always;margin:0;padding:0}
    .cover-gradient{min-height:100vh;border-radius:0}
    .section-break{page-break-before:auto}
    table{page-break-inside:auto}
    tr{page-break-inside:avoid}
    .scores{page-break-inside:avoid}
    .action-grid{page-break-inside:avoid}
}
@page{margin:16mm 12mm;size:A4}
</style></head><body><div class="page">${body}
<div class="report-footer">
    <div class="footer-brand">
        <img src="${mantramLogo}" class="footer-logo" alt="Mantram AI" onerror="this.style.display='none'" />
        <span class="footer-text">Generated by <strong>Mantram AI</strong> SEO Studio</span>
    </div>
    <div class="footer-right">
        <span>${title} • ${brandName}</span><br>
        <span>${date} • Confidential</span>
    </div>
</div>
</div></body></html>`

        const w = window.open('', '_blank')
        w.document.write(html)
        w.document.close()
        setTimeout(() => { w.print() }, 800)
    }

    // ── RENDER ────────────────────────────────────────────────────────────
    return (
        <DashboardLayout 
            title={<h1 className="text-2xl font-black m-0">SEO Studio</h1>} 
            subtitle="AI-Powered SEO Intelligence"
        >
            <SEOHead 
                title="SEO Studio — AI SEO Audits & Keyword Intelligence | Mantram AI" 
                description="Use Mantram AI SEO Studio to run technical SEO audits, perform AI-powered keyword clustering, and optimize your website for Google SGE and AI search visibility." 
                canonical="/seo-studio"
            />

            {!activeBrand ? (
                <div className="max-w-7xl mx-auto">
                    <div className="glass-panel rounded-2xl p-10 mb-8 text-center">
                        <span className="material-symbols-outlined text-slate-600 text-5xl block mb-3">domain</span>
                        <h3 className="text-lg font-bold text-white mb-2">Select or Create a Brand</h3>
                        <p className="text-sm text-slate-400 mb-4">SEO Studio needs a brand with a website to analyze.</p>
                        <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm cursor-pointer">Create Brand</button>
                    </div>
                </div>
            ) : (
                <div className="flex gap-0 max-w-[1400px] mx-auto" style={{ minHeight: 'calc(100vh - 140px)' }}>

                    {/* ═══════════ LEFT SIDEBAR ═══════════ */}
                    <div className={`flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-14' : 'w-56'}`}
                        style={{ background: 'rgba(255,255,255,0.01)', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.04]">
                            {!sidebarCollapsed && <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">Navigation</span>}
                            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                className="size-7 rounded-lg bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.08] cursor-pointer transition-all ml-auto">
                                <span className="material-symbols-outlined text-slate-500 text-sm">{sidebarCollapsed ? 'chevron_right' : 'chevron_left'}</span>
                            </button>
                        </div>
                        <div className="py-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                            {SIDEBAR_SECTIONS.map((section, si) => (
                                <div key={si} className="mb-1">
                                    {!sidebarCollapsed && <p className="px-3 pt-3 pb-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest">{section.title}</p>}
                                    {sidebarCollapsed && si > 0 && <div className="mx-2 my-1 border-t border-white/[0.04]" />}
                                    {section.items.map(item => {
                                        const isActive = activeSection === item.id
                                        return (
                                            <button key={item.id}
                                                onClick={() => { setActiveSection(item.id); setError(''); if (item.type === 'workflow') { setResults(null) } }}
                                                title={sidebarCollapsed ? item.label : undefined}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-all duration-200 group relative ${isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'}`}
                                                style={isActive ? { background: `linear-gradient(90deg, ${item.color}12, transparent)` } : {}}>
                                                {isActive && <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ background: item.color }} />}
                                                <span className="material-symbols-outlined text-lg transition-colors" style={{ color: isActive ? item.color : undefined }}>{item.icon}</span>
                                                {!sidebarCollapsed && (
                                                    <div className="flex-1 min-w-0">
                                                        <p className={`text-xs font-bold leading-tight truncate ${isActive ? 'text-white' : ''}`}>{item.label}</p>
                                                        <p className="text-[9px] text-slate-600 leading-tight truncate">{item.desc}</p>
                                                    </div>
                                                )}
                                                {!sidebarCollapsed && item.type === 'workflow' && (
                                                    <span className="text-[8px] px-1 py-0.5 rounded bg-white/[0.04] text-slate-600 font-bold shrink-0">AI</span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            ))}

                            {/* Setup section */}
                            <div className="mt-2 border-t border-white/[0.04] pt-2">
                                {!sidebarCollapsed ? (
                                    <button onClick={() => setShowSetup(!showSetup)}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-all hover:bg-white/[0.03]">
                                        <span className="material-symbols-outlined text-slate-600 text-lg">settings</span>
                                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest flex-1">Setup</span>
                                        <span className="material-symbols-outlined text-slate-700 text-xs">{showSetup ? 'expand_less' : 'expand_more'}</span>
                                    </button>
                                ) : (
                                    <button onClick={() => { setSidebarCollapsed(false); setShowSetup(true) }} title="Setup"
                                        className="w-full flex items-center justify-center py-2 cursor-pointer hover:bg-white/[0.03] transition-all">
                                        <span className="material-symbols-outlined text-slate-600 text-lg">settings</span>
                                    </button>
                                )}
                                {showSetup && !sidebarCollapsed && (
                                    <div className="px-3 py-2 space-y-3 animate-fade-in">
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Competitors ({competitors.length})</p>
                                            <div className="space-y-1 mb-2">
                                                {competitors.slice(0, 4).map((c, i) => (
                                                    <div key={i} className="flex items-center justify-between text-[10px] text-slate-400 px-2 py-1 rounded bg-white/[0.02]">
                                                        <span className="truncate">{c.name || c.url}</span>
                                                        <button onClick={() => removeCompetitor(c.url)} className="text-slate-600 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-[10px]">close</span></button>
                                                    </div>
                                                ))}
                                                {competitors.length > 4 && <p className="text-[9px] text-slate-600 px-2">+{competitors.length - 4} more</p>}
                                            </div>
                                            <div className="flex gap-1">
                                                <input type="text" value={newCompUrl} onChange={e => setNewCompUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCompetitor()}
                                                    placeholder="competitor.com" className="flex-1 px-2 py-1 rounded text-[10px] text-white bg-white/[0.04] border border-white/[0.06] outline-none" />
                                                <button onClick={addCompetitor} disabled={!newCompUrl.trim()} className="px-1.5 py-1 rounded text-[9px] font-bold bg-white/[0.04] text-slate-500 cursor-pointer disabled:opacity-30">+</button>
                                            </div>
                                            <button onClick={discoverCompetitors} disabled={compLoading}
                                                className="mt-1 w-full flex items-center justify-center gap-1 px-2 py-1 rounded text-[9px] font-bold cursor-pointer transition-all disabled:opacity-30 text-violet-400 bg-violet-500/10 hover:bg-violet-500/15">
                                                {compLoading ? <span className="material-symbols-outlined text-[10px] animate-spin">sync</span> : <span className="material-symbols-outlined text-[10px]">auto_awesome</span>}
                                                Auto-Discover
                                            </button>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Analytics</p>
                                            {gaConnected ? (
                                                <div className="text-[10px] text-emerald-400 flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/5 border border-emerald-500/10">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {gaEmail || 'Connected'}
                                                </div>
                                            ) : (
                                                <button onClick={() => navigate('/integrations')}
                                                    className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[9px] font-bold cursor-pointer text-blue-400 bg-blue-500/10 hover:bg-blue-500/15 transition-all">
                                                    <span className="material-symbols-outlined text-[10px]">link</span> Connect GA
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ═══════════ MAIN CONTENT PANEL ═══════════ */}
                    <div className="flex-1 min-w-0 px-5 py-4 overflow-y-auto">
                        {/* Compact Brand Header + Ask Bar */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 2px 12px rgba(99,102,241,0.25)' }}>
                                <span className="material-symbols-outlined text-white text-lg">travel_explore</span>
                            </div>
                            <div className="min-w-0 mr-2">
                                <h2 className="text-sm font-bold text-white truncate">{activeBrand.name}</h2>
                                <p className="text-[10px] text-slate-500 truncate flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-400" />{website || 'No website'}</p>
                            </div>
                            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span className="material-symbols-outlined text-violet-400 text-sm">auto_awesome</span>
                                <input type="text" value={askQuery} onChange={e => setAskQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runAsk()}
                                    placeholder="Ask anything about SEO..." className="flex-1 text-xs bg-transparent text-white placeholder:text-slate-600 outline-none border-none" />
                                <button onClick={runAsk} disabled={loading || !askQuery.trim()}
                                    className="px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-30 transition-all"
                                    style={{ background: askQuery.trim() ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.03)', color: askQuery.trim() ? 'white' : '#475569' }}>Ask</button>
                            </div>
                            <StudioReportButton studio="seo" brandId={activeBrand?._id} />
                            <button onClick={() => setShowGuide(!showGuide)} title="How It Works"
                                className={`size-9 rounded-xl flex items-center justify-center cursor-pointer transition-all ${showGuide ? 'bg-primary/20 text-primary' : 'bg-white/[0.04] border border-white/[0.06] text-slate-500 hover:text-white hover:bg-white/[0.08]'}`}>
                                <span className="material-symbols-outlined text-lg">help</span>
                            </button>
                        </div>

                        {/* ─── How It Works Guide ─── */}
                        {showGuide && (
                            <div className="animate-fade-in">
                                <SeoHelpView onBack={() => setShowGuide(false)} />
                            </div>
                        )}

                        {/* Ask Result */}
                        {askResult && (
                            <div className="glass-panel rounded-2xl p-5 mb-4 animate-fade-in">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2"><span className="material-symbols-outlined text-primary text-sm">psychology</span> AI Answer</h3>
                                    <button onClick={() => setAskResult(null)} className="text-slate-500 hover:text-slate-300 cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button>
                                </div>
                                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-3">{askResult.answer}</div>
                                {askResult.actionItems?.length > 0 && (
                                    <div className="space-y-1.5 mb-3">{askResult.actionItems.map((a, i) => (
                                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/3"><span className="text-primary text-xs mt-0.5">▸</span><div><p className="text-xs font-bold text-white">{a.title}</p><p className="text-[10px] text-slate-400">{a.description}</p></div></div>
                                    ))}</div>
                                )}
                                {askResult.followUpQuestions?.length > 0 && (
                                    <div className="flex flex-wrap gap-2">{askResult.followUpQuestions.map((q, i) => (
                                        <button key={i} onClick={() => { setAskQuery(q); setAskResult(null) }}
                                            className="text-xs px-3 py-1 rounded-full bg-white/5 text-slate-400 hover:bg-primary/10 hover:text-primary border border-white/5 cursor-pointer transition-all">{q}</button>
                                    ))}</div>
                                )}
                            </div>
                        )}

                        {error && <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-4"><p className="text-rose-400 text-xs">{error}</p></div>}

                        {/* ─── Loading State ─── */}
                        {loading && isWorkflow && (
                            <div className="relative pb-16">
                                <GlobalLoader 
                                    isActive={loading && isWorkflow}
                                    title={`Running ${currentItem?.label || 'Analysis'}...`}
                                    currentStage={loadingStage}
                                    stages={STAGE_MESSAGES[activeSection] || []}
                                    elapsed={loadingElapsed}
                                    icon="troubleshoot"
                                />
                                <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                                    <button onClick={cancelWorkflow}
                                        className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] cursor-pointer transition-all flex items-center gap-1.5 z-10">
                                        <span className="material-symbols-outlined text-xs">close</span> Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ─── Baseline data indicator ─── */}
                        {isWorkflow && !loading && results && results._isBaseline && (
                            <div className="flex items-center justify-between p-3 rounded-xl mb-4 animate-fade-in" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                                <div className="flex items-center gap-2 text-xs text-emerald-400">
                                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                    <span>Auto-generated during brand onboarding • <strong className="text-white">Deterministic scoring — no AI hallucination</strong></span>
                                </div>
                                <CreditTooltipWrapper action={currentItem?.creditAction}>
                                    <button onClick={() => runWorkflow(activeSection)} disabled={loading}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer hover:brightness-110 transition-all"
                                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                        <span className="material-symbols-outlined text-xs">play_arrow</span> Run Full Health Check
                                        <CreditBadge action={currentItem?.creditAction} />
                                    </button>
                                </CreditTooltipWrapper>
                            </div>
                        )}

                        {/* ─── Saved-data indicator ─── */}
                        {isWorkflow && !loading && results && savedAt && !results._isBaseline && (
                            <div className="flex items-center justify-between p-3 rounded-xl mb-4 animate-fade-in" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <span className="material-symbols-outlined text-primary text-sm">history</span>
                                    <span>Last generated <strong className="text-white">{new Date(savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></span>
                                </div>
                                <CreditTooltipWrapper action={currentItem?.creditAction}>
                                    <button onClick={() => runWorkflow(activeSection)} disabled={loading}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer hover:brightness-110 transition-all"
                                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                        <span className="material-symbols-outlined text-xs">refresh</span> Regenerate
                                        <CreditBadge action={currentItem?.creditAction} />
                                    </button>
                                </CreditTooltipWrapper>
                            </div>
                        )}

                        {/* ─── Workflow Results ─── */}
                        {isWorkflow && !loading && results && (
                            <div ref={resultRef} className="animate-fade-in">
                                {/* Action Bar — PDF Download + Crawl Intelligence */}
                                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {results.researchSources?.length > 0 && (
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/8 border border-emerald-500/12">
                                                <span className="material-symbols-outlined text-emerald-400 text-xs">verified</span>
                                                <span className="text-[10px] text-emerald-400 font-bold">{results.researchSources.length} pages crawled</span>
                                            </div>
                                        )}
                                        {results.crawlIntelligence && (
                                            <>
                                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${results.crawlIntelligence.hasSitemap ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                    {results.crawlIntelligence.hasSitemap ? '✓ Sitemap' : '✗ No Sitemap'}
                                                </span>
                                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${results.crawlIntelligence.hasRobotsTxt ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                    {results.crawlIntelligence.hasRobotsTxt ? '✓ Robots.txt' : '✗ No Robots.txt'}
                                                </span>
                                                {results.crawlIntelligence.thinPageCount > 0 && (
                                                    <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-amber-500/10 text-amber-400">
                                                        {results.crawlIntelligence.thinPageCount} thin pages
                                                    </span>
                                                )}
                                                {results.crawlIntelligence.duplicateContentCount > 0 && (
                                                    <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-rose-500/10 text-rose-400">
                                                        {results.crawlIntelligence.duplicateContentCount} duplicates
                                                    </span>
                                                )}
                                            </>
                                        )}
                                        {results.peopleAlsoAsk?.length > 0 && (
                                            <span className="text-[10px] px-2 py-1 rounded-full font-bold bg-blue-500/10 text-blue-400">
                                                {results.peopleAlsoAsk.length} PAA questions
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => downloadSeoPdf(activeSection, results, activeBrand)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer hover:brightness-110 transition-all"
                                            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                                            <span className="material-symbols-outlined text-xs">download</span> Download PDF
                                        </button>
                                    </div>
                                </div>

                                {/* PAA Questions Panel */}
                                {results.peopleAlsoAsk?.length > 0 && (
                                    <div className="glass-panel rounded-xl p-4 mb-4">
                                        <h4 className="text-xs font-bold text-blue-400 mb-2 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm">quiz</span> People Also Ask (from Google)
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {results.peopleAlsoAsk.map((q, i) => (
                                                <span key={i} className="text-[11px] px-3 py-1 rounded-full bg-blue-500/8 border border-blue-500/12 text-slate-300">{q}</span>
                                            ))}
                                        </div>
                                        {results.relatedSearches?.length > 0 && (
                                            <div className="mt-3 pt-2 border-t border-white/[0.04]">
                                                <p className="text-[10px] text-slate-500 font-bold mb-1.5">Related Searches</p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {results.relatedSearches.map((r, i) => (
                                                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{r}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {activeSection === 'health-check' && <HealthCheckResults results={results} />}
                                {activeSection === 'traffic' && <TrafficResults results={results} />}
                                {activeSection === 'competitors' && <CompetitorResults results={results} />}
                                {activeSection === 'ai-visibility' && <AIVisibilityResults results={results} />}
                                {activeSection === 'competitor-warroom' && <WarRoomResults results={results} />}
                                {activeSection === 'llm-probe' && <LLMProbeResults results={results} />}
                                {activeSection === 'auto-fix' && <AutoFixResults results={results} />}
                                {activeSection === 'prompt-mining' && <PromptMiningResults results={results} />}
                            </div>
                        )}

                        {/* ─── Workflow empty state ─── */}
                        {isWorkflow && !loading && !results && !error && (
                            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${currentItem?.color || '#6366f1'}15` }}>
                                    <span className="material-symbols-outlined text-3xl" style={{ color: currentItem?.color || '#6366f1' }}>{currentItem?.icon || 'search'}</span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-1">{currentItem?.label}</h3>
                                <p className="text-sm text-slate-500 mb-4 text-center max-w-md">{currentItem?.desc}</p>
                                <CreditTooltipWrapper action={currentItem?.creditAction}>
                                    <button onClick={() => runWorkflow(activeSection)} disabled={!website}
                                        className="px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-30 transition-all hover:shadow-lg flex items-center gap-2"
                                        style={{ background: `linear-gradient(135deg, ${currentItem?.color || '#6366f1'}, ${currentItem?.color || '#8b5cf6'}cc)` }}>
                                        <span className="material-symbols-outlined text-sm">play_arrow</span> Run {currentItem?.label}
                                        <CreditBadge action={currentItem?.creditAction} />
                                    </button>
                                </CreditTooltipWrapper>
                            </div>
                        )}

                        {/* ─── Advanced Tools ─── */}
                        {isAdvanced && (
                            <SeoAdvancedTools
                                advPage={activeSection}
                                setAdvPage={setActiveSection}
                                onBack={() => setActiveSection('overview')}
                                brand={activeBrand}
                                website={website}
                                competitors={competitors}
                                brandPayload={brandPayload}
                                gaConnected={gaConnected}
                                gaReport={gaReport}
                                gscReport={gscReport}
                                hideNav
                            />
                        )}
                    </div>
                </div>
            )}


        </DashboardLayout>
    )
}



// ══════════════════════════════════════════════════════════════════════════
// RESULT SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

function HealthCheckResults({ results }) {
    const [issueFilter, setIssueFilter] = useState('all')
    const [showPageCards, setShowPageCards] = useState(false)
    const [showAiInsights, setShowAiInsights] = useState(true)
    const issues = results.issues || []
    const filtered = issueFilter === 'all' ? issues : issues.filter(i => i.severity === issueFilter)
    const stats = results.siteStats || {}
    const pageReports = results.pageReports || []

    // ── Bridge backend data names to existing UI (Semrush parity) ──
    // Use local variables instead of mutating React state
    const groupedIssues = results.groupedIssues || results.categorizedIssues || null
    const trends = results.trends || null
    const trendDelta = results.trendDelta || (trends ? {
        previousDate: trends.previousAuditDate,
        scoreChange: trends.scores?.seoHealth?.delta || 0,
        technicalChange: trends.scores?.technicalScore?.delta || 0,
        newIssueCount: trends.issues?.total?.delta > 0 ? trends.issues.total.delta : 0,
        resolvedIssueCount: trends.issues?.total?.delta < 0 ? Math.abs(trends.issues.total.delta) : 0,
        pagesCrawledChange: trends.metrics?.pagesCrawled?.delta || 0,
        brokenInternalChange: trends.metrics?.brokenInternalCount?.delta || 0,
        thinPageChange: trends.metrics?.thinPageCount?.delta || 0,
        duplicateTitleChange: trends.metrics?.duplicateContentCount?.delta || 0,
    } : null)

    return (<>
        {/* Summary */}
        <div className="glass-panel rounded-2xl p-6 mb-6">
            <p className="text-sm text-slate-300 leading-relaxed">{results.summary}</p>
            {results.topOpportunity && <p className="text-sm text-primary font-bold mt-2">{results.topOpportunity}</p>}
            {results.strategicBrief && <p className="text-xs text-slate-400 mt-3 leading-relaxed">{results.strategicBrief}</p>}
        </div>

        {/* Score Cards — with trend arrows ↑/↓ when available */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
            {[{ s: results.seoHealthScore, l: 'SEO Health', c: 'emerald', tk: 'seoHealth' },
              { s: results.aiVisibilityScore, l: 'AI Visibility', c: 'violet', tk: null },
              { s: results.technicalScore, l: 'Technical', c: 'blue', tk: 'technicalScore' },
              { s: results.contentScore, l: 'Content', c: 'amber', tk: 'contentScore' },
              { s: results.authorityScore, l: 'Authority', c: 'rose', tk: 'authorityScore' }].map(x => {
                const trendData = x.tk && trends?.scores?.[x.tk]
                return (
                    <div key={x.l} className="glass-panel rounded-2xl p-4 flex flex-col items-center relative">
                        <ScoreRing score={x.s || 0} size={80} label={x.l} color={x.c} />
                        {trendData && trendData.delta !== 0 && (
                            <span className={`absolute top-2 right-2 text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                trendData.improved ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                            }`}>{trendData.label}</span>
                        )}
                    </div>
                )
            })}
        </div>

        {/* ── Trend Delta (since last audit) ── */}
        {trendDelta && (
            <div className="glass-panel rounded-2xl p-5 mb-6 border border-primary/10">
                <h4 className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">trending_up</span> Changes Since Last Audit
                    <span className="ml-auto text-[9px] text-slate-500 font-normal normal-case">{new Date(trendDelta.previousDate).toLocaleDateString()}</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Score', value: trendDelta.scoreChange, suffix: '' },
                        { label: 'Technical', value: trendDelta.technicalChange, suffix: '' },
                        { label: 'New Issues', value: trendDelta.newIssueCount, suffix: '', isCount: true },
                        { label: 'Resolved', value: trendDelta.resolvedIssueCount, suffix: '', isCount: true, isPositive: true },
                        { label: 'Pages Crawled', value: trendDelta.pagesCrawledChange, suffix: '' },
                        { label: 'Broken Internal', value: trendDelta.brokenInternalChange, suffix: '', isNegative: true },
                        { label: 'Thin Pages', value: trendDelta.thinPageChange, suffix: '', isNegative: true },
                        { label: 'Dup. Titles', value: trendDelta.duplicateTitleChange, suffix: '', isNegative: true },
                    ].map(d => (
                        <div key={d.label} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className={`text-base font-black ${d.isCount ? (d.isPositive ? 'text-emerald-400' : (d.value > 0 ? 'text-red-400' : 'text-slate-400')) : (d.isNegative ? (d.value > 0 ? 'text-red-400' : d.value < 0 ? 'text-emerald-400' : 'text-slate-400') : (d.value > 0 ? 'text-emerald-400' : d.value < 0 ? 'text-red-400' : 'text-slate-400'))}`}>
                                {d.isCount ? d.value : (d.value > 0 ? '+' : '')}{d.value}{d.suffix}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase">{d.label}</span>
                        </div>
                    ))}
                </div>
                {/* Per-issue deltas */}
                {trendDelta.issueDeltas?.length > 0 && (
                    <div className="mt-4 border-t border-white/[0.06] pt-3">
                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">Issue-Level Changes</p>
                        <div className="space-y-1.5">
                            {trendDelta.issueDeltas.slice(0, 12).map((d, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-[10px]">
                                    {d.status === 'new' && <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400 font-black">NEW</span>}
                                    {d.status === 'resolved' && <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-black">✓ RESOLVED</span>}
                                    {d.status === 'changed' && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-black">CHANGED</span>}
                                    <span className="text-slate-300 truncate flex-1">{d.check}</span>
                                    {d.status === 'changed' && <span className="text-slate-500 text-[9px]">{d.previousValue} → {d.currentValue}</span>}
                                    {d.status === 'new' && <span className="text-slate-500 text-[9px]">{d.currentValue}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* ── Crawl Intelligence Dashboard ── */}
        <div className="glass-panel rounded-2xl p-5 mb-6">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-primary">monitoring</span> Crawl Intelligence
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                    { label: 'Pages Crawled', value: stats.pagesCrawled || 0, icon: 'description', color: '#6366f1' },
                    { label: 'Avg Response', value: `${stats.responseTimeAvg || 0}ms`, icon: 'speed', color: (stats.responseTimeAvg || 0) > 2000 ? '#f43f5e' : '#10b981' },
                    { label: 'Avg Page Size', value: `${stats.pageSizeAvg || 0}KB`, icon: 'data_usage', color: (stats.pageSizeAvg || 0) > 2000 ? '#f59e0b' : '#10b981' },
                    { label: 'Thin Pages', value: stats.thinPageCount || 0, icon: 'short_text', color: (stats.thinPageCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Orphan Pages', value: stats.orphanPageCount || 0, icon: 'link_off', color: (stats.orphanPageCount || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Security', value: stats.securityHeaderScore || '0/7', icon: 'shield', color: '#6366f1' },
                    { label: 'Broken External', value: stats.brokenExternalCount || 0, icon: 'broken_image', color: (stats.brokenExternalCount || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Broken Internal', value: stats.brokenInternalCount || 0, icon: 'link_off', color: (stats.brokenInternalCount || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Empty Anchors', value: stats.emptyAnchorCount || 0, icon: 'text_fields', color: (stats.emptyAnchorCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Nofollow Internal', value: stats.nofollowInternalCount || 0, icon: 'block', color: (stats.nofollowInternalCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Canon. Conflicts', value: stats.conflictingCanonicalCount || 0, icon: 'content_copy', color: (stats.conflictingCanonicalCount || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Browser Cache', value: stats.cacheControlPresent ? 'Yes' : 'No', icon: 'cached', color: stats.cacheControlPresent ? '#10b981' : '#f59e0b' },
                    { label: 'AI Crawl (llms.txt)', value: stats.llmsTxtFound ? 'Found' : 'Missing', icon: 'smart_toy', color: stats.llmsTxtFound ? '#10b981' : '#f59e0b' },
                    // ── Semrush parity: Missing metrics ──
                    { label: 'Missing H1', value: stats.missingH1Count || 0, icon: 'title', color: (stats.missingH1Count || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Multiple H1', value: stats.multipleH1Count || 0, icon: 'format_h1', color: (stats.multipleH1Count || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Perm. Redirects', value: stats.permanentRedirectCount || 0, icon: 'alt_route', color: (stats.permanentRedirectCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Blocked (robots)', value: stats.blockedByRobotsTxtCount || 0, icon: 'gpp_bad', color: (stats.blockedByRobotsTxtCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Missing Alt Text', value: stats.missingAltCount || 0, icon: 'image_not_supported', color: (stats.missingAltCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Dup. Titles', value: stats.titleDuplicateCount || 0, icon: 'file_copy', color: (stats.titleDuplicateCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Redirect Chains', value: stats.redirectChainCount || 0, icon: 'link', color: (stats.redirectChainCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Missing Meta Desc', value: stats.missingMetaDescCount || 0, icon: 'description', color: (stats.missingMetaDescCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Schema Types', value: (stats.schemaTypes || []).length > 0 ? (stats.schemaTypes || []).length : '✗', icon: 'data_object', color: (stats.schemaTypes || []).length > 0 ? '#10b981' : '#f43f5e' },
                    { label: 'Slow Pages (>3s)', value: stats.slowPageCount || 0, icon: 'hourglass_top', color: (stats.slowPageCount || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Noindex Pages', value: stats.noindexPageCount || 0, icon: 'visibility_off', color: (stats.noindexPageCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    // ── Backlink Intelligence (DataForSEO) ──
                    ...(stats.backlinkDataAvailable ? [
                      { label: 'Referring Domains', value: (stats.referringDomains || 0).toLocaleString(), icon: 'hub', color: '#8b5cf6' },
                      { label: 'Domain Rank', value: stats.domainRank || 0, icon: 'military_tech', color: '#8b5cf6' },
                    ] : []),
                    // ── Moz Domain Authority ──
                    ...(stats.mozAvailable ? [
                      { label: 'Domain Auth. (DA)', value: stats.domainAuthority || 0, icon: 'verified', color: '#f59e0b' },
                      { label: 'Page Auth. (PA)', value: stats.pageAuthority || 0, icon: 'description', color: '#f59e0b' },
                      { label: 'Spam Score', value: `${stats.spamScore || 0}%`, icon: 'shield', color: (stats.spamScore || 0) > 30 ? '#f43f5e' : '#10b981' },
                    ] : []),
                    // ── Resource Scanning (Semrush parity) ──
                    { label: 'Blocked Resources', value: stats.blockedResourceCount || 0, icon: 'block', color: (stats.blockedResourceCount || 0) > 0 ? '#f43f5e' : '#10b981' },
                    { label: 'Uncached JS/CSS', value: stats.uncachedResourceCount || 0, icon: 'cloud_off', color: (stats.uncachedResourceCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                    { label: 'Unminified JS/CSS', value: stats.unminifiedResourceCount || 0, icon: 'compress', color: (stats.unminifiedResourceCount || 0) > 0 ? '#f59e0b' : '#10b981' },
                ].map(s => (
                    <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                        <span className="material-symbols-outlined text-lg" style={{ color: s.color }}>{s.icon}</span>
                        <div>
                            <p className="text-base font-black text-white leading-tight">{s.value}</p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Page Status Distribution */}
            {stats.pageStatusDistribution && (
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                    <span className="text-[9px] text-slate-600 font-bold uppercase">Status:</span>
                    {[
                        { label: '2xx', count: stats.pageStatusDistribution.status200, color: '#10b981' },
                        { label: '3xx', count: stats.pageStatusDistribution.status301, color: '#f59e0b' },
                        { label: '404', count: stats.pageStatusDistribution.status404, color: '#f43f5e' },
                        { label: '5xx', count: stats.pageStatusDistribution.status5xx, color: '#dc2626' },
                    ].filter(s => s.count > 0).map(s => (
                        <span key={s.label} className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${s.color}15`, color: s.color }}>
                            {s.label}: {s.count}
                        </span>
                    ))}
                    {(stats.mixedContentCount || 0) > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400">⚠️ {stats.mixedContentCount} mixed content</span>
                    )}
                    {(stats.noindexPageCount || 0) > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">🚫 {stats.noindexPageCount} noindex</span>
                    )}
                </div>
            )}
        </div>

        {/* ── Security Headers (NEW — unique feature) ── */}
        {stats.securityHeaders?.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 mb-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-violet-400">shield</span> Security Headers
                    <span className="text-[9px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full ml-auto">★ Unique to Mantram AI</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {stats.securityHeaders.map((h, i) => (
                        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${h.present ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/10'}`}>
                            <span className={`material-symbols-outlined text-sm ${h.present ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {h.present ? 'check_circle' : 'cancel'}
                            </span>
                            <div>
                                <p className={`text-[10px] font-bold ${h.present ? 'text-emerald-400' : 'text-rose-400'}`}>{h.name}</p>
                                <p className="text-[8px] text-slate-600 uppercase">{h.importance}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* ── AI Insights Panel (Competitive Moat — only Mantram has this) ── */}
        {results.aiInsights && results.aiInsights.poweredBy?.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 mb-6 border border-violet-500/15">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Insights
                        <span className="text-[8px] text-violet-400/60 bg-violet-500/10 px-1.5 py-0.5 rounded-full ml-1">★ Mantram AI Exclusive</span>
                    </h4>
                    <button onClick={() => setShowAiInsights(!showAiInsights)}
                        className="text-[10px] font-bold text-violet-400 px-2 py-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/15 cursor-pointer transition-all flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">{showAiInsights ? 'expand_less' : 'expand_more'}</span>
                        {showAiInsights ? 'Hide' : 'Show'}
                    </button>
                </div>
                {showAiInsights && (
                    <div className="space-y-4 animate-fade-in">
                        {/* AI Trend Summary */}
                        {results.aiInsights.trendSummary && (
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs text-amber-400">trending_up</span> AI Trend Analysis
                                </p>
                                <p className="text-xs text-slate-300 leading-relaxed">{results.aiInsights.trendSummary}</p>
                            </div>
                        )}

                        {/* AI Fix Priorities */}
                        {results.aiInsights.fixPriorities?.length > 0 && (
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs text-emerald-400">priority_high</span> Top Fixes by Traffic Impact
                                </p>
                                <div className="space-y-2">
                                    {results.aiInsights.fixPriorities.map((fix, i) => (
                                        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all">
                                            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                                                fix.impact === 'high' ? 'bg-rose-500/20 text-rose-400' : fix.impact === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'
                                            }`}>#{fix.rank}</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-white">{fix.title}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">{fix.reason}</p>
                                            </div>
                                            {fix.estimatedScoreGain > 0 && (
                                                <span className="flex-shrink-0 text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">+{fix.estimatedScoreGain} pts</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* AI Duplicate Validation */}
                        {results.aiInsights.duplicateValidation && (
                            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs text-blue-400">content_copy</span> AI Duplicate Validation
                                </p>
                                <p className="text-xs text-slate-300 mb-2">{results.aiInsights.duplicateValidation.summary}</p>
                                <div className="flex gap-3">
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400">
                                        {results.aiInsights.duplicateValidation.trueDuplicateCount} True Duplicates
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                                        {results.aiInsights.duplicateValidation.falsePositiveCount} False Positives
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Powered By */}
                        <div className="flex items-center gap-2 pt-2 border-t border-white/[0.04]">
                            <span className="text-[8px] text-slate-600 uppercase font-bold">Powered by</span>
                            {results.aiInsights.poweredBy.map((model, i) => (
                                <span key={i} className="text-[8px] text-violet-400/60 bg-violet-500/8 px-1.5 py-0.5 rounded-full">{model}</span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* Action Board */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <ActionBucket title="🔧 Fix Now" items={results.fixNow} color="rose" />
            <ActionBucket title="✏️ Create Next" items={results.createNext} color="emerald" />
            <ActionBucket title="👁️ Monitor" items={results.monitor} color="blue" />
        </div>

        {/* ── Per-Page Report Cards (NEW — like Semrush) ── */}
        {pageReports.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-blue-400">analytics</span> Per-Page Report ({pageReports.length} pages)
                    </h4>
                    <button onClick={() => setShowPageCards(!showPageCards)}
                        className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/15 cursor-pointer transition-all flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">{showPageCards ? 'expand_less' : 'expand_more'}</span>
                        {showPageCards ? 'Collapse' : 'Expand'}
                    </button>
                </div>
                {showPageCards && (
                    <div className="space-y-2 animate-fade-in">
                        {pageReports.map((page, i) => {
                            const pageIssueTags = []
                            if (!page.hasH1) pageIssueTags.push('No H1')
                            if (page.h1Count > 1) pageIssueTags.push(`${page.h1Count} H1s`)
                            if (!page.headingHierarchyValid) pageIssueTags.push('Heading Skip')
                            if (page.titleLength === 0) pageIssueTags.push('No Title')
                            if (page.titleLength > 60) pageIssueTags.push('Title Too Long')
                            if (page.metaDescLength === 0) pageIssueTags.push('No Meta Desc')
                            if (page.imagesWithoutAlt > 0) pageIssueTags.push(`${page.imagesWithoutAlt} No-Alt Imgs`)
                            if (page.urlTooLong) pageIssueTags.push('URL >75 chars')
                            if (page.metaRobots?.noindex) pageIssueTags.push('noindex')
                            if (page.wordCount < 300 && page.wordCount > 0) pageIssueTags.push('Thin')
                            if (page.responseTimeMs > 3000) pageIssueTags.push('Slow')

                            return (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-all">
                                    {/* Status dot */}
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pageIssueTags.length === 0 ? 'bg-emerald-400' : pageIssueTags.length <= 2 ? 'bg-amber-400' : 'bg-rose-400'}`} />
                                    {/* URL + title */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-bold text-white truncate">{page.title || page.url}</p>
                                        <p className="text-[9px] text-slate-600 truncate">{page.url}</p>
                                    </div>
                                    {/* Stats */}
                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <span className="text-[9px] text-slate-500">{page.responseTimeMs}ms</span>
                                        <span className="text-[9px] text-slate-500">{page.pageSizeKB}KB</span>
                                        <span className="text-[9px] text-slate-500">{page.wordCount}w</span>
                                    </div>
                                    {/* Issue tags */}
                                    {pageIssueTags.length > 0 && (
                                        <div className="flex gap-1 flex-shrink-0">
                                            {pageIssueTags.slice(0, 3).map((tag, ti) => (
                                                <span key={ti} className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400">{tag}</span>
                                            ))}
                                            {pageIssueTags.length > 3 && <span className="text-[8px] text-slate-600">+{pageIssueTags.length - 3}</span>}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        )}

        {/* ── ERRORS / WARNINGS / NOTICES (Semrush-style) ── */}
        {groupedIssues && (groupedIssues.errorCount > 0 || groupedIssues.warningCount > 0 || groupedIssues.noticeCount > 0) && (
            <div className="space-y-4 mb-6">
                {[
                    { key: 'errors', label: 'Errors', items: groupedIssues?.errors || [], color: '#f43f5e', bg: 'bg-rose-500', icon: 'error' },
                    { key: 'warnings', label: 'Warnings', items: groupedIssues?.warnings || [], color: '#f59e0b', bg: 'bg-amber-500', icon: 'warning' },
                    { key: 'notices', label: 'Notices', items: groupedIssues?.notices || [], color: '#3b82f6', bg: 'bg-blue-500', icon: 'info' },
                ].filter(g => g.items.length > 0).map(group => (
                    <details key={group.key} open={group.key === 'errors'} className="glass-panel rounded-2xl overflow-hidden">
                        <summary className="cursor-pointer p-4 flex items-center gap-3 hover:bg-white/[0.02] transition-all">
                            <span className="material-symbols-outlined text-lg" style={{ color: group.color }}>{group.icon}</span>
                            <span className="text-sm font-bold text-white">{group.label}</span>
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-black text-white ${group.bg}/20`} style={{ background: `${group.color}20`, color: group.color }}>
                                {group.items.length}
                            </span>
                            <span className="material-symbols-outlined text-sm text-slate-600 ml-auto">expand_more</span>
                        </summary>
                        <div className="px-4 pb-4 space-y-2">
                            {group.items.map((issue, idx) => (
                                <details key={idx} className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                                    <summary className="cursor-pointer p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-all">
                                        <span className="w-1 h-6 rounded-full shrink-0" style={{ background: group.color }} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white truncate">{issue.check}</p>
                                            <p className="text-[10px] text-slate-500">{issue.value}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-sm text-slate-600">chevron_right</span>
                                    </summary>
                                    <div className="px-4 pb-3 border-t border-white/[0.04] mt-1 pt-3 space-y-2">
                                        {issue.aboutThisIssue && (
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">About this issue</p>
                                                <p className="text-xs text-slate-300 leading-relaxed">{issue.aboutThisIssue}</p>
                                            </div>
                                        )}
                                        {issue.howToFix && (
                                            <div>
                                                <p className="text-[10px] font-bold text-emerald-400 uppercase mb-1">How to fix</p>
                                                <p className="text-xs text-slate-300 leading-relaxed">{issue.howToFix}</p>
                                            </div>
                                        )}
                                        {issue.affectedUrls?.length > 0 && (
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Affected Pages ({issue.affectedUrls.length})</p>
                                                <div className="space-y-1">
                                                    {issue.affectedUrls.slice(0, 10).map((url, j) => (
                                                        <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                                            className="block text-[10px] text-primary/60 hover:text-primary truncate transition-colors">{url}</a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        )}

        {/* AI-Generated Issues List */}
        <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">{issues.length} AI-Identified Issues</h3>
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
                {filtered.map((issue, i) => <IssueCard key={i} issue={issue} url={results.targetUrl || results.domain} brandId={results.brand || results.brandId} />)}
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 items-center border-b border-white/[0.04] pb-6 mb-6">
                <ScoreRing score={results.aiVisibilityScore || 0} size={100} label="AI Visibility" color="violet" />
                <ScoreRing score={results.schemaScore || 50} size={100} label="Schema & Data" color="emerald" />
                <ScoreRing score={results.contentScore || 50} size={100} label="Content" color="amber" />
                <ScoreRing score={results.authorityScore || 50} size={100} label="Authority" color="blue" />
            </div>
            <div className="flex-1">
                <p className="text-sm text-slate-300 leading-relaxed">{results.summary}</p>
                {results.scoreBreakdown && <p className="text-[10px] text-slate-600 mt-2">Score: {results.scoreBreakdown.formula} — On-page: {results.scoreBreakdown.onPageAnalysis}, Probe: {results.scoreBreakdown.realProbeScore}{results.scoreBreakdown.margin > 0 ? ` ±${results.scoreBreakdown.margin}` : ''} <span className={`ml-2 px-1.5 py-0.5 rounded-full ${results.scoreBreakdown.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400' : results.scoreBreakdown.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>{results.scoreBreakdown.confidence || 'unknown'} confidence</span></p>}
            </div>
        </div>

        {/* ═══ Live AI Probe Results (Real LLM Data) ═══ */}
        {results.geoProbe && (
            <div className="glass-panel rounded-2xl p-5 mb-6 border border-violet-500/10">
                <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">smart_toy</span> Live AI Probe — Real LLM Responses
                    {results.geoProbe.samplesPerPrompt > 1 && <span className="ml-auto text-[9px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 font-medium">{results.geoProbe.samplesPerPrompt}x Multi-Sample</span>}
                    {results.geoProbe.sentimentMethod === 'llm' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-medium">LLM Sentiment</span>}
                </h4>

                {/* Probe Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                        { label: 'Mention Rate', value: `${results.geoProbe.mentionRate}%`, icon: 'trending_up', color: results.geoProbe.mentionRate > 50 ? '#10b981' : results.geoProbe.mentionRate > 20 ? '#f59e0b' : '#f43f5e' },
                        { label: 'Weighted Rate', value: `${results.geoProbe.weightedMentionRate || results.geoProbe.mentionRate}%`, icon: 'balance', color: '#a78bfa' },
                        { label: 'Total Probes', value: results.geoProbe.totalProbes, icon: 'query_stats', color: '#8b5cf6' },
                        { label: 'Score', value: results.geoProbe.scoreCI ? `${results.geoProbe.realScore}±${results.geoProbe.scoreCI.margin}` : results.geoProbe.realScore, icon: 'verified', color: results.geoProbe.realScore > 50 ? '#10b981' : '#f59e0b' },
                    ].map(s => (
                        <div key={s.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="material-symbols-outlined text-lg" style={{ color: s.color }}>{s.icon}</span>
                            <div>
                                <p className="text-base font-black text-white leading-tight">{s.value}</p>
                                <p className="text-[9px] text-slate-500 font-bold uppercase">{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Per-Model Breakdown */}
                {results.geoProbe.modelBreakdown && (
                    <div className="flex gap-3 mb-4 flex-wrap">
                        {Object.entries(results.geoProbe.modelBreakdown).map(([model, data]) => (
                            <div key={model} className="flex-1 min-w-[140px] p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">{model}</p>
                                <p className="text-lg font-black text-white">{data.mentionRate}%</p>
                                <p className="text-[9px] text-slate-600">{data.mentioned}/{data.probed} probes mentioned brand</p>
                                <div className="flex gap-1 mt-1">
                                    {data.sentiment.positive > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{data.sentiment.positive} positive</span>}
                                    {data.sentiment.neutral > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400">{data.sentiment.neutral} neutral</span>}
                                    {data.sentiment.negative > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400">{data.sentiment.negative} negative</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Sentiment Distribution */}
                {results.geoProbe.sentimentDistribution && (
                    <div className="mb-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Sentiment Distribution</p>
                        <div className="h-3 rounded-full overflow-hidden flex bg-slate-800">
                            {(() => { const sd = results.geoProbe.sentimentDistribution; const total = Math.max(1, (sd.positive || 0) + (sd.neutral || 0) + (sd.negative || 0)); return (<>
                                {sd.positive > 0 && <div className="bg-emerald-500 transition-all" style={{ width: `${(sd.positive / total) * 100}%` }} />}
                                {sd.neutral > 0 && <div className="bg-slate-500 transition-all" style={{ width: `${(sd.neutral / total) * 100}%` }} />}
                                {sd.negative > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(sd.negative / total) * 100}%` }} />}
                            </>); })()}
                        </div>
                        <div className="flex gap-4 mt-1">
                            <span className="text-[9px] text-emerald-400">● Positive: {results.geoProbe.sentimentDistribution.positive}</span>
                            <span className="text-[9px] text-slate-400">● Neutral: {results.geoProbe.sentimentDistribution.neutral}</span>
                            <span className="text-[9px] text-red-400">● Negative: {results.geoProbe.sentimentDistribution.negative}</span>
                        </div>
                    </div>
                )}

                {/* Share of Voice */}
                {results.geoProbe.shareOfVoice && Object.keys(results.geoProbe.shareOfVoice).length > 0 && (
                    <div className="mb-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Share of Voice (across AI models)</p>
                        <div className="space-y-1.5">
                            {Object.entries(results.geoProbe.shareOfVoice).sort((a, b) => b[1] - a[1]).map(([name, pct]) => (
                                <div key={name} className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 w-24 truncate">{name}</span>
                                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] text-white font-bold w-8 text-right">{pct}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {/* Citation Drift (vs previous probe) */}
                {results.geoProbe.citationDrift && (
                    <div className="mb-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Citation Drift (vs Previous Probe)</p>
                        <div className="flex gap-3 mb-2">
                            <span className="text-[9px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400">{results.geoProbe.citationDrift.newCitations?.length || 0} new</span>
                            <span className="text-[9px] px-2 py-1 rounded-lg bg-red-500/10 text-red-400">{results.geoProbe.citationDrift.lostCitations?.length || 0} lost</span>
                            <span className="text-[9px] px-2 py-1 rounded-lg bg-slate-500/10 text-slate-400">{results.geoProbe.citationDrift.retained || 0} retained</span>
                            <span className={`text-[9px] px-2 py-1 rounded-lg ${results.geoProbe.citationDrift.driftRate > 50 ? 'bg-red-500/10 text-red-400' : results.geoProbe.citationDrift.driftRate > 20 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{results.geoProbe.citationDrift.driftRate}% drift rate</span>
                        </div>
                        {results.geoProbe.citationDrift.newCitations?.length > 0 && (
                            <div className="text-[9px] text-slate-500 mb-1">
                                <strong className="text-emerald-400">New citations:</strong> {results.geoProbe.citationDrift.newCitations.slice(0, 5).join(', ')}
                            </div>
                        )}
                        {results.geoProbe.citationDrift.lostCitations?.length > 0 && (
                            <div className="text-[9px] text-slate-500">
                                <strong className="text-red-400">Lost citations:</strong> {results.geoProbe.citationDrift.lostCitations.slice(0, 5).join(', ')}
                            </div>
                        )}
                    </div>
                )}

                {/* Real AI Snippets */}
                {results.geoProbe.topSnippets?.length > 0 && (
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">What AI Models Say About Your Brand</p>
                        <div className="space-y-2">
                            {results.geoProbe.topSnippets.map((s, i) => (
                                <div key={i} className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                                    <p className="text-[9px] text-violet-400 font-bold mb-1">{s.model} — "{s.prompt}"</p>
                                    <p className="text-[11px] text-slate-300 italic leading-relaxed">"{s.snippet}"</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* ═══ Competitive Position + Entity Confidence + Citations ═══ */}
        {results.geoProbe && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                {/* Competitive Position */}
                <div className="glass-panel rounded-2xl p-4 text-center">
                    <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">AI Market Position</p>
                    <span className={`text-lg font-black px-4 py-1.5 rounded-full ${
                        results.geoProbe.competitivePosition === 'Leader' ? 'bg-emerald-500/15 text-emerald-400' :
                        results.geoProbe.competitivePosition === 'Challenger' ? 'bg-amber-500/15 text-amber-400' :
                        'bg-slate-500/15 text-slate-400'
                    }`}>{results.geoProbe.competitivePosition || 'Niche'}</span>
                    <p className="text-[9px] text-slate-600 mt-2">{
                        results.geoProbe.competitivePosition === 'Leader' ? 'Dominant AI visibility (40%+ SoV)' :
                        results.geoProbe.competitivePosition === 'Challenger' ? 'Growing AI presence (20-40% SoV)' :
                        'Low AI visibility (<20% SoV) — needs optimization'
                    }</p>
                </div>

                {/* Entity Confidence */}
                {results.geoProbe.entityConfidence && (
                    <div className="glass-panel rounded-2xl p-4 text-center">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Entity Recognition</p>
                        <p className="text-2xl font-black text-white">{results.geoProbe.entityConfidence.recognitionRate}%</p>
                        <p className="text-[9px] text-slate-600">AI recognizes your brand in {results.geoProbe.entityConfidence.recognized}/{results.geoProbe.entityConfidence.probed} brand-specific probes</p>
                    </div>
                )}

                {/* Citations Found */}
                {results.geoProbe.citations?.length > 0 && (
                    <div className="glass-panel rounded-2xl p-4">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Citation Sources ({results.geoProbe.citations.length})</p>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                            {results.geoProbe.citations.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-violet-400 hover:text-violet-300 truncate">{url.replace(/^https?:\/\//, '')}</a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* ═══ Content Gaps — prompts where competitors appear but brand doesn't ═══ */}
        {results.geoProbe?.contentGaps?.length > 0 && (
            <div className="glass-panel rounded-2xl p-5 mb-6 border border-amber-500/10">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">warning</span> Content Gaps — Your Competitors Appear, You Don't
                </h4>
                <div className="space-y-2">
                    {results.geoProbe.contentGaps.map((gap, i) => (
                        <div key={i} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                            <p className="text-[11px] text-white font-bold">"{gap.prompt}"</p>
                            <p className="text-[9px] text-slate-500 mt-1">
                                <span className="text-amber-400">{(gap.models || [gap.model]).join(', ')}</span> — Competitors found: <span className="text-red-400">{gap.competitorsFound.join(', ')}</span>
                            </p>
                            <p className="text-[9px] text-emerald-400 mt-0.5">{gap.opportunity}</p>
                        </div>
                    ))}
                </div>
            </div>
        )}
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
                    {bd[s.key].recommendations && <div className="space-y-4">{(Array.isArray(bd[s.key].recommendations) ? bd[s.key].recommendations : []).map((r, i) => (
                        <div key={i} className="text-[11px] text-slate-300 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl overflow-hidden">
                            <div className="flex items-start gap-2 mb-2">
                                <span className="text-emerald-400 mt-0.5">✓</span>
                                <div className="flex-1">
                                    {typeof r === 'string' ? <p>{r}</p> : (
                                        <>
                                            <p className="font-bold text-white text-sm mb-1">{r.title || r.description}</p>
                                            {r.aiImpact && <p className="text-violet-400 text-[10px] mb-2">{r.aiImpact}</p>}
                                            {r.codeSnippet && (
                                                <div className="relative group mt-3">
                                                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Generated Fix Code</p>
                                                    <pre className="p-3 rounded-lg bg-[#080a14] border border-white/[0.06] overflow-x-auto text-[10px] text-slate-300 font-mono">
                                                        <code>{r.codeSnippet}</code>
                                                    </pre>
                                                    <button onClick={() => navigator.clipboard.writeText(r.codeSnippet)}
                                                        className="absolute top-6 right-2 p-1.5 rounded bg-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
                                                        title="Copy Code">
                                                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
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

function IssueCard({ issue, brandId, url }) {
    const [expanded, setExpanded] = useState(false)
    const [fixing, setFixing] = useState(false)
    const [fixData, setFixData] = useState(null)

    const handleAutoFix = async (e) => {
        e.stopPropagation()
        if (fixing || fixData) return

        setFixing(true)
        try {
            // we wrap the issue in an array since the backend expects 'issues'
            const result = await seoAPI.autoFix({ 
                brandId, 
                url, 
                issues: [{ title: issue.title, severity: issue.severity, description: issue.description, fix: issue.fix }] 
            })
            if (result.fixes && result.fixes.length > 0) {
                setFixData(result.fixes[0])
            } else if (result.schemaFixes && result.schemaFixes.length > 0) {
                setFixData(result.schemaFixes[0])
            } else {
                setFixData({ code: '/* No specific code fix generated. Follow manual instructions. */', language: 'text', instructions: 'Review the issue details manually.' })
            }
        } catch (err) {
            console.error(err)
            setFixData({ code: '/* Error generating fix. Please try again or check your credit balance. */', language: 'text' })
        }
        setFixing(false)
        if (!expanded) setExpanded(true)
    }

    return (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
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
                    {/* ── Semrush parity: About this issue + How to fix ── */}
                    {issue.aboutThisIssue && (
                        <div className="mt-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">About this issue</p>
                            <p className="text-[11px] text-slate-300 leading-relaxed">{issue.aboutThisIssue}</p>
                        </div>
                    )}
                    {issue.howToFix && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/[0.08]">
                            <p className="text-[9px] font-bold text-emerald-400 uppercase mb-1">How to fix</p>
                            <p className="text-[11px] text-slate-300 leading-relaxed">{issue.howToFix}</p>
                        </div>
                    )}
                    {issue.affectedUrls?.length > 0 && (
                        <div>
                            <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Affected Pages ({issue.affectedUrls.length})</p>
                            <div className="space-y-0.5">
                                {issue.affectedUrls.slice(0, 5).map((url, j) => (
                                    <a key={j} href={url} target="_blank" rel="noopener noreferrer"
                                        className="block text-[10px] text-primary/60 hover:text-primary truncate transition-colors">{url}</a>
                                ))}
                                {issue.affectedUrls.length > 5 && <p className="text-[9px] text-slate-600">+{issue.affectedUrls.length - 5} more</p>}
                            </div>
                        </div>
                    )}

                    {/* ── Auto-Fix Engine UI ── */}
                    <div className="mt-4 pt-3 border-t border-white/[0.04]">
                        {!fixData && !fixing ? (
                            <button onClick={handleAutoFix}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary/20 to-violet-500/20 border border-primary/30 text-primary text-[11px] font-bold hover:from-primary/30 transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                Auto-Fix Issue with AI
                            </button>
                        ) : fixing ? (
                            <div className="flex items-center gap-2 text-[11px] text-primary">
                                <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                                Writing code fix...
                            </div>
                        ) : fixData && (
                            <div className="space-y-2 animate-fade-in">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[14px] text-emerald-400">check_circle</span>
                                    <span className="text-[11px] font-bold text-emerald-400">Code Fix Generated</span>
                                </div>
                                {fixData.instructions && <p className="text-[10px] text-slate-400 mb-2">{fixData.instructions}</p>}
                                {fixData.whereToAdd && <p className="text-[10px] text-slate-400 mb-2"><strong>Location:</strong> {fixData.whereToAdd}</p>}
                                <div className="relative group">
                                    <pre className="p-3 rounded-lg bg-[#080a14] border border-white/[0.06] overflow-x-auto text-[10px] text-slate-300 font-mono">
                                        <code>{fixData.code}</code>
                                    </pre>
                                    <button onClick={() => navigator.clipboard.writeText(fixData.code)}
                                        className="absolute top-2 right-2 p-1.5 rounded bg-white/10 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/20"
                                        title="Copy Code">
                                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
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
                            <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-cyan-400 text-xs">▸</span>
                                    <p className="text-sm text-white font-bold">{typeof c === 'string' ? c : c.title}</p>
                                    {c.format && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-400 font-bold uppercase">{c.format}</span>}
                                </div>
                                {c.purpose && <p className="text-xs text-slate-400 mb-2">{c.purpose}</p>}
                                {c.targetPrompts?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {c.targetPrompts.map((p, pi) => (
                                            <span key={pi} className="text-[9px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded italic">"{p}"</span>
                                        ))}
                                    </div>
                                )}
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
    const PRIORITY_COLORS = { critical: '#fb7185', high: '#fb923c', medium: '#fbbf24' }

    return (
        <div className="space-y-6">
            {/* Summary + Citation Score */}
            <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <span className="material-symbols-outlined text-orange-400 text-2xl">chat_bubble</span>
                    <div>
                        <h2 className="text-xl font-black text-white">AI Prompt Mining</h2>
                        <p className="text-xs text-slate-500">{r.totalPromptsAnalyzed || 0} prompts analyzed</p>
                    </div>
                    {r.citationScore != null && (
                        <div className="ml-auto text-center">
                            <p className={`text-3xl font-black ${r.citationScore >= 60 ? 'text-emerald-400' : r.citationScore >= 30 ? 'text-amber-400' : 'text-rose-400'}`}>{r.citationScore}</p>
                            <p className="text-[10px] text-slate-500 font-bold">CITATION SCORE</p>
                        </div>
                    )}
                </div>
                {r.summary && <p className="text-sm text-slate-300 leading-relaxed">{r.summary}</p>}
            </div>

            {/* Category Overview Cards */}
            {r.promptCategories?.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {r.promptCategories.map((cat, ci) => (
                        <div key={ci} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                            <p className="text-sm font-bold text-white mb-2">{cat.category}</p>
                            <div className="flex items-baseline gap-2">
                                <span className="text-lg font-black text-orange-400">{cat.totalPrompts || 0}</span>
                                <span className="text-[10px] text-slate-500">prompts</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">Citation: {cat.currentCitationRate || '0%'}</p>
                            {cat.opportunity && (
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold mt-2 inline-block ${cat.opportunity === 'high' ? 'bg-emerald-400/10 text-emerald-400' : cat.opportunity === 'medium' ? 'bg-amber-400/10 text-amber-400' : 'bg-slate-400/10 text-slate-400'}`}>
                                    {cat.opportunity.toUpperCase()} OPP
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Mined Prompts — the actual individual prompts */}
            {r.minedPrompts?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-orange-400">mining</span> Mined Prompts ({r.minedPrompts.length})
                    </h3>
                    <div className="space-y-3">
                        {r.minedPrompts.map((p, pi) => {
                            const prColor = PRIORITY_COLORS[p.priority] || '#94a3b8'
                            return (
                                <div key={pi} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <p className="text-sm text-white font-medium flex-1">"{p.prompt}"</p>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap" style={{ background: `${prColor}15`, color: prColor }}>
                                            {p.priority?.toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {p.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-400/10 text-indigo-400 font-bold">{p.category}</span>}
                                        {p.searchVolume && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400 font-bold">Vol: {p.searchVolume}</span>}
                                        {p.contentFormat && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400 font-bold">{p.contentFormat}</span>}
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${p.currentlyCited ? 'bg-emerald-400/10 text-emerald-400' : 'bg-rose-400/10 text-rose-400'}`}>
                                            {p.currentlyCited ? '✓ Cited' : '✗ Not Cited'}
                                        </span>
                                    </div>
                                    {p.whyNotCited && <p className="text-xs text-slate-500 mb-1"><span className="text-rose-400 font-bold">Why not cited:</span> {p.whyNotCited}</p>}
                                    {p.contentNeeded && <p className="text-xs text-primary font-medium mb-1">→ {p.contentNeeded}</p>}
                                    {p.estimatedImpact && <p className="text-[10px] text-slate-600">Impact: {p.estimatedImpact}</p>}
                                    {p.competitorsCited?.length > 0 && <p className="text-[10px] text-amber-400 mt-1">Competitors cited: {p.competitorsCited.join(', ')}</p>}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Quick Wins */}
            {r.quickWins?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-emerald-400">bolt</span> Quick Wins
                    </h3>
                    <div className="space-y-3">
                        {r.quickWins.map((w, i) => (
                            <div key={i} className="p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/10">
                                <p className="text-sm text-white font-medium">{w.action}</p>
                                <p className="text-xs text-slate-500 mt-1">Target: "{w.targetPrompt}" • Effort: {w.effort} • Impact: {w.expectedImpact}</p>
                                {w.proofMethod && <p className="text-[10px] text-emerald-400/70 mt-1">Verify: {w.proofMethod}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Content Calendar */}
            {r.contentCalendar?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-sm text-blue-400">event</span> Content Calendar</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {r.contentCalendar.map((w, i) => (
                            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs text-primary font-bold">WEEK {w.week}</p>
                                    {w.theme && <p className="text-[10px] text-slate-500">{w.theme}</p>}
                                </div>
                                {/* Handle both flat and nested content structures */}
                                {w.contentPieces?.length > 0 ? (
                                    <div className="space-y-2">
                                        {w.contentPieces.map((cp, j) => (
                                            <div key={j} className="pl-3 border-l-2 border-primary/30">
                                                <p className="text-sm text-white font-medium">{cp.title}</p>
                                                <p className="text-xs text-slate-500">Format: {cp.format}{cp.publishBy ? ` • By: ${cp.publishBy}` : ''}</p>
                                                {cp.targetPrompts?.length > 0 && <p className="text-[10px] text-slate-600 mt-0.5">Targets: {cp.targetPrompts.join(', ').substring(0, 120)}</p>}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    /* Fallback for flat structure */
                                    <>
                                        {w.content && <p className="text-sm text-white font-bold mb-1">{w.content}</p>}
                                        <p className="text-xs text-slate-500">Format: {w.format || '—'} | Targets: {w.targetPrompts?.join(', ').substring(0, 80) || '—'}</p>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Optimizations */}
            {r.optimizations?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-indigo-400">trending_up</span> Strategic Optimizations
                    </h3>
                    <div className="space-y-4">
                        {r.optimizations.map((opt, i) => (
                            <div key={i} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${opt.priority === 'critical' ? 'bg-rose-400/10 text-rose-400' : opt.priority === 'high' ? 'bg-orange-400/10 text-orange-400' : 'bg-amber-400/10 text-amber-400'}`}>{opt.priority?.toUpperCase()}</span>
                                    <h4 className="text-sm font-bold text-white">{opt.title}</h4>
                                </div>
                                <p className="text-xs text-slate-400 mb-2">{opt.description}</p>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    {opt.kpi && <div><span className="text-slate-600">KPI:</span> <span className="text-slate-400">{opt.kpi}</span></div>}
                                    {opt.baseline && <div><span className="text-slate-600">Baseline:</span> <span className="text-slate-400">{opt.baseline}</span></div>}
                                    {opt.target && <div><span className="text-slate-600">Target:</span> <span className="text-emerald-400">{opt.target}</span></div>}
                                    {opt.timeline && <div><span className="text-slate-600">Timeline:</span> <span className="text-slate-400">{opt.timeline}</span></div>}
                                </div>
                                {opt.expectedROI && <p className="text-[10px] text-primary mt-1">ROI: {opt.expectedROI}</p>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// SEO STUDIO — Help Documentation View
// ═══════════════════════════════════════════════════════════════
// Uses useState from the top-level import

const SEO_HELP_SECTIONS = [
    {
        id: 'overview',
        icon: 'rocket_launch',
        color: '#6366f1',
        title: 'Getting Started',
        subtitle: 'How SEO Studio works — start here',
        steps: [
            { icon: 'domain', title: 'Step 1: Select Your Brand', description: 'SEO Studio analyzes your actual website. Select your brand from the top-right dropdown — the studio reads your website URL from Brand DNA. All workflows crawl your real pages, not hypotheticals. If no website is set, go to Brand DNA first and add one.' },
            { icon: 'auto_awesome', title: 'Step 2: Ask or Run a Tool', description: 'Two ways to use the studio: (1) Type any SEO question in the Ask Bar — e.g., "Why am I not ranking for my brand name?" — for instant AI answers. (2) Click any tool in the left sidebar to run a full workflow with deep analysis.' },
            { icon: 'dashboard', title: 'Navigation Sidebar', description: 'The left sidebar organizes 16 tools into categories: Quick Actions (Health Check, Traffic, AI Visibility), Audit & Fix (Site Audit, On-Page, Auto-Fix), Intelligence (Keywords, Content Gaps, GEO, LLM Probe, Prompt Mining), Competitors (Beat Competitors, War Room, Competitor Intel), Link Building (Backlinks), and Reports (Overview, Reports & Plans).' },
            { icon: 'save', title: 'Auto-Saved Results', description: 'All generated results are automatically saved. When you return to any tool, your previous results are loaded instantly. A "Last generated" timestamp shows when data was created. Click "Regenerate" to run a fresh analysis (uses credits).' },
            { icon: 'description', title: 'Generate Report', description: 'After running any analysis, click "Generate Report" in the top-right to create a shareable PDF report of your SEO status. Reports are saved and can be accessed from the Reports & Plans section.' },
        ]
    },
    {
        id: 'health-check',
        icon: 'health_and_safety',
        color: '#10b981',
        title: '🏥 Health Check',
        subtitle: 'Full SEO + AI visibility audit — run this first',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Crawls your entire website and runs a comprehensive audit covering 5 dimensions: Technical SEO (page speed, mobile-friendliness, crawlability, SSL, sitemap), Content Quality (heading structure, meta tags, keyword density, content length, readability), Authority Signals (backlink profile, domain age, brand mentions), AI Readiness (schema markup, FAQ blocks, structured data), and overall SEO Health.' },
            { icon: 'speed', title: 'What You Get', description: '5 scores out of 100: SEO Health, AI Visibility, Technical, Content, and Authority. A strategic summary explaining your position. Categorized issues sorted by severity (Critical → High → Medium → Low), each with a title, description, category, and "why it matters" explanation. A top opportunity recommendation. Industry benchmark comparison. Competitor hints based on your category.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Focus on Critical and High severity issues first — these cause the most ranking damage. For each issue, read "why it matters" to understand the business impact. After reviewing issues, immediately run Auto-Fix Code — it generates copy-paste HTML/schema fixes for every issue found. Re-run Health Check every 30 days to track improvement.' },
            { icon: 'schedule', title: 'When To Run', description: 'Run this FIRST when you set up a new brand. Then re-run monthly, or after making major website changes (redesign, new pages, domain migration). This is your SEO baseline — all other tools build on it.' },
        ]
    },
    {
        id: 'traffic',
        icon: 'trending_up',
        color: '#3b82f6',
        title: '📈 Get Me Traffic',
        subtitle: 'Keyword discovery, content gaps & 30-day growth plan',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Analyzes your website\'s existing content and discovers keyword opportunities you\'re missing. Uses your actual page content to identify topical gaps, finds rising keywords in your industry, spots seasonal trends you can capitalize on, and analyzes your competitors\' ranking keywords to find what you should be targeting.' },
            { icon: 'key', title: 'What You Get', description: 'Keyword clusters grouped by topic (not individual keywords) with difficulty scores, search intent labels (buy, learn, compare, local), and funnel stage (awareness → decision). Rising keywords showing upward search trends. Quick wins — keywords where you\'re almost ranking and a single blog post could push you to page 1. A strategic 4-week traffic growth plan with specific content pieces to create each week.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Start with Quick Wins — these are high-ROI opportunities. Then build content around keyword clusters (Google rewards topical depth over isolated articles). Follow the 30-day plan to systematically grow traffic. For each cluster, prioritize high volume + low difficulty combinations. Use the funnel stage labels to create content matching search intent — don\'t write a buying guide for an "awareness" keyword.' },
            { icon: 'schedule', title: 'When To Run', description: 'Run after Health Check to know what to write about. Re-run every 60-90 days to catch new trends and rising keywords. Also run when planning a content calendar for the next quarter.' },
        ]
    },
    {
        id: 'ai-visibility',
        icon: 'smart_toy',
        color: '#06b6d4',
        title: '🤖 AI Visibility',
        subtitle: 'Check if ChatGPT, Gemini & Perplexity can find your brand',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Evaluates whether AI search engines (ChatGPT, Gemini, Perplexity, Google AI Overviews) can find, understand, and recommend your brand. Crawls your website to check: schema.org structured data (JSON-LD), FAQ markup, heading hierarchy, entity mentions, answer-first content patterns, and trust signals (reviews, certifications, author info).' },
            { icon: 'visibility', title: 'What You Get', description: 'An AI Visibility score with breakdown: Schema Readiness score (how well your structured data is set up), Content Clarity score (whether AI can extract clear answers from your pages), Entity Strength score (whether AI recognizes your brand as an entity), and Trust Signals score. AI-ready templates with copy-paste examples. Priority actions ranked by impact. Specific advice for Google AI Overviews, ChatGPT, and Perplexity separately.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Implement the suggested schema markup and FAQ blocks on your website — these are the #1 signals AI models use when deciding which brands to mention. Use the priority actions list in order — they\'re ranked by impact. After implementing changes, run Auto-Fix Code to get the exact HTML/JSON-LD code to paste into your website.' },
            { icon: 'schedule', title: 'When To Run', description: 'Run alongside Health Check as part of your initial audit. Re-run after adding schema markup or FAQ pages to verify improvement. Critical for brands in competitive industries where AI search is growing (e-commerce, SaaS, local services).' },
        ]
    },
    {
        id: 'site-audit',
        icon: 'bug_report',
        color: '#ef4444',
        title: '🔍 Site Audit',
        subtitle: 'Deep technical SEO crawl with issue-by-issue analysis',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Deep technical crawl of your website that analyzes every aspect of your technical SEO: broken links (404s), missing/duplicate meta tags, slow-loading pages, mobile usability issues, missing alt tags on images, orphan pages (no internal links), duplicate content, redirect chains, missing canonical tags, and XML sitemap issues.' },
            { icon: 'bug_report', title: 'What You Get', description: 'A categorized list of technical issues with severity badges (Critical, High, Medium, Low). Each issue includes: what\'s wrong, which page is affected, why it matters for rankings, and exactly how to fix it. Issues are grouped by category (indexability, performance, content, links, mobile, schema) so you can tackle them systematically.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Work through issues top-down by severity. Critical issues should be fixed same-day (they actively hurt your rankings). High issues within a week. Medium issues within a month. After fixing, re-run the audit to confirm the issue count dropped. Share the report with your developer — each issue has clear fix instructions.' },
        ]
    },
    {
        id: 'on-page',
        icon: 'tune',
        color: '#06b6d4',
        title: '🔧 On-Page Fixer',
        subtitle: 'Page-level optimization for any URL on your site',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Analyzes a specific page URL from your website in deep detail. Checks the page\'s: title tag (length, keyword placement, click-worthiness), meta description (length, call-to-action, keyword inclusion), heading structure (H1-H6 hierarchy, keyword usage), content quality (length, readability, keyword density, uniqueness), internal links (are you linking to this page from other pages?), image optimization (alt tags, file sizes, lazy loading), and schema markup presence.' },
            { icon: 'tune', title: 'What You Get', description: 'Page-specific optimization recommendations with before/after examples. Suggested title tag rewrites. Meta description improvements. Heading structure recommendations. Internal linking suggestions — which other pages on your site should link to this page. Keyword density analysis showing if you\'re under-optimizing or keyword-stuffing. Content improvement suggestions with specific sections to add or rewrite.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Use this for your most important pages — product pages, landing pages, homepage, category pages. Apply the title/meta suggestions first (quickest win). Then improve heading structure and add missing schema. Great for pre-launch auditing of new pages before they go live.' },
        ]
    },
    {
        id: 'auto-fix',
        icon: 'build',
        color: '#14b8a6',
        title: '⚡ Auto-Fix Code',
        subtitle: 'Copy-paste code fixes — no coding needed',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Takes the issues found by Health Check or Site Audit and generates ready-to-paste code fixes for each one. Creates: schema.org JSON-LD blocks (Organization, FAQ, Product, Article, LocalBusiness), corrected meta tags, proper heading structure HTML, FAQ page markup, Open Graph tags, and Twitter Card tags. All code is specific to YOUR brand and website.' },
            { icon: 'code', title: 'What You Get', description: 'For each issue: a code block you can copy and paste directly into your website\'s HTML. The code is production-ready — not templates with placeholders, but actual code with your brand name, URLs, and content pre-filled. Includes instructions on exactly where to paste each block (e.g., "Add this inside <head>" or "Place this before </body>").' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Copy each code block and paste it into your website. If you use WordPress, paste into your theme\'s header.php or use a plugin like "Insert Headers and Footers." If you use Shopify, paste into theme.liquid. No technical knowledge needed — just copy and paste. Verify the fixes worked by re-running Health Check.' },
            { icon: 'warning', title: 'Prerequisite', description: 'You must run Health Check or Site Audit first. Auto-Fix uses the issues they found to generate fixes. If you run Auto-Fix without a prior audit, it will tell you to run Health Check first.' },
        ]
    },
    {
        id: 'keywords',
        icon: 'key',
        color: '#f59e0b',
        title: '🔑 Keyword Intelligence',
        subtitle: 'Deep keyword research with volume, difficulty & intent',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Performs deep keyword research based on your website\'s content and industry. Goes beyond basic keyword suggestions — clusters keywords by topic theme so you can build topical authority (which Google rewards over targeting isolated keywords). Analyzes search intent to ensure you create the right type of content for each keyword.' },
            { icon: 'key', title: 'What You Get', description: 'Keyword clusters organized by topic (e.g., "cloud security," "data backup," "compliance"). Each cluster shows: estimated monthly search volume, competition difficulty (easy/medium/hard), search intent (informational, transactional, navigational, commercial), opportunity score combining volume vs. difficulty, and suggested content type (blog post, product page, FAQ, guide). Also shows long-tail variations within each cluster.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Pick 3-5 keyword clusters to focus on first. For each cluster, create a "pillar page" (comprehensive guide) and 5-10 supporting articles. This builds topical authority. Target easy/medium difficulty keywords first for quicker wins. Match content type to search intent — a "how to" keyword needs a tutorial, not a product page.' },
        ]
    },
    {
        id: 'content-gaps',
        icon: 'article',
        color: '#10b981',
        title: '📝 Content Gaps',
        subtitle: 'Topics competitors rank for that you don\'t',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Compares your website\'s content against your mapped competitors to find topics and keywords they cover but you don\'t. These are your content gaps — opportunities where creating a single piece of content could capture traffic your competitors are already getting. Also identifies thin content on your site that needs improvement.' },
            { icon: 'article', title: 'What You Get', description: 'A prioritized list of content gaps with: the topic/keyword your competitors rank for, which competitor(s) cover it, estimated traffic you\'re missing out on, a content brief (what to write, what to cover, suggested heading structure, target length), and how to make your version better than the existing top results (10x content strategy).' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Prioritize gaps by traffic potential — start with the highest-volume topics. Use the content briefs as your writing blueprint. Don\'t just copy competitors — the content brief shows how to add unique value (original data, case studies, expert quotes). Create 2-3 gap-filling articles per month for steady traffic growth.' },
            { icon: 'warning', title: 'Prerequisite', description: 'Add at least 2-3 competitors in the Setup section first. The more competitors you map, the more gaps will be discovered. Use "Auto-Discover" if you don\'t know your competitors.' },
        ]
    },
    {
        id: 'geo',
        icon: 'travel_explore',
        color: '#6366f1',
        title: '🌐 GEO — Generative Engine Optimization',
        subtitle: 'Unified AI search strategy across all AI engines',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'GEO (Generative Engine Optimization) is the next-gen version of SEO focused specifically on AI search engines. It combines the insights from AI Visibility, LLM Probe, and Prompt Mining into a single unified dashboard. Shows your brand\'s position across ALL generative AI search engines — Google AI Overviews, ChatGPT, Gemini, Perplexity, Claude — with a coordinated strategy to improve your citation rate across all of them simultaneously.' },
            { icon: 'travel_explore', title: 'What You Get', description: 'A unified GEO score showing your overall AI search visibility. Breakdown by each AI engine showing where you\'re strong vs. weak. Cross-engine optimization strategies that work across all AI platforms (not just one). Content format recommendations that maximize AI citations. Entity establishment strategies to make AI models recognize your brand as an authority in your space.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Focus on cross-engine wins first — optimizations that improve your visibility on ALL AI platforms simultaneously (structured data, FAQ schema, authoritative content). Then address engine-specific gaps. GEO is most valuable for brands in competitive categories where AI search is growing rapidly (e-commerce, SaaS, health, finance, education).' },
            { icon: 'schedule', title: 'When To Run', description: 'Run after you\'ve done AI Visibility and LLM Probe individually. GEO gives you the big picture and unified strategy. Re-run quarterly to track how your AI search presence is evolving.' },
        ]
    },
    {
        id: 'llm-probe',
        icon: 'psychology',
        color: '#06b6d4',
        title: '🧠 LLM Brand Probe',
        subtitle: 'Live test — what do AI models say about your brand?',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Performs a live test by asking multiple AI models (ChatGPT, Gemini, Claude) questions about your brand and industry. It\'s like Googling your brand — but on AI search engines. Checks: Do they mention your brand? How accurately do they describe you? What\'s the sentiment (positive/negative/neutral)? Which competitors do they recommend instead? What information are they missing or getting wrong?' },
            { icon: 'psychology', title: 'What You Get', description: 'A visibility score showing how well AI models know your brand. Accuracy assessment — is the information AI gives about you correct? Sentiment analysis — are AI models positive, negative, or neutral about your brand. Competitor comparison — who AI recommends instead of you and why. Information gaps — what AI doesn\'t know about you that it should. Specific recommendations for what content to create to improve your AI profile.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'If AI models don\'t mention you: Focus on entity establishment — create authoritative "About Us" content, get mentioned in industry publications, add comprehensive FAQ pages. If AI mentions you incorrectly: Create clear, factual content that AI can source from. If competitors are mentioned instead: Create comparison content, strengthen your content on topics where competitors dominate.' },
            { icon: 'schedule', title: 'When To Run', description: 'Run when you first set up your brand to establish a baseline. Then re-run after creating content specifically designed to improve AI visibility (FAQ pages, schema markup, authoritative articles). Expect 60-90 days before changes are reflected in AI model responses.' },
        ]
    },
    {
        id: 'prompt-mining',
        icon: 'chat_bubble',
        color: '#f97316',
        title: '⛏️ AI Prompt Mining',
        subtitle: 'Keyword research for AI search — what people ask ChatGPT about you',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Discovers 15-20 real-world questions that users are likely asking AI assistants (ChatGPT, Gemini, Perplexity) about your industry and niche. For each question, it evaluates whether your brand is currently being cited in AI responses, and if not, specifically WHY — missing content, no FAQ page, competitors have better structured data, weak entity signals, etc.' },
            { icon: 'chat_bubble', title: 'What You Get', description: 'A Citation Score (0-100) showing how visible your brand is across AI-generated answers. Category breakdown (Product Recommendations, How-To Guides, Comparison Queries, Industry Guides) with prompt counts and opportunity levels. Each individual mined prompt with: cited/not-cited status, priority (critical/high/medium), why you\'re not cited, what content to create, which competitors ARE cited. Quick Wins — low-effort actions for fast results. A 4-week Content Calendar with specific content pieces to create each week, including title, format, and target prompts. Strategic Optimizations with KPIs, baselines, targets, and timelines.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'This is keyword research for AI search. Start with Quick Wins (low effort, high impact). Then follow the 4-week Content Calendar — each week has themed content pieces targeting specific prompts. Create FAQ pages, comparison guides, and how-to articles that directly answer the mined prompts. After creating the content, re-run Prompt Mining in 60-90 days to check if your citation score improved.' },
            { icon: 'schedule', title: 'When To Run', description: 'Run after LLM Probe to understand WHERE your brand is missing in AI search. Re-run every 60-90 days — as you publish new content, your citation score should increase. This is the most actionable AI SEO tool because it tells you exactly what to create.' },
        ]
    },
    {
        id: 'competitors',
        icon: 'swords',
        color: '#f59e0b',
        title: '⚔️ Beat Competitors',
        subtitle: 'Competitor gap analysis with outrank strategies',
        steps: [
            { icon: 'person_add', title: 'Prerequisites', description: 'Add competitors first! Go to Setup (gear icon, sidebar bottom) and add competitor URLs. Or click "Auto-Discover" to let AI find your top 3-5 competitors based on your industry. You can have up to 8 competitors mapped. The more you add, the richer the analysis.' },
            { icon: 'info', title: 'What It Does', description: 'Crawls both your website AND your competitors\' websites. Analyzes each competitor\'s strengths and weaknesses compared to yours. Identifies exactly why they outrank you on specific keywords — is it better content, more backlinks, better schema markup, faster pages, or stronger topical authority?' },
            { icon: 'swords', title: 'What You Get', description: 'Competitor profiles with strength/weakness analysis. "Why They Win" section explaining specific ranking advantages with evidence from the crawl. Keyword battles showing who ranks for what. Gap opportunities — topics NO competitor covers well (blue ocean opportunities). An outrank plan with prioritized actions, timelines, and expected outcomes. Content ideas that would beat specific competitor pages.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Focus on the outrank plan — it\'s prioritized by impact. Start with "quick-fix" items. Use gap opportunities to create content with no competition. For keyword battles, create better content on topics where you\'re close to ranking. The "Why They Win" insights show you what to copy and what to improve upon.' },
        ]
    },
    {
        id: 'warroom',
        icon: 'shield',
        color: '#f43f5e',
        title: '🛡️ Competitor War Room',
        subtitle: 'Side-by-side scoring matrix & 90-day battle plan',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Unlike Beat Competitors (which analyzes each competitor individually), War Room puts ALL your competitors side-by-side in a scoring matrix. Compares you against every competitor simultaneously across: keyword coverage, content quality, technical SEO, schema markup, content velocity (how often they publish), backlink authority, and AI readiness.' },
            { icon: 'shield', title: 'What You Get', description: 'A competitive scoring matrix — see at a glance where you lead and where you trail. Keyword overlap analysis showing shared vs. unique keywords. Content velocity comparison — who publishes most frequently. Technical advantage comparison. A full 90-day battle plan broken into monthly phases with specific actions, targets, and expected outcomes. Defensive strategy (protecting current rankings) and offensive strategy (capturing competitor traffic).' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Use the scoring matrix to identify your biggest competitive weaknesses. Follow the 90-day battle plan month by month — it\'s structured as Month 1 (foundations), Month 2 (growth), Month 3 (domination). Share War Room results with your content team as a competitive intelligence brief. Re-run quarterly to track competitive position changes.' },
        ]
    },
    {
        id: 'backlinks',
        icon: 'link',
        color: '#3b82f6',
        title: '🔗 Backlink Intelligence',
        subtitle: 'Backlink profile analysis & link building opportunities',
        steps: [
            { icon: 'info', title: 'What It Does', description: 'Analyzes your website\'s backlink profile and compares it against competitors. Identifies high-quality link building opportunities, toxic links that could hurt your rankings, and gaps where competitors have links but you don\'t.' },
            { icon: 'link', title: 'What You Get', description: 'Backlink profile overview with estimated domain authority. High-value link opportunities — websites that link to competitors but not to you. Toxic link warnings — low-quality links that could trigger penalties. Link building strategies tailored to your industry (guest posting, resource pages, PR mentions, directory listings). Competitor backlink comparison showing their best link sources.' },
            { icon: 'checklist', title: 'How To Use Results', description: 'Start with the high-value link opportunities — these are proven link sources since they already link to competitors. Reach out to these sites with better content. Disavow toxic links through Google Search Console. Follow the link building strategy month by month. Quality over quantity — 1 link from a high-authority site is worth more than 100 from low-quality directories.' },
        ]
    },
    {
        id: 'analytics',
        icon: 'monitoring',
        color: '#3b82f6',
        title: '📊 Google Analytics & Search Console',
        subtitle: 'Real traffic data from your connected accounts',
        steps: [
            { icon: 'link', title: 'How To Connect', description: 'Go to Integrations hub (main sidebar → Integrations) and connect your Google Analytics and Search Console accounts via Google OAuth. Once connected, SEO Studio automatically reads your data — no additional setup needed. The connection is brand-specific.' },
            { icon: 'bar_chart', title: 'GA4 Dashboard', description: 'Select your GA4 property to see last 30 days of: Users, Sessions, Page Views, Bounce Rate with trend indicators (up/down from last period). A daily traffic chart showing trends. Traffic channel breakdown (organic search, direct, social media, referral, paid). Your top-performing pages ranked by views.' },
            { icon: 'search', title: 'Search Console Data', description: 'Select your Search Console site to see: Total Clicks, Impressions, Average Position, Average CTR. Your top keywords with their exact SERP positions — this is the most accurate keyword ranking data available. Top pages by click volume. Use this data to validate the AI-generated recommendations — it\'s your ground-truth SEO performance data.' },
            { icon: 'schedule', title: 'When To Check', description: 'Check weekly to monitor trends. Look for: organic traffic growth after implementing fixes, keyword position improvements, and new keywords you\'re ranking for. This data grounds all AI analysis in reality — much more valuable than estimates.' },
        ]
    },
    {
        id: 'reports',
        icon: 'summarize',
        color: '#64748b',
        title: '📋 Reports & Overview',
        subtitle: 'Generated reports, overview dashboard, and saved analyses',
        steps: [
            { icon: 'space_dashboard', title: 'Overview Dashboard', description: 'Shows a consolidated view of all your SEO metrics from previous analyses. Quick access cards for each tool showing last-run date and key scores. A bird\'s-eye view of your entire SEO position without re-running individual tools.' },
            { icon: 'summarize', title: 'Reports & Plans', description: 'Access all previously generated PDF reports. Each report captures a snapshot of your SEO status at a point in time. Use reports to: track progress over months, share with team members or clients, and compare before/after implementing fixes.' },
            { icon: 'picture_as_pdf', title: 'How To Generate', description: 'After running any workflow, click "Generate Report" in the top-right toolbar. The report is generated as a PDF and saved to this section. You can generate multiple reports over time to track your SEO journey.' },
        ]
    },
]

const SEO_PRO_TIPS = [
    { icon: '🏥', tip: 'Day 1 workflow: Health Check → Auto-Fix → implement code → re-run to verify. This alone can boost your SEO score 10-20 points.' },
    { icon: '🔍', tip: 'Use the Ask Bar for quick questions before running full workflows — it analyzes your site and often has the answer in seconds.' },
    { icon: '⚔️', tip: 'Map at least 3-5 competitors before running Beat Competitors or War Room. More competitors = richer competitive intelligence.' },
    { icon: '🤖', tip: 'AI Search is the future: run LLM Probe → see how AI sees you → run Prompt Mining → create content to fix gaps → re-run in 90 days.' },
    { icon: '🔧', tip: 'Auto-Fix Code turns audit findings into copy-paste HTML. Run Health Check → Auto-Fix → paste code into your site. No developer needed.' },
    { icon: '📊', tip: 'Connect GA & Search Console to ground AI analysis in real data. Estimates are helpful; real traffic data is the truth.' },
    { icon: '⛏️', tip: 'Prompt Mining is keyword research for AI search. Re-run every 60-90 days — your citation score should improve as you publish.' },
    { icon: '📋', tip: 'The optimal sequence: Health Check → Auto-Fix → Map Competitors → Get Traffic → AI Visibility → Prompt Mining → Content Gaps → Repeat.' },
    { icon: '🎯', tip: 'Keywords tool clusters keywords by topic. Build "pillar pages" for each cluster — Google rewards topical authority over isolated articles.' },
    { icon: '🌐', tip: 'GEO combines AI Visibility + LLM Probe + Prompt Mining into one view. Use it for the big picture after individual tools give details.' },
]

function SeoHelpView({ onBack }) {
    const [expanded, setExpanded] = useState('overview')
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="size-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-slate-400">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">menu_book</span> SEO Studio Guide
                        </h2>
                        <p className="text-sm text-slate-500">Master AI-powered SEO intelligence for your brand</p>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 mb-6" style={{ background: 'linear-gradient(135deg, #10b98108, #3b82f608, #8b5cf608)' }}>
                <h3 className="text-white font-bold mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary">info</span> What is SEO Studio?</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                    SEO Studio is your AI-powered <strong className="text-white">search intelligence hub</strong>.
                    It has <strong className="text-white">8 specialized workflows</strong> that crawl your website, analyze competitors, and generate actionable strategies.
                    From <strong className="text-white">health audits</strong> and <strong className="text-white">keyword discovery</strong> to
                    <strong className="text-white"> AI visibility optimization</strong> and <strong className="text-white">auto-generated code fixes</strong>.
                    Connected to Google Analytics & Search Console for real data.
                </p>
                <div className="flex flex-wrap gap-2">
                    {['8 Workflows', 'AI Ask Bar', 'Health Audit', 'Traffic Strategy', 'Competitor Analysis', 'AI Visibility', 'Auto-Fix', 'GA/GSC Data'].map(t => (
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
                        { label: 'Health Check', icon: 'health_and_safety', color: '#10b981' },
                        { label: 'Fix Issues', icon: 'build', color: '#f59e0b' },
                        { label: 'Map Rivals', icon: 'swords', color: '#ef4444' },
                        { label: 'Get Traffic', icon: 'trending_up', color: '#3b82f6' },
                        { label: 'AI Visibility', icon: 'smart_toy', color: '#8b5cf6' },
                        { label: 'Dominate! 🚀', icon: 'emoji_events', color: '#10b981' },
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
                {SEO_HELP_SECTIONS.map(section => (
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
                    {SEO_PRO_TIPS.map((tip, idx) => (
                        <div key={idx} className="flex gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-lg shrink-0 mt-0.5">{tip.icon}</span>
                            <p className="text-xs text-slate-400 leading-relaxed">{tip.tip}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="text-center mt-6 py-6">
                <p className="text-slate-500 text-sm mb-3">Ready to optimize?</p>
                <button onClick={onBack} className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-purple-500 text-white cursor-pointer hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2 mx-auto">
                    <span className="material-symbols-outlined text-sm">travel_explore</span> Go to SEO Studio
                </button>
            </div>
        </div>
    )
}

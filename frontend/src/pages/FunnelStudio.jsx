import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import { funnelStudio as api, nurtureSequences as nurtureApi, funnelIntelligence as intelApi, funnelAutomation as autoApi, funnelSharing as shareApi } from '../services/api'
import StudioReportButton from '../components/reports/StudioReportButton'
import Walkthrough from '../components/Walkthrough'

// ═══════════════════════════════════════════════════════════════
// FUNNEL STUDIO — Dashboard + Pipeline Kanban + Funnel Builder
// ═══════════════════════════════════════════════════════════════

const STAGE_TYPE_COLORS = {
    awareness: '#6366f1',
    interest: '#8b5cf6',
    consideration: '#f59e0b',
    decision: '#ef4444',
    retention: '#10b981',
    custom: '#64748b',
}

const SOURCE_ICONS = {
    ad: 'campaign', seo: 'search', social: 'share', dm: 'chat', direct: 'link',
    referral: 'group', email: 'email', shopify: 'storefront', manual: 'person_add',
    linkedin: 'work', website: 'language', telephonic: 'call', other: 'more_horiz',
}

const STATUS_STYLES = {
    active: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: '● Active' },
    converted: { color: '#6366f1', bg: 'rgba(99,102,241,0.1)', label: '★ Converted' },
    lost: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: '✕ Lost' },
    paused: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: '⏸ Paused' },
}

export default function FunnelStudio() {
    const { activeBrand: currentBrand } = useBrand()
    const [view, setView] = useState('dashboard') // 'dashboard' | 'pipeline' | 'builder' | 'analytics'
    const [funnels, setFunnels] = useState([])
    const [templates, setTemplates] = useState([])
    const [selectedFunnel, setSelectedFunnel] = useState(null)
    const [entriesByStage, setEntriesByStage] = useState({})
    const [analytics, setAnalytics] = useState(null)
    const [loading, setLoading] = useState(false)
    const [creatingTemplate, setCreatingTemplate] = useState(null)
    const [showAddEntry, setShowAddEntry] = useState(false)
    const [showAIModal, setShowAIModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const [suggestions, setSuggestions] = useState(null)
    const [loadingSuggestions, setLoadingSuggestions] = useState(false)
    const [duplicating, setDuplicating] = useState(null)
    const [nurtureSequencesData, setNurtureSequencesData] = useState([])
    const [showNurtureBuilder, setShowNurtureBuilder] = useState(false)
    const [nurtureLoading, setNurtureLoading] = useState(false)
    const [healthData, setHealthData] = useState(null)
    const [healthLoading, setHealthLoading] = useState(false)
    const [scoringResult, setScoringResult] = useState(null)
    const [scoringLoading, setScoringLoading] = useState(false)
    const [landingPages, setLandingPages] = useState([])
    const [pagesLoading, setPagesLoading] = useState(false)
    const [error, setError] = useState(null)

    // Automation engine state
    const [automationRules, setAutomationRules] = useState([])
    const [autoLoading, setAutoLoading] = useState(false)
    const [autoRunning, setAutoRunning] = useState(false)
    const [autoGenerating, setAutoGenerating] = useState(false)

    // New feature states
    const [revenueForecast, setRevenueForecast] = useState(null)
    const [activityFeed, setActivityFeed] = useState([])
    const [webhookData, setWebhookData] = useState(null)
    const [sharedTemplates, setSharedTemplates] = useState([])
    const [fidatoOpen, setFidatoOpen] = useState(false)
    const [showTemplates, setShowTemplates] = useState(false)

    // ── Fetch data ──
    const fetchFunnels = useCallback(async () => {
        if (!currentBrand?._id) return
        setLoading(true)
        try {
            const data = await api.list({ brandId: currentBrand._id })
            setFunnels(data.funnels || [])
        } catch { }
        finally { setLoading(false) }
    }, [currentBrand])

    const fetchTemplates = useCallback(async () => {
        try {
            const data = await api.templates()
            setTemplates(data.templates || [])
        } catch { }
    }, [])

    useEffect(() => { fetchTemplates() }, [fetchTemplates])
    useEffect(() => { fetchFunnels() }, [fetchFunnels])

    const openFunnel = async (funnel) => {
        try {
            const data = await api.get(funnel._id)
            setSelectedFunnel(data.funnel)
            setEntriesByStage(data.entriesByStage || {})
            setView('pipeline')
        } catch { }
    }

    const openAnalytics = async (funnel) => {
        try {
            const [fData, aData] = await Promise.all([
                api.get(funnel._id),
                api.analytics(funnel._id),
            ])
            setSelectedFunnel(fData.funnel)
            setAnalytics(aData.analytics)
            setView('analytics')
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const createFromTemplate = async (templateId) => {
        if (!currentBrand?._id) return
        setCreatingTemplate(templateId)
        try {
            const data = await api.create({ brandId: currentBrand._id, templateId })
            if (data.funnel) {
                await fetchFunnels()
                openFunnel(data.funnel)
            }
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setCreatingTemplate(null) }
    }

    const deleteFunnel = async (id, e) => {
        e.stopPropagation()
        if (!confirm('Delete this funnel and all its entries?')) return
        try {
            await api.delete(id)
            if (selectedFunnel?._id === id) { setSelectedFunnel(null); setView('dashboard') }
            await fetchFunnels()
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const toggleFunnelStatus = async (id, currentStatus, e) => {
        e.stopPropagation()
        const newStatus = currentStatus === 'active' ? 'paused' : 'active'
        try {
            await api.update(id, { status: newStatus })
            await fetchFunnels()
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const duplicateFunnel = async (id, e) => {
        e.stopPropagation()
        setDuplicating(id)
        try {
            const data = await api.duplicate(id)
            if (data.funnel) { await fetchFunnels(); openFunnel(data.funnel) }
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setDuplicating(null) }
    }

    const importContacts = async (formData) => {
        if (!selectedFunnel) return
        try {
            const data = await api.importContacts(selectedFunnel._id, formData)
            alert(`Imported ${data.imported} contacts!`)
            const refreshed = await api.get(selectedFunnel._id)
            setSelectedFunnel(refreshed.funnel)
            setEntriesByStage(refreshed.entriesByStage || {})
            setShowImportModal(false)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const fetchSuggestions = async () => {
        if (!selectedFunnel) return
        setLoadingSuggestions(true)
        try {
            const data = await api.aiSuggestions(selectedFunnel._id)
            setSuggestions(data.suggestions || [])
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setLoadingSuggestions(false) }
    }

    const saveBuilderStages = async (newStages) => {
        if (!selectedFunnel) return
        try {
            const data = await api.update(selectedFunnel._id, { stages: newStages })
            setSelectedFunnel(data.funnel)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    // ── Nurture Sequences ──
    const fetchNurtureSequences = async (funnelId) => {
        if (!funnelId) return
        setNurtureLoading(true)
        try {
            const data = await nurtureApi.list(funnelId)
            setNurtureSequencesData(data.sequences || [])
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setNurtureLoading(false) }
    }

    const createNurtureSequence = async (data) => {
        try {
            const result = await nurtureApi.create(data)
            if (result.sequence) {
                setNurtureSequencesData(prev => [...prev, result.sequence])
            }
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const aiGenerateNurture = async (data) => {
        try {
            const result = await nurtureApi.aiGenerate(data)
            if (result.sequence) {
                setNurtureSequencesData(prev => [...prev, result.sequence])
            }
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const updateNurtureSequence = async (id, data) => {
        try {
            const result = await nurtureApi.update(id, data)
            if (result.sequence) {
                setNurtureSequencesData(prev => prev.map(s => s._id === id ? result.sequence : s))
            }
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const deleteNurtureSequence = async (id) => {
        if (!confirm('Delete this nurture sequence?')) return
        try {
            await nurtureApi.delete(id)
            setNurtureSequencesData(prev => prev.filter(s => s._id !== id))
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const toggleNurtureSequence = async (id) => {
        try {
            const result = await nurtureApi.toggle(id)
            if (result.sequence) {
                setNurtureSequencesData(prev => prev.map(s => s._id === id ? result.sequence : s))
            }
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    // ── Phase 4: Intelligence ──
    const fetchHealth = async (funnelId) => {
        setHealthLoading(true)
        try {
            const data = await intelApi.health(funnelId)
            setHealthData(data.health)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setHealthLoading(false) }
    }

    const runScoring = async () => {
        if (!selectedFunnel) return
        setScoringLoading(true)
        try {
            const data = await intelApi.scoreEntries(selectedFunnel._id)
            setScoringResult(data)
            // Refresh entries
            const refreshed = await api.get(selectedFunnel._id)
            setSelectedFunnel(refreshed.funnel)
            setEntriesByStage(refreshed.entriesByStage || {})
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setScoringLoading(false) }
    }

    const fetchLandingPages = async (funnelId) => {
        setPagesLoading(true)
        try {
            const data = await intelApi.listPages(funnelId)
            setLandingPages(data.pages || [])
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setPagesLoading(false) }
    }

    const createLandingPage = async (data) => {
        try {
            const result = await intelApi.createPage(data)
            if (result.page) setLandingPages(prev => [...prev, result.page])
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const aiGeneratePage = async (data) => {
        try {
            const result = await intelApi.aiGeneratePage(data)
            if (result.page) setLandingPages(prev => [...prev, result.page])
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const deleteLandingPage = async (id) => {
        if (!confirm('Delete this landing page?')) return
        try {
            await intelApi.deletePage(id)
            setLandingPages(prev => prev.filter(p => p._id !== id))
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    // ── Automation Engine ──
    const fetchAutomationRules = async (funnelId) => {
        setAutoLoading(true)
        try {
            const data = await autoApi.list(funnelId)
            setAutomationRules(data.rules || [])
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setAutoLoading(false) }
    }

    const createAutomationRule = async (data) => {
        try {
            const result = await autoApi.create(data)
            if (result.rule) setAutomationRules(prev => [...prev, result.rule])
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const deleteAutomationRule = async (id) => {
        if (!confirm('Delete this automation rule?')) return
        try {
            await autoApi.delete(id)
            setAutomationRules(prev => prev.filter(r => r._id !== id))
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const toggleAutomationRule = async (id) => {
        try {
            const result = await autoApi.toggle(id)
            if (result.rule) setAutomationRules(prev => prev.map(r => r._id === id ? result.rule : r))
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const aiGenerateRules = async (prompt) => {
        if (!selectedFunnel) return
        setAutoGenerating(true)
        try {
            const result = await autoApi.aiGenerate({ funnelId: selectedFunnel._id, prompt })
            if (result.rules) setAutomationRules(prev => [...prev, ...result.rules])
            return result
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setAutoGenerating(false) }
    }

    const runAllAutomations = async () => {
        if (!selectedFunnel) return
        setAutoRunning(true)
        try {
            const result = await autoApi.run({ funnelId: selectedFunnel._id, triggerType: 'manual' })
            alert(`Executed ${result.executed} automation actions!`)
            // Refresh entries
            const refreshed = await api.get(selectedFunnel._id)
            setSelectedFunnel(refreshed.funnel)
            setEntriesByStage(refreshed.entriesByStage || {})
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setAutoRunning(false) }
    }

    const addEntry = async (formData) => {
        if (!selectedFunnel) return
        try {
            await api.addEntry(selectedFunnel._id, formData)
            const data = await api.get(selectedFunnel._id)
            setSelectedFunnel(data.funnel)
            setEntriesByStage(data.entriesByStage || {})
            setShowAddEntry(false)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const moveEntry = async (entryId, toStage) => {
        if (!selectedFunnel) return
        try {
            await api.moveEntry(selectedFunnel._id, entryId, toStage)
            const data = await api.get(selectedFunnel._id)
            setSelectedFunnel(data.funnel)
            setEntriesByStage(data.entriesByStage || {})
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const updateEntryStatus = async (entryId, status) => {
        if (!selectedFunnel) return
        try {
            await api.updateEntry(selectedFunnel._id, entryId, { status })
            const data = await api.get(selectedFunnel._id)
            setSelectedFunnel(data.funnel)
            setEntriesByStage(data.entriesByStage || {})
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    const deleteEntry = async (entryId) => {
        if (!selectedFunnel || !confirm('Remove this entry?')) return
        try {
            await api.deleteEntry(selectedFunnel._id, entryId)
            const data = await api.get(selectedFunnel._id)
            setSelectedFunnel(data.funnel)
            setEntriesByStage(data.entriesByStage || {})
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    // ═══════════════════════════════════════════════════════════
    // BUILDER VIEW
    // ═══════════════════════════════════════════════════════════
    if (view === 'builder' && selectedFunnel) {
        return (
            <DashboardLayout title="Funnel Builder" subtitle={selectedFunnel.name}>
                <SEOHead title={`Edit ${selectedFunnel.name} — Funnel Studio`} noIndex={true} />
                <FunnelBuilderView
                    funnel={selectedFunnel}
                    onSave={async (updatedFunnel) => {
                        setSelectedFunnel(updatedFunnel)
                        await fetchFunnels()
                    }}
                    onBack={() => setView('pipeline')}
                    saveStages={saveBuilderStages}
                />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // NURTURE VIEW
    // ═══════════════════════════════════════════════════════════
    if (view === 'nurture' && selectedFunnel) {
        return (
            <DashboardLayout title="Nurture Sequences" subtitle={selectedFunnel.name}>
                <SEOHead title={`Nurture — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <NurtureView
                    funnel={selectedFunnel}
                    sequences={nurtureSequencesData}
                    loading={nurtureLoading}
                    onBack={() => setView('pipeline')}
                    onCreate={createNurtureSequence}
                    onAIGenerate={aiGenerateNurture}
                    onUpdate={updateNurtureSequence}
                    onDelete={deleteNurtureSequence}
                    onToggle={toggleNurtureSequence}
                    onRefresh={() => fetchNurtureSequences(selectedFunnel._id)}
                />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // HEALTH DASHBOARD VIEW
    // ═══════════════════════════════════════════════════════════
    if (view === 'health' && selectedFunnel) {
        return (
            <DashboardLayout title="Funnel Health" subtitle={selectedFunnel.name}>
                <SEOHead title={`Health — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <HealthDashboardView
                    funnel={selectedFunnel}
                    health={healthData}
                    loading={healthLoading}
                    scoringResult={scoringResult}
                    scoringLoading={scoringLoading}
                    onBack={() => setView('pipeline')}
                    onRefresh={() => fetchHealth(selectedFunnel._id)}
                    onRunScoring={runScoring}
                />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // LANDING PAGES VIEW
    // ═══════════════════════════════════════════════════════════
    if (view === 'pages' && selectedFunnel) {
        return (
            <DashboardLayout title="Landing Pages" subtitle={selectedFunnel.name}>
                <SEOHead title={`Pages — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <LandingPagesView
                    funnel={selectedFunnel}
                    pages={landingPages}
                    loading={pagesLoading}
                    onBack={() => setView('pipeline')}
                    onRefresh={() => fetchLandingPages(selectedFunnel._id)}
                    onCreate={createLandingPage}
                    onAIGenerate={aiGeneratePage}
                    onDelete={deleteLandingPage}
                />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // AUTOMATIONS VIEW
    // ═══════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════
    // REVENUE FORECAST VIEW (#10)
    // ═══════════════════════════════════════════════════════════
    if (view === 'forecast' && selectedFunnel) {
        return (
            <DashboardLayout title="Revenue Forecast" subtitle={selectedFunnel.name}>
                <SEOHead title={`Forecast — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <RevenueForecastView forecast={revenueForecast} funnel={selectedFunnel} onBack={() => setView('pipeline')} />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // ACTIVITY FEED VIEW (#12)
    // ═══════════════════════════════════════════════════════════
    if (view === 'activity' && selectedFunnel) {
        return (
            <DashboardLayout title="Activity Feed" subtitle={selectedFunnel.name}>
                <SEOHead title={`Activity — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <ActivityFeedView feed={activityFeed} funnel={selectedFunnel} onBack={() => setView('pipeline')}
                    onRefresh={async () => { try { const r = await autoApi.activityFeed(selectedFunnel._id); setActivityFeed(r.feed || []) } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }} />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // WEBHOOKS VIEW (#4)
    // ═══════════════════════════════════════════════════════════
    if (view === 'webhooks' && selectedFunnel) {
        return (
            <DashboardLayout title="Webhook Integrations" subtitle={selectedFunnel.name}>
                <SEOHead title={`Webhooks — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <WebhooksView webhookData={webhookData} funnel={selectedFunnel} onBack={() => setView('pipeline')} />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // SHARED TEMPLATES VIEW (#11)
    // ═══════════════════════════════════════════════════════════
    if (view === 'sharing') {
        return (
            <DashboardLayout title="Template Marketplace" subtitle="Browse and share funnel templates">
                <SEOHead title="Template Marketplace — Funnel Studio" noIndex={true} />
                <SharedTemplatesView
                    templates={sharedTemplates} funnels={funnels} brandId={currentBrand?._id}
                    onBack={() => setView('dashboard')}
                    onRefresh={async () => { try { const r = await shareApi.browse(); setSharedTemplates(r.templates || []) } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                    onClone={async (id) => { try { await shareApi.clone(id, { brandId: currentBrand?._id }); fetchFunnels() } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                    onShare={async (id) => { try { await shareApi.share(id, {}); } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                />
            </DashboardLayout>
        )
    }

    if (view === 'automations' && selectedFunnel) {
        return (
            <DashboardLayout title="Automations" subtitle={selectedFunnel.name}>
                <SEOHead title={`Automations — ${selectedFunnel.name}`} noIndex={true} />
                {error && (
                    <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                <AutomationView
                    funnel={selectedFunnel}
                    rules={automationRules}
                    loading={autoLoading}
                    running={autoRunning}
                    generating={autoGenerating}
                    onBack={() => setView('pipeline')}
                    onRefresh={() => fetchAutomationRules(selectedFunnel._id)}
                    onCreate={createAutomationRule}
                    onDelete={deleteAutomationRule}
                    onToggle={toggleAutomationRule}
                    onAIGenerate={aiGenerateRules}
                    onRunAll={runAllAutomations}
                    setError={setError} // Pass setError to AutomationView
                />
            </DashboardLayout>
        )
    }

    // ANALYTICS VIEW
    // ═══════════════════════════════════════════════════════════
    if (view === 'analytics' && selectedFunnel && analytics) {
        return (
            <DashboardLayout title="Funnel Analytics" subtitle={selectedFunnel.name}>
                <SEOHead title="Funnel Analytics — Mantram AI" noIndex={true} />
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => { setView('dashboard'); setAnalytics(null) }}
                        className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg">{selectedFunnel.name}</h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">Conversion Analytics</p>
                    </div>
                </div>

                {/* Overview Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                    {[
                        { label: 'Total Entries', value: analytics.overview.totalEntries, icon: 'people', color: '#6366f1' },
                        { label: 'Active', value: analytics.overview.activeEntries, icon: 'directions_run', color: '#f59e0b' },
                        { label: 'Converted', value: analytics.overview.convertedEntries, icon: 'check_circle', color: '#10b981' },
                        { label: 'Lost', value: analytics.overview.lostEntries, icon: 'cancel', color: '#ef4444' },
                        { label: 'Conversion Rate', value: `${analytics.overview.conversionRate}%`, icon: 'trending_up', color: '#8b5cf6' },
                        { label: 'Revenue', value: `₹${(analytics.overview.totalRevenue || 0).toLocaleString()}`, icon: 'payments', color: '#10b981' },
                    ].map((card) => (
                        <div key={card.label} className="glass-panel rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-symbols-outlined text-sm" style={{ color: card.color }}>{card.icon}</span>
                                <span className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest font-bold">{card.label}</span>
                            </div>
                            <p className="text-2xl font-bold text-[var(--sys-text)]">{card.value}</p>
                        </div>
                    ))}
                </div>

                {/* Stage Funnel Visualization */}
                <div className="glass-panel rounded-2xl p-6 mb-8">
                    <h3 className="text-[var(--sys-text)] font-bold mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">filter_alt</span> Stage Breakdown
                    </h3>
                    <div className="space-y-3">
                        {analytics.stages.map((stage, idx) => {
                            const maxEver = Math.max(...analytics.stages.map(s => s.everEntered), 1)
                            const barWidth = Math.max(8, (stage.everEntered / maxEver) * 100)
                            return (
                                <div key={stage.stageName} className="flex items-center gap-4">
                                    <div className="w-32 shrink-0 text-right">
                                        <p className="text-sm text-[var(--sys-text)] font-bold">{stage.stageName}</p>
                                        <p className="text-xs text-[var(--sys-text-muted)]">{stage.everEntered} entered</p>
                                    </div>
                                    <div className="flex-1 h-10 bg-[var(--sys-surface)] rounded-lg overflow-hidden relative">
                                        <div className="h-full rounded-lg transition-all duration-700 flex items-center px-3"
                                            style={{ width: `${barWidth}%`, backgroundColor: `${stage.stageColor}30`, borderLeft: `3px solid ${stage.stageColor}` }}>
                                            <span className="text-sm font-bold" style={{ color: stage.stageColor }}>{stage.currentCount} active</span>
                                        </div>
                                    </div>
                                    <div className="w-24 shrink-0">
                                        {idx > 0 && (
                                            <span className={`text-sm font-bold ${stage.dropOffRate > 50 ? 'text-primary' : stage.dropOffRate > 25 ? 'text-primary' : 'text-primary'}`}>
                                                ↓ {stage.dropOffRate}% drop
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Source Breakdown */}
                {analytics.sourceBreakdown?.length > 0 && (
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="text-[var(--sys-text)] font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">donut_large</span> Traffic Sources
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {analytics.sourceBreakdown.map(s => (
                                <div key={s.source} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <span className="material-symbols-outlined text-primary text-sm">{SOURCE_ICONS[s.source] || 'help'}</span>
                                    <div>
                                        <p className="text-sm text-[var(--sys-text)] font-bold capitalize">{s.source}</p>
                                        <p className="text-xs text-[var(--sys-text-muted)]">{s.count} entries</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // PIPELINE VIEW (Kanban Board)
    // ═══════════════════════════════════════════════════════════
    if (view === 'pipeline' && selectedFunnel) {
        const stages = selectedFunnel.stages || []
        return (
            <DashboardLayout title="Pipeline" subtitle={selectedFunnel.name}>
                <SEOHead title={`${selectedFunnel.name} — Funnel Studio`} noIndex={true} />

                {/* Standardized Studio Tab Bar */}
                <div className="studio-tab-bar">
                    <div className="studio-tab-row">
                        {[
                            { id: 'pipeline', icon: 'view_kanban', label: 'Pipeline' },
                            { id: 'builder', icon: 'edit_note', label: 'Builder' },
                            { id: 'nurture', icon: 'mail', label: 'Nurture' },
                            { id: 'pages', icon: 'web', label: 'Pages' },
                            { id: 'automations', icon: 'smart_toy', label: 'Automations' },
                            { id: 'health', icon: 'monitor_heart', label: 'Health' },
                            { id: 'analytics', icon: 'analytics', label: 'Analytics' },
                            { id: 'forecast', icon: 'trending_up', label: 'Forecast' },
                            { id: 'webhooks', icon: 'electrical_services', label: 'Webhooks' },
                            { id: 'activity', icon: 'feed', label: 'Activity' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setView(tab.id)}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 cursor-pointer ${view === tab.id ? 'studio-nav-pill text-[var(--sys-text)] font-bold' : 'studio-nav-tab-inactive'}`}>
                                <span className={`material-symbols-outlined ${view === tab.id ? 'text-lg' : 'text-base opacity-70'}`}>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                        <div className="ml-auto flex-shrink-0">
                            <button onClick={() => { setView('dashboard'); setSelectedFunnel(null) }}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl studio-nav-tab-inactive text-[13px] cursor-pointer">
                                <span className="material-symbols-outlined text-base opacity-70">arrow_back</span>
                                <span>All Funnels</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setView('dashboard'); setSelectedFunnel(null) }}
                            className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                        </button>
                        <div className="size-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${selectedFunnel.color || '#6366f1'}20` }}>
                            <span className="material-symbols-outlined" style={{ color: selectedFunnel.color || '#6366f1' }}>{selectedFunnel.icon || 'filter_alt'}</span>
                        </div>
                        <div>
                            <h2 className="text-[var(--sys-text)] font-bold text-lg">{selectedFunnel.name}</h2>
                            <p className="text-sm text-[var(--sys-text-muted)]">{stages.length} stages · {Object.values(entriesByStage).flat().length} active entries</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowAddEntry(true)}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold btn-primary flex items-center gap-1.5 cursor-pointer">
                            <span className="material-symbols-outlined text-sm">person_add</span> Add Lead
                        </button>
                        <button onClick={() => setShowImportModal(true)}
                            className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">download</span> Import
                        </button>
                        <button onClick={() => setFidatoOpen(!fidatoOpen)}
                            className={`size-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${fidatoOpen ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-white hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'}`}>
                            <span className="material-symbols-outlined text-sm">smart_toy</span>
                        </button>
                    </div>
                </div>

                {/* ── Tabbed Navigation Bar ── */}
                <div className="flex items-center gap-1 mb-5 p-1 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] overflow-x-auto">
                    {[
                        { id: 'kanban', icon: 'view_kanban', label: 'Pipeline', color: '#6366f1' },
                        { id: 'intelligence', icon: 'insights', label: 'Intelligence', color: '#06b6d4' },
                        { id: 'engage', icon: 'campaign', label: 'Engage', color: '#10b981' },
                        { id: 'settings', icon: 'tune', label: 'Configure', color: '#f59e0b' },
                    ].map(tab => {

                        const isActive = tab.id === 'kanban' ? view === 'pipeline' :
                            (tab.id === 'intelligence' && ['health', 'analytics', 'forecast'].includes(view)) ||
                            (tab.id === 'engage' && ['nurture', 'automations', 'pages', 'activity'].includes(view)) ||
                            (tab.id === 'settings' && ['builder', 'webhooks'].includes(view))
                        return (
                            <button key={tab.id}
                                onClick={() => {
                                    if (tab.id === 'kanban') setView('pipeline')
                                    else if (tab.id === 'intelligence') { fetchHealth(selectedFunnel._id); setView('health') }
                                    else if (tab.id === 'engage') { fetchAutomationRules(selectedFunnel._id); setView('automations') }
                                    else if (tab.id === 'settings') setView('builder')
                                }}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${isActive
                                    ? 'text-[var(--sys-text)] shadow-lg'
                                    : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}
                                style={isActive ? { backgroundColor: `${tab.color}20`, color: tab.color, boxShadow: `0 0 20px ${tab.color}10` } : undefined}>
                                <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                                {tab.label}
                            </button>
                        )
                    })}
                    <div className="w-px h-5 bg-[var(--sys-surface)] mx-1" />
                    {/* Sub-tabs for active group */}
                    {view === 'pipeline' && (
                        <>
                            <button onClick={() => { fetchSuggestions() }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer whitespace-nowrap">
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>auto_awesome</span> AI Tips
                            </button>
                        </>
                    )}
                    {['health', 'analytics', 'forecast'].some(v => v === view) && (
                        <>
                            <button onClick={() => { fetchHealth(selectedFunnel._id); setView('health') }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'health' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>health_and_safety</span> Health
                            </button>
                            <button onClick={() => openAnalytics(selectedFunnel)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'analytics' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>analytics</span> Analytics
                            </button>
                            <button onClick={async () => { try { const r = await autoApi.revenueForecast(selectedFunnel._id); setRevenueForecast(r.forecast); setView('forecast') } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'forecast' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>trending_up</span> Forecast
                            </button>
                            <button onClick={async () => { try { await runScoring(); setView('health') } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer whitespace-nowrap">
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>score</span> Score Leads
                            </button>
                        </>
                    )}
                    {['nurture', 'automations', 'pages', 'activity'].some(v => v === view) && (
                        <>
                            <button onClick={() => { fetchAutomationRules(selectedFunnel._id); setView('automations') }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'automations' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>bolt</span> Automations
                            </button>
                            <button onClick={() => { fetchNurtureSequences(selectedFunnel._id); setView('nurture') }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'nurture' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>mail</span> Nurture
                            </button>
                            <button onClick={() => { fetchLandingPages(selectedFunnel._id); setView('pages') }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'pages' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>web</span> Pages
                            </button>
                            <button onClick={async () => { try { const r = await autoApi.activityFeed(selectedFunnel._id); setActivityFeed(r.feed || []); setView('activity') } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'activity' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>dynamic_feed</span> Feed
                            </button>
                        </>
                    )}
                    {['builder', 'webhooks'].some(v => v === view) && (
                        <>
                            <button onClick={() => setView('builder')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'builder' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>build</span> Stage Builder
                            </button>
                            <button onClick={async () => { try { const r = await shareApi.webhookToken(selectedFunnel._id); setWebhookData(r); setView('webhooks') } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${view === 'webhooks' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>webhook</span> Webhooks
                            </button>
                        </>
                    )}
                </div>

                {/* Kanban Columns */}
                <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '60vh' }}>
                    {stages.map((stage) => {
                        const stageEntries = entriesByStage[stage.name] || []
                        return (
                            <div key={stage._id || stage.name} className="flex-shrink-0 w-72">
                                {/* Column Header */}
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                                        <h3 className="text-sm font-bold text-[var(--sys-text)]">{stage.name}</h3>
                                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--sys-surface)] text-[var(--sys-text-muted)] font-bold">{stageEntries.length}</span>
                                    </div>
                                </div>

                                {/* Cards */}
                                <div className="space-y-2 min-h-[200px] p-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        const entryId = e.dataTransfer.getData('entryId')
                                        if (entryId) moveEntry(entryId, stage.name)
                                    }}>
                                    {stageEntries.map(entry => {
                                        const scoreColor = entry.score > 70 ? '#10b981' : entry.score > 40 ? '#f59e0b' : '#475569'
                                        const lastActivity = entry.lastTouchpoint ? new Date(entry.lastTouchpoint) : entry.updatedAt ? new Date(entry.updatedAt) : null
                                        const timeAgo = lastActivity ? (() => {
                                            const diff = Date.now() - lastActivity.getTime()
                                            const mins = Math.floor(diff / 60000)
                                            if (mins < 60) return `${mins}m ago`
                                            const hrs = Math.floor(mins / 60)
                                            if (hrs < 24) return `${hrs}h ago`
                                            const days = Math.floor(hrs / 24)
                                            return `${days}d ago`
                                        })() : null
                                        return (
                                        <div key={entry._id} draggable
                                            onDragStart={(e) => e.dataTransfer.setData('entryId', entry._id)}
                                            className="group glass-panel rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-primary/20 transition-all">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {/* Score Ring Avatar */}
                                                    <div className="relative shrink-0">
                                                        <div className="size-8 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-xs font-bold text-[var(--sys-text)]"
                                                            style={{ boxShadow: `0 0 0 2px ${scoreColor}50` }}>
                                                            {(entry.name || '?')[0].toUpperCase()}
                                                        </div>
                                                        {entry.score > 70 && <div className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-[var(--sys-surface)] border border-[#0f1729]" title="Hot lead" />}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-[var(--sys-text)] font-bold truncate">{entry.name || 'Unknown'}</p>
                                                        {entry.email && <p className="text-xs text-[var(--sys-text-muted)] truncate">{entry.email}</p>}
                                                    </div>
                                                </div>
                                                {/* Compact Hover Actions */}
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button onClick={() => updateEntryStatus(entry._id, 'converted')} title="Convert"
                                                        className="size-6 rounded-md flex items-center justify-center text-primary hover:bg-[var(--sys-primary-dim)] cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">check_circle</span>
                                                    </button>
                                                    <button onClick={() => updateEntryStatus(entry._id, 'lost')} title="Lost"
                                                        className="size-6 rounded-md flex items-center justify-center text-primary hover:bg-[var(--sys-primary-dim)] cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">cancel</span>
                                                    </button>
                                                    <button onClick={() => deleteEntry(entry._id)} title="Delete"
                                                        className="size-6 rounded-md flex items-center justify-center text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] cursor-pointer">
                                                        <span className="material-symbols-outlined text-xs">delete</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Deal Value + Score */}
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <div className="flex-1 h-1 rounded-full bg-[var(--sys-surface)] overflow-hidden">
                                                    <div className="h-full rounded-full transition-all" style={{
                                                        width: `${entry.score || 0}%`,
                                                        backgroundColor: scoreColor,
                                                    }} />
                                                </div>
                                                <span className="text-xs font-bold shrink-0" style={{ color: scoreColor }}>{entry.score || 0}</span>
                                                {entry.dealValue && (
                                                    <span className="text-xs font-bold text-primary bg-[var(--sys-primary-dim)] px-1.5 py-0.5 rounded">
                                                        ₹{entry.dealValue.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Tags, Source & Last Activity */}
                                            <div className="flex flex-wrap items-center gap-1">
                                                {entry.source && entry.source !== 'manual' && (
                                                    <span className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary font-medium flex items-center gap-0.5">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>{SOURCE_ICONS[entry.source] || 'help'}</span>
                                                        {entry.source}
                                                    </span>
                                                )}
                                                {entry.company && (
                                                    <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">{entry.company}</span>
                                                )}
                                                {(entry.tags || []).slice(0, 2).map(tag => (
                                                    <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--sys-primary-dim)] text-primary font-medium">{tag}</span>
                                                ))}
                                                {timeAgo && (
                                                    <span className="text-[10px] text-[var(--sys-text-muted)] ml-auto flex items-center gap-0.5">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>schedule</span>
                                                        {timeAgo}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Stage move arrows — compact */}
                                            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {stages.map((s, sIdx) => {
                                                    if (s.name === stage.name) return null
                                                    return (
                                                        <button key={s.name} onClick={() => moveEntry(entry._id, s.name)} title={`Move to ${s.name}`}
                                                            className="px-1.5 py-0.5 rounded text-xs font-medium hover:bg-[var(--sys-surface)] transition-all cursor-pointer text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] truncate max-w-[60px]">
                                                            → {s.name}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        )
                                    })}
                                    {stageEntries.length === 0 && (
                                        <div className="text-center py-6 text-[var(--sys-text-muted)]">
                                            <div className="size-10 rounded-xl bg-[var(--sys-surface)] flex items-center justify-center mx-auto mb-2">
                                                <span className="material-symbols-outlined text-lg text-[var(--sys-text-muted)]">person_add</span>
                                            </div>
                                            <p className="text-xs font-medium text-[var(--sys-text-muted)] mb-1">No leads here</p>
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">Drag leads here or add new ones</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* AI Suggestions Panel */}
                {(suggestions || loadingSuggestions) && (
                    <AISuggestionsPanel suggestions={suggestions} loading={loadingSuggestions} onClose={() => setSuggestions(null)} />
                )}

                {/* Add Entry Modal */}
                {showAddEntry && <AddEntryModal stages={stages} onSubmit={addEntry} onClose={() => setShowAddEntry(false)} />}
                {showImportModal && <ImportContactsModal stages={stages} onImport={importContacts} onClose={() => setShowImportModal(false)} />}

                {/* #8 Fidato AI Sidebar */}
                {fidatoOpen && (
                    <FidatoFunnelSidebar funnel={selectedFunnel} onClose={() => setFidatoOpen(false)}
                        onScoreDecay={async () => { try { await autoApi.scoreDecay({ funnelId: selectedFunnel._id }); const r = await api.get(selectedFunnel._id); setSelectedFunnel(r.funnel); setEntriesByStage(r.entriesByStage || {}) } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                        onPredictiveScore={async () => { try { await autoApi.predictiveScore({ funnelId: selectedFunnel._id }); const r = await api.get(selectedFunnel._id); setSelectedFunnel(r.funnel); setEntriesByStage(r.entriesByStage || {}) } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                        onRunAutomations={async () => { try { await autoApi.run({ funnelId: selectedFunnel._id }); const r = await api.get(selectedFunnel._id); setSelectedFunnel(r.funnel); setEntriesByStage(r.entriesByStage || {}) } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } }}
                    />
                )}
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // HELP / DOCUMENTATION VIEW
    // ═══════════════════════════════════════════════════════════
    if (view === 'help') {
        return (
            <DashboardLayout title="Funnel Studio Guide" subtitle="Learn how to use funnels">
                <SEOHead title="Help — Funnel Studio" noIndex={true} />
                <HelpDocumentationView onBack={() => setView('dashboard')} />
            </DashboardLayout>
        )
    }

    // ═══════════════════════════════════════════════════════════
    // DASHBOARD VIEW — Intelligence-First Agentic Dashboard
    // ═══════════════════════════════════════════════════════════
    const totalLeads = funnels.reduce((s, f) => s + (f.metrics?.totalEntries || 0), 0)
    const totalConverted = funnels.reduce((s, f) => s + (f.metrics?.convertedEntries || 0), 0)
    const totalActive = funnels.reduce((s, f) => s + (f.metrics?.activeEntries || 0), 0)
    const avgCvr = funnels.length > 0 ? Math.round(funnels.reduce((s, f) => s + (f.metrics?.conversionRate || 0), 0) / funnels.length) : 0


    return (
        <DashboardLayout title="Funnel Studio" subtitle="Build and manage your sales funnels">
            <SEOHead title="Funnel Studio — Mantram AI" noIndex={true} />
            <Walkthrough studioId="funnelStudio" />

            {/* —— Standardized Studio Tab Bar —— */}
            <div data-wt="funnel-tabs" className="studio-tab-bar">
                <div className="studio-tab-row">
                    {[
                        { id: 'dashboard', icon: 'filter_alt', label: 'My Funnels' },
                        { id: 'sharing', icon: 'storefront', label: 'Templates' },
                        { id: 'help', icon: 'menu_book', label: 'Guide' },
                    ].map(tab => (
                        <button key={tab.id} onClick={() => {
                            if (tab.id === 'sharing') {
                                shareApi.browse().then(r => setSharedTemplates(r.templates || [])).catch(() => {})
                            }
                            setView(tab.id)
                        }}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 cursor-pointer ${view === tab.id ? 'studio-nav-pill text-[var(--sys-text)] font-bold' : 'studio-nav-tab-inactive'}`}>
                            <span className={`material-symbols-outlined ${view === tab.id ? 'text-lg' : 'text-base opacity-70'}`}>{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    ))}
                    <div className="ml-auto flex-shrink-0">
                        <button onClick={() => setShowAIModal(true)} disabled={loading}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold studio-nav-pill text-[var(--sys-text)] cursor-pointer disabled:opacity-50">
                            <span className="material-symbols-outlined text-base">auto_awesome</span>
                            AI Architect
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2 mx-2`}>
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
            {/* ═══ Report Button ═══ */}
            <div className="flex justify-end mb-4">
                <StudioReportButton studio="funnel" brandId={currentBrand?._id} />
            </div>

            {/* ── Intelligence Hero Banner ── */}
            <div className="glass-panel rounded-2xl p-6 mb-6" style={{ background: 'var(--sys-primary)' }}>
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-xl flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">hub</span>
                            Command Center
                        </h2>
                        <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">Your funnel performance at a glance</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowAIModal(true)}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] flex items-center gap-2 cursor-pointer hover:shadow-lg hover:shadow-none transition-all">
                            <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Architect
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: 'Active Funnels', value: funnels.filter(f => f.status === 'active').length, icon: 'filter_alt', color: '#6366f1', subtext: `${funnels.length} total` },
                        { label: 'Total Leads', value: totalLeads, icon: 'group', color: '#3b82f6', subtext: `${totalActive} active` },
                        { label: 'Conversions', value: totalConverted, icon: 'emoji_events', color: '#10b981', subtext: `${avgCvr}% avg CVR` },
                        { label: 'Pipeline Value', value: `${funnels.length > 0 ? '●●●' : '—'}`, icon: 'account_balance', color: '#f59e0b', subtext: 'Open a funnel to see' },
                    ].map(m => (
                        <div key={m.label} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="size-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${m.color}15` }}>
                                    <span className="material-symbols-outlined text-sm" style={{ color: m.color }}>{m.icon}</span>
                                </div>
                                <span className="text-xs text-[var(--sys-text-muted)] font-medium">{m.label}</span>
                            </div>
                            <p className="text-2xl font-bold text-[var(--sys-text)]">{m.value}</p>
                            <p className="text-[11px] text-[var(--sys-text-muted)] mt-1">{m.subtext}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Quick Actions Bar ── */}
            <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-1">
                {[
                    { label: 'AI Generate', icon: 'auto_awesome', color: '#8b5cf6', onClick: () => setShowAIModal(true) },
                    { label: 'Marketplace', icon: 'storefront', color: '#6366f1', onClick: async () => { try { const r = await shareApi.browse(); setSharedTemplates(r.templates || []) } catch (err) { setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider }) } ; setView('sharing') } },
                    { label: 'How It Works', icon: 'menu_book', color: '#06b6d4', onClick: () => setView('help') },
                ].map(a => (
                    <button key={a.label} onClick={a.onClick}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap hover:scale-[1.02]"
                        style={{ color: a.color, backgroundColor: `${a.color}08`, borderColor: `${a.color}15` }}>
                        <span className="material-symbols-outlined text-sm">{a.icon}</span> {a.label}
                    </button>
                ))}
            </div>

            {/* ── What To Do Next — Agentic Suggestions ── */}
            {funnels.length > 0 && (
                <div className="glass-panel rounded-2xl p-5 mb-6">
                    <h3 className="text-[var(--sys-text)] font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">emoji_objects</span>
                        What To Do Next
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[
                            ...(funnels.some(f => (f.metrics?.totalEntries || 0) === 0)
                                ? [{ icon: 'person_add', text: 'Add leads to your empty funnels', action: 'Import contacts or set up webhooks', color: '#3b82f6',
                                    onClick: () => { const f = funnels.find(f => (f.metrics?.totalEntries || 0) === 0); if (f) openFunnel(f) } }]
                                : []),
                            ...(avgCvr < 30
                                ? [{ icon: 'health_and_safety', text: 'Optimize your conversion rate', action: 'Check funnel health for bottlenecks', color: '#ef4444',
                                    onClick: () => { if (funnels[0]) { openFunnel(funnels[0]); setTimeout(() => { fetchHealth(funnels[0]._id); setView('health') }, 100) } } }]
                                : []),
                            { icon: 'bolt', text: 'Set up automation rules', action: 'Let AI auto-advance hot leads', color: '#f59e0b',
                                onClick: () => { if (funnels[0]) { openFunnel(funnels[0]); setTimeout(() => { fetchAutomationRules(funnels[0]._id); setView('automations') }, 100) } } },
                        ].slice(0, 3).map((item, idx) => (
                            <button key={idx} onClick={item.onClick}
                                className="flex items-start gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] hover:border-[var(--sys-border)] transition-all cursor-pointer text-left">
                                <div className="size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: `${item.color}15` }}>
                                    <span className="material-symbols-outlined text-sm" style={{ color: item.color }}>{item.icon}</span>
                                </div>
                                <div>
                                    <p className="text-[var(--sys-text)] text-xs font-bold">{item.text}</p>
                                    <p className="text-[11px] text-[var(--sys-text-muted)] mt-0.5">{item.action}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Your Funnels ── */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-[var(--sys-text-muted)]">list_alt</span>
                    <h2 className="text-[var(--sys-text)] font-bold text-lg">Your Funnels</h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">{funnels.length}</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <span className="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                    </div>
                ) : funnels.length === 0 ? (
                    <div className="glass-panel rounded-2xl p-12 text-center">
                        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <span className="material-symbols-outlined text-3xl text-primary">rocket_launch</span>
                        </div>
                        <p className="text-[var(--sys-text)] font-bold text-lg mb-2">Create Your First Funnel</p>
                        <p className="text-[var(--sys-text-muted)] text-sm mb-6 max-w-md mx-auto">Choose a template below or use AI Architect to build a custom sales funnel tailored to your brand.</p>
                        <div className="flex gap-3 justify-center">
                            <button onClick={() => setShowAIModal(true)}
                                className="px-6 py-3 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] flex items-center gap-2 cursor-pointer hover:shadow-lg hover:shadow-none transition-all">
                                <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Architect
                            </button>
                            <button onClick={() => setShowTemplates(true)}
                                className="px-6 py-3 rounded-xl text-sm font-bold text-[var(--sys-text)] bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center gap-2 cursor-pointer hover:bg-[var(--sys-surface)] transition-all">
                                <span className="material-symbols-outlined text-sm">dashboard_customize</span> Browse Templates
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {funnels.map(f => {
                            const statusStyle = STATUS_STYLES[f.status] || STATUS_STYLES.active
                            return (
                                <div key={f._id} onClick={() => openFunnel(f)}
                                    className="glass-panel rounded-2xl p-5 hover:border-primary/20 hover:bg-primary/[0.02] transition-all cursor-pointer group relative overflow-hidden">
                                    {/* Gradient Accent */}
                                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ background: `var(--sys-primary)` }} />

                                    {/* Top Row */}
                                    <div className="flex items-center justify-between mb-3 mt-1">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${f.color}20` }}>
                                                <span className="material-symbols-outlined text-lg" style={{ color: f.color }}>{f.icon || 'filter_alt'}</span>
                                            </div>
                                            <div>
                                                <p className="text-[var(--sys-text)] font-bold text-sm">{f.name}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">{f.stages?.length || 0} stages</p>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                                            {statusStyle.label}
                                        </span>
                                    </div>

                                    {/* Stage Preview */}
                                    <div className="flex items-center gap-1 mb-4">
                                        {(f.stages || []).map((s, idx) => (
                                            <div key={idx} className="flex items-center gap-1">
                                                <div className="h-1.5 rounded-full flex-1 min-w-[24px]" style={{ backgroundColor: `${s.color}60` }} />
                                                {idx < (f.stages.length - 1) && <span className="text-[var(--sys-text-muted)] text-xs">›</span>}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Metrics Row */}
                                    <div className="grid grid-cols-4 gap-2 text-center mb-3">
                                        <div>
                                            <p className="text-lg font-bold text-[var(--sys-text)]">{f.metrics?.totalEntries || 0}</p>
                                            <p className="text-xs text-[var(--sys-text-muted)] uppercase">Total</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-[var(--sys-text)]">{f.metrics?.activeEntries || 0}</p>
                                            <p className="text-xs text-[var(--sys-text-muted)] uppercase">Active</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-primary">{f.metrics?.convertedEntries || 0}</p>
                                            <p className="text-xs text-[var(--sys-text-muted)] uppercase">Won</p>
                                        </div>
                                        <div>
                                            <p className="text-lg font-bold text-primary">{f.metrics?.conversionRate || 0}%</p>
                                            <p className="text-xs text-[var(--sys-text-muted)] uppercase">CVR</p>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); openAnalytics(f) }}
                                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer flex items-center justify-center gap-1">
                                            <span className="material-symbols-outlined text-xs">analytics</span> Analytics
                                        </button>
                                        <button onClick={(e) => duplicateFunnel(f._id, e)} disabled={duplicating === f._id}
                                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-primary hover:bg-primary/10 transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50">
                                            {duplicating === f._id ? '...' : <><span className="material-symbols-outlined text-xs">content_copy</span> Clone</>}
                                        </button>
                                        <button onClick={(e) => toggleFunnelStatus(f._id, f.status, e)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${f.status === 'active'
                                                ? 'text-primary hover:bg-[var(--sys-primary-dim)]' : 'text-primary hover:bg-[var(--sys-primary-dim)]'}`}>
                                            {f.status === 'active' ? '⏸ Pause' : '▶ Activate'}
                                        </button>
                                        <button onClick={(e) => deleteFunnel(f._id, e)}
                                            className="size-8 rounded-lg flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* ── Templates — Collapsible ── */}
            <div className="glass-panel rounded-2xl overflow-hidden">
                <button onClick={() => setShowTemplates(!showTemplates)}
                    className="w-full flex items-center justify-between p-5 hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">dashboard_customize</span>
                        <span className="text-[var(--sys-text)] font-bold text-sm">Funnel Templates</span>
                        <span className="text-xs text-[var(--sys-text-muted)]">Quick-start with proven templates</span>
                    </div>
                    <span className={`material-symbols-outlined text-[var(--sys-text-muted)] transition-transform ${showTemplates ? 'rotate-180' : ''}`}>expand_more</span>
                </button>
                {(showTemplates || funnels.length === 0) && (
                    <div className="px-5 pb-5 pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                            {templates.map(t => (
                                <button key={t.id} onClick={() => createFromTemplate(t.id)} disabled={creatingTemplate === t.id}
                                    className="text-left glass-panel rounded-2xl p-5 hover:border-primary/20 hover:bg-primary/[0.02] transition-all cursor-pointer group disabled:opacity-50">
                                    <div className="size-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
                                        style={{ backgroundColor: `${t.color}20` }}>
                                        <span className="material-symbols-outlined text-xl" style={{ color: t.color }}>{t.icon}</span>
                                    </div>
                                    <p className="text-[var(--sys-text)] font-bold text-sm mb-1">{t.name}</p>
                                    <p className="text-[var(--sys-text-muted)] text-xs leading-relaxed line-clamp-2">{t.description}</p>
                                    <div className="flex items-center gap-2 mt-3 text-xs text-[var(--sys-text-muted)]">
                                        <span>{t.stages.length} stages</span>
                                    </div>
                                    {creatingTemplate === t.id && (
                                        <div className="flex items-center gap-1.5 mt-2 text-primary text-xs">
                                            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                            Creating...
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* AI Generate Modal */}
            {showAIModal && <AIGenerateModal brandId={currentBrand?._id} onCreated={(f) => { fetchFunnels(); openFunnel(f); setShowAIModal(false) }} onClose={() => setShowAIModal(false)} />}
            {error && <ErrorModal error={error} onClose={() => setError(null)} />}
        </DashboardLayout>
    )
}

// ═══════════════════════════════════════════════════════════════
// ADD ENTRY MODAL
// ═══════════════════════════════════════════════════════════════
function AddEntryModal({ stages, onSubmit, onClose }) {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [phone, setPhone] = useState('')
    const [company, setCompany] = useState('')
    const [source, setSource] = useState('manual')
    const [score, setScore] = useState(0)
    const [stage, setStage] = useState(stages[0]?.name || '')
    const [dealValue, setDealValue] = useState('')

    return (
        <div className="fixed inset-0 bg-[var(--sys-surface)] z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-[var(--sys-surface)] rounded-2xl border border-[var(--sys-border)] w-[480px] max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-[var(--sys-border)]">
                    <div>
                        <h3 className="text-[var(--sys-text)] font-bold text-base flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-lg">person_add</span>
                            Add Lead
                        </h3>
                        <p className="text-[var(--sys-text-muted)] text-xs mt-0.5">Add a new lead or contact to this funnel</p>
                    </div>
                    <button onClick={onClose} className="size-8 rounded-lg flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
                <div className="p-5 space-y-3">
                    {[
                        { label: 'Name *', value: name, onChange: setName, placeholder: 'Lead name', type: 'text' },
                        { label: 'Email', value: email, onChange: setEmail, placeholder: 'email@example.com', type: 'email' },
                        { label: 'Phone', value: phone, onChange: setPhone, placeholder: '+91 98765 43210', type: 'tel' },
                        { label: 'Company', value: company, onChange: setCompany, placeholder: 'Company name', type: 'text' },
                    ].map(f => (
                        <div key={f.label}>
                            <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-1.5">{f.label}</label>
                            <input type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                                className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-[var(--sys-text)] text-sm outline-none focus:border-primary/30 transition-all placeholder-slate-600" />
                        </div>
                    ))}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-1.5">Source</label>
                            <select value={source} onChange={e => setSource(e.target.value)}
                                className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-[var(--sys-text)] text-sm outline-none focus:border-primary/30 transition-all">
                                {['manual', 'ad', 'seo', 'social', 'linkedin', 'website', 'telephonic', 'dm', 'direct', 'referral', 'email', 'shopify', 'other'].map(s => (
                                    <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-1.5">Stage</label>
                            <select value={stage} onChange={e => setStage(e.target.value)}
                                className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-[var(--sys-text)] text-sm outline-none focus:border-primary/30 transition-all">
                                {stages.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-1.5">Deal Value (₹)</label>
                        <input type="number" value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="e.g. 50000"
                            className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2.5 text-[var(--sys-text)] text-sm outline-none focus:border-primary/30 transition-all placeholder-slate-600" />
                    </div>
                    <div>
                        <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-1.5">Lead Score: <span className="text-primary">{score}</span></label>
                        <input type="range" min={0} max={100} value={score} onChange={e => setScore(parseInt(e.target.value))}
                            className="w-full accent-primary" />
                    </div>
                    <button onClick={() => onSubmit({ name, email, phone, company, source, score, stage, dealValue: dealValue ? parseInt(dealValue) : undefined })}
                        className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] cursor-pointer hover:shadow-lg hover:shadow-none transition-all flex items-center justify-center gap-2 mt-2">
                        <span className="material-symbols-outlined text-sm">person_add</span> Add Lead
                    </button>
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// AI GENERATE FUNNEL MODAL
// ═══════════════════════════════════════════════════════════════
function AIGenerateModal({ brandId, onCreated, onClose }) {
    const [prompt, setPrompt] = useState('')
    const [generating, setGenerating] = useState(false)

    const handleGenerate = async () => {
        if (!prompt.trim()) return
        setGenerating(true)
        try {
            const data = await api.aiGenerate({ brandId, prompt })
            if (data.funnel) onCreated(data.funnel)
        } catch (err) { alert(err.message) }
        finally { setGenerating(false) }
    }

    return (
        <div className="fixed inset-0 bg-[var(--sys-surface)] z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-[var(--sys-surface)] rounded-2xl border border-[var(--sys-border)] w-[520px] max-h-[85vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-[var(--sys-border)]">
                    <div>
                        <h3 className="text-[var(--sys-text)] font-bold text-base flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                            AI Funnel Architect
                        </h3>
                        <p className="text-[var(--sys-text-muted)] text-xs mt-0.5">Describe your goal and AI will design the perfect funnel</p>
                    </div>
                    <button onClick={onClose} className="size-8 rounded-lg flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-1.5">What do you want to achieve?</label>
                        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                            placeholder="e.g. I'm launching a new organic skincare line for Gen Z women. Create a funnel to generate leads through Instagram, nurture them with educational content about clean beauty, and convert them to first-time buyers with a launch discount."
                            rows={5}
                            className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-3 text-[var(--sys-text)] text-sm outline-none focus:border-primary/30 transition-all placeholder-slate-600 resize-none leading-relaxed" />
                    </div>

                    {/* Suggestion chips */}
                    <div>
                        <p className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-2">Quick Ideas:</p>
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                'SaaS free trial to paid conversion',
                                'E-commerce product launch with influencers',
                                'Course launch with webinar + email nurture',
                                'B2B lead gen through LinkedIn + content',
                                'LinkedIn thought-leadership to consulting pipeline',
                                'App downloads through social ads + referrals',
                            ].map(idea => (
                                <button key={idea} onClick={() => setPrompt(idea)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs bg-primary/[0.06] border border-primary/10 text-primary/80 hover:text-primary hover:bg-primary/10 transition-all cursor-pointer">
                                    {idea}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button onClick={handleGenerate} disabled={generating || !prompt.trim()}
                        className={`w-full py-3 rounded-xl text-sm font-bold text-[var(--sys-text)] cursor-pointer flex items-center justify-center gap-2 transition-all ${generating ? 'bg-[var(--sys-border)] cursor-not-allowed' : 'bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:shadow-lg hover:shadow-none'} disabled:opacity-50`}>
                        {generating ? (
                            <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Generating funnel...</>
                        ) : (
                            <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate Funnel with AI</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// FUNNEL BUILDER VIEW — Edit stages, configure studio links
// ═══════════════════════════════════════════════════════════════
const STUDIO_OPTIONS = [
    { key: 'contentStudio', label: 'Content Studio', icon: 'edit_note', color: '#6366f1' },
    { key: 'creativeStudio', label: 'Creative Studio', icon: 'auto_fix_high', color: '#8b5cf6' },
    { key: 'conversationStudio', label: 'Conversation Studio', icon: 'forum', color: '#10b981' },
    { key: 'seoStudio', label: 'SEO Studio', icon: 'travel_explore', color: '#f59e0b' },
    { key: 'performanceMarketing', label: 'Performance Studio', icon: 'monitoring', color: '#ef4444' },
    { key: 'videoStudio', label: 'Video Studio', icon: 'movie', color: '#ec4899' },
]

const STAGE_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981', '#ec4899', '#14b8a6', '#f97316', '#64748b']

function FunnelBuilderView({ funnel, onBack, saveStages }) {
    const [stages, setStages] = useState(funnel.stages?.map(s => ({ ...s })) || [])
    const [editingIdx, setEditingIdx] = useState(null)
    const [saving, setSaving] = useState(false)
    const [dragIdx, setDragIdx] = useState(null)

    const addStage = () => {
        setStages(prev => [...prev, {
            name: `Stage ${prev.length + 1}`,
            order: prev.length,
            type: 'custom',
            color: STAGE_COLORS[prev.length % STAGE_COLORS.length],
            description: '',
            studioLinks: [],
        }])
        setEditingIdx(stages.length)
    }

    const removeStage = (idx) => {
        if (stages.length <= 2) return alert('Funnel must have at least 2 stages')
        setStages(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })))
        setEditingIdx(null)
    }

    const updateStage = (idx, field, value) => {
        setStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
    }

    const toggleStudioLink = (idx, studioKey) => {
        setStages(prev => prev.map((s, i) => {
            if (i !== idx) return s
            const links = s.studioLinks || []
            const exists = links.find(l => l.studio === studioKey)
            return {
                ...s,
                studioLinks: exists
                    ? links.filter(l => l.studio !== studioKey)
                    : [...links, { studio: studioKey, action: 'generate' }],
            }
        }))
    }

    const handleDragStart = (idx) => setDragIdx(idx)
    const handleDragOver = (e, idx) => { e.preventDefault() }
    const handleDrop = (idx) => {
        if (dragIdx === null || dragIdx === idx) return
        const newStages = [...stages]
        const [moved] = newStages.splice(dragIdx, 1)
        newStages.splice(idx, 0, moved)
        setStages(newStages.map((s, i) => ({ ...s, order: i })))
        setDragIdx(null)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await saveStages(stages)
        } catch { }
        finally { setSaving(false) }
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack}
                        className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg">Edit Funnel Stages</h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">Drag to reorder · Click to configure · Link Mantram studios</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={addStage}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">add</span> Add Stage
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold btn-primary flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                        {saving ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Saving...</>
                            : <><span className="material-symbols-outlined text-sm">check</span> Save</>}
                    </button>
                </div>
            </div>

            {/* Stage Flow Preview */}
            <div className="flex items-center gap-1 mb-6 px-2 overflow-x-auto">
                {stages.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                        <div className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--sys-text)]" style={{ backgroundColor: `${s.color}40`, borderBottom: `2px solid ${s.color}` }}>
                            {s.name}
                        </div>
                        {idx < stages.length - 1 && <span className="text-[var(--sys-text-muted)] text-sm">→</span>}
                    </div>
                ))}
            </div>

            {/* Stage Cards */}
            <div className="space-y-3">
                {stages.map((stage, idx) => {
                    const isEditing = editingIdx === idx
                    return (
                        <div key={idx} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDrop={() => handleDrop(idx)}
                            className={`glass-panel rounded-2xl p-5 transition-all cursor-grab active:cursor-grabbing ${isEditing ? 'border-primary/30 bg-primary/[0.02]' : ''}`}
                            onClick={() => setEditingIdx(isEditing ? null : idx)}>
                            {/* Stage Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1 text-[var(--sys-text-muted)]">
                                        <span className="material-symbols-outlined text-sm cursor-grab">drag_indicator</span>
                                        <span className="text-xs font-bold">{idx + 1}</span>
                                    </div>
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                                    {isEditing ? (
                                        <input type="text" value={stage.name} onClick={e => e.stopPropagation()}
                                            onChange={e => updateStage(idx, 'name', e.target.value)}
                                            className="bg-transparent border-b border-primary/40 text-[var(--sys-text)] font-bold text-sm outline-none px-1 py-0.5" />
                                    ) : (
                                        <h3 className="text-[var(--sys-text)] font-bold text-sm">{stage.name}</h3>
                                    )}
                                    <span className="px-2 py-0.5 rounded text-xs bg-[var(--sys-surface)] text-[var(--sys-text-muted)] capitalize">{stage.type}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)]">{isEditing ? 'expand_less' : 'expand_more'}</span>
                                    <button onClick={(e) => { e.stopPropagation(); removeStage(idx) }} title="Remove stage"
                                        className="size-7 rounded-md flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>
                            </div>

                            {/* Expanded Edit Panel */}
                            {isEditing && (
                                <div className="space-y-4 mt-4 pt-4 border-t border-[var(--sys-border)]" onClick={e => e.stopPropagation()}>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase mb-1">Type</label>
                                            <select value={stage.type} onChange={e => updateStage(idx, 'type', e.target.value)}
                                                style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.5rem', color: 'var(--sys-text)', fontSize: '0.8rem', outline: 'none' }}>
                                                {['awareness', 'interest', 'consideration', 'decision', 'retention', 'custom'].map(t =>
                                                    <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>
                                                )}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase mb-1">Color</label>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {STAGE_COLORS.map(c => (
                                                    <button key={c} onClick={() => updateStage(idx, 'color', c)}
                                                        className={`size-6 rounded-full transition-all cursor-pointer ${stage.color === c ? 'ring-2 border-[var(--sys-border)]  ring-offset-slate-900 scale-110' : 'hover:scale-110'}`}
                                                        style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase mb-1">Description</label>
                                        <textarea value={stage.description || ''} onChange={e => updateStage(idx, 'description', e.target.value)}
                                            rows={2} placeholder="What happens at this stage?"
                                            style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.5rem', color: 'var(--sys-text)', fontSize: '0.8rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                                    </div>

                                    {/* Studio Links */}
                                    <div>
                                        <label className="block text-xs text-[var(--sys-text-muted)] font-bold uppercase mb-2">
                                            <span className="material-symbols-outlined text-xs align-middle mr-1">link</span>
                                            Connected Studios
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {STUDIO_OPTIONS.map(studio => {
                                                const isLinked = (stage.studioLinks || []).some(l => l.studio === studio.key)
                                                return (
                                                    <button key={studio.key} onClick={() => toggleStudioLink(idx, studio.key)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${isLinked
                                                            ? 'border-primary/30 bg-primary/[0.06] text-white'
                                                            : 'border-[var(--sys-border)] bg-transparent text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
                                                        <span className="material-symbols-outlined text-sm" style={{ color: isLinked ? studio.color : '#64748b' }}>{studio.icon}</span>
                                                        {studio.label}
                                                        {isLinked && <span className="material-symbols-outlined text-xs text-primary ml-auto">check_circle</span>}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// IMPORT CONTACTS MODAL
// ═══════════════════════════════════════════════════════════════
function ImportContactsModal({ stages, onImport, onClose }) {
    const [leadStatus, setLeadStatus] = useState('')
    const [platform, setPlatform] = useState('')
    const [stage, setStage] = useState(stages[0]?.name || '')
    const [maxImport, setMaxImport] = useState(50)
    const [importing, setImporting] = useState(false)

    const handleImport = async () => {
        setImporting(true)
        try {
            await onImport({ leadStatus: leadStatus || undefined, platform: platform || undefined, stage, maxImport })
        } catch { }
        finally { setImporting(false) }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div style={{ background: 'var(--sys-surface)', borderRadius: '16px', border: '1px solid var(--sys-border)', width: '460px', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--sys-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, color: 'var(--sys-text)', fontSize: '1rem', fontWeight: 700 }}>📥 Import Contacts</h3>
                        <p style={{ color: 'var(--sys-text-muted)', margin: '0.2rem 0 0', fontSize: '0.7rem' }}>Pull existing CRM contacts into this funnel</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sys-text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                </div>
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div>
                        <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Filter by Lead Status</label>
                        <select value={leadStatus} onChange={e => setLeadStatus(e.target.value)}
                            style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.55rem 0.7rem', color: 'var(--sys-text)', fontSize: '0.85rem', outline: 'none' }}>
                            <option value="">All statuses</option>
                            {['new', 'warm', 'hot', 'cold', 'converted'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Filter by Platform</label>
                        <select value={platform} onChange={e => setPlatform(e.target.value)}
                            style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.55rem 0.7rem', color: 'var(--sys-text)', fontSize: '0.85rem', outline: 'none' }}>
                            <option value="">All platforms</option>
                            {['instagram', 'facebook', 'linkedin', 'whatsapp', 'email', 'website', 'telephonic', 'twitter', 'other'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Enter at Stage</label>
                        <select value={stage} onChange={e => setStage(e.target.value)}
                            style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.55rem 0.7rem', color: 'var(--sys-text)', fontSize: '0.85rem', outline: 'none' }}>
                            {stages.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Max Contacts: {maxImport}</label>
                        <input type="range" min={10} max={200} step={10} value={maxImport} onChange={e => setMaxImport(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: '#6366f1' }} />
                    </div>
                    <button onClick={handleImport} disabled={importing}
                        style={{ width: '100%', padding: '0.7rem', background: importing ? '#4b5563' : '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: importing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                        {importing ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Importing...</>
                            : <><span className="material-symbols-outlined text-sm">download</span> Import up to {maxImport} contacts</>}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// AI SUGGESTIONS PANEL
// ═══════════════════════════════════════════════════════════════
const SUGGESTION_STYLES = {
    warning: { icon: 'warning', color: '#ef4444', bg: 'rgba(239,68,68,0.06)' },
    opportunity: { icon: 'lightbulb', color: '#f59e0b', bg: 'rgba(245,158,11,0.06)' },
    quick_win: { icon: 'bolt', color: '#10b981', bg: 'rgba(16,185,129,0.06)' },
    automation: { icon: 'smart_toy', color: '#6366f1', bg: 'rgba(99,102,241,0.06)' },
}

function AISuggestionsPanel({ suggestions, loading, onClose }) {
    return (
        <div className="mt-6 glass-panel rounded-2xl p-5 border-[var(--sys-border)]">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">auto_awesome</span>
                    <h3 className="text-[var(--sys-text)] font-bold text-sm">AI Optimization Tips</h3>
                </div>
                <button onClick={onClose} className="size-7 rounded-md flex items-center justify-center text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] cursor-pointer">
                    <span className="material-symbols-outlined text-sm">close</span>
                </button>
            </div>
            {loading ? (
                <div className="flex items-center gap-2 py-6 justify-center text-[var(--sys-text-muted)]">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    Analyzing your funnel...
                </div>
            ) : !suggestions?.length ? (
                <p className="text-[var(--sys-text-muted)] text-sm text-center py-4">No suggestions available</p>
            ) : (
                <div className="space-y-3">
                    {suggestions.map((s, idx) => {
                        const style = SUGGESTION_STYLES[s.type] || SUGGESTION_STYLES.opportunity
                        const studioInfo = STUDIO_OPTIONS.find(st => st.key === s.studioLink)
                        return (
                            <div key={idx} className="flex gap-3 p-3 rounded-xl border border-[var(--sys-border)]" style={{ backgroundColor: style.bg }}>
                                <span className="material-symbols-outlined text-lg shrink-0 mt-0.5" style={{ color: style.color }}>{s.icon || style.icon}</span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-sm text-[var(--sys-text)] font-bold">{s.title}</p>
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${s.priority === 'high' ? 'bg-[var(--sys-primary-dim)] text-primary'
                                            : s.priority === 'medium' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-border)]/10 text-[var(--sys-text-muted)]'}`}>
                                            {s.priority}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed">{s.description}</p>
                                    {studioInfo && (
                                        <div className="flex items-center gap-1 mt-1.5 text-xs text-[var(--sys-text-muted)]">
                                            <span className="material-symbols-outlined text-xs" style={{ color: studioInfo.color }}>{studioInfo.icon}</span>
                                            Use {studioInfo.label}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// NURTURE VIEW — Manage multi-channel nurture sequences per stage
// ═══════════════════════════════════════════════════════════════
const CHANNEL_META = {
    dm: { icon: 'chat', label: 'DM', color: '#6366f1' },
    email: { icon: 'mail', label: 'Email', color: '#f59e0b' },
    sms: { icon: 'sms', label: 'SMS', color: '#10b981' },
    whatsapp: { icon: 'chat_bubble', label: 'WhatsApp', color: '#25d366' },
    push_notification: { icon: 'notifications', label: 'Push', color: '#ef4444' },
    internal_task: { icon: 'task_alt', label: 'Task', color: '#8b5cf6' },
}

const TRIGGER_LABELS = {
    stage_enter: 'When lead enters stage',
    stage_exit: 'When lead exits stage',
    manual: 'Manual trigger',
    score_threshold: 'Score reaches threshold',
    time_in_stage: 'Time spent in stage',
}

function NurtureView({ funnel, sequences, loading, onBack, onCreate, onAIGenerate, onUpdate, onDelete, onToggle, onRefresh }) {
    const [aiGenStage, setAiGenStage] = useState(null)
    const [aiPrompt, setAiPrompt] = useState('')
    const [aiChannels, setAiChannels] = useState(['dm', 'email'])
    const [generating, setGenerating] = useState(false)
    const [expandedSeq, setExpandedSeq] = useState(null)
    const [showCreate, setShowCreate] = useState(null) // stageName to create for

    const stages = funnel.stages || []

    const handleAiGenerate = async () => {
        if (!aiGenStage) return
        setGenerating(true)
        try {
            await onAIGenerate({
                funnelId: funnel._id,
                triggerStage: aiGenStage,
                prompt: aiPrompt || undefined,
                channels: aiChannels,
            })
            setAiGenStage(null)
            setAiPrompt('')
        } catch { }
        finally { setGenerating(false) }
    }

    const handleQuickCreate = async (stageName) => {
        await onCreate({
            funnelId: funnel._id,
            name: `${stageName} Nurture`,
            triggerStage: stageName,
            triggerEvent: 'stage_enter',
            steps: [
                { name: 'Welcome', channel: 'dm', delay: { value: 0, unit: 'hours' }, content: `Hi {{name}}! Thanks for your interest.`, contentType: 'text' },
                { name: 'Follow Up', channel: 'email', delay: { value: 24, unit: 'hours' }, subject: 'Just checking in', content: `Hi {{name}}, we wanted to follow up...`, contentType: 'text' },
            ],
        })
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack}
                        className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">mail</span> Nurture Sequences
                        </h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">Automated multi-channel follow-ups for each funnel stage</p>
                    </div>
                </div>
                <button onClick={onRefresh}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-12 justify-center text-[var(--sys-text-muted)]">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    Loading sequences...
                </div>
            ) : (
                <div className="space-y-4">
                    {stages.map(stage => {
                        const stageSeqs = sequences.filter(s => s.triggerStage === stage.name)
                        return (
                            <div key={stage.name} className="glass-panel rounded-2xl p-5">
                                {/* Stage Header */}
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                                        <h3 className="text-[var(--sys-text)] font-bold text-sm">{stage.name}</h3>
                                        <span className="px-2 py-0.5 rounded text-xs bg-[var(--sys-surface)] text-[var(--sys-text-muted)] capitalize">{stage.type}</span>
                                        {stageSeqs.length > 0 && (
                                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[var(--sys-primary-dim)] text-primary">
                                                {stageSeqs.length} sequence{stageSeqs.length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleQuickCreate(stage.name)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">add</span> Quick
                                        </button>
                                        <button onClick={() => setAiGenStage(stage.name)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">auto_awesome</span> AI Generate
                                        </button>
                                    </div>
                                </div>

                                {/* Sequences for this stage */}
                                {stageSeqs.length === 0 ? (
                                    <p className="text-[var(--sys-text-muted)] text-xs italic py-2">No nurture sequences — add one to automate follow-ups</p>
                                ) : (
                                    <div className="space-y-3">
                                        {stageSeqs.map(seq => {
                                            const isExpanded = expandedSeq === seq._id
                                            return (
                                                <div key={seq._id} className={`rounded-xl border transition-all ${seq.status === 'active' ? 'border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.02]' : 'border-[var(--sys-border)] bg-[var(--sys-surface)]'}`}>
                                                    {/* Sequence Header */}
                                                    <div className="flex items-center justify-between p-3 cursor-pointer" onClick={() => setExpandedSeq(isExpanded ? null : seq._id)}>
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className={`size-8 rounded-lg flex items-center justify-center ${seq.status === 'active' ? 'bg-[var(--sys-primary-dim)]' : 'bg-[var(--sys-surface)]'}`}>
                                                                <span className={`material-symbols-outlined text-sm ${seq.status === 'active' ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>
                                                                    {seq.status === 'active' ? 'play_circle' : 'pause_circle'}
                                                                </span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm text-[var(--sys-text)] font-bold truncate">{seq.name}</p>
                                                                <p className="text-xs text-[var(--sys-text-muted)]">{seq.steps?.length || 0} steps · {TRIGGER_LABELS[seq.triggerEvent] || seq.triggerEvent}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {/* Channel pills */}
                                                            <div className="flex gap-1">
                                                                {[...new Set(seq.steps?.map(s => s.channel) || [])].map(ch => {
                                                                    const meta = CHANNEL_META[ch] || CHANNEL_META.dm
                                                                    return (
                                                                        <span key={ch} className="size-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${meta.color}15` }}>
                                                                            <span className="material-symbols-outlined text-xs" style={{ color: meta.color }}>{meta.icon}</span>
                                                                        </span>
                                                                    )
                                                                })}
                                                            </div>
                                                            {seq.aiGenerated && <span className="material-symbols-outlined text-xs text-primary" title="AI generated">auto_awesome</span>}
                                                            <button onClick={(e) => { e.stopPropagation(); onToggle(seq._id) }}
                                                                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${seq.status === 'active' ? 'bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)]' : 'bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)]'}`}>
                                                                {seq.status === 'active' ? 'Pause' : 'Activate'}
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); onDelete(seq._id) }}
                                                                className="size-7 rounded-md flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                            </button>
                                                            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                                        </div>
                                                    </div>

                                                    {/* Expanded: Step Timeline */}
                                                    {isExpanded && (
                                                        <div className="px-4 pb-4 border-t border-[var(--sys-border)]">
                                                            <div className="relative mt-3">
                                                                {seq.steps?.map((step, sIdx) => {
                                                                    const chMeta = CHANNEL_META[step.channel] || CHANNEL_META.dm
                                                                    const delayLabel = step.delay?.value > 0
                                                                        ? `${step.delay.value} ${step.delay.unit}`
                                                                        : 'Immediately'
                                                                    return (
                                                                        <div key={sIdx} className="flex gap-3 mb-3 last:mb-0">
                                                                            {/* Timeline dot + line */}
                                                                            <div className="flex flex-col items-center">
                                                                                <div className="size-7 rounded-full flex items-center justify-center border shrink-0" style={{ borderColor: chMeta.color, backgroundColor: `${chMeta.color}15` }}>
                                                                                    <span className="material-symbols-outlined text-xs" style={{ color: chMeta.color }}>{chMeta.icon}</span>
                                                                                </div>
                                                                                {sIdx < seq.steps.length - 1 && <div className="w-px flex-1 bg-[var(--sys-surface)] my-1" />}
                                                                            </div>
                                                                            {/* Step content */}
                                                                            <div className="flex-1 min-w-0 pb-2">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <p className="text-sm text-[var(--sys-text)] font-bold">{step.name || `Step ${sIdx + 1}`}</p>
                                                                                    <span className="px-1.5 py-0.5 rounded text-xs font-bold" style={{ backgroundColor: `${chMeta.color}15`, color: chMeta.color }}>{chMeta.label}</span>
                                                                                    <span className="text-xs text-[var(--sys-text-muted)]">⏱ {delayLabel}</span>
                                                                                </div>
                                                                                {step.subject && <p className="text-xs text-[var(--sys-text-muted)] mb-0.5">📌 {step.subject}</p>}
                                                                                <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed line-clamp-2">{step.content}</p>
                                                                                {(step.onComplete?.moveToStage || step.onComplete?.addTag || step.onComplete?.updateScore) && (
                                                                                    <div className="flex gap-2 mt-1.5">
                                                                                        {step.onComplete.moveToStage && (
                                                                                            <span className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary">→ {step.onComplete.moveToStage}</span>
                                                                                        )}
                                                                                        {step.onComplete.addTag && (
                                                                                            <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--sys-primary-dim)] text-primary">🏷 {step.onComplete.addTag}</span>
                                                                                        )}
                                                                                        {step.onComplete.updateScore > 0 && (
                                                                                            <span className="px-1.5 py-0.5 rounded text-xs bg-[var(--sys-primary-dim)] text-primary">+{step.onComplete.updateScore} pts</span>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                            {/* Sequence Stats */}
                                                            {seq.metrics && seq.metrics.totalRuns > 0 && (
                                                                <div className="flex gap-4 mt-3 pt-3 border-t border-[var(--sys-border)]">
                                                                    <div className="text-center"><p className="text-sm text-[var(--sys-text)] font-bold">{seq.metrics.totalRuns}</p><p className="text-xs text-[var(--sys-text-muted)]">Runs</p></div>
                                                                    <div className="text-center"><p className="text-sm text-[var(--sys-text)] font-bold">{seq.metrics.totalSent}</p><p className="text-xs text-[var(--sys-text-muted)]">Sent</p></div>
                                                                    <div className="text-center"><p className="text-sm text-[var(--sys-text)] font-bold">{seq.metrics.totalOpened}</p><p className="text-xs text-[var(--sys-text-muted)]">Opened</p></div>
                                                                    <div className="text-center"><p className="text-sm text-[var(--sys-text)] font-bold">{seq.metrics.totalReplied}</p><p className="text-xs text-[var(--sys-text-muted)]">Replied</p></div>
                                                                    <div className="text-center"><p className="text-sm text-primary font-bold">{seq.metrics.conversionRate}%</p><p className="text-xs text-[var(--sys-text-muted)]">Conv.</p></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* AI Generate Modal */}
            {aiGenStage && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setAiGenStage(null)}>
                    <div style={{ background: 'var(--sys-surface)', borderRadius: '16px', border: '1px solid var(--sys-border)', width: '500px', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--sys-border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--sys-text)', fontSize: '1rem', fontWeight: 700 }}><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">auto_awesome</span> AI Nurture Generator</h3>
                            <p style={{ color: 'var(--sys-text-muted)', margin: '0.2rem 0 0', fontSize: '0.7rem' }}>Generate a complete nurture sequence for the <strong>{aiGenStage}</strong> stage</p>
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div>
                                <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Instructions (optional)</label>
                                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                                    placeholder="e.g. Focus on education, include a special offer in the last step, keep messages short..."
                                    style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.55rem 0.7rem', color: 'var(--sys-text)', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Channels</label>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(CHANNEL_META).map(([key, meta]) => (
                                        <button key={key}
                                            onClick={() => setAiChannels(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${aiChannels.includes(key)
                                                ? 'border-primary/30 bg-primary/[0.06] text-white' : 'border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
                                            <span className="material-symbols-outlined text-xs" style={{ color: aiChannels.includes(key) ? meta.color : '#64748b' }}>{meta.icon}</span>
                                            {meta.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={handleAiGenerate} disabled={generating}
                                style={{ width: '100%', padding: '0.7rem', background: generating ? '#4b5563' : '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {generating ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Generating sequence...</>
                                    : <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate Nurture Sequence</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// HEALTH DASHBOARD VIEW — Funnel health score, bottlenecks,
// AI lead scoring, and optimization recommendations
// ═══════════════════════════════════════════════════════════════
const GRADE_COLORS = { A: '#10b981', B: '#6366f1', C: '#f59e0b', D: '#f97316', F: '#ef4444' }
const SEVERITY_STYLES = {
    high: { color: '#ef4444', bg: '#ef444410', icon: 'error' },
    medium: { color: '#f59e0b', bg: '#f59e0b10', icon: 'warning' },
    low: { color: 'var(--sys-text-muted)', bg: '#64748b10', icon: 'info' },
}

function HealthDashboardView({ funnel, health, loading, scoringResult, scoringLoading, onBack, onRefresh, onRunScoring }) {
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">health_and_safety</span> Funnel Health
                        </h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">Real-time diagnostics and AI-powered recommendations</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onRunScoring} disabled={scoringLoading}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-primary hover:text-[var(--sys-primary)] bg-[var(--sys-surface)]/[0.06] hover:bg-[var(--sys-surface)]/[0.1] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                        <span className={`material-symbols-outlined text-sm ${scoringLoading ? 'animate-spin' : ''}`}>{scoringLoading ? 'progress_activity' : 'score'}</span>
                        {scoringLoading ? 'Scoring...' : 'Score Leads'}
                    </button>
                    <button onClick={onRefresh} className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-12 justify-center text-[var(--sys-text-muted)]">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Analyzing funnel health...
                </div>
            ) : !health ? (
                <p className="text-[var(--sys-text-muted)] text-center py-12">Health data not yet loaded</p>
            ) : (
                <div className="space-y-5">
                    {/* Grade + Summary Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="glass-panel rounded-2xl p-6 flex flex-col items-center justify-center">
                            <div className="size-20 rounded-2xl flex items-center justify-center mb-3 border" style={{ borderColor: GRADE_COLORS[health.grade] || '#64748b', backgroundColor: `${GRADE_COLORS[health.grade] || '#64748b'}10` }}>
                                <span className="text-4xl font-black" style={{ color: GRADE_COLORS[health.grade] }}>{health.grade}</span>
                            </div>
                            <p className="text-[var(--sys-text)] font-bold text-sm">Health Score</p>
                            <p className="text-2xl font-black mt-1" style={{ color: GRADE_COLORS[health.grade] }}>{health.overallScore}/100</p>
                        </div>
                        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-center">
                            <p className="text-[var(--sys-text-muted)] text-xs uppercase font-bold mb-1">Total Entries</p>
                            <p className="text-[var(--sys-text)] text-3xl font-black">{health.totalEntries}</p>
                        </div>
                        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-center">
                            <p className="text-[var(--sys-text-muted)] text-xs uppercase font-bold mb-1">Converted</p>
                            <p className="text-primary text-3xl font-black">{health.convertedEntries}</p>
                            <p className="text-primary/60 text-sm font-bold">{health.conversionRate}% rate</p>
                        </div>
                        <div className="glass-panel rounded-2xl p-5 flex flex-col justify-center">
                            <p className="text-[var(--sys-text-muted)] text-xs uppercase font-bold mb-1">Lost</p>
                            <p className="text-primary text-3xl font-black">{health.lostEntries}</p>
                        </div>
                    </div>

                    {/* Stage Health */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="text-[var(--sys-text)] font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">monitoring</span> Stage-by-Stage Health
                        </h3>
                        <div className="space-y-2">
                            {health.stageHealth?.map((stage, idx) => (
                                <div key={stage.stageName} className={`flex items-center gap-4 p-3 rounded-xl border ${stage.isBottleneck ? 'border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.03]' : stage.isStagnant ? 'border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.03]' : 'border-[var(--sys-border)] bg-[var(--sys-surface)]'}`}>
                                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.stageColor }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm text-[var(--sys-text)] font-bold">{stage.stageName}</p>
                                            <span className="text-xs text-[var(--sys-text-muted)] capitalize">{stage.stageType}</span>
                                            {stage.isBottleneck && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--sys-primary-dim)] text-primary">🚨 Bottleneck</span>}
                                            {stage.isStagnant && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-[var(--sys-primary-dim)] text-primary">⏳ Stagnant</span>}
                                        </div>
                                        <div className="flex gap-4 mt-1">
                                            <span className="text-xs text-[var(--sys-text-muted)]">{stage.activeEntries} active</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">{stage.totalEverEntered} total</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">{stage.avgTimeHrs}h avg</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">{stage.studioLinksCount} links</span>
                                        </div>
                                    </div>
                                    {idx > 0 && (
                                        <span className={`text-sm font-bold shrink-0 ${stage.dropOffRate > 50 ? 'text-primary' : stage.dropOffRate > 25 ? 'text-primary' : 'text-primary'}`}>
                                            ↓ {stage.dropOffRate}%
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Issues + Recommendations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="text-[var(--sys-text)] font-bold mb-3 flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined text-primary text-lg">bug_report</span> Issues ({health.issues?.length || 0})
                            </h3>
                            {!health.issues?.length ? (
                                <p className="text-primary text-sm flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">check_circle</span> No issues!</p>
                            ) : (
                                <div className="space-y-2">
                                    {health.issues.map((issue, idx) => {
                                        const st = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low
                                        return (
                                            <div key={idx} className="flex gap-2 p-2.5 rounded-lg" style={{ backgroundColor: st.bg }}>
                                                <span className="material-symbols-outlined text-sm shrink-0 mt-0.5" style={{ color: st.color }}>{st.icon}</span>
                                                <div><p className="text-xs text-[var(--sys-text)] font-bold">{issue.message}</p><p className="text-xs text-[var(--sys-text-muted)] capitalize">{issue.type.replace(/_/g, ' ')} · {issue.severity}</p></div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="glass-panel rounded-2xl p-5">
                            <h3 className="text-[var(--sys-text)] font-bold mb-3 flex items-center gap-2 text-sm">
                                <span className="material-symbols-outlined text-primary text-lg">tips_and_updates</span> Recommendations ({health.recommendations?.length || 0})
                            </h3>
                            {!health.recommendations?.length ? (
                                <p className="text-[var(--sys-text-muted)] text-sm">No recommendations at this time</p>
                            ) : (
                                <div className="space-y-2">
                                    {health.recommendations.map((rec, idx) => (
                                        <div key={idx} className="p-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="material-symbols-outlined text-xs text-primary">lightbulb</span>
                                                <p className="text-xs text-[var(--sys-text)] font-bold">{rec.action}</p>
                                                <span className="text-xs text-[var(--sys-text-muted)]">({rec.stage})</span>
                                            </div>
                                            <p className="text-xs text-[var(--sys-text-muted)]">{rec.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Lead Scoring Results */}
                    {scoringResult && (
                        <div className="glass-panel rounded-2xl p-6">
                            <h3 className="text-[var(--sys-text)] font-bold mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">score</span> Lead Scoring
                                <span className="text-xs text-[var(--sys-text-muted)] font-normal ml-2">{scoringResult.scored} scored</span>
                            </h3>
                            <div className="flex gap-3 mb-4">
                                <div className="flex-1 p-3 rounded-xl bg-[var(--sys-surface)]/[0.06] border border-[var(--sys-border)] text-center">
                                    <p className="text-primary text-2xl font-black">{scoringResult.summary?.hot || 0}</p>
                                    <p className="text-primary/60 text-xs font-bold"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">local_fire_department</span> Hot (70+)</p>
                                </div>
                                <div className="flex-1 p-3 rounded-xl bg-[var(--sys-surface)]/[0.06] border border-[var(--sys-border)] text-center">
                                    <p className="text-primary text-2xl font-black">{scoringResult.summary?.warm || 0}</p>
                                    <p className="text-primary/60 text-xs font-bold">🌡️ Warm (40-69)</p>
                                </div>
                                <div className="flex-1 p-3 rounded-xl bg-[#FF4D00]/[0.06] border border-[#FF4D00]/10 text-center">
                                    <p className="text-[#FF4D00] text-2xl font-black">{scoringResult.summary?.cold || 0}</p>
                                    <p className="text-[#FF4D00]/60 text-xs font-bold">❄️ Cold (&lt;40)</p>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                {scoringResult.entries?.slice(0, 10).map((entry, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--sys-surface)]">
                                        <div className="size-8 rounded-full flex items-center justify-center text-xs font-black" style={{
                                            backgroundColor: entry.newScore >= 70 ? '#ef444415' : entry.newScore >= 40 ? '#f59e0b15' : '#3b82f615',
                                            color: entry.newScore >= 70 ? '#ef4444' : entry.newScore >= 40 ? '#f59e0b' : '#3b82f6'
                                        }}>{entry.newScore}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-[var(--sys-text)] font-bold truncate">{entry.name}</p>
                                            <p className="text-xs text-[var(--sys-text-muted)]">{entry.stage} · {entry.signals?.slice(0, 2).join(', ')}</p>
                                        </div>
                                        {entry.previousScore !== entry.newScore && (
                                            <span className={`text-xs font-bold ${entry.newScore > entry.previousScore ? 'text-primary' : 'text-primary'}`}>
                                                {entry.newScore > entry.previousScore ? '▲' : '▼'} {Math.abs(entry.newScore - entry.previousScore)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// LANDING PAGES VIEW — Create, manage, AI-generate landing pages
// ═══════════════════════════════════════════════════════════════
const SECTION_ICONS = {
    hero: 'web_asset', features: 'view_list', testimonial: 'format_quote', cta: 'ads_click',
    form: 'description', text: 'article', image: 'image', video: 'videocam', faq: 'quiz', pricing: 'payments'
}

function LandingPagesView({ funnel, pages, loading, onBack, onRefresh, onCreate, onAIGenerate, onDelete }) {
    const [showAiGen, setShowAiGen] = useState(false)
    const [aiStage, setAiStage] = useState(funnel.stages?.[0]?.name || '')
    const [aiPrompt, setAiPrompt] = useState('')
    const [generating, setGenerating] = useState(false)
    const stages = funnel.stages || []

    const handleAiGenerate = async () => {
        setGenerating(true)
        try {
            await onAIGenerate({ funnelId: funnel._id, targetStage: aiStage, prompt: aiPrompt || undefined })
            setShowAiGen(false); setAiPrompt('')
        } catch { }
        finally { setGenerating(false) }
    }

    const handleQuickCreate = async () => {
        await onCreate({ funnelId: funnel._id, name: `${funnel.name} Landing Page`, targetStage: stages[0]?.name || 'Top' })
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#FF4D00]">web</span> Landing Pages
                        </h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">Capture leads with branded landing pages and forms</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleQuickCreate} className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">add</span> Quick Page
                    </button>
                    <button onClick={() => setShowAiGen(true)} className="px-4 py-2 rounded-xl text-sm font-bold text-primary hover:text-[var(--sys-primary)] bg-[var(--sys-surface)]/[0.06] hover:bg-[var(--sys-surface)]/[0.1] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Generate
                    </button>
                    <button onClick={onRefresh} className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">refresh</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-12 justify-center text-[var(--sys-text-muted)]">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Loading pages...
                </div>
            ) : pages.length === 0 ? (
                <div className="glass-panel rounded-2xl p-10 text-center">
                    <span className="material-symbols-outlined text-5xl text-[var(--sys-text-muted)] mb-3">web</span>
                    <p className="text-[var(--sys-text)] font-bold mb-1">No Landing Pages Yet</p>
                    <p className="text-[var(--sys-text-muted)] text-sm mb-4">Create a branded landing page to capture leads into your funnel</p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={handleQuickCreate} className="px-5 py-2.5 rounded-xl text-sm font-bold text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">add</span> Create Page
                        </button>
                        <button onClick={() => setShowAiGen(true)} className="px-5 py-2.5 rounded-xl text-sm font-bold btn-primary flex items-center gap-1.5 cursor-pointer">
                            <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Generate
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pages.map(page => (
                        <div key={page._id} className="glass-panel rounded-2xl overflow-hidden hover:border-[var(--sys-border)] transition-all">
                            <div className="h-28 relative flex items-center justify-center" style={{ backgroundColor: page.style?.primaryColor ? `${page.style.primaryColor}15` : '#6366f115' }}>
                                <div className="text-center px-4">
                                    <p className="text-[var(--sys-text)] font-bold text-sm truncate">{page.sections?.[0]?.content?.headline || page.name}</p>
                                    <p className="text-[var(--sys-text-muted)] text-xs truncate mt-0.5">{page.sections?.[0]?.content?.subheadline || ''}</p>
                                </div>
                                <span className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-bold ${page.status === 'published' ? 'bg-[var(--sys-primary-dim)] text-primary' : page.status === 'archived' ? 'bg-[var(--sys-border)]/10 text-[var(--sys-text-muted)]' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>{page.status}</span>
                            </div>
                            <div className="p-4">
                                <p className="text-[var(--sys-text)] font-bold text-sm truncate">{page.name}</p>
                                <p className="text-[var(--sys-text-muted)] text-xs mt-0.5">/{page.slug}</p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="text-xs text-[var(--sys-text-muted)]">→ {page.targetStage}</span>
                                    {page.aiGenerated && <span className="material-symbols-outlined text-xs text-primary">auto_awesome</span>}
                                </div>
                                <div className="flex gap-3 mt-3 pt-3 border-t border-[var(--sys-border)]">
                                    <div><p className="text-[var(--sys-text)] text-sm font-bold">{page.metrics?.views || 0}</p><p className="text-xs text-[var(--sys-text-muted)]">Views</p></div>
                                    <div><p className="text-[var(--sys-text)] text-sm font-bold">{page.metrics?.submissions || 0}</p><p className="text-xs text-[var(--sys-text-muted)]">Leads</p></div>
                                    <div><p className="text-primary text-sm font-bold">{page.metrics?.conversionRate || 0}%</p><p className="text-xs text-[var(--sys-text-muted)]">Conv.</p></div>
                                </div>
                                <div className="flex gap-1 mt-3">
                                    {page.sections?.map((s, idx) => (
                                        <span key={idx} className="size-6 rounded flex items-center justify-center bg-[var(--sys-surface)]" title={s.type}>
                                            <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)]">{SECTION_ICONS[s.type] || 'article'}</span>
                                        </span>
                                    ))}
                                    {page.form?.enabled && <span className="size-6 rounded flex items-center justify-center bg-[#FF4D00]/10"><span className="material-symbols-outlined text-xs text-[#FF4D00]">description</span></span>}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button onClick={() => onDelete(page._id)} className="size-7 rounded-md flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showAiGen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAiGen(false)}>
                    <div style={{ background: 'var(--sys-surface)', borderRadius: '16px', border: '1px solid var(--sys-border)', width: '480px', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--sys-border)' }}>
                            <h3 style={{ margin: 0, color: 'var(--sys-text)', fontSize: '1rem', fontWeight: 700 }}><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">auto_awesome</span> AI Landing Page Generator</h3>
                            <p style={{ color: 'var(--sys-text-muted)', margin: '0.2rem 0 0', fontSize: '0.7rem' }}>Generate a conversion-optimized landing page</p>
                        </div>
                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div>
                                <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Target Stage</label>
                                <select value={aiStage} onChange={e => setAiStage(e.target.value)}
                                    style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.55rem 0.7rem', color: 'var(--sys-text)', fontSize: '0.85rem', outline: 'none' }}>
                                    {stages.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', color: 'var(--sys-text-muted)', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Instructions (optional)</label>
                                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3}
                                    placeholder="e.g. Focus on social proof, include pricing table, use urgency..."
                                    style={{ width: '100%', background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: '8px', padding: '0.55rem 0.7rem', color: 'var(--sys-text)', fontSize: '0.85rem', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <button onClick={handleAiGenerate} disabled={generating}
                                style={{ width: '100%', padding: '0.7rem', background: generating ? '#4b5563' : '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '0.85rem', cursor: generating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                {generating ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Generating page...</>
                                    : <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate Landing Page</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// HELP DOCUMENTATION VIEW — Comprehensive in-app guide
// ═══════════════════════════════════════════════════════════════
const HELP_SECTIONS = [
    {
        id: 'getting-started',
        icon: 'rocket_launch',
        color: '#6366f1',
        title: 'Getting Started',
        subtitle: 'Create your first funnel in minutes',
        steps: [
            { icon: 'hub', title: 'Command Center Dashboard', description: 'When you open Funnel Studio, you land on the Command Center — an intelligence-first dashboard showing your active funnels, total leads, conversions, and average CVR at a glance. Use the "What To Do Next" section for AI-suggested actions.' },
            { icon: 'add_circle', title: 'Create a Funnel', description: 'Expand the "Funnel Templates" section at the bottom of the dashboard. Click any template card to instantly create a pre-configured funnel — Lead Gen, E-commerce, Webinar, Onboarding, or Content.' },
            { icon: 'auto_awesome', title: 'Use AI Architect', description: 'Click "AI Architect" at the top of the dashboard and describe your business goal. The AI designs a custom funnel with the right stages, colors, and structure tailored to your brand.' },
            { icon: 'open_in_new', title: 'Open Your Funnel', description: 'Click any funnel card to open the Pipeline view — a Kanban-style board with tabbed navigation for all features.' },
        ]
    },
    {
        id: 'navigation',
        icon: 'tab',
        color: '#3b82f6',
        title: 'Tabbed Navigation System',
        subtitle: 'Navigate all features through 4 organized tabs',
        steps: [
            { icon: 'view_kanban', title: 'Pipeline Tab (Indigo)', description: 'Your default view — the Kanban board with drag-and-drop lead cards. Use "Add Lead" to create entries and "Import" to bulk-import contacts. The "AI Tips" button fetches smart suggestions.' },
            { icon: 'insights', title: 'Intelligence Tab (Cyan)', description: 'Access Health diagnostics, Analytics charts, Revenue Forecast, and Lead Scoring. Sub-tabs appear when active. "Score Leads" runs the AI scoring engine across all entries.' },
            { icon: 'campaign', title: 'Engage Tab (Green)', description: 'Manage Automations, Nurture Sequences, Landing Pages, and the Activity Feed. Each sub-tab opens its dedicated management view.' },
            { icon: 'tune', title: 'Configure Tab (Amber)', description: 'Access the Stage Builder to customize your funnel stages and Webhooks to connect external integrations. Configure studio connections per stage.' },
            { icon: 'smart_toy', title: 'Fidato AI Button', description: 'The blue AI button in the top-right opens the Fidato AI sidebar. Fidato can score leads, run predictions, execute automations, and answer questions about your funnel — all in context.' },
        ]
    },
    {
        id: 'templates',
        icon: 'dashboard_customize',
        color: '#10b981',
        title: 'Templates & AI Architect',
        subtitle: 'Pre-built funnels and intelligent automation',
        steps: [
            { icon: 'filter_alt', title: 'Lead Generation Funnel', description: '6-stage funnel: Awareness → Interest → Consideration → Intent → Evaluation → Closed Won. Perfect for B2B and service businesses capturing leads through content and outreach.' },
            { icon: 'shopping_cart', title: 'E-commerce Funnel', description: '5-stage funnel: Browse → Cart → Checkout → Purchase → Repeat. Designed for D2C brands to track the buyer journey from product discovery to purchase.' },
            { icon: 'videocam', title: 'Webinar / Event Funnel', description: '4-stage funnel: Registered → Attended → Engaged → Converted. Track registrations, attendance, engagement signals, and post-event conversions.' },
            { icon: 'person_add', title: 'Onboarding Funnel', description: '5-stage funnel: Signed Up → Activated → Engaged → Power User → Advocate. Map the user journey from signup to becoming a product champion.' },
            { icon: 'article', title: 'Content Marketing Funnel', description: '4-stage funnel: Visitor → Subscriber → Engaged Reader → Customer. Convert content consumers into paying customers.' },
            { icon: 'psychology', title: 'AI Architect', description: 'Describe your goal in plain text (e.g. "SaaS onboarding for a CRM tool targeting SMBs"). The AI designs a complete funnel with branded stages, descriptions, colors, and types.' },
            { icon: 'expand_more', title: 'Collapsible Templates', description: 'Templates are shown in a collapsible section on the dashboard. When you already have funnels, templates collapse automatically to keep the dashboard clean — expand anytime.' },
        ]
    },
    {
        id: 'pipeline',
        icon: 'view_kanban',
        color: '#f59e0b',
        title: 'Pipeline & Lead Management',
        subtitle: 'Manage your leads with enhanced Kanban cards',
        steps: [
            { icon: 'person_add', title: 'Add Leads', description: 'Click "Add Lead" in the pipeline header. Enter name, email, phone, company, source, deal value (₹), and lead score. The lead appears in your selected stage.' },
            { icon: 'drag_indicator', title: 'Drag & Drop Between Stages', description: 'Drag lead cards between Kanban columns to move them through your funnel. You can also use the quick "→ Stage" buttons that appear on hover.' },
            { icon: 'download', title: 'Import Contacts', description: 'Click "Import" to bulk-import existing contacts into your funnel. Filter by tags, source, or date range — then assign them to any stage.' },
            { icon: 'local_fire_department', title: 'Score Ring & Hot Leads', description: 'Each lead card has a color-coded score ring around the avatar: green (70+), amber (40-69), gray (<40). Hot leads (70+) show a green dot indicator for quick visual identification.' },
            { icon: 'currency_rupee', title: 'Deal Value Badge', description: 'When you add a deal value, it appears as a ₹ badge on the card. This helps you prioritize high-value deals at a glance across your pipeline.' },
            { icon: 'schedule', title: 'Last Activity Timer', description: 'Each card shows how long ago the lead was last active (e.g. "2h ago", "3d ago"). Stale leads stand out, helping your team prioritize follow-ups.' },
            { icon: 'label', title: 'Tags & Source Badges', description: 'Tags and source badges appear directly on cards. Up to 2 tags are visible per card, and the source (ad, SEO, social, etc.) is shown with an icon.' },
            { icon: 'check_circle', title: 'Quick Actions', description: 'Hover on any card to see: ✅ Convert, ❌ Mark Lost, and 🗑 Delete buttons. Converted entries celebrate with confetti!' },
        ]
    },
    {
        id: 'builder',
        icon: 'build',
        color: '#8b5cf6',
        title: 'Visual Funnel Builder',
        subtitle: 'Customize stages, colors, and studio connections',
        steps: [
            { icon: 'edit', title: 'Edit Stages', description: 'Navigate to the Configure tab → Stage Builder. Rename stages, change colors, update descriptions, and set stage types (awareness, interest, consideration, decision, retention).' },
            { icon: 'reorder', title: 'Drag & Reorder', description: 'Drag stages up or down to reorder them. Your funnel flow updates automatically across all views.' },
            { icon: 'add', title: 'Add New Stages', description: 'Click "Add Stage" at the bottom of the builder to insert a new stage. Configure its name, type, color, and description.' },
            { icon: 'link', title: 'Connect Studios', description: 'Toggle studio connections for each stage. Link to Content Studio, Creative Studio, SEO Studio, Performance Marketing, and more. When a lead enters a connected stage, relevant studio workflows can trigger.' },
            { icon: 'delete', title: 'Remove Stages', description: 'Delete stages you no longer need. Entries in deleted stages will be moved to the nearest adjacent stage.' },
        ]
    },
    {
        id: 'nurture',
        icon: 'mail',
        color: '#10b981',
        title: 'Nurture Sequences',
        subtitle: 'Automated multi-channel follow-up sequences',
        steps: [
            { icon: 'mail', title: 'What Are Nurture Sequences?', description: 'Automated step-by-step communication sequences that engage leads at each funnel stage. Sequences support 6 channels: DM, Email, SMS, WhatsApp, Push Notifications, and Internal Tasks.' },
            { icon: 'auto_awesome', title: 'AI Generate Sequence', description: 'Navigate to the Engage tab → Nurture, then click "AI Generate". Select your target stage, pick channels, and add instructions. The AI creates a multi-step sequence with personalized content, optimal delays, and conditions.' },
            { icon: 'bolt', title: 'Quick Create', description: 'Click "Quick Create" to instantly generate a basic 2-step DM + Email sequence. Customize the content, delays, and conditions afterward.' },
            { icon: 'schedule', title: 'Step Delays', description: 'Configure delay between steps: 30 minutes, 1 hour, 4 hours, 1 day, 3 days, or 7 days. Delays determine when the next step fires after the previous one completes.' },
            { icon: 'rule', title: 'Conditional Logic', description: 'Add conditions to steps: skip if contact has specific tags, score range, status, or source. This ensures leads only receive relevant communications.' },
            { icon: 'play_arrow', title: 'Activate & Manage', description: 'Toggle sequences on/off with the activate button. Active sequences trigger when entries enter the linked stage. Monitor delivery, open, click, and reply metrics per step.' },
        ]
    },
    {
        id: 'health',
        icon: 'health_and_safety',
        color: '#06b6d4',
        title: 'Funnel Health & Lead Scoring',
        subtitle: 'AI-powered diagnostics and optimization',
        steps: [
            { icon: 'health_and_safety', title: 'Health Dashboard', description: 'Navigate to the Intelligence tab → Health. See your funnel\'s overall grade (A–F), based on conversion rate, bottlenecks, stagnation, and stage health.' },
            { icon: 'error', title: 'Bottleneck Detection', description: 'Stages with more than 50% drop-off are flagged as bottlenecks with a 🚨 alert. These are the biggest leaks in your funnel and need immediate attention.' },
            { icon: 'hourglass_bottom', title: 'Stagnation Alerts', description: 'Stages where leads sit for 7+ days on average are flagged as stagnant with a ⏳ alert. Consider adding nurture sequences or reviewing your stage criteria.' },
            { icon: 'tips_and_updates', title: 'AI Recommendations', description: 'The health dashboard generates specific recommendations: add nurture sequences, connect studios, split stages, or add intermediary touchpoints.' },
            { icon: 'score', title: 'Score Leads', description: 'Click "Score Leads" in the Intelligence tab sub-nav to run the AI scoring engine. It analyzes each entry\'s touchpoints, recency, source quality, stage progress, and contact completeness to assign a 0-100 score.' },
            { icon: 'local_fire_department', title: 'Hot / Warm / Cold', description: 'After scoring, leads are categorized: 🔥 Hot (70+), 🌡️ Warm (40-69), ❄️ Cold (<40). Hot leads show a green dot on their Kanban card for instant visual identification.' },
        ]
    },
    {
        id: 'pages',
        icon: 'web',
        color: '#8b5cf6',
        title: 'Landing Pages & Forms',
        subtitle: 'Capture leads with branded landing pages',
        steps: [
            { icon: 'web', title: 'Landing Pages', description: 'Navigate to the Engage tab → Pages. Create landing pages that feed leads directly into your funnel stages. Each page has customizable sections and a lead capture form.' },
            { icon: 'auto_awesome', title: 'AI Generate Page', description: 'Click "AI Generate" to create a complete landing page. The AI uses your brand DNA, funnel context, and target stage to generate hero sections, features, testimonials, CTAs, and forms.' },
            { icon: 'description', title: 'Form Builder', description: 'Each landing page includes a configurable form. Fields map directly to your CRM Contact model (name, email, phone). Form submissions automatically create a Contact AND a Funnel Entry.' },
            { icon: 'analytics', title: 'Page Metrics', description: 'Track views, form submissions, and conversion rate for each page. Use these metrics to optimize your landing page copy, design, and form fields.' },
            { icon: 'public', title: 'Publish Pages', description: 'Pages start as "draft". Change status to "published" to make them live. Published pages accept form submissions through a public endpoint — no authentication required.' },
        ]
    },
    {
        id: 'automations',
        icon: 'bolt',
        color: '#f97316',
        title: 'Automation Engine',
        subtitle: 'Make your funnel self-running with WHEN → THEN rules',
        steps: [
            { icon: 'bolt', title: 'What Are Automation Rules?', description: 'Rules that automatically take action when events happen in your funnel. Each rule follows a WHEN (trigger) + IF (conditions) → THEN (actions) pattern. Navigate to the Engage tab → Automations to manage them.' },
            { icon: 'sensors', title: '7 Trigger Types', description: 'Rules can fire on: Entry Created, Stage Changed, Score Threshold (above/below), Inactivity (X days), Status Changed, Form Submitted, and Score Changed. Each trigger monitors real-time funnel events.' },
            { icon: 'checklist', title: 'Conditions (Filters)', description: 'Add optional conditions to ensure rules only apply to the right leads. Filter by score range, specific stage, source type, activity days, contact completeness, tags, and more. All conditions must match.' },
            { icon: 'arrow_forward', title: '10 Action Types', description: 'Actions include: Move to Stage, Change Status, Update Score (+/-), Add/Remove Tag, Start Nurture Sequence, Send Notification, Log Touchpoint, and Trigger Studio (cross-studio orchestration).' },
            { icon: 'auto_awesome', title: 'AI Auto-Generate Rules', description: 'Click "AI Generate" in the Automations view to have AI create 3-5 smart rules tailored to your funnel. Describe what you want (e.g. "auto-advance hot leads") or leave blank for smart defaults.' },
            { icon: 'play_arrow', title: 'Run All & Manual Trigger', description: 'Click "Run All" to manually execute all enabled rules across active entries. Rules also fire automatically when their trigger events occur — no manual action needed.' },
            { icon: 'toggle_on', title: 'Enable / Disable Rules', description: 'Toggle rules on or off with one click. Disabled rules won\'t fire on events. View execution history by expanding any rule card — see which leads were affected and what actions were taken.' },
        ]
    },
]

const PRO_TIPS = [
    { icon: '🧭', tip: 'Use the 4-tab navigation (Pipeline → Intelligence → Engage → Configure) to access all features without toolbar clutter.' },
    { icon: 'bar_chart', tip: 'Check the Command Center dashboard for quick metrics. The "What To Do Next" cards suggest AI-powered actions based on your funnel data.' },
    { icon: '🎯', tip: 'Start with a template, then customize stages in the Configure → Stage Builder tab. Templates give you best-practice stage flows.' },
    { icon: 'smart_toy', tip: 'Use AI Architect to create funnels, then AI Generate for nurture sequences, landing pages, and automation rules — all tailored to your brand.' },
    { icon: '🔥', tip: 'Look for green dots on Kanban cards — those are hot leads (score 70+). Prioritize them for maximum conversion.' },
    { icon: '💰', tip: 'Always add a Deal Value when creating leads. The ₹ badge on cards helps you prioritize high-value opportunities at a glance.' },
    { icon: '📧', tip: 'Every stage should have a Nurture Sequence (Engage tab → Nurture). Leads that receive timely follow-ups convert 2-3x better.' },
    { icon: 'link', tip: 'Connect stages to studios in the Configure → Stage Builder. This enables cross-studio workflows triggered by funnel events.' },
    { icon: '📱', tip: 'Use multi-channel nurture (DM + Email + WhatsApp) for 5x higher engagement vs. single-channel sequences.' },
    { icon: '⚡', tip: 'Use AI Auto-Generate automation rules (Engage → Automations). One click sets up smart rules for stage advancement, inactivity detection, and scoring.' },
    { icon: '⏰', tip: 'Watch the "last activity" timer on Kanban cards. Leads inactive for 3+ days need immediate attention — set up inactivity automation rules.' },
    { icon: 'trending_up', tip: 'Check Intelligence → Health weekly. Fix bottlenecks first — stages with 50%+ drop-off are the biggest leaks in your funnel.' },
]

function HelpDocumentationView({ onBack }) {
    const [expanded, setExpanded] = useState('getting-started')

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack}
                        className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">menu_book</span>
                            Funnel Studio Guide
                        </h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">Everything you need to build, manage, and optimize your sales funnels</p>
                    </div>
                </div>
            </div>

            {/* Quick Overview */}
            <div className="glass-panel rounded-2xl p-6 mb-6" style={{ background: 'var(--sys-primary)' }}>
                <h3 className="text-[var(--sys-text)] font-bold mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">info</span> What is Funnel Studio?
                </h3>
                <p className="text-[var(--sys-text-muted)] text-sm leading-relaxed mb-4">
                    Funnel Studio is your complete sales funnel management system. Start at the <strong className="text-[var(--sys-text)]">Command Center dashboard</strong> for an intelligence-first overview of all your funnels.
                    Open any funnel to access the <strong className="text-[var(--sys-text)]">tabbed pipeline view</strong> with 4 organized tabs:
                    <strong className="text-[var(--sys-text)]"> Pipeline</strong> (Kanban board with enhanced lead cards),
                    <strong className="text-[var(--sys-text)]"> Intelligence</strong> (health, analytics, forecasts, lead scoring),
                    <strong className="text-[var(--sys-text)]"> Engage</strong> (automations, nurture, landing pages, activity feed), and
                    <strong className="text-[var(--sys-text)]"> Configure</strong> (stage builder, webhooks).
                    Everything is connected to your Brand DNA, with <strong className="text-[var(--sys-text)]">Fidato AI</strong> available at every step.
                </p>
                <div className="flex flex-wrap gap-2">
                    {['Command Center', 'Tabbed Navigation', 'AI Architect', 'Kanban Pipeline', 'Score Rings', 'Deal Values', 'Automation Rules', 'Nurture Sequences', 'Lead Scoring', 'Landing Pages', 'Studio Links', 'Fidato AI'].map(tag => (
                        <span key={tag} className="px-3 py-1 rounded-full text-xs font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)]">{tag}</span>
                    ))}
                </div>
            </div>

            {/* Workflow Diagram */}
            <div className="glass-panel rounded-2xl p-5 mb-6">
                <h3 className="text-[var(--sys-text)] font-bold mb-4 text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">account_tree</span> Typical Workflow
                </h3>
                <div className="flex items-center gap-0 overflow-x-auto pb-2">
                    {[
                        { label: 'Dashboard', icon: 'hub', color: '#6366f1' },
                        { label: 'Create Funnel', icon: 'add_circle', color: '#8b5cf6' },
                        { label: 'Add Leads', icon: 'person_add', color: '#f59e0b' },
                        { label: 'Set Rules', icon: 'bolt', color: '#f97316' },
                        { label: 'Set Nurture', icon: 'mail', color: '#10b981' },
                        { label: 'Create Page', icon: 'web', color: '#a855f7' },
                        { label: 'Score Leads', icon: 'score', color: '#ef4444' },
                        { label: 'Check Health', icon: 'health_and_safety', color: '#06b6d4' },
                        { label: 'Convert! 🎉', icon: 'celebration', color: '#10b981' },
                    ].map((step, idx, arr) => (
                        <div key={step.label} className="flex items-center shrink-0">
                            <div className="flex flex-col items-center gap-1.5 w-20">
                                <div className="size-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${step.color}15` }}>
                                    <span className="material-symbols-outlined text-lg" style={{ color: step.color }}>{step.icon}</span>
                                </div>
                                <p className="text-xs text-[var(--sys-text-muted)] text-center leading-tight font-medium">{step.label}</p>
                            </div>
                            {idx < arr.length - 1 && (
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm mx-1 shrink-0">chevron_right</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Expandable Sections */}
            <div className="space-y-3 mb-6">
                {HELP_SECTIONS.map(section => (
                    <div key={section.id} className="glass-panel rounded-2xl overflow-hidden">
                        <button
                            onClick={() => setExpanded(expanded === section.id ? null : section.id)}
                            className="w-full flex items-center gap-3 p-5 text-left hover:bg-[var(--sys-surface)] transition-all cursor-pointer"
                        >
                            <div className="size-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${section.color}15` }}>
                                <span className="material-symbols-outlined" style={{ color: section.color }}>{section.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[var(--sys-text)] font-bold text-sm">{section.title}</p>
                                <p className="text-[var(--sys-text-muted)] text-xs">{section.subtitle}</p>
                            </div>
                            <span className="text-xs text-[var(--sys-text-muted)] font-bold mr-1">{section.steps.length} topics</span>
                            <span className={`material-symbols-outlined text-[var(--sys-text-muted)] transition-transform ${expanded === section.id ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        {expanded === section.id && (
                            <div className="px-5 pb-5 space-y-3 border-t border-[var(--sys-border)] pt-4">
                                {section.steps.map((step, idx) => (
                                    <div key={idx} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${section.color}10` }}>
                                                <span className="material-symbols-outlined text-sm" style={{ color: section.color }}>{step.icon}</span>
                                            </div>
                                            {idx < section.steps.length - 1 && <div className="w-px flex-1 mt-1" style={{ backgroundColor: `${section.color}20` }} />}
                                        </div>
                                        <div className="pb-3">
                                            <p className="text-[var(--sys-text)] font-bold text-sm mb-0.5">{step.title}</p>
                                            <p className="text-[var(--sys-text-muted)] text-xs leading-relaxed">{step.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Pro Tips */}
            <div className="glass-panel rounded-2xl p-6" style={{ background: 'var(--sys-primary)' }}>
                <h3 className="text-[var(--sys-text)] font-bold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">emoji_objects</span> Pro Tips for Maximum Conversions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {PRO_TIPS.map((tip, idx) => (
                        <div key={idx} className="flex gap-2.5 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                            <span className="text-lg shrink-0 mt-0.5">{tip.icon}</span>
                            <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed">{tip.tip}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* CTA */}
            <div className="text-center mt-6 py-6">
                <p className="text-[var(--sys-text-muted)] text-sm mb-3">Ready to get started?</p>
                <button onClick={onBack}
                    className="px-6 py-3 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] cursor-pointer hover:shadow-lg hover:shadow-none transition-all flex items-center gap-2 mx-auto">
                    <span className="material-symbols-outlined text-sm">rocket_launch</span> Go to Dashboard
                </button>
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// AUTOMATION VIEW — Agentic Rules Engine UI
// ═══════════════════════════════════════════════════════════════

const TRIGGER_TYPES = [
    { value: 'entry_created', label: 'Entry Created', icon: 'person_add', desc: 'When a new lead enters the funnel' },
    { value: 'stage_changed', label: 'Stage Changed', icon: 'swap_horiz', desc: 'When a lead moves to a new stage' },
    { value: 'score_threshold', label: 'Score Threshold', icon: 'speed', desc: 'When lead score crosses a threshold' },
    { value: 'inactivity', label: 'Inactivity', icon: 'hourglass_empty', desc: 'When a lead is inactive for X days' },
    { value: 'status_changed', label: 'Status Changed', icon: 'toggle_on', desc: 'When lead status changes' },
    { value: 'form_submitted', label: 'Form Submitted', icon: 'description', desc: 'When a landing page form is submitted' },
    { value: 'score_changed', label: 'Score Changed', icon: 'trending_up', desc: 'When lead score is updated' },
]

const ACTION_TYPES = [
    { value: 'move_stage', label: 'Move to Stage', icon: 'arrow_forward' },
    { value: 'change_status', label: 'Change Status', icon: 'toggle_on' },
    { value: 'update_score', label: 'Update Score', icon: 'speed' },
    { value: 'add_tag', label: 'Add Tag', icon: 'label' },
    { value: 'remove_tag', label: 'Remove Tag', icon: 'label_off' },
    { value: 'start_nurture', label: 'Start Nurture Sequence', icon: 'mail' },
    { value: 'send_notification', label: 'Send Notification', icon: 'notifications' },
    { value: 'add_touchpoint', label: 'Log Touchpoint', icon: 'touch_app' },
    { value: 'trigger_studio', label: 'Trigger Studio', icon: 'hub' },
]

function AutomationView({ funnel, rules, loading, running, generating, onBack, onRefresh, onCreate, onDelete, onToggle, onAIGenerate, onRunAll }) {
    const [showCreate, setShowCreate] = useState(false)
    const [aiPrompt, setAiPrompt] = useState('')
    const [showAiInput, setShowAiInput] = useState(false)
    const [expandedRule, setExpandedRule] = useState(null)

    // Create form state
    const [newRule, setNewRule] = useState({
        name: '', triggerType: 'entry_created', triggerConfig: {},
        conditions: [], actionType: 'move_stage', actionConfig: {},
    })

    const handleCreate = async () => {
        if (!newRule.name.trim()) return alert('Rule name is required')
        const trigger = { type: newRule.triggerType, ...newRule.triggerConfig }
        const actions = [{ type: newRule.actionType, ...newRule.actionConfig }]
        await onCreate({ funnelId: funnel._id, name: newRule.name, trigger, actions })
        setNewRule({ name: '', triggerType: 'entry_created', triggerConfig: {}, conditions: [], actionType: 'move_stage', actionConfig: {} })
        setShowCreate(false)
    }

    const handleAIGenerate = async () => {
        await onAIGenerate(aiPrompt)
        setAiPrompt('')
        setShowAiInput(false)
    }

    const enabledCount = rules.filter(r => r.enabled).length
    const totalExec = rules.reduce((s, r) => s + (r.executionCount || 0), 0)

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onBack}
                        className="size-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-[var(--sys-text)] font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-[var(--sys-primary)]">bolt</span> Automation Engine
                        </h2>
                        <p className="text-sm text-[var(--sys-text-muted)]">{enabledCount} active rules · {totalExec} total executions</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={onRefresh}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                    </button>
                    <button onClick={() => setShowAiInput(!showAiInput)}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-[#FF4D00] hover:text-[#FF7A00] bg-[#FF4D00]/[0.06] hover:bg-[#FF4D00]/[0.1] border border-[#FF4D00]/10 transition-all cursor-pointer flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Generate
                    </button>
                    <button onClick={onRunAll} disabled={running}
                        className="px-4 py-2 rounded-xl text-sm font-bold text-primary hover:text-[var(--sys-primary)] bg-[var(--sys-surface)]/[0.06] hover:bg-[var(--sys-surface)]/[0.1] border border-[var(--sys-border)] transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                        <span className={`material-symbols-outlined text-sm ${running ? 'animate-spin' : ''}`}>
                            {running ? 'progress_activity' : 'play_arrow'}
                        </span> {running ? 'Running...' : 'Run All'}
                    </button>
                    <button onClick={() => setShowCreate(!showCreate)}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold btn-primary flex items-center gap-1.5 cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span> New Rule
                    </button>
                </div>
            </div>

            {/* AI Generation Input */}
            {showAiInput && (
                <div className="glass-panel rounded-2xl p-5" style={{ background: 'var(--sys-primary)' }}>
                    <h3 className="text-[var(--sys-text)] font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#FF4D00]">auto_awesome</span>
                        AI Auto-Generate Rules
                    </h3>
                    <p className="text-xs text-[var(--sys-text-muted)] mb-3">Describe what you want to automate, or leave blank to get smart defaults.</p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="e.g. Auto-move hot leads to Decision stage, flag inactive leads after 7 days..."
                            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[#FF4D00]/30 transition-all"
                        />
                        <button onClick={handleAIGenerate} disabled={generating}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                            {generating ? (
                                <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Generating...</>
                            ) : (
                                <><span className="material-symbols-outlined text-sm">bolt</span> Generate Rules</>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Create Rule Form */}
            {showCreate && (
                <div className="glass-panel rounded-2xl p-6" style={{ background: 'var(--sys-primary)' }}>
                    <h3 className="text-[var(--sys-text)] font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--sys-primary)]">build</span> Create Automation Rule
                    </h3>
                    <div className="space-y-4">
                        {/* Name */}
                        <input
                            type="text"
                            value={newRule.name}
                            onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                            placeholder="Rule name (e.g. Hot Lead Auto-Advance)"
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all"
                        />

                        {/* Trigger */}
                        <div>
                            <label className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-2 block">When (Trigger)</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {TRIGGER_TYPES.map(t => (
                                    <button key={t.value} onClick={() => setNewRule({ ...newRule, triggerType: t.value, triggerConfig: {} })}
                                        className={`p-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left
                                            ${newRule.triggerType === t.value
                                                ? 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-[var(--sys-primary)]'
                                                : 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
                                        <span className="material-symbols-outlined text-sm block mb-1">{t.icon}</span>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            {/* Trigger config */}
                            {newRule.triggerType === 'stage_changed' && (
                                <div className="mt-3 flex gap-2">
                                    <select value={newRule.triggerConfig.toStage || ''} onChange={e => setNewRule({ ...newRule, triggerConfig: { ...newRule.triggerConfig, toStage: e.target.value } })}
                                        className="flex-1 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none">
                                        <option value="">Any stage</option>
                                        {funnel.stages?.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {newRule.triggerType === 'score_threshold' && (
                                <div className="mt-3 flex gap-2">
                                    <select value={newRule.triggerConfig.scoreDirection || 'above'} onChange={e => setNewRule({ ...newRule, triggerConfig: { ...newRule.triggerConfig, scoreDirection: e.target.value } })}
                                        className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none">
                                        <option value="above">Score Above</option>
                                        <option value="below">Score Below</option>
                                    </select>
                                    <input type="number" min="0" max="100" placeholder="Threshold" value={newRule.triggerConfig.scoreThreshold || ''}
                                        onChange={e => setNewRule({ ...newRule, triggerConfig: { ...newRule.triggerConfig, scoreThreshold: parseInt(e.target.value) } })}
                                        className="w-24 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                </div>
                            )}
                            {newRule.triggerType === 'inactivity' && (
                                <div className="mt-3 flex items-center gap-2">
                                    <span className="text-sm text-[var(--sys-text-muted)]">Inactive for</span>
                                    <input type="number" min="1" max="90" placeholder="7" value={newRule.triggerConfig.inactivityDays || ''}
                                        onChange={e => setNewRule({ ...newRule, triggerConfig: { ...newRule.triggerConfig, inactivityDays: parseInt(e.target.value) } })}
                                        className="w-20 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    <span className="text-sm text-[var(--sys-text-muted)]">days</span>
                                </div>
                            )}
                        </div>

                        {/* Action */}
                        <div>
                            <label className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-2 block">Then (Action)</label>
                            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                                {ACTION_TYPES.map(a => (
                                    <button key={a.value} onClick={() => setNewRule({ ...newRule, actionType: a.value, actionConfig: {} })}
                                        className={`p-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-left
                                            ${newRule.actionType === a.value
                                                ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-[var(--sys-primary)]'
                                                : 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
                                        <span className="material-symbols-outlined text-sm block mb-1">{a.icon}</span>
                                        {a.label}
                                    </button>
                                ))}
                            </div>
                            {/* Action config */}
                            {newRule.actionType === 'move_stage' && (
                                <select value={newRule.actionConfig.targetStage || ''} onChange={e => setNewRule({ ...newRule, actionConfig: { ...newRule.actionConfig, targetStage: e.target.value } })}
                                    className="mt-3 w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none">
                                    <option value="">Select target stage</option>
                                    {funnel.stages?.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                </select>
                            )}
                            {newRule.actionType === 'change_status' && (
                                <select value={newRule.actionConfig.targetStatus || ''} onChange={e => setNewRule({ ...newRule, actionConfig: { ...newRule.actionConfig, targetStatus: e.target.value } })}
                                    className="mt-3 w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none">
                                    <option value="">Select status</option>
                                    <option value="active">Active</option>
                                    <option value="converted">Converted</option>
                                    <option value="lost">Lost</option>
                                    <option value="paused">Paused</option>
                                </select>
                            )}
                            {newRule.actionType === 'update_score' && (
                                <input type="number" placeholder="Score change (+10 or -5)" value={newRule.actionConfig.scoreChange || ''}
                                    onChange={e => setNewRule({ ...newRule, actionConfig: { ...newRule.actionConfig, scoreChange: parseInt(e.target.value) } })}
                                    className="mt-3 w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                            )}
                            {(newRule.actionType === 'add_tag' || newRule.actionType === 'remove_tag') && (
                                <input type="text" placeholder="Tag name" value={newRule.actionConfig.tagName || ''}
                                    onChange={e => setNewRule({ ...newRule, actionConfig: { ...newRule.actionConfig, tagName: e.target.value } })}
                                    className="mt-3 w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                            )}
                            {newRule.actionType === 'send_notification' && (
                                <input type="text" placeholder="Notification message" value={newRule.actionConfig.notificationMessage || ''}
                                    onChange={e => setNewRule({ ...newRule, actionConfig: { ...newRule.actionConfig, notificationMessage: e.target.value } })}
                                    className="mt-3 w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                            )}
                        </div>

                        {/* Create Button */}
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">Cancel</button>
                            <button onClick={handleCreate}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] cursor-pointer flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm">bolt</span> Create Rule
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rules List */}
            {loading ? (
                <div className="text-center py-12">
                    <span className="material-symbols-outlined text-4xl text-[var(--sys-primary)] animate-spin">progress_activity</span>
                    <p className="text-[var(--sys-text-muted)] mt-3">Loading automations...</p>
                </div>
            ) : rules.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center">
                    <span className="material-symbols-outlined text-5xl text-[var(--sys-primary)] mb-4 block">bolt</span>
                    <h3 className="text-[var(--sys-text)] font-bold text-lg mb-2">No Automation Rules Yet</h3>
                    <p className="text-[var(--sys-text-muted)] text-sm mb-6 max-w-lg mx-auto">
                        Automation rules make your funnel self-running. Create rules to auto-move leads, update scores,
                        trigger nurture sequences, and more — all based on real-time behavior.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button onClick={() => setShowAiInput(true)}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] cursor-pointer flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">auto_awesome</span> AI Auto-Generate
                        </button>
                        <button onClick={() => setShowCreate(true)}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] cursor-pointer flex items-center gap-1.5 hover:bg-[var(--sys-surface)] transition-all">
                            <span className="material-symbols-outlined text-sm">add</span> Create Manually
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map(rule => {
                        const triggerInfo = TRIGGER_TYPES.find(t => t.value === rule.trigger?.type) || { label: rule.trigger?.type, icon: 'bolt' }
                        const isExpanded = expandedRule === rule._id

                        return (
                            <div key={rule._id} className={`glass-panel rounded-2xl overflow-hidden transition-all ${rule.enabled ? '' : 'opacity-50'}`}>
                                {/* Rule Header */}
                                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-[var(--sys-surface)] transition-all"
                                    onClick={() => setExpandedRule(isExpanded ? null : rule._id)}>
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="size-10 rounded-xl flex items-center justify-center" style={{ background: `${rule.color || '#f59e0b'}15` }}>
                                            <span className="material-symbols-outlined" style={{ color: rule.color || '#f59e0b', fontSize: '20px' }}>
                                                {rule.icon || 'bolt'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-[var(--sys-text)] font-bold text-sm truncate flex items-center gap-2">
                                                {rule.name}
                                                {rule.aiGenerated && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FF4D00]/20 text-[#FF7A00]">AI</span>
                                                )}
                                            </h4>
                                            <p className="text-xs text-[var(--sys-text-muted)] truncate">
                                                When <span className="text-[var(--sys-primary)]">{triggerInfo.label}</span>
                                                {' → '}
                                                <span className="text-[var(--sys-primary)]">{rule.actions?.length || 0} action{(rule.actions?.length || 0) !== 1 ? 's' : ''}</span>
                                                {rule.executionCount > 0 && (
                                                    <span className="ml-2 text-[var(--sys-text-muted)]">· {rule.executionCount} runs</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={(e) => { e.stopPropagation(); onToggle(rule._id) }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer
                                                ${rule.enabled
                                                    ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'
                                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                            {rule.enabled ? 'Active' : 'Paused'}
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(rule._id) }}
                                            className="size-8 rounded-lg flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                        <span className={`material-symbols-outlined text-[var(--sys-text-muted)] text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                            expand_more
                                        </span>
                                    </div>
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-[var(--sys-border)] p-4 space-y-4">
                                        {rule.description && (
                                            <p className="text-sm text-[var(--sys-text-muted)]">{rule.description}</p>
                                        )}

                                        {/* Trigger + Actions visual */}
                                        <div className="flex items-start gap-4">
                                            <div className="flex-1 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                <div className="text-xs text-[var(--sys-primary)] font-bold uppercase tracking-wider mb-1">Trigger</div>
                                                <div className="flex items-center gap-2 text-sm text-[var(--sys-text)]">
                                                    <span className="material-symbols-outlined text-[var(--sys-primary)] text-sm">{triggerInfo.icon}</span>
                                                    {triggerInfo.label}
                                                    {rule.trigger?.toStage && <span className="text-[var(--sys-text-muted)]">→ {rule.trigger.toStage}</span>}
                                                    {rule.trigger?.scoreThreshold && <span className="text-[var(--sys-text-muted)]">{rule.trigger.scoreDirection} {rule.trigger.scoreThreshold}</span>}
                                                    {rule.trigger?.inactivityDays && <span className="text-[var(--sys-text-muted)]">{rule.trigger.inactivityDays} days</span>}
                                                </div>
                                            </div>
                                            <span className="material-symbols-outlined text-[var(--sys-text-muted)] mt-3">arrow_forward</span>
                                            <div className="flex-1 p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                                <div className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Actions</div>
                                                {rule.actions?.map((a, i) => {
                                                    const aInfo = ACTION_TYPES.find(at => at.value === a.type) || { label: a.type, icon: 'bolt' }
                                                    return (
                                                        <div key={i} className="flex items-center gap-2 text-sm text-[var(--sys-text)] mb-1">
                                                            <span className="material-symbols-outlined text-primary text-sm">{aInfo.icon}</span>
                                                            {aInfo.label}
                                                            {a.targetStage && <span className="text-[var(--sys-text-muted)]">→ "{a.targetStage}"</span>}
                                                            {a.targetStatus && <span className="text-[var(--sys-text-muted)]">→ {a.targetStatus}</span>}
                                                            {a.scoreChange && <span className="text-[var(--sys-text-muted)]">{a.scoreChange > 0 ? '+' : ''}{a.scoreChange}</span>}
                                                            {a.tagName && <span className="text-[var(--sys-text-muted)]">"{a.tagName}"</span>}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>

                                        {/* Recent Executions */}
                                        {rule.recentExecutions?.length > 0 && (
                                            <div>
                                                <div className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-2">Recent Executions</div>
                                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                                    {rule.recentExecutions.slice(0, 5).map((ex, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-[var(--sys-surface)]">
                                                            <span className="material-symbols-outlined text-primary text-xs">check_circle</span>
                                                            <span className="text-[var(--sys-text)] font-medium">{ex.entryName}</span>
                                                            <span className="text-[var(--sys-text-muted)]">—</span>
                                                            <span className="text-[var(--sys-text-muted)] flex-1 truncate">{ex.actionsExecuted?.join(', ')}</span>
                                                            <span className="text-[var(--sys-text-muted)] text-[10px]">{new Date(ex.executedAt).toLocaleDateString()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* #1 Visual Workflow Builder */}
            <VisualWorkflowBuilder rules={rules} funnel={funnel} />

            {/* How It Works */}
            <div className="glass-panel rounded-2xl p-6" style={{ background: 'var(--sys-primary)' }}>
                <h3 className="text-[var(--sys-text)] font-bold text-sm mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--sys-primary)] text-sm">info</span>
                    How Automations Work
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                        { icon: 'sensors', title: 'Triggers Fire', desc: 'Rules auto-execute when events happen — entry created, stage moved, score changes, lead goes inactive' },
                        { icon: 'checklist', title: 'Conditions Check', desc: 'Optional filters ensure rules only apply to the right leads (score > 70, specific source, etc.)' },
                        { icon: 'bolt', title: 'Actions Execute', desc: 'Move stages, update scores, add tags, trigger nurture sequences — all automatically' },
                    ].map(item => (
                        <div key={item.title} className="flex gap-3">
                            <div className="size-9 rounded-xl bg-[var(--sys-surface)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[var(--sys-primary)] text-sm">{item.icon}</span>
                            </div>
                            <div>
                                <h4 className="text-[var(--sys-text)] text-xs font-bold mb-0.5">{item.title}</h4>
                                <p className="text-[11px] text-[var(--sys-text-muted)] leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// #10 REVENUE FORECAST VIEW
// ═══════════════════════════════════════════════════════════════
function RevenueForecastView({ forecast, funnel, onBack }) {
    if (!forecast) return <div className="text-center py-12 text-[var(--sys-text-muted)]">No forecast data available</div>

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer mb-2">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Pipeline
            </button>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Weighted Revenue', value: `$${(forecast.totalWeightedRevenue || 0).toLocaleString()}`, icon: 'account_balance', color: '#10b981' },
                    { label: 'Potential Revenue', value: `$${(forecast.totalPotentialRevenue || 0).toLocaleString()}`, icon: 'savings', color: '#6366f1' },
                    { label: '30-Day Projection', value: `$${(forecast.projected30Day || 0).toLocaleString()}`, icon: 'calendar_month', color: '#f59e0b' },
                    { label: '90-Day Projection', value: `$${(forecast.projected90Day || 0).toLocaleString()}`, icon: 'date_range', color: '#ef4444' },
                ].map(c => (
                    <div key={c.label} className="glass-panel rounded-2xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="size-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}15` }}>
                                <span className="material-symbols-outlined text-sm" style={{ color: c.color }}>{c.icon}</span>
                            </div>
                            <span className="text-xs text-[var(--sys-text-muted)]">{c.label}</span>
                        </div>
                        <p className="text-2xl font-bold text-[var(--sys-text)]">{c.value}</p>
                    </div>
                ))}
            </div>

            {/* Conversion Metrics */}
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-[var(--sys-text)] font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">insights</span>
                    Pipeline Metrics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-2xl font-bold text-[var(--sys-text)]">{forecast.totalEntries}</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Total Entries</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-2xl font-bold text-primary">{forecast.convertedEntries}</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Converted</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-2xl font-bold text-[#FF4D00]">{forecast.activeEntries}</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Active</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-2xl font-bold text-primary">{forecast.conversionRate}%</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Conversion Rate</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-2xl font-bold text-[var(--sys-text-muted)]">{forecast.avgConversionDays}d</p>
                        <p className="text-xs text-[var(--sys-text-muted)]">Avg Time to Convert</p>
                    </div>
                </div>
            </div>

            {/* Stage-by-Stage Forecast */}
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-[var(--sys-text)] font-bold text-sm mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">stacked_bar_chart</span>
                    Stage-by-Stage Forecast
                </h3>
                <div className="space-y-3">
                    {(forecast.stages || []).map(stage => (
                        <div key={stage.stage} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--sys-surface)]">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm text-[var(--sys-text)] font-bold truncate">{stage.stage}</span>
                                    <span className="text-xs text-[var(--sys-text-muted)]">{stage.activeEntries} entries</span>
                                </div>
                                <div className="h-2 rounded-full bg-[var(--sys-surface)] overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-500" style={{
                                        width: `${stage.probability}%`,
                                        backgroundColor: stage.color,
                                        opacity: 0.7,
                                    }} />
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs text-[var(--sys-text-muted)]">{stage.probability}% close probability</span>
                                    <span className="text-xs font-bold" style={{ color: stage.color }}>${stage.weightedRevenue.toLocaleString()} weighted</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// #12 ACTIVITY FEED VIEW
// ═══════════════════════════════════════════════════════════════
function ActivityFeedView({ feed, funnel, onBack, onRefresh }) {
    const typeIcons = {
        entry_created: 'person_add', stage_changed: 'swap_horiz', score_changed: 'speed',
        inactivity: 'schedule', form_submitted: 'assignment', touchpoint: 'touch_app',
    }
    const typeColors = {
        entry_created: '#10b981', stage_changed: '#6366f1', score_changed: '#f59e0b',
        inactivity: '#ef4444', form_submitted: '#8b5cf6', touchpoint: '#3b82f6',
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Pipeline
                </button>
                <button onClick={onRefresh}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#FF4D00] hover:text-[#FF7A00] bg-[#FF4D00]/10 hover:bg-[#FF4D00]/15 transition-all cursor-pointer flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">refresh</span> Refresh
                </button>
            </div>

            {feed.length === 0 ? (
                <div className="text-center py-16">
                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-2">dynamic_feed</span>
                    <p className="text-[var(--sys-text-muted)] text-sm">No activity yet. Actions, automations, and touchpoints will appear here.</p>
                </div>
            ) : (
                <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-[var(--sys-surface)]" />
                    <div className="space-y-1">
                        {feed.map((item, idx) => {
                            const icon = typeIcons[item.triggerType || item.touchpointType] || 'bolt'
                            const color = typeColors[item.triggerType || item.touchpointType] || '#64748b'
                            const time = item.executedAt ? new Date(item.executedAt).toLocaleString() : ''
                            return (
                                <div key={idx} className="flex items-start gap-4 pl-2 py-2 rounded-xl hover:bg-[var(--sys-surface)] transition-all">
                                    <div className="relative z-10 size-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                                        <span className="material-symbols-outlined text-xs" style={{ color }}>{icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm text-[var(--sys-text)] font-bold">{item.entryName || 'System'}</span>
                                            {item.ruleName && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-primary)]">{item.ruleName}</span>}
                                        </div>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-0.5">
                                            {item.actions?.join(', ') || item.action || 'Activity logged'}
                                        </p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">{time}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// #4 WEBHOOKS VIEW
// ═══════════════════════════════════════════════════════════════
function WebhooksView({ webhookData, funnel, onBack }) {
    const [copied, setCopied] = useState(null)
    const copyUrl = (key, url) => {
        const baseUrl = window.location.origin.replace(/:\d+$/, ':5001')
        navigator.clipboard.writeText(`${baseUrl}${url}`)
        setCopied(key)
        setTimeout(() => setCopied(null), 2000)
    }

    if (!webhookData) return <div className="text-center py-12 text-[var(--sys-text-muted)]">Loading webhook data...</div>

    const endpoints = webhookData.endpoints || {}

    return (
        <div className="space-y-6">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Pipeline
            </button>

            <div className="glass-panel rounded-2xl p-6" style={{ background: 'var(--sys-primary)' }}>
                <h3 className="text-[var(--sys-text)] font-bold text-sm mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">webhook</span>
                    Webhook Integration
                </h3>
                <p className="text-xs text-[var(--sys-text-muted)] mb-4">Connect external systems to automatically create funnel entries.</p>

                <div className="space-y-3">
                    {[
                        { key: 'generic', label: 'Generic Ingest', desc: 'Accept data from any source (Zapier, Make, custom)', icon: 'input', url: endpoints.generic },
                        { key: 'shopify', label: 'Shopify Orders', desc: 'Auto-capture orders and create customer entries', icon: 'shopping_cart', url: endpoints.shopify },
                        { key: 'stripe', label: 'Stripe Payments', desc: 'Track payment events and mark conversions', icon: 'credit_card', url: endpoints.stripe },
                    ].map(ep => (
                        <div key={ep.key} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-sm">{ep.icon}</span>
                                    <span className="text-sm text-[var(--sys-text)] font-bold">{ep.label}</span>
                                </div>
                                <button onClick={() => copyUrl(ep.key, ep.url)}
                                    className="px-3 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer">
                                    {copied === ep.key ? '✓ Copied!' : 'Copy URL'}
                                </button>
                            </div>
                            <p className="text-xs text-[var(--sys-text-muted)] mb-2">{ep.desc}</p>
                            <code className="block text-[11px] text-[var(--sys-text-muted)] bg-[var(--sys-surface)] rounded-lg p-2 overflow-x-auto font-mono">{ep.url}</code>
                        </div>
                    ))}
                </div>
            </div>

            {/* Payload Examples */}
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-[var(--sys-text)] font-bold text-sm mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">code</span>
                    Payload Examples
                </h3>
                <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-xs text-primary font-bold mb-1">POST Generic Ingest</p>
                        <pre className="text-[11px] text-[var(--sys-text-muted)] font-mono overflow-x-auto">{`{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "source": "referral",
  "dealValue": 5000,
  "tags": ["premium", "enterprise"],
  "metadata": { "event": "webinar_signup" }
}`}</pre>
                    </div>
                    <div className="p-3 rounded-xl bg-[var(--sys-surface)]">
                        <p className="text-xs text-primary font-bold mb-1">Shopify Header: X-Shopify-Topic</p>
                        <p className="text-[11px] text-[var(--sys-text-muted)] font-mono">orders/create, orders/paid, orders/fulfilled</p>
                    </div>
                </div>
            </div>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// #11 SHARED TEMPLATES VIEW
// ═══════════════════════════════════════════════════════════════
function SharedTemplatesView({ templates, funnels, brandId, onBack, onRefresh, onClone, onShare }) {
    useEffect(() => { onRefresh() }, [])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Dashboard
                </button>
            </div>

            {/* Share Your Funnels */}
            {funnels?.length > 0 && (
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="text-[var(--sys-text)] font-bold text-sm mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-sm">share</span>
                        Share Your Funnels
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {funnels.map(f => (
                            <div key={f._id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className="material-symbols-outlined text-primary text-sm">{f.icon || 'filter_alt'}</span>
                                    <span className="text-sm text-[var(--sys-text)] font-bold truncate">{f.name}</span>
                                </div>
                                <button onClick={() => onShare(f._id)}
                                    className="px-2 py-1 rounded text-xs font-bold text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                    {f.isShared ? '✓ Shared' : 'Share'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Browse Templates */}
            <div className="glass-panel rounded-2xl p-6">
                <h3 className="text-[var(--sys-text)] font-bold text-sm mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">storefront</span>
                    Community Templates
                </h3>
                {templates.length === 0 ? (
                    <div className="text-center py-8">
                        <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)] mb-2">store</span>
                        <p className="text-[var(--sys-text-muted)] text-sm">No shared templates yet. Be the first to share!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {templates.map(t => (
                            <div key={t._id} className="glass-panel rounded-xl p-4 hover:border-primary/20 transition-all">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="size-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${t.color || '#6366f1'}20` }}>
                                        <span className="material-symbols-outlined text-sm" style={{ color: t.color || '#6366f1' }}>{t.icon || 'filter_alt'}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-[var(--sys-text)] font-bold truncate">{t.name}</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">by {t.sharedBy} · {t.stages?.length || 0} stages</p>
                                    </div>
                                </div>
                                <p className="text-xs text-[var(--sys-text-muted)] mb-3 line-clamp-2">{t.shareDescription || t.description || 'No description'}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-[var(--sys-text-muted)]">{t.cloneCount || 0} clones</span>
                                    <button onClick={() => onClone(t._id)}
                                        className="px-3 py-1 rounded-lg text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer">
                                        Clone
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// #8 FIDATO AI FUNNEL SIDEBAR
// ═══════════════════════════════════════════════════════════════
function FidatoFunnelSidebar({ funnel, onClose, onScoreDecay, onPredictiveScore, onRunAutomations }) {
    const [fidatoInput, setFidatoInput] = useState('')
    const [fidatoMessages, setFidatoMessages] = useState([
        { role: 'assistant', text: `Hey! 👋 I'm Fidato, your AI funnel assistant for "${funnel.name}". Ask me anything or use the quick actions below!` }
    ])
    const [fidatoLoading, setFidatoLoading] = useState(false)

    const quickActions = [
        { label: '🔄 Run Score Decay', action: onScoreDecay, desc: 'Apply time-based score reduction to inactive leads' },
        { label: '🧠 Predictive Scoring', action: onPredictiveScore, desc: 'Re-score leads based on conversion patterns' },
        { label: '⚡ Run All Automations', action: onRunAutomations, desc: 'Execute all active automation rules now' },
    ]

    const sendMessage = async () => {
        if (!fidatoInput.trim()) return
        const msg = fidatoInput.trim()
        setFidatoInput('')
        setFidatoMessages(prev => [...prev, { role: 'user', text: msg }])
        setFidatoLoading(true)

        // Simple NL command recognition
        let response = 'I can help with that! Use the quick actions below, or navigate to the relevant tab for more options.'
        if (msg.toLowerCase().includes('score') && msg.toLowerCase().includes('decay')) {
            onScoreDecay()
            response = '✅ Score decay has been triggered! Inactive leads will have their scores adjusted.'
        } else if (msg.toLowerCase().includes('predictive') || msg.toLowerCase().includes('predict')) {
            onPredictiveScore()
            response = '🧠 Predictive scoring is running! Scores will be updated based on your conversion history.'
        } else if (msg.toLowerCase().includes('automat') || msg.toLowerCase().includes('rule')) {
            onRunAutomations()
            response = '⚡ All automation rules have been executed!'
        } else if (msg.toLowerCase().includes('help')) {
            response = 'I can help with:\n• Score decay — reduce scores of inactive leads\n• Predictive scoring — AI-powered lead scoring\n• Run automations — execute all rules\n• Revenue forecasting — check the Forecast tab\n• Webhooks — connect external tools\n\nJust ask naturally!'
        }

        setTimeout(() => {
            setFidatoMessages(prev => [...prev, { role: 'assistant', text: response }])
            setFidatoLoading(false)
        }, 500)
    }

    return (
        <div className="fixed right-0 top-0 bottom-0 w-96 bg-[var(--sys-surface)]/95 border-l border-[var(--sys-border)] z-50 flex flex-col shadow-2xl"
            style={{ animation: 'slideInRight 0.3s ease' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--sys-border)]">
                <div className="flex items-center gap-2">
                    <div className="size-8 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-sm">smart_toy</span>
                    </div>
                    <div>
                        <h3 className="text-[var(--sys-text)] font-bold text-sm">Fidato AI</h3>
                        <p className="text-[10px] text-[var(--sys-text-muted)]">Funnel Assistant</p>
                    </div>
                </div>
                <button onClick={onClose} className="size-7 rounded-lg flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm">close</span>
                </button>
            </div>

            {/* Quick Actions */}
            <div className="p-3 border-b border-[var(--sys-border)]">
                <p className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-wider mb-2 font-bold">Quick Actions</p>
                <div className="space-y-1">
                    {quickActions.map(qa => (
                        <button key={qa.label} onClick={async () => {
                            setFidatoMessages(prev => [...prev, { role: 'assistant', text: `Running: ${qa.label}...` }])
                            await qa.action()
                            setFidatoMessages(prev => [...prev, { role: 'assistant', text: ` ${qa.label} completed!` }])
                        }}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                            <span className="font-bold">{qa.label}</span>
                            <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">{qa.desc}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {fidatoMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs ${msg.role === 'user' ? 'bg-primary/20 text-white' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'}`}
                            style={{ whiteSpace: 'pre-line' }}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {fidatoLoading && (
                    <div className="flex justify-start">
                        <div className="px-3 py-2 rounded-xl text-xs bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">Thinking...</div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-[var(--sys-border)]">
                <div className="flex gap-2">
                    <input value={fidatoInput} onChange={e => setFidatoInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendMessage()}
                        placeholder="Ask Fidato anything..."
                        className="flex-1 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-xs text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/30" />
                    <button onClick={sendMessage}
                        className="size-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary hover:bg-primary/30 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">send</span>
                    </button>
                </div>
            </div>

            <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
        </div>
    )
}


// ═══════════════════════════════════════════════════════════════
// #1 VISUAL WORKFLOW BUILDER — Node/Edge view of automation rules
// ═══════════════════════════════════════════════════════════════
function VisualWorkflowBuilder({ rules, funnel }) {
    if (!rules || rules.length === 0) {
        return (
            <div className="text-center py-8">
                <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)] mb-2">account_tree</span>
                <p className="text-[var(--sys-text-muted)] text-sm">No automation rules yet. Create rules first to see the visual workflow.</p>
            </div>
        )
    }

    const triggerIcons = {
        entry_created: 'person_add', stage_changed: 'swap_horiz', score_changed: 'speed',
        status_changed: 'toggle_on', inactivity: 'schedule', form_submitted: 'assignment',
    }
    const actionIcons = {
        move_stage: 'swap_horiz', update_score: 'speed', change_status: 'toggle_on',
        add_tag: 'label', remove_tag: 'label_off', send_notification: 'notifications',
        trigger_nurture: 'mail', trigger_studio: 'dashboard', update_field: 'edit', log_activity: 'history',
    }

    return (
        <div className="space-y-6">
            <h3 className="text-[var(--sys-text)] font-bold text-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-sm">account_tree</span>
                Visual Workflow
            </h3>

            <div className="space-y-4">
                {rules.map(rule => (
                    <div key={rule._id} className="glass-panel rounded-2xl p-4" style={{ opacity: rule.active ? 1 : 0.5 }}>
                        <div className="flex items-center gap-2 mb-3">
                            <div className={`size-2 rounded-full ${rule.active ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-border)]'}`} />
                            <span className="text-sm text-[var(--sys-text)] font-bold">{rule.name}</span>
                            {!rule.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">Disabled</span>}
                        </div>

                        {/* Node flow: Trigger → Conditions → Actions */}
                        <div className="flex items-start gap-0 overflow-x-auto pb-2">
                            {/* Trigger Node */}
                            <div className="shrink-0 w-40">
                                <div className="rounded-xl p-3 bg-[#FF4D00]/10 border border-[#FF4D00]/20">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <span className="material-symbols-outlined text-[#FF4D00] text-xs">{triggerIcons[rule.trigger?.type] || 'sensors'}</span>
                                        <span className="text-[10px] text-[#FF4D00] font-bold uppercase">Trigger</span>
                                    </div>
                                    <p className="text-xs text-[var(--sys-text)] font-bold">{(rule.trigger?.type || '').replace(/_/g, ' ')}</p>
                                    {rule.trigger?.config?.stage && <p className="text-[10px] text-[var(--sys-text-muted)]">Stage: {rule.trigger.config.stage}</p>}
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center h-16 px-1 shrink-0">
                                <div className="w-6 h-px bg-[var(--sys-surface)]" />
                                <span className="material-symbols-outlined text-[var(--sys-text)]/30 text-xs">arrow_forward</span>
                            </div>

                            {/* Conditions Node (if any) */}
                            {rule.conditions?.length > 0 && (
                                <>
                                    <div className="shrink-0 w-40">
                                        <div className="rounded-xl p-3 bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className="material-symbols-outlined text-primary text-xs">checklist</span>
                                                <span className="text-[10px] text-primary font-bold uppercase">Conditions</span>
                                            </div>
                                            {rule.conditions.map((cond, i) => (
                                                <p key={i} className="text-[10px] text-[var(--sys-text-muted)]">{cond.field} {cond.operator} {cond.value}</p>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center h-16 px-1 shrink-0">
                                        <div className="w-6 h-px bg-[var(--sys-surface)]" />
                                        <span className="material-symbols-outlined text-[var(--sys-text)]/30 text-xs">arrow_forward</span>
                                    </div>
                                </>
                            )}

                            {/* Action Nodes — #6 Multi-Action support */}
                            <div className="flex gap-2 shrink-0">
                                {(rule.actions || []).map((action, i) => (
                                    <div key={i} className="w-40 rounded-xl p-3 bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="material-symbols-outlined text-primary text-xs">{actionIcons[action.type] || 'bolt'}</span>
                                            <span className="text-[10px] text-primary font-bold uppercase">Action {i + 1}</span>
                                        </div>
                                        <p className="text-xs text-[var(--sys-text)] font-bold">{(action.type || '').replace(/_/g, ' ')}</p>
                                        {action.config && Object.entries(action.config).slice(0, 2).map(([k, v]) => (
                                            <p key={k} className="text-[10px] text-[var(--sys-text-muted)]">{k}: {String(v)}</p>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Stats */}
                        {rule.executionCount > 0 && (
                            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[var(--sys-border)]">
                                <span className="text-[10px] text-[var(--sys-text-muted)]">Executed {rule.executionCount} times</span>
                                {rule.lastExecutedAt && <span className="text-[10px] text-[var(--sys-text-muted)]">Last: {new Date(rule.lastExecutedAt).toLocaleDateString()}</span>}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    )
}

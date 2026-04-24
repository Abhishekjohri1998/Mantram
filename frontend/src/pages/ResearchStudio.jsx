import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { researchStudio } from '../services/api'
import './ResearchStudio.css'

// ── Module definitions ────────────────────────────────────────────────────────
const MODULES = [
  {
    id: 'competitor',
    icon: 'radar',
    label: 'Competitor Intel',
    description: 'Pricing gaps, messaging angles, rival strategies',
    placeholder: 'e.g. What are my competitors doing on Instagram vs Meta Ads?',
  },
  {
    id: 'trends',
    icon: 'trending_up',
    label: 'Market Trends',
    description: 'Rising trends, seasonal hooks, behaviour shifts',
    placeholder: 'e.g. What are the top consumer trends in my category right now?',
  },
  {
    id: 'keywords',
    icon: 'key',
    label: 'Keyword & SEO Intel',
    description: 'Purchase-intent keywords, content gaps, SEO wins',
    placeholder: 'e.g. What keywords should I target on Amazon and Google?',
  },
  {
    id: 'ads',
    icon: 'ads_click',
    label: 'Ad Intelligence',
    description: 'Winning hooks, creative formats, CPL benchmarks',
    placeholder: 'e.g. What ad hooks are performing best for D2C brands like mine?',
  },
  {
    id: 'audience',
    icon: 'manage_accounts',
    label: 'Audience Intelligence',
    description: 'Customer language, pain points, purchase triggers',
    placeholder: 'e.g. What pain points is my target audience talking about online?',
  },
  {
    id: 'synthesis',
    icon: 'auto_awesome',
    label: 'Campaign Synthesis',
    description: 'All research into one complete campaign strategy',
    placeholder: 'e.g. Build a full campaign plan for my product launch next month.',
  },
]

const LOADING_STEPS = [
  { icon: 'search', text: 'Searching the web for live market data' },
  { icon: 'travel_explore', text: 'Analysing competitor strategies' },
  { icon: 'psychology', text: 'Processing brand DNA and context' },
  { icon: 'auto_awesome', text: 'Generating your intelligence report' },
]

const STUDIO_ICONS = {
  brainstorm: 'psychology',
  creative: 'auto_fix_high',
  content: 'edit_note',
  video: 'movie',
  social: 'share',
  performance: 'monitoring',
  ads: 'monitoring',
  seo: 'travel_explore',
}

export default function ResearchStudio() {
  const navigate = useNavigate()
  const { activeBrand } = useBrand()
  const [activeModule, setActiveModule] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  // Streaming state (Phase 2)
  const [streamStatus, setStreamStatus] = useState('')
  const [toolProgress, setToolProgress] = useState([]) // [{label, done}]
  const [tokenCount, setTokenCount] = useState(0)

  const inputRef = useRef(null)
  const abortRef = useRef(null)

  // Fetch history when brand changes or history drawer is opened
  const fetchHistory = async () => {
    if (!activeBrand) return
    setHistoryLoading(true)
    try {
      const res = await researchStudio.reports(activeBrand._id)
      if (res?.success) setHistory(res.reports || [])
    } catch (e) {
      console.error('Failed to fetch history:', e)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [activeBrand])

  useEffect(() => {
    if (showHistory) fetchHistory()
  }, [showHistory])

  const handleModuleSelect = (mod) => {
    setActiveModule(mod)
    setResult(null)
    setError(null)
    setQuery('')
    setSaved(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const handleRun = async () => {
    if (!activeModule) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSaved(false)
    setLoadingStep(0)
    setStreamStatus('🧠 Initialising research...')
    setToolProgress([])
    setTokenCount(0)

    // Get auth token for fetch (EventSource doesn't support headers)
    const token = localStorage.getItem('token') || sessionStorage.getItem('token')
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

    try {
      const response = await fetch(`${API_BASE}/api/research-studio/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          brand: activeBrand,
          module: activeModule.id,
          query,
        }),
        signal: AbortSignal.timeout(120000), // 2min hard timeout
      })

      if (!response.ok) {
        throw new Error(`Research failed: ${response.statusText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let localTokens = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === 'status') {
              setStreamStatus(event.message)
              setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1))
            } else if (event.type === 'tool_progress') {
              setToolProgress(prev => [
                ...prev.filter(t => t.label !== event.label),
                { label: event.label, done: true },
              ])
              setStreamStatus(`✅ ${event.label}`)
            } else if (event.type === 'token') {
              localTokens += (event.chunk || '').length
              setTokenCount(localTokens)
              setStreamStatus('✍️ Generating insights...')
            } else if (event.type === 'cached') {
              setResult(event.data)
              setStreamStatus('⚡ Served from cache')
            } else if (event.type === 'done') {
              if (event.data) {
                setResult(event.data)
              } else if (event.raw) {
                setError('Research completed but response had a formatting issue. Raw output available below.')
                setResult({ raw: event.raw })
              }
            } else if (event.type === 'error') {
              setError(event.message || 'Research failed. Please try again.')
            }
          } catch { /* skip malformed events */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        // Fallback: try the regular (non-streaming) endpoint
        try {
          const res = await researchStudio[activeModule.id]({ brand: activeBrand, query })
          if (res?.success && res?.data) {
            setResult(res.data)
          } else {
            setError(res?.error || 'Research failed. Please try again.')
          }
        } catch (fallbackErr) {
          setError(fallbackErr.message || 'Something went wrong.')
        }
      }
    } finally {
      setLoading(false)
      setStreamStatus('')
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await researchStudio.save({ brand: activeBrand, module: activeModule.id, data: result })
      if (res?.success) {
        setSaved(true)
      } else {
        setSaveError(res?.error || 'Save failed — please try again')
      }
    } catch (e) {
      setSaveError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleStudioAction = (action) => {
    const paths = {
      brainstorm: '/brainstorm',
      creative: '/creative-studio',
      content: '/content-studio',
      video: '/video-studio',
      social: '/social-media-studio',
      performance: '/performance-marketing',
      ads: '/performance-marketing',
      seo: '/seo-studio',
    }
    let targetStudio = action.studio?.toLowerCase()
    
    // Smart routing for older cached data or hallucinations
    const label = (action.label || '').toLowerCase()
    if (label.includes('ad ') || label.includes('ads') || label.includes('meta') || label.includes('funnel')) {
      targetStudio = 'performance'
    } else if (label.includes('reel') || label.includes('video') || label.includes('tiktok')) {
      targetStudio = 'video'
    } else if (label.includes('influencer') || label.includes('brief')) {
      targetStudio = 'brainstorm'
    } else if (label.includes('seo') || label.includes('keyword')) {
      targetStudio = 'seo'
    }

    const basePath = paths[targetStudio] || paths[action.studio] || '/creative-studio'
    // Pass strategy mode as query param so target studio can pre-select it
    const modeParam = action.mode ? `?mode=${encodeURIComponent(action.mode)}` : ''
    navigate(`${basePath}${modeParam}`)
  }

  const handleLoadReport = async (reportId) => {
    setLoading(true)
    setError(null)
    setResult(null)
    setShowHistory(false) // Close drawer
    
    try {
      const res = await researchStudio.getReport(reportId)
      if (res?.success && res.report?.researchData) {
        const data = res.report.researchData
        setResult(data)
        setSaved(true)
        // Automatically switch to the correct module tab
        const mod = MODULES.find(m => m.id === data.module)
        if (mod) setActiveModule(mod)
      } else {
        setError('Failed to load this report.')
      }
    } catch (e) {
      setError(e.message || 'Error loading report.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardLayout title="Research Studio" subtitle="Live market intelligence">
      <div className="rs-root">

        {/* ── Page header ── */}
        <div className="rs-header">
          <div className="rs-header-icon">
            <span className="material-symbols-outlined">manage_search</span>
          </div>
          <div>
            <h1 className="rs-title">Research Studio</h1>
            <p className="rs-subtitle">Live market intelligence — brand DNA + real-time web research</p>
          </div>
          {activeBrand && (
            <div className="rs-header-actions">
              <div className="rs-brand-chip">
                <span className="material-symbols-outlined">storefront</span>
                {activeBrand.name}
              </div>
              <button className="rs-history-btn" onClick={() => setShowHistory(true)}>
                <span className="material-symbols-outlined">history</span>
                History
              </button>
            </div>
          )}
        </div>

        {/* ── Body: sidebar + output ── */}
        <div className="rs-body">

          {/* Left: module selector */}
          <div className="rs-modules-col">
            <p className="rs-section-label">Select Module</p>
            <div className="rs-module-grid">
              {MODULES.map(mod => (
                <button
                  key={mod.id}
                  className={`rs-module-card${activeModule?.id === mod.id ? ' rs-module-card--active' : ''}`}
                  onClick={() => handleModuleSelect(mod)}
                >
                  <div className="rs-module-icon">
                    <span className="material-symbols-outlined">{mod.icon}</span>
                  </div>
                  <div className="rs-module-info">
                    <span className="rs-module-label">{mod.label}</span>
                    <span className="rs-module-desc">{mod.description}</span>
                  </div>
                  <span className="material-symbols-outlined rs-module-arrow">chevron_right</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: output panel */}
          <div className="rs-output-col">

            {/* Empty state */}
            {!activeModule && (
              <div className="rs-empty-state">
                <span className="material-symbols-outlined rs-empty-icon">manage_search</span>
                <h2>Select a research module</h2>
                <p>
                  Choose one of the 6 modules to run a live research query for{' '}
                  <strong>{activeBrand?.name || 'your brand'}</strong>.
                </p>
                <div className="rs-feature-chips">
                  {['Live web research', 'Brand DNA auto-loaded', 'Competitor scraping', 'Structured insights'].map(f => (
                    <span key={f} className="rs-feature-chip">
                      <span className="material-symbols-outlined">check</span>
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Input panel */}
            {activeModule && !result && !loading && (
              <div className="rs-input-panel">
                <div className="rs-input-header">
                  <div className="rs-input-icon">
                    <span className="material-symbols-outlined">{activeModule.icon}</span>
                  </div>
                  <div>
                    <h2 className="rs-input-title">{activeModule.label}</h2>
                    <p className="rs-input-desc">{activeModule.description}</p>
                  </div>
                </div>

                <div className="rs-query-box">
                  <label className="rs-query-label">
                    Focus query&nbsp;
                    <span className="rs-optional">(optional — brand context auto-loaded)</span>
                  </label>
                  <textarea
                    ref={inputRef}
                    className="rs-query-input"
                    placeholder={activeModule.placeholder}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    rows={3}
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleRun() }}
                  />
                  <p className="rs-query-hint">
                    <span className="material-symbols-outlined">info</span>
                    Brand DNA, products, and competitors are automatically included.
                  </p>
                </div>

                <button className="rs-run-btn" onClick={handleRun} disabled={!activeBrand}>
                  <span className="material-symbols-outlined">play_arrow</span>
                  Run Research
                </button>
                {!activeBrand && (
                  <p className="rs-no-brand">Select a brand from the top bar to continue</p>
                )}
              </div>
            )}

            {/* Loading — Real-time streaming progress */}
            {loading && (
              <div className="rs-loading">
                <div className="rs-loading-spinner" />

                {/* Live status message */}
                {streamStatus && (
                  <p className="rs-stream-status">{streamStatus}</p>
                )}

                {/* Tool progress chips — appear as each tool finishes */}
                {toolProgress.length > 0 && (
                  <div className="rs-tool-chips">
                    {toolProgress.map((t, i) => (
                      <span key={i} className="rs-tool-chip rs-tool-chip--done">
                        <span className="material-symbols-outlined">check_circle</span>
                        {t.label}
                      </span>
                    ))}
                  </div>
                )}

                {/* Token counter — shows generation is happening */}
                {tokenCount > 0 && (
                  <p className="rs-token-counter">
                    <span className="material-symbols-outlined">edit</span>
                    {Math.round(tokenCount / 4)} words generated...
                  </p>
                )}

                {/* Classic step indicators (fallback visual progress) */}
                <div className="rs-loading-steps">
                  {LOADING_STEPS.map((step, i) => (
                    <div
                      key={i}
                      className={[
                        'rs-loading-step',
                        i <= loadingStep ? 'rs-loading-step--active' : '',
                        i < loadingStep ? 'rs-loading-step--done' : '',
                      ].join(' ').trim()}
                    >
                      <span className="material-symbols-outlined">{step.icon}</span>
                      <span>{step.text}</span>
                    </div>
                  ))}
                </div>
                <p className="rs-loading-note">Live results will appear as they're generated.</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="rs-error">
                <span className="material-symbols-outlined">error_outline</span>
                <p>{error}</p>
                <button className="rs-retry-btn" onClick={handleRun}>Retry</button>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="rs-result">

                {/* Result header */}
                <div className="rs-result-header">
                  <div className="rs-result-icon">
                    <span className="material-symbols-outlined">{activeModule.icon}</span>
                  </div>
                  <div className="rs-result-meta">
                    <h2>{activeModule.label} — {result.brand || activeBrand?.name}</h2>
                    <span className="rs-result-time">
                      {result.generatedAt
                        ? new Date(result.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                        : 'Just now'}
                    </span>
                  </div>
                  <div className="rs-result-actions-top">
                    <button className="rs-save-btn" onClick={handleSave} disabled={saving || saved}>
                      <span className="material-symbols-outlined">{saved ? 'check' : 'bookmark'}</span>
                      {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
                    </button>
                    <button className="rs-new-btn" onClick={() => { setResult(null); setQuery('') }}>
                      <span className="material-symbols-outlined">refresh</span>
                      New
                    </button>
                  </div>
                </div>

                {/* Save error */}
                {saveError && (
                  <div className="rs-save-error">
                    <span className="material-symbols-outlined">error_outline</span>
                    {saveError}
                  </div>
                )}

                {/* Synthesis: prominent Launch Plan CTA */}
                {activeModule?.id === 'synthesis' && result.studioActions?.length > 0 && (
                  <div className="rs-launch-banner">
                    <div className="rs-launch-banner-text">
                      <span className="material-symbols-outlined">rocket_launch</span>
                      <span>Strategy ready. Move this into a studio.</span>
                    </div>
                    <div className="rs-launch-btns">
                      {result.studioActions.map((action, i) => (
                        <button key={i} className={`rs-launch-btn${i === 0 ? ' rs-launch-btn--primary' : ''}`}
                          onClick={() => handleStudioAction(action)}>
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}


                {(result.strategicThesis || result.campaignTitle) && (
                  <div className="rs-thesis-card">
                    {result.campaignTitle && (
                      <h3 className="rs-campaign-title">{result.campaignTitle}</h3>
                    )}
                    {result.strategicThesis && <p>{result.strategicThesis}</p>}
                  </div>
                )}

                {/* Sections */}
                {result.sections?.length > 0 && (
                  <div className="rs-sections">
                    {result.sections.map((sec, i) => (
                      <div key={i} className="rs-section-card">
                        <h3 className="rs-section-title">
                          <span className="rs-section-num">{i + 1}</span>
                          {sec.title}
                        </h3>
                        <ul className="rs-findings">
                          {sec.findings?.map((f, j) => (
                            <li key={j}>
                              <span className="material-symbols-outlined">arrow_right</span>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>
                        {sec.soWhat && (
                          <div className="rs-so-what">
                            <span className="material-symbols-outlined">lightbulb</span>
                            <p><strong>So what?</strong> {sec.soWhat}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Execution Plan */}
                {result.executionPlan?.length > 0 && (
                  <div className="rs-exec-plan">
                    <h3 className="rs-block-title">
                      <span className="material-symbols-outlined">calendar_month</span>
                      Execution Plan
                    </h3>
                    <div className="rs-phases">
                      {result.executionPlan.map((phase, i) => (
                        <div key={i} className="rs-phase-card">
                          <div className="rs-phase-header">
                            <span className="rs-phase-num">{i + 1}</span>
                            <div>
                              <strong>{phase.phase}</strong>
                              <span className="rs-phase-dur">{phase.duration}</span>
                            </div>
                          </div>
                          <ul className="rs-phase-actions">
                            {phase.actions?.map((a, j) => (
                              <li key={j}>
                                <span className="material-symbols-outlined">subdirectory_arrow_right</span>
                                {a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Wins */}
                {result.quickWins?.length > 0 && (
                  <div className="rs-quick-wins">
                    <h3 className="rs-block-title">
                      <span className="material-symbols-outlined">bolt</span>
                      Quick Wins — Do This Week
                    </h3>
                    <div className="rs-wins-grid">
                      {result.quickWins.map((win, i) => (
                        <div key={i} className="rs-win-card">
                          <span className="rs-win-num">{i + 1}</span>
                          <p>{win}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Metrics */}
                {result.keyMetrics?.length > 0 && (
                  <div className="rs-metrics">
                    <h3 className="rs-block-title">
                      <span className="material-symbols-outlined">monitoring</span>
                      Key Metrics
                    </h3>
                    <div className="rs-metrics-grid">
                      {result.keyMetrics.map((m, i) => (
                        <span key={i} className="rs-metric-chip">
                          <span className="material-symbols-outlined">bar_chart</span>
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Studio Actions */}
                {result.studioActions?.length > 0 && (
                  <div className="rs-studio-actions">
                    <h3 className="rs-block-title">
                      <span className="material-symbols-outlined">open_in_new</span>
                      Take Action
                    </h3>
                    <div className="rs-action-btns">
                      {result.studioActions.map((action, i) => (
                        <button key={i} className="rs-action-btn" onClick={() => handleStudioAction(action)}>
                          <span className="material-symbols-outlined">
                            {STUDIO_ICONS[action.studio] || 'launch'}
                          </span>
                          {action.label}
                          <span className="material-symbols-outlined rs-action-arrow">arrow_forward</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>

        {/* ── History Drawer ── */}
        <div 
          className={`rs-history-overlay ${showHistory ? 'rs-history-overlay--open' : ''}`}
          onClick={() => setShowHistory(false)}
        />
        <div className={`rs-history-drawer ${showHistory ? 'rs-history-drawer--open' : ''}`}>
          <div className="rs-history-header">
            <h2><span className="material-symbols-outlined">history</span> Saved Research</h2>
            <button className="rs-close-history" onClick={() => setShowHistory(false)}>
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          
          <div className="rs-history-content">
            {historyLoading ? (
              <div className="rs-history-loading" />
            ) : history.length === 0 ? (
              <div className="rs-history-empty">
                <span className="material-symbols-outlined">folder_open</span>
                <p>No saved research yet</p>
              </div>
            ) : (
              history.map(report => {
                const mod = MODULES.find(m => m.id === report.researchModule) || MODULES[0]
                return (
                  <div key={report._id} className="rs-history-card" onClick={() => handleLoadReport(report._id)}>
                    <div className="rs-history-card-header">
                      <h4 className="rs-history-card-title">{report.title}</h4>
                      <span className="material-symbols-outlined rs-history-card-icon">{mod.icon}</span>
                    </div>
                    <div className="rs-history-card-meta">
                      <span className="rs-history-card-module">{mod.label}</span>
                      <span>{new Date(report.generatedAt || report.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

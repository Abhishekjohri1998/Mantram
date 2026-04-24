import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBrand } from '../context/BrandContext'
import { researchStudio } from '../services/api'
import './ResearchStudio.css'

const MODULES = [
  {
    id: 'competitor',
    icon: 'radar',
    label: 'Competitor Intel',
    description: 'Pricing gaps, messaging angles, and what your rivals are doing that you aren\'t.',
    color: '#ef4444',
    gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    placeholder: 'e.g. What are my top 3 competitors doing on Instagram vs Meta Ads?',
  },
  {
    id: 'trends',
    icon: 'trending_up',
    label: 'Market Trends',
    description: 'Rising and declining trends, seasonal hooks, and consumer behaviour shifts.',
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    placeholder: 'e.g. What are the top consumer trends in my category right now?',
  },
  {
    id: 'keywords',
    icon: 'key',
    label: 'Keyword & SEO Intel',
    description: 'Purchase-intent keywords you\'re missing, competitor keyword gaps, content opportunities.',
    color: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    placeholder: 'e.g. What keywords should I target on Amazon and Google for my category?',
  },
  {
    id: 'ads',
    icon: 'ads_click',
    label: 'Ad Intelligence',
    description: 'Winning hooks, creative formats, CPL benchmarks, and landing page strategies.',
    color: '#6366f1',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    placeholder: 'e.g. What ad hooks and formats are performing best for D2C brands like mine?',
  },
  {
    id: 'audience',
    icon: 'group_search',
    label: 'Audience Intelligence',
    description: 'Real customer language, pain points, unmet desires, and purchase triggers from communities.',
    color: '#ec4899',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    placeholder: 'e.g. What are the biggest pain points my target audience is talking about online?',
  },
  {
    id: 'synthesis',
    icon: 'auto_awesome',
    label: 'Campaign Synthesis',
    description: 'All research synthesised into one complete, brand-specific campaign strategy.',
    color: '#8b5cf6',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    placeholder: 'e.g. I want to launch a new product in the next 30 days. Build me a full campaign plan.',
  },
]

const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }

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
  const [savedReports, setSavedReports] = useState([])
  const [loadingStep, setLoadingStep] = useState(0)
  const inputRef = useRef(null)

  const LOADING_STEPS = [
    { icon: 'search', text: 'Searching the web for live market data…' },
    { icon: 'travel_explore', text: 'Analysing competitor strategies…' },
    { icon: 'psychology', text: 'Processing brand DNA and context…' },
    { icon: 'auto_awesome', text: 'Generating your intelligence report…' },
  ]

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

    // Animate loading steps
    const stepInterval = setInterval(() => {
      setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 2500)

    try {
      const res = await researchStudio[activeModule.id]({ brand: activeBrand, query })
      clearInterval(stepInterval)
      if (res?.success && res?.data) {
        setResult(res.data)
      } else {
        setError(res?.error || 'Research failed. Please try again.')
      }
    } catch (e) {
      clearInterval(stepInterval)
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!result) return
    setSaving(true)
    try {
      await researchStudio.save({ brand: activeBrand, module: activeModule.id, data: result })
      setSaved(true)
    } catch (_) {}
    setSaving(false)
  }

  const handleStudioAction = (action) => {
    if (action.studio === 'brainstorm') navigate('/brainstorm')
    else if (action.studio === 'creative') navigate('/creative-studio')
    else if (action.studio === 'content') navigate('/content-studio')
    else if (action.studio === 'video') navigate('/video-studio')
  }

  return (
    <div className="rs-root">
      {/* Header */}
      <div className="rs-header">
        <div className="rs-header-icon"><span className="material-icons">manage_search</span></div>
        <div>
          <h1 className="rs-title">Research Studio</h1>
          <p className="rs-subtitle">Live market intelligence powered by real-time web research + Brand DNA</p>
        </div>
        {activeBrand && (
          <div className="rs-brand-chip">
            <span className="material-icons" style={{ fontSize: 16 }}>storefront</span>
            {activeBrand.name}
          </div>
        )}
      </div>

      <div className="rs-body">
        {/* Module Grid */}
        <div className="rs-modules-col">
          <p className="rs-section-label">SELECT A RESEARCH MODULE</p>
          <div className="rs-module-grid">
            {MODULES.map(mod => (
              <button
                key={mod.id}
                className={`rs-module-card ${activeModule?.id === mod.id ? 'rs-module-card--active' : ''}`}
                onClick={() => handleModuleSelect(mod)}
                style={{ '--accent': mod.color }}
              >
                <div className="rs-module-icon" style={{ background: mod.gradient }}>
                  <span className="material-icons">{mod.icon}</span>
                </div>
                <div className="rs-module-info">
                  <span className="rs-module-label">{mod.label}</span>
                  <span className="rs-module-desc">{mod.description}</span>
                </div>
                <span className="material-icons rs-module-arrow">chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div className="rs-output-col">
          {!activeModule && (
            <div className="rs-empty-state">
              <span className="material-icons rs-empty-icon">manage_search</span>
              <h2>Pick a research module</h2>
              <p>Select one of the 6 modules on the left to run a live research query for <strong>{activeBrand?.name || 'your brand'}</strong>.</p>
              <div className="rs-feature-chips">
                {['Live web research', 'Competitor scraping', 'Brand DNA injection', 'Structured insights'].map(f => (
                  <span key={f} className="rs-feature-chip"><span className="material-icons">check_circle</span>{f}</span>
                ))}
              </div>
            </div>
          )}

          {activeModule && !result && !loading && (
            <div className="rs-input-panel">
              <div className="rs-input-header">
                <div className="rs-input-icon" style={{ background: activeModule.gradient }}>
                  <span className="material-icons">{activeModule.icon}</span>
                </div>
                <div>
                  <h2 className="rs-input-title">{activeModule.label}</h2>
                  <p className="rs-input-desc">{activeModule.description}</p>
                </div>
              </div>

              <div className="rs-query-box">
                <label className="rs-query-label">What do you want to research? <span className="rs-optional">(optional — brand context is auto-loaded)</span></label>
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
                  <span className="material-icons" style={{ fontSize: 14 }}>auto_fix_high</span>
                  Brand DNA, products, and competitors are automatically included.
                </p>
              </div>

              <button className="rs-run-btn" onClick={handleRun} disabled={!activeBrand}>
                <span className="material-icons">rocket_launch</span>
                Run Deep Research
              </button>
              {!activeBrand && <p className="rs-no-brand">Please select a brand first</p>}
            </div>
          )}

          {loading && (
            <div className="rs-loading">
              <div className="rs-loading-spinner" />
              <div className="rs-loading-steps">
                {LOADING_STEPS.map((step, i) => (
                  <div key={i} className={`rs-loading-step ${i <= loadingStep ? 'rs-loading-step--active' : ''} ${i < loadingStep ? 'rs-loading-step--done' : ''}`}>
                    <span className="material-icons">{i < loadingStep ? 'check_circle' : step.icon}</span>
                    <span>{step.text}</span>
                  </div>
                ))}
              </div>
              <p className="rs-loading-note">Deep research takes 30–60 seconds. Don't close this tab.</p>
            </div>
          )}

          {error && !loading && (
            <div className="rs-error">
              <span className="material-icons">error_outline</span>
              <p>{error}</p>
              <button className="rs-retry-btn" onClick={handleRun}>Try Again</button>
            </div>
          )}

          {result && !loading && (
            <div className="rs-result">
              {/* Result header */}
              <div className="rs-result-header">
                <div className="rs-result-icon" style={{ background: activeModule.gradient }}>
                  <span className="material-icons">{activeModule.icon}</span>
                </div>
                <div className="rs-result-meta">
                  <h2>{activeModule.label} — {result.brand || activeBrand?.name}</h2>
                  <span className="rs-result-time">Generated {new Date(result.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="rs-result-actions-top">
                  <button className="rs-save-btn" onClick={handleSave} disabled={saving || saved}>
                    <span className="material-icons">{saved ? 'check_circle' : 'bookmark'}</span>
                    {saved ? 'Saved!' : saving ? 'Saving…' : 'Save to Library'}
                  </button>
                  <button className="rs-new-btn" onClick={() => { setResult(null); setQuery('') }}>
                    <span className="material-icons">refresh</span>New Query
                  </button>
                </div>
              </div>

              {/* Strategic thesis (synthesis only) */}
              {(result.strategicThesis || result.campaignTitle) && (
                <div className="rs-thesis-card">
                  {result.campaignTitle && <h3 className="rs-campaign-title">🎯 {result.campaignTitle}</h3>}
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
                          <li key={j}><span className="material-icons">arrow_right</span><span>{f}</span></li>
                        ))}
                      </ul>
                      {sec.soWhat && (
                        <div className="rs-so-what">
                          <span className="material-icons">lightbulb</span>
                          <p><strong>So what?</strong> {sec.soWhat}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Execution Plan (synthesis) */}
              {result.executionPlan?.length > 0 && (
                <div className="rs-exec-plan">
                  <h3 className="rs-block-title"><span className="material-icons">calendar_month</span>Execution Plan</h3>
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
                            <li key={j}><span className="material-icons">check</span>{a}</li>
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
                  <h3 className="rs-block-title"><span className="material-icons">bolt</span>Quick Wins — Do This Week</h3>
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

              {/* Key Metrics (synthesis) */}
              {result.keyMetrics?.length > 0 && (
                <div className="rs-metrics">
                  <h3 className="rs-block-title"><span className="material-icons">monitoring</span>Key Metrics to Track</h3>
                  <div className="rs-metrics-grid">
                    {result.keyMetrics.map((m, i) => (
                      <div key={i} className="rs-metric-chip"><span className="material-icons">bar_chart</span>{m}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Studio Actions */}
              {result.studioActions?.length > 0 && (
                <div className="rs-studio-actions">
                  <h3 className="rs-block-title"><span className="material-icons">open_in_new</span>Take Action in Mantram Studios</h3>
                  <div className="rs-action-btns">
                    {result.studioActions.map((action, i) => (
                      <button key={i} className="rs-action-btn" onClick={() => handleStudioAction(action)}>
                        <span className="material-icons">{
                          action.studio === 'creative' ? 'auto_fix_high' :
                          action.studio === 'content' ? 'edit_note' :
                          action.studio === 'video' ? 'movie' : 'psychology'
                        }</span>
                        {action.label}
                        <span className="material-icons rs-action-arrow">arrow_forward</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

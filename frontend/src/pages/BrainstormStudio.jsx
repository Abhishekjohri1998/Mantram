import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import FormattedText from '../components/FormattedText'
import { brainstormStudio as bsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'
import Walkthrough from '../components/Walkthrough'

// ── Topic quick-starts ────────────────────────────────────────────────────────
const TOPICS = [
  { id: 'ad-film',        icon: 'movie', label: 'Ad Film',        hint: "let's make an ad film" },
  { id: 'campaign',       icon: 'campaign', label: 'Campaign',       hint: "help me plan a marketing campaign" },
  { id: 'product-launch', icon: 'rocket_launch', label: 'Product Launch', hint: "I'm launching a new product" },
  { id: 'naming',         icon: 'sell',  label: 'Naming',         hint: "I need help naming something" },
  { id: 'brand-strategy', icon: 'trending_up', label: 'Brand Strategy', hint: "let's build a brand strategy" },
  { id: 'festival',       icon: 'festival', label: 'Festival',       hint: "I want a festival campaign" },
  { id: 'offer',          icon: 'payments', label: 'Offer Strategy', hint: "help me design an offer" },
  { id: 'custom',         icon: 'lightbulb', label: 'Something Else', hint: "I have an idea I want to brainstorm" },
]

const SCORE_KEYS_FILM = [
  { key: 'virality',         label: 'Virality',      color: '#f97316' },
  { key: 'emotionalConnect', label: 'Emotional',     color: '#ec4899' },
  { key: 'brandRecall',      label: 'Brand Recall',  color: '#8b5cf6' },
  { key: 'easeOfProduction', label: 'Producibility', color: '#06b6d4' },
]
const SCORE_KEYS_CAMP = [
  { key: 'virality',         label: 'Virality',     color: '#f97316' },
  { key: 'salesImpact',      label: 'Sales Impact', color: '#22c55e' },
  { key: 'emotionalConnect', label: 'Emotional',    color: '#ec4899' },
  { key: 'easeOfExecution',  label: 'Ease',         color: '#06b6d4' },
]

// ── Phase labels ──────────────────────────────────────────────────────────────
const PHASES = {
  explore:   { label: 'Exploring',  icon: 'search', color: '#8b5cf6' },
  ideate:    { label: 'Ideating',   icon: 'emoji_objects', color: '#f59e0b' },
  deepdive:  { label: 'Deep Dive',  icon: 'biotech', color: '#06b6d4' },
  calendar:  { label: 'Calendar',   icon: 'calendar_month', color: '#10b981' },
  deliver:   { label: 'Delivered',  icon: 'ads_click', color: '#22c55e' },
}

// ── Thinking dots ─────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div className="bs-thinking">
      <span />
      <span />
      <span />
    </div>
  )
}

// ── Reasoning Panel (Deep Research style) ─────────────────────────────────────
function ReasoningPanel({ steps, citations, visible }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!visible || steps.length === 0) return null

  return (
    <div className={`bs-reasoning-panel ${collapsed ? 'collapsed' : ''}`}>
      <button className="bs-reasoning-toggle" onClick={() => setCollapsed(c => !c)}>
        <span className="bs-reasoning-icon"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">psychology</span></span>
        <span className="bs-reasoning-title">Fidato is thinking...</span>
        <span className="bs-reasoning-count">{steps.length} steps</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          {collapsed ? 'expand_more' : 'expand_less'}
        </span>
      </button>

      {!collapsed && (
        <div className="bs-reasoning-steps">
          {steps.map((s, i) => (
            <div key={i} className="bs-reasoning-step" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="bs-step-icon">{s.icon}</span>
              <span className="bs-step-text">{s.text}</span>
              {i === steps.length - 1 && (
                <span className="bs-step-pulse" />
              )}
            </div>
          ))}

          {citations.length > 0 && (
            <div className="bs-citations">
              <div className="bs-citations-label"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">link</span> Sources</div>
              <div className="bs-citations-list">
                {citations.map((c, i) => (
                  <a key={i} className="bs-citation-chip" href={c.url || c.uri || '#'}
                    target="_blank" rel="noopener noreferrer" title={c.title || c.url}>
                    {c.title || c.url || `Source ${i + 1}`}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Feedback toast ────────────────────────────────────────────────────────────
function FeedbackToast({ message, visible }) {
  if (!visible) return null
  return (
    <div className="bs-feedback-toast">
      {message}
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────
function MiniScore({ label, value, color }) {
  return (
    <div className="bs-score-row">
      <span className="bs-score-label">{label}</span>
      <div className="bs-score-track">
        <div className="bs-score-fill" style={{ width: `${(value || 0) * 10}%`, background: color }} />
      </div>
      <span className="bs-score-val" style={{ color }}>{value || 0}</span>
    </div>
  )
}

// ── Concept card (inside chat) ────────────────────────────────────────────────
function ConceptCard({ concept, index, isFilm, onScreenplay, onFeedback, onDeepDive }) {
  const [expanded, setExpanded] = useState(false)
  const scoreKeys = isFilm ? SCORE_KEYS_FILM : SCORE_KEYS_CAMP
  const scores = concept.scores || {}
  const avg = scoreKeys.length
    ? Math.round(scoreKeys.reduce((s, k) => s + (scores[k.key] || 0), 0) / scoreKeys.length)
    : 0

  return (
    <div className="bs-concept-card" style={{ animationDelay: `${index * 120}ms` }}>
      <div className="bs-concept-header">
        <div className="bs-concept-badge">{isFilm ? `Film ${index + 1}` : `Concept ${index + 1}`}</div>
        <div className="bs-concept-avg">{avg}/10</div>
        <div className="bs-concept-actions">
          <button className="bs-icon-btn" onClick={() => onFeedback?.(concept, 'like')} title="Love it">👍</button>
          <button className="bs-icon-btn" onClick={() => onFeedback?.(concept, 'dislike')} title="Not for me">👎</button>
        </div>
      </div>

      <h4 className="bs-concept-title">{concept.title}</h4>
      {(concept.logline || concept.hook) && (
        <p className="bs-concept-logline">"{concept.logline || concept.hook}"</p>
      )}

      <div className="bs-scores">
        {scoreKeys.map(sk => (
          <MiniScore key={sk.key} label={sk.label} value={scores[sk.key]} color={sk.color} />
        ))}
      </div>

      {(concept.emotion || concept.format || concept.visualDirection || concept.targetPersona) && (
        <div className="bs-concept-tags">
          {concept.emotion && <span className="bs-tag bs-tag-rose">{concept.emotion}</span>}
          {concept.format && <span className="bs-tag bs-tag-blue">{concept.format}</span>}
          {(concept.visualStyle || concept.visualDirection) && (
            <span className="bs-tag bs-tag-purple">{concept.visualStyle || concept.visualDirection}</span>
          )}
          {concept.targetPersona && <span className="bs-tag bs-tag-amber">{concept.targetPersona}</span>}
        </div>
      )}

      {expanded && (
        <div className="bs-concept-expanded">
          {concept.synopsis && <p className="bs-concept-synopsis">{concept.synopsis}</p>}
          {concept.openingShot && (
            <div className="bs-concept-shot">
              <span className="bs-shot-label">OPEN →</span> {concept.openingShot}
            </div>
          )}
          {concept.closingShot && (
            <div className="bs-concept-shot">
              <span className="bs-shot-label">CLOSE →</span> {concept.closingShot}
            </div>
          )}
          {concept.castSuggestion && (
            <div className="bs-concept-detail"><span>Cast</span> {concept.castSuggestion}</div>
          )}
          {concept.musicMood && (
            <div className="bs-concept-detail"><span>Music</span> {concept.musicMood}</div>
          )}
          {concept.targetPlatform && (
            <div className="bs-concept-detail"><span>Platform</span> {concept.targetPlatform}</div>
          )}
          {concept.description && !concept.synopsis && (
            <p className="bs-concept-synopsis">{concept.description}</p>
          )}
          {concept.influencerAngle && (
            <div className="bs-concept-detail"><span>Influencer</span> {concept.influencerAngle}</div>
          )}
          {concept.reelIdea && (
            <div className="bs-concept-detail"><span>Reel Idea</span> {concept.reelIdea}</div>
          )}
        </div>
      )}

      <div className="bs-concept-footer">
        <button className="bs-ghost-btn" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Collapse ↑' : 'Expand ↓'}
        </button>
        <button className="bs-primary-btn bs-deepdive-btn" onClick={() => onDeepDive?.(concept)}>
          🔬 Deep Dive
        </button>
        {isFilm && (
          <button className="bs-primary-btn" onClick={() => onScreenplay?.(concept)}>
            ✍️ Write Screenplay
          </button>
        )}
      </div>
    </div>
  )
}

// ── Deep Dive Panel (tabbed view) ─────────────────────────────────────────────
function DeepDivePanel({ deepDive }) {
  const [activeTab, setActiveTab] = useState('competitive')
  if (!deepDive?.ideaTitle && !deepDive?.summary) return null

  const tabs = [
    { id: 'competitive', label: '🌐 Competitive', icon: 'groups' },
    { id: 'playbook', label: '📋 Playbook', icon: 'assignment' },
    { id: 'content', label: '📝 Content', icon: 'edit_note' },
    { id: 'budget', label: '💰 Budget', icon: 'payments' },
    { id: 'risks', label: '⚠️ Risks', icon: 'warning' },
  ]

  return (
    <div className="bs-deepdive">
      <div className="bs-deepdive-header">
        <div className="bs-sp-title"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">biotech</span> Deep Dive: {deepDive.ideaTitle || 'Analysis'}</div>
        {deepDive.summary && <p className="bs-deepdive-summary">{deepDive.summary}</p>}
      </div>

      <div className="bs-deepdive-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`bs-dd-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="bs-deepdive-body">
        {activeTab === 'competitive' && deepDive.competitiveAnalysis && (
          <div className="bs-dd-section">
            {deepDive.competitiveAnalysis.directCompetitors?.map((c, i) => (
              <div key={i} className="bs-dd-card">
                <div className="bs-dd-card-title">{c.name}</div>
                <div className="bs-dd-card-row"><span>Their approach:</span> {c.theirApproach}</div>
                <div className="bs-dd-card-row bs-dd-advantage"><span>Our edge:</span> {c.ourAdvantage}</div>
              </div>
            ))}
            {deepDive.competitiveAnalysis.whitespace && (
              <div className="bs-dd-whitespace">
                <div className="bs-dd-whitespace-label">💡 Market Whitespace</div>
                <p>{deepDive.competitiveAnalysis.whitespace}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'playbook' && deepDive.executionPlaybook && (
          <div className="bs-dd-section">
            {deepDive.executionPlaybook.phases?.map((phase, i) => (
              <div key={i} className="bs-dd-phase">
                <div className="bs-dd-phase-header">
                  <span className="bs-dd-phase-name">{phase.name}</span>
                  <span className="bs-dd-phase-dur">{phase.duration}</span>
                </div>
                {phase.actions?.map((a, j) => (
                  <div key={j} className="bs-dd-action">
                    <div className="bs-dd-action-task">{a.task}</div>
                    <div className="bs-dd-action-meta">
                      {a.owner && <span>👤 {a.owner}</span>}
                      {a.channel && <span>📱 {a.channel}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'content' && deepDive.contentBrief && (
          <div className="bs-dd-section">
            <div className="bs-dd-sublabel">Hero Assets</div>
            {deepDive.contentBrief.heroAssets?.map((a, i) => (
              <div key={i} className="bs-dd-card">
                <div className="bs-dd-card-title">{a.type} · {a.platform}</div>
                <div className="bs-dd-card-row">{a.brief}</div>
                {a.specs && <div className="bs-dd-card-meta">{a.specs}</div>}
              </div>
            ))}
            {deepDive.contentBrief.copyDirection && (
              <div className="bs-dd-copy">
                <div className="bs-dd-sublabel">Copy Direction</div>
                <div className="bs-dd-copy-pills">
                  {deepDive.contentBrief.copyDirection.headlines?.map((h, i) => (
                    <span key={i} className="bs-tag bs-tag-purple">{h}</span>
                  ))}
                  {deepDive.contentBrief.copyDirection.ctas?.map((c, i) => (
                    <span key={i} className="bs-tag bs-tag-amber">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'budget' && deepDive.budgetBreakdown && (
          <div className="bs-dd-section">
            <div className="bs-dd-budget-total">Total Estimate: <strong>{deepDive.budgetBreakdown.totalEstimate}</strong></div>
            {deepDive.budgetBreakdown.splits?.map((s, i) => (
              <div key={i} className="bs-dd-budget-row">
                <div className="bs-dd-budget-cat">{s.category}</div>
                <div className="bs-dd-budget-bar">
                  <div className="bs-dd-budget-fill" style={{ width: `${s.percentage}%` }} />
                </div>
                <div className="bs-dd-budget-val">{s.amount} ({s.percentage}%)</div>
              </div>
            ))}
            {deepDive.budgetBreakdown.roiProjection && (
              <div className="bs-dd-roi"><span>📈 ROI:</span> {deepDive.budgetBreakdown.roiProjection}</div>
            )}
          </div>
        )}

        {activeTab === 'risks' && deepDive.risks && (
          <div className="bs-dd-section">
            {deepDive.risks.map((r, i) => (
              <div key={i} className="bs-dd-risk">
                <div className="bs-dd-risk-header">
                  <span className={`bs-dd-risk-badge bs-dd-risk-${r.likelihood}`}>{r.likelihood}</span>
                  <span className="bs-dd-risk-text">{r.risk}</span>
                </div>
                <div className="bs-dd-risk-fix"><span>Fix:</span> {r.mitigation}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Calendar View (week-by-week) ──────────────────────────────────────────────
const PLATFORM_COLORS = {
  instagram: '#E1306C', linkedin: '#0A66C2', twitter: '#1DA1F2',
  youtube: '#FF0000', facebook: '#1877F2', blog: '#f59e0b', newsletter: '#8b5cf6'
}
const PLATFORM_ICONS = {
  instagram: '📸', linkedin: '💼', twitter: '𝕏', youtube: '▶️',
  facebook: '👥', blog: '📝', newsletter: '📧'
}

function CalendarView({ calendar, onPushToCalendar }) {
  if (!calendar?.weeks?.length) return null
  return (
    <div className="bs-calendar">
      <div className="bs-calendar-header">
        <div className="bs-sp-title"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">calendar_month</span> {calendar.title || 'Content Calendar'}</div>
        <div className="bs-sp-sub">{calendar.duration} · Starts {calendar.startDate}</div>
        {calendar.objective && <p className="bs-calendar-obj">{calendar.objective}</p>}
      </div>

      {calendar.weeks.map((week, wi) => (
        <div key={wi} className="bs-cal-week">
          <div className="bs-cal-week-header">{week.theme || `Week ${week.weekNumber}`}</div>
          <div className="bs-cal-days">
            {week.days?.map((day, di) => (
              <div key={di} className="bs-cal-day">
                <div className="bs-cal-day-label">
                  <span className="bs-cal-day-name">{day.dayOfWeek}</span>
                  <span className="bs-cal-day-date">{day.date}</span>
                </div>
                {day.posts?.map((post, pi) => (
                  <div key={pi} className="bs-cal-post"
                    style={{ borderLeftColor: PLATFORM_COLORS[post.platform] || '#8b5cf6' }}>
                    <div className="bs-cal-post-top">
                      <span className="bs-cal-platform">{PLATFORM_ICONS[post.platform] || '📱'} {post.platform}</span>
                      <span className="bs-cal-type">{post.type}</span>
                      <span className="bs-cal-time">{post.time}</span>
                    </div>
                    <div className="bs-cal-post-brief">{post.brief}</div>
                    {post.copyHook && <div className="bs-cal-hook">"{post.copyHook}"</div>}
                    {post.hashtags?.length > 0 && (
                      <div className="bs-cal-hashtags">{post.hashtags.join(' ')}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {calendar.targetKPIs?.length > 0 && (
        <div className="bs-cal-kpis">
          <div className="bs-dd-sublabel">📊 Target KPIs</div>
          {calendar.targetKPIs.map((k, i) => (
            <div key={i} className="bs-cal-kpi">{k.metric}: <strong>{k.target}</strong> <span>(measure after {k.measureAfter})</span></div>
          ))}
        </div>
      )}

      {onPushToCalendar && (
        <div className="bs-cal-actions">
          <button className="bs-primary-btn" onClick={onPushToCalendar}>
            📅 Push to Smart Calendar
          </button>
        </div>
      )}
    </div>
  )
}

// ── Session History Sidebar ──────────────────────────────────────────────────
function SessionSidebar({ sessions, activeSessionId, onSelect, onNew, onDelete, visible, onToggle }) {
  const grouped = { today: [], yesterday: [], older: [] }
  const now = new Date()
  sessions.forEach(s => {
    const d = new Date(s.lastMessageAt || s.createdAt)
    const diffH = (now - d) / 3600000
    if (diffH < 24) grouped.today.push(s)
    else if (diffH < 48) grouped.yesterday.push(s)
    else grouped.older.push(s)
  })

  const timeAgo = (d) => {
    const ms = now - new Date(d)
    const m = Math.floor(ms / 60000)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  return (
    <div className={`bs-sidebar ${visible ? 'open' : ''}`}>
      <div className="bs-sidebar-header">
        <span>📋 Sessions</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="bs-sidebar-new" onClick={onNew} title="New session"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span></button>
          <button className="bs-sidebar-close" onClick={onToggle}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span></button>
        </div>
      </div>
      <div className="bs-sidebar-list">
        {[{ label: 'Today', items: grouped.today }, { label: 'Yesterday', items: grouped.yesterday }, { label: 'Older', items: grouped.older }].map(g => {
          if (!g.items.length) return null
          return (
            <div key={g.label}>
              <div className="bs-sidebar-group">{g.label}</div>
              {g.items.map(s => (
                <div key={s._id} className={`bs-sidebar-item ${s._id === activeSessionId ? 'active' : ''}`}
                  onClick={() => onSelect(s._id)}>
                  <div className="bs-sidebar-item-title">{s.title || 'Untitled'}</div>
                  <div className="bs-sidebar-item-meta">
                    <span>{timeAgo(s.lastMessageAt || s.createdAt)}</span>
                    {s.ideaCount > 0 && <span className="bs-sidebar-badge">💡{s.ideaCount}</span>}
                    {s.hasDeepDive && <span className="bs-sidebar-badge">🔬</span>}
                    {s.hasCalendar && <span className="bs-sidebar-badge">📅</span>}
                  </div>
                  <button className="bs-sidebar-del" onClick={e => { e.stopPropagation(); onDelete(s._id) }} title="Delete">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
        {sessions.length === 0 && <div className="bs-sidebar-empty">No sessions yet</div>}
      </div>
    </div>
  )
}

// ── Screenplay viewer ──────────────────────────────────────────────────────────
function ScreenplayView({ screenplay }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!screenplay?.scenes?.length) return null
  return (
    <div className="bs-screenplay">
      <div className="bs-screenplay-header">
        <div>
          <div className="bs-sp-title"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">movie</span> {screenplay.title || 'Screenplay'}</div>
          <div className="bs-sp-sub">{screenplay.format} · {screenplay.totalScenes} scenes</div>
        </div>
        <button className="bs-ghost-btn" onClick={() => setCollapsed(c => !c)}>
          {collapsed ? 'Expand ↓' : 'Collapse ↑'}
        </button>
      </div>

      {!collapsed && (
        <>
          {screenplay.scenes.map((scene, i) => (
            <div key={i} className="bs-scene">
              <div className="bs-scene-header">
                <span className="bs-scene-num">SCENE {scene.sceneNumber}</span>
                <span className="bs-scene-loc">{scene.location}</span>
                <span className="bs-scene-dur">{scene.duration}</span>
              </div>
              <div className="bs-scene-body">
                <div className="bs-scene-row">
                  <span className="bs-scene-key">VISUAL</span>
                  <span>{scene.visual}</span>
                </div>
                {scene.action && (
                  <div className="bs-scene-row">
                    <span className="bs-scene-key">ACTION</span>
                    <span>{scene.action}</span>
                  </div>
                )}
                {scene.dialogue && (
                  <div className="bs-scene-row bs-scene-dialogue">
                    <span className="bs-scene-key">DIALOGUE</span>
                    <span>"{scene.dialogue}"</span>
                  </div>
                )}
                <div className="bs-scene-meta">
                  {scene.cameraDirection && <span>📷 {scene.cameraDirection}</span>}
                  {scene.music && <span>🎵 {scene.music}</span>}
                  {scene.mood && <span>💭 {scene.mood}</span>}
                </div>
              </div>
            </div>
          ))}

          {screenplay.endCard && (
            <div className="bs-endcard">
              <div className="bs-endcard-label">END CARD</div>
              <div>{screenplay.endCard.visual}</div>
              {screenplay.endCard.tagline && (
                <div className="bs-endcard-tagline">"{screenplay.endCard.tagline}"</div>
              )}
            </div>
          )}

          {screenplay.directorNotes && (
            <div className="bs-director-notes">
              <span>Director's Notes</span>
              <p>{screenplay.directorNotes}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Strategy viewer ───────────────────────────────────────────────────────────
function StrategyView({ strategy }) {
  if (!strategy?.title) return null
  return (
    <div className="bs-strategy">
      <div className="bs-strategy-header">
        <div className="bs-sp-title"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">trending_up</span> {strategy.title}</div>
        <div className="bs-sp-sub">{strategy.duration} · {strategy.budget_total}</div>
      </div>
      {strategy.executive_summary && (
        <p className="bs-strategy-summary">{strategy.executive_summary}</p>
      )}
      {strategy.target_kpis?.length > 0 && (
        <div className="bs-strategy-section">
          <div className="bs-strategy-section-title">Target KPIs</div>
          {strategy.target_kpis.map((kpi, i) => (
            <div key={i} className="bs-kpi-row">
              <span className="bs-kpi-metric">{kpi.metric}</span>
              <span className="bs-kpi-target">{kpi.current} → {kpi.target}</span>
              <span className="bs-kpi-score">{kpi.achievability}/10</span>
            </div>
          ))}
        </div>
      )}
      {strategy.channel_strategy?.length > 0 && (
        <div className="bs-strategy-section">
          <div className="bs-strategy-section-title">Channel Strategy</div>
          {strategy.channel_strategy.map((ch, i) => (
            <div key={i} className="bs-channel-row">
              <span className="bs-channel-name">{ch.channel}</span>
              <span className="bs-channel-budget">{ch.budget_pct}% · {ch.budget_amount}</span>
              <div className="bs-channel-why">{ch.why}</div>
            </div>
          ))}
        </div>
      )}
      {strategy.quick_wins?.length > 0 && (
        <div className="bs-strategy-section">
          <div className="bs-strategy-section-title">Quick Wins</div>
          {strategy.quick_wins.map((w, i) => (
            <div key={i} className="bs-quickwin">
              <span>⚡</span>
              <span>{w.action}</span>
              <span className="bs-quickwin-meta">{w.timeline}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Naming ideas viewer ───────────────────────────────────────────────────────
function NamingView({ namingIdeas }) {
  if (!namingIdeas) return null
  const sections = [
    { key: 'premiumEnglish',    label: '✨ Premium English' },
    { key: 'culturalInspired',  label: '🪔 Cultural' },
    { key: 'modernMinimal',     label: '🔲 Modern Minimal' },
    { key: 'emotional',         label: '❤️ Emotional' },
  ]
  return (
    <div className="bs-naming">
      {sections.map(sec => {
        const items = namingIdeas[sec.key]
        if (!items?.length) return null
        return (
          <div key={sec.key} className="bs-naming-section">
            <div className="bs-naming-label">{sec.label}</div>
            <div className="bs-naming-grid">
              {items.map((item, i) => (
                <div key={i} className="bs-name-card">
                  <div className="bs-name-word">{item.name}</div>
                  <div className="bs-name-meaning">{item.meaning}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {namingIdeas.taglines?.length > 0 && (
        <div className="bs-naming-section">
          <div className="bs-naming-label"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">chat</span> Taglines</div>
          {namingIdeas.taglines.map((t, i) => (
            <div key={i} className="bs-tagline-row">"{t}"</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ideas block (rendered inside Fidato message) ──────────────────────────────
function IdeasBlock({ payload, intent, onScreenplay, onFeedback, onDeepDive }) {
  if (!payload) return null
  const isFilm = intent === 'ad-film'
  const isNaming = intent === 'naming'
  const concepts = isFilm ? (payload.filmConcepts || []) : (payload.campaignConcepts || [])
  const suggestions = payload.followUpSuggestions || []

  return (
    <div className="bs-ideas-block">
      {concepts.map((c, i) => (
        <ConceptCard
          key={i}
          concept={c}
          index={i}
          isFilm={isFilm}
          onScreenplay={onScreenplay}
          onFeedback={onFeedback}
          onDeepDive={onDeepDive}
        />
      ))}

      {isNaming && payload.namingIdeas && (
        <NamingView namingIdeas={payload.namingIdeas} />
      )}

      {!isNaming && payload.namingIdeas && (
        <div className="bs-name-tags">
          {payload.namingIdeas.campaignNames?.map((n, i) => (
            <span key={i} className="bs-tag bs-tag-purple">{n}</span>
          ))}
          {payload.namingIdeas.taglines?.map((t, i) => (
            <span key={i} className="bs-tag bs-tag-blue">"{t}"</span>
          ))}
          {payload.namingIdeas.hashtags?.map((h, i) => (
            <span key={i} className="bs-tag bs-tag-amber">{h}</span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="bs-suggestions">
          <div className="bs-suggestions-label">Ask Fidato to...</div>
          <div className="bs-suggestions-pills">
            {suggestions.map((s, i) => (
              <button key={i} className="bs-suggestion-pill"
                onClick={() => onFeedback?.(null, 'suggestion', s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Single message bubble ─────────────────────────────────────────────────────
function Message({ msg, onScreenplay, onFeedback, onDeepDive, onSelectOption, isLatest, streaming }) {
  const isFidato = msg.role === 'fidato'
  const showOptions = isFidato
    && msg.questionOptions?.length > 0
    && isLatest
    && !msg.ideasPayload
    && !msg.screenplayPayload
    && !msg.strategyPayload
    && !msg.deepDivePayload
    && !msg.calendarPayload
    && !msg.thinking

  return (
    <div className={`bs-msg-wrap ${isFidato ? 'bs-msg-fidato' : 'bs-msg-user'}`}>
      {isFidato && (
        <div className="bs-fidato-avatar">F</div>
      )}
      <div className={`bs-bubble ${isFidato ? 'bs-bubble-fidato' : 'bs-bubble-user'}`}>
        {msg.content && (
          <div className="bs-bubble-text"><FormattedText text={msg.content} /></div>
        )}
        {msg.thinking && <ThinkingDots />}

        {showOptions && (
          <div className="bs-q-options">
            <div className="bs-q-options-hint">Pick one or type your own ↓</div>
            <div className="bs-q-options-grid">
              {msg.questionOptions.map((opt, i) => (
                <button
                  key={i}
                  className="bs-q-option"
                  onClick={() => onSelectOption?.(opt)}
                  style={{ animationDelay: `${i * 55}ms` }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {msg.ideasPayload && (
          <IdeasBlock
            payload={msg.ideasPayload}
            intent={msg.intent}
            onScreenplay={onScreenplay}
            onFeedback={onFeedback}
            onDeepDive={onDeepDive}
          />
        )}
        {msg.screenplayPayload && (
          <ScreenplayView screenplay={msg.screenplayPayload} />
        )}
        {msg.strategyPayload && (
          <StrategyView strategy={msg.strategyPayload} />
        )}
        {msg.deepDivePayload && (
          <DeepDivePanel deepDive={msg.deepDivePayload} />
        )}
        {msg.calendarPayload && (
          <CalendarView calendar={msg.calendarPayload} />
        )}
      </div>
    </div>
  )
}


// ── Client-side brand language inference (mirrors backend logic) ──────────────
function detectBrandLang(brand) {
  if (!brand) return null
  const dna = brand.dna || {}
  const explicit = (dna.defaultLanguage || '').toLowerCase().trim()
  if (explicit && explicit !== 'english') return explicit

  const allText = [
    brand.name, dna.industry, dna.targetAudience, dna.region,
    dna.brandDescription, dna.companyOverview,
  ].join(' ').toLowerCase()

  if (['hindi','zee','zeetv','star plus','star bharat','bollywood','hindi cinema',
       'aaj tak','ndtv india','tv9 bharatvarsh','bharat','hindustani','hindi belt',
       'up ','bihar','rajasthan',' mp ','madhya pradesh','uttar pradesh','haryana'].some(s => allText.includes(s))) return 'hindi'
  if (['marathi','star pravah','zee marathi','maharashtra'].some(s => allText.includes(s))) return 'marathi'
  if (['tamil','sun tv','vijay tv','zee tamil','kollywood','chennai'].some(s => allText.includes(s))) return 'tamil'
  if (['telugu','star maa','zee telugu','tollywood','hyderabad regional','andhra','telangana'].some(s => allText.includes(s))) return 'telugu'
  if (['kannada','star suvarna','zee kannada','sandalwood','karnataka'].some(s => allText.includes(s))) return 'kannada'
  if (['malayalam','asianet','mazhavil manorama','mollywood','kerala'].some(s => allText.includes(s))) return 'malayalam'
  if (['bengali','star jalsha','zee bangla','kolkata regional','west bengal'].some(s => allText.includes(s))) return 'bengali'
  if (['punjabi','ptc punjabi','chandigarh','amritsar'].some(s => allText.includes(s))) return 'punjabi'
  if (['gujarati','gujarat','tv9 gujarati','ahmedabad','surat'].some(s => allText.includes(s))) return 'gujarati'
  return null
}

const LANG_DISPLAY = {
  hindi: { flag: '🇮🇳', label: 'Hindi', srLang: 'hi-IN' },
  marathi: { flag: '🇮🇳', label: 'Marathi', srLang: 'mr-IN' },
  tamil: { flag: '🇮🇳', label: 'Tamil', srLang: 'ta-IN' },
  telugu: { flag: '🇮🇳', label: 'Telugu', srLang: 'te-IN' },
  kannada: { flag: '🇮🇳', label: 'Kannada', srLang: 'kn-IN' },
  malayalam: { flag: '🇮🇳', label: 'Malayalam', srLang: 'ml-IN' },
  bengali: { flag: '🇮🇳', label: 'Bengali', srLang: 'bn-IN' },
  punjabi: { flag: '🇮🇳', label: 'Punjabi', srLang: 'pa-IN' },
  gujarati: { flag: '🇮🇳', label: 'Gujarati', srLang: 'gu-IN' },
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BrainstormStudio() {
  const navigate = useNavigate()
  const { activeBrand } = useBrand()
  const { user } = useAuth()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionState, setSessionState] = useState({
    intent: null, collectedAnswers: {}, ideasGenerated: false,
    screenplayGenerated: false, lastIdeas: null, lastScreenplay: null,
  })
  const [phase, setPhase] = useState('explore')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState(null)
  const [reasoningSteps, setReasoningSteps] = useState([])
  const [citations, setCitations] = useState([])
  const [showReasoning, setShowReasoning] = useState(false)
  const [feedbackToast, setFeedbackToast] = useState({ message: '', visible: false })

  // Session history state
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [sessionList, setSessionList] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const currentMsgIdRef = useRef(null)
  const recognitionRef = useRef(null)

  const firstName = user?.name?.split(' ')[0] || 'there'
  const brandName = activeBrand?.name || null
  const detectedLangKey = detectBrandLang(activeBrand)
  const langInfo = detectedLangKey ? LANG_DISPLAY[detectedLangKey] : null

  // Auto-scroll — trigger on new messages AND during streaming token updates
  const lastMsgContent = messages[messages.length - 1]?.content || ''
  useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    })
  }, [messages.length, lastMsgContent.length, streaming])

  // Brand-aware greeting on mount — Fidato references the brand's DNA
  useEffect(() => {
    if (!activeBrand) {
      setMessages([{
        id: 'welcome',
        role: 'fidato',
        content: `Hey ${firstName}! 👋 I'm Fidato — your AI brand strategist. Select a brand from the top bar and let's start brainstorming. What do you want to create today?`,
        timestamp: Date.now(),
      }])
      return
    }
    const dna = activeBrand.dna || {}
    const industry = dna.industry || dna.category || ''
    const audience = dna.targetAudience || ''
    const voice = dna.voice?.personality || ''
    const country = dna.country || 'India'
    // Build a brand insight line so user feels Fidato truly knows the brand
    const insights = [
      industry && `${industry} brand`,
      country && `based in ${country}`,
      audience && `targeting ${audience}`,
      voice && `known for ${voice} voice`,
    ].filter(Boolean).join(', ')

    const greeting = insights
      ? `Hey ${firstName}! 👋 I'm Fidato — your brand strategist for ${activeBrand.name}. I've studied your brand deeply — you're a ${insights}.${langInfo ? ` All campaign copy, taglines & scripts will be in **${langInfo.label}** — the language of your audience. 🌍` : ''} Let's brainstorm something brilliant together. What are we building today? `
      : `Hey ${firstName}! 👋 Fidato here — let’s brainstorm for **${activeBrand.name}** today. What are we working on?`

    setMessages([{ id: 'welcome', role: 'fidato', content: greeting, timestamp: Date.now() }])
  }, [firstName, activeBrand])

  // Load session list on mount and when brand changes
  useEffect(() => {
    if (!activeBrand?._id) return
    bsAPI.sessions(activeBrand._id).then(r => {
      if (r.success) setSessionList(r.sessions || [])
    }).catch(() => {})
  }, [activeBrand?._id])

  // Phase sync — now includes deep dive and calendar stages
  useEffect(() => {
    if (sessionState.hasCalendar) setPhase('calendar')
    else if (sessionState.hasDeepDive) setPhase('deepdive')
    else if (sessionState.screenplayGenerated || sessionState.lastScreenplay) setPhase('deliver')
    else if (sessionState.ideasGenerated) setPhase('ideate')
    else if (sessionState.intent) setPhase('explore')
    else setPhase('explore')
  }, [sessionState])

  // ── Load a session by ID ────────────────────────────────────────────────────
  const loadSession = useCallback(async (id) => {
    try {
      const r = await bsAPI.loadSession(id)
      if (!r.success || !r.session) return
      const s = r.session
      setActiveSessionId(s._id)
      setSessionState(s.sessionState || {})
      // Reconstruct messages from stored conversation
      const msgs = s.messages.map((m, i) => ({
        id: `loaded-${i}`,
        role: m.role,
        content: m.content || '',
        timestamp: new Date(m.timestamp).getTime(),
        ideasPayload: m.ideasPayload || null,
        screenplayPayload: m.screenplayPayload || null,
        strategyPayload: m.strategyPayload || null,
        deepDivePayload: m.deepDivePayload || null,
        calendarPayload: m.calendarPayload || null,
        intent: m.intent || null,
        questionOptions: m.questionOptions || null,
      }))
      setMessages(msgs)
      setSidebarOpen(false)
    } catch (e) {
      console.warn('Failed to load session:', e.message)
    }
  }, [])

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback(async (id) => {
    await bsAPI.deleteSession(id).catch(() => {})
    setSessionList(prev => prev.filter(s => s._id !== id))
    if (id === activeSessionId) {
      setActiveSessionId(null)
      resetSession()
    }
  }, [activeSessionId])

  // ── Append/update message helpers ──────────────────────────────────────────
  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg])
    return msg.id
  }, [])

  const updateMessage = useCallback((id, patch) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }, [])

  const appendToken = useCallback((id, token) => {
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, content: (m.content || '') + token } : m
    ))
  }, [])

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || streaming) return
    setInput('')
    setError(null)

    // Add user message
    const userId = `u-${Date.now()}`
    addMessage({ id: userId, role: 'user', content: msg, timestamp: Date.now() })

    // Add empty Fidato message (will stream into it)
    const fidId = `f-${Date.now()}`
    currentMsgIdRef.current = fidId
    addMessage({ id: fidId, role: 'fidato', content: '', thinking: false, timestamp: Date.now() })

    // Build history for backend (last 12 messages, exclude current Fidato placeholder)
    const history = messages
      .filter(m => m.id !== 'welcome')
      .slice(-12)
      .map(m => {
        let richContent = m.content || ''
        if (m.ideasPayload) {
          const concepts = m.ideasPayload.filmConcepts || m.ideasPayload.campaignConcepts || []
          if (concepts.length > 0) {
            richContent += `\n[Generated Ideas: ${concepts.map(c => c.title).join(', ')}]`
          }
        }
        if (m.screenplayPayload) {
          richContent += `\n[Generated Screenplay: ${m.screenplayPayload.title}]`
        }
        return { role: m.role, content: richContent }
      })
      .concat([{ role: 'user', content: msg }])


    setStreaming(true)
    setReasoningSteps([])
    setCitations([])
    setShowReasoning(true)
    let thinkingShown = false

    try {
      await bsAPI.fidatoChat(
        { message: msg, history, sessionState, brand: activeBrand, sessionId: activeSessionId },
        {
          onToken: (token) => {
            if (thinkingShown) {
              updateMessage(fidId, { thinking: false })
              thinkingShown = false
            }
            appendToken(fidId, token)
          },
          onThinking: () => {
            updateMessage(fidId, { thinking: true })
            thinkingShown = true
          },
          onReasoningStep: (step, icon) => {
            setReasoningSteps(prev => [...prev, { text: step, icon: icon || 'psychology' }])
          },
          onCitations: (newCitations) => {
            setCitations(prev => [...prev, ...(newCitations || [])])
          },
          onIdeas: (payload, intent) => {
            updateMessage(fidId, { ideasPayload: payload, intent, thinking: false })
          },
          onScreenplay: (payload) => {
            updateMessage(fidId, { screenplayPayload: payload, thinking: false })
          },
          onStrategy: (payload) => {
            updateMessage(fidId, { strategyPayload: payload, thinking: false })
          },
          onDeepDive: (payload) => {
            updateMessage(fidId, { deepDivePayload: payload, thinking: false })
          },
          onCalendar: (payload) => {
            updateMessage(fidId, { calendarPayload: payload, thinking: false })
          },
          onSessionId: (id) => {
            setActiveSessionId(id)
          },
          onDone: (newState, questionOptions) => {
            if (newState) setSessionState(newState)
            updateMessage(fidId, { thinking: false, questionOptions: questionOptions || null })
            // Refresh session list after each exchange
            if (activeBrand?._id) {
              bsAPI.sessions(activeBrand._id).then(r => {
                if (r.success) setSessionList(r.sessions || [])
              }).catch(() => {})
            }
          },
          onError: (errMsg) => {
            setError(errMsg)
            updateMessage(fidId, { content: "Hmm, something went wrong. Try again?", thinking: false })
          },
        }
      )
    } catch (err) {
      setError(err.message)
      updateMessage(fidId, { content: "Something went wrong — try again!", thinking: false })
    } finally {
      setStreaming(false)
      setShowReasoning(false)
      currentMsgIdRef.current = null
      inputRef.current?.focus()
    }
  }, [input, streaming, messages, sessionState, activeBrand, addMessage, updateMessage, appendToken])

  // ── Screenplay request ──────────────────────────────────────────────────────
  const handleScreenplayRequest = useCallback((concept) => {
    sendMessage(`Write the full screenplay for "${concept.title}"`)
  }, [sendMessage])

  // ── Deep Dive request ───────────────────────────────────────────────────────
  const handleDeepDiveRequest = useCallback((concept) => {
    sendMessage(`Deep dive into "${concept.title}"`)
  }, [sendMessage])

  // ── Feedback / suggestion handler ───────────────────────────────────────────
  const showFeedbackToast = useCallback((msg) => {
    setFeedbackToast({ message: msg, visible: true })
    setTimeout(() => setFeedbackToast({ message: '', visible: false }), 2500)
  }, [])

  const handleFeedback = useCallback((concept, type, suggestion) => {
    if (type === 'suggestion' && suggestion) {
      sendMessage(suggestion)
      return
    }
    if (concept && activeBrand) {
      bsAPI.feedback({
        brandId: activeBrand._id,
        ideaTitle: concept.title,
        ideaDescription: concept.logline || concept.hook || '',
        feedback: type,
        intent: sessionState.intent,
      }).then(() => {
        showFeedbackToast(type === 'like' ? '👍 Feedback saved — Fidato will learn from this!' : '👎 Noted — Fidato will adjust the direction')
      }).catch(() => {})
    }
    if (type === 'dislike') sendMessage("Let's try a different direction")
  }, [sessionState.intent, activeBrand, sendMessage, showFeedbackToast])

  // ── Voice input ─────────────────────────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Voice not supported in this browser. Try Chrome.')
      return
    }
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = false
    rec.lang = langInfo?.srLang || 'en-IN'
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript || ''
      if (transcript) setInput(transcript)
      setIsListening(false)
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    recognitionRef.current = rec
    rec.start()
    setIsListening(true)
  }, [isListening])

  // ── New session ─────────────────────────────────────────────────────────────
  const resetSession = useCallback(() => {
    setSessionState({ intent: null, collectedAnswers: {}, ideasGenerated: false, screenplayGenerated: false, lastIdeas: null, lastScreenplay: null })
    setPhase('explore')
    setActiveSessionId(null)
    const greeting = brandName
      ? `Fresh start! What should we brainstorm for ${brandName} today? `
      : `Fresh start! What are we building today? `
    setMessages([{ id: `w-${Date.now()}`, role: 'fidato', content: greeting, timestamp: Date.now() }])
    setInput('')
    setError(null)
  }, [brandName])

  const phaseInfo = PHASES[phase] || PHASES.explore
  const showTopics = messages.length === 1 && !streaming

  return (
    <DashboardLayout title="Brainstorm Studio" subtitle="Powered by Fidato AI">
      <Walkthrough studioId="brainstormStudio" />
      <div className="bs-root">

        {/* Session Sidebar */}
        <SessionSidebar
          sessions={sessionList}
          activeSessionId={activeSessionId}
          onSelect={loadSession}
          onNew={resetSession}
          onDelete={deleteSession}
          visible={sidebarOpen}
          onToggle={() => setSidebarOpen(o => !o)}
        />

        {/* Phase bar */}
        <div data-wt="bs-phase" className="bs-phase-bar">
          <button className="bs-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title="Session history">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>menu</span>
            {sessionList.length > 0 && <span className="bs-sidebar-count">{sessionList.length}</span>}
          </button>
          <div className="bs-phase-inner">
            {Object.entries(PHASES).map(([key, p]) => (
              <div key={key} className={`bs-phase-step ${phase === key ? 'active' : ''}`}
                style={{ '--phase-color': p.color }}>
                <span className="material-symbols-outlined text-[1em]">{p.icon}</span>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
          {langInfo && (
            <div className="bs-lang-badge" title={`Generating creative copy in ${langInfo.label}`}>
              {langInfo.flag} {langInfo.label}
            </div>
          )}
          <button className="bs-new-session-btn" onClick={resetSession} title="Start new session">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            New Session
          </button>
        </div>

        {/* Messages */}
        <div className="bs-messages">

          {/* Topic chips — shown only at start */}
          {showTopics && (
            <div data-wt="bs-topics" className="bs-topics-wrap">
              <div className="bs-topics-label">What do you want to brainstorm?</div>
              <div className="bs-topics-grid">
                {TOPICS.map(t => (
                  <button key={t.id} className="bs-topic-chip"
                    onClick={() => sendMessage(t.hint)}>
                    <span className="bs-topic-icon material-symbols-outlined">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <Message
              key={msg.id}
              msg={msg}
              onScreenplay={handleScreenplayRequest}
              onFeedback={handleFeedback}
              onDeepDive={handleDeepDiveRequest}
              onSelectOption={sendMessage}
              isLatest={idx === messages.length - 1}
              streaming={streaming}
            />
          ))}

          {/* Live Reasoning Panel — shows during MCoT thinking */}
          <ReasoningPanel
            steps={reasoningSteps}
            citations={citations}
            visible={showReasoning && reasoningSteps.length > 0}
          />

          {error && (
            <div className="bs-error-banner">⚠️ {error}</div>
          )}

          <div ref={bottomRef} style={{ height: 1 }} />
        </div>

        {/* Feedback toast */}
        <FeedbackToast message={feedbackToast.message} visible={feedbackToast.visible} />

        {/* Input */}
        <div data-wt="bs-input" className="bs-input-area">
          <button
            className={`bs-mic-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleVoice}
            title={isListening ? 'Stop listening' : 'Speak to Fidato'}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {isListening ? 'mic_off' : 'mic'}
            </span>
          </button>

          <div className="bs-input-wrap">
            <textarea
              ref={inputRef}
              className="bs-input"
              placeholder={streaming ? 'Fidato is thinking...' : 'Tell Fidato what you\'re thinking...'}
              value={input}
              disabled={streaming}
              rows={1}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
            />
          </div>

          <button
            className={`bs-send-btn ${streaming ? 'loading' : ''}`}
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !streaming) || (streaming)}
            title="Send">
            {streaming
              ? <span className="material-symbols-outlined" style={{ fontSize: 18 }}>hourglass_top</span>
              : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>}
          </button>
        </div>

      </div>
    </DashboardLayout>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import FormattedText from '../components/FormattedText'
import { brainstormStudio as bsAPI, researchStudio } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'
import Walkthrough from '../components/Walkthrough'
import MonthlyStrategy from '../components/MonthlyStrategy'
import './BrainstormStudio.css'

// ── Strategy Modes (8 goal-oriented research-backed modes) ───────────────────
const STRATEGY_MODES_LIST = [
  { 
    id: 'influencer-campaign', icon: 'person_pin', label: 'Influencer Campaign', desc: 'Creator brief & seeding', color: '#14b8a6',
    buildSteps: [
      { title: 'Competitor creator scan', desc: 'which influencer tiers are working in your category' },
      { title: 'Trending content formats', desc: 'what hooks and styles are performing on TikTok & Reels right now' },
      { title: 'Creator brief', desc: 'hook scripts, visual direction, talking points, hashtag strategy' },
      { title: 'Seeding & measurement plan', desc: 'tier mix, gifting strategy, KPIs, timeline' }
    ],
    researchModules: ['Trending Intel', 'Competitor Scanner', 'Audience Intelligence']
  },
  { 
    id: 'new-product-launch', icon: 'rocket_launch', label: 'New Product Launch', desc: 'Pre-launch to amplification', color: '#6366f1',
    buildSteps: [
      { title: 'Market whitespace scan', desc: 'identifying gaps in competitor product lines' },
      { title: 'Launch messaging matrix', desc: 'core value props, taglines, and feature highlights' },
      { title: 'Pre-launch hype plan', desc: 'teaser calendar, waitlist strategy, PR hooks' },
      { title: 'Launch week execution', desc: 'daily activation plan, offer structures, amplification' }
    ],
    researchModules: ['Competitor Scanner', 'Audience Intelligence']
  },
  { 
    id: 'sales-acceleration', icon: 'trending_up', label: 'Sales Acceleration', desc: 'Offers & conversion', color: '#f59e0b',
    buildSteps: [
      { title: 'Offer architecture', desc: 'bundling, discounting, and FOMO triggers' },
      { title: 'Conversion copywriting', desc: 'high-urgency headlines, email hooks, landing page copy' },
      { title: 'Cart abandonment flows', desc: 'multi-step recovery emails and retargeting ads' },
      { title: 'Upsell & Cross-sell map', desc: 'post-purchase bumps and AOV increasers' }
    ],
    researchModules: ['Ad Intelligence', 'Audience Intelligence']
  },
  { 
    id: 'marketplace-growth', icon: 'storefront', label: 'Marketplace Growth', desc: 'Listings & sponsored ads', color: '#10b981',
    buildSteps: [
      { title: 'Keyword optimization', desc: 'high-volume search terms for Amazon/Flipkart' },
      { title: 'A+ Content strategy', desc: 'visual module planning and lifestyle imagery' },
      { title: 'Review mining', desc: 'extracting customer pain points to address in copy' },
      { title: 'Sponsored ad targeting', desc: 'bidding strategy, competitor targeting, and budget' }
    ],
    researchModules: ['Competitor Scanner', 'Trending Intel']
  },
  { 
    id: 'meta-google-ads', icon: 'ads_click', label: 'Meta & Google Ads', desc: 'Hooks & targeting brief', color: '#3b82f6',
    buildSteps: [
      { title: 'Winning ad frameworks', desc: 'problem/solution, UGC, USPs, and founder story' },
      { title: 'Creative brief', desc: 'visual directions, text overlays, and 3-second hooks' },
      { title: 'Audience targeting', desc: 'lookalikes, interests, and retargeting segments' },
      { title: 'Budget allocation', desc: 'testing phase, scaling, and platform split' }
    ],
    researchModules: ['Ad Intelligence', 'Competitor Scanner', 'Trending Intel']
  },
  { 
    id: 'retention', icon: 'loyalty', label: 'Retention & Loyalty', desc: 'Win-back & LTV', color: '#ec4899',
    buildSteps: [
      { title: 'Customer journey mapping', desc: 'identifying drop-off points and churn risks' },
      { title: 'Loyalty program structure', desc: 'points, tiers, VIP perks, and referral incentives' },
      { title: 'Win-back campaigns', desc: 'email/SMS sequences for lapsed customers' },
      { title: 'Subscription model', desc: 'subscribe & save strategy, unboxing experience' }
    ],
    researchModules: ['Audience Intelligence']
  },
  { 
    id: 'festive-seasonal', icon: 'celebration', label: 'Festive & Seasonal', desc: 'Calendar & creative brief', color: '#f97316',
    buildSteps: [
      { title: 'Seasonal calendar map', desc: 'key dates, teaser periods, and peak sale days' },
      { title: 'Festive offer strategy', desc: 'flash sales, limited editions, and gifting guides' },
      { title: 'Creative & visual direction', desc: 'moodboard, color palettes, and thematic elements' },
      { title: 'Media buying plan', desc: 'budget scaling before, during, and after the event' }
    ],
    researchModules: ['Trending Intel', 'Ad Intelligence']
  },
  { 
    id: 'brand-awareness', icon: 'record_voice_over', label: 'Brand Awareness', desc: 'PR, UGC, community', color: '#8b5cf6',
    buildSteps: [
      { title: 'Brand narrative', desc: 'core story, mission, and unique market positioning' },
      { title: 'PR & Media angles', desc: 'founder stories, industry thought leadership, press releases' },
      { title: 'Community building', desc: 'user-generated content campaigns, Facebook groups' },
      { title: 'Partnerships & Collabs', desc: 'co-marketing opportunities and brand alliances' }
    ],
    researchModules: ['Audience Intelligence', 'Trending Intel']
  }
]

// ── Strategy Mode Result Renderer ─────────────────────────────────────────────
function StrategyModeResult({ data, onClose, navigate }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  if (!data) return null
  const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }
  const studioIcons = { creative: 'auto_fix_high', content: 'edit_note', video: 'movie', brainstorm: 'psychology' }

  const handleStudioAction = (action) => {
    const paths = { creative: '/creative-studio', content: '/content-studio', video: '/video-studio', brainstorm: '/brainstorm' }
    navigate(paths[action.studio] || '/brainstorm')
  }

  return (
    <div className="sm-result" ref={containerRef}>
      <div className="sm-result-hdr">
        <div className="sm-result-title">{data.modeLabel} — {data.brand}</div>
        <button className="sm-close-btn" onClick={onClose}><span className="material-symbols-outlined">close</span></button>
      </div>

      {data.error && (
        <div className="sm-block" style={{ padding: '1rem', color: 'var(--sys-primary)' }}>
          <div className="sm-block-title"><span className="material-symbols-outlined">warning</span>Error Parsing Response</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '0.5rem', background: 'var(--sys-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--sys-border)' }}>
            {data.raw || 'Unknown error'}
          </pre>
        </div>
      )}

      {!data.strategicSummary && !data.error && (
        <div className="sm-block" style={{ padding: '1rem' }}>
          <div className="sm-block-title"><span className="material-symbols-outlined">data_object</span>Raw Strategy Data</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', marginTop: '0.5rem', background: 'var(--sys-surface)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--sys-border)' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}

      {data.strategicSummary && (
        <div className="sm-thesis">{data.strategicSummary}</div>
      )}

      {data.marketContext && (
        <div className="sm-block">
          <div className="sm-block-title"><span className="material-symbols-outlined">insights</span>Market Context</div>
          <div className="sm-ctx-grid">
            {data.marketContext.keyFindings?.length > 0 && (
              <div className="sm-ctx-col">
                <div className="sm-ctx-label">Key Findings</div>
                {data.marketContext.keyFindings.map((f, i) => <div key={i} className="sm-ctx-item">{f}</div>)}
              </div>
            )}
            {data.marketContext.competitorGaps?.length > 0 && (
              <div className="sm-ctx-col">
                <div className="sm-ctx-label">Competitor Gaps</div>
                {data.marketContext.competitorGaps.map((f, i) => <div key={i} className="sm-ctx-item">{f}</div>)}
              </div>
            )}
            {data.marketContext.trendingAngles?.length > 0 && (
              <div className="sm-ctx-col">
                <div className="sm-ctx-label">Trending Angles</div>
                {data.marketContext.trendingAngles.map((f, i) => <div key={i} className="sm-ctx-item">{f}</div>)}
              </div>
            )}
          </div>
        </div>
      )}

      {data.recommendedActions?.length > 0 && (
        <div className="sm-block">
          <div className="sm-block-title"><span className="material-symbols-outlined">checklist</span>Recommended Actions</div>
          <div className="sm-actions-list">
            {data.recommendedActions.map((a, i) => (
              <div key={i} className="sm-action-item">
                <span className="sm-priority" style={{ background: priorityColor[a.priority] || '#475569' }}>{a.priority}</span>
                <div className="sm-action-body">
                  <strong>{a.action}</strong>
                  <span className="sm-action-meta">{a.timeline} · {a.owner}</span>
                  <p>{a.rationale}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.channelBreakdown?.length > 0 && (
        <div className="sm-block">
          <div className="sm-block-title"><span className="material-symbols-outlined">hub</span>Channel Breakdown</div>
          <div className="sm-channels">
            {data.channelBreakdown.map((ch, i) => (
              <div key={i} className="sm-channel-card">
                <div className="sm-channel-name">{ch.channel}</div>
                <p className="sm-channel-strategy">{ch.strategy}</p>
                {ch.hooks?.length > 0 && (
                  <div className="sm-hooks">
                    <span className="sm-hooks-label">Winning hooks:</span>
                    {ch.hooks.map((h, j) => <span key={j} className="sm-hook-chip">{h}</span>)}
                  </div>
                )}
                <div className="sm-channel-meta">
                  {ch.budget && <span><span className="material-symbols-outlined">paid</span>{ch.budget}</span>}
                  {ch.kpi && <span><span className="material-symbols-outlined">flag</span>{ch.kpi}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.contentCalendar?.phases?.length > 0 && (
        <div className="sm-block">
          <div className="sm-block-title"><span className="material-symbols-outlined">calendar_month</span>Content Calendar — {data.contentCalendar.duration}</div>
          <div className="sm-cal-phases">
            {data.contentCalendar.phases.map((ph, i) => (
              <div key={i} className="sm-cal-phase">
                <div className="sm-cal-phase-hdr">
                  <span className="sm-cal-phase-num">{i + 1}</span>
                  <strong>{ph.name}</strong>
                  <span className="sm-cal-phase-dur">{ph.duration}</span>
                </div>
                {ph.theme && <div className="sm-cal-theme"><span className="material-symbols-outlined" style={{ fontSize: '12px', verticalAlign: 'middle' }}>flag</span> {ph.theme}</div>}
                <ul className="sm-cal-actions">
                  {ph.actions?.map((a, j) => <li key={j}>{a}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.studioActions?.length > 0 && (
        <div className="sm-block">
          <div className="sm-block-title"><span className="material-symbols-outlined">open_in_new</span>Take Action in Studios</div>
          <div className="sm-studio-actions">
            {data.studioActions.map((a, i) => (
              <button key={i} className="sm-studio-btn" onClick={() => handleStudioAction(a)}>
                <span className="material-symbols-outlined">{studioIcons[a.studio] || 'launch'}</span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
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

// ── Elapsed time hook ──────────────────────────────────────────────────────
function useElapsed(startTime, active) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startTime || !active) return
    const tick = () => setElapsed(((Date.now() - startTime) / 1000).toFixed(1))
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [startTime, active])
  // Once streaming ends, freeze the final value
  useEffect(() => {
    if (!active && startTime) {
      setElapsed(((Date.now() - startTime) / 1000).toFixed(1))
    }
  }, [active, startTime])
  return elapsed
}

// ── Inline Thinking (renders INSIDE the message bubble) ───────────────────
function InlineThinking({ steps, isStreaming, startTime, citations }) {
  const [expanded, setExpanded] = useState(true)
  const elapsed = useElapsed(startTime, isStreaming)
  const prevStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming transitions from true → false
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && steps.length > 0) {
      // Small delay so user sees the last step briefly before collapsing
      const t = setTimeout(() => setExpanded(false), 600)
      return () => clearTimeout(t)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, steps.length])

  if (steps.length === 0 && !isStreaming) return null

  return (
    <div className="bs-inline-thinking">
      <button className="bs-it-toggle" onClick={() => setExpanded(e => !e)}>
        <span className={`bs-it-indicator ${isStreaming ? 'active' : 'done'}`}>
          {isStreaming ? (
            <span className="bs-it-spinner" />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
          )}
        </span>
        <span className="bs-it-label">
          {isStreaming ? 'Thinking...' : `Thought for ${elapsed}s`}
        </span>
        <span className="material-symbols-outlined bs-it-chevron" style={{ fontSize: 16 }}>
          {expanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      <div className={`bs-it-body ${expanded ? 'open' : ''}`}>
        <div className="bs-it-steps">
          {steps.map((s, i) => (
            <div key={i} className="bs-it-step" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="bs-it-step-icon">{s.icon}</span>
              <span className="bs-it-step-text">{s.text}</span>
              {i === steps.length - 1 && isStreaming && <span className="bs-it-pulse" />}
            </div>
          ))}

          {citations && citations.length > 0 && (
            <div className="bs-it-citations">
              <div className="bs-it-citations-label">
                <span className="material-symbols-outlined" style={{ fontSize: 13, verticalAlign: 'middle', marginRight: 3 }}>link</span>
                Sources
              </div>
              <div className="bs-it-citations-list">
                {citations.map((c, i) => (
                  <a key={i} className="bs-it-citation-chip" href={c.url || c.uri || '#'}
                    target="_blank" rel="noopener noreferrer" title={c.title || c.url}>
                    {c.title || c.url || `Source ${i + 1}`}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
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
          <span className="material-symbols-outlined" style={{fontSize:'15px',verticalAlign:'middle'}}>biotech</span> Deep Dive
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
    { id: 'competitive', label: 'Competitive', icon: 'groups' },
    { id: 'playbook', label: 'Playbook', icon: 'assignment' },
    { id: 'content', label: 'Content', icon: 'edit_note' },
    { id: 'budget', label: 'Budget', icon: 'payments' },
    { id: 'risks', label: 'Risks', icon: 'warning' },
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
                <div className="bs-dd-whitespace-label"><span className="material-symbols-outlined" style={{fontSize:'14px',verticalAlign:'middle'}}>space_dashboard</span> Market Whitespace</div>
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
                      {a.owner && <span><span className="material-symbols-outlined" style={{fontSize:'13px',verticalAlign:'middle'}}>person</span> {a.owner}</span>}
                      {a.channel && <span><span className="material-symbols-outlined" style={{fontSize:'13px',verticalAlign:'middle'}}>smartphone</span> {a.channel}</span>}
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
  facebook: 'groups', blog: 'article', newsletter: 'mail'
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
                      <span className="bs-cal-platform"><span className="material-symbols-outlined" style={{fontSize:'13px',verticalAlign:'middle'}}>{PLATFORM_ICONS[post.platform] || 'smartphone'}</span> {post.platform}</span>
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
          <div className="bs-dd-sublabel"><span className="material-symbols-outlined" style={{fontSize:'13px',verticalAlign:'middle'}}>monitoring</span> Target KPIs</div>
          {calendar.targetKPIs.map((k, i) => (
            <div key={i} className="bs-cal-kpi">{k.metric}: <strong>{k.target}</strong> <span>(measure after {k.measureAfter})</span></div>
          ))}
        </div>
      )}

      {onPushToCalendar && (
        <div className="bs-cal-actions">
          <button className="bs-primary-btn" onClick={onPushToCalendar}>
            <span className="material-symbols-outlined" style={{fontSize:'15px',verticalAlign:'middle'}}>calendar_month</span> Push to Smart Calendar
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
        <span><span className="material-symbols-outlined" style={{fontSize:'15px',verticalAlign:'middle'}}>history</span> Sessions</span>
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
                    {s.ideaCount > 0 && <span className="bs-sidebar-badge">{s.ideaCount}</span>}
                    {s.hasDeepDive && <span className="bs-sidebar-badge">Dive</span>}
                    {s.hasCalendar && <span className="bs-sidebar-badge">Cal</span>}
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
              <span className="material-symbols-outlined" style={{fontSize:'14px',verticalAlign:'middle'}}>bolt</span>
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
        {/* Inline Thinking — shows AI reasoning steps inside the bubble */}
        {isFidato && (msg.reasoningSteps?.length > 0 || msg.thinking) && (
          <InlineThinking
            steps={msg.reasoningSteps || []}
            isStreaming={streaming && isLatest}
            startTime={msg.thinkingStartTime}
            citations={msg.citations || []}
          />
        )}
        {msg.content && (
          <div className="bs-bubble-text"><FormattedText text={msg.content} /></div>
        )}
        {/* Minimal thinking dots fallback — only when no reasoning steps yet */}
        {msg.thinking && (!msg.reasoningSteps || msg.reasoningSteps.length === 0) && (
          <div className="bs-thinking"><span /><span /><span /></div>
        )}

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
  const [searchParams] = useSearchParams()
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
  // Note: reasoningSteps are now stored per-message (msg.reasoningSteps)
  // These global refs are kept only for citations fallback
  const [citations, setCitations] = useState([])
  const [feedbackToast, setFeedbackToast] = useState({ message: '', visible: false })

  // ── Studio view toggle ────────────────────────────────────────────────────
  // Restore studioView from sessionStorage so refresh preserves the active view
  const [studioView, setStudioView] = useState(() => sessionStorage.getItem('bs-studioView') || 'brainstorm') // 'brainstorm' | 'monthly'

  // ── Strategy Mode state ───────────────────────────────────────────────────
  // Restore active strategy mode from sessionStorage
  const [smActiveMode, setSmActiveMode] = useState(() => {
    try {
      const savedId = sessionStorage.getItem('bs-smActiveModeId')
      if (savedId) {
        const match = STRATEGY_MODES_LIST.find(m => m.id === savedId)
        if (match) return match
      }
    } catch {}
    return STRATEGY_MODES_LIST[0]
  })
  const [smInputs, setSmInputs] = useState({})
  const [smLoading, setSmLoading] = useState(false)
  const [smError, setSmError] = useState(null)
  const [smResult, setSmResult] = useState(null)
  // Phase 4: live streaming state
  const [smStreamTools, setSmStreamTools] = useState([])   // [{ tool, label, status }]
  const [smTokenCount, setSmTokenCount] = useState(0)       // live char/word count
  const [smStreamPhase, setSmStreamPhase] = useState('')    // 'research' | 'writing' | ''

  // Pre-select Strategy Mode from ?mode= query param (set by Research Studio)
  useEffect(() => {
    const modeId = searchParams.get('mode')
    if (modeId && STRATEGY_MODES_LIST.length) {
      const match = STRATEGY_MODES_LIST.find(m => m.id === modeId)
      if (match) setSmActiveMode(match)
    }
  }, [searchParams])

  const handleStrategyMode = async () => {
    if (!smActiveMode || !activeBrand) return
    setSmLoading(true)
    setSmError(null)
    setSmResult(null)
    setSmStreamTools([])
    setSmTokenCount(0)
    setSmStreamPhase('research')

    try {
      // ── Phase 4: SSE streaming ──
      const response = await bsAPI.strategyModeStream({
        mode: smActiveMode.id,
        brand: activeBrand,
        inputs: smInputs.context ? { context: smInputs.context } : {},
      })

      if (!response.ok) throw new Error(`Stream failed: ${response.statusText}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const processLine = (line) => {
        if (!line.startsWith('data: ')) return
        try {
          const event = JSON.parse(line.slice(6))

          if (event.type === 'tool_progress') {
            // Update research chip list — dedupe by tool key
            setSmStreamTools(prev => {
              const filtered = prev.filter(t => t.tool !== event.tool)
              return [...filtered, { tool: event.tool, label: event.label, status: event.status }]
            })
            // Switch phase label
            if (event.tool === 'ai_synthesis' && event.status === 'working') {
              setSmStreamPhase('writing')
            }
          } else if (event.type === 'text_delta') {
            // Accumulate token count (chars / ~5 = approx words)
            setSmTokenCount(Math.round((event.tokenCount || 0) / 5))
          } else if (event.type === 'done') {
            setSmResult(event.data)
            setSmStreamPhase('')
            if (event.sessionId) {
              setActiveSessionId(event.sessionId)
              fetchSessionsList()
            }
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Strategy generation failed')
          }
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          processLine(line)
        }
      }

      // Flush remaining buffer
      buffer += decoder.decode()
      if (buffer.trim()) {
        const lines = buffer.split('\n')
        for (const line of lines) {
          processLine(line)
        }
      }
    } catch (streamErr) {
      // ── Fallback: blocking strategyMode ──
      console.warn('[BrainstormStudio] SSE stream failed, falling back:', streamErr.message)
      try {
        const res = await bsAPI.strategyMode({
          mode: smActiveMode.id,
          brand: activeBrand,
          inputs: smInputs.context ? { context: smInputs.context } : {},
        })
        if (res?.success && res?.data) {
          setSmResult(res.data)
          if (res.sessionId) {
            setActiveSessionId(res.sessionId)
            fetchSessionsList()
          }
        } else {
          setSmError(res?.error || 'Strategy generation failed. Please try again.')
        }
      } catch (e) {
        setSmError(e.message || 'Something went wrong.')
      }
    } finally {
      setSmLoading(false)
      setSmStreamPhase('')
    }
  }


  // Session history state
  // Restore activeSessionId and sidebarOpen from sessionStorage
  const [activeSessionId, setActiveSessionId] = useState(() => sessionStorage.getItem('bs-activeSessionId') || null)
  const [sessionList, setSessionList] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(() => sessionStorage.getItem('bs-sidebarOpen') === 'true')

  const fetchSessionsList = useCallback(() => {
    if (!activeBrand?._id) return
    bsAPI.sessions(activeBrand._id).then(r => {
      if (r.success) setSessionList(r.sessions || [])
    }).catch(() => {})
  }, [activeBrand?._id])

  // ── Load a session by ID ────────────────────────────────────────────────────
  const loadSession = useCallback(async (id) => {
    try {
      const r = await bsAPI.loadSession(id)
      if (!r.success || !r.session) return
      const s = r.session
      setActiveSessionId(s._id)
      setSessionState(s.sessionState || {})
      
      // Handle strategy-mode session
      if (s.intent === 'strategy-mode' && s.sessionState?.lastStrategy) {
         setSmResult(s.sessionState.lastStrategy)
         const modeObj = STRATEGY_MODES_LIST.find(m => m.id === s.sessionState.lastStrategy.mode)
         if (modeObj) setSmActiveMode(modeObj)
         setMessages([])
         setSidebarOpen(false)
         return
      } else {
         setSmResult(null)
      }

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

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const currentMsgIdRef = useRef(null)
  const recognitionRef = useRef(null)

  const firstName = user?.name?.split(' ')[0] || 'there'

  // ── Persist state to sessionStorage ───────────────────────────────────────
  useEffect(() => { sessionStorage.setItem('bs-studioView', studioView) }, [studioView])
  useEffect(() => { if (smActiveMode?.id) sessionStorage.setItem('bs-smActiveModeId', smActiveMode.id) }, [smActiveMode])
  useEffect(() => {
    if (activeSessionId) sessionStorage.setItem('bs-activeSessionId', activeSessionId)
    else sessionStorage.removeItem('bs-activeSessionId')
  }, [activeSessionId])
  useEffect(() => { sessionStorage.setItem('bs-sidebarOpen', sidebarOpen ? 'true' : 'false') }, [sidebarOpen])
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
      ? `Hey ${firstName}! 👋 I've loaded ${activeBrand.name}'s Brand DNA — ${insights}.${langInfo ? ` All copy & scripts will be generated in **${langInfo.label}**.` : ''} Let's build your **${smActiveMode?.label || 'Campaign'}** strategy.`
      : `Hey ${firstName}! 👋 Fidato here. Let’s build your **${smActiveMode?.label || 'Campaign'}** strategy for **${activeBrand.name}** today.`

    setMessages([{ id: 'welcome', role: 'fidato', content: greeting, timestamp: Date.now() }])
  }, [firstName, activeBrand, smActiveMode])

  // Load session list on mount and when brand changes
  useEffect(() => {
    fetchSessionsList()
  }, [fetchSessionsList])

  // Auto-resume saved session on mount (handles browser refresh)
  const hasResumedSession = useRef(false)
  useEffect(() => {
    const savedSessionId = sessionStorage.getItem('bs-activeSessionId')
    if (savedSessionId && !hasResumedSession.current) {
      hasResumedSession.current = true
      loadSession(savedSessionId)
    }
  }, [loadSession])

  // Phase sync — now includes deep dive and calendar stages
  useEffect(() => {
    if (sessionState.hasCalendar) setPhase('calendar')
    else if (sessionState.hasDeepDive) setPhase('deepdive')
    else if (sessionState.screenplayGenerated || sessionState.lastScreenplay) setPhase('deliver')
    else if (sessionState.ideasGenerated) setPhase('ideate')
    else if (sessionState.intent) setPhase('explore')
    else setPhase('explore')
  }, [sessionState])

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
    addMessage({ id: fidId, role: 'fidato', content: '', thinking: true, reasoningSteps: [], citations: [], thinkingStartTime: Date.now(), timestamp: Date.now() })

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
    setCitations([])
    let thinkingShown = true

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
            // Store reasoning steps per-message for inline display
            setMessages(prev => prev.map(m =>
              m.id === fidId
                ? { ...m, reasoningSteps: [...(m.reasoningSteps || []), { text: step, icon: icon || '🧠' }] }
                : m
            ))
          },
          onCitations: (newCitations) => {
            setCitations(prev => [...prev, ...(newCitations || [])])
            // Also attach citations to the message for inline display
            setMessages(prev => prev.map(m =>
              m.id === fidId
                ? { ...m, citations: [...(m.citations || []), ...(newCitations || [])] }
                : m
            ))
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
    setSmResult(null)
    const greeting = brandName
      ? `Fresh start! What should we brainstorm for ${brandName} today? `
      : `Fresh start! What are we building today? `
    setMessages([{ id: `w-${Date.now()}`, role: 'fidato', content: greeting, timestamp: Date.now() }])
    setInput('')
    setError(null)
  }, [brandName])

  const phaseInfo = PHASES[phase] || PHASES.explore
  const isHeroScreen = messages.length === 1 && !streaming && !smResult

  return (
    <DashboardLayout title="Brainstorm Studio" subtitle="Powered by Fidato AI">
      <Walkthrough studioId="brainstormStudio" />
      <div className="bs-root">
        
        {/* Hidden Legacy Session Sidebar (Triggered by mobile/history) */}
        <SessionSidebar
          sessions={sessionList}
          activeSessionId={activeSessionId}
          onSelect={loadSession}
          onNew={resetSession}
          onDelete={deleteSession}
          visible={sidebarOpen}
          onToggle={() => setSidebarOpen(o => !o)}
        />

        <div className="bs-layout-split">
          {/* Left Sidebar: Strategy Modes Navigation */}
          <div className="bs-layout-sidebar">

            {/* ── View Switcher — Prominent pill bar ── */}
            <div className="bs-view-switcher">
              <button
                className={`bs-view-tab ${studioView === 'brainstorm' ? 'active' : ''}`}
                onClick={() => setStudioView('brainstorm')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>psychology</span>
                Brainstorm
              </button>
              <button
                className={`bs-view-tab ${studioView === 'monthly' ? 'active' : ''}`}
                onClick={() => setStudioView('monthly')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_month</span>
                Monthly Strategy
                <span className="bs-view-tab-badge">AI</span>
              </button>
            </div>

            {studioView === 'brainstorm' && (<>
              {/* ── Quick Start — TOP of sidebar, always visible ── */}
              <div className="bs-sidebar-section bs-sidebar-section--quick" style={{ paddingTop: '1rem' }}>
                <div className="bs-sidebar-title">⚡ QUICK START</div>
                <div className="bs-quick-list">
                  {TOPICS.slice(0, 4).map(t => (
                    <button key={t.id} className="bs-quick-item" onClick={() => sendMessage(t.hint)}>
                      <span className="material-symbols-outlined bs-quick-icon">{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Strategy Goals ── */}
              <div className="bs-sidebar-divider" />
              <div className="bs-sidebar-section" style={{ paddingTop: '0.75rem' }}>
                <div className="bs-sidebar-title">STRATEGY GOALS</div>
                <div className="bs-mode-list">
                  {STRATEGY_MODES_LIST.map(mode => (
                    <button
                      key={mode.id}
                      className={`bs-mode-item ${smActiveMode?.id === mode.id ? 'active' : ''}`}
                      onClick={() => {
                        setSmActiveMode(mode)
                        setSmResult(null)
                        setSmError(null)
                        setSmInputs({})
                      }}
                    >
                      <span className="material-symbols-outlined bs-mode-item-icon" style={{ color: mode.color }}>{mode.icon}</span>
                      <div className="bs-mode-item-text">
                        <div className="bs-mode-item-label">{mode.label}</div>
                        <div className="bs-mode-item-desc">{mode.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Sessions footer ── */}
              {sessionList.length > 0 && (
                <div className="bs-sidebar-sessions">
                  <button className="bs-sidebar-sessions-btn" onClick={() => setSidebarOpen(o => !o)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>history</span>
                    Sessions
                    <span className="bs-sidebar-sessions-count">{sessionList.length}</span>
                  </button>
                </div>
              )}
            </>)}
          </div>

          {/* Right Main Panel: Hero Preview or Result */}
          <div className="bs-layout-main">
            {/* Top Bar inside main panel */}
            <div className="bs-main-topbar">
              <div className="bs-topbar-left">
                <span className="bs-topbar-brand">{activeBrand?.name || 'MANTRAM'}</span>
                <span className="bs-topbar-slash">/</span>
                <span className="bs-topbar-studio">{studioView === 'monthly' ? 'Monthly Strategy' : 'Brainstorm Studio'}</span>
              </div>
              <div className="bs-topbar-right">
                {studioView === 'brainstorm' && (
                  <button className="bs-topbar-btn" onClick={() => setSidebarOpen(o => !o)}>
                    <span className="material-symbols-outlined">history</span>
                    Sessions
                  </button>
                )}
                {studioView === 'brainstorm' && (
                  <button className="bs-topbar-btn bs-topbar-btn--new" onClick={resetSession}>
                    <span className="material-symbols-outlined">add</span>
                    New
                  </button>
                )}
              </div>
            </div>

            {/* Monthly Strategy panel */}
            {studioView === 'monthly' ? (
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <MonthlyStrategy />
              </div>
            ) : isHeroScreen ? (
              <>
                {/* Hero Content — scrollable middle */}
                <div className="bs-hero-content">
                  {/* Fidato Greeting Block */}
                  <div className="bs-hero-greeting-block">
                    <div className="bs-hero-avatar">F</div>
                    <div className="bs-hero-greeting-text">
                      <div className="bs-hero-greeting-meta">Fidato • {activeBrand?.name || 'AI'} • {smActiveMode?.label}</div>
                      <div className="bs-hero-greeting-message">{messages[0]?.content}</div>
                    </div>
                  </div>

                  {/* What I'll Build */}
                  {smActiveMode && (
                    <div className="bs-preview-box">
                      <div className="bs-preview-title">WHAT I'LL BUILD FOR YOU</div>
                      <div className="bs-preview-steps">
                        {smActiveMode.buildSteps?.map((step, idx) => (
                          <div key={idx} className="bs-preview-step">
                            <div className="bs-step-num">{idx + 1}</div>
                            <div className="bs-step-text">
                              <span className="bs-step-title">{step.title}</span> — <span className="bs-step-desc">{step.desc}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Research Modules */}
                  {smActiveMode && (
                    <div className="bs-research-box">
                      <div className="bs-preview-title">RESEARCH MODULES RUNNING</div>
                      <div className="bs-research-chips">
                        {['Trending Intel', 'Competitor Scanner', 'Audience Intelligence', 'Ad Intelligence'].map(mod => {
                          const isActive = smActiveMode.researchModules?.includes(mod)
                          return (
                            <div key={mod} className={`bs-research-chip ${isActive ? 'active' : ''}`}>
                              <span className="material-symbols-outlined bs-chip-icon">
                                {isActive ? 'check_circle' : 'radio_button_unchecked'}
                              </span>
                              {mod}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Sticky Action Bar — always visible ── */}
                <div className="bs-hero-action-bar bs-hero-action-bar--sticky">
                  {smError && <div className="bs-error-banner" style={{marginBottom: '0.75rem'}}><span className="material-symbols-outlined" style={{fontSize:'15px',verticalAlign:'middle'}}>warning</span> {smError}</div>}

                  {smLoading ? (
                    <div className="bs-stream-loading">
                      <div className="bs-stream-phase-label">
                        <span className="material-symbols-outlined bs-stream-spin">
                          {smStreamPhase === 'writing' ? 'edit_note' : 'travel_explore'}
                        </span>
                        <span>
                          {smStreamPhase === 'writing'
                            ? `Writing strategy${smTokenCount > 0 ? ` — ${smTokenCount} words` : '...'}`
                            : `Gathering market intelligence for ${activeBrand?.name || 'your brand'}...`}
                        </span>
                        {smStreamPhase === 'writing' && smTokenCount > 0 && (
                          <span className="bs-stream-word-pulse">{smTokenCount} words</span>
                        )}
                      </div>
                      {smStreamTools.length > 0 && (
                        <div className="bs-stream-chips">
                          {smStreamTools.map(t => (
                            <div key={t.tool} className={`bs-stream-chip ${t.status === 'done' ? 'bs-stream-chip--done' : 'bs-stream-chip--active'}`}>
                              <span className={`material-symbols-outlined bs-stream-chip-icon ${t.status === 'working' ? 'bs-stream-spin' : ''}`}>
                                {t.status === 'done' ? 'check_circle' : 'progress_activity'}
                              </span>
                              {t.label}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="bs-stream-progress-track">
                        <div className="bs-stream-progress-fill" style={{
                          width: smStreamPhase === 'writing'
                            ? `${Math.min(95, 60 + (smTokenCount / 8))}%`
                            : smStreamTools.length > 0
                              ? `${Math.min(55, (smStreamTools.filter(t => t.status === 'done').length / Math.max(1, smStreamTools.length)) * 55)}%`
                              : '5%',
                        }} />
                      </div>
                    </div>
                  ) : (
                    <div className="bs-action-buttons">
                      <button className="bs-btn-customise" onClick={() => {
                        const inputField = document.querySelector('.bs-input');
                        if (inputField) inputField.focus();
                        setInput(`I want to build a ${smActiveMode?.label} strategy, but let's customize it first. `)
                      }}>
                        <span className="material-symbols-outlined" style={{fontSize:16,verticalAlign:'middle',marginRight:4}}>tune</span>
                        Customise first
                      </button>
                      <button className="bs-btn-generate" onClick={handleStrategyMode}>
                        <span className="material-symbols-outlined" style={{fontSize:16,verticalAlign:'middle',marginRight:4}}>bolt</span>
                        Generate full strategy
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'none' }}>
                    <textarea className="bs-input" value={input} onChange={e => setInput(e.target.value)} />
                  </div>
                </div>
              </>
            ) : (
              /* Chat / Result View */
              <div className="bs-layout-legacy">
                {/* ── Slim Phase Bar — single active pill + controls ── */}
                <div data-wt="bs-phase" className="bs-phase-bar bs-phase-bar--slim">
                  <div className="bs-phase-pill" style={{ '--phase-color': phaseInfo.color }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{phaseInfo.icon}</span>
                    {phaseInfo.label}
                  </div>
                  {langInfo && (
                    <div className="bs-lang-badge" title={`Copy in ${langInfo.label}`}>
                      {langInfo.flag} {langInfo.label}
                    </div>
                  )}
                  <div style={{ flex: 1 }} />
                  <button className="bs-topbar-btn" onClick={() => setSidebarOpen(o => !o)} title="Session history">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>
                    {sessionList.length > 0 && <span className="bs-sidebar-count" style={{ marginLeft: 2 }}>{sessionList.length}</span>}
                  </button>
                  <button className="bs-topbar-btn bs-topbar-btn--new" onClick={resetSession} title="New session">
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    New
                  </button>
                </div>

                {/* Messages */}
                <div className="bs-messages">
                  {smResult ? (
                    <StrategyModeResult
                      data={smResult}
                      onClose={() => { setSmResult(null); setSmActiveMode(STRATEGY_MODES_LIST[0]); resetSession(); }}
                      navigate={navigate}
                    />
                  ) : (
                    <>
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

                      {/* Reasoning is now rendered inline inside each message bubble */}

                      {error && (
                        <div className="bs-error-banner"><span className="material-symbols-outlined" style={{fontSize:'15px',verticalAlign:'middle'}}>warning</span> {error}</div>
                      )}

                      <div ref={bottomRef} style={{ height: 1 }} />
                    </>
                  )}
                </div>

                {/* Feedback toast */}
                <FeedbackToast message={feedbackToast.message} visible={feedbackToast.visible} />

                {/* Input - Hide if viewing smResult to force starting a new session or closing */}
                {!smResult && (
                  <div data-wt="bs-input" className="bs-input-area">
                    <button
                      className={`bs-mic-btn ${isListening ? 'listening' : ''}`}
                      onClick={toggleVoice}
                      title={isListening ? 'Speak to Fidato' : 'Speak to Fidato'}>
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
                )}
              </div>
            )}

          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}

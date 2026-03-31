import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { brainstormStudio as bsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'

// ── Topic quick-starts ────────────────────────────────────────────────────────
const TOPICS = [
  { id: 'ad-film',        icon: '🎬', label: 'Ad Film',        hint: "let's make an ad film" },
  { id: 'campaign',       icon: '🎯', label: 'Campaign',       hint: "help me plan a marketing campaign" },
  { id: 'product-launch', icon: '🚀', label: 'Product Launch', hint: "I'm launching a new product" },
  { id: 'naming',         icon: '🏷',  label: 'Naming',         hint: "I need help naming something" },
  { id: 'brand-strategy', icon: '📈', label: 'Brand Strategy', hint: "let's build a brand strategy" },
  { id: 'festival',       icon: '🎪', label: 'Festival',       hint: "I want a festival campaign" },
  { id: 'offer',          icon: '💰', label: 'Offer Strategy', hint: "help me design an offer" },
  { id: 'custom',         icon: '💡', label: 'Something Else', hint: "I have an idea I want to brainstorm" },
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
  explore:   { label: 'Exploring',  icon: '🔍', color: '#8b5cf6' },
  ideate:    { label: 'Ideating',   icon: '💡', color: '#f59e0b' },
  scripting: { label: 'Scripting',  icon: '✍️',  color: '#06b6d4' },
  deliver:   { label: 'Delivered',  icon: '🎯', color: '#22c55e' },
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
function ConceptCard({ concept, index, isFilm, onScreenplay, onFeedback }) {
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
        {isFilm && (
          <button className="bs-primary-btn" onClick={() => onScreenplay?.(concept)}>
            ✍️ Write Screenplay
          </button>
        )}
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
          <div className="bs-sp-title">🎬 {screenplay.title || 'Screenplay'}</div>
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
        <div className="bs-sp-title">📈 {strategy.title}</div>
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
          <div className="bs-naming-label">💬 Taglines</div>
          {namingIdeas.taglines.map((t, i) => (
            <div key={i} className="bs-tagline-row">"{t}"</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ideas block (rendered inside Fidato message) ──────────────────────────────
function IdeasBlock({ payload, intent, onScreenplay, onFeedback }) {
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
function Message({ msg, onScreenplay, onFeedback, onSelectOption, isLatest, streaming }) {
  const isFidato = msg.role === 'fidato'
  const showOptions = isFidato
    && msg.questionOptions?.length > 0
    && isLatest
    && !streaming
    && !msg.ideasPayload
    && !msg.screenplayPayload
    && !msg.strategyPayload

  return (
    <div className={`bs-msg-wrap ${isFidato ? 'bs-msg-fidato' : 'bs-msg-user'}`}>
      {isFidato && (
        <div className="bs-fidato-avatar">F</div>
      )}
      <div className={`bs-bubble ${isFidato ? 'bs-bubble-fidato' : 'bs-bubble-user'}`}>
        {msg.content && (
          <p className="bs-bubble-text">{msg.content}</p>
        )}
        {msg.thinking && <ThinkingDots />}

        {/* Clickable chips — pick one or type your own */}
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
          />
        )}
        {msg.screenplayPayload && (
          <ScreenplayView screenplay={msg.screenplayPayload} />
        )}
        {msg.strategyPayload && (
          <StrategyView strategy={msg.strategyPayload} />
        )}
      </div>
    </div>
  )
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

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const currentMsgIdRef = useRef(null)
  const recognitionRef = useRef(null)

  const firstName = user?.name?.split(' ')[0] || 'there'
  const brandName = activeBrand?.name || null

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  // Greeting on mount
  useEffect(() => {
    const greeting = brandName
      ? `Hey ${firstName}! 👋 Fidato here — let's brainstorm for ${brandName} today. What are we working on?`
      : `Hey ${firstName}! 👋 I'm Fidato — your AI brainstorming partner. Select a brand from the top bar and let's get to work. What do you want to create today?`
    setMessages([{ id: 'welcome', role: 'fidato', content: greeting, timestamp: Date.now() }])
  }, [firstName, brandName])

  // Phase sync
  useEffect(() => {
    if (sessionState.screenplayGenerated || sessionState.lastScreenplay) setPhase('deliver')
    else if (sessionState.ideasGenerated) setPhase('ideate')
    else if (sessionState.intent) setPhase('explore')
    else setPhase('explore')
  }, [sessionState])

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
      .map(m => ({ role: m.role, content: m.content || '' }))
      .concat([{ role: 'user', content: msg }])

    setStreaming(true)
    let thinkingShown = false

    try {
      await bsAPI.fidatoChat(
        { message: msg, history, sessionState, brand: activeBrand },
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
          onIdeas: (payload, intent) => {
            updateMessage(fidId, { ideasPayload: payload, intent, thinking: false })
          },
          onScreenplay: (payload) => {
            updateMessage(fidId, { screenplayPayload: payload, thinking: false })
          },
          onStrategy: (payload) => {
            updateMessage(fidId, { strategyPayload: payload, thinking: false })
          },
          onDone: (newState, questionOptions) => {
            if (newState) setSessionState(newState)
            updateMessage(fidId, { thinking: false, questionOptions: questionOptions || null })
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

  // ── Feedback / suggestion handler ───────────────────────────────────────────
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
      }).catch(() => {})
    }
    if (type === 'dislike') sendMessage("Let's try a different direction")
  }, [sessionState.intent, activeBrand, sendMessage])

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
    rec.lang = 'en-IN'
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
    const greeting = brandName
      ? `Fresh start! What should we brainstorm for ${brandName} today? 🚀`
      : `Fresh start! What are we building today? 🚀`
    setMessages([{ id: `w-${Date.now()}`, role: 'fidato', content: greeting, timestamp: Date.now() }])
    setInput('')
    setError(null)
  }, [brandName])

  const phaseInfo = PHASES[phase] || PHASES.explore
  const showTopics = messages.length === 1 && !streaming

  return (
    <DashboardLayout title="Brainstorm Studio" subtitle="Powered by Fidato AI">
      <div className="bs-root">

        {/* Phase bar */}
        <div className="bs-phase-bar">
          <div className="bs-phase-inner">
            {Object.entries(PHASES).map(([key, p]) => (
              <div key={key} className={`bs-phase-step ${phase === key ? 'active' : ''}`}
                style={{ '--phase-color': p.color }}>
                <span>{p.icon}</span>
                <span>{p.label}</span>
              </div>
            ))}
          </div>
          <button className="bs-new-session-btn" onClick={resetSession} title="Start new session">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
            New Session
          </button>
        </div>

        {/* Messages */}
        <div className="bs-messages">

          {/* Topic chips — shown only at start */}
          {showTopics && (
            <div className="bs-topics-wrap">
              <div className="bs-topics-label">What do you want to brainstorm?</div>
              <div className="bs-topics-grid">
                {TOPICS.map(t => (
                  <button key={t.id} className="bs-topic-chip"
                    onClick={() => sendMessage(t.hint)}>
                    <span className="bs-topic-icon">{t.icon}</span>
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
              onSelectOption={sendMessage}
              isLatest={idx === messages.length - 1}
              streaming={streaming}
            />
          ))}

          {error && (
            <div className="bs-error-banner">⚠️ {error}</div>
          )}

          <div ref={bottomRef} style={{ height: 1 }} />
        </div>

        {/* Input */}
        <div className="bs-input-area">
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

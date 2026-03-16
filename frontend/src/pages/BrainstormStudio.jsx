import { useState, useRef, useEffect, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { CreditBadge, CreditTooltipWrapper } from '../components/CreditBadge'
import SmartCommandBox from '../components/SmartCommandBox'
import { stripMarkdown } from '../utils/stripMarkdown'
import { brainstormStudio as bsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'

// ============================================================================
// INTENT CONFIG
// ============================================================================
const INTENTS = [
    { id: 'campaign', icon: 'campaign', label: 'Campaign', desc: 'Full marketing campaign strategy', color: 'from-violet-500 to-purple-600' },
    { id: 'ad-film', icon: 'movie', label: 'Ad Film / Brand Film', desc: 'Script, concept & production plan', color: 'from-red-500 to-orange-600' },
    { id: 'festival', icon: 'celebration', label: 'Festival Activation', desc: 'Festive campaign with cultural hooks', color: 'from-amber-500 to-orange-600' },
    { id: 'product-launch', icon: 'rocket_launch', label: 'Product Launch', desc: 'Launch strategy & execution plan', color: 'from-cyan-500 to-blue-600' },
    { id: 'naming', icon: 'abc', label: 'Product Naming', desc: 'Brand names, taglines, sub-lines', color: 'from-emerald-500 to-green-600' },
    { id: 'offer', icon: 'sell', label: 'Offer Strategy', desc: 'Pricing, bundles, promotions', color: 'from-rose-500 to-pink-600' },
    { id: 'positioning', icon: 'target', label: 'Brand Positioning', desc: 'Differentiation & market stance', color: 'from-indigo-500 to-blue-700' },
    { id: 'trend-hijack', icon: 'trending_up', label: 'Trend Hijack', desc: 'Ride viral moments & trends', color: 'from-fuchsia-500 to-purple-700' },
    { id: 'brand-strategy', icon: 'architecture', label: 'Brand Strategy', desc: 'Full 1–3 month measurable strategy', color: 'from-amber-500 to-yellow-600' },
    { id: 'custom', icon: 'edit', label: 'Something Custom', desc: 'Free-form brainstorm session', color: 'from-slate-500 to-gray-700' },
]

// Score config
const SCORE_META = [
    { key: 'virality', icon: '🔥', label: 'Virality', color: 'bg-orange-500' },
    { key: 'salesImpact', icon: '💰', label: 'Sales Impact', color: 'bg-emerald-500' },
    { key: 'emotionalConnect', icon: '❤️', label: 'Emotional', color: 'bg-rose-500' },
    { key: 'easeOfExecution', icon: '⚡', label: 'Ease', color: 'bg-blue-500' },
]

const FILM_SCORE_META = [
    { key: 'virality', icon: '🔥', label: 'Virality', color: 'bg-orange-500' },
    { key: 'emotionalConnect', icon: '❤️', label: 'Emotional', color: 'bg-rose-500' },
    { key: 'brandRecall', icon: '🧠', label: 'Brand Recall', color: 'bg-violet-500' },
    { key: 'easeOfProduction', icon: '🎬', label: 'Producibility', color: 'bg-cyan-500' },
]

// ============================================================================
// SCORE BAR COMPONENT
// ============================================================================
function ScoreBar({ score, color, label, icon }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs w-4">{icon}</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-700`}
                    style={{ width: `${score * 10}%` }} />
            </div>
            <span className="text-sm text-slate-400 w-4 text-right">{score}</span>
        </div>
    )
}

// ============================================================================
// IDEA CARD COMPONENT
// ============================================================================
function IdeaCard({ idea, index, onExpand, onAction, isFilm, onFeedback, feedbackState, onScreenplay }) {
    const scoreMeta = isFilm ? FILM_SCORE_META : SCORE_META
    const avgScore = idea.scores
        ? Math.round(Object.values(idea.scores).reduce((a, b) => a + b, 0) / Object.keys(idea.scores).length)
        : 0

    return (
        <div className={`glass-panel rounded-2xl p-5 transition-all group animate-fade-in ${feedbackState === 'like' ? 'border-emerald-500/40 bg-emerald-500/5' : feedbackState === 'dislike' ? 'border-rose-500/20 opacity-50' : 'hover:border-primary/30'}`}
            style={{ animationDelay: `${index * 100}ms` }}>
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {isFilm ? `Film ${index + 1}` : `Concept ${index + 1}`}
                        </span>
                        <span className="text-sm text-slate-500">
                            Score: {avgScore}/10
                        </span>
                        {feedbackState === 'like' && <span className="text-xs">✅</span>}
                    </div>
                    <h3 className="text-base font-bold text-white">{idea.title}</h3>
                </div>
                {/* Like/Dislike */}
                <div className="flex gap-1 ml-2">
                    <button onClick={() => onFeedback(idea, 'like')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${feedbackState === 'like' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
                        <span className="material-symbols-outlined text-sm">thumb_up</span>
                    </button>
                    <button onClick={() => onFeedback(idea, 'dislike')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${feedbackState === 'dislike' ? 'bg-rose-500/20 text-rose-400' : 'bg-white/5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'}`}>
                        <span className="material-symbols-outlined text-sm">thumb_down</span>
                    </button>
                </div>
            </div>

            {/* Film-specific fields */}
            {isFilm && idea.logline && (
                <p className="text-sm text-primary/90 italic mb-2">"{idea.logline}"</p>
            )}
            {!isFilm && idea.hook && (
                <p className="text-sm text-primary/90 italic mb-2">"{idea.hook}"</p>
            )}

            <p className="text-sm text-slate-300 leading-relaxed mb-3">{idea.synopsis || idea.description}</p>

            {/* Film metadata */}
            <div className="flex flex-wrap gap-2 mb-3">
                {idea.format && <span className="text-xs bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full">🎬 {idea.format}</span>}
                {idea.emotion && <span className="text-xs bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded-full">💫 {idea.emotion}</span>}
                {idea.targetPersona && <span className="text-xs bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded-full">🎯 {idea.targetPersona}</span>}
                {idea.visualStyle && <span className="text-xs bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-full">🎨 {idea.visualStyle}</span>}
                {idea.visualDirection && !idea.visualStyle && <span className="text-xs bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-full">🎨 {idea.visualDirection}</span>}
                {idea.targetPlatform && <span className="text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">📺 {idea.targetPlatform}</span>}
                {idea.platforms?.map(p => <span key={p} className="text-xs bg-white/5 text-slate-400 px-2 py-0.5 rounded-full">{p}</span>)}
            </div>

            {/* Scores */}
            {idea.scores && (
                <div className="space-y-1.5 mb-4">
                    {scoreMeta.map(s => (
                        <ScoreBar key={s.key} score={idea.scores[s.key] || 0} color={s.color} label={s.label} icon={s.icon} />
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-white/5">
                <button onClick={() => onExpand(idea)}
                    className="flex-1 py-2 rounded-xl bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 cursor-pointer transition-all flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-sm">unfold_more</span> Deep Dive
                </button>
                {isFilm && (
                    <button onClick={() => onScreenplay(idea)}
                        className="flex-1 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/20 cursor-pointer transition-all flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-sm">description</span> Screenplay
                    </button>
                )}
                <button onClick={() => onAction('content', idea)}
                    className="py-2 px-3 rounded-xl bg-white/5 text-slate-300 text-[11px] font-bold hover:bg-white/10 cursor-pointer transition-all"
                    title="Generate Content">
                    <span className="material-symbols-outlined text-sm">edit_note</span>
                </button>
                <button onClick={() => onAction('creative', idea)}
                    className="py-2 px-3 rounded-xl bg-white/5 text-slate-300 text-[11px] font-bold hover:bg-white/10 cursor-pointer transition-all"
                    title="Generate Visual">
                    <span className="material-symbols-outlined text-sm">palette</span>
                </button>
            </div>
        </div>
    )
}

// ============================================================================
// MAIN BRAINSTORM STUDIO
// ============================================================================
export default function BrainstormStudio() {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()

    // Flow state
    const [step, setStep] = useState(0) // 0=intent, 1=questions, 2=confirm, 3=ideas, 4=deep-dive, 5=chat
    const [intent, setIntent] = useState(null)
    const [questions, setQuestions] = useState([])
    const [currentQ, setCurrentQ] = useState(0)
    const [answers, setAnswers] = useState({})
    const [currentAnswer, setCurrentAnswer] = useState('')

    // AI states
    const [loading, setLoading] = useState(false)
    const [loadingMsg, setLoadingMsg] = useState('')
    const [confirmation, setConfirmation] = useState(null)
    const [ideas, setIdeas] = useState(null)
    const [expandedIdea, setExpandedIdea] = useState(null)
    const [brandInsight, setBrandInsight] = useState(null)
    const [ideaFeedback, setIdeaFeedback] = useState({}) // { ideaTitle: 'like'|'dislike' }
    const [screenplay, setScreenplay] = useState(null)
    const [screenplayLoading, setScreenplayLoading] = useState(false)
    const [error, setError] = useState('')

    // Strategy state
    const [strategyData, setStrategyData] = useState(null)
    const [strategyId, setStrategyId] = useState(null)
    const [strategyKpis, setStrategyKpis] = useState([])
    const [strategyMilestones, setStrategyMilestones] = useState([])
    const [slides, setSlides] = useState(null)
    const [slideIndex, setSlideIndex] = useState(0)
    const [slidesLoading, setSlidesLoading] = useState(false)
    const [savedStrategies, setSavedStrategies] = useState([])
    const [trackerView, setTrackerView] = useState(null) // null or strategy object
    const [kpiEditing, setKpiEditing] = useState(null)

    // Chat state (for interactive film refinement)
    const [chatFilm, setChatFilm] = useState(null)
    const [chatHistory, setChatHistory] = useState([])
    const [chatMessage, setChatMessage] = useState('')
    const [chatLoading, setChatLoading] = useState(false)
    const [clickedSuggestions, setClickedSuggestions] = useState(new Set())

    const inputRef = useRef(null)
    const bottomRef = useRef(null)
    const chatBottomRef = useRef(null)
    const activeBrandIdRef = useRef(activeBrand?._id)
    const abortControllerRef = useRef(null)

    const getSignal = useCallback(() => {
        if (abortControllerRef.current) abortControllerRef.current.abort()
        abortControllerRef.current = new AbortController()
        return abortControllerRef.current.signal
    }, [])

    useEffect(() => {
        return () => abortControllerRef.current?.abort()
    }, [])

    useEffect(() => {
        activeBrandIdRef.current = activeBrand?._id
    }, [activeBrand?._id])

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus()
    }, [currentQ, step])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [currentQ, step, loading])

    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatHistory, chatLoading])

    // Reset loop if brand changes mid-process
    useEffect(() => {
        if (activeBrand?._id !== activeBrandIdRef.current) {
            console.log('Brand changed mid-brainstorm, resetting state and aborting processing...')
            abortControllerRef.current?.abort()
            resetAll()
        }
    }, [activeBrand?._id])

    // ========== HANDLERS ==========

    const selectIntent = async (intentId) => {
        const brandIdAtStart = activeBrand?._id
        setIntent(intentId)
        setError('')
        setLoading(true)
        setLoadingMsg(activeBrand ? `Analyzing ${activeBrand.name}'s DNA for your brainstorm...` : 'Preparing questions...')
        try {
            const signal = getSignal()
            const data = await bsAPI.start({
                intent: intentId,
                brand: activeBrand ? {
                    name: activeBrand.name,
                    dna: activeBrand.dna,
                } : null,
            }, { signal })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success) {
                setQuestions(data.questions)
                setBrandInsight(data.brandInsight || null)
                setCurrentQ(0)
                setAnswers({})
                setStep(1)
            } else {
                setError(data.error || 'Failed to start')
            }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        } finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setLoading(false)
            }
        }
    }

    const submitAnswer = () => {
        if (!currentAnswer.trim() && !questions[currentQ]?.optional) return
        const q = questions[currentQ]
        const newAnswers = { ...answers, [q.id]: currentAnswer.trim() || '(skipped)' }
        setAnswers(newAnswers)
        setCurrentAnswer('')

        if (currentQ + 1 < questions.length) {
            setCurrentQ(currentQ + 1)
        } else {
            // All questions answered → confirm
            confirmUnderstanding(newAnswers)
        }
    }

    const confirmUnderstanding = async (ans) => {
        const brandIdAtStart = activeBrand?._id
        setLoading(true)
        setLoadingMsg('Analyzing your brief...')
        setStep(2)
        try {
            const data = await bsAPI.confirm({
                intent,
                answers: ans,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success) {
                setConfirmation(data)
            } else {
                setError(data.error || 'Confirmation failed')
            }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        } finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setLoading(false)
            }
        }
    }

    const generateIdeas = async (refinementHint) => {
        const brandIdAtStart = activeBrand?._id
        setLoading(true)
        setLoadingMsg(refinementHint ? 'Refining ideas...' : 'Generating multi-layer strategy...')
        setStep(3)
        setError('')
        try {
            const fn = refinementHint ? bsAPI.refine : bsAPI.generate
            const data = await fn({
                intent,
                answers,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
                ...(refinementHint ? { refinementPrompt: refinementHint, previousIdeas: ideas } : {}),
            })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success && data.ideas) {
                setIdeas(data.ideas)
            } else {
                setError(data.error || 'Generation failed')
            }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        } finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setLoading(false)
            }
        }
    }

    const handleIdeaAction = (type, idea) => {
        const hook = idea.hook || idea.logline || ''
        const desc = idea.description || idea.synopsis || ''
        if (type === 'content') {
            sessionStorage.setItem('brainstormContext', JSON.stringify({ title: idea.title, hook, description: desc }))
            navigate('/content-studio?fromBrainstorm=true')
        } else if (type === 'creative') {
            sessionStorage.setItem('brainstormContext', JSON.stringify({ prompt: `${idea.title} — ${idea.visualDirection || idea.visualStyle || hook}` }))
            if (intent === 'ad-film') {
                navigate('/video-studio?fromBrainstorm=true')
            } else {
                navigate('/creative-studio?fromBrainstorm=true')
            }
        } else if (type === 'calendar') {
            navigate('/smart-calendar')
        }
    }

    const handleFeedback = async (idea, type) => {
        const key = idea.title
        setIdeaFeedback(prev => ({ ...prev, [key]: type }))
        try {
            await bsAPI.feedback({
                brandId: activeBrand?._id,
                ideaTitle: idea.title,
                ideaDescription: idea.synopsis || idea.description || idea.hook,
                feedback: type,
                intent,
            })
        } catch (e) { console.warn('Feedback save failed:', e) }
    }

    const generateScreenplay = async (filmConcept) => {
        const brandIdAtStart = activeBrand?._id
        setScreenplayLoading(true)
        setScreenplay(null)
        try {
            const signal = getSignal()
            const data = await bsAPI.screenplay({
                filmConcept,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            }, { signal })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success) setScreenplay(data.screenplay)
            else setError(data.error || 'Screenplay generation failed')
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        }
        finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setScreenplayLoading(false)
            }
        }
    }

    // Open interactive chat for a film concept
    const openFilmChat = (film) => {
        setChatFilm({ ...film })
        setChatHistory([])
        setChatMessage('')
        setExpandedIdea(null)
        setStep(5)
    }

    // Send chat message for film refinement
    const sendChatMessage = async (msg) => {
        const brandIdAtStart = activeBrand?._id
        const text = msg || chatMessage.trim()
        if (!text || chatLoading) return

        if (msg) {
            setClickedSuggestions(prev => new Set([...prev, msg]))
        }
        setChatMessage('')
        const newHistory = [...chatHistory, { role: 'user', text }]
        setChatHistory(newHistory)
        setChatLoading(true)
        try {
            const signal = getSignal()
            const data = await bsAPI.chat({
                filmConcept: chatFilm,
                chatHistory: newHistory,
                userMessage: text,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            }, { signal })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success !== false) {
                const aiMsg = { role: 'ai', text: data.message, suggestions: data.suggestions || [] }
                setChatHistory(prev => [...prev, aiMsg])
                if (data.updatedConcept) {
                    setChatFilm(data.updatedConcept)
                }
            } else {
                setChatHistory(prev => [...prev, { role: 'ai', text: data.error || 'Sorry, I couldn\'t process that. Try again.' }])
            }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setChatHistory(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }])
        } finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setChatLoading(false)
            }
        }
    }

    const resetAll = () => {
        setStep(0); setIntent(null); setQuestions([]); setCurrentQ(0); setAnswers({});
        setCurrentAnswer(''); setConfirmation(null); setIdeas(null); setExpandedIdea(null);
        setBrandInsight(null); setIdeaFeedback({}); setScreenplay(null); setError(''); setLoading(false);
        setChatFilm(null); setChatHistory([]); setChatMessage(''); setChatLoading(false); setClickedSuggestions(new Set())
        setStrategyData(null); setStrategyId(null); setStrategyKpis([]); setStrategyMilestones([]);
        setSlides(null); setSlideIndex(0); setSlidesLoading(false); setTrackerView(null); setKpiEditing(null)
    }

    // ========== STRATEGY HANDLERS ==========

    const generateStrategy = async () => {
        const brandIdAtStart = activeBrand?._id
        setLoading(true)
        setLoadingMsg('Building your comprehensive brand strategy...')
        setStep(6)
        setError('')
        try {
            const data = await bsAPI.strategy({
                answers,
                brand: activeBrand ? { _id: activeBrand._id, name: activeBrand.name, dna: activeBrand.dna } : null,
            })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success && data.strategy) {
                setStrategyData(data.strategy)
                setStrategyId(data.strategyId)
                setStrategyKpis(data.kpis || [])
                setStrategyMilestones(data.milestones || [])
            } else {
                setError(data.error || 'Strategy generation failed')
            }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        }
        finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setLoading(false)
            }
        }
    }

    const generateSlides = async () => {
        const brandIdAtStart = activeBrand?._id
        setSlidesLoading(true)
        setSlides(null)
        try {
            const data = await bsAPI.strategySlides({
                strategyId,
                strategy: strategyData,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            })
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success && data.slides) {
                setSlides(data.slides)
                setSlideIndex(0)
                setStep(7)
            } else { setError(data.error || 'Slides generation failed') }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        }
        finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setSlidesLoading(false)
            }
        }
    }

    const updateKpiValue = async (kpiName, value) => {
        if (!strategyId) return
        try {
            const data = await bsAPI.updateKpi(strategyId, { kpiName, current: Number(value) })
            if (data.success) { setStrategyKpis(data.kpis); setKpiEditing(null) }
        } catch (e) { console.warn('KPI update failed:', e) }
    }

    const toggleMilestone = async (milestoneId, completed) => {
        if (!strategyId) return
        try {
            const data = await bsAPI.toggleMilestone(strategyId, { milestoneId, completed })
            if (data.success) setStrategyMilestones(data.milestones)
        } catch (e) { console.warn('Milestone toggle failed:', e) }
    }

    const loadSavedStrategies = async () => {
        try {
            const data = await bsAPI.listStrategies()
            if (data.success) setSavedStrategies(data.strategies || [])
        } catch (e) { console.warn('Failed to load strategies:', e) }
    }

    const openSavedStrategy = async (id) => {
        const brandIdAtStart = activeBrand?._id
        setLoading(true); setLoadingMsg('Loading strategy...')
        try {
            const data = await bsAPI.getStrategy(id)
            if (activeBrandIdRef.current !== brandIdAtStart) return
            if (data.success && data.strategy) {
                const s = data.strategy
                setStrategyData(s.strategy)
                setStrategyId(s._id)
                setStrategyKpis(s.kpis || [])
                setStrategyMilestones(s.milestones || [])
                setIntent('brand-strategy')
                setStep(6)
            }
        } catch (e) {
            if (activeBrandIdRef.current !== brandIdAtStart) return
            setError(e.message)
        }
        finally {
            if (activeBrandIdRef.current === brandIdAtStart) {
                setLoading(false)
            }
        }
    }

    useEffect(() => { loadSavedStrategies() }, [])

    // ========== RENDER ==========

    const intentLabel = INTENTS.find(i => i.id === intent)?.label || 'Brainstorm'

    return (
        <DashboardLayout title="Brainstorm Studio" subtitle="Your agentic strategy partner">
            <SEOHead title="Brainstorm Studio — Mantram AI" noIndex={true} />
            {/* Progress indicator */}
            {step > 0 && (
                <div className="flex items-center gap-2 mb-6">
                    <button onClick={resetAll} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                    </button>
                    {['Intent', 'Brief', 'Confirm', 'Ideas', ...(step === 5 ? ['Refine'] : [])].map((s, i) => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                                ${step > i ? 'bg-primary text-white' : step === i ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-white/5 text-slate-600'}`}>
                                {step > i ? '✓' : i + 1}
                            </div>
                            <span className={`text-xs font-bold ${step >= i ? 'text-slate-300' : 'text-slate-600'}`}>{s}</span>
                            {i < (['Intent', 'Brief', 'Confirm', 'Ideas', ...(step === 5 ? ['Refine'] : [])].length - 1) && <div className={`w-8 h-px ${step > i ? 'bg-primary/40' : 'bg-white/5'}`} />}
                        </div>
                    ))}
                    <div className="ml-auto">
                        <span className="text-sm text-slate-500">{intentLabel}</span>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">error</span> {error}
                    <button onClick={() => setError('')} className="ml-auto text-rose-400/50 hover:text-rose-400 cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* ========== STEP 0: INTENT SELECTION ========== */}
            {step === 0 && (
                <div className="animate-fade-in">
                    <div className="text-center mb-10">
                        <span className="material-symbols-outlined text-5xl text-primary mb-3 block">psychology</span>
                        <h2 className="text-2xl font-black text-white mb-2">What are we building?</h2>
                        <p className="text-sm text-slate-400 max-w-lg mx-auto">Just tell me what you need, or pick a brainstorm type below.</p>
                    </div>

                    {/* Smart Command Box — free-form agentic input */}
                    <div className="max-w-2xl mx-auto mb-10">
                        <SmartCommandBox variant="brainstorm" />
                    </div>

                    <div className="flex items-center gap-3 max-w-4xl mx-auto mb-6">
                        <div className="flex-1 h-px bg-white/[0.06]" />
                        <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">Or choose a brainstorm type</span>
                        <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
                        {INTENTS.map((item, i) => {
                            const isSelected = intent === item.id && loading;
                            const isDimmed = loading && intent !== item.id;

                            return (
                                <button key={item.id} onClick={() => selectIntent(item.id)} disabled={loading}
                                    className={`glass-panel rounded-2xl p-5 text-left hover:border-primary/30 hover:scale-[1.02] transition-all cursor-pointer group animate-fade-in ${isDimmed ? 'opacity-40 grayscale pointer-events-none' : ''}`}
                                    style={{ animationDelay: `${i * 60}ms` }}>
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                                        {isSelected ? (
                                            <span className="material-symbols-outlined text-white text-lg animate-spin">progress_activity</span>
                                        ) : (
                                            <span className="material-symbols-outlined text-white text-lg">{item.icon}</span>
                                        )}
                                    </div>
                                    <h3 className="text-base font-bold text-white mb-1">
                                        {isSelected ? 'Processing...' : item.label}
                                    </h3>
                                    <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                                </button>
                            );
                        })}
                    </div>

                    {loading && (
                        <div className="text-center mt-8">
                            {step !== 0 && <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-2">progress_activity</span>}
                            <p className="text-sm text-slate-400">{loadingMsg}</p>
                        </div>
                    )}

                    {/* Saved Strategies */}
                    {savedStrategies.length > 0 && (
                        <div className="max-w-4xl mx-auto mt-10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-white/[0.06]" />
                                <span className="text-sm text-slate-500 font-bold uppercase tracking-wider">Your Strategies</span>
                                <div className="flex-1 h-px bg-white/[0.06]" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {savedStrategies.slice(0, 6).map(s => (
                                    <button key={s._id} onClick={() => openSavedStrategy(s._id)}
                                        className="glass-panel rounded-xl p-4 text-left hover:border-amber-500/30 cursor-pointer transition-all group">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="material-symbols-outlined text-amber-400 text-base">architecture</span>
                                            <h4 className="text-sm font-bold text-white truncate flex-1">{s.title}</h4>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : s.status === 'completed' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                                {s.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-2 truncate">{s.objective}</p>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${s.overallProgress || 0}%` }} />
                                            </div>
                                            <span className="text-[10px] text-slate-500">{s.overallProgress || 0}%</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== STEP 1: PROGRESSIVE Q&A ========== */}
            {step === 1 && (
                <div className="max-w-2xl mx-auto animate-fade-in">
                    {/* Brand insight banner */}
                    {brandInsight && (
                        <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/15 mb-6 animate-fade-in">
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-primary text-lg mt-0.5">neurology</span>
                                <div>
                                    <p className="text-sm text-primary font-bold uppercase mb-1">Brand Insight</p>
                                    <p className="text-sm text-white leading-relaxed">{brandInsight}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Conversation history */}
                    <div className="space-y-4 mb-6">
                        {questions.slice(0, currentQ + 1).map((q, i) => (
                            <div key={q.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                                {/* AI question */}
                                <div className="flex items-start gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="material-symbols-outlined text-primary text-sm">psychology</span>
                                    </div>
                                    <div className="glass-panel rounded-2xl rounded-tl-md px-4 py-3 max-w-lg">
                                        <p className="text-sm text-white font-medium">{q.q}</p>
                                        {q.optional && <span className="text-sm text-slate-500 italic">Optional — press Enter to skip</span>}
                                    </div>
                                </div>

                                {/* User answer (if answered) */}
                                {answers[q.id] && (
                                    <div className="flex items-start gap-3 justify-end mb-1">
                                        <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-md px-4 py-3 max-w-lg">
                                            <p className="text-sm text-white">{answers[q.id]}</p>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                                        </div>
                                    </div>
                                )}

                                {/* Input for current question */}
                                {i === currentQ && !answers[q.id] && (
                                    <div className="pl-11 space-y-2">
                                        <div className="flex items-center gap-3">
                                            <input ref={inputRef} type="text" value={currentAnswer}
                                                onChange={e => setCurrentAnswer(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && submitAnswer()}
                                                placeholder={q.placeholder}
                                                className="input-glass w-full py-3 text-sm" autoFocus />
                                            <button onClick={submitAnswer}
                                                className={`p-3 rounded-xl transition-all cursor-pointer ${currentAnswer.trim() || q.optional ? 'bg-primary text-white' : 'bg-white/5 text-slate-600'}`}>
                                                <span className="material-symbols-outlined text-sm">send</span>
                                            </button>
                                        </div>
                                        {/* Keyword suggestion chips */}
                                        {q.keywords?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {q.keywords
                                                    .filter(kw => {
                                                        const currentLower = currentAnswer.toLowerCase()
                                                        const kwLower = kw.toLowerCase()
                                                        // Filter out if exact match exists in answer (comma separated)
                                                        const parts = currentLower.split(',').map(p => p.trim())
                                                        return !parts.includes(kwLower)
                                                    })
                                                    .map(kw => (
                                                        <button key={kw} onClick={() => {
                                                            const sep = currentAnswer.trim() ? ', ' : ''
                                                            setCurrentAnswer(prev => prev.trim() ? `${prev.trim()}, ${kw}` : kw)
                                                            inputRef.current?.focus()
                                                        }}
                                                            className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 hover:bg-primary/10 hover:text-primary border border-white/5 hover:border-primary/20 cursor-pointer transition-all">
                                                            {kw}
                                                        </button>
                                                    ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Progress */}
                    <div className="flex items-center gap-2 justify-center mt-8">
                        {questions.map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < currentQ ? 'bg-primary' : i === currentQ ? 'bg-primary/50 w-6' : 'bg-white/10'}`} />
                        ))}
                    </div>

                    {loading && (
                        <div className="text-center mt-8">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-2">progress_activity</span>
                            <p className="text-sm text-slate-400">{loadingMsg}</p>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            )}

            {/* ========== STEP 2: AI CONFIRMS UNDERSTANDING ========== */}
            {step === 2 && (
                <div className="max-w-2xl mx-auto animate-fade-in">
                    {loading ? (
                        <div className="text-center py-20">
                            <span className="material-symbols-outlined text-5xl text-primary animate-spin block mb-4">psychology</span>
                            <h3 className="text-lg font-bold text-white mb-2">Understanding your brief...</h3>
                            <p className="text-sm text-slate-400">The strategy team is analyzing your inputs</p>
                        </div>
                    ) : confirmation && (
                        <div>
                            {/* AI Understanding */}
                            <div className="flex items-start gap-3 mb-6">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-primary">psychology</span>
                                </div>
                                <div className="glass-panel rounded-2xl rounded-tl-md p-5 flex-1">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">Strategy AI</span>
                                        <span className="text-sm text-slate-500">Here's what I understand:</span>
                                    </div>
                                    <p className="text-sm text-white leading-relaxed">{confirmation.summary}</p>
                                </div>
                            </div>

                            {/* Confirm / Refine */}
                            <div className="flex flex-col gap-3 pl-13">
                                <CreditTooltipWrapper action="brainstorm">
                                    <button onClick={() => intent === 'brand-strategy' ? generateStrategy() : generateIdeas()}
                                        className="btn-primary w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                        {intent === 'brand-strategy' ? 'Yes — Generate My Strategy!' : "Yes, that's right — Generate Ideas!"} <CreditBadge action="brainstorm" />
                                    </button>
                                </CreditTooltipWrapper>

                                <p className="text-sm text-slate-500 text-center my-1">Or adjust direction:</p>

                                <div className="flex flex-wrap gap-2">
                                    {confirmation.refinements?.map((r, i) => (
                                        <button key={i} onClick={() => {
                                            setAnswers(prev => ({ ...prev, refinementHint: r }))
                                            generateIdeas(r)
                                        }}
                                            className="glass-panel px-4 py-2.5 rounded-xl text-sm text-slate-300 hover:text-white hover:border-primary/30 cursor-pointer transition-all">
                                            {r}
                                        </button>
                                    ))}
                                </div>

                                <button onClick={() => { setStep(1); setCurrentQ(0); setAnswers({}); setCurrentAnswer('') }}
                                    className="text-sm text-slate-500 hover:text-slate-300 mt-2 cursor-pointer transition-colors">
                                    ← Go back and change answers
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ========== STEP 3: MULTI-LAYER IDEAS ========== */}
            {step === 3 && (
                <div className="animate-fade-in">
                    {loading ? (
                        <div className="text-center py-20">
                            <div className="relative inline-block mb-6">
                                <span className="material-symbols-outlined text-6xl text-primary animate-spin block">neurology</span>
                                <span className="absolute -bottom-1 -right-1 material-symbols-outlined text-2xl text-amber-400 animate-pulse">stars</span>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{loadingMsg}</h3>
                            <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">
                                5 specialist agents are working together: Strategist, Creative Director, Naming Expert, Execution Planner, and Performance Analyst
                            </p>
                            <div className="flex items-center justify-center gap-3 mt-6">
                                {['Strategist', 'Creative', 'Naming', 'Execution', 'Scoring'].map((agent, i) => (
                                    <div key={agent} className="flex flex-col items-center gap-1 animate-fade-in" style={{ animationDelay: `${i * 400}ms` }}>
                                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-primary text-sm">
                                                {['psychology', 'palette', 'abc', 'assignment', 'assessment'][i]}
                                            </span>
                                        </div>
                                        <span className="text-sm text-slate-500">{agent}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : ideas && (
                        <div>
                            {/* Layer 1: Main Concepts (film or campaign) */}
                            <div className="mb-8">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-primary">{intent === 'ad-film' ? 'movie' : 'campaign'}</span>
                                    <h3 className="text-lg font-bold text-white">{intent === 'ad-film' ? 'Film Concepts' : 'Campaign Concepts'}</h3>
                                    <span className="text-sm text-slate-500 ml-1">{intent === 'ad-film' ? '👍 Approve a film to generate screenplay' : 'Layer 1 — Big Ideas'}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {(ideas.filmConcepts || ideas.campaignConcepts)?.map((idea, i) => (
                                        <IdeaCard key={i} idea={idea} index={i}
                                            isFilm={intent === 'ad-film'}
                                            onExpand={setExpandedIdea}
                                            onAction={handleIdeaAction}
                                            onFeedback={handleFeedback}
                                            feedbackState={ideaFeedback[idea.title]}
                                            onScreenplay={generateScreenplay} />
                                    ))}
                                </div>
                            </div>

                            {/* Layer 2: Production Approaches (ad-film) or Tactical Ideas */}
                            {intent === 'ad-film' && ideas.productionApproaches?.length > 0 && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-amber-400">videocam</span>
                                        <h3 className="text-lg font-bold text-white">Production Approaches</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {ideas.productionApproaches.map((p, i) => (
                                            <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in">
                                                <p className="text-sm text-primary font-bold mb-3 uppercase">{p.filmRef}</p>
                                                <div className="space-y-3">
                                                    <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                                        <p className="text-sm text-emerald-400 font-bold mb-1">💰 Low Budget</p>
                                                        <p className="text-sm text-slate-300">{p.lowBudget}</p>
                                                    </div>
                                                    <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                        <p className="text-sm text-amber-400 font-bold mb-1">💎 Mid Budget</p>
                                                        <p className="text-sm text-slate-300">{p.midBudget}</p>
                                                    </div>
                                                    <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/10">
                                                        <p className="text-sm text-violet-400 font-bold mb-1">🎬 High Budget</p>
                                                        <p className="text-sm text-slate-300">{p.highBudget}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {intent !== 'ad-film' && ideas.tacticalIdeas?.length > 0 && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-amber-400">lightbulb</span>
                                        <h3 className="text-lg font-bold text-white">Tactical Ideas</h3>
                                        <span className="text-sm text-slate-500 ml-1">Layer 2 — Execution Angles</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {ideas.tacticalIdeas.map((t, i) => (
                                            <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                                                <p className="text-sm text-primary font-bold mb-3 uppercase">{t.campaignRef}</p>
                                                <div className="space-y-2.5">
                                                    {t.reelIdea && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs">🎬</span>
                                                            <div><p className="text-sm text-slate-500 font-bold">Reel Idea</p><p className="text-sm text-white">{t.reelIdea}</p></div>
                                                        </div>
                                                    )}
                                                    {t.influencerAngle && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs">🤝</span>
                                                            <div><p className="text-sm text-slate-500 font-bold">Influencer</p><p className="text-sm text-white">{t.influencerAngle}</p></div>
                                                        </div>
                                                    )}
                                                    {t.hashtag && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs">#️⃣</span>
                                                            <p className="text-sm text-primary font-bold">{t.hashtag}</p>
                                                        </div>
                                                    )}
                                                    {t.contestIdea && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs">🎉</span>
                                                            <div><p className="text-sm text-slate-500 font-bold">Contest</p><p className="text-sm text-white">{t.contestIdea}</p></div>
                                                        </div>
                                                    )}
                                                    {t.ugcPrompt && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="text-xs">📱</span>
                                                            <div><p className="text-sm text-slate-500 font-bold">UGC</p><p className="text-sm text-white">{t.ugcPrompt}</p></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Layer 3: Naming Ideas */}
                            {ideas.namingIdeas && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-emerald-400">abc</span>
                                        <h3 className="text-lg font-bold text-white">Naming Ideas</h3>
                                        <span className="text-sm text-slate-500 ml-1">Layer 3 — Names & Taglines</span>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* Product naming categories */}
                                            {Object.entries(ideas.namingIdeas).filter(([k]) => k !== 'taglines' && k !== 'hashtags').map(([cat, items]) => (
                                                <div key={cat}>
                                                    <p className="text-xs font-bold text-primary mb-2 capitalize">{cat.replace(/([A-Z])/g, ' $1')}</p>
                                                    {Array.isArray(items) && items.map((item, i) => (
                                                        <div key={i} className="mb-2 py-1.5 border-b border-white/5 last:border-0">
                                                            {typeof item === 'string' ? (
                                                                <p className="text-sm text-white">{item}</p>
                                                            ) : (
                                                                <>
                                                                    <p className="text-sm text-white font-bold">{item.name}</p>
                                                                    <p className="text-sm text-slate-400">{item.meaning}</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Taglines */}
                                        {ideas.namingIdeas.taglines && (
                                            <div className="mt-4 pt-4 border-t border-white/5">
                                                <p className="text-xs font-bold text-primary mb-2">✨ Taglines</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {ideas.namingIdeas.taglines.map((t, i) => (
                                                        <span key={i} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full font-medium">"{t}"</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Hashtags */}
                                        {ideas.namingIdeas.hashtags && (
                                            <div className="mt-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {ideas.namingIdeas.hashtags.map((h, i) => (
                                                        <span key={i} className="text-xs bg-white/5 text-slate-300 px-2 py-1 rounded-full">{h}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Layer 4: Execution Plan */}
                            {ideas.executionPlan && (
                                <div className="mb-8">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-blue-400">assignment</span>
                                        <h3 className="text-lg font-bold text-white">Execution Plan</h3>
                                        <span className="text-sm text-slate-500 ml-1">Layer 4 — Rollout Strategy</span>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        {/* Phases */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                                            {ideas.executionPlan.phases?.map((phase, i) => (
                                                <div key={i} className="p-4 rounded-xl bg-white/3 border border-white/5">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                            {i + 1}
                                                        </span>
                                                        <h4 className="text-base font-bold text-white">{phase.name}</h4>
                                                        <span className="text-sm text-slate-500 ml-auto">{phase.duration}</span>
                                                    </div>
                                                    <ul className="space-y-1">
                                                        {phase.actions?.map((a, j) => (
                                                            <li key={j} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                                                                <span className="text-primary mt-0.5">•</span> {a}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Content Map */}
                                        {ideas.executionPlan.contentMap && (
                                            <div className="flex flex-wrap gap-3 mb-4">
                                                {Object.entries(ideas.executionPlan.contentMap).map(([type, count]) => (
                                                    <div key={type} className="text-center px-4 py-2 rounded-xl bg-primary/5 border border-primary/10">
                                                        <p className="text-lg font-black text-primary">{count}</p>
                                                        <p className="text-sm text-slate-400 capitalize">{type}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Launch Day */}
                                        {ideas.executionPlan.launchDayStrategy && (
                                            <div className="p-3 rounded-xl bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-primary">
                                                <p className="text-sm text-primary font-bold mb-1">🚀 LAUNCH DAY STRATEGY</p>
                                                <p className="text-sm text-slate-300">{ideas.executionPlan.launchDayStrategy}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Follow-up Refinements */}
                            {ideas.followUpSuggestions?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-5 mb-8">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-primary">auto_fix_high</span>
                                        <p className="text-base font-bold text-white">Want to refine?</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {ideas.followUpSuggestions.map((s, i) => (
                                            <button key={i} onClick={() => generateIdeas(s)}
                                                className="glass-panel px-4 py-2.5 rounded-xl text-sm text-slate-300 hover:text-white hover:border-primary/30 cursor-pointer transition-all">
                                                {s}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Custom refinement */}
                                    <div className="flex items-center gap-2 mt-3">
                                        <input type="text" placeholder="Or type your own direction..."
                                            className="input-glass flex-1 py-2.5 text-xs"
                                            onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { generateIdeas(e.target.value.trim()); e.target.value = '' } }} />
                                        <button onClick={resetAll}
                                            className="px-4 py-2.5 rounded-xl glass-panel text-sm text-slate-400 hover:text-white cursor-pointer transition-all">
                                            Start Over
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ========== STEP 6: STRATEGY DASHBOARD ========== */}
            {step === 6 && (
                <div className="animate-fade-in">
                    {loading ? (
                        <div className="text-center py-20">
                            <div className="relative inline-block mb-6">
                                <span className="material-symbols-outlined text-6xl text-amber-400 animate-spin block">architecture</span>
                                <span className="absolute -bottom-1 -right-1 material-symbols-outlined text-2xl text-primary animate-pulse">stars</span>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">{loadingMsg}</h3>
                            <p className="text-sm text-slate-500 max-w-md mx-auto mt-2">Our CMO agent is analyzing your brand, objectives, and market to build a measurable strategy</p>
                            <div className="flex items-center justify-center gap-3 mt-6">
                                {['Market Analysis', 'Channel Planning', 'KPI Setting', 'Budget Allocation', 'Timeline'].map((a, i) => (
                                    <div key={a} className="flex flex-col items-center gap-1 animate-fade-in" style={{ animationDelay: `${i * 500}ms` }}>
                                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-amber-400 text-sm">{['analytics', 'hub', 'target', 'payments', 'schedule'][i]}</span>
                                        </div>
                                        <span className="text-[10px] text-slate-500">{a}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : strategyData && (
                        <div>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-black text-white">{strategyData.title}</h2>
                                    <p className="text-sm text-slate-400 mt-1">{strategyData.duration} · {strategyData.budget_total}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={generateSlides} disabled={slidesLoading}
                                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold hover:border-amber-400/50 cursor-pointer transition-all flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">{slidesLoading ? 'progress_activity' : 'slideshow'}</span>
                                        {slidesLoading ? 'Generating...' : 'Generate Presentation'}
                                    </button>
                                    <button onClick={resetAll} className="px-3 py-2.5 rounded-xl glass-panel text-xs text-slate-400 hover:text-white cursor-pointer transition-all">
                                        <span className="material-symbols-outlined text-sm">restart_alt</span>
                                    </button>
                                </div>
                            </div>

                            {/* Executive Summary */}
                            <div className="glass-panel rounded-2xl p-5 mb-6 border-l-4 border-amber-500">
                                <h3 className="text-sm font-bold text-amber-400 uppercase mb-2">Executive Summary</h3>
                                <p className="text-sm text-white leading-relaxed">{strategyData.executive_summary}</p>
                                <p className="text-xs text-slate-400 mt-2"><strong>Objective:</strong> {strategyData.objective}</p>
                            </div>

                            {/* Success Probability + Competitive Landscape */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {strategyData.success_probability && (
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-emerald-400 text-base">speed</span> Success Probability
                                        </h3>
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="relative w-16 h-16">
                                                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                                    <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                                    <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3" strokeDasharray={`${strategyData.success_probability.overall * 0.88} 88`}
                                                        stroke={strategyData.success_probability.overall >= 70 ? '#10b981' : strategyData.success_probability.overall >= 50 ? '#f59e0b' : '#ef4444'}
                                                        strokeLinecap="round" />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-white">{strategyData.success_probability.overall}%</span>
                                            </div>
                                            <p className="text-xs text-slate-300 flex-1 leading-relaxed">{strategyData.success_probability.reasoning}</p>
                                        </div>
                                        {strategyData.success_probability.key_dependencies?.length > 0 && (
                                            <div className="space-y-1 mt-2">
                                                <p className="text-[10px] text-slate-500 uppercase font-bold">Key Dependencies</p>
                                                {strategyData.success_probability.key_dependencies.map((d, i) => (
                                                    <p key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5"><span className="text-amber-400">⚡</span> {d}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {strategyData.competitive_landscape && (
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-violet-400 text-base">groups</span> Competitive Landscape
                                        </h3>
                                        {strategyData.competitive_landscape.likely_competitors?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {strategyData.competitive_landscape.likely_competitors.map((c, i) => (
                                                    <span key={i} className="text-[10px] bg-violet-500/10 text-violet-300 px-2 py-0.5 rounded-full">{c}</span>
                                                ))}
                                            </div>
                                        )}
                                        <p className="text-xs text-slate-400 mb-2"><strong className="text-slate-300">Strengths:</strong> {strategyData.competitive_landscape.competitor_strengths}</p>
                                        <p className="text-xs text-emerald-300 mb-3"><strong className="text-emerald-200">🎯 Gap:</strong> {strategyData.competitive_landscape.competitive_gaps}</p>
                                        {strategyData.competitive_landscape.industry_benchmarks && (
                                            <div className="grid grid-cols-2 gap-2">
                                                {Object.entries(strategyData.competitive_landscape.industry_benchmarks).map(([k, v]) => (
                                                    <div key={k} className="text-center p-2 rounded-lg bg-white/3">
                                                        <p className="text-xs font-bold text-white">{v}</p>
                                                        <p className="text-[10px] text-slate-500 capitalize">{k.replace(/avg_/g, '').replace(/_/g, ' ')}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Channel Synergy */}
                            {strategyData.channel_synergy?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-4 mb-6 border-l-4 border-primary">
                                    <h3 className="text-sm font-bold text-primary uppercase mb-2">🔗 Channel Synergy</h3>
                                    <div className="space-y-2">
                                        {strategyData.channel_synergy.map((s, i) => (
                                            <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/2">
                                                <span className="text-base">🔄</span>
                                                <div className="flex-1">
                                                    <p className="text-xs text-white font-mono">{s.flow}</p>
                                                    <p className="text-[11px] text-emerald-400 mt-0.5">↳ {s.impact}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Impact Factors */}
                            {strategyData.impact_factors?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-4 mb-6">
                                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-cyan-400 text-base">trending_up</span> Impact Factors
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {strategyData.impact_factors.map((f, i) => (
                                            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-white/2">
                                                <span className={`text-xs mt-0.5 ${f.impact === 'positive' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    {f.impact === 'positive' ? '↑' : '↓'}
                                                </span>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-white">{f.factor}</span>
                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${f.magnitude === 'high' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>{f.magnitude}</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">{f.detail}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reality Check */}
                            {strategyData.reality_check?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-4 mb-6 border-l-4 border-cyan-500">
                                    <h3 className="text-sm font-bold text-cyan-400 uppercase mb-3">🔍 Reality Check</h3>
                                    <div className="space-y-3">
                                        {strategyData.reality_check.map((r, i) => (
                                            <div key={i} className="p-3 rounded-xl bg-white/2">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-bold text-white">"{r.claim}"</span>
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ml-auto ${r.verdict?.toLowerCase().includes('achievable') || r.verdict?.toLowerCase().includes('realistic') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                        {r.verdict}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-slate-400">{r.reality}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Quick Wins */}
                            {strategyData.quick_wins?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-4 mb-6 border-l-4 border-emerald-500">
                                    <h3 className="text-sm font-bold text-emerald-400 uppercase mb-2">⚡ Quick Wins</h3>
                                    <div className="space-y-1">
                                        {strategyData.quick_wins.map((w, i) => (
                                            <p key={i} className="text-sm text-slate-300 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">•</span> {w}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Channel Strategy Cards */}
                            <div className="mb-6">
                                <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">hub</span> Channel Strategies
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {strategyData.channels && Object.entries(strategyData.channels).filter(([, d]) => d?.enabled).map(([key, ch]) => {
                                        const icons = { social_media: '📱', seo_sem: '🔍', performance_marketing: '📊', influencer_marketing: '🤝', content_marketing: '✍️', ad_films_reels: '🎬', offline_campaigns: '🏪' }
                                        const colorMap = { social_media: '#8b5cf6', seo_sem: '#3b82f6', performance_marketing: '#10b981', influencer_marketing: '#f43f5e', content_marketing: '#06b6d4', ad_films_reels: '#f59e0b', offline_campaigns: '#64748b' }
                                        const hex = colorMap[key] || '#64748b'
                                        return (
                                            <div key={key} className="glass-panel rounded-2xl p-5 border-t-2" style={{ borderTopColor: `${hex}66` }}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="text-lg">{icons[key] || '📌'}</span>
                                                    <h4 className="text-sm font-bold text-white capitalize">{key.replace(/_/g, ' ')}</h4>
                                                    <span className="text-[10px] ml-auto px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${hex}1a`, color: hex }}>{ch.budget_split}</span>
                                                </div>
                                                {ch.why_this_channel && <p className="text-[10px] text-primary italic mb-2">💡 {ch.why_this_channel}</p>}
                                                <p className="text-xs text-slate-300 leading-relaxed mb-3">{ch.strategy}</p>
                                                {ch.tactics?.length > 0 && (
                                                    <div className="space-y-1 mb-3">
                                                        {ch.tactics.slice(0, 3).map((t, i) => (
                                                            <p key={i} className="text-[11px] text-slate-400 flex items-start gap-1.5"><span className="mt-0.5" style={{ color: hex }}>→</span> {t}</p>
                                                        ))}
                                                    </div>
                                                )}
                                                {ch.expected_output && <p className="text-[10px] text-emerald-300/70 mb-2">📊 {ch.expected_output}</p>}
                                                {ch.budget_rationale && <p className="text-[10px] text-amber-300/60 mb-2">💰 {ch.budget_rationale}</p>}
                                                {ch.platforms?.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {ch.platforms.map(p => <span key={p} className="text-[10px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded-full">{p}</span>)}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* KPI Tracker */}
                            <div className="glass-panel rounded-2xl p-5 mb-6">
                                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-emerald-400">target</span> KPI Tracker
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {strategyKpis.map((kpi, i) => {
                                        const pct = kpi.target > 0 ? Math.min(100, Math.round((kpi.current / kpi.target) * 100)) : 0
                                        return (
                                            <div key={i} className="p-3 rounded-xl bg-white/3 border border-white/5">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-bold text-white">{kpi.name}</span>
                                                    <span className="text-[10px] text-slate-500 capitalize">{kpi.channel?.replace(/_/g, ' ')}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all duration-700 ${pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                            style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-300 w-10 text-right">{pct}%</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    {kpiEditing === kpi.name ? (
                                                        <input type="number" autoFocus className="input-glass w-20 py-1 px-2 text-xs"
                                                            defaultValue={kpi.current}
                                                            onBlur={e => updateKpiValue(kpi.name, e.target.value)}
                                                            onKeyDown={e => e.key === 'Enter' && updateKpiValue(kpi.name, e.target.value)} />
                                                    ) : (
                                                        <button onClick={() => setKpiEditing(kpi.name)}
                                                            className="text-[11px] text-slate-500 hover:text-primary cursor-pointer transition-colors">
                                                            {kpi.current} / {kpi.target} {kpi.unit}
                                                        </button>
                                                    )}
                                                    <button onClick={() => setKpiEditing(kpi.name)}
                                                        className="text-[10px] text-primary/60 hover:text-primary cursor-pointer">update</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Milestones */}
                            {strategyMilestones.length > 0 && (
                                <div className="glass-panel rounded-2xl p-5 mb-6">
                                    <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-violet-400">checklist</span> Milestones
                                    </h3>
                                    <div className="space-y-2">
                                        {strategyMilestones.map((m) => (
                                            <label key={m._id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white/2 hover:bg-white/4 cursor-pointer transition-all group">
                                                <input type="checkbox" checked={m.completed} onChange={e => toggleMilestone(m._id, e.target.checked)}
                                                    className="w-4 h-4 rounded border-slate-600 bg-white/5 accent-primary cursor-pointer" />
                                                <span className={`text-sm flex-1 ${m.completed ? 'text-slate-500 line-through' : 'text-white'}`}>{m.title}</span>
                                                <span className="text-[10px] text-slate-600 capitalize">{m.channel?.replace(/_/g, ' ')}</span>
                                                <span className="text-[10px] text-slate-600">Wk {m.week}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Timeline */}
                            {strategyData.timeline?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-5 mb-6">
                                    <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-blue-400">timeline</span> Execution Roadmap
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {strategyData.timeline.map((phase, i) => (
                                            <div key={i} className="relative p-4 rounded-xl bg-white/3 border border-white/5">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-amber-500/20 text-amber-400' : i === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{i + 1}</span>
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{phase.phase}</p>
                                                        <p className="text-[10px] text-slate-500">{phase.weeks}</p>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-400 mb-2">{phase.focus}</p>
                                                <div className="space-y-1">
                                                    {phase.deliverables?.map((d, j) => (
                                                        <p key={j} className="text-[11px] text-slate-300 flex items-start gap-1.5"><span className="text-primary">•</span> {d}</p>
                                                    ))}
                                                </div>
                                                {phase.expected_results && <p className="text-[10px] text-emerald-400/60 mt-2 italic">📈 {phase.expected_results}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Budget Breakdown */}
                            {strategyData.budget_breakdown?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-5 mb-6">
                                    <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-400 text-base">payments</span> Budget Allocation
                                    </h3>
                                    <div className="space-y-2">
                                        {strategyData.budget_breakdown.map((b, i) => (
                                            <div key={i}>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs text-slate-300 w-32 truncate">{b.channel}</span>
                                                    <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-500 rounded-full transition-all" style={{ width: `${b.percentage}%` }} />
                                                    </div>
                                                    <span className="text-xs text-slate-400 w-16 text-right">{b.amount}</span>
                                                    <span className="text-xs text-amber-400 w-10 text-right font-bold">{b.percentage}%</span>
                                                </div>
                                                {b.rationale && <p className="text-[10px] text-slate-500 ml-32 pl-3 mt-0.5">↳ {b.rationale}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Risk Mitigation */}
                            {strategyData.risk_mitigation?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-4 mb-6">
                                    <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-rose-400 text-base">shield</span> Risk Mitigation
                                    </h3>
                                    <div className="space-y-2">
                                        {strategyData.risk_mitigation.map((r, i) => (
                                            <div key={i} className="flex items-start gap-2 text-xs">
                                                <span className="text-rose-400 font-bold shrink-0">⚠️ {r.risk}:</span>
                                                <span className="text-slate-300">{r.mitigation}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ========== STEP 7: SLIDESHOW VIEWER ========== */}
            {step === 7 && slides && (
                <div className="fixed inset-0 z-50 bg-[#0a0a0f] flex flex-col"
                    tabIndex={0}
                    onKeyDown={e => {
                        if (e.key === 'ArrowRight' || e.key === ' ') setSlideIndex(i => Math.min(i + 1, slides.length - 1))
                        if (e.key === 'ArrowLeft') setSlideIndex(i => Math.max(i - 1, 0))
                        if (e.key === 'Escape') setStep(6)
                    }}
                    ref={el => el?.focus()}>
                    {/* Top bar */}
                    <div className="flex items-center justify-between px-6 py-3 bg-black/40 border-b border-white/5">
                        <span className="text-sm text-slate-400">{slideIndex + 1} / {slides.length}</span>
                        <button onClick={() => setStep(6)} className="text-sm text-slate-400 hover:text-white cursor-pointer flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">close</span> Exit
                        </button>
                    </div>

                    {/* Slide */}
                    <div className="flex-1 flex items-center justify-center p-8 relative">
                        {(() => {
                            const slide = slides[slideIndex]
                            if (!slide) return null
                            const accent = slide.accent_color || '#6366f1'
                            return (
                                <div className="w-full max-w-4xl aspect-[16/9] rounded-3xl p-10 flex flex-col justify-center relative overflow-hidden animate-fade-in"
                                    style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05, #0f0f1a)`, border: `1px solid ${accent}25` }}>
                                    {slide.layout === 'hero' && (
                                        <div className="text-center">
                                            <h1 className="text-4xl font-black text-white mb-4">{slide.title}</h1>
                                            {slide.subtitle && <p className="text-lg text-slate-300">{slide.subtitle}</p>}
                                        </div>
                                    )}
                                    {slide.layout === 'bullets' && (
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-6">{slide.title}</h2>
                                            <div className="space-y-3">
                                                {slide.content?.items?.map((item, i) => (
                                                    <div key={i} className="flex items-start gap-3 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                                                        <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: accent }} />
                                                        <p className="text-base text-slate-200">{item}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {slide.layout === 'stats' && (
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-2">{slide.title}</h2>
                                            {slide.subtitle && <p className="text-sm text-slate-400 mb-6">{slide.subtitle}</p>}
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {slide.content?.stats?.map((s, i) => (
                                                    <div key={i} className="text-center p-4 rounded-xl" style={{ background: `${accent}10`, border: `1px solid ${accent}20` }}>
                                                        <p className="text-2xl font-black text-white">{s.value}</p>
                                                        <p className="text-xs text-slate-400 mt-1">{s.label}</p>
                                                        {s.sub && <p className="text-[10px] text-slate-500">{s.sub}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {slide.layout === 'grid' && (
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-6">{slide.title}</h2>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {slide.content?.cards?.map((card, i) => (
                                                    <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5">
                                                        <span className="text-xl mb-2 block">{card.icon}</span>
                                                        <p className="text-sm font-bold text-white mb-1">{card.title}</p>
                                                        <p className="text-xs text-slate-400">{card.desc}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {slide.layout === 'timeline' && (
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-6">{slide.title}</h2>
                                            <div className="flex gap-4">
                                                {slide.content?.phases?.map((phase, i) => (
                                                    <div key={i} className="flex-1 p-4 rounded-xl border border-white/5" style={{ background: `${accent}08` }}>
                                                        <p className="text-sm font-bold text-white mb-1">{phase.name}</p>
                                                        <p className="text-[10px] text-slate-500 mb-2">{phase.weeks}</p>
                                                        <div className="space-y-1">
                                                            {phase.items?.map((t, j) => <p key={j} className="text-xs text-slate-300">• {t}</p>)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {slide.layout === 'comparison' && (
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-6">{slide.title}</h2>
                                            <div className="space-y-3">
                                                {slide.content?.rows?.map((row, i) => (
                                                    <div key={i} className="flex items-center gap-3">
                                                        <span className="text-sm text-slate-300 w-36">{row.label}</span>
                                                        <div className="flex-1 h-4 bg-white/5 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${row.bar}%`, background: accent }} />
                                                        </div>
                                                        <span className="text-sm text-white font-bold w-16 text-right">{row.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {(slide.layout === 'quote' || slide.layout === 'cta') && (
                                        <div className="text-center">
                                            <h2 className="text-3xl font-black text-white mb-4">{slide.title}</h2>
                                            {slide.subtitle && <p className="text-lg text-slate-300 mb-4">{slide.subtitle}</p>}
                                            {slide.content?.text && <p className="text-base text-slate-400 max-w-xl mx-auto">{slide.content.text}</p>}
                                        </div>
                                    )}
                                    {!['hero', 'bullets', 'stats', 'grid', 'timeline', 'comparison', 'quote', 'cta'].includes(slide.layout) && (
                                        <div>
                                            <h2 className="text-2xl font-black text-white mb-4">{slide.title}</h2>
                                            {slide.subtitle && <p className="text-base text-slate-300 mb-3">{slide.subtitle}</p>}
                                            {slide.content && typeof slide.content === 'object' && (
                                                <pre className="text-xs text-slate-400 whitespace-pre-wrap">{JSON.stringify(slide.content, null, 2)}</pre>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })()}

                        {/* Nav arrows */}
                        {slideIndex > 0 && (
                            <button onClick={() => setSlideIndex(i => i - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-white">chevron_left</span>
                            </button>
                        )}
                        {slideIndex < slides.length - 1 && (
                            <button onClick={() => setSlideIndex(i => i + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-white">chevron_right</span>
                            </button>
                        )}
                    </div>

                    {/* Slide dots */}
                    <div className="flex items-center justify-center gap-1.5 py-4">
                        {slides.map((_, i) => (
                            <button key={i} onClick={() => setSlideIndex(i)}
                                className={`w-2 h-2 rounded-full transition-all cursor-pointer ${i === slideIndex ? 'bg-primary w-6' : 'bg-white/10 hover:bg-white/20'}`} />
                        ))}
                    </div>
                </div>
            )}

            {/* ========== DEEP DIVE MODAL ========== */}
            {expandedIdea && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={(e) => e.target === e.currentTarget && setExpandedIdea(null)}>
                    <div className="glass-panel rounded-3xl p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <span className="text-sm text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-full">Deep Dive</span>
                                <h2 className="text-xl font-black text-white mt-2">{expandedIdea.title}</h2>
                            </div>
                            <button onClick={() => setExpandedIdea(null)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer">
                                <span className="material-symbols-outlined text-slate-400">close</span>
                            </button>
                        </div>

                        {/* Film-specific or Generic content */}
                        {intent === 'ad-film' ? (
                            <>
                                {expandedIdea.logline && <p className="text-primary italic text-sm mb-3">"{expandedIdea.logline}"</p>}
                                <p className="text-sm text-slate-300 leading-relaxed mb-4">{expandedIdea.synopsis || expandedIdea.description}</p>

                                {/* Film metadata chips */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {expandedIdea.format && <span className="text-xs bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded-full">🎬 {expandedIdea.format}</span>}
                                    {expandedIdea.emotion && <span className="text-xs bg-rose-500/10 text-rose-300 px-2 py-0.5 rounded-full">💫 {expandedIdea.emotion}</span>}
                                    {expandedIdea.visualStyle && <span className="text-xs bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-full">🎨 {expandedIdea.visualStyle}</span>}
                                    {expandedIdea.targetPlatform && <span className="text-xs bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full">📺 {expandedIdea.targetPlatform}</span>}
                                </div>

                                {/* Film detail fields */}
                                <div className="space-y-3 mb-5">
                                    {expandedIdea.openingShot && (
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs">🎬</span>
                                            <div><p className="text-sm text-slate-500 font-bold">Opening Shot</p><p className="text-sm text-white">{expandedIdea.openingShot}</p></div>
                                        </div>
                                    )}
                                    {expandedIdea.closingShot && (
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs">🎥</span>
                                            <div><p className="text-sm text-slate-500 font-bold">Closing Shot</p><p className="text-sm text-white">{expandedIdea.closingShot}</p></div>
                                        </div>
                                    )}
                                    {expandedIdea.castSuggestion && (
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs">🎭</span>
                                            <div><p className="text-sm text-slate-500 font-bold">Cast Suggestion</p><p className="text-sm text-white">{expandedIdea.castSuggestion}</p></div>
                                        </div>
                                    )}
                                    {expandedIdea.musicMood && (
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs">🎵</span>
                                            <div><p className="text-sm text-slate-500 font-bold">Music Mood</p><p className="text-sm text-white">{expandedIdea.musicMood}</p></div>
                                        </div>
                                    )}
                                </div>

                                {/* Film scores */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                    {FILM_SCORE_META.map(s => (
                                        <div key={s.key} className="text-center p-3 rounded-xl bg-white/3">
                                            <span className="text-lg">{s.icon}</span>
                                            <p className="text-xl font-black text-white mt-1">{expandedIdea.scores?.[s.key] || 0}</p>
                                            <p className="text-sm text-slate-500">{s.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Film-specific actions */}
                                <div className="flex gap-3">
                                    <button onClick={() => openFilmChat(expandedIdea)}
                                        className="flex-1 btn-primary py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">chat</span> Refine This Film
                                    </button>
                                    <button onClick={() => { generateScreenplay(expandedIdea); setExpandedIdea(null) }}
                                        className="flex-1 py-3 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer transition-all">
                                        <span className="material-symbols-outlined text-sm">description</span> Generate Screenplay
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-primary italic text-sm mb-4">"{expandedIdea.hook}"</p>
                                <p className="text-sm text-slate-300 leading-relaxed mb-6">{expandedIdea.description}</p>

                                {/* Scores */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                                    {SCORE_META.map(s => (
                                        <div key={s.key} className="text-center p-3 rounded-xl bg-white/3">
                                            <span className="text-lg">{s.icon}</span>
                                            <p className="text-xl font-black text-white mt-1">{expandedIdea.scores?.[s.key] || 0}</p>
                                            <p className="text-sm text-slate-500">{s.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Details */}
                                <div className="space-y-3 mb-6">
                                    {expandedIdea.targetPersona && (
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs">🎯</span>
                                            <div><p className="text-sm text-slate-500 font-bold">Target Persona</p><p className="text-sm text-white">{expandedIdea.targetPersona}</p></div>
                                        </div>
                                    )}
                                    {expandedIdea.visualDirection && (
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs">🎨</span>
                                            <div><p className="text-sm text-slate-500 font-bold">Visual Direction</p><p className="text-sm text-white">{expandedIdea.visualDirection}</p></div>
                                        </div>
                                    )}
                                </div>

                                {/* Generic actions */}
                                <div className="flex gap-3">
                                    <CreditTooltipWrapper action="content">
                                        <button onClick={() => { handleIdeaAction('content', expandedIdea); setExpandedIdea(null) }}
                                            className="flex-1 btn-primary py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">edit_note</span> Generate Content <CreditBadge action="content" />
                                        </button>
                                    </CreditTooltipWrapper>
                                    <button onClick={() => { handleIdeaAction('creative', expandedIdea); setExpandedIdea(null) }}
                                        className="flex-1 py-3 rounded-xl glass-panel text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center gap-2 cursor-pointer transition-all">
                                        <span className="material-symbols-outlined text-sm">palette</span> Generate Visual
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ========== STEP 5: INTERACTIVE FILM CHAT ========== */}
            {step === 5 && chatFilm && (
                <div className="animate-fade-in max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
                    {/* Chat header */}
                    <div className="flex items-center gap-4 mb-4 flex-shrink-0">
                        <button onClick={() => { setStep(3); setChatFilm(null); setChatHistory([]) }}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-slate-400 text-sm">arrow_back</span>
                        </button>
                        <div className="flex-1">
                            <h3 className="text-base font-bold text-white">{chatFilm.title}</h3>
                            <p className="text-sm text-slate-500">Refine this film concept with your creative director</p>
                        </div>
                        <button onClick={() => generateScreenplay(chatFilm)}
                            className="px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 cursor-pointer transition-all flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm">description</span> Generate Screenplay
                        </button>
                    </div>

                    {/* Current concept card (collapsible) */}
                    <div className="glass-panel rounded-2xl p-4 mb-4 flex-shrink-0">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <span className="material-symbols-outlined text-primary text-sm">movie</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-primary font-bold mb-1">Current Concept</p>
                                {chatFilm.logline && <p className="text-sm text-white italic mb-1">"{chatFilm.logline}"</p>}
                                <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">{chatFilm.synopsis || chatFilm.description}</p>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {chatFilm.format && <span className="text-xs bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded-full">{chatFilm.format}</span>}
                                    {chatFilm.emotion && <span className="text-xs bg-rose-500/10 text-rose-300 px-1.5 py-0.5 rounded-full">{chatFilm.emotion}</span>}
                                    {chatFilm.visualStyle && <span className="text-xs bg-cyan-500/10 text-cyan-300 px-1.5 py-0.5 rounded-full">{chatFilm.visualStyle}</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1" style={{ minHeight: 0 }}>
                        {/* Welcome message */}
                        {chatHistory.length === 0 && (
                            <div className="flex items-start gap-3 animate-fade-in">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-primary text-sm">psychology</span>
                                </div>
                                <div className="glass-panel rounded-2xl rounded-tl-md px-4 py-3 max-w-lg">
                                    <p className="text-sm text-white">I love this concept! Let's refine it together. What would you like to change or improve? You can adjust the story, tone, visual style, cast, music — anything.</p>
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {['Make it more emotional', 'Change the visual style', 'Adjust the story arc', 'Different music mood', 'Change the cast direction']
                                            .filter(s => !clickedSuggestions.has(s))
                                            .map(s => (
                                                <button key={s} onClick={() => sendChatMessage(s)}
                                                    className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 hover:bg-primary/10 hover:text-primary border border-white/5 hover:border-primary/20 cursor-pointer transition-all">
                                                    {s}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {chatHistory.map((msg, i) => (
                            <div key={i} className={`flex items-start gap-3 animate-fade-in ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                {msg.role === 'ai' && (
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-primary text-sm">psychology</span>
                                    </div>
                                )}
                                <div className={`rounded-2xl px-4 py-3 max-w-lg ${msg.role === 'user'
                                    ? 'bg-primary/10 border border-primary/20 rounded-tr-md'
                                    : 'glass-panel rounded-tl-md'
                                    }`}>
                                    <p className="text-sm text-white whitespace-pre-wrap">{stripMarkdown(msg.text)}</p>
                                    {msg.suggestions?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {msg.suggestions
                                                .filter(s => !clickedSuggestions.has(s))
                                                .map((s, j) => (
                                                    <button key={j} onClick={() => sendChatMessage(s)}
                                                        className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-slate-400 hover:bg-primary/10 hover:text-primary border border-white/5 hover:border-primary/20 cursor-pointer transition-all">
                                                        {s}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                                {msg.role === 'user' && (
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                                    </div>
                                )}
                            </div>
                        ))}

                        {chatLoading && (
                            <div className="flex items-start gap-3 animate-fade-in">
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-primary text-sm animate-spin">progress_activity</span>
                                </div>
                                <div className="glass-panel rounded-2xl rounded-tl-md px-4 py-3">
                                    <p className="text-sm text-slate-400">Thinking creatively...</p>
                                </div>
                            </div>
                        )}
                        <div ref={chatBottomRef} />
                    </div>

                    {/* Chat input */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <input type="text" value={chatMessage}
                            onChange={e => setChatMessage(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                            placeholder="Type your ideas, changes, or feedback..."
                            className="input-glass flex-1 py-3 text-sm" autoFocus />
                        <button onClick={() => sendChatMessage()} disabled={chatLoading || !chatMessage.trim()}
                            className={`p-3 rounded-xl transition-all cursor-pointer ${chatMessage.trim() ? 'bg-primary text-white' : 'bg-white/5 text-slate-600'}`}>
                            <span className="material-symbols-outlined text-sm">send</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ========== SCREENPLAY LOADING ========== */}
            {screenplayLoading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="text-center">
                        <span className="material-symbols-outlined text-6xl text-primary animate-spin block mb-4">movie</span>
                        <h3 className="text-lg font-bold text-white mb-2">Writing your screenplay...</h3>
                        <p className="text-sm text-slate-400">Scene by scene, shot by shot</p>
                    </div>
                </div>
            )}

            {/* ========== SCREENPLAY MODAL ========== */}
            {screenplay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                    onClick={(e) => e.target === e.currentTarget && setScreenplay(null)}>
                    <div className="glass-panel rounded-3xl p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <span className="text-sm text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">📜 Screenplay</span>
                                <h2 className="text-xl font-black text-white mt-2">{screenplay.title}</h2>
                                <p className="text-sm text-slate-400 mt-1">{screenplay.format} · {screenplay.totalScenes} scenes</p>
                            </div>
                            <button onClick={() => setScreenplay(null)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer">
                                <span className="material-symbols-outlined text-slate-400">close</span>
                            </button>
                        </div>

                        {/* Scenes */}
                        <div className="space-y-4 mb-6">
                            {screenplay.scenes?.map((scene) => (
                                <div key={scene.sceneNumber} className="p-5 rounded-2xl bg-white/3 border border-white/5">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{scene.sceneNumber}</span>
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white">{scene.location}</p>
                                            <p className="text-sm text-slate-500">{scene.duration} · {scene.mood}</p>
                                        </div>
                                        <span className="text-xs bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded-full">{scene.cameraDirection}</span>
                                    </div>
                                    <p className="text-sm text-slate-300 mb-2"><span className="text-sm text-slate-500 font-bold">VISUAL:</span> {scene.visual}</p>
                                    <p className="text-sm text-white mb-2"><span className="text-sm text-slate-500 font-bold">ACTION:</span> {scene.action}</p>
                                    {scene.dialogue && <p className="text-sm text-primary italic mb-2"><span className="text-sm text-slate-500 font-bold">DIALOGUE:</span> "{scene.dialogue}"</p>}
                                    <p className="text-sm text-amber-300"><span className="text-slate-500 font-bold">🎵</span> {scene.music}</p>
                                </div>
                            ))}
                        </div>

                        {/* End Card */}
                        {screenplay.endCard && (
                            <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/15 mb-4">
                                <p className="text-sm text-primary font-bold mb-2">END CARD</p>
                                <p className="text-sm text-white font-bold">{screenplay.endCard.tagline}</p>
                                <p className="text-sm text-slate-300 mt-1">{screenplay.endCard.visual}</p>
                                {screenplay.endCard.superText && <p className="text-sm text-slate-400 mt-1">{screenplay.endCard.superText}</p>}
                            </div>
                        )}

                        {/* Director Notes */}
                        {screenplay.directorNotes && (
                            <div className="p-4 rounded-xl bg-white/3 mb-4">
                                <p className="text-sm text-amber-400 font-bold mb-1">🎬 Director's Notes</p>
                                <p className="text-sm text-slate-300">{screenplay.directorNotes}</p>
                            </div>
                        )}

                        {/* Budget Options */}
                        {screenplay.estimatedBudget && (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                                {Object.entries(screenplay.estimatedBudget).map(([tier, desc]) => (
                                    <div key={tier} className="p-3 rounded-xl bg-white/3 text-center">
                                        <p className="text-sm text-primary font-bold mb-1 uppercase">{tier}</p>
                                        <p className="text-sm text-slate-400">{desc}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                            <button onClick={() => {
                                const prompt = `${screenplay.title}: ${screenplay.scenes?.map(s => s.visual).join('. ')}`
                                sessionStorage.setItem('brainstormContext', JSON.stringify({ prompt }))
                                navigate('/video-studio?fromBrainstorm=true')
                                setScreenplay(null)
                            }}
                                className="flex-1 btn-primary py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                                <span className="material-symbols-outlined text-sm">movie</span> Generate AI Ad Film
                            </button>
                            <button onClick={() => {
                                const text = screenplay.scenes?.map(s => `SCENE ${s.sceneNumber}: ${s.location}\n${s.duration}\n${s.visual}\n${s.action}\n${s.dialogue || ''}\nCamera: ${s.cameraDirection}\nMusic: ${s.music}\n`).join('\n---\n')
                                navigator.clipboard?.writeText(text)
                            }}
                                className="py-3 px-5 rounded-xl glass-panel text-xs font-bold text-slate-300 hover:text-white cursor-pointer transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">content_copy</span> Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    )
}

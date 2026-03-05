import { useState, useRef, useEffect } from 'react'
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

    // Chat state (for interactive film refinement)
    const [chatFilm, setChatFilm] = useState(null)
    const [chatHistory, setChatHistory] = useState([])
    const [chatMessage, setChatMessage] = useState('')
    const [chatLoading, setChatLoading] = useState(false)

    const inputRef = useRef(null)
    const bottomRef = useRef(null)
    const chatBottomRef = useRef(null)

    useEffect(() => {
        if (inputRef.current) inputRef.current.focus()
    }, [currentQ, step])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [currentQ, step, loading])

    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatHistory, chatLoading])

    // ========== HANDLERS ==========

    const selectIntent = async (intentId) => {
        setIntent(intentId)
        setError('')
        setLoading(true)
        setLoadingMsg(activeBrand ? `Analyzing ${activeBrand.name}'s DNA for your brainstorm...` : 'Preparing questions...')
        try {
            const data = await bsAPI.start({
                intent: intentId,
                brand: activeBrand ? {
                    name: activeBrand.name,
                    dna: activeBrand.dna,
                } : null,
            })
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
            setError(e.message)
        } finally {
            setLoading(false)
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
        setLoading(true)
        setLoadingMsg('Analyzing your brief...')
        setStep(2)
        try {
            const data = await bsAPI.confirm({
                intent,
                answers: ans,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            })
            if (data.success) {
                setConfirmation(data)
            } else {
                setError(data.error || 'Confirmation failed')
            }
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const generateIdeas = async (refinementHint) => {
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
            if (data.success && data.ideas) {
                setIdeas(data.ideas)
            } else {
                setError(data.error || 'Generation failed')
            }
        } catch (e) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    const handleIdeaAction = (type, idea) => {
        const context = `${idea.title}: ${idea.hook}. ${idea.description}`
        if (type === 'content') {
            sessionStorage.setItem('brainstormContext', JSON.stringify({ title: idea.title, hook: idea.hook, description: idea.description }))
            navigate('/content-studio?fromBrainstorm=true')
        } else if (type === 'creative') {
            sessionStorage.setItem('brainstormContext', JSON.stringify({ prompt: `${idea.title} — ${idea.visualDirection || idea.hook}` }))
            navigate('/creative-studio?fromBrainstorm=true')
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
        setScreenplayLoading(true)
        setScreenplay(null)
        try {
            const data = await bsAPI.screenplay({
                filmConcept,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            })
            if (data.success) setScreenplay(data.screenplay)
            else setError(data.error || 'Screenplay generation failed')
        } catch (e) { setError(e.message) }
        finally { setScreenplayLoading(false) }
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
        const text = msg || chatMessage.trim()
        if (!text || chatLoading) return
        setChatMessage('')
        const newHistory = [...chatHistory, { role: 'user', text }]
        setChatHistory(newHistory)
        setChatLoading(true)
        try {
            const data = await bsAPI.chat({
                filmConcept: chatFilm,
                chatHistory: newHistory,
                userMessage: text,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna } : null,
            })
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
            setChatHistory(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }])
        } finally {
            setChatLoading(false)
        }
    }

    const resetAll = () => {
        setStep(0); setIntent(null); setQuestions([]); setCurrentQ(0); setAnswers({});
        setCurrentAnswer(''); setConfirmation(null); setIdeas(null); setExpandedIdea(null);
        setBrandInsight(null); setIdeaFeedback({}); setScreenplay(null); setError(''); setLoading(false);
        setChatFilm(null); setChatHistory([]); setChatMessage(''); setChatLoading(false)
    }

    // ========== RENDER ==========

    const intentLabel = INTENTS.find(i => i.id === intent)?.label || 'Brainstorm'

    return (
        <DashboardLayout title="Brainstorm Studio" subtitle="Your agentic strategy partner">
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
                        {INTENTS.map((item, i) => (
                            <button key={item.id} onClick={() => selectIntent(item.id)} disabled={loading}
                                className="glass-panel rounded-2xl p-5 text-left hover:border-primary/30 hover:scale-[1.02] transition-all cursor-pointer group animate-fade-in"
                                style={{ animationDelay: `${i * 60}ms` }}>
                                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                                    <span className="material-symbols-outlined text-white text-lg">{item.icon}</span>
                                </div>
                                <h3 className="text-base font-bold text-white mb-1">{item.label}</h3>
                                <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                            </button>
                        ))}
                    </div>

                    {loading && (
                        <div className="text-center mt-8">
                            <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-2">progress_activity</span>
                            <p className="text-sm text-slate-400">{loadingMsg}</p>
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
                                                {q.keywords.map(kw => (
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
                                    <button onClick={() => generateIdeas()}
                                        className="btn-primary w-full py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                        Yes, that's right — Generate Ideas! <CreditBadge action="brainstorm" />
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

                                <button onClick={() => { setStep(1); setCurrentQ(0) }}
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
                                        {['Make it more emotional', 'Change the visual style', 'Adjust the story arc', 'Different music mood', 'Change the cast direction'].map(s => (
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
                                            {msg.suggestions.map((s, j) => (
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
                                navigate('/creative-studio?fromBrainstorm=true')
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

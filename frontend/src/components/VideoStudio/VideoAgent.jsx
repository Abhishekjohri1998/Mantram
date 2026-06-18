/**
 * VideoAgent — AI-Directed Smart Chat
 *
 * Architecture:
 *   - Single `messages[]` array drives the entire chat history
 *   - User can type ANYTHING at any stage — NLP intent engine classifies it
 *   - Intent routes to pipeline actions (APPROVE, MODIFY_PLAN, SWITCH_MODEL, etc.)
 *   - Stage-based cards render inline in the chat as rich interactive elements
 *   - Input bar always visible — 3 separate file inputs (no dynamic accept changes)
 *
 * Backend: POST /agent/v2/chat → { intent, params, agentResponse }
 */

import { useState, useEffect, useRef } from 'react'
import VideoHoverActions from './VideoHoverActions'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    // Strip ALL whitespace from JWT — Safari/WebKit Fetch throws DOMException
    // "The string did not match the expected pattern" for header values
    // containing control characters (newlines, carriage returns, tabs)
    const rawToken = localStorage.getItem('mantram_token') || ''
    const token = rawToken.replace(/[\s\r\n\t]+/g, '')

    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json'

    // Merge caller headers last so they can override
    const finalHeaders = { ...headers, ...(opts.headers || {}) }

    let res
    try {
        res = await fetch(`${API_BASE}${path}`, { ...opts, headers: finalHeaders })
    } catch (fetchErr) {
        // Re-throw with more context to aid debugging
        console.error(`[VideoAgent] fetch failed for ${path}:`, fetchErr)
        throw new Error(`Network error: ${fetchErr.message}`)
    }

    let data
    try {
        data = await res.json()
    } catch (jsonErr) {
        throw new Error(`Server returned non-JSON (status ${res.status})`)
    }

    if (!data.success && !data.reply) throw new Error(data.error || 'Request failed')
    return data
}

// ── Model reference ───────────────────────────────────────────────────────────
const MODELS = [
    { id: 'seedance-2.0',  name: 'Seedance 2.0', icon: '🎬', tier: 'Pro',     tagline: 'Best overall + fast',        maxDur: 120, color: '#14b8a6' },
    { id: 'kling-3.0',     name: 'Kling 3.0',    icon: '👑', tier: 'Premium', tagline: 'Cinematic + multi-shot',     maxDur: 60,  color: '#f59e0b' },
    { id: 'veo-3.1',       name: 'Veo 3.1',      icon: '🎤', tier: 'Ultra',   tagline: 'Native audio + realistic',   maxDur: 30,  color: '#8b5cf6' },
    { id: 'veo-3.1-fast',  name: 'Veo Fast',     icon: '⚡', tier: 'Premium', tagline: 'Fast Veo + audio',           maxDur: 30,  color: '#6d28d9' },
    { id: 'grok-imagine',  name: 'Grok Video',   icon: '🤖', tier: 'Fast',    tagline: 'Fastest for reels',          maxDur: 15,  color: '#ef4444' },
    { id: 'gemini-flash',  name: 'Gemini Flash', icon: '✨', tier: 'Pro',     tagline: 'Motion graphics + animated', maxDur: 30,  color: '#3b82f6' },
]

const STAGE_ORDER = ['analyze', 'plan', 'refs', 'refs-review', 'storyboard', 'model', 'generate', 'done']

// ── Chat bubble components ────────────────────────────────────────────────────
function AgentAvatar() {
    return (
        <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-sm mt-0.5"
            style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>🤖</div>
    )
}
function AgentBubble({ children }) {
    return (
        <div className="flex items-start gap-2 mb-3">
            <AgentAvatar />
            <div className="flex-1 min-w-0">{children}</div>
        </div>
    )
}
function UserBubble({ text, media }) {
    return (
        <div className="flex justify-end mb-3">
            <div className="max-w-[80%]">
                {media?.length > 0 && (
                    <div className="flex gap-1 justify-end mb-1 flex-wrap">
                        {media.map((m, i) => (
                            <div key={i} className="w-12 h-12 rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1] bg-[var(--sys-surface)] flex items-center justify-center">
                                {m.preview ? <img src={m.preview} alt="" className="w-full h-full object-cover" /> : <span className="text-lg">{m.type === 'video' ? '🎥' : '🎵'}</span>}
                            </div>
                        ))}
                    </div>
                )}
                {text && (
                    <div className="px-3 py-2 rounded-2xl rounded-tr-sm text-xs text-[var(--sys-text)]"
                        style={{ background: 'linear-gradient(135deg,rgba(20,184,166,0.15),rgba(139,92,246,0.15))', border: '1px solid rgba(20,184,166,0.2)' }}>
                        {text}
                    </div>
                )}
            </div>
        </div>
    )
}
function AgentText({ text }) {
    return (
        <AgentBubble>
            <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm text-xs text-[var(--sys-text)] leading-relaxed glass-panel border border-[var(--sys-border)]/[0.08]">
                {text}
            </div>
        </AgentBubble>
    )
}
function TypingDots() {
    return (
        <AgentBubble>
            <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm glass-panel border border-[var(--sys-border)]/[0.08] inline-block">
                <div className="flex gap-1 items-center">
                    {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-[var(--sys-text-muted)] animate-bounce" style={{ animationDelay: `${d}ms` }} />
                    ))}
                </div>
            </div>
        </AgentBubble>
    )
}

// ── Inline action button ──────────────────────────────────────────────────────
function QuickBtn({ icon, label, onClick, disabled, primary, danger }) {
    let cls = 'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border disabled:opacity-40 disabled:cursor-not-allowed '
    if (primary) cls += 'text-white border-transparent hover:opacity-90'
    else if (danger) cls += 'text-red-400 border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/[0.12]'
    else cls += 'text-[var(--sys-text-muted)] border-[var(--sys-border)]/[0.1] hover:border-[var(--sys-border)] hover:text-[var(--sys-text)]'
    return (
        <button onClick={onClick} disabled={disabled} className={cls}
            style={primary ? { background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' } : {}}>
            {icon && <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{icon}</span>}
            {label}
        </button>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function VideoAgent({ activeBrand, canCreateVideo = true, onUpgradeRequired }) {

    // ── Chat state ────────────────────────────────────────────────────────────
    const [messages, setMessages] = useState([
        { id: 'welcome', type: 'text', role: 'agent', text: "Hey! I'm your AI Video Director 🎬 Drop a brief, upload a product photo, share a competitor ad, or record a voice brief — I'll handle the rest." }
    ])
    const [inputText, setInputText]     = useState('')
    const [attachments, setAttachments] = useState([])  // [{id,name,type,preview,url,analyzing}]
    const [isTyping, setIsTyping]       = useState(false)
    const [inputDisabled, setInputDisabled] = useState(false)

    // ── Pipeline state ────────────────────────────────────────────────────────
    const [stage, setStage]           = useState('idle')
    const [sessionId, setSid]         = useState(null)
    const [analysis, setAnalysis]     = useState(null)
    const [plan, setPlan]             = useState(null)
    const [refs, setRefs]             = useState(null)
    const [storyboard, setStoryboard] = useState(null)
    const [modelSel, setModelSel]     = useState(null)
    const [selectedModel, setSelectedModel] = useState('seedance-2.0')
    const [selectedRes, setSelectedRes]     = useState('1080p')
    const [genResult, setGenResult]         = useState(null)
    const [sceneStatuses, setSceneStatuses] = useState({})
    const [compiledVideo, setCompiledVideo] = useState(null)
    const [generating, setGenerating]       = useState(false)
    const [products, setProducts]           = useState([])
    const [selProduct, setSelProduct]       = useState(null)
    const [showProducts, setShowProducts]   = useState(false)

    // ── Refs ──────────────────────────────────────────────────────────────────
    const bottomRef  = useRef(null)
    const pollRef    = useRef(null)
    const taRef      = useRef(null)
    const imgInput   = useRef(null)
    const vidInput   = useRef(null)
    const audInput   = useRef(null)

    // ── Load products ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activeBrand?._id) return
        api(`/video-studio/agent/products?brandId=${activeBrand._id}`)
            .then(d => setProducts(d.products || []))
            .catch(() => {})
    }, [activeBrand?._id])

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, isTyping])
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // Auto-resize textarea
    useEffect(() => {
        const ta = taRef.current
        if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px` }
    }, [inputText])

    // ─────────────────────────────────────────────────────────────────────────
    // MESSAGE HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    function push(msg) {
        setMessages(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, ...msg }])
    }
    function pushAgent(text) { push({ type: 'text', role: 'agent', text }) }
    function pushUser(text, media) { push({ type: 'text', role: 'user', text, media }) }
    function pushCard(cardType, data) { push({ type: 'card', cardType, data }) }

    // ─────────────────────────────────────────────────────────────────────────
    // MEDIA UPLOAD
    // ─────────────────────────────────────────────────────────────────────────
    async function handleFileChange(e, fileType) {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        e.target.value = ''

        for (const file of files) {
            const isImg = file.type.startsWith('image/')
            const isVid = file.type.startsWith('video/')
            const preview = (isImg || isVid) ? URL.createObjectURL(file) : null
            const aid = `att-${Date.now()}-${Math.random()}`

            setAttachments(prev => [...prev, { id: aid, name: file.name, type: fileType, preview, url: '', analyzing: true, file }])

            try {
                const fd = new FormData()
                fd.append('file', file, file.name)
                if (activeBrand?._id) fd.append('brandId', activeBrand._id)
                const token = localStorage.getItem('mantram_token')
                const resp = await fetch(`${API_BASE}/video-studio/agent/v2/analyze-media`, {
                    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
                })
                const data = await resp.json()
                setAttachments(prev => prev.map(a => a.id === aid
                    ? { ...a, analyzing: false, url: data.mediaUrl || a.preview || '', preview: data.thumbnailUrl || a.preview || '' }
                    : a
                ))
                if (data.generatedBrief && !inputText.trim()) {
                    setInputText(data.generatedBrief)
                    pushAgent(`I analyzed your ${fileType} 👀 Here's a brief I drafted — edit it if you like, then hit send:\n\n"${data.generatedBrief}"`)
                }
            } catch (err) {
                console.warn('[VideoAgent] Media analyze failed:', err.message)
                setAttachments(prev => prev.map(a => a.id === aid ? { ...a, analyzing: false } : a))
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CENTRAL MESSAGE HANDLER — entry point for ALL user input
    // ─────────────────────────────────────────────────────────────────────────
    async function handleSend() {
        const msg = inputText.trim()
        const media = [...attachments]
        if (!msg && media.length === 0) return
        if (!canCreateVideo && stage !== 'idle') { onUpgradeRequired?.(); return }

        setInputText('')
        setAttachments([])
        pushUser(msg, media.map(a => ({ type: a.type, preview: a.preview })))

        if (stage === 'idle') {
            // ── START PIPELINE ────────────────────────────────────────────
            if (!canCreateVideo) { onUpgradeRequired?.(); return }
            setInputDisabled(true)
            setIsTyping(true)
            try {
                const imageAttachments = media
                    .filter(a => (a.type === 'image' || a.type === 'video') && (a.url || a.preview))
                    .map(a => ({ url: a.url || a.preview, label: a.name, source: a.type }))

                const result = await api('/video-studio/agent/v2/start', {
                    method: 'POST',
                    body: JSON.stringify({
                        brief: msg || 'Create a compelling video ad',
                        images: imageAttachments,
                        brandId: activeBrand?._id || '',
                        productId: selProduct?._id || null,
                    }),
                })
                setSid(result.sessionId)
                setAnalysis(result.analysis)
                setSelectedModel(result.analysis?.modelRecommendation || 'seedance-2.0')
                setStage('analyze')
                setIsTyping(false)
                pushAgent(`Got it! I've analyzed your brief — here's what I'm picking up 👇`)
                pushCard('analysis', result.analysis)
            } catch (err) {
                setIsTyping(false)
                pushAgent(`Hmm, something went wrong: ${err.message}. Try again?`)
            } finally {
                setInputDisabled(false)
            }
            return
        }

        // ── IN-PIPELINE: classify intent ──────────────────────────────────
        setIsTyping(true)
        setInputDisabled(true)
        try {
            const result = await api('/video-studio/agent/v2/chat', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId, stage, message: msg,
                    planContext: plan,
                    storyboardContext: storyboard,
                    analysisContext: analysis,
                }),
            })

            const { intent, params, agentResponse } = result
            setIsTyping(false)

            // Show agent response first (personality layer)
            pushAgent(agentResponse)

            // Route to action
            switch (intent) {
                case 'APPROVE':       await advanceStage(); break
                case 'MODIFY_PLAN':   await doModifyPlan(params); break
                case 'SWITCH_MODEL':  handleSwitchModel(params?.model); break
                case 'ADD_CONTEXT':   await doReanalyze(msg); break
                case 'START_OVER':    setTimeout(resetAll, 1200); break
                case 'GENERATE_NOW':  await doGenerateNow(); break
                case 'ASK_QUESTION':  break  // already answered by agentResponse
                case 'AMBIGUOUS':     break  // already responded
                default:              break
            }
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Something went wrong — ${err.message}. Try again?`)
        } finally {
            setInputDisabled(false)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE ADVANCEMENT — what APPROVE does at each stage
    // ─────────────────────────────────────────────────────────────────────────
    async function advanceStage() {
        switch (stage) {
            case 'analyze':    await doGeneratePlan({}); break
            case 'plan':       await doGenerateRefs(); break
            case 'refs-review': await doApproveRefs(); break
            case 'storyboard': await doSelectModel(selectedModel); break
            case 'model':      await doGenerate(); break
            case 'generate':   break
            default:           break
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PIPELINE ACTIONS
    // ─────────────────────────────────────────────────────────────────────────
    async function doGeneratePlan(overrides = {}) {
        setInputDisabled(true); setIsTyping(true)
        try {
            const result = await api('/video-studio/agent/v2/plan', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId,
                    durationOverride: overrides.duration || null,
                    ratioOverride: overrides.ratio || null,
                    videoTypeOverride: overrides.videoType || null,
                }),
            })
            setPlan(result.plan)
            setSelectedModel(result.plan?.modelRecommendation || selectedModel)
            setStage('plan')
            setIsTyping(false)
            pushAgent(`Creative plan locked in — "${result.plan?.title}" ✨ Take a look, then I'll generate your reference images.`)
            pushCard('plan', result.plan)
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Plan generation hit a snag: ${err.message}`)
        } finally { setInputDisabled(false) }
    }

    async function doModifyPlan(params = {}) {
        // Re-run plan with overrides
        await doGeneratePlan(params)
    }

    async function doGenerateRefs() {
        setInputDisabled(true); setIsTyping(true)
        pushAgent('Generating reference images — character, product, and set mood 🎨 This takes about 30 seconds...')
        try {
            const result = await api('/video-studio/agent/v2/generate-refs', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            })
            setRefs(result.refs)
            setStage(result.autoApproved ? 'storyboard' : 'refs-review')
            setIsTyping(false)
            if (result.autoApproved) {
                pushAgent('References auto-approved ✅ Building your storyboard now...')
                pushCard('refs', result.refs)
                await doBuildStoryboard()
            } else {
                pushAgent('Here are your reference images 👇 Hover to regenerate any, or approve to lock them in.')
                pushCard('refs', result.refs)
            }
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Reference image generation failed: ${err.message}`)
        } finally { setInputDisabled(false) }
    }

    async function doApproveRefs() {
        setInputDisabled(true); setIsTyping(true)
        try {
            await api('/video-studio/agent/v2/approve-refs', {
                method: 'POST',
                body: JSON.stringify({ sessionId, approvedRefs: refs }),
            })
            setStage('storyboard')
            setIsTyping(false)
            pushAgent('References locked! Building the full storyboard now 🎬')
            await doBuildStoryboard()
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Approval failed: ${err.message}`)
        } finally { setInputDisabled(false) }
    }

    async function doBuildStoryboard() {
        setIsTyping(true)
        try {
            const result = await api('/video-studio/agent/v2/storyboard', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            })
            setStoryboard(result.storyboard)
            setStage('model')
            setIsTyping(false)
            const recModel = plan?.modelRecommendation || selectedModel
            pushAgent(`Storyboard done — ${result.storyboard?.cuts?.length || 0} cuts mapped out 🎞️ I'm recommending **${recModel}** for this. You can switch if you prefer, or just say "generate"!`)
            pushCard('storyboard', result.storyboard)
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Storyboard build failed: ${err.message}`)
        }
    }

    function handleSwitchModel(modelId) {
        const m = MODELS.find(x => x.id === modelId)
        if (m) {
            setSelectedModel(m.id)
            // Update the last storyboard card's selected model
            pushCard('modelSwitch', { model: m })
        }
    }

    async function doSelectModel(model = selectedModel) {
        setInputDisabled(true); setIsTyping(true)
        try {
            const result = await api('/video-studio/agent/v2/select-model', {
                method: 'POST',
                body: JSON.stringify({ sessionId, model, resolution: selectedRes, qualityMode: 'fast' }),
            })
            setModelSel(result.modelSelection)
            setStage('generate')
            setIsTyping(false)
            pushAgent(`Prompt written for ${model} ✅ Ready to generate your ${plan?.duration}s ${plan?.ratio} video. Say "generate" or hit the button below!`)
            pushCard('readyToGenerate', result.modelSelection)
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Model setup failed: ${err.message}`)
        } finally { setInputDisabled(false) }
    }

    async function doGenerate() {
        if (!canCreateVideo) { onUpgradeRequired?.(); return }
        setInputDisabled(true); setIsTyping(true)
        try {
            const result = await api('/video-studio/agent/v2/generate', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            })
            setGenResult(result)
            setStage('generating')
            setGenerating(true)
            setIsTyping(false)
            pushAgent(`Generation kicked off! 🚀 I'll update you as each scene completes.`)
            pushCard('generating', { result, plan, isLongForm: result.isLongForm })

            if (result.isLongForm) {
                pollLongForm(result.longFormJobId || result.projectId)
            } else {
                const ids = {}
                ;(result.scenes || []).forEach(s => {
                    if (s.projectId) ids[s.projectId] = { status: 'generating', progress: 5 }
                })
                setSceneStatuses(ids)
                if (Object.keys(ids).length) startPolling(Object.keys(ids))
                else setGenerating(false)
            }
        } catch (err) {
            setIsTyping(false)
            setGenerating(false)
            pushAgent(`Generation failed: ${err.message}`)
        } finally { setInputDisabled(false) }
    }

    async function doGenerateNow() {
        // Skip straight to generate regardless of current stage
        if (stage === 'model' || stage === 'storyboard') {
            if (!modelSel) await doSelectModel()
            else await doGenerate()
        } else if (stage === 'generate') {
            await doGenerate()
        }
    }

    async function doReanalyze(additionalContext) {
        // Add context to brief and re-run analysis
        setInputDisabled(true); setIsTyping(true)
        try {
            const result = await api('/video-studio/agent/v2/start', {
                method: 'POST',
                body: JSON.stringify({
                    brief: `${analysis?.summary || ''}\n\nAdditional context: ${additionalContext}`,
                    images: [],
                    brandId: activeBrand?._id || null,
                    productId: selProduct?._id || null,
                }),
            })
            setSid(result.sessionId)
            setAnalysis(result.analysis)
            setPlan(null); setRefs(null); setStoryboard(null); setModelSel(null)
            setStage('analyze')
            setIsTyping(false)
            pushAgent('Re-analyzed with your new context 🧠 Updated plan incoming:')
            pushCard('analysis', result.analysis)
        } catch (err) {
            setIsTyping(false)
            pushAgent(`Re-analysis failed: ${err.message}`)
        } finally { setInputDisabled(false) }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // POLLING
    // ─────────────────────────────────────────────────────────────────────────
    function startPolling(ids) {
        pollRef.current = setInterval(async () => {
            const updated = {}
            let allDone = true
            for (const id of ids) {
                try {
                    const r = await api(`/video-studio/${id}/status`)
                    const proj = r.project
                    if (proj.generation?.videoUrl || ['done','completed','critique'].includes(proj.status)) {
                        updated[id] = { status: 'done', videoUrl: `${API_BASE}/video-studio/${id}/video`, progress: 100 }
                    } else if (['failed','error'].includes(proj.status)) {
                        updated[id] = { status: 'failed', progress: 0 }
                    } else {
                        updated[id] = { status: 'generating', progress: proj.generation?.progress || 15 }
                        allDone = false
                    }
                } catch { updated[id] = { status: 'generating', progress: 15 }; allDone = false }
            }
            setSceneStatuses(updated)
            if (allDone) {
                clearInterval(pollRef.current)
                setGenerating(false)
                setStage('done')
                const doneUrls = Object.values(updated).filter(s => s.status === 'done').map(s => s.videoUrl)
                if (doneUrls.length > 0) {
                    pushAgent(`Your video${doneUrls.length > 1 ? 's are' : ' is'} ready! 🎉 Download below or create another one.`)
                    pushCard('videos', { videoUrls: doneUrls, plan })
                }
            }
        }, 6000)
    }

    function pollLongForm(jobId) {
        let tries = 0
        pollRef.current = setInterval(async () => {
            if (++tries > 90) { clearInterval(pollRef.current); setGenerating(false); return }
            try {
                const r = await api(`/video-studio/storyboard/${jobId}/long-form-status`)
                if (r.status === 'done' || r.finalVideoUrl) {
                    clearInterval(pollRef.current)
                    setCompiledVideo(r.finalVideoUrl)
                    setGenerating(false)
                    setStage('done')
                    pushAgent('Your long-form video is ready! 🎬 Full cut compiled below.')
                    pushCard('videos', { videoUrls: [r.finalVideoUrl], plan, isCompiled: true })
                }
            } catch { /* retry */ }
        }, 8000)
    }

    async function handleRegenerateRef(refType, refIndex) {
        try {
            const result = await api(`/video-studio/agent/v2/${sessionId}/regenerate-ref`, {
                method: 'POST',
                body: JSON.stringify({ refType, refIndex }),
            })
            setRefs(prev => {
                const key = `${refType}Refs`
                const updated = { ...prev, [key]: [...(prev[key] || [])] }
                updated[key][refIndex] = result.ref
                return updated
            })
        } catch (err) { pushAgent(`Couldn't regenerate that image: ${err.message}`) }
    }

    async function handleDownload(url, name) {
        try {
            const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` } })
            const blob = await r.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob); a.download = `${name}.mp4`
            document.body.appendChild(a); a.click()
            setTimeout(() => document.body.removeChild(a), 100)
        } catch { window.open(url, '_blank') }
    }

    function resetAll() {
        setStage('idle'); setSid(null); setAnalysis(null); setPlan(null)
        setRefs(null); setStoryboard(null); setModelSel(null); setGenResult(null)
        setSceneStatuses({}); setCompiledVideo(null); setGenerating(false)
        setInputText(''); setAttachments([]); setSelProduct(null)
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        setMessages([{
            id: 'welcome-reset', type: 'text', role: 'agent',
            text: "All clear! What's the next video we're making? 🎬"
        }])
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CARD RENDERERS
    // ─────────────────────────────────────────────────────────────────────────

    function renderAnalysisCard(data) {
        return (
            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed mb-3">{data.summary}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {[data.contentType, data.brandCategory, data.detectedStyle, ...(data.toneKeywords || []).slice(0, 2)].filter(Boolean).map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">{t}</span>
                    ))}
                    <span className="px-2 py-0.5 rounded-full text-[10px] text-amber-400 border border-amber-500/20 bg-amber-500/[0.06]">⏱ {data.suggestedDuration}s</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] text-amber-400 border border-amber-500/20 bg-amber-500/[0.06]">{data.suggestedRatio}</span>
                </div>
                {stage === 'analyze' && (
                    <div className="flex gap-2">
                        <QuickBtn primary icon="auto_awesome" label="Build Creative Plan" onClick={() => { pushUser('Looks great, build the plan!'); doGeneratePlan({}) }} />
                        <QuickBtn icon="tune" label="Customize" onClick={() => pushAgent("Sure! Tell me what to change — duration, format, style, or video type and I'll adjust the plan.")} />
                    </div>
                )}
            </div>
        )
    }

    function renderPlanCard(data) {
        return (
            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.02]">
                <p className="text-sm font-bold text-[var(--sys-primary)] mb-1">{data.title}</p>
                <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-2">{data.hookStrategy}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {[`⏱ ${data.duration}s`, `📐 ${data.ratio}`, `🎬 ${data.videoType}`, `💡 ${data.modelRecommendation}`].map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">{t}</span>
                    ))}
                </div>
                <div className="space-y-1 mb-3">
                    {(data.scenePlan || []).map((sc, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-[var(--sys-primary)] w-20 shrink-0">{sc.role}</span>
                            <div className="flex-1 h-1 rounded-full bg-[var(--sys-primary)]/10">
                                <div className="h-full rounded-full bg-[var(--sys-primary)]/40" style={{ width: `${(sc.duration / (data.duration || 30)) * 100}%` }} />
                            </div>
                            <span className="text-[9px] text-[var(--sys-text-muted)] w-6 text-right">{sc.duration}s</span>
                        </div>
                    ))}
                </div>
                <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-3">{data.styleGuide}</p>
                {stage === 'plan' && (
                    <div className="flex gap-2 flex-wrap">
                        <QuickBtn primary icon="image_search" label="Generate Refs" onClick={() => { pushUser('Approved! Generate references.'); doGenerateRefs() }} />
                        <QuickBtn icon="edit" label="Change duration" onClick={() => pushAgent("What duration do you want? Just type it — like '45 seconds' or '1 minute'.")} />
                        <QuickBtn icon="aspect_ratio" label="Change ratio" onClick={() => pushAgent("Which ratio? 9:16 for vertical, 16:9 for landscape, 1:1 for square, or 4:5 for feed.")} />
                    </div>
                )}
            </div>
        )
    }

    function renderRefsCard(data) {
        const refSections = [
            { key: 'characterRefs', label: '👤 Character', type: 'character' },
            { key: 'productRefs',   label: '📦 Product',   type: 'product' },
            { key: 'locationRefs',  label: '🎨 Location',  type: 'location' },
        ].filter(({ key }) => data[key]?.length > 0)

        return (
            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                {refSections.map(({ key, label, type }) => (
                    <div key={key} className="mb-3">
                        <p className="text-[10px] font-bold text-[var(--sys-text-muted)] mb-2">{label}</p>
                        <div className="flex gap-2 flex-wrap">
                            {data[key].map((ref, idx) => (
                                <div key={idx} className="relative group rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1]" style={{ width: 100, height: 75 }}>
                                    <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                        <button onClick={() => handleRegenerateRef(type, idx)}
                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer" title="Regenerate">
                                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>refresh</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {stage === 'refs-review' && (
                    <div className="flex gap-2 mt-2">
                        <QuickBtn icon="refresh" label="Redo All" onClick={() => { pushUser('Regenerate all refs please.'); doGenerateRefs() }} />
                        <QuickBtn primary icon="check_circle" label="Approve Refs ✅" onClick={() => { pushUser('These refs look great! Approve.'); doApproveRefs() }} />
                    </div>
                )}
            </div>
        )
    }

    function renderStoryboardCard(data) {
        return (
            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                {data.posterUrl && (
                    <div className="rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1] mb-3" style={{ aspectRatio: '16/9' }}>
                        <img src={data.posterUrl} alt="Storyboard" className="w-full h-full object-cover" />
                    </div>
                )}
                {data.environmentFingerprint && (
                    <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-2">📍 {data.environmentFingerprint}</p>
                )}
                <div className="space-y-1 max-h-28 overflow-y-auto mb-3">
                    {(data.cuts || []).map((cut, i) => (
                        <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg bg-white/[0.02]">
                            <span className="text-[9px] font-bold text-[var(--sys-primary)] px-1.5 py-0.5 rounded bg-[var(--sys-primary)]/10 shrink-0">C{cut.id || i + 1}</span>
                            <span className="text-[10px] text-[var(--sys-text-muted)] flex-1 line-clamp-2">{cut.scene}</span>
                            <span className="text-[9px] text-[var(--sys-text-muted)] shrink-0">{cut.duration}s</span>
                        </div>
                    ))}
                </div>
                {data.colorPalette?.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-3">
                        <span className="text-[10px] text-[var(--sys-text-muted)]">Palette:</span>
                        {data.colorPalette.slice(0, 6).map((c, i) => (
                            <div key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ background: c }} title={c} />
                        ))}
                    </div>
                )}
                {/* Model picker embedded in storyboard card */}
                {stage === 'model' && (
                    <>
                        <div className="border-t border-[var(--sys-border)]/[0.06] pt-3 mb-3">
                            <p className="text-[10px] text-[var(--sys-text-muted)] mb-2 font-bold">Choose your AI engine:</p>
                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                                {MODELS.map(m => (
                                    <button key={m.id} onClick={() => setSelectedModel(m.id)}
                                        className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${selectedModel === m.id ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/[0.08]' : 'border-[var(--sys-border)]/[0.08] hover:border-[var(--sys-border)]'}`}>
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-sm">{m.icon}</span>
                                            <span className="text-[10px] font-bold text-[var(--sys-text)] flex-1 truncate">{m.name}</span>
                                            {m.id === plan?.modelRecommendation && <span className="text-[8px] px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">AI Pick</span>}
                                            {selectedModel === m.id && <span className="material-symbols-outlined text-[var(--sys-primary)] shrink-0" style={{ fontSize: '12px' }}>check_circle</span>}
                                        </div>
                                        <p className="text-[9px] text-[var(--sys-text-muted)]">{m.tagline} • max {m.maxDur}s</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <QuickBtn primary icon="movie" label={`Generate ${plan?.duration}s Video 🎬`} onClick={() => { pushUser(`Let's generate with ${selectedModel}!`); doSelectModel(selectedModel) }} />
                        </div>
                    </>
                )}
            </div>
        )
    }

    function renderReadyCard(data) {
        return (
            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.02]">
                <p className="text-xs font-bold text-[var(--sys-text)] mb-2">🎬 All systems go!</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {[`🤖 ${data.model}`, `📺 ${data.resolution}`, `⏱ ${plan?.duration}s`, `📐 ${plan?.ratio}`].map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">{t}</span>
                    ))}
                </div>
                {data.finalPrompt && (
                    <div className="p-2 rounded-lg bg-black/20 border border-[var(--sys-border)]/[0.06] mb-3">
                        <p className="text-[9px] text-[var(--sys-text-muted)] font-bold mb-1">FINAL PROMPT</p>
                        <p className="text-[10px] text-[var(--sys-text-muted)] leading-relaxed line-clamp-4">{data.finalPrompt}</p>
                    </div>
                )}
                {stage === 'generate' && (
                    <QuickBtn primary icon="rocket_launch" label="🚀 Generate Now!" onClick={() => { pushUser('Generate it!'); doGenerate() }} />
                )}
            </div>
        )
    }

    function renderGeneratingCard({ result, plan: p, isLongForm }) {
        return (
            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                {isLongForm ? (
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--sys-primary)] animate-spin text-base">progress_activity</span>
                        <div>
                            <p className="text-xs font-bold text-[var(--sys-text)]">Long-form generation running...</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">Generating {Math.ceil((p?.duration || 30) / 10)} segments. Sit tight — 5-15 mins.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs font-bold text-[var(--sys-text)] mb-2 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[var(--sys-primary)] animate-spin text-sm">progress_activity</span>
                            Rendering scenes...
                        </p>
                        {Object.entries(sceneStatuses).map(([id, st], idx) => (
                            <div key={id} className="flex items-center gap-2">
                                <span className="text-[10px] text-[var(--sys-text-muted)] w-14 shrink-0">Scene {idx + 1}</span>
                                <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{
                                        width: `${st.progress || 0}%`,
                                        background: st.status === 'done' ? '#10b981' : st.status === 'failed' ? '#ef4444' : 'linear-gradient(90deg,#14b8a6,#8b5cf6)',
                                    }} />
                                </div>
                                <span className="text-[9px] shrink-0" style={{ color: st.status === 'done' ? '#10b981' : st.status === 'failed' ? '#ef4444' : '#94a3b8' }}>
                                    {st.status === 'done' ? '✅' : st.status === 'failed' ? '❌' : `${st.progress || 0}%`}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )
    }

    function renderVideosCard({ videoUrls, plan: p, isCompiled }) {
        return (
            <div className="space-y-3">
                {videoUrls.map((url, i) => (
                    <div key={i} className="rounded-2xl overflow-hidden border border-[var(--sys-primary)]/20 bg-black relative has-vha">
                        <video src={url} controls className="w-full block" />
                        <VideoHoverActions videoUrl={url} />
                        <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-[10px] font-bold text-[var(--sys-primary)]">
                                {isCompiled ? `Final — ${p?.duration}s` : `Scene ${i + 1}`}
                            </span>
                            <button onClick={() => handleDownload(url, isCompiled ? 'final-video' : `scene-${i + 1}`)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/30 cursor-pointer hover:bg-[var(--sys-primary)]/[0.08] transition-all">
                                <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>download</span> Download
                            </button>
                        </div>
                    </div>
                ))}
                <QuickBtn icon="add_circle" label="Create Another Video" onClick={() => { pushUser('Create another video!'); resetAll() }} />
            </div>
        )
    }

    function renderModelSwitchCard({ model }) {
        return (
            <div className="glass-panel rounded-xl rounded-tl-sm p-3 border border-[var(--sys-border)]/[0.08] flex items-center gap-2">
                <span className="text-lg">{model.icon}</span>
                <div>
                    <p className="text-xs font-bold text-[var(--sys-text)]">{model.name} selected</p>
                    <p className="text-[10px] text-[var(--sys-text-muted)]">{model.tagline}</p>
                </div>
                <span className="material-symbols-outlined text-[var(--sys-primary)] ml-auto" style={{ fontSize: '16px' }}>check_circle</span>
            </div>
        )
    }

    // ── Master card dispatcher ────────────────────────────────────────────────
    function renderCard(msg) {
        switch (msg.cardType) {
            case 'analysis':        return renderAnalysisCard(msg.data)
            case 'plan':            return renderPlanCard(msg.data)
            case 'refs':            return renderRefsCard(msg.data)
            case 'storyboard':      return renderStoryboardCard(msg.data)
            case 'readyToGenerate': return renderReadyCard(msg.data)
            case 'generating':      return renderGeneratingCard(msg.data)
            case 'videos':          return renderVideosCard(msg.data)
            case 'modelSwitch':     return renderModelSwitchCard(msg.data)
            default:                return null
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col" style={{ height: '78vh' }}>

            {/* ── Header breadcrumb ──────────────────────────────────────── */}
            <div className="flex-shrink-0 flex items-center gap-2 pb-3">
                <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-xs" style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>🤖</div>
                    <span className="text-xs font-bold text-[var(--sys-text)]">AI Video Director</span>
                    <span className="text-[10px] text-[var(--sys-text-muted)] ml-1">• {activeBrand?.name || 'No brand'}</span>
                </div>
                {stage !== 'idle' && (
                    <button onClick={() => { pushUser('Start over please.'); setTimeout(resetAll, 800) }}
                        className="ml-auto flex items-center gap-1 px-2 py-1 rounded-full text-[10px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border border-[var(--sys-border)]/[0.08] cursor-pointer transition-all">
                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>restart_alt</span> New
                    </button>
                )}
            </div>

            {/* ── Chat stream ───────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto space-y-0 pr-1">
                {messages.map(msg => {
                    if (msg.role === 'user') return <UserBubble key={msg.id} text={msg.text} media={msg.media} />
                    if (msg.type === 'text' && msg.role === 'agent') return <AgentText key={msg.id} text={msg.text} />
                    if (msg.type === 'card') return (
                        <AgentBubble key={msg.id}>{renderCard(msg)}</AgentBubble>
                    )
                    return null
                })}
                {isTyping && <TypingDots />}

                {/* Live generation progress overlay (updates existing card) */}
                {generating && Object.keys(sceneStatuses).length > 0 && (
                    <AgentBubble>
                        <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                            <p className="text-xs font-bold text-[var(--sys-text)] mb-2 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[var(--sys-primary)] animate-spin text-sm">progress_activity</span>
                                Rendering...
                            </p>
                            {Object.entries(sceneStatuses).map(([id, st], idx) => (
                                <div key={id} className="flex items-center gap-2 mb-1">
                                    <span className="text-[10px] text-[var(--sys-text-muted)] w-14 shrink-0">Scene {idx + 1}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                        <div className="h-full rounded-full transition-all duration-700" style={{
                                            width: `${st.progress || 0}%`,
                                            background: st.status === 'done' ? '#10b981' : 'linear-gradient(90deg,#14b8a6,#8b5cf6)',
                                        }} />
                                    </div>
                                    <span className="text-[9px]" style={{ color: st.status === 'done' ? '#10b981' : '#94a3b8' }}>
                                        {st.status === 'done' ? '✅' : `${st.progress || 0}%`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </AgentBubble>
                )}

                <div ref={bottomRef} />
            </div>

            {/* ── Generated brief preview ───────────────────────────────── */}
            {stage === 'idle' && attachments.some(a => a.analyzing) && (
                <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 mb-2 rounded-xl border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.04]">
                    <span className="material-symbols-outlined text-[var(--sys-primary)] animate-spin text-sm">progress_activity</span>
                    <span className="text-[11px] text-[var(--sys-text-muted)]">Analyzing your media...</span>
                </div>
            )}

            {/* ── Attachment previews ───────────────────────────────────── */}
            {attachments.length > 0 && (
                <div className="flex-shrink-0 flex gap-2 pb-2 overflow-x-auto">
                    {attachments.map(a => (
                        <div key={a.id} className="relative shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1] bg-[var(--sys-surface)]">
                            {a.preview && a.type !== 'audio'
                                ? <img src={a.preview} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-2xl">{a.type === 'audio' ? '🎵' : '📷'}</div>
                            }
                            {a.analyzing && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white animate-spin text-sm">progress_activity</span>
                                </div>
                            )}
                            <button onClick={() => setAttachments(p => p.filter(x => x.id !== a.id))}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center cursor-pointer">✕</button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Input bar — always visible ────────────────────────────── */}
            <div className="flex-shrink-0 glass-panel rounded-2xl border border-[var(--sys-border)]/[0.1] overflow-hidden">
                {selProduct && (
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--sys-border)]/[0.06]">
                        {selProduct.images?.[0] && <img src={selProduct.images[0].url} alt="" className="w-5 h-5 rounded object-cover" />}
                        <span className="text-[10px] text-[var(--sys-primary)] flex-1 truncate">{selProduct.title}</span>
                        <button onClick={() => setSelProduct(null)} className="text-[10px] text-[var(--sys-text-muted)] cursor-pointer">✕</button>
                    </div>
                )}
                <textarea ref={taRef} value={inputText} onChange={e => setInputText(e.target.value)} rows={1}
                    disabled={inputDisabled}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder={
                        stage === 'idle' ? "Describe your video, or upload an image / video / audio brief..." :
                        stage === 'analyze' ? "Say 'looks good' or ask to change duration, ratio, style..." :
                        stage === 'plan' ? "Approve, or ask to change anything — '45 seconds', 'make it more cinematic'..." :
                        stage === 'refs-review' ? "Approve refs, or say 'regenerate character'..." :
                        stage === 'model' ? "Say which model, or 'use kling', or just 'generate'..." :
                        "Talk to me..."
                    }
                    className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-[var(--sys-text)] placeholder:text-[var(--sys-text-muted)]/50 resize-none outline-none leading-relaxed disabled:opacity-50" />

                <div className="flex items-center gap-1 px-3 pb-2 pt-1">
                    {/* 3 separate file inputs — no dynamic .accept changes */}
                    <input ref={imgInput} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFileChange(e, 'image')} />
                    <input ref={vidInput} type="file" accept="video/*"            className="hidden" onChange={e => handleFileChange(e, 'video')} />
                    <input ref={audInput} type="file" accept="audio/*"            className="hidden" onChange={e => handleFileChange(e, 'audio')} />

                    <button onClick={() => imgInput.current.click()} disabled={inputDisabled}
                        className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all disabled:opacity-40"
                        title="Upload image or product photo">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_photo_alternate</span>
                    </button>
                    <button onClick={() => vidInput.current.click()} disabled={inputDisabled}
                        className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all disabled:opacity-40"
                        title="Upload reference video">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>video_camera_back</span>
                    </button>
                    <button onClick={() => audInput.current.click()} disabled={inputDisabled}
                        className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all disabled:opacity-40"
                        title="Upload voice brief">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>mic</span>
                    </button>

                    {products.length > 0 && (
                        <div className="relative">
                            <button onClick={() => setShowProducts(!showProducts)} disabled={inputDisabled}
                                className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all disabled:opacity-40"
                                title="Select product">
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>inventory_2</span>
                            </button>
                            {showProducts && (
                                <div className="absolute bottom-full left-0 mb-2 w-52 glass-panel rounded-xl border border-[var(--sys-border)]/[0.1] overflow-hidden z-20 max-h-40 overflow-y-auto">
                                    {products.map(p => (
                                        <button key={p._id} onClick={() => { setSelProduct(p); setShowProducts(false) }}
                                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] cursor-pointer text-left transition-all">
                                            {p.images?.[0] && <img src={p.images[0].url} alt="" className="w-7 h-7 rounded object-cover" />}
                                            <span className="text-xs text-[var(--sys-text)] truncate">{p.title}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex-1" />

                    {/* Stage hint */}
                    {stage !== 'idle' && (
                        <span className="text-[9px] text-[var(--sys-text-muted)] hidden sm:block opacity-60">
                            {stage === 'analyze' && 'Type anything to adjust or approve'}
                            {stage === 'plan' && 'Type to modify or approve'}
                            {stage === 'refs-review' && 'Approve or request changes'}
                            {stage === 'model' && 'Pick model or just say generate'}
                        </span>
                    )}

                    <button onClick={handleSend} disabled={inputDisabled || (!inputText.trim() && attachments.length === 0)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white cursor-pointer transition-all hover:opacity-90 disabled:opacity-30"
                        style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_upward</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

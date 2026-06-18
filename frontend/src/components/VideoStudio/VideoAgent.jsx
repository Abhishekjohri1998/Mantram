/**
 * VideoAgent — Hybrid Chat + Rich Inline Cards
 * 
 * UX Design: ChatGPT-style conversational interface where each pipeline stage
 * renders a rich interactive card inline in the chat stream.
 * 
 * Pipeline (backend stage gates enforced):
 *   INPUT → ANALYZE → PLAN → REFS → STORYBOARD → MODEL → GENERATE
 * 
 * Media-as-Brief: User can upload image/video/audio → AI generates brief text
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import VideoHoverActions from './VideoHoverActions'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const headers = { Authorization: `Bearer ${token}`, ...opts.headers }
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
    const data = await res.json()
    if (!data.success && !data.reply) throw new Error(data.error || 'Request failed')
    return data
}

// ── Model data ────────────────────────────────────────────────────────────────
const MODELS = [
    { id: 'seedance-2.0',   name: 'Seedance 2.0', icon: '🎬', tier: 'Pro',     tagline: 'Best overall — refs + fast', maxDur: 120, color: '#14b8a6' },
    { id: 'kling-3.0',      name: 'Kling 3.0',    icon: '👑', tier: 'Premium', tagline: 'Cinematic + multi-shot',    maxDur: 60,  color: '#f59e0b' },
    { id: 'veo-3.1',        name: 'Veo 3.1',      icon: '🎤', tier: 'Ultra',   tagline: 'Native audio + realistic',  maxDur: 30,  color: '#8b5cf6' },
    { id: 'veo-3.1-fast',   name: 'Veo Fast',     icon: '⚡', tier: 'Premium', tagline: 'Fast Veo with audio',       maxDur: 30,  color: '#6d28d9' },
    { id: 'grok-imagine',   name: 'Grok Video',   icon: '🤖', tier: 'Fast',    tagline: 'Fastest — great for reels', maxDur: 15,  color: '#ef4444' },
    { id: 'gemini-flash',   name: 'Gemini Flash', icon: '✨', tier: 'Pro',     tagline: 'Motion graphics + animated',maxDur: 30,  color: '#3b82f6' },
]

const QUICK_STARTS = [
    { icon: '🛍️', text: 'Create a 30-second product ad with close-up shots and a strong CTA' },
    { icon: '📱', text: 'Create a 15s vertical social reel with trendy hook and dynamic cuts' },
    { icon: '🎥', text: 'Create a 60-second cinematic brand story with emotional narrative' },
    { icon: '🎯', text: 'Create an authentic UGC-style testimonial video, warm and relatable' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Chat message types rendered inline
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator() {
    return (
        <div className="flex items-start gap-2 mb-4">
            <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-sm" style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>🤖</div>
            <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-[var(--sys-surface)] border border-[var(--sys-border)]/[0.08]">
                <div className="flex gap-1 items-center">
                    {[0,150,300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 rounded-full bg-[var(--sys-text-muted)] animate-bounce" style={{ animationDelay:`${d}ms` }}/>
                    ))}
                </div>
            </div>
        </div>
    )
}

function AgentBubble({ children, className = '' }) {
    return (
        <div className={`flex items-start gap-2 mb-4 ${className}`}>
            <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-sm mt-0.5" style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>🤖</div>
            <div className="flex-1 min-w-0">{children}</div>
        </div>
    )
}

function UserBubble({ children }) {
    return (
        <div className="flex items-start gap-2 mb-4 flex-row-reverse">
            <div className="w-7 h-7 rounded-xl flex-shrink-0 flex items-center justify-center text-sm mt-0.5 bg-[var(--sys-surface)] border border-[var(--sys-border)]/[0.1]">👤</div>
            <div className="max-w-[80%]">
                <div className="px-3 py-2 rounded-2xl rounded-tr-sm text-sm text-[var(--sys-text)]" style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(20,184,166,0.2)' }}>
                    {children}
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function VideoAgent({ activeBrand, canCreateVideo = true, onUpgradeRequired }) {
    // ── Core pipeline state ──────────────────────────────────────────────────
    const [stage, setStage]       = useState('idle')   // idle|analyzing|plan|refs|storyboard|model|generate|done
    const [sessionId, setSid]     = useState(null)
    const [loading, setLoading]   = useState(false)
    const [error, setError]       = useState('')

    // ── Pipeline data per stage ──────────────────────────────────────────────
    const [analysis, setAnalysis]         = useState(null)
    const [plan, setPlan]                 = useState(null)
    const [planEdits, setPlanEdits]       = useState({})
    const [refs, setRefs]                 = useState(null)
    const [storyboard, setStoryboard]     = useState(null)
    const [modelSel, setModelSel]         = useState(null)
    const [selectedModel, setSelectedModel] = useState('seedance-2.0')
    const [selectedRes, setSelectedRes]   = useState('1080p')
    const [genResult, setGenResult]       = useState(null)
    const [sceneStatuses, setSceneStatuses] = useState({})
    const [compiledVideo, setCompiledVideo] = useState(null)
    const [generating, setGenerating]     = useState(false)

    // ── Input state ──────────────────────────────────────────────────────────
    const [brief, setBrief]           = useState('')
    const [attachments, setAttachments] = useState([])   // [{url, name, type, thumbnail, isAnalyzing}]
    const [mediaAnalyzing, setMediaAnalyzing] = useState(false)
    const [generatedBrief, setGeneratedBrief] = useState('')  // from media analysis
    const [products, setProducts]     = useState([])
    const [selProduct, setSelProduct] = useState(null)
    const [showProducts, setShowProducts] = useState(false)

    // ── Refs ──────────────────────────────────────────────────────────────────
    const bottomRef   = useRef(null)
    const fileRef     = useRef(null)
    const pollRef     = useRef(null)
    const textareaRef = useRef(null)

    // ── Load products ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activeBrand?._id) { setProducts([]); return }
        api(`/video-studio/agent/products?brandId=${activeBrand._id}`)
            .then(d => setProducts(d.products || []))
            .catch(() => {})
    }, [activeBrand?._id])

    // ── Auto-scroll ───────────────────────────────────────────────────────────
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [stage, loading, refs, storyboard, genResult, sceneStatuses])

    // ── Cleanup ───────────────────────────────────────────────────────────────
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ─── Textarea auto-resize ──────────────────────────────────────────────────
    useEffect(() => {
        const ta = textareaRef.current
        if (ta) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px` }
    }, [brief])

    // ─────────────────────────────────────────────────────────────────────────
    // MEDIA UPLOAD & ANALYSIS
    // ─────────────────────────────────────────────────────────────────────────
    async function handleMediaUpload(e) {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        e.target.value = ''

        for (const file of files) {
            const isImg   = file.type.startsWith('image/')
            const isVid   = file.type.startsWith('video/')
            const isAudio = file.type.startsWith('audio/')
            const preview = (isImg || isVid) ? URL.createObjectURL(file) : null

            // Add to attachments immediately with loading state
            const attachId = Date.now() + Math.random()
            setAttachments(prev => [...prev, {
                id: attachId, name: file.name, type: isImg ? 'image' : isVid ? 'video' : 'audio',
                localUrl: preview, url: '', thumbnail: '', isAnalyzing: true, file,
            }])

            // Analyze in background
            setMediaAnalyzing(true)
            try {
                const fd = new FormData()
                fd.append('file', file, file.name)
                if (activeBrand?._id) fd.append('brandId', activeBrand._id)

                const token = localStorage.getItem('mantram_token')
                const resp = await fetch(`${API_BASE}/video-studio/agent/v2/analyze-media`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                })
                const data = await resp.json()

                setAttachments(prev => prev.map(a => a.id === attachId ? {
                    ...a, isAnalyzing: false,
                    url: data.mediaUrl || a.localUrl || '',
                    thumbnail: data.thumbnailUrl || a.localUrl || '',
                } : a))

                // Set generated brief (user can edit or accept)
                if (data.generatedBrief) {
                    setGeneratedBrief(data.generatedBrief)
                    if (!brief.trim()) setBrief(data.generatedBrief)
                }
            } catch (err) {
                console.warn('[VideoAgent] Media analysis failed:', err.message)
                setAttachments(prev => prev.map(a => a.id === attachId ? { ...a, isAnalyzing: false } : a))
            } finally {
                setMediaAnalyzing(false)
            }
        }
    }

    function removeAttachment(id) {
        setAttachments(prev => prev.filter(a => a.id !== id))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PIPELINE STAGES
    // ─────────────────────────────────────────────────────────────────────────

    async function handleSend() {
        const msg = brief.trim()
        if (!msg && attachments.length === 0) return
        if (!canCreateVideo) { onUpgradeRequired?.(); return }

        setLoading(true); setError(''); setStage('analyzing')
        setBrief(''); setGeneratedBrief('')

        try {
            // Upload pending files (non-S3 attachments) — they're already on S3 from analyze-media
            const imageAttachments = attachments
                .filter(a => (a.type === 'image' || a.type === 'video') && (a.url || a.localUrl))
                .map(a => ({ url: a.url || a.localUrl, label: a.name, source: a.type }))

            const result = await api('/video-studio/agent/v2/start', {
                method: 'POST',
                body: JSON.stringify({
                    brief: msg || `Create a compelling video ad`,
                    images: imageAttachments,
                    brandId: activeBrand?._id || '',
                    productId: selProduct?._id || null,
                }),
            })

            setSid(result.sessionId)
            setAnalysis(result.analysis)
            setPlan(null); setRefs(null); setStoryboard(null); setModelSel(null)
            setGenResult(null); setSceneStatuses({}); setCompiledVideo(null)
            setSelectedModel(result.analysis?.modelRecommendation || 'seedance-2.0')
            setStage('plan')
            setAttachments([])
        } catch (err) {
            setError(err.message)
            setStage('idle')
        } finally {
            setLoading(false)
        }
    }

    async function handleGeneratePlan(overrides = {}) {
        setLoading(true); setError('')
        try {
            const p = planEdits
            const result = await api('/video-studio/agent/v2/plan', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId: sessionId,
                    durationOverride: overrides.duration || p.duration || null,
                    ratioOverride: overrides.ratio || p.ratio || null,
                    videoTypeOverride: overrides.videoType || p.videoType || null,
                }),
            })
            setPlan(result.plan)
            setSelectedModel(result.plan?.modelRecommendation || selectedModel)
            setStage('refs')
        } catch (err) { setError(err.message) }
        finally { setLoading(false) }
    }

    async function handleGenerateRefs() {
        setLoading(true); setError('')
        try {
            const result = await api('/video-studio/agent/v2/generate-refs', {
                method: 'POST', body: JSON.stringify({ sessionId }),
            })
            setRefs(result.refs)
            if (result.autoApproved) setStage('storyboard')
            else setStage('refs-review')
        } catch (err) { setError(err.message) }
        finally { setLoading(false) }
    }

    async function handleRegenerateRef(refType, refIndex) {
        try {
            const result = await api(`/video-studio/agent/v2/${sessionId}/regenerate-ref`, {
                method: 'POST', body: JSON.stringify({ refType, refIndex }),
            })
            setRefs(prev => {
                const key = `${refType}Refs`
                const updated = { ...prev, [key]: [...(prev[key] || [])] }
                updated[key][refIndex] = result.ref
                return updated
            })
        } catch (err) { setError(err.message) }
    }

    async function handleApproveRefs() {
        setLoading(true); setError('')
        try {
            await api('/video-studio/agent/v2/approve-refs', {
                method: 'POST', body: JSON.stringify({ sessionId, approvedRefs: refs }),
            })
            setStage('storyboard')
        } catch (err) { setError(err.message) }
        finally { setLoading(false) }
    }

    async function handleBuildStoryboard() {
        setLoading(true); setError('')
        try {
            const result = await api('/video-studio/agent/v2/storyboard', {
                method: 'POST', body: JSON.stringify({ sessionId }),
            })
            setStoryboard(result.storyboard)
            setStage('model')
        } catch (err) { setError(err.message) }
        finally { setLoading(false) }
    }

    async function handleSelectModel() {
        setLoading(true); setError('')
        try {
            const result = await api('/video-studio/agent/v2/select-model', {
                method: 'POST',
                body: JSON.stringify({ sessionId, model: selectedModel, resolution: selectedRes, qualityMode: 'fast' }),
            })
            setModelSel(result.modelSelection)
            setStage('generate')
        } catch (err) { setError(err.message) }
        finally { setLoading(false) }
    }

    async function handleGenerate() {
        if (!canCreateVideo) { onUpgradeRequired?.(); return }
        setLoading(true); setGenerating(true); setError('')
        try {
            const result = await api('/video-studio/agent/v2/generate', {
                method: 'POST', body: JSON.stringify({ sessionId }),
            })
            setGenResult(result)
            setLoading(false)

            if (result.isLongForm) {
                pollLongForm(result.longFormJobId || result.projectId)
            } else {
                const ids = {}
                ;(result.scenes || []).forEach(s => {
                    if (s.projectId) ids[s.projectId] = { status: 'generating', progress: 5, sceneId: s.sceneId }
                })
                setSceneStatuses(ids)
                if (Object.keys(ids).length) startPolling(Object.keys(ids))
                else setGenerating(false)
            }
        } catch (err) {
            setError(err.message)
            setLoading(false)
            setGenerating(false)
        }
    }

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
            if (allDone) { clearInterval(pollRef.current); setGenerating(false) }
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
                }
            } catch { /* retry */ }
        }, 8000)
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
        setBrief(''); setAttachments([]); setGeneratedBrief(''); setSelProduct(null)
        setPlanEdits({}); setError('')
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }

    const isIdle = stage === 'idle'
    const hasPlan = !!plan

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full" style={{ minHeight: '75vh' }}>

            {/* ── Stage Breadcrumb Header ──────────────────────────────────── */}
            {!isIdle && (
                <div className="flex-shrink-0 px-1 pb-3">
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                        {['analyze','plan','refs','storyboard','model','generate'].map((s, i) => {
                            const stages = ['analyze','plan','refs','storyboard','model','generate']
                            const cur = stages.indexOf(stage.replace('-review',''))
                            const done = i < cur
                            const active = stages[cur] === s || (stage === 'refs-review' && s === 'refs')
                            return (
                                <div key={s} className="flex items-center gap-1 shrink-0">
                                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${
                                        active ? 'text-white' : done ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)]'
                                    }`} style={{ background: active ? 'linear-gradient(135deg,#14b8a6,#8b5cf6)' : done ? 'rgba(20,184,166,0.1)' : 'transparent' }}>
                                        {done && <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>check</span>}
                                        {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </div>
                                    {i < 5 && <span className="text-[var(--sys-text-muted)] opacity-30 text-[10px]">›</span>}
                                </div>
                            )
                        })}
                        <button onClick={resetAll} className="ml-auto shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border border-[var(--sys-border)]/[0.08] cursor-pointer transition-all">
                            <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>restart_alt</span> New
                        </button>
                    </div>
                </div>
            )}

            {/* ── Chat Stream ──────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto space-y-0 px-1 pb-4">

                {/* ── Welcome / Idle ──────────────────────────────────────── */}
                {isIdle && (
                    <AgentBubble>
                        <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                            <p className="text-sm font-bold text-[var(--sys-text)] mb-1">Hey! I'm your AI Video Director 🎬</p>
                            <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed mb-3">
                                Tell me what video you want to create, or drop a product photo, competitor ad, or voice brief below — I'll analyze it and build a complete video for you.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {QUICK_STARTS.map((qs, i) => (
                                    <button key={i} onClick={() => setBrief(qs.text)}
                                        className="text-left p-2.5 rounded-xl border border-[var(--sys-border)]/[0.06] bg-white/[0.02] hover:border-[var(--sys-primary)]/40 hover:bg-white/[0.04] transition-all cursor-pointer group">
                                        <span className="text-base">{qs.icon}</span>
                                        <p className="text-[10px] text-[var(--sys-text-muted)] group-hover:text-[var(--sys-text)] mt-1 leading-snug line-clamp-2 transition-colors">{qs.text}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </AgentBubble>
                )}

                {/* ── User message shown after submit ─────────────────────── */}
                {!isIdle && analysis && (
                    <UserBubble>
                        <span className="text-xs">{analysis.summary?.split('.')[0] || 'Brief submitted'}</span>
                    </UserBubble>
                )}

                {/* ── STAGE: Analysis result ───────────────────────────────── */}
                {analysis && (
                    <AgentBubble>
                        <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                            <p className="text-xs font-bold text-[var(--sys-text)] mb-2">🧠 Here's what I understand:</p>
                            <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed mb-3">{analysis.summary}</p>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {[analysis.contentType, analysis.brandCategory, analysis.detectedStyle, ...(analysis.toneKeywords || []).slice(0, 2)].filter(Boolean).map((t, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">{t}</span>
                                ))}
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-400 border border-amber-500/20 bg-amber-500/[0.06]">⏱ {analysis.suggestedDuration}s</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-amber-400 border border-amber-500/20 bg-amber-500/[0.06]">📐 {analysis.suggestedRatio}</span>
                            </div>
                            {!plan && (
                                <>
                                    {/* Inline plan customization before generating */}
                                    <div className="border-t border-[var(--sys-border)]/[0.06] pt-3 mb-3">
                                        <p className="text-[10px] text-[var(--sys-text-muted)] mb-2">Customize before I build the plan:</p>
                                        <div className="flex gap-2 flex-wrap">
                                            <select value={planEdits.duration || analysis.suggestedDuration || 30}
                                                onChange={e => setPlanEdits(p => ({...p, duration: Number(e.target.value)}))}
                                                className="bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1 text-[11px] text-[var(--sys-text)] cursor-pointer appearance-none">
                                                {[15,30,45,60,90,120].map(d => <option key={d} value={d}>{d}s</option>)}
                                            </select>
                                            <div className="flex gap-1">
                                                {['9:16','16:9','1:1','4:5'].map(r => (
                                                    <button key={r} onClick={() => setPlanEdits(p => ({...p, ratio: r}))}
                                                        className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer border transition-all ${(planEdits.ratio||analysis.suggestedRatio||'9:16')===r ? 'border-[var(--sys-primary)] text-[var(--sys-primary)] bg-[var(--sys-primary)]/[0.08]' : 'border-[var(--sys-border)]/[0.08] text-[var(--sys-text-muted)]'}`}>
                                                        {r}
                                                    </button>
                                                ))}
                                            </div>
                                            <select value={planEdits.videoType || 'ad-film'}
                                                onChange={e => setPlanEdits(p => ({...p, videoType: e.target.value}))}
                                                className="bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1 text-[11px] text-[var(--sys-text)] cursor-pointer appearance-none">
                                                {['ad-film','ugc','social-reel','explainer','brand-story','product-demo'].map(v => <option key={v} value={v}>{v}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <button onClick={() => handleGeneratePlan(planEdits)} disabled={loading}
                                        className="w-full py-2 rounded-xl font-bold text-[var(--sys-text)] text-xs cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                                        {loading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : '✨'}
                                        {loading ? 'Building creative plan...' : '✨ Build Creative Plan'}
                                    </button>
                                </>
                            )}
                        </div>
                    </AgentBubble>
                )}

                {/* ── STAGE: Plan card ─────────────────────────────────────── */}
                {plan && (
                    <>
                        <UserBubble><span className="text-xs">✅ Let's go with this</span></UserBubble>
                        <AgentBubble>
                            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.02]">
                                <p className="text-xs font-bold text-[var(--sys-text)] mb-2">🎬 Creative Plan Ready</p>
                                <p className="text-sm font-bold text-[var(--sys-primary)] mb-1">{plan.title}</p>
                                <p className="text-[11px] text-[var(--sys-text-muted)] italic mb-3">{plan.hookStrategy}</p>
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">⏱ {plan.duration}s</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">📐 {plan.ratio}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">🎬 {plan.videoType}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-amber-400 border border-amber-500/20 bg-amber-500/[0.06]">💡 {plan.modelRecommendation}</span>
                                </div>
                                {/* Scene breakdown */}
                                <div className="space-y-1 mb-3">
                                    {(plan.scenePlan || []).map((sc, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-[var(--sys-primary)] w-16 shrink-0">{sc.role}</span>
                                            <div className="flex-1 h-1 rounded-full bg-[var(--sys-primary)]/10">
                                                <div className="h-full rounded-full bg-[var(--sys-primary)]/40" style={{ width: `${(sc.duration/(plan.duration||30))*100}%` }} />
                                            </div>
                                            <span className="text-[9px] text-[var(--sys-text-muted)] w-8 text-right">{sc.duration}s</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-3">{plan.styleGuide}</p>
                                {!refs && (
                                    <button onClick={handleGenerateRefs} disabled={loading}
                                        className="w-full py-2 rounded-xl font-bold text-[var(--sys-text)] text-xs cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                                        {loading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : '🖼️'}
                                        {loading ? 'Generating reference images...' : '🖼️ Generate Reference Images'}
                                    </button>
                                )}
                            </div>
                        </AgentBubble>
                    </>
                )}

                {/* ── STAGE: Reference Images ──────────────────────────────── */}
                {refs && (
                    <>
                        <AgentBubble>
                            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                                <p className="text-xs font-bold text-[var(--sys-text)] mb-3">🖼️ Reference Images Generated</p>
                                {[
                                    { key: 'characterRefs', label: '👤 Character', type: 'character' },
                                    { key: 'productRefs',   label: '📦 Product',   type: 'product' },
                                    { key: 'locationRefs',  label: '🎨 Location',  type: 'location' },
                                ].filter(({ key }) => refs[key]?.length > 0).map(({ key, label, type }) => (
                                    <div key={key} className="mb-3">
                                        <p className="text-[10px] text-[var(--sys-text-muted)] mb-2 font-bold">{label}</p>
                                        <div className="flex gap-2 flex-wrap">
                                            {refs[key].map((ref, idx) => (
                                                <div key={idx} className="relative group rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1]" style={{ width: 110, height: 80 }}>
                                                    <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <button onClick={() => handleRegenerateRef(type, idx)}
                                                            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                                                            title="Regenerate">
                                                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>refresh</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {!storyboard && stage === 'refs-review' && (
                                    <div className="flex gap-2 mt-1">
                                        <button onClick={handleGenerateRefs} disabled={loading}
                                            className="flex-1 py-2 rounded-xl font-bold text-xs text-[var(--sys-text-muted)] cursor-pointer border border-[var(--sys-border)]/[0.1] hover:border-[var(--sys-border)] transition-all flex items-center justify-center gap-1 disabled:opacity-40">
                                            <span className="material-symbols-outlined text-sm">refresh</span> Regenerate All
                                        </button>
                                        <button onClick={handleApproveRefs} disabled={loading}
                                            className="flex-1 py-2 rounded-xl font-bold text-[var(--sys-text)] text-xs cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                            style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                                            {loading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : '✅'}
                                            {loading ? 'Approving...' : '✅ Approve References'}
                                        </button>
                                    </div>
                                )}
                                {!storyboard && stage === 'storyboard' && (
                                    <button onClick={handleBuildStoryboard} disabled={loading}
                                        className="w-full mt-2 py-2 rounded-xl font-bold text-[var(--sys-text)] text-xs cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                        style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                                        {loading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : '🎬'}
                                        {loading ? 'Building storyboard (30-60s)...' : '🎬 Build Storyboard'}
                                    </button>
                                )}
                            </div>
                        </AgentBubble>
                    </>
                )}

                {/* ── STAGE: Storyboard ────────────────────────────────────── */}
                {storyboard && (
                    <>
                        <UserBubble><span className="text-xs">✅ References approved</span></UserBubble>
                        <AgentBubble>
                            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                                <p className="text-xs font-bold text-[var(--sys-text)] mb-3">🎬 Storyboard — {storyboard.cuts?.length || 0} cuts</p>
                                {storyboard.posterUrl && (
                                    <div className="rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1] mb-3" style={{ aspectRatio: '16/9' }}>
                                        <img src={storyboard.posterUrl} alt="Storyboard" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                {storyboard.environmentFingerprint && (
                                    <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-2">📍 {storyboard.environmentFingerprint}</p>
                                )}
                                <div className="space-y-1 max-h-32 overflow-y-auto mb-3">
                                    {(storyboard.cuts || []).map((cut, i) => (
                                        <div key={i} className="flex items-start gap-2 p-1.5 rounded-lg bg-white/[0.02]">
                                            <span className="text-[9px] font-bold text-[var(--sys-primary)] px-1.5 py-0.5 rounded bg-[var(--sys-primary)]/10 shrink-0">C{cut.id||i+1}</span>
                                            <span className="text-[10px] text-[var(--sys-text-muted)] leading-relaxed flex-1 line-clamp-2">{cut.scene || ''}</span>
                                            <span className="text-[9px] text-[var(--sys-text-muted)] shrink-0">{cut.duration}s</span>
                                        </div>
                                    ))}
                                </div>
                                {storyboard.colorPalette?.length > 0 && (
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <span className="text-[10px] text-[var(--sys-text-muted)]">Palette:</span>
                                        {storyboard.colorPalette.slice(0, 6).map((c, i) => (
                                            <div key={i} className="w-4 h-4 rounded-full border border-white/10" style={{ background: c }} title={c} />
                                        ))}
                                    </div>
                                )}
                                {/* Model selection inline */}
                                {!modelSel && (
                                    <>
                                        <div className="border-t border-[var(--sys-border)]/[0.06] pt-3 mb-2">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] mb-2">Now choose your AI model:</p>
                                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                                                {MODELS.map(m => (
                                                    <button key={m.id} onClick={() => setSelectedModel(m.id)}
                                                        className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${selectedModel===m.id ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/[0.08]' : 'border-[var(--sys-border)]/[0.08] hover:border-[var(--sys-border)]'}`}>
                                                        <div className="flex items-center gap-1.5 mb-0.5">
                                                            <span className="text-sm">{m.icon}</span>
                                                            <span className="text-[10px] font-bold text-[var(--sys-text)] truncate flex-1">{m.name}</span>
                                                            {m.id === plan?.modelRecommendation && <span className="text-[8px] px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">AI Pick</span>}
                                                            {selectedModel === m.id && <span className="material-symbols-outlined text-[var(--sys-primary)] shrink-0" style={{ fontSize: '12px' }}>check_circle</span>}
                                                        </div>
                                                        <p className="text-[9px] text-[var(--sys-text-muted)] leading-snug">{m.tagline}</p>
                                                        <p className="text-[8px] text-[var(--sys-text-muted)]/60 mt-0.5">Max {m.maxDur}s</p>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-2 mb-2">
                                                <select value={selectedRes} onChange={e => setSelectedRes(e.target.value)}
                                                    className="flex-1 bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1.5 text-xs text-[var(--sys-text)] appearance-none cursor-pointer">
                                                    <option value="720p">720p Fast</option>
                                                    <option value="1080p">1080p HD</option>
                                                </select>
                                            </div>
                                        </div>
                                        <button onClick={handleSelectModel} disabled={loading}
                                            className="w-full py-2 rounded-xl font-bold text-[var(--sys-text)] text-xs cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5"
                                            style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                                            {loading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : '🔧'}
                                            {loading ? `Writing ${selectedModel} prompt...` : '🔧 Confirm Model & Build Prompt'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </AgentBubble>
                    </>
                )}

                {/* ── STAGE: Model prompt ready + Generate ─────────────────── */}
                {modelSel && !genResult && (
                    <>
                        <UserBubble><span className="text-xs">✅ {modelSel.model} selected</span></UserBubble>
                        <AgentBubble>
                            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.02]">
                                <p className="text-xs font-bold text-[var(--sys-text)] mb-2">✅ Prompt Ready — Let's Generate!</p>
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">🤖 {modelSel.model}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">📺 {modelSel.resolution}</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">⏱ {plan?.duration}s</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">📐 {plan?.ratio}</span>
                                </div>
                                {modelSel.finalPrompt && (
                                    <div className="p-2 rounded-lg bg-black/20 border border-[var(--sys-border)]/[0.06] mb-3">
                                        <p className="text-[9px] text-[var(--sys-text-muted)] font-bold mb-1">FINAL PROMPT</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)] leading-relaxed line-clamp-3">{modelSel.finalPrompt}</p>
                                    </div>
                                )}
                                <button onClick={handleGenerate} disabled={loading || generating}
                                    className="w-full py-3 rounded-xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg,#14b8a6,#06b6d4,#8b5cf6)' }}>
                                    <span className="material-symbols-outlined text-lg">movie</span>
                                    🎬 Generate {plan?.duration}s Video
                                </button>
                            </div>
                        </AgentBubble>
                    </>
                )}

                {/* ── STAGE: Generation progress ───────────────────────────── */}
                {genResult && (
                    <>
                        <UserBubble><span className="text-xs">🎬 Generating now!</span></UserBubble>
                        <AgentBubble>
                            <div className="glass-panel rounded-2xl rounded-tl-sm p-4 border border-[var(--sys-border)]/[0.08]">
                                {genResult.isLongForm ? (
                                    <>
                                        <div className="flex items-center gap-2 mb-2">
                                            {generating && <span className="material-symbols-outlined text-[var(--sys-primary)] animate-spin text-base">progress_activity</span>}
                                            {!generating && compiledVideo && <span className="text-base">✅</span>}
                                            <p className="text-xs font-bold text-[var(--sys-text)]">
                                                {compiledVideo ? 'Long-form video ready!' : `Long-form generation in progress...`}
                                            </p>
                                        </div>
                                        {!compiledVideo && (
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">Generating {Math.ceil((plan?.duration||30)/10)} segments. This may take 5-15 minutes.</p>
                                        )}
                                        {compiledVideo && (
                                            <div className="rounded-xl overflow-hidden border border-[var(--sys-primary)]/20 mt-2 relative has-vha">
                                                <video src={compiledVideo} controls className="w-full block" />
                                                <VideoHoverActions videoUrl={compiledVideo} />
                                                <div className="flex items-center justify-between p-2">
                                                    <span className="text-[10px] font-bold text-[var(--sys-primary)]">Final — {plan?.duration}s</span>
                                                    <button onClick={() => handleDownload(compiledVideo, 'final-video')}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/30 cursor-pointer hover:bg-[var(--sys-primary)]/[0.08] transition-all">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>download</span> Download
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs font-bold text-[var(--sys-text)] mb-3">
                                            {generating ? '🎬 Generating scenes...' : '✅ Scenes ready!'}
                                        </p>
                                        <div className="space-y-2 mb-3">
                                            {Object.entries(sceneStatuses).map(([id, st], idx) => (
                                                <div key={id}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] text-[var(--sys-text-muted)] w-14 shrink-0">Scene {idx+1}</span>
                                                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                                                            <div className="h-full rounded-full transition-all duration-700" style={{
                                                                width:`${st.progress||0}%`,
                                                                background: st.status==='done' ? '#10b981' : st.status==='failed' ? '#ef4444' : 'linear-gradient(90deg,#14b8a6,#8b5cf6)',
                                                            }}/>
                                                        </div>
                                                        <span className="text-[9px] shrink-0" style={{ color: st.status==='done'?'#10b981':st.status==='failed'?'#ef4444':'#94a3b8' }}>
                                                            {st.status==='done'?'✅':st.status==='failed'?'❌':`${st.progress||0}%`}
                                                        </span>
                                                    </div>
                                                    {st.status === 'done' && st.videoUrl && (
                                                        <div className="rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1] relative has-vha">
                                                            <video src={st.videoUrl} controls className="w-full block" />
                                                            <VideoHoverActions videoUrl={st.videoUrl} />
                                                            <div className="flex items-center justify-between px-2 py-1">
                                                                <span className="text-[9px] text-[var(--sys-text-muted)]">Scene {idx+1}</span>
                                                                <button onClick={() => handleDownload(st.videoUrl, `scene-${idx+1}`)}
                                                                    className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[9px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/30 cursor-pointer">
                                                                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>download</span> Save
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {!generating && Object.values(sceneStatuses).some(s => s.status === 'done') && (
                                            <button onClick={resetAll}
                                                className="w-full py-2 rounded-xl font-bold text-[var(--sys-text-muted)] text-xs cursor-pointer border border-[var(--sys-border)]/[0.1] hover:border-[var(--sys-border)] transition-all flex items-center justify-center gap-1.5">
                                                <span className="material-symbols-outlined text-sm">add_circle</span> Create Another Video
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </AgentBubble>
                    </>
                )}

                {/* ── Typing / Loading indicator ───────────────────────────── */}
                {loading && <TypingIndicator />}

                {/* ── Error ────────────────────────────────────────────────── */}
                {error && (
                    <AgentBubble>
                        <div className="px-3 py-2.5 rounded-2xl rounded-tl-sm bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {error}
                            <button onClick={() => setError('')} className="ml-auto cursor-pointer opacity-60 hover:opacity-100">✕</button>
                        </div>
                    </AgentBubble>
                )}

                <div ref={bottomRef} />
            </div>

            {/* ── Generated Brief Preview Banner ──────────────────────────── */}
            {generatedBrief && generatedBrief !== brief && (
                <div className="flex-shrink-0 mx-1 mb-2 p-2.5 rounded-xl border border-[var(--sys-primary)]/30 bg-[var(--sys-primary)]/[0.06] flex items-start gap-2">
                    <span className="text-base shrink-0 mt-0.5">🤖</span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-[var(--sys-primary)] font-bold mb-0.5">Brief generated from your upload:</p>
                        <p className="text-[10px] text-[var(--sys-text-muted)] line-clamp-2">{generatedBrief}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button onClick={() => setBrief(generatedBrief)}
                            className="px-2 py-1 rounded-lg text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/30 hover:bg-[var(--sys-primary)]/[0.08] cursor-pointer transition-all">
                            Use
                        </button>
                        <button onClick={() => setGeneratedBrief('')}
                            className="px-2 py-1 rounded-lg text-[10px] text-[var(--sys-text-muted)] border border-[var(--sys-border)]/[0.1] cursor-pointer">
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* ── Attachment Previews ──────────────────────────────────────── */}
            {attachments.length > 0 && (
                <div className="flex-shrink-0 flex gap-2 px-1 mb-2 overflow-x-auto pb-1">
                    {attachments.map(a => (
                        <div key={a.id} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1] bg-[var(--sys-surface)]">
                            {(a.thumbnail || a.localUrl) && a.type !== 'audio' ? (
                                <img src={a.thumbnail || a.localUrl} alt={a.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl">
                                    {a.type === 'audio' ? '🎵' : a.type === 'video' ? '🎥' : '📷'}
                                </div>
                            )}
                            {a.isAnalyzing && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-white animate-spin text-sm">progress_activity</span>
                                </div>
                            )}
                            <button onClick={() => removeAttachment(a.id)}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white text-[9px] flex items-center justify-center cursor-pointer hover:bg-black/90">
                                ✕
                            </button>
                            {a.type === 'video' && !a.isAnalyzing && (
                                <div className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded bg-black/60">
                                    <span className="material-symbols-outlined text-white" style={{ fontSize: '10px' }}>play_arrow</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Floating Input Bar ───────────────────────────────────────── */}
            {(isIdle || stage === 'idle') && (
                <div className="flex-shrink-0 glass-panel rounded-2xl border border-[var(--sys-border)]/[0.1] overflow-hidden">
                    {/* Product selector bar */}
                    {selProduct && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--sys-border)]/[0.06] bg-white/[0.01]">
                            {selProduct.images?.[0] && <img src={selProduct.images[0].url} alt="" className="w-5 h-5 rounded object-cover" />}
                            <span className="text-[10px] text-[var(--sys-primary)] flex-1 truncate">{selProduct.title}</span>
                            <button onClick={() => setSelProduct(null)} className="text-[var(--sys-text-muted)] text-[10px] cursor-pointer hover:text-[var(--sys-text)]">✕</button>
                        </div>
                    )}

                    {/* Textarea */}
                    <textarea ref={textareaRef} value={brief} onChange={e => setBrief(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }}}
                        placeholder="Describe your video, or upload an image/video/audio brief..."
                        rows={1}
                        className="w-full bg-transparent px-4 pt-3 pb-1 text-sm text-[var(--sys-text)] placeholder:text-[var(--sys-text-muted)]/50 resize-none outline-none leading-relaxed" />

                    {/* Action row */}
                    <div className="flex items-center gap-1 px-3 pb-2 pt-1">
                        {/* Attach buttons */}
                        <button onClick={() => { fileRef.current.accept = 'image/*'; fileRef.current.click() }}
                            className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all" title="Upload image">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_photo_alternate</span>
                        </button>
                        <button onClick={() => { fileRef.current.accept = 'video/*'; fileRef.current.click() }}
                            className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all" title="Upload video">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>video_camera_back</span>
                        </button>
                        <button onClick={() => { fileRef.current.accept = 'audio/*'; fileRef.current.click() }}
                            className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all" title="Upload audio brief">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>mic</span>
                        </button>

                        {/* Product selector */}
                        {products.length > 0 && (
                            <div className="relative">
                                <button onClick={() => setShowProducts(!showProducts)}
                                    className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/[0.06] cursor-pointer transition-all" title="Select product">
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>inventory_2</span>
                                </button>
                                {showProducts && (
                                    <div className="absolute bottom-full left-0 mb-2 w-52 glass-panel rounded-xl border border-[var(--sys-border)]/[0.1] overflow-hidden z-10 max-h-40 overflow-y-auto">
                                        {products.map(p => (
                                            <button key={p._id} onClick={() => { setSelProduct(p); setShowProducts(false) }}
                                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.04] cursor-pointer text-left transition-all border-b border-[var(--sys-border)]/[0.04] last:border-0">
                                                {p.images?.[0] && <img src={p.images[0].url} alt="" className="w-7 h-7 rounded object-cover" />}
                                                <span className="text-xs text-[var(--sys-text)] truncate">{p.title}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex-1" />

                        {/* Analyzing spinner */}
                        {mediaAnalyzing && (
                            <span className="text-[10px] text-[var(--sys-text-muted)] flex items-center gap-1">
                                <span className="material-symbols-outlined animate-spin" style={{ fontSize: '12px' }}>progress_activity</span> Analyzing...
                            </span>
                        )}

                        {/* Send */}
                        <button onClick={handleSend}
                            disabled={loading || (!brief.trim() && attachments.length === 0)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white cursor-pointer transition-all hover:opacity-90 disabled:opacity-30"
                            style={{ background: 'linear-gradient(135deg,#14b8a6,#8b5cf6)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_upward</span>
                        </button>
                    </div>

                    <input ref={fileRef} type="file" multiple className="hidden" onChange={handleMediaUpload} />
                </div>
            )}
        </div>
    )
}

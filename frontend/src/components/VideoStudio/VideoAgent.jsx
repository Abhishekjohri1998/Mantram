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

// ── Stage config ──────────────────────────────────────────────────────────────
const STAGES = [
    { id: 'input',      label: 'Brief',       icon: 'edit_note',      desc: 'Describe your video' },
    { id: 'plan',       label: 'Plan',         icon: 'auto_awesome',   desc: 'Creative plan' },
    { id: 'refs',       label: 'References',   icon: 'image_search',   desc: 'Visual anchors' },
    { id: 'storyboard', label: 'Storyboard',   icon: 'movie_creation', desc: 'Shot plan' },
    { id: 'model',      label: 'Model',        icon: 'settings_suggest', desc: 'AI engine' },
    { id: 'generate',   label: 'Generate',     icon: 'smart_display',  desc: 'Final video' },
]

const MODEL_CARDS = [
    { id: 'seedance-2.0',   name: 'Seedance 2.0',       icon: '🎬', tier: 'Pro',     tagline: 'Best overall — image-ref + fast', maxDur: 120, color: '#14b8a6', bestFor: 'product-ad, brand-story' },
    { id: 'kling-3.0',      name: 'Kling 3.0',           icon: '👑', tier: 'Premium', tagline: 'Cinematic quality + multi-shot',  maxDur: 60,  color: '#f59e0b', bestFor: 'brand-story, cinematic' },
    { id: 'veo-3.1',        name: 'Veo 3.1',             icon: '🎤', tier: 'Ultra',   tagline: 'Native audio + most realistic',   maxDur: 30,  color: '#8b5cf6', bestFor: 'ugc, testimonial' },
    { id: 'veo-3.1-fast',   name: 'Veo 3.1 Fast',        icon: '⚡', tier: 'Premium', tagline: 'Fast Veo with audio support',     maxDur: 30,  color: '#6d28d9', bestFor: 'social-reel, ugc' },
    { id: 'grok-imagine',   name: 'Grok Video',          icon: '🤖', tier: 'Fast',    tagline: 'Fastest — great for reels',       maxDur: 15,  color: '#ef4444', bestFor: 'social-reel, fast' },
    { id: 'gemini-flash',   name: 'Gemini Flash',        icon: '✨', tier: 'Pro',     tagline: 'Motion graphics + explainers',    maxDur: 30,  color: '#3b82f6', bestFor: 'explainer, animated' },
]

const QUICK_PROMPTS = [
    { icon: '🛍️', label: 'Product Ad',    prompt: 'Create a 30-second product ad with close-up shots, lifestyle usage, and a strong CTA' },
    { icon: '📱', label: 'Social Reel',   prompt: 'Create a 15s vertical social reel with trendy hook and dynamic transitions' },
    { icon: '🎥', label: 'Brand Story',   prompt: 'Create a 60-second brand story film — emotional narrative, cinematic visuals' },
    { icon: '🚀', label: 'Launch Video',  prompt: 'Create a product launch teaser with reveal moments and dramatic lighting' },
    { icon: '📖', label: 'Explainer',     prompt: 'Create a 45-second explainer with clear product demonstrations' },
    { icon: '🎯', label: 'UGC Style',     prompt: 'Create authentic UGC-style testimonial video with warm, relatable tone' },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function VideoAgent({ activeBrand, canCreateVideo = true, onUpgradeRequired }) {
    // ── Stage state ──────────────────────────────────────────────────────────
    const [currentStage, setCurrentStage] = useState('input')
    const [sessionId, setSessionId] = useState(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState('')

    // ── Stage data ───────────────────────────────────────────────────────────
    const [analysis, setAnalysis]     = useState(null)
    const [plan, setPlan]             = useState(null)
    const [refs, setRefs]             = useState(null)
    const [storyboard, setStoryboard] = useState(null)
    const [modelSel, setModelSel]     = useState(null)
    const [genResult, setGenResult]   = useState(null)
    const [sceneStatuses, setSceneStatuses] = useState({})

    // ── Input state ──────────────────────────────────────────────────────────
    const [brief, setBrief]               = useState('')
    const [uploadedImages, setUploadedImages] = useState([])
    const [characterPhoto, setCharacterPhoto] = useState(null)
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [products, setProducts]         = useState([])
    const [showProductPicker, setShowProductPicker] = useState(false)

    // ── Plan editing ─────────────────────────────────────────────────────────
    const [planDuration, setPlanDuration] = useState(30)
    const [planRatio, setPlanRatio]       = useState('9:16')
    const [planVideoType, setPlanVideoType] = useState('ad-film')

    // ── Model selection ──────────────────────────────────────────────────────
    const [selectedModel, setSelectedModel] = useState('seedance-2.0')
    const [selectedRes, setSelectedRes]     = useState('1080p')
    const [selectedQuality, setSelectedQuality] = useState('fast')

    // ── Generation ───────────────────────────────────────────────────────────
    const [generating, setGenerating] = useState(false)
    const [compiledVideo, setCompiledVideo] = useState(null)
    const pollRef = useRef(null)
    const fileRef = useRef(null)
    const charFileRef = useRef(null)
    const chatEndRef = useRef(null)

    // ── Load products ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!activeBrand?._id) { setProducts([]); return }
        api(`/video-studio/agent/products?brandId=${activeBrand._id}`)
            .then(d => setProducts(d.products || []))
            .catch(() => {})
    }, [activeBrand?._id])

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [currentStage, loading])
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ── File handlers ────────────────────────────────────────────────────────
    async function handleImageUpload(e) {
        const files = Array.from(e.target.files || [])
        for (const file of files) {
            const url = URL.createObjectURL(file)
            setUploadedImages(prev => [...prev.slice(-4), { url, name: file.name, file }])
        }
        e.target.value = ''
    }

    async function handleCharUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        setCharacterPhoto({ url: URL.createObjectURL(file), name: file.name, file })
        e.target.value = ''
    }

    async function uploadFile(file, name) {
        const fd = new FormData(); fd.append('file', file, name)
        const r = await fetch(`${API_BASE}/video-studio/agent/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` },
            body: fd,
        })
        const d = await r.json()
        return d.url || ''
    }

    // ── Stage 1 → Start Analysis ─────────────────────────────────────────────
    async function handleAnalyze() {
        if (!brief.trim() && uploadedImages.length === 0) {
            setErrorMsg('Please enter a brief or upload images'); return
        }
        if (!canCreateVideo) { onUpgradeRequired?.(); return }
        setLoading(true); setErrorMsg('')

        try {
            // Upload images first
            const uploadedUrls = []
            for (const img of uploadedImages) {
                if (img.file) {
                    const url = await uploadFile(img.file, img.name)
                    if (url) uploadedUrls.push({ url, label: img.name, source: 'upload' })
                } else if (img.url?.startsWith('http')) {
                    uploadedUrls.push({ url: img.url, label: img.name || 'image', source: 'url' })
                }
            }

            let charPhotoUrl = ''
            if (characterPhoto?.file) {
                charPhotoUrl = await uploadFile(characterPhoto.file, characterPhoto.name)
            }

            const result = await api('/video-studio/agent/v2/start', {
                method: 'POST',
                body: JSON.stringify({
                    brief: brief.trim(),
                    images: uploadedUrls,
                    brandId: activeBrand?._id || '',
                    productId: selectedProduct?._id || null,
                    videoUrl: '',
                }),
            })

            setSessionId(result.sessionId)
            setAnalysis(result.analysis)
            setPlanDuration(result.analysis?.suggestedDuration || 30)
            setPlanRatio(result.analysis?.suggestedRatio || '9:16')
            setCurrentStage('plan')
        } catch (err) {
            setErrorMsg(err.message)
        } finally {
            setLoading(false)
        }
    }

    // ── Stage 2 → Generate Plan ──────────────────────────────────────────────
    async function handleGeneratePlan() {
        if (!sessionId) return
        setLoading(true); setErrorMsg('')
        try {
            const result = await api('/video-studio/agent/v2/plan', {
                method: 'POST',
                body: JSON.stringify({ sessionId, durationOverride: planDuration, ratioOverride: planRatio, videoTypeOverride: planVideoType }),
            })
            setPlan(result.plan)
            setSelectedModel(result.plan?.modelRecommendation || 'seedance-2.0')
            setCurrentStage('refs')
        } catch (err) { setErrorMsg(err.message) }
        finally { setLoading(false) }
    }

    // ── Stage 3 → Generate Refs ──────────────────────────────────────────────
    async function handleGenerateRefs() {
        if (!sessionId) return
        setLoading(true); setErrorMsg('')
        try {
            const result = await api('/video-studio/agent/v2/generate-refs', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            })
            setRefs(result.refs)
            if (result.autoApproved) setCurrentStage('storyboard')
            else setCurrentStage('refs')
        } catch (err) { setErrorMsg(err.message) }
        finally { setLoading(false) }
    }

    async function handleRegenerateRef(refType, refIndex) {
        try {
            const result = await api(`/video-studio/agent/v2/${sessionId}/regenerate-ref`, {
                method: 'POST',
                body: JSON.stringify({ refType, refIndex }),
            })
            setRefs(prev => {
                const updated = { ...prev }
                const key = `${refType}Refs`
                updated[key] = [...(prev[key] || [])]
                updated[key][refIndex] = result.ref
                return updated
            })
        } catch (err) { setErrorMsg(err.message) }
    }

    async function handleApproveRefs() {
        if (!sessionId) return
        setLoading(true); setErrorMsg('')
        try {
            await api('/video-studio/agent/v2/approve-refs', {
                method: 'POST',
                body: JSON.stringify({ sessionId, approvedRefs: refs }),
            })
            setCurrentStage('storyboard')
        } catch (err) { setErrorMsg(err.message) }
        finally { setLoading(false) }
    }

    // ── Stage 4 → Build Storyboard ───────────────────────────────────────────
    async function handleBuildStoryboard() {
        if (!sessionId) return
        setLoading(true); setErrorMsg('')
        try {
            const result = await api('/video-studio/agent/v2/storyboard', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            })
            setStoryboard(result.storyboard)
            setCurrentStage('model')
        } catch (err) { setErrorMsg(err.message) }
        finally { setLoading(false) }
    }

    // ── Stage 5 → Model Select ───────────────────────────────────────────────
    async function handleSelectModel() {
        if (!sessionId) return
        setLoading(true); setErrorMsg('')
        try {
            const result = await api('/video-studio/agent/v2/select-model', {
                method: 'POST',
                body: JSON.stringify({ sessionId, model: selectedModel, resolution: selectedRes, qualityMode: selectedQuality }),
            })
            setModelSel(result.modelSelection)
            setCurrentStage('generate')
        } catch (err) { setErrorMsg(err.message) }
        finally { setLoading(false) }
    }

    // ── Stage 6 → Generate ───────────────────────────────────────────────────
    async function handleGenerate() {
        if (!sessionId || !canCreateVideo) { onUpgradeRequired?.(); return }
        setLoading(true); setGenerating(true); setErrorMsg('')
        try {
            const result = await api('/video-studio/agent/v2/generate', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
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
                if (Object.keys(ids).length) startScenePolling(Object.keys(ids))
                else setGenerating(false)
            }
        } catch (err) {
            setErrorMsg(err.message)
            setLoading(false)
            setGenerating(false)
        }
    }

    function startScenePolling(projectIds) {
        pollRef.current = setInterval(async () => {
            const updated = {}
            let allDone = true
            for (const id of projectIds) {
                try {
                    const r = await api(`/video-studio/${id}/status`)
                    const proj = r.project
                    if (proj.generation?.videoUrl || proj.status === 'done' || proj.status === 'critique' || proj.status === 'completed') {
                        updated[id] = { status: 'done', videoUrl: `${API_BASE}/video-studio/${id}/video`, progress: 100 }
                    } else if (proj.status === 'failed' || proj.status === 'error') {
                        updated[id] = { status: 'failed', progress: 0, error: proj.errorMessage || 'Failed' }
                    } else {
                        updated[id] = { status: 'generating', progress: proj.generation?.progress || 10 }
                        allDone = false
                    }
                } catch { updated[id] = { status: 'generating', progress: 10 }; allDone = false }
            }
            setSceneStatuses(updated)
            if (allDone) {
                clearInterval(pollRef.current)
                setGenerating(false)
            }
        }, 6000)
    }

    function pollLongForm(jobId) {
        // Poll long-form job status every 8 seconds
        let tries = 0
        pollRef.current = setInterval(async () => {
            tries++
            if (tries > 90) { clearInterval(pollRef.current); setGenerating(false); return } // 12min max
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
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.mp4`
            document.body.appendChild(a); a.click()
            setTimeout(() => { document.body.removeChild(a) }, 100)
        } catch { window.open(url, '_blank') }
    }

    function resetAll() {
        setCurrentStage('input'); setSessionId(null); setAnalysis(null); setPlan(null); setRefs(null)
        setStoryboard(null); setModelSel(null); setGenResult(null); setSceneStatuses({})
        setBrief(''); setUploadedImages([]); setCharacterPhoto(null); setSelectedProduct(null)
        setGenerating(false); setCompiledVideo(null); setErrorMsg('')
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    const stageIndex = STAGES.findIndex(s => s.id === currentStage)

    return (
        <div className="fade-up" style={{ minHeight: '80vh' }}>

            {/* ── Stage Progress Header ────────────────────────────────────── */}
            <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08] mb-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #14b8a6, #06b6d4, #8b5cf6)' }}>
                            <span className="material-symbols-outlined text-white" style={{ fontSize: '18px' }}>smart_display</span>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-[var(--sys-text)]">Video Agent</h2>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">5-Stage AI Pipeline • Brand-aware • Multi-model</p>
                        </div>
                    </div>
                    {sessionId && (
                        <button onClick={resetAll} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border border-[var(--sys-border)]/[0.06] hover:border-[var(--sys-border)] transition-all cursor-pointer">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>refresh</span> New
                        </button>
                    )}
                </div>

                {/* Stage pills */}
                <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
                    {STAGES.map((stage, idx) => {
                        const isDone = idx < stageIndex
                        const isActive = stage.id === currentStage
                        return (
                            <div key={stage.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                                isActive ? 'text-[var(--sys-text)]' : isDone ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)]'
                            }`} style={{
                                background: isActive ? 'linear-gradient(135deg, rgba(20,184,166,0.2), rgba(139,92,246,0.2))' : isDone ? 'rgba(20,184,166,0.08)' : 'transparent',
                                border: `1px solid ${isActive ? 'rgba(20,184,166,0.4)' : isDone ? 'rgba(20,184,166,0.2)' : 'transparent'}`,
                            }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                                    {isDone ? 'check_circle' : stage.icon}
                                </span>
                                {stage.label}
                                {idx < STAGES.length - 1 && <span className="text-[var(--sys-text-muted)] ml-1 opacity-40">→</span>}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── Error message ────────────────────────────────────────────── */}
            {errorMsg && (
                <div className="mb-3 p-3 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {errorMsg}
                    <button onClick={() => setErrorMsg('')} className="ml-auto cursor-pointer">✕</button>
                </div>
            )}

            {/* ════════════════════ STAGE PANELS ════════════════════════════ */}

            {/* ── STAGE 1: Input ───────────────────────────────────────────── */}
            {currentStage === 'input' && (
                <div className="space-y-3">
                    {/* Quick prompts */}
                    <div className="grid grid-cols-3 gap-2">
                        {QUICK_PROMPTS.map((qp, i) => (
                            <button key={i} onClick={() => setBrief(qp.prompt)}
                                className="p-3 rounded-xl border border-[var(--sys-border)]/[0.06] bg-white/[0.02] hover:border-[var(--sys-primary)]/40 hover:bg-[var(--sys-surface)] transition-all cursor-pointer text-left group">
                                <div className="text-lg mb-1">{qp.icon}</div>
                                <div className="text-xs font-bold text-[var(--sys-text)] group-hover:text-[var(--sys-primary)] transition-colors">{qp.label}</div>
                            </button>
                        ))}
                    </div>

                    {/* Brief input */}
                    <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08]">
                        <label className="text-[11px] font-bold text-[var(--sys-text-muted)] mb-2 block">CREATIVE BRIEF</label>
                        <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4}
                            placeholder="Describe the video you want to create. Include product, mood, audience, style, platform..."
                            className="w-full bg-transparent text-sm text-[var(--sys-text)] placeholder:text-[var(--sys-text-muted)]/50 resize-none outline-none leading-relaxed" />
                    </div>

                    {/* Product + Image pickers */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Product picker */}
                        <div className="glass-panel rounded-xl p-3 border border-[var(--sys-border)]/[0.08]">
                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] mb-2 block">PRODUCT</label>
                            <button onClick={() => setShowProductPicker(!showProductPicker)}
                                className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-[var(--sys-border)]/[0.06] hover:border-[var(--sys-border)] transition-all cursor-pointer">
                                {selectedProduct ? (
                                    <>
                                        {selectedProduct.images?.[0] && <img src={selectedProduct.images[0].url} alt="" className="w-7 h-7 rounded object-cover" />}
                                        <span className="text-xs text-[var(--sys-text)] truncate flex-1">{selectedProduct.title}</span>
                                        <button onClick={e => { e.stopPropagation(); setSelectedProduct(null) }} className="text-[var(--sys-text-muted)] cursor-pointer">✕</button>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[var(--sys-text-muted)]" style={{ fontSize: '16px' }}>inventory_2</span>
                                        <span className="text-xs text-[var(--sys-text-muted)]">Select product</span>
                                    </>
                                )}
                            </button>
                            {showProductPicker && products.length > 0 && (
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                                    {products.map(p => (
                                        <button key={p._id} onClick={() => { setSelectedProduct(p); setShowProductPicker(false) }}
                                            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white/[0.04] cursor-pointer text-left transition-all">
                                            {p.images?.[0] && <img src={p.images[0].url} alt="" className="w-7 h-7 rounded object-cover" />}
                                            <span className="text-xs text-[var(--sys-text)] truncate">{p.title}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Image uploads */}
                        <div className="glass-panel rounded-xl p-3 border border-[var(--sys-border)]/[0.08]">
                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] mb-2 block">REFERENCE IMAGES</label>
                            <div className="flex flex-wrap gap-1.5">
                                {uploadedImages.map((img, i) => (
                                    <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden border border-[var(--sys-border)]/[0.1] group">
                                        <img src={img.url} alt="" className="w-full h-full object-cover" />
                                        <button onClick={() => setUploadedImages(prev => prev.filter((_, j) => j !== i))}
                                            className="absolute inset-0 bg-black/60 hidden group-hover:flex items-center justify-center text-white text-xs cursor-pointer">✕</button>
                                    </div>
                                ))}
                                <button onClick={() => fileRef.current?.click()}
                                    className="w-10 h-10 rounded-lg border border-dashed border-[var(--sys-border)]/30 flex items-center justify-center text-[var(--sys-text-muted)] hover:border-[var(--sys-primary)]/50 hover:text-[var(--sys-primary)] transition-all cursor-pointer">
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_photo_alternate</span>
                                </button>
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                        </div>
                    </div>

                    {/* Character photo */}
                    <div className="glass-panel rounded-xl p-3 border border-[var(--sys-border)]/[0.08] flex items-center gap-3">
                        <div>
                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] mb-1 block">CHARACTER / MODEL PHOTO</label>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">Upload a photo to maintain face consistency across all scenes</p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            {characterPhoto && (
                                <div className="relative w-10 h-10 rounded-full overflow-hidden border border-[var(--sys-primary)]/30">
                                    <img src={characterPhoto.url} alt="" className="w-full h-full object-cover" />
                                </div>
                            )}
                            <button onClick={() => charFileRef.current?.click()}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--sys-border)]/[0.1] text-[11px] text-[var(--sys-text-muted)] hover:border-[var(--sys-primary)]/40 hover:text-[var(--sys-primary)] transition-all cursor-pointer">
                                <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>person_add</span>
                                {characterPhoto ? 'Change' : 'Upload'}
                            </button>
                        </div>
                        <input ref={charFileRef} type="file" accept="image/*" className="hidden" onChange={handleCharUpload} />
                    </div>

                    {/* CTA */}
                    <button onClick={handleAnalyze} disabled={loading || (!brief.trim() && uploadedImages.length === 0)}
                        className="w-full py-3.5 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #14b8a6, #06b6d4, #8b5cf6)' }}>
                        {loading ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">psychology</span>}
                        {loading ? 'Analyzing your brief...' : '🚀 Analyze & Start'}
                    </button>
                </div>
            )}

            {/* ── STAGE 2: Plan ─────────────────────────────────────────────── */}
            {currentStage === 'plan' && analysis && (
                <div className="space-y-3">
                    {/* Analysis summary */}
                    <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08]">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">🧠</span>
                            <h3 className="text-sm font-bold text-[var(--sys-text)]">AI Analysis</h3>
                        </div>
                        <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed mb-3">{analysis.summary}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {[analysis.contentType, analysis.brandCategory, analysis.detectedStyle, ...(analysis.toneKeywords || []).slice(0, 3)].filter(Boolean).map((tag, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium text-[var(--sys-primary)] border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.06]">{tag}</span>
                            ))}
                        </div>
                    </div>

                    {/* Plan customization */}
                    <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08]">
                        <h3 className="text-sm font-bold text-[var(--sys-text)] mb-3">Customize Your Plan</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {/* Duration */}
                            <div>
                                <label className="text-[10px] text-[var(--sys-text-muted)] mb-1 block">Duration</label>
                                <select value={planDuration} onChange={e => setPlanDuration(Number(e.target.value))}
                                    className="w-full bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1.5 text-xs text-[var(--sys-text)] appearance-none cursor-pointer">
                                    <option value={15}>15s — Reel</option>
                                    <option value={30}>30s — Short Ad</option>
                                    <option value={45}>45s — Mid</option>
                                    <option value={60}>60s — Brand Story</option>
                                    <option value={90}>90s — Long Form</option>
                                    <option value={120}>120s — Film</option>
                                </select>
                            </div>
                            {/* Ratio */}
                            <div>
                                <label className="text-[10px] text-[var(--sys-text-muted)] mb-1 block">Aspect Ratio</label>
                                <div className="flex gap-1">
                                    {['9:16', '16:9', '1:1', '4:5'].map(r => (
                                        <button key={r} onClick={() => setPlanRatio(r)}
                                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${planRatio === r ? 'border-[var(--sys-primary)] text-[var(--sys-primary)] bg-[var(--sys-primary)]/[0.08]' : 'border-[var(--sys-border)]/[0.08] text-[var(--sys-text-muted)]'}`}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Video type */}
                            <div>
                                <label className="text-[10px] text-[var(--sys-text-muted)] mb-1 block">Video Type</label>
                                <select value={planVideoType} onChange={e => setPlanVideoType(e.target.value)}
                                    className="w-full bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1.5 text-xs text-[var(--sys-text)] appearance-none cursor-pointer">
                                    <option value="ad-film">📽️ Ad Film</option>
                                    <option value="ugc">🎤 UGC Style</option>
                                    <option value="social-reel">📱 Social Reel</option>
                                    <option value="explainer">📖 Explainer</option>
                                    <option value="brand-story">❤️ Brand Story</option>
                                    <option value="product-demo">🛍️ Product Demo</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <button onClick={handleGeneratePlan} disabled={loading}
                        className="w-full py-3 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                        {loading ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">auto_awesome</span>}
                        {loading ? 'Generating creative plan...' : '✨ Generate Creative Plan'}
                    </button>
                </div>
            )}

            {/* ── STAGE 3: References ──────────────────────────────────────── */}
            {currentStage === 'refs' && plan && (
                <div className="space-y-3">
                    {/* Plan summary card */}
                    <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.03]">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">✅</span>
                            <h3 className="text-sm font-bold text-[var(--sys-text)]">{plan.title}</h3>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px]">
                            <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">⏱ {plan.duration}s</span>
                            <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">📐 {plan.ratio}</span>
                            <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">🎬 {plan.videoType}</span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">💡 Rec: {plan.modelRecommendation}</span>
                        </div>
                        <p className="text-[10px] text-[var(--sys-text-muted)] mt-2 italic">{plan.styleGuide}</p>
                    </div>

                    {/* Refs needed indicator */}
                    <div className="glass-panel rounded-xl p-3 border border-[var(--sys-border)]/[0.08]">
                        <h3 className="text-xs font-bold text-[var(--sys-text)] mb-2">References to Generate</h3>
                        <div className="flex gap-2">
                            {[
                                { key: 'character', icon: '👤', label: 'Character Ref' },
                                { key: 'product',   icon: '📦', label: 'Product Sheet' },
                                { key: 'location',  icon: '🎨', label: 'Location Mood' },
                            ].map(({ key, icon, label }) => (
                                <div key={key} className={`flex-1 text-center p-2 rounded-lg border text-[10px] font-medium transition-all ${
                                    plan.refsNeeded?.[key]
                                        ? 'border-[var(--sys-primary)]/30 bg-[var(--sys-primary)]/[0.06] text-[var(--sys-primary)]'
                                        : 'border-[var(--sys-border)]/[0.06] text-[var(--sys-text-muted)] opacity-50'
                                }`}>
                                    <div className="text-base mb-0.5">{icon}</div>
                                    {label}
                                    {plan.refsNeeded?.[key] && <div className="text-[9px] mt-0.5 opacity-70">Will generate</div>}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Generated refs display */}
                    {refs && (
                        <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08] space-y-3">
                            {[
                                { key: 'characterRefs', label: '👤 Character', type: 'character' },
                                { key: 'productRefs',   label: '📦 Product',   type: 'product' },
                                { key: 'locationRefs',  label: '🎨 Location',  type: 'location' },
                            ].filter(({ key }) => refs[key]?.length > 0).map(({ key, label, type }) => (
                                <div key={key}>
                                    <p className="text-[10px] font-bold text-[var(--sys-text-muted)] mb-2">{label}</p>
                                    <div className="flex gap-2 flex-wrap">
                                        {refs[key].map((ref, idx) => (
                                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-[var(--sys-border)]/[0.1]" style={{ width: 120, height: 90 }}>
                                                <img src={ref.url} alt={ref.label} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                                    <button onClick={() => handleRegenerateRef(type, idx)}
                                                        className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-all"
                                                        title="Regenerate">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span>
                                                    </button>
                                                </div>
                                                <div className="absolute bottom-0 inset-x-0 p-1 bg-gradient-to-t from-black/80">
                                                    <p className="text-[9px] text-white truncate">{ref.label}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!refs ? (
                        <button onClick={handleGenerateRefs} disabled={loading}
                            className="w-full py-3 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                            {loading ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">image_search</span>}
                            {loading ? 'Generating reference images...' : '🖼️ Generate Reference Images'}
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={handleGenerateRefs} disabled={loading}
                                className="flex-1 py-3 rounded-2xl font-bold text-[var(--sys-text-muted)] text-sm cursor-pointer transition-all hover:scale-[1.01] border border-[var(--sys-border)]/[0.1] hover:border-[var(--sys-border)] disabled:opacity-40 flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-base">refresh</span> Regenerate All
                            </button>
                            <button onClick={handleApproveRefs} disabled={loading}
                                className="flex-1 py-3 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                                {loading ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">check_circle</span>}
                                ✅ Approve & Continue
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── STAGE 4: Storyboard ──────────────────────────────────────── */}
            {currentStage === 'storyboard' && (
                <div className="space-y-3">
                    {!storyboard ? (
                        <>
                            <div className="glass-panel rounded-2xl p-6 text-center border border-[var(--sys-border)]/[0.08]">
                                <div className="text-4xl mb-3">🎬</div>
                                <h3 className="text-sm font-bold text-[var(--sys-text)] mb-1">Ready to Build Storyboard</h3>
                                <p className="text-xs text-[var(--sys-text-muted)]">AI will create a detailed cut-by-cut storyboard using your approved references and brand DNA</p>
                            </div>
                            <button onClick={handleBuildStoryboard} disabled={loading}
                                className="w-full py-3 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                                {loading ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">movie_creation</span>}
                                {loading ? 'Building storyboard (30-60s)...' : '🎬 Build AI Storyboard'}
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Storyboard poster */}
                            {storyboard.posterUrl && (
                                <div className="rounded-2xl overflow-hidden border border-[var(--sys-border)]/[0.1]" style={{ aspectRatio: '16/9' }}>
                                    <img src={storyboard.posterUrl} alt="Storyboard" className="w-full h-full object-cover" />
                                </div>
                            )}

                            {/* Cut plan */}
                            <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08]">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-base">🎬</span>
                                    <h3 className="text-sm font-bold text-[var(--sys-text)]">Shot List — {storyboard.cuts?.length || 0} cuts</h3>
                                </div>
                                {storyboard.environmentFingerprint && (
                                    <p className="text-[10px] text-[var(--sys-text-muted)] mb-3 italic">📍 {storyboard.environmentFingerprint}</p>
                                )}
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {(storyboard.cuts || []).map((cut, i) => (
                                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02] border border-[var(--sys-border)]/[0.04]">
                                            <span className="text-[9px] font-bold text-[var(--sys-primary)] bg-[var(--sys-primary)]/10 px-1.5 py-0.5 rounded shrink-0">C{cut.id || i+1}</span>
                                            <span className="text-[10px] text-[var(--sys-text-muted)] leading-relaxed">{cut.scene?.substring(0, 100) || ''}...</span>
                                            <span className="text-[9px] text-[var(--sys-text-muted)] shrink-0 ml-auto">{cut.duration}s</span>
                                        </div>
                                    ))}
                                </div>
                                {/* Color palette */}
                                {storyboard.colorPalette?.length > 0 && (
                                    <div className="flex items-center gap-2 mt-3">
                                        <span className="text-[10px] text-[var(--sys-text-muted)]">Palette:</span>
                                        {storyboard.colorPalette.slice(0, 5).map((c, i) => (
                                            <div key={i} className="w-5 h-5 rounded-full border border-white/10" style={{ background: c }} title={c} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button onClick={handleBuildStoryboard} disabled={loading}
                                    className="flex-1 py-3 rounded-2xl font-bold text-[var(--sys-text-muted)] text-sm cursor-pointer border border-[var(--sys-border)]/[0.1] hover:border-[var(--sys-border)] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-base">refresh</span> Regenerate
                                </button>
                                <button onClick={() => setCurrentStage('model')}
                                    className="flex-1 py-3 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                                    style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                                    <span className="material-symbols-outlined text-base">check_circle</span> ✅ Approve Storyboard
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── STAGE 5: Model Selection ─────────────────────────────────── */}
            {currentStage === 'model' && (
                <div className="space-y-3">
                    <div className="glass-panel rounded-xl p-3 border border-[var(--sys-border)]/[0.08]">
                        <h3 className="text-xs font-bold text-[var(--sys-text)] mb-1">Select AI Video Model</h3>
                        <p className="text-[10px] text-[var(--sys-text-muted)]">AI recommends <strong className="text-[var(--sys-primary)]">{plan?.modelRecommendation}</strong> for your video type</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {MODEL_CARDS.map(m => {
                            const isSelected = selectedModel === m.id
                            const isRecommended = m.id === plan?.modelRecommendation
                            return (
                                <button key={m.id} onClick={() => setSelectedModel(m.id)}
                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${isSelected ? 'border-[var(--sys-primary)] bg-[var(--sys-primary)]/[0.08]' : 'border-[var(--sys-border)]/[0.08] bg-white/[0.02] hover:border-[var(--sys-border)]'}`}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className="text-base">{m.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs font-bold text-[var(--sys-text)] truncate">{m.name}</span>
                                                {isRecommended && <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">REC</span>}
                                            </div>
                                            <span className="text-[8px] font-bold uppercase" style={{ color: m.color }}>{m.tier}</span>
                                        </div>
                                        {isSelected && <span className="material-symbols-outlined text-[var(--sys-primary)] text-base shrink-0">check_circle</span>}
                                    </div>
                                    <p className="text-[10px] text-[var(--sys-text-muted)] leading-snug">{m.tagline}</p>
                                    <p className="text-[9px] text-[var(--sys-text-muted)]/60 mt-1">Max {m.maxDur}s • {m.bestFor}</p>
                                </button>
                            )
                        })}
                    </div>

                    {/* Quality settings */}
                    <div className="glass-panel rounded-xl p-3 border border-[var(--sys-border)]/[0.08] grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] text-[var(--sys-text-muted)] mb-1 block">Resolution</label>
                            <select value={selectedRes} onChange={e => setSelectedRes(e.target.value)}
                                className="w-full bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1.5 text-xs text-[var(--sys-text)] appearance-none cursor-pointer">
                                <option value="720p">720p — Fast</option>
                                <option value="1080p">1080p — Standard</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] text-[var(--sys-text-muted)] mb-1 block">Quality Mode</label>
                            <select value={selectedQuality} onChange={e => setSelectedQuality(e.target.value)}
                                className="w-full bg-white/[0.04] border border-[var(--sys-border)]/[0.08] rounded-lg px-2 py-1.5 text-xs text-[var(--sys-text)] appearance-none cursor-pointer">
                                <option value="fast">⚡ Fast</option>
                                <option value="quality">✨ Quality</option>
                            </select>
                        </div>
                    </div>

                    <button onClick={handleSelectModel} disabled={loading}
                        className="w-full py-3 rounded-2xl font-bold text-[var(--sys-text)] text-sm cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                        {loading ? <span className="material-symbols-outlined animate-spin text-base">progress_activity</span> : <span className="material-symbols-outlined text-base">settings_suggest</span>}
                        {loading ? `Building ${selectedModel} prompt...` : '🔧 Confirm & Build Prompt'}
                    </button>
                </div>
            )}

            {/* ── STAGE 6: Generate ────────────────────────────────────────── */}
            {currentStage === 'generate' && (
                <div className="space-y-3">
                    {!genResult ? (
                        <>
                            {modelSel && (
                                <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-primary)]/20 bg-[var(--sys-primary)]/[0.03]">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-lg">✅</span>
                                        <h3 className="text-sm font-bold text-[var(--sys-text)]">Ready to Generate</h3>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[10px] mb-3">
                                        <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">🤖 {modelSel.model}</span>
                                        <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">📺 {modelSel.resolution}</span>
                                        <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">⏱ {plan?.duration}s</span>
                                        <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary)]/10 text-[var(--sys-primary)] border border-[var(--sys-primary)]/20">📐 {plan?.ratio}</span>
                                    </div>
                                    {modelSel.finalPrompt && (
                                        <div className="mt-2 p-2 rounded-lg bg-black/20 border border-[var(--sys-border)]/[0.06]">
                                            <p className="text-[9px] text-[var(--sys-text-muted)] font-bold mb-1">GENERATED PROMPT</p>
                                            <p className="text-[10px] text-[var(--sys-text-muted)] leading-relaxed line-clamp-4">{modelSel.finalPrompt}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button onClick={handleGenerate} disabled={loading || generating}
                                className="w-full py-4 rounded-2xl font-bold text-[var(--sys-text)] text-base cursor-pointer transition-all hover:scale-[1.01] disabled:opacity-40 flex items-center justify-center gap-2"
                                style={{ background: 'linear-gradient(135deg, #14b8a6, #06b6d4, #8b5cf6)' }}>
                                <span className="material-symbols-outlined text-xl">movie</span>
                                🎬 Generate Video — {plan?.duration}s {plan?.ratio}
                            </button>
                        </>
                    ) : generating ? (
                        <div className="space-y-3">
                            {genResult.isLongForm ? (
                                <div className="glass-panel rounded-2xl p-6 text-center border border-[var(--sys-border)]/[0.08]">
                                    <span className="material-symbols-outlined text-4xl text-[var(--sys-primary)] animate-spin block mb-3">progress_activity</span>
                                    <h3 className="text-sm font-bold text-[var(--sys-text)] mb-1">Long-Form Generation in Progress</h3>
                                    <p className="text-xs text-[var(--sys-text-muted)]">Generating {Math.ceil((plan?.duration || 30) / 10)} video segments... This may take 5-15 minutes.</p>
                                </div>
                            ) : (
                                <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)]/[0.08]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-[var(--sys-primary)] animate-spin">progress_activity</span>
                                        <span className="text-xs font-bold text-[var(--sys-text)]">Generating scenes...</span>
                                    </div>
                                    <div className="space-y-2">
                                        {Object.entries(sceneStatuses).map(([id, st], idx) => (
                                            <div key={id} className="flex items-center gap-2">
                                                <span className="text-[10px] text-[var(--sys-text-muted)] w-14 shrink-0">Scene {idx+1}</span>
                                                <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-700" style={{
                                                        width: `${st.progress || 0}%`,
                                                        background: st.status === 'done' ? '#10b981' : st.status === 'failed' ? '#ef4444' : 'linear-gradient(90deg, #14b8a6, #8b5cf6)',
                                                    }} />
                                                </div>
                                                <span className="text-[10px] w-8 text-right" style={{ color: st.status === 'done' ? '#10b981' : st.status === 'failed' ? '#ef4444' : '#94a3b8' }}>
                                                    {st.status === 'done' ? '✅' : st.status === 'failed' ? '❌' : `${st.progress || 0}%`}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Videos ready */
                        <div className="space-y-3">
                            {compiledVideo ? (
                                <div className="rounded-2xl overflow-hidden border border-[var(--sys-primary)]/20 bg-black relative has-vha">
                                    <video src={compiledVideo} controls className="w-full block" />
                                    <VideoHoverActions videoUrl={compiledVideo} />
                                    <div className="flex items-center justify-between p-3">
                                        <span className="text-xs font-bold text-[var(--sys-primary)]">🎬 Final Video — {plan?.duration}s</span>
                                        <button onClick={() => handleDownload(compiledVideo, 'final-video')}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-[var(--sys-primary)] border border-[var(--sys-primary)]/30 hover:bg-[var(--sys-primary)]/[0.08] cursor-pointer transition-all">
                                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>download</span> Download
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                Object.entries(sceneStatuses).filter(([, st]) => st.status === 'done').map(([id, st], idx) => (
                                    <div key={id} className="rounded-2xl overflow-hidden border border-[var(--sys-border)]/[0.1] bg-black relative has-vha">
                                        <video src={st.videoUrl} controls className="w-full block" />
                                        <VideoHoverActions videoUrl={st.videoUrl} />
                                        <div className="flex items-center justify-between p-2 relative z-10">
                                            <span className="text-[10px] text-[var(--sys-text-muted)]">Scene {idx+1}</span>
                                            <button onClick={() => handleDownload(st.videoUrl, `scene-${idx+1}`)}
                                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-[var(--sys-primary)] border border-[var(--sys-primary)]/30 cursor-pointer hover:bg-[var(--sys-primary)]/[0.08] transition-all">
                                                <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>download</span> Download
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                            <button onClick={resetAll}
                                className="w-full py-3 rounded-2xl font-bold text-[var(--sys-text-muted)] text-sm cursor-pointer border border-[var(--sys-border)]/[0.1] hover:border-[var(--sys-border)] hover:text-[var(--sys-text)] transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-base">add_circle</span> Create Another Video
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Loading overlay for thinking states */}
            {loading && (
                <div className="flex justify-center mt-2">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)]/[0.08]">
                        <div className="flex gap-1">
                            {[0, 150, 300].map(d => (
                                <div key={d} className="w-1.5 h-1.5 rounded-full bg-[var(--sys-primary)] animate-bounce" style={{ animationDelay: `${d}ms` }} />
                            ))}
                        </div>
                        <span className="text-xs text-[var(--sys-text-muted)]">AI working...</span>
                    </div>
                </div>
            )}
            <div ref={chatEndRef} />
        </div>
    )
}

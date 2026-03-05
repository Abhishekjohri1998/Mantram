import { useState, useEffect, useRef, useCallback } from 'react'
import { creatives as creativesAPI } from '../../services/api'

const API_BASE = `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error(`Server returned ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

// ── Default model capabilities (fetched from API on mount) ──
const DEFAULT_CAPS = {
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', duration: { min: 3, max: 15, native: 15 }, resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'], features: { firstFrame: true, lastFrame: true, referenceImages: false, extendVideo: false, nativeAudio: true }, recommended: true, description: 'Best motion & physics — multi-shot, native audio', bestFor: 'Product demos, action shots', costPerSecond: { fast: 0.07, quality: 0.12 } },
    'veo-3.1': { id: 'veo-3.1', name: 'Google Veo 3.1', icon: '🎬', duration: { min: 4, max: 8, native: 8, extendChunk: 7 }, resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16'], features: { firstFrame: true, lastFrame: true, referenceImages: true, extendVideo: true, nativeAudio: true }, recommended: false, description: 'Cinematic quality + extend-video', bestFor: 'Premium brand films', costPerSecond: { fast: 0.15, quality: 0.40 } },
    'veo-3.1-fast': { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', duration: { min: 4, max: 8, native: 8 }, resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16'], features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, nativeAudio: true }, recommended: false, description: 'Faster & cheaper Veo 3.1', bestFor: 'Quick iterations', costPerSecond: { fast: 0.08, quality: 0.15 } },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', icon: '🌱', duration: { min: 5, max: 10, native: 10 }, resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1', '4:3'], features: { firstFrame: true, lastFrame: true, referenceImages: false, extendVideo: true, nativeAudio: false }, recommended: false, description: 'Fast & affordable', bestFor: 'Quick prototypes', costPerSecond: { fast: 0.05, quality: 0.08 } },
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', duration: { min: 4, max: 15, native: 15 }, resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '21:9'], features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, nativeAudio: true, cameraControl: true }, recommended: false, description: 'Cinematic + camera control', bestFor: 'Premium ads', costPerSecond: { fast: 0.08, quality: 0.15 } },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', duration: { min: 1, max: 15, native: 15 }, resolutions: ['480p', '720p'], aspectRatios: ['16:9', '9:16', '1:1'], features: { firstFrame: true, lastFrame: false, referenceImages: false, extendVideo: false, nativeAudio: false }, recommended: false, description: 'xAI native — fast & affordable', bestFor: 'Social reels', costPerSecond: { fast: 0.08, quality: 0.08 } },
}

export default function AdvancedMode({ activeBrand }) {
    // ── State ──
    const [caps, setCaps] = useState(DEFAULT_CAPS)
    const [model, setModel] = useState('kling-3.0')
    const [prompt, setPrompt] = useState('')
    const [duration, setDuration] = useState(5)
    const [resolution, setResolution] = useState('1080p')
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [qualityMode, setQualityMode] = useState('fast')
    const [generateAudio, setGenerateAudio] = useState(true)
    const [firstImageUrl, setFirstImageUrl] = useState('')
    const [lastImageUrl, setLastImageUrl] = useState('')
    const [enhancing, setEnhancing] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [projectId, setProjectId] = useState(null)
    const [generation, setGeneration] = useState(null)
    const [durationPlan, setDurationPlan] = useState(null)
    const [costPreview, setCostPreview] = useState(null)
    const [phase, setPhase] = useState('compose') // compose | generating | review
    const [imgMode, setImgMode] = useState(null) // null | 'first' | 'last' — which image panel is active
    const [imgTab, setImgTab] = useState('upload') // 'upload' | 'generate' | 'library'
    const [aiImgPrompt, setAiImgPrompt] = useState('')
    const [aiImgLoading, setAiImgLoading] = useState(false)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const fileRef = useRef(null)
    const lastFileRef = useRef(null)
    const pollRef = useRef(null)

    const cap = caps[model] || caps['kling-3.0']

    // Fetch capabilities once
    useEffect(() => {
        api('/video-studio/models/capabilities').then(d => {
            if (d.capabilities) setCaps(d.capabilities)
        }).catch(() => { })
    }, [])

    // Clamp values when model changes
    useEffect(() => {
        const c = caps[model]
        if (!c) return
        if (duration < c.duration.min) setDuration(c.duration.min)
        if (duration > c.duration.max && !c.features?.extendVideo) setDuration(c.duration.max)
        if (!c.resolutions.includes(resolution)) setResolution(c.resolutions[c.resolutions.length - 1])
        if (!c.aspectRatios.includes(aspectRatio)) setAspectRatio(c.aspectRatios[0])
        if (!c.features?.lastFrame) setLastImageUrl('')
    }, [model])

    // Live cost
    useEffect(() => {
        const costRate = cap.costPerSecond?.[qualityMode] || 0.07
        const resMult = resolution === '720p' ? 0.7 : 1
        const usd = +(costRate * duration * resMult).toFixed(2)
        setCostPreview({ usd, inr: Math.round(usd * 85), credits: Math.ceil(usd * 30) })
    }, [model, duration, resolution, qualityMode])

    // ── Enhance prompt with AI ──
    async function handleEnhance() {
        if (!prompt.trim()) return
        setEnhancing(true)
        try {
            const d = await api('/video-studio/enhance-prompt', {
                method: 'POST',
                body: JSON.stringify({ prompt, model, duration, aspectRatio, brandId: activeBrand?._id }),
            })
            setPrompt(d.enhancedPrompt || prompt)
        } catch (e) { setError(e.message) }
        setEnhancing(false)
    }

    // ── Generate video ──
    async function handleGenerate() {
        if (!prompt.trim()) { setError('Write a prompt first'); return }
        setLoading(true); setError('')
        try {
            const d = await api('/video-studio/advanced/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt, model, duration, resolution, aspectRatio,
                    firstImageUrl, lastImageUrl, generateAudio, qualityMode,
                    brandId: activeBrand?._id || null,
                }),
            })
            setProjectId(d.project._id)
            setGeneration(d.project.generation)
            setDurationPlan(d.project.durationPlan)
            setPhase('generating')
            startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    // ── Poll status ──
    const startPolling = useCallback((pid) => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const d = await api(`/video-studio/${pid}/status`)
                setGeneration(d.project.generation)
                if (d.project.generation?.status === 'COMPLETED' || d.project.status === 'critique') {
                    clearInterval(pollRef.current)
                    setPhase('review')
                } else if (d.project.generation?.status === 'FAILED') {
                    clearInterval(pollRef.current)
                    setError('Video generation failed. Edit your prompt and try again.')
                    setPhase('review')
                }
            } catch { }
        }, 5000)
    }, [])

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ── Image upload ──
    function handleImageUpload(setter, ref) {
        return (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const r = new FileReader()
            r.onload = () => setter(r.result)
            r.readAsDataURL(f)
        }
    }

    // ── Load library images ──
    async function loadLibrary() {
        if (libraryImages.length > 0) return
        setLibraryLoading(true)
        try {
            const data = await creativesAPI.imageBank({ limit: 30, brandId: activeBrand?._id || '' })
            setLibraryImages(data.images || data.creatives || [])
        } catch (e) {
            console.error('Library load error:', e)
            setLibraryImages([])
        }
        setLibraryLoading(false)
    }

    // ── AI generate image ──
    async function handleAiGenerateImage(setter) {
        if (!aiImgPrompt.trim()) return
        if (!activeBrand?._id) { setError('Select a brand first to generate images'); return }
        setAiImgLoading(true)
        try {
            const d = await api('/creatives/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: aiImgPrompt,
                    brandId: activeBrand._id,
                    type: 'instagram-post',
                }),
            })
            const url = d.creative?.imageUrl || d.imageUrl || d.image?.url || d.url || ''
            if (url) { setter(url); setImgMode(null); setAiImgPrompt('') }
            else setError('AI image generation returned no image')
        } catch (e) { setError(e.message) }
        setAiImgLoading(false)
    }

    // ── Open image panel ──
    function openImagePanel(which) {
        setImgMode(imgMode === which ? null : which)
        setImgTab('upload')
        if (imgMode !== which) loadLibrary()
    }

    const exceedsNative = duration > cap.duration.native

    // ════════════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════════════

    // ── GENERATING PHASE ──
    if (phase === 'generating') {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <div className="relative mb-8">
                    <div className="w-32 h-32 rounded-full border-4 border-violet-500/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-5xl text-violet-400 animate-pulse">movie</span>
                    </div>
                    <div className="absolute inset-0 w-32 h-32 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">Creating Your Video</h2>
                <p className="text-sm text-slate-400 mb-6">
                    {generation?.status === 'IN_QUEUE' ? '⏳ In queue — waiting for GPU...' :
                        generation?.status === 'IN_PROGRESS' ? '🎥 Rendering frames...' : '🎬 Processing...'}
                </p>
                <div className="w-full max-w-md h-3 rounded-full bg-white/[0.06] overflow-hidden mb-4">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-1000"
                        style={{ width: `${generation?.progress || 5}%` }} />
                </div>
                <p className="text-sm text-slate-500">{generation?.progress || 5}% — usually 1-3 minutes</p>
                {durationPlan && durationPlan.totalSegments > 1 && (
                    <div className="mt-4 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm text-violet-300 max-w-md text-center">
                        📐 {durationPlan.note}
                    </div>
                )}
            </div>
        )
    }

    // ── REVIEW PHASE ──
    if (phase === 'review') {
        return (
            <div className="space-y-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400">rate_review</span>
                    Your Video is Ready
                </h2>
                {generation?.videoUrl ? (
                    <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.08]">
                        <video controls className="w-full aspect-video bg-black" src={generation.videoUrl} />
                    </div>
                ) : (
                    <div className="glass-panel rounded-2xl p-12 text-center border border-white/[0.08]">
                        <span className="material-symbols-outlined text-4xl text-slate-600 mb-3 block">videocam_off</span>
                        <p className="text-sm text-slate-500">Generation may have failed. Edit your prompt and try again.</p>
                    </div>
                )}
                <div className="flex gap-3">
                    <button onClick={() => { setPhase('compose'); setGeneration(null); setProjectId(null) }}
                        className="flex-1 py-3 rounded-xl bg-violet-500/20 text-violet-300 font-medium border border-violet-500/30 hover:bg-violet-500/30 transition-all cursor-pointer flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">edit</span> Edit & Regenerate
                    </button>
                    {generation?.videoUrl && (
                        <a href={generation.videoUrl} download target="_blank" rel="noopener noreferrer"
                            className="px-6 py-3 rounded-xl bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/30 hover:bg-emerald-500/30 transition-all flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">download</span> Download
                        </a>
                    )}
                </div>
            </div>
        )
    }

    // ── COMPOSE PHASE (main form) ──
    return (
        <div className="space-y-6">
            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-lg">error</span>{error}
                    <button onClick={() => setError('')} className="ml-auto text-rose-300 hover:text-white cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* ── Prompt ── */}
            <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-cyan-400">edit_note</span> Your Prompt
                    </h3>
                    <button onClick={handleEnhance} disabled={enhancing || !prompt.trim()}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 text-xs font-medium border border-cyan-500/25 hover:bg-cyan-500/25 transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5">
                        {enhancing ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">auto_awesome</span>}
                        {enhancing ? 'Enhancing...' : '✨ Enhance with AI'}
                    </button>
                </div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
                    placeholder="Describe your video in detail... e.g. 'A golden retriever running through a sunlit meadow, slow motion, cinematic depth of field, lens flare, warm golden tones'"
                    className="w-full h-32 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder-slate-600 outline-none focus:border-cyan-500/30 resize-none" />
            </div>

            {/* ── Model Selector ── */}
            <div>
                <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-violet-400">smart_toy</span> Select Model
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.values(caps).map(m => (
                        <button key={m.id} onClick={() => setModel(m.id)}
                            className={`text-left p-4 rounded-xl transition-all cursor-pointer relative ${model === m.id
                                ? 'bg-violet-500/10 border-2 border-violet-500/40 shadow-lg shadow-violet-500/10'
                                : 'bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15]'}`}>
                            {m.recommended && <span className="absolute -top-2 right-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">⭐ Best</span>}
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xl">{m.icon}</span>
                                <span className="text-sm font-bold text-white">{m.name}</span>
                            </div>
                            <p className="text-xs text-slate-500 mb-2">{m.description}</p>
                            <div className="flex flex-wrap gap-1">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400">{m.duration.min}-{m.duration.native}s</span>
                                {m.features?.nativeAudio && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">🔊</span>}
                                {m.features?.extendVideo && <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">↗️ extend</span>}
                                {m.features?.cameraControl && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">🎥</span>}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Controls Grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Duration */}
                <div className="glass-panel rounded-xl p-4 border border-white/[0.08]">
                    <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-amber-400 text-base">timer</span> Duration: {duration}s
                        {exceedsNative && <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full ml-auto">⚡ Will chain segments</span>}
                    </label>
                    <input type="range" min={cap.duration.min} max={cap.features?.extendVideo ? Math.min(60, (cap.duration.maxExtended || 60)) : cap.duration.native}
                        value={duration} onChange={e => setDuration(Number(e.target.value))}
                        className="w-full accent-violet-500" />
                    <div className="flex justify-between text-xs text-slate-600 mt-1">
                        <span>{cap.duration.min}s</span>
                        <span className="text-violet-400">native: {cap.duration.native}s</span>
                        <span>{cap.features?.extendVideo ? `${Math.min(60, (cap.duration.maxExtended || 60))}s` : `${cap.duration.native}s`}</span>
                    </div>
                </div>

                {/* Resolution */}
                <div className="glass-panel rounded-xl p-4 border border-white/[0.08]">
                    <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-emerald-400 text-base">high_quality</span> Resolution
                    </label>
                    <div className="flex gap-2">
                        {cap.resolutions.map(r => (
                            <button key={r} onClick={() => setResolution(r)}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${resolution === r
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:text-white'}`}>{r}</button>
                        ))}
                    </div>
                </div>

                {/* Aspect Ratio */}
                <div className="glass-panel rounded-xl p-4 border border-white/[0.08]">
                    <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-cyan-400 text-base">aspect_ratio</span> Aspect Ratio
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {cap.aspectRatios.map(r => (
                            <button key={r} onClick={() => setAspectRatio(r)}
                                className={`px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all ${aspectRatio === r
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:text-white'}`}>{r}</button>
                        ))}
                    </div>
                </div>

                {/* Quality Mode */}
                <div className="glass-panel rounded-xl p-4 border border-white/[0.08]">
                    <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-violet-400 text-base">tune</span> Quality
                    </label>
                    <div className="flex gap-2">
                        {['fast', 'quality'].map(m => (
                            <button key={m} onClick={() => setQualityMode(m)}
                                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-all capitalize ${qualityMode === m
                                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                    : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:text-white'}`}>{m === 'fast' ? '⚡ Fast' : '✨ Quality'}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Image Inputs (model-aware) ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* First Frame */}
                {cap.features?.firstFrame && (
                    <div className="glass-panel rounded-xl p-4 border border-white/[0.08]">
                        <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-amber-400 text-base">first_page</span> First Frame
                            <span className="text-xs text-slate-600 font-normal ml-auto">optional</span>
                        </label>
                        {firstImageUrl ? (
                            <div className="relative group">
                                <img src={firstImageUrl} alt="First frame" className="w-full h-32 rounded-lg object-cover border border-white/[0.08]" />
                                <button onClick={() => setFirstImageUrl('')}
                                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">×</button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => fileRef.current?.click()}
                                    className="flex-1 p-3 rounded-lg border-2 border-dashed border-white/[0.08] hover:border-violet-500/30 flex flex-col items-center gap-1 cursor-pointer text-slate-500 hover:text-violet-300 transition-all">
                                    <span className="material-symbols-outlined text-lg">cloud_upload</span>
                                    <span className="text-xs">Upload</span>
                                </button>
                                <button onClick={() => openImagePanel('first')}
                                    className={`flex-1 p-3 rounded-lg border-2 border-dashed flex flex-col items-center gap-1 cursor-pointer transition-all ${imgMode === 'first' && imgTab === 'generate' ? 'border-cyan-500/40 bg-cyan-500/5 text-cyan-300' : 'border-white/[0.08] hover:border-cyan-500/30 text-slate-500 hover:text-cyan-300'}`}>
                                    <span className="material-symbols-outlined text-lg">auto_awesome</span>
                                    <span className="text-xs">AI Generate</span>
                                </button>
                                <button onClick={() => { openImagePanel('first'); setImgTab('library') }}
                                    className={`flex-1 p-3 rounded-lg border-2 border-dashed flex flex-col items-center gap-1 cursor-pointer transition-all ${imgMode === 'first' && imgTab === 'library' ? 'border-amber-500/40 bg-amber-500/5 text-amber-300' : 'border-white/[0.08] hover:border-amber-500/30 text-slate-500 hover:text-amber-300'}`}>
                                    <span className="material-symbols-outlined text-lg">photo_library</span>
                                    <span className="text-xs">Library</span>
                                </button>
                            </div>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload(setFirstImageUrl, fileRef)} className="hidden" />

                        {/* AI Generate / Library Panel for First Frame */}
                        {imgMode === 'first' && !firstImageUrl && (
                            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="flex gap-2 mb-3">
                                    <button onClick={() => setImgTab('generate')} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${imgTab === 'generate' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>✨ Generate</button>
                                    <button onClick={() => setImgTab('library')} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${imgTab === 'library' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-white'}`}>📚 Library</button>
                                </div>
                                {imgTab === 'generate' && (
                                    <div className="flex gap-2">
                                        <input value={aiImgPrompt} onChange={e => setAiImgPrompt(e.target.value)} placeholder="Describe the image..." className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-slate-600 outline-none" />
                                        <button onClick={() => handleAiGenerateImage(setFirstImageUrl)} disabled={aiImgLoading} className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium cursor-pointer disabled:opacity-50">{aiImgLoading ? '...' : 'Create'}</button>
                                    </div>
                                )}
                                {imgTab === 'library' && (
                                    libraryLoading ? <p className="text-xs text-slate-500 text-center py-4">Loading library...</p> :
                                        libraryImages.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">No images in library</p> :
                                            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                                {libraryImages.map((img, i) => (
                                                    <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => { setFirstImageUrl(img.url || img.imageUrl); setImgMode(null) }}
                                                        className="w-full h-16 rounded-lg object-cover cursor-pointer border border-white/[0.08] hover:border-violet-500/40 transition-all" />
                                                ))}
                                            </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Last Frame */}
                {cap.features?.lastFrame && (
                    <div className="glass-panel rounded-xl p-4 border border-white/[0.08]">
                        <label className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-rose-400 text-base">last_page</span> Last Frame
                            <span className="text-xs text-slate-600 font-normal ml-auto">optional</span>
                        </label>
                        {lastImageUrl ? (
                            <div className="relative group">
                                <img src={lastImageUrl} alt="Last frame" className="w-full h-32 rounded-lg object-cover border border-white/[0.08]" />
                                <button onClick={() => setLastImageUrl('')}
                                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">×</button>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => lastFileRef.current?.click()}
                                    className="flex-1 p-3 rounded-lg border-2 border-dashed border-white/[0.08] hover:border-rose-500/30 flex flex-col items-center gap-1 cursor-pointer text-slate-500 hover:text-rose-300 transition-all">
                                    <span className="material-symbols-outlined text-lg">cloud_upload</span>
                                    <span className="text-xs">Upload</span>
                                </button>
                                <button onClick={() => openImagePanel('last')}
                                    className={`flex-1 p-3 rounded-lg border-2 border-dashed flex flex-col items-center gap-1 cursor-pointer transition-all ${imgMode === 'last' && imgTab === 'generate' ? 'border-cyan-500/40 bg-cyan-500/5 text-cyan-300' : 'border-white/[0.08] hover:border-cyan-500/30 text-slate-500 hover:text-cyan-300'}`}>
                                    <span className="material-symbols-outlined text-lg">auto_awesome</span>
                                    <span className="text-xs">AI Generate</span>
                                </button>
                                <button onClick={() => { openImagePanel('last'); setImgTab('library') }}
                                    className={`flex-1 p-3 rounded-lg border-2 border-dashed flex flex-col items-center gap-1 cursor-pointer transition-all ${imgMode === 'last' && imgTab === 'library' ? 'border-amber-500/40 bg-amber-500/5 text-amber-300' : 'border-white/[0.08] hover:border-amber-500/30 text-slate-500 hover:text-amber-300'}`}>
                                    <span className="material-symbols-outlined text-lg">photo_library</span>
                                    <span className="text-xs">Library</span>
                                </button>
                            </div>
                        )}
                        <input ref={lastFileRef} type="file" accept="image/*" onChange={handleImageUpload(setLastImageUrl, lastFileRef)} className="hidden" />

                        {/* AI Generate / Library Panel for Last Frame */}
                        {imgMode === 'last' && !lastImageUrl && (
                            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <div className="flex gap-2 mb-3">
                                    <button onClick={() => setImgTab('generate')} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${imgTab === 'generate' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white'}`}>✨ Generate</button>
                                    <button onClick={() => setImgTab('library')} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${imgTab === 'library' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-white'}`}>📚 Library</button>
                                </div>
                                {imgTab === 'generate' && (
                                    <div className="flex gap-2">
                                        <input value={aiImgPrompt} onChange={e => setAiImgPrompt(e.target.value)} placeholder="Describe the image..." className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-xs placeholder-slate-600 outline-none" />
                                        <button onClick={() => handleAiGenerateImage(setLastImageUrl)} disabled={aiImgLoading} className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-medium cursor-pointer disabled:opacity-50">{aiImgLoading ? '...' : 'Create'}</button>
                                    </div>
                                )}
                                {imgTab === 'library' && (
                                    libraryLoading ? <p className="text-xs text-slate-500 text-center py-4">Loading library...</p> :
                                        libraryImages.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">No images in library</p> :
                                            <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                                {libraryImages.map((img, i) => (
                                                    <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => { setLastImageUrl(img.url || img.imageUrl); setImgMode(null) }}
                                                        className="w-full h-16 rounded-lg object-cover cursor-pointer border border-white/[0.08] hover:border-violet-500/40 transition-all" />
                                                ))}
                                            </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Audio toggle ── */}
            {cap.features?.nativeAudio && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <button onClick={() => setGenerateAudio(!generateAudio)}
                        className={`w-10 h-5 rounded-full transition-all cursor-pointer relative ${generateAudio ? 'bg-cyan-500' : 'bg-white/[0.1]'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${generateAudio ? 'left-5' : 'left-0.5'}`} />
                    </button>
                    <span className="text-sm text-slate-300">🔊 Generate native audio</span>
                </div>
            )}

            {/* ── Cost Preview ── */}
            {costPreview && (
                <div className="glass-panel rounded-xl p-4 border border-emerald-500/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-6">
                            <div className="text-center">
                                <p className="text-lg font-bold text-violet-400">{cap.name}</p>
                                <p className="text-xs text-slate-500">Model</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-cyan-400">{duration}s</p>
                                <p className="text-xs text-slate-500">Duration</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-amber-400">{costPreview.credits}</p>
                                <p className="text-xs text-slate-500">Credits</p>
                            </div>
                            <div className="text-center">
                                <p className="text-lg font-bold text-emerald-400">₹{costPreview.inr}</p>
                                <p className="text-xs text-slate-500">Est. Cost</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Generate Button ── */}
            <button onClick={handleGenerate} disabled={loading || !prompt.trim()}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-base hover:shadow-xl hover:shadow-violet-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-3">
                {loading ? (
                    <><span className="material-symbols-outlined animate-spin">progress_activity</span>Submitting to {cap.name}...</>
                ) : (
                    <><span className="material-symbols-outlined">movie</span>Generate Video — {costPreview?.credits || 15} Credits</>
                )}
            </button>
        </div>
    )
}

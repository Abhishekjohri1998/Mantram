import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import DashboardLayout from '../components/DashboardLayout'
import { creatives as creativesAPI } from '../services/api'

const API_BASE = `${window.location.origin}/api`

// ── API helper (uses correct auth token) ──
async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
        throw new Error(`Server returned ${res.status} — ensure backend is running`)
    }
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

// ── Step labels ──
const STEPS = [
    { id: 'input', label: 'Brief & Images', icon: 'edit_note' },
    { id: 'concepts', label: 'Concepts', icon: 'lightbulb' },
    { id: 'script', label: 'Script & Prompt', icon: 'movie' },
    { id: 'cost', label: 'Model & Cost', icon: 'payments' },
    { id: 'generate', label: 'Generating', icon: 'slow_motion_video' },
    { id: 'review', label: 'Review & Edit', icon: 'rate_review' },
]

// ── Video type options ──
const VIDEO_TYPES = [
    { id: 'ad-film', label: 'Ad Film', icon: '🎬', desc: 'Cinematic brand advertisement' },
    { id: 'ugc', label: 'UGC Video', icon: '📱', desc: 'Raw, authentic user-style content' },
    { id: 'product-demo', label: 'Product Demo', icon: '📦', desc: 'Showcase product features' },
    { id: 'social-reel', label: 'Social Reel', icon: '🔥', desc: 'Short-form social content' },
    { id: 'explainer', label: 'Explainer', icon: '💡', desc: 'Explain a concept or service' },
]

export default function VideoStudio() {
    const { user } = useAuth()
    const { activeBrand, brands } = useBrand()

    // ── State ──
    const [step, setStep] = useState(0) // 0=input, 1=concepts, 2=script, 3=cost, 4=generate, 5=review
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Project state
    const [projectId, setProjectId] = useState(null)
    const [brief, setBrief] = useState('')
    const [videoType, setVideoType] = useState('ad-film')
    const [images, setImages] = useState([]) // { url, source, label }
    const [concepts, setConcepts] = useState([])
    const [selectedConcept, setSelectedConcept] = useState(null)
    const [script, setScript] = useState(null)
    const [backendPrompt, setBackendPrompt] = useState('')
    const [routing, setRouting] = useState(null)
    const [references, setReferences] = useState(null)
    const [generation, setGeneration] = useState(null)
    const [critique, setCritique] = useState(null)
    const [pipeline, setPipeline] = useState(null)

    // History
    const [projects, setProjects] = useState([])
    const [showHistory, setShowHistory] = useState(false)

    // Image input UI state
    const [showUrlInput, setShowUrlInput] = useState(false)
    const [urlInputValue, setUrlInputValue] = useState('')
    const [showAiPrompt, setShowAiPrompt] = useState(false)
    const [aiPromptValue, setAiPromptValue] = useState('')
    const [showLibrary, setShowLibrary] = useState(false)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)

    // File input ref
    const fileInputRef = useRef(null)
    const pollRef = useRef(null)

    // Load history on mount
    useEffect(() => {
        api('/video-studio?limit=10').then(d => setProjects(d.projects || [])).catch(() => { })
    }, [])

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 1: Start — Submit brief + images → get concepts
    // ══════════════════════════════════════════════════════════════════════════
    async function handleStart() {
        if (!brief.trim() && images.length === 0) { setError('Enter a brief or add at least one image'); return }
        setLoading(true); setError('')
        try {
            const data = await api('/video-studio/start', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id || null,
                    brief: brief.trim(),
                    images,
                    videoType,
                }),
            })
            setProjectId(data.project._id)
            setConcepts(data.project.concepts || [])
            setPipeline(data.project.pipeline)
            setStep(1)
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 2: Select concept → get script
    // ══════════════════════════════════════════════════════════════════════════
    async function handleSelectConcept(index) {
        setSelectedConcept(index)
        setLoading(true); setError('')
        try {
            const data = await api(`/video-studio/${projectId}/select`, {
                method: 'POST',
                body: JSON.stringify({ conceptIndex: index }),
            })
            setScript(data.project.script)
            setBackendPrompt(data.project.backendPrompt || '')
            setPipeline(data.project.pipeline)
            setStep(2)
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 3: Approve script → get routing + cost
    // ══════════════════════════════════════════════════════════════════════════
    async function handleApproveScript() {
        setLoading(true); setError('')
        try {
            const data = await api(`/video-studio/${projectId}/approve`, {
                method: 'POST',
                body: JSON.stringify({ editedPrompt: backendPrompt }),
            })
            setRouting(data.project.routing)
            setReferences(data.project.references)
            setPipeline(data.project.pipeline)
            setStep(3)
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 4: Confirm cost → generate video
    // ══════════════════════════════════════════════════════════════════════════
    async function handleGenerate() {
        setLoading(true); setError('')
        try {
            const data = await api(`/video-studio/${projectId}/generate`, {
                method: 'POST',
                body: JSON.stringify({
                    resolution: routing?.resolution,
                    model: routing?.selectedModel,
                    mode: routing?.mode,
                }),
            })
            setGeneration(data.project.generation)
            setPipeline(data.project.pipeline)
            setStep(4)
            startPolling()
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ── Poll generation status ──
    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const data = await api(`/video-studio/${projectId}/status`)
                setGeneration(data.project.generation)
                setPipeline(data.project.pipeline)
                if (data.project.status === 'critique' || data.project.generation?.status === 'COMPLETED') {
                    clearInterval(pollRef.current)
                    setCritique(data.project.critique)
                    setStep(5)
                } else if (data.project.generation?.status === 'FAILED') {
                    clearInterval(pollRef.current)
                    setError('Video generation failed. Try editing the prompt and regenerating.')
                    setStep(5)
                }
            } catch { /* keep polling */ }
        }, 5000) // Poll every 5 seconds
    }, [projectId])

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 6: Edit prompt → re-generate
    // ══════════════════════════════════════════════════════════════════════════
    async function handleEditAndRegenerate() {
        setLoading(true); setError('')
        try {
            const data = await api(`/video-studio/${projectId}/edit`, {
                method: 'POST',
                body: JSON.stringify({ editedPrompt: backendPrompt }),
            })
            setGeneration(data.project.generation)
            setStep(4)
            startPolling()
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ── Finalize ──
    async function handleFinalize() {
        setLoading(true)
        try {
            await api(`/video-studio/${projectId}/finalize`, { method: 'POST' })
            setStep(0)
            setProjectId(null)
            setBrief(''); setImages([]); setConcepts([]); setScript(null); setBackendPrompt('')
            setRouting(null); setGeneration(null); setCritique(null)
            api('/video-studio?limit=10').then(d => setProjects(d.projects || [])).catch(() => { })
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ── Image upload handler ──
    function handleImageUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
            setImages(prev => [...prev, { url: reader.result, source: 'upload', label: file.name }])
        }
        reader.readAsDataURL(file)
    }

    // ── Load existing project ──
    async function loadProject(id) {
        setLoading(true)
        try {
            const data = await api(`/video-studio/${id}`)
            const p = data.project
            setProjectId(p._id)
            setBrief(p.input?.brief || '')
            setVideoType(p.input?.videoType || 'ad-film')
            setImages(p.input?.images || [])
            setConcepts(p.concepts || [])
            setSelectedConcept(p.selectedConceptIndex)
            setScript(p.script)
            setBackendPrompt(p.backendPrompt || '')
            setRouting(p.routing)
            setReferences(p.references)
            setGeneration(p.generation)
            setCritique(p.critique)
            setPipeline(p.pipeline)
            // Determine step from status
            const statusMap = { brainstorm: 1, script: 2, routing: 3, generating: 4, critique: 5, editing: 5, done: 5, references: 3 }
            setStep(statusMap[p.status] || 0)
            setShowHistory(false)
            if (p.status === 'generating') startPolling()
        } catch (err) { setError(err.message) }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <DashboardLayout>
            <div className="max-w-6xl mx-auto">
                {/* ── Header ── */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
                            Video <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-violet-400 to-cyan-400">Studio</span>
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">AI-powered video creation — from brief to final cut</p>
                    </div>
                    <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all text-sm cursor-pointer">
                        <span className="material-symbols-outlined text-lg">history</span>
                        History
                    </button>
                </div>

                {/* ── History Panel ── */}
                {showHistory && (
                    <div className="glass-panel rounded-2xl p-5 mb-6 border border-white/[0.08]">
                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                            <span className="material-symbols-outlined text-violet-400">folder_open</span>
                            Recent Projects
                        </h3>
                        {projects.length === 0 ? (
                            <p className="text-sm text-slate-500">No projects yet. Create your first video!</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {projects.map(p => (
                                    <button key={p._id} onClick={() => loadProject(p._id)}
                                        className="text-left p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-violet-500/30 transition-all cursor-pointer">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.status === 'done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                                {p.status}
                                            </span>
                                            <span className="text-xs text-slate-600">{p.input?.videoType}</span>
                                        </div>
                                        <p className="text-sm font-medium text-white truncate">{p.title}</p>
                                        <p className="text-sm text-slate-500 mt-1">{new Date(p.createdAt).toLocaleDateString()}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Progress Steps ── */}
                <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
                    {STEPS.map((s, i) => (
                        <div key={s.id} className="flex items-center flex-shrink-0">
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${i === step ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' :
                                i < step ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-600'
                                }`}>
                                <span className="material-symbols-outlined text-sm">{i < step ? 'check_circle' : s.icon}</span>
                                <span className="hidden sm:inline">{s.label}</span>
                            </div>
                            {i < STEPS.length - 1 && <div className={`w-4 sm:w-8 h-px mx-1 ${i < step ? 'bg-emerald-500/30' : 'bg-white/[0.06]'}`} />}
                        </div>
                    ))}
                </div>

                {/* ── Error ── */}
                {error && (
                    <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">error</span>
                        {error}
                        <button onClick={() => setError('')} className="ml-auto text-rose-300 hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 0: INPUT — Brief + Images                            */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 0 && (
                    <div className="space-y-6">
                        {/* Video Type Selector */}
                        <div>
                            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-violet-400">category</span>
                                What kind of video?
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                {VIDEO_TYPES.map(vt => (
                                    <button key={vt.id} onClick={() => setVideoType(vt.id)}
                                        className={`p-4 rounded-xl text-center transition-all cursor-pointer ${videoType === vt.id
                                            ? 'bg-violet-500/15 border-2 border-violet-500/40 shadow-lg shadow-violet-500/10'
                                            : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12]'
                                            }`}>
                                        <span className="text-2xl block mb-2">{vt.icon}</span>
                                        <p className="text-sm font-bold text-white">{vt.label}</p>
                                        <p className="text-sm text-slate-500 mt-1">{vt.desc}</p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Brief Input */}
                        <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-cyan-400">edit_note</span>
                                Your Brief
                            </h3>
                            <textarea
                                value={brief}
                                onChange={e => setBrief(e.target.value)}
                                placeholder="Describe what you want... e.g. 'A 15-second Instagram reel showcasing our new summer collection with upbeat music and golden hour lighting'"
                                className="w-full h-32 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder-slate-600 outline-none focus:border-violet-500/30 resize-none"
                            />
                        </div>

                        {/* Image Input — 3 Options */}
                        <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-amber-400">image</span>
                                Reference Images <span className="text-slate-600 font-normal">(optional)</span>
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                {/* Option 1: Upload */}
                                <button onClick={() => fileInputRef.current?.click()}
                                    className="p-4 rounded-xl border-2 border-dashed border-white/[0.08] hover:border-violet-500/30 flex flex-col items-center gap-2 cursor-pointer transition-all bg-white/[0.01]">
                                    <span className="material-symbols-outlined text-2xl text-violet-400">cloud_upload</span>
                                    <span className="text-sm font-medium text-slate-300">Upload Image</span>
                                    <span className="text-xs text-slate-600">From your device</span>
                                </button>
                                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

                                {/* Option 2: AI Generate */}
                                <button onClick={() => setShowAiPrompt(!showAiPrompt)}
                                    className={`p-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 cursor-pointer transition-all bg-white/[0.01] ${showAiPrompt ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-white/[0.08] hover:border-cyan-500/30'}`}>
                                    <span className="material-symbols-outlined text-2xl text-cyan-400">auto_awesome</span>
                                    <span className="text-sm font-medium text-slate-300">AI Generate</span>
                                    <span className="text-xs text-slate-600">Create with AI</span>
                                </button>

                                {/* Option 3: From Library */}
                                <button onClick={async () => {
                                    setShowLibrary(!showLibrary)
                                    if (!showLibrary && libraryImages.length === 0) {
                                        setLibraryLoading(true)
                                        try {
                                            const data = await creativesAPI.imageBank({ limit: 20 })
                                            setLibraryImages(data.images || data.creatives || [])
                                        } catch (e) { setLibraryImages([]) }
                                        setLibraryLoading(false)
                                    }
                                }}
                                    className={`p-4 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 cursor-pointer transition-all bg-white/[0.01] ${showLibrary ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/[0.08] hover:border-amber-500/30'}`}>
                                    <span className="material-symbols-outlined text-2xl text-amber-400">photo_library</span>
                                    <span className="text-sm font-medium text-slate-300">From Library</span>
                                    <span className="text-xs text-slate-600">Existing creatives</span>
                                </button>
                            </div>

                            {/* ── Inline URL Input ── */}
                            {showUrlInput && (
                                <div className="mb-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                    <p className="text-sm font-medium text-slate-300 mb-2">Paste Image URL</p>
                                    <div className="flex gap-2">
                                        <input
                                            value={urlInputValue}
                                            onChange={e => setUrlInputValue(e.target.value)}
                                            placeholder="https://example.com/image.jpg"
                                            className="flex-1 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-slate-600 outline-none focus:border-violet-500/30"
                                        />
                                        <button onClick={() => {
                                            if (urlInputValue.trim()) {
                                                setImages(prev => [...prev, { url: urlInputValue.trim(), source: 'url', label: 'From URL' }])
                                                setUrlInputValue(''); setShowUrlInput(false)
                                            }
                                        }} className="px-4 py-2.5 rounded-lg bg-violet-500/20 text-violet-300 font-medium text-sm hover:bg-violet-500/30 transition-all cursor-pointer">
                                            Add
                                        </button>
                                        <button onClick={() => { setShowUrlInput(false); setUrlInputValue('') }}
                                            className="px-3 py-2.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Inline AI Generate Prompt ── */}
                            {showAiPrompt && (
                                <div className="mb-4 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/15">
                                    <p className="text-sm font-medium text-cyan-300 mb-2">Describe the reference image to generate</p>
                                    <textarea
                                        value={aiPromptValue}
                                        onChange={e => setAiPromptValue(e.target.value)}
                                        placeholder="e.g. A luxury perfume bottle on a marble surface with golden hour lighting..."
                                        className="w-full h-20 px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-slate-600 outline-none focus:border-cyan-500/30 resize-none text-sm"
                                    />
                                    <div className="flex gap-2 mt-2">
                                        <button onClick={() => {
                                            if (aiPromptValue.trim()) {
                                                setImages(prev => [...prev, { url: '', source: 'ai-generate', label: aiPromptValue.trim() }])
                                                setAiPromptValue(''); setShowAiPrompt(false)
                                            }
                                        }} className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-300 font-medium text-sm hover:bg-cyan-500/30 transition-all cursor-pointer flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                            Add AI Reference
                                        </button>
                                        <button onClick={() => { setShowAiPrompt(false); setAiPromptValue('') }}
                                            className="px-3 py-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer text-sm">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Image Library Modal ── */}
                            {showLibrary && (
                                <div className="mb-4 p-4 rounded-xl bg-amber-500/5 border border-amber-500/15">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-sm font-medium text-amber-300">Select from Creative Studio Library</p>
                                        <button onClick={() => setShowLibrary(false)} className="text-slate-500 hover:text-white cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                    {libraryLoading ? (
                                        <div className="flex items-center justify-center py-8 text-slate-500">
                                            <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                            Loading your images...
                                        </div>
                                    ) : libraryImages.length === 0 ? (
                                        <div className="text-center py-8">
                                            <span className="material-symbols-outlined text-3xl text-slate-600 mb-2 block">image_not_supported</span>
                                            <p className="text-sm text-slate-500">No images in your library yet.</p>
                                            <p className="text-sm text-slate-600 mt-1">Generate images in Creative Studio first, or upload/paste a URL above.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-60 overflow-y-auto">
                                            {libraryImages.map((img, i) => (
                                                <button key={i} onClick={() => {
                                                    const imgUrl = img.imageUrl || img.url || img.outputUrl
                                                    if (imgUrl) {
                                                        setImages(prev => [...prev, { url: imgUrl, source: 'library', label: img.prompt?.substring(0, 30) || 'From Library' }])
                                                    }
                                                }}
                                                    className="relative aspect-square rounded-lg overflow-hidden border border-white/[0.08] hover:border-amber-400/50 transition-all cursor-pointer group">
                                                    <img
                                                        src={img.imageUrl || img.url || img.outputUrl}
                                                        alt={img.prompt || 'Library image'}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-white text-lg">add_circle</span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {/* Also offer URL paste inline */}
                                    <div className="mt-3 pt-3 border-t border-white/[0.06]">
                                        <p className="text-sm text-slate-500 mb-2">Or paste an image URL:</p>
                                        <div className="flex gap-2">
                                            <input
                                                value={urlInputValue}
                                                onChange={e => setUrlInputValue(e.target.value)}
                                                placeholder="https://example.com/image.jpg"
                                                className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white placeholder-slate-600 outline-none focus:border-amber-500/30 text-sm"
                                            />
                                            <button onClick={() => {
                                                if (urlInputValue.trim()) {
                                                    setImages(prev => [...prev, { url: urlInputValue.trim(), source: 'url', label: 'From URL' }])
                                                    setUrlInputValue('')
                                                }
                                            }} className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 font-medium text-sm hover:bg-amber-500/30 transition-all cursor-pointer">
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Uploaded images preview */}
                            {images.length > 0 && (
                                <div className="flex gap-3 flex-wrap">
                                    {images.map((img, i) => (
                                        <div key={i} className="relative group">
                                            {img.url ? (
                                                <img src={img.url} alt={img.label} className="w-20 h-20 rounded-lg object-cover border border-white/[0.08]" />
                                            ) : (
                                                <div className="w-20 h-20 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex flex-col items-center justify-center p-1">
                                                    <span className="material-symbols-outlined text-cyan-400 text-sm">auto_awesome</span>
                                                    <span className="text-xs text-cyan-400 mt-0.5 text-center leading-tight truncate w-full">{img.source}</span>
                                                </div>
                                            )}
                                            <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                ×
                                            </button>
                                            <p className="text-xs text-slate-600 mt-1 truncate w-20">{img.source}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Start Button */}
                        <button onClick={handleStart} disabled={loading}
                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold text-base hover:shadow-xl hover:shadow-violet-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-3">
                            {loading ? (
                                <><span className="material-symbols-outlined animate-spin">progress_activity</span>AI is thinking...</>
                            ) : (
                                <><span className="material-symbols-outlined">auto_awesome</span>Generate Video Concepts</>
                            )}
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 1: CONCEPTS — Pick one                               */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 1 && (
                    <div>
                        <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-400">lightbulb</span>
                            AI Generated Concepts
                        </h2>
                        <p className="text-sm text-slate-500 mb-6">Pick the concept that excites you most. AI will build a full script from it.</p>

                        {loading ? (
                            <div className="flex items-center justify-center py-20 text-slate-500">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                Writing your script...
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {concepts.map((c, i) => (
                                    <button key={i} onClick={() => handleSelectConcept(i)}
                                        className="text-left p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08] hover:border-violet-500/30 hover:bg-violet-500/5 transition-all cursor-pointer group">
                                        <div className="flex items-start justify-between mb-3">
                                            <h3 className="text-base font-bold text-white group-hover:text-violet-300 transition-colors">{c.title}</h3>
                                            <span className="text-xs px-2 py-1 rounded-full bg-violet-500/10 text-violet-400 flex-shrink-0 ml-2">{c.duration}s</span>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-3 leading-relaxed">{c.description}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">{c.style}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">{c.mood}</span>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{c.targetPlatform}</span>
                                        </div>
                                        <p className="text-sm text-slate-500 mt-3 italic">🪝 Hook: {c.hook}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 2: SCRIPT + BACKEND PROMPT                           */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 2 && script && (
                    <div className="space-y-6">
                        {/* Shot-by-shot Storyboard */}
                        <div>
                            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-violet-400">movie</span>
                                Shot-by-Shot Storyboard
                            </h2>
                            <p className="text-sm text-slate-500 mb-4">{script.narrative}</p>

                            <div className="space-y-3">
                                {(script.shots || []).map((shot, i) => (
                                    <div key={i} className="glass-panel rounded-xl p-4 border border-white/[0.06]">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-xs font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">Shot {shot.shotNum}</span>
                                            <span className="text-sm text-slate-500">{shot.duration}s</span>
                                            <span className="text-xs text-slate-600 ml-auto">{shot.transition}</span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-sm text-cyan-400 font-bold mb-1">📹 Visual</p>
                                                <p className="text-sm text-slate-300 leading-relaxed">{shot.visual}</p>
                                            </div>
                                            <div className="space-y-2">
                                                {shot.dialogue && (
                                                    <div>
                                                        <p className="text-sm text-amber-400 font-bold mb-0.5">🗣️ Dialogue</p>
                                                        <p className="text-sm text-slate-400 italic">"{shot.dialogue}"</p>
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-sm text-emerald-400 font-bold mb-0.5">🎥 Camera</p>
                                                    <p className="text-sm text-slate-400">{shot.camera}</p>
                                                </div>
                                                {shot.audio && (
                                                    <div>
                                                        <p className="text-sm text-rose-400 font-bold mb-0.5">🎵 Audio</p>
                                                        <p className="text-sm text-slate-400">{shot.audio}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Backend Prompt — fully editable */}
                        <div className="glass-panel rounded-2xl p-5 border border-violet-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-violet-400">code</span>
                                    Exact Backend Prompt
                                </h3>
                                <span className="text-sm text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">✏️ Editable</span>
                            </div>
                            <p className="text-sm text-slate-500 mb-2">This is the exact prompt sent to the AI video model. Edit it to fine-tune the output.</p>
                            <textarea
                                value={backendPrompt}
                                onChange={e => setBackendPrompt(e.target.value)}
                                className="w-full h-40 px-4 py-3 rounded-xl bg-black/30 border border-violet-500/20 text-violet-200 text-xs font-mono outline-none focus:border-violet-400/40 resize-y leading-relaxed"
                            />
                        </div>

                        {/* Approve */}
                        <button onClick={handleApproveScript} disabled={loading}
                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-bold hover:shadow-xl hover:shadow-violet-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-3">
                            {loading ? (
                                <><span className="material-symbols-outlined animate-spin">progress_activity</span>Finding the best model...</>
                            ) : (
                                <><span className="material-symbols-outlined">check_circle</span>Approve Script & Find Best Model</>
                            )}
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 3: MODEL SELECTOR + COST PREVIEW                     */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 3 && routing && (
                    <div className="space-y-6">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-400">payments</span>
                            Choose Video Model & Review Cost
                        </h2>
                        <p className="text-sm text-slate-400 -mt-3">
                            AI recommended <strong className="text-violet-300">{
                                routing.selectedModel === 'veo-3.1' ? 'Google Veo 3.1' :
                                    routing.selectedModel === 'veo-3.1-fast' ? 'Google Veo 3.1 Fast' :
                                        routing.selectedModel === 'kling-3.0' ? 'Kling 3.0' :
                                            routing.selectedModel === 'seedance-2.0' ? 'Seedance 2.0 Pro' :
                                                routing.selectedModel === 'seedance-1.0' ? 'Seedance 1.0' :
                                                    routing.selectedModel
                            }</strong> — {routing.reasoning || 'but you can pick any model below.'}
                        </p>

                        {/* Model Selector Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                                { id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', desc: 'Multi-shot storyboards, native audio + voice IDs, 3-15s', bestFor: 'Product demos, action shots, storyboard videos', features: ['multi-shot', 'native-audio', 'voice-ids', '3-15s'], available: true, recommended: true },
                                { id: 'veo-3.1', name: 'Google Veo 3.1', icon: '🎬', desc: 'Cinematic quality with native audio + extend-video', bestFor: 'Premium brand films, cinematic ads', features: ['native-audio', 'cinematic', 'extend-video', '5-8s'], available: true, recommended: false },
                                { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', desc: 'Faster & cheaper Veo 3.1 — great for prototyping', bestFor: 'Quick iterations, content series, social video', features: ['native-audio', 'fast', '5-8s', 'cost-efficient'], available: true, recommended: false },
                                { id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', desc: 'Cinematic video with native audio, camera control & physics', bestFor: 'Premium ads, product showcases, brand films', features: ['native-audio', 'camera-control', 'cinematic', '4-15s'], available: true, recommended: false },
                                { id: 'seedance-1.0', name: 'Seedance 1.0 Lite', icon: '🌱', desc: 'Fast & affordable video generation', bestFor: 'Quick prototypes, social content, UGC', features: ['fast', 'affordable', '5-10s'], available: true, recommended: false },
                            ].map(m => (
                                <button key={m.id}
                                    onClick={() => {
                                        if (!m.available) return
                                        setRouting(prev => ({ ...prev, selectedModel: m.id }))
                                    }}
                                    disabled={!m.available}
                                    className={`text-left p-5 rounded-2xl transition-all cursor-pointer relative ${routing.selectedModel === m.id
                                        ? 'bg-violet-500/10 border-2 border-violet-500/40 shadow-lg shadow-violet-500/10'
                                        : m.available
                                            ? 'bg-white/[0.02] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.03]'
                                            : 'bg-white/[0.01] border border-white/[0.05] opacity-50 cursor-not-allowed'
                                        }`}>
                                    {m.recommended && (
                                        <span className="absolute -top-2 right-3 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                                            ⭐ Recommended
                                        </span>
                                    )}
                                    {!m.available && (
                                        <span className="absolute -top-2 right-3 text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 font-bold border border-slate-500/30">
                                            🔒 Coming Soon
                                        </span>
                                    )}
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">{m.icon}</span>
                                        <h3 className="text-base font-bold text-white">{m.name}</h3>
                                    </div>
                                    <p className="text-sm text-slate-400 mb-2">{m.desc}</p>
                                    <p className="text-sm text-slate-500">Best for: {m.bestFor}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                        {m.features.map(f => (
                                            <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400">{f}</span>
                                        ))}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Cost & Config Card */}
                        <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                                    <p className="text-lg font-bold text-violet-400">{routing.resolution}</p>
                                    <p className="text-sm text-slate-500">Resolution</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                                    <p className="text-lg font-bold text-cyan-400">{script?.totalDuration || 5}s</p>
                                    <p className="text-sm text-slate-500">Duration</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                                    <p className="text-lg font-bold text-amber-400">{routing.costPreview?.credits || 15}</p>
                                    <p className="text-sm text-slate-500">Credits</p>
                                </div>
                                <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                                    <p className="text-lg font-bold text-emerald-400">₹{routing.costPreview?.inr || 150}</p>
                                    <p className="text-sm text-slate-500">Est. Cost</p>
                                </div>
                            </div>

                            {/* Resolution Selector */}
                            <div className="flex items-center gap-3 mb-3">
                                <span className="text-sm text-slate-500">Resolution:</span>
                                {['720p', '1080p', '4k'].map(r => (
                                    <button key={r} onClick={() => setRouting(prev => ({ ...prev, resolution: r }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${routing.resolution === r
                                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                            : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:text-white'
                                            }`}>{r}</button>
                                ))}
                            </div>

                            {/* Mode Selector */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-500">Mode:</span>
                                {['fast', 'quality'].map(m => (
                                    <button key={m} onClick={() => setRouting(prev => ({ ...prev, mode: m }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all capitalize ${routing.mode === m
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:text-white'
                                            }`}>{m}</button>
                                ))}
                            </div>
                        </div>

                        {/* Generate Button */}
                        <button onClick={handleGenerate} disabled={loading}
                            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-base hover:shadow-xl hover:shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-3">
                            {loading ? (
                                <><span className="material-symbols-outlined animate-spin">progress_activity</span>Submitting to {routing.selectedModel}...</>
                            ) : (
                                <><span className="material-symbols-outlined">movie</span>Generate Video with {
                                    routing.selectedModel === 'veo-3.1' ? 'Veo 3.1' :
                                        routing.selectedModel === 'veo-3.1-fast' ? 'Veo 3.1 Fast' :
                                            routing.selectedModel === 'kling-3.0' ? 'Kling 3.0' :
                                                routing.selectedModel === 'seedance-2.0' ? 'Seedance 2.0' :
                                                    routing.selectedModel
                                } — {routing.costPreview?.credits || 15} Credits</>
                            )}
                        </button>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 4: GENERATING — Live Progress                        */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 4 && (
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

                        {/* Progress bar */}
                        <div className="w-full max-w-md h-3 rounded-full bg-white/[0.06] overflow-hidden mb-4">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all duration-1000"
                                style={{ width: `${generation?.progress || 5}%` }}
                            />
                        </div>
                        <p className="text-sm text-slate-500">{generation?.progress || 5}% complete — usually takes 1-3 minutes</p>
                    </div>
                )}

                {/* ════════════════════════════════════════════════════════════ */}
                {/* STEP 5: REVIEW — Video + Critic + Edit                    */}
                {/* ════════════════════════════════════════════════════════════ */}
                {step === 5 && (
                    <div className="space-y-6">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-emerald-400">rate_review</span>
                            Your Video is Ready
                        </h2>

                        {/* Video Player */}
                        {generation?.videoUrl ? (
                            <div className="glass-panel rounded-2xl overflow-hidden border border-white/[0.08]">
                                <video
                                    controls
                                    className="w-full aspect-video bg-black"
                                    src={generation.videoUrl}
                                    poster={generation.thumbnailUrl || ''}
                                >
                                    Your browser does not support video.
                                </video>
                            </div>
                        ) : (
                            <div className="glass-panel rounded-2xl p-12 text-center border border-white/[0.08]">
                                <span className="material-symbols-outlined text-4xl text-slate-600 mb-3 block">videocam_off</span>
                                <p className="text-sm text-slate-500">Video generation may have failed. Try editing the prompt and regenerating.</p>
                            </div>
                        )}

                        {/* Critic Feedback */}
                        {critique && (
                            <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-400">grade</span>
                                        AI Critic Analysis
                                    </h3>
                                    <span className={`text-lg font-bold ${critique.overallScore >= 8 ? 'text-emerald-400' : critique.overallScore >= 6 ? 'text-amber-400' : 'text-rose-400'}`}>
                                        {critique.overallScore}/10
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-emerald-400 font-bold mb-2">✅ Strengths</p>
                                        <ul className="space-y-1">
                                            {(critique.strengths || []).map((s, i) => (
                                                <li key={i} className="text-sm text-slate-300 flex items-start gap-1.5">
                                                    <span className="text-emerald-400 mt-0.5">▸</span>{s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <p className="text-sm text-amber-400 font-bold mb-2">💡 Suggestions</p>
                                        <ul className="space-y-1">
                                            {(critique.suggestions || []).map((s, i) => (
                                                <li key={i} className="text-sm text-slate-300 flex items-start gap-1.5">
                                                    <span className="text-amber-400 mt-0.5">▸</span>{s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                {critique.technicalNotes && (
                                    <p className="text-sm text-slate-500 mt-3 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                        🔧 {critique.technicalNotes}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Edit Prompt + Regenerate */}
                        <div className="glass-panel rounded-2xl p-5 border border-violet-500/20">
                            <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-violet-400">code</span>
                                Edit Prompt & Regenerate
                            </h3>
                            <textarea
                                value={backendPrompt}
                                onChange={e => setBackendPrompt(e.target.value)}
                                className="w-full h-32 px-4 py-3 rounded-xl bg-black/30 border border-violet-500/20 text-violet-200 text-xs font-mono outline-none focus:border-violet-400/40 resize-y"
                            />
                            <button onClick={handleEditAndRegenerate} disabled={loading}
                                className="mt-3 px-6 py-2.5 rounded-xl bg-violet-500/20 text-violet-300 font-medium text-sm border border-violet-500/30 hover:bg-violet-500/30 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                Regenerate (5 credits)
                            </button>
                        </div>

                        {/* Finalize */}
                        <div className="flex gap-3">
                            <button onClick={handleFinalize} disabled={loading}
                                className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold hover:shadow-xl hover:shadow-emerald-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined">check_circle</span>
                                Accept & Save
                            </button>
                            {generation?.videoUrl && (
                                <a href={generation.videoUrl} download target="_blank" rel="noopener noreferrer"
                                    className="px-6 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-300 font-medium hover:text-white hover:bg-white/[0.08] transition-all flex items-center gap-2">
                                    <span className="material-symbols-outlined">download</span>
                                    Download
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}

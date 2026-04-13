import { useState, useEffect, useRef, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import GlobalLoader from '../components/GlobalLoader'
import { creatives as creativesAPI } from '../services/api'
import AdvancedMode from '../components/VideoStudio/AdvancedMode'
import UGCCreator from '../components/VideoStudio/UGCCreator'
import VideoAgent from '../components/VideoStudio/VideoAgent'
import Walkthrough from '../components/Walkthrough'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

// ── API helper (uses correct auth token) ──
async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
        signal: opts.signal,
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
    { id: 'voiceover', label: 'Voice Over', icon: 'record_voice_over' },
    { id: 'cost', label: 'Model & Cost', icon: 'payments' },
    { id: 'generate', label: 'Generating', icon: 'slow_motion_video' },
    { id: 'review', label: 'Review & Edit', icon: 'rate_review' },
]

// ── Video type options ──
const VIDEO_TYPES = [
    { id: 'ad-film', label: 'Ad Film', icon: 'movie', desc: 'Cinematic brand advertisement' },
    { id: 'ugc', label: 'UGC Video', icon: 'smartphone', desc: 'Raw, authentic user-style content' },
    { id: 'product-demo', label: 'Product Demo', icon: 'inventory_2', desc: 'Showcase product features' },
    { id: 'social-reel', label: 'Social Reel', icon: 'local_fire_department', desc: 'Short-form social content' },
    { id: 'explainer', label: 'Explainer', icon: 'lightbulb', desc: 'Explain a concept or service' },
]

export default function VideoStudio() {
    const { user } = useAuth()
    const { activeBrand, brands } = useBrand()

    // ── State ──
    const [step, setStep] = useState(0) // 0=input, 1=concepts, 2=script, 3=voiceover, 4=cost, 5=generate, 6=review
    const [loading, setLoading] = useState(false)
    const [studioMode, setStudioMode] = useState('storyboard') // 'advanced' | 'storyboard' | 'ugc'
    const [error, setError] = useState(null)
    const [autoStart, setAutoStart] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()

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

    // Voice over preview state
    const [voiceoverAudioUrl, setVoiceoverAudioUrl] = useState('')
    const [voiceoverLoading, setVoiceoverLoading] = useState(false)
    const [selectedVoProvider, setSelectedVoProvider] = useState('minimax') // 'minimax' | 'sarvam'
    const [selectedVoVoice, setSelectedVoVoice] = useState(null)
    const [voSpeed, setVoSpeed] = useState(1.0)
    const [sarvamVoiceList, setSarvamVoiceList] = useState([])
    const [voiceoverSkipped, setVoiceoverSkipped] = useState(false)
    const [critique, setCritique] = useState(null)
    const [pipeline, setPipeline] = useState(null)

    // History
    const [projects, setProjects] = useState([])
    const [showHistory, setShowHistory] = useState(false)
    const [playingVideo, setPlayingVideo] = useState(null)
    const [advancedRefillData, setAdvancedRefillData] = useState(null)
    const [historyView, setHistoryView] = useState('list') // 'list' | 'grid'
    const [copiedId, setCopiedId] = useState(null)

    // Image input UI state
    const [showUrlInput, setShowUrlInput] = useState(false)
    const [urlInputValue, setUrlInputValue] = useState('')
    const [showAiPrompt, setShowAiPrompt] = useState(false)
    const [aiPromptValue, setAiPromptValue] = useState('')
    const [showLibrary, setShowLibrary] = useState(false)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [modelCapabilities, setModelCapabilities] = useState(null)

    // File input ref
    const fileInputRef = useRef(null)
    const pollRef = useRef(null)

    // ── Download helper: fetches video as blob for proper file download ──
    async function handleDownloadVideo(url, title) {
        if (!url) return
        try {
            const resp = await fetch(url)
            const blob = await resp.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = `${(title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`
            document.body.appendChild(a)
            a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
        } catch {
            // Fallback: open in new tab if fetch fails (CORS)
            window.open(url, '_blank')
        }
    }

    // ── Relative time helper ──
    function getTimeAgo(dateStr) {
        if (!dateStr) return ''
        const diff = Date.now() - new Date(dateStr).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins}m ago`
        const hrs = Math.floor(mins / 60)
        if (hrs < 24) return `${hrs}h ago`
        const days = Math.floor(hrs / 24)
        if (days < 7) return `${days}d ago`
        return new Date(dateStr).toLocaleDateString()
    }

    // ── Copy prompt to clipboard ──
    function handleCopyPrompt(text, id) {
        if (!text) return
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id)
            setTimeout(() => setCopiedId(null), 2000)
        })
    }

    // ── Get project prompt text ──
    function getProjectPrompt(p) {
        // Try advanced config first (covers all advanced projects regardless of mode/status)
        if (p.advancedConfig?.enhancedPrompt || p.advancedConfig?.prompt) {
            return p.advancedConfig.enhancedPrompt || p.advancedConfig.prompt
        }
        // Storyboard brief
        if (p.input?.brief) return p.input.brief
        // Fallback to title
        return p.title || ''
    }

    // ── Refill handler: load a project's inputs back into the form ──
    function handleRefillProject(project) {
        // Detect advanced projects: check mode field, status, OR presence of advancedConfig
        const isAdvanced = project.mode === 'advanced' || project.status === 'advanced-generating' || !!project.advancedConfig
        if (isAdvanced && project.advancedConfig) {
            const ac = project.advancedConfig
            setStudioMode('advanced')
            setAdvancedRefillData({
                prompt: ac.enhancedPrompt || ac.prompt || '',
                model: project.routing?.selectedModel || 'seedance-2.0',
                duration: ac.duration || 6,
                aspectRatio: ac.aspectRatio || '16:9',
                firstImageUrl: ac.firstImageUrl || '',
                lastImageUrl: ac.lastImageUrl || '',
                referenceImages: ac.referenceImages || [],
                _ts: Date.now(), // force re-trigger
            })
        } else {
            // Storyboard mode refill
            setStudioMode('storyboard')
            setBrief(project.input?.brief || project.title || '')
            setImages(project.input?.images || [])
            setVideoType(project.input?.videoType || 'ad-film')
            setStep(0)
            setProjectId(null)
            setConcepts([])
            setSelectedConcept(null)
            setScript(null)
            setGeneration(null)
        }
        setShowHistory(false)
    }

    // Load history on mount
    useEffect(() => {
        api('/video-studio?limit=50').then(d => setProjects(d.projects || [])).catch(() => { })
        api('/video-studio/models/capabilities').then(d => setModelCapabilities(d.capabilities || null)).catch(() => { })

        // Check for brainstorm context
        if (searchParams.get('fromBrainstorm') === 'true') {
            const bsCtx = window.sessionStorage.getItem('brainstormContext')
            if (bsCtx) {
                try {
                    const parsed = JSON.parse(bsCtx)
                    if (parsed.prompt || parsed.description || parsed.title) {
                        const content = parsed.prompt || parsed.description || parsed.title
                        setBrief(content)
                        setVideoType('ad-film')
                        setAutoStart(true)
                    }
                } catch (e) { console.error('Failed to parse brainstorm context:', e) }
            }
            setSearchParams({}, { replace: true })
        }
    }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-start if triggered from Brainstorm
    useEffect(() => {
        if (autoStart && activeBrand && brief.trim() && !loading && step === 0) {
            setAutoStart(false)
            handleStart()
        }
    }, [autoStart, activeBrand, brief, loading, step]) // eslint-disable-line react-hooks/exhaustive-deps

    const abortControllerRef = useRef(null)
    const activeBrandIdRef = useRef(activeBrand?._id)

    const getSignal = useCallback(() => {
        if (abortControllerRef.current) abortControllerRef.current.abort()
        abortControllerRef.current = new AbortController()
        return abortControllerRef.current.signal
    }, [])

    useEffect(() => {
        return () => abortControllerRef.current?.abort()
    }, [])

    // Reset loop if brand changes mid-process
    useEffect(() => {
        if (activeBrand?._id !== activeBrandIdRef.current) {
            console.log('Brand changed, aborting video processing...')
            abortControllerRef.current?.abort()
            activeBrandIdRef.current = activeBrand?._id
            // Reset to step 0 if we were processing
            if (loading) {
                setLoading(false)
                setStep(0)
            }
        }
    }, [activeBrand?._id, loading])

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 1: Start — Submit brief + images → get concepts
    // ══════════════════════════════════════════════════════════════════════════
    async function handleStart() {
        if (!brief.trim() && images.length === 0) { 
            setError({
                message: 'Enter a brief or add at least one image',
                isProviderError: false
            }); 
            return; 
        }
        setLoading(true); setError('')
        try {
            const signal = getSignal()
            const data = await api('/video-studio/start', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id || null,
                    brief: brief.trim(),
                    images,
                    videoType,
                }),
                signal,
            })
            setProjectId(data.project._id)
            setConcepts(data.project.concepts || [])
            setPipeline(data.project.pipeline)
            setStep(1)
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
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
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 3: Approve script → go to voice over preview
    // ══════════════════════════════════════════════════════════════════════════
    async function handleApproveScript() {
        setLoading(true); setError('')
        try {
            const data = await api(`/video-studio/${projectId}/approve`, {
                method: 'POST',
                body: JSON.stringify({ editedPrompt: backendPrompt }),
            })
            setRouting({ 
                ...data.project.routing, 
                aspectRatio: data.project.routing?.aspectRatio || '16:9',
                generateAudio: data.project.routing?.generateAudio !== false // Default to true unless explicitly false
            })
            setReferences(data.project.references)
            setPipeline(data.project.pipeline)
            // Show first frame if auto-generated
            if (data.project.firstFrameUrl) {
                setImages(prev => [{ url: data.project.firstFrameUrl, source: 'ai-first-frame', label: 'Auto-generated first frame' }, ...prev])
            }
            // Load sarvam voices for the voice over step
            if (sarvamVoiceList.length === 0) {
                api('/video-studio/ugc/sarvam-voices').then(d => setSarvamVoiceList(d.voices || [])).catch(() => {})
            }
            setStep(3) // voice over preview step
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 3b: Generate voice over preview (TTS)
    // ══════════════════════════════════════════════════════════════════════════
    async function handleGenerateVoiceover() {
        setVoiceoverLoading(true); setError('')
        try {
            const body = {
                voiceProvider: selectedVoProvider,
                speed: voSpeed,
            }
            if (selectedVoProvider === 'sarvam' && selectedVoVoice) {
                body.speaker = selectedVoVoice.speaker
                body.langCode = selectedVoVoice.lang_code
            } else if (selectedVoVoice) {
                body.voiceId = selectedVoVoice.voiceId || selectedVoVoice.voice_id || 'moss_en_hd'
            }
            const data = await api(`/video-studio/${projectId}/voiceover-preview`, {
                method: 'POST',
                body: JSON.stringify(body),
            })
            setVoiceoverAudioUrl(data.audioUrl)
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
        setVoiceoverLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 5: Confirm cost → generate video
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
                    aspectRatio: routing?.aspectRatio || '16:9',
                }),
            })
            setGeneration(data.project.generation)
            setPipeline(data.project.pipeline)
            setStep(5)
            startPolling()
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
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
                    setStep(6)
                } else if (data.project.generation?.status === 'FAILED') {
                    clearInterval(pollRef.current)
                    const errMsg = data.project.generation?.error || 'Video generation failed. Try editing the prompt and regenerating.'
                    setError({
                        message: errMsg,
                        isProviderError: data.project.generation?.isProviderError,
                        provider: data.project.generation?.provider
                    });
                    setStep(6)
                }
            } catch { /* keep polling */ }
        }, 5000) // Poll every 5 seconds
    }, [projectId])

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ══════════════════════════════════════════════════════════════════════════
    // STEP 7: Edit prompt → re-generate
    // ══════════════════════════════════════════════════════════════════════════
    async function handleEditAndRegenerate() {
        setLoading(true); setError('')
        try {
            const data = await api(`/video-studio/${projectId}/edit`, {
                method: 'POST',
                body: JSON.stringify({ editedPrompt: backendPrompt }),
            })
            setGeneration(data.project.generation)
            setStep(5)
            startPolling()
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
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
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
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
            // Determine step from status (voiceover=3, routing=4, generating=5, critique/done=6)
            const statusMap = { brainstorm: 1, script: 2, voiceover: 3, routing: 4, references: 4, generating: 5, critique: 6, editing: 6, done: 6 }
            setStep(statusMap[p.status] || 0)
            setShowHistory(false)
            if (p.status === 'generating') startPolling()
        } catch (err) { 
            if (err.name === 'AbortError') return
            setError({ 
                message: err.message, 
                isProviderError: err.isProviderError, 
                provider: err.provider 
            }) 
        }
        setLoading(false)
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════════════════════════════════
    return (
        <DashboardLayout title="Video Studio" subtitle="AI-powered video generation & editing">
            <SEOHead title="Video Studio — Mantram AI" noIndex={true} />
            <Walkthrough studioId="videoStudio" />
            {/* —— Studio Mode Tab Bar (standardized sticky nav) —— */}
                <div data-wt="video-modes" className="studio-tab-bar">
                    <div className="studio-tab-row">
                        {[
                            { id: 'advanced', icon: 'terminal', label: 'Advanced' },
                            { id: 'ugc', icon: 'person_play', label: 'UGC Creator' },
                            { id: 'agent', icon: 'smart_display', label: 'Video Agent' },
                            { id: 'storyboard', icon: 'view_timeline', label: 'Storyboard' },
                        ].map(tab => (
                            <button key={tab.id} onClick={() => setStudioMode(tab.id)}
                                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 cursor-pointer ${studioMode === tab.id ? 'studio-nav-pill text-[var(--sys-text)] font-bold' : 'studio-nav-tab-inactive'}`}>
                                <span className={`material-symbols-outlined ${studioMode === tab.id ? 'text-lg' : 'text-base opacity-70'}`}>{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                        <div className="ml-auto flex-shrink-0">
                            <button onClick={() => {
                                const opening = !showHistory
                                setShowHistory(opening)
                                if (opening) api('/video-studio?limit=20').then(d => setProjects(d.projects || [])).catch(() => {})
                            }} className="flex items-center gap-2 px-3 py-2 rounded-xl studio-nav-tab-inactive text-[13px] cursor-pointer">
                                <span className="material-symbols-outlined text-base opacity-70">history</span>
                                <span>History</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── History Panel (shown in both modes) ── */}
                {showHistory && (
                    <div className="glass-panel rounded-2xl p-5 mb-6 border border-[var(--sys-border)]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#FF4D00]">folder_open</span>
                                Video History
                                <span className="text-xs font-normal text-[var(--sys-text-muted)] ml-1">({projects.length})</span>
                            </h3>
                            <div className="flex items-center gap-2">
                                {/* Grid/List toggle */}
                                <div className="flex rounded-lg border border-[var(--sys-border)] overflow-hidden">
                                    <button onClick={() => setHistoryView('list')}
                                        className={`p-1.5 transition-all cursor-pointer ${historyView === 'list' ? 'bg-[var(--sys-surface)] text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)]'}`}
                                        title="List view">
                                        <span className="material-symbols-outlined text-sm">view_list</span>
                                    </button>
                                    <button onClick={() => setHistoryView('grid')}
                                        className={`p-1.5 transition-all cursor-pointer ${historyView === 'grid' ? 'bg-[var(--sys-surface)] text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)]'}`}
                                        title="Grid view">
                                        <span className="material-symbols-outlined text-sm">grid_view</span>
                                    </button>
                                </div>
                                <button onClick={() => {
                                    api('/video-studio?limit=50').then(d => setProjects(d.projects || [])).catch(() => { })
                                }} className="text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] flex items-center gap-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-[var(--sys-surface)] transition-all">
                                    <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                                </button>
                                <button onClick={() => setShowHistory(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer p-1 rounded-lg hover:bg-[var(--sys-surface)] transition-all">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        </div>

                        {projects.length === 0 ? (
                            <div className="text-center py-12">
                                <span className="material-symbols-outlined text-4xl text-slate-700 mb-3 block">videocam_off</span>
                                <p className="text-sm text-[var(--sys-text-muted)]">No videos yet. Create your first one!</p>
                            </div>
                        ) : historyView === 'list' ? (
                            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                {projects.map(p => {
                                    const rawVideoUrl = p.generation?.videoUrl || '';
                                    // Use proxy URL to serve from local cache (PiAPI CDN URLs expire)
                                    const videoUrl = rawVideoUrl ? `${API_BASE}/video-studio/${p._id}/video` : '';
                                    const isDone = p.status === 'done' || p.status === 'critique' || rawVideoUrl;
                                    const isFailed = p.status === 'failed' || p.generation?.status === 'FAILED';
                                    const isGenerating = p.status === 'generating' || p.status === 'advanced-generating';
                                    const modelName = p.routing?.selectedModel || '';
                                    const timeAgo = getTimeAgo(p.createdAt);
                                    const promptText = getProjectPrompt(p);
                                    const promptPreview = promptText ? (promptText.length > 80 ? promptText.slice(0, 80) + '…' : promptText) : '';

                                    return (
                                        <div key={p._id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all group">
                                            {/* Thumbnail / Play area */}
                                            <div className="relative w-full sm:w-28 h-40 sm:h-16 flex-shrink-0 rounded-lg overflow-hidden bg-[var(--sys-surface)] cursor-pointer"
                                                onClick={() => { if (videoUrl) setPlayingVideo(videoUrl); else loadProject(p._id) }}>
                                                {videoUrl ? (
                                                    <video src={`${videoUrl}#t=1`} className="w-full h-full object-cover" muted playsInline preload="auto"
                                                        onLoadedData={e => { e.target.currentTime = 1 }} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                        <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-xl">
                                                            {isFailed ? 'error' : isGenerating ? 'pending' : 'movie'}
                                                        </span>
                                                    </div>
                                                )}
                                                {videoUrl && (
                                                    <div className="absolute inset-0 bg-[var(--sys-surface)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[var(--sys-text)] text-2xl drop-shadow-lg">play_circle</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-[var(--sys-text)] truncate mb-0.5">{p.title || 'Untitled Video'}</p>
                                                {promptPreview && (
                                                    <p className="text-xs text-[var(--sys-text-muted)] truncate mb-1" title={promptText}>{promptPreview}</p>
                                                )}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isDone ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                        isFailed ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                            isGenerating ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                'bg-[var(--sys-border)]/15 text-[var(--sys-text-muted)]'}`}>
                                                        {isDone ? 'Done' : isFailed ? 'Failed' : isGenerating ? 'Generating' : p.status}
                                                    </span>
                                                    {modelName && (
                                                        <span className="text-[10px] text-[var(--sys-text-muted)]">{modelName}</span>
                                                    )}
                                                    <span className="text-[10px] text-slate-700">{timeAgo}</span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {videoUrl && (
                                                    <>
                                                        <button onClick={(e) => { e.stopPropagation(); setPlayingVideo(videoUrl) }}
                                                            className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[#FF4D00] hover:bg-[#FF4D00]/10 transition-all cursor-pointer"
                                                            title="Play">
                                                            <span className="material-symbols-outlined text-base">play_arrow</span>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadVideo(videoUrl, p.title || 'video') }}
                                                            className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer"
                                                            title="Download">
                                                            <span className="material-symbols-outlined text-base">download</span>
                                                        </button>
                                                    </>
                                                )}
                                                {promptText && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleCopyPrompt(promptText, p._id) }}
                                                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${copiedId === p._id ? 'text-primary bg-[var(--sys-primary-dim)]' : 'text-[var(--sys-text-muted)] hover:text-[#FF4D00] hover:bg-[#FF4D00]/10'}`}
                                                        title={copiedId === p._id ? 'Copied!' : 'Copy prompt'}>
                                                        <span className="material-symbols-outlined text-base">{copiedId === p._id ? 'check' : 'content_copy'}</span>
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); handleRefillProject(p) }}
                                                    className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer"
                                                    title="Refill inputs & regenerate">
                                                    <span className="material-symbols-outlined text-base">replay</span>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); loadProject(p._id); setShowHistory(false) }}
                                                    className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer"
                                                    title="Open project">
                                                    <span className="material-symbols-outlined text-base">open_in_new</span>
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        ) : (
                            /* ── GRID VIEW ── */
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                {projects.map(p => {
                                    const rawVideoUrl = p.generation?.videoUrl || '';
                                    const videoUrl = rawVideoUrl ? `${API_BASE}/video-studio/${p._id}/video` : '';
                                    const isDone = p.status === 'done' || p.status === 'critique' || rawVideoUrl;
                                    const isFailed = p.status === 'failed' || p.generation?.status === 'FAILED';
                                    const isGenerating = p.status === 'generating' || p.status === 'advanced-generating';
                                    const modelName = p.routing?.selectedModel || '';
                                    const timeAgo = getTimeAgo(p.createdAt);
                                    const promptText = getProjectPrompt(p);

                                    return (
                                        <div key={p._id} className="rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all group overflow-hidden">
                                            {/* Video thumbnail */}
                                            <div className="relative aspect-video bg-[var(--sys-surface)] cursor-pointer"
                                                onClick={() => { if (videoUrl) setPlayingVideo(videoUrl); else loadProject(p._id) }}>
                                                {videoUrl ? (
                                                    <video src={`${videoUrl}#t=1`} className="w-full h-full object-cover" muted playsInline crossOrigin="anonymous" preload="auto"
                                                        onLoadedData={e => { e.target.currentTime = 1 }} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                        <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-2xl">
                                                            {isFailed ? 'error' : isGenerating ? 'pending' : 'movie'}
                                                        </span>
                                                    </div>
                                                )}
                                                {videoUrl && (
                                                    <div className="absolute inset-0 bg-[var(--sys-surface)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-[var(--sys-text)] text-3xl drop-shadow-lg">play_circle</span>
                                                    </div>
                                                )}
                                                {/* Status badge */}
                                                <span className={`absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded font-bold ${isDone ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' :
                                                    isFailed ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' :
                                                        isGenerating ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' :
                                                            'bg-[var(--sys-border)]/30 text-[var(--sys-text-muted)]'}`}>
                                                    {isDone ? '✓' : isFailed ? '✕' : isGenerating ? '⏳' : p.status}
                                                </span>
                                            </div>
                                            {/* Info + actions */}
                                            <div className="p-2.5">
                                                <p className="text-xs font-medium text-[var(--sys-text)] truncate mb-1">{p.title || 'Untitled Video'}</p>
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    {modelName && <span className="text-[9px] text-[var(--sys-text-muted)]">{modelName}</span>}
                                                    <span className="text-[9px] text-slate-700">{timeAgo}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {videoUrl && (
                                                        <>
                                                            <button onClick={() => setPlayingVideo(videoUrl)}
                                                                className="p-1 rounded text-[var(--sys-text-muted)] hover:text-[#FF4D00] hover:bg-[#FF4D00]/10 transition-all cursor-pointer" title="Play">
                                                                <span className="material-symbols-outlined text-sm">play_arrow</span>
                                                            </button>
                                                            <button onClick={() => handleDownloadVideo(videoUrl, p.title || 'video')}
                                                                className="p-1 rounded text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer" title="Download">
                                                                <span className="material-symbols-outlined text-sm">download</span>
                                                            </button>
                                                        </>
                                                    )}
                                                    {promptText && (
                                                        <button onClick={() => handleCopyPrompt(promptText, p._id)}
                                                            className={`p-1 rounded transition-all cursor-pointer ${copiedId === p._id ? 'text-primary bg-[var(--sys-primary-dim)]' : 'text-[var(--sys-text-muted)] hover:text-[#FF4D00] hover:bg-[#FF4D00]/10'}`}
                                                            title={copiedId === p._id ? 'Copied!' : 'Copy prompt'}>
                                                            <span className="material-symbols-outlined text-sm">{copiedId === p._id ? 'check' : 'content_copy'}</span>
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleRefillProject(p)}
                                                        className="p-1 rounded text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer" title="Refill">
                                                        <span className="material-symbols-outlined text-sm">replay</span>
                                                    </button>
                                                    <button onClick={() => { loadProject(p._id); setShowHistory(false) }}
                                                        className="p-1 rounded text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer" title="Open">
                                                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Video Player Modal ── */}
                {playingVideo && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--sys-surface)] " onClick={() => setPlayingVideo(null)}>
                        <div className="relative max-w-4xl w-full mx-4" onClick={e => e.stopPropagation()}>
                            <video src={playingVideo} controls autoPlay className="w-full rounded-2xl shadow-none" />
                            <div className="absolute -top-12 right-0 flex items-center gap-2">
                                <button onClick={() => handleDownloadVideo(playingVideo, 'video')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-sm hover:bg-[var(--sys-surface)] transition-all cursor-pointer backdrop-blur">
                                    <span className="material-symbols-outlined text-base">download</span> Download
                                </button>
                                <button onClick={() => setPlayingVideo(null)}
                                    className="p-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer backdrop-blur">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── ADVANCED MODE ── */}
                {studioMode === 'advanced' && (
                    <AdvancedMode activeBrand={activeBrand} initialData={advancedRefillData} projects={projects} />
                )}

                {/* ── UGC CREATOR MODE (HeyGen) ── */}
                {studioMode === 'ugc' && (
                    <UGCCreator activeBrand={activeBrand} />
                )}

                {/* ── VIDEO AGENT MODE ── */}
                {studioMode === 'agent' && (
                    <VideoAgent activeBrand={activeBrand} />
                )}

                {/* ── STORYBOARD MODE ── */}
                {studioMode === 'storyboard' && (<>

                    {/* ── Progress Steps ── */}
                    <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
                        {STEPS.map((s, i) => (
                            <div key={s.id} className="flex items-center flex-shrink-0">
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${i === step ? 'bg-[#FF4D00]/20 text-[#FF7A00] border border-[#FF4D00]/30' :
                                    i < step ? 'bg-[var(--sys-primary-dim)] text-primary' : 'text-[var(--sys-text-muted)]'
                                    }`}>
                                    <span className="material-symbols-outlined text-sm">{i < step ? 'check_circle' : s.icon}</span>
                                    <span className="hidden sm:inline">{s.label}</span>
                                </div>
                                {i < STEPS.length - 1 && <div className={`w-4 sm:w-8 h-px mx-1 ${i < step ? 'bg-[var(--sys-primary-dim)]' : 'bg-[var(--sys-surface)]'}`} />}
                            </div>
                        ))}
                    </div>

                    {/* ── Error ── */}
                    {error && (
                        <div className={`mb-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
                            <span className="material-symbols-outlined text-sm">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            <div className="flex-1">
                                {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                                {error.message}
                            </div>
                            <button onClick={() => setError(null)} className={`ml-auto ${error.isProviderError ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-primary)]'} hover:text-[var(--sys-text)] cursor-pointer`}>
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
                            <div data-wt="video-type" className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <h3 className="text-[11px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00] text-[15px]">category</span>
                                    What kind of video?
                                </h3>
                                <div className="flex flex-wrap gap-2.5">
                                    {VIDEO_TYPES.map(vt => (
                                        <button key={vt.id} onClick={() => setVideoType(vt.id)}
                                            className={`flex-1 min-w-[180px] max-w-[240px] flex items-center gap-3 p-3 rounded-xl transition-all duration-300 cursor-pointer border text-left ${videoType === vt.id
                                                ? 'bg-[#FF4D00]/15 border-[#FF4D00]/40 shadow-md shadow-none'
                                                : 'bg-[var(--sys-surface)] border-[var(--sys-border)] hover:border-[var(--sys-border)] hover:bg-[var(--sys-surface)]'
                                                }`}>
                                            <div className={`shrink-0 flex items-center justify-center size-9 rounded-lg ${videoType === vt.id ? 'bg-[#FF4D00]/20' : 'bg-[var(--sys-surface)]'}`}>
                                                <span className={`material-symbols-outlined text-[19px] ${videoType === vt.id ? 'text-[#FF4D00]' : 'text-[var(--sys-text-muted)]'}`}>
                                                    {vt.icon}
                                                </span>
                                            </div>
                                            <div>
                                                <p className={`text-[13px] font-bold ${videoType === vt.id ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{vt.label}</p>
                                                <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 leading-tight">{vt.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Brief Input */}
                            <div data-wt="video-brief" className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <h3 className="text-base font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">edit_note</span>
                                    Your Brief
                                </h3>
                                <textarea
                                    value={brief}
                                    onChange={e => setBrief(e.target.value)}
                                    placeholder="Describe what you want... e.g. 'A 15-second Instagram reel showcasing our new summer collection with upbeat music and golden hour lighting'"
                                    className="w-full h-32 px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder-slate-600 outline-none focus:border-[#FF4D00]/30 resize-none"
                                />
                            </div>

                            {/* Image Input — 3 Options */}
                            <div data-wt="video-images" className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <h3 className="text-base font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">image</span>
                                    Reference Images <span className="text-[var(--sys-text-muted)] font-normal">(optional)</span>
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                                    {/* Option 1: Upload */}
                                    <button onClick={() => fileInputRef.current?.click()}
                                        className="p-4 rounded-xl border border-dashed border-[var(--sys-border)] hover:border-[#FF4D00]/30 flex flex-col items-center gap-2 cursor-pointer transition-all bg-[var(--sys-surface)]">
                                        <span className="material-symbols-outlined text-2xl text-[#FF4D00]">cloud_upload</span>
                                        <span className="text-sm font-medium text-[var(--sys-text-muted)]">Upload Image</span>
                                        <span className="text-xs text-[var(--sys-text-muted)]">From your device</span>
                                    </button>
                                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />

                                    {/* Option 2: AI Generate */}
                                    <button onClick={() => setShowAiPrompt(!showAiPrompt)}
                                        className={`p-4 rounded-xl border border-dashed flex flex-col items-center gap-2 cursor-pointer transition-all bg-[var(--sys-surface)] ${showAiPrompt ? 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)]' : 'border-[var(--sys-border)] hover:border-[var(--sys-border)]'}`}>
                                        <span className="material-symbols-outlined text-2xl text-primary">auto_awesome</span>
                                        <span className="text-sm font-medium text-[var(--sys-text-muted)]">AI Generate</span>
                                        <span className="text-xs text-[var(--sys-text-muted)]">Create with AI</span>
                                    </button>

                                    {/* Option 3: From Library */}
                                    <button onClick={async () => {
                                        setShowLibrary(!showLibrary)
                                        if (!showLibrary && libraryImages.length === 0) {
                                            setLibraryLoading(true)
                                            try {
                                                const data = await creativesAPI.imageBank({ limit: 20, brandId: activeBrand?._id || '' })
                                                setLibraryImages(data.images || data.creatives || [])
                                            } catch (e) { console.error('Library load error:', e); setLibraryImages([]) }
                                            setLibraryLoading(false)
                                        }
                                    }}
                                        className={`p-4 rounded-xl border border-dashed flex flex-col items-center gap-2 cursor-pointer transition-all bg-[var(--sys-surface)] ${showLibrary ? 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)]' : 'border-[var(--sys-border)] hover:border-[var(--sys-border)]'}`}>
                                        <span className="material-symbols-outlined text-2xl text-primary">photo_library</span>
                                        <span className="text-sm font-medium text-[var(--sys-text-muted)]">From Library</span>
                                        <span className="text-xs text-[var(--sys-text-muted)]">Existing creatives</span>
                                    </button>
                                </div>

                                {/* ── Inline URL Input ── */}
                                {showUrlInput && (
                                    <div className="mb-4 p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                        <p className="text-sm font-medium text-[var(--sys-text-muted)] mb-2">Paste Image URL</p>
                                        <div className="flex gap-2">
                                            <input
                                                value={urlInputValue}
                                                onChange={e => setUrlInputValue(e.target.value)}
                                                placeholder="https://example.com/image.jpg"
                                                className="flex-1 px-3 py-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] placeholder-slate-600 outline-none focus:border-[#FF4D00]/30"
                                            />
                                            <button onClick={() => {
                                                if (urlInputValue.trim()) {
                                                    setImages(prev => [...prev, { url: urlInputValue.trim(), source: 'url', label: 'From URL' }])
                                                    setUrlInputValue(''); setShowUrlInput(false)
                                                }
                                            }} className="px-4 py-2.5 rounded-lg bg-[#FF4D00]/20 text-[#FF7A00] font-medium text-sm hover:bg-[#FF4D00]/30 transition-all cursor-pointer">
                                                Add
                                            </button>
                                            <button onClick={() => { setShowUrlInput(false); setUrlInputValue('') }}
                                                className="px-3 py-2.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Inline AI Generate Prompt ── */}
                                {showAiPrompt && (
                                    <div className="mb-4 p-4 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                        <p className="text-sm font-medium text-[var(--sys-primary)] mb-2">Describe the reference image to generate</p>
                                        <textarea
                                            value={aiPromptValue}
                                            onChange={e => setAiPromptValue(e.target.value)}
                                            placeholder="e.g. A luxury perfume bottle on a marble surface with golden hour lighting..."
                                            className="w-full h-20 px-3 py-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] placeholder-slate-600 outline-none focus:border-[var(--sys-border)] resize-none text-sm"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button onClick={async () => {
                                                if (!aiPromptValue.trim()) return
                                                if (!activeBrand?._id) { 
                                                    setError({
                                                        message: 'Select a brand first to generate images',
                                                        isProviderError: false
                                                    }); 
                                                    return; 
                                                }
                                                setLoading(true)
                                                try {
                                                    const d = await api('/creatives/generate', {
                                                        method: 'POST',
                                                        body: JSON.stringify({
                                                            prompt: aiPromptValue.trim(),
                                                            brandId: activeBrand._id,
                                                            type: 'instagram-post',
                                                        }),
                                                    })
                                                    const url = d.creative?.imageUrl || d.imageUrl || ''
                                                    if (url) {
                                                        setImages(prev => [...prev, { url, source: 'ai-generate', label: aiPromptValue.trim().substring(0, 30) }])
                                                        setAiPromptValue(''); setShowAiPrompt(false)
                                                    } else {
                                                        setError({
                                                            message: 'AI image generation returned no image',
                                                            isProviderError: false
                                                        });
                                                    }
                                                } catch (e) { 
                                                    setError({
                                                        message: e.message,
                                                        isProviderError: e.isProviderError,
                                                        provider: e.provider
                                                    }); 
                                                }
                                                setLoading(false)
                                            }} disabled={loading} className="px-4 py-2 rounded-lg bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] font-medium text-sm hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50">
                                                <span className="material-symbols-outlined text-sm">{loading ? 'progress_activity' : 'auto_awesome'}</span>
                                                {loading ? 'Generating...' : 'Generate Image'}
                                            </button>
                                            <button onClick={() => { setShowAiPrompt(false); setAiPromptValue('') }}
                                                className="px-3 py-2 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer text-sm">
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Image Library Modal ── */}
                                {showLibrary && (
                                    <div className="mb-4 p-4 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                        <div className="flex items-center justify-between mb-3">
                                            <p className="text-sm font-medium text-[var(--sys-primary)]">Select from Creative Studio Library</p>
                                            <button onClick={() => setShowLibrary(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                        {libraryLoading ? (
                                            <div className="flex items-center justify-center py-8 text-[var(--sys-text-muted)]">
                                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                                Loading your images...
                                            </div>
                                        ) : libraryImages.length === 0 ? (
                                            <div className="text-center py-8">
                                                <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)] mb-2 block">image_not_supported</span>
                                                <p className="text-sm text-[var(--sys-text-muted)]">No images in your library yet.</p>
                                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Generate images in Creative Studio first, or upload/paste a URL above.</p>
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
                                                        className="relative aspect-square rounded-lg overflow-hidden border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all cursor-pointer group">
                                                        <img
                                                            src={img.imageUrl || img.url || img.outputUrl}
                                                            alt={img.prompt || 'Library image'}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        <div className="absolute inset-0 bg-[var(--sys-surface)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="material-symbols-outlined text-[var(--sys-text)] text-lg">add_circle</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {/* Also offer URL paste inline */}
                                        <div className="mt-3 pt-3 border-t border-[var(--sys-border)]">
                                            <p className="text-sm text-[var(--sys-text-muted)] mb-2">Or paste an image URL:</p>
                                            <div className="flex gap-2">
                                                <input
                                                    value={urlInputValue}
                                                    onChange={e => setUrlInputValue(e.target.value)}
                                                    placeholder="https://example.com/image.jpg"
                                                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] placeholder-slate-600 outline-none focus:border-[var(--sys-border)] text-sm"
                                                />
                                                <button onClick={() => {
                                                    if (urlInputValue.trim()) {
                                                        setImages(prev => [...prev, { url: urlInputValue.trim(), source: 'url', label: 'From URL' }])
                                                        setUrlInputValue('')
                                                    }
                                                }} className="px-4 py-2 rounded-lg bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] font-medium text-sm hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
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
                                                    <img src={img.url} alt={img.label} className="w-20 h-20 rounded-lg object-cover border border-[var(--sys-border)]" />
                                                ) : (
                                                    <div className="w-20 h-20 rounded-lg bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] flex flex-col items-center justify-center p-1">
                                                        <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                                                        <span className="text-xs text-primary mt-0.5 text-center leading-tight truncate w-full">{img.source}</span>
                                                    </div>
                                                )}
                                                <button onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                                    ×
                                                </button>
                                                <p className="text-xs text-[var(--sys-text-muted)] mt-1 truncate w-20">{img.source}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Start Button */}
                            {loading ? (
                                <GlobalLoader
                                    isActive={true}
                                    title="AI is crafting video concepts..."
                                    icon="auto_awesome"
                                    estimatedDuration={30}
                                    stages={['Analyzing Brief', 'Generating Concepts']}
                                    currentStage="Generating Concepts"
                                />
                            ) : (
                                <button data-wt="video-start" onClick={handleStart}
                                    className="w-full py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold text-base hover:shadow-xl hover:shadow-none transition-all cursor-pointer flex items-center justify-center gap-3">
                                    <span className="material-symbols-outlined">auto_awesome</span>Generate Video Concepts
                                </button>
                            )}
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════════ */}
                    {/* STEP 1: CONCEPTS — Pick one                               */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    {step === 1 && (
                        <div>
                            <h2 className="text-lg font-bold text-[var(--sys-text)] mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">lightbulb</span>
                                AI Generated Concepts
                            </h2>
                            <p className="text-sm text-[var(--sys-text-muted)] mb-6">Pick the concept that excites you most. AI will build a full script from it.</p>

                            {loading ? (
                                <GlobalLoader
                                    isActive={true}
                                    title="Writing your script..."
                                    icon="edit_note"
                                    estimatedDuration={25}
                                    stages={['Concept Analysis', 'Script Writing', 'Shot Planning']}
                                    currentStage="Script Writing"
                                />
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {concepts.map((c, i) => (
                                        <button key={i} onClick={() => handleSelectConcept(i)}
                                            className="text-left p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[#FF4D00]/30 hover:bg-[#FF4D00]/5 transition-all cursor-pointer group">
                                            <div className="flex items-start justify-between mb-3">
                                                <h3 className="text-base font-bold text-[var(--sys-text)] group-hover:text-[#FF7A00] transition-colors">{c.title}</h3>
                                                <span className="text-xs px-2 py-1 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] flex-shrink-0 ml-2">{c.duration}s</span>
                                            </div>
                                            <p className="text-sm text-[var(--sys-text-muted)] mb-3 leading-relaxed">{c.description}</p>
                                            <div className="flex flex-wrap gap-2">
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary">{c.style}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary">{c.mood}</span>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary">{c.targetPlatform}</span>
                                            </div>
                                            <p className="text-sm text-[var(--sys-text-muted)] mt-3 italic">🪝 Hook: {c.hook}</p>
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
                                <h2 className="text-lg font-bold text-[var(--sys-text)] mb-1 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00]">movie</span>
                                    Shot-by-Shot Storyboard
                                </h2>
                                <p className="text-sm text-[var(--sys-text-muted)] mb-4">{script.narrative}</p>

                                <div className="space-y-3">
                                    {(script.shots || []).map((shot, i) => (
                                        <div key={i} className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs font-bold text-[#FF4D00] bg-[#FF4D00]/10 px-2 py-0.5 rounded">Shot {shot.shotNum}</span>
                                                <span className="text-sm text-[var(--sys-text-muted)]">{shot.duration}s</span>
                                                <span className="text-xs text-[var(--sys-text-muted)] ml-auto">{shot.transition}</span>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <p className="text-sm text-primary font-bold mb-1">📹 Visual</p>
                                                    <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{shot.visual}</p>
                                                </div>
                                                <div className="space-y-2">
                                                    {shot.dialogue && (
                                                        <div>
                                                            <p className="text-sm text-primary font-bold mb-0.5">🗣️ Dialogue</p>
                                                            <p className="text-sm text-[var(--sys-text-muted)] italic">"{shot.dialogue}"</p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-sm text-primary font-bold mb-0.5"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">videocam</span> Camera</p>
                                                        <p className="text-sm text-[var(--sys-text-muted)]">{shot.camera}</p>
                                                    </div>
                                                    {shot.audio && (
                                                        <div>
                                                            <p className="text-sm text-primary font-bold mb-0.5">🎵 Audio</p>
                                                            <p className="text-sm text-[var(--sys-text-muted)]">{shot.audio}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Backend Prompt — fully editable */}
                            <div className="glass-panel rounded-2xl p-5 border border-[#FF4D00]/20">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[#FF4D00]">code</span>
                                        Exact Backend Prompt
                                    </h3>
                                    <span className="text-sm text-[#FF4D00] bg-[#FF4D00]/10 px-2 py-0.5 rounded-full"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">edit</span> Editable</span>
                                </div>
                                <p className="text-sm text-[var(--sys-text-muted)] mb-2">This is the exact prompt sent to the AI video model. Edit it to fine-tune the output.</p>
                                <textarea
                                    value={backendPrompt}
                                    onChange={e => setBackendPrompt(e.target.value)}
                                    className="w-full h-40 px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[#FF4D00]/20 text-orange-50 text-xs font-mono outline-none focus:border-[#FF4D00]/40 resize-y leading-relaxed"
                                />
                            </div>

                            {/* Approve */}
                            {loading ? (
                                <GlobalLoader
                                    isActive={true}
                                    title="Finding the best model..."
                                    icon="smart_toy"
                                    estimatedDuration={20}
                                    stages={['Analyzing Script', 'Model Selection', 'Cost Estimation']}
                                    currentStage="Model Selection"
                                />
                            ) : (
                                <button onClick={handleApproveScript}
                                    className="w-full py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold hover:shadow-xl hover:shadow-none transition-all cursor-pointer flex items-center justify-center gap-3">
                                    <span className="material-symbols-outlined">check_circle</span>Approve Script & Find Best Model
                                </button>
                            )}
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════════ */}
                    {/* STEP 3: VOICE OVER PREVIEW / QC                            */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">record_voice_over</span>
                                Voice Over Preview
                            </h2>
                            <p className="text-sm text-[var(--sys-text-muted)] -mt-3">
                                Generate a voice over from your script dialogue to QC before creating the final video.
                            </p>

                            {/* Script dialogue preview */}
                            {script?.shots?.some(s => s.dialogue) && (
                                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                    <h3 className="text-sm font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-base">description</span>
                                        Script Dialogue
                                    </h3>
                                    <div className="space-y-2">
                                        {script.shots.filter(s => s.dialogue).map((shot, i) => (
                                            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                <span className="text-xs font-bold text-[#FF4D00] bg-[#FF4D00]/10 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                                                    Shot {shot.shotNum}
                                                </span>
                                                <p className="text-sm text-[var(--sys-text-muted)] italic">"{shot.dialogue}"</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Voice Provider Tabs */}
                            <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <h3 className="text-sm font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-base">mic</span>
                                    Select Voice
                                </h3>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <button onClick={() => setSelectedVoProvider('minimax')}
                                        className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${selectedVoProvider === 'minimax'
                                            ? 'bg-[#FF4D00]/20 text-[#FF7A00] border border-[#FF4D00]/30'
                                            : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'}`}>
                                        🌍 Global (Minimax)
                                    </button>
                                    <button onClick={() => setSelectedVoProvider('sarvam')}
                                        className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${selectedVoProvider === 'sarvam'
                                            ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] border border-[var(--sys-border)]'
                                            : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'}`}>
                                        🇮🇳 Indian (Sarvam)
                                    </button>
                                </div>

                                {/* Voice Cards */}
                                {selectedVoProvider === 'minimax' ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                        {[
                                            { voice_id: 'moss_en_hd', name: 'Moss', gender: 'Male', desc: 'Warm & professional' },
                                            { voice_id: 'Binbin_en_hd', name: 'Binbin', gender: 'Female', desc: 'Clear & bright' },
                                            { voice_id: 'Kevin_en_hd', name: 'Kevin', gender: 'Male', desc: 'Friendly narrator' },
                                            { voice_id: 'Vivian_en_hd', name: 'Vivian', gender: 'Female', desc: 'Soft & calm' },
                                            { voice_id: 'Luke_en_hd', name: 'Luke', gender: 'Male', desc: 'Energetic & lively' },
                                            { voice_id: 'Sophia_en_hd', name: 'Sophia', gender: 'Female', desc: 'Confident & warm' },
                                        ].map(v => (
                                            <button key={v.voice_id} onClick={() => setSelectedVoVoice(v)}
                                                className={`text-left p-3 rounded-xl transition-all cursor-pointer ${selectedVoVoice?.voice_id === v.voice_id
                                                    ? 'bg-[#FF4D00]/15 border border-[#FF4D00]/40'
                                                    : 'bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)]'}`}>
                                                <p className="text-sm font-bold text-[var(--sys-text)]">{v.name}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">{v.gender} · {v.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
                                        {sarvamVoiceList.map(v => (
                                            <button key={v.voice_id} onClick={() => setSelectedVoVoice(v)}
                                                className={`text-left p-3 rounded-xl transition-all cursor-pointer ${selectedVoVoice?.voice_id === v.voice_id
                                                    ? 'bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]'
                                                    : 'bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)]'}`}>
                                                <p className="text-sm font-bold text-[var(--sys-text)]">{v.name}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">{v.language} · {v.gender}</p>
                                            </button>
                                        ))}
                                        {sarvamVoiceList.length === 0 && (
                                            <p className="text-sm text-[var(--sys-text-muted)] col-span-full text-center py-4">Loading voices...</p>
                                        )}
                                    </div>
                                )}

                                {/* Speed Control */}
                                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--sys-border)]">
                                    <span className="text-sm text-[var(--sys-text-muted)]">Speed:</span>
                                    <input type="range" min="0.5" max="2" step="0.1" value={voSpeed}
                                        onChange={e => setVoSpeed(parseFloat(e.target.value))}
                                        className="flex-1 accent-cyan-500" />
                                    <span className="text-sm font-medium text-primary w-10 text-right">{voSpeed}x</span>
                                </div>
                            </div>

                            {/* Audio Player (if generated) */}
                            {voiceoverAudioUrl && (
                                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-primary">headphones</span>
                                        <h3 className="text-sm font-bold text-[var(--sys-text)]">Voice Over Preview</h3>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]">Ready</span>
                                    </div>
                                    <audio controls src={voiceoverAudioUrl} className="w-full" style={{ filter: 'invert(1) hue-rotate(180deg)', borderRadius: 12 }} />
                                    <p className="text-xs text-[var(--sys-text-muted)] mt-2">Listen to the voice over and approve, or try a different voice.</p>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <button onClick={handleGenerateVoiceover}
                                    disabled={voiceoverLoading || (!selectedVoVoice && selectedVoProvider !== 'minimax')}
                                    className="flex-1 py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold hover:shadow-xl hover:shadow-none transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-3">
                                    {voiceoverLoading ? (
                                        <><span className="material-symbols-outlined animate-spin">progress_activity</span>Generating voice over...</>
                                    ) : voiceoverAudioUrl ? (
                                        <><span className="material-symbols-outlined">refresh</span>Regenerate with Different Voice</>
                                    ) : (
                                        <><span className="material-symbols-outlined">record_voice_over</span>Generate Voice Over</>
                                    )}
                                </button>
                            </div>

                            <div className="flex gap-3">
                                {voiceoverAudioUrl && (
                                    <button onClick={() => { setVoiceoverSkipped(false); setStep(4) }}
                                        className="flex-1 py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold hover:shadow-xl hover:shadow-none transition-all cursor-pointer flex items-center justify-center gap-3">
                                        <span className="material-symbols-outlined">check_circle</span>
                                        Approve & Continue to Model Selection
                                    </button>
                                )}
                                <button onClick={() => { setVoiceoverSkipped(true); setStep(4) }}
                                    className="px-6 py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] font-medium hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined">skip_next</span>
                                    Skip
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════════ */}
                    {/* STEP 4: MODEL SELECTOR + COST PREVIEW                     */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    {step === 4 && routing && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">payments</span>
                                Choose Video Model & Review Cost
                            </h2>
                            <p className="text-sm text-[var(--sys-text-muted)] -mt-3">
                                AI recommended <strong className="text-[#FF7A00]">{
                                    routing.selectedModel === 'veo-3.1' ? 'Google Veo 3.1' :
                                        routing.selectedModel === 'veo-3.1-fast' ? 'Google Veo 3.1 Fast' :
                                            routing.selectedModel === 'kling-3.0' ? 'Kling 3.0' :
                                                routing.selectedModel === 'seedance-2.0' ? 'Seedance 2.0 Pro' :
                                                    routing.selectedModel === 'seedance-1.0' ? 'Seedance 1.0' :
                                                        routing.selectedModel
                                }</strong> — {routing.reasoning || 'but you can pick any model below.'}
                            </p>

                            {/* First Frame Preview */}
                            {images?.some(i => i.source === 'ai-first-frame') && (
                                <div className="glass-panel rounded-2xl p-4 border border-[#FF4D00]/20">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-[#FF4D00]">image</span>
                                        <p className="text-sm font-bold text-[var(--sys-text)]">Auto-Generated First Frame</p>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF4D00]/20 text-[#FF7A00]">AI Generated</span>
                                    </div>
                                    <img src={images.find(i => i.source === 'ai-first-frame')?.url} alt="First frame" className="w-full max-w-md rounded-xl border border-[var(--sys-border)]" />
                                    <p className="text-xs text-[var(--sys-text-muted)] mt-2">This image will be used as the first frame of your video for visual consistency.</p>
                                </div>
                            )}

                            {/* Model Selector Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[
                                    { id: 'kling-3.0', name: 'Kling 3.0', icon: 'videocam', desc: 'Multi-shot storyboards, native audio + voice IDs, 3-15s', bestFor: 'Product demos, action shots, storyboard videos', features: ['multi-shot', 'native-audio', 'voice-ids', '3-15s'], available: true, recommended: true },
                                    { id: 'veo-3.1', name: 'Google Veo 3.1', icon: 'movie', desc: 'Cinematic quality with native audio + extend-video', bestFor: 'Premium brand films, cinematic ads', features: ['native-audio', 'cinematic', 'extend-video', '5-8s'], available: true, recommended: false },
                                    { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: 'bolt', desc: 'Faster & cheaper Veo 3.1 — great for prototyping', bestFor: 'Quick iterations, content series, social video', features: ['native-audio', 'fast', '5-8s', 'cost-efficient'], available: true, recommended: false },
                                    { id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: 'local_movies', desc: 'Cinematic video with native audio, camera control & physics', bestFor: 'Premium ads, product showcases, brand films', features: ['native-audio', 'camera-control', 'cinematic', '4-15s'], available: true, recommended: false },
                                    { id: 'seedance-1.0', name: 'Seedance 1.0 Lite', icon: 'speed', desc: 'Fast & affordable video generation', bestFor: 'Quick prototypes, social content, UGC', features: ['fast', 'affordable', '5-10s'], available: true, recommended: false },
                                ].map(m => (
                                    <button key={m.id}
                                        onClick={() => {
                                            if (!m.available) return
                                            setRouting(prev => ({ ...prev, selectedModel: m.id }))
                                        }}
                                        disabled={!m.available}
                                        className={`text-left p-5 rounded-2xl transition-all cursor-pointer relative ${routing.selectedModel === m.id
                                            ? 'bg-[#FF4D00]/10 border border-[#FF4D00]/40 shadow-none'
                                            : m.available
                                                ? 'bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] hover:bg-[var(--sys-surface)]'
                                                : 'bg-[var(--sys-surface)] border border-[var(--sys-border)] opacity-50 cursor-not-allowed'
                                            }`}>
                                        {m.recommended && (
                                            <span className="absolute -top-2 right-3 text-xs px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary font-bold border border-[var(--sys-border)] flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">star</span> Recommended
                                            </span>
                                        )}
                                        {!m.available && (
                                            <span className="absolute -top-2 right-3 text-xs px-2 py-0.5 rounded-full bg-[var(--sys-border)]/20 text-[var(--sys-text-muted)] font-bold border border-[var(--sys-border)] flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">lock</span> Coming Soon
                                            </span>
                                        )}
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="material-symbols-outlined text-2xl" style={{ color: '#FF4D00' }}>{m.icon}</span>
                                            <h3 className="text-base font-bold text-[var(--sys-text)]">{m.name}</h3>
                                            {modelCapabilities?.[m.id]?.activeProvider && (
                                                <span className="px-1.5 py-0.5 ml-auto rounded text-[10px] uppercase tracking-wider font-bold bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]">
                                                    {modelCapabilities[m.id].activeProvider}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-[var(--sys-text-muted)] mb-2">{m.desc}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Best for: {m.bestFor}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-3">
                                            {m.features.map(f => (
                                                <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">{f}</span>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Cost & Config Card */}
                            <div className="glass-panel rounded-2xl p-6 border border-[var(--sys-border)]">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    <div className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                        <p className="text-lg font-bold text-[#FF4D00]">{routing.resolution}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Resolution</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                        <p className="text-lg font-bold text-primary">{script?.totalDuration || 5}s</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Duration</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                        <p className="text-lg font-bold text-primary">{routing.costPreview?.credits || 15}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Credits</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                        <p className="text-lg font-bold text-primary">₹{routing.costPreview?.inr || 150}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Est. Cost</p>
                                    </div>
                                </div>

                                {/* Resolution Selector */}
                                <div className="flex items-center gap-3 mb-3 flex-wrap">
                                    <span className="text-sm text-[var(--sys-text-muted)]">Resolution:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {(modelCapabilities?.[routing.selectedModel]?.resolutions || ['720p', '1080p', '4k']).map(r => (
                                            <button key={r} onClick={() => setRouting(prev => ({ ...prev, resolution: r }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${routing.resolution === r
                                                    ? 'bg-[#FF4D00]/20 text-[#FF7A00] border border-[#FF4D00]/30'
                                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'
                                                    }`}>{r}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Aspect Ratio Selector */}
                                <div className="flex items-center gap-3 mb-3 flex-wrap">
                                    <span className="text-sm text-[var(--sys-text-muted)]">Ratio:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {(modelCapabilities?.[routing.selectedModel]?.aspectRatios || ['16:9', '9:16', '1:1', '4:3', '3:4']).map(r => (
                                            <button key={r} onClick={() => setRouting(prev => ({ ...prev, aspectRatio: r }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${(routing.aspectRatio || '16:9') === r
                                                    ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] border border-[var(--sys-border)]'
                                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'
                                                    }`}>{r}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Mode Selector */}
                                <div className="flex items-center gap-3 mb-3 flex-wrap">
                                    <span className="text-sm text-[var(--sys-text-muted)]">Mode:</span>
                                    <div className="flex flex-wrap gap-2">
                                        {['fast', 'quality'].map(m => (
                                            <button key={m} onClick={() => setRouting(prev => ({ ...prev, mode: m }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all capitalize ${routing.mode === m
                                                    ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] border border-[var(--sys-border)]'
                                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'
                                                    }`}>{m}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Audio Generation Toggle */}
                                {modelCapabilities?.[routing.selectedModel]?.features?.nativeAudio && (
                                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                                        <span className="text-sm text-[var(--sys-text-muted)]">Audio:</span>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => setRouting(prev => ({ ...prev, generateAudio: true }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                                                    routing.generateAudio !== false
                                                        ? 'bg-[#FF4D00]/20 text-[#FF7A00] border border-[#FF4D00]/30'
                                                        : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'
                                                }`}>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">volume_up</span> With Audio</span>
                                            </button>
                                            <button 
                                                onClick={() => setRouting(prev => ({ ...prev, generateAudio: false }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                                                    routing.generateAudio === false
                                                        ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] border border-[var(--sys-border)]'
                                                        : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'
                                                }`}>
                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">volume_off</span> No Audio</span>
                                            </button>
                                        </div>
                                        <span className="text-xs text-[var(--sys-text-muted)] italic ml-2">Native sound effects and ambiance</span>
                                    </div>
                                )}
                            </div>

                            {/* Generate Button */}
                            <button onClick={handleGenerate} disabled={loading}
                                className="w-full py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold text-base hover:shadow-xl hover:shadow-none transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-3">
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
                    {/* STEP 5: GENERATING — Live Progress                        */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    {step === 5 && (
                        <div className="flex flex-col items-center justify-center py-16">
                            <div className="relative mb-8">
                                <div className="w-32 h-32 rounded-full border-4 border-[#FF4D00]/20 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-5xl text-[#FF4D00] animate-pulse">movie</span>
                                </div>
                                <div className="absolute inset-0 w-32 h-32 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
                            </div>

                            <h2 className="text-xl font-bold text-[var(--sys-text)] mb-2">Creating Your Video</h2>
                            <p className="text-sm text-[var(--sys-text-muted)] mb-6">
                                {generation?.status === 'IN_QUEUE' ? '⏳ In queue — waiting for GPU...' :
                                    generation?.status === 'IN_PROGRESS' ? '🎥 Rendering frames...' : '🎬 Processing...'}
                            </p>

                            {/* Progress bar */}
                            <div className="w-full max-w-md h-3 rounded-full bg-[var(--sys-surface)] overflow-hidden mb-4">
                                <div
                                    className="h-full rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all duration-1000"
                                    style={{ width: `${generation?.progress || 5}%` }}
                                />
                            </div>
                            <p className="text-sm text-[var(--sys-text-muted)]">{generation?.progress || 5}% complete — usually takes 1-3 minutes</p>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════════ */}
                    {/* STEP 6: REVIEW — Video + Critic + Edit                    */}
                    {/* ════════════════════════════════════════════════════════════ */}
                    {step === 6 && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">rate_review</span>
                                Your Video is Ready
                            </h2>

                            {/* Video Player */}
                            {generation?.videoUrl ? (
                                <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                    <video
                                        controls
                                        className="w-full aspect-video bg-black"
                                        src={projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl}
                                        poster={generation.thumbnailUrl || ''}
                                    >
                                        Your browser does not support video.
                                    </video>
                                </div>
                            ) : (
                                <div className="glass-panel rounded-2xl p-12 text-center border border-[var(--sys-border)]">
                                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3 block">videocam_off</span>
                                    <p className="text-sm text-[var(--sys-text-muted)]">Video generation may have failed. Try editing the prompt and regenerating.</p>
                                </div>
                            )}

                            {/* Critic Feedback */}
                            {critique && (
                                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-base font-bold text-[var(--sys-text)] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">grade</span>
                                            AI Critic Analysis
                                        </h3>
                                        <span className={`text-lg font-bold ${critique.overallScore >= 8 ? 'text-primary' : critique.overallScore >= 6 ? 'text-primary' : 'text-primary'}`}>
                                            {critique.overallScore}/10
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-primary font-bold mb-2"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Strengths</p>
                                            <ul className="space-y-1">
                                                {(critique.strengths || []).map((s, i) => (
                                                    <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-1.5">
                                                        <span className="text-primary mt-0.5">▸</span>{s}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div>
                                            <p className="text-sm text-primary font-bold mb-2">💡 Suggestions</p>
                                            <ul className="space-y-1">
                                                {(critique.suggestions || []).map((s, i) => (
                                                    <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-1.5">
                                                        <span className="text-primary mt-0.5">▸</span>{s}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {critique.technicalNotes && (
                                        <p className="text-sm text-[var(--sys-text-muted)] mt-3 p-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            🔧 {critique.technicalNotes}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Edit Prompt + Regenerate */}
                            <div className="glass-panel rounded-2xl p-5 border border-[#FF4D00]/20">
                                <h3 className="text-base font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00]">code</span>
                                    Edit Prompt & Regenerate
                                </h3>
                                <textarea
                                    value={backendPrompt}
                                    onChange={e => setBackendPrompt(e.target.value)}
                                    className="w-full h-32 px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[#FF4D00]/20 text-orange-50 text-xs font-mono outline-none focus:border-[#FF4D00]/40 resize-y"
                                />
                                <button onClick={handleEditAndRegenerate} disabled={loading}
                                    className="mt-3 px-6 py-2.5 rounded-xl bg-[#FF4D00]/20 text-[#FF7A00] font-medium text-sm border border-[#FF4D00]/30 hover:bg-[#FF4D00]/30 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">refresh</span>
                                    Regenerate (5 credits)
                                </button>
                            </div>

                            {/* Finalize */}
                            <div className="flex gap-3">
                                <button onClick={handleFinalize} disabled={loading}
                                    className="flex-1 py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold hover:shadow-xl hover:shadow-none transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined">check_circle</span>
                                    Accept & Save
                                </button>
                                {generation?.videoUrl && (
                                    <button onClick={() => handleDownloadVideo(projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl, 'video')}
                                        className="px-6 py-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] font-medium hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                                        <span className="material-symbols-outlined">download</span>
                                        Download
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </>) /* end storyboard mode */
                }
        </DashboardLayout >
    )
}

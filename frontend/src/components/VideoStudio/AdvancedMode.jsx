import { useState, useEffect, useRef, useCallback } from 'react'
import { creatives as creativesAPI } from '../../services/api'
import { CreditTooltipWrapper } from '../CreditBadge'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

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

const MODELS = {
    'kling-3.0-o': { id: 'kling-3.0-o', name: 'Kling 3.O Omni', msIcon: 'all_inclusive', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: false, lastFrame: false, audio: true, quality: true, multishot: true, refImages: true, refVideo: false, refAudio: false }, cost: 0.12, desc: "Ultimate cinematic omni-model. Supports multi-shot & dynamic ref images." },
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', durs: [5, 10, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], res: ['1080p', '720p'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true, quality: true }, cost: 0.08, desc: "Best for Lip-Sync and precise motion tracking." },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true }, cost: 0.07, desc: "High realistic generation with Fast and Pro options." },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', durs: [5], ratios: ['16:9', '9:16'], res: ['1080p'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true, quality: true }, cost: 0.10, desc: "Incredible Cinematic physics. Fast and Pro options." },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', durs: [5], ratios: ['16:9', '9:16', '1:1', '4:3'], res: ['720p'], has: { firstFrame: true, lastFrame: true }, cost: 0.05, desc: "Cost-effective, reliable motion." },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', durs: [5, 15], ratios: ['16:9', '9:16', '1:1'], res: ['1080p'], has: { firstFrame: true }, cost: 0.08, desc: "Ultra-fast text-to-video capabilities without reference locks." }
}

/* ── Minimal CSS ── */
const css = `
/* Layout */
.vm-studio-root { 
  --sys-surface-glass: color-mix(in srgb, var(--sys-surface) 85%, transparent);
  --sys-surface-raised: color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface));
  --sys-surface-hover: color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface));
  position: relative; width: 100%; min-height: calc(100vh - 80px); display: flex; flex-direction: column; background: transparent; 
}
.vm-layout { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 50; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 16px 24px 16px; pointer-events: none; transition: transform 0.4s ease; }
.vm-layout.layout-scrolled { transform: translateY(120px); }
.vm-layout:hover { transform: translateY(0); }
.vm-layout * { pointer-events: auto; }

/* Background Grid */
.vm-bg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 24px; padding-bottom: 400px; pointer-events: auto; opacity: 0.9; }
@media(max-width: 1024px) { .vm-bg-grid { grid-template-columns: repeat(3, 1fr); padding-bottom: 500px; } }
@media(max-width: 768px) { .vm-bg-grid { grid-template-columns: repeat(2, 1fr); padding-bottom: 500px; } }
.vm-bg-item { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; opacity: 1.0; transition: opacity .4s, transform .5s; position: relative; overflow: hidden; pointer-events: auto; }
.vm-bg-item video { width: 100%; height: 100%; object-fit: cover; }
.vm-bg-item:hover { opacity: 0.8; transform: scale(1.02); z-index: 2; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }

/* Director Panel (Floating Card) */
.vm-card { margin-top: auto; margin-bottom: 0; width: 100%; max-width: 860px; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 24px; padding: 0; backdrop-filter: blur(36px); box-shadow: 0 15px 40px rgba(0,0,0,0.15); z-index: 10; display: flex; flex-direction: column; color: var(--sys-text); font-family: 'Inter', sans-serif; position: relative; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vm-card.collapsed { transform: translateY(30%); opacity: 0.8; }
.vm-card.collapsed:hover { transform: translateY(0); opacity: 1; }
.vm-card.collapsed .vm-upper-controls, .vm-card.collapsed .vm-bottom { display: none; }

/* Panel Header */
.vm-card-header { padding: 12px 24px; border-bottom: 1px solid var(--sys-border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: var(--sys-text); background: transparent; }

/* Upper Controls (Thumbnails & Quality) */
.vm-upper-controls { padding: 16px 24px; display: flex; gap: 16px; border-bottom: 1px solid var(--sys-border); align-items: center; flex-wrap: wrap; background: transparent; }

.vm-thumb-group { display: flex; align-items: center; gap: 8px; }
.vm-thumb-box { width: 48px; height: 48px; border-radius: 12px; border: 1px dashed var(--sys-border); background: var(--sys-surface); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; overflow: hidden; transition: all .2s; }
.vm-thumb-box:hover { border-color: var(--sys-primary); background: var(--sys-surface-raised); }
.vm-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
.vm-thumb-label { font-size: 11px; font-weight: 600; color: var(--sys-text-muted); text-align: center; margin-top: 4px; }

.vm-quality-group { display: flex; align-items: center; gap: 6px; margin-left: auto; background: var(--sys-surface-raised); padding: 4px; border-radius: 12px; border: 1px solid var(--sys-border); }
.vm-quality-pill { padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: var(--sys-text-muted); transition: all .2s; display: flex; align-items: center; gap: 6px; }
.vm-quality-pill:hover { color: var(--sys-text); }
.vm-quality-pill.active { background: var(--sys-surface-glass); color: var(--sys-text); box-shadow: 0 4px 12px rgba(0,0,0,0.2); border: 1px solid var(--sys-border); }

/* Prompt area */
.vm-prompt { padding: 16px 20px; position: relative; flex: 1; min-height: 120px; background: var(--sys-surface-raised); border-radius: 12px; margin: 16px 24px; border: 1px solid var(--sys-border); }
.vm-card.collapsed .vm-prompt { min-height: 50px; margin: 12px 24px; padding: 12px 20px; }
.vm-card.collapsed .vm-textarea { min-height: 24px; max-height: 50px; overflow: hidden; }
.vm-textarea { width: 100%; background: transparent; border: none; outline: none; resize: none; color: var(--sys-text); font-size: 15px; line-height: 1.6; font-family: inherit; min-height: 80px; font-weight: 500; margin: 0; padding: 0; letter-spacing: 0.3px; }
.vm-textarea::placeholder { color: var(--sys-text-muted); font-weight: 500; opacity: 0.8; }

/* Config modules */
.vm-config-trigger { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: transparent; color: var(--sys-text); transition: all .15s; }
.vm-config-trigger:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }
.vm-config-menu { position: absolute; bottom: -8px; left: -8px; min-width: 200px; max-height: 320px; overflow-y: auto; background: var(--sys-surface); border: 1px solid var(--sys-border); border-radius: 16px; padding: 8px; z-index: 100; box-shadow: 0 15px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 2px; }
.vm-config-opt { display: flex; align-items: center; width: 100%; padding: 10px 12px; border: none; background: transparent; color: var(--sys-text-muted); font-size: 13px; cursor: pointer; border-radius: 8px; text-align: left; transition: all .2s; }
.vm-config-opt.sel { color: var(--sys-text); background: var(--sys-surface-raised); }
.vm-config-opt:hover { background: var(--sys-surface-hover); color: var(--sys-text); }

/* Bottom Bar */
.vm-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--sys-border); background: transparent; }
.vm-bottom-left { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; flex: 1; }
.vm-btn-icon-label { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: transparent; border: 1px solid transparent; color: var(--sys-text); cursor: pointer; font-size: 12px; font-weight: 600; border-radius: 10px; transition: 0.2s; }
.vm-btn-icon-label:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }

.vm-generate { padding: 12px 32px; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--sys-surface); background: var(--sys-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: all .2s; }
.vm-generate:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); opacity: 0.9; }
.vm-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }

/* Status overlays */
.vm-err { margin: 12px 24px; padding: 12px 16px; border-radius: 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; font-size: 13px; display: flex; align-items: center; gap: 8px; }

.vm-gen-card { max-width: 600px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); margin: 0 auto; position: relative; }
.vm-gen-preview { position: relative; width: 100%; padding-bottom: 56.25%; background: var(--sys-surface); }
.vm-gen-preview img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.5; }
.vm-gen-info { padding: 20px 24px; color: var(--sys-text); }
.vm-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }
.vm-progress-fill { height: 100%; border-radius: 3px; background: #eab308; transition: width 1s ease; }

.vm-done-card { max-width: 800px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; margin: 0 auto 20px auto; backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); position: relative; }
.vm-done-card video { width: 100%; display: block; }
.vm-done-btns { display: flex; gap: 12px; max-width: 800px; margin: 0 auto; flex-wrap: wrap; z-index: 20; position: relative; }
.vm-btn-sec { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--sys-border); background: var(--sys-surface-glass); color: var(--sys-text); transition: all .15s; }
.vm-btn-sec:hover { background: rgba(255,255,255,0.05); }
.vm-btn-pri { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; background: #eab308; color: #111; transition: all .15s; }
.vm-btn-pri:hover { transform: translateY(-1px); background: #fde047; }

/* Extend */
.vm-extend { padding: 16px; border-radius: 14px; background: rgba(255, 77, 0,0.05); border: 1px solid rgba(255, 77, 0,0.18); margin-top: 16px; max-width: 680px; margin-left: auto; margin-right: auto; z-index: 20; position: relative; }
.vm-extend h4 { font-size: 13px; font-weight: 700; color: #c4b5fd; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.vm-extend-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.vm-extend-input { flex: 1; min-width: 160px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); font-size: 13px; }
.vm-btn-extend { padding: 10px 16px; border-radius: 10px; border: none; background: #eab308; color: #111; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Autocomplete & Library */
.vm-autocomplete { position: absolute; bottom: 100%; left: 24px; right: 24px; background: var(--sys-surface-glass); backdrop-filter: blur(20px); border: 1px solid var(--sys-border); border-radius: 12px; padding: 8px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 20; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-ac-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); border: 1px solid transparent; font-size: 12px; color: var(--sys-text); font-weight: 600; }
.vm-ac-item:hover { border-color: var(--sys-border); background: rgba(255,255,255,0.05); }

.vm-library { margin: 0 24px 16px; background: var(--sys-surface-glass); backdrop-filter: blur(20px); border: 1px solid var(--sys-border); border-radius: 14px; padding: 14px; color: var(--sys-text); position: absolute; bottom: 100%; max-width: calc(100% - 48px); z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-library-head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; }
.vm-library-grid img { width: 100%; height: 56px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid transparent; transition: all .2s; }
.vm-library-grid img:hover { border-color: #eab308; }
.vm-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 8px; background: rgba(255, 77, 0,0.08); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }

@keyframes vm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.vm-spin { animation: vm-spin 1s linear infinite; }
`;
function ConfigDropdown({ value, onChange, options, label }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])
    const sel = options.find(o => o.value === value) || options[0]
    return (
        <div className="vm-config-item" ref={ref}>
            <button type="button" className={`vm-config-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
                {sel?.msIcon && <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{sel.msIcon}</span>}
                <span>{sel?.label}</span>
                <span className="material-symbols-outlined" style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            </button>
            {open && (
                <div className="vm-config-menu">
                    {options.map(o => (
                        <button key={o.value} type="button" className={`vm-config-opt ${o.value === value ? 'sel' : ''}`} onClick={() => { onChange(o.value); setOpen(false) }}>
                            {o.msIcon && <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{o.msIcon}</span>} {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function AdvancedMode({ activeBrand, initialData, projects = [] }) {
    const bgProjects = projects.filter(p => (p.status === 'done' || p.status === 'critique') && p.generation?.videoUrl).slice(0, 16);
    const [model, setModel] = useState('seedance-2.0')
    const [prompt, setPrompt] = useState('')
    const [duration, setDuration] = useState(6)
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('fast')
    const [resolution, setResolution] = useState('1080p')
    const [phase, setPhase] = useState('compose')
    const [videoMode, setVideoMode] = useState('t2v')
    const [shots, setShots] = useState([{ prompt: '' }])
    const [viewVideo, setViewVideo] = useState(null)
    const hlRef = useRef(null)
    const [i2vImage, setI2vImage] = useState(null)
    const [extending, setExtending] = useState(false)
    const [showExtendPanel, setShowExtendPanel] = useState(false)
    const [extendPrompt, setExtendPrompt] = useState('')
    const [extendDuration, setExtendDuration] = useState(5)
    const [isScrolled, setIsScrolled] = useState(false)
    const i2vRef = useRef(null)

    const [firstFrame, setFirstFrame] = useState(null)
    const [lastFrame, setLastFrame] = useState(null)
    const [refImages, setRefImages] = useState([])
    const [refVideo, setRefVideo] = useState(null)
    const [refAudio, setRefAudio] = useState(null)

    const [enhancing, setEnhancing] = useState(false)
    const [generatingFrame, setGeneratingFrame] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [generation, setGeneration] = useState(null)
    const [projectId, setProjectId] = useState(null)

    // ── Persistence: Save/Load from localStorage ──
    useEffect(() => {
        const saved = localStorage.getItem('mantram_vm_state')
        if (saved) {
            try {
                const state = JSON.parse(saved)
                if (state.projectId) setProjectId(state.projectId)
                if (state.phase) {
                    setPhase(state.phase)
                    if (state.phase === 'generating' && state.projectId) {
                        startPolling(state.projectId)
                    }
                }
                if (state.prompt) setPrompt(state.prompt)
                if (state.model) setModel(state.model)
                if (state.duration) setDuration(state.duration)
                if (state.aspectRatio) setAspectRatio(state.aspectRatio)
                if (state.quality) setQuality(state.quality)
                if (state.videoMode) setVideoMode(state.videoMode)
                if (state.firstFrame) setFirstFrame(state.firstFrame)
                if (state.lastFrame) setLastFrame(state.lastFrame)
                if (state.refImages) setRefImages(state.refImages)
                if (state.i2vImage) setI2vImage(state.i2vImage)
                if (state.generation) setGeneration(state.generation)
            } catch (e) {
                console.warn('VM state restore failed:', e)
            }
        }
    }, [])

    useEffect(() => {
        const state = {
            projectId, phase, prompt, model, duration, aspectRatio,
            quality, videoMode, firstFrame, lastFrame, refImages,
            i2vImage, generation
        }
        localStorage.setItem('mantram_vm_state', JSON.stringify(state))
    }, [projectId, phase, prompt, model, duration, aspectRatio, quality, videoMode, firstFrame, lastFrame, refImages, i2vImage, generation])
    const [showLibrary, setShowLibrary] = useState(false)
    const [libraryFor, setLibraryFor] = useState(null)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [showAutocomplete, setShowAutocomplete] = useState(false)

    const firstFrameRef = useRef(null)
    const lastFrameRef = useRef(null)
    const refImgRef = useRef(null)
    const refVideoRef = useRef(null)
    const refAudioRef = useRef(null)
    const pollRef = useRef(null)
    const promptRef = useRef(null)

    const m = MODELS[model] || MODELS['seedance-2.0']
    const credits = Math.max(Math.ceil(m.cost * (quality === 'quality' ? 2 : 1) * duration * 70), 5)

    // ── Refill from initialData ──
    useEffect(() => {
        if (!initialData) return
        if (initialData.prompt) setPrompt(initialData.prompt)
        if (initialData.model && MODELS[initialData.model]) setModel(initialData.model)
        if (initialData.duration) setDuration(initialData.duration)
        if (initialData.aspectRatio) setAspectRatio(initialData.aspectRatio)
        if (initialData.quality) setQuality(initialData.quality)
        if (initialData.firstImageUrl) setFirstFrame({ url: initialData.firstImageUrl, source: 'refill' })
        if (initialData.lastImageUrl) setLastFrame({ url: initialData.lastImageUrl, source: 'refill' })
        if (initialData.referenceImages?.length > 0) {
            setRefImages(initialData.referenceImages.map((r, i) => ({
                id: `refill-${i}-${Date.now()}`, url: r.url || r, label: `@image${i + 1}`, uploading: false
            })))
        }
        setPhase('compose')
        setGeneration(null)
        setError('')
    }, [initialData])

    useEffect(() => {
        if (duration < m.durs[0]) setDuration(m.durs[0])
        if (duration > m.durs[m.durs.length - 1]) setDuration(m.durs[m.durs.length - 1])
        if (!m.ratios.includes(aspectRatio)) setAspectRatio(m.ratios[0])
        if (!m.res.includes(resolution)) setResolution(m.res[0])
        if (!m.has.lastFrame) setLastFrame(null)
        if (!m.has.refVideo) setRefVideo(null)
        if (!m.has.refAudio) setRefAudio(null)
        if (!m.has.refImages) setRefImages([])
        if (!m.has.firstFrame && videoMode !== 'i2v') setFirstFrame(null)
    }, [model])

    const observerRef = useRef(null)

    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            setIsScrolled(!entry.isIntersecting)
        }, { threshold: 0, rootMargin: '-80px 0px 0px 0px' })
        
        if (observerRef.current) observer.observe(observerRef.current)
        return () => observer.disconnect()
    }, [])
    
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ── Library ──
    async function loadLibrary(target) {
        setLibraryFor(target); setShowLibrary(true)
        if (libraryImages.length > 0) return
        setLibraryLoading(true)
        try {
            const data = await creativesAPI.imageBank({ limit: 30, brandId: activeBrand?._id || '' })
            setLibraryImages(data.images || data.creatives || [])
        } catch { setLibraryImages([]) }
        setLibraryLoading(false)
    }
    function pickFromLibrary(img) {
        const url = img.url || img.imageUrl || img.outputUrl
        if (!url) return
        if (libraryFor === 'first') setFirstFrame({ url, source: 'library' })
        else if (libraryFor === 'last') setLastFrame({ url, source: 'library' })
        else if (libraryFor === 'ref') setRefImages(prev => [...prev, { id: `r${Date.now()}`, url, label: `@image${prev.length + 1}` }])
        setShowLibrary(false)
    }

    // ── Upload base64 → hosted URL ──
    async function uploadImage(base64DataUri) {
        try {
            const d = await api('/video-studio/upload-image', {
                method: 'POST', body: JSON.stringify({ imageData: base64DataUri }),
            })
            return d.url || base64DataUri
        } catch { return base64DataUri }
    }

    // ── File uploads ──
    function onFile(e, setter) {
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader()
        r.onload = async () => {
            setter({ url: r.result, source: 'upload', uploading: true })
            const hostedUrl = await uploadImage(r.result)
            setter({ url: hostedUrl, source: 'upload', uploading: false })
        }
        r.readAsDataURL(f)
    }
    function onRefFile(e) {
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader()
        r.onload = async () => {
            const id = `r${Date.now()}`
            // Label is handled dynamically in rendering/autocomplete
            setRefImages(prev => [...prev, { id, url: r.result, uploading: true }])
            const hostedUrl = await uploadImage(r.result)
            setRefImages(prev => prev.map(img => img.id === id ? { ...img, url: hostedUrl, uploading: false } : img))
        }
        r.readAsDataURL(f)
    }
    function onMediaFile(e, setter) {
        const f = e.target.files?.[0]; if (!f) return
        setter(prev => {
            if (prev?.url?.startsWith('blob:')) URL.revokeObjectURL(prev.url)
            return { url: URL.createObjectURL(f), name: f.name }
        })
    }

    // ── @ Autocomplete — supports @image, @video, @audio ──
    function handlePromptChange(e) {
        const val = e.target.value
        setPrompt(val)
        const cursorPos = e.target.selectionStart
        const textBeforeCursor = val.substring(0, cursorPos)
        const offset = firstFrame ? 1 : 0
        const allAssets = [
            ...(firstFrame ? [{ tag: '@image1', type: 'image', src: firstFrame }] : []),
            ...refImages.map((r, i) => ({ tag: `@image${i + 1 + offset}`, type: 'image', src: r })),
            ...(refVideo ? [{ tag: '@video1', type: 'video', src: refVideo }] : []),
            ...(refAudio ? [{ tag: '@audio1', type: 'audio', src: refAudio }] : []),
        ]
        if (textBeforeCursor.endsWith('@') && allAssets.length > 0) {
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }
    function insertTag(tag) {
        const textarea = promptRef.current
        const currentPrompt = m.has.multishot ? shots[0].prompt : prompt
        if (textarea) {
            const cursorPos = textarea.selectionStart
            const before = currentPrompt.substring(0, cursorPos - 1)
            const after = currentPrompt.substring(cursorPos)
            const newPrompt = before + tag + ' ' + after
            
            if (m.has.multishot) {
                const n = [...shots]; n[0].prompt = newPrompt; setShots(n);
            } else {
                setPrompt(newPrompt)
            }
        } else {
            if (m.has.multishot) {
                const n = [...shots]; n[0].prompt = n[0].prompt + tag + ' '; setShots(n);
            } else {
                setPrompt(prev => prev + tag + ' ')
            }
        }
        setShowAutocomplete(false)
    }

    // Build autocomplete items
    const imgOffset = firstFrame ? 1 : 0
    const acItems = [
        ...(firstFrame ? [{ tag: '@image1', type: 'image', thumb: firstFrame.url, label: 'image1' }] : []),
        ...refImages.map((r, i) => ({ tag: `@image${i + 1 + imgOffset}`, type: 'image', thumb: r.url, label: `image${i + 1 + imgOffset}` })),
        ...(refVideo ? [{ tag: '@video1', type: 'video', msIcon: 'video_file', label: 'video1' }] : []),
        ...(refAudio ? [{ tag: '@audio1', type: 'audio', msIcon: 'audio_file', label: 'audio1' }] : []),
    ]

    // ── AI First Frame ──
    async function generateFirstFrame() {
        if (!prompt.trim()) { setError('Write your ad idea first'); return }
        setGeneratingFrame(true); setError('')
        try {
            const d = await api('/video-studio/generate-first-frame', {
                method: 'POST', body: JSON.stringify({ prompt: prompt.trim(), brandId: activeBrand?._id }),
            })
            if (d.imageUrl) setFirstFrame({ url: d.imageUrl, source: 'ai' })
            else setError('Could not generate image')
        } catch (e) { setError(e.message) }
        setGeneratingFrame(false)
    }

    // ── Enhance ──
    async function handleEnhance() {
        if (!prompt.trim()) return
        setEnhancing(true); setError('')
        try {
            const d = await api('/video-studio/enhance-prompt', {
                method: 'POST', body: JSON.stringify({ prompt, model, duration, aspectRatio, brandId: activeBrand?._id, style: 'adfilm' }),
            })
            setPrompt(d.enhancedPrompt || prompt)
        } catch (e) { setError(e.message) }
        setEnhancing(false)
    }

    // ── Generate (T2V) ──
    async function handleGenerate() {
        if (!prompt.trim()) { setError('Write your ad idea first'); return }
        setLoading(true); setError('')
        try {
            const allRefUrls = refImages.map(r => r.url).filter(Boolean)
            const d = await api('/video-studio/advanced/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: m.has.multishot ? shots.map(s => s.prompt).join(' | ') : prompt.trim(), 
                    model, duration, resolution, aspectRatio, 
                    mode: m.has.quality ? quality : 'fast',
                    shots: m.has.multishot ? shots : [],
                    firstImageUrl: firstFrame?.url || '',
                    lastImageUrl: lastFrame?.url || '',
                    generateAudio: !!m.has.audio, qualityMode: quality,
                    brandId: activeBrand?._id || null,
                    referenceImages: allRefUrls,
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    // ── Generate (I2V) ──
    async function handleI2VGenerate() {
        if (!i2vImage?.url) { setError('Upload an image first'); return }
        setLoading(true); setError('')
        try {
            const d = await api('/video-studio/advanced/image-to-video', {
                method: 'POST',
                body: JSON.stringify({
                    imageUrl: i2vImage.url,
                    prompt: prompt.trim() || 'Animate this image with natural cinematic motion',
                    duration, aspectRatio, qualityMode: quality,
                    brandId: activeBrand?._id || null,
                    referenceImages: refImages.map(r => r.url).filter(Boolean),
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    // ── Extend ──
    async function handleExtend() {
        if (!projectId) return
        setExtending(true); setError('')
        try {
            const d = await api('/video-studio/extend-video', {
                method: 'POST',
                body: JSON.stringify({ projectId, prompt: extendPrompt.trim(), duration: extendDuration, qualityMode: quality }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
            setShowExtendPanel(false); setExtendPrompt('')
        } catch (e) { setError(e.message) }
        setExtending(false)
    }

    // ── I2V file handler ──
    function onI2VFile(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = reader.result
            setI2vImage({ url: base64, source: 'upload', uploading: true })
            const hosted = await uploadImage(base64)
            if (hosted) setI2vImage({ url: hosted, source: 'upload', uploading: false })
            else setI2vImage({ url: base64, source: 'upload', uploading: false })
        }
        reader.readAsDataURL(file)
    }

    const startPolling = useCallback((pid) => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const d = await api(`/video-studio/${pid}/status`)
                setGeneration(d.project.generation)
                if (['COMPLETED'].includes(d.project.generation?.status) || d.project.status === 'critique') { clearInterval(pollRef.current); setPhase('done') }
                else if (d.project.generation?.status === 'FAILED') { clearInterval(pollRef.current); setError(d.project.generation?.error || 'Failed'); setPhase('done') }
            } catch { }
        }, 5000)
    }, [])

    // ── All asset tags for the tags row ──
    const tagOffset = firstFrame ? 1 : 0
    const allTags = [
        ...(firstFrame ? [{ id: 'ff', label: '@image1', type: 'frame', thumb: firstFrame.url, uploading: firstFrame.uploading, linked: prompt.includes('@image1') }] : []),
        ...(lastFrame ? [{ id: 'lf', label: 'End Frame', type: 'frame', thumb: lastFrame.url, uploading: lastFrame.uploading }] : []),
        ...refImages.map((r, i) => {
            const label = `@image${i + 1 + tagOffset}`
            return { id: r.id, label, type: 'image', thumb: r.url, uploading: r.uploading, linked: prompt.includes(label) }
        }),
        ...(refVideo ? [{ id: 'rv', label: '@video1', type: 'video', name: refVideo.name, linked: prompt.includes('@video1') }] : []),
        ...(refAudio ? [{ id: 'ra', label: '@audio1', type: 'audio', name: refAudio.name, linked: prompt.includes('@audio1') }] : []),
    ]

    function removeTag(tag) {
        if (tag.id === 'ff') setFirstFrame(null)
        else if (tag.id === 'lf') setLastFrame(null)
        else if (tag.id === 'rv') setRefVideo(null)
        else if (tag.id === 'ra') setRefAudio(null)
        else setRefImages(prev => prev.filter(r => r.id !== tag.id))
    }

    // available dock buttons based on model
    const dockButtons = []
    if (m.has.firstFrame) dockButtons.push({ key: 'first', msIcon: 'first_page', label: 'Start', has: !!firstFrame, action: () => firstFrameRef.current?.click() })
    if (m.has.lastFrame) dockButtons.push({ key: 'last', msIcon: 'last_page', label: 'End', has: !!lastFrame, action: () => lastFrameRef.current?.click() })
    if (m.has.refImages) dockButtons.push({ key: 'ref', msIcon: 'add_photo_alternate', label: 'Ref', has: refImages.length > 0, action: () => refImgRef.current?.click() })
    if (m.has.refVideo) dockButtons.push({ key: 'video', msIcon: 'video_file', label: 'Video', has: !!refVideo, action: () => refVideoRef.current?.click() })
    if (m.has.refAudio) dockButtons.push({ key: 'audio', msIcon: 'audio_file', label: 'Audio', has: !!refAudio, action: () => refAudioRef.current?.click() })

    // ═══════════════════════════
    // RENDER
    // ═══════════════════════════
    // Render Viewer Modal overlay early layout hook
    if (viewVideo) {
        return (
            <div className="vm-studio-root" style={{background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 1000}}>
                <div style={{maxWidth: 1000, width: '100%', margin: 'auto', position: 'relative'}}>
                    <button style={{position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', zIndex: 10}} onClick={() => setViewVideo(null)}><span className="material-symbols-outlined" style={{fontSize: 28}}>close</span></button>
                    <video src={viewVideo.url} controls autoPlay loop style={{width: '100%', borderRadius: 16, border: '1px solid var(--sys-border)'}} />
                    <div style={{display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center'}}>
                        <button className="vm-generate" onClick={() => { 
                            setModel(viewVideo.model||'kling-3.0-o'); 
                            setPrompt(viewVideo.prompt||''); 
                            setDuration(Number(viewVideo.duration)||5); 
                            setViewVideo(null); 
                            window.scrollTo(0,0);
                        }}><span className="material-symbols-outlined">auto_fix_high</span> Reuse Settings</button>
                        <button className="vm-config-trigger" style={{background: 'var(--sys-surface-glass)'}} onClick={() => navigator.clipboard.writeText(viewVideo.prompt)}><span className="material-symbols-outlined">content_copy</span> Copy Prompt</button>
                        <a href={viewVideo.url} download className="vm-config-trigger" style={{background: 'var(--sys-surface-glass)', textDecoration:'none'}}><span className="material-symbols-outlined">download</span> Download</a>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="vm-studio-root">
            <style>{css}</style>
            <div ref={observerRef} style={{position: 'absolute', top: 0, left: 0, height: 1, width: '100%', pointerEvents: 'none'}} />
            
            {/* Ambient Background Grid */}
            <div className="vm-bg-grid">
                 {bgProjects.map((p, i) => (
                      <div key={p._id || i} className="vm-bg-item">
                           <video 
                               src={`${API_BASE}/video-studio/${p._id}/video#t=1`} 
                               muted loop autoPlay={false} playsInline crossOrigin="anonymous" preload="auto"
                               onMouseOver={e => e.target.play()}
                               onMouseOut={e => { e.target.pause(); e.target.currentTime = 1; }}
                           />
                      </div>
                 ))}
                 {[...Array(Math.max(0, 12 - bgProjects.length))].map((_, i) => (
                      <div key={`empty-${i}`} className="vm-bg-item" style={{ background: 'rgba(0,0,0,0.02)', border: '1px dashed var(--sys-border)' }} />
                 ))}
            </div>


            {/* ── GENERATING ── */}
            {phase === 'generating' && (
                <div style={{ padding: '40px 20px' }}>
                    <div className="vm-gen-card">
                        <div className="vm-gen-preview">
                            {(firstFrame?.url || i2vImage?.url) && <img src={i2vImage?.url || firstFrame?.url} alt="" />}
                            <div className="badges">
                                <span className="vm-gen-badge" style={{ background: 'rgba(255, 77, 0,0.85)', color: '#fff' }}>{generation?.progress || 5}%</span>
                                <span className="vm-gen-badge" style={{ background: 'rgba(0,0,0,0.5)', color: '#ccc' }}>{videoMode === 'i2v' ? 'I2V' : m.name}</span>
                            </div>
                        </div>
                        <div className="vm-gen-info">
                            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="material-symbols-outlined vm-spin" style={{ fontSize: '16px', color: '#7c3aed' }}>progress_activity</span> Creating your video — usually 5-10 minutes</p>
                            <div className="vm-progress-bar"><div className="vm-progress-fill" style={{ width: `${generation?.progress || 5}%` }} /></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DONE ── */}
            {phase === 'done' && (
                <div style={{ padding: '20px' }}>
                    {generation?.videoUrl ? (
                        <>
                            <div className="vm-done-card"><video controls src={projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl} /></div>
                            <div className="vm-done-btns">
                                <button className="vm-btn-sec" onClick={() => { setPhase('compose'); setGeneration(null); setShowExtendPanel(false) }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span> Edit & Retry
                                </button>
                                {generation?.provider === 'piapi' && (
                                    <button className="vm-btn-sec" onClick={() => setShowExtendPanel(v => !v)} style={showExtendPanel ? { borderColor: 'rgba(255, 77, 0,0.4)' } : {}}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_circle</span> Extend
                                    </button>
                                )}
                                <button className="vm-btn-pri" onClick={async () => {
                                    try {
                                        const videoSrc = projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl
                                        const resp = await fetch(videoSrc)
                                        const blob = await resp.blob()
                                        const blobUrl = URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = blobUrl; a.download = 'video.mp4'
                                        document.body.appendChild(a); a.click()
                                        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
                                    } catch { window.open(projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl, '_blank') }
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span> Download
                                </button>
                            </div>
                            {showExtendPanel && (
                                <div className="vm-extend">
                                    <h4><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add_circle</span> Extend this video</h4>
                                    <div className="vm-extend-row">
                                        <input className="vm-extend-input" value={extendPrompt} onChange={e => setExtendPrompt(e.target.value)} placeholder="What should happen next? (optional)" />
                                        <ConfigDropdown value={extendDuration} onChange={setExtendDuration} options={[4, 5, 6, 7, 8, 9, 10].map(d => ({ value: d, label: `${d}s` }))} />
                                        <button className="vm-btn-extend" onClick={handleExtend} disabled={extending}>
                                            {extending ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: '14px' }}>progress_activity</span> Extending...</>
                                                : <><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>link</span> Extend +{extendDuration}s</>}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#475569' }}>videocam_off</span>
                            <p style={{ color: '#64748b', fontSize: '14px', margin: '12px 0 16px' }}>{error || 'Generation failed'}</p>
                            <button className="vm-btn-sec" onClick={() => { setPhase('compose'); setError('') }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> Try Again
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════ COMPOSE — Floating Card at Bottom ══════════ */}
            {phase === 'compose' && (
                <div className="vm-layout">
                        <div className={`vm-card ${isScrolled ? 'collapsed' : ''}`}>
                            {/* Panel Header */}
                            <div className="vm-card-header">
                                <span style={{display: 'flex', alignItems: 'center', gap: 8}}>
                                    <span className="material-symbols-outlined" style={{fontSize: 18, color: '#eab308'}}>movie_creation</span> Scott Panel
                                </span>
                            </div>
                            
                            {error && (
                                <div className="vm-err">
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
                                    <span style={{ flex: 1 }}>{error}</span>
                                    <button onClick={() => setError('')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span></button>
                                </div>
                            )}

                            {/* Upper Controls: File upload thumbnails and quality flags */}
                            <div className="vm-upper-controls">
                                {/* DYNAMIC MODEL BANNER */}
                                <div style={{width: '100%', marginBottom: 16, paddingBottom: 16, borderBottom: '1px dashed var(--sys-border)', display: 'flex', gap: 6, alignItems: 'center'}}>
                                    <span style={{fontSize: 13, fontWeight: 600, color: 'var(--sys-primary)'}}>💡 {m.desc || 'Optimized for high-fidelity videos.'}</span>
                                    {videoMode === 'i2v' && <span style={{marginLeft: 'auto', fontSize: 11, background: 'var(--sys-primary-dim)', padding: '4px 10px', borderRadius: 8, color: 'var(--sys-text)', fontWeight: 600}}>Image-to-Video Active</span>}
                                </div>

                                {m.has.firstFrame && (
                                    <div className="vm-thumb-group">
                                        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                            <div className="vm-thumb-box" onClick={() => videoMode === 'i2v' ? (!i2vImage && i2vRef.current?.click()) : firstFrameRef.current?.click()} title={videoMode === 'i2v' ? "Upload Image to Animate" : "Start Frame"}>
                                                {(videoMode === 'i2v' && i2vImage) ? <img src={i2vImage.url} alt=""/> : (firstFrame ? <img src={firstFrame.url} alt=""/> : <span className="material-symbols-outlined" style={{fontSize: 20, color: 'var(--sys-text-muted)'}}>add_photo_alternate</span>)}
                                            </div>
                                            <span className="vm-thumb-label">Start Point</span>
                                        </div>
                                        
                                        {m.has.lastFrame && (
                                            <>
                                                <span className="material-symbols-outlined" style={{color: 'var(--sys-border)', fontSize: 16, margin: '0 4px'}}>arrow_forward_ios</span>
                                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                                    <div className="vm-thumb-box" onClick={() => lastFrameRef.current?.click()} title="End Frame (Optional)">
                                                        {lastFrame ? <img src={lastFrame.url} alt=""/> : <span className="material-symbols-outlined" style={{fontSize: 20, color: 'var(--sys-text-muted)'}}>add_photo_alternate</span>}
                                                    </div>
                                                    <span className="vm-thumb-label">End Point</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {m.has.firstFrame && (m.has.refAudio || m.has.refVideo || m.has.refImages) && <div style={{width: 1, height: 32, background: 'var(--sys-border)', margin: '0 12px'}}></div>}


                                {m.has.refAudio && (
                                    <button className="vm-btn-icon-label" style={{opacity: refAudio ? 1 : 0.6, background: refAudio ? 'var(--sys-primary-dim)' : 'transparent'}} onClick={() => refAudioRef.current?.click()}>
                                        <span className="material-symbols-outlined" style={{fontSize: 16}}>{refAudio ? 'audio_file' : 'music_note'}</span> {refAudio ? 'Audio Attached' : 'Add Audio'}
                                    </button>
                                )}
                                
                                {m.has.refVideo && (
                                    <button className="vm-btn-icon-label" style={{opacity: refVideo ? 1 : 0.6, background: refVideo ? 'var(--sys-primary-dim)' : 'transparent'}} onClick={() => refVideoRef.current?.click()}>
                                        <span className="material-symbols-outlined" style={{fontSize: 16}}>video_library</span> {refVideo ? 'Ref Attached' : 'Add Ref Video'}
                                    </button>
                                )}

                                {m.has.quality && (
                                    <div className="vm-quality-group" style={{marginLeft: 'auto'}}>
                                        <button className={`vm-quality-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>bolt</span> Fast Mode</button>
                                        <button className={`vm-quality-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>auto_awesome</span> Pro Quality</button>
                                    </div>
                                )}
                            </div>

                            {/* Prompt area */}
                            <div className="vm-prompt">
                                <div style={{ position: 'relative', width: '100%', minHeight: '90px' }}>
                                    <div 
                                        className="vm-textarea" 
                                        style={{ position: 'absolute', inset: 0, color: 'var(--sys-text)', pointerEvents: 'none', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflow: 'hidden' }}
                                        dangerouslySetInnerHTML={{ __html: (m.has.multishot ? shots[0].prompt : prompt).replace(/(@image\d+|@video\d+|@audio\d+)/g, '<span style="color: var(--sys-primary)">$1</span>') }}
                                    />
                                    <textarea
                                        ref={promptRef}
                                        className="vm-textarea"
                                        value={m.has.multishot ? shots[0].prompt : prompt}
                                        onChange={e => {
                                            if (m.has.multishot) {
                                                const n = [...shots]; n[0].prompt = e.target.value; setShots(n);
                                            } else {
                                                handlePromptChange(e);
                                            }
                                        }}
                                        style={{ position: 'relative', background: 'transparent', color: 'transparent', caretColor: 'var(--sys-text)', WebkitTextFillColor: 'transparent' }}
                                        placeholder={activeBrand?.name ? `What's your ${activeBrand.name} ad about? Type @ to tag assets...` : `What's your ad about? Type @ to tag images, video, audio...`}
                                    />
                                </div>
                                
                                {m.has.multishot && (
                                    <div style={{marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8}}>
                                        {shots.slice(1).map((s, idx) => (
                                            <div key={idx} style={{display: 'flex', gap: 8}}>
                                                <input className="vm-textarea" style={{minHeight: '40px', flex:1}} value={s.prompt} onChange={(e) => { const n = [...shots]; n[idx+1].prompt = e.target.value; setShots(n); }} placeholder={`Shot ${idx+2} Prompt`} />
                                                <button className="vm-config-trigger" style={{color:'var(--sys-error)'}} onClick={() => setShots(shots.filter((_, i) => i !== idx+1))}><span className="material-symbols-outlined">delete</span></button>
                                            </div>
                                        ))}
                                        {shots.length < 6 && <button className="vm-btn-icon-label" style={{alignSelf: 'flex-start'}} onClick={() => setShots([...shots, {prompt: ''}])}><span className="material-symbols-outlined" style={{fontSize:16}}>add</span> Add Shot</button>}
                                    </div>
                                )}
                                
                                {showAutocomplete && acItems.length > 0 && (
                                    <div className="vm-autocomplete">
                                        {acItems.map(item => (
                                            <button key={item.tag} className="vm-ac-item" onClick={() => insertTag(item.tag)}>
                                                {item.thumb ? <img src={item.thumb} alt="" style={{width: 20, height: 20, borderRadius: 4, objectFit: 'cover'}} /> : <span className="icon"><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{item.msIcon || 'attach_file'}</span></span>}
                                                <span>{item.tag}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {showLibrary && (
                                    <div className="vm-library">
                                        <div className="vm-library-head">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span> Image Library</span>
                                            <button onClick={() => setShowLibrary(false)}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                            </button>
                                        </div>
                                        {libraryLoading ? <p style={{ fontSize: '12px', color: 'var(--sys-text-muted)', textAlign: 'center', padding: '12px 0' }}>Loading...</p>
                                            : libraryImages.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--sys-text-muted)', textAlign: 'center', padding: '12px 0' }}>No images yet</p>
                                                : <div className="vm-library-grid">{libraryImages.map((img, i) => <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => pickFromLibrary(img)} />)}</div>
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Tags (if any exist) */}
                            {allTags.length > 0 && (
                                <div style={{padding: '0 24px 16px', display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                                    {allTags.map(tag => (
                                        <div key={tag.id} className="vm-tag">
                                            {tag.thumb && <img src={tag.thumb} alt="" style={{width: 16, height: 16, borderRadius: 4, objectFit: 'cover'}} />}
                                            <span>{tag.label}</span>
                                            <button style={{background: 'none', border: 'none', color: 'var(--sys-text-muted)', padding: 0, marginLeft: 4, cursor: 'pointer', fontSize: 14}} onClick={() => removeTag(tag)}>×</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Hidden file inputs */}
                            <input ref={firstFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setFirstFrame)} style={{ display: 'none' }} />
                            <input ref={lastFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setLastFrame)} style={{ display: 'none' }} />
                            <input ref={refImgRef} type="file" accept="image/*" onChange={onRefFile} style={{ display: 'none' }} />
                            <input ref={refVideoRef} type="file" accept="video/*" onChange={e => onMediaFile(e, setRefVideo)} style={{ display: 'none' }} />
                            <input ref={refAudioRef} type="file" accept="audio/*" onChange={e => onMediaFile(e, setRefAudio)} style={{ display: 'none' }} />
                            <input ref={i2vRef} type="file" accept="image/*" onChange={onI2VFile} style={{ display: 'none' }} />

                            {/* Bottom Bar Controls */}
                            <div className="vm-bottom">
                                <div className="vm-bottom-left">
                                    <ConfigDropdown
                                        value={model}
                                        onChange={setModel}
                                        options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, msIcon: mod.msIcon }))}
                                        label="Model"
                                    />
                                    <ConfigDropdown
                                        value={aspectRatio}
                                        onChange={setAspectRatio}
                                        options={m.ratios.map(r => ({ value: r, label: r, meta: r === '16:9' || r === '21:9' ? 'Cinematic' : null }))}
                                        label="Ratio"
                                    />
                                    <ConfigDropdown
                                        value={resolution}
                                        onChange={setResolution}
                                        options={m.res.map(r => ({ value: r, label: r }))}
                                        label="Resolution"
                                    />
                                    <ConfigDropdown
                                        value={duration}
                                        onChange={setDuration}
                                        options={m.durs.map(d => ({ value: d, label: `${d}s` }))}
                                        label="Duration"
                                    />
                                </div>

                                <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                                    <CreditTooltipWrapper action="promptEnhance">
                                        <button className="vm-btn-icon-label" onClick={handleEnhance} disabled={enhancing || !prompt.trim()} style={{color: 'var(--sys-primary)'}}>
                                            {enhancing ? <><span className="material-symbols-outlined vm-spin" style={{fontSize: 16}}>progress_activity</span></> : <><span className="material-symbols-outlined" style={{fontSize: 16}}>auto_awesome</span> Enhance</>}
                                        </button>
                                    </CreditTooltipWrapper>

                                    {videoMode === 'i2v' ? (
                                        <button className="vm-generate" onClick={handleI2VGenerate} disabled={loading || !i2vImage?.url}>
                                            {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 18 }}>progress_activity</span></>
                                                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>animation</span> GENERATE <span style={{fontSize: 12, opacity: 0.6}}>· {credits}</span></>}
                                        </button>
                                    ) : (
                                        <button className="vm-generate" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
                                            {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 18 }}>progress_activity</span></>
                                                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>movie_creation</span> GENERATE <span style={{fontSize: 12, opacity: 0.6}}>· {credits}</span></>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
            )}
        </div>
    )
}

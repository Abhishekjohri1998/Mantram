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

/* ── Models — icons use Material Symbols names ── */
const MODELS = {
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', dur: [5, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true }, cost: 0.08 },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', dur: [3, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true, lastFrame: true, audio: true }, cost: 0.07 },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', dur: [5, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true }, cost: 0.10 },
    'veo-3.1-fast': { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', msIcon: 'bolt', dur: [5, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, refImages: true, audio: true }, cost: 0.06 },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', dur: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3'], has: { firstFrame: true, lastFrame: true }, cost: 0.05 },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', dur: [1, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true }, cost: 0.08 },
}

/* ── Minimal CSS ── */
const css = `
/* Layout: compose at bottom, video above */
.vm-layout { display: flex; flex-direction: column; min-height: calc(100vh - 200px); justify-content: flex-end; }
.vm-video-area { flex: 1; display: flex; align-items: center; justify-content: center; padding: 20px; }

/* Glass floating card */
.vm-card { max-width: 780px; margin: 0 auto; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 0; backdrop-filter: blur(20px); overflow: visible; }

/* Mode toggle */
.vm-modes { display: flex; border-bottom: 1px solid rgba(255,255,255,0.06); }
.vm-mode-btn { flex: 1; padding: 14px; text-align: center; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; border: none; background: none; transition: all .2s; display: flex; align-items: center; justify-content: center; gap: 8px; }
.vm-mode-btn:hover { color: #94a3b8; background: rgba(255,255,255,0.02); }
.vm-mode-btn.active { color: #e2e8f0; background: rgba(255, 77, 0,0.08); border-bottom: 2px solid #7c3aed; }
.vm-mode-btn .badge { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff; text-transform: uppercase; }

/* Prompt area */
.vm-prompt { padding: 20px 24px 0; }
.vm-textarea { width: 100%; background: transparent; border: none; outline: none; resize: none; color: #f1f5f9; font-size: 15px; line-height: 1.7; font-family: inherit; min-height: 100px; }
.vm-textarea::placeholder { color: rgba(148,163,184,0.3); }

/* I2V upload zone */
.vm-i2v-zone { margin: 0 24px 16px; border: 2px dashed rgba(255, 77, 0,0.2); border-radius: 16px; padding: 32px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; cursor: pointer; transition: all .2s; background: rgba(255, 77, 0,0.02); }
.vm-i2v-zone:hover { border-color: rgba(255, 77, 0,0.5); background: rgba(255, 77, 0,0.05); }
.vm-i2v-zone.has { border-style: solid; border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.02); padding: 12px; position: relative; }
.vm-i2v-zone img { width: 100%; max-height: 220px; object-fit: contain; border-radius: 12px; }
.vm-i2v-remove { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.6); border: none; color: #f87171; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }

/* Asset tags row (below prompt) */
.vm-tags { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 24px 0; }
.vm-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 3px; border-radius: 8px; background: rgba(255, 77, 0,0.08); border: 1px solid rgba(255, 77, 0,0.18); font-size: 12px; color: #c4b5fd; font-weight: 600; transition: all .15s; }
.vm-tag.linked { border-color: rgba(34,197,94,0.4); background: rgba(34,197,94,0.06); color: #4ade80; }
.vm-tag img { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; }
.vm-tag .icon { width: 22px; height: 22px; border-radius: 5px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; font-size: 12px; }
.vm-tag button { background: none; border: none; color: #f87171; cursor: pointer; padding: 0; font-size: 12px; margin-left: 2px; }
.vm-tag .uploading { font-size: 10px; color: #64748b; font-style: italic; }

/* @ Autocomplete popup */
.vm-autocomplete { position: absolute; bottom: 100%; left: 16px; right: 16px; background: #1e1e26; border: 1px solid rgba(255, 77, 0,0.3); border-radius: 12px; padding: 8px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
.vm-ac-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #c4b5fd; font-weight: 600; }
.vm-ac-item:hover { border-color: rgba(255, 77, 0,0.4); background: rgba(255, 77, 0,0.08); }
.vm-ac-item img { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; }
.vm-ac-item .icon { width: 28px; height: 28px; border-radius: 6px; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; font-size: 14px; }

/* Asset dock (compact icon row) */
.vm-dock { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border-top: 1px solid rgba(255,255,255,0.04); }
.vm-dock-btn { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); color: #64748b; transition: all .15s; white-space: nowrap; }
.vm-dock-btn:hover { border-color: rgba(255, 77, 0,0.3); color: #c4b5fd; background: rgba(255, 77, 0,0.04); }
.vm-dock-btn.has { color: #4ade80; border-color: rgba(34,197,94,0.3); background: rgba(34,197,94,0.04); }
.vm-dock-btn.ai { background: linear-gradient(135deg, rgba(124,58,237,0.1), rgba(6,182,212,0.1)); color: #c4b5fd; border-color: rgba(255, 77, 0,0.2); }
.vm-dock-btn.ai:disabled { opacity: 0.5; }
.vm-dock-btn .material-symbols-outlined { font-size: 16px; }
.vm-dock-sep { width: 1px; height: 20px; background: rgba(255,255,255,0.06); margin: 0 4px; flex-shrink: 0; }

/* Config bar (inline compact) */
.vm-config { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border-top: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; }
.vm-config-item { position: relative; }
.vm-config-trigger { display: flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #e2e8f0; transition: all .15s; white-space: nowrap; }
.vm-config-trigger:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); }
.vm-config-trigger.open { border-color: rgba(255, 77, 0,0.4); background: rgba(255, 77, 0,0.08); }
.vm-config-trigger .material-symbols-outlined { font-size: 14px; color: #64748b; }
.vm-config-menu { position: absolute; bottom: calc(100% + 6px); left: 0; min-width: 140px; max-height: 220px; overflow-y: auto; background: #1e1e26; border: 1px solid rgba(255, 77, 0,0.25); border-radius: 12px; padding: 4px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-config-menu::-webkit-scrollbar { width: 5px; }
.vm-config-menu::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
.vm-config-opt { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 10px; border: none; background: transparent; color: #94a3b8; font-size: 13px; font-weight: 500; cursor: pointer; border-radius: 8px; text-align: left; transition: all .12s; }
.vm-config-opt:hover { background: rgba(255,255,255,0.05); color: #e2e8f0; }
.vm-config-opt.sel { background: rgba(255, 77, 0,0.15); color: #c4b5fd; font-weight: 600; }
.vm-quality-pill { padding: 7px 14px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); color: #64748b; transition: all .15s; }
.vm-quality-pill:hover { border-color: rgba(255,255,255,0.12); color: #94a3b8; }
.vm-quality-pill.active { background: rgba(255, 77, 0,0.12); color: #c4b5fd; border-color: rgba(255, 77, 0,0.3); }

/* Bottom bar (enhance + generate) */
.vm-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.015); }
@media (max-width: 560px) { .vm-bottom { flex-direction: column; } }
.vm-enhance { display: flex; align-items: center; gap: 6px; padding: 10px 18px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255, 77, 0,0.25); background: rgba(255, 77, 0,0.06); color: #c4b5fd; transition: all .15s; }
.vm-enhance:hover { border-color: rgba(255, 77, 0,0.5); background: rgba(255, 77, 0,0.12); }
.vm-enhance:disabled { opacity: 0.4; cursor: default; }
.vm-generate { flex: 1; max-width: 320px; padding: 12px 24px; border-radius: 14px; font-weight: 700; font-size: 15px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%); box-shadow: 0 4px 20px rgba(124,58,237,0.2); transition: all .2s; }
.vm-generate:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(124,58,237,0.3); }
.vm-generate:disabled { opacity: 0.4; cursor: default; background: rgba(255,255,255,0.04); color: #475569; box-shadow: none; transform: none; }

/* Library modal */
.vm-library { margin: 0 24px 16px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 14px; }
.vm-library-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.vm-library-head span { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.vm-library-head button { background: none; border: none; color: #94a3b8; cursor: pointer; }
.vm-library-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-height: 140px; overflow-y: auto; }
@media (max-width: 640px) { .vm-library-grid { grid-template-columns: repeat(3, 1fr); } }
.vm-library-grid img { width: 100%; height: 56px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid rgba(255,255,255,0.05); display: block; transition: border-color .12s; }
.vm-library-grid img:hover { border-color: rgba(255, 77, 0,0.4); }

/* Error */
.vm-err { margin: 12px 24px; padding: 10px 14px; border-radius: 10px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.12); color: #fca5a5; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.vm-err button { background: none; border: none; color: #fca5a5; cursor: pointer; padding: 0; }

/* Generating / Done (reuse) */
.vm-gen-card { max-width: 560px; margin: 0 auto; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden; }
.vm-gen-preview { position: relative; width: 100%; padding-bottom: 56.25%; background: linear-gradient(135deg, #0f172a, #1e293b); }
.vm-gen-preview img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; }
.vm-gen-preview .badges { position: absolute; top: 14px; left: 14px; display: flex; gap: 8px; }
.vm-gen-badge { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
.vm-gen-info { padding: 20px 24px; }
.vm-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); overflow: hidden; }
.vm-progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #7c3aed, #06b6d4); transition: width 1s ease; }

.vm-done-card { max-width: 680px; margin: 0 auto; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden; margin-bottom: 20px; }
.vm-done-card video { width: 100%; display: block; }
.vm-done-btns { display: flex; gap: 12px; max-width: 680px; margin: 0 auto; flex-wrap: wrap; }
.vm-btn-sec { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(255, 77, 0,0.2); background: rgba(255, 77, 0,0.08); color: #c4b5fd; transition: all .15s; }
.vm-btn-sec:hover { background: rgba(255, 77, 0,0.14); }
.vm-btn-pri { padding: 12px 20px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; text-decoration: none; transition: all .15s; }
.vm-btn-pri:hover { transform: translateY(-1px); }

/* Extend */
.vm-extend { padding: 16px; border-radius: 14px; background: rgba(255, 77, 0,0.05); border: 1px solid rgba(255, 77, 0,0.18); margin-top: 16px; max-width: 680px; margin-left: auto; margin-right: auto; }
.vm-extend h4 { font-size: 13px; font-weight: 700; color: #c4b5fd; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.vm-extend-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.vm-extend-input { flex: 1; min-width: 160px; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); color: #e2e8f0; font-size: 13px; }
.vm-extend-input::placeholder { color: #475569; }
.vm-btn-extend { padding: 10px 16px; border-radius: 10px; border: none; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.vm-btn-extend:disabled { opacity: 0.4; cursor: default; }

@keyframes vm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.vm-spin { animation: vm-spin 1s linear infinite; }
`

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

export default function AdvancedMode({ activeBrand, initialData }) {
    const [model, setModel] = useState('seedance-2.0')
    const [prompt, setPrompt] = useState('')
    const [duration, setDuration] = useState(6)
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('fast')
    const [phase, setPhase] = useState('compose')
    const [videoMode, setVideoMode] = useState('t2v')
    const [i2vImage, setI2vImage] = useState(null)
    const [extending, setExtending] = useState(false)
    const [showExtendPanel, setShowExtendPanel] = useState(false)
    const [extendPrompt, setExtendPrompt] = useState('')
    const [extendDuration, setExtendDuration] = useState(5)
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
        if (duration < m.dur[0]) setDuration(m.dur[0])
        if (duration > m.dur[1]) setDuration(m.dur[1])
        if (!m.ratios.includes(aspectRatio)) setAspectRatio(m.ratios[0])
        if (!m.has.lastFrame) setLastFrame(null)
        if (!m.has.refVideo) setRefVideo(null)
        if (!m.has.refAudio) setRefAudio(null)
        if (!m.has.refImages) setRefImages([])
    }, [model])

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
        if (textarea) {
            const cursorPos = textarea.selectionStart
            const before = prompt.substring(0, cursorPos - 1)
            const after = prompt.substring(cursorPos)
            setPrompt(before + tag + ' ' + after)
        } else {
            setPrompt(prev => prev + tag + ' ')
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
                    prompt: prompt.trim(), model, duration, resolution: '1080p', aspectRatio,
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
    return (
        <>
            <style>{css}</style>

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
                    <div style={{ maxWidth: '780px', width: '100%', margin: '0 auto', padding: '0 4px 20px' }}>
                        {error && (
                            <div className="vm-err">
                                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>error</span>
                                <span style={{ flex: 1 }}>{error}</span>
                                <button onClick={() => setError('')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span></button>
                            </div>
                        )}

                        <div className="vm-card">
                            {/* §1 — Mode Toggle */}
                            <div className="vm-modes">
                                <button className={`vm-mode-btn ${videoMode === 't2v' ? 'active' : ''}`} onClick={() => setVideoMode('t2v')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>text_fields</span> Text to Video
                                </button>
                                <button className={`vm-mode-btn ${videoMode === 'i2v' ? 'active' : ''}`} onClick={() => setVideoMode('i2v')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>image</span> Image to Video <span className="badge">New</span>
                                </button>
                            </div>

                            {/* §1b — I2V image upload */}
                            {videoMode === 'i2v' && (
                                <>
                                    <div className={`vm-i2v-zone ${i2vImage ? 'has' : ''}`} onClick={() => !i2vImage && i2vRef.current?.click()}>
                                        {i2vImage ? (
                                            <>
                                                <img src={i2vImage.url} alt="Source" />
                                                {i2vImage.uploading && <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>Uploading...</p>}
                                                <button className="vm-i2v-remove" onClick={e => { e.stopPropagation(); setI2vImage(null) }}>×</button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined" style={{ fontSize: '36px', color: '#7c3aed' }}>add_photo_alternate</span>
                                                <span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 500 }}>Upload image to animate</span>
                                                <span style={{ fontSize: '11px', color: '#475569' }}>Product photo, brand image, or any still</span>
                                            </>
                                        )}
                                    </div>
                                    <input ref={i2vRef} type="file" accept="image/*" onChange={onI2VFile} style={{ display: 'none' }} />
                                </>
                            )}

                            {/* §2 — Prompt Area */}
                            <div className="vm-prompt" style={{ position: 'relative' }}>
                                <textarea
                                    ref={promptRef}
                                    className="vm-textarea"
                                    value={prompt}
                                    onChange={handlePromptChange}
                                    placeholder={videoMode === 'i2v'
                                        ? 'Describe the motion... e.g. "Camera slowly zooms in, product rotates 360°"'
                                        : activeBrand?.name
                                            ? `What's your ${activeBrand.name} ad about? Type @ to tag assets...`
                                            : 'What\'s your ad about? Type @ to tag images, video, audio...'}
                                />
                                {/* @ Autocomplete popup */}
                                {showAutocomplete && acItems.length > 0 && (
                                    <div className="vm-autocomplete">
                                        {acItems.map(item => (
                                            <button key={item.tag} className="vm-ac-item" onClick={() => insertTag(item.tag)}>
                                                {item.thumb ? <img src={item.thumb} alt="" /> : <span className="icon"><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{item.msIcon || 'attach_file'}</span></span>}
                                                <span>{item.tag}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* §3 — Asset Tags (shows attached files) */}
                            {allTags.length > 0 && (
                                <div className="vm-tags">
                                    {allTags.map(tag => (
                                        <div key={tag.id} className={`vm-tag ${tag.linked ? 'linked' : ''}`}>
                                            {tag.thumb ? <img src={tag.thumb} alt="" /> : <span className="icon"><span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{tag.type === 'video' ? 'video_file' : tag.type === 'audio' ? 'audio_file' : 'attach_file'}</span></span>}
                                            <span>{tag.label}</span>
                                            {tag.linked && <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#4ade80' }}>link</span>}
                                            {tag.name && <span style={{ fontSize: 10, color: '#64748b' }}>{tag.name.length > 12 ? tag.name.slice(0, 12) + '…' : tag.name}</span>}
                                            {tag.uploading && <span className="uploading">uploading…</span>}
                                            <button onClick={() => removeTag(tag)}>×</button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* §4 — Asset Dock (compact icon buttons) */}
                            <div className="vm-dock">
                                {dockButtons.map(btn => (
                                    <button key={btn.key} className={`vm-dock-btn ${btn.has ? 'has' : ''}`} onClick={btn.action} title={btn.label}>
                                        <span className="material-symbols-outlined">{btn.msIcon}</span> {btn.label}
                                    </button>
                                ))}

                                {/* AI First Frame button */}
                                {m.has.firstFrame && videoMode === 't2v' && !firstFrame && (
                                    <>
                                        <div className="vm-dock-sep" />
                                        <button className="vm-dock-btn ai" onClick={generateFirstFrame} disabled={generatingFrame || !prompt.trim()}>
                                            {generatingFrame ? <span className="material-symbols-outlined vm-spin" style={{ fontSize: '14px' }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>auto_awesome</span>} AI Frame
                                        </button>
                                    </>
                                )}

                                {/* Library button */}
                                {m.has.refImages && (
                                    <>
                                        <div className="vm-dock-sep" />
                                        <button className="vm-dock-btn" onClick={() => loadLibrary('ref')}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>photo_library</span> Library
                                        </button>
                                    </>
                                )}

                                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569' }}>{prompt.length} chars</span>
                            </div>

                            {/* Hidden file inputs */}
                            <input ref={firstFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setFirstFrame)} style={{ display: 'none' }} />
                            <input ref={lastFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setLastFrame)} style={{ display: 'none' }} />
                            <input ref={refImgRef} type="file" accept="image/*" onChange={onRefFile} style={{ display: 'none' }} />
                            <input ref={refVideoRef} type="file" accept="video/*" onChange={e => onMediaFile(e, setRefVideo)} style={{ display: 'none' }} />
                            <input ref={refAudioRef} type="file" accept="audio/*" onChange={e => onMediaFile(e, setRefAudio)} style={{ display: 'none' }} />

                            {/* Library Modal (inline) */}
                            {showLibrary && (
                                <div className="vm-library">
                                    <div className="vm-library-head">
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span> Image Library</span>
                                        <button onClick={() => setShowLibrary(false)}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                        </button>
                                    </div>
                                    {libraryLoading ? <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '12px 0' }}>Loading...</p>
                                        : libraryImages.length === 0 ? <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '12px 0' }}>No images yet</p>
                                            : <div className="vm-library-grid">{libraryImages.map((img, i) => <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => pickFromLibrary(img)} />)}</div>
                                    }
                                </div>
                            )}

                            {/* §5 — Config Bar (inline compact) */}
                            <div className="vm-config">
                                <ConfigDropdown
                                    value={model}
                                    onChange={setModel}
                                    options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, msIcon: mod.msIcon }))}
                                    label="Model"
                                />
                                <ConfigDropdown
                                    value={aspectRatio}
                                    onChange={setAspectRatio}
                                    options={m.ratios.map(r => ({ value: r, label: r }))}
                                    label="Ratio"
                                />
                                <ConfigDropdown
                                    value={duration}
                                    onChange={setDuration}
                                    options={Array.from({ length: m.dur[1] - m.dur[0] + 1 }, (_, i) => m.dur[0] + i).map(d => ({ value: d, label: `${d}s` }))}
                                    label="Duration"
                                />
                                <button className={`vm-quality-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>bolt</span> Fast</button>
                                <button className={`vm-quality-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>auto_awesome</span> Quality</button>
                            </div>

                            {/* §6 — Bottom bar (Enhance + Generate) */}
                            <div className="vm-bottom">
                                <CreditTooltipWrapper action="promptEnhance">
                                    <button className="vm-enhance" onClick={handleEnhance} disabled={enhancing || !prompt.trim()}>
                                        {enhancing ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: '14px' }}>progress_activity</span> Enhancing...</>
                                            : <><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>auto_awesome</span> Enhance</>}
                                    </button>
                                </CreditTooltipWrapper>

                                {videoMode === 'i2v' ? (
                                    <button className="vm-generate" onClick={handleI2VGenerate} disabled={loading || !i2vImage?.url}>
                                        {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: '16px' }}>progress_activity</span> Animating...</>
                                            : <><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>animation</span> Animate · {credits} cr</>}
                                    </button>
                                ) : (
                                    <button className="vm-generate" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
                                        {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: '16px' }}>progress_activity</span> Submitting...</>
                                            : <><span className="material-symbols-outlined" style={{ fontSize: '18px' }}>movie_creation</span> Generate · {credits} cr · ~2 min</>}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

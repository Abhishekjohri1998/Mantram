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

/* ── Models — Expanded definitions with Multi-shot support ── */
const MODELS = {
    'kling-3.0-o': { id: 'kling-3.0-o', name: 'Kling 3.O Omni', msIcon: 'all_inclusive', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true, multishot: true, refImages: true, refVideo: true, refAudio: true }, cost: 0.12, desc: "Ultimate cinematic omni-model. Supports multi-shot & native audio." },
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', durs: [5, 10, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true, quality: true }, cost: 0.08, desc: "Best for Lip-Sync and precise motion tracking." },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true }, cost: 0.07, desc: "High realistic generation with Fast and Pro options." },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', durs: [5], ratios: ['16:9', '9:16'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true, quality: true }, cost: 0.10, desc: "Incredible Cinematic physics. Fast and Pro options." },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', durs: [5], ratios: ['16:9', '9:16', '1:1', '4:3'], has: { firstFrame: true, lastFrame: true }, cost: 0.05, desc: "Cost-effective, reliable motion." },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', durs: [5, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true }, cost: 0.08, desc: "Ultra-fast text-to-video capabilities without reference locks." }
}

const css = `
/* Layout */
.vm-layout { position: relative; min-height: calc(100vh - 120px); display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 24px; overflow: hidden; align-items: center; }

/* Background Grid */
.vm-bg-grid { position: absolute; inset: -20px; z-index: 0; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: minmax(180px, auto); gap: 8px; pointer-events: none; opacity: 0.8; }
@media(max-width: 1024px) { .vm-bg-grid { grid-template-columns: repeat(3, 1fr); } }
@media(max-width: 768px) { .vm-bg-grid { grid-template-columns: repeat(2, 1fr); } }
.vm-bg-item { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; opacity: 1.0; transition: opacity .3s, transform .5s; position: relative; overflow: hidden; pointer-events: auto; }
.vm-bg-item video { width: 100%; height: 100%; object-fit: cover; }
.vm-bg-item:hover { transform: scale(1.02); z-index: 2; border: 2px solid var(--sys-primary); }
.vm-bg-overlay { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(to top, var(--sys-surface) 5%, transparent 50%, var(--sys-surface) 95%); }

/* Scott Panel (Director Card) */
.vm-card { width: 95%; max-width: 900px; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; padding: 0; backdrop-filter: blur(30px); box-shadow: 0 30px 60px rgba(0,0,0,0.2); z-index: 10; display: flex; flex-direction: column; color: var(--sys-text); overflow: visible; font-family: 'Inter', sans-serif; }

/* Panel Header */
.vm-card-header { padding: 12px 20px; border-bottom: 1px solid var(--sys-border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: var(--sys-text); border-radius: 20px 20px 0 0; background: rgba(0,0,0,0.1); }
.vm-card-header .drag-handle { width: 30px; height: 4px; border-radius: 2px; background: var(--sys-border); margin: 0 auto; position: absolute; left: 50%; transform: translateX(-50%); }

/* Modes */
.vm-modes { display: flex; border-bottom: 1px solid var(--sys-border); }
.vm-mode-btn { flex: 1; padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--sys-text-muted); cursor: pointer; border: none; background: none; transition: all .2s; }
.vm-mode-btn:hover { color: var(--sys-text); background: rgba(255,255,255,0.02); }
.vm-mode-btn.active { color: var(--sys-text); background: rgba(255, 77, 0,0.08); border-bottom: 2px solid var(--sys-primary); }

/* Upper Controls (Thumbnails & Quality) */
.vm-upper-controls { padding: 16px 24px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--sys-border); background: rgba(0,0,0,0.05); }
.vm-thumb-group { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.vm-thumb-box { width: 48px; height: 48px; border-radius: 12px; border: 1px dashed var(--sys-border); background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; overflow: hidden; transition: all .2s; }
.vm-thumb-box:hover { border-color: var(--sys-primary); background: rgba(0,0,0,0.2); }
.vm-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
.vm-thumb-label { font-size: 10px; font-weight: 700; color: var(--sys-text-muted); margin-top: 4px; text-transform: uppercase; }

.vm-quality-group { display: flex; align-items: center; gap: 6px; margin-left: auto; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 10px; border: 1px solid var(--sys-border); }
.vm-quality-pill { padding: 6px 12px; border-radius: 7px; font-size: 11px; font-weight: 700; cursor: pointer; border: none; background: transparent; color: var(--sys-text-muted); transition: all .2s; display: flex; align-items: center; gap: 4px; }
.vm-quality-pill.active { background: var(--sys-surface-glass); color: var(--sys-text); border: 1px solid var(--sys-border); }

/* Prompt area */
.vm-prompt { padding: 16px 24px 0; position: relative; flex: 1; }
.vm-textarea { width: 100%; background: transparent; border: none; outline: none; resize: none; color: var(--sys-text); font-size: 15px; line-height: 1.6; font-family: inherit; min-height: 90px; font-weight: 500; }
.vm-textarea::placeholder { color: var(--sys-text-muted); font-weight: 400; opacity: 0.6; }

/* Config Modules */
.vm-config-trigger { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); transition: all .15s; }
.vm-config-trigger:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.02); }
.vm-config-menu { position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 140px; max-height: 220px; overflow-y: auto; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 12px; padding: 4px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,0.6); transform-origin: bottom left; }

/* Tags */
.vm-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 8px; background: rgba(255, 77, 0,0.08); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }

/* Bottom Bar */
.vm-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--sys-border); background: rgba(0,0,0,0.1); border-radius: 0 0 20px 20px; }
.vm-bottom-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }
.vm-btn-icon-label { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: transparent; border: none; color: var(--sys-text-muted); cursor: pointer; font-size: 12px; font-weight: 600; border-radius: 8px; transition: 0.2s; }
.vm-btn-icon-label:hover { color: var(--sys-text); background: rgba(255,255,255,0.05); }

.vm-generate { padding: 12px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; color: #111; background: #eab308; box-shadow: 0 0 20px rgba(234,179,8,0.3); transition: all .2s; flex-shrink: 0; }
.vm-generate:hover { transform: translateY(-1px); box-shadow: 0 0 25px rgba(234,179,8,0.5); background: #fde047; }
.vm-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }

/* Status overlays */
.vm-gen-card { max-width: 600px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); margin: 0 auto; }
.vm-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: var(--sys-border); overflow: hidden; }
.vm-progress-fill { height: 100%; border-radius: 3px; background: #eab308; transition: width 1s ease; }

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
    const [model, setModel] = useState('kling-3.0-o')
    const [prompt, setPrompt] = useState('')
    const [shots, setShots] = useState([{ prompt: '' }])
    const [viewVideo, setViewVideo] = useState(null)
    const [duration, setDuration] = useState(5)
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('fast')
    const [phase, setPhase] = useState('compose')
    const [videoMode, setVideoMode] = useState('t2v')
    const [i2vImage, setI2vImage] = useState(null)
    const [extending, setExtending] = useState(false)
    const [showExtendPanel, setShowExtendPanel] = useState(false)
    const [extendPrompt, setExtendPrompt] = useState('')
    const [extendDuration, setExtendDuration] = useState(5)
    
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
    const i2vRef = useRef(null)
    const promptRef = useRef(null)
    const pollRef = useRef(null)

    const m = MODELS[model] || MODELS['kling-3.0-o']
    const credits = Math.max(Math.ceil(m.cost * (quality === 'quality' ? 2 : 1) * duration * 70), 5)

    // ── Persistence ──
    useEffect(() => {
        const saved = localStorage.getItem('mantram_vm_state_v2')
        if (saved) {
            try {
                const state = JSON.parse(saved)
                if (state.projectId) setProjectId(state.projectId)
                if (state.phase) {
                    setPhase(state.phase)
                    if (state.phase === 'generating' && state.projectId) startPolling(state.projectId)
                }
                if (state.prompt) setPrompt(state.prompt)
                if (state.model) setModel(state.model)
                if (state.shots) setShots(state.shots)
            } catch (e) { console.warn('VM state restore failed:', e) }
        }
    }, [])

    useEffect(() => {
        const state = { projectId, phase, prompt, model, shots, duration, aspectRatio, quality, videoMode, generation }
        localStorage.setItem('mantram_vm_state_v2', JSON.stringify(state))
    }, [projectId, phase, prompt, model, shots, duration, aspectRatio, quality, videoMode, generation])

    useEffect(() => {
        if (!m.has.lastFrame) setLastFrame(null)
        if (!m.has.refImages) setRefImages([])
        if (!m.has.refVideo) setRefVideo(null)
        if (!m.has.refAudio) setRefAudio(null)
    }, [model])

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // ── Handlers ──
    async function uploadImage(base64) {
        try {
            const d = await api('/video-studio/upload-image', { method: 'POST', body: JSON.stringify({ imageData: base64 }) })
            return d.url || base64
        } catch { return base64 }
    }

    async function handleGenerate() {
        const currentPrompt = m.has.multishot ? shots.map(s => s.prompt).join(' | ') : prompt.trim()
        if (!currentPrompt) { setError('Write your ad idea first'); return }
        setLoading(true); setError('')
        try {
            const d = await api('/video-studio/advanced/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: currentPrompt, model, duration, resolution: '1080p', aspectRatio,
                    firstImageUrl: firstFrame?.url || '',
                    lastImageUrl: lastFrame?.url || '',
                    generateAudio: !!m.has.audio, qualityMode: quality,
                    brandId: activeBrand?._id || null,
                    referenceImages: refImages.map(r => r.url).filter(Boolean),
                    shots: m.has.multishot ? shots : []
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    async function handleI2VGenerate() {
        if (!i2vImage?.url) { setError('Upload an image first'); return }
        setLoading(true); setError('')
        try {
            const d = await api('/video-studio/advanced/image-to-video', {
                method: 'POST',
                body: JSON.stringify({
                    imageUrl: i2vImage.url, prompt: prompt.trim() || 'Animate this image',
                    duration, aspectRatio, qualityMode: quality, brandId: activeBrand?._id || null,
                    referenceImages: refImages.map(r => r.url).filter(Boolean),
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    const startPolling = useCallback((pid) => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const d = await api(`/video-studio/${pid}/status`)
                setGeneration(d.project.generation)
                if (['COMPLETED', 'FAILED'].includes(d.project.generation?.status) || d.project.status === 'critique') {
                    clearInterval(pollRef.current); setPhase('done')
                }
            } catch { }
        }, 5000)
    }, [])

    async function handleEnhance() {
        if (!prompt.trim()) return
        setEnhancing(true)
        try {
            const d = await api('/video-studio/enhance-prompt', { method: 'POST', body: JSON.stringify({ prompt, model, brandId: activeBrand?._id }) })
            if (m.has.multishot) { let n = [...shots]; n[0].prompt = d.enhancedPrompt; setShots(n); }
            else setPrompt(d.enhancedPrompt)
        } catch (e) { setError(e.message) }
        setEnhancing(false)
    }

    function handlePromptChange(e) {
        const val = e.target.value
        if (m.has.multishot) { let n = [...shots]; n[0].prompt = val; setShots(n); }
        else setPrompt(val)
        
        const cursorPos = e.target.selectionStart
        if (val.substring(0, cursorPos).endsWith('@')) setShowAutocomplete(true)
        else setShowAutocomplete(false)
    }

    function insertTag(tag) {
        const field = m.has.multishot ? shots[0].prompt : prompt
        setPrompt(field + tag + ' ')
        setShowAutocomplete(false)
    }

    // Reuse Modal logic
    if (viewVideo) {
        return (
            <div className="vm-layout" style={{background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 1000}}>
                <div style={{maxWidth: 1000, width: '100%', position: 'relative', padding: 20}}>
                    <button style={{position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: '#fff', cursor: 'pointer'}} onClick={() => setViewVideo(null)}><span className="material-symbols-outlined" style={{fontSize: 28}}>close</span></button>
                    <video src={viewVideo.generation?.videoUrl} controls autoPlay style={{width: '100%', borderRadius: 16, border: '1px solid var(--sys-border)'}} />
                    <div style={{display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center'}}>
                        <button className="vm-generate" onClick={() => { setModel(viewVideo.generation?.model||'kling-3.0-o'); setPrompt(viewVideo.generation?.prompt||''); setViewVideo(null); }}><span className="material-symbols-outlined">auto_fix_high</span> Reuse Settings</button>
                        <button className="vm-config-trigger" style={{background: 'var(--sys-surface-glass)'}} onClick={() => navigator.clipboard.writeText(viewVideo.generation?.prompt)}><span className="material-symbols-outlined">content_copy</span> Copy Prompt</button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="vm-studio-root" style={{ width: '100%', minHeight: 'calc(100vh - 80px)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <style>{css}</style>
            
            {/* Ambient Background Grid */}
            <div className="vm-bg-grid">
                 {bgProjects.map((p, i) => (
                      <div key={p._id || i} className="vm-bg-item" onClick={() => setViewVideo(p)} style={{ cursor: 'pointer' }}>
                           <video 
                                src={p.generation?.videoUrl} 
                                muted loop playsInline crossOrigin="anonymous"
                                onMouseOver={e => e.target.play()}
                                onMouseOut={e => { e.target.pause(); e.target.currentTime = 1; }}
                           />
                      </div>
                 ))}
                 {[...Array(Math.max(0, 12 - bgProjects.length))].map((_, i) => (
                      <div key={`empty-${i}`} className="vm-bg-item" style={{ background: 'rgba(0,0,0,0.02)', border: '1px dashed var(--sys-border)' }} />
                 ))}
            </div>
            <div className="vm-bg-overlay" />

            {phase === 'generating' && (
                <div className="vm-layout">
                    <div className="vm-gen-card">
                        <div className="vm-gen-info">
                            <p style={{ fontSize: '14px', marginBottom: 12 }}><span className="material-symbols-outlined vm-spin" style={{ fontSize: '16px', color: '#eab308' }}>progress_activity</span> Syncing with director — {generation?.progress || 5}%</p>
                            <div className="vm-progress-bar"><div className="vm-progress-fill" style={{ width: `${generation?.progress || 5}%` }} /></div>
                        </div>
                    </div>
                </div>
            )}

            {phase === 'done' && (
                <div className="vm-layout">
                    <div className="vm-done-card"><video controls src={generation?.videoUrl} /></div>
                    <div className="vm-done-btns">
                        <button className="vm-btn-sec" onClick={() => setPhase('compose')}>Edit & Retry</button>
                        <a href={generation?.videoUrl} download className="vm-btn-pri">Download</a>
                    </div>
                </div>
            )}

            {phase === 'compose' && (
                <div className="vm-layout">
                    <div className="vm-card">
                        <div className="vm-card-header">
                            <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                <span className="material-symbols-outlined" style={{fontSize: 16, color: '#eab308'}}>movie_creation</span> Scott Panel
                            </span>
                            <div style={{display: 'flex', gap: 12}}>
                                <button style={{background: 'none', border: 'none', color: videoMode === 't2v' ? '#fff' : '#666', cursor: 'pointer', fontWeight: 600}} onClick={() => setVideoMode('t2v')}>T2V</button>
                                <button style={{background: 'none', border: 'none', color: videoMode === 'i2v' ? '#fff' : '#666', cursor: 'pointer', fontWeight: 600}} onClick={() => setVideoMode('i2v')}>I2V</button>
                            </div>
                        </div>

                        <div className="vm-upper-controls">
                            <div style={{fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)', marginBottom: 4}}>💡 {m.desc}</div>
                            <div className="vm-thumb-group">
                                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                    <div className="vm-thumb-box" onClick={() => videoMode === 'i2v' ? i2vRef.current.click() : firstFrameRef.current.click()}>
                                        {(videoMode === 'i2v' && i2vImage) ? <img src={i2vImage.url} /> : (firstFrame ? <img src={firstFrame.url} /> : <span className="material-symbols-outlined">image</span>)}
                                    </div>
                                    <span className="vm-thumb-label">Start</span>
                                </div>
                                {m.has.lastFrame && (
                                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                        <div className="vm-thumb-box" onClick={() => lastFrameRef.current.click()}>
                                            {lastFrame ? <img src={lastFrame.url} /> : <span className="material-symbols-outlined">image</span>}
                                        </div>
                                        <span className="vm-thumb-label">End</span>
                                    </div>
                                )}
                                <div className="vm-quality-group">
                                    <button className={`vm-quality-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}>Fast</button>
                                    <button className={`vm-quality-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}>Pro</button>
                                </div>
                            </div>
                        </div>

                        <div className="vm-prompt">
                            <div style={{ position: 'relative' }}>
                                <div 
                                    className="vm-textarea" 
                                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflow: 'hidden' }}
                                    dangerouslySetInnerHTML={{ __html: (m.has.multishot ? shots[0].prompt : prompt).replace(/(@image\d+|@video\d+|@audio\d+)/g, '<span style="color: var(--sys-primary)">$1</span>') }}
                                />
                                <textarea
                                    ref={promptRef}
                                    className="vm-textarea"
                                    value={m.has.multishot ? shots[0].prompt : prompt}
                                    onChange={handlePromptChange}
                                    style={{ position: 'relative', background: 'transparent', color: 'transparent', caretColor: '#fff' }}
                                    placeholder="Action starts here... Use @ to tag images."
                                />
                            </div>
                            
                            {m.has.multishot && (
                                <div style={{marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16}}>
                                    {shots.slice(1).map((s, idx) => (
                                        <div key={idx} style={{display: 'flex', gap: 8}}>
                                            <input className="vm-textarea" style={{minHeight: '40px', flex:1, borderBottom: '1px solid #333'}} value={s.prompt} onChange={(e) => { const n = [...shots]; n[idx+1].prompt = e.target.value; setShots(n); }} placeholder={`Shot ${idx+2} Prompt`} />
                                            <button onClick={() => setShots(shots.filter((_, i) => i !== idx+1))} style={{background:'none', border:'none', color:'#f44'}}><span className="material-symbols-outlined">delete</span></button>
                                        </div>
                                    ))}
                                    {shots.length < 5 && <button className="vm-btn-icon-label" onClick={() => setShots([...shots, {prompt: ''}])}>+ Add Shot</button>}
                                </div>
                            )}
                        </div>

                        <div className="vm-bottom">
                            <div className="vm-bottom-left">
                                <ConfigDropdown value={model} onChange={setModel} options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, msIcon: mod.msIcon }))} />
                                <ConfigDropdown value={aspectRatio} onChange={setAspectRatio} options={m.ratios.map(r => ({ value: r, label: r }))} />
                                <ConfigDropdown value={duration} onChange={setDuration} options={(m.durs || [5]).map(d => ({ value: d, label: `${d}s` }))} />
                            </div>
                            <div style={{display: 'flex', gap: 12}}>
                                <button className="vm-btn-icon-label" onClick={handleEnhance} disabled={enhancing}><span className="material-symbols-outlined">auto_awesome</span> Enhance</button>
                                <button className="vm-generate" onClick={videoMode === 'i2v' ? handleI2VGenerate : handleGenerate} disabled={loading}>{loading ? 'Generating...' : 'GENERATE'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <input ref={firstFrameRef} type="file" style={{display:'none'}} onChange={e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload=async()=>{ const h=await uploadImage(r.result); setFirstFrame({url:h}) }; r.readAsDataURL(f) } }} />
            <input ref={lastFrameRef} type="file" style={{display:'none'}} onChange={e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload=async()=>{ const h=await uploadImage(r.result); setLastFrame({url:h}) }; r.readAsDataURL(f) } }} />
            <input ref={i2vRef} type="file" style={{display:'none'}} onChange={e => { const f = e.target.files[0]; if(f) { const r = new FileReader(); r.onload=async()=>{ const h=await uploadImage(r.result); setI2vImage({url:h}) }; r.readAsDataURL(f) } }} />
        </div>
    )
}

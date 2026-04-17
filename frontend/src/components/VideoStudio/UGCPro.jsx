import { useState, useCallback, useRef, useEffect } from 'react'
import { CreditTooltipWrapper } from '../CreditBadge'

const API = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    return fetch(`${API}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    }).then(async r => {
        const ct = r.headers.get('content-type') || ''
        if (!ct.includes('application/json')) throw new Error(`Server returned ${r.status}`)
        const data = await r.json()
        if (!data.success) throw new Error(data.error || 'Request failed')
        return data
    })
}

async function apiJson(path, body) {
    return api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
}

/* ── Constants ── */
const STYLES = [
    { id: 'review',      label: 'Review',        msIcon: 'search' },
    { id: 'unboxing',    label: 'Unboxing',      msIcon: 'package_2' },
    { id: 'testimonial', label: 'Testimonial',   msIcon: 'star' },
    { id: 'demo',        label: 'Product Demo',  msIcon: 'videocam' },
    { id: 'lifestyle',   label: 'Lifestyle',     msIcon: 'sunny' },
]
const MOODS = [
    { id: 'authentic', label: 'Authentic' }, { id: 'excited', label: 'Excited' },
    { id: 'calm', label: 'Calm' }, { id: 'luxury', label: 'Luxury' }, { id: 'playful', label: 'Playful' },
]
const ENVIRONMENTS = [
    { id: 'home', label: 'Home', msIcon: 'home' }, { id: 'outdoor', label: 'Outdoor', msIcon: 'park' },
    { id: 'studio', label: 'Studio', msIcon: 'mic' }, { id: 'cafe', label: 'Cafe', msIcon: 'local_cafe' },
    { id: 'gym', label: 'Gym', msIcon: 'fitness_center' }, { id: 'office', label: 'Office', msIcon: 'work' },
]
const HOOKS = [
    { id: 'bold_claim', label: 'Bold Claim' }, { id: 'question', label: 'Question' },
    { id: 'story', label: 'Story' }, { id: 'shock', label: 'Shock' },
]
const LANGUAGES = [
    { id: 'english', label: 'English' }, { id: 'spanish', label: 'Spanish' },
    { id: 'hindi', label: 'Hindi' }, { id: 'chinese', label: 'Chinese' },
    { id: 'french', label: 'French' }, { id: 'german', label: 'German' },
]

/* ── Inline CSS matching Advanced Mode's Scott Panel ── */
const css = `
.ugc-root { --sys-surface-glass: color-mix(in srgb, var(--sys-surface) 85%, transparent); position: relative; width: 100%; min-height: calc(100vh - 80px); display: flex; flex-direction: column; }
.ugc-layout { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 50; display: flex; flex-direction: column; align-items: center; padding: 0 16px 24px 16px; pointer-events: none; }
.ugc-layout * { pointer-events: auto; }
.ugc-card { margin-top: auto; width: 100%; max-width: 860px; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 24px; backdrop-filter: blur(36px); box-shadow: 0 15px 40px rgba(0,0,0,0.15); z-index: 10; display: flex; flex-direction: column; color: var(--sys-text); font-family: 'Inter', sans-serif; max-height: calc(100vh - 100px); overflow-y: auto; overflow-x: hidden; }
.ugc-card::-webkit-scrollbar { width: 4px; }
.ugc-card::-webkit-scrollbar-track { background: transparent; }
.ugc-card::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
.ugc-header { padding: 6px 16px; border-bottom: 1px solid var(--sys-border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 12px; }
.ugc-upper { padding: 8px 16px; display: flex; gap: 8px; border-bottom: 1px solid var(--sys-border); align-items: center; flex-wrap: nowrap; overflow-x: auto; }
.ugc-thumb { width: 40px; height: 40px; border-radius: 10px; border: 1px dashed var(--sys-border); background: var(--sys-surface); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; flex-shrink: 0; transition: all .2s; position: relative; }
.ugc-thumb:hover { border-color: var(--sys-primary); background: color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface)); }
.ugc-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ugc-thumb-label { font-size: 8px; font-weight: 600; color: var(--sys-text-muted); text-align: center; margin-top: 2px; }
.ugc-pills { display: flex; gap: 3px; background: color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface)); padding: 2px; border-radius: 8px; border: 1px solid var(--sys-border); }
.ugc-pill { padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: var(--sys-text-muted); transition: all .2s; }
.ugc-pill.active { background: var(--sys-surface-glass); color: var(--sys-text); box-shadow: 0 2px 8px rgba(0,0,0,0.15); border: 1px solid var(--sys-border); }
.ugc-prompt { padding: 0; margin: 0 16px 8px; position: relative; }
.ugc-prompt-row { display: flex; gap: 8px; align-items: flex-end; }
.ugc-prompt-box { padding: 8px 12px; background: color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface)); border-radius: 10px; border: 1px solid var(--sys-border); flex: 1; transition: border-color .2s; }
.ugc-prompt-box:focus-within { border-color: var(--sys-primary); }
.ugc-textarea { width: 100%; background: transparent; border: none; outline: none; resize: vertical; color: var(--sys-text); font-size: 14px; line-height: 1.5; font-family: inherit; min-height: 56px; max-height: 200px; font-weight: 500; }
.ugc-textarea::placeholder { color: var(--sys-text-muted); opacity: 0.7; }
.ugc-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 16px; border-top: 1px solid var(--sys-border); flex-wrap: wrap; }
.ugc-bottom-left { display: flex; align-items: center; gap: 4px; flex: 1; flex-wrap: wrap; }
.ugc-cfg-btn { display: flex; align-items: center; gap: 3px; padding: 4px 8px; background: transparent; border: 1px solid transparent; color: var(--sys-text); cursor: pointer; font-size: 11px; font-weight: 600; border-radius: 8px; transition: 0.2s; white-space: nowrap; }
.ugc-cfg-btn:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }
.ugc-generate { padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; display: flex; align-items: center; gap: 6px; color: var(--sys-surface); background: var(--sys-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: all .2s; flex-shrink: 0; }
.ugc-generate:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); opacity: 0.9; }
.ugc-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }
.ugc-err { margin: 6px 16px; padding: 8px 12px; border-radius: 10px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.ugc-settings-panel { padding: 10px 16px; border-bottom: 1px solid var(--sys-border); display: flex; flex-wrap: wrap; gap: 10px; }
.ugc-settings-group { display: flex; flex-direction: column; gap: 4px; }
.ugc-settings-label { font-size: 9px; font-weight: 700; color: var(--sys-text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.ugc-video-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 24px; padding-bottom: 320px; }
@media(max-width: 768px) { .ugc-video-grid { grid-template-columns: repeat(2, 1fr); } }
.ugc-video-card { aspect-ratio: 9/16; border-radius: 12px; overflow: hidden; position: relative; background: var(--sys-surface); border: 1px solid var(--sys-border); }
.ugc-video-card video { width: 100%; height: 100%; object-fit: cover; }
.ugc-video-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%); opacity: 0; transition: opacity .3s; display: flex; flex-direction: column; justify-content: flex-end; padding: 12px; gap: 6px; }
.ugc-video-card:hover .ugc-video-overlay { opacity: 1; }
.ugc-gen-card { aspect-ratio: 9/16; border-radius: 12px; overflow: hidden; position: relative; background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.08)); border: 1px solid rgba(168,85,247,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; animation: ugc-pulse 2s ease-in-out infinite; }
@keyframes ugc-pulse { 0%,100% { border-color: rgba(168,85,247,0.3); } 50% { border-color: rgba(168,85,247,0.7); } }
.ugc-gen-thumb { position: absolute; inset: 0; }
.ugc-gen-thumb img { width: 100%; height: 100%; object-fit: cover; opacity: 0.2; }
.ugc-product-input { margin: 6px 16px; padding: 6px 10px; border-radius: 8px; background: rgba(168,85,247,0.06); border: 1px solid rgba(168,85,247,0.15); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ugc-product-input input { flex: 1; min-width: 200px; background: transparent; border: none; outline: none; color: var(--sys-text); font-size: 12px; font-weight: 500; }
.ugc-product-input input::placeholder { color: var(--sys-text-muted); }
`

/* ── Dropdown (matches Advanced Mode ConfigDropdown) ── */
function Dropdown({ value, onChange, options, label }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])
    const sel = options.find(o => o.value === value) || options[0]
    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button type="button" className="ugc-cfg-btn" onClick={() => setOpen(!open)}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{sel?.icon || 'tune'}</span>
                <span>{sel?.label}</span>
                <span className="material-symbols-outlined" style={{ fontSize: 14, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            </button>
            {open && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, minWidth: 160, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 12, padding: 6, zIndex: 200, boxShadow: '0 12px 30px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {options.map(o => (
                        <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: 12, cursor: 'pointer', textAlign: 'left', transition: 'all .2s', background: o.value === value ? 'color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface))' : 'transparent', color: o.value === value ? 'var(--sys-text)' : 'var(--sys-text-muted)' }}>
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function UGCPro({ activeBrand, projects = [] }) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [avatarGenerating, setAvatarGenerating] = useState(false)

    // History sync from parent props
    const [gridVideos, setGridVideos] = useState(() => {
        return projects.filter(p => p.studioMode === 'ugc-pro' && (p.status === 'done' || p.status === 'completed') && p.generation?.videoUrl)
    })

    useEffect(() => {
        setGridVideos(prev => {
            const existingIds = new Set(prev.map(p => p._id))
            const incoming = projects.filter(p => p.studioMode === 'ugc-pro' && (p.status === 'done' || p.status === 'completed') && p.generation?.videoUrl)
            const newOnes = incoming.filter(p => !existingIds.has(p._id))
            return newOnes.length ? [...newOnes, ...prev] : prev
        })
    }, [projects])

    // Product
    const [productUrl, setProductUrl] = useState('')
    const [productData, setProductData] = useState(null)
    const [productImageUrls, setProductImageUrls] = useState([])
    const productRef = useRef(null)

    // Avatar
    const [avatarUrl, setAvatarUrl] = useState(null)
    const [avatarMode, setAvatarMode] = useState('upload') // 'upload' | 'generate'
    const [avatarDescription, setAvatarDescription] = useState('')
    const avatarRef = useRef(null)

    // Style settings
    const [style, setStyle] = useState('review')
    const [mood, setMood] = useState('authentic')
    const [environment, setEnvironment] = useState('home')
    const [hookStyle, setHookStyle] = useState('bold_claim')
    const [duration, setDuration] = useState(5)
    const [aspectRatio, setAspectRatio] = useState('9:16')
    const [language, setLanguage] = useState('english')
    const [cta, setCta] = useState('Shop now')
    const [showSettings, setShowSettings] = useState(false)

    // Prompt Preview
    const [promptText, setPromptText] = useState('')
    const [promptReady, setPromptReady] = useState(false)
    const [buildingPrompt, setBuildingPrompt] = useState(false)

    // Generation
    const [jobs, setJobs] = useState([]) // { id, requestId, prompt, avatarUrl, progress, status, videoUrl, error }
    const pollRefs = useRef({})
    const [creditEstimate, setCreditEstimate] = useState(null)

    useEffect(() => {
        api(`/video-studio/ugc-pro/credit-estimate?duration=${duration}`).then(d => setCreditEstimate(d)).catch(() => {})
    }, [duration])

    // Cleanup polls
    useEffect(() => () => { Object.values(pollRefs.current).forEach(clearInterval) }, [])

    const credits = creditEstimate?.credits || 15

    // ── Product Analysis (inline — triggered from upper controls) ──
    const analyzeProduct = useCallback(async () => {
        if (!productUrl.trim() && !productRef.current?.files?.length) return
        setAnalyzing(true); setError(null)
        try {
            const form = new FormData()
            if (productUrl.trim()) form.append('productUrl', productUrl)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            if (productRef.current?.files?.length) {
                for (const f of productRef.current.files) form.append('productImages', f)
            }
            const data = await api('/video-studio/ugc-pro/analyze-product', { method: 'POST', body: form, headers: {} })
            setProductData(data.productData)
            setProductImageUrls(data.productImageUrls || [])
            if (data.productData?.idealEnvironment) setEnvironment(data.productData.idealEnvironment)
        } catch (err) { setError(err.message) }
        setAnalyzing(false)
    }, [productUrl, activeBrand])

    // ── Avatar Upload ──
    const handleAvatarUpload = useCallback(async (file) => {
        setAvatarGenerating(true); setError(null)
        try {
            const form = new FormData()
            form.append('avatarImage', file)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const data = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: form, headers: {} })
            setAvatarUrl(data.avatarUrl)
        } catch (err) { setError(err.message) }
        setAvatarGenerating(false)
    }, [activeBrand])

    // ── Avatar AI Generate ──
    const generateAvatar = useCallback(async () => {
        if (!avatarDescription.trim()) return
        setAvatarGenerating(true); setError(null)
        try {
            const data = await apiJson('/video-studio/ugc-pro/generate-avatar', {
                brandId: activeBrand?._id, description: avatarDescription, environment,
            })
            setAvatarUrl(data.avatarUrl)
        } catch (err) { setError(err.message) }
        setAvatarGenerating(false)
    }, [avatarDescription, activeBrand, environment])

    // ── Build Prompt (Preview before generating) ──
    const handleBuildPrompt = useCallback(async () => {
        if (!avatarUrl) { setError('Upload or generate an avatar first'); return }
        if (!productData) { setError('Analyze a product first — paste a link or upload images'); return }
        setBuildingPrompt(true); setError(null); setPromptReady(false);
        try {
            const data = await apiJson('/video-studio/ugc-pro/build-prompt', {
                brandId: activeBrand?._id, productData, avatarUrl, productImageUrls,
                settings: { style, mood, environment, hookStyle, duration, aspectRatio, language, cta },
            })
            setPromptText(data.prompt)
            setPromptReady(true)
        } catch (err) { setError(err.message) }
        setBuildingPrompt(false)
    }, [activeBrand, productData, productImageUrls, avatarUrl, style, mood, environment, hookStyle, duration, aspectRatio, cta])

    // ── Generate Video ──
    const handleGenerate = useCallback(async () => {
        if (!avatarUrl) { setError('Upload or generate an avatar first'); return }
        if (!productData) { setError('Analyze a product first — paste a link or upload images'); return }
        setLoading(true); setError(null)
        const jobId = `ugc-${Date.now()}`
        const newJob = { id: jobId, requestId: null, prompt: promptText, avatarUrl, progress: 3, status: 'generating', videoUrl: null, error: null }
        setJobs(prev => [newJob, ...prev])
        setPromptReady(false) // Reset after generating so it collapses
        try {
            const data = await apiJson('/video-studio/ugc-pro/generate', {
                brandId: activeBrand?._id, productData, avatarUrl, productImageUrls, prebuiltPrompt: promptText,
                settings: { style, mood, environment, hookStyle, duration, aspectRatio, language, cta },
            })
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, requestId: data.requestId, prompt: data.prompt } : j))

            // Start polling
            pollRefs.current[jobId] = setInterval(async () => {
                try {
                    const status = await api(`/video-studio/ugc-pro/status/${data.requestId}`)
                    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: status.progress || j.progress } : j))
                    if (status.status === 'COMPLETED') {
                        clearInterval(pollRefs.current[jobId]); delete pollRefs.current[jobId]
                        setJobs(prev => prev.filter(j => j.id !== jobId))
                        setGridVideos(prev => [{ _id: jobId, generation: { videoUrl: status.videoUrl }, input: { productData } }, ...prev])
                    } else if (status.status === 'FAILED') {
                        clearInterval(pollRefs.current[jobId]); delete pollRefs.current[jobId]
                        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: status.error || 'Failed' } : j))
                    }
                } catch { /* keep polling */ }
            }, 5000)
        } catch (err) {
            setError(err.message)
            setJobs(prev => prev.filter(j => j.id !== jobId))
        }
        setLoading(false)
    }, [activeBrand, productData, productImageUrls, avatarUrl, style, mood, environment, hookStyle, duration, aspectRatio, cta])

    async function downloadVideo(url) {
        try {
            const resp = await fetch(url); const blob = await resp.blob()
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ugc-video.mp4'
            document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
        } catch { window.open(url, '_blank') }
    }

    const activeJobCount = jobs.filter(j => j.status === 'generating').length
    const canGenerate = activeJobCount < 3

    /* ═══════════════ RENDER ═══════════════ */
    return (
        <div className="ugc-root">
            <style>{css}</style>

            {/* ── Background: Completed Videos Grid ── */}
            <div className="ugc-video-grid">
                {/* Active generating jobs */}
                {jobs.filter(j => j.status === 'generating').map(job => (
                    <div key={job.id} className="ugc-gen-card">
                        {job.avatarUrl && <div className="ugc-gen-thumb"><img src={job.avatarUrl} alt="" /></div>}
                        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#a855f7', animation: 'ugc-pulse 2s infinite' }}>slow_motion_video</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Generating UGC...</span>
                            <div style={{ width: '80%', maxWidth: 120, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #a855f7, #ec4899)', width: `${job.progress}%`, transition: 'width 1.2s ease' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#a855f7' }}>{job.progress}%</span>
                        </div>
                        <button onClick={() => { clearInterval(pollRefs.current[job.id]); setJobs(prev => prev.filter(j => j.id !== job.id)) }}
                            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '2px 6px', fontSize: 10, zIndex: 5, display: 'flex', alignItems: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span></button>
                    </div>
                ))}

                {/* Failed jobs */}
                {jobs.filter(j => j.status === 'failed').map(job => (
                    <div key={job.id} className="ugc-gen-card" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }}>
                        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: 16 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444' }}>error</span>
                            <p style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>{job.error}</p>
                            <button onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))}
                                style={{ marginTop: 8, padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#fca5a5', cursor: 'pointer', fontSize: 10 }}>Dismiss</button>
                        </div>
                    </div>
                ))}

                {/* Completed videos from History */}
                {gridVideos.map(v => (
                    <div key={v._id} className="ugc-video-card">
                        <video src={v.generation?.videoUrl} muted loop playsInline onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0 }} />
                        <div className="ugc-video-overlay">
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{v.input?.productData?.productName || 'UGC Video'}</span>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <button onClick={() => downloadVideo(v.generation?.videoUrl)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none', color: '#fff', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span> Download
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Empty state */}
                {jobs.length === 0 && gridVideos.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', opacity: 0.4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--sys-text)' }}>person_play</span>
                        <p style={{ fontSize: 14, color: 'var(--sys-text)', marginTop: 12 }}>UGC Pro — Your Generated History</p>
                        <p style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 4 }}>Add product → Upload avatar → Generate</p>
                    </div>
                )}
            </div>

            {/* ── Floating Scott Panel ── */}
            <div className="ugc-layout">
                <div className="ugc-card">
                    {/* Header */}
                    <div className="ugc-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#a855f7' }}>person_play</span>
                            UGC Pro · Seedance 2.0
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {productData && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
                                    {productData.productName || 'Product'}
                                </span>
                            )}
                            {avatarUrl && (
                                <img src={avatarUrl} alt="" style={{ width: 22, height: 22, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--sys-border)' }} />
                            )}
                            <CreditTooltipWrapper credits={credits} label="UGC Pro">
                                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sys-text-muted)', padding: '2px 6px', borderRadius: 6, background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))' }}>{credits}c</span>
                            </CreditTooltipWrapper>
                        </div>
                    </div>

                    {/* Upper Controls — Product + Avatar thumbnails */}
                    <div className="ugc-upper">
                        {/* Product thumbnail */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div className="ugc-thumb" onClick={() => productRef.current?.click()}>
                                {productImageUrls[0] ? <img src={productImageUrls[0]} alt="" /> : (
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>inventory_2</span>
                                )}
                                <input ref={productRef} type="file" accept="image/*" multiple hidden
                                    onChange={e => { if (e.target.files?.length) analyzeProduct() }} />
                            </div>
                            <span className="ugc-thumb-label">Product</span>
                        </div>

                        {/* Avatar thumbnail */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div className="ugc-thumb" onClick={() => avatarRef.current?.click()}>
                                {avatarUrl ? <img src={avatarUrl} alt="" /> :
                                    avatarGenerating ? <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#a855f7', animation: 'ugc-pulse 1s infinite' }}>progress_activity</span> :
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>person</span>
                                }
                                <input ref={avatarRef} type="file" accept="image/*" hidden
                                    onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
                            </div>
                            <span className="ugc-thumb-label">Avatar</span>
                        </div>

                        {/* Style pills */}
                        <div className="ugc-pills" style={{ marginLeft: 'auto' }}>
                            {STYLES.map(s => (
                                <button key={s.id} className={`ugc-pill ${style === s.id ? 'active' : ''}`}
                                    onClick={() => setStyle(s.id)}><span className="material-symbols-outlined" style={{ fontSize: 13 }}>{s.msIcon}</span> {s.label}</button>
                            ))}
                        </div>
                    </div>

                    {/* Product URL Input Bar */}
                    <div className="ugc-product-input">
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#a855f7' }}>link</span>
                        <input value={productUrl} onChange={e => setProductUrl(e.target.value)}
                            placeholder="Paste product link (e.g. Shopify, Amazon, D2C)"
                            onKeyDown={e => { if (e.key === 'Enter') analyzeProduct() }} />
                        <button onClick={() => productRef.current?.click()}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add_photo_alternate</span>
                            {productImageUrls.length > 0 ? `${productImageUrls.length} img` : 'Upload'}
                        </button>
                        <button onClick={analyzeProduct} disabled={analyzing || (!productUrl.trim() && !productRef.current?.files?.length)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: analyzing ? 'rgba(168,85,247,0.2)' : 'rgba(168,85,247,0.15)', color: '#a855f7', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                            {analyzing ? <span className="material-symbols-outlined" style={{ fontSize: 12, animation: 'ugc-pulse 1s infinite' }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>search</span>}
                            {analyzing ? 'Analyzing...' : 'Analyze'}
                        </button>
                    </div>

                    {/* Product image warning */}
                    {productData && productImageUrls.length === 0 && (
                        <div style={{ margin: '0 16px 4px', padding: '4px 10px', borderRadius: 6, background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', fontSize: 10, color: '#eab308', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                            No product image found. Upload a product photo for better results — Seedance will use it as @image2.
                            <button onClick={() => productRef.current?.click()}
                                style={{ marginLeft: 'auto', padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(234,179,8,0.2)', color: '#eab308', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>Upload</button>
                        </div>
                    )}

                    {/* Settings Panel (collapsible) */}
                    {showSettings && (
                        <div className="ugc-settings-panel">
                            <div className="ugc-settings-group">
                                <span className="ugc-settings-label">Mood</span>
                                <div className="ugc-pills">
                                    {MOODS.map(m => (
                                        <button key={m.id} className={`ugc-pill ${mood === m.id ? 'active' : ''}`} onClick={() => setMood(m.id)}>{m.label}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="ugc-settings-group">
                                <span className="ugc-settings-label">Environment</span>
                                <div className="ugc-pills">
                                    {ENVIRONMENTS.map(e => (
                                        <button key={e.id} className={`ugc-pill ${environment === e.id ? 'active' : ''}`} onClick={() => setEnvironment(e.id)}><span className="material-symbols-outlined" style={{ fontSize: 12 }}>{e.msIcon}</span> {e.label}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="ugc-settings-group">
                                <span className="ugc-settings-label">Hook</span>
                                <div className="ugc-pills">
                                    {HOOKS.map(h => (
                                        <button key={h.id} className={`ugc-pill ${hookStyle === h.id ? 'active' : ''}`} onClick={() => setHookStyle(h.id)}>{h.label}</button>
                                    ))}
                                </div>
                            </div>
                            {/* Avatar AI Gen */}
                            <div className="ugc-settings-group" style={{ minWidth: 200 }}>
                                <span className="ugc-settings-label">AI Avatar (NanoBanana 2)</span>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <input value={avatarDescription} onChange={e => setAvatarDescription(e.target.value)}
                                        placeholder="Describe model look..."
                                        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', color: 'var(--sys-text)', fontSize: 11 }} />
                                    <button onClick={generateAvatar} disabled={avatarGenerating || !avatarDescription.trim()}
                                        style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#a855f7', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: avatarGenerating ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                                        {avatarGenerating ? <span className="material-symbols-outlined" style={{ fontSize: 12, animation: 'ugc-pulse 1s infinite' }}>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>} Create
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="ugc-err">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                            {error}
                            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></button>
                        </div>
                    )}

                    {/* Prompt Preview Area */}
                    {promptReady && (
                        <div style={{ margin: '0 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#a855f7', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit_note</span> Edit Prompt before generating
                                </span>
                                <button onClick={handleBuildPrompt} disabled={buildingPrompt}
                                    style={{ background: 'none', border: 'none', color: 'var(--sys-text-muted)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span> Rebuild
                                </button>
                            </div>
                            <textarea 
                                value={promptText} 
                                onChange={e => setPromptText(e.target.value)}
                                style={{
                                    width: '100%', height: 100, padding: '8px 12px',
                                    borderRadius: 8, border: '1px solid var(--sys-border)',
                                    background: 'var(--sys-surface)', color: 'var(--sys-text)',
                                    fontSize: 12, lineHeight: 1.4, resize: 'none', outline: 'none'
                                }}
                            />
                            <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', textAlign: 'right' }}>
                                Explicitly check that @image1 (avatar) and @image2 (product) are referenced.
                            </span>
                        </div>
                    )}

                    {/* Bottom Bar */}
                    <div className="ugc-bottom">
                        <div className="ugc-bottom-left">
                            <Dropdown value={duration} onChange={v => setDuration(v)} options={[
                                { value: 5, label: '5s', icon: 'timer' },
                                { value: 8, label: '8s', icon: 'timer' },
                                { value: 10, label: '10s', icon: 'timer' },
                                { value: 15, label: '15s', icon: 'timer' },
                                { value: 20, label: '20s', icon: 'timer' },
                                { value: 30, label: '30s', icon: 'timer' },
                            ]} />
                            <Dropdown value={aspectRatio} onChange={v => setAspectRatio(v)} options={[
                                { value: '9:16', label: '9:16', icon: 'crop_portrait' },
                                { value: '16:9', label: '16:9', icon: 'crop_landscape' },
                                { value: '1:1', label: '1:1', icon: 'crop_square' },
                            ]} />
                            <Dropdown value={language} onChange={v => setLanguage(v)} options={LANGUAGES.map(l => ({ value: l.id, label: l.label, icon: 'language' }))} />
                            <button className="ugc-cfg-btn" onClick={() => setShowSettings(!showSettings)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tune</span>
                                {showSettings ? 'Less' : 'More Settings'}
                            </button>
                        </div>
                        {!promptReady ? (
                            <button className="ugc-generate" disabled={!canGenerate || buildingPrompt || !avatarUrl || !productData}
                                onClick={handleBuildPrompt}>
                                {buildingPrompt ? (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'ugc-pulse 1s infinite' }}>progress_activity</span> Building...</>
                                ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_document</span> Review Prompt</>
                                )}
                            </button>
                        ) : (
                            <button className="ugc-generate" disabled={!canGenerate || loading || !promptText.trim()}
                                onClick={handleGenerate}>
                                {loading ? (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'ugc-pulse 1s infinite' }}>progress_activity</span> Generating...</>
                                ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>slow_motion_video</span> Generate · {credits}c</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

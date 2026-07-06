import { useState, useEffect, useRef, useCallback } from 'react'
import { CreditTooltipWrapper } from '../CreditBadge'
import VideoHoverActions from './VideoHoverActions'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const isFormData = opts.body instanceof FormData
    const headers = isFormData
        ? { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers,
    })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error(`Server returned ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}
async function apiJson(path, body) {
    return api(path, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

const DURATIONS = [
    { value: 5, label: '5s' }, { value: 8, label: '8s' }, { value: 10, label: '10s' },
    { value: 15, label: '15s' }, { value: 20, label: '20s' }, { value: 30, label: '30s' },
    { value: 45, label: '45s' }, { value: 60, label: '60s' }, { value: 90, label: '90s' }, { value: 120, label: '120s' },
]
const FORMATS = [
    { value: '9:16', label: '9:16', msIcon: 'crop_portrait' },
    { value: '16:9', label: '16:9', msIcon: 'crop_landscape' },
    { value: '1:1', label: '1:1', msIcon: 'crop_square' },
]
const VIDEO_MODELS = [
    { value: 'seedance-2.0', label: 'Seedance 2.0', msIcon: 'local_movies' },
    { value: 'seedance-2.0-fast', label: 'Seedance Fast', msIcon: 'bolt' },
    { value: 'seedance-2.0-mini', label: 'Seedance Mini', msIcon: 'bolt' },
]
const CTA_PRESETS = ['Shop now', 'Link in bio', 'Swipe up', 'Try it free', 'Learn more']

/* ═══════════════════════════════════════════════════════ CSS ══ */
const css = `
/* Q-Ads inherits vm-* classes from AdvancedMode's shared CSS */
.qa-root { --sys-surface-glass: color-mix(in srgb, var(--sys-surface) 85%, transparent); --sys-surface-raised: color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface)); --sys-surface-hover: color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface)); position: relative; width: 100%; min-height: calc(100vh - 80px); display: flex; flex-direction: column; }

/* Background grid */
.qa-bg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 24px; padding-bottom: 400px; opacity: 0.9; }
@media(max-width: 1024px) { .qa-bg-grid { grid-template-columns: repeat(3, 1fr); padding-bottom: 500px; } }
@media(max-width: 768px) { .qa-bg-grid { grid-template-columns: repeat(2, 1fr); padding-bottom: 500px; } }
.qa-bg-item { aspect-ratio: 16/9; width: 100%; border-radius: 8px; position: relative; overflow: hidden; background: var(--sys-surface); border: 1px solid var(--sys-border); }
.qa-bg-item video { width: 100%; height: 100%; object-fit: cover; display: block; }
.qa-bg-item:hover { opacity: 0.88; transform: scale(1.02); z-index: 2; box-shadow: 0 10px 30px rgba(0,0,0,0.5); transition: all .4s; }
.qa-bg-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.05) 100%); opacity: 0; transition: opacity .3s; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; gap: 6px; z-index: 3; }
.qa-bg-item:hover .qa-bg-overlay { opacity: 1; }
.qa-overlay-btn { display: flex; align-items: center; gap: 3px; padding: 5px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; border: none; color: #fff; background: rgba(255,255,255,0.12); backdrop-filter: blur(8px); transition: all .15s; }
.qa-overlay-btn:hover { background: rgba(255,255,255,0.28); }

/* Generating card */
.qa-gen-card { aspect-ratio: 16/9; width: 100%; border-radius: 8px; position: relative; overflow: hidden; background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(234,179,8,0.08)); border: 1px solid rgba(124,58,237,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; animation: qa-pulse-border 2s ease-in-out infinite; }
@keyframes qa-pulse-border { 0%,100% { border-color: rgba(124,58,237,0.3); } 50% { border-color: rgba(124,58,237,0.7); } }

/* Scott Panel (Floating Card) */
.qa-layout { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 50; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 16px 24px 16px; pointer-events: none; }
.qa-layout * { pointer-events: auto; }
.qa-card { width: 100%; max-width: 860px; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 24px; padding: 0; backdrop-filter: blur(36px); box-shadow: 0 15px 40px rgba(0,0,0,0.15); z-index: 10; display: flex; flex-direction: column; color: var(--sys-text); font-family: 'Inter', sans-serif; max-height: calc(100vh - 100px); overflow-y: auto; overflow-x: hidden; }
.qa-card::-webkit-scrollbar { width: 4px; }
.qa-card::-webkit-scrollbar-track { background: transparent; }
.qa-card::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
.qa-card-header { padding: 6px 16px; border-bottom: 1px solid var(--sys-border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 12px; }

/* Category Grid */
.qa-cat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; padding: 10px 16px; max-height: 240px; overflow-y: auto; scrollbar-width: thin; }
@media(max-width: 900px) { .qa-cat-grid { grid-template-columns: repeat(3, 1fr); } }
@media(max-width: 600px) { .qa-cat-grid { grid-template-columns: repeat(2, 1fr); } }
.qa-cat-card { padding: 10px; border-radius: 12px; border: 1px solid var(--sys-border); background: var(--sys-surface-raised); cursor: pointer; transition: all .2s; display: flex; flex-direction: column; gap: 4px; position: relative; }
.qa-cat-card:hover { border-color: var(--sys-text-muted); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
.qa-cat-card.selected { border-color: var(--cat-color); background: color-mix(in srgb, var(--cat-color) 8%, var(--sys-surface)); box-shadow: 0 0 20px color-mix(in srgb, var(--cat-color) 20%, transparent); }
.qa-cat-card.selected::after { content: ''; position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--cat-color); }

/* Product input */
.qa-product-section { padding: 8px 16px; display: flex; gap: 8px; align-items: center; border-bottom: 1px solid var(--sys-border); flex-wrap: wrap; }
.qa-prod-input { flex: 1; min-width: 200px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--sys-border); background: var(--sys-surface-raised); color: var(--sys-text); font-size: 13px; outline: none; }
.qa-prod-input:focus { border-color: var(--sys-primary); }

/* Upper controls */
.qa-upper { padding: 8px 16px; display: flex; gap: 8px; border-bottom: 1px solid var(--sys-border); align-items: center; flex-wrap: wrap; }
.qa-thumb-box { width: 36px; height: 36px; border-radius: 8px; border: 1px dashed var(--sys-border); background: var(--sys-surface); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; transition: all .2s; flex-shrink: 0; }
.qa-thumb-box:hover { border-color: var(--sys-primary); background: var(--sys-surface-raised); }
.qa-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
.qa-thumb-label { font-size: 9px; font-weight: 600; color: var(--sys-text-muted); text-align: center; margin-top: 2px; }

/* Prompt textarea */
.qa-prompt { padding: 0; position: relative; flex: 1; margin: 0 16px 8px; }
.qa-prompt-box { padding: 8px 12px; background: var(--sys-surface-raised); border-radius: 10px; border: 1px solid var(--sys-border); transition: border-color .2s; }
.qa-prompt-box:focus-within { border-color: var(--sys-primary); }
.qa-textarea { width: 100%; background: transparent; border: none; outline: none; resize: vertical; color: var(--sys-text); font-size: 13px; line-height: 1.5; font-family: inherit; min-height: 56px; max-height: 200px; display: block; overflow-y: auto; scrollbar-width: thin; font-weight: 500; }
.qa-textarea::placeholder { color: var(--sys-text-muted); opacity: 0.8; }

/* Settings row */
.qa-settings { padding: 8px 16px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--sys-border); }
.qa-setting-pill { padding: 5px 10px; border-radius: 8px; font-size: 11px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: transparent; color: var(--sys-text-muted); transition: all .2s; display: flex; align-items: center; gap: 4px; }
.qa-setting-pill:hover { color: var(--sys-text); background: rgba(255,255,255,0.03); }
.qa-setting-pill.active { background: var(--sys-surface-glass); color: var(--sys-text); box-shadow: 0 2px 8px rgba(0,0,0,0.15); border: 1px solid var(--sys-border); }

/* CTA pills */
.qa-cta-row { display: flex; gap: 4px; flex-wrap: wrap; }
.qa-cta-pill { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; border: 1px solid var(--sys-border); background: transparent; color: var(--sys-text-muted); transition: all .15s; }
.qa-cta-pill:hover { color: var(--sys-text); border-color: var(--sys-text-muted); }
.qa-cta-pill.active { color: var(--sys-text); background: var(--sys-surface-raised); border-color: var(--sys-primary); }

/* Bottom bar */
.qa-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 16px; border-top: 1px solid var(--sys-border); flex-wrap: wrap; }
.qa-bottom-left { display: flex; align-items: center; gap: 4px; flex: 1; flex-wrap: wrap; }
.qa-generate { padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--sys-surface); background: var(--sys-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: all .2s; flex-shrink: 0; }
.qa-generate:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); opacity: 0.9; }
.qa-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }

/* Config dropdown */
.qa-cfg-item { position: relative; }
.qa-cfg-trigger { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: transparent; color: var(--sys-text); transition: all .15s; }
.qa-cfg-trigger:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }
.qa-cfg-menu { position: absolute; bottom: -8px; left: -8px; min-width: 160px; background: var(--sys-surface); border: 1px solid var(--sys-border); border-radius: 16px; padding: 8px; z-index: 100; box-shadow: 0 15px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 2px; }
.qa-cfg-opt { display: flex; align-items: center; width: 100%; padding: 10px 12px; border: none; background: transparent; color: var(--sys-text-muted); font-size: 13px; cursor: pointer; border-radius: 8px; text-align: left; transition: all .2s; }
.qa-cfg-opt.sel { color: var(--sys-text); background: var(--sys-surface-raised); }
.qa-cfg-opt:hover { background: var(--sys-surface-hover); color: var(--sys-text); }

/* Error */
.qa-err { margin: 6px 16px; padding: 8px 12px; border-radius: 10px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; font-size: 12px; display: flex; align-items: center; gap: 6px; }

@keyframes qa-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.qa-spin { animation: qa-spin 1s linear infinite; }
`

/* ═══════ ConfigDropdown ═══════ */
function CfgDropdown({ value, onChange, options, label }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])
    const sel = options.find(o => o.value === value) || options[0]
    return (
        <div className="qa-cfg-item" ref={ref}>
            <button type="button" className="qa-cfg-trigger" onClick={() => setOpen(!open)}>
                {sel?.msIcon && <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{sel.msIcon}</span>}
                <span>{sel?.label}</span>
                <span className="material-symbols-outlined" style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', fontSize: 14 }}>expand_more</span>
            </button>
            {open && (
                <div className="qa-cfg-menu">
                    {options.map(o => (
                        <button key={o.value} type="button" className={`qa-cfg-opt ${o.value === value ? 'sel' : ''}`}
                            onClick={() => { onChange(o.value); setOpen(false) }}>
                            {o.msIcon && <span className="material-symbols-outlined" style={{ fontSize: 15, marginRight: 6 }}>{o.msIcon}</span>}
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function QAds({ activeBrand, projects = [] }) {
    // ── Categories ──
    const [categories, setCategories] = useState([])
    const [selectedCat, setSelectedCat] = useState(null)

    // ── Product ──
    const [productUrl, setProductUrl] = useState('')
    const [productData, setProductData] = useState(null)
    const [productImageUrls, setProductImageUrls] = useState([])
    const [analyzing, setAnalyzing] = useState(false)
    const productRef = useRef(null)

    // ── Avatar ──
    const [avatarUrl, setAvatarUrl] = useState(null)
    const [avatarGenerating, setAvatarGenerating] = useState(false)
    const avatarRef = useRef(null)

    // ── Settings ──
    const [duration, setDuration] = useState(8)
    const [format, setFormat] = useState('9:16')
    const [cta, setCta] = useState('Shop now')
    const [customDialogue, setCustomDialogue] = useState('')
    const [selectedModel, setSelectedModel] = useState('seedance-2.0-fast')
    // Seed Audio 1.0 UI states
    const [seedAudioUrl, setSeedAudioUrl] = useState('')
    const [showAudioGenerator, setShowAudioGenerator] = useState(false)
    const [audioScript, setAudioScript] = useState('')
    const [selectedAudioSpeaker, setSelectedAudioSpeaker] = useState('zh_male_taocheng_uranus_bigtts')
    const [enhancingAudio, setEnhancingAudio] = useState(false)
    const [generatingAudio, setGeneratingAudio] = useState(false)
    const [audioGenError, setAudioGenError] = useState('')
    const [audioProgress, setAudioProgress] = useState(0)

    // ── Prompt ──
    const [promptText, setPromptText] = useState('')
    const [promptReady, setPromptReady] = useState(false)
    const [buildingPrompt, setBuildingPrompt] = useState(false)

    // ── Generation ──
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [jobs, setJobs] = useState([])
    const pollRefs = useRef({})
    const [creditEstimate, setCreditEstimate] = useState(null)
    const [isMinimized, setIsMinimized] = useState(false)
    const [previewVideo, setPreviewVideo] = useState(null)

    // ── History ──
    const [gridVideos, setGridVideos] = useState(() =>
        projects.filter(p => p.studioMode === 'q-ads' && (p.status === 'done' || p.status === 'completed') && p.generation?.videoUrl)
    )
    useEffect(() => {
        setGridVideos(prev => {
            const ids = new Set(prev.map(p => p._id))
            const incoming = projects.filter(p => p.studioMode === 'q-ads' && (p.status === 'done' || p.status === 'completed') && p.generation?.videoUrl)
            const fresh = incoming.filter(p => !ids.has(p._id))
            return fresh.length ? [...fresh, ...prev] : prev
        })
    }, [projects])

    // ── Cleanup polls ──
    useEffect(() => () => { Object.values(pollRefs.current).forEach(clearInterval) }, [])

    // ── Load categories on mount ──
    useEffect(() => {
        api('/video-studio/ugc-pro/qads/categories').then(d => {
            setCategories(d.categories || [])
        }).catch(() => {})
    }, [])

    // ── Update recommended settings when category changes ──
    useEffect(() => {
        if (!selectedCat) return
        const cat = categories.find(c => c.id === selectedCat)
        if (cat) {
            setDuration(cat.recommendedDuration)
            setFormat(cat.recommendedFormat)
        }
    }, [selectedCat, categories])

    // ── Credit estimate ──
    useEffect(() => {
        api(`/video-studio/ugc-pro/qads/credit-estimate?duration=${duration}`).then(setCreditEstimate).catch(() => {})
    }, [duration])

    const credits = creditEstimate?.credits || 15
    const cat = categories.find(c => c.id === selectedCat)
    const isNoAvatar = cat?.noAvatar

    // ── Product Analysis ──
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

    // ── Seed Audio handlers ──
    const handleEnhanceAudioScript = useCallback(async () => {
        if (!audioScript.trim()) return
        setEnhancingAudio(true); setAudioGenError('')
        try {
            const data = await api('/video-studio/seed-audio/enhance-prompt', {
                method: 'POST',
                body: JSON.stringify({ text: audioScript })
            })
            if (data.enhancedText) setAudioScript(data.enhancedText)
        } catch (err) {
            setAudioGenError(`Failed to enhance script: ${err.message}`)
        }
        setEnhancingAudio(false)
    }, [audioScript])

    const handleGenerateAudio = useCallback(async () => {
        if (!audioScript.trim()) return
        setGeneratingAudio(true); setAudioGenError(''); setAudioProgress(5)
        try {
            const submitData = await api('/video-studio/seed-audio/generate', {
                method: 'POST',
                body: JSON.stringify({ text: audioScript, speaker: selectedAudioSpeaker })
            })
            const taskId = submitData.taskId
            if (!taskId) throw new Error('Failed to get Task ID for audio generation')

            let attempts = 0
            const maxAttempts = 60
            const interval = setInterval(async () => {
                attempts++
                try {
                    const statusCheck = await api(`/video-studio/seed-audio/status/${taskId}`)
                    if (statusCheck.status === 'COMPLETED') {
                        clearInterval(interval)
                        setSeedAudioUrl(statusCheck.audioUrl)
                        setGeneratingAudio(false)
                    } else if (statusCheck.status === 'FAILED') {
                        clearInterval(interval)
                        setAudioGenError(statusCheck.error || 'Audio generation failed')
                        setGeneratingAudio(false)
                    } else {
                        setAudioProgress(Math.min(attempts * 8 + 5, 95))
                    }
                } catch (pollErr) {
                    if (attempts >= maxAttempts) {
                        clearInterval(interval)
                        setAudioGenError('Audio generation timed out')
                        setGeneratingAudio(false)
                    }
                }
            }, 2000)
        } catch (err) {
            setAudioGenError(err.message)
            setGeneratingAudio(false)
        }
    }, [audioScript, selectedAudioSpeaker])

    // ── Build Prompt ──
    const handleBuildPrompt = useCallback(async () => {
        if (!selectedCat) { setError('Select a Q-Ad category first'); return }
        if (!productData) { setError('Analyze a product first'); return }
        if (!isNoAvatar && !avatarUrl) { setError('Upload an avatar image'); return }
        setBuildingPrompt(true); setError(null); setPromptReady(false)
        try {
            const data = await apiJson('/video-studio/ugc-pro/qads/build-prompt', {
                brandId: activeBrand?._id, categoryId: selectedCat, productData, avatarUrl, productImageUrls,
                settings: { duration, format, cta, customDialogue, model: selectedModel, refAudio: seedAudioUrl || null },
            })
            setPromptText(data.prompt)
            setPromptReady(true)
        } catch (err) { setError(err.message) }
        setBuildingPrompt(false)
    }, [selectedCat, productData, avatarUrl, productImageUrls, activeBrand, duration, format, cta, customDialogue, isNoAvatar, selectedModel, seedAudioUrl])

    // ── Generate ──
    const handleGenerate = useCallback(async () => {
        if (!selectedCat) return
        setLoading(true); setError(null)
        const jobId = `qa-${Date.now()}`
        const newJob = { id: jobId, requestId: null, categoryId: selectedCat, progress: 3, status: 'generating', videoUrl: null, error: null }
        setJobs(prev => [newJob, ...prev])
        setPromptReady(false)
        try {
            const data = await apiJson('/video-studio/ugc-pro/qads/generate', {
                brandId: activeBrand?._id, categoryId: selectedCat, productData, avatarUrl, productImageUrls,
                prebuiltPrompt: promptText,
                settings: { duration, format, cta, customDialogue, quality: 'high', model: selectedModel, refAudio: seedAudioUrl || null },
            })
            setIsMinimized(true)
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, requestId: data.requestId, prompt: data.prompt } : j))

            // Poll — use mutable ref so Safe Mode can redirect polling to new taskId
            let currentRequestId = data.requestId
            pollRefs.current[jobId] = setInterval(async () => {
                try {
                    const status = await api(`/video-studio/ugc-pro/qads/status/${currentRequestId}`)

                    // 🛡️ Safe Mode Pivot: backend stripped avatar and resubmitted — switch to new task
                    if (status.newRequestId) {
                        currentRequestId = status.newRequestId
                        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: 5, requestId: status.newRequestId } : j))
                        return // Wait for next poll cycle with new ID
                    }

                    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: status.progress || j.progress } : j))
                    if (status.status === 'COMPLETED') {
                        clearInterval(pollRefs.current[jobId]); delete pollRefs.current[jobId]
                        setJobs(prev => prev.filter(j => j.id !== jobId))
                        setGridVideos(prev => [{ _id: jobId, generation: { videoUrl: status.videoUrl }, input: { productData, categoryId: selectedCat } }, ...prev])
                    } else if (status.status === 'FAILED') {
                        clearInterval(pollRefs.current[jobId]); delete pollRefs.current[jobId]
                        const isTimeout = status.error && (status.error.includes('Network request timed out') || status.error.includes('504'));
                        const errorMsg = isTimeout ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : (status.error || 'Failed');
                        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'failed', error: errorMsg } : j))
                    }
                } catch { /* keep polling */ }
            }, 5000)
        } catch (err) {
            setError(err.message)
            setJobs(prev => prev.filter(j => j.id !== jobId))
        }
        setLoading(false)
    }, [activeBrand, selectedCat, productData, productImageUrls, avatarUrl, promptText, duration, format, cta, customDialogue, selectedModel, seedAudioUrl])

    async function downloadVideo(url) {
        try {
            const resp = await fetch(url); const blob = await resp.blob()
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'q-ad-video.mp4'
            document.body.appendChild(a); a.click(); setTimeout(() => document.body.removeChild(a), 100)
        } catch { window.open(url, '_blank') }
    }

    const activeJobCount = jobs.filter(j => j.status === 'generating').length
    const canGenerate = activeJobCount < 3
    const hasProduct = !!productData
    const hasAvatar = !!avatarUrl || isNoAvatar

    /* ═══════════════ RENDER ═══════════════ */
    return (
        <div className="qa-root">
            <style>{css}</style>

            {/* ── Background: History Grid ── */}
            <div className="qa-bg-grid">
                {/* Active jobs */}
                {jobs.filter(j => j.status === 'generating').map(job => (
                    <div key={job.id} className="qa-gen-card">
                        <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 12 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#a855f7', animation: 'qa-spin 2s linear infinite' }}>slow_motion_video</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>Generating Q-Ad...</span>
                            <div style={{ width: '80%', maxWidth: 140, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 2, background: '#eab308', width: `${job.progress}%`, transition: 'width 1.2s ease' }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#eab308' }}>{job.progress}%</span>
                        </div>
                        <button onClick={() => { clearInterval(pollRefs.current[job.id]); setJobs(prev => prev.filter(j => j.id !== job.id)) }}
                            style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 4, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '2px 5px', fontSize: 10, zIndex: 5 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                        </button>
                    </div>
                ))}

                {/* Failed jobs */}
                {jobs.filter(j => j.status === 'failed').map(job => (
                    <div key={job.id} className="qa-gen-card" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.06)' }}>
                        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', padding: 16 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444' }}>error</span>
                            <p style={{ fontSize: 11, color: '#fca5a5', marginTop: 6 }}>{job.error}</p>
                            <button onClick={() => setJobs(prev => prev.filter(j => j.id !== job.id))}
                                style={{ marginTop: 8, padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#fca5a5', cursor: 'pointer', fontSize: 10 }}>Dismiss</button>
                        </div>
                    </div>
                ))}

                {/* Completed videos */}
                {gridVideos.map(v => (
                    <div key={v._id} className="qa-bg-item has-vha" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setPreviewVideo(v.generation?.videoUrl)}>
                        <video src={v.generation?.videoUrl} muted loop playsInline onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0 }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <VideoHoverActions videoUrl={v.generation?.videoUrl} onPreview={setPreviewVideo} project={v} />
                        <div className="qa-bg-overlay">
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{v.input?.productData?.productName || 'Q-Ad'}</span>
                            {v.input?.categoryId && (
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                                    {categories.find(c => c.id === v.input.categoryId)?.name || v.input.categoryId}
                                </span>
                            )}
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button className="qa-overlay-btn" onClick={() => downloadVideo(v.generation?.videoUrl)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>download</span> Download
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Empty state */}
                {jobs.length === 0 && gridVideos.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', opacity: 0.4 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--sys-text)' }}>ads_click</span>
                        <p style={{ fontSize: 14, color: 'var(--sys-text)', marginTop: 12 }}>Q-Ads — Your Generated Ads</p>
                        <p style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginTop: 4 }}>Pick a format → Add product → Generate</p>
                    </div>
                )}
            </div>

            {/* ═══ Floating Scott Panel ═══ */}
            <div className="qa-layout">
                {isMinimized ? (
                    <div className="qa-card" style={{ maxWidth: 220, cursor: 'pointer', padding: '12px 20px', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-primary)', borderBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, color: 'var(--sys-primary)' }} onClick={() => setIsMinimized(false)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>expand_less</span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>Open Studio</span>
                    </div>
                ) : (
                    <div className="qa-card">
    
                        {/* Header */}
                        <div className="qa-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#eab308' }}>ads_click</span>
                                Q-Ads · Quick Ads
                                {selectedCat && cat && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: cat.color, marginLeft: 4, padding: '1px 6px', borderRadius: 4, background: `color-mix(in srgb, ${cat.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${cat.color} 25%, transparent)` }}>
                                        {cat.name}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {productData && (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: '#10b981', display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check_circle</span>
                                        {productData.productName || 'Product'}
                                    </span>
                                )}
                                <CreditTooltipWrapper credits={credits} label="Q-Ads">
                                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sys-text-muted)', padding: '2px 6px', borderRadius: 6, background: 'color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface))' }}>{credits}c</span>
                                </CreditTooltipWrapper>
                                <button onClick={() => setIsMinimized(true)} style={{ background: 'transparent', border: 'none', color: 'var(--sys-text-muted)', cursor: 'pointer', display: 'flex', marginLeft: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>expand_more</span>
                                </button>
                            </div>
                        </div>
    
                        {/* Category Grid */}
                    <div className="qa-cat-grid">
                        {categories.map(c => (
                            <div key={c.id}
                                className={`qa-cat-card ${selectedCat === c.id ? 'selected' : ''}`}
                                style={{ '--cat-color': c.color }}
                                onClick={() => setSelectedCat(c.id)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: c.color }}>{c.msIcon}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-text)' }}>{c.name}</span>
                                </div>
                                <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.tagline}</span>
                                <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                                    <span style={{ fontSize: 8, color: 'var(--sys-text-muted)', display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>timer</span>{c.recommendedDuration}s
                                    </span>
                                    <span style={{ fontSize: 8, color: 'var(--sys-text-muted)' }}>{c.recommendedFormat}</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Product + Avatar Row (only if category selected) */}
                    {selectedCat && (
                        <>
                            {/* Product Input */}
                            <div className="qa-product-section">
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#a855f7' }}>link</span>
                                <input className="qa-prod-input" value={productUrl} onChange={e => setProductUrl(e.target.value)}
                                    placeholder="Paste product link (Shopify, Amazon, D2C...)"
                                    onKeyDown={e => { if (e.key === 'Enter') analyzeProduct() }} />
                                <button onClick={() => productRef.current?.click()}
                                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add_photo_alternate</span>
                                    {productImageUrls.length > 0 ? `${productImageUrls.length} img` : 'Upload'}
                                </button>
                                <input ref={productRef} type="file" accept="image/*" multiple hidden onChange={e => { if (e.target.files?.length) analyzeProduct() }} />
                                <button onClick={analyzeProduct} disabled={analyzing || (!productUrl.trim() && !productRef.current?.files?.length)}
                                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: analyzing ? 'var(--sys-border)' : 'var(--sys-primary)', color: analyzing ? 'var(--sys-text-muted)' : '#111', fontSize: 11, fontWeight: 700, cursor: analyzing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {analyzing && <span className="material-symbols-outlined qa-spin" style={{ fontSize: 13 }}>progress_activity</span>}
                                    {analyzing ? 'Analysing...' : 'Analyse'}
                                </button>
                            </div>

                            {/* Upper controls — image thumbs */}
                            <div className="qa-upper">
                                {/* Product thumbs (Multiple) */}
                                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                                    {productImageUrls.map((url, idx) => (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            <div className="qa-thumb-box" style={{ position: 'relative' }}>
                                                <img src={url} alt="" />
                                                <button onClick={(e) => { e.stopPropagation(); setProductImageUrls(prev => prev.filter((_, i) => i !== idx)) }}
                                                    style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}>×</button>
                                            </div>
                                            <span className="qa-thumb-label">@{idx + 2}</span>
                                        </div>
                                    ))}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                        <div className="qa-thumb-box" onClick={() => productRef.current?.click()} style={{ borderStyle: 'solid' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>{productImageUrls.length > 0 ? 'add' : 'inventory_2'}</span>
                                        </div>
                                        <span className="qa-thumb-label">{productImageUrls.length > 0 ? 'Add' : 'Product'}</span>
                                    </div>
                                </div>

                                {/* Avatar thumb (hidden for cinematic_flex) */}
                                {!isNoAvatar && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                        <div className="qa-thumb-box" onClick={() => avatarRef.current?.click()}>
                                            {avatarUrl ? <img src={avatarUrl} alt="" /> :
                                                avatarGenerating ? <span className="material-symbols-outlined qa-spin" style={{ fontSize: 14, color: '#a855f7' }}>progress_activity</span> :
                                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>person</span>}
                                            <input ref={avatarRef} type="file" accept="image/*" hidden
                                                onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
                                        </div>
                                        <span className="qa-thumb-label">Avatar</span>
                                    </div>
                                )}

                                {/* CTA quick pills */}
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--sys-text-muted)', marginRight: 2 }}>CTA:</span>
                                    {CTA_PRESETS.map(c => (
                                        <button key={c} className={`qa-cta-pill ${cta === c ? 'active' : ''}`} onClick={() => setCta(c)}>{c}</button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Custom Dialogue (optional) */}
                    {selectedCat && hasProduct && (
                        <div className="qa-prompt">
                            <div className="qa-prompt-box" style={{ marginTop: 8 }}>
                                <textarea className="qa-textarea" value={customDialogue} onChange={e => setCustomDialogue(e.target.value)}
                                    placeholder="Custom dialogue (optional) — leave blank and AI writes from your product info"
                                    style={{ minHeight: 36 }} />
                            </div>
                        </div>
                    )}

                    {/* Prompt Preview */}
                    {promptReady && (
                        <div style={{ margin: '0 16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#eab308', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit_note</span> Edit Prompt before generating
                                </span>
                                <button onClick={handleBuildPrompt} disabled={buildingPrompt}
                                    style={{ background: 'none', border: 'none', color: 'var(--sys-text-muted)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>refresh</span> Rebuild
                                </button>
                            </div>
                            <textarea value={promptText} onChange={e => setPromptText(e.target.value)}
                                style={{ width: '100%', height: 100, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', color: 'var(--sys-text)', fontSize: 12, lineHeight: 1.4, resize: 'none', outline: 'none' }} />
                            <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', textAlign: 'right' }}>
                                Check @image1 (avatar) and @image2 (product) tags are present.
                            </span>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="qa-err">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error</span>
                            {error}
                            <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}>✕</button>
                        </div>
                    )}

                    {/* ── Seed Audio 1.0 Collapsible Card ── */}
                    {selectedModel.startsWith('seedance') && showAudioGenerator && (
                        <div style={{ margin: '0 16px 12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--sys-border)', animation: 'traySlideUp 0.15s ease-out' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a855f7' }}>music_note</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Seed Audio 1.0 (ByteDance)</span>
                                </div>
                                {seedAudioUrl && (
                                    <button onClick={() => setSeedAudioUrl('')} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>Clear</button>
                                )}
                            </div>

                            {seedAudioUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className="material-symbols-outlined" style={{ color: '#a855f7', fontSize: 20 }}>audio_file</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>Seed Audio Generated Successfully</div>
                                        <audio src={seedAudioUrl} controls style={{ height: 24, marginTop: 4, width: '100%', maxWidth: 260 }} />
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Voice:</span>
                                        <select
                                            value={selectedAudioSpeaker}
                                            onChange={e => setSelectedAudioSpeaker(e.target.value)}
                                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 11, outline: 'none' }}
                                        >
                                            <option value="zh_male_taocheng_uranus_bigtts">Uranus Male</option>
                                            <option value="zh_female_xiaoxiao">Xiaoxiao Female</option>
                                            <option value="zh_female_yunjie">Yunjie Female</option>
                                        </select>
                                    </div>

                                    <div style={{ position: 'relative' }}>
                                        <textarea
                                            value={audioScript}
                                            onChange={e => setAudioScript(e.target.value)}
                                            placeholder="Write dialogue script/prompt, then click AI Enhance..."
                                            style={{ width: '100%', height: 60, padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 11, lineHeight: 1.4, resize: 'none', outline: 'none' }}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleEnhanceAudioScript}
                                            disabled={enhancingAudio || !audioScript.trim()}
                                            style={{ position: 'absolute', bottom: 6, right: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a855f7', fontSize: 9, padding: '3px 6px', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            {enhancingAudio ? (
                                                <span className="material-symbols-outlined qa-spin" style={{ fontSize: 10 }}>progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined" style={{ fontSize: 10 }}>auto_awesome</span>
                                            )}
                                            {enhancingAudio ? 'Enhancing...' : 'Enhance'}
                                        </button>
                                    </div>

                                    {audioGenError && (
                                        <div style={{ color: '#f87171', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>error</span>
                                            {audioGenError}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleGenerateAudio}
                                        disabled={generatingAudio || !audioScript.trim()}
                                        style={{ width: '100%', padding: '6px', background: 'var(--sys-primary)', border: 'none', color: '#111', fontWeight: 700, borderRadius: 6, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                    >
                                        {generatingAudio ? (
                                            <>
                                                <span className="material-symbols-outlined qa-spin" style={{ fontSize: 12 }}>progress_activity</span>
                                                Generating ({audioProgress}%)
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>music_note</span>
                                                Generate Audio
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bottom Bar */}
                    <div className="qa-bottom">
                        <div className="qa-bottom-left">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', background: 'transparent', height: '36px', flex: '0 0 auto' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)' }}>timer</span>
                                <span style={{ fontSize: 11, color: '#fff', fontWeight: 600, minWidth: '24px' }}>{duration}s</span>
                                <input
                                    type="range"
                                    min={selectedModel.startsWith('seedance') ? 4 : 5}
                                    max={selectedModel === 'seedance-2.0-mini' ? 15 : 120}
                                    step={1}
                                    value={duration}
                                    onChange={e => {
                                        let val = Number(e.target.value);
                                        if (!selectedModel.startsWith('seedance')) {
                                            val = DURATIONS.map(d => d.value).reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
                                        }
                                        setDuration(val);
                                    }}
                                    style={{ width: '70px', accentColor: 'var(--sys-primary)', cursor: 'pointer', height: '3px', background: 'rgba(255,255,255,0.1)', border: 'none', outline: 'none' }}
                                />
                            </div>
                            <CfgDropdown value={format} onChange={v => setFormat(v)}
                                options={FORMATS} />
                            <CfgDropdown value={selectedModel} onChange={setSelectedModel}
                                options={VIDEO_MODELS} />
                            {selectedModel.startsWith('seedance') && (
                                <button type="button" onClick={() => setShowAudioGenerator(!showAudioGenerator)}
                                    style={{ background: seedAudioUrl ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.06)', border: seedAudioUrl ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0 12px', height: '36px', display: 'flex', alignItems: 'center', gap: 6, color: seedAudioUrl ? '#c084fc' : '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>music_note</span>
                                    <span>{seedAudioUrl ? 'Seed Audio Ready' : 'Seed Audio'}</span>
                                </button>
                            )}
                        </div>
                        {!promptReady ? (
                            <button className="qa-generate" disabled={!selectedCat || !hasProduct || !hasAvatar || buildingPrompt}
                                onClick={handleBuildPrompt}>
                                {buildingPrompt ? (
                                    <><span className="material-symbols-outlined qa-spin" style={{ fontSize: 16 }}>progress_activity</span> Building...</>
                                ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_document</span> Review Prompt</>
                                )}
                            </button>
                        ) : (
                            <button className="qa-generate" disabled={!canGenerate || loading || !promptText.trim()}
                                onClick={handleGenerate}>
                                {loading ? (
                                    <><span className="material-symbols-outlined qa-spin" style={{ fontSize: 16 }}>progress_activity</span> Generating...</>
                                ) : (
                                    <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>ads_click</span> Generate · {credits}c</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
                )}
            </div>

            {/* ── Video Preview Modal ── */}
            {previewVideo && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreviewVideo(null)}>
                    <div style={{ position: 'relative', maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
                        <video src={previewVideo} controls autoPlay playsInline muted={false} ref={el => { if(el){ el.muted = false; el.volume = 1; const p = el.play(); if(p!==undefined) p.catch(()=>{}); } }} style={{ maxWidth: '100%', maxHeight: '85vh', margin: '0 auto', display: 'block', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', objectFit: 'contain', background: '#000' }} />
                        <div style={{ position: 'absolute', top: -44, right: 0, display: 'flex', gap: 8 }}>
                            <button onClick={async () => {
                                try {
                                    const resp = await fetch(previewVideo);
                                    const blob = await resp.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'qad-video.mp4';
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                } catch (e) { window.open(previewVideo, '_blank'); }
                            }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Download
                            </button>
                            <button onClick={() => setPreviewVideo(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

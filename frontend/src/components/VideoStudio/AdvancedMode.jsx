import { useState, useEffect, useRef, useCallback } from 'react'
import { creatives as creativesAPI } from '../../services/api'

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

/* ── Models ── */
const MODELS = {
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', icon: '🎞️', dur: [4, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true }, cost: 0.08 },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', dur: [3, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true, lastFrame: true, audio: true }, cost: 0.07 },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', icon: '🎬', dur: [4, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true }, cost: 0.15 },
    'veo-3.1-fast': { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', dur: [4, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, refImages: true, audio: true }, cost: 0.08 },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', icon: '🌱', dur: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3'], has: { firstFrame: true, lastFrame: true }, cost: 0.05 },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', dur: [1, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true }, cost: 0.08 },
}

/* ── CSS-in-JS (Safari + Chrome + Firefox safe) ── */
const css = `
.adv-wrap { max-width: 640px; margin: 0 auto; padding: 8px 16px 24px; }
.adv-wrap * { box-sizing: border-box; }
.adv-err { padding: 12px 16px; border-radius: 12px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; font-size: 13px; display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
.adv-err button { background: none; border: none; color: #fca5a5; cursor: pointer; padding: 0; }

/* Prompt Card */
.adv-prompt-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 20px; margin-bottom: 20px; }
.adv-textarea { width: 100%; background: transparent; border: none; outline: none; resize: vertical; color: #f1f5f9; font-size: 15px; line-height: 1.6; font-family: inherit; min-height: 100px; }
.adv-textarea::placeholder { color: rgba(148,163,184,0.5); }
.adv-prompt-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.04); }

/* Ref tags row */
.adv-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); }
.adv-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px 3px 3px; border-radius: 8px; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); }
.adv-tag img { width: 22px; height: 22px; border-radius: 6px; object-fit: cover; }
.adv-tag span { font-size: 11px; color: #c4b5fd; font-weight: 600; }
.adv-tag button { background: none; border: none; color: #f87171; cursor: pointer; padding: 0; font-size: 12px; margin-left: 2px; }
.adv-tag .uploading { font-size: 10px; color: #64748b; font-style: italic; }

/* @ Autocomplete */
.adv-autocomplete { position: absolute; bottom: 100%; left: 12px; background: #1e1e26; border: 1px solid rgba(139,92,246,0.3); border-radius: 10px; padding: 6px; display: flex; gap: 6px; z-index: 10; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.adv-ac-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 10px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); min-width: 60px; -webkit-appearance: none; appearance: none; }
.adv-ac-item:hover { border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.08); }
.adv-ac-item img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; }
.adv-ac-item span { font-size: 10px; color: #c4b5fd; font-weight: 600; }

/* Enhance Button */
.adv-enhance { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid rgba(139,92,246,0.25); background: linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.2)); color: #c4b5fd; -webkit-appearance: none; appearance: none; }
.adv-enhance:disabled { opacity: 0.4; cursor: default; }
.adv-chars { font-size: 11px; color: #475569; }

/* Config Row */
.adv-config { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; margin-bottom: 20px; }
.adv-config-item { display: flex; flex-direction: column; gap: 4px; }
.adv-config-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
.adv-select { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 8px 12px; color: #e2e8f0; font-size: 13px; outline: none; cursor: pointer; font-weight: 500; -webkit-appearance: menulist-button; appearance: auto; }
.adv-select option { background: #1c1c20; color: #e2e8f0; }
.adv-quality-row { display: flex; gap: 4px; }
.adv-pill { padding: 8px 14px; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.04); color: #94a3b8; -webkit-appearance: none; appearance: none; }
.adv-pill.active { background: rgba(139,92,246,0.12); color: #c4b5fd; border-color: rgba(139,92,246,0.3); }

/* Feature Cards Grid */
.adv-features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
@media (max-width: 480px) { .adv-features { grid-template-columns: 1fr; } }
.adv-fcard { padding: 16px; border-radius: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); }
.adv-fcard.has-content { background: rgba(139,92,246,0.06); border-color: rgba(139,92,246,0.25); }
.adv-fcard-head { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
.adv-fcard-head .icon { font-size: 18px; }
.adv-fcard-head .title { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.adv-fcard-head .remove { margin-left: auto; background: none; border: none; color: #f87171; cursor: pointer; font-size: 16px; padding: 0; }
.adv-fcard-head .hint { margin-left: auto; font-size: 10px; color: #64748b; }
.adv-fcard-preview { width: 100%; height: 80px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.08); display: block; }
.adv-fcard-btns { display: flex; gap: 8px; }
.adv-fcard-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 10px 8px; border-radius: 10px; font-size: 12px; font-weight: 500; cursor: pointer; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: #94a3b8; -webkit-appearance: none; appearance: none; }
.adv-fcard-btn:hover { border-color: rgba(139,92,246,0.3); color: #c4b5fd; }
.adv-fcard-btn.ai { background: linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.12)); color: #c4b5fd; border-color: rgba(139,92,246,0.2); }
.adv-fcard-btn.ai:disabled { opacity: 0.5; }
.adv-fcard-attached { font-size: 12px; color: #94a3b8; }

/* Ref Images specific */
.adv-ref-grid { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.adv-ref-thumb { position: relative; width: 52px; height: 52px; flex-shrink: 0; }
.adv-ref-thumb img { width: 100%; height: 100%; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.08); display: block; }
.adv-ref-thumb .label { position: absolute; bottom: -3px; left: 0; right: 0; text-align: center; font-size: 8px; color: #c4b5fd; font-weight: 700; }
.adv-ref-thumb .del { position: absolute; top: -4px; right: -4px; width: 16px; height: 16px; border-radius: 50%; background: #ef4444; color: #fff; border: none; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
.adv-ref-add { width: 52px; height: 52px; border-radius: 8px; border: 2px dashed rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; background: none; -webkit-appearance: none; appearance: none; }

/* Library */
.adv-library { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 16px; margin-bottom: 20px; }
.adv-library-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.adv-library-head span { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.adv-library-head button { background: none; border: none; color: #94a3b8; cursor: pointer; }
.adv-library-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; max-height: 160px; overflow-y: auto; }
.adv-library-grid img { width: 100%; height: 56px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); display: block; }
.adv-library-grid img:hover { border-color: rgba(139,92,246,0.4); }

/* Generate Button */
.adv-generate { width: 100%; padding: 16px; border-radius: 16px; font-weight: 700; font-size: 15px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 10px; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%); box-shadow: 0 4px 24px rgba(124,58,237,0.3); -webkit-appearance: none; appearance: none; }
.adv-generate:disabled { opacity: 0.5; cursor: default; background: rgba(255,255,255,0.06); color: #475569; box-shadow: none; }

/* Generating / Done phases */
.adv-gen-card { max-width: 480px; margin: 0 auto; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; overflow: hidden; }
.adv-gen-preview { position: relative; width: 100%; padding-bottom: 56.25%; background: linear-gradient(135deg, #0f172a, #1e293b); }
.adv-gen-preview img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; }
.adv-gen-preview .badges { position: absolute; top: 12px; left: 12px; display: flex; gap: 8px; }
.adv-gen-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
.adv-gen-info { padding: 16px 20px; }
.adv-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.06); overflow: hidden; }
.adv-progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #7c3aed, #06b6d4); transition: width 1s ease; }

.adv-done-card { max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; overflow: hidden; margin-bottom: 16px; }
.adv-done-card video { width: 100%; display: block; }
.adv-done-btns { display: flex; gap: 12px; max-width: 600px; margin: 0 auto; }
.adv-btn-secondary { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid rgba(139,92,246,0.25); background: rgba(139,92,246,0.12); color: #c4b5fd; -webkit-appearance: none; appearance: none; }
.adv-btn-primary { padding: 12px 20px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; text-decoration: none; -webkit-appearance: none; appearance: none; }

@keyframes adv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.adv-spin { animation: adv-spin 1s linear infinite; }
`

export default function AdvancedMode({ activeBrand, initialData }) {
    const [model, setModel] = useState('seedance-2.0')
    const [prompt, setPrompt] = useState('')
    const [duration, setDuration] = useState(6)
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('fast')
    const [phase, setPhase] = useState('compose')

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
    const pollRef = useRef(null)
    const promptRef = useRef(null)

    const m = MODELS[model] || MODELS['seedance-2.0']
    const credits = Math.ceil(m.cost * duration * 30)

    // ── Refill from initialData (history re-use) ──
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
                id: `refill-${i}-${Date.now()}`, url: r.url || r, label: r.label || `@image${i + 1}`, uploading: false
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

    // ── File uploads (auto-upload to get hosted URLs) ──
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
            setRefImages(prev => [...prev, { id, url: r.result, label: `@image${prev.length + 1}`, uploading: true }])
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

    // ── @ Autocomplete ──
    function handlePromptChange(e) {
        const val = e.target.value
        setPrompt(val)
        // Check if user just typed @
        const cursorPos = e.target.selectionStart
        const textBeforeCursor = val.substring(0, cursorPos)
        if (textBeforeCursor.endsWith('@') && refImages.length > 0) {
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }
    function insertTag(index) {
        const tag = `@image${index + 1}`
        const textarea = promptRef.current
        if (textarea) {
            const cursorPos = textarea.selectionStart
            // Replace the @ with the full tag
            const before = prompt.substring(0, cursorPos - 1) // remove the @
            const after = prompt.substring(cursorPos)
            setPrompt(before + tag + ' ' + after)
        } else {
            setPrompt(prev => prev + tag + ' ')
        }
        setShowAutocomplete(false)
    }

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

    // ── Build prompt — leave @image tags as descriptive context ──
    // Images are sent separately via referenceImages array → PiAPI's image_urls
    function buildFinalPrompt() {
        return prompt.trim()
    }

    // ── Generate ──
    async function handleGenerate() {
        if (!prompt.trim()) { setError('Write your ad idea first'); return }
        setLoading(true); setError('')
        try {
            // Send ALL ref images (base64 or URL) — PiAPI supports both
            const allRefUrls = refImages.map(r => r.url).filter(Boolean)
            console.log(`🎬 Sending ${allRefUrls.length} ref images to backend`)

            const d = await api('/video-studio/advanced/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: buildFinalPrompt(), model, duration, resolution: '1080p', aspectRatio,
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

    // Build dynamic feature list based on model
    const features = []
    if (m.has.firstFrame) features.push('firstFrame')
    if (m.has.lastFrame) features.push('lastFrame')
    if (m.has.refImages) features.push('refImages')
    if (m.has.refVideo) features.push('refVideo')
    if (m.has.refAudio) features.push('refAudio')

    // ════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════
    return (
        <>
            <style>{css}</style>

            {/* ── GENERATING ── */}
            {phase === 'generating' && (
                <div style={{ padding: '60px 20px' }}>
                    <div className="adv-gen-card">
                        <div className="adv-gen-preview">
                            {firstFrame?.url && <img src={firstFrame.url} alt="" />}
                            <div className="badges">
                                <span className="adv-gen-badge" style={{ background: 'rgba(139,92,246,0.85)', color: '#fff' }}>{generation?.progress || 5}%</span>
                                <span className="adv-gen-badge" style={{ background: 'rgba(0,0,0,0.5)', color: '#ccc' }}>{m.name}</span>
                            </div>
                        </div>
                        <div className="adv-gen-info">
                            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>🎬 Creating your ad film — usually 1-3 minutes</p>
                            <div className="adv-progress-bar"><div className="adv-progress-fill" style={{ width: `${generation?.progress || 5}%` }} /></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DONE ── */}
            {phase === 'done' && (
                <div style={{ padding: '20px' }}>
                    {generation?.videoUrl ? (
                        <>
                            <div className="adv-done-card"><video controls src={projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl} /></div>
                            <div className="adv-done-btns">
                                <button className="adv-btn-secondary" onClick={() => { setPhase('compose'); setGeneration(null) }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span> Edit & Retry
                                </button>
                                <button className="adv-btn-primary" onClick={async () => {
                                    try {
                                        const videoSrc = projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl
                                        const resp = await fetch(videoSrc)
                                        const blob = await resp.blob()
                                        const blobUrl = URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = blobUrl
                                        a.download = 'video.mp4'
                                        document.body.appendChild(a)
                                        a.click()
                                        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
                                    } catch { const videoSrc = projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl; window.open(videoSrc, '_blank') }
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span> Download
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#475569' }}>videocam_off</span>
                            <p style={{ color: '#64748b', fontSize: '14px', margin: '12px 0 16px' }}>{error || 'Generation failed'}</p>
                            <button className="adv-btn-secondary" onClick={() => { setPhase('compose'); setError('') }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> Try Again
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── COMPOSE ── */}
            {phase === 'compose' && (
                <div className="adv-wrap">
                    {error && (
                        <div className="adv-err">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
                            <span style={{ flex: 1 }}>{error}</span>
                            <button onClick={() => setError('')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span></button>
                        </div>
                    )}

                    {/* §1 — PROMPT */}
                    <div className="adv-prompt-card" style={{ position: 'relative' }}>
                        <textarea
                            ref={promptRef}
                            className="adv-textarea"
                            value={prompt}
                            onChange={handlePromptChange}
                            placeholder={activeBrand?.name
                                ? `What's your ${activeBrand.name} ad about? Type @ to tag ref images...`
                                : `What's your ad about? Type @ to tag ref images...`}
                        />
                        {/* @ Autocomplete popup */}
                        {showAutocomplete && refImages.length > 0 && (
                            <div className="adv-autocomplete">
                                {refImages.map((img, i) => (
                                    <button key={img.id} className="adv-ac-item" onClick={() => insertTag(i)}>
                                        <img src={img.url} alt="" />
                                        <span>@image{i + 1}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {/* Ref image tags */}
                        {refImages.length > 0 && (
                            <div className="adv-tags">
                                {refImages.map((img, i) => {
                                    const isLinked = prompt.includes(`@image${i + 1}`)
                                    return (
                                        <div key={img.id} className="adv-tag" style={isLinked ? { borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)' } : {}}>
                                            <img src={img.url} alt="" />
                                            <span style={isLinked ? { color: '#4ade80' } : {}}>@image{i + 1}</span>
                                            {isLinked && <span style={{ fontSize: 10 }}>🔗</span>}
                                            {!isLinked && !img.uploading && <span style={{ fontSize: 9, color: '#64748b' }}>type @ to link</span>}
                                            {img.uploading && <span className="uploading">uploading...</span>}
                                            <button onClick={() => setRefImages(prev => prev.filter(r => r.id !== img.id))}>×</button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <div className="adv-prompt-footer">
                            <button className="adv-enhance" onClick={handleEnhance} disabled={enhancing || !prompt.trim()}>
                                {enhancing ? <><span className="material-symbols-outlined adv-spin" style={{ fontSize: '14px' }}>progress_activity</span> Enhancing...</> : <>✨ Enhance as Ad Film</>}
                            </button>
                            <span className="adv-chars">{prompt.length} chars</span>
                        </div>
                    </div>

                    {/* §2 — CONFIG ROW */}
                    <div className="adv-config">
                        <div className="adv-config-item">
                            <span className="adv-config-label">Model</span>
                            <select className="adv-select" value={model} onChange={e => setModel(e.target.value)}>
                                {Object.values(MODELS).map(mod => <option key={mod.id} value={mod.id}>{mod.icon} {mod.name}</option>)}
                            </select>
                        </div>
                        <div className="adv-config-item">
                            <span className="adv-config-label">Ratio</span>
                            <select className="adv-select" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)}>
                                {m.ratios.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div className="adv-config-item">
                            <span className="adv-config-label">Duration</span>
                            <select className="adv-select" value={duration} onChange={e => setDuration(Number(e.target.value))}>
                                {Array.from({ length: m.dur[1] - m.dur[0] + 1 }, (_, i) => m.dur[0] + i).map(d => <option key={d} value={d}>{d}s</option>)}
                            </select>
                        </div>
                        <div className="adv-config-item">
                            <span className="adv-config-label">Quality</span>
                            <div className="adv-quality-row">
                                <button className={`adv-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}>⚡ Fast</button>
                                <button className={`adv-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}>✨ Quality</button>
                            </div>
                        </div>
                    </div>

                    {/* §3 — DYNAMIC FEATURE CARDS */}
                    <div className="adv-features">
                        {/* First Frame */}
                        {m.has.firstFrame && (
                            <div className={`adv-fcard ${firstFrame ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">📸</span>
                                    <span className="title">First Frame</span>
                                    {firstFrame && <button className="remove" onClick={() => setFirstFrame(null)}>×</button>}
                                </div>
                                {firstFrame ? (
                                    <img className="adv-fcard-preview" src={firstFrame.url} alt="First frame" />
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => firstFrameRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload
                                        </button>
                                        <button className="adv-fcard-btn ai" onClick={generateFirstFrame} disabled={generatingFrame}>
                                            {generatingFrame ? <span className="material-symbols-outlined adv-spin" style={{ fontSize: '16px' }}>progress_activity</span> : '✨'} AI
                                        </button>
                                        <button className="adv-fcard-btn" onClick={() => loadLibrary('first')}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span>
                                        </button>
                                    </div>
                                )}
                                <input ref={firstFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setFirstFrame)} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Last Frame */}
                        {m.has.lastFrame && (
                            <div className={`adv-fcard ${lastFrame ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🎬</span>
                                    <span className="title">Last Frame</span>
                                    {lastFrame && <button className="remove" onClick={() => setLastFrame(null)}>×</button>}
                                </div>
                                {lastFrame ? (
                                    <img className="adv-fcard-preview" src={lastFrame.url} alt="Last frame" />
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => lastFrameRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload
                                        </button>
                                        <button className="adv-fcard-btn" onClick={() => loadLibrary('last')}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span>
                                        </button>
                                    </div>
                                )}
                                <input ref={lastFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setLastFrame)} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Ref Images */}
                        {m.has.refImages && (
                            <div className={`adv-fcard ${refImages.length > 0 ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🎞️</span>
                                    <span className="title">Ref Images</span>
                                    <span className="hint">Use @image1 in prompt</span>
                                </div>
                                <div className="adv-ref-grid">
                                    {refImages.map((img, i) => (
                                        <div key={img.id} className="adv-ref-thumb">
                                            <img src={img.url} alt="" />
                                            <span className="label">@image{i + 1}</span>
                                            <button className="del" onClick={() => setRefImages(prev => prev.filter(r => r.id !== img.id))}>×</button>
                                        </div>
                                    ))}
                                    <button className="adv-ref-add" onClick={() => refImgRef.current?.click()}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
                                    </button>
                                </div>
                                <input ref={refImgRef} type="file" accept="image/*" onChange={onRefFile} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Ref Video */}
                        {m.has.refVideo && (
                            <div className={`adv-fcard ${refVideo ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🎥</span>
                                    <span className="title">Ref Video</span>
                                    {refVideo && <button className="remove" onClick={() => setRefVideo(null)}>×</button>}
                                </div>
                                {refVideo ? (
                                    <p className="adv-fcard-attached">📎 {refVideo.name || 'Video attached'}</p>
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => refVideoRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload Video
                                        </button>
                                    </div>
                                )}
                                <input ref={refVideoRef} type="file" accept="video/*" onChange={e => onMediaFile(e, setRefVideo)} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Ref Audio */}
                        {m.has.refAudio && (
                            <div className={`adv-fcard ${refAudio ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🔊</span>
                                    <span className="title">Ref Audio</span>
                                    {refAudio && <button className="remove" onClick={() => setRefAudio(null)}>×</button>}
                                </div>
                                {refAudio ? (
                                    <p className="adv-fcard-attached">🎵 {refAudio.name || 'Audio attached'}</p>
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => refAudioRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload Audio
                                        </button>
                                    </div>
                                )}
                                <input ref={refAudioRef} type="file" accept="audio/*" onChange={e => onMediaFile(e, setRefAudio)} style={{ display: 'none' }} />
                            </div>
                        )}
                    </div>

                    {/* Library Modal */}
                    {showLibrary && (
                        <div className="adv-library">
                            <div className="adv-library-head">
                                <span>📚 Image Library</span>
                                <button onClick={() => setShowLibrary(false)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                </button>
                            </div>
                            {libraryLoading ? <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
                                : libraryImages.length === 0 ? <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '16px 0' }}>No images yet</p>
                                    : <div className="adv-library-grid">{libraryImages.map((img, i) => <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => pickFromLibrary(img)} />)}</div>
                            }
                        </div>
                    )}

                    {/* §4 — GENERATE BUTTON */}
                    <button className="adv-generate" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
                        {loading ? <><span className="material-symbols-outlined adv-spin" style={{ fontSize: '18px' }}>progress_activity</span> Submitting to {m.name}...</> : <>🎬 Generate Ad Film · {credits} credits · ~2 min</>}
                    </button>
                </div>
            )}
        </>
    )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import AvatarPicker from './AvatarPicker'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const isFormData = opts.body instanceof FormData
    const headers = isFormData ? { Authorization: `Bearer ${token}`, ...(opts.headers||{}) } : { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(opts.headers||{}) }
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error(`Server error ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

const DURS = [{value:5,label:'5s',msIcon:'timer'},{value:8,label:'8s',msIcon:'timer'},{value:10,label:'10s',msIcon:'timer'},{value:15,label:'15s',msIcon:'timer'}]
const FMTS = [{value:'9:16',label:'9:16',msIcon:'crop_portrait'},{value:'16:9',label:'16:9',msIcon:'crop_landscape'},{value:'1:1',label:'1:1',msIcon:'crop_square'}]
const VIDEO_MODELS = [
    {value:'seedance-2.0',label:'Seedance 2.0',msIcon:'local_movies'},
    {value:'happyhorse-1.0',label:'HappyHorse 1.0',msIcon:'pets'},
    {value:'grok-imagine',label:'Grok Imagine',msIcon:'smart_toy'},
    {value:'kling-3.0',label:'Kling 3.0',msIcon:'videocam'},
    {value:'veo-3.1',label:'Veo 3.1',msIcon:'movie'},
    {value:'veo-3.1-fast',label:'Veo 3.1 Fast',msIcon:'bolt'},
    {value:'seedance-1.0',label:'Seedance 1.0',msIcon:'speed'},
]

const css = `
.qv2-root {
    --sys-surface-glass: color-mix(in srgb, var(--sys-surface) 85%, transparent);
    --sys-surface-raised: color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface));
    --sys-surface-hover: color-mix(in srgb, var(--sys-text) 10%, var(--sys-surface));
    position: relative;
    width: 100%;
    min-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
}
.qv2-bg {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    padding: 24px;
    padding-bottom: 400px;
    opacity: .9;
}
.qv2-bi {
    aspect-ratio: 9/16;
    border-radius: 12px;
    overflow: hidden;
    background: var(--sys-surface);
    border: 1px solid var(--sys-border);
    position: relative;
}
.qv2-bi video {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
}
.qv2-bi:hover {
    transform: scale(1.02);
    z-index: 2;
    box-shadow: 0 10px 30px rgba(0,0,0,.5);
}
.qv2-bi-ov {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 40%);
    opacity: 0;
    transition: opacity 0.2s;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 12px;
}
.qv2-bi:hover .qv2-bi-ov {
    opacity: 1;
}
.qv2-bi-btn {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(4px);
    border: none;
    border-radius: 50%;
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
}
.qv2-bi-btn:hover {
    background: rgba(255,255,255,0.3);
    transform: scale(1.1);
}
.qv2-bi-btn.reuse {
    border-radius: 16px;
    width: auto;
    padding: 0 12px;
    font-size: 11px;
    font-weight: 700;
    gap: 4px;
}
.qv2-lay {
    position: fixed;
    bottom: 0; left: 0;
    width: 100%;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 16px 32px;
    pointer-events: none;
    gap: 16px;
}
.qv2-lay * {
    pointer-events: auto;
}

/* Scott Box Panel */
.scott-panel {
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    max-width: 900px;
    width: 100%;
    backdrop-filter: blur(20px);
}
.scott-input-wrapper {
    display: flex;
    align-items: center;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    flex: 1;
    padding: 0 12px;
    border: 1px solid rgba(255,255,255,0.05);
}
.scott-input-wrapper:focus-within {
    border-color: rgba(255,255,255,0.2);
}
.scott-input {
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 14px;
    width: 100%;
    padding: 12px 0;
    font-family: inherit;
}
.scott-input::placeholder {
    color: rgba(255,255,255,0.4);
}
.scott-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: -4px;
}
.scott-btn-cfg {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.8);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}
.scott-btn-cfg:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
}
.scott-btn-cfg .material-symbols-outlined {
    font-size: 16px;
}

.scott-block-btn {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    background: #2a2a2a;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: rgba(255,255,255,0.8);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    position: relative;
    overflow: hidden;
}
.scott-block-btn:hover {
    background: #333;
    border-color: rgba(255,255,255,0.2);
    color: #fff;
}
.scott-block-btn.active {
    border-color: #10b981;
    color: #10b981;
}
.scott-block-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.6;
}
.scott-block-btn.active .scott-block-img {
    opacity: 1;
}

.scott-generate {
    background: linear-gradient(135deg, #ff4d85, #ff2a5f);
    color: #fff;
    border: none;
    border-radius: 12px;
    padding: 0 24px;
    height: 72px;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
}
.scott-generate:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(255, 42, 95, 0.4);
}
.scott-generate:disabled {
    background: #444;
    color: #888;
    cursor: default;
    transform: none;
    box-shadow: none;
}

/* Modals */
.scott-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(5px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    animation: qv2-fade-in 0.2s forwards;
}
@keyframes qv2-fade-in { to { opacity: 1; } }
.scott-modal {
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    width: 100%;
    max-width: 800px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 48px rgba(0,0,0,0.6);
    overflow: hidden;
}
.scott-modal-hdr {
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.scott-modal-close {
    width: 32px; height: 32px;
    border-radius: 16px;
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
}
.scott-modal-close:hover {
    background: rgba(255,255,255,0.2);
}

/* Avatar Modal Specifics */
.avatar-modal-body {
    padding: 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}
.avatar-card {
    background: #222;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    position: relative;
    overflow: hidden;
}
.avatar-preview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}

/* Category Grid */
.cat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    padding: 24px;
    overflow-y: auto;
}
.cat-card {
    aspect-ratio: 3/4;
    border-radius: 12px;
    background: #2a2a2a;
    border: 2px solid transparent;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.2s;
    padding: 12px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
}
.cat-card:hover {
    border-color: rgba(255,255,255,0.3);
}
.cat-card.active {
    border-color: #10b981;
}
.cat-card-ov {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%);
    z-index: 1;
}

/* Active Output Card */
.scott-output-card {
    width: 100%;
    max-width: 900px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 16px;
    backdrop-filter: blur(20px);
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

@keyframes spin { 100% { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
`;

function CfgMenu({ value, onChange, options, icon }) {
    const [open, setOpen] = useState(false); const ref = useRef(null)
    useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
    const sel = options.find(o => o.value === value) || options[0]
    return <div style={{ position: 'relative' }} ref={ref}>
        <button type="button" className="scott-btn-cfg" onClick={() => setOpen(!open)}>
            {icon && <span className="material-symbols-outlined">{icon}</span>}
            <span>{sel?.label || value}</span>
        </button>
        {open && <div className="qv2-cmenu" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 8, zIndex: 100, minWidth: 100 }}>
            {options.map(o => <button key={o.value || o} type="button" className="qv2-copt" style={{ width: '100%', padding: '8px', background: 'transparent', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', borderRadius: 6 }} onClick={() => { onChange(o.value || o); setOpen(false) }}>
                {o.label || o}
            </button>)}
        </div>}
    </div>
}

function GridVideo({ project, onReuse }) {
    const vRef = useRef(null)
    const [liked, setLiked] = useState(false)
    return <div 
        className="qv2-bi" 
        onMouseEnter={() => vRef.current?.play()} 
        onMouseLeave={() => { if(vRef.current) { vRef.current.pause(); vRef.current.currentTime = 0; } }}
    >
        <video ref={vRef} src={project.generation.videoUrl} muted loop playsInline />
        <div className="qv2-bi-ov">
            <button className="qv2-bi-btn reuse" onClick={() => onReuse(project)}>
                <span className="material-symbols-outlined" style={{fontSize: 14}}>replay</span>
                Reuse
            </button>
            <button className="qv2-bi-btn" onClick={() => setLiked(!liked)} style={{ color: liked ? '#ff4d85' : '#fff' }}>
                <span className="material-symbols-outlined" style={{fontSize: 18, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0"}}>{liked ? 'favorite' : 'favorite_border'}</span>
            </button>
        </div>
    </div>
}

export default function QAdsV2({ activeBrand, projects = [], onVideoComplete }) {
    const [categories, setCategories] = useState([])
    const [presets, setPresets] = useState([])
    const [selP, setSelP] = useState(null)
    const [selectedCategory, setSelectedCategory] = useState(null)
    const [productUrl, setProductUrl] = useState('')
    const [productData, setProductData] = useState(null)
    const [productImgs, setProductImgs] = useState([])
    const [avatarUrl, setAvatarUrl] = useState(null)
    const [avatarDesc, setAvatarDesc] = useState('')
    const [avatarBusy, setAvatarBusy] = useState(false)
    const [duration, setDuration] = useState(8)
    const [format, setFormat] = useState('9:16')
    const [selectedModel, setSelectedModel] = useState('seedance-2.0')
    const [userBrief, setUserBrief] = useState('')

    // Modals
    const [showAvatar, setShowAvatar] = useState(false)
    const [showCats, setShowCats] = useState(false)
    const [showProduct, setShowProduct] = useState(false)
    const prodRef = useRef(null)
    const fileRef = useRef(null)
    const prodImgRef = useRef(null)  // product image file upload
    const [isAnalyzing, setIsAnalyzing] = useState(false)

    // Prompt generation state (3 variants)
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false)
    const [promptStage, setPromptStage] = useState('')
    const [variants, setVariants] = useState([])   // [{ variantId, prompt, legend }]
    const [legend, setLegend] = useState('')

    // Per-variant video generation state
    // { A: { status, progress, videoUrl, jobId, error }, B: {...}, C: {...} }
    const [videoJobs, setVideoJobs] = useState({})
    const pollRefs = useRef({})

    const [error, setError] = useState(null)

    useEffect(() => {
        api('/video-studio/ugc-pro/qads/v2/presets').then(d => {
            setPresets(d.presets || [])
            setCategories(d.categories || [])
            if (d.presets?.length > 0 && !selP) setSelP(d.presets[0].id)
        }).catch(() => {})
    }, [])

    const handleAvatarUpload = useCallback(async file => {
        setAvatarBusy(true); setError(null)
        try {
            const form = new FormData(); form.append('avatarImage', file)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: form, headers: {} })
            setAvatarUrl(d.avatarUrl)
            setShowAvatar(false) // Auto-close modal after successful upload
        } catch (e) { setError(e.message) }
        setAvatarBusy(false)
    }, [activeBrand])

    const handleAvatarGenerate = useCallback(async () => {
        if (!avatarDesc.trim()) { setError('Describe your avatar'); return }
        setAvatarBusy(true); setError(null)
        try {
            const d = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: JSON.stringify({ brandId: activeBrand?._id, description: avatarDesc, environment: 'home' }) })
            setAvatarUrl(d.avatarUrl)
            setShowAvatar(false) // Auto-close modal after successful generation
        } catch (e) { setError(e.message) }
        setAvatarBusy(false)
    }, [avatarDesc, activeBrand])

    // Upload product image directly (no URL needed)
    const handleProductImageUpload = useCallback(async (file) => {
        setIsAnalyzing(true); setError(null)
        try {
            const form = new FormData()
            form.append('avatarImage', file) // reuse the upload endpoint
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: form, headers: {} })
            setProductImgs(prev => [d.avatarUrl, ...prev])
        } catch (e) { setError(e.message) }
        setIsAnalyzing(false)
    }, [activeBrand])

    // Analyze product URL and fetch data
    const handleAnalyze = useCallback(async () => {
        if (!productUrl.trim()) { setError('Enter a product URL first'); return }
        setIsAnalyzing(true); setError(null)
        try {
            const form = new FormData()
            form.append('productUrl', productUrl)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/analyze-product', { method: 'POST', body: form, headers: {} })
            setProductData(d.productData)
            setProductImgs(d.productImageUrls || [])
        } catch (e) { setError(e.message) }
        setIsAnalyzing(false)
    }, [productUrl, activeBrand])


    // Step 1 — Generate 3 prompt variants (single Claude call)
    const generatePrompts = useCallback(async () => {
        if (!selP) { setError('Select a format first.'); return }
        setIsGeneratingPrompts(true); setError(null); setVariants([]); setLegend(''); setVideoJobs({})

        try {
            let pData = productData
            let pImgs = productImgs

            if (!pData && productUrl.trim()) {
                setPromptStage('Analyzing product...')
                const form = new FormData()
                form.append('productUrl', productUrl)
                if (activeBrand?._id) form.append('brandId', activeBrand._id)
                const d = await api('/video-studio/ugc-pro/analyze-product', { method: 'POST', body: form, headers: {} })
                pData = d.productData; pImgs = d.productImageUrls || []
                setProductData(pData); setProductImgs(pImgs)
            }

            setPromptStage('Writing 3 cinematic variants...')
            const res = await api('/video-studio/ugc-pro/qads/v2/generate-prompts', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id,
                    presetId: selP,
                    userBrief,
                    productData: pData,
                    settings: { duration, format, model: selectedModel },
                    avatarUrl: avatarUrl || null,
                    productImageUrls: pImgs
                })
            })

            setVariants(res.variants || [])
            setLegend(res.variants?.[0]?.legend || '')
        } catch (e) {
            setError(e.message)
        } finally {
            setIsGeneratingPrompts(false)
            setPromptStage('')
        }
    }, [selP, userBrief, productData, productUrl, productImgs, duration, format, avatarUrl, activeBrand])

    // Step 2 — Generate video for one variant
    const generateVideo = useCallback(async (variant) => {
        const vid = variant.variantId
        setVideoJobs(prev => ({ ...prev, [vid]: { status: 'generating', progress: 3 } }))
        setError(null)

        try {
            const res = await api('/video-studio/ugc-pro/qads/v2/generate-video', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id,
                    presetId: selP,
                    variantId: vid,
                    prompt: variant.prompt,
                    legend: variant.legend || '',
                    productImageUrls: productImgs,
                    avatarUrl: avatarUrl || null,
                    settings: { duration, format, model: selectedModel }
                })
            })

            const jobId = res.jobId || res.requestId || res.falRequestId
            setVideoJobs(prev => ({ ...prev, [vid]: { status: 'generating', progress: 5, jobId } }))

            // Start polling against the correct VideoProject endpoint
            pollRefs.current[vid] = setInterval(async () => {
                try {
                    const d = await api(`/video-studio/ugc-pro/qads/v2/status/${jobId}`)
                    if (d) {
                        const status = d.status === 'COMPLETED' ? 'done'
                            : d.status === 'FAILED' ? 'failed'
                            : 'generating'
                        setVideoJobs(prev => ({
                            ...prev,
                            [vid]: {
                                ...prev[vid],
                                status,
                                progress: d.progress || prev[vid]?.progress,
                                videoUrl: d.videoUrl || prev[vid]?.videoUrl,
                                error: d.error
                            }
                        }))
                        if (status === 'done' || status === 'failed') {
                            clearInterval(pollRefs.current[vid])
                            // Refresh parent history panel so the completed video appears
                            if (status === 'done' && onVideoComplete) onVideoComplete()
                        }
                    }
                } catch (_) {}
            }, 5000)
        } catch (e) {
            setVideoJobs(prev => ({ ...prev, [vid]: { status: 'failed', error: e.message } }))
        }
    }, [selP, productImgs, avatarUrl, duration, format, selectedModel, activeBrand])

    useEffect(() => {
        return () => Object.values(pollRefs.current).forEach(clearInterval)
    }, [])

    const handleReuse = useCallback((project) => {
        if (project.settings?.duration) setDuration(project.settings.duration)
        if (project.settings?.format) setFormat(project.settings.format)
        if (project.categoryId) setSelP(project.categoryId)
        setUserBrief(project.title || '')
    }, [])

    const selectedPreset = presets.find(p => (p.presetCode || p.id) === selP)

    return <div className="qv2-root">
        <style>{css}</style>

        <div className="qv2-bg">
            {/* Show completed videos: from projects history OR from current session videoJobs */}
            {[
                // Projects from DB history
                ...projects.filter(p => p.studioMode === 'q-ads-v2' && p.generation?.videoUrl),
                // Current session jobs that completed (not yet in DB history)
                ...Object.entries(videoJobs)
                    .filter(([, j]) => j.status === 'done' && j.videoUrl && !projects.some(p => p.generation?.videoUrl === j.videoUrl))
                    .map(([variantId, j]) => ({ _id: variantId, title: `Variant ${variantId}`, generation: { videoUrl: j.videoUrl }, studioMode: 'q-ads-v2' }))
            ].map(p => (
                <GridVideo key={p._id} project={p} onReuse={handleReuse} />
            ))}
        </div>

        <div className="qv2-lay">

            {/* Error banner */}
            {error && <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 16px', margin: '0 0 8px', color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>{error}
            </div>}

            {/* Generating prompts loader */}
            {isGeneratingPrompts && <div className="scott-output-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
                <span className="material-symbols-outlined spin" style={{ fontSize: 36, color: '#10b981' }}>auto_awesome</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{promptStage || 'Writing cinematic prompts...'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Claude is channeling 13 engine rules + your brand DNA</div>
            </div>}

            {/* 3 Variant Cards */}
            {variants.length > 0 && !isGeneratingPrompts && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {variants.map(v => {
                        const job = videoJobs[v.variantId] || {}
                        return (
                            <div key={v.variantId} style={{ flex: '0 0 320px', background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Variant label + word count */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#10b981' }}>VARIANT {v.variantId}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{v.prompt?.split(/\s+/).length || 0}w</div>
                                </div>

                                {/* Prompt preview (scrollable) */}
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxHeight: 140, overflowY: 'auto', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    {v.prompt}
                                </div>

                                {/* Video output or generate button */}
                                {job.status === 'done' && job.videoUrl ? (
                                    <div>
                                        <video src={job.videoUrl} controls autoPlay loop playsInline style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 180 }} />
                                        <a href={job.videoUrl} download target="_blank" rel="noreferrer" style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>Download
                                        </a>
                                    </div>
                                ) : job.status === 'generating' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                                        <span className="material-symbols-outlined spin" style={{ fontSize: 28, color: '#10b981' }}>autorenew</span>
                                        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${job.progress || 5}%`, background: '#10b981', transition: 'width 1.5s linear' }} />
                                        </div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{(VIDEO_MODELS.find(m => m.value === selectedModel)?.label || 'AI')} is generating...</div>
                                    </div>
                                ) : job.status === 'failed' ? (
                                    <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 0' }}>{job.error || 'Generation failed'}</div>
                                ) : (
                                    <button
                                        onClick={() => generateVideo(v)}
                                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: 0.5 }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>videocam</span>
                                        Generate Video · 8 credits
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Scott Panel — two row layout */}
            <div className="scott-panel" style={{ flexDirection: 'column', gap: 8, padding: '12px 16px' }}>

                {/* Row 1: Brief input */}
                <div className="scott-input-wrapper" style={{ width: '100%' }}>
                    <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.3)', marginRight: 10, fontSize: 18 }}>edit</span>
                    <input
                        type="text"
                        className="scott-input"
                        placeholder="Describe the ad — what should happen, who stars in it, the mood..."
                        value={userBrief}
                        onChange={e => setUserBrief(e.target.value)}
                        disabled={isGeneratingPrompts}
                    />
                </div>

                {/* Row 2: Config + blocks + generate */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>

                    {/* Format picker */}
                    <button type="button" className="scott-btn-cfg" onClick={() => setShowCats(true)} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 12px', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{selectedPreset?.msIcon || 'movie'}</span>
                        <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPreset?.name || 'Format'}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, opacity: 0.5 }}>expand_more</span>
                    </button>

                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                    <CfgMenu value={format} onChange={setFormat} options={FMTS} icon="crop" />
                    <CfgMenu value={duration} onChange={setDuration} options={DURS} icon="timer" />

                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                    <CfgMenu value={selectedModel} onChange={setSelectedModel} options={VIDEO_MODELS} icon="smart_toy" />

                    <div style={{ flex: 1 }} />

                    {/* Product block */}
                    <button className={`scott-block-btn ${productUrl || productImgs.length ? 'active' : ''}`} onClick={() => setShowProduct(true)} style={{ width: 64, height: 56 }}>
                        {productImgs?.[0] && <img src={productImgs[0]} className="scott-block-img" alt="" />}
                        <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>inventory_2</span>
                        <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>{productData ? 'READY' : 'PRODUCT'}</span>
                    </button>

                    {/* Avatar block */}
                    <button className={`scott-block-btn ${avatarUrl ? 'active' : ''}`} onClick={() => setShowAvatar(true)} style={{ width: 64, height: 56 }}>
                        {avatarUrl && <img src={avatarUrl} className="scott-block-img" alt="" />}
                        <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>person</span>
                        <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>AVATAR</span>
                    </button>

                    {/* Generate */}
                    <button className="scott-generate" onClick={generatePrompts} disabled={isGeneratingPrompts || (!productUrl && !productImgs.length)} style={{ height: 56, padding: '0 20px', fontSize: 13 }}>
                        {isGeneratingPrompts
                            ? <><span className="material-symbols-outlined spin" style={{ fontSize: 16 }}>autorenew</span> Writing...</>
                            : <>GET 3 VARIANTS <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span></>}
                    </button>
                </div>
            </div>
        </div>

        {/* Product Modal */}
        {showProduct && (
            <div className="scott-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowProduct(false) }}>
                <div className="scott-modal" style={{ maxWidth: 520 }}>
                    <div className="scott-modal-hdr">
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Add Product</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Add a URL and analyze, or upload product images directly</div>
                        </div>
                        <button className="scott-modal-close" onClick={() => setShowProduct(false)}><span className="material-symbols-outlined">close</span></button>
                    </div>

                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* URL + Analyze */}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase' }}>Product URL</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    type="text"
                                    value={productUrl}
                                    onChange={e => setProductUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                                    placeholder="https://example.com/product"
                                    style={{ flex: 1, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', outline: 'none', fontSize: 13 }}
                                />
                                <button
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing || !productUrl.trim()}
                                    style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: isAnalyzing ? 0.6 : 1 }}
                                >
                                    {isAnalyzing
                                        ? <><span className="material-symbols-outlined spin" style={{ fontSize: 16 }}>autorenew</span> Analyzing...</>
                                        : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span> Analyze</>}
                                </button>
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>OR</div>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                        </div>

                        {/* Image upload */}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase' }}>Upload Product Images</div>
                            <input type="file" ref={prodImgRef} accept="image/*" multiple style={{ display: 'none' }}
                                onChange={e => { Array.from(e.target.files).forEach(f => handleProductImageUpload(f)); e.target.value = '' }}
                            />
                            <button
                                onClick={() => prodImgRef.current?.click()}
                                disabled={isAnalyzing}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.12)', borderRadius: 12, padding: '20px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#10b981' }}>cloud_upload</span>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Click to upload product photos</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>JPG, PNG, WebP — multiple allowed</div>
                            </button>
                        </div>

                        {/* Uploaded image preview row */}
                        {productImgs.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {productImgs.map((u, i) => (
                                    <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                                        <img src={u} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} alt="" />
                                        <button onClick={() => setProductImgs(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 18, height: 18, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Product info if analyzed */}
                        {productData && (
                            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>✓ Product Analyzed</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{productData.productName}</div>
                                {productData.mainUSP && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{productData.mainUSP}</div>}
                            </div>
                        )}

                        <button onClick={() => setShowProduct(false)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Done</button>
                    </div>
                </div>
            </div>
        )}

        {/* Avatar Picker */}
        <AvatarPicker
            isOpen={showAvatar}
            onClose={() => setShowAvatar(false)}
            onSelect={(avatar) => setAvatarUrl(avatar.imageUrl)}
            activeBrand={activeBrand}
        />

        {/* Categories Modal */}
        {showCats && (
            <div className="scott-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setShowCats(false); setSelectedCategory(null); } }}>
                <div className="scott-modal" style={{ maxWidth: 900 }}>
                    <div className="scott-modal-hdr">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {selectedCategory && (
                                    <button onClick={() => setSelectedCategory(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
                                    </button>
                                )}
                                <div style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>
                                    {selectedCategory ? 'Pick a preset' : 'Pick the format that hits'}
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                                {selectedCategory ? 'Select a specific style for your video.' : 'From unboxing to UGC - choose the type of video that fits your product and audience.'}
                            </div>
                        </div>
                        <button className="scott-modal-close" onClick={() => { setShowCats(false); setSelectedCategory(null); }}><span className="material-symbols-outlined">close</span></button>
                    </div>
                    <div className="cat-grid">
                    {!selectedCategory ? (
                        categories.map(c => (
                            <div key={c.id} className="cat-card" onClick={() => setSelectedCategory(c)}>
                                {c.previewMediaUrl ? (
                                    c.previewMediaType === 'video' ? (
                                        <video src={c.previewMediaUrl} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} />
                                    ) : (
                                        <img src={c.previewMediaUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} alt={c.name} />
                                    )
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${c.color || '#4f46e5'} 0%, #1a1a1a 100%)`, opacity: 0.45, borderRadius: 12 }} />
                                )}
                                <div className="cat-card-ov" />
                                <div style={{ zIndex: 2, color: '#fff', position: 'relative' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: c.color || '#4f46e5', marginBottom: 4, textTransform: 'uppercase' }}>
                                        Category
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{c.name}</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        presets.filter(p => p.group === selectedCategory.name).map(p => {
                            const isExclusive = p.isMantramExclusive;
                            const pId = p.presetCode || p.id || p._id;
                            return (
                                <div key={pId} className={`cat-card ${selP === pId ? 'active' : ''}`} onClick={() => { setSelP(pId); setShowCats(false); setSelectedCategory(null); }}>
                                    {p.previewMediaUrl ? (
                                        p.previewMediaType === 'video' ? (
                                            <video src={p.previewMediaUrl} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} />
                                        ) : (
                                            <img src={p.previewMediaUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} alt={p.name} />
                                        )
                                    ) : (
                                        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${p.color || '#4f46e5'} 0%, #1a1a1a 100%)`, opacity: 0.45, borderRadius: 12 }} />
                                    )}
                                    <div className="cat-card-ov" />
                                    <div style={{ zIndex: 2, color: '#fff', position: 'relative' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: isExclusive ? '#fbbf24' : (p.color || '#4f46e5'), marginBottom: 4, textTransform: 'uppercase' }}>
                                            {isExclusive ? '★ Mantram Exclusive' : (p.categoryName || p.group || 'Format')}
                                        </div>
                                        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>{p.tagline}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>{p.threeWordCamera || p.categoryName || 'Dynamic'}</div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    </div>
                </div>
            </div>
        )}

    </div>
}

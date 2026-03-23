import { useState, useEffect, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const headers = { Authorization: `Bearer ${token}`, ...opts.headers }
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
    const data = await res.json()
    if (!data.success && !data.reply) throw new Error(data.error || 'Request failed')
    return data
}

// Quick-start templates
const QUICK_PROMPTS = [
    { icon: '🛍️', label: 'Product Ad', prompt: 'Create a 30-second product ad with close-up shots, lifestyle usage, and a strong call-to-action ending' },
    { icon: '📱', label: 'Social Reel', prompt: 'Create a vertical 15s social media reel with trendy transitions and engaging hook' },
    { icon: '🎥', label: 'Brand Story', prompt: 'Create a 1-minute brand story film with emotional narrative, cinematic visuals, and voiceover' },
    { icon: '🚀', label: 'Launch Video', prompt: 'Create a product launch teaser video with reveal moments, dramatic lighting, and excitement' },
    { icon: '📖', label: 'Explainer', prompt: 'Create a 45-second explainer video that educates viewers about the product features with clear visuals' },
    { icon: '🎯', label: 'Testimonial', prompt: 'Create an authentic testimonial-style video with warm lighting and real-world product usage shots' },
]

const MODEL_INFO = {
    'kling-3.0': { name: 'Kling 3.0', icon: '👑', tier: 'Premium' },
    'veo-3.1': { name: 'Veo 3.1', icon: '🎬', tier: 'Ultra' },
    'seedance-2.0': { name: 'Seedance 2.0', icon: '🎥', tier: 'Pro' },
    'hunyuan': { name: 'Hunyuan', icon: '🎨', tier: 'Draft' },
    'grok-imagine': { name: 'Grok', icon: '🤖', tier: 'Fast' },
}

export default function VideoAgent({ activeBrand }) {
    // Chat
    const [messages, setMessages] = useState([{
        role: 'agent', timestamp: Date.now(),
        content: `🎬 Hey! I'm your Video Agent — describe the video you want and I'll handle everything.\n\n→ I know your brand, products, and images\n→ I'll write the script, pick scenes, generate each clip\n→ Add voiceover, music, and compile into final video\n\nSelect a product below or just type your vision!`,
    }])
    const [input, setInput] = useState('')

    // Products & Brand Images
    const [products, setProducts] = useState([])
    const [brandImages, setBrandImages] = useState([])
    const [selectedProduct, setSelectedProduct] = useState(null)
    const [showProductPicker, setShowProductPicker] = useState(false)
    const [refImages, setRefImages] = useState([])
    const [characterPhoto, setCharacterPhoto] = useState(null) // { url, name }
    const [audioFile, setAudioFile] = useState(null) // { url, name, file }
    const [characterDesc, setCharacterDesc] = useState('') // User-defined character descriptions
    const [showCharDesc, setShowCharDesc] = useState(false)
    const fileRef = useRef(null)
    const charFileRef = useRef(null)
    const audioFileRef = useRef(null)

    // Settings
    const [voEnabled, setVoEnabled] = useState(true)
    const [voProvider, setVoProvider] = useState('minimax')
    const [musicEnabled, setMusicEnabled] = useState(false)
    const [textOverlaysEnabled, setTextOverlaysEnabled] = useState(true)
    const [overlayLanguage, setOverlayLanguage] = useState('english')
    const [showSettingsPanel, setShowSettingsPanel] = useState(false)
    const [overrideQuality, setOverrideQuality] = useState('')
    const [overrideAspect, setOverrideAspect] = useState('')
    const [videoModel, setVideoModel] = useState('auto') // auto, kling-3.0, veo-3.1, seedance-2.0, hunyuan, grok-imagine

    // Generation state
    const [generating, setGenerating] = useState(false)
    const [pipeline, setPipeline] = useState(null)
    const [sceneStatuses, setSceneStatuses] = useState({})
    const [isThinking, setIsThinking] = useState(false)
    const [currentSessionId, setCurrentSessionId] = useState(null)
    const [generatingFrames, setGeneratingFrames] = useState(false)

    const chatEndRef = useRef(null)
    const pollRef = useRef(null)

    // Auto-scroll
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

    // Load products when brand changes
    useEffect(() => {
        if (!activeBrand?._id) { setProducts([]); setBrandImages([]); return }
        api(`/video-studio/agent/products?brandId=${activeBrand._id}`)
            .then(data => {
                setProducts(data.products || [])
                setBrandImages(data.brandImages || [])
            })
            .catch(err => console.warn('Failed to load products:', err))
    }, [activeBrand?._id])

    // ── Upload reference images (store File, create object URL for preview) ──
    function handleImageUpload(e) {
        const files = Array.from(e.target.files || [])
        files.forEach(file => {
            const objectUrl = URL.createObjectURL(file)
            setRefImages(prev => [...prev.slice(-4), { url: objectUrl, name: file.name, file }])
        })
        e.target.value = ''
    }

    // ── Upload character/model photo (store File, create object URL for preview) ──
    function handleCharacterUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const objectUrl = URL.createObjectURL(file)
        setCharacterPhoto({ url: objectUrl, name: file.name, file })
        e.target.value = ''
    }

    // ── Upload audio file (VO, music, etc.) ──
    function handleAudioUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        // Revoke old object URL to prevent memory leak
        if (audioFile?.url) URL.revokeObjectURL(audioFile.url)
        const objectUrl = URL.createObjectURL(file)
        setAudioFile({ url: objectUrl, name: file.name, file })
        setVoEnabled(false)
        setMusicEnabled(false)
        e.target.value = ''
    }

    // ── Send prompt to agentic pipeline ──
    async function handleSend(promptOverride) {
        const prompt = promptOverride || input.trim()
        if (!prompt || isThinking || generating) return

        setInput('')
        setMessages(prev => [...prev, {
            role: 'user', content: prompt, timestamp: Date.now(),
            product: selectedProduct,
            images: [...refImages],
        }])
        setIsThinking(true)

        try {
            // Upload all files to S3 first (no base64)
            const uploadFile = async (file, name) => {
                const fd = new FormData(); fd.append('file', file, name)
                const upRes = await fetch(`${API_BASE}/video-studio/agent/upload`, {
                    method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` }, body: fd,
                })
                const upData = await upRes.json()
                return upData.url || ''
            }

            // Upload ref images
            const uploadedRefs = []
            for (const img of refImages) {
                if (img.file) {
                    try { const url = await uploadFile(img.file, img.name || 'ref.png'); if (url) uploadedRefs.push(url) } catch (e) { console.warn('Ref upload error:', e) }
                }
            }

            // Upload character photo
            let charPhotoUrl = ''
            if (characterPhoto?.file) {
                try { charPhotoUrl = await uploadFile(characterPhoto.file, characterPhoto.name || 'character.png') } catch (e) { console.warn('Char upload error:', e) }
            }

            // Upload audio file
            let audioUrl = ''
            if (audioFile?.file) {
                try {
                    console.log('🎧 Uploading audio:', audioFile.name, audioFile.file.size, 'bytes')
                    audioUrl = await uploadFile(audioFile.file, audioFile.name || 'audio.mp3')
                    console.log('🎧 Audio uploaded:', audioUrl ? 'OK' : 'FAILED')
                } catch (e) { console.warn('Audio upload error:', e) }
            }

            // Step 1: Get storyboard only (no video gen yet)
            const result = await api('/video-studio/agent/create', {
                method: 'POST',
                body: JSON.stringify({
                    prompt,
                    productId: selectedProduct?._id || '',
                    referenceImages: uploadedRefs,
                    characterPhoto: charPhotoUrl || undefined,
                    audioFileUrl: audioUrl || undefined,
                    characterDescriptions: characterDesc.trim() || undefined,
                    brandId: activeBrand?._id || '',
                    videoModel,
                    voiceover: { enabled: audioUrl ? false : voEnabled, provider: voProvider, voiceId: voProvider === 'minimax' ? 'moss_en_hd' : 'anushka', speed: 1.0, langCode: overlayLanguage === 'hindi' ? 'hi-IN' : overlayLanguage === 'tamil' ? 'ta-IN' : 'en-IN' },
                    music: { enabled: audioUrl ? false : musicEnabled, mood: '' },
                    textOverlays: { enabled: textOverlaysEnabled, brandName: activeBrand?.name || '', language: overlayLanguage },
                    aspectRatio: overrideAspect || '',
                    qualityMode: overrideQuality || '',
                }),
            })

            setPipeline(result)
            setCurrentSessionId(result.sessionId)
            setIsThinking(false)

            // Show storyboard for approval (NO video gen yet)
            const modelInfo = MODEL_INFO[result.pipeline?.model] || { name: result.pipeline?.model, icon: '🎥' }
            const sceneList = (result.storyboard?.scenes || [])
                .map(s => `Scene ${s.sceneNumber}: ${s.voiceoverText || s.visualPrompt?.substring(0, 80) || '...'}`)
                .join('\n→ ')
            const overlayList = (result.textOverlays || [])
                .map((o, i) => `  Scene ${i + 1}: "${o.text}" (${o.position})`)
                .join('\n')

            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(),
                type: 'storyboard-review',
                sessionId: result.sessionId,
                content: `🧠 AI Storyboard Ready for Review!\n\n📋 "${result.pipeline?.title}"\n→ ${result.pipeline?.totalScenes} scenes, ~${result.pipeline?.totalDuration}s total\n→ Model: ${modelInfo.icon} ${modelInfo.name}\n→ Aspect: ${result.pipeline?.aspectRatio}\n${result.pipeline?.characterRefUsed ? '👤 Character ref sheet generated for consistency' : ''}\n${result.pipeline?.reasoning ? `💡 ${result.pipeline.reasoning}` : ''}\n${result.audioFile?.transcript ? `\n🎧 Audio Transcript:\n"${result.audioFile.transcript.substring(0, 300)}${result.audioFile.transcript.length > 300 ? '...' : ''}"` : ''}\n\n🎬 Scenes:\n→ ${sceneList}\n${overlayList ? `\n📝 Text Overlays:\n${overlayList}` : ''}\n${result.storyboard?.voiceoverScript ? `\n🎙️ Voiceover Script:\n"${result.storyboard.voiceoverScript.substring(0, 300)}${result.storyboard.voiceoverScript.length > 300 ? '...' : ''}"` : ''}`,
                pipeline: result,
            }])

            setRefImages([])

        } catch (err) {
            setIsThinking(false)
            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(), isError: true,
                content: `❌ Error: ${err.message}\n\nTry rephrasing your prompt or check your credits.`,
            }])
        }
    }

    // ── Approve storyboard → generate first frames ──
    async function handleApproveFirstFrames(sessionId) {
        setGeneratingFrames(true)
        setMessages(prev => [...prev, {
            role: 'user', content: '✅ Storyboard approved! Generate preview frames...', timestamp: Date.now(),
        }])
        setIsThinking(true)

        try {
            const result = await api('/video-studio/agent/first-frames', {
                method: 'POST',
                body: JSON.stringify({ sessionId }),
            })

            setIsThinking(false)
            setGeneratingFrames(false)

            const framesList = (result.frames || []).map(f =>
                f.status === 'done'
                    ? `✅ Scene ${f.sceneNumber}: Preview ready`
                    : `❌ Scene ${f.sceneNumber}: ${f.error || 'Failed'}`
            ).join('\n')

            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(),
                type: 'frames-review',
                sessionId,
                frames: result.frames || [],
                content: `🖼️ First Frame Previews Generated!\n\n${framesList}\n\nReview the frames above. If you're happy, approve to start video generation.`,
            }])
        } catch (err) {
            setIsThinking(false)
            setGeneratingFrames(false)
            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(), isError: true,
                content: `❌ Frame generation failed: ${err.message}`,
            }])
        }
    }

    // ── Approve frames → generate actual videos ──
    async function handleApproveGenerate(sessionId) {
        setMessages(prev => [...prev, {
            role: 'user', content: '✅ Frames approved! Start generating videos...', timestamp: Date.now(),
        }])
        setIsThinking(true)

        try {
            const result = await api('/video-studio/agent/generate', {
                method: 'POST',
                body: JSON.stringify({ sessionId, selectedModel: videoModel !== 'auto' ? videoModel : undefined }),
            })

            setPipeline(prev => ({ ...prev, ...result }))
            setIsThinking(false)

            const modelInfo = MODEL_INFO[result.pipeline?.model] || { name: result.pipeline?.model, icon: '🎥' }

            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(),
                content: `🎬 Video Generation Started!\n\n→ ${result.scenes?.filter(s => s.projectId).length} scenes submitted\n→ Model: ${modelInfo.icon} ${modelInfo.name}\n${result.voiceover?.url ? '🎙️ Voiceover generating...' : ''}\n${result.music?.url ? '🎵 Music generating...' : ''}\n${result.audioFile?.url ? '🎧 Using your uploaded audio as soundtrack' : ''}\n\n⏳ Generating scene clips now...`,
                pipeline: result,
            }])

            setGenerating(true)
            startScenePolling(result.scenes || [])
        } catch (err) {
            setIsThinking(false)
            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(), isError: true,
                content: `❌ Video generation failed: ${err.message}`,
            }])
        }
    }

    // ── Poll each scene's generation status ──
    function startScenePolling(scenes) {
        const projectIds = scenes.filter(s => s.projectId).map(s => s.projectId)
        if (!projectIds.length) { setGenerating(false); return }

        const initialStatuses = {}
        projectIds.forEach(id => { initialStatuses[id] = { status: 'generating', progress: 5 } })
        setSceneStatuses(initialStatuses)

        pollRef.current = setInterval(async () => {
            let hasChanges = false

            // Use functional update to always read latest state
            setSceneStatuses(prev => {
                const updated = { ...prev }
                const fetchPromises = projectIds.map(async id => {
                    if (updated[id]?.status === 'done' || updated[id]?.status === 'failed') return
                    try {
                        const res = await api(`/video-studio/${id}/status`)
                        const proj = res.project
                        if (proj.generation?.videoUrl || proj.status === 'done' || proj.status === 'critique') {
                            updated[id] = { status: 'done', videoUrl: `${API_BASE}/video-studio/${id}/video`, progress: 100 }
                            hasChanges = true
                        } else if (proj.status === 'failed' || proj.status === 'error') {
                            updated[id] = { status: 'failed', progress: 0, error: proj.errorMessage || 'Failed' }
                            hasChanges = true
                        } else {
                            const newProgress = proj.generation?.progress || Math.min((updated[id]?.progress || 5) + 3, 90)
                            updated[id] = { status: 'generating', progress: newProgress }
                        }
                    } catch { /* retry next tick */ }
                })

                // We can't await inside functional setState, so we'll use a workaround
                return updated
            })

            // Separate check for completion to avoid stale refs
            const checkCompletion = async () => {
                const currentStatuses = {}
                for (const id of projectIds) {
                    try {
                        const res = await api(`/video-studio/${id}/status`)
                        const proj = res.project
                        if (proj.generation?.videoUrl || proj.status === 'done' || proj.status === 'critique') {
                            currentStatuses[id] = { status: 'done', videoUrl: `${API_BASE}/video-studio/${id}/video`, progress: 100 }
                        } else if (proj.status === 'failed' || proj.status === 'error') {
                            currentStatuses[id] = { status: 'failed', progress: 0, error: proj.errorMessage || 'Failed' }
                        } else {
                            currentStatuses[id] = { status: 'generating', progress: proj.generation?.progress || 10 }
                        }
                    } catch {
                        currentStatuses[id] = { status: 'generating', progress: 10 }
                    }
                }

                setSceneStatuses(currentStatuses)

                const vals = Object.values(currentStatuses)
                if (vals.every(v => v.status === 'done' || v.status === 'failed')) {
                    clearInterval(pollRef.current)
                    pollRef.current = null

                    const successScenes = vals.filter(v => v.status === 'done')
                    const failedCount = vals.filter(v => v.status === 'failed').length
                    setMessages(prev => [...prev, {
                        role: 'agent', timestamp: Date.now(),
                        content: `✅ ${successScenes.length}/${vals.length} scene clips generated!\n\n${successScenes.length > 1 ? '🔗 Click "Compile Final Video" below to stitch all clips with voiceover and music.' : '🎬 Your video is ready!'}\n\n${failedCount > 0 ? `⚠️ ${failedCount} scene(s) failed — try regenerating or using a different model.` : ''}`,
                        completedScenes: Object.entries(currentStatuses).filter(([, v]) => v.status === 'done').map(([id, v]) => ({ id, videoUrl: v.videoUrl })),
                        showCompile: successScenes.length > 1,
                    }])
                    setGenerating(false)
                }
            }

            await checkCompletion()
        }, 6000)
    }

    // ── Download ──
    async function handleDownload(url, name) {
        try {
            const resp = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` } })
            const blob = await resp.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = blobUrl; a.download = `${name}.mp4`
            document.body.appendChild(a); a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
        } catch { window.open(url, '_blank') }
    }

    // ── Compile all scenes into final video ──
    async function handleCompile(completedScenes) {
        if (!completedScenes?.length) return
        setGenerating(true)
        setMessages(prev => [...prev, {
            role: 'agent', timestamp: Date.now(),
            content: '🎬 Compiling final video... Stitching clips + voiceover + music via FFmpeg.',
        }])

        try {
            const clips = completedScenes.map((sc, i) => ({
                videoUrl: sc.videoUrl,
                title: `Scene ${i + 1}`,
            }))

            const compileBody = {
                clips,
                voiceover: pipeline?.voiceover?.url && !pipeline.voiceover.url.startsWith('fal-pending:') ? { audioUrl: pipeline.voiceover.url } : undefined,
                music: pipeline?.music?.url && !pipeline.music.url.startsWith('fal-pending:') ? { audioUrl: pipeline.music.url, volume: 0.3 } : undefined,
                brandId: activeBrand?._id || '',
            }

            // If user uploaded audio, use it instead of VO/music
            if (pipeline?.audioFile?.url) {
                compileBody.voiceover = { audioUrl: pipeline.audioFile.url }
                compileBody.music = undefined
            }

            const result = await api('/video-studio/compile', {
                method: 'POST',
                body: JSON.stringify(compileBody),
            })

            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(),
                content: result.compiled
                    ? `✅ Final video compiled successfully!\n\n🎬 ${result.totalClips} clips stitched into one video with ${pipeline?.voiceover?.url ? 'voiceover' : ''} ${pipeline?.music?.url ? '+ music' : ''}.`
                    : `⚠️ FFmpeg not available on server. Clips returned separately.\n${result.message}`,
                compiledVideo: result.compiled ? { url: result.videoUrl } : null,
                completedScenes: result.compiled ? [{ id: 'compiled', videoUrl: result.videoUrl }] : result.clipUrls?.map((u, i) => ({ id: `clip-${i}`, videoUrl: u })),
            }])
        } catch (err) {
            setMessages(prev => [...prev, {
                role: 'agent', timestamp: Date.now(), isError: true,
                content: `❌ Compile failed: ${err.message}`,
            }])
        }
        setGenerating(false)
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 fade-up" style={{ minHeight: '75vh' }}>

            {/* ══════════ LEFT — Chat ══════════ */}
            <div className="lg:col-span-8 flex flex-col" style={{ maxHeight: '80vh' }}>

                {/* Header */}
                <div className="glass-panel rounded-2xl p-4 border border-white/[0.08] mb-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #14b8a6, #06b6d4, #8b5cf6)' }}>
                            <span className="material-symbols-outlined text-white text-xl">smart_display</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-lg font-bold text-white">Video Agent</h2>
                            <p className="text-[10px] text-slate-500 truncate">Prompt-driven • Brand-aware • Multi-scene • AI Compiled</p>
                        </div>
                        <button onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                            className={`p-2 rounded-xl transition-all cursor-pointer ${showSettingsPanel ? 'bg-teal-500/20 text-teal-300' : 'text-slate-500 hover:text-white hover:bg-white/[0.05]'}`}>
                            <span className="material-symbols-outlined text-lg">tune</span>
                        </button>
                    </div>

                    {showSettingsPanel && (
                        <div className="mt-3 pt-3 border-t border-white/[0.05] grid grid-cols-2 md:grid-cols-3 gap-2">
                            <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">Quality</label>
                                <select value={overrideQuality} onChange={e => setOverrideQuality(e.target.value)}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white appearance-none cursor-pointer">
                                    <option value="">AI Picks</option>
                                    <option value="draft">🎨 Draft (cheapest)</option>
                                    <option value="fast">⚡ Fast</option>
                                    <option value="quality">✨ Quality</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">Aspect</label>
                                <select value={overrideAspect} onChange={e => setOverrideAspect(e.target.value)}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white appearance-none cursor-pointer">
                                    <option value="">Auto</option>
                                    <option value="16:9">16:9 Landscape</option>
                                    <option value="9:16">9:16 Portrait</option>
                                    <option value="1:1">1:1 Square</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">Voiceover</label>
                                <select value={voEnabled ? voProvider : 'off'} onChange={e => {
                                    if (e.target.value === 'off') { setVoEnabled(false) }
                                    else { setVoEnabled(true); setVoProvider(e.target.value) }
                                }}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white appearance-none cursor-pointer">
                                    <option value="minimax">🎙️ MiniMax</option>
                                    <option value="sarvam">🇮🇳 Sarvam</option>
                                    <option value="off">No VO</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">🎵 AI Music</label>
                                <select value={musicEnabled ? 'on' : 'off'} onChange={e => setMusicEnabled(e.target.value === 'on')}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white appearance-none cursor-pointer">
                                    <option value="on">Generate Music</option>
                                    <option value="off">No Music</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[10px] text-slate-500 mb-1 block">📝 Text Overlays</label>
                                <select value={textOverlaysEnabled ? overlayLanguage : 'off'} onChange={e => {
                                    if (e.target.value === 'off') { setTextOverlaysEnabled(false) }
                                    else { setTextOverlaysEnabled(true); setOverlayLanguage(e.target.value) }
                                }}
                                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-white appearance-none cursor-pointer">
                                    <option value="english">English</option>
                                    <option value="hindi">हिन्दी Hindi</option>
                                    <option value="tamil">தமிழ் Tamil</option>
                                    <option value="bengali">বাংলা Bengali</option>
                                    <option value="telugu">తెలుగు Telugu</option>
                                    <option value="off">No Overlays</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <button onClick={() => { setOverrideQuality(''); setOverrideAspect(''); setVoEnabled(true); setVoProvider('minimax'); setMusicEnabled(false); setTextOverlaysEnabled(true); setOverlayLanguage('english') }}
                                    className="w-full px-2 py-1.5 text-xs text-slate-400 hover:text-white border border-white/[0.08] rounded-lg hover:bg-white/[0.04] transition-all cursor-pointer">
                                    Reset
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 mb-3" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>

                    {/* Quick Start (only before first user message) */}
                    {messages.filter(m => m.role === 'user').length === 0 && (
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            {QUICK_PROMPTS.map((qp, i) => (
                                <button key={i} onClick={() => handleSend(qp.prompt)}
                                    className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-teal-400/30 hover:bg-teal-500/5 transition-all cursor-pointer text-left group">
                                    <div className="text-lg mb-1">{qp.icon}</div>
                                    <div className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">{qp.label}</div>
                                    <div className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">{qp.prompt.substring(0, 55)}...</div>
                                </button>
                            ))}
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-3.5 ${
                                msg.role === 'user' ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border border-teal-500/20 text-white'
                                    : msg.isError ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                                    : 'bg-white/[0.04] border border-white/[0.06] text-slate-300'}`}>

                                {msg.role === 'agent' && (
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #14b8a6, #8b5cf6)' }}>
                                            <span className="material-symbols-outlined text-white" style={{ fontSize: '12px' }}>smart_display</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-teal-400">Video Agent</span>
                                    </div>
                                )}

                                {/* Product tag */}
                                {msg.product && (
                                    <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                        {msg.product.images?.[0] && (
                                            <img src={msg.product.images[0].url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                                        )}
                                        <div>
                                            <p className="text-[10px] font-bold text-amber-300">🛍️ {msg.product.title}</p>
                                            {msg.product.price?.amount && <p className="text-[9px] text-slate-500">{msg.product.price.currency} {msg.product.price.amount}</p>}
                                        </div>
                                    </div>
                                )}

                                {/* Ref images */}
                                {msg.images && msg.images.length > 0 && (
                                    <div className="flex gap-1.5 mb-2">
                                        {msg.images.map((img, j) => (
                                            <div key={j} className="w-12 h-12 rounded-lg overflow-hidden border border-white/[0.1]">
                                                <img src={img.url} alt="" className="w-full h-full object-cover" />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="text-xs whitespace-pre-line leading-relaxed">{msg.content}</div>

                                {/* Storyboard approval buttons */}
                                {msg.type === 'storyboard-review' && !generating && !generatingFrames && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button onClick={() => handleApproveFirstFrames(msg.sessionId)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 text-[11px] font-bold hover:bg-teal-500/30 cursor-pointer transition-colors border border-teal-500/30">
                                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>image</span>
                                            ✅ Approve & Generate Previews
                                        </button>
                                        <button onClick={() => handleApproveGenerate(msg.sessionId)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-300 text-[11px] font-bold hover:bg-violet-500/30 cursor-pointer transition-colors border border-violet-500/30">
                                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>fast_forward</span>
                                            ⚡ Skip to Video Gen
                                        </button>
                                    </div>
                                )}

                                {/* First frame previews */}
                                {msg.type === 'frames-review' && msg.frames && (
                                    <>
                                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {msg.frames.filter(f => f.imageUrl).map((f, j) => (
                                                <div key={j} className="rounded-xl overflow-hidden border border-white/[0.08] bg-black relative group">
                                                    <img src={f.imageUrl} alt={`Scene ${f.sceneNumber} preview`} className="w-full aspect-video object-cover" />
                                                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-1.5">
                                                        <span className="text-[10px] text-white/80 font-bold">Scene {f.sceneNumber}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {!generating && (
                                            <div className="mt-3 flex gap-2">
                                                <button onClick={() => handleApproveGenerate(msg.sessionId)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 text-teal-300 text-[11px] font-bold hover:bg-teal-500/30 cursor-pointer transition-colors border border-teal-500/30">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>movie</span>
                                                    ✅ Approve & Generate Videos
                                                </button>
                                                <button onClick={() => handleApproveFirstFrames(msg.sessionId)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-300 text-[11px] font-bold hover:bg-amber-500/30 cursor-pointer transition-colors border border-amber-500/30">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>refresh</span>
                                                    🔁 Regenerate Frames
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Completed scene videos */}
                                {msg.completedScenes && msg.completedScenes.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {msg.completedScenes.map((sc, j) => (
                                            <div key={j} className="rounded-xl overflow-hidden border border-white/[0.08] bg-black">
                                                <div style={{ aspectRatio: '16/9' }}>
                                                    <video src={sc.videoUrl} controls className="w-full h-full" />
                                                </div>
                                                <div className="flex items-center justify-between p-2">
                                                    <span className="text-[10px] text-slate-500">{sc.id === 'compiled' ? '🎬 Final Video' : `Scene ${j + 1}`}</span>
                                                    <button onClick={() => handleDownload(sc.videoUrl, sc.id === 'compiled' ? 'final-video' : `scene-${j + 1}`)}
                                                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-teal-500/20 text-teal-300 text-[10px] font-bold hover:bg-teal-500/30 cursor-pointer">
                                                        <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>download</span> Download
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Compile button */}
                                        {msg.showCompile && !generating && (
                                            <button onClick={() => handleCompile(msg.completedScenes)}
                                                className="w-full mt-2 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:scale-[1.02]"
                                                style={{ background: 'linear-gradient(135deg, #14b8a6, #06b6d4, #8b5cf6)' }}>
                                                🎬 Compile Final Video
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="text-[9px] text-slate-600 mt-1.5">
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Thinking */}
                    {isThinking && (
                        <div className="flex justify-start">
                            <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-3.5 flex items-center gap-2">
                                <div className="flex gap-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span className="text-xs text-slate-500">AI writing storyboard, selecting models...</span>
                            </div>
                        </div>
                    )}

                    {/* Scene generation progress */}
                    {generating && Object.keys(sceneStatuses).length > 0 && (
                        <div className="flex justify-start">
                            <div className="w-full max-w-[85%] bg-white/[0.04] border border-teal-500/20 rounded-2xl p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-teal-400 text-lg animate-spin">progress_activity</span>
                                    <span className="text-xs font-bold text-white">Generating scenes...</span>
                                </div>
                                <div className="space-y-2">
                                    {Object.entries(sceneStatuses).map(([id, st], idx) => (
                                        <div key={id} className="flex items-center gap-2">
                                            <span className="text-[10px] text-slate-500 w-14 flex-shrink-0">Scene {idx + 1}</span>
                                            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${st.progress || 0}%`,
                                                        background: st.status === 'done' ? '#10b981' : st.status === 'failed' ? '#ef4444' : 'linear-gradient(90deg, #14b8a6, #8b5cf6)',
                                                    }} />
                                            </div>
                                            <span className="text-[10px] w-8 text-right" style={{ color: st.status === 'done' ? '#10b981' : st.status === 'failed' ? '#ef4444' : '#94a3b8' }}>
                                                {st.status === 'done' ? '✓' : st.status === 'failed' ? '✗' : `${st.progress || 0}%`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={chatEndRef} />
                </div>

                {/* Selected Product, Character Photo, Audio & Ref Images */}
                {(selectedProduct || refImages.length > 0 || characterPhoto || audioFile) && (
                    <div className="flex items-center gap-2 mb-2 flex-wrap px-1">
                        {selectedProduct && (
                            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1 group">
                                {selectedProduct.images?.[0] && <img src={selectedProduct.images[0].url} alt="" className="w-6 h-6 rounded object-cover" />}
                                <span className="text-[10px] text-amber-300 font-medium">{selectedProduct.title}</span>
                                <button onClick={() => setSelectedProduct(null)} className="text-amber-400 hover:text-rose-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '10px' }}>✕</button>
                            </div>
                        )}
                        {characterPhoto && (
                            <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2 py-1 group">
                                <img src={characterPhoto.url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                <span className="text-[10px] text-violet-300 font-medium">👤 Character</span>
                                <button onClick={() => setCharacterPhoto(null)} className="text-violet-400 hover:text-rose-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '10px' }}>✕</button>
                            </div>
                        )}
                        {audioFile && (
                            <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-1 group">
                                <span className="text-sm">🎧</span>
                                <span className="text-[10px] text-orange-300 font-medium truncate max-w-[100px]">{audioFile.name}</span>
                                <button onClick={() => { setAudioFile(null); setVoEnabled(true) }} className="text-orange-400 hover:text-rose-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '10px' }}>✕</button>
                            </div>
                        )}
                        {refImages.map((img, i) => (
                            <div key={i} className="relative group">
                                <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/[0.1]">
                                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                                </div>
                                <button onClick={() => setRefImages(prev => prev.filter((_, j) => j !== i))}
                                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" style={{ fontSize: '7px' }}>×</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Character Description (collapsible) */}
                <div className="mb-2 px-1">
                    <button onClick={() => setShowCharDesc(!showCharDesc)}
                        className={`text-[10px] flex items-center gap-1 mb-1 cursor-pointer transition-colors ${characterDesc.trim() ? 'text-violet-400' : 'text-slate-500 hover:text-violet-400'}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{showCharDesc ? 'expand_less' : 'group'}</span>
                        {characterDesc.trim() ? `👤 Characters defined (${characterDesc.trim().split('\n').filter(Boolean).length})` : 'Define characters (optional)'}
                    </button>
                    {showCharDesc && (
                        <textarea value={characterDesc}
                            onChange={e => setCharacterDesc(e.target.value)}
                            placeholder="Describe your characters, e.g.:\n• Hero: 25-year-old woman, long black hair, red dress, confident\n• Villain: Tall man in dark suit, scar on left cheek\n• Narrator: Warm, friendly grandmother figure"
                            className="w-full bg-white/[0.03] border border-violet-500/20 rounded-xl px-3 py-2 text-[11px] text-slate-300 placeholder:text-slate-600 resize-none focus:outline-none focus:border-violet-500/40"
                            rows={3} />
                    )}
                </div>

                {/* Input */}
                <div className="glass-panel rounded-2xl border border-white/[0.08] p-3 flex items-end gap-2">
                    <button onClick={() => setShowProductPicker(!showProductPicker)}
                        className={`p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${showProductPicker ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-amber-400 hover:bg-amber-500/10'}`}
                        title="Select product from brand catalog">
                        <span className="material-symbols-outlined text-lg">shopping_bag</span>
                    </button>
                    <button onClick={() => charFileRef.current?.click()}
                        className={`p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${characterPhoto ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-violet-400 hover:bg-violet-500/10'}`}
                        title="Upload model/character photo for consistency">
                        <span className="material-symbols-outlined text-lg">face</span>
                    </button>
                    <button onClick={() => audioFileRef.current?.click()}
                        className={`p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${audioFile ? 'bg-orange-500/20 text-orange-300' : 'text-slate-500 hover:text-orange-400 hover:bg-orange-500/10'}`}
                        title="Upload audio (VO/music) — video syncs to this">
                        <span className="material-symbols-outlined text-lg">headphones</span>
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                        className="p-2 rounded-xl text-slate-500 hover:text-teal-400 hover:bg-teal-500/10 transition-all cursor-pointer flex-shrink-0"
                        title="Upload reference images for style blending">
                        <span className="material-symbols-outlined text-lg">add_photo_alternate</span>
                    </button>

                    {/* Model selector */}
                    <div className="relative flex-shrink-0">
                        <select value={videoModel} onChange={e => setVideoModel(e.target.value)}
                            className="appearance-none bg-white/[0.05] border border-white/[0.08] rounded-lg text-[10px] text-slate-300 pl-2 pr-6 py-1.5 cursor-pointer hover:bg-white/[0.08] focus:outline-none focus:border-teal-500/40 transition-colors"
                            title="Select video model">
                            <option value="auto" className="bg-slate-900">🤖 Auto (Best)</option>
                            <option value="kling-3.0" className="bg-slate-900">👑 Kling 3.0</option>
                            <option value="veo-3.1" className="bg-slate-900">🎬 Veo 3.1</option>
                            <option value="seedance-2.0" className="bg-slate-900">🎥 Seedance 2.0</option>
                            <option value="hunyuan" className="bg-slate-900">🎨 Hunyuan (Draft)</option>
                            <option value="grok-imagine" className="bg-slate-900">🤖 Grok (Fast)</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" style={{ fontSize: '12px' }}>expand_more</span>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                    <input ref={charFileRef} type="file" accept="image/*" className="hidden" onChange={handleCharacterUpload} />
                    <input ref={audioFileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" className="hidden" onChange={handleAudioUpload} />

                    <textarea value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                        placeholder="Describe your video... (e.g., 'Create a 30s ad for our protein powder with VO')"
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-slate-600 resize-none focus:outline-none min-h-[40px] max-h-[100px]"
                        rows={1} disabled={generating} style={{ lineHeight: '1.5' }} />

                    <button onClick={() => handleSend()} disabled={!input.trim() || isThinking || generating}
                        className="p-2.5 rounded-xl transition-all cursor-pointer flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={{ background: input.trim() ? 'linear-gradient(135deg, #14b8a6, #06b6d4)' : 'rgba(255,255,255,0.04)' }}>
                        <span className="material-symbols-outlined text-white text-lg">send</span>
                    </button>
                </div>

                {/* Product Picker Dropdown */}
                {showProductPicker && (
                    <div className="glass-panel rounded-2xl border border-white/[0.08] p-4 mt-2 max-h-[40vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' }}>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold text-white">Select Product from Brand Catalog</h4>
                            <button onClick={() => setShowProductPicker(false)} className="text-slate-500 hover:text-white cursor-pointer">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>

                        {products.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-4">No products found. Add products in Brand DNA → Products.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {products.map(p => (
                                    <button key={p._id} onClick={() => { setSelectedProduct(p); setShowProductPicker(false) }}
                                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                            selectedProduct?._id === p._id ? 'border-amber-400/40 bg-amber-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:border-amber-400/20 hover:bg-amber-500/5'
                                        }`}>
                                        <div className="flex items-start gap-2">
                                            {p.images?.[0] ? (
                                                <img src={p.images[0].url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                                                    <span className="material-symbols-outlined text-slate-600 text-lg">image</span>
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{p.title}</p>
                                                {p.category && <p className="text-[10px] text-slate-500">{p.category}</p>}
                                                {p.price?.amount > 0 && <p className="text-[10px] text-emerald-400">{p.price.currency} {p.price.amount}</p>}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Brand Images section */}
                        {brandImages.length > 0 && (
                            <>
                                <h4 className="text-xs font-bold text-white mt-4 mb-2">Brand Images</h4>
                                <div className="flex gap-2 flex-wrap">
                                    {brandImages.slice(0, 12).map((img, i) => (
                                        <button key={i} onClick={() => { setRefImages(prev => [...prev.slice(-4), { url: img.url, name: img.alt }]); setShowProductPicker(false) }}
                                            className="w-14 h-14 rounded-lg overflow-hidden border border-white/[0.06] hover:border-teal-400/30 transition-all cursor-pointer group relative">
                                            <img src={img.url} alt={img.alt} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-teal-500/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-white text-sm">add</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ══════════ RIGHT — How It Works + Status ══════════ */}
            <div className="lg:col-span-4 space-y-4">

                {/* Agentic Pipeline */}
                <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-teal-400 text-lg">auto_awesome</span>
                        Agentic Pipeline
                    </h3>
                    <div className="space-y-2.5">
                        {[
                            { icon: 'chat', color: '#14b8a6', label: '1. Describe', desc: 'Type your creative vision in natural language' },
                            { icon: 'face', color: '#a78bfa', label: '2. Character Ref', desc: 'Gemini generates reference sheet for consistency' },
                            { icon: 'shopping_bag', color: '#f59e0b', label: '3. Product + Brand', desc: 'Auto-loads products, images, brand DNA' },
                            { icon: 'movie_edit', color: '#06b6d4', label: '4. AI Storyboard', desc: 'Scenes with VO script + text overlays' },
                            { icon: 'smart_display', color: '#8b5cf6', label: '5. Multi-Scene Gen', desc: 'Each scene with character consistency' },
                            { icon: 'mic', color: '#ec4899', label: '6. Voiceover', desc: 'MiniMax/Sarvam TTS with vernacular support' },
                            { icon: 'music_note', color: '#f97316', label: '7. AI Music', desc: 'AI-generated background music' },
                            { icon: 'text_fields', color: '#22d3ee', label: '8. Text Overlays', desc: 'Brand name, CTA, price in any language' },
                            { icon: 'movie_creation', color: '#10b981', label: '9. Compile', desc: 'FFmpeg stitches clips + VO + music + text' },
                        ].map((step, i) => (
                            <div key={i} className="flex items-start gap-2.5">
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ background: `${step.color}15`, border: `1px solid ${step.color}25` }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '12px', color: step.color }}>{step.icon}</span>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-white">{step.label}</p>
                                    <p className="text-[10px] text-slate-500 leading-tight">{step.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Current Pipeline Status */}
                {pipeline && (
                    <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-violet-400 text-lg">analytics</span>
                            Pipeline Status
                        </h3>
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between"><span className="text-slate-500">Title</span><span className="text-white font-medium truncate ml-2">{pipeline.pipeline?.title}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Scenes</span><span className="text-white">{pipeline.pipeline?.totalScenes}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Duration</span><span className="text-white">~{pipeline.pipeline?.totalDuration}s</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Model</span><span className="text-white">{MODEL_INFO[pipeline.pipeline?.model]?.icon} {MODEL_INFO[pipeline.pipeline?.model]?.name || pipeline.pipeline?.model}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Voiceover</span><span className="text-white">{pipeline.voiceover?.provider || 'None'}{pipeline.voiceover?.url?.startsWith('fal-pending:') ? ' (generating...)' : ''}</span></div>
                            {pipeline.pipeline?.characterRefUsed && <div className="flex justify-between"><span className="text-slate-500">Character</span><span className="text-violet-300">👤 Ref sheet active</span></div>}
                            {pipeline.audioFile && <div className="flex justify-between"><span className="text-slate-500">Audio</span><span className="text-orange-300">🎧 User audio {pipeline.audioFile.transcript ? '(transcribed ✓)' : '(base track)'}</span></div>}
                            {pipeline.music?.url && <div className="flex justify-between"><span className="text-slate-500">Music</span><span className="text-orange-300">🎵 {pipeline.music.mood || 'AI Generated'}{pipeline.music.url?.startsWith('fal-pending:') ? ' (generating...)' : ''}</span></div>}
                            {pipeline.textOverlays?.length > 0 && <div className="flex justify-between"><span className="text-slate-500">Overlays</span><span className="text-cyan-300">📝 {pipeline.textOverlays.length} text layers</span></div>}
                            {pipeline.productUsed && <div className="flex justify-between"><span className="text-slate-500">Product</span><span className="text-amber-300">📦 {pipeline.productUsed.imagesCount} images</span></div>}
                        </div>
                    </div>
                )}

                {/* Capabilities */}
                <div className="glass-panel rounded-2xl p-5 border border-white/[0.08]">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-amber-400 text-lg">bolt</span>
                        What Makes This Different
                    </h3>
                    <div className="space-y-2">
                        {[
                            { q: '👤 Character Consistency', a: 'Gemini generates reference sheets to maintain faces across all scenes' },
                            { q: '📝 Text Overlays', a: 'Brand name, CTA, price burned into video in any language' },
                            { q: '🎵 AI Music', a: 'Background music auto-generated matching the video mood' },
                            { q: '🛍️ Products', a: 'Auto-uses product images as first frames in scenes' },
                            { q: '🎙️ Voiceover', a: 'AI script + MiniMax/Sarvam TTS with vernacular support' },
                            { q: '🎬 Multi-scene', a: 'Long videos break into 5-15s scenes with character consistency' },
                            { q: '🤖 7 AI Models', a: 'Kling 3.0, Veo 3.1, Seedance 2.0, Hunyuan, Grok' },
                        ].map((item, i) => (
                            <div key={i} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                                <p className="text-[10px] font-bold text-teal-400">{item.q}</p>
                                <p className="text-[10px] text-slate-500">{item.a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { nexus as nexusAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'

// Detect mobile viewport
const getIsMobile = () => typeof window !== 'undefined' && window.innerWidth < 640

const BRIEFING_SESSION_KEY = 'nexus_briefing_shown'
const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

export default function NexusBar() {
    const navigate = useNavigate()
    const location = useLocation()
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id

    // Core state
    const [open, setOpen] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [streamingText, setStreamingText] = useState('')
    const [streamingAction, setStreamingAction] = useState(null)

    // Rich media state
    const [lightboxUrl, setLightboxUrl] = useState(null)          // image lightbox URL
    const [lightboxZoom, setLightboxZoom] = useState(1)
    const [videoStep, setVideoStep] = useState(null)              // current video pipeline step
    const [showHistory, setShowHistory] = useState(false)         // history panel open
    const [history, setHistory] = useState([])                    // NexusHistory threads
    const [historyFilter, setHistoryFilter] = useState('all')     // all/image/video/content/research
    const [copiedIdx, setCopiedIdx] = useState(null)              // content copy flash

    // Voice input state (mic → speech-to-text)
    const [recording, setRecording] = useState(false)
    const [transcribing, setTranscribing] = useState(false)
    const mediaRecorderRef = useRef(null)
    const audioChunksRef = useRef([])

    // Briefing state
    const [briefing, setBriefing] = useState(null)
    const [showBriefing, setShowBriefing] = useState(false)

    // Notifications
    const [notifications, setNotifications] = useState([])
    const [intelAlertCount, setIntelAlertCount] = useState(0)

    // Image upload state (S3 URLs only — no base64)
    const [pendingImageUrls, setPendingImageUrls] = useState([])
    const [uploading, setUploading] = useState(false)
    const [shareMenuIdx, setShareMenuIdx] = useState(null) // index of message with open share menu

    // Mobile detection (responsive)
    const [isMobile, setIsMobile] = useState(getIsMobile)
    useEffect(() => {
        const onResize = () => setIsMobile(getIsMobile())
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    }, [])

    // Refs
    const inputRef = useRef(null)
    const chatEndRef = useRef(null)
    const dropdownRef = useRef(null)
    const galleryInputRef = useRef(null)   // gallery / file picker
    const cameraInputRef = useRef(null)    // camera capture (mobile)

    // ── Auto-scroll chat ──
    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingText])

    // ── Focus input when opened ──
    useEffect(() => {
        if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100)
    }, [open])

    // ── ⌘K global shortcut ──
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setOpen(true)
                setTimeout(() => inputRef.current?.focus(), 100)
            }
            if (e.key === 'Escape' && open) {
                setOpen(false)
                setExpanded(false)
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [open])

    // ── Click outside to close ──
    useEffect(() => {
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false)
                setExpanded(false)
            }
        }
        if (open) document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    // ── Welcome message on brand change ──
    useEffect(() => {
        const brandName = activeBrand?.name || ''
        setMessages([{
            role: 'assistant',
            content: brandName
                ? `heyyy! 👋 I'm Fidato, your branding expert for ${brandName}. ask me anything or tell me what to create! 💜`
                : `heyyy! 👋 I'm Fidato! select a brand and I'll help you with strategy, content, and everything marketing 💜`
        }])
    }, [activeBrand?._id])

    // ── Load briefing on mount (only if authenticated) ──
    useEffect(() => {
        const token = localStorage.getItem('mantram_token')
        if (!token) return // Skip on public pages (landing, auth)

        const alreadyShown = sessionStorage.getItem(BRIEFING_SESSION_KEY)
        if (alreadyShown) return

        let cancelled = false
        const timer = setTimeout(async () => {
            try {
                const data = await nexusAPI.briefing(brandId)
                if (cancelled) return
                if (data?.success && data.briefing) {
                    setBriefing(data.briefing)
                    if (data.preferences?.fidatoPopup !== false) {
                        setShowBriefing(true)
                    }
                }
            } catch (e) {
                console.warn('Nexus briefing skipped:', e?.message || e)
            }
        }, 2000)

        return () => { cancelled = true; clearTimeout(timer) }
    }, [])

    // ── Load notifications (only if authenticated) ──
    const loadNotifications = useCallback(async () => {
        const token = localStorage.getItem('mantram_token')
        if (!token) return // Skip on public pages
        try {
            const data = await nexusAPI.notifications(brandId)
            if (data.success) setNotifications(data.notifications || [])
        } catch { /* silent */ }
    }, [brandId])

    useEffect(() => { loadNotifications() }, [loadNotifications])

    // ── Load intel mission alerts ──
    const loadIntelAlerts = useCallback(async () => {
        if (!brandId) return
        try {
            const token = localStorage.getItem('mantram_token')
            const resp = await fetch(`${API_BASE}/intel/alerts?brandId=${brandId}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (resp.ok) {
                const data = await resp.json()
                setIntelAlertCount(data.totalAlerts || 0)
            }
        } catch { /* silent */ }
    }, [brandId])

    useEffect(() => {
        loadIntelAlerts()
        const interval = setInterval(loadIntelAlerts, 120000) // every 2 minutes
        return () => clearInterval(interval)
    }, [loadIntelAlerts])

    // ── Dismiss briefing ──
    const dismissBriefing = (permanent = false) => {
        setShowBriefing(false)
        sessionStorage.setItem(BRIEFING_SESSION_KEY, 'true')
        if (permanent) {
            nexusAPI.updatePreferences({ fidatoPopup: false }).catch(() => { })
        }
    }

    // ══════════════════════════════════════════════
    // VOICE INPUT — Mic Recording → STT → Auto-send
    // With silence detection for hands-free conversation
    // ══════════════════════════════════════════════

    const silenceTimerRef = useRef(null)
    const recordingTimerRef = useRef(null)
    const analyserRef = useRef(null)
    const silenceCheckRef = useRef(null)

    const startRecording = useCallback(async () => {
        if (loading || recording) return
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
            })
            mediaRecorderRef.current = mediaRecorder
            audioChunksRef.current = []

            // Set up silence detection using AudioContext
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
                const source = audioCtx.createMediaStreamSource(stream)
                const analyser = audioCtx.createAnalyser()
                analyser.fftSize = 512
                analyser.smoothingTimeConstant = 0.8
                source.connect(analyser)
                analyserRef.current = { analyser, audioCtx }

                let silentFrames = 0
                const SILENCE_THRESHOLD = 15
                const SILENCE_FRAMES_NEEDED = 35 // ~2 seconds

                silenceCheckRef.current = setInterval(() => {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount)
                    analyser.getByteFrequencyData(dataArray)
                    
                    // Efficient loop instead of reduce for large arrays
                    let sum = 0
                    for (let i = 0; i < dataArray.length; i++) {
                        sum += dataArray[i]
                    }
                    const avg = sum / dataArray.length

                    if (avg < SILENCE_THRESHOLD) {
                        silentFrames++
                        if (silentFrames >= SILENCE_FRAMES_NEEDED && audioChunksRef.current.length > 0) {
                            stopRecording()
                        }
                    } else {
                        silentFrames = 0
                    }
                }, 120) // Throttled from 60ms to 120ms
            } catch (e) {
                console.warn('Silence detection unavailable:', e.message)
            }

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data)
            }

            mediaRecorder.onstop = async () => {
                if (silenceCheckRef.current) clearInterval(silenceCheckRef.current)
                if (analyserRef.current?.audioCtx) {
                    analyserRef.current.audioCtx.close().catch(() => { })
                    analyserRef.current = null
                }
                if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)

                stream.getTracks().forEach(t => t.stop())
                const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType })

                if (audioBlob.size > 1000) {
                    await transcribeAudio(audioBlob)
                }
            }

            mediaRecorder.start(250)
            setRecording(true)

            // Safety: max 15 seconds per recording turn
            recordingTimerRef.current = setTimeout(() => {
                stopRecording()
            }, 15000)

        } catch (err) {
            console.error('Mic access denied:', err)
        }
    }, [loading, recording])

    const stopRecording = useCallback(() => {
        if (silenceCheckRef.current) clearInterval(silenceCheckRef.current)
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
            setRecording(false)
        }
    }, [])

    const transcribeAudio = async (audioBlob) => {
        setTranscribing(true)
        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')
            formData.append('language', 'unknown')

            const token = localStorage.getItem('mantram_token')
            const resp = await fetch(`${API_BASE}/voice/transcribe`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData,
            })
            const data = await resp.json()

            if (data.success && data.text) {
                setInput(data.text)
                // Auto-send after transcription
                setTimeout(() => sendMessage(data.text), 100)
            }
        } catch (err) {
            console.error('Transcription failed:', err)
        }
        setTranscribing(false)
    }

    // ══════════════════════════════════════════════
    // SEND MESSAGE — SSE Streaming (text-only responses)
    // ══════════════════════════════════════════════

    const sendMessage = async (text) => {
        const msg = text || input.trim()
        if (!msg || loading) return
        setInput('')
        setOpen(true)
        const imageUrlsToSend = [...pendingImageUrls]
        setPendingImageUrls([])  // clear pending before send
        if (imageUrlsToSend.length > 0) {
            setMessages(prev => [...prev, { role: 'user', content: msg, attachedImages: imageUrlsToSend }])
        } else {
            setMessages(prev => [...prev, { role: 'user', content: msg }])
        }
        setLoading(true)
        setStreamingText('')
        setStreamingAction(null)

        const token = localStorage.getItem('mantram_token')

        // Helper: clean think tags
        const stripThink = (t) => (t || '')
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/<\/?think>/gi, '')
            .trim()

        try {
            const resp = await fetch(`${API_BASE}/nexus/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ message: msg, brandId, images: imageUrlsToSend }),
            })

            if (!resp.ok) {
                // Fallback to non-streaming endpoint
                const fallbackResp = await fetch(`${API_BASE}/nexus/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ message: msg, brandId, images: imageUrlsToSend }),
                })
                const fallbackData = await fallbackResp.json()
                const cleanReply = stripThink(fallbackData.reply) || 'hmm, try again? 😊'
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: cleanReply,
                    action: fallbackData.action,
                }])
                if (fallbackData.imageUrl) {
                    setMessages(prev => [...prev, {
                        role: 'image',
                        imageUrl: fallbackData.imageUrl,
                        prompt: fallbackData.imagePrompt || '',
                    }])
                }
                if (fallbackData.action?.route) {
                    setTimeout(() => { navigate(fallbackData.action.route); setOpen(false) }, 800)
                }
                setLoading(false)
                return
            }

            // ── Parse SSE stream ──
            const reader = resp.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let accumulatedText = ''
            let pendingAction = null

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const parts = buffer.split('\n')
                buffer = parts.pop() || ''

                let currentEvent = null
                for (const line of parts) {
                    const trimmed = line.trim()
                    if (!trimmed) { currentEvent = null; continue }
                    if (trimmed.startsWith('event:')) {
                        currentEvent = trimmed.slice(6).trim()
                        continue
                    }
                    if (trimmed.startsWith('data:') && currentEvent) {
                        const dataStr = trimmed.slice(5).trim()
                        try {
                            const data = JSON.parse(dataStr)

                            switch (currentEvent) {
                                case 'token': {
                                    accumulatedText += (data.t || data.token || '')
                                    const displayText = stripThink(accumulatedText)
                                    setStreamingText(displayText)
                                    break
                                }

                                case 'intent':
                                    pendingAction = data.action
                                    setStreamingAction(data.action)
                                    break

                                case 'step_update':
                                    // Video pipeline step tracker
                                    setVideoStep(data)
                                    setStreamingText(data.label || '⚙️ Working...')
                                    break

                                case 'script_ready':
                                    setMessages(prev => [...prev, {
                                        role: 'script',
                                        content: data.script || '',
                                    }])
                                    break

                                case 'storyboard_ready':
                                    if (data.frames?.length) {
                                        setMessages(prev => [...prev, {
                                            role: 'storyboard',
                                            frames: data.frames,
                                        }])
                                    }
                                    break

                                case 'video_queued':
                                    setVideoStep(null)
                                    setMessages(prev => [...prev, {
                                        role: 'video_queued',
                                        projectId: data.projectId,
                                        frames: data.frames,
                                        message: data.message,
                                    }])
                                    break

                                case 'done': {
                                    const rawFinal = data.reply || accumulatedText
                                    const finalReply = stripThink(rawFinal)
                                    setStreamingText('')
                                    setVideoStep(null)
                                    setMessages(prev => [...prev, {
                                        role: 'assistant',
                                        content: finalReply,
                                        action: pendingAction,
                                    }])
                                    if (pendingAction?.route) {
                                        setTimeout(() => {
                                            navigate(pendingAction.route)
                                            setOpen(false)
                                        }, 800)
                                    }
                                    break
                                }

                                case 'error':
                                    setStreamingText('')
                                    setVideoStep(null)
                                    setMessages(prev => [...prev, {
                                        role: 'assistant',
                                        content: data.message || 'oops, try again? 😊'
                                    }])
                                    break

                                case 'image_generated': {
                                    setMessages(prev => [...prev, {
                                        role: 'image',
                                        imageUrl: data.imageUrl,
                                        prompt: data.prompt,
                                        subtype: data.subtype || 'generated',
                                    }])
                                    break
                                }

                                case 'status':
                                    setStreamingText(data.message || '🔍 Researching...')
                                    break
                            }
                        } catch { /* skip malformed JSON */ }
                        currentEvent = null
                    }
                }
            }

        } catch (err) {
            console.error('Nexus stream error:', err)
            setStreamingText('')

            // Last resort fallback
            try {
                const fallbackResp = await fetch(`${API_BASE}/nexus/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ message: msg, brandId, images: imageUrlsToSend }),
                })
                const data = await fallbackResp.json()
                const cleanReply = stripThink(data.reply) || 'oops, try again? 😊'
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: cleanReply,
                    action: data.action,
                }])
                if (data.imageUrl) {
                    setMessages(prev => [...prev, {
                        role: 'image',
                        imageUrl: data.imageUrl,
                        prompt: data.imagePrompt || '',
                    }])
                }
            } catch {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'oops, something went wrong! try again? 😊'
                }])
            }
        }
        setLoading(false)
        setStreamingAction(null)
    }

    const clearChat = async () => {
        window.speechSynthesis?.cancel()
        try { await nexusAPI.clear() } catch { /* */ }
        setMessages([{
            role: 'assistant',
            content: activeBrand?.name
                ? `fresh start! 🌸 what's up with ${activeBrand.name}?`
                : `fresh start! 🌸 what's on your mind?`
        }])
    }

    // Context-aware placeholder
    const getPlaceholder = () => {
        const path = location.pathname
        if (path.includes('seo')) return 'Ask Fidato about SEO...'
        if (path.includes('content')) return 'Ask Fidato to create content...'
        if (path.includes('creative')) return 'Ask Fidato to design something...'
        if (path.includes('video')) return 'Ask Fidato about videos...'
        if (path.includes('brainstorm')) return 'Brainstorm with Fidato...'
        if (path.includes('performance')) return 'Ask about ad campaigns...'
        if (path.includes('d2c')) return 'Ask about Shopify analytics...'
        return activeBrand?.name
            ? `Ask Fidato about ${activeBrand.name}... (⌘K)`
            : 'Ask Fidato anything... (⌘K)'
    }

    // ══════════════════════════════════════════════
    // COPY TEXT HELPER
    // ══════════════════════════════════════════════
    const copyText = (text, idx) => {
        try { navigator.clipboard.writeText(text) } catch { document.execCommand('copy') }
        setCopiedIdx(idx)
        setTimeout(() => setCopiedIdx(null), 2000)
    }

    // ══════════════════════════════════════════════
    // HISTORY PANEL
    // ══════════════════════════════════════════════
    const loadHistory = async () => {
        try {
            const token = localStorage.getItem('mantram_token')
            const params = new URLSearchParams()
            if (brandId) params.set('brandId', brandId)
            if (historyFilter !== 'all') params.set('type', historyFilter)
            const resp = await fetch(`${API_BASE}/nexus/history?${params}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            const data = await resp.json()
            if (data.success) setHistory(data.threads || [])
        } catch { /* silent */ }
    }

    useEffect(() => {
        if (showHistory) loadHistory()
    }, [showHistory, historyFilter, brandId])

    // ══════════════════════════════════════════════
    // RICH RESULT CARD RENDERERS
    // ══════════════════════════════════════════════

    // ImageResultCard — premium image viewer with zoom / download
    const ImageResultCard = ({ imageUrl, prompt, subtype }) => (
        <div style={{ background: 'var(--sys-surface)', border: '1px solid rgba(255,77,0,0.2)', borderRadius: 16, overflow: 'hidden', maxWidth: 280 }}>
            <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => { setLightboxUrl(imageUrl); setLightboxZoom(1) }}>
                <img src={imageUrl} alt={prompt} style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'cover' }} />
                <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '3px 6px', fontSize: 10, color: '#fff' }}>
                    {subtype === 'photoshoot' ? '📸 AI Photoshoot' : '🎨 Generated'}
                </div>
            </div>
            <div style={{ padding: '8px 10px' }}>
                <p style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prompt?.slice(0, 50)}…</p>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setLightboxUrl(imageUrl)}
                        style={{ flex: 1, padding: '4px 0', borderRadius: 8, background: 'rgba(255,77,0,0.1)', border: '1px solid rgba(255,77,0,0.2)', color: '#FF7A00', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>zoom_in</span> Zoom
                    </button>
                    <a href={imageUrl} download="fidato-image.png"
                        style={{ flex: 1, padding: '4px 0', borderRadius: 8, background: 'rgba(255,77,0,0.1)', border: '1px solid rgba(255,77,0,0.2)', color: '#FF7A00', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, textDecoration: 'none' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span> Save
                    </a>
                    <ShareMenu idx={`img-${imageUrl}`} imageUrl={imageUrl} text="Created with Mantram AI" />
                </div>
            </div>
        </div>
    )

    // VideoProgressCard — animated step tracker
    const VideoProgressCard = ({ step }) => {
        const steps = [
            { id: 'script', label: 'Writing script', icon: 'edit_note' },
            { id: 'storyboard', label: 'Creating frames', icon: 'photo_library' },
            { id: 'video', label: 'Generating video', icon: 'movie_creation' },
        ]
        const activeIdx = steps.findIndex(s => s.id === step?.step)
        return (
            <div style={{ background: 'var(--sys-surface)', border: '1px solid rgba(255,77,0,0.2)', borderRadius: 16, padding: '12px 14px', maxWidth: 280 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#FF7A00', marginBottom: 10 }}>🎬 Creating your video</p>
                {steps.map((s, i) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div style={{
                            width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10,
                            background: i < activeIdx ? '#22c55e' : i === activeIdx ? '#FF4D00' : 'rgba(255,255,255,0.06)',
                            color: i <= activeIdx ? '#fff' : 'var(--sys-text-muted)',
                            transition: 'all 0.3s',
                        }}>
                            {i < activeIdx
                                ? <span className="material-symbols-outlined" style={{ fontSize: 12 }}>check</span>
                                : i === activeIdx
                                    ? <span className="material-symbols-outlined" style={{ fontSize: 12, animation: 'spin 1s linear infinite' }}>{s.icon}</span>
                                    : <span style={{ fontSize: 10 }}>{i + 1}</span>
                            }
                        </div>
                        <span style={{ fontSize: 11, color: i <= activeIdx ? 'var(--sys-text)' : 'var(--sys-text-muted)', fontWeight: i === activeIdx ? 600 : 400 }}>{s.label}</span>
                        {i === activeIdx && <span style={{ marginLeft: 'auto', width: 16, height: 16, borderRadius: '50%', border: '2px solid #FF4D00', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />}
                    </div>
                ))}
            </div>
        )
    }

    // VideoQueuedCard — shows script + frames + queued status
    const VideoQueuedCard = ({ frames, projectId, message }) => (
        <div style={{ background: 'var(--sys-surface)', border: '1px solid rgba(255,77,0,0.2)', borderRadius: 16, overflow: 'hidden', maxWidth: 300 }}>
            {frames?.length > 0 && (
                <div style={{ display: 'flex', gap: 2, padding: '8px 8px 0' }}>
                    {frames.slice(0, 4).map((f, i) => (
                        <img key={i} src={f.url} alt="" style={{ flex: 1, height: 56, objectFit: 'cover', borderRadius: 8 }} />
                    ))}
                </div>
            )}
            <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✅ Video queued</span>
                    {projectId && <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 4 }}>#{projectId.toString().slice(-6)}</span>}
                </div>
                <p style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>{message}</p>
                <button onClick={() => { navigate('/video-studio'); setOpen(false) }}
                    style={{ marginTop: 8, width: '100%', padding: '5px 0', borderRadius: 8, background: 'rgba(255,77,0,0.1)', border: '1px solid rgba(255,77,0,0.2)', color: '#FF7A00', fontSize: 11, cursor: 'pointer' }}>
                    Open Video Studio →
                </button>
            </div>
        </div>
    )

    // ContentCard — rich content output with copy + publish
    const ContentCard = ({ content, idx }) => (
        <div style={{ background: 'var(--sys-surface)', border: '1px solid rgba(255,77,0,0.15)', borderRadius: 14, overflow: 'hidden', maxWidth: 300 }}>
            <div style={{ padding: '10px 12px', maxHeight: 160, overflowY: 'auto', fontSize: 12, color: 'var(--sys-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {content}
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--sys-border)' }}>
                <button onClick={() => copyText(content, idx)}
                    style={{ flex: 1, padding: '6px 0', fontSize: 10, color: copiedIdx === idx ? '#22c55e' : '#FF7A00', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{copiedIdx === idx ? 'check' : 'content_copy'}</span>
                    {copiedIdx === idx ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={() => navigate('/publish')}
                    style={{ flex: 1, padding: '6px 0', fontSize: 10, color: '#FF7A00', background: 'transparent', border: 'none', borderLeft: '1px solid var(--sys-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>send</span> Publish
                </button>
            </div>
        </div>
    )

    // ScriptCard — displays the generated video script
    const ScriptCard = ({ content }) => (
        <div style={{ background: 'rgba(255,77,0,0.06)', border: '1px solid rgba(255,77,0,0.15)', borderRadius: 12, padding: '10px 12px', maxWidth: 290 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#FF7A00', marginBottom: 6 }}>📝 Video Script</p>
            <pre style={{ fontSize: 10, color: 'var(--sys-text)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', lineHeight: 1.5 }}>{content}</pre>
        </div>
    )

    // Quick suggestions
    const suggestions = activeBrand ? [
        `How should I promote ${activeBrand.name}?`,
        'Go to Content Studio',
        'What should I post this week?',
        'Brainstorm campaign ideas',
    ] : [
        'What studios are available?',
        'How do I create a brand?',
        'Go to Brand DNA',
        'What can you help me with?',
    ]

    // ══════════════════════════════════════════════
    // IMAGE UPLOAD — multipart → backend → S3 (no base64)
    // ══════════════════════════════════════════════

    const uploadImageToS3 = async (file) => {
        const formData = new FormData()
        formData.append('image', file)
        if (brandId) formData.append('brandId', brandId)
        const token = localStorage.getItem('mantram_token')
        const resp = await fetch(`${API_BASE}/nexus/upload-image`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
        })
        const data = await resp.json()
        if (!data.success) throw new Error(data.error || 'Upload failed')
        return data.imageUrl
    }

    const handleFileSelect = async (files) => {
        if (!files?.length) return
        setUploading(true)
        try {
            const urls = await Promise.all(Array.from(files).map(uploadImageToS3))
            setPendingImageUrls(prev => [...prev, ...urls])
        } catch (err) {
            console.error('Image upload failed:', err)
        }
        setUploading(false)
    }

    const handlePaste = async (e) => {
        const items = Array.from(e.clipboardData?.items || [])
        const imageItems = items.filter(i => i.type.startsWith('image/'))
        if (!imageItems.length) return
        e.preventDefault()
        setUploading(true)
        try {
            const files = imageItems.map(i => i.getAsFile()).filter(Boolean)
            const urls = await Promise.all(files.map(uploadImageToS3))
            setPendingImageUrls(prev => [...prev, ...urls])
        } catch (err) {
            console.error('Paste upload failed:', err)
        }
        setUploading(false)
    }

    // ══════════════════════════════════════════════
    // SHARE — WhatsApp (Web Share API on mobile, wa.me on desktop)
    // ══════════════════════════════════════════════

    const shareViaWhatsApp = async (imageUrl, text) => {
        const isMob = /Android|iPhone|iPad/i.test(navigator.userAgent)
        if (isMob && navigator.share) {
            try {
                if (imageUrl) {
                    const blob = await fetch(imageUrl).then(r => r.blob())
                    const file = new File([blob], 'mantram-creative.png', { type: blob.type })
                    await navigator.share({ title: 'Mantram AI', text: text || 'Created with Mantram AI', files: [file] })
                } else {
                    await navigator.share({ title: 'Mantram AI', text: text || '' })
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    const encoded = encodeURIComponent(imageUrl ? `Check this out: ${imageUrl}` : (text || ''))
                    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener')
                }
            }
        } else {
            const encoded = encodeURIComponent(imageUrl ? `Check this out: ${imageUrl}` : (text || ''))
            window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener')
        }
        setShareMenuIdx(null)
    }

    const copyContent = async (text) => {
        try { await navigator.clipboard.writeText(text) } catch { /* noop */ }
        setShareMenuIdx(null)
    }

    // ShareMenu component (inline)
    const ShareMenu = ({ idx, imageUrl, text }) => {
        const isOpen = shareMenuIdx === idx
        return (
            <div className="relative inline-block">
                <button
                    onClick={(e) => { e.stopPropagation(); setShareMenuIdx(isOpen ? null : idx) }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-[#FF4D00] hover:bg-[#FF4D00]/10 transition-all cursor-pointer"
                >
                    <span className="material-symbols-outlined text-xs">share</span>
                    Share
                </button>
                {isOpen && (
                    <div className="absolute bottom-8 left-0 z-50 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-1.5 min-w-[150px] shadow-2xl animate-fade-in">
                        <button onClick={() => shareViaWhatsApp(imageUrl, text)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--sys-bg)] text-xs text-left transition-all cursor-pointer">
                            <span style={{ fontSize: 15 }}>💬</span>
                            <span className="text-[var(--sys-text)]">WhatsApp</span>
                        </button>
                        <button onClick={() => copyContent(imageUrl || text || '')}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--sys-bg)] text-xs text-left transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)]">content_copy</span>
                            <span className="text-[var(--sys-text)]">Copy Link</span>
                        </button>
                        {imageUrl && (
                            <a href={imageUrl} download target="_blank" rel="noreferrer"
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--sys-bg)] text-xs transition-all">
                                <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)]">download</span>
                                <span className="text-[var(--sys-text)]">Download</span>
                            </a>
                        )}
                    </div>
                )}
            </div>
        )
    }


    return (
        <>
            {/* ═══════════ BRIEFING POPUP ═══════════ */}
            {showBriefing && briefing && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={() => dismissBriefing()}>
                    <div className="absolute inset-0 bg-[var(--sys-surface)] " />
                    <div className="relative w-full max-w-md rounded-3xl overflow-hidden animate-fade-in"
                        style={{
                            background: 'var(--sys-primary), rgba(10,10,26,0.99))',
                            border: '1px solid rgba(255, 77, 0, 0.25)',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(255, 77, 0, 0.15)',
                        }}
                        onClick={e => e.stopPropagation()}>

                        <div className="relative p-6 pb-4 text-center overflow-hidden">
                            <div className="absolute inset-0 opacity-20"
                                style={{ background: 'radial-gradient(circle at 50% 0%, #FF4D00 0%, transparent 70%)' }} />
                            <div className="relative">
                                <div className="size-16 rounded-full mx-auto mb-3 flex items-center justify-center text-[var(--sys-text)] text-2xl"
                                    style={{ background: 'var(--sys-primary)' }}>
                                    <span className="material-symbols-outlined text-3xl">support_agent</span>
                                </div>
                                <p className="text-xl font-bold text-[var(--sys-text)]">{briefing.greeting}</p>
                                {activeBrand?.name && (
                                    <p className="text-xs text-[#FF7A00]/60 mt-1">Advising for {activeBrand.name}</p>
                                )}
                            </div>
                        </div>

                        <div className="px-6 pb-4 space-y-3">
                            <div className="rounded-2xl p-3.5 flex items-start gap-3"
                                style={{ background: 'rgba(255, 77, 0,0.08)', border: '1px solid rgba(255, 77, 0,0.12)' }}>
                                <span className="material-symbols-outlined text-[#FF4D00] text-lg mt-0.5">celebration</span>
                                <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{briefing.daySpecial}</p>
                            </div>
                            <div className="rounded-2xl p-3.5 flex items-start gap-3"
                                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)' }}>
                                <span className="material-symbols-outlined text-primary text-lg mt-0.5">monitoring</span>
                                <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{briefing.brandHealth}</p>
                            </div>
                            <div className="rounded-2xl p-3.5 text-center"
                                style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.1)' }}>
                                <p className="text-sm border-[var(--sys-border)] italic leading-relaxed">"{briefing.inspiration}"</p>
                            </div>
                            {briefing.suggestions?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {briefing.suggestions.slice(0, 3).map((s, i) => (
                                        <button key={i}
                                            onClick={() => { dismissBriefing(); sendMessage(s) }}
                                            className="px-3 py-1.5 rounded-xl text-[11px] font-medium cursor-pointer transition-all hover:scale-[1.03]"
                                            style={{
                                                background: 'rgba(255, 77, 0,0.1)',
                                                border: '1px solid rgba(255, 77, 0,0.15)',
                                                color: 'rgba(196,181,253,0.9)',
                                            }}>
                                            {s.length > 40 ? s.substring(0, 37) + '...' : s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="px-6 pb-5 pt-2 flex items-center justify-between">
                            <button onClick={() => dismissBriefing(true)}
                                className="text-[11px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer">
                                don't show again
                            </button>
                            <button onClick={() => dismissBriefing()}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-[var(--sys-text)] cursor-pointer transition-all hover:scale-[1.03]"
                                style={{ background: 'var(--sys-primary)' }}>
                                let's go! 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ MOBILE FULL-SCREEN CHAT (top-level, outside bubble wrapper) ═══════════ */}
            {isMobile && open && (
                <div
                    className="fixed inset-0 z-[10001] flex flex-col"
                    style={{ background: 'var(--sys-bg, #0a0a1a)' }}
                    onClick={() => setShareMenuIdx(null)}
                >
                    {/* ── Header ── */}
                    <div className="flex items-center gap-3 px-4 border-b border-[var(--sys-border)] shrink-0"
                        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 14 }}>
                        <button onClick={() => setOpen(false)}
                            className="size-9 rounded-full flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] cursor-pointer transition-all shrink-0">
                            <span className="material-symbols-outlined text-xl">arrow_back</span>
                        </button>
                        <div className="size-9 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: 'var(--sys-primary)' }}>
                            <span className="material-symbols-outlined text-base text-white">support_agent</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[var(--sys-text)]">Fidato</p>
                            <p className="text-[11px] text-emerald-400">● online</p>
                        </div>
                        <button onClick={clearChat}
                            className="size-9 rounded-full flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] cursor-pointer transition-all shrink-0">
                            <span className="material-symbols-outlined text-base">refresh</span>
                        </button>
                    </div>

                    {/* ── Messages (scrollable middle) ── */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                        {messages.map((m, i) => (
                            <div key={i}>
                                {m.role === 'image' ? (
                                    <div className="flex gap-2.5">
                                        <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs" style={{ background: 'var(--sys-primary)' }}>
                                            <span className="material-symbols-outlined text-xs">support_agent</span>
                                        </div>
                                        <div className="rounded-2xl overflow-hidden border border-[var(--sys-border)] max-w-[72vw]" style={{ background: 'var(--sys-surface)' }}>
                                            <img src={m.imageUrl} alt={m.prompt} className="w-full object-cover" style={{ maxHeight: 220 }} />
                                            <div className="px-3 py-1.5 flex items-center gap-1">
                                                <p className="text-[11px] text-[var(--sys-text-muted)] flex-1 truncate">{m.prompt?.slice(0, 40)}…</p>
                                                <ShareMenu idx={`img-${i}`} imageUrl={m.imageUrl} text={`Created with Mantram AI: ${m.imageUrl}`} />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                        {m.role === 'assistant' && (
                                            <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs" style={{ background: 'var(--sys-primary)' }}>
                                                <span className="material-symbols-outlined text-xs">support_agent</span>
                                            </div>
                                        )}
                                        <div className="max-w-[78vw]">
                                            {m.attachedImages?.length > 0 && (
                                                <div className="flex gap-1 mb-1 flex-wrap">
                                                    {m.attachedImages.map((url, j) => (
                                                        <img key={j} src={url} alt="" className="w-14 h-14 rounded-xl object-cover border border-[var(--sys-border)]" />
                                                    ))}
                                                </div>
                                            )}
                                            <div className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed ${m.role === 'user'
                                                ? 'bg-[#FF4D00] text-white rounded-tr-sm'
                                                : 'bg-[var(--sys-surface)] text-[var(--sys-text)] rounded-tl-sm border border-[var(--sys-border)]'
                                            }`} style={{ whiteSpace: 'pre-wrap' }}>
                                                {m.content}
                                            </div>
                                            {m.action?.route && (
                                                <button onClick={() => { navigate(m.action.route); setOpen(false) }}
                                                    className="mt-1 px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1 cursor-pointer"
                                                    style={{ background: 'rgba(255,77,0,0.12)', border: '1px solid rgba(255,77,0,0.2)', color: '#c4b5fd' }}>
                                                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                    Open {m.action.label}
                                                </button>
                                            )}
                                            {m.role === 'assistant' && m.content?.length > 30 && (
                                                <div className="mt-1"><ShareMenu idx={`msg-${i}`} text={m.content} /></div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Streaming */}
                        {streamingText && (
                            <div className="flex gap-2.5">
                                <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs" style={{ background: 'var(--sys-primary)' }}>
                                    <span className="material-symbols-outlined text-xs">support_agent</span>
                                </div>
                                <div className="max-w-[78vw] px-4 py-2.5 rounded-2xl rounded-tl-sm bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[14px] text-[var(--sys-text)] leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                                    {streamingText}<span className="inline-block w-1.5 h-4 bg-[#FF4D00] ml-0.5 rounded-sm animate-pulse" />
                                </div>
                            </div>
                        )}

                        {/* Loading dots */}
                        {loading && !streamingText && (
                            <div className="flex gap-2.5">
                                <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs" style={{ background: 'var(--sys-primary)' }}>
                                    <span className="material-symbols-outlined text-xs">support_agent</span>
                                </div>
                                <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <div className="flex gap-1.5">
                                        <span className="size-2 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="size-2 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="size-2 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* ── Quick suggestions ── */}
                    {messages.length <= 1 && !loading && (
                        <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-[var(--sys-border)] shrink-0">
                            {suggestions.map((q, i) => (
                                <button key={i} onClick={() => sendMessage(q)}
                                    className="px-3 py-1.5 rounded-full text-[12px] cursor-pointer transition-all"
                                    style={{ background: 'rgba(255,77,0,0.1)', border: '1px solid rgba(255,77,0,0.15)', color: '#FF7A00' }}>
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Pending images strip ── */}
                    {(pendingImageUrls.length > 0 || uploading) && (
                        <div className="px-4 pt-2 pb-1 flex gap-2 overflow-x-auto shrink-0 border-t border-[var(--sys-border)]">
                            {pendingImageUrls.map((url, i) => (
                                <div key={i} className="relative shrink-0">
                                    <img src={url} alt="" className="w-14 h-14 rounded-xl object-cover border border-[var(--sys-border)]" />
                                    <button onClick={() => setPendingImageUrls(prev => prev.filter((_, j) => j !== i))}
                                        className="absolute -top-1 -right-1 size-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center cursor-pointer">×</button>
                                </div>
                            ))}
                            {uploading && (
                                <div className="w-14 h-14 rounded-xl border border-[var(--sys-border)] bg-[var(--sys-surface)] flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-base text-[#FF4D00] animate-spin">progress_activity</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Recording indicator ── */}
                    {(recording || transcribing) && (
                        <div className="px-4 py-1 flex items-center gap-2 shrink-0">
                            <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[11px] text-[var(--sys-text-muted)]">{recording ? '🎤 Listening...' : '🧠 Transcribing...'}</span>
                        </div>
                    )}

                    {/* ── Bottom input bar (always visible) ── */}
                    <div className="px-3 py-2 border-t border-[var(--sys-border)] shrink-0 flex items-center gap-2"
                        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
                        {/* Gallery */}
                        <button onClick={() => galleryInputRef.current?.click()} disabled={uploading}
                            className="size-10 rounded-full flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer shrink-0">
                            <span className="material-symbols-outlined text-xl">photo_library</span>
                        </button>
                        {/* Camera */}
                        <button onClick={() => cameraInputRef.current?.click()} disabled={uploading}
                            className="size-10 rounded-full flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer shrink-0">
                            <span className="material-symbols-outlined text-xl">photo_camera</span>
                        </button>
                        {/* Text input */}
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                            onPaste={handlePaste}
                            placeholder="Message Fidato..."
                            className="flex-1 rounded-full px-4 py-2.5 text-[14px] text-[var(--sys-text)] outline-none transition-all"
                            style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}
                            aria-label="Message to Fidato"
                        />
                        {/* Mic */}
                        <button onClick={recording ? stopRecording : startRecording} disabled={transcribing}
                            className={`size-10 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${recording ? 'bg-red-500 text-white animate-pulse' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}>
                            <span className="material-symbols-outlined text-xl">{recording ? 'stop' : transcribing ? 'hourglass_top' : 'mic'}</span>
                        </button>
                        {/* Send */}
                        <button onClick={() => sendMessage()}
                            disabled={loading || (!input.trim() && pendingImageUrls.length === 0)}
                            className="size-10 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0"
                            style={{ background: (input.trim() || pendingImageUrls.length > 0) ? 'var(--sys-primary)' : 'var(--sys-surface)' }}>
                            <span className={`material-symbols-outlined text-xl ${(input.trim() || pendingImageUrls.length > 0) ? 'text-white' : 'text-[var(--sys-text-muted)]'}`}>send</span>
                        </button>
                    </div>

                    {/* Hidden file inputs */}
                    <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }} />
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }} />
                </div>
            )}

            {/* ═══════════ FLOATING FIDATO BUBBLE (desktop popup) ═══════════ */}
            <div className="fixed bottom-6 right-4 sm:right-6 z-[9999]" ref={dropdownRef}>


                {/* ── DESKTOP CHAT PANEL (popup above bubble) ── */}
                {open && !isMobile && (
                    <div
                        className={`animate-fade-in absolute bottom-16 right-0 rounded-2xl overflow-hidden ${expanded ? 'w-[calc(100vw-48px)] sm:w-[450px] lg:w-[520px]' : 'w-[calc(100vw-48px)] sm:w-[380px]'}`}
                        style={{
                            background: 'rgba(10,10,26,0.98)',
                            border: '1px solid rgba(255, 77, 0, 0.25)',
                            boxShadow: '0 -8px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255, 77, 0, 0.1)',
                            backdropFilter: 'blur(24px)',
                            maxHeight: expanded ? '85vh' : 'min(500px, 70vh)',
                        }}
                        onClick={() => setShareMenuIdx(null)}
                    >
                        {/* Panel Header */}
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--sys-border)] shrink-0">
                            <div className="relative">
                                <div className="size-8 rounded-full flex items-center justify-center text-[var(--sys-text)] text-sm"
                                    style={{ background: 'var(--sys-primary)' }}>
                                    <span className="material-symbols-outlined text-sm">support_agent</span>
                                </div>
                                <span className="absolute bottom-0 right-0 size-2.5 rounded-full border border-[#0f0f1e] bg-emerald-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-[var(--sys-text)]">Fidato</p>
                                <p className="text-[10px] text-[var(--sys-text-muted)] truncate">
                                    {activeBrand?.name ? `Brand Manager • ${activeBrand.name}` : 'Your Brand Manager'}
                                </p>
                            </div>
                            <button onClick={() => setExpanded(!expanded)}
                                    className="size-7 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all"
                                    title={expanded ? 'Collapse' : 'Expand'}>
                                    <span className="material-symbols-outlined text-xs">{expanded ? 'collapse_content' : 'expand_content'}</span>
                                </button>
                            <button onClick={() => setShowHistory(h => !h)}
                                className="size-7 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all"
                                title="Conversation history">
                                <span className="material-symbols-outlined text-xs">history</span>
                            </button>
                            <button onClick={clearChat}
                                className="size-7 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all"
                                title="Clear chat">
                                <span className="material-symbols-outlined text-xs">refresh</span>
                            </button>
                            <button onClick={() => { setOpen(false); setExpanded(false) }}
                                className="size-7 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="overflow-y-auto p-4 space-y-3"
                            style={{ maxHeight: expanded ? 'calc(75vh - 180px)' : 320 }}>
                            {messages.map((m, i) => (
                                <div key={i}>
                                    {m.role === 'image' ? (
                                        <div className="flex gap-2.5">
                                            <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-[var(--sys-text)] text-[10px]"
                                                style={{ background: 'var(--sys-primary)' }}>
                                                <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                            </div>
                                            <ImageResultCard imageUrl={m.imageUrl} prompt={m.prompt} subtype={m.subtype} />
                                        </div>
                                    ) : m.role === 'script' ? (
                                        <div className="flex gap-2.5">
                                            <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]" style={{ background: 'var(--sys-primary)' }}>
                                                <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                            </div>
                                            <ScriptCard content={m.content} />
                                        </div>
                                    ) : m.role === 'storyboard' ? (
                                        <div className="flex gap-2.5">
                                            <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]" style={{ background: 'var(--sys-primary)' }}>
                                                <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, maxWidth: 260 }}>
                                                {m.frames?.map((f, fi) => <img key={fi} src={f.url} alt="" style={{ flex: 1, height: 56, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }} onClick={() => setLightboxUrl(f.url)} />)}
                                            </div>
                                        </div>
                                    ) : m.role === 'video_queued' ? (
                                        <div className="flex gap-2.5">
                                            <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]" style={{ background: 'var(--sys-primary)' }}>
                                                <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                            </div>
                                            <VideoQueuedCard frames={m.frames} projectId={m.projectId} message={m.message} />
                                        </div>
                                    ) : (
                                        /* ── Regular message (user / assistant) ── */
                                        <div className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                            {m.role === 'assistant' && (
                                                <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-[var(--sys-text)] text-[10px]"
                                                    style={{ background: 'var(--sys-primary)' }}>
                                                    <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                                </div>
                                            )}
                                            <div>
                                                {/* Attached image thumbnails in user messages */}
                                                {m.attachedImages?.length > 0 && (
                                                    <div className="flex gap-1 mb-1 flex-wrap">
                                                        {m.attachedImages.map((url, j) => (
                                                            <img key={j} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-[var(--sys-border)]" />
                                                        ))}
                                                    </div>
                                                )}
                                                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${m.role === 'user'
                                                    ? 'bg-[var(--sys-text)] text-[var(--sys-bg)] rounded-br-sm border border-[var(--sys-border)]'
                                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text)] rounded-bl-sm border border-[var(--sys-border)]'
                                                    }`}
                                                    style={{ whiteSpace: 'pre-wrap' }}>
                                                    {m.content}
                                                </div>
                                                {/* Action button */}
                                                {m.action?.route && (
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <button
                                                            onClick={() => { navigate(m.action.route); setOpen(false) }}
                                                            className="px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-1"
                                                            style={{ background: 'rgba(255, 77, 0,0.12)', border: '1px solid rgba(255, 77, 0,0.2)', color: '#c4b5fd' }}>
                                                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                            Open {m.action.label}
                                                        </button>
                                                    </div>
                                                )}
                                                {/* Share on assistant messages */}
                                                {m.role === 'assistant' && m.content?.length > 30 && (
                                                    <div className="mt-1">
                                                        <ShareMenu idx={`msg-${i}`} text={m.content} />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Live streaming text or VideoProgressCard */}
                            {videoStep && loading ? (
                                <div className="flex gap-2.5">
                                    <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs" style={{ background: 'var(--sys-primary)' }}>
                                        <span className="material-symbols-outlined text-xs">support_agent</span>
                                    </div>
                                    <VideoProgressCard step={videoStep} />
                                </div>
                            ) : streamingText ? (
                                <div className="flex gap-2.5">
                                    <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs" style={{ background: 'var(--sys-primary)' }}>
                                        <span className="material-symbols-outlined text-xs">support_agent</span>
                                    </div>
                                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[13px] text-[var(--sys-text)] leading-relaxed"
                                        style={{ whiteSpace: 'pre-wrap' }}>
                                        {streamingText}
                                        <span className="inline-block w-1.5 h-4 bg-[#FF4D00] ml-0.5 rounded-sm animate-pulse" />
                                    </div>
                                </div>
                            ) : null}

                            {/* Loading dots */}
                            {loading && !streamingText && !videoStep && (
                                <div className="flex gap-2.5">
                                    <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]"
                                        style={{ background: 'var(--sys-primary)' }}>
                                        <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                    </div>
                                    <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                        <div className="flex gap-1">
                                            <span className="size-1.5 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="size-1.5 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="size-1.5 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Quick suggestions (when few messages) */}
                        {messages.length <= 1 && !loading && (
                            <div className="px-4 pb-2 flex flex-wrap gap-1.5 border-t border-[var(--sys-border)] pt-2.5 shrink-0">
                                {suggestions.map((q, i) => (
                                    <button key={i} onClick={() => sendMessage(q)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#FF4D00]/8 text-[#FF7A00] text-[11px] border border-[#FF4D00]/12 hover:bg-[#FF4D00]/15 cursor-pointer transition-all">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Pending image thumbnails strip */}
                        {(pendingImageUrls.length > 0 || uploading) && (
                            <div className="px-3 pt-2 flex gap-2 flex-wrap border-t border-[var(--sys-border)] shrink-0">
                                {pendingImageUrls.map((url, i) => (
                                    <div key={i} className="relative">
                                        <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-[var(--sys-border)]" />
                                        <button
                                            onClick={() => setPendingImageUrls(prev => prev.filter((_, j) => j !== i))}
                                            className="absolute -top-1 -right-1 size-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center cursor-pointer">
                                            ×
                                        </button>
                                    </div>
                                ))}
                                {uploading && (
                                    <div className="w-12 h-12 rounded-lg border border-[var(--sys-border)] bg-[var(--sys-surface)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-sm text-[#FF4D00] animate-spin">progress_activity</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Recording indicator */}
                        {(recording || transcribing) && (
                            <div className="px-4 pb-1 flex items-center gap-2 shrink-0">
                                <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-[10px] text-[var(--sys-text-muted)] font-medium">
                                    {recording ? '🎤 Listening...' : '🧠 Transcribing...'}
                                </span>
                            </div>
                        )}

                        {/* ── INPUT AREA ── */}
                        {/* ── DESKTOP INPUT BAR ── */}
                        <div className="px-3 py-2.5 border-t border-[var(--sys-border)] flex items-center gap-2 shrink-0">
                                {/* Paperclip */}
                                <button onClick={() => galleryInputRef.current?.click()}
                                    disabled={uploading}
                                    className="p-2 rounded-xl text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer shrink-0"
                                    title="Attach image">
                                    <span className="material-symbols-outlined text-sm">attach_file</span>
                                </button>
                                <input
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                                    onPaste={handlePaste}
                                    placeholder="Ask Fidato anything..."
                                    className="flex-1 bg-[var(--sys-surface)] rounded-xl px-3 py-2 text-sm text-[var(--sys-text)] placeholder-[var(--sys-text-muted)] outline-none border border-[var(--sys-border)] focus:border-[#FF4D00]/30 transition-all"
                                    aria-label="Message to Fidato AI agent"
                                />
                                {/* Mic */}
                                <button
                                    onClick={recording ? stopRecording : startRecording}
                                    disabled={transcribing}
                                    className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${recording ? 'text-red-500 animate-pulse' : transcribing ? 'text-primary opacity-60' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'}`}
                                    title={recording ? 'Stop recording' : 'Speak to Fidato'}
                                    aria-label={recording ? 'Stop voice recording' : 'Start voice input'}>
                                    <span className="material-symbols-outlined text-sm">
                                        {recording ? 'stop_circle' : transcribing ? 'hourglass_top' : 'mic'}
                                    </span>
                                </button>
                                {/* Send */}
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={loading || (!input.trim() && pendingImageUrls.length === 0)}
                                    className={`p-2 rounded-xl transition-all cursor-pointer shrink-0 ${(input.trim() || pendingImageUrls.length > 0) ? 'text-[#FF4D00] hover:text-white hover:bg-[#FF4D00]/15' : 'text-[var(--sys-text-muted)] cursor-not-allowed'}`}
                                    title="Send message"
                                    aria-label="Send message to Fidato">
                                    <span className="material-symbols-outlined text-sm">send</span>
                                </button>
                            </div>


                        {/* Hidden file inputs */}
                        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden"
                            onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }} />
                        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
                            onChange={e => { handleFileSelect(e.target.files); e.target.value = '' }} />
                    </div>
                )}

                {/* Floating Bubble Button (hidden on mobile when chat is open) */}
                {(!isMobile || !open) && (
                    <button
                        onClick={() => { setOpen(!open); if (!open) setTimeout(() => inputRef.current?.focus(), 100) }}
                        className={`size-14 rounded-full flex items-center justify-center text-[var(--sys-text)] shadow-2xl cursor-pointer transition-all duration-300 hover:scale-110 ${open ? 'rotate-0' : 'animate-bounce-slow'}`}
                        aria-label={open ? 'Close Fidato chat' : 'Open Fidato AI assistant'}
                        style={{
                            background: 'var(--sys-primary)',
                            boxShadow: '0 8px 32px rgba(255, 77, 0, 0.4), 0 0 20px rgba(255, 77, 0, 0.15)',
                        }}
                        title="Chat with Fidato"
                    >
                        <span className="material-symbols-outlined text-2xl">
                            {open ? 'close' : 'support_agent'}
                        </span>
                        {/* Notification dot */}
                        {!open && notifications.length > 0 && (
                            <span className="absolute top-0 right-0 size-3.5 rounded-full bg-[var(--sys-surface)] border border-[#0a0a1a] animate-pulse" />
                        )}
                        {/* Intel alert badge */}
                        {!open && intelAlertCount > 0 && (
                            <span className="absolute -top-1 -left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-[var(--sys-surface)] text-black border border-[var(--sys-border)] shadow-lg animate-pulse">
                                📡 {intelAlertCount}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {/* ═══ LIGHTBOX OVERLAY ═══ */}
            {lightboxUrl && (
                <div
                    onClick={() => setLightboxUrl(null)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 99999,
                        background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
                    }}
                >
                    <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8 }}
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => setLightboxZoom(z => Math.min(z + 0.5, 4))}
                            style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>+</button>
                        <button onClick={() => setLightboxZoom(z => Math.max(z - 0.5, 0.5))}
                            style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>−</button>
                        <a href={lightboxUrl} download="fidato-image.png"
                            style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,77,0,0.2)', border: '1px solid rgba(255,77,0,0.3)', color: '#FF7A00', fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={e => e.stopPropagation()}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span> Save
                        </a>
                        <button onClick={() => setLightboxUrl(null)}
                            style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 13, cursor: 'pointer' }}>✕</button>
                    </div>
                    <div style={{ overflow: 'auto', maxWidth: '96vw', maxHeight: '88vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => e.stopPropagation()}>
                        <img src={lightboxUrl} alt="Preview"
                            style={{ transform: `scale(${lightboxZoom})`, transformOrigin: 'center', transition: 'transform 0.2s', maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 12 }} />
                    </div>
                    <p style={{ position: 'absolute', bottom: 16, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Click outside to close</p>
                </div>
            )}

            {/* ═══ HISTORY PANEL (slide-in from right) ═══ */}
            {showHistory && (
                <div style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, width: 320,
                    background: 'rgba(10,10,26,0.98)', borderLeft: '1px solid rgba(255,77,0,0.15)',
                    zIndex: 99998, display: 'flex', flexDirection: 'column',
                    backdropFilter: 'blur(24px)', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
                }}>
                    {/* Header */}
                    <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,77,0,0.1)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#FF7A00' }}>history</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', flex: 1 }}>Conversation History</span>
                        <button onClick={() => setShowHistory(false)}
                            style={{ background: 'none', border: 'none', color: 'var(--sys-text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                    </div>
                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid rgba(255,77,0,0.08)', overflowX: 'auto' }}>
                        {['all', 'image', 'video', 'content', 'research'].map(f => (
                            <button key={f} onClick={() => setHistoryFilter(f)}
                                style={{
                                    padding: '4px 10px', borderRadius: 20, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
                                    background: historyFilter === f ? 'rgba(255,77,0,0.2)' : 'rgba(255,255,255,0.04)',
                                    border: historyFilter === f ? '1px solid rgba(255,77,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                    color: historyFilter === f ? '#FF7A00' : 'var(--sys-text-muted)',
                                    textTransform: 'capitalize',
                                }}>
                                {f}
                            </button>
                        ))}
                    </div>
                    {/* Thread list */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                        {history.length === 0 ? (
                            <div style={{ textAlign: 'center', marginTop: 40, color: 'var(--sys-text-muted)', fontSize: 12 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>chat_bubble_outline</span>
                                No conversations yet
                            </div>
                        ) : history.map(thread => (
                            <div key={thread._id} style={{
                                padding: '10px 12px', borderRadius: 12, marginBottom: 6, cursor: 'pointer',
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                                transition: 'all 0.2s',
                            }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,77,0,0.06)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#FF7A00', marginTop: 1, flexShrink: 0 }}>
                                        {thread.type === 'image' ? 'image' : thread.type === 'video' ? 'movie' : thread.type === 'content' ? 'article' : 'chat_bubble'}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 12, color: 'var(--sys-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.subject}</p>
                                        <p style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginTop: 2 }}>{new Date(thread.updatedAt).toLocaleDateString()}</p>
                                    </div>
                                    <button onClick={async (e) => {
                                        e.stopPropagation()
                                        const token = localStorage.getItem('mantram_token')
                                        await fetch(`${API_BASE}/nexus/history/${thread._id}`, {
                                            method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {}
                                        })
                                        loadHistory()
                                    }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 14, padding: 2 }}
                                        title="Delete thread">✕</button>
                                </div>
                                {thread.outputs?.[0]?.url && (
                                    <img src={thread.outputs[0].url} alt="" style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 8, marginTop: 6 }} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,77,0,0.08)', fontSize: 10, color: 'var(--sys-text-muted)', textAlign: 'center' }}>
                        {history.length}/20 conversations used
                    </div>
                </div>
            )}
        </>
    )
}

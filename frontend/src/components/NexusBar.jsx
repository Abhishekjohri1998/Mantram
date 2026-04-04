import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { nexus as nexusAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'

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

    // Refs
    const inputRef = useRef(null)
    const chatEndRef = useRef(null)
    const dropdownRef = useRef(null)

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

    // ── Load briefing on mount ──
    useEffect(() => {
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

    // ── Load notifications ──
    const loadNotifications = useCallback(async () => {
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
                    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

                    if (avg < SILENCE_THRESHOLD) {
                        silentFrames++
                        if (silentFrames >= SILENCE_FRAMES_NEEDED && audioChunksRef.current.length > 0) {
                            stopRecording()
                        }
                    } else {
                        silentFrames = 0
                    }
                }, 60)
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
        setMessages(prev => [...prev, { role: 'user', content: msg }])
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
                body: JSON.stringify({ message: msg, brandId }),
            })

            if (!resp.ok) {
                // Fallback to non-streaming endpoint
                const fallbackResp = await fetch(`${API_BASE}/nexus/chat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ message: msg, brandId }),
                })
                const fallbackData = await fallbackResp.json()
                const cleanReply = stripThink(fallbackData.reply) || 'hmm, try again? 😊'
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: cleanReply,
                    action: fallbackData.action,
                }])
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
                                    accumulatedText += (data.t || '')
                                    const displayText = stripThink(accumulatedText)
                                    setStreamingText(displayText)
                                    break
                                }

                                case 'intent':
                                    pendingAction = data.action
                                    setStreamingAction(data.action)
                                    break

                                case 'done': {
                                    const rawFinal = data.reply || accumulatedText
                                    const finalReply = stripThink(rawFinal)
                                    setStreamingText('')
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
                                    setMessages(prev => [...prev, {
                                        role: 'assistant',
                                        content: data.message || 'oops, try again? 😊'
                                    }])
                                    break

                                case 'status':
                                    // Show search/research status
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
                    body: JSON.stringify({ message: msg, brandId }),
                })
                const data = await fallbackResp.json()
                const cleanReply = stripThink(data.reply) || 'oops, try again? 😊'
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: cleanReply,
                    action: data.action,
                }])
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

    return (
        <>
            {/* ═══════════ BRIEFING POPUP ═══════════ */}
            {showBriefing && briefing && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={() => dismissBriefing()}>
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    <div className="relative w-full max-w-md rounded-3xl overflow-hidden animate-fade-in"
                        style={{
                            background: 'linear-gradient(180deg, rgba(20,15,40,0.98), rgba(10,10,26,0.99))',
                            border: '1px solid rgba(255, 77, 0, 0.25)',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(255, 77, 0, 0.15)',
                        }}
                        onClick={e => e.stopPropagation()}>

                        <div className="relative p-6 pb-4 text-center overflow-hidden">
                            <div className="absolute inset-0 opacity-20"
                                style={{ background: 'radial-gradient(circle at 50% 0%, #FF4D00 0%, transparent 70%)' }} />
                            <div className="relative">
                                <div className="size-16 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-2xl"
                                    style={{ background: 'linear-gradient(135deg, #FF4D00, #ec4899)' }}>
                                    <span className="material-symbols-outlined text-3xl">support_agent</span>
                                </div>
                                <p className="text-xl font-bold text-white">{briefing.greeting}</p>
                                {activeBrand?.name && (
                                    <p className="text-xs text-[#FF7A00]/60 mt-1">Advising for {activeBrand.name}</p>
                                )}
                            </div>
                        </div>

                        <div className="px-6 pb-4 space-y-3">
                            <div className="rounded-2xl p-3.5 flex items-start gap-3"
                                style={{ background: 'rgba(255, 77, 0,0.08)', border: '1px solid rgba(255, 77, 0,0.12)' }}>
                                <span className="material-symbols-outlined text-[#FF4D00] text-lg mt-0.5">celebration</span>
                                <p className="text-sm text-slate-300 leading-relaxed">{briefing.daySpecial}</p>
                            </div>
                            <div className="rounded-2xl p-3.5 flex items-start gap-3"
                                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)' }}>
                                <span className="material-symbols-outlined text-emerald-400 text-lg mt-0.5">monitoring</span>
                                <p className="text-sm text-slate-300 leading-relaxed">{briefing.brandHealth}</p>
                            </div>
                            <div className="rounded-2xl p-3.5 text-center"
                                style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.1)' }}>
                                <p className="text-sm text-pink-200/80 italic leading-relaxed">"{briefing.inspiration}"</p>
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
                                className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors cursor-pointer">
                                don't show again
                            </button>
                            <button onClick={() => dismissBriefing()}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-white cursor-pointer transition-all hover:scale-[1.03]"
                                style={{ background: 'linear-gradient(135deg, #FF4D00, #ec4899)' }}>
                                let's go! 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ FLOATING FIDATO BUBBLE ═══════════ */}
            <div className="fixed bottom-6 right-4 sm:right-6 z-[9999]" ref={dropdownRef}>
                {/* Chat Panel (opens upward from bubble) */}
                {open && (
                    <div className={`absolute bottom-16 right-0 rounded-2xl overflow-hidden animate-fade-in
                        ${expanded ? 'w-[calc(100vw-48px)] sm:w-[450px] lg:w-[520px]' : 'w-[calc(100vw-48px)] sm:w-[380px]'}`}
                        style={{
                            background: 'linear-gradient(180deg, rgba(15,15,30,0.98), rgba(10,10,26,0.98))',
                            border: '1px solid rgba(255, 77, 0, 0.25)',
                            boxShadow: '0 -8px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255, 77, 0, 0.1)',
                            backdropFilter: 'blur(24px)',
                            maxHeight: expanded ? '85vh' : 'min(500px, 70vh)',
                        }}>

                        {/* Panel Header */}
                        <div className="px-4 py-3 flex items-center gap-3 border-b border-white/[0.06]"
                            style={{ background: 'linear-gradient(135deg, rgba(255, 77, 0,0.08), rgba(236,72,153,0.04))' }}>
                            <div className="relative">
                                <div className="size-8 rounded-full flex items-center justify-center text-white text-sm"
                                    style={{ background: 'linear-gradient(135deg, #FF4D00, #ec4899)' }}>
                                    <span className="material-symbols-outlined text-sm">support_agent</span>
                                </div>
                                <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-[#0f0f1e] bg-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white">Fidato</p>
                                <p className="text-[10px] text-slate-500 truncate">
                                    {activeBrand?.name ? `Brand Manager • ${activeBrand.name}` : 'Your Brand Manager'}
                                </p>
                            </div>
                            <button onClick={() => setExpanded(!expanded)}
                                className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-all"
                                title={expanded ? 'Collapse' : 'Expand'}>
                                <span className="material-symbols-outlined text-xs">{expanded ? 'collapse_content' : 'expand_content'}</span>
                            </button>
                            <button onClick={clearChat}
                                className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-all"
                                title="Clear chat">
                                <span className="material-symbols-outlined text-xs">refresh</span>
                            </button>
                            <button onClick={() => { setOpen(false); setExpanded(false) }}
                                className="size-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-xs">close</span>
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="overflow-y-auto p-4 space-y-3" style={{ maxHeight: expanded ? 'calc(75vh - 180px)' : 320 }}>
                            {messages.map((m, i) => (
                                <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    {m.role === 'assistant' && (
                                        <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]"
                                            style={{ background: 'linear-gradient(135deg, #FF4D00, #ec4899)' }}>
                                            <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                        </div>
                                    )}
                                    <div>
                                        <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${m.role === 'user'
                                            ? 'bg-primary/15 text-white rounded-br-sm border border-primary/20'
                                            : 'bg-white/[0.05] text-slate-200 rounded-bl-sm border border-white/[0.06]'
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
                                                    style={{
                                                        background: 'rgba(255, 77, 0,0.12)',
                                                        border: '1px solid rgba(255, 77, 0,0.2)',
                                                        color: '#c4b5fd',
                                                    }}>
                                                    <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                    Open {m.action.label}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {/* Live streaming text */}
                            {streamingText && (
                                <div className="flex gap-2.5">
                                    <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]"
                                        style={{ background: 'linear-gradient(135deg, #FF4D00, #ec4899)' }}>
                                        <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                    </div>
                                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-white/[0.05] border border-white/[0.06] text-[13px] text-slate-200 leading-relaxed"
                                        style={{ whiteSpace: 'pre-wrap' }}>
                                        {streamingText}
                                        <span className="inline-block w-1.5 h-4 bg-[#FF4D00] ml-0.5 rounded-sm animate-pulse" />
                                    </div>
                                </div>
                            )}

                            {/* Loading dots */}
                            {loading && !streamingText && (
                                <div className="flex gap-2.5">
                                    <div className="size-6 rounded-full shrink-0 flex items-center justify-center text-white text-[10px]"
                                        style={{ background: 'linear-gradient(135deg, #FF4D00, #ec4899)' }}>
                                        <span className="material-symbols-outlined text-[10px]">support_agent</span>
                                    </div>
                                    <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-white/[0.05] border border-white/[0.06]">
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
                            <div className="px-4 pb-2 flex flex-wrap gap-1.5 border-t border-white/[0.04] pt-2.5">
                                {suggestions.map((q, i) => (
                                    <button key={i} onClick={() => sendMessage(q)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#FF4D00]/8 text-[#FF7A00] text-[11px] border border-[#FF4D00]/12 hover:bg-[#FF4D00]/15 cursor-pointer transition-all">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Recording indicator */}
                        {(recording || transcribing) && (
                            <div className="px-4 pb-1 flex items-center gap-2">
                                <span className={`size-2 rounded-full ${recording ? 'bg-rose-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                                <span className="text-[10px] text-slate-400 font-medium">
                                    {recording ? '🎤 Listening...' : '🧠 Transcribing...'}
                                </span>
                            </div>
                        )}

                        {/* Input Bar (inside panel) */}
                        <div className="px-3 py-2.5 border-t border-white/[0.06] flex items-center gap-2">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                                }}
                                placeholder="Ask Fidato anything..."
                                className="flex-1 bg-white/[0.04] rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 outline-none border border-white/[0.06] focus:border-[#FF4D00]/30 transition-all"
                            />
                            {/* Mic */}
                            <button
                                onClick={recording ? stopRecording : startRecording}
                                disabled={transcribing}
                                className={`p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${recording
                                    ? 'text-rose-400 bg-rose-500/15 animate-pulse'
                                    : transcribing
                                        ? 'text-amber-400 opacity-60'
                                        : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                                    }`}
                                title={recording ? 'Stop recording' : 'Speak to Fidato'}
                            >
                                <span className="material-symbols-outlined text-sm">
                                    {recording ? 'stop_circle' : transcribing ? 'hourglass_top' : 'mic'}
                                </span>
                            </button>
                            {/* Send */}
                            <button
                                onClick={() => sendMessage()}
                                disabled={loading || !input.trim()}
                                className={`p-2 rounded-xl transition-all cursor-pointer flex-shrink-0 ${input.trim()
                                    ? 'text-[#FF4D00] hover:text-white hover:bg-[#FF4D00]/15'
                                    : 'text-slate-600 cursor-not-allowed'
                                    }`}
                                title="Send message"
                            >
                                <span className="material-symbols-outlined text-sm">send</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Floating Bubble Button */}
                <button
                    onClick={() => { setOpen(!open); if (!open) setTimeout(() => inputRef.current?.focus(), 100) }}
                    className={`size-14 rounded-full flex items-center justify-center text-white shadow-2xl cursor-pointer transition-all duration-300 hover:scale-110 ${open ? 'rotate-0' : 'animate-bounce-slow'}`}
                    style={{
                        background: 'linear-gradient(135deg, #FF4D00, #ec4899)',
                        boxShadow: '0 8px 32px rgba(255, 77, 0, 0.4), 0 0 20px rgba(255, 77, 0, 0.15)',
                    }}
                    title="Chat with Fidato"
                >
                    <span className="material-symbols-outlined text-2xl">
                        {open ? 'close' : 'support_agent'}
                    </span>
                    {/* Notification dot */}
                    {!open && notifications.length > 0 && (
                        <span className="absolute top-0 right-0 size-3.5 rounded-full bg-rose-500 border-2 border-[#0a0a1a] animate-pulse" />
                    )}
                    {/* Intel alert badge */}
                    {!open && intelAlertCount > 0 && (
                        <span className="absolute -top-1 -left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-amber-500 text-black border border-amber-400 shadow-lg animate-pulse">
                            📡 {intelAlertCount}
                        </span>
                    )}
                </button>
            </div>
        </>
    )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentCommand, creatives as creativesAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { stripMarkdown } from '../utils/stripMarkdown'

// ============================================================================
// SMART COMMAND BOX — Agentic input with voice + chat + inline actions
// ============================================================================
export default function SmartCommandBox({ variant = 'dashboard', className = '' }) {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()

    const [input, setInput] = useState('')
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [recording, setRecording] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const [generatingImage, setGeneratingImage] = useState(null) // index of message being generated
    const [audioLevel, setAudioLevel] = useState(0)

    const inputRef = useRef(null)
    const chatEndRef = useRef(null)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const timerRef = useRef(null)
    const audioContextRef = useRef(null)
    const analyserRef = useRef(null)
    const vadIntervalRef = useRef(null)
    const silenceStartRef = useRef(null)

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [history, loading])

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
        setRecording(false)
        setAudioLevel(0)
        clearInterval(timerRef.current)
        clearInterval(vadIntervalRef.current)
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { })
            audioContextRef.current = null
        }
    }, [])

    // ===== Open in Studio helpers =====
    const openInCreativeStudio = useCallback((prompt) => {
        navigate(`/creative-studio?prompt=${encodeURIComponent(prompt)}&fromContent=true`)
    }, [navigate])

    const openInContentStudio = useCallback((prompt) => {
        navigate(`/content-studio?prompt=${encodeURIComponent(prompt)}`)
    }, [navigate])

    const openInBrainstormStudio = useCallback(() => {
        navigate('/brainstorm')
    }, [navigate])

    const downloadImage = useCallback(async (url) => {
        try {
            const a = document.createElement('a')
            a.href = url
            a.download = `mantram-creative-${Date.now()}.png`
            a.target = '_blank'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        } catch { }
    }, [])

    // ===== Send Message =====
    const handleSend = useCallback(async (overrideText) => {
        const text = overrideText || input.trim()
        if (!text || loading) return

        setInput('')
        setExpanded(true)

        const userMsg = { role: 'user', text }
        const newHistory = [...history, userMsg]
        setHistory(newHistory)
        setLoading(true)

        try {
            const data = await agentCommand.chat({
                message: text,
                history: newHistory.slice(-10),
                brandId: activeBrand?._id || null,
                brand: activeBrand ? { name: activeBrand.name, dna: activeBrand.dna, knowledge: activeBrand.knowledge } : null,
            })

            if (data.success) {
                if (data.type === 'navigate' && (data.data?.path || data.path)) {
                    const path = data.data?.path || data.path
                    setHistory(prev => [...prev, {
                        role: 'ai', text: data.message, type: 'navigate', path,
                        suggestions: data.suggestions,
                    }])
                    setTimeout(() => navigate(path), 2000)
                } else {
                    setHistory(prev => [...prev, {
                        role: 'ai', text: data.message, type: data.type || 'result',
                        intent: data.intent, data: data.data, suggestions: data.suggestions,
                    }])
                }
            } else {
                setHistory(prev => [...prev, {
                    role: 'ai', text: data.error || 'Sorry, something went wrong. Try again.',
                    type: 'error',
                }])
            }
        } catch (err) {
            setHistory(prev => [...prev, {
                role: 'ai', text: `Connection error: ${err.message}`, type: 'error',
            }])
        } finally {
            setLoading(false)
        }
    }, [input, loading, history, activeBrand, navigate])

    // ===== Voice Recording =====
    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
            mediaRecorderRef.current = mediaRecorder
            chunksRef.current = []

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                clearInterval(timerRef.current)
                clearInterval(vadIntervalRef.current)
                if (audioContextRef.current) {
                    audioContextRef.current.close().catch(() => { })
                    audioContextRef.current = null
                }
                setRecordingTime(0)

                const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
                if (audioBlob.size < 100) return

                setLoading(true)
                const formData = new FormData()
                formData.append('audio', audioBlob, 'recording.webm')
                formData.append('language', 'unknown') // auto-detect: Sarvam for Hindi, Whisper for English

                try {
                    const token = localStorage.getItem('mantram_token')
                    const resp = await fetch('/api/voice/transcribe', {
                        method: 'POST',
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                        body: formData,
                    })
                    const data = await resp.json()
                    if (data.success && data.text) {
                        setInput(data.text)
                        // Reset loading before calling handleSend — handleSend checks `loading` and aborts if true
                        setLoading(false)
                        handleSend(data.text)
                    } else {
                        setLoading(false)
                    }
                } catch (err) {
                    console.error('Transcription error:', err)
                    setLoading(false)
                }
            }

            // ===== VAD Logic =====
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
            const source = audioCtx.createMediaStreamSource(stream)
            const analyser = audioCtx.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            
            audioContextRef.current = audioCtx
            analyserRef.current = analyser
            silenceStartRef.current = null

            const bufferLength = analyser.frequencyBinCount
            const dataArray = new Uint8Array(bufferLength)
            const THRESHOLD = 15 // Adjust sensitivity (0-255)
            const SILENCE_DURATION = 1800 // 1.8 seconds of silence to stop

            vadIntervalRef.current = setInterval(() => {
                analyser.getByteFrequencyData(dataArray)
                const average = dataArray.reduce((a, b) => a + b) / bufferLength
                setAudioLevel(average)
                
                if (average < THRESHOLD) {
                    if (!silenceStartRef.current) silenceStartRef.current = Date.now()
                    else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
                        stopRecording()
                    }
                } else {
                    silenceStartRef.current = null
                }
            }, 100)

            mediaRecorder.start(250)
            setRecording(true)
            setRecordingTime(0)
            timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
        } catch (err) {
            console.error('Mic access denied:', err)
        }
    }, [handleSend, stopRecording])




    // ===== Generate Image inline =====
    const handleGenerateImage = useCallback(async (msgIdx, imagePrompt) => {
        if (generatingImage !== null) return

        // No brand selected — show helpful message
        if (!activeBrand?._id) {
            setHistory(prev => [...prev, {
                role: 'ai',
                text: '⚠️ Please create or select a brand first to generate images. You can also open the prompt in Creative Studio where you can select a brand.',
                type: 'error',
                suggestions: ['Create a new brand'],
            }])
            return
        }

        setGeneratingImage(msgIdx)
        try {
            const data = await creativesAPI.generate({
                brandId: activeBrand._id,
                type: 'instagram-post',
                prompt: imagePrompt,
                options: { style: 'modern', aspectRatio: '1:1' },
            })
            if (data.success && data.creative?.imageUrl) {
                setHistory(prev => prev.map((m, i) => {
                    if (i === msgIdx) {
                        return {
                            ...m,
                            generatedImage: data.creative.imageUrl,
                            creativeId: data.creative._id,
                        }
                    }
                    return m
                }))
            } else {
                setHistory(prev => [...prev, {
                    role: 'ai',
                    text: `Image generation failed: ${data.error || 'Unknown error'}. Try "Open in Studio" instead.`,
                    type: 'error',
                }])
            }
        } catch (err) {
            console.error('Inline image generation failed:', err)
            setHistory(prev => [...prev, {
                role: 'ai',
                text: `Image generation failed: ${err.message}. Try "Open in Studio" instead.`,
                type: 'error',
            }])
        } finally {
            setGeneratingImage(null)
        }
    }, [generatingImage, activeBrand, creativesAPI])

    const clearChat = () => { setHistory([]); setExpanded(false); setInput('') }
    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`


    const placeholders = variant === 'brainstorm'
        ? ["Tell me what you want to create...", "Try: 'Diwali campaign ideas'", "Try: 'Name my new product'"]
        : ["Tell me what you want to create...", "Try: 'Instagram post for summer sale'", "Try: 'A poster for my product'", "Try: 'Campaign ideas for Diwali'"]

    const [placeholderIdx, setPlaceholderIdx] = useState(0)
    useEffect(() => {
        const interval = setInterval(() => setPlaceholderIdx(i => (i + 1) % placeholders.length), 4000)
        return () => clearInterval(interval)
    }, [])

    // ===== RENDER =====
    return (
        <div className={`relative ${className}`}>
            <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${expanded
                ? 'border-primary/30 bg-gradient-to-b from-[#1a1f2e] to-[#141820] shadow-xl shadow-primary/5'
                : 'border-white/10 bg-gradient-to-r from-primary/[0.06] to-purple-500/[0.04] hover:border-primary/20'
                }`}>

                {/* Header — only when expanded */}
                {expanded && (
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <span className="material-symbols-outlined text-primary text-lg">neurology</span>
                                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 animate-pulse" />
                            </div>
                            <span className="text-sm font-bold text-white">Mantram AI</span>
                            {activeBrand && <span className="text-sm text-slate-500">• {activeBrand.name}</span>}
                        </div>
                        <button onClick={clearChat}
                            className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* Chat History */}
                {expanded && history.length > 0 && (
                    <div className="max-h-[500px] overflow-y-auto px-5 py-4 space-y-4 scroll-smooth"
                        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
                        {history.map((msg, i) => (
                            <div key={i} className={`flex items-start gap-3 animate-fade-in ${msg.role === 'user' ? 'justify-end' : ''}`}
                                style={{ animationDelay: `${i * 30}ms` }}>

                                {/* AI avatar */}
                                {msg.role === 'ai' && (
                                    <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="material-symbols-outlined text-primary text-xs">neurology</span>
                                    </div>
                                )}

                                <div className={`max-w-[95%] sm:max-w-[85%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                                    {/* ===== Message bubble ===== */}
                                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-primary/15 border border-primary/20 text-white rounded-tr-md ml-auto'
                                        : msg.type === 'error'
                                            ? 'bg-rose-500/10 border border-rose-500/15 text-rose-300 rounded-tl-md'
                                            : 'bg-white/[0.04] border border-white/[0.06] text-slate-200 rounded-tl-md'
                                        }`}>
                                        {/* ── CONTENT RESULT ── */}
                                        {msg.intent === 'content' && msg.data?.content && (
                                            <div className="mb-3 p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/15">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <span className="material-symbols-outlined text-emerald-400 text-xs">edit_note</span>
                                                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Generated Content</span>
                                                    {msg.data.platform && <span className="text-sm text-emerald-400/60 ml-1">• {msg.data.platform}</span>}
                                                </div>
                                                <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{stripMarkdown(msg.data.content)}</p>

                                                {/* ACTION BUTTONS for content */}
                                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-emerald-500/10">
                                                    <button onClick={() => navigator.clipboard.writeText(stripMarkdown(msg.data.content))}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">content_copy</span> Copy Text
                                                    </button>
                                                    <button onClick={() => openInContentStudio(msg.data.content)}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">edit</span> Refine in Studio
                                                    </button>
                                                    <button onClick={() => openInCreativeStudio(msg.data.content)}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">palette</span> Make Visual
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── CREATIVE / IMAGE RESULT (Image-First Flow) ── */}
                                        {msg.intent === 'creative' && msg.data?.imagePrompt && (
                                            <div className="mb-3 space-y-3">
                                                {/* Generated image — shown prominently */}
                                                {(msg.generatedImage || msg.data?.imageUrl) && (
                                                    <div>
                                                        <img src={msg.generatedImage || msg.data.imageUrl} alt="Generated creative"
                                                            className="rounded-xl w-full max-h-80 object-cover border border-white/10 shadow-lg" />
                                                    </div>
                                                )}

                                                {/* Structured prompt breakdown — user can see what went into the image */}
                                                <div className="p-3.5 rounded-xl bg-violet-500/[0.06] border border-violet-500/15 space-y-2">
                                                    {msg.data.textOverlay && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-violet-400 text-xs mt-0.5">edit_note</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-violet-400/70 uppercase tracking-wider">Text on Image</span>
                                                                <p className="text-sm text-white font-medium">{msg.data.textOverlay}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.data.style && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-violet-400 text-xs mt-0.5">palette</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-violet-400/70 uppercase tracking-wider">Style</span>
                                                                <p className="text-xs text-slate-300">{msg.data.style}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.data.tagline && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-violet-400 text-xs mt-0.5">format_quote</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-violet-400/70 uppercase tracking-wider">Brand Tagline</span>
                                                                <p className="text-xs text-slate-400 italic">"{msg.data.tagline}"</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.data.productMention && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-violet-400 text-xs mt-0.5">inventory_2</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-violet-400/70 uppercase tracking-wider">Product</span>
                                                                <p className="text-xs text-slate-300">{msg.data.productMention}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action buttons */}
                                                <div className="flex flex-wrap gap-2">
                                                    {(msg.generatedImage || msg.data?.imageUrl) ? (
                                                        <>
                                                            <button onClick={() => downloadImage(msg.generatedImage || msg.data.imageUrl)}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 cursor-pointer transition-all font-medium">
                                                                <span className="material-symbols-outlined text-xs">download</span> Download
                                                            </button>
                                                            <button onClick={() => handleGenerateImage(i, msg.data.imagePrompt)}
                                                                disabled={generatingImage !== null}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer transition-all font-medium disabled:opacity-50">
                                                                <span className="material-symbols-outlined text-xs">refresh</span> Regenerate
                                                            </button>
                                                            <button onClick={() => openInCreativeStudio(msg.data.imagePrompt)}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 cursor-pointer transition-all font-medium">
                                                                <span className="material-symbols-outlined text-xs">tune</span> Edit in Studio
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => handleGenerateImage(i, msg.data.imagePrompt)}
                                                                disabled={generatingImage !== null}
                                                                className="flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary-light cursor-pointer transition-all shadow-lg shadow-primary/20 disabled:opacity-50">
                                                                {generatingImage === i ? (
                                                                    <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Generating...</>
                                                                ) : (
                                                                    <><span className="material-symbols-outlined text-xs">auto_awesome</span> Generate Image</>
                                                                )}
                                                            </button>
                                                            <button onClick={() => openInCreativeStudio(msg.data.imagePrompt)}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg bg-white/[0.06] text-slate-300 hover:bg-white/[0.1] cursor-pointer transition-all border border-white/[0.08]">
                                                                <span className="material-symbols-outlined text-xs">palette</span> Open in Studio
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── BRAINSTORM IDEAS ── */}
                                        {msg.intent === 'brainstorm' && msg.data?.ideas?.length > 0 && (
                                            <div className="mb-3 space-y-2">
                                                {msg.data.ideas.map((idea, j) => (
                                                    <div key={j} className="p-3 rounded-xl bg-violet-500/[0.06] border border-violet-500/15">
                                                        <p className="text-xs font-bold text-violet-300 mb-1">💡 {idea.title}</p>
                                                        <p className="text-[11px] text-slate-300 leading-relaxed">{idea.description}</p>
                                                    </div>
                                                ))}
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={openInBrainstormStudio}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">psychology</span> Deep Dive in Brainstorm Studio
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── NAVIGATION ── */}
                                        {msg.type === 'navigate' && msg.path && (
                                            <button onClick={() => navigate(msg.path)}
                                                className="mb-2 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/20 cursor-pointer transition-all w-full justify-center">
                                                <span className="material-symbols-outlined text-sm">open_in_new</span>
                                                Taking you to {msg.path.replace(/[-/]/g, ' ').trim()} →
                                            </button>
                                        )}

                                        {/* Main message text */}
                                        <p className="whitespace-pre-wrap">{stripMarkdown(msg.text)}</p>
                                    </div>

                                    {/* ===== SUGGESTION CHIPS ===== */}
                                    {msg.role === 'ai' && msg.suggestions?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {msg.suggestions.map((s, j) => (
                                                <button key={j} onClick={() => { setInput(s); handleSend(s) }}
                                                    className="text-xs px-2.5 py-1.5 rounded-full bg-white/[0.04] text-slate-400 border border-white/[0.08] hover:bg-primary/10 hover:text-primary hover:border-primary/20 cursor-pointer transition-all">
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* User avatar */}
                                {msg.role === 'user' && (
                                    <div className="size-7 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="material-symbols-outlined text-slate-400 text-xs">person</span>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Loading indicator */}
                        {loading && (
                            <div className="flex items-start gap-3 animate-fade-in">
                                <div className="size-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-primary text-xs animate-spin">progress_activity</span>
                                </div>
                                <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-tl-md px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="text-sm text-slate-500">Thinking...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>
                )}

                {/* ===== INPUT BAR ===== */}
                <div className={`relative ${expanded ? 'border-t border-white/[0.06]' : ''}`}>
                    {!expanded && (
                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary/10 via-purple-500/5 to-primary/10 opacity-50 blur-xl pointer-events-none" />
                    )}

                    <div className={`relative flex items-center gap-2 ${expanded ? 'p-3' : 'p-4'}`}>
                        {!expanded && (
                            <div className="relative flex-shrink-0">
                                <span className="material-symbols-outlined text-primary text-xl">neurology</span>
                                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 animate-pulse" />
                            </div>
                        )}

                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                            onFocus={() => { if (history.length > 0) setExpanded(true) }}
                            placeholder={placeholders[placeholderIdx]}
                            disabled={loading || recording}
                            className={`flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none ${expanded ? 'px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus:border-primary/30' : ''
                                }`}
                        />

                        {/* Mic */}
                        <button onClick={recording ? stopRecording : startRecording} disabled={loading}
                            className={`flex-shrink-0 p-2.5 rounded-xl transition-all cursor-pointer relative overflow-hidden ${recording
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-white/[0.04] text-slate-400 border border-white/[0.08] hover:bg-primary/10 hover:text-primary hover:border-primary/20'
                                }`}
                            title={recording ? `Recording... ${formatTime(recordingTime)}` : 'Speak your request'}>
                            
                            {/* Audio Level Meter Overlay */}
                            {recording && (
                                <div className="absolute inset-0 bg-rose-500/30 transition-transform duration-100"
                                     style={{ transform: `scaleY(${Math.min(audioLevel / 50, 1)})`, transformOrigin: 'bottom' }} />
                            )}

                            {recording ? (
                                <div className="flex items-center gap-1.5 relative z-10">
                                    <span className="material-symbols-outlined text-sm animate-pulse">stop_circle</span>
                                    <span className="text-xs font-bold font-mono">{formatTime(recordingTime)}</span>
                                </div>
                            ) : <span className="material-symbols-outlined text-sm relative z-10">mic</span>}
                        </button>

                        {/* Send */}
                        <button onClick={() => handleSend()} disabled={loading || !input.trim()}
                            className={`flex-shrink-0 p-2.5 rounded-xl transition-all cursor-pointer ${input.trim()
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-light'
                                : 'bg-white/[0.04] text-slate-600 border border-white/[0.06]'
                                }`}>
                            <span className="material-symbols-outlined text-sm">send</span>
                        </button>
                    </div>

                    {/* Quick Hints */}
                    {!expanded && history.length === 0 && (
                        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-slate-600">Try:</span>
                            {(variant === 'brainstorm'
                                ? ['Campaign ideas', 'Name a product', 'Ad film concept']
                                : ['Write a post', 'Design a poster', 'Brainstorm ideas', 'Open Calendar']
                            ).map((hint, i) => (
                                <button key={i} onClick={() => { setInput(hint); inputRef.current?.focus() }}
                                    className="text-xs px-2.5 py-1 rounded-full bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:bg-primary/10 hover:text-primary hover:border-primary/20 cursor-pointer transition-all">
                                    {hint}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

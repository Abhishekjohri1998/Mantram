import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { agentCommand, creatives as creativesAPI, voice } from '../services/api'
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
    const [transcribing, setTranscribing] = useState(false)
    const [recordingTime, setRecordingTime] = useState(0)
    const [audioLevel, setAudioLevel] = useState(0)
    const [attachedImages, setAttachedImages] = useState([]) // Array of { file, preview, base64 }
    const [generatingImage, setGeneratingImage] = useState(null)
    const [zoomedImage, setZoomedImage] = useState(null)
    const inputRef = useRef(null)
    const fileInputRef = useRef(null)
    const chatEndRef = useRef(null)
    const scrollContainerRef = useRef(null)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const timerRef = useRef(null)
    const audioContextRef = useRef(null)
    const silenceCheckRef = useRef(null)
    const streamRef = useRef(null)

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
            if (silenceCheckRef.current) clearInterval(silenceCheckRef.current)
            if (timerRef.current) clearInterval(timerRef.current)
            if (audioContextRef.current) audioContextRef.current.close().catch(() => {})
        }
    }, [])

    useEffect(() => {
        if (scrollContainerRef.current) {
            requestAnimationFrame(() => {
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                        top: scrollContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                    })
                }
            })
        }
    }, [history, loading])


    // ===== Voice Recording =====
    const startRecording = useCallback(async () => {
        if (loading || recording) return

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            // Robust MIME type detection
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4'

            const mediaRecorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = mediaRecorder
            chunksRef.current = []

            // Set up silence detection (VAD)
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
                const source = audioCtx.createMediaStreamSource(stream)
                const analyser = audioCtx.createAnalyser()
                analyser.fftSize = 512
                analyser.smoothingTimeConstant = 0.8
                source.connect(analyser)
                audioContextRef.current = audioCtx

                let silentFrames = 0
                const SILENCE_THRESHOLD = 15
                const SILENCE_FRAMES_NEEDED = 35 // ~2 seconds

                silenceCheckRef.current = setInterval(() => {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount)
                    analyser.getByteFrequencyData(dataArray)
                    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
                    setAudioLevel(avg)

                    if (avg < SILENCE_THRESHOLD) {
                        silentFrames++
                        if (silentFrames >= SILENCE_FRAMES_NEEDED && chunksRef.current.length > 0) {
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
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            mediaRecorder.onstop = async () => {
                // Cleanup
                if (silenceCheckRef.current) clearInterval(silenceCheckRef.current)
                if (audioContextRef.current) {
                    audioContextRef.current.close().catch(() => { })
                    audioContextRef.current = null
                }
                if (timerRef.current) clearInterval(timerRef.current)
                
                // Stop all tracks
                streamRef.current?.getTracks().forEach(t => t.stop())
                setRecordingTime(0)

                const audioBlob = new Blob(chunksRef.current, { type: mimeType })
                if (audioBlob.size < 1000) return // Ignore tiny clicks

                setLoading(true)
                const formData = new FormData()
                formData.append('audio', audioBlob, 'recording.webm')
                formData.append('language', 'unknown')

                try {
                    setTranscribing(true)
                    // Use integrated voice service instead of raw fetch
                    const data = await voice.transcribe(formData)
                    
                    if (data.success && data.text) {
                        setInput(data.text)
                        setLoading(false)
                        setTranscribing(false)
                        handleSend(data.text)
                    } else {
                        setLoading(false)
                        setTranscribing(false)
                    }
                } catch (err) {
                    console.error('Transcription error:', err)
                    setLoading(false)
                    setTranscribing(false)
                }
            }

            mediaRecorder.start(250)
            setRecording(true)
            setRecordingTime(0)
            timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)

            // Safety: max 30 seconds
            setTimeout(() => {
                if (mediaRecorder.state === 'recording') stopRecording()
            }, 30000)

        } catch (err) {
            console.error('Mic access denied:', err)
        }
    }, [loading, recording])

    const stopRecording = useCallback(() => {
        if (silenceCheckRef.current) clearInterval(silenceCheckRef.current)
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
            setRecording(false)
        }
    }, [])

    // ===== Generate Image inline =====
    const handleGenerateImage = async (msgIdx, imagePrompt) => {
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
    }

    // ===== Open in Studio helpers =====
    const openInCreativeStudio = (prompt) => {
        navigate(`/creative-studio?prompt=${encodeURIComponent(prompt)}&fromContent=true`)
    }

    const openInContentStudio = (prompt) => {
        navigate(`/content-studio?prompt=${encodeURIComponent(prompt)}`)
    }

    const openInBrainstormStudio = () => {
        navigate('/brainstorm')
    }

    const downloadImage = async (url) => {
        try {
            const a = document.createElement('a')
            a.href = url
            a.download = `mantram-creative-${Date.now()}.png`
            a.target = '_blank'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        } catch { }
    }

    // ===== Send Message =====
    const handleSend = async (overrideText) => {
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
                referenceImages: attachedImages.map(img => img.base64),
            })
            setAttachedImages([]) // Clear attachments on send

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
    }

    const clearChat = () => { setHistory([]); setExpanded(false); setInput('') }
    const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

    // ===== Attachment Handlers =====
    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files)
        if (!files.length) return

        files.forEach(file => {
            if (attachedImages.length >= 5) return // Max 5 images
            const reader = new FileReader()
            reader.onloadend = () => {
                setAttachedImages(prev => [...prev, {
                    file,
                    preview: URL.createObjectURL(file),
                    base64: reader.result
                }])
            }
            reader.readAsDataURL(file)
        })
        e.target.value = null // Reset input
    }

    const removeAttachment = (idx) => {
        setAttachedImages(prev => {
            const newAtt = [...prev]
            URL.revokeObjectURL(newAtt[idx].preview)
            newAtt.splice(idx, 1)
            return newAtt
        })
    }

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
                ? 'border-primary/30 bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-none'
                : 'border-[var(--sys-border)] bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-primary/20'
                }`}>

                {/* Header — only when expanded */}
                {expanded && (
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <span className="material-symbols-outlined text-primary text-lg">neurology</span>
                                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-[var(--sys-surface)] animate-pulse" />
                            </div>
                            <span className="text-sm font-bold text-[var(--sys-text)]">Mantram AI</span>
                            {activeBrand && <span className="text-sm text-[var(--sys-text-muted)]">• {activeBrand.name}</span>}
                        </div>
                        <button onClick={clearChat}
                            className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer p-1 rounded-lg hover:bg-[var(--sys-surface)]">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* Chat History */}
                {expanded && history.length > 0 && (
                    <div 
                        ref={scrollContainerRef}
                        className="max-h-[500px] overflow-y-auto px-5 py-4 space-y-4 scroll-smooth"
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
                                            ? 'bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-[var(--sys-primary)] rounded-tl-md'
                                            : 'bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] rounded-tl-md'
                                        }`}>
                                        {/* ── CONTENT RESULT ── */}
                                        {msg.intent === 'content' && msg.data?.content && (
                                            <div className="mb-3 p-3.5 rounded-xl bg-[var(--sys-surface)]/[0.06] border border-[var(--sys-border)]">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <span className="material-symbols-outlined text-primary text-xs">edit_note</span>
                                                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Generated Content</span>
                                                    {msg.data.platform && <span className="text-sm text-primary/60 ml-1">• {msg.data.platform}</span>}
                                                </div>
                                                <p className="text-sm text-[var(--sys-text)] whitespace-pre-wrap leading-relaxed">{stripMarkdown(msg.data.content)}</p>

                                                {/* ACTION BUTTONS for content */}
                                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--sys-border)]">
                                                    <button onClick={() => navigator.clipboard.writeText(stripMarkdown(msg.data.content))}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">content_copy</span> Copy Text
                                                    </button>
                                                    <button onClick={() => openInContentStudio(msg.data.content)}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#FF4D00]/10 text-[#FF4D00] hover:bg-[#FF4D00]/20 cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">edit</span> Refine in Studio
                                                    </button>
                                                    <button onClick={() => openInCreativeStudio(msg.data.content)}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#FF4D00]/10 text-[#FF4D00] hover:bg-[#FF4D00]/20 cursor-pointer transition-all font-medium">
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
                                                            className="rounded-xl w-full max-h-80 object-cover border border-[var(--sys-border)] shadow-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                                                            onClick={() => setZoomedImage(msg.generatedImage || msg.data.imageUrl)} />
                                                    </div>
                                                )}

                                                {/* Structured prompt breakdown — user can see what went into the image */}
                                                <div className="p-3.5 rounded-xl bg-[#FF4D00]/[0.06] border border-[#FF4D00]/15 space-y-2">
                                                    {msg.data.textOverlay && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-[#FF4D00] text-xs mt-0.5">edit_note</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-[#FF4D00]/70 uppercase tracking-wider">Text on Image</span>
                                                                <p className="text-sm text-[var(--sys-text)] font-medium">{msg.data.textOverlay}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.data.style && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-[#FF4D00] text-xs mt-0.5">palette</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-[#FF4D00]/70 uppercase tracking-wider">Style</span>
                                                                <p className="text-xs text-[var(--sys-text-muted)]">{msg.data.style}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.data.tagline && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-[#FF4D00] text-xs mt-0.5">format_quote</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-[#FF4D00]/70 uppercase tracking-wider">Brand Tagline</span>
                                                                <p className="text-xs text-[var(--sys-text-muted)] italic">"{msg.data.tagline}"</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {msg.data.productMention && (
                                                        <div className="flex items-start gap-2">
                                                            <span className="material-symbols-outlined text-[#FF4D00] text-xs mt-0.5">inventory_2</span>
                                                            <div>
                                                                <span className="text-[10px] font-bold text-[#FF4D00]/70 uppercase tracking-wider">Product</span>
                                                                <p className="text-xs text-[var(--sys-text-muted)]">{msg.data.productMention}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action buttons */}
                                                <div className="flex flex-wrap gap-2">
                                                    {(msg.generatedImage || msg.data?.imageUrl) ? (
                                                        <>
                                                            <button onClick={() => downloadImage(msg.generatedImage || msg.data.imageUrl)}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all font-medium">
                                                                <span className="material-symbols-outlined text-xs">download</span> Download
                                                            </button>
                                                            <button onClick={() => handleGenerateImage(i, msg.data.imagePrompt)}
                                                                disabled={generatingImage !== null}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all font-medium disabled:opacity-50">
                                                                <span className="material-symbols-outlined text-xs">refresh</span> Regenerate
                                                            </button>
                                                            <button onClick={() => openInCreativeStudio(msg.data.imagePrompt)}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#FF4D00]/10 text-[#FF4D00] hover:bg-[#FF4D00]/20 cursor-pointer transition-all font-medium">
                                                                <span className="material-symbols-outlined text-xs">tune</span> Edit in Studio
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => handleGenerateImage(i, msg.data.imagePrompt)}
                                                                disabled={generatingImage !== null}
                                                                className="flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary-light cursor-pointer transition-all shadow-none disabled:opacity-50">
                                                                {generatingImage === i ? (
                                                                    <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Generating...</>
                                                                ) : (
                                                                    <><span className="material-symbols-outlined text-xs">auto_awesome</span> Generate Image</>
                                                                )}
                                                            </button>
                                                            <button onClick={() => openInCreativeStudio(msg.data.imagePrompt)}
                                                                className="flex items-center gap-1.5 text-[11px] px-3 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] cursor-pointer transition-all border border-[var(--sys-border)]">
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
                                                    <div key={j} className="p-3 rounded-xl bg-[#FF4D00]/[0.06] border border-[#FF4D00]/15">
                                                        <p className="text-xs font-bold text-[#FF7A00] mb-1">💡 {idea.title}</p>
                                                        <p className="text-[11px] text-[var(--sys-text-muted)] leading-relaxed">{idea.description}</p>
                                                    </div>
                                                ))}
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={openInBrainstormStudio}
                                                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-[#FF4D00]/10 text-[#FF4D00] hover:bg-[#FF4D00]/20 cursor-pointer transition-all font-medium">
                                                        <span className="material-symbols-outlined text-xs">psychology</span> Deep Dive in Brainstorm Studio
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── VIDEO RESULT ── */}
                                        {msg.intent === 'video' && msg.data?.prompt && (
                                            <div className="mb-3 space-y-3">
                                                {/* Video player if generated */}
                                                {(msg.generatedVideo || msg.data?.videoUrl) && (
                                                    <div className="rounded-xl overflow-hidden border border-[var(--sys-border)] shadow-lg bg-[var(--sys-surface)] aspect-video">
                                                        <video 
                                                            src={msg.generatedVideo || msg.data.videoUrl} 
                                                            controls 
                                                            className="size-full object-contain"
                                                        />
                                                    </div>
                                                )}

                                                {/* Prompt details */}
                                                <div className="p-3.5 rounded-xl bg-[var(--sys-surface)]/[0.06] border border-[var(--sys-border)] space-y-2">
                                                    <div className="flex items-start gap-2">
                                                        <span className="material-symbols-outlined text-primary text-xs mt-0.5">movie</span>
                                                        <div>
                                                            <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider">Video Prompt</span>
                                                            <p className="text-sm text-[var(--sys-text)] font-medium">{msg.data.prompt}</p>
                                                        </div>
                                                    </div>
                                                    {msg.data.duration && (
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-primary text-xs">timer</span>
                                                            <span className="text-xs text-[var(--sys-text-muted)]">Duration: {msg.data.duration}s</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action buttons */}
                                                <div className="flex flex-wrap gap-2">
                                                    <button onClick={() => navigate(`/creative-studio?prompt=${encodeURIComponent(msg.data.prompt)}&video=true`)}
                                                        className="flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] font-bold hover:bg-[var(--sys-surface)] cursor-pointer transition-all shadow-none">
                                                        <span className="material-symbols-outlined text-xs">palette</span> Open in Creative Studio
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
                                                    className="text-xs px-2.5 py-1.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:bg-primary/10 hover:text-primary hover:border-primary/20 cursor-pointer transition-all">
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* User avatar */}
                                {msg.role === 'user' && (
                                    <div className="size-7 rounded-full bg-[var(--sys-surface)] flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-xs">person</span>
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
                                <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl rounded-tl-md px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1">
                                            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                        <span className="text-sm text-[var(--sys-text-muted)]">Thinking...</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div ref={chatEndRef} />
                    </div>
                )}

                {/* ===== INPUT BAR ===== */}
                <div className={`relative ${expanded ? 'border-t border-[var(--sys-border)]' : ''}`}>
                    {!expanded && (
                        <div className="absolute inset-0 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] opacity-50 blur-xl pointer-events-none" />
                    )}

                    <div className={`relative flex items-center gap-2 ${expanded ? 'p-3' : 'p-4'}`}>
                        {!expanded && (
                            <div className="relative flex-shrink-0">
                                <span className="material-symbols-outlined text-primary text-xl">neurology</span>
                                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-[var(--sys-surface)] animate-pulse" />
                            </div>
                        )}

                        {/* Attachment Previews */}
                        {attachedImages.length > 0 && (
                            <div className="flex flex-wrap gap-2 px-3 pb-2 animate-fade-in">
                                {attachedImages.map((img, idx) => (
                                    <div key={idx} className="relative group size-14 rounded-lg overflow-hidden border border-[var(--sys-border)] shadow-lg">
                                        <img src={img.preview} alt="Attachment" className="size-full object-cover" />
                                        <button 
                                            onClick={() => removeAttachment(idx)}
                                            className="absolute top-0.5 right-0.5 size-5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                        </button>
                                    </div>
                                ))}
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
                            className={`flex-1 bg-transparent text-[var(--sys-text)] text-sm placeholder-slate-500 outline-none ${expanded ? 'px-3 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] focus:border-primary/30' : ''
                                }`}
                        />

                        {/* Hidden File Input */}
                        <input 
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={handleFileSelect}
                        />

                        {/* Attach Image Button */}
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={loading || recording || attachedImages.length >= 5}
                            className="flex-shrink-0 p-2.5 rounded-xl bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-all cursor-pointer disabled:opacity-50"
                            title="Attach images (@image1, @image2...)">
                            <span className="material-symbols-outlined text-lg">image</span>
                        </button>

                        {/* Mic */}
                        <button onClick={recording ? stopRecording : startRecording} disabled={loading || transcribing}
                            className={`flex-shrink-0 p-2.5 rounded-xl transition-all cursor-pointer relative overflow-hidden ${recording
                                ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'
                                : transcribing
                                    ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'
                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:bg-primary/10 hover:text-primary hover:border-primary/20'
                                }`}
                            title={recording ? `Recording... ${formatTime(recordingTime)}` : transcribing ? 'Transcribing...' : 'Speak your request'}>
                            {/* Pulse animation when recording */}
                            {recording && (
                                <>
                                    <span className="absolute inset-0 rounded-xl bg-[var(--sys-primary-dim)] animate-ping" style={{ animationDuration: '1.5s' }} />
                                    <span className="absolute inset-0 rounded-xl bg-[var(--sys-primary-dim)] animate-pulse" />
                                </>
                            )}
                            
                            {recording ? (
                                <div className="flex items-center gap-1.5 relative z-10">
                                    <span className="material-symbols-outlined text-sm">stop_circle</span>
                                    <span className="text-xs font-bold font-mono">{formatTime(recordingTime)}</span>
                                </div>
                            ) : transcribing ? (
                                <span className="material-symbols-outlined text-sm animate-spin relative z-10">progress_activity</span>
                            ) : <span className="material-symbols-outlined text-sm relative z-10">mic</span>}
                        </button>

                        {/* Send */}
                        <button onClick={() => handleSend()} disabled={loading || !input.trim()}
                            className={`flex-shrink-0 p-2.5 rounded-xl transition-all cursor-pointer ${input.trim()
                                ? 'bg-primary text-white shadow-none hover:bg-primary-light'
                                : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'
                                }`}>
                            <span className="material-symbols-outlined text-sm">send</span>
                        </button>
                    </div>

                    {/* Quick Hints */}
                    {!expanded && history.length === 0 && (
                        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-[var(--sys-text-muted)]">Try:</span>
                            {(variant === 'brainstorm'
                                ? ['Campaign ideas', 'Name a product', 'Ad film concept']
                                : ['Write a post', 'Design a poster', 'Brainstorm ideas', 'Open Calendar']
                            ).map((hint, i) => (
                                <button key={i} onClick={() => { setInput(hint); inputRef.current?.focus() }}
                                    className="text-xs px-2.5 py-1 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:bg-primary/10 hover:text-primary hover:border-primary/20 cursor-pointer transition-all">
                                    {hint}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ZOOM MODAL OVERLAY */}
            {zoomedImage && (
                <div 
                    className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out animate-fade-in"
                    onClick={() => setZoomedImage(null)}
                >
                    <img 
                        src={zoomedImage} 
                        alt="Zoomed creative" 
                        className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.5)]"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button 
                        onClick={() => setZoomedImage(null)}
                        className="absolute top-6 right-6 size-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors backdrop-blur-sm cursor-pointer"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            )}
        </div>
    )
}

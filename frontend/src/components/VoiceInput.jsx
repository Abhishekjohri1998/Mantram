import { useState, useRef, useCallback } from 'react'
import { voice } from '../services/api'

/**
 * VoiceInput — OpenAI Whisper-powered multilingual voice dictation
 * Records audio via MediaRecorder → sends to backend → Whisper transcribes
 * 
 * Supports 57+ languages with high accuracy including:
 * Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Punjabi, Kannada,
 * Arabic, Spanish, French, German, Japanese, Korean, Chinese, etc.
 */

// ISO 639-1 codes for Whisper (2-letter)
const WHISPER_LANG_MAP = {
    english: 'en',
    hindi: 'hi',
    tamil: 'ta',
    telugu: 'te',
    bengali: 'bn',
    marathi: 'mr',
    gujarati: 'gu',
    punjabi: 'pa',
    kannada: 'kn',
    malayalam: 'ml',
    arabic: 'ar',
    spanish: 'es',
    french: 'fr',
    german: 'de',
    italian: 'it',
    portuguese: 'pt',
    japanese: 'ja',
    korean: 'ko',
    chinese: 'zh',
    indonesian: 'id',
    thai: 'th',
    urdu: 'ur',
    turkish: 'tr',
    russian: 'ru',
    dutch: 'nl',
}

export default function VoiceInput({ onResult, language = 'english', className = '', size = 'normal' }) {
    const [recording, setRecording] = useState(false)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState('')
    const [duration, setDuration] = useState(0)
    const [audioLevel, setAudioLevel] = useState(0)
    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const timerRef = useRef(null)
    const streamRef = useRef(null)
    const audioContextRef = useRef(null)
    const analyserRef = useRef(null)
    const vadIntervalRef = useRef(null)
    const silenceStartRef = useRef(null)

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        setRecording(false)
        setAudioLevel(0)
        clearInterval(timerRef.current)
        clearInterval(vadIntervalRef.current)
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { })
            audioContextRef.current = null
        }
    }, [])

    const startRecording = useCallback(async () => {
        setError('')
        setDuration(0)

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                }
            })
            streamRef.current = stream

            // Use webm/opus — best quality + Whisper compatible
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/mp4'

            const mediaRecorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = mediaRecorder
            chunksRef.current = []

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data)
                }
            }

            mediaRecorder.onstop = async () => {
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop())
                clearInterval(timerRef.current)
                clearInterval(vadIntervalRef.current)
                if (audioContextRef.current) {
                    audioContextRef.current.close().catch(() => { })
                    audioContextRef.current = null
                }

                if (chunksRef.current.length === 0) {
                    setError('No audio recorded')
                    return
                }

                // Send to Whisper
                setProcessing(true)
                try {
                    const blob = new Blob(chunksRef.current, { type: mimeType })
                    const formData = new FormData()
                    formData.append('audio', blob, 'recording.webm')

                    // Send language hint for better accuracy
                    const langCode = WHISPER_LANG_MAP[language] || ''
                    if (langCode) {
                        formData.append('language', langCode)
                    }

                    const data = await voice.transcribe(formData)

                    if (data.success && data.text) {
                        onResult(data.text)
                    } else {
                        setError(data.error || 'Transcription failed')
                        setTimeout(() => setError(''), 3000)
                    }
                } catch (err) {
                    console.error('Whisper transcription error:', err)
                    setError('Failed to transcribe')
                    setTimeout(() => setError(''), 3000)
                } finally {
                    setProcessing(false)
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

            // Use a slightly slower interval for VAD logic to save main thread cycles
            vadIntervalRef.current = setInterval(() => {
                const analyser = analyserRef.current
                if (!analyser) return

                analyser.getByteFrequencyData(dataArray)
                
                // Efficient calculation of average volume
                let sum = 0
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i]
                }
                const average = sum / bufferLength
                
                // Only update state if recording is still active
                setAudioLevel(average)

                if (average < THRESHOLD) {
                    if (!silenceStartRef.current) silenceStartRef.current = Date.now()
                    else if (Date.now() - silenceStartRef.current > SILENCE_DURATION) {
                        stopRecording()
                    }
                } else {
                    silenceStartRef.current = null
                }
            }, 150) // Throttled from 100ms to 150ms

            mediaRecorder.start(250) // Collect data every 250ms
            setRecording(true)

            // Duration timer
            timerRef.current = setInterval(() => {
                setDuration(prev => prev + 1)
            }, 1000)

        } catch (err) {
            console.error('Microphone access error:', err)
            if (err.name === 'NotAllowedError') {
                setError('Mic access denied')
            } else {
                setError('Mic not available')
            }
            setTimeout(() => setError(''), 3000)
        }
    }, [language, onResult, stopRecording])


    const toggleRecording = () => {
        if (recording) {
            stopRecording()
        } else {
            startRecording()
        }
    }

    const formatDuration = (s) => {
        const mins = Math.floor(s / 60)
        const secs = s % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const isSmall = size === 'small'

    return (
        <div className={`relative inline-flex items-center ${className}`}>
            <button
                onClick={toggleRecording}
                disabled={processing}
                type="button"
                className={`
                    relative flex items-center justify-center rounded-xl transition-all cursor-pointer overflow-hidden
                    ${isSmall ? 'p-1.5' : 'p-2.5'}
                    ${processing
                        ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'
                        : recording
                            ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)] shadow-none'
                            : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-primary hover:bg-primary/10 border border-[var(--sys-border)]'
                    }
                    disabled:cursor-wait
                `}
                title={processing ? 'Processing...' : recording ? 'Stop & transcribe' : `Speak in ${language} (Whisper AI)`}
                aria-label={processing ? 'Processing transcription' : recording ? 'Stop recording voice' : `Start voice input in ${language}`}
            >
                {/* Audio Level Meter Overlay */}
                {recording && (
                    <div className="absolute inset-0 bg-[var(--sys-primary-dim)] transition-transform duration-100"
                         style={{ transform: `scaleY(${Math.min(audioLevel / 50, 1)})`, transformOrigin: 'bottom' }} />
                )}

                {/* Pulse animation when recording */}
                {recording && (
                    <>
                        <span className="absolute inset-0 rounded-xl bg-[var(--sys-primary-dim)] animate-ping" style={{ animationDuration: '1.5s' }} />
                        <span className="absolute inset-0 rounded-xl bg-[var(--sys-primary-dim)] animate-pulse" />
                    </>
                )}
                <span className={`material-symbols-outlined relative z-10 ${isSmall ? 'text-sm' : 'text-lg'}`}>
                    {processing ? 'progress_activity' : recording ? 'stop_circle' : 'mic'}
                </span>
                {processing && (
                    <span className="absolute inset-0 flex items-center justify-center">
                        <span className={`material-symbols-outlined animate-spin relative z-10 ${isSmall ? 'text-sm' : 'text-lg'}`}>progress_activity</span>
                    </span>
                )}
            </button>

            {/* Recording indicator with duration */}
            {recording && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap z-50">
                    <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-lg px-3 py-1.5 flex items-center gap-2">
                        <span className="flex gap-0.5">
                            <span className="w-1 h-3 bg-[var(--sys-surface)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-4 bg-[var(--sys-surface)] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-2 bg-[var(--sys-surface)] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            <span className="w-1 h-3 bg-[var(--sys-surface)] rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
                        </span>
                        <span className="text-sm text-primary font-bold font-mono">{formatDuration(duration)}</span>
                    </div>
                </div>
            )}

            {/* Processing indicator */}
            {processing && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap z-50">
                    <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-primary animate-spin">progress_activity</span>
                        <span className="text-sm text-primary font-bold">Whisper AI transcribing...</span>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap z-50">
                    <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-lg px-3 py-1.5">
                        <span className="text-sm text-primary font-bold">{error}</span>
                    </div>
                </div>
            )}
        </div>
    )
}

// Compact version for inline use
export function VoiceInputInline({ onResult, language = 'english', className = '' }) {
    return <VoiceInput onResult={onResult} language={language} size="small" className={className} />
}

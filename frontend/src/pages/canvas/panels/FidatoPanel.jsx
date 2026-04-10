// ═══════════════════════════════════════════════════════════════
// FidatoPanel.jsx — Fidato AI Agent Chat Panel
// Renders the floating chat panel with message bubbles,
// progressive thinking steps, plan views, process logs,
// reference images, voice input, and quick shortcuts
// ═══════════════════════════════════════════════════════════════

import React, { useRef, useCallback } from 'react'
import useCanvasStore from '../state/useCanvasStore'
import FormattedText from '../../../components/FormattedText'

export default function FidatoPanel({
    fabricRef,
    onSend,
    onStop,
    onAddImageToCanvas,
    voiceAPI,
}) {
    const {
        fidatoOpen, setFidatoOpen,
        fidatoMessages, setFidatoMessages,
        fidatoInput, setFidatoInput,
        fidatoLoading, setFidatoLoading,
    } = useCanvasStore()

    const fidatoMsgEndRef = useRef(null)
    const fidatoMediaRecorderRef = useRef(null)
    const fidatoAudioChunksRef = useRef([])
    const fidatoAbortRef = useRef(null)
    const fidatoAnalyserRef = useRef(null)
    const fidatoSilenceCheckRef = useRef(null)
    const fidatoRecordingTimerRef = useRef(null)

    const [fidatoRecording, setFidatoRecording] = React.useState(false)
    const [fidatoTranscribing, setFidatoTranscribing] = React.useState(false)

    // ── Send handler ──
    const handleSend = useCallback((voiceText) => {
        const msg = (voiceText || fidatoInput).trim()
        if (!msg || fidatoLoading) return
        if (onSend) onSend(msg)
    }, [fidatoInput, fidatoLoading, onSend])

    // ── Start/stop voice recording ──
    const handleVoiceToggle = useCallback(async () => {
        if (fidatoRecording) {
            if (fidatoSilenceCheckRef.current) clearInterval(fidatoSilenceCheckRef.current)
            if (fidatoRecordingTimerRef.current) clearTimeout(fidatoRecordingTimerRef.current)
            if (fidatoMediaRecorderRef.current?.state === 'recording') {
                fidatoMediaRecorderRef.current.stop()
                setFidatoRecording(false)
            }
            return
        }
        if (fidatoTranscribing || fidatoLoading) return

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
            const mediaRecorder = new MediaRecorder(stream, { mimeType })
            fidatoMediaRecorderRef.current = mediaRecorder
            fidatoAudioChunksRef.current = []

            // Silence detection
            try {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
                const source = audioCtx.createMediaStreamSource(stream)
                const analyser = audioCtx.createAnalyser()
                analyser.fftSize = 512
                analyser.smoothingTimeConstant = 0.8
                source.connect(analyser)
                fidatoAnalyserRef.current = { analyser, audioCtx }

                let silentFrames = 0
                fidatoSilenceCheckRef.current = setInterval(() => {
                    const dataArray = new Uint8Array(analyser.frequencyBinCount)
                    analyser.getByteFrequencyData(dataArray)
                    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
                    if (avg < 15) {
                        silentFrames++
                        if (silentFrames >= 35 && fidatoAudioChunksRef.current.length > 0) {
                            if (fidatoMediaRecorderRef.current?.state === 'recording') {
                                fidatoMediaRecorderRef.current.stop()
                                setFidatoRecording(false)
                            }
                        }
                    } else { silentFrames = 0 }
                }, 60)
            } catch (e) { console.warn('Silence detection unavailable:', e.message) }

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) fidatoAudioChunksRef.current.push(e.data)
            }

            mediaRecorder.onstop = async () => {
                if (fidatoSilenceCheckRef.current) clearInterval(fidatoSilenceCheckRef.current)
                if (fidatoAnalyserRef.current?.audioCtx) {
                    fidatoAnalyserRef.current.audioCtx.close().catch(() => {})
                    fidatoAnalyserRef.current = null
                }
                if (fidatoRecordingTimerRef.current) clearTimeout(fidatoRecordingTimerRef.current)
                stream.getTracks().forEach(t => t.stop())
                const audioBlob = new Blob(fidatoAudioChunksRef.current, { type: mimeType })

                if (audioBlob.size > 1000 && voiceAPI) {
                    setFidatoTranscribing(true)
                    try {
                        const formData = new FormData()
                        formData.append('audio', audioBlob, 'recording.webm')
                        formData.append('language', 'unknown')
                        const data = await voiceAPI.transcribe(formData)
                        if (data.success && data.text) {
                            setFidatoInput(data.text)
                            setTimeout(() => {
                                setFidatoInput('')
                                handleSend(data.text)
                            }, 300)
                        }
                    } catch (err) { console.error('Transcription failed:', err) }
                    setFidatoTranscribing(false)
                }
            }

            mediaRecorder.start(250)
            setFidatoRecording(true)
            fidatoRecordingTimerRef.current = setTimeout(() => {
                if (fidatoMediaRecorderRef.current?.state === 'recording') {
                    fidatoMediaRecorderRef.current.stop()
                    setFidatoRecording(false)
                }
            }, 15000)
        } catch (err) { console.error('Mic access denied:', err) }
    }, [fidatoRecording, fidatoTranscribing, fidatoLoading, voiceAPI, handleSend, setFidatoInput])

    // ── Toggle button (when closed) ──
    if (!fidatoOpen) {
        return (
            <button className="ce-fidato-toggle" onClick={() => setFidatoOpen(true)} title="Fidato AI">
                <span className="material-symbols-outlined">smart_toy</span>
            </button>
        )
    }

    return (
        <div className="ce-fidato-panel">
            <div className="ce-fidato-header">
                <div className="ce-fidato-header-left">
                    <div className="ce-fidato-avatar">F</div>
                    <div>
                        <div className="ce-fidato-name">Fidato</div>
                        <div className="ce-fidato-status">Creative Canvas</div>
                    </div>
                </div>
                <button className="ce-fidato-collapse" onClick={() => setFidatoOpen(false)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                </button>
            </div>

            <div className="ce-fidato-messages">
                {fidatoMessages.map((msg, i) => (
                    <div key={i} className={`ce-fidato-msg ${msg.role}`}>
                        <div className="ce-fidato-msg-avatar">{msg.role === 'assistant' ? 'F' : '✦'}</div>
                        <div className="ce-fidato-msg-bubble">
                            {/* Pre-flight Research */}
                            {msg.research && msg.research.length > 50 && (
                                <details className="ce-fidato-search-block" style={{ marginBottom: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 8, overflow: 'hidden' }} open>
                                    <summary style={{ padding: '8px 12px', fontSize: 12, color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', fontWeight: 600 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>menu_book</span>
                                        Read
                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#52525b' }}>{Math.round(msg.research.length / 4)} words</span>
                                    </summary>
                                    <div style={{ padding: '0 12px 12px 32px', fontSize: 11, color: '#d4d4d8', whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 160, overflowY: 'auto' }}>
                                        {msg.research.replace(/## WEB RESEARCH RESULTS.*\n/g, '').replace(/## REFERENCE IMAGES.*\n[\s\S]*$/g, '').trim()}
                                    </div>
                                </details>
                            )}

                            {/* Reference Images */}
                            {msg.referenceImages && msg.referenceImages.length > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontSize: 11, color: '#a1a1aa', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>photo_library</span>
                                        Product References ({msg.referenceImages.length})
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                                        {msg.referenceImages.map((img, idx) => (
                                            <img key={idx} src={img.s3Url || img.url || img} alt={img.alt || `Reference ${idx + 1}`}
                                                style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, cursor: 'pointer' }}
                                                onClick={() => onAddImageToCanvas?.(img.s3Url || img.url || img)}
                                                title="Click to add to canvas"
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Web Searches */}
                            {msg.searches && msg.searches.length > 0 && (
                                <div className="ce-fidato-searches" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {msg.searches.map((search, idx) => (
                                        <details key={idx} className="ce-fidato-search-block" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
                                            <summary style={{ padding: '8px 12px', fontSize: 12, color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#6366f1' }}>public</span>
                                                Searched web: "{search.query}"
                                            </summary>
                                            <div style={{ padding: '0 12px 12px 32px', fontSize: 12, color: '#d4d4d8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                                {search.result}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            )}

                            {/* Thinking steps OR content */}
                            {msg.thinking && msg.thinkingSteps ? (
                                <div className="ce-fidato-reasoning">
                                    {msg.thinkingSteps.map((step, si) => (
                                        <div key={si} className={`ce-fidato-thinking-step ${step.status}`}>
                                            <span className="material-symbols-outlined">
                                                {step.status === 'done' ? 'check_circle' : step.status === 'active' ? 'pending' : 'radio_button_unchecked'}
                                            </span>
                                            {step.text}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    <FormattedText text={msg.content || ''} />
                                    {msg.reasoning && (
                                        <details className="ce-fidato-reasoning" style={{ marginTop: 8 }}>
                                            <summary className="ce-fidato-reasoning-toggle">
                                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>psychology</span>
                                                View reasoning
                                            </summary>
                                            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{msg.reasoning}</div>
                                        </details>
                                    )}
                                </>
                            )}

                            {/* Generated images */}
                            {msg.images && msg.images.length > 0 && (
                                <div className="ce-fidato-images">
                                    {msg.images.map((img, j) => (
                                        <button key={j} className="ce-fidato-img-thumb" onClick={() => onAddImageToCanvas?.(img.url)} title="Click to add to canvas">
                                            <img src={img.url} alt={`Generated ${j + 1}`} />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Execution Plan */}
                            {msg.plan && (
                                <div className="ce-fidato-plan">
                                    <div className="ce-fidato-plan-title">{msg.plan.title}</div>
                                    {msg.plan.items.map((item, k) => (
                                        <div key={k} className={`ce-fidato-plan-item ${item.status || ''}`}>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <span className="material-symbols-outlined">{item.status === 'done' ? 'check_circle' : item.status === 'active' ? 'pending' : 'radio_button_unchecked'}</span>
                                                {item.text}
                                            </div>
                                            {item.thumbnails && item.thumbnails.length > 0 && (
                                                <div style={{ display: 'flex', gap: 6, marginTop: 8, paddingLeft: 24, flexWrap: 'wrap' }}>
                                                    {item.thumbnails.map((t, idx) => (
                                                        <img key={idx} src={t} alt="Result" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Process Logs */}
                            {msg.processLogs && msg.processLogs.length > 0 && (
                                <details className="ce-fidato-process-logs" style={{ marginTop: 12, background: '#0a0a0a', borderRadius: 6, border: '1px solid #27272a', overflow: 'hidden' }}>
                                    <summary style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#a1a1aa', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, marginRight: 6 }}>terminal</span>
                                        Show process
                                    </summary>
                                    <div style={{ padding: '8px 12px 12px', fontSize: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', color: '#10b981', whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto' }}>
                                        {msg.processLogs.map((log, i) => (
                                            <div key={i} style={{ marginBottom: 4 }}>
                                                <span style={{ color: '#52525b', marginRight: 8}}>[{log.time}]</span>
                                                <span style={{ color: log.text.includes('[Error]') ? '#ef4444' : log.text.includes('[Payload]') ? '#d4d4d8' : '#10b981' }}>{log.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                ))}
                {fidatoLoading && !fidatoMessages[fidatoMessages.length - 1]?.thinking && (
                    <div className="ce-fidato-thinking">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span> Thinking
                        <div className="ce-fidato-thinking-dots"><span /><span /><span /></div>
                    </div>
                )}
                <div ref={fidatoMsgEndRef} />
            </div>

            <div className="ce-fidato-input-bar">
                {/* Voice recording indicator */}
                {(fidatoRecording || fidatoTranscribing) && (
                    <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: fidatoRecording ? '#f87171' : '#fbbf24', animation: 'pulse 1s infinite' }} />
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                            {fidatoRecording ? '🎙️ Listening... speak your command' : '🧠 Transcribing...'}
                        </span>
                    </div>
                )}
                <div className="ce-fidato-input-row">
                    <textarea className="ce-fidato-input" placeholder="What do you want to do?" value={fidatoInput} onChange={e => setFidatoInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }} rows={1} />
                    <button
                        className="ce-fidato-mic-btn"
                        onClick={handleVoiceToggle}
                        disabled={fidatoTranscribing}
                        style={{
                            background: fidatoRecording ? 'rgba(239,68,68,0.15)' : 'transparent',
                            color: fidatoRecording ? '#f87171' : fidatoTranscribing ? '#fbbf24' : '#64748b',
                            border: 'none', cursor: 'pointer', borderRadius: 8, padding: '6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: fidatoRecording ? 'pulse 1.5s infinite' : 'none',
                            transition: 'all 0.2s',
                        }}
                        title={fidatoRecording ? 'Stop recording' : 'Speak to Fidato'}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                            {fidatoRecording ? 'stop_circle' : fidatoTranscribing ? 'hourglass_top' : 'mic'}
                        </span>
                    </button>
                    {fidatoLoading ? (
                        <button className="ce-fidato-send-btn" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', borderColor: '#ef4444' }} onClick={() => {
                            if (onStop) onStop()
                        }} title="Stop generation">
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>stop_circle</span>
                        </button>
                    ) : (
                        <button className="ce-fidato-send-btn" onClick={() => handleSend()} disabled={!fidatoInput.trim()}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_upward</span>
                        </button>
                    )}
                </div>
                <div className="ce-fidato-shortcuts">
                    <button className="ce-fidato-shortcut" onClick={() => setFidatoInput('Generate a campaign image for ')}>
                        <span className="material-symbols-outlined">auto_awesome</span> Create
                    </button>
                    <button className="ce-fidato-shortcut" onClick={() => setFidatoInput('Extract color palette from the image on canvas')}>
                        <span className="material-symbols-outlined">palette</span> Palette
                    </button>
                    <button className="ce-fidato-shortcut" onClick={() => setFidatoInput('Merge the selected images on canvas into ')}>
                        <span className="material-symbols-outlined">merge</span> Merge
                    </button>
                </div>
            </div>
        </div>
    )
}

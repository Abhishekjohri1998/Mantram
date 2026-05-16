import { useState, useRef, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const isForm = opts.body instanceof FormData
    const headers = isForm
        ? { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

const PRESETS = [
    { id: 'dynamic',   label: 'Dynamic',   emoji: '⚡' },
    { id: 'elegant',   label: 'Elegant',   emoji: '✨' },
    { id: 'funky',     label: 'Funky',     emoji: '🎸' },
    { id: 'intro',     label: 'Intro',     emoji: '🎬' },
    { id: 'outro',     label: 'Outro',     emoji: '🎭' },
    { id: 'minimal',   label: 'Minimal',   emoji: '◻️' },
    { id: 'cinematic', label: 'Cinematic', emoji: '🎥' },
    { id: 'glitch',    label: 'Glitch',    emoji: '🌐' },
    { id: '3d',        label: '3D',        emoji: '🎲' },
    { id: 'custom',    label: 'Custom',    emoji: '🎨' },
]

const RATIOS = ['9:16', '16:9', '1:1', '4:3']
const DURATIONS = [5, 8, 10, 15]
const MODELS = [
    { value: 'seedance-2.0', label: 'Seedance 2.0' },
    { value: 'seedance-2.0-fast', label: 'Seedance 2 Fast' },
]

const css = `
.mg-root {
    min-height: calc(100vh - 80px);
    background: radial-gradient(ellipse at top, rgba(255,77,0,0.08) 0%, transparent 60%);
    display: flex; flex-direction: column; align-items: center;
    padding: 32px 16px 80px;
    gap: 28px;
}
.mg-upload-zone {
    width: 100%; max-width: 860px;
    border: 2px dashed rgba(255,255,255,0.15);
    border-radius: 20px;
    background: rgba(255,255,255,0.03);
    padding: 32px;
    text-align: center; cursor: pointer;
    transition: all 0.2s;
    position: relative;
}
.mg-upload-zone:hover, .mg-upload-zone.drag { border-color: #FF4D00; background: rgba(255,77,0,0.06); }
.mg-thumb-grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 16px; }
.mg-thumb { width: 90px; height: 90px; border-radius: 10px; object-fit: cover; border: 2px solid rgba(255,255,255,0.1); position: relative; }
.mg-thumb-rm { position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; background: #FF4D00; border-radius: 50%; border: none; color: #fff; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.mg-presets { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; width: 100%; max-width: 860px; }
.mg-preset-pill {
    padding: 8px 16px; border-radius: 50px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.7); font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px;
}
.mg-preset-pill:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
.mg-preset-pill.active { background: rgba(255,77,0,0.15); border-color: #FF4D00; color: #FF4D00; }
.mg-custom-input {
    width: 100%; max-width: 860px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px; padding: 12px 16px; color: #fff; font-size: 14px; outline: none;
    font-family: inherit;
}
.mg-custom-input:focus { border-color: rgba(255,77,0,0.5); }
.mg-scott-panel {
    width: 100%; max-width: 860px;
    background: #191919; border: 1px solid rgba(255,255,255,0.1);
    border-radius: 18px; padding: 10px 14px;
    display: flex; align-items: center; gap: 10px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    backdrop-filter: blur(20px);
}
.mg-brief-wrap {
    flex: 1; display: flex; align-items: center;
    background: rgba(255,255,255,0.05); border-radius: 12px;
    padding: 0 14px; border: 1px solid rgba(255,255,255,0.06);
    min-height: 52px;
}
.mg-brief-wrap:focus-within { border-color: rgba(255,255,255,0.18); }
.mg-brief { background: transparent; border: none; outline: none; color: #fff; font-size: 14px; width: 100%; font-family: inherit; }
.mg-brief::placeholder { color: rgba(255,255,255,0.35); }
.mg-cfg-btn {
    display: flex; align-items: center; gap: 4px;
    padding: 7px 11px; border-radius: 9px;
    background: transparent; border: none;
    color: rgba(255,255,255,0.75); font-size: 13px; font-weight: 600;
    cursor: pointer; transition: background 0.2s; white-space: nowrap;
    position: relative;
}
.mg-cfg-btn:hover { background: rgba(255,255,255,0.09); color: #fff; }
.mg-cfg-btn .material-symbols-outlined { font-size: 16px; }
.mg-cfg-dd {
    position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
    background: #2a2a2a; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 12px; padding: 6px; z-index: 9999; min-width: 110px;
}
.mg-cfg-opt {
    display: block; width: 100%; padding: 8px 12px;
    background: transparent; border: none; color: #fff;
    font-size: 13px; text-align: left; cursor: pointer; border-radius: 8px;
    transition: background 0.15s;
}
.mg-cfg-opt:hover { background: rgba(255,255,255,0.1); }
.mg-gen-btn {
    background: #FF4D00; color: #fff; border: none;
    border-radius: 12px; padding: 0 22px; height: 52px;
    font-size: 14px; font-weight: 800; cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex; align-items: center; gap: 6px; white-space: nowrap;
    text-transform: uppercase;
}
.mg-gen-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(255,77,0,0.4); }
.mg-gen-btn:disabled { background: #333; color: #666; cursor: default; transform: none; box-shadow: none; }
.mg-status-card {
    width: 100%; max-width: 860px;
    background: #191919; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px; padding: 24px;
    display: flex; flex-direction: column; gap: 16px;
}
.mg-progress-bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
.mg-progress-fill { height: 100%; background: linear-gradient(90deg, #FF4D00, #ff8040); border-radius: 2px; transition: width 0.5s ease; }
.mg-prompt-box {
    background: rgba(255,255,255,0.04); border-radius: 12px; padding: 16px;
    font-size: 13px; line-height: 1.7; color: rgba(255,255,255,0.75);
    border: 1px solid rgba(255,255,255,0.06); max-height: 200px; overflow-y: auto;
}
.mg-result-video { width: 100%; border-radius: 14px; background: #000; display: block; }
.mg-action-row { display: flex; gap: 10px; flex-wrap: wrap; }
.mg-action-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 600;
    cursor: pointer; border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.8);
    transition: all 0.2s;
}
.mg-action-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
.mg-action-btn.primary { background: rgba(255,77,0,0.15); border-color: rgba(255,77,0,0.4); color: #FF4D00; }
.mg-action-btn.primary:hover { background: rgba(255,77,0,0.25); }
.mg-stage-label { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.8px; }
.mg-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #FF4D00; border-radius: 50%; animation: mg-spin 0.8s linear infinite; }
@keyframes mg-spin { to { transform: rotate(360deg); } }
`

function CfgDrop({ value, onChange, options, icon, label }) {
    const [open, setOpen] = useState(false)
    const ref = useRef()
    const sel = options.find(o => (o.value || o) === value)
    return (
        <div style={{ position: 'relative' }} ref={ref}>
            <button type="button" className="mg-cfg-btn" onClick={() => setOpen(v => !v)}>
                <span className="material-symbols-outlined">{icon}</span>
                <span>{sel?.label || value}</span>
            </button>
            {open && (
                <div className="mg-cfg-dd" onMouseLeave={() => setOpen(false)}>
                    {options.map(o => (
                        <button key={o.value || o} type="button" className="mg-cfg-opt"
                            onClick={() => { onChange(o.value || o); setOpen(false) }}>
                            {o.label || o}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function MotionGraphics({ activeBrand, canCreateVideo = true, onUpgradeRequired }) {
    const [images, setImages] = useState([])
    const [style, setStyle] = useState('dynamic')
    const [customStyle, setCustomStyle] = useState('')
    const [brief, setBrief] = useState('')
    const [ratio, setRatio] = useState('9:16')
    const [duration, setDuration] = useState(8)
    const [model, setModel] = useState('seedance-2.0')
    const [stage, setStage] = useState('idle') // idle | uploading | analyzing | prompting | generating | done | error
    const [analysis, setAnalysis] = useState(null)
    const [motionPrompt, setMotionPrompt] = useState('')
    const [editedPrompt, setEditedPrompt] = useState('')
    const [progress, setProgress] = useState(0)
    const [requestId, setRequestId] = useState(null)
    const [videoUrl, setVideoUrl] = useState(null)
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)
    const [drag, setDrag] = useState(false)
    const fileRef = useRef()
    const pollRef = useRef()

    const busy = ['analyzing', 'prompting', 'generating'].includes(stage)

    // ── Upload images (base64 → S3 via existing upload endpoint) ──
    const handleFiles = useCallback(async (files) => {
        const arr = Array.from(files).slice(0, 4)
        const newImgs = []
        for (const f of arr) {
            const reader = new FileReader()
            const dataUrl = await new Promise(r => { reader.onload = e => r(e.target.result); reader.readAsDataURL(f) })
            // Upload to get S3 URL
            try {
                const form = new FormData(); form.append('file', f)
                const d = await api('/upload/image', { method: 'POST', body: form })
                newImgs.push({ url: d.url, preview: dataUrl, name: f.name })
            } catch {
                // Fallback: store as base64 (analyze endpoint accepts inline data)
                newImgs.push({ url: dataUrl, preview: dataUrl, name: f.name })
            }
        }
        setImages(prev => [...prev, ...newImgs].slice(0, 4))
    }, [])

    const handleDrop = useCallback(e => {
        e.preventDefault(); setDrag(false)
        handleFiles(e.dataTransfer.files)
    }, [handleFiles])

    // ── Main pipeline ──
    const handleGenerate = async () => {
        if (!canCreateVideo) { onUpgradeRequired?.(); return }
        if (images.length === 0) { setError('Upload at least one logo or image first'); return }
        setError(''); setVideoUrl(null); setProgress(0)

        const brandName = activeBrand?.name || ''
        const imageUrls = images.map(i => i.url)

        // Stage 1: Analyze
        setStage('analyzing')
        let assetAnalysis = analysis
        try {
            const d = await api('/video-studio/motion-graphics/analyze', {
                method: 'POST',
                body: JSON.stringify({ imageUrls, brandName, userBrief: brief }),
            })
            assetAnalysis = d.analysis
            setAnalysis(d.analysis)
        } catch (e) {
            setError('Analysis failed: ' + e.message); setStage('error'); return
        }

        // Stage 2: Generate prompt via Claude
        setStage('prompting')
        let finalPrompt = ''
        try {
            const d = await api('/video-studio/motion-graphics/generate-prompt', {
                method: 'POST',
                body: JSON.stringify({
                    analysis: assetAnalysis,
                    styleId: style,
                    customStyle,
                    userBrief: brief,
                    brandName,
                    duration,
                }),
            })
            finalPrompt = d.motionPrompt
            setMotionPrompt(finalPrompt)
            setEditedPrompt(finalPrompt)
        } catch (e) {
            setError('Prompt generation failed: ' + e.message); setStage('error'); return
        }

        // Stage 3: Generate video
        setStage('generating'); setProgress(5)
        try {
            const d = await api('/video-studio/motion-graphics/generate-video', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id,
                    prompt: editedPrompt || finalPrompt,
                    imageUrls,
                    styleId: style,
                    duration,
                    aspectRatio: ratio,
                    resolution: '1080p',
                    model,
                }),
            })
            setRequestId(d.requestId)
            startPolling(d.requestId)
        } catch (e) {
            setError('Generation failed: ' + e.message); setStage('error')
        }
    }

    // ── Regenerate with edited prompt ──
    const handleRegenerate = async () => {
        if (!editedPrompt.trim()) return
        setError(''); setVideoUrl(null); setProgress(5); setStage('generating')
        try {
            const d = await api('/video-studio/motion-graphics/generate-video', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id,
                    prompt: editedPrompt,
                    imageUrls: images.map(i => i.url),
                    styleId: style,
                    duration,
                    aspectRatio: ratio,
                    resolution: '1080p',
                    model,
                }),
            })
            setRequestId(d.requestId)
            startPolling(d.requestId)
        } catch (e) {
            setError('Generation failed: ' + e.message); setStage('error')
        }
    }

    const startPolling = (rid) => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const d = await api(`/video-studio/motion-graphics/status/${rid}`)
                if (d.progress) setProgress(d.progress)
                if (d.status === 'COMPLETED' && d.videoUrl) {
                    clearInterval(pollRef.current)
                    setVideoUrl(d.videoUrl)
                    setStage('done')
                } else if (d.status === 'FAILED') {
                    clearInterval(pollRef.current)
                    setError(d.error || 'Generation failed. Try a different style or prompt.')
                    setStage('error')
                }
            } catch { /* keep polling */ }
        }, 5000)
    }

    const handleDownload = async () => {
        if (!videoUrl) return
        try {
            const r = await fetch(videoUrl)
            const blob = await r.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `motion-graphics-${style}-${Date.now()}.mp4`
            a.click()
        } catch { window.open(videoUrl, '_blank') }
    }

    const handleCopy = () => {
        navigator.clipboard.writeText(editedPrompt || motionPrompt)
        setCopied(true); setTimeout(() => setCopied(false), 2000)
    }

    const stageLabel = {
        idle: '', analyzing: '🔍 Analyzing your assets with Gemini Vision…',
        prompting: '✍️ Motion Graphic Designer is writing your animation brief…',
        generating: '🎬 Seedance 2 is rendering your animation…',
        done: '✅ Your motion graphic is ready!',
        error: '',
    }[stage] || ''

    return (
        <>
            <style>{css}</style>
            <div className="mg-root">

                {/* ── Upload Zone ── */}
                <div className={`mg-upload-zone${drag ? ' drag' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDrag(true) }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={handleDrop}
                    onClick={() => !busy && fileRef.current?.click()}>
                    <input ref={fileRef} type="file" accept="image/*" multiple hidden
                        onChange={e => handleFiles(e.target.files)} />
                    {images.length === 0 ? (
                        <>
                            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'rgba(255,255,255,0.3)', marginBottom: 8, display: 'block' }}>motion_photos_auto</span>
                            <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 4px', fontWeight: 700, fontSize: 15 }}>Drop your logo or brand assets here</p>
                            <p style={{ color: 'rgba(255,255,255,0.3)', margin: 0, fontSize: 13 }}>PNG, JPG, SVG • Up to 4 images • Logos, slides, brand content</p>
                        </>
                    ) : (
                        <div className="mg-thumb-grid">
                            {images.map((img, i) => (
                                <div key={i} style={{ position: 'relative' }}>
                                    <img src={img.preview || img.url} alt="" className="mg-thumb" />
                                    <button className="mg-thumb-rm" onClick={e => { e.stopPropagation(); setImages(prev => prev.filter((_, j) => j !== i)) }}>×</button>
                                </div>
                            ))}
                            {images.length < 4 && (
                                <div style={{ width: 90, height: 90, borderRadius: 10, border: '2px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.3)' }}>add</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Style Presets ── */}
                <div className="mg-presets">
                    {PRESETS.map(p => (
                        <button key={p.id} className={`mg-preset-pill${style === p.id ? ' active' : ''}`}
                            onClick={() => setStyle(p.id)}>
                            <span>{p.emoji}</span> {p.label}
                        </button>
                    ))}
                </div>

                {/* ── Custom Style Input ── */}
                {style === 'custom' && (
                    <input className="mg-custom-input" placeholder="Describe your custom animation style… e.g. 'neon retro arcade, pulsing to a beat, magenta glow'"
                        value={customStyle} onChange={e => setCustomStyle(e.target.value)} />
                )}

                {/* ── Scott Panel ── */}
                <div className="mg-scott-panel">
                    <div className="mg-brief-wrap">
                        <input className="mg-brief" placeholder="Optional brief — e.g. 'luxury brand intro for Instagram'"
                            value={brief} onChange={e => setBrief(e.target.value)} disabled={busy} />
                    </div>
                    <CfgDrop value={ratio} onChange={setRatio} options={RATIOS} icon="aspect_ratio" />
                    <CfgDrop value={duration} onChange={v => setDuration(Number(v))}
                        options={DURATIONS.map(d => ({ value: d, label: `${d}s` }))} icon="timer" />
                    <CfgDrop value={model} onChange={setModel} options={MODELS} icon="smart_toy" />
                    <button className="mg-gen-btn" onClick={handleGenerate} disabled={busy || images.length === 0}>
                        {busy ? <span className="mg-spinner" /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>}
                        {busy ? 'Working…' : 'Animate'}
                    </button>
                </div>

                {/* ── Status / Output Card ── */}
                {stage !== 'idle' && (
                    <div className="mg-status-card">

                        {/* Stage label */}
                        {stageLabel && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {busy && <span className="mg-spinner" />}
                                <span className="mg-stage-label">{stageLabel}</span>
                            </div>
                        )}

                        {/* Progress bar */}
                        {stage === 'generating' && (
                            <div className="mg-progress-bar">
                                <div className="mg-progress-fill" style={{ width: `${progress || 5}%` }} />
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 13 }}>
                                {error}
                            </div>
                        )}

                        {/* Generated Prompt — editable */}
                        {(motionPrompt || editedPrompt) && (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span className="mg-stage-label">✍️ Animation Prompt (editable)</span>
                                    <button className="mg-action-btn" style={{ padding: '5px 10px', fontSize: 11 }} onClick={handleCopy}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{copied ? 'check' : 'content_copy'}</span>
                                        {copied ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <textarea className="mg-prompt-box" rows={6} value={editedPrompt}
                                    onChange={e => setEditedPrompt(e.target.value)}
                                    style={{ width: '100%', resize: 'vertical', outline: 'none', cursor: 'text', background: 'rgba(255,255,255,0.04)' }} />
                            </div>
                        )}

                        {/* Video Result */}
                        {videoUrl && (
                            <>
                                <video className="mg-result-video" src={videoUrl} controls autoPlay loop playsInline />
                                <div className="mg-action-row">
                                    <button className="mg-action-btn primary" onClick={handleDownload}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Download
                                    </button>
                                    <button className="mg-action-btn" onClick={handleRegenerate} disabled={busy}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>replay</span> Re-animate
                                    </button>
                                    <button className="mg-action-btn" onClick={() => { setStage('idle'); setVideoUrl(null); setMotionPrompt(''); setEditedPrompt(''); setAnalysis(null); setImages([]); }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span> New
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Analysis debug (collapsed) */}
                        {analysis && !videoUrl && (
                            <details style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                                <summary style={{ cursor: 'pointer', marginBottom: 6 }}>Asset Analysis Details</summary>
                                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(analysis, null, 2)}</pre>
                            </details>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}

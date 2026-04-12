import { useState, useEffect, useRef, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
    if (score == null) return null
    const color = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#ef4444'
    const label = score >= 8 ? 'Strong' : score >= 6 ? 'Good' : 'Weak'
    return (
        <span style={{ background: `${color}20`, color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
            {score}/10 — {label}
        </span>
    )
}

function Chip({ label, icon, color = 'var(--sys-primary)' }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${color}15`, color }}>
            {icon && <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{icon}</span>}
            {label}
        </span>
    )
}

function Section({ title, icon, children, defaultOpen = true, badge }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div style={{ border: '1px solid var(--sys-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--sys-surface)', border: 'none', color: 'var(--sys-text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-primary)' }}>{icon}</span>
                {title}
                {badge && <span style={{ marginLeft: 4, background: 'var(--sys-primary)', color: 'white', borderRadius: 9, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{badge}</span>}
                <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 16 }}>{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && <div style={{ padding: '16px', background: 'var(--sys-bg)' }}>{children}</div>}
        </div>
    )
}

function copyText(text) { return navigator.clipboard.writeText(text) }

// ── Phase 4: SSE Progress Tracker ────────────────────────────────────────────

const NODE_LABELS = {
    transcript:          { label: 'Transcript & Metadata',   icon: 'subtitles' },
    analysis:            { label: 'AI Video Analysis',       icon: 'psychology' },
    chapters:            { label: 'Chapter Detection',       icon: 'list_alt' },
    seo:                 { label: 'SEO Copywriting',         icon: 'search' },
    brand:               { label: 'Brand Alignment',         icon: 'corporate_fare' },
    thumbnailDirection:  { label: 'Thumbnail Concept',       icon: 'brush' },
    thumbnailGeneration: { label: 'FLUX Thumbnail Gen',      icon: 'image' },
    characters:          { label: 'Character Portraits',     icon: 'face' },
}

function PipelineProgress({ projectId, onComplete }) {
    const [nodes, setNodes] = useState({})
    const [done, setDone] = useState(false)
    const esRef = useRef(null)

    useEffect(() => {
        const token = localStorage.getItem('mantram_token')
        const es = new EventSource(`${API_BASE}/youtube-studio/${projectId}/progress?token=${token}`)
        esRef.current = es

        es.onmessage = e => {
            const evt = JSON.parse(e.data)
            if (evt.type === 'node') {
                setNodes(prev => ({ ...prev, [evt.node]: { status: evt.status, message: evt.message } }))
            } else if (evt.type === 'done') {
                setDone(true)
                es.close()
                setTimeout(() => onComplete?.(), 1000)
            } else if (evt.type === 'error') {
                setDone(true)
                es.close()
                onComplete?.()
            }
        }
        es.onerror = () => { es.close(); setTimeout(() => onComplete?.(), 3000) }

        return () => es.close()
    }, [projectId])

    const nodeKeys = Object.keys(NODE_LABELS)
    const completedCount = nodeKeys.filter(k => nodes[k]?.status === 'done').length

    return (
        <div style={{ padding: '24px 0' }}>
            {/* Progress header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                {!done ? (
                    <div style={{ width: 32, height: 32, border: '3px solid var(--sys-border)', borderTopColor: 'var(--sys-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#22c55e' }}>check_circle</span>
                )}
                <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{done ? '✅ Analysis Complete!' : 'AI Pipeline Running…'}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--sys-text-muted)' }}>{completedCount}/{nodeKeys.length} nodes complete</p>
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 4, background: 'var(--sys-border)', borderRadius: 4, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--sys-primary), #a855f7)', borderRadius: 4, width: `${(completedCount / nodeKeys.length) * 100}%`, transition: 'width .5s ease' }} />
            </div>

            {/* Node list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {nodeKeys.map(key => {
                    const meta = NODE_LABELS[key]
                    const state = nodes[key]
                    const status = state?.status || 'pending'
                    const color = status === 'done' ? '#22c55e' : status === 'running' ? 'var(--sys-primary)' : 'var(--sys-text-muted)'
                    return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: status === 'running' ? 'var(--sys-primary-dim)' : 'var(--sys-surface)', border: `1px solid ${status === 'running' ? 'var(--sys-primary)' : 'var(--sys-border)'}`, transition: 'all .3s' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color }}>{status === 'done' ? 'check_circle' : status === 'running' ? meta.icon : 'radio_button_unchecked'}</span>
                            <span style={{ fontSize: 13, fontWeight: status === 'running' ? 700 : 500, color: status === 'pending' ? 'var(--sys-text-muted)' : 'var(--sys-text)' }}>{meta.label}</span>
                            {status === 'running' && state?.message && (
                                <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', marginLeft: 'auto' }}>{state.message}</span>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Project Card (History) ────────────────────────────────────────────────────

function ProjectCard({ project, onOpen }) {
    const statusColor = { done: '#22c55e', failed: '#ef4444', processing: '#f59e0b', analysing: '#3b82f6' }[project.status] || '#6b7280'
    return (
        <div onClick={() => onOpen(project._id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', cursor: 'pointer', transition: 'all .2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sys-primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--sys-border)'}>
            {project.metadata?.thumbnailUrl ? (
                <img src={project.generatedThumbnailUrl || project.metadata.thumbnailUrl} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 6 }} />
            ) : (
                <div style={{ width: 80, height: 45, borderRadius: 6, background: 'var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--sys-text-muted)' }}>play_circle</span>
                </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.metadata?.title || project.videoId}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{project.metadata?.channelTitle} · {new Date(project.createdAt).toLocaleDateString()}</p>
            </div>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: `${statusColor}20`, color: statusColor, fontWeight: 700 }}>{project.status}</span>
        </div>
    )
}

// ── Project Detail View ───────────────────────────────────────────────────────

function ProjectDetail({ project, onRefresh }) {
    const { analysis, seo, chapters, brandAlignment, thumbnailDirection, metadata, transcript,
        generatedThumbnailUrl, characterPortraits } = project

    const [genLoading, setGenLoading] = useState(false)
    const [portraitLoading, setPortraitLoading] = useState(false)
    const [localThumb, setLocalThumb] = useState(generatedThumbnailUrl)
    const [localPortraits, setLocalPortraits] = useState(characterPortraits || [])

    // Full YouTube description formatted for copy-paste
    const exportDescription = seo ? [
        seo.description?.hook || '',
        '',
        seo.description?.body || '',
        '',
        chapters?.length ? `⏱ CHAPTERS\n${chapters.map(c => `${c.timestamp} ${c.title}`).join('\n')}` : '',
        '',
        seo.description?.cta || '',
        '',
        seo.description?.hashtags?.join(' ') || '',
    ].filter(l => l !== undefined).join('\n').trim() : ''

    async function regenerateThumbnail() {
        setGenLoading(true)
        try {
            const d = await api(`/youtube-studio/${project._id}/thumbnail`, { method: 'POST' })
            if (d.generatedThumbnailUrl) setLocalThumb(d.generatedThumbnailUrl)
        } catch (e) { alert('Thumbnail generation failed: ' + e.message) }
        setGenLoading(false)
    }

    async function generatePortraits() {
        setPortraitLoading(true)
        try {
            const d = await api(`/youtube-studio/${project._id}/characters`, { method: 'POST' })
            setLocalPortraits(d.characterPortraits || [])
        } catch (e) { alert('Portrait generation failed: ' + e.message) }
        setPortraitLoading(false)
    }

    if (project.status === 'processing' || project.status === 'analysing') {
        return <PipelineProgress projectId={project._id} onComplete={onRefresh} />
    }

    if (project.status === 'failed') {
        return <div style={{ padding: 24, color: '#ef4444', fontSize: 14 }}>❌ Analysis failed: {project.error}</div>
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Video Header */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-start' }}>
                {metadata?.thumbnailUrl && (
                    <a href={project.videoUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                        <img src={metadata.thumbnailUrl} alt="" style={{ width: 140, height: 79, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--sys-border)' }} />
                    </a>
                )}
                <div>
                    <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>{metadata?.title}</h2>
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--sys-text-muted)' }}>{metadata?.channelTitle} · {project.duration} · {metadata?.viewCount?.toLocaleString()} views</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {analysis?.contentType && <Chip label={analysis.contentType} icon="category" />}
                        {analysis?.tone && <Chip label={analysis.tone} icon="mood" color="#a855f7" />}
                        {analysis?.pacing && <Chip label={`${analysis.pacing} pace`} icon="speed" color="#f59e0b" />}
                        {transcript?.available ? <Chip label="Transcript ✓" icon="subtitles" color="#22c55e" /> : <Chip label="No transcript" icon="subtitles_off" color="#ef4444" />}
                        {project.processingTimeSecs && <Chip label={`${project.processingTimeSecs}s`} icon="timer" color="#6b7280" />}
                    </div>
                </div>
            </div>

            {/* ── Phase 3: Generated Thumbnail ── */}
            <Section title="AI Thumbnail" icon="image" badge={localThumb ? '✓' : 'Generate'}>
                {localThumb ? (
                    <div>
                        <img src={localThumb} alt="Generated thumbnail" style={{ width: '100%', maxWidth: 640, height: 'auto', borderRadius: 10, border: '1px solid var(--sys-border)', display: 'block', marginBottom: 12 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                            <a href={localThumb} download="thumbnail.jpg" target="_blank" rel="noreferrer"
                                style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'var(--sys-primary)', color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Download (1280×720)
                            </a>
                            <button onClick={regenerateThumbnail} disabled={genLoading}
                                style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--sys-surface)', color: 'var(--sys-text)', fontSize: 13, fontWeight: 600, border: '1px solid var(--sys-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                {genLoading ? <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>}
                                Regenerate
                            </button>
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        {thumbnailDirection && (
                            <div style={{ padding: 14, borderRadius: 10, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', marginBottom: 16, textAlign: 'left' }}>
                                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)' }}>CREATIVE BRIEF</p>
                                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{thumbnailDirection.concept}</p>
                                {thumbnailDirection.textOverlay?.line1 && (
                                    <div style={{ marginTop: 10, padding: '10px 16px', borderRadius: 8, background: (thumbnailDirection.dominantColor || '#3b82f6') + '20', border: `1px solid ${(thumbnailDirection.dominantColor || '#3b82f6')}40`, textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: thumbnailDirection.textOverlay.color || 'white' }}>{thumbnailDirection.textOverlay.line1}</p>
                                        {thumbnailDirection.textOverlay.line2 && <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: thumbnailDirection.textOverlay.color || 'white', opacity: 0.85 }}>{thumbnailDirection.textOverlay.line2}</p>}
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={regenerateThumbnail} disabled={genLoading}
                            style={{ padding: '12px 28px', borderRadius: 10, background: genLoading ? 'var(--sys-border)' : 'linear-gradient(135deg, #ff0000, #cc0000)', color: 'white', fontWeight: 700, fontSize: 14, border: 'none', cursor: genLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {genLoading
                                ? <><div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Generating with FLUX Pro…</>
                                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>Generate AI Thumbnail</>
                            }
                        </button>
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>Uses FLUX Pro (fal.ai) · ~20-30 seconds</p>
                    </div>
                )}
            </Section>

            {/* ── Phase 2: Character Portraits ── */}
            {(analysis?.characters?.length > 0 || localPortraits.length > 0) && (
                <Section title="Characters" icon="face" badge={analysis?.characters?.length}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                        {analysis?.characters?.map((char, i) => {
                            const portrait = localPortraits.find(p => p.label === char.label)
                            return (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 120 }}>
                                    {portrait?.portraitUrl ? (
                                        <img src={portrait.portraitUrl} alt={char.label}
                                            style={{ width: 100, height: 100, borderRadius: 50, objectFit: 'cover', border: '3px solid var(--sys-primary)' }} />
                                    ) : (
                                        <div style={{ width: 100, height: 100, borderRadius: 50, background: 'var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--sys-border)' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--sys-text-muted)' }}>person</span>
                                        </div>
                                    )}
                                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{char.label}</p>
                                    <p style={{ margin: 0, fontSize: 10, color: 'var(--sys-text-muted)', textAlign: 'center' }}>{char.role} · {char.firstAppearance}</p>
                                    {char.screenTimePct && <Chip label={`${char.screenTimePct}% screen time`} color="#6366f1" />}
                                </div>
                            )
                        })}
                    </div>
                    <button onClick={generatePortraits} disabled={portraitLoading}
                        style={{ padding: '8px 18px', borderRadius: 8, background: portraitLoading ? 'var(--sys-border)' : 'var(--sys-primary-dim)', color: 'var(--sys-primary)', fontWeight: 600, fontSize: 12, border: 'none', cursor: portraitLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {portraitLoading
                            ? <><div style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Generating portraits…</>
                            : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>{localPortraits.length ? 'Regenerate' : 'Generate'} AI Portraits</>
                        }
                    </button>
                </Section>
            )}

            {/* Summary */}
            {analysis?.summary && (
                <Section title="Video Summary" icon="summarize">
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{analysis.summary}</p>
                    {analysis.emotionalArc && (
                        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)' }}>EMOTIONAL ARC</p>
                            <p style={{ margin: 0, fontSize: 13 }}>{analysis.emotionalArc}</p>
                        </div>
                    )}
                    {analysis.keyThemes?.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {analysis.keyThemes.map((t, i) => <Chip key={i} label={t} color="#3b82f6" />)}
                        </div>
                    )}
                </Section>
            )}

            {/* Highlights */}
            {analysis?.highlights?.length > 0 && (
                <Section title="Key Highlights" icon="star" badge={analysis.highlights.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {analysis.highlights.map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                                <a href={`${project.videoUrl}&t=${h.timestamp?.replace(':', 'm')}s`}
                                    target="_blank" rel="noreferrer"
                                    style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)', flexShrink: 0, minWidth: 40, textDecoration: 'none' }}>{h.timestamp}</a>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{h.title}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{h.why}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Chapters */}
            {chapters?.length > 0 && (
                <Section title="AI Chapters" icon="list_alt" badge={chapters.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                        {chapters.map((c, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', borderRadius: 6, borderBottom: '1px solid var(--sys-border)' }}>
                                <a href={`${project.videoUrl}&t=${c.timestamp?.replace(':', 'm')}s`}
                                    target="_blank" rel="noreferrer"
                                    style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)', minWidth: 40, textDecoration: 'none' }}>{c.timestamp}</a>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{c.title}</p>
                                    {c.description && <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{c.description}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => copyText(chapters.map(c => `${c.timestamp} ${c.title}`).join('\n'))}
                        style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span> Copy chapters for YouTube
                    </button>
                </Section>
            )}

            {/* SEO */}
            {seo && (
                <Section title="SEO — Titles & Description" icon="search">
                    {seo.titles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)' }}>TITLE VARIANTS</p>
                            {seo.titles.map((t, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: seo.recommendedTitle === t.text ? 'var(--sys-primary-dim)' : 'var(--sys-surface)', border: `1px solid ${seo.recommendedTitle === t.text ? 'var(--sys-primary)' : 'var(--sys-border)'}`, marginBottom: 6 }}>
                                    <p style={{ margin: 0, fontSize: 13, flex: 1 }}>{t.text}</p>
                                    <Chip label={t.style} color="#6366f1" />
                                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', whiteSpace: 'nowrap' }}>CTR: {t.ctrScore}/10</span>
                                    <button onClick={() => copyText(t.text)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sys-text-muted)', padding: 4 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {seo.tags?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)' }}>TAGS ({seo.tags.length})</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {seo.tags.map((t, i) => <Chip key={i} label={t} color="#6b7280" />)}
                            </div>
                            <button onClick={() => copyText(seo.tags.join(', '))} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: 'transparent', color: 'var(--sys-text-muted)', border: '1px solid var(--sys-border)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>content_copy</span> Copy all tags
                            </button>
                        </div>
                    )}
                </Section>
            )}

            {/* Phase 4: YouTube Export Panel */}
            {seo && (
                <Section title="Export for YouTube" icon="upload" defaultOpen={false}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--sys-text-muted)' }}>
                        Pre-formatted block ready to paste directly into YouTube Studio
                    </p>
                    <div style={{ background: 'var(--sys-surface)', borderRadius: 8, padding: 14, border: '1px solid var(--sys-border)', position: 'relative', marginBottom: 12 }}>
                        <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, color: 'var(--sys-text)' }}>
                            {exportDescription}
                        </pre>
                        <button onClick={() => copyText(exportDescription)}
                            style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', cursor: 'pointer', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>content_copy</span>Copy Full Description
                        </button>
                    </div>
                    {/* Download transcript */}
                    {transcript?.fullText && (
                        <button onClick={() => {
                            const blob = new Blob([
                                `VIDEO: ${metadata?.title}\nURL: ${project.videoUrl}\n\n`,
                                chapters?.length ? `CHAPTERS:\n${chapters.map(c => `${c.timestamp} ${c.title}`).join('\n')}\n\n` : '',
                                `TRANSCRIPT:\n${transcript.fullText}`,
                            ], { type: 'text/plain' })
                            const a = document.createElement('a')
                            a.href = URL.createObjectURL(blob)
                            a.download = `${(metadata?.title || 'transcript').substring(0, 50).replace(/[^a-z0-9]/gi, '_')}.txt`
                            a.click()
                        }} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--sys-surface)', color: 'var(--sys-text)', border: '1px solid var(--sys-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span> Download Transcript (.txt)
                        </button>
                    )}
                </Section>
            )}

            {/* Brand Alignment */}
            {brandAlignment && (
                <Section title="Brand Alignment" icon="corporate_fare" defaultOpen={false}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ fontSize: 36, fontWeight: 800, color: brandAlignment.overallScore >= 8 ? '#22c55e' : brandAlignment.overallScore >= 6 ? '#f59e0b' : '#ef4444' }}>
                            {brandAlignment.overallScore}/10
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{brandAlignment.verdict?.replace(/-/g, ' ').toUpperCase()}</p>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--sys-text-muted)' }}>{brandAlignment.recommendation}</p>
                        </div>
                    </div>
                    {brandAlignment.dimensions && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {Object.entries(brandAlignment.dimensions).map(([key, val]) => (
                                <div key={key} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                                    <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--sys-text-muted)', textTransform: 'uppercase' }}>{key.replace(/([A-Z])/g, ' $1')}</p>
                                    <ScoreBadge score={val.score} />
                                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{val.reason}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            )}
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function YouTubeStudio() {
    const { activeBrand } = useBrand()

    const [tab, setTab] = useState('analyse')
    const [urlInput, setUrlInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [projects, setProjects] = useState([])
    const [activeProject, setActiveProject] = useState(null)
    const [loadingProject, setLoadingProject] = useState(false)
    const pollRef = useRef({})

    useEffect(() => { loadProjects() }, [])

    async function loadProjects() {
        try {
            const d = await api('/youtube-studio/projects?limit=30')
            setProjects(d.projects || [])
        } catch { }
    }

    async function openProject(id) {
        setLoadingProject(true)
        setTab('result')
        try {
            const d = await api(`/youtube-studio/${id}`)
            setActiveProject(d.project)
            if (d.project.status === 'processing' || d.project.status === 'analysing') {
                startPolling(id)
            }
        } catch (e) { setError(e.message) }
        setLoadingProject(false)
    }

    function startPolling(id) {
        if (pollRef.current[id]) return
        let attempts = 0
        pollRef.current[id] = setInterval(async () => {
            attempts++
            if (attempts > 45) { clearInterval(pollRef.current[id]); delete pollRef.current[id]; return }
            try {
                const d = await api(`/youtube-studio/${id}`)
                const proj = d.project
                setActiveProject(proj)
                setProjects(prev => prev.map(p => p._id === id ? { ...p, status: proj.status, metadata: proj.metadata, generatedThumbnailUrl: proj.generatedThumbnailUrl } : p))
                if (proj.status === 'done' || proj.status === 'failed') {
                    clearInterval(pollRef.current[id])
                    delete pollRef.current[id]
                }
            } catch { }
        }, 4000)
    }

    useEffect(() => () => Object.values(pollRef.current).forEach(clearInterval), [])

    async function handleAnalyse() {
        const rawUrls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
        if (!rawUrls.length) return setError('Enter at least one YouTube URL')
        if (rawUrls.length > 10) return setError('Maximum 10 URLs at a time')

        setLoading(true)
        setError(null)
        try {
            const d = await api('/youtube-studio/analyse', {
                method: 'POST',
                body: JSON.stringify({ urls: rawUrls, brandId: activeBrand?._id }),
            })
            const newProjects = d.projects || []
            setUrlInput('')

            if (newProjects.length === 1) {
                setActiveProject({ _id: newProjects[0]._id, videoId: newProjects[0].videoId, status: 'processing' })
                setTab('result')
                startPolling(newProjects[0]._id)
            } else {
                setTab('history')
                newProjects.forEach(p => startPolling(p._id))
            }
            await loadProjects()
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    return (
        <DashboardLayout title="YouTube Studio" subtitle="AI video intelligence · SEO · Thumbnails · Characters">
            <SEOHead title="YouTube Studio — Mantram AI" noIndex={true} />

            {/* Tab bar */}
            <div className="studio-tab-bar" style={{ marginBottom: 24 }}>
                <div className="studio-tab-row">
                    {[
                        { id: 'analyse', icon: 'link', label: 'Analyse' },
                        { id: 'result', icon: 'analytics', label: 'Result', disabled: !activeProject },
                        { id: 'history', icon: 'history', label: `History (${projects.length})` },
                    ].map(t => (
                        <button key={t.id} disabled={t.disabled} onClick={() => setTab(t.id)}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 cursor-pointer ${tab === t.id ? 'studio-nav-pill text-[var(--sys-text)] font-bold' : 'studio-nav-tab-inactive'} ${t.disabled ? 'opacity-40 pointer-events-none' : ''}`}>
                            <span className={`material-symbols-outlined ${tab === t.id ? 'text-lg' : 'text-base opacity-70'}`}>{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Analyse Tab ── */}
            {tab === 'analyse' && (
                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #ff0000, #cc0000)', marginBottom: 16 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'white' }}>play_circle</span>
                        </div>
                        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>YouTube Studio</h1>
                        <p style={{ margin: 0, color: 'var(--sys-text-muted)', fontSize: 14 }}>
                            Paste any YouTube URL. The AI watches the video, extracts transcripts, writes SEO copy, generates a thumbnail, and portraits every character — all brand-aligned.
                        </p>
                    </div>

                    <div style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-muted)', display: 'block', marginBottom: 8 }}>
                            YouTube URL(s) — one per line, up to 10
                        </label>
                        <textarea value={urlInput} onChange={e => setUrlInput(e.target.value)}
                            placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nhttps://www.youtube.com/shorts/...'}
                            style={{ width: '100%', minHeight: 110, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />

                        {activeBrand && (
                            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>
                                🎯 Brand DNA from <strong>{activeBrand.name}</strong> will be injected into all 8 pipeline nodes
                            </p>
                        )}
                        {error && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444' }}>⚠️ {error}</p>}

                        <button onClick={handleAnalyse} disabled={loading || !urlInput.trim()}
                            style={{ width: '100%', marginTop: 14, padding: '13px', borderRadius: 10, border: 'none', background: loading || !urlInput.trim() ? 'var(--sys-border)' : 'linear-gradient(135deg, #ff0000, #cc0000)', color: 'white', fontWeight: 700, fontSize: 14, cursor: loading || !urlInput.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {loading
                                ? <><div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Starting pipeline…</>
                                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>Analyse with AI (8 nodes)</>
                            }
                        </button>
                    </div>

                    {/* What you get */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                            { icon: 'subtitles', label: 'Full Transcript', desc: 'Timestamped captions', phase: 1 },
                            { icon: 'star', label: 'Key Highlights', desc: 'Top moments with links', phase: 1 },
                            { icon: 'list_alt', label: 'Smart Chapters', desc: 'Auto-detected sections', phase: 1 },
                            { icon: 'search', label: 'SEO Metadata', desc: '5 title variants + description', phase: 1 },
                            { icon: 'corporate_fare', label: 'Brand Alignment', desc: 'Score vs. your brand DNA', phase: 1 },
                            { icon: 'face', label: 'Character Portraits', desc: 'AI-generated from analysis', phase: 2 },
                            { icon: 'image', label: 'FLUX Thumbnail', desc: 'Brand-aligned 1280×720', phase: 3 },
                            { icon: 'upload', label: 'YouTube Export', desc: 'Copy-paste ready block', phase: 4 },
                        ].map(f => (
                            <div key={f.label} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: f.phase === 1 ? '#ef4444' : f.phase === 2 ? '#a855f7' : f.phase === 3 ? '#3b82f6' : '#22c55e', flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{f.label} <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: 'var(--sys-border)', color: 'var(--sys-text-muted)' }}>P{f.phase}</span></p>
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Result Tab ── */}
            {tab === 'result' && (
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                    {loadingProject ? (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <div style={{ width: 40, height: 40, border: '3px solid var(--sys-border)', borderTopColor: 'var(--sys-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                            <p style={{ color: 'var(--sys-text-muted)' }}>Loading project…</p>
                        </div>
                    ) : activeProject ? (
                        <ProjectDetail project={activeProject} onRefresh={() => openProject(activeProject._id)} />
                    ) : (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--sys-text-muted)' }}>No project selected</div>
                    )}
                </div>
            )}

            {/* ── History Tab ── */}
            {tab === 'history' && (
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Analysis History ({projects.length})</h3>
                        <button onClick={loadProjects} style={{ fontSize: 12, color: 'var(--sys-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span> Refresh
                        </button>
                    </div>
                    {projects.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 60, color: 'var(--sys-text-muted)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 40, marginBottom: 8, display: 'block' }}>youtube_activity</span>
                            No analyses yet. Paste a URL above to get started.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {projects.map(p => <ProjectCard key={p._id} project={p} onOpen={openProject} />)}
                        </div>
                    )}
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </DashboardLayout>
    )
}

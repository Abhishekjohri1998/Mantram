import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useAuth } from '../context/AuthContext'
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

// ── Helpers ────────────────────────────────────────────────────────────────
function ScoreBadge({ score }) {
    const color = score >= 8 ? '#22c55e' : score >= 6 ? '#f59e0b' : '#ef4444'
    const label = score >= 8 ? 'Strong Match' : score >= 6 ? 'Good Match' : 'Weak Match'
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

function Section({ title, icon, children, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div style={{ border: '1px solid var(--sys-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <button onClick={() => setOpen(!open)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'var(--sys-surface)', border: 'none', color: 'var(--sys-text)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-primary)' }}>{icon}</span>
                {title}
                <span className="material-symbols-outlined" style={{ marginLeft: 'auto', fontSize: 16 }}>{open ? 'expand_less' : 'expand_more'}</span>
            </button>
            {open && <div style={{ padding: '16px', background: 'var(--sys-bg)' }}>{children}</div>}
        </div>
    )
}

// ── Project Card (in history) ─────────────────────────────────────────────
function ProjectCard({ project, onOpen }) {
    const status = project.status
    const statusColor = status === 'done' ? '#22c55e' : status === 'failed' ? '#ef4444' : '#f59e0b'
    return (
        <div onClick={() => onOpen(project._id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', cursor: 'pointer', transition: 'all .2s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--sys-primary)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--sys-border)'}>
            {project.metadata?.thumbnailUrl ? (
                <img src={project.metadata.thumbnailUrl} alt="" style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 6 }} />
            ) : (
                <div style={{ width: 80, height: 45, borderRadius: 6, background: 'var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--sys-text-muted)' }}>play_circle</span>
                </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.metadata?.title || project.videoId}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{project.metadata?.channelTitle} · {new Date(project.createdAt).toLocaleDateString()}</p>
            </div>
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: `${statusColor}20`, color: statusColor, fontWeight: 700 }}>{status}</span>
        </div>
    )
}

// ── Analysis Result View ───────────────────────────────────────────────────
function ProjectDetail({ project }) {
    const { analysis, seo, chapters, brandAlignment, thumbnailDirection, metadata, transcript } = project

    const copyToClipboard = (text) => navigator.clipboard.writeText(text)

    if (project.status === 'processing' || project.status === 'analysing') {
        return (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ width: 48, height: 48, border: '3px solid var(--sys-border)', borderTopColor: 'var(--sys-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: 'var(--sys-text-muted)', fontSize: 14 }}>AI is analysing the video… this takes 30–60 seconds.</p>
            </div>
        )
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
                    <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--sys-text-muted)' }}>{metadata?.channelTitle} · {project.duration}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {analysis?.contentType && <Chip label={analysis.contentType} icon="category" />}
                        {analysis?.tone && <Chip label={analysis.tone} icon="mood" color="#a855f7" />}
                        {analysis?.pacing && <Chip label={`${analysis.pacing} pace`} icon="speed" color="#f59e0b" />}
                        {transcript?.available ? <Chip label="Transcript available" icon="subtitles" color="#22c55e" /> : <Chip label="No transcript" icon="subtitles_off" color="#ef4444" />}
                    </div>
                </div>
            </div>

            {/* Summary */}
            {analysis?.summary && (
                <Section title="Video Summary" icon="summarize">
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--sys-text)' }}>{analysis.summary}</p>
                    {analysis.emotionalArc && (
                        <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--sys-text-muted)', marginBottom: 4 }}>EMOTIONAL ARC</p>
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
                <Section title="Key Highlights" icon="star">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {analysis.highlights.map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)', flexShrink: 0, minWidth: 40 }}>{h.timestamp}</span>
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
                <Section title="AI-Generated Chapters" icon="list_alt">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {chapters.map((c, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 12px', borderRadius: 6, borderBottom: '1px solid var(--sys-border)' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)', minWidth: 40 }}>{c.timestamp}</span>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{c.title}</p>
                                    {c.description && <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{c.description}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Format for YouTube */}
                    <button onClick={() => copyToClipboard(chapters.map(c => `${c.timestamp} ${c.title}`).join('\n'))}
                        style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                        Copy chapters for YouTube description
                    </button>
                </Section>
            )}

            {/* SEO Metadata */}
            {seo && (
                <Section title="SEO — Titles & Description" icon="search">
                    {seo.titles?.length > 0 && (
                        <div style={{ marginBottom: 16 }}>
                            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)' }}>TITLE VARIANTS</p>
                            {seo.titles.map((t, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: seo.recommendedTitle === t.text ? 'var(--sys-primary-dim)' : 'var(--sys-surface)', border: `1px solid ${seo.recommendedTitle === t.text ? 'var(--sys-primary)' : 'var(--sys-border)'}`, marginBottom: 6 }}>
                                    <p style={{ margin: 0, fontSize: 13, flex: 1 }}>{t.text}</p>
                                    <Chip label={t.style} color="#6366f1" />
                                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)' }}>CTR: {t.ctrScore}/10</span>
                                    <button onClick={() => copyToClipboard(t.text)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sys-text-muted)', padding: 4 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {seo.description && (
                        <div>
                            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)' }}>DESCRIPTION</p>
                            <div style={{ background: 'var(--sys-surface)', borderRadius: 8, padding: 12, border: '1px solid var(--sys-border)', position: 'relative' }}>
                                <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6 }}>
                                    {`${seo.description.hook}\n\n${seo.description.body}\n\n${seo.description.cta}\n\n${seo.description.hashtags?.join(' ')}`}
                                </pre>
                                <button onClick={() => copyToClipboard(`${seo.description.hook}\n\n${seo.description.body}\n\n${seo.description.cta}\n\n${seo.description.hashtags?.join(' ')}`)}
                                    style={{ position: 'absolute', top: 8, right: 8, border: 'none', background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>content_copy</span> Copy
                                </button>
                            </div>
                        </div>
                    )}
                    {seo.tags?.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)' }}>TAGS</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {seo.tags.map((t, i) => <Chip key={i} label={t} color="#6b7280" />)}
                            </div>
                        </div>
                    )}
                </Section>
            )}

            {/* Brand Alignment */}
            {brandAlignment && (
                <Section title="Brand Alignment Score" icon="corporate_fare">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: brandAlignment.overallScore >= 8 ? '#22c55e' : brandAlignment.overallScore >= 6 ? '#f59e0b' : '#ef4444' }}>
                            {brandAlignment.overallScore}/10
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{brandAlignment.verdict?.replace('-', ' ').toUpperCase()}</p>
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

            {/* Thumbnail Direction */}
            {thumbnailDirection && (
                <Section title="AI Thumbnail Concept" icon="image">
                    <div style={{ padding: '14px', borderRadius: 10, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', marginBottom: 12 }}>
                        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Creative Brief</p>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--sys-text)', lineHeight: 1.6 }}>{thumbnailDirection.concept}</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div style={{ padding: 10, borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                            <p style={{ margin: '0 0 4px', fontSize: 10, color: 'var(--sys-text-muted)', fontWeight: 700 }}>EMOTION</p>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{thumbnailDirection.emotion}</p>
                        </div>
                        <div style={{ padding: 10, borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                            <p style={{ margin: '0 0 4px', fontSize: 10, color: 'var(--sys-text-muted)', fontWeight: 700 }}>COMPOSITION</p>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{thumbnailDirection.composition}</p>
                        </div>
                        <div style={{ padding: 10, borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: thumbnailDirection.dominantColor, flexShrink: 0, border: '1px solid var(--sys-border)' }} />
                            <div>
                                <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--sys-text-muted)', fontWeight: 700 }}>DOMINANT COLOR</p>
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>{thumbnailDirection.dominantColor}</p>
                            </div>
                        </div>
                    </div>
                    {thumbnailDirection.textOverlay && (
                        <div style={{ padding: '12px 16px', borderRadius: 10, background: thumbnailDirection.dominantColor + '15', border: `1px solid ${thumbnailDirection.dominantColor}40`, textAlign: 'center', marginBottom: 12 }}>
                            {thumbnailDirection.textOverlay.line1 && <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: thumbnailDirection.textOverlay.color || 'white', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{thumbnailDirection.textOverlay.line1}</p>}
                            {thumbnailDirection.textOverlay.line2 && <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: thumbnailDirection.textOverlay.color || 'white', opacity: 0.85 }}>{thumbnailDirection.textOverlay.line2}</p>}
                        </div>
                    )}
                    {thumbnailDirection.imageGenerationPrompt && (
                        <div>
                            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)' }}>FLUX IMAGE PROMPT</p>
                            <div style={{ background: 'var(--sys-surface)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--sys-border)', fontSize: 12, lineHeight: 1.5, color: 'var(--sys-text)', position: 'relative' }}>
                                {thumbnailDirection.imageGenerationPrompt}
                                <button onClick={() => copyToClipboard(thumbnailDirection.imageGenerationPrompt)}
                                    style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                                    Copy
                                </button>
                            </div>
                        </div>
                    )}
                    <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', fontSize: 12, color: '#60a5fa' }}>
                        🎨 Phase 3: One-click FLUX+IP-Adapter thumbnail generation with character consistency is coming soon!
                    </div>
                </Section>
            )}
        </div>
    )
}

// ── Main Page Component ────────────────────────────────────────────────────
export default function YouTubeStudio() {
    const { user } = useAuth()
    const { activeBrand } = useBrand()

    const [tab, setTab] = useState('analyse')
    const [urlInput, setUrlInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [projects, setProjects] = useState([])
    const [activeProject, setActiveProject] = useState(null)
    const [loadingProject, setLoadingProject] = useState(false)
    const pollRef = useRef({})

    // Load recent projects on mount
    useEffect(() => {
        loadProjects()
    }, [])

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

            // Poll if still processing
            if (d.project.status === 'processing' || d.project.status === 'analysing') {
                startPolling(id)
            }
        } catch (e) {
            setError(e.message)
        }
        setLoadingProject(false)
    }

    function startPolling(id) {
        if (pollRef.current[id]) return
        pollRef.current[id] = setInterval(async () => {
            try {
                const d = await api(`/youtube-studio/${id}`)
                const proj = d.project
                setActiveProject(proj)
                // Update in list
                setProjects(prev => prev.map(p => p._id === id ? { ...p, status: proj.status, metadata: proj.metadata } : p))
                if (proj.status === 'done' || proj.status === 'failed') {
                    clearInterval(pollRef.current[id])
                    delete pollRef.current[id]
                }
            } catch { }
        }, 4000)
    }

    useEffect(() => {
        return () => Object.values(pollRef.current).forEach(clearInterval)
    }, [])

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
            setProjects(prev => [...newProjects, ...prev])
            setUrlInput('')

            // Open the first project and poll
            if (newProjects.length === 1) {
                setActiveProject({ _id: newProjects[0]._id, videoId: newProjects[0].videoId, status: 'processing' })
                setTab('result')
                startPolling(newProjects[0]._id)
            } else {
                setTab('history')
                newProjects.forEach(p => startPolling(p._id))
            }

            await loadProjects()
        } catch (e) {
            setError(e.message)
        }
        setLoading(false)
    }

    return (
        <DashboardLayout title="YouTube Studio" subtitle="AI-powered video intelligence, SEO & thumbnails">
            <SEOHead title="YouTube Studio — Mantram AI" noIndex={true} />

            {/* Tab bar */}
            <div className="studio-tab-bar" style={{ marginBottom: 24 }}>
                <div className="studio-tab-row">
                    {[
                        { id: 'analyse', icon: 'link', label: 'Analyse' },
                        { id: 'result', icon: 'analytics', label: 'Result', disabled: !activeProject },
                        { id: 'history', icon: 'history', label: 'History' },
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
                    {/* Hero */}
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #ff0000, #cc0000)', marginBottom: 16 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'white' }}>play_circle</span>
                        </div>
                        <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>YouTube Studio</h1>
                        <p style={{ margin: 0, color: 'var(--sys-text-muted)', fontSize: 14 }}>
                            Paste any YouTube URL to get transcripts, highlights, chapters, SEO metadata and a brand-aligned thumbnail concept — fully AI-generated.
                        </p>
                    </div>

                    {/* URL Input */}
                    <div style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--sys-text-muted)', display: 'block', marginBottom: 8 }}>
                            YouTube URL(s) — one per line, up to 10
                        </label>
                        <textarea
                            value={urlInput}
                            onChange={e => setUrlInput(e.target.value)}
                            placeholder={'https://www.youtube.com/watch?v=...\nhttps://youtu.be/...\nhttps://www.youtube.com/shorts/...'}
                            style={{ width: '100%', minHeight: 110, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />

                        {activeBrand && (
                            <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>
                                🎯 Brand DNA from <strong>{activeBrand.name}</strong> will be injected into all outputs
                            </p>
                        )}

                        {error && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#ef4444' }}>⚠️ {error}</p>}

                        <button
                            onClick={handleAnalyse}
                            disabled={loading || !urlInput.trim()}
                            style={{ width: '100%', marginTop: 14, padding: '13px', borderRadius: 10, border: 'none', background: loading || !urlInput.trim() ? 'var(--sys-border)' : 'linear-gradient(135deg, #ff0000, #cc0000)', color: 'white', fontWeight: 700, fontSize: 14, cursor: loading || !urlInput.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                            {loading ? (
                                <>
                                    <div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                    Starting analysis…
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>
                                    Analyse with AI
                                </>
                            )}
                        </button>
                    </div>

                    {/* What you get */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        {[
                            { icon: 'subtitles', label: 'Full Transcript', desc: 'Timestamped captions' },
                            { icon: 'star', label: 'Key Highlights', desc: 'Top 5–8 moments' },
                            { icon: 'list_alt', label: 'Smart Chapters', desc: 'Auto-detected sections' },
                            { icon: 'search', label: 'SEO Metadata', desc: '5 title variants + description' },
                            { icon: 'corporate_fare', label: 'Brand Alignment', desc: 'Scored against your DNA' },
                            { icon: 'image', label: 'Thumbnail Concept', desc: 'AI creative direction' },
                        ].map(f => (
                            <div key={f.label} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 10, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444', flexShrink: 0, marginTop: 2 }}>{f.icon}</span>
                                <div>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{f.label}</p>
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
                        <ProjectDetail project={activeProject} />
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
                            No analyses yet. Paste a URL to get started.
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

import { useState, useEffect, useRef, useCallback } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import YouTubeStudioSettings from './YouTubeStudioSettings'

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
    transcript:          { label: 'Transcript & Metadata',        icon: 'subtitles' },
    analysis:            { label: 'AI Video Intelligence',        icon: 'psychology' },
    frames:              { label: 'Frame Extraction',             icon: 'movie' },
    chapters:            { label: 'Smart Chapters (AI-Grounded)', icon: 'list_alt' },
    seo:                 { label: 'SEO Copywriting (Grok)',       icon: 'search' },
    brand:               { label: 'Brand Alignment Score',        icon: 'corporate_fare' },
    promo:               { label: 'Promo Cut Suggestions',        icon: 'cut' },
    thumbnailDirection:  { label: 'Thumbnail Concept (MCoT)',     icon: 'brush' },
    characters:          { label: 'Character Portraits',          icon: 'face' },
    thumbnailGeneration: { label: 'AI Thumbnail (GPT Image 2)',   icon: 'image' },
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
            try {
                const evt = JSON.parse(e.data)
                if (evt.type === 'node') {
                    setNodes(prev => ({ ...prev, [evt.node]: { status: evt.status, message: evt.message } }))
                } else if (evt.type === 'done') {
                    setDone(true)
                    es.close()
                    setTimeout(() => onComplete?.(), 1500)
                } else if (evt.type === 'error') {
                    setDone(true)
                    es.close()
                    onComplete?.()
                }
                // ignore type: 'connected' and keepalive pings
            } catch { /* ignore malformed SSE frames */ }
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

// ── Template Quick-Access Panel ───────────────────────────────────────────────
// Shown below Channel Setup — compact grid of templates with select/seed/settings links.

function TemplateQuickAccess({ activeTemplate, onSelect, brandId }) {
    const [templates, setTemplates] = useState([])
    const [loading, setLoading]     = useState(true)
    const [seeding, setSeeding]     = useState(false)

    const reload = async () => {
        setLoading(true)
        try {
            const d = await api('/yt-studio-settings/templates')
            setTemplates(d.templates || [])
        } catch {}
        setLoading(false)
    }

    useEffect(() => { reload() }, [])

    async function seedStarters() {
        setSeeding(true)
        try {
            await api('/yt-studio-settings/templates/seed-starters', { method: 'POST' })
            await reload()
        } catch (e) { alert('Seed failed: ' + e.message) }
        setSeeding(false)
    }

    const hasStarters = templates.some(t => t.isStarter)

    return (
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--sys-border)' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--sys-primary)' }}>collections</span>
                <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Thumbnail Templates</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>
                        {templates.length > 0 ? `${templates.length} template${templates.length !== 1 ? 's' : ''} — click to set active for thumbnail generation` : 'No templates yet — load starters or go to Settings'}
                    </p>
                </div>
                {!hasStarters && (
                    <button onClick={seedStarters} disabled={seeding}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 9, background: '#6366f115', color: '#6366f1', fontWeight: 700, fontSize: 11, border: '1px solid #6366f133', cursor: seeding ? 'wait' : 'pointer', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_awesome</span>
                        {seeding ? 'Loading…' : 'Load Starters'}
                    </button>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[1,2,3,4].map(i => (
                        <div key={i} style={{ width: 120, height: 68, borderRadius: 10, background: 'var(--sys-border)', opacity: 0.5, animation: 'pulse 1.5s ease-in-out infinite' }} />
                    ))}
                </div>
            ) : templates.length === 0 ? (
                <div style={{ padding: '28px 20px', textAlign: 'center', border: '2px dashed var(--sys-border)', borderRadius: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--sys-text-muted)', display: 'block', marginBottom: 8 }}>collections</span>
                    <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>No templates configured</p>
                    <button onClick={seedStarters} disabled={seeding}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, background: '#6366f1', color: 'white', fontWeight: 700, fontSize: 12, border: 'none', cursor: seeding ? 'wait' : 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
                        {seeding ? 'Loading…' : 'Load 10 Starter Templates'}
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                    {templates.slice(0, 12).map(t => {
                        const isActive = activeTemplate?._id === t._id
                        return (
                            <button key={t._id} onClick={() => onSelect?.(isActive ? null : t)}
                                style={{
                                    padding: '10px 10px 8px',
                                    borderRadius: 10,
                                    border: `2px solid ${isActive ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                                    background: isActive ? 'var(--sys-primary)08' : 'var(--sys-surface)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    position: 'relative',
                                    transition: 'all .15s',
                                }}>
                                {/* Color swatch bar */}
                                <div style={{ height: 6, borderRadius: 4, background: t.visual?.primaryColor || '#888', marginBottom: 8 }} />
                                {/* Name */}
                                <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: isActive ? 18 : 0 }}>{t.name}</p>
                                <p style={{ margin: 0, fontSize: 9, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.classification?.theme || 'General'}</p>
                                {/* Active check */}
                                {isActive && (
                                    <span className="material-symbols-outlined" style={{ position: 'absolute', top: 6, right: 6, fontSize: 14, color: 'var(--sys-primary)' }}>check_circle</span>
                                )}
                                {/* Starter badge */}
                                {t.isStarter && (
                                    <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 8, padding: '1px 5px', borderRadius: 8, background: '#6366f120', color: '#6366f1', fontWeight: 800 }}>STARTER</span>
                                )}
                            </button>
                        )
                    })}
                    {templates.length > 12 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', borderRadius: 10, border: '2px dashed var(--sys-border)', fontSize: 11, color: 'var(--sys-text-muted)', fontWeight: 600 }}>
                            +{templates.length - 12} more in Settings
                        </div>
                    )}
                </div>
            )}

            {/* Active indicator */}
            {activeTemplate && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#22c55e10', border: '1px solid #22c55e30' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#22c55e' }}>check_circle</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', flex: 1 }}>Active: {activeTemplate.name}</span>
                    <button onClick={() => onSelect?.(null)} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid #ef444433', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}>Clear</button>
                </div>
            )}

            <style>{`@keyframes pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 0.8; } }`}</style>
        </div>
    )
}

// ── Show Template Picker ──────────────────────────────────────────────────────
// Used in ProjectDetail to select which show's template to apply for thumbnail regen.

function ShowTemplatePicker({ channelShows, templates, selectedShowId, selectedTemplateId, onShowSelect, onTemplateSelect }) {
    const [showOther, setShowOther] = useState(false)

    // Get template details for a show
    const getShowTemplate = (show) => templates.find(t => t._id === (show.templateId?._id || show.templateId))

    const hasShows = channelShows.length > 0

    return (
        <div style={{ background: 'var(--sys-surface)', borderRadius: 10, border: '1px solid var(--sys-border)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sys-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-primary)' }}>palette</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Thumbnail Style</span>
                {(selectedShowId || selectedTemplateId) && (
                    <button onClick={() => { onShowSelect(''); onTemplateSelect('') }}
                        style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', cursor: 'pointer' }}>
                        Clear
                    </button>
                )}
            </div>

            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Shows */}
                {hasShows && (
                    <div>
                        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shows on this Channel</p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {channelShows.map(show => {
                                const tpl = getShowTemplate(show)
                                const isActive = selectedShowId === show.showId
                                return (
                                    <button key={show.showId} onClick={() => onShowSelect(isActive ? '' : show.showId)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${isActive ? 'var(--sys-primary)' : 'var(--sys-border)'}`, background: isActive ? 'var(--sys-primary)' : 'var(--sys-bg)', color: isActive ? 'white' : 'var(--sys-text)', transition: 'all .15s' }}>
                                        {/* Template color dot */}
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: tpl?.visual?.primaryColor || '#888', flexShrink: 0 }} />
                                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{show.showIcon || 'live_tv'}</span>
                                        {show.showName}
                                        {tpl && <span style={{ fontSize: 9, opacity: 0.8 }}>· {tpl.name}</span>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Other templates toggle */}
                <div>
                    <button onClick={() => setShowOther(p => !p)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--sys-text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{showOther ? 'expand_less' : 'expand_more'}</span>
                        {hasShows ? 'Other Templates' : 'Select Template'}
                        {selectedTemplateId && !selectedShowId && (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--sys-primary)', color: 'white', fontWeight: 700 }}>Active</span>
                        )}
                    </button>
                    {(showOther || !hasShows) && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => onTemplateSelect('')}
                                style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: `1.5px solid ${!selectedTemplateId && !selectedShowId ? 'var(--sys-primary)' : 'var(--sys-border)'}`, background: !selectedTemplateId && !selectedShowId ? 'var(--sys-primary)' : 'var(--sys-bg)', color: !selectedTemplateId && !selectedShowId ? 'white' : 'var(--sys-text)', cursor: 'pointer' }}>
                                Default Style
                            </button>
                            {templates.map(t => {
                                const isActive = selectedTemplateId === t._id && !selectedShowId
                                return (
                                    <button key={t._id} onClick={() => onTemplateSelect(isActive ? '' : t._id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${isActive ? 'var(--sys-primary)' : 'var(--sys-border)'}`, background: isActive ? 'var(--sys-primary)' : 'var(--sys-bg)', color: isActive ? 'white' : 'var(--sys-text)', transition: 'all .15s' }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.visual?.primaryColor || '#888', flexShrink: 0 }} />
                                        {t.name}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Active selection summary */}
                {(selectedShowId || selectedTemplateId) && (
                    <div style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--sys-primary)10', border: '1px solid var(--sys-primary)30', fontSize: 11, color: 'var(--sys-primary)', fontWeight: 600 }}>
                        ✓ {selectedShowId
                            ? `Show: ${channelShows.find(s => s.showId === selectedShowId)?.showName || selectedShowId} — theme applied on generation`
                            : `Template: ${templates.find(t => t._id === selectedTemplateId)?.name || selectedTemplateId}`}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Project Detail View ───────────────────────────────────────────────────────

function ProjectDetail({ project, onRefresh }) {
    const { analysis, seo, chapters, brandAlignment, thumbnailDirection, metadata, transcript,
        generatedThumbnailUrl, characterPortraits, promoCuts, extractedFrames } = project

    const [templates, setTemplates] = useState([])
    const [selectedTemplateId, setSelectedTemplateId] = useState(project.appliedTemplateId || '')

    useEffect(() => {
        api('/yt-studio-settings/templates')
            .then(d => { if (d.templates) setTemplates(d.templates) })
            .catch(err => console.error('Template load failed:', err))
    }, [])

    const [genLoading, setGenLoading]         = useState(false)
    const [portraitLoading, setPortraitLoading] = useState(false)
    const [localThumb, setLocalThumb]         = useState(generatedThumbnailUrl)
    const [localPortraits, setLocalPortraits] = useState(characterPortraits || [])
    const [selectedShowId, setSelectedShowId] = useState(project.showId || '')
    const [channelShows, setChannelShows]     = useState([])

    // Editable text overlay state
    const [editLine1, setEditLine1] = useState(thumbnailDirection?.textOverlay?.line1 || '')
    const [editLine2, setEditLine2] = useState(thumbnailDirection?.textOverlay?.line2 || '')

    // Load channel's shows list so we can display them in the Show Template Picker
    useEffect(() => {
        if (project.channelConfigId) {
            api('/yt-studio-settings/channel-configs')
                .then(d => {
                    const ch = (d.channels || []).find(c => c._id === project.channelConfigId)
                    setChannelShows(ch?.shows || [])
                })
                .catch(() => {})
        }
    }, [project.channelConfigId])

    // Title management
    const originalTitle = metadata?.title || project.videoId
    const [titleMode, setTitleMode]       = useState(project.titleMode || 'auto')
    const [editTitle, setEditTitle]       = useState(project.approvedTitle || project.seo?.recommendedTitle || originalTitle)
    const [titleSaving, setTitleSaving]   = useState(false)
    const [titleSaved, setTitleSaved]     = useState(false)
    const [titleEditing, setTitleEditing] = useState(false)

    const finalTitle = titleMode === 'auto'
        ? originalTitle
        : (project.approvedTitle || editTitle)

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
            const body = { customTextOverlay: { line1: editLine1, line2: editLine2 } }
            // Prefer showId resolution (lets backend pick show's template)
            if (selectedShowId) body.showId = selectedShowId
            else if (selectedTemplateId) body.templateId = selectedTemplateId
            const d = await api(`/youtube-studio/${project._id}/thumbnail`, {
                method: 'POST',
                body: JSON.stringify(body)
            })
            if (d.generatedThumbnailUrl) setLocalThumb(d.generatedThumbnailUrl)
            else alert('Thumbnail generation returned undefined URL. Provider error.')
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

    async function saveTitleMode(mode, customTitle) {
        setTitleSaving(true)
        try {
            await api(`/youtube-studio/${project._id}/title`, {
                method: 'PATCH',
                body: JSON.stringify({ titleMode: mode, approvedTitle: customTitle }),
            })
            setTitleMode(mode)
            setTitleSaved(true)
            setTitleEditing(false)
            setTimeout(() => setTitleSaved(false), 2500)
        } catch (e) { alert('Failed to save title: ' + e.message) }
        setTitleSaving(false)
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

            {/* ── Title Management Section ── */}
            <Section title="Video Title" icon="title" badge={titleSaved ? '✓ Saved' : (titleMode === 'auto' ? 'Auto' : 'Manual')}>
                {/* Mode toggle */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <button onClick={() => saveTitleMode('auto', null)} disabled={titleSaving}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '2px solid', cursor: 'pointer', transition: 'all .2s',
                            borderColor: titleMode === 'auto' ? 'var(--sys-primary)' : 'var(--sys-border)',
                            background: titleMode === 'auto' ? 'var(--sys-primary)' : 'var(--sys-surface)',
                            color: titleMode === 'auto' ? 'white' : 'var(--sys-text)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>auto_awesome</span>
                        Auto (Original YT Title)
                    </button>
                    <button onClick={() => { setTitleMode('manual'); setTitleEditing(true) }} disabled={titleSaving}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '2px solid', cursor: 'pointer', transition: 'all .2s',
                            borderColor: titleMode === 'manual' ? '#f59e0b' : 'var(--sys-border)',
                            background: titleMode === 'manual' ? '#f59e0b' : 'var(--sys-surface)',
                            color: titleMode === 'manual' ? 'white' : 'var(--sys-text)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4 }}>edit</span>
                        Manual (Custom Title)
                    </button>
                </div>

                {/* Current final title display */}
                <div style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--sys-surface)', border: `2px solid ${titleMode === 'auto' ? '#22c55e' : '#f59e0b'}`, marginBottom: 12 }}>
                    <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: titleMode === 'auto' ? '#22c55e' : '#f59e0b', textTransform: 'uppercase' }}>
                        {titleMode === 'auto' ? '🔒 Final Title (Auto — Original YouTube)' : '✏️ Final Title (Manual)'}
                    </p>
                    {titleEditing && titleMode === 'manual' ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 14, fontWeight: 600 }}
                                placeholder="Enter your custom title..." maxLength={100}
                            />
                            <button onClick={() => saveTitleMode('manual', editTitle)} disabled={titleSaving || !editTitle.trim()}
                                style={{ padding: '8px 16px', borderRadius: 8, background: '#f59e0b', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                                {titleSaving ? '...' : '✓ Approve'}
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1 }}>{finalTitle}</p>
                            {titleMode === 'manual' && (
                                <button onClick={() => setTitleEditing(true)}
                                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 6, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', cursor: 'pointer', color: 'var(--sys-text)' }}>
                                    Edit
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* AI Suggested Titles from SEO node */}
                {seo?.titles?.length > 0 && titleMode === 'manual' && (
                    <div>
                        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)' }}>AI SUGGESTED TITLES (click to use)</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {seo.titles.map((t, i) => (
                                <button key={i} onClick={() => { setEditTitle(t.text); saveTitleMode('manual', t.text) }}
                                    style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontWeight: 600 }}>{t.text}</span>
                                    <span style={{ color: '#22c55e', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>CTR {t.ctrScore}/10</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Section>

            {/* ── Peak Moment Card ── */}
            {analysis?.peakMoment && (
                <Section title="Peak Moment" icon="local_fire_department" badge="🔥 Thumbnail Based On This">
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        <div style={{ width: 48, height: 48, borderRadius: 10, background: 'linear-gradient(135deg, #ef4444, #f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'white' }}>whatshot</span>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', padding: '2px 8px', borderRadius: 20, background: '#ef444420' }}>{analysis.peakMoment.timestamp}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', padding: '2px 8px', borderRadius: 20, background: '#f59e0b20' }}>{analysis.peakMoment.emotion}</span>
                            </div>
                            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14 }}>{analysis.peakMoment.title}</p>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--sys-text-muted)', lineHeight: 1.6 }}>{analysis.peakMoment.sceneDescription}</p>
                        </div>
                    </div>
                </Section>
            )}

            <Section title="AI Thumbnail" icon="image" badge={localThumb ? '✓' : undefined}>
                {/* Always show the original YouTube thumbnail */}
                {metadata?.thumbnailUrl && (
                    <div style={{ marginBottom: 14 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Original YouTube Thumbnail
                        </p>
                        <img src={metadata.thumbnailUrl} alt="Original thumbnail"
                            style={{ width: '100%', maxWidth: 640, height: 'auto', borderRadius: 8, border: '1px solid var(--sys-border)', display: 'block' }}
                            onError={e => e.target.style.display = 'none'}
                        />
                    </div>
                )}

                {/* AI Background */}
                {localThumb ? (
                    <div>
                        <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--sys-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            AI Thumbnail (NanoBanana 2) — lead characters + title from video
                        </p>
                        <img src={localThumb} alt="AI thumbnail"
                            style={{ width: '100%', maxWidth: 640, height: 'auto', borderRadius: 8, border: '2px solid var(--sys-primary)', display: 'block', marginBottom: 12 }} />

                        {/* Editable Text Overlay */}
                        {thumbnailDirection?.textOverlay?.line1 && (
                            <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)' }}>MCoT EXTRACTED TEXT (Editable for AI Overlay)</p>
                                    {thumbnailDirection.dominantColor && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 14, height: 14, borderRadius: 4, background: thumbnailDirection.dominantColor, border: '1px solid var(--sys-border)' }} />
                                            <span style={{ fontSize: 10, color: 'var(--sys-text-muted)' }}>{thumbnailDirection.dominantColor}</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <input 
                                        value={editLine1} 
                                        onChange={e => setEditLine1(e.target.value)} 
                                        placeholder="Line 1 (e.g. Episode Title)" 
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 14, fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} 
                                    />
                                    {thumbnailDirection.textOverlay.line2 && (
                                        <input 
                                            value={editLine2} 
                                            onChange={e => setEditLine2(e.target.value)} 
                                            placeholder="Line 2 (Optional)" 
                                            style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 12, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }} 
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                            <ShowTemplatePicker
                                channelShows={channelShows}
                                templates={templates}
                                selectedShowId={selectedShowId}
                                selectedTemplateId={selectedTemplateId}
                                onShowSelect={sid => { setSelectedShowId(sid); setSelectedTemplateId('') }}
                                onTemplateSelect={tid => { setSelectedTemplateId(tid); setSelectedShowId('') }}
                            />

                            <div style={{ display: 'flex', gap: 8 }}>
                                <a href={localThumb} download="ai-thumbnail.jpg" target="_blank" rel="noreferrer"
                                    style={{ flex: 1, padding: '10px', borderRadius: 8, background: 'var(--sys-primary)', color: 'white', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', textAlign: 'center', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Download Thumbnail
                                </a>
                                <button onClick={regenerateThumbnail} disabled={genLoading}
                                    style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--sys-surface)', color: 'var(--sys-text)', fontSize: 13, fontWeight: 600, border: '1px solid var(--sys-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {genLoading ? <div style={{ width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} /> : <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>}
                                    Regenerate
                                </button>
                            </div>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>
                            💡 Generated using the original thumbnail as reference — characters are preserved from the real video
                        </p>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                        {thumbnailDirection && (
                            <div style={{ padding: 14, borderRadius: 10, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', marginBottom: 16, textAlign: 'left' }}>
                                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)' }}>CREATIVE BRIEF</p>
                                <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.6 }}>{thumbnailDirection.concept}</p>
                                {thumbnailDirection.textOverlay?.line1 && (
                                    <div style={{ padding: '10px 16px', borderRadius: 8, background: (thumbnailDirection.dominantColor || '#3b82f6') + '20', border: `1px solid ${(thumbnailDirection.dominantColor || '#3b82f6')}40`, textAlign: 'center' }}>
                                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)', marginBottom: 4 }}>TEXT OVERLAY SUGGESTION</p>
                                        <p style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>{thumbnailDirection.textOverlay.line1}</p>
                                        {thumbnailDirection.textOverlay.line2 && <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, opacity: 0.85 }}>{thumbnailDirection.textOverlay.line2}</p>}
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <ShowTemplatePicker
                                channelShows={channelShows}
                                templates={templates}
                                selectedShowId={selectedShowId}
                                selectedTemplateId={selectedTemplateId}
                                onShowSelect={sid => { setSelectedShowId(sid); setSelectedTemplateId('') }}
                                onTemplateSelect={tid => { setSelectedTemplateId(tid); setSelectedShowId('') }}
                            />
                            <button onClick={regenerateThumbnail} disabled={genLoading}
                                style={{ padding: '12px 28px', borderRadius: 10, background: genLoading ? 'var(--sys-border)' : 'linear-gradient(135deg, #ff0000, #cc0000)', color: 'white', fontWeight: 700, fontSize: 14, border: 'none', cursor: genLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                {genLoading
                                    ? <><div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Generating…</>
                                    : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span>Generate AI Thumbnail</>
                                }
                            </button>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>
                            Uses real video characters + title · GPT Image 2 HD (Gemini fallback) · ~10-15s
                        </p>
                    </div>
                )}
            </Section>

            {/* ── Extracted Video Frames (visual grounding) ── */}
            {extractedFrames?.length > 0 && (
                <Section title="Extracted Video Frames" icon="movie" defaultOpen={true}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--sys-text-muted)' }}>
                        These real frames from your video were used as visual grounding for thumbnail generation
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                        {extractedFrames.map((frame, i) => (
                            <div key={i} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sys-border)', position: 'relative' }}>
                                <img src={frame.url} alt={frame.label}
                                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
                                    onError={e => { e.target.style.display = 'none' }} />
                                <div style={{ padding: '6px 8px', background: 'var(--sys-surface)' }}>
                                    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'var(--sys-text-muted)' }}>{frame.label}</p>
                                    {frame.sizeKb && <p style={{ margin: 0, fontSize: 10, color: 'var(--sys-text-muted)' }}>{frame.sizeKb}KB</p>}
                                </div>
                                <a href={frame.url} target="_blank" rel="noreferrer"
                                    style={{ position: 'absolute', top: 6, right: 6, padding: '3px', borderRadius: 6, background: '#00000066', color: 'white', display: 'flex', alignItems: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                                </a>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Phase 2: Character Portraits ── */}
            {(analysis?.characters?.length > 0 || localPortraits.length > 0) && (
                <Section title="Characters" icon="face" badge={analysis?.characters?.length}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                        {analysis?.characters?.map((char, i) => {
                            const portrait = localPortraits.find(p => p.label === char.label)
                            return (
                                <div key={i} style={{ display: 'flex', gap: 14, padding: 12, borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', alignItems: 'flex-start' }}>
                                    {/* Portrait */}
                                    {portrait?.portraitUrl ? (
                                        <img src={portrait.portraitUrl} alt={char.label}
                                            style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '2px solid var(--sys-primary)', flexShrink: 0 }} />
                                    ) : (
                                        <div style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--sys-border)', flexShrink: 0 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--sys-text-muted)' }}>person</span>
                                        </div>
                                    )}
                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                                            <div>
                                                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700 }}>{char.label}</p>
                                                <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>{char.role} · First appears {char.firstAppearance}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                {char.screenTimePct && <Chip label={`${char.screenTimePct}% screen time`} color="#6366f1" />}
                                                {char.position && <Chip label={char.position.replace(/-/g, ' ')} color="#8b5cf6" />}
                                            </div>
                                        </div>
                                        {char.visualDescription && (
                                            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                                                👁 {char.visualDescription}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>
                            💡 Portraits use the original thumbnail as visual reference — Gemini generates based on character appearance
                        </p>
                        <button onClick={generatePortraits} disabled={portraitLoading}
                            style={{ padding: '8px 18px', borderRadius: 8, background: portraitLoading ? 'var(--sys-border)' : 'var(--sys-primary-dim)', color: 'var(--sys-primary)', fontWeight: 600, fontSize: 12, border: 'none', cursor: portraitLoading ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {portraitLoading
                                ? <><div style={{ width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />Generating portraits…</>
                                : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>{localPortraits.length ? 'Regenerate' : 'Generate'} AI Portraits</>
                            }
                        </button>
                    </div>
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

            {/* Promo Cuts */}
            {promoCuts?.length > 0 && (
                <Section title="Promo Cut Suggestions" icon="cut" badge={promoCuts.length}>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--sys-text-muted)' }}>
                        AI-suggested clips for Reels, Shorts, or teasers — ready for your editor
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {promoCuts.map((cut, i) => {
                            // hookStrength: 1–10 score from promoNode
                            const strength = typeof cut.hookStrength === 'number' ? Math.min(10, Math.max(0, cut.hookStrength)) : null;
                            const strengthColor = strength >= 8 ? '#22c55e' : strength >= 5 ? '#f59e0b' : '#ef4444';
                            const strengthLabel = strength >= 8 ? 'High' : strength >= 5 ? 'Med' : 'Low';
                            return (
                                <div key={i} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--sys-surface)', border: `1px solid ${strength >= 8 ? '#22c55e22' : 'var(--sys-border)'}`, position: 'relative', overflow: 'hidden' }}>
                                    {/* hookStrength accent bar — top edge */}
                                    {strength !== null && (
                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--sys-border)' }}>
                                            <div style={{ height: '100%', width: `${strength * 10}%`, background: strengthColor, transition: 'width .4s ease', borderRadius: '3px 3px 0 0' }} />
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: 'var(--sys-primary)', color: 'white' }}>Cut {cut.order || i + 1}</span>
                                        <a href={`${project.videoUrl}&t=${cut.startTime?.replace(':', 'm')}s`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)', textDecoration: 'none' }}>{cut.startTime} → {cut.endTime}</a>
                                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'var(--sys-border)', color: 'var(--sys-text-muted)', fontWeight: 600 }}>{cut.durationSecs}s</span>
                                        {cut.emotion && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#a855f715', color: '#a855f7', fontWeight: 600 }}>{cut.emotion}</span>}
                                        {cut.platform && cut.platform !== 'all' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#22c55e15', color: '#22c55e', fontWeight: 600 }}>{cut.platform}</span>}
                                        {/* hookStrength badge */}
                                        {strength !== null && (
                                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: strengthColor }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                                                Hook {strengthLabel} {strength}/10
                                            </span>
                                        )}
                                    </div>
                                    {/* hookStrength mini bar */}
                                    {strength !== null && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                            <span style={{ fontSize: 10, color: 'var(--sys-text-muted)', fontWeight: 600, width: 64, flexShrink: 0 }}>Hook Strength</span>
                                            <div style={{ flex: 1, height: 5, borderRadius: 4, background: 'var(--sys-border)', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${strength * 10}%`, background: `linear-gradient(90deg, ${strengthColor}99, ${strengthColor})`, transition: 'width .4s ease' }} />
                                            </div>
                                            <span style={{ fontSize: 10, fontWeight: 800, color: strengthColor, minWidth: 16, textAlign: 'right' }}>{strength}</span>
                                        </div>
                                    )}
                                    {cut.hookLine && <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, fontStyle: 'italic' }}>"{ cut.hookLine}"</p>}
                                    {cut.reason && <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>{cut.reason}</p>}
                                    {cut.socialCaption && (
                                        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                            <span style={{ flex: 1, fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.5 }}>{cut.socialCaption.substring(0, 160)}</span>
                                            <button onClick={() => copyText(cut.socialCaption)} style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>content_copy</span>Caption
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <button onClick={() => copyText(promoCuts.map((c, i) => `Cut ${i + 1}: ${c.startTime}–${c.endTime} (${c.durationSecs}s)\n"${c.hookLine}"\n${c.reason}`).join('\n\n'))}
                        style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span> Copy Full Promo Brief
                    </button>
                </Section>
            )}


            {/* Chapters — with screenshotTimestamp frame previews */}
            {chapters?.length > 0 && (() => {
                // Extract YouTube video ID from URL for frame thumbnails
                const ytId = project.videoId || project.videoUrl?.match(/[?&]v=([^&]+)/)?.[1] || '';
                return (
                    <Section title="AI Chapters" icon="list_alt" badge={chapters.length}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                            {chapters.map((c, i) => {
                                // screenshotTimestamp: seconds integer for YouTube CDN frame URL
                                // Falls back to parsing c.timestamp ("MM:SS" or "HH:MM:SS")
                                let frameSeek = c.screenshotTimestamp || null;
                                if (!frameSeek && c.timestamp) {
                                    const parts = c.timestamp.split(':').map(Number);
                                    frameSeek = parts.length === 3
                                        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                                        : parts[0] * 60 + (parts[1] || 0);
                                }
                                // YouTube CDN thumbnail for specific second — no API key needed
                                // Note: YouTube only serves auto-generated keyframes (~every 3s)
                                // so the actual frame shown may be ±a few seconds off
                                const frameUrl = (ytId && frameSeek != null)
                                    ? `https://img.youtube.com/vi_webp/${ytId}/${Math.max(1, Math.floor(frameSeek))}.webp`
                                    : null;

                                return (
                                    <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', alignItems: 'flex-start' }}>
                                        {/* Frame thumbnail */}
                                        <a href={`${project.videoUrl}&t=${c.timestamp?.replace(':', 'm')}s`} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                                            {frameUrl ? (
                                                <img
                                                    src={frameUrl}
                                                    alt={`Frame at ${c.timestamp}`}
                                                    style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--sys-border)', display: 'block', background: 'var(--sys-border)' }}
                                                    onError={e => { e.target.style.display = 'none' }}
                                                />
                                            ) : (
                                                <div style={{ width: 80, height: 45, borderRadius: 6, background: 'var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sys-text-muted)', opacity: 0.4 }}>movie</span>
                                                </div>
                                            )}
                                        </a>
                                        {/* Chapter info */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                                <a href={`${project.videoUrl}&t=${c.timestamp?.replace(':', 'm')}s`}
                                                    target="_blank" rel="noreferrer"
                                                    style={{ fontSize: 12, fontWeight: 800, color: 'var(--sys-primary)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{c.timestamp}</a>
                                                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
                                            </div>
                                            {c.description && <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.4 }}>{c.description}</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => copyText(chapters.map(c => `${c.timestamp} ${c.title}`).join('\n'))}
                            style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--sys-primary-dim)', color: 'var(--sys-primary)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>content_copy</span> Copy chapters for YouTube
                        </button>
                    </Section>
                );
            })()}

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
    const [activeTemplate, setActiveTemplate] = useState(null)
    const [channels, setChannels] = useState([])
    const [selectedChannelId, setSelectedChannelId] = useState('')
    const [selectedShowId, setSelectedShowId] = useState('')  // for analyse tab
    const pollRef = useRef({})

    // Derived: shows for the currently selected channel
    const selectedChannelShows = channels.find(c => c._id === selectedChannelId)?.shows || []

    useEffect(() => { loadProjects(); loadChannels() }, [])

    async function loadChannels() {
        try {
            const d = await api('/yt-studio-settings/channel-configs')
            const ch = d.channels || []
            setChannels(ch)
            const def = ch.find(c => c.isDefault) || ch[0]
            if (def) setSelectedChannelId(def._id)
        } catch {}
    }

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
        const poll = async () => {
            attempts++
            if (attempts > 45) { delete pollRef.current[id]; return }
            try {
                const d = await api(`/youtube-studio/${id}`)
                const proj = d.project
                setActiveProject(proj)
                setProjects(prev => prev.map(p => p._id === id ? { ...p, status: proj.status, metadata: proj.metadata, generatedThumbnailUrl: proj.generatedThumbnailUrl } : p))
                if (proj.status === 'done' || proj.status === 'failed') {
                    delete pollRef.current[id]
                    return
                }
            } catch { }
            pollRef.current[id] = setTimeout(poll, 4000)
        }
        pollRef.current[id] = setTimeout(poll, 4000)
    }

    useEffect(() => () => Object.values(pollRef.current).forEach(clearTimeout), [])

    async function handleAnalyse() {
        const rawUrls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
        if (!rawUrls.length) return setError('Enter at least one YouTube URL')
        if (rawUrls.length > 10) return setError('Maximum 10 URLs at a time')

        setLoading(true)
        setError(null)
        try {
            const d = await api('/youtube-studio/analyse', {
                method: 'POST',
                body: JSON.stringify({
                    urls: rawUrls,
                    brandId: activeBrand?._id,
                    channelConfigId: selectedChannelId,
                    showId: selectedShowId || null,
                }),
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
                        { id: 'analyse',  icon: 'link',       label: 'Analyse' },
                        { id: 'result',   icon: 'analytics',  label: 'Result',            disabled: !activeProject },
                        { id: 'history',  icon: 'history',    label: `History (${projects.length})` },
                        { id: 'channels', icon: 'tv',         label: 'Channel Setup',     badge: channels.length === 0 ? '!' : null },
                        { id: 'settings', icon: 'tune',       label: 'Settings' },
                    ].map(t => (
                        <button key={t.id} disabled={t.disabled} onClick={() => setTab(t.id)}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 cursor-pointer ${tab === t.id ? 'studio-nav-pill text-[var(--sys-text)] font-bold' : 'studio-nav-tab-inactive'} ${t.disabled ? 'opacity-40 pointer-events-none' : ''}`}>
                            <span className={`material-symbols-outlined ${tab === t.id ? 'text-lg' : 'text-base opacity-70'}`}>{t.icon}</span>
                            {t.label}
                            {t.id === 'channels' && channels.length === 0 && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#f59e0b', color: 'white', fontWeight: 700, marginLeft: 2 }}>Setup</span>
                            )}
                            {t.id === 'settings' && activeTemplate && (
                                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: '#22c55e', color: 'white', fontWeight: 700, marginLeft: 2 }}>Template Active</span>
                            )}
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
                            Paste any YouTube URL. The AI watches the video, extracts transcripts, writes SEO copy, generates thumbnails with GPT Image 2, and suggests promo cuts — all brand-aligned.
                        </p>
                    </div>

                    {/* ── Channel Onboarding Banner (shown when no channels configured) ── */}
                    {channels.length === 0 && (
                        <div style={{ marginBottom: 20, padding: '20px 24px', borderRadius: 16, background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', border: '1px solid #e94560', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: '50%', background: '#e9456015', pointerEvents: 'none' }} />
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: '#e9456020', border: '1px solid #e9456040', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#e94560' }}>tv</span>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'white' }}>Set up your channel first</p>
                                    <p style={{ margin: '0 0 16px', fontSize: 12, color: '#ffffff88', lineHeight: 1.5 }}>
                                        Add your YouTube channel to unlock brand-aligned thumbnails, show templates, and accurate SEO copy in your channel's language.
                                    </p>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {[
                                            { step: '1', label: 'Add your channel', icon: 'add_circle' },
                                            { step: '2', label: 'Configure shows & templates', icon: 'palette' },
                                            { step: '3', label: 'Analyse any video', icon: 'auto_awesome' },
                                        ].map(s => (
                                            <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#e94560', color: 'white', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.step}</span>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#e9456099' }}>{s.icon}</span>
                                                <span style={{ fontSize: 12, color: '#ffffffaa' }}>{s.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setTab('channels')}
                                        style={{ marginTop: 16, padding: '9px 20px', borderRadius: 10, border: 'none', background: '#e94560', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                                        Set Up My Channel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ background: 'var(--sys-surface)', border: '1px solid var(--sys-border)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
                        {channels.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                                {/* Channel selector */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: selectedChannelShows.length ? 10 : 0, padding: '10px 14px', background: 'var(--sys-primary)08', borderRadius: 10, border: '1px solid var(--sys-primary)22' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sys-primary)' }}>tv</span>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-primary)' }}>Channel:</span>
                                    <select value={selectedChannelId} onChange={e => { setSelectedChannelId(e.target.value); setSelectedShowId('') }}
                                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                        {channels.map(c => (
                                            <option key={c._id} value={c._id}>{c.channelName} {c.isDefault ? '(Default)' : ''}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Show selector — only if this channel has shows */}
                                {selectedChannelShows.length > 0 && (
                                    <div style={{ padding: '10px 14px', background: 'var(--sys-surface)', borderRadius: 10, border: '1px solid var(--sys-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--sys-text-muted)' }}>live_tv</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Show (optional)</span>
                                            {selectedShowId && (
                                                <button onClick={() => setSelectedShowId('')}
                                                    style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 7px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text-muted)', cursor: 'pointer' }}>
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            {selectedChannelShows.map(show => {
                                                const isActive = selectedShowId === show.showId
                                                return (
                                                    <button key={show.showId} onClick={() => setSelectedShowId(isActive ? '' : show.showId)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `2px solid ${isActive ? 'var(--sys-primary)' : 'var(--sys-border)'}`, background: isActive ? 'var(--sys-primary)' : 'var(--sys-bg)', color: isActive ? 'white' : 'var(--sys-text)', transition: 'all .15s' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{show.showIcon || 'live_tv'}</span>
                                                        {show.showName}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                        {selectedShowId && (
                                            <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--sys-primary)', fontWeight: 600 }}>
                                                ✓ Thumbnail will use the <strong>{selectedChannelShows.find(s => s.showId === selectedShowId)?.showName}</strong> show template
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

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

            {/* ── Channel Setup Tab ── */}
            {tab === 'channels' && (
                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    {/* Header banner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, padding: '16px 20px', borderRadius: 14, background: 'linear-gradient(135deg, var(--sys-primary)10, var(--sys-primary)05)', border: '1px solid var(--sys-primary)22' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--sys-primary)' }}>tv</span>
                        <div>
                            <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Channel Setup</p>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--sys-text-muted)' }}>
                                Configure your channels and thumbnail templates. Both power brand-aligned thumbnail generation and SEO copy across all videos.
                            </p>
                        </div>
                        {channels.length > 0 && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, padding: '4px 10px', borderRadius: 20, background: '#22c55e15', color: '#22c55e', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {channels.length} channel{channels.length > 1 ? 's' : ''} configured ✓
                            </span>
                        )}
                    </div>

                    {/* Channels section */}
                    <YouTubeStudioSettings
                        brandId={activeBrand?._id}
                        activeTemplateId={activeTemplate?._id}
                        channelsOnly={true}
                        onChannelSaved={() => loadChannels()}
                        onTemplateSelect={(template) => setActiveTemplate(template)}
                    />

                    {/* ── Template Quick-Access ── */}
                    <TemplateQuickAccess
                        activeTemplate={activeTemplate}
                        onSelect={setActiveTemplate}
                        brandId={activeBrand?._id}
                    />
                </div>
            )}

            {/* ── Settings Tab ── */}
            {tab === 'settings' && (
                <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    {/* Active template banner */}
                    {activeTemplate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: '#22c55e15', border: '1px solid #22c55e33', marginBottom: 20 }}>
                            <span style={{ fontSize: 24 }}>{activeTemplate.emoji}</span>
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
                                    Active Template: {activeTemplate.name}
                                </p>
                                <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>
                                    {activeTemplate.classification?.theme} · {activeTemplate.classification?.language} · Visual style will be applied to all new thumbnails
                                </p>
                            </div>
                            <button onClick={() => setActiveTemplate(null)}
                                style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: '1px solid #ef444444', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>
                                Clear
                            </button>
                        </div>
                    )}
                    <YouTubeStudioSettings
                        brandId={activeBrand?._id}
                        activeTemplateId={activeTemplate?._id}
                        templatesOnly={true}
                        onTemplateSelect={(template) => {
                            setActiveTemplate(template)
                        }}
                    />
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </DashboardLayout>
    )
}


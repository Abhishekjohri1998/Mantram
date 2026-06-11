/**
 * PulseHistoryPanel — History tab for Pulse Studio
 *
 * Displays all past generations across every Pulse tool in a searchable,
 * filterable card grid. Cards show thumbnail, product name, tool badge,
 * and a "Reload" action to restore the generated output.
 *
 * Features:
 *  - Tab filter by tool type (All | Social Kit | Quick Post | Brochure | A+ | Deck | Landing | Email)
 *  - Search by product name / brief
 *  - Infinite scroll with Load More
 *  - Delete with undo toast
 *  - "Restore" to reload any past result into the active tool
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Clock, Search, Trash2, RefreshCw, Download, ExternalLink,
    Image as ImageIcon, Layers, BarChart2, Globe, Mail,
    Package, Share2, Sparkles, X, ChevronDown, Filter,
    CheckCircle2, Loader2, SlidersHorizontal
} from 'lucide-react'
import { apiFetch } from '../../services/api'

/* ─── Tool meta (badge colour + icon) ────────────────────────────────────── */
const TOOL_META = {
    'social-kit': { label: 'Social Kit',    Icon: Share2,    color: '#8b5cf6' },
    'quick-post': { label: 'Quick Post',    Icon: ImageIcon,  color: '#06b6d4' },
    'brochure':   { label: 'Brochure',      Icon: Layers,     color: '#f59e0b' },
    'deck':       { label: 'Pitch Deck',    Icon: BarChart2,  color: '#ef4444' },
    'page':       { label: 'Landing Page',  Icon: Globe,      color: '#10b981' },
    'email':      { label: 'Email',         Icon: Mail,       color: '#3b82f6' },
    'aplus':      { label: 'A+ Content',    Icon: Package,    color: '#f97316' },
}

const FILTERS = [
    { id: '',           label: 'All'         },
    { id: 'social-kit', label: 'Social Kit'  },
    { id: 'quick-post', label: 'Quick Post'  },
    { id: 'brochure',   label: 'Brochure'    },
    { id: 'aplus',      label: 'A+ Content'  },
    { id: 'deck',       label: 'Deck'        },
    { id: 'page',       label: 'Landing Page'},
    { id: 'email',      label: 'Email'       },
]

function formatRelative(isoDate) {
    const diff = Date.now() - new Date(isoDate).getTime()
    const mins  = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days  = Math.floor(diff / 86400000)
    if (mins  < 1)  return 'Just now'
    if (mins  < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days  < 7)  return `${days}d ago`
    return new Date(isoDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function ToolBadge({ tool }) {
    const meta = TOOL_META[tool] || { label: tool, Icon: Sparkles, color: '#6b7280' }
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px',
            borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44`,
        }}>
            <meta.Icon size={9} /> {meta.label}
        </span>
    )
}

/* ─── Single history card ─────────────────────────────────────────────────── */
function HistoryCard({ item, onDelete, onRestore }) {
    const [deleting, setDeleting]   = useState(false)
    const [showMenu, setShowMenu]   = useState(false)
    const thumb = item.thumbnailUrl || item.productThumbUrl || item.brochureFrontUrl || item.quickPostImageUrl

    const handleDelete = async () => {
        setDeleting(true)
        try {
            await apiFetch(`/brand-studio/history/${item._id}`, { method: 'DELETE' })
            onDelete(item._id)
        } catch (e) { console.warn('Delete failed:', e.message) }
        setDeleting(false)
    }

    // Get the most meaningful output URLs for this tool
    const primaryUrl = item.brochureHostedUrl || item.hostedUrl || item.pageHostedUrl || item.emailHostedUrl || null
    const downloadUrl = item.brochureFrontUrl || item.quickPostImageUrl || null

    // Caption snippet for preview
    const captionSnippet = (() => {
        if (item.tool === 'social-kit') {
            const c = item.captions?.instagram_feed || Object.values(item.captions || {})[0]
            return c?.caption?.slice(0, 80) || ''
        }
        if (item.tool === 'quick-post') return item.quickPostCaption?.slice(0, 80) || ''
        if (item.tool === 'brochure')   return item.brochureContent?.front?.headline || item.brochureProductName || ''
        if (item.tool === 'email')      return item.emailSubject || ''
        if (item.tool === 'deck')       return item.deckPlan?.title || ''
        return item.brief?.slice(0, 80) || ''
    })()

    // Platform chips for social kit
    const platformChips = item.kitPlatforms?.slice(0, 4) || []

    return (
        <div style={{
            borderRadius: 12, border: '1px solid var(--sys-border)',
            background: 'var(--sys-surface)', overflow: 'hidden',
            transition: 'box-shadow 0.15s, transform 0.15s',
            cursor: 'default',
        }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}
        >
            {/* Thumbnail */}
            <div style={{ position: 'relative', background: 'var(--sys-bg)', height: 130, overflow: 'hidden' }}>
                {thumb ? (
                    <img
                        src={thumb}
                        alt={item.productName || item.tool}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
                    />
                ) : null}
                {/* Fallback placeholder */}
                <div style={{
                    display: thumb ? 'none' : 'flex',
                    position: 'absolute', inset: 0,
                    alignItems: 'center', justifyContent: 'center',
                    background: 'var(--sys-bg)',
                    color: 'var(--sys-text-muted)',
                }}>
                    {(() => { const meta = TOOL_META[item.tool]; if (!meta) return <Sparkles size={28} />; return <meta.Icon size={28} /> })()}
                </div>

                {/* Time badge */}
                <div style={{
                    position: 'absolute', top: 7, left: 7,
                    background: 'rgba(0,0,0,0.65)', color: '#fff',
                    borderRadius: 6, padding: '2px 7px', fontSize: 10, backdropFilter: 'blur(4px)',
                }}>
                    {formatRelative(item.createdAt)}
                </div>

                {/* Credits badge */}
                {item.creditsUsed > 0 && (
                    <div style={{
                        position: 'absolute', top: 7, right: 7,
                        background: 'rgba(139,92,246,0.75)', color: '#fff',
                        borderRadius: 6, padding: '2px 7px', fontSize: 10,
                    }}>
                        {item.creditsUsed} cr
                    </div>
                )}
            </div>

            {/* Body */}
            <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 13, fontWeight: 700, color: 'var(--sys-text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            marginBottom: 2,
                        }}>
                            {item.productName || item.brochureProductName || item.brief?.slice(0, 30) || 'Untitled'}
                        </div>
                        <ToolBadge tool={item.tool} />
                    </div>
                </div>

                {captionSnippet && (
                    <div style={{
                        fontSize: 11, color: 'var(--sys-text-muted)', lineHeight: 1.5,
                        marginBottom: 8, overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                        {captionSnippet}
                    </div>
                )}

                {/* Platform chips for social kit */}
                {platformChips.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                        {platformChips.map(p => (
                            <span key={p} style={{
                                fontSize: 9, padding: '2px 6px', borderRadius: 4,
                                background: 'var(--sys-bg)', border: '1px solid var(--sys-border)',
                                color: 'var(--sys-text-muted)', textTransform: 'capitalize',
                            }}>
                                {p.replace('_', ' ')}
                            </span>
                        ))}
                        {(item.kitPlatforms?.length || 0) > 4 && (
                            <span style={{ fontSize: 9, color: 'var(--sys-text-muted)' }}>
                                +{item.kitPlatforms.length - 4} more
                            </span>
                        )}
                    </div>
                )}

                {/* Action row */}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 8 }}>
                    {onRestore && (
                        <button
                            onClick={() => onRestore(item)}
                            className="ps-btn-primary"
                            style={{ fontSize: 10, padding: '5px 10px', gap: 4, flex: 1 }}
                        >
                            <RefreshCw size={10} /> Reload
                        </button>
                    )}
                    {primaryUrl && (
                        <a
                            href={primaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ps-btn-ghost"
                            style={{ fontSize: 10, padding: '5px 8px', gap: 4, textDecoration: 'none' }}
                        >
                            <ExternalLink size={10} />
                        </a>
                    )}
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download
                            className="ps-btn-ghost"
                            style={{ fontSize: 10, padding: '5px 8px', gap: 4, textDecoration: 'none' }}
                        >
                            <Download size={10} />
                        </a>
                    )}
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="ps-btn-ghost"
                        style={{ fontSize: 10, padding: '5px 8px', color: deleting ? 'var(--sys-text-muted)' : '#ef4444' }}
                    >
                        {deleting ? <Loader2 size={10} className="ps-spin" /> : <Trash2 size={10} />}
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ─── Main history panel ──────────────────────────────────────────────────── */
export default function PulseHistoryPanel({ onRestore }) {
    const [items, setItems]         = useState([])
    const [total, setTotal]         = useState(0)
    const [page, setPage]           = useState(1)
    const [loading, setLoading]     = useState(false)
    const [hasMore, setHasMore]     = useState(false)
    const [filterTool, setFilterTool] = useState('')
    const [search, setSearch]       = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const debounceRef = useRef(null)
    const LIMIT = 12

    // Debounce search input
    useEffect(() => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => setDebouncedSearch(search), 400)
        return () => clearTimeout(debounceRef.current)
    }, [search])

    const fetchHistory = useCallback(async (pageNum = 1, reset = false) => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ limit: LIMIT, page: pageNum })
            if (filterTool) params.set('tool', filterTool)
            const data = await apiFetch(`/brand-studio/history?${params}`)
            if (data.success) {
                let fetched = data.items || []
                // Client-side search filter (search is not in backend query)
                if (debouncedSearch) {
                    const q = debouncedSearch.toLowerCase()
                    fetched = fetched.filter(i =>
                        (i.productName || '').toLowerCase().includes(q) ||
                        (i.brief || '').toLowerCase().includes(q) ||
                        (i.brochureProductName || '').toLowerCase().includes(q)
                    )
                }
                setItems(prev => reset ? fetched : [...prev, ...fetched])
                setTotal(data.total)
                setHasMore(pageNum * LIMIT < data.total)
                setPage(pageNum)
            }
        } catch (e) {
            console.warn('History fetch failed:', e.message)
        }
        setLoading(false)
    }, [filterTool, debouncedSearch])

    // Refetch on filter/search change
    useEffect(() => { fetchHistory(1, true) }, [filterTool, debouncedSearch])

    const handleLoadMore = () => fetchHistory(page + 1, false)

    const handleDelete = (id) => {
        setItems(prev => prev.filter(i => i._id !== id))
        setTotal(prev => prev - 1)
    }

    const isEmpty = !loading && items.length === 0

    return (
        <div style={{ padding: '0 0 40px' }}>
            {/* Header */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--sys-text)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={16} style={{ color: 'var(--sys-primary)' }} />
                    Generation History
                    {total > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sys-text-muted)', background: 'var(--sys-bg)', border: '1px solid var(--sys-border)', borderRadius: 99, padding: '1px 8px' }}>
                            {total} saved
                        </span>
                    )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sys-text-muted)' }}>
                    All your generated content across every Pulse tool — reload any result to continue working.
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sys-text-muted)' }} />
                <input
                    className="ps-input"
                    style={{ paddingLeft: 30, width: '100%', boxSizing: 'border-box' }}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by product name or brief…"
                />
                {search && (
                    <button
                        onClick={() => setSearch('')}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sys-text-muted)', padding: 2 }}
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Tool filter pills */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 20 }}>
                {FILTERS.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilterTool(f.id)}
                        className={`ps-btn-${filterTool === f.id ? 'primary' : 'ghost'}`}
                        style={{ fontSize: 11, padding: '5px 11px' }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Loading state */}
            {loading && items.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48, color: 'var(--sys-text-muted)', fontSize: 13 }}>
                    <Loader2 size={16} className="ps-spin" /> Loading history…
                </div>
            )}

            {/* Empty state */}
            {isEmpty && (
                <div style={{ textAlign: 'center', padding: 56, color: 'var(--sys-text-muted)' }}>
                    <Clock size={36} style={{ opacity: 0.25, marginBottom: 12 }} />
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                        {debouncedSearch || filterTool ? 'No matching results' : 'No history yet'}
                    </div>
                    <div style={{ fontSize: 12 }}>
                        {debouncedSearch || filterTool
                            ? 'Try a different search or filter.'
                            : 'Generate your first piece of content — it will appear here.'}
                    </div>
                </div>
            )}

            {/* Cards grid */}
            {items.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 14,
                    marginBottom: 20,
                }}>
                    {items.map(item => (
                        <HistoryCard
                            key={item._id}
                            item={item}
                            onDelete={handleDelete}
                            onRestore={onRestore}
                        />
                    ))}
                </div>
            )}

            {/* Load more */}
            {hasMore && (
                <div style={{ textAlign: 'center' }}>
                    <button
                        onClick={handleLoadMore}
                        disabled={loading}
                        className="ps-btn-secondary"
                        style={{ gap: 6, fontSize: 12 }}
                    >
                        {loading ? <><Loader2 size={13} className="ps-spin" /> Loading…</> : <><ChevronDown size={13} /> Load more ({total - items.length} remaining)</>}
                    </button>
                </div>
            )}
        </div>
    )
}

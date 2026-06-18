import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import { brandCalendar, social } from '../services/api'
import ScheduleDrawer from '../components/ScheduleDrawer'

// ── Constants ────────────────────────────────────────────────────────────────
const PLATFORM_ICON  = { instagram:'photo_camera', facebook:'thumb_up', linkedin:'work', twitter:'alternate_email', youtube:'smart_display', email:'email', whatsapp:'chat', mantram:'movie', pinterest:'push_pin' }
const PLATFORM_COLOR = { instagram:'#E1306C', facebook:'#1877F2', linkedin:'#0A66C2', twitter:'#1DA1F2', youtube:'#FF0000', email:'#888', whatsapp:'#25D366', mantram:'#8B5CF6', pinterest:'#E60023' }
const SOURCE_ICON    = { post:'send', strategy:'edit_calendar', video:'movie', youtube:'smart_display', creative:'palette', content:'article' }
const SOURCE_COLOR   = { post:'#10B981', strategy:'#38BDF8', video:'#8B5CF6', youtube:'#FF0000', creative:'#A855F7', content:'#06B6D4' }
const STATUS_META = {
    scheduled: { label:'Scheduled', icon:'schedule_send', cls:'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    processing: { label:'Publishing', icon:'progress_activity', cls:'text-orange-400 bg-orange-400/10 border-orange-400/20' },
    published:  { label:'Published',  icon:'task_alt',      cls:'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    pending:    { label:'Planned',    icon:'edit_calendar', cls:'text-sky-400 bg-sky-400/10 border-sky-400/20' },
    in_progress:{ label:'In Progress',icon:'pending',       cls:'text-violet-400 bg-violet-400/10 border-violet-400/20' },
    complete:   { label:'Done',       icon:'check_circle',  cls:'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    failed:     { label:'Failed',     icon:'error_outline', cls:'text-red-400 bg-red-400/10 border-red-400/20' },
    cancelled:  { label:'Cancelled',  icon:'cancel',        cls:'text-[var(--sys-text-muted)] bg-[var(--sys-surface)] border-[var(--sys-border)]' },
}
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function getToday() { const d=new Date(); d.setHours(0,0,0,0); return d }

// ── Helpers ──────────────────────────────────────────────────────────────────
function calendarGrid(year, month) {
    const firstDay = new Date(year, month-1, 1).getDay()
    const daysInMonth = new Date(year, month, 0).getDate()
    const grid = []
    for (let i=0; i<firstDay; i++) grid.push(null)
    for (let d=1; d<=daysInMonth; d++) grid.push(d)
    while (grid.length % 7 !== 0) grid.push(null)
    return grid
}

function isoDate(year, month, day) {
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function fmtTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })
}

// ── Mini card inside day cell ────────────────────────────────────────────────
function MiniCard({ entry, onClick }) {
    const platform = entry.platform?.toLowerCase() || ''
    const useSource = entry.source && SOURCE_ICON[entry.source]
    const icon  = useSource ? SOURCE_ICON[entry.source] : (PLATFORM_ICON[platform] || 'share')
    const color = useSource ? SOURCE_COLOR[entry.source] : (PLATFORM_COLOR[platform] || '#888')
    const sm = STATUS_META[entry.status] || STATUS_META.pending
    return (
        <button
            onClick={() => onClick(entry)}
            className="w-full text-left rounded-lg px-1.5 py-1 flex items-center gap-1 hover:bg-[var(--sys-surface)] border border-transparent hover:border-[var(--sys-border)] transition-all cursor-pointer group"
        >
            <span className="material-symbols-outlined text-[11px] shrink-0" style={{ color }}>{icon}</span>
            <span className="text-[10px] text-[var(--sys-text-muted)] truncate flex-1 group-hover:text-[var(--sys-text)] transition-colors">
                {entry.caption?.slice(0,24) || entry.contentType || 'Post'}
            </span>
            <span className={`material-symbols-outlined text-[10px] shrink-0 ${sm.cls.split(' ')[0]}`}>{sm.icon}</span>
        </button>
    )
}

// ── Entry detail panel ───────────────────────────────────────────────────────
function EntryPanel({ entry, onClose, onReschedule }) {
    const platform = entry?.platform?.toLowerCase() || ''
    const icon  = PLATFORM_ICON[platform]  || 'share'
    const color = PLATFORM_COLOR[platform] || '#888'
    const sm = STATUS_META[entry?.status] || STATUS_META.pending
    if (!entry) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black/60" />
            <div
                className="relative w-full max-w-md bg-[var(--sys-bg)] border border-[var(--sys-border)] rounded-2xl overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--sys-border)]">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-xl" style={{ color }}>{icon}</span>
                        <div>
                            <p className="text-sm font-bold text-[var(--sys-text)] capitalize">{platform || 'Post'}</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)]">{entry.accountName || entry.sourceTitle || entry.contentType}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] cursor-pointer">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Status + time */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${sm.cls}`}>
                            <span className="material-symbols-outlined text-[10px]">{sm.icon}</span>
                            {sm.label}
                        </span>
                        {entry.scheduledAt && (
                            <span className="text-xs text-[var(--sys-text-muted)] flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">schedule</span>
                                {new Date(entry.scheduledAt).toLocaleString('en-IN', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                            </span>
                        )}
                    </div>

                    {/* Image */}
                    {entry.imageUrl && (
                        <img src={entry.imageUrl} alt="" className="w-full rounded-xl border border-[var(--sys-border)] max-h-56 object-cover" onError={e => e.target.style.display='none'} />
                    )}

                    {/* Caption */}
                    {entry.caption && (
                        <div>
                            <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--sys-text-muted)] mb-1">Caption</p>
                            <p className="text-sm text-[var(--sys-text)] leading-relaxed whitespace-pre-wrap">{entry.caption}</p>
                        </div>
                    )}

                    {/* Source */}
                    {entry.sourceType && entry.sourceType !== 'manual' && (
                        <div className="flex items-center gap-2 text-xs text-[var(--sys-text-muted)]">
                            <span className="material-symbols-outlined text-sm">link</span>
                            Source: <span className="text-primary font-medium capitalize">{entry.sourceType}{entry.sourceTitle ? ` — ${entry.sourceTitle}` : ''}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {entry.status === 'scheduled' && (
                    <div className="px-5 pb-5 flex gap-3">
                        <button
                            onClick={() => { onClose(); onReschedule(entry) }}
                            className="flex-1 py-2.5 rounded-xl border border-[var(--sys-border)] text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                            <span className="material-symbols-outlined text-sm">edit_calendar</span>Reschedule
                        </button>
                    </div>
                )}
                {entry.source === 'strategy' && (
                    <div className="px-5 pb-5">
                        <div className="text-[10px] text-[var(--sys-text-muted)] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">info</span>
                            Strategy item — schedule it via the Monthly Strategy brief drawer.
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function BrandCalendar({ embedded = false }) {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { activeBrand } = useBrand()

    const today = getToday()
    const [month,   setMonth]   = useState(today.getMonth() + 1)
    const [year,    setYear]    = useState(today.getFullYear())
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [view,    setView]    = useState('month') // 'month' | 'list'
    const [filterPlatform, setFilterPlatform] = useState('all')
    const [filterStatus,   setFilterStatus]   = useState('all')
    const [selectedEntry,  setSelectedEntry]  = useState(null)
    const [schedDrawer,    setSchedDrawer]    = useState(false)
    const [schedPrefill,   setSchedPrefill]   = useState({})
    const [connectedPlatforms, setConnectedPlatforms] = useState([])

    // Load connected accounts for platform filter
    useEffect(() => {
        social.accounts().then(d => {
            const platforms = [...new Set((d.data || []).map(a => a.platform))]
            setConnectedPlatforms(platforms)
        }).catch(() => {})
    }, [])

    const fetchEntries = useCallback(async () => {
        if (!activeBrand?._id) return
        setLoading(true)
        try {
            const data = await brandCalendar.month({ brand: activeBrand._id, month, year })
            setEntries(data.entries || [])
        } catch (err) {
            console.error('[BrandCalendar] fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [activeBrand?._id, month, year])

    useEffect(() => { fetchEntries() }, [fetchEntries])

    // Navigate to today's month
    const goToday = () => { setMonth(today.getMonth() + 1); setYear(today.getFullYear()) }
    const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y-1) } else setMonth(m => m-1) }
    const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y+1) } else setMonth(m => m+1) }

    // Filter
    const filtered = entries.filter(e => {
        if (filterPlatform !== 'all' && e.platform !== filterPlatform) return false
        if (filterStatus   !== 'all' && e.status   !== filterStatus)   return false
        return true
    })

    // Group by date string for month grid
    const byDate = {}
    for (const e of filtered) {
        const d = e.scheduledAt ? e.scheduledAt.slice(0, 10) : null
        if (!d) continue
        if (!byDate[d]) byDate[d] = []
        byDate[d].push(e)
    }

    const grid = calendarGrid(year, month)

    // Stats
    const scheduled  = entries.filter(e => e.status === 'scheduled').length
    const published  = entries.filter(e => e.status === 'published').length
    const planned    = entries.filter(e => ['pending','in_progress'].includes(e.status)).length

    const openScheduleDrawer = (prefill = {}) => {
        setSchedPrefill(prefill)
        setSchedDrawer(true)
    }

    const handleReschedule = (entry) => {
        openScheduleDrawer({
            caption:     entry.caption,
            imageUrl:    entry.imageUrl,
            platform:    entry.platform,
            scheduledAt: entry.scheduledAt,
            sourceType:  entry.sourceType,
            sourceTitle: entry.sourceTitle,
        })
    }

    const calendarContent = (
        <>
            <div className={embedded ? "space-y-5" : "p-4 lg:p-6 max-w-7xl mx-auto space-y-5"}>

                {/* ── Stats row ── */}
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { label:'Scheduled', value: scheduled, icon:'schedule_send', color:'text-amber-400' },
                        { label:'Published',  value: published,  icon:'task_alt',     color:'text-emerald-400' },
                        { label:'Planned',    value: planned,    icon:'edit_calendar', color:'text-sky-400' },
                    ].map(s => (
                        <div key={s.label} className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl p-4 flex items-center gap-3">
                            <span className={`material-symbols-outlined text-2xl ${s.color}`}>{s.icon}</span>
                            <div>
                                <p className="text-xl font-black text-[var(--sys-text)]">{s.value}</p>
                                <p className="text-[10px] uppercase tracking-widest text-[var(--sys-text-muted)] font-bold">{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Toolbar ── */}
                <div className="flex flex-wrap items-center gap-3 justify-between">
                    {/* Month nav */}
                    <div className="flex items-center gap-2">
                        <button onClick={prevMonth} className="p-2 rounded-xl border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-colors">
                            <span className="material-symbols-outlined text-lg">chevron_left</span>
                        </button>
                        <div className="text-center min-w-[140px]">
                            <p className="text-base font-bold text-[var(--sys-text)]">{MONTHS[month-1]} {year}</p>
                        </div>
                        <button onClick={nextMonth} className="p-2 rounded-xl border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-colors">
                            <span className="material-symbols-outlined text-lg">chevron_right</span>
                        </button>
                        <button onClick={goToday} className="px-3 py-2 rounded-xl border border-[var(--sys-border)] text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] cursor-pointer transition-colors">
                            Today
                        </button>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Platform filter */}
                        <select
                            value={filterPlatform}
                            onChange={e => setFilterPlatform(e.target.value)}
                            className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-xs text-[var(--sys-text)] focus:outline-none cursor-pointer"
                        >
                            <option value="all">All Platforms</option>
                            {['instagram','facebook','linkedin','youtube','email'].map(p => (
                                <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase()+p.slice(1)}</option>
                            ))}
                        </select>

                        {/* Status filter */}
                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3 py-2 text-xs text-[var(--sys-text)] focus:outline-none cursor-pointer"
                        >
                            <option value="all">All Status</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="published">Published</option>
                            <option value="pending">Planned</option>
                            <option value="failed">Failed</option>
                        </select>

                        {/* View toggle */}
                        <div className="flex bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-1 gap-1">
                            {[{id:'month',icon:'calendar_month'},{id:'list',icon:'list'}].map(v => (
                                <button key={v.id} onClick={() => setView(v.id)}
                                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${view===v.id ? 'bg-[var(--sys-border)] text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                    <span className="material-symbols-outlined text-base">{v.icon}</span>
                                </button>
                            ))}
                        </div>

                        {/* Schedule new */}
                        <button
                            onClick={() => openScheduleDrawer({})}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Schedule Post
                        </button>
                    </div>
                </div>

                {/* ── Loading ── */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <span className="material-symbols-outlined text-4xl animate-spin text-primary/50">progress_activity</span>
                    </div>
                ) : view === 'month' ? (
                    /* ── Month Grid ── */
                    <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl overflow-hidden">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-[var(--sys-border)]">
                            {DAYS.map(d => (
                                <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)]">{d}</div>
                            ))}
                        </div>
                        {/* Cells */}
                        <div className="grid grid-cols-7">
                            {grid.map((day, idx) => {
                                const dateStr = day ? isoDate(year, month, day) : null
                                const dayEntries = dateStr ? (byDate[dateStr] || []) : []
                                const isToday = dateStr === isoDate(today.getFullYear(), today.getMonth()+1, today.getDate())
                                const isPast  = day && new Date(dateStr) < today

                                return (
                                    <div key={idx}
                                        className={`min-h-[90px] p-1.5 border-b border-r border-[var(--sys-border)] ${!day ? 'bg-[var(--sys-bg)]/30' : 'hover:bg-[var(--sys-bg)]/50'} transition-colors`}
                                        style={{ borderRight: (idx+1)%7===0 ? 'none' : undefined }}
                                    >
                                        {day && (
                                            <>
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-white' : isPast ? 'text-[var(--sys-text-muted)]/40' : 'text-[var(--sys-text-muted)]'}`}>
                                                        {day}
                                                    </span>
                                                    {dayEntries.length > 2 && (
                                                        <span className="text-[9px] text-[var(--sys-text-muted)] font-bold">+{dayEntries.length-2}</span>
                                                    )}
                                                </div>
                                                <div className="space-y-0.5">
                                                    {dayEntries.slice(0,2).map(e => (
                                                        <MiniCard key={e._id} entry={e} onClick={setSelectedEntry} />
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ) : (
                    /* ── List View ── */
                    <div className="space-y-2">
                        {filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-[var(--sys-text-muted)]">
                                <span className="material-symbols-outlined text-4xl mb-3 opacity-40">calendar_month</span>
                                <p className="text-sm font-medium">No posts for {MONTHS[month-1]} {year}</p>
                                <button onClick={() => openScheduleDrawer({})} className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 cursor-pointer flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">add</span>Schedule your first post
                                </button>
                            </div>
                        ) : filtered.map((entry, idx) => {
                            const platform = entry.platform?.toLowerCase() || ''
                            const icon  = PLATFORM_ICON[platform]  || 'share'
                            const color = PLATFORM_COLOR[platform] || '#888'
                            const sm    = STATUS_META[entry.status] || STATUS_META.pending
                            return (
                                <div key={entry._id}
                                    onClick={() => setSelectedEntry(entry)}
                                    className="group flex items-center gap-4 p-4 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl hover:border-primary/20 cursor-pointer transition-all"
                                    style={{ animation: `fadeUp 0.3s ease-out ${idx*40}ms both` }}
                                >
                                    {entry.imageUrl && (
                                        <img src={entry.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0 border border-[var(--sys-border)]" onError={e=>e.target.style.display='none'} />
                                    )}
                                    {!entry.imageUrl && (
                                        <div className="w-12 h-12 rounded-xl shrink-0 border border-[var(--sys-border)] flex items-center justify-center bg-[var(--sys-bg)]">
                                            <span className="material-symbols-outlined text-xl" style={{ color }}>{icon}</span>
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                            <span className="text-xs font-bold capitalize text-[var(--sys-text)]" style={{ color }}>{platform}</span>
                                            {entry.accountName && <span className="text-[10px] text-[var(--sys-text-muted)]">· {entry.accountName}</span>}
                                            {entry.sourceType && entry.sourceType !== 'manual' && (
                                                <span className="text-[10px] text-primary/70 capitalize">· {entry.sourceType}</span>
                                            )}
                                        </div>
                                        <p className="text-[13px] text-[var(--sys-text-muted)] line-clamp-1">{entry.caption || entry.contentType || '—'}</p>
                                        {entry.scheduledAt && (
                                            <p className="text-[10px] text-[var(--sys-text-muted)] mt-0.5 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">schedule</span>
                                                {new Date(entry.scheduledAt).toLocaleString('en-IN', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                            </p>
                                        )}
                                    </div>
                                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1 ${sm.cls}`}>
                                        <span className="material-symbols-outlined text-[10px]">{sm.icon}</span>
                                        {sm.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Entry detail panel */}
            {selectedEntry && (
                <EntryPanel
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                    onReschedule={handleReschedule}
                />
            )}

            {/* Schedule Drawer */}
            <ScheduleDrawer
                open={schedDrawer}
                onClose={() => setSchedDrawer(false)}
                prefill={schedPrefill}
                onScheduled={() => { fetchEntries() }}
            />

            <style>{`
                @keyframes fadeUp {
                    from { opacity:0; transform:translateY(8px); }
                    to   { opacity:1; transform:translateY(0); }
                }
            `}</style>
        </>
    )

    if (embedded) {
        return calendarContent
    }

    return (
        <DashboardLayout title="Brand Calendar" subtitle="One unified calendar — every studio, every post">
            <SEOHead title="Brand Calendar — Mantram AI" noIndex={true} />
            {calendarContent}
        </DashboardLayout>
    )
}

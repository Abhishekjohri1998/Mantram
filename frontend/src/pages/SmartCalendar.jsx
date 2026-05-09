import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { social, brandCalendar, monthlyStrategy as msAPI, creatives, jobs as jobsAPI } from '../services/api'
import { getEventsForMonth, getUpcomingEvents, EVENT_COLORS, COUNTRIES } from '../data/calendarData'

// ═══════════════════════════════════════════════════════════════
// SMART CALENDAR — Social Marketing Command Center
// ═══════════════════════════════════════════════════════════════

const PLATFORM_META = {
    instagram: { label: 'Instagram', icon: '📸', color: '#E1306C', gradient: 'linear-gradient(135deg,#E1306C,#F77737)' },
    facebook:  { label: 'Facebook',  icon: '👥', color: '#1877F2', gradient: 'linear-gradient(135deg,#1877F2,#42A5F5)' },
    twitter:   { label: 'Twitter / X', icon: '𝕏', color: '#000000', gradient: 'linear-gradient(135deg,#14171A,#657786)' },
    tiktok:    { label: 'TikTok',    icon: '🎵', color: '#010101', gradient: 'linear-gradient(135deg,#010101,#69C9D0)' },
    linkedin:  { label: 'LinkedIn',  icon: '💼', color: '#0A66C2', gradient: 'linear-gradient(135deg,#0A66C2,#0288D1)' },
    gbp:       { label: 'Google Business', icon: '📍', color: '#4285F4', gradient: 'linear-gradient(135deg,#4285F4,#34A853)' },
}

const IMAGE_MODELS = [
    { id: 'nanobanana-2',  name: 'NanoBanana 2',  icon: 'auto_awesome',        color: 'var(--sys-text)',  desc: 'Default · Fast' },
    { id: 'nanobanana-pro', name: 'NanoBanana Pro', icon: 'diamond',            color: '#ec4899',          desc: 'Premium quality' },
    { id: 'flux-pro-v1.1', name: 'Flux Pro v1.1', icon: 'bolt',               color: '#f97316',          desc: 'Photorealistic' },
    { id: 'flux-2-pro',   name: 'Flux 2 Pro',     icon: 'stars',              color: '#eab308',          desc: 'Latest Flux' },
    { id: 'seedream-5',   name: 'Seedream 5',     icon: 'park',               color: '#22c55e',          desc: 'Artistic style' },
    { id: 'ideogram',     name: 'Ideogram v3',    icon: 'text_fields',        color: '#06b6d4',          desc: 'Best text in images' },
    { id: 'grok-imagen',  name: 'Grok Imagen',    icon: 'smart_toy',          color: '#ef4444',          desc: 'xAI quality' },
    { id: 'gpt-image-2',  name: 'GPT Image 2',    icon: 'text_rotate_vertical', color: '#10a37f',       desc: 'Perfect text · Complex' },
    { id: 'gpt-image-1',  name: 'GPT Image 1',    icon: 'auto_fix_high',      color: '#0ea5e9',          desc: 'Clean renders' },
]

const CONTENT_TYPE_META = {
    reel:      { icon: 'movie', label: 'Reel', color: '#E1306C' },
    carousel:  { icon: 'view_carousel', label: 'Carousel', color: '#F77737' },
    static:    { icon: 'image', label: 'Static Post', color: '#8B5CF6' },
    story:     { icon: 'amp_stories', label: 'Story', color: '#EC4899' },
    blog:      { icon: 'article', label: 'Blog', color: '#06B6D4' },
    email:     { icon: 'mail', label: 'Email', color: '#10B981' },
    ad:        { icon: 'ads_click', label: 'Ad', color: '#F59E0B' },
    ugc:       { icon: 'person_play', label: 'UGC', color: '#EF4444' },
    youtube:   { icon: 'smart_display', label: 'YouTube', color: '#FF0000' },
    image:     { icon: 'image', label: 'Image', color: '#8B5CF6' },
    text:      { icon: 'notes', label: 'Text Post', color: '#64748B' },
    video:     { icon: 'videocam', label: 'Video', color: '#A855F7' },
}

const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function SmartCalendar() {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()
    const brandCountry = activeBrand?.dna?.country || 'India'
    const [overrideCountry, setOverrideCountry] = useState(null)
    const country = overrideCountry || brandCountry

    const today = new Date()
    const [currentMonth, setCurrentMonth] = useState(today.getMonth())
    const [currentYear, setCurrentYear] = useState(today.getFullYear())
    const [selectedDate, setSelectedDate] = useState(null)
    const [showPanel, setShowPanel] = useState(false)
    const [previewPost, setPreviewPost] = useState(null)

    // Calendar data from unified API
    const [calendarEntries, setCalendarEntries] = useState([])
    const [entriesLoading, setEntriesLoading] = useState(true)

    // Legacy social posts (fallback)
    const [socialPosts, setSocialPosts] = useState([])

    // Batch generation
    const [batchModel, setBatchModel] = useState('nanobanana-2')
    const [showModelMenu, setShowModelMenu] = useState(false)
    const [batchGenerating, setBatchGenerating] = useState(false)
    const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 })
    const batchPollRef = useRef(null)
    const batchJobIdRef = useRef(null)

    // Active strategy for batch ops
    const [activeStrategy, setActiveStrategy] = useState(null)

    // ── Fetch unified calendar entries ──
    const fetchEntries = useCallback(async () => {
        if (!activeBrand?._id) return
        setEntriesLoading(true)
        try {
            const data = await brandCalendar.month({
                brand: activeBrand._id,
                month: currentMonth + 1,
                year: currentYear,
            })
            setCalendarEntries(data.entries || [])
        } catch (err) {
            console.warn('[Calendar] unified API failed, falling back:', err)
            // Fallback to social.publishHistory
            try {
                const data = await social.publishHistory({})
                setSocialPosts(data.posts || [])
            } catch { }
        } finally {
            setEntriesLoading(false)
        }
    }, [activeBrand?._id, currentMonth, currentYear])

    useEffect(() => { fetchEntries() }, [fetchEntries])

    // Fetch active strategy for this month
    useEffect(() => {
        if (!activeBrand?._id) return
        msAPI.list({ brand: activeBrand._id, month: currentMonth + 1, year: currentYear })
            .then(data => {
                const strategies = data.strategies || data || []
                const active = Array.isArray(strategies) ? strategies[0] : null
                setActiveStrategy(active)
            })
            .catch(() => { })
    }, [activeBrand?._id, currentMonth, currentYear])

    // Cultural events for current month
    const monthEvents = useMemo(() => getEventsForMonth(country, currentMonth + 1), [country, currentMonth])

    // Map calendar entries by day
    const entriesByDay = useMemo(() => {
        const map = {}
        for (const entry of calendarEntries) {
            const d = new Date(entry.scheduledAt)
            const day = d.getDate()
            if (!map[day]) map[day] = []
            map[day].push(entry)
        }
        // Fallback social posts
        for (const p of socialPosts) {
            const d = new Date(p.scheduledFor || p.publishedAt || p.createdAt)
            if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) continue
            const day = d.getDate()
            if (!map[day]) map[day] = []
            const meta = PLATFORM_META[p.platform] || {}
            map[day].push({
                ...p, source: 'post', contentType: p.imageUrl ? 'image' : 'text',
                scheduledAt: d, _calName: `${meta.icon || ''} ${meta.label || p.platform}`,
            })
        }
        return map
    }, [calendarEntries, socialPosts, currentMonth, currentYear])

    // Upcoming events (14 days)
    const upcoming = useMemo(() => getUpcomingEvents(country, 14), [country])

    // Calendar grid
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay()
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()
        const days = []
        for (let i = firstDay - 1; i >= 0; i--) days.push({ day: daysInPrevMonth - i, isOtherMonth: true })
        for (let d = 1; d <= daysInMonth; d++) {
            const dayEvents = monthEvents.filter(e => e.day === d)
            const dayEntries = entriesByDay[d] || []
            days.push({
                day: d, isOtherMonth: false,
                isToday: d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear(),
                events: dayEvents, entries: dayEntries,
            })
        }
        const remaining = 42 - days.length
        for (let i = 1; i <= remaining; i++) days.push({ day: i, isOtherMonth: true })
        return days
    }, [currentMonth, currentYear, monthEvents, entriesByDay])

    // Pending items count (for batch gen)
    const pendingCount = useMemo(() => {
        return calendarEntries.filter(e => e.source === 'strategy' && e.status === 'pending').length
    }, [calendarEntries])

    // ── Selected day data ──
    const selectedDayData = useMemo(() => {
        if (!selectedDate) return { events: [], entries: [] }
        const dayObj = calendarDays.find(d => d.day === selectedDate && !d.isOtherMonth)
        return { events: dayObj?.events || [], entries: dayObj?.entries || [] }
    }, [selectedDate, calendarDays])

    // ── Handlers ──
    const handleDateClick = (dayObj) => {
        if (dayObj.isOtherMonth) return
        setSelectedDate(dayObj.day)
        setShowPanel(true)
        setPreviewPost(null)
    }

    const handleGenerateContent = (event) => {
        const params = new URLSearchParams({ occasion: event.name, tone: event.tone || '', emoji: event.emoji || '', type: event.formats?.[0] || 'social' })
        navigate(`/content-studio?${params.toString()}`)
    }

    const handleGenerateBlog = (event) => {
        const params = new URLSearchParams({ mode: 'blog', occasion: event.name, tone: event.tone || '' })
        navigate(`/content-studio?${params.toString()}`)
    }

    const handleGenerateCampaign = (event) => {
        navigate(`/nexus?${new URLSearchParams({ occasion: event.name, mode: 'campaign' }).toString()}`)
    }

    const handleOpenVideoStudio = (entry) => {
        const params = new URLSearchParams({ platform: entry.platform || 'instagram' })
        if (entry.brief?.captionDraft) params.set('brief', entry.brief.captionDraft.slice(0, 200))
        navigate(`/video-studio?${params.toString()}`)
    }

    const handleExecuteInStudio = (entry) => {
        if (!entry.strategyId || !entry.calendarItemId) return
        const studio = entry.targetStudio || 'creative'
        const studioMap = { creative: '/creative-studio', content: '/content-studio', video: '/video-studio', retention: '/content-studio' }
        // Store strategy context for writeback
        window.sessionStorage.setItem('ms_strategy_ctx', JSON.stringify({ strategyId: entry.strategyId, itemId: entry.calendarItemId }))
        const params = new URLSearchParams({ occasion: entry.brief?.angle || entry.caption || '', tone: entry.brief?.toneDirection || '' })
        navigate(`${studioMap[studio] || '/creative-studio'}?${params.toString()}`)
    }

    const handleCancelScheduled = async (postId) => {
        try { await social.cancelScheduled(postId); fetchEntries(); setPreviewPost(null) }
        catch (err) { alert(err.message || 'Failed to cancel') }
    }

    // ── Batch Generate All Images ──
    const handleBatchGenerate = async () => {
        if (!activeStrategy?._id || batchGenerating) return
        setBatchGenerating(true)
        setBatchProgress({ done: 0, total: pendingCount })
        try {
            const data = await msAPI.batchGenerate(activeStrategy._id, { imageModel: batchModel })
            if (data.batchId) {
                batchJobIdRef.current = data.batchId
                // Poll for completion
                let pollCount = 0
                batchPollRef.current = setInterval(async () => {
                    try {
                        const status = await jobsAPI.status(data.batchId)
                        if (status.status === 'completed' || status.status === 'failed' || pollCount > 120) {
                            clearInterval(batchPollRef.current)
                            setBatchGenerating(false)
                            fetchEntries()
                        }
                        if (status.progress) setBatchProgress(status.progress)
                        pollCount++
                    } catch { pollCount++ }
                }, 5000)
            } else {
                setBatchGenerating(false)
                fetchEntries()
            }
        } catch (err) {
            console.error('Batch generation failed:', err)
            setBatchGenerating(false)
        }
    }

    const handleStopBatch = async () => {
        if (batchPollRef.current) { clearInterval(batchPollRef.current); batchPollRef.current = null }
        if (batchJobIdRef.current) {
            try { await jobsAPI.cancel(batchJobIdRef.current) } catch {}
            batchJobIdRef.current = null
        }
        setBatchGenerating(false)
        setBatchProgress({ done: 0, total: 0 })
        fetchEntries()
    }

    useEffect(() => () => { if (batchPollRef.current) clearInterval(batchPollRef.current) }, [])

    const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) } else setCurrentMonth(m => m - 1); setShowPanel(false) }
    const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) } else setCurrentMonth(m => m + 1); setShowPanel(false) }
    const goToday = () => { setCurrentMonth(today.getMonth()); setCurrentYear(today.getFullYear()); setShowPanel(false) }

    const scheduledCount = calendarEntries.filter(e => e.status === 'scheduled').length
    const publishedCount = calendarEntries.filter(e => e.status === 'published').length
    // ═══════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════
    return (
        <DashboardLayout title="Smart Calendar" subtitle="Social marketing command center">
            <SEOHead title="Smart Calendar — Mantram AI" noIndex={true} />
            <div className="p-8 max-w-[1400px] mx-auto">
                {/* ── Header Bar ── */}
                <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        <p className="text-[var(--sys-text-muted)] text-sm">Marketing command center for <span className="text-primary font-semibold">{country}</span></p>
                        {!entriesLoading && (scheduledCount > 0 || publishedCount > 0) && (
                            <div className="flex items-center gap-2">
                                {scheduledCount > 0 && (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[#FF4D00]/15 text-[#FF7A00] border border-[#FF4D00]/20">
                                        <span className="w-2 h-2 rounded-full bg-[#FF4D00] animate-pulse" />{scheduledCount} scheduled
                                    </span>
                                )}
                                {publishedCount > 0 && (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--sys-primary-dim)] text-[var(--sys-primary)] border border-[var(--sys-border)]">
                                        <span className="w-2 h-2 rounded-full bg-[var(--sys-surface)]" />{publishedCount} published
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Model Selector + Generate All */}
                        {activeStrategy && pendingCount > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="relative">
                                    <button onClick={() => setShowModelMenu(!showModelMenu)}
                                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm font-semibold text-[var(--sys-text)] hover:border-[var(--sys-text)]/30 transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm" style={{ color: IMAGE_MODELS.find(m => m.id === batchModel)?.color }}>{IMAGE_MODELS.find(m => m.id === batchModel)?.icon || 'auto_awesome'}</span>
                                        <span className="text-xs">{IMAGE_MODELS.find(m => m.id === batchModel)?.name || 'Model'}</span>
                                        <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)]">expand_more</span>
                                    </button>
                                    {showModelMenu && (
                                        <div className="absolute top-full right-0 mt-1 w-64 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-2xl z-50 py-2 max-h-80 overflow-y-auto">
                                            {IMAGE_MODELS.map(m => (
                                                <button key={m.id} onClick={() => { setBatchModel(m.id); setShowModelMenu(false) }}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all cursor-pointer hover:bg-[color-mix(in_srgb,var(--sys-text)_5%,var(--sys-surface))] ${batchModel === m.id ? 'bg-[color-mix(in_srgb,var(--sys-text)_8%,var(--sys-surface))]' : ''}`}>
                                                    <span className="material-symbols-outlined text-base" style={{ color: m.color }}>{m.icon}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold text-[var(--sys-text)]">{m.name}</p>
                                                        <p className="text-[10px] text-[var(--sys-text-muted)]">{m.desc}</p>
                                                    </div>
                                                    {batchModel === m.id && <span className="material-symbols-outlined text-primary text-sm">check</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button onClick={handleBatchGenerate} disabled={batchGenerating}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20">
                                    <span className="material-symbols-outlined text-sm">{batchGenerating ? 'hourglass_empty' : 'bolt'}</span>
                                    {batchGenerating ? `Generating ${batchProgress.done}/${batchProgress.total}...` : `Generate All (${pendingCount})`}
                                </button>
                            </div>
                        )}
                        {/* Country Switcher */}
                        <div className="relative">
                            <select value={country} onChange={e => setOverrideCountry(e.target.value)}
                                className="input-glass py-2 pl-3 pr-8 rounded-xl text-sm text-[var(--sys-text)] bg-[var(--sys-surface)] cursor-pointer appearance-none min-w-[150px]">
                                {COUNTRIES.map(c => (<option key={c.id} value={c.id}>{c.flag} {c.label}</option>))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-sm pointer-events-none">expand_more</span>
                        </div>
                        {/* Legend */}
                        <div className="hidden lg:flex items-center gap-3 ml-2">
                            {Object.entries(EVENT_COLORS).filter(([k]) => !['brand', 'published'].includes(k)).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: val.dot }} />
                                    <span className="text-sm text-[var(--sys-text-muted)]">{val.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Batch Generation Progress Banner ── */}
                {batchGenerating && (
                    <div className="glass-panel rounded-2xl p-4 mb-6 border border-primary/20 flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-[var(--sys-text)]">Generating calendar assets...</p>
                            <p className="text-xs text-[var(--sys-text-muted)] mt-0.5">Using {IMAGE_MODELS.find(m => m.id === batchModel)?.name} · {batchProgress.done}/{batchProgress.total} complete</p>
                            <div className="w-full h-1.5 rounded-full bg-[var(--sys-surface)] mt-2 overflow-hidden">
                                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }} />
                            </div>
                        </div>
                        <button onClick={handleStopBatch}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all cursor-pointer flex-shrink-0">
                            <span className="material-symbols-outlined text-sm">stop_circle</span>
                            Stop
                        </button>
                    </div>
                )}

                {/* ── Upcoming Opportunities ── */}
                {upcoming.length > 0 && (
                    <div className="glass-panel rounded-2xl p-5 mb-6 border border-primary/10">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-primary">trending_up</span>
                            <h3 className="text-base font-bold text-[var(--sys-text)]">Upcoming Opportunities</h3>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
                            {upcoming.slice(0, 6).map((e, i) => (
                                <button key={i} onClick={() => handleGenerateContent(e)}
                                    className="flex-shrink-0 glass-panel rounded-xl p-3 min-w-[180px] hover:bg-[var(--sys-surface)] transition-all cursor-pointer border border-[var(--sys-border)] group text-left">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-lg">{e.emoji}</span>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${e.daysUntil <= 7 ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-primary/20 text-primary'}`}>
                                            {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `${e.daysUntil} days`}
                                        </span>
                                    </div>
                                    <p className="text-base font-semibold text-[var(--sys-text)] truncate">{e.name}</p>
                                    <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">Tone: {e.tone}</p>
                                    <div className="flex items-center gap-1 mt-2 text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-symbols-outlined text-xs">auto_awesome</span> Generate Content
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-6">
                    {/* ── Calendar Grid ── */}
                    <div className="flex-1">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-[var(--sys-surface)] transition-all cursor-pointer text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                                    <span className="material-symbols-outlined">chevron_left</span>
                                </button>
                                <h2 className="text-xl font-bold text-[var(--sys-text)] min-w-[200px] text-center">{monthNames[currentMonth]} {currentYear}</h2>
                                <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-[var(--sys-surface)] transition-all cursor-pointer text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </button>
                            </div>
                            <button onClick={goToday} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all cursor-pointer">Today</button>
                        </div>

                        {/* Day Headers */}
                        <div className="grid grid-cols-7 gap-px mb-1">
                            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                                <div key={d} className="text-center text-xs text-[var(--sys-text-muted)] font-bold py-2 uppercase tracking-wider">{d}</div>
                            ))}
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-7 gap-px bg-[var(--sys-surface)] rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                            {calendarDays.map((dayObj, i) => {
                                const totalItems = (dayObj.events?.length || 0) + (dayObj.entries?.length || 0)
                                return (
                                    <button key={i} onClick={() => handleDateClick(dayObj)}
                                        className={`min-h-[90px] p-2 text-left transition-all cursor-pointer relative group
                                            ${dayObj.isOtherMonth ? 'bg-[#080a14]/80 text-slate-700' : 'bg-[#0c0f1a] hover:bg-[var(--sys-surface)]'}
                                            ${dayObj.isToday ? 'ring-2 ring-primary/50 ring-inset' : ''}
                                            ${selectedDate === dayObj.day && !dayObj.isOtherMonth ? 'bg-primary/10' : ''}`}>
                                        <span className={`text-sm font-semibold ${dayObj.isToday ? 'text-primary' : dayObj.isOtherMonth ? 'text-slate-700' : 'text-[var(--sys-text-muted)]'}`}>{dayObj.day}</span>

                                        {totalItems > 0 && (
                                            <div className="mt-1 space-y-0.5">
                                                {/* Cultural events */}
                                                {dayObj.events?.slice(0, 2).map((e, j) => {
                                                    const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                                    return (
                                                        <div key={`ev-${j}`} className="flex items-center gap-1 truncate">
                                                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color.dot }} />
                                                            <span className="text-xs truncate" style={{ color: color.dot }}>{e.emoji} {e.name}</span>
                                                        </div>
                                                    )
                                                })}
                                                {/* Calendar entries with image thumbnails */}
                                                {dayObj.entries?.slice(0, 2).map((entry, j) => {
                                                    const ctMeta = CONTENT_TYPE_META[entry.contentType] || CONTENT_TYPE_META.text
                                                    const platMeta = PLATFORM_META[entry.platform] || {}
                                                    const statusColor = entry.status === 'published' ? '#22D3EE' : entry.status === 'scheduled' ? '#8B5CF6' : entry.status === 'processing' ? '#F59E0B' : entry.status === 'complete' ? '#22C55E' : '#64748B'
                                                    return (
                                                        <div key={`en-${j}`} className="flex items-center gap-1 truncate">
                                                            {entry.imageUrl ? (
                                                                <img src={entry.imageUrl} alt="" className="w-4 h-4 rounded-sm object-cover flex-shrink-0" loading="lazy" onError={e => { e.target.style.display='none' }} />
                                                            ) : (
                                                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                                                            )}
                                                            <span className="text-xs truncate" style={{ color: statusColor }}>
                                                                {platMeta.icon || ''} {ctMeta.label}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                                {totalItems > 4 && <span className="text-sm text-[var(--sys-text-muted)]">+{totalItems - 4} more</span>}
                                            </div>
                                        )}

                                        {!dayObj.isOtherMonth && (
                                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="material-symbols-outlined text-primary text-sm">add_circle</span>
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Platform icons row */}
                        <div className="mt-4 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-[var(--sys-text-muted)] font-medium mr-1">Platforms:</span>
                            {Object.entries(PLATFORM_META).map(([key, meta]) => (
                                <div key={key} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]" title={meta.label}>
                                    <span className="text-sm">{meta.icon}</span>
                                    <span className="text-xs text-[var(--sys-text-muted)] font-medium">{meta.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* ── Side Panel ── */}
                    {showPanel && (
                        <div className="w-[360px] flex-shrink-0 animate-fade-in">
                            <div className="glass-panel rounded-2xl p-5 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-[var(--sys-text)]">{monthNames[currentMonth]} {selectedDate}</h3>
                                    <button onClick={() => setShowPanel(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>

                                {/* ── Calendar Entries (Strategy + Posts) ── */}
                                {selectedDayData.entries.length > 0 && (
                                    <div className="mb-5">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined text-[#FF4D00] text-sm">event_note</span>
                                            <h4 className="text-xs font-bold text-[#FF7A00] uppercase tracking-widest">Content Items</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF4D00]/15 text-[#FF7A00]">{selectedDayData.entries.length}</span>
                                        </div>
                                        <div className="space-y-2">
                                            {selectedDayData.entries.map((entry) => {
                                                const platMeta = PLATFORM_META[entry.platform] || {}
                                                const ctMeta = CONTENT_TYPE_META[entry.contentType] || CONTENT_TYPE_META.text
                                                const isExpanded = previewPost?._id === entry._id
                                                const isStrategy = entry.source === 'strategy'
                                                return (
                                                    <div key={entry._id} className={`group rounded-xl border transition-all duration-200 overflow-hidden ${isExpanded ? 'bg-[#FF4D00]/[0.08] border-[#FF4D00]/30' : 'border-[var(--sys-border)] hover:border-[#FF4D00]/20 bg-[var(--sys-surface)]'}`}>
                                                        <button className="w-full p-3 text-left cursor-pointer" onClick={() => setPreviewPost(isExpanded ? null : entry)}>
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: platMeta.gradient || 'var(--sys-primary)' }}>
                                                                    <span className="text-sm">{platMeta.icon || ctMeta.icon}</span>
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-bold text-[var(--sys-text)]">{platMeta.label || entry.platform}</span>
                                                                        <span className="material-symbols-outlined text-xs" style={{ color: ctMeta.color }}>{ctMeta.icon}</span>
                                                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                            entry.status === 'published' ? 'bg-[#22D3EE]/20 text-[#22D3EE]' :
                                                                            entry.status === 'scheduled' ? 'bg-[#8B5CF6]/20 text-[#8B5CF6]' :
                                                                            entry.status === 'processing' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                                                                            entry.status === 'complete' ? 'bg-[#22C55E]/20 text-[#22C55E]' :
                                                                            entry.status === 'in_progress' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                                                                            'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'
                                                                        }`}>
                                                                            {entry.status === 'published' ? '✓ SENT' : entry.status === 'scheduled' ? '⏰ QUEUED' : entry.status === 'processing' ? '⚡ PUBLISHING' : entry.status === 'complete' ? '✓ READY' : entry.status === 'in_progress' ? '⚡ WORKING' : '○ PENDING'}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-[var(--sys-text-muted)] mt-0.5 truncate">
                                                                        {isStrategy ? `${ctMeta.label} · ${entry.brief?.angle || entry.caption || 'No brief'}` : `${entry.accountName || ''} · ${new Date(entry.scheduledAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
                                                                    </p>
                                                                </div>
                                                                <span className={`material-symbols-outlined text-sm text-[var(--sys-text-muted)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                                            </div>
                                                        </button>

                                                        {/* Expanded Detail */}
                                                        {isExpanded && (
                                                            <div className="px-3 pb-3 space-y-3">
                                                                <div className="h-px bg-[var(--sys-surface)] border border-[var(--sys-border)]" />

                                                                {/* Image preview with aspect ratio containment */}
                                                                {entry.imageUrl && (
                                                                    <div className="rounded-lg overflow-hidden border border-[var(--sys-border)]" style={{ aspectRatio: entry.platform === 'instagram' ? '4/5' : '16/9' }}>
                                                                        <img src={entry.imageUrl} alt="" className="w-full h-full object-contain bg-black/20" onError={e => e.target.style.display='none'} />
                                                                    </div>
                                                                )}

                                                                {/* Carousel preview strip */}
                                                                {entry.imageUrls?.length > 1 && (
                                                                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                                                                        {entry.imageUrls.map((url, idx) => (
                                                                            <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden border border-[var(--sys-border)] flex-shrink-0" style={{ aspectRatio: '1/1' }}>
                                                                                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => e.target.style.display='none'} />
                                                                            </div>
                                                                        ))}
                                                                        <div className="flex items-center text-[10px] text-[var(--sys-text-muted)] font-bold px-2">{entry.imageUrls.length} slides</div>
                                                                    </div>
                                                                )}

                                                                {/* Strategy Brief */}
                                                                {isStrategy && entry.brief && (
                                                                    <div className="rounded-lg bg-[var(--sys-surface)] p-3 border border-[var(--sys-border)] space-y-1.5">
                                                                        {entry.brief.angle && <p className="text-xs text-[var(--sys-text)]"><span className="font-bold">Angle:</span> {entry.brief.angle}</p>}
                                                                        {entry.brief.visualDirection && <p className="text-xs text-[var(--sys-text-muted)]"><span className="font-bold text-[var(--sys-text)]">Visual:</span> {entry.brief.visualDirection}</p>}
                                                                        {entry.brief.captionDraft && <p className="text-xs text-[var(--sys-text-muted)] line-clamp-3">{entry.brief.captionDraft}</p>}
                                                                        {entry.brief.postingTime && <p className="text-[10px] text-[var(--sys-text-muted)]">Best time: {entry.brief.postingTime}</p>}
                                                                    </div>
                                                                )}

                                                                {/* Caption for social posts */}
                                                                {!isStrategy && entry.caption && (
                                                                    <div className="rounded-lg bg-[var(--sys-surface)] p-3 border border-[var(--sys-border)]">
                                                                        <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed whitespace-pre-wrap line-clamp-6">{entry.caption}</p>
                                                                    </div>
                                                                )}

                                                                {/* Actions */}
                                                                <div className="flex flex-col gap-2">
                                                                    {isStrategy && entry.status === 'pending' && (
                                                                        <button onClick={() => handleExecuteInStudio(entry)}
                                                                            className="w-full py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all cursor-pointer flex items-center justify-center gap-1.5">
                                                                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                                                            Generate in {entry.targetStudio === 'video' ? 'Video' : entry.targetStudio === 'content' ? 'Content' : 'Creative'} Studio
                                                                        </button>
                                                                    )}
                                                                    {['reel', 'ugc', 'youtube'].includes(entry.contentType) && (
                                                                        <button onClick={() => handleOpenVideoStudio(entry)}
                                                                            className="w-full py-2 rounded-lg bg-[#E1306C]/10 text-[#E1306C] text-xs font-bold hover:bg-[#E1306C]/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-[#E1306C]/20">
                                                                            <span className="material-symbols-outlined text-sm">movie</span> Create in Video Studio
                                                                        </button>
                                                                    )}
                                                                    {entry.status === 'scheduled' && (
                                                                        <button onClick={(e) => { e.stopPropagation(); handleCancelScheduled(entry._id) }}
                                                                            className="w-full py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-medium hover:bg-red-500/10 hover:text-red-400 transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-[var(--sys-border)]">
                                                                            <span className="material-symbols-outlined text-sm">close</span> Cancel Schedule
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => navigate('/publish-schedule')}
                                                                        className="w-full py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-[var(--sys-border)]">
                                                                        <span className="material-symbols-outlined text-sm">open_in_new</span> Schedule / Publish
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* ── Cultural Events ── */}
                                {selectedDayData.events.length > 0 && (
                                    <div>
                                        {selectedDayData.entries.length > 0 && (
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-primary text-sm">celebration</span>
                                                <h4 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-widest">Events & Occasions</h4>
                                            </div>
                                        )}
                                        <div className="space-y-3">
                                            {selectedDayData.events.map((e, i) => {
                                                const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                                return (
                                                    <div key={i} className="rounded-xl p-4 border transition-all" style={{ background: color.bg, borderColor: color.border + '40' }}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-2xl">{e.emoji}</span>
                                                            <div>
                                                                <p className="font-bold text-[var(--sys-text)] text-sm">{e.name}</p>
                                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: color.border + '30', color: color.border }}>{color.label}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-[11px] text-[var(--sys-text-muted)] mb-3">
                                                            <p>Suggested tone: <span className="font-medium text-[var(--sys-text)]">{e.tone}</span></p>
                                                            <p>Formats: {e.formats?.join(', ')}</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <button onClick={() => handleGenerateContent(e)}
                                                                className="w-full py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all cursor-pointer flex items-center justify-center gap-1.5">
                                                                <span className="material-symbols-outlined text-sm">image</span> Generate Image
                                                            </button>
                                                            <button onClick={() => handleGenerateBlog(e)}
                                                                className="w-full py-2 rounded-lg bg-[#06B6D4]/10 text-[#06B6D4] text-xs font-bold hover:bg-[#06B6D4]/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-[#06B6D4]/20">
                                                                <span className="material-symbols-outlined text-sm">article</span> Generate Blog
                                                            </button>
                                                            <button onClick={() => handleGenerateCampaign(e)}
                                                                className="w-full py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-[var(--sys-border)]">
                                                                <span className="material-symbols-outlined text-sm">campaign</span> Full Campaign Plan
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Empty state */}
                                {selectedDayData.events.length === 0 && selectedDayData.entries.length === 0 && (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">event_available</span>
                                        <p className="text-sm text-[var(--sys-text-muted)]">No events or posts on this day</p>
                                        <div className="flex flex-col gap-2 mt-4">
                                            <button onClick={() => handleGenerateContent({ name: `${monthNames[currentMonth]} ${selectedDate}`, tone: 'general', formats: ['social'] })}
                                                className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all cursor-pointer">
                                                Create Image Content
                                            </button>
                                            <button onClick={() => handleGenerateBlog({ name: `${monthNames[currentMonth]} ${selectedDate}`, tone: 'general' })}
                                                className="px-4 py-2 rounded-lg bg-[#06B6D4]/10 text-[#06B6D4] text-xs font-medium hover:bg-[#06B6D4]/20 transition-all cursor-pointer">
                                                Write a Blog Post
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}

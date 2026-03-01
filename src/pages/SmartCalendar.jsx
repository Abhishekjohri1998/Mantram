import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { getEventsForMonth, getUpcomingEvents, getEventsForDate, EVENT_COLORS, COUNTRIES } from '../data/calendarData'

// ═══════════════════════════════════════════════════════════════
// SMART CALENDAR — Marketing Intelligence Calendar
// ═══════════════════════════════════════════════════════════════

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
    const [selectedEvents, setSelectedEvents] = useState([])
    const [showPanel, setShowPanel] = useState(false)

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    // Get events for current month
    const monthEvents = useMemo(() => {
        return getEventsForMonth(country, currentMonth + 1)
    }, [country, currentMonth])

    // Get upcoming events (next 14 days)
    const upcoming = useMemo(() => {
        return getUpcomingEvents(country, 14)
    }, [country])

    // Calendar grid computation
    const calendarDays = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1).getDay()
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate()

        const days = []

        // Previous month padding
        for (let i = firstDay - 1; i >= 0; i--) {
            days.push({ day: daysInPrevMonth - i, isOtherMonth: true, events: [] })
        }

        // Current month
        for (let d = 1; d <= daysInMonth; d++) {
            const dayEvents = monthEvents.filter(e => e.day === d)
            days.push({
                day: d,
                isOtherMonth: false,
                isToday: d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear(),
                events: dayEvents,
            })
        }

        // Next month padding
        const remaining = 42 - days.length
        for (let i = 1; i <= remaining; i++) {
            days.push({ day: i, isOtherMonth: true, events: [] })
        }

        return days
    }, [currentMonth, currentYear, monthEvents])

    const handleDateClick = (dayObj) => {
        if (dayObj.isOtherMonth) return
        setSelectedDate(dayObj.day)
        setSelectedEvents(dayObj.events)
        setShowPanel(true)
    }

    const handleGenerateContent = (event) => {
        const params = new URLSearchParams({
            occasion: event.name,
            tone: event.tone || '',
            emoji: event.emoji || '',
            type: event.formats?.[0] || 'social',
        })
        navigate(`/content-studio?${params.toString()}`)
    }

    const handleGenerateCampaign = (event) => {
        const params = new URLSearchParams({
            occasion: event.name,
            mode: 'campaign',
        })
        navigate(`/nexus?${params.toString()}`)
    }

    const prevMonth = () => {
        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1) }
        else setCurrentMonth(m => m - 1)
        setShowPanel(false)
    }

    const nextMonth = () => {
        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1) }
        else setCurrentMonth(m => m + 1)
        setShowPanel(false)
    }

    const goToday = () => {
        setCurrentMonth(today.getMonth())
        setCurrentYear(today.getFullYear())
        setShowPanel(false)
    }

    return (
        <DashboardLayout>
            <div className="p-8 max-w-[1400px] mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">
                            <span className="material-symbols-outlined text-primary text-3xl align-middle mr-2">calendar_month</span>
                            Smart Calendar
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">Marketing intelligence calendar for <span className="text-primary font-semibold">{country}</span></p>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Country Switcher */}
                        <div className="relative">
                            <select
                                value={country}
                                onChange={e => setOverrideCountry(e.target.value)}
                                className="input-glass py-2 pl-3 pr-8 rounded-xl text-xs text-white bg-white/[0.04] cursor-pointer appearance-none min-w-[150px]"
                            >
                                {COUNTRIES.map(c => (
                                    <option key={c.id} value={c.id}>{c.flag} {c.label}</option>
                                ))}
                            </select>
                            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">expand_more</span>
                        </div>
                        {/* Event legend */}
                        <div className="hidden lg:flex items-center gap-3 ml-2">
                            {Object.entries(EVENT_COLORS).filter(([k]) => k !== 'brand').map(([key, val]) => (
                                <div key={key} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: val.dot }} />
                                    <span className="text-[10px] text-slate-500">{val.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Upcoming Opportunities Banner */}
                {upcoming.length > 0 && (
                    <div className="glass-panel rounded-2xl p-5 mb-6 border border-primary/10">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-primary">trending_up</span>
                            <h3 className="text-sm font-bold text-white">Upcoming Opportunities</h3>
                        </div>
                        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
                            {upcoming.slice(0, 6).map((e, i) => (
                                <button key={i} onClick={() => handleGenerateContent(e)}
                                    className="flex-shrink-0 glass-panel rounded-xl p-3 min-w-[180px] hover:bg-white/[0.05] transition-all cursor-pointer border border-white/[0.06] group text-left">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-lg">{e.emoji}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-400' : e.daysUntil <= 7 ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/20 text-primary'}`}>
                                            {e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `${e.daysUntil} days`}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-white truncate">{e.name}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Tone: {e.tone}</p>
                                    <div className="flex items-center gap-1 mt-2 text-primary text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="material-symbols-outlined text-xs">auto_awesome</span> Generate Content
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-6">
                    {/* Calendar Grid */}
                    <div className="flex-1">
                        {/* Month Navigation */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer text-slate-400 hover:text-white">
                                    <span className="material-symbols-outlined">chevron_left</span>
                                </button>
                                <h2 className="text-xl font-bold text-white min-w-[200px] text-center">
                                    {monthNames[currentMonth]} {currentYear}
                                </h2>
                                <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-white/[0.06] transition-all cursor-pointer text-slate-400 hover:text-white">
                                    <span className="material-symbols-outlined">chevron_right</span>
                                </button>
                            </div>
                            <button onClick={goToday} className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all cursor-pointer">
                                Today
                            </button>
                        </div>

                        {/* Day Headers */}
                        <div className="grid grid-cols-7 gap-px mb-1">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                <div key={d} className="text-center text-xs text-slate-600 font-bold py-2 uppercase tracking-wider">{d}</div>
                            ))}
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-px bg-white/[0.03] rounded-2xl overflow-hidden border border-white/[0.06]">
                            {calendarDays.map((dayObj, i) => (
                                <button key={i}
                                    onClick={() => handleDateClick(dayObj)}
                                    className={`min-h-[90px] p-2 text-left transition-all cursor-pointer relative group
                                        ${dayObj.isOtherMonth ? 'bg-[#080a14]/80 text-slate-700' : 'bg-[#0c0f1a] hover:bg-white/[0.04]'}
                                        ${dayObj.isToday ? 'ring-2 ring-primary/50 ring-inset' : ''}
                                        ${selectedDate === dayObj.day && !dayObj.isOtherMonth ? 'bg-primary/10' : ''}
                                    `}
                                >
                                    <span className={`text-sm font-semibold ${dayObj.isToday ? 'text-primary' : dayObj.isOtherMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {dayObj.day}
                                    </span>

                                    {/* Event dots */}
                                    {dayObj.events.length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                            {dayObj.events.slice(0, 3).map((e, j) => {
                                                const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                                return (
                                                    <div key={j} className="flex items-center gap-1 truncate">
                                                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color.dot }} />
                                                        <span className="text-[9px] truncate" style={{ color: color.dot }}>{e.emoji} {e.name}</span>
                                                    </div>
                                                )
                                            })}
                                            {dayObj.events.length > 3 && (
                                                <span className="text-[9px] text-slate-500">+{dayObj.events.length - 3} more</span>
                                            )}
                                        </div>
                                    )}

                                    {/* Hover indicator */}
                                    {!dayObj.isOtherMonth && (
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="material-symbols-outlined text-primary text-sm">add_circle</span>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Side Panel — Event Details */}
                    {showPanel && (
                        <div className="w-80 flex-shrink-0 animate-fade-in">
                            <div className="glass-panel rounded-2xl p-5 sticky top-24">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-white">
                                        {monthNames[currentMonth]} {selectedDate}
                                    </h3>
                                    <button onClick={() => setShowPanel(false)} className="text-slate-500 hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">close</span>
                                    </button>
                                </div>

                                {selectedEvents.length > 0 ? (
                                    <div className="space-y-3">
                                        {selectedEvents.map((e, i) => {
                                            const color = EVENT_COLORS[e.type] || EVENT_COLORS.global
                                            return (
                                                <div key={i} className="rounded-xl p-4 border transition-all" style={{ background: color.bg, borderColor: color.border + '40' }}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-2xl">{e.emoji}</span>
                                                        <div>
                                                            <p className="font-bold text-white text-sm">{e.name}</p>
                                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: color.border + '30', color: color.border }}>{color.label}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 mb-3">
                                                        <p>Suggested tone: <span className="font-medium text-white">{e.tone}</span></p>
                                                        <p>Formats: {e.formats?.join(', ')}</p>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <button onClick={() => handleGenerateContent(e)}
                                                            className="w-full py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all cursor-pointer flex items-center justify-center gap-1.5">
                                                            <span className="material-symbols-outlined text-sm">edit_note</span>
                                                            Generate Content
                                                        </button>
                                                        <button onClick={() => handleGenerateCampaign(e)}
                                                            className="w-full py-2 rounded-lg bg-white/[0.06] text-slate-300 text-xs font-medium hover:bg-white/[0.1] transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-white/[0.08]">
                                                            <span className="material-symbols-outlined text-sm">campaign</span>
                                                            Full Campaign Plan
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-4xl text-slate-700 mb-2">event_available</span>
                                        <p className="text-sm text-slate-500">No events on this day</p>
                                        <button onClick={() => handleGenerateContent({ name: `${monthNames[currentMonth]} ${selectedDate}`, tone: 'general', formats: ['social'] })}
                                            className="mt-3 px-4 py-2 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all cursor-pointer">
                                            Create Content Anyway
                                        </button>
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

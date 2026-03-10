/**
 * AgentFidatoPanel — Competitive Intelligence Module
 * 
 * Shared component used in SEO, Performance, and D2C studios.
 * Lets users create, manage, and view intelligence missions that track competitors.
 */

import { useState, useEffect, useCallback } from 'react'
import { useBrand } from '../context/BrandContext'
import IntelReportViewer from './IntelReportViewer'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

const MISSION_TYPES = [
    { value: 'competitor_watch', label: 'Competitor Watch', icon: '👁️', desc: 'General monitoring of competitor activity' },
    { value: 'price_alert', label: 'Price Alert', icon: '💰', desc: 'Track pricing changes and offers' },
    { value: 'ad_monitor', label: 'Ad Monitor', icon: '📺', desc: 'Track new ad campaigns and creatives' },
    { value: 'product_launch', label: 'Product Launch', icon: '🚀', desc: 'Detect new product launches' },
    { value: 'strategy_change', label: 'Strategy Change', icon: '♟️', desc: 'Monitor positioning and strategy shifts' },
]

const FREQUENCY_OPTIONS = [
    { value: 'hourly', label: 'Every Hour' },
    { value: 'every_2h', label: 'Every 2 Hours' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
]

const SEVERITY_COLORS = {
    critical: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', text: '#ef4444', dot: '🔴' },
    notable: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', text: '#f59e0b', dot: '🟡' },
    info: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', text: '#3b82f6', dot: '🔵' },
}

export default function AgentFidatoPanel({ studio = 'seo', panelOnly = false, onClose = null }) {
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id

    const [missions, setMissions] = useState([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [selectedMission, setSelectedMission] = useState(null)
    const [findings, setFindings] = useState(null)
    const [runningMission, setRunningMission] = useState(null)
    const [panelOpen, setPanelOpen] = useState(panelOnly)
    const [showReport, setShowReport] = useState(false)
    const [reportMission, setReportMission] = useState(null)

    // Form state
    const [form, setForm] = useState({
        title: '',
        type: 'competitor_watch',
        targetName: '',
        targetWebsite: '',
        keywords: '',
        instructions: '',
        frequency: 'daily',
    })

    const token = localStorage.getItem('mantram_token')
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }

    // ── Load missions ──
    const loadMissions = useCallback(async () => {
        if (!brandId) return
        try {
            const resp = await fetch(`${API_BASE}/intel/missions?brandId=${brandId}`, { headers })
            if (resp.ok) {
                const data = await resp.json()
                setMissions(data.missions || [])
            }
        } catch (err) {
            console.error('Load missions error:', err)
        } finally {
            setLoading(false)
        }
    }, [brandId, studio])

    useEffect(() => { loadMissions() }, [loadMissions])

    // ── Create mission ──
    const createMission = async () => {
        if (!form.title || !form.targetName) return

        try {
            const resp = await fetch(`${API_BASE}/intel/missions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    brandId,
                    title: form.title,
                    type: form.type,
                    target: {
                        name: form.targetName,
                        website: form.targetWebsite,
                        keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
                    },
                    instructions: form.instructions,
                    frequency: form.frequency,
                    studio,
                }),
            })
            if (resp.ok) {
                setShowCreate(false)
                setForm({ title: '', type: 'competitor_watch', targetName: '', targetWebsite: '', keywords: '', instructions: '', frequency: 'daily' })
                loadMissions()
            }
        } catch (err) {
            console.error('Create mission error:', err)
        }
    }

    // ── Toggle mission status ──
    const toggleMission = async (mission) => {
        const newStatus = mission.status === 'active' ? 'paused' : 'active'
        try {
            await fetch(`${API_BASE}/intel/missions/${mission._id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ status: newStatus }),
            })
            loadMissions()
        } catch (err) {
            console.error('Toggle error:', err)
        }
    }

    // ── Delete mission ──
    const deleteMission = async (id) => {
        try {
            await fetch(`${API_BASE}/intel/missions/${id}`, { method: 'DELETE', headers })
            setSelectedMission(null)
            setFindings(null)
            loadMissions()
        } catch (err) {
            console.error('Delete error:', err)
        }
    }

    // ── Force-run mission ──
    const forceRun = async (id) => {
        setRunningMission(id)
        try {
            const resp = await fetch(`${API_BASE}/intel/missions/${id}/run`, { method: 'POST', headers })
            if (resp.ok) {
                const result = await resp.json()
                // Refresh missions list
                loadMissions()
                // Load insights and auto-open cinematic report
                const findingsResp = await fetch(`${API_BASE}/intel/missions/${id}/findings`, { headers })
                if (findingsResp.ok) {
                    const data = await findingsResp.json()
                    setFindings(data)
                    setSelectedMission(id)
                    // Auto-open the cinematic report if there are findings
                    if (data.findings?.length > 0) {
                        const mission = missions.find(m => m._id === id)
                        setReportMission(mission || { _id: id, title: data.title, type: data.type, target: data.target })
                        setShowReport(true)
                    }
                }
            }
        } catch (err) {
            console.error('Force-run error:', err)
        } finally {
            setRunningMission(null)
        }
    }

    // ── Load insights ──
    const loadFindings = async (id) => {
        try {
            const resp = await fetch(`${API_BASE}/intel/missions/${id}/findings`, { headers })
            if (resp.ok) {
                const data = await resp.json()
                setFindings(data)
                setSelectedMission(id)
            }
        } catch (err) {
            console.error('Load findings error:', err)
        }
    }

    // Count unread alerts
    const unreadCount = missions.reduce((acc, m) => {
        return acc + (m.findings?.filter(f => !f.notified)?.length || 0)
    }, 0)

    if (!brandId) return null

    return (
        <>
            {/* ── Agent Fidato Trigger Card (hidden in panelOnly mode) ── */}
            {!panelOnly && (
                <button
                    onClick={() => setPanelOpen(!panelOpen)}
                    className={`group relative w-full glass-panel rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all duration-300 border ${panelOpen
                        ? 'border-violet-500/40 bg-violet-500/[0.08]'
                        : 'border-white/[0.06] hover:border-violet-500/30 hover:bg-white/[0.04]'
                        }`}
                >
                    {/* Animated icon container */}
                    <div className="relative shrink-0">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${panelOpen
                            ? 'bg-gradient-to-br from-violet-500/30 to-emerald-500/20'
                            : 'bg-gradient-to-br from-violet-500/15 to-emerald-500/10 group-hover:from-violet-500/25 group-hover:to-emerald-500/15'
                            }`}>
                            <span className="material-symbols-outlined text-violet-400 text-xl group-hover:scale-110 transition-transform duration-300">
                                shield
                            </span>
                        </div>
                        {/* Live pulse dot */}
                        {missions.filter(m => m.status === 'active').length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 border border-emerald-300" />
                            </span>
                        )}
                    </div>

                    {/* Text content */}
                    <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white tracking-wide">Agent Fidato</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-violet-500/15 text-violet-400 border border-violet-500/20">
                                Intel
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {missions.length > 0
                                ? `${missions.filter(m => m.status === 'active').length} active · ${missions.reduce((a, m) => a + (m.totalFindings || 0), 0)} insights`
                                : 'Deploy competitive intelligence missions'
                            }
                        </p>
                    </div>

                    {/* Right side — alert badge + arrow */}
                    <div className="flex items-center gap-2 shrink-0">
                        {unreadCount > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-400 text-[11px] font-bold animate-pulse">
                                <span className="material-symbols-outlined text-xs">notifications_active</span>
                                {unreadCount}
                            </span>
                        )}
                        <span className={`material-symbols-outlined text-slate-600 text-lg transition-all duration-300 ${panelOpen ? 'rotate-180 text-violet-400' : 'group-hover:text-slate-400 group-hover:translate-x-0.5'
                            }`}>
                            {panelOpen ? 'close' : 'chevron_right'}
                        </span>
                    </div>
                </button>
            )}

            {/* Intel Panel */}
            {panelOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9998,
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}>
                    {/* Backdrop */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.5)',
                            backdropFilter: 'blur(4px)',
                        }}
                        onClick={() => { setPanelOpen(false); setSelectedMission(null); setFindings(null); if (onClose) onClose() }}
                    />

                    {/* Side Panel */}
                    <div style={{
                        position: 'relative',
                        width: '480px',
                        maxWidth: '90vw',
                        height: '100vh',
                        background: 'linear-gradient(180deg, #0a0c16 0%, #101322 100%)',
                        borderLeft: '1px solid rgba(139, 92, 246, 0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        animation: 'slideInRight 0.3s ease',
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '24px' }}>📡</span>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#a78bfa', letterSpacing: '0.05em' }}>
                                        AGENT FIDATO
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', letterSpacing: '0.1em', fontWeight: 600 }}>
                                        COMPETITIVE INTELLIGENCE
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => setShowCreate(true)}
                                    style={{
                                        padding: '8px 14px',
                                        background: 'rgba(139, 92, 246, 0.2)',
                                        border: '1px solid rgba(139, 92, 246, 0.3)',
                                        borderRadius: '8px',
                                        color: '#a78bfa',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    + NEW MISSION
                                </button>
                                <button
                                    onClick={() => { setPanelOpen(false); setSelectedMission(null); setFindings(null); if (onClose) onClose() }}
                                    style={{
                                        padding: '8px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#64748b',
                                        cursor: 'pointer',
                                        fontSize: '18px',
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>

                            {/* ── Create Mission Form ── */}
                            {showCreate && (
                                <div style={{
                                    background: 'rgba(139, 92, 246, 0.05)',
                                    border: '1px solid rgba(139, 92, 246, 0.2)',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    marginBottom: '20px',
                                }}>
                                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#a78bfa', marginBottom: '16px' }}>
                                        🎯 New Intel Mission
                                    </div>

                                    {/* Mission title */}
                                    <input
                                        placeholder="Mission name (e.g., Track Pedigree pricing)"
                                        value={form.title}
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                        style={inputStyle}
                                    />

                                    {/* Mission type */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                        {MISSION_TYPES.map(mt => (
                                            <button
                                                key={mt.value}
                                                onClick={() => setForm(f => ({ ...f, type: mt.value }))}
                                                style={{
                                                    padding: '10px',
                                                    background: form.type === mt.value ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                                                    border: `1px solid ${form.type === mt.value ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.06)'}`,
                                                    borderRadius: '8px',
                                                    color: form.type === mt.value ? '#a78bfa' : '#94a3b8',
                                                    fontSize: '12px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s',
                                                }}
                                            >
                                                <span style={{ fontSize: '14px' }}>{mt.icon}</span> {mt.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Competitor name */}
                                    <input
                                        placeholder="Competitor name (e.g., Pedigree)"
                                        value={form.targetName}
                                        onChange={e => setForm(f => ({ ...f, targetName: e.target.value }))}
                                        style={inputStyle}
                                    />

                                    {/* Competitor website */}
                                    <input
                                        placeholder="Competitor website (optional, e.g., pedigree.in)"
                                        value={form.targetWebsite}
                                        onChange={e => setForm(f => ({ ...f, targetWebsite: e.target.value }))}
                                        style={inputStyle}
                                    />

                                    {/* Keywords */}
                                    <input
                                        placeholder="Keywords (comma-separated, e.g., dog food, premium, India)"
                                        value={form.keywords}
                                        onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
                                        style={inputStyle}
                                    />

                                    {/* Instructions */}
                                    <textarea
                                        placeholder="Special instructions (e.g., Alert me if they drop prices below ₹500)"
                                        value={form.instructions}
                                        onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                                        rows={2}
                                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                                    />

                                    {/* Frequency */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                        {FREQUENCY_OPTIONS.map(fo => (
                                            <button
                                                key={fo.value}
                                                onClick={() => setForm(f => ({ ...f, frequency: fo.value }))}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: form.frequency === fo.value ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                                                    border: `1px solid ${form.frequency === fo.value ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                                                    borderRadius: '8px',
                                                    color: form.frequency === fo.value ? '#10b981' : '#64748b',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {fo.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={createMission}
                                            disabled={!form.title || !form.targetName}
                                            style={{
                                                flex: 1,
                                                padding: '10px',
                                                background: form.title && form.targetName ? 'linear-gradient(135deg, #8b5cf6, #10b981)' : 'rgba(255,255,255,0.05)',
                                                border: 'none',
                                                borderRadius: '8px',
                                                color: 'white',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                cursor: form.title && form.targetName ? 'pointer' : 'not-allowed',
                                                opacity: form.title && form.targetName ? 1 : 0.5,
                                            }}
                                        >
                                            📡 Deploy Agent
                                        </button>
                                        <button
                                            onClick={() => setShowCreate(false)}
                                            style={{
                                                padding: '10px 16px',
                                                background: 'transparent',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '8px',
                                                color: '#64748b',
                                                fontSize: '13px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ── Findings Detail View ── */}
                            {findings && (
                                <div style={{ marginBottom: '20px' }}>
                                    <button
                                        onClick={() => { setFindings(null); setSelectedMission(null) }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#a78bfa',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            marginBottom: '12px',
                                            padding: 0,
                                        }}
                                    >
                                        ← Back to missions
                                    </button>

                                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>
                                        {findings.title}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '16px' }}>
                                        Target: {findings.target?.name} → {findings.stats?.totalFindings} insights from {findings.stats?.totalChecks} checks
                                    </div>

                                    {findings.findings?.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#475569', fontSize: '13px' }}>
                                            No insights yet. Agent is monitoring 📡
                                        </div>
                                    )}

                                    {findings.findings?.map((f, i) => {
                                        const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.info
                                        return (
                                            <div
                                                key={i}
                                                style={{
                                                    background: sev.bg,
                                                    border: `1px solid ${sev.border}`,
                                                    borderRadius: '10px',
                                                    padding: '14px',
                                                    marginBottom: '10px',
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 700, color: sev.text, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                                        {sev.dot} {f.severity}
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                        {new Date(f.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                                    {f.summary}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* ── Missions List ── */}
                            {!findings && (
                                <>
                                    {loading && (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                            Loading missions...
                                        </div>
                                    )}

                                    {!loading && missions.length === 0 && !showCreate && (
                                        <div style={{ textAlign: 'center', padding: '40px' }}>
                                            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📡</div>
                                            <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
                                                No active missions
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '16px' }}>
                                                Deploy Agent Fidato to track your competitors
                                            </div>
                                            <button
                                                onClick={() => setShowCreate(true)}
                                                style={{
                                                    padding: '10px 20px',
                                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(16, 185, 129, 0.2))',
                                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                                    borderRadius: '10px',
                                                    color: '#a78bfa',
                                                    fontWeight: 700,
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                + Create First Mission
                                            </button>
                                        </div>
                                    )}

                                    {missions.map(m => {
                                        const typeInfo = MISSION_TYPES.find(mt => mt.value === m.type) || MISSION_TYPES[0]
                                        const isRunning = runningMission === m._id
                                        const unread = m.findings?.filter(f => !f.notified)?.length || 0

                                        return (
                                            <div
                                                key={m._id}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                                    borderRadius: '12px',
                                                    padding: '16px',
                                                    marginBottom: '10px',
                                                    transition: 'all 0.2s',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => {
                                                    setReportMission(m)
                                                    loadFindings(m._id).then(() => setShowReport(true))
                                                }}
                                                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)' }}
                                                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)' }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <span style={{ fontSize: '16px' }}>{typeInfo.icon}</span>
                                                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {m.title}
                                                            </span>
                                                            {unread > 0 && (
                                                                <span style={{
                                                                    background: '#ef4444',
                                                                    color: 'white',
                                                                    borderRadius: '9999px',
                                                                    padding: '1px 6px',
                                                                    fontSize: '10px',
                                                                    fontWeight: 800,
                                                                }}>
                                                                    {unread}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                                                            Target: <span style={{ color: '#94a3b8' }}>{m.target?.name}</span>
                                                            {m.lastCheckedAt && (
                                                                <> → Last check: {new Date(m.lastCheckedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        <button
                                                            onClick={() => forceRun(m._id)}
                                                            disabled={isRunning}
                                                            title={m.lastCheckedAt ? `Last run: ${new Date(m.lastCheckedAt).toLocaleString()}. Click to re-run.` : 'Run now'}
                                                            style={{
                                                                padding: '6px 10px',
                                                                background: isRunning ? 'rgba(139, 92, 246, 0.3)'
                                                                    : m.lastCheckedAt ? 'rgba(16, 185, 129, 0.08)'
                                                                        : 'rgba(16, 185, 129, 0.15)',
                                                                border: `1px solid ${isRunning ? 'rgba(139,92,246,0.4)' : m.lastCheckedAt ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.3)'}`,
                                                                borderRadius: '6px',
                                                                color: isRunning ? '#a78bfa' : '#10b981',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                cursor: isRunning ? 'wait' : 'pointer',
                                                            }}
                                                        >
                                                            {isRunning ? '⏳ SCANNING...' : m.lastCheckedAt ? '↻ RE-RUN' : '▶ RUN'}
                                                        </button>
                                                        <button
                                                            onClick={() => toggleMission(m)}
                                                            title={m.status === 'active' ? 'Pause' : 'Resume'}
                                                            style={{
                                                                padding: '6px 10px',
                                                                background: 'rgba(255, 255, 255, 0.03)',
                                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                                borderRadius: '6px',
                                                                color: m.status === 'active' ? '#f59e0b' : '#10b981',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            {m.status === 'active' ? '⏸' : '▶'}
                                                        </button>
                                                        <button
                                                            onClick={() => deleteMission(m._id)}
                                                            title="Delete"
                                                            style={{
                                                                padding: '6px 10px',
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                borderRadius: '6px',
                                                                color: '#ef4444',
                                                                fontSize: '11px',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Status bar */}
                                                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        background: m.status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                        color: m.status === 'active' ? '#10b981' : '#f59e0b',
                                                        border: `1px solid ${m.status === 'active' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.08em',
                                                    }}>
                                                        {m.status === 'active' ? '🟢 ACTIVE' : '⏸ PAUSED'}
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: '#475569', letterSpacing: '0.05em' }}>
                                                        {FREQUENCY_OPTIONS.find(f => f.value === m.frequency)?.label || m.frequency}
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: '#475569' }}>
                                                        → {m.totalFindings || 0} insights
                                                    </span>
                                                    {(m.totalFindings || 0) > 0 && (
                                                        <span style={{
                                                            marginLeft: 'auto',
                                                            fontSize: '9px', fontWeight: 800, fontFamily: 'monospace',
                                                            letterSpacing: '0.15em', color: '#8b5cf6',
                                                            padding: '2px 8px', borderRadius: '4px',
                                                            background: 'rgba(139,92,246,0.1)',
                                                            border: '1px solid rgba(139,92,246,0.2)',
                                                            animation: 'slideInRight 0.3s ease',
                                                        }}>
                                                            VIEW INSIGHTS
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )
            }

            {/* Cinematic Intel Report Overlay */}
            {
                showReport && findings && (
                    <IntelReportViewer
                        mission={reportMission}
                        findings={findings}
                        onClose={() => { setShowReport(false); setReportMission(null); setFindings(null); setSelectedMission(null) }}
                    />
                )
            }

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
        </>
    )
}

const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '13px',
    outline: 'none',
    marginBottom: '10px',
    fontFamily: 'inherit',
}

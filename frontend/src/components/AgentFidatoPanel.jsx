/**
 * AgentFidatoPanel — Competitive Intelligence Command Center
 * 
 * Premium agentic side panel with animated UI, radar visualisation,
 * and mission management for tracking competitors.
 */

import { useState, useEffect, useCallback } from 'react'
import { useBrand } from '../context/BrandContext'
import IntelReportViewer from './IntelReportViewer'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

const MISSION_TYPES = [
    { value: 'competitor_watch', label: 'Competitor Watch', icon: 'visibility', desc: 'General monitoring of competitor activity', color: '#8b5cf6' },
    { value: 'price_alert', label: 'Price Alert', icon: 'payments', desc: 'Track pricing changes and offers', color: '#f59e0b' },
    { value: 'ad_monitor', label: 'Ad Monitor', icon: 'campaign', desc: 'Track new ad campaigns and creatives', color: '#ec4899' },
    { value: 'product_launch', label: 'Product Launch', icon: 'rocket_launch', desc: 'Detect new product launches', color: '#06b6d4' },
    { value: 'strategy_change', label: 'Strategy Change', icon: 'psychology', desc: 'Monitor positioning and strategy shifts', color: '#10b981' },
]

const FREQUENCY_OPTIONS = [
    { value: 'hourly', label: 'Hourly', icon: 'speed' },
    { value: 'every_2h', label: '2 Hours', icon: 'timer' },
    { value: 'daily', label: 'Daily', icon: 'today' },
    { value: 'weekly', label: 'Weekly', icon: 'date_range' },
]

const SEVERITY_COLORS = {
    critical: { bg: 'rgba(239, 68, 68, 0.1)', border: 'rgba(239, 68, 68, 0.25)', text: '#f87171', icon: 'error' },
    notable: { bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.25)', text: '#fbbf24', icon: 'warning' },
    info: { bg: 'rgba(99, 102, 241, 0.1)', border: 'rgba(99, 102, 241, 0.25)', text: '#818cf8', icon: 'info' },
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
                loadMissions()
                const findingsResp = await fetch(`${API_BASE}/intel/missions/${id}/findings`, { headers })
                if (findingsResp.ok) {
                    const data = await findingsResp.json()
                    setFindings(data)
                    setSelectedMission(id)
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

    const unreadCount = missions.reduce((acc, m) => acc + (m.findings?.filter(f => !f.notified)?.length || 0), 0)
    const activeMissions = missions.filter(m => m.status === 'active')
    const totalInsights = missions.reduce((a, m) => a + (m.totalFindings || 0), 0)
    const closePanel = () => { setPanelOpen(false); setSelectedMission(null); setFindings(null); if (onClose) onClose() }

    if (!brandId) return null

    const selectedType = MISSION_TYPES.find(mt => mt.value === form.type) || MISSION_TYPES[0]

    return (
        <>
            {/* ── Trigger Card (hidden in panelOnly mode) ── */}
            {!panelOnly && (
                <button
                    onClick={() => setPanelOpen(!panelOpen)}
                    className={`group relative w-full glass-panel rounded-2xl p-4 flex items-center gap-4 cursor-pointer transition-all duration-300 border ${panelOpen
                        ? 'border-violet-500/40 bg-violet-500/[0.08]'
                        : 'border-white/[0.06] hover:border-violet-500/30 hover:bg-white/[0.04]'
                        }`}
                >
                    <div className="relative shrink-0">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${panelOpen
                            ? 'bg-gradient-to-br from-violet-500/30 to-emerald-500/20'
                            : 'bg-gradient-to-br from-violet-500/15 to-emerald-500/10 group-hover:from-violet-500/25 group-hover:to-emerald-500/15'
                            }`}>
                            <span className="material-symbols-outlined text-violet-400 text-xl group-hover:scale-110 transition-transform duration-300">shield</span>
                        </div>
                        {activeMissions.length > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 border border-emerald-300" />
                            </span>
                        )}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white tracking-wide">Agent Fidato</span>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-violet-500/15 text-violet-400 border border-violet-500/20">Intel</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {missions.length > 0 ? `${activeMissions.length} active · ${totalInsights} insights` : 'Deploy competitive intelligence missions'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {unreadCount > 0 && (
                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/25 text-rose-400 text-[11px] font-bold animate-pulse">
                                <span className="material-symbols-outlined text-xs">notifications_active</span>{unreadCount}
                            </span>
                        )}
                        <span className={`material-symbols-outlined text-slate-600 text-lg transition-all duration-300 ${panelOpen ? 'rotate-180 text-violet-400' : 'group-hover:text-slate-400'}`}>
                            {panelOpen ? 'close' : 'chevron_right'}
                        </span>
                    </div>
                </button>
            )}

            {/* ══════════════════════════════════════════════ */}
            {/* INTEL COMMAND CENTER — Side Panel              */}
            {/* ══════════════════════════════════════════════ */}
            {panelOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
                    {/* Backdrop */}
                    <div
                        onClick={closePanel}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
                    />

                    {/* ── Side Panel ── */}
                    <div className="fidato-panel-slide fidato-panel-container" style={{
                        position: 'relative',
                        width: '520px',
                        maxWidth: '92vw',
                        height: '100vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        {/* Layered background */}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0b0d1a 0%, #0d1025 40%, #0f0a1a 100%)' }} />
                        {/* Grid overlay */}
                        <div style={{
                            position: 'absolute', inset: 0, opacity: 0.03,
                            backgroundImage: 'linear-gradient(rgba(139,92,246,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.4) 1px, transparent 1px)',
                            backgroundSize: '24px 24px',
                        }} />
                        {/* Top glow */}
                        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 400, height: 200, background: 'radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
                        {/* Left accent line */}
                        <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0, width: 2,
                            background: 'linear-gradient(180deg, #8b5cf6 0%, rgba(139,92,246,0.3) 30%, rgba(16,185,129,0.2) 70%, transparent 100%)',
                        }} />

                        {/* ─────── HEADER ─────── */}
                        <div style={{ position: 'relative', padding: '20px 24px 16px', borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    {/* Animated shield */}
                                    <div className="fidato-icon-pulse" style={{
                                        width: 48, height: 48, borderRadius: 14,
                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(16,185,129,0.12) 100%)',
                                        border: '1px solid rgba(139,92,246,0.3)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 0 24px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
                                    }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 26, color: '#a78bfa', filter: 'drop-shadow(0 0 6px rgba(139,92,246,0.5))' }}>shield</span>
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 17, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.02em' }}>Agent Fidato</span>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 6, fontSize: 9, fontWeight: 800,
                                                letterSpacing: '0.18em', textTransform: 'uppercase',
                                                background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(16,185,129,0.15))',
                                                border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa',
                                            }}>INTEL</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2, letterSpacing: '0.06em' }}>
                                            COMPETITIVE INTELLIGENCE CENTER
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={closePanel}
                                    style={{
                                        width: 36, height: 36, borderRadius: 10,
                                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                        color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s',
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.color = '#f87171' }}
                                    onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#64748b' }}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                                </button>
                            </div>

                            {/* Stats ribbon */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                {[
                                    { label: 'Missions', value: missions.length, icon: 'target', color: '#8b5cf6' },
                                    { label: 'Active', value: activeMissions.length, icon: 'radar', color: '#10b981' },
                                    { label: 'Insights', value: totalInsights, icon: 'lightbulb', color: '#f59e0b' },
                                ].map((s, i) => (
                                    <div key={i} style={{
                                        flex: 1, padding: '10px 12px', borderRadius: 10,
                                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                                        textAlign: 'center',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 2 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: s.color }}>{s.icon}</span>
                                            <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</span>
                                        </div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Deploy button */}
                            <button
                                onClick={() => setShowCreate(!showCreate)}
                                className="fidato-deploy-btn"
                                style={{
                                    width: '100%', marginTop: 12, padding: '12px 0',
                                    background: showCreate ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(16,185,129,0.12))',
                                    border: `1px solid ${showCreate ? 'rgba(255,255,255,0.08)' : 'rgba(139,92,246,0.3)'}`,
                                    borderRadius: 10, color: showCreate ? '#94a3b8' : '#a78bfa',
                                    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    transition: 'all 0.3s',
                                    boxShadow: showCreate ? 'none' : '0 0 20px rgba(139,92,246,0.1)',
                                }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{showCreate ? 'close' : 'add_circle'}</span>
                                {showCreate ? 'CANCEL' : 'DEPLOY NEW MISSION'}
                            </button>
                        </div>

                        {/* ─────── CONTENT AREA ─────── */}
                        <div className="fidato-content" style={{ position: 'relative', flex: 1, overflow: 'auto', padding: '16px 20px' }}>

                            {/* ── Create Mission Form ── */}
                            {showCreate && (
                                <div className="fidato-form-slide" style={{
                                    background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(16,185,129,0.04))',
                                    border: '1px solid rgba(139,92,246,0.15)', borderRadius: 14,
                                    padding: 20, marginBottom: 20,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a78bfa' }}>target</span>
                                        <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.04em' }}>NEW INTEL MISSION</span>
                                    </div>

                                    <input
                                        placeholder="Mission name (e.g., Track Pedigree pricing)"
                                        value={form.title}
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                        style={inputStyle}
                                    />

                                    {/* Mission type grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                                        {MISSION_TYPES.map(mt => (
                                            <button
                                                key={mt.value}
                                                onClick={() => setForm(f => ({ ...f, type: mt.value }))}
                                                style={{
                                                    padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8,
                                                    background: form.type === mt.value ? `${mt.color}18` : 'rgba(255,255,255,0.02)',
                                                    border: `1px solid ${form.type === mt.value ? `${mt.color}50` : 'rgba(255,255,255,0.06)'}`,
                                                    borderRadius: 10, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                                                }}
                                            >
                                                <span className="material-symbols-outlined" style={{
                                                    fontSize: 16, color: form.type === mt.value ? mt.color : '#64748b',
                                                }}>{mt.icon}</span>
                                                <div>
                                                    <div style={{ fontSize: 11, fontWeight: 700, color: form.type === mt.value ? 'white' : '#94a3b8' }}>{mt.label}</div>
                                                    <div style={{ fontSize: 9, color: '#475569', marginTop: 1 }}>{mt.desc}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    <input placeholder="Competitor name" value={form.targetName} onChange={e => setForm(f => ({ ...f, targetName: e.target.value }))} style={inputStyle} />
                                    <input placeholder="Competitor website (optional)" value={form.targetWebsite} onChange={e => setForm(f => ({ ...f, targetWebsite: e.target.value }))} style={inputStyle} />
                                    <input placeholder="Keywords (comma-separated)" value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} style={inputStyle} />
                                    <textarea placeholder="Special instructions for the agent..." value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

                                    {/* Frequency */}
                                    <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                                        {FREQUENCY_OPTIONS.map(fo => (
                                            <button
                                                key={fo.value}
                                                onClick={() => setForm(f => ({ ...f, frequency: fo.value }))}
                                                style={{
                                                    flex: 1, padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                                                    background: form.frequency === fo.value ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.02)',
                                                    border: `1px solid ${form.frequency === fo.value ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.06)'}`,
                                                    borderRadius: 8, color: form.frequency === fo.value ? '#10b981' : '#64748b',
                                                    fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                                                }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{fo.icon}</span>
                                                {fo.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Deploy action */}
                                    <button
                                        onClick={createMission}
                                        disabled={!form.title || !form.targetName}
                                        className="fidato-deploy-btn"
                                        style={{
                                            width: '100%', padding: 12,
                                            background: form.title && form.targetName ? 'linear-gradient(135deg, #8b5cf6, #10b981)' : 'rgba(255,255,255,0.05)',
                                            border: 'none', borderRadius: 10, color: 'white',
                                            fontSize: 13, fontWeight: 700, cursor: form.title && form.targetName ? 'pointer' : 'not-allowed',
                                            opacity: form.title && form.targetName ? 1 : 0.4,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                            boxShadow: form.title && form.targetName ? '0 4px 20px rgba(139,92,246,0.3)' : 'none',
                                            letterSpacing: '0.06em', transition: 'all 0.3s',
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
                                        DEPLOY AGENT
                                    </button>
                                </div>
                            )}

                            {/* ── Findings Detail View ── */}
                            {findings && (
                                <div style={{ marginBottom: 20 }}>
                                    <button
                                        onClick={() => { setFindings(null); setSelectedMission(null) }}
                                        style={{
                                            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                                            borderRadius: 8, color: '#a78bfa', fontSize: 11, fontWeight: 700,
                                            cursor: 'pointer', marginBottom: 16, padding: '6px 12px',
                                            display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.04em',
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_back</span>
                                        BACK TO MISSIONS
                                    </button>

                                    <div style={{
                                        padding: 16, borderRadius: 12, marginBottom: 16,
                                        background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(16,185,129,0.05))',
                                        border: '1px solid rgba(139,92,246,0.15)',
                                    }}>
                                        <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 4 }}>{findings.title}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#64748b' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#8b5cf6' }}>target</span>
                                            {findings.target?.name}
                                            <span style={{ color: '#334155' }}>•</span>
                                            {findings.stats?.totalFindings} insights from {findings.stats?.totalChecks} checks
                                        </div>
                                    </div>

                                    {findings.findings?.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: 40 }}>
                                            <div style={{ marginBottom: 12 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#475569' }}>radar</span>
                                            </div>
                                            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Agent monitoring... No insights yet</div>
                                        </div>
                                    )}

                                    {findings.findings?.map((f, i) => {
                                        const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.info
                                        return (
                                            <div key={i} className="fidato-finding-card" style={{
                                                background: sev.bg, border: `1px solid ${sev.border}`,
                                                borderRadius: 12, padding: 16, marginBottom: 10,
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: sev.text }}>{sev.icon}</span>
                                                        <span style={{ fontSize: 10, fontWeight: 800, color: sev.text, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                                            {f.severity}
                                                        </span>
                                                    </div>
                                                    <span style={{ fontSize: 10, color: '#475569' }}>
                                                        {new Date(f.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
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
                                        <div style={{ textAlign: 'center', padding: 50 }}>
                                            <div className="fidato-loading-radar" style={{
                                                width: 60, height: 60, margin: '0 auto 16px', borderRadius: '50%',
                                                border: '2px solid rgba(139,92,246,0.2)',
                                                borderTopColor: '#8b5cf6',
                                            }} />
                                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: '0.08em' }}>SCANNING...</div>
                                        </div>
                                    )}

                                    {!loading && missions.length === 0 && !showCreate && (
                                        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                            {/* Animated radar empty state */}
                                            <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 20px' }}>
                                                <svg width="120" height="120" viewBox="0 0 120 120">
                                                    <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(139,92,246,0.1)" strokeWidth="1" />
                                                    <circle cx="60" cy="60" r="36" fill="none" stroke="rgba(139,92,246,0.08)" strokeWidth="1" />
                                                    <circle cx="60" cy="60" r="20" fill="none" stroke="rgba(139,92,246,0.12)" strokeWidth="1" />
                                                    <line x1="60" y1="6" x2="60" y2="114" stroke="rgba(139,92,246,0.05)" strokeWidth="0.5" />
                                                    <line x1="6" y1="60" x2="114" y2="60" stroke="rgba(139,92,246,0.05)" strokeWidth="0.5" />
                                                    <circle cx="60" cy="60" r="3" fill="#8b5cf6" opacity="0.5" />
                                                </svg>
                                                <svg width="120" height="120" viewBox="0 0 120 120" className="fidato-sweep" style={{ position: 'absolute', inset: 0 }}>
                                                    <defs>
                                                        <linearGradient id="fidatoSweepGrad" gradientTransform="rotate(90)">
                                                            <stop offset="0%" stopColor="rgba(139,92,246,0.4)" />
                                                            <stop offset="100%" stopColor="transparent" />
                                                        </linearGradient>
                                                    </defs>
                                                    <path d="M60,60 L60,10 A50,50 0 0,1 100,38 Z" fill="url(#fidatoSweepGrad)" />
                                                    <line x1="60" y1="60" x2="60" y2="10" stroke="rgba(139,92,246,0.5)" strokeWidth="1" />
                                                </svg>
                                            </div>
                                            <div style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0', marginBottom: 6 }}>Deploy Your First Agent</div>
                                            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, maxWidth: 280, margin: '0 auto 20px' }}>
                                                Track competitor pricing, ad launches, strategy shifts, and product updates in real-time with AI-powered agents
                                            </div>
                                            <button
                                                onClick={() => setShowCreate(true)}
                                                style={{
                                                    padding: '12px 28px', background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(16,185,129,0.15))',
                                                    border: '1px solid rgba(139,92,246,0.35)', borderRadius: 10, color: '#a78bfa',
                                                    fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em',
                                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                                    boxShadow: '0 0 20px rgba(139,92,246,0.12)',
                                                    transition: 'all 0.3s',
                                                }}
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
                                                CREATE MISSION
                                            </button>
                                        </div>
                                    )}

                                    {/* Mission cards */}
                                    {missions.map((m, idx) => {
                                        const typeInfo = MISSION_TYPES.find(mt => mt.value === m.type) || MISSION_TYPES[0]
                                        const isRunning = runningMission === m._id
                                        const unread = m.findings?.filter(f => !f.notified)?.length || 0
                                        const isActive = m.status === 'active'

                                        return (
                                            <div
                                                key={m._id}
                                                className="fidato-mission-card"
                                                style={{
                                                    background: 'rgba(255,255,255,0.02)',
                                                    border: `1px solid rgba(255,255,255,0.06)`,
                                                    borderRadius: 14, padding: 16, marginBottom: 10,
                                                    cursor: 'pointer', transition: 'all 0.25s',
                                                    animationDelay: `${idx * 60}ms`,
                                                }}
                                                onClick={() => {
                                                    setReportMission(m)
                                                    loadFindings(m._id).then(() => setShowReport(true))
                                                }}
                                                onMouseOver={e => { e.currentTarget.style.borderColor = `${typeInfo.color}40`; e.currentTarget.style.background = `${typeInfo.color}08` }}
                                                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                                    {/* Icon */}
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                                        background: `${typeInfo.color}15`, border: `1px solid ${typeInfo.color}25`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 20, color: typeInfo.color }}>{typeInfo.icon}</span>
                                                    </div>

                                                    {/* Content */}
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {m.title}
                                                            </span>
                                                            {unread > 0 && (
                                                                <span style={{
                                                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', borderRadius: 99,
                                                                    padding: '1px 7px', fontSize: 10, fontWeight: 800, flexShrink: 0,
                                                                }}>{unread}</span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>target</span>
                                                            {m.target?.name}
                                                            {m.lastCheckedAt && (
                                                                <span style={{ color: '#475569' }}>
                                                                    • {new Date(m.lastCheckedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Status + Actions row */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                                                    {/* Status badge */}
                                                    <span style={{
                                                        padding: '3px 10px', borderRadius: 6, fontSize: 9, fontWeight: 800,
                                                        letterSpacing: '0.1em', textTransform: 'uppercase',
                                                        background: isActive ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
                                                        color: isActive ? '#10b981' : '#f59e0b',
                                                        border: `1px solid ${isActive ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.2)'}`,
                                                        display: 'flex', alignItems: 'center', gap: 4,
                                                    }}>
                                                        <span style={{ width: 5, height: 5, borderRadius: 99, background: isActive ? '#10b981' : '#f59e0b' }} />
                                                        {isActive ? 'ACTIVE' : 'PAUSED'}
                                                    </span>
                                                    <span style={{ fontSize: 9, color: '#475569', letterSpacing: '0.04em' }}>
                                                        {FREQUENCY_OPTIONS.find(f => f.value === m.frequency)?.label || m.frequency}
                                                    </span>
                                                    <span style={{ fontSize: 9, color: '#475569' }}>
                                                        • {m.totalFindings || 0} insights
                                                    </span>

                                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                                        <button onClick={() => forceRun(m._id)} disabled={isRunning} style={actionBtnStyle(isRunning ? '#8b5cf6' : '#10b981')}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{isRunning ? 'hourglass_top' : 'play_arrow'}</span>
                                                        </button>
                                                        <button onClick={() => toggleMission(m)} style={actionBtnStyle(isActive ? '#f59e0b' : '#10b981')}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{isActive ? 'pause' : 'play_arrow'}</span>
                                                        </button>
                                                        <button onClick={() => deleteMission(m._id)} style={actionBtnStyle('#ef4444')}>
                                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* View insights bar */}
                                                {(m.totalFindings || 0) > 0 && (
                                                    <div style={{
                                                        marginTop: 10, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                        fontSize: 10, fontWeight: 700, color: '#8b5cf6', letterSpacing: '0.1em',
                                                        opacity: 0.7, transition: 'opacity 0.2s',
                                                    }}
                                                        onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                                        onMouseOut={e => e.currentTarget.style.opacity = '0.7'}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>visibility</span>
                                                        VIEW FULL REPORT
                                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>arrow_forward</span>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Cinematic Intel Report Overlay */}
            {showReport && findings && (
                <IntelReportViewer
                    mission={reportMission}
                    findings={findings}
                    onClose={() => { setShowReport(false); setReportMission(null); setFindings(null); setSelectedMission(null) }}
                />
            )}

            <style>{`
                @keyframes fidatoPanelSlide { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                @keyframes fidatoSweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fidatoIconPulse { 0%,100% { box-shadow: 0 0 24px rgba(139,92,246,0.15); } 50% { box-shadow: 0 0 36px rgba(139,92,246,0.3); } }
                @keyframes fidatoLoadingRadar { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fidatoFormSlide { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes fidatoCardSlide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
                .fidato-panel-slide { animation: fidatoPanelSlide 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
                .fidato-sweep { animation: fidatoSweep 3s linear infinite; transform-origin: 60px 60px; }
                .fidato-icon-pulse { animation: fidatoIconPulse 3s ease-in-out infinite; }
                .fidato-loading-radar { animation: fidatoLoadingRadar 0.8s linear infinite; }
                .fidato-form-slide { animation: fidatoFormSlide 0.3s ease-out; }
                .fidato-mission-card { animation: fidatoCardSlide 0.4s ease-out both; }
                .fidato-content::-webkit-scrollbar { width: 4px; }
                .fidato-content::-webkit-scrollbar-track { background: transparent; }
                .fidato-content::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 4px; }
                .fidato-content::-webkit-scrollbar-thumb:hover { background: rgba(139,92,246,0.4); }
                .fidato-deploy-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
                
                /* ── Fidato Mobile Responsive ── */
                @media (max-width: 768px) {
                    .fidato-panel-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        border-radius: 0 !important;
                    }
                    .fidato-content { padding: 12px 14px !important; }
                    .fidato-mission-card { padding: 12px !important; }
                }
            `}</style>
        </>
    )
}

const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    color: '#e2e8f0',
    fontSize: 13,
    outline: 'none',
    marginBottom: 10,
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
}

const actionBtnStyle = (color) => ({
    width: 28, height: 28, borderRadius: 7,
    background: `${color}10`, border: `1px solid ${color}25`,
    color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s',
})

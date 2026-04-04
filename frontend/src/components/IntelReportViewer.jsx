/**
 * IntelReportViewer — Cinematic Premium Intelligence Report
 * 
 * Full-screen overlay with dramatic SVG animations:
 * Phase 1: Black screen → scanner line sweep
 * Phase 2: Radar crosshair + "CONFIDENTIAL" stamp
 * Phase 3: Typewriter decode of report content
 * Phase 4: Staggered finding cards slide in
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const THREAT_COLORS = {
    critical: { primary: '#ef4444', glow: 'rgba(239,68,68,0.4)', label: 'CRITICAL', bar: 100 },
    notable: { primary: '#f59e0b', glow: 'rgba(245,158,11,0.4)', label: 'NOTABLE', bar: 65 },
    info: { primary: '#06b6d4', glow: 'rgba(6,182,212,0.4)', label: 'INTEL', bar: 30 },
}

export default function IntelReportViewer({ mission, findings, onClose }) {
    const [phase, setPhase] = useState(0) // 0=scanner, 1=stamp, 2=content, 3=findings
    const [decodedLines, setDecodedLines] = useState(0)
    const [visibleFindings, setVisibleFindings] = useState(0)
    const scrollRef = useRef(null)

    // ── Animation sequence ──
    useEffect(() => {
        const timers = []
        timers.push(setTimeout(() => setPhase(1), 800))    // Scanner → stamp
        timers.push(setTimeout(() => setPhase(2), 1800))   // Stamp → content
        timers.push(setTimeout(() => setPhase(3), 2600))   // Content → findings
        return () => timers.forEach(clearTimeout)
    }, [])

    // ── Typewriter decode for header lines ──
    useEffect(() => {
        if (phase < 2) return
        let line = 0
        const maxLines = 5
        const interval = setInterval(() => {
            line++
            setDecodedLines(line)
            if (line >= maxLines) clearInterval(interval)
        }, 150)
        return () => clearInterval(interval)
    }, [phase])

    // ── Stagger findings appearance ──
    useEffect(() => {
        if (phase < 3) return
        const count = findings?.findings?.length || 0
        let idx = 0
        const interval = setInterval(() => {
            idx++
            setVisibleFindings(idx)
            if (idx >= count) clearInterval(interval)
        }, 200)
        return () => clearInterval(interval)
    }, [phase, findings])

    const timestamp = new Date().toLocaleString('en-IN', {
        dateStyle: 'medium', timeStyle: 'short', hour12: false,
    })

    const missionType = mission?.type?.replace('_', ' ').toUpperCase() || 'INTEL'
    const targetName = findings?.target?.name || mission?.target?.name || 'UNKNOWN'
    const totalFindings = findings?.findings?.length || 0
    const criticalCount = findings?.findings?.filter(f => f.severity === 'critical').length || 0

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {/* ═══ Phase 0: Scanner Line Sweep ═══ */}
            <svg width="100%" height="100%" style={{
                position: 'absolute', inset: 0, opacity: phase < 2 ? 1 : 0,
                transition: 'opacity 0.5s ease', pointerEvents: 'none',
            }}>
                <defs>
                    <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="transparent" />
                        <stop offset="45%" stopColor="rgba(255, 77, 0,0.03)" />
                        <stop offset="50%" stopColor="rgba(255, 77, 0,0.5)" />
                        <stop offset="55%" stopColor="rgba(255, 77, 0,0.03)" />
                        <stop offset="100%" stopColor="transparent" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill="url(#scanGrad)">
                    <animateTransform attributeName="transform" type="translate"
                        from="0 -200" to="0 2000" dur="1.5s" repeatCount="indefinite" />
                </rect>
                {/* Grid overlay */}
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="40" y2="0" stroke="rgba(255, 77, 0,0.06)" strokeWidth="0.5" />
                    <line x1="0" y1="0" x2="0" y2="40" stroke="rgba(255, 77, 0,0.06)" strokeWidth="0.5" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* ═══ Phase 1: Radar Crosshair + CONFIDENTIAL Stamp ═══ */}
            {phase >= 1 && (
                <div style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
                    opacity: phase === 1 ? 1 : 0, transition: 'opacity 0.6s ease',
                }}>
                    {/* Crosshair SVG */}
                    <svg width="300" height="300" viewBox="0 0 300 300" style={{
                        position: 'absolute', animation: 'intel-crosshair-appear 0.6s ease-out',
                    }}>
                        {/* Rings */}
                        <circle cx="150" cy="150" r="120" fill="none" stroke="rgba(255, 77, 0,0.2)" strokeWidth="1" />
                        <circle cx="150" cy="150" r="80" fill="none" stroke="rgba(255, 77, 0,0.15)" strokeWidth="1" />
                        <circle cx="150" cy="150" r="40" fill="none" stroke="rgba(255, 77, 0,0.3)" strokeWidth="1.5" />
                        {/* Crosshair lines */}
                        <line x1="150" y1="10" x2="150" y2="290" stroke="rgba(255, 77, 0,0.3)" strokeWidth="0.5" strokeDasharray="4 4" />
                        <line x1="10" y1="150" x2="290" y2="150" stroke="rgba(255, 77, 0,0.3)" strokeWidth="0.5" strokeDasharray="4 4" />
                        {/* Rotating sweep */}
                        <g style={{ transformOrigin: '150px 150px', animation: 'intel-sweep 2s linear infinite' }}>
                            <defs>
                                <linearGradient id="sweepG" gradientTransform="rotate(90)">
                                    <stop offset="0%" stopColor="rgba(255, 77, 0,0.4)" />
                                    <stop offset="100%" stopColor="transparent" />
                                </linearGradient>
                            </defs>
                            <path d="M150,150 L150,30 A120,120 0 0,1 254,90 Z" fill="url(#sweepG)" />
                            <line x1="150" y1="150" x2="150" y2="30" stroke="rgba(255, 77, 0,0.8)" strokeWidth="1.5" />
                        </g>
                        {/* Center */}
                        <circle cx="150" cy="150" r="4" fill="#FF4D00" />
                        <circle cx="150" cy="150" r="8" fill="none" stroke="#FF4D00" strokeWidth="1" opacity="0.5" />
                    </svg>

                    {/* CONFIDENTIAL stamp */}
                    <div style={{
                        position: 'absolute',
                        animation: 'intel-stamp 0.4s cubic-bezier(0.34,1.56,0.64,1) 0.4s both',
                        fontSize: '40px', fontWeight: 900, letterSpacing: '0.15em',
                        color: '#ef4444', textShadow: '0 0 30px rgba(239,68,68,0.5)',
                        border: '4px solid #ef4444', padding: '8px 32px',
                        transform: 'rotate(-12deg)', borderRadius: '4px',
                        fontFamily: 'monospace',
                    }}>
                        CONFIDENTIAL
                    </div>
                </div>
            )}

            {/* ═══ Phase 2+: Report Content ═══ */}
            {phase >= 2 && (
                <div style={{
                    position: 'relative', width: '680px', maxWidth: '94vw', maxHeight: '92vh',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    animation: 'intel-content-appear 0.8s ease-out',
                }}>
                    {/* Film grain overlay */}
                    <svg width="0" height="0" style={{ position: 'absolute' }}>
                        <filter id="noise">
                            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                            <feColorMatrix type="saturate" values="0" />
                            <feBlend in="SourceGraphic" mode="multiply" />
                        </filter>
                    </svg>
                    <div style={{
                        position: 'absolute', inset: 0, opacity: 0.03,
                        background: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
                        pointerEvents: 'none', zIndex: 1,
                    }} />

                    {/* ── Header: Dossier ── */}
                    <div style={{
                        background: 'linear-gradient(180deg, rgba(10,12,22,0.98) 0%, rgba(10,12,22,0.95) 100%)',
                        backdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(255, 77, 0,0.15)',
                        padding: '20px 28px', position: 'relative', zIndex: 2,
                    }}>
                        {/* Top bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'linear-gradient(135deg, rgba(255, 77, 0,0.25), rgba(16,185,129,0.15))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <span className="material-symbols-outlined" style={{ color: '#a78bfa', fontSize: '20px' }}>
                                        shield
                                    </span>
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '10px', fontWeight: 800, color: '#64748b',
                                        letterSpacing: '0.2em', fontFamily: 'monospace',
                                    }}>
                                        AGENT FIDATO · FIELD REPORT
                                    </div>
                                    <div style={{
                                        fontSize: '10px', color: '#475569', fontFamily: 'monospace',
                                    }}>
                                        {timestamp} · {missionType}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    color: '#64748b', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#ef4444' }}
                                onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#64748b' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                            </button>
                        </div>

                        {/* Decoded info lines */}
                        <div style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.8' }}>
                            {decodedLines >= 1 && (
                                <div style={{ animation: 'intel-line-decode 0.3s ease', display: 'flex', gap: '8px' }}>
                                    <span style={{ color: '#475569', width: '80px', textAlign: 'right' }}>TASK:</span>
                                    <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{findings?.title || mission?.title || '—'}</span>
                                </div>
                            )}
                            {decodedLines >= 2 && (
                                <div style={{ animation: 'intel-line-decode 0.3s ease', display: 'flex', gap: '8px' }}>
                                    <span style={{ color: '#475569', width: '80px', textAlign: 'right' }}>TARGET:</span>
                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>{targetName}</span>
                                </div>
                            )}
                            {decodedLines >= 3 && (
                                <div style={{ animation: 'intel-line-decode 0.3s ease', display: 'flex', gap: '8px' }}>
                                    <span style={{ color: '#475569', width: '80px', textAlign: 'right' }}>CHECKS:</span>
                                    <span style={{ color: '#94a3b8' }}>{findings?.stats?.totalChecks || 0} sweeps conducted</span>
                                </div>
                            )}
                            {decodedLines >= 4 && (
                                <div style={{ animation: 'intel-line-decode 0.3s ease', display: 'flex', gap: '8px' }}>
                                    <span style={{ color: '#475569', width: '80px', textAlign: 'right' }}>INTEL:</span>
                                    <span style={{ color: '#34d399' }}>{totalFindings} findings intercepted</span>
                                    {criticalCount > 0 && (
                                        <span style={{
                                            fontSize: '10px', padding: '1px 8px', borderRadius: '4px',
                                            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                                            color: '#ef4444', fontWeight: 800, animation: 'intel-blink 1s ease infinite',
                                        }}>
                                            {criticalCount} CRITICAL
                                        </span>
                                    )}
                                </div>
                            )}
                            {decodedLines >= 5 && (
                                <div style={{ animation: 'intel-line-decode 0.3s ease' }}>
                                    {/* Threat Level Meter */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                        <span style={{ color: '#475569', width: '80px', textAlign: 'right', fontSize: '12px' }}>THREAT:</span>
                                        <div style={{
                                            flex: 1, height: '6px', borderRadius: '3px',
                                            background: 'rgba(255,255,255,0.04)', overflow: 'hidden', position: 'relative',
                                        }}>
                                            <div style={{
                                                height: '100%', borderRadius: '3px',
                                                background: criticalCount > 0
                                                    ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                                    : totalFindings > 3
                                                        ? 'linear-gradient(90deg, #06b6d4, #f59e0b)'
                                                        : 'linear-gradient(90deg, #06b6d4, #34d399)',
                                                width: `${Math.min(100, criticalCount > 0 ? 85 : totalFindings > 3 ? 55 : 25)}%`,
                                                transition: 'width 1s ease', animation: 'intel-threat-fill 1.5s ease-out',
                                                boxShadow: criticalCount > 0 ? '0 0 12px rgba(239,68,68,0.4)' : 'none',
                                            }} />
                                        </div>
                                        <span style={{
                                            fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em',
                                            color: criticalCount > 0 ? '#ef4444' : totalFindings > 3 ? '#f59e0b' : '#06b6d4',
                                        }}>
                                            {criticalCount > 0 ? 'HIGH' : totalFindings > 3 ? 'MODERATE' : 'LOW'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Findings Body ── */}
                    <div ref={scrollRef} style={{
                        flex: 1, overflow: 'auto', padding: '20px 28px',
                        background: 'linear-gradient(180deg, rgba(6,8,16,0.98) 0%, rgba(10,12,22,0.98) 100%)',
                        position: 'relative', zIndex: 2,
                    }}>
                        {/* Scan line overlay on content */}
                        <div style={{
                            position: 'absolute', inset: 0, pointerEvents: 'none',
                            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255, 77, 0,0.015) 2px, rgba(255, 77, 0,0.015) 4px)',
                        }} />

                        {totalFindings === 0 && phase >= 3 && (
                            <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#1e293b', marginBottom: '12px', display: 'block' }}>radar</span>
                                <div style={{ fontSize: '14px', color: '#475569', fontFamily: 'monospace' }}>
                                    NO INSIGHTS INTERCEPTED YET
                                </div>
                                <div style={{ fontSize: '12px', color: '#334155', fontFamily: 'monospace', marginTop: '4px' }}>
                                    Agent is monitoring and scanning...
                                </div>
                            </div>
                        )}

                        {findings?.findings?.map((f, i) => {
                            if (i >= visibleFindings) return null
                            const threat = THREAT_COLORS[f.severity] || THREAT_COLORS.info

                            return (
                                <div
                                    key={i}
                                    style={{
                                        marginBottom: '16px',
                                        borderRadius: '12px',
                                        border: `1px solid ${threat.primary}25`,
                                        background: `linear-gradient(135deg, ${threat.primary}08, transparent)`,
                                        overflow: 'hidden',
                                        animation: 'intel-finding-slide 0.5s ease-out both',
                                        animationDelay: `${i * 0.15}s`,
                                    }}
                                >
                                    {/* Severity bar */}
                                    <div style={{
                                        height: '3px', width: '100%',
                                        background: `linear-gradient(90deg, ${threat.primary}, transparent)`,
                                        boxShadow: `0 0 8px ${threat.glow}`,
                                    }} />

                                    <div style={{ padding: '16px 18px' }}>
                                        {/* Finding header */}
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            alignItems: 'center', marginBottom: '10px',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{
                                                    width: '8px', height: '8px', borderRadius: '50%',
                                                    background: threat.primary,
                                                    boxShadow: `0 0 8px ${threat.glow}`,
                                                    animation: f.severity === 'critical' ? 'intel-blink 1s ease infinite' : 'none',
                                                }} />
                                                <span style={{
                                                    fontSize: '10px', fontWeight: 800,
                                                    letterSpacing: '0.15em', color: threat.primary,
                                                    fontFamily: 'monospace',
                                                }}>
                                                    {threat.label} · FINDING #{String(i + 1).padStart(3, '0')}
                                                </span>
                                            </div>
                                            <span style={{
                                                fontSize: '10px', color: '#475569',
                                                fontFamily: 'monospace',
                                            }}>
                                                {new Date(f.createdAt).toLocaleString('en-IN', {
                                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                                                    hour12: false,
                                                })}
                                            </span>
                                        </div>

                                        {/* Finding content */}
                                        <div style={{
                                            fontSize: '13px', color: '#cbd5e1', lineHeight: 1.7,
                                            whiteSpace: 'pre-wrap', fontFamily: "'Inter', sans-serif",
                                        }}>
                                            {f.summary}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* ── Footer: Confidential Watermark ── */}
                    <div style={{
                        padding: '12px 28px',
                        background: 'rgba(6,8,16,0.98)',
                        borderTop: '1px solid rgba(255, 77, 0,0.1)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        zIndex: 2, position: 'relative',
                    }}>
                        <div style={{
                            fontSize: '9px', color: '#1e293b', letterSpacing: '0.3em',
                            fontFamily: 'monospace', fontWeight: 800,
                        }}>
                            AGENT FIDATO · FIELD REPORT · CONFIDENTIAL · INTERNAL USE ONLY
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[0, 1, 2, 3].map(i => (
                                <div key={i} style={{
                                    width: '4px', height: '12px', borderRadius: '2px',
                                    background: i < (criticalCount > 0 ? 4 : totalFindings > 3 ? 3 : 1)
                                        ? (criticalCount > 0 ? '#ef4444' : totalFindings > 3 ? '#f59e0b' : '#06b6d4')
                                        : 'rgba(255,255,255,0.06)',
                                    transition: 'background 0.3s',
                                }} />
                            ))}
                        </div>
                    </div>

                    {/* Rounded border with glow */}
                    <div style={{
                        position: 'absolute', inset: 0, borderRadius: '16px',
                        border: '1px solid rgba(255, 77, 0,0.2)',
                        boxShadow: '0 0 80px rgba(255, 77, 0,0.08), inset 0 0 60px rgba(0,0,0,0.3)',
                        pointerEvents: 'none', zIndex: 3,
                    }} />
                </div>
            )}

            {/* ═══ Keyframe Animations ═══ */}
            <style>{`
                @keyframes intel-sweep {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes intel-crosshair-appear {
                    from { opacity: 0; transform: scale(1.5); }
                    to { opacity: 1; transform: scale(1); }
                }
                @keyframes intel-stamp {
                    from { opacity: 0; transform: rotate(-12deg) scale(3); }
                    to { opacity: 1; transform: rotate(-12deg) scale(1); }
                }
                @keyframes intel-content-appear {
                    from { opacity: 0; transform: scale(0.95) translateY(20px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes intel-line-decode {
                    from { opacity: 0; transform: translateX(-10px); clip-path: inset(0 100% 0 0); }
                    to { opacity: 1; transform: translateX(0); clip-path: inset(0 0 0 0); }
                }
                @keyframes intel-finding-slide {
                    from { opacity: 0; transform: translateX(-30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes intel-blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.3; }
                }
                @keyframes intel-threat-fill {
                    from { width: 0%; }
                }
            `}</style>
        </div>
    )
}

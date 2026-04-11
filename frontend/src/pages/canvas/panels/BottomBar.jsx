// ═══════════════════════════════════════════════════════════════
// BottomBar.jsx — Canvas Bottom Bar with Resize + Platform Presets
// Grouped presets: Social | Display | Print
// ═══════════════════════════════════════════════════════════════

import React, { useState } from 'react'
import useCanvasStore from '../state/useCanvasStore'
import { PRESETS } from '../data/presets'

// Group definitions for platform presets
const PRESET_GROUPS = [
    {
        label: 'Instagram',
        icon: 'photo_camera',
        ids: ['ig-post', 'ig-post-square', 'ig-story', 'ig-reel'],
    },
    {
        label: 'Facebook',
        icon: 'thumb_up',
        ids: ['fb-post', 'fb-story'],
    },
    {
        label: 'Social',
        icon: 'public',
        ids: ['linkedin', 'twitter', 'whatsapp-status', 'pinterest'],
    },
    {
        label: 'Video',
        icon: 'smart_display',
        ids: ['yt-thumb'],
    },
    {
        label: 'Ads & Web',
        icon: 'web',
        ids: ['carousel', 'banner', 'banner-square'],
    },
]

const PRESET_MAP = Object.fromEntries(PRESETS.map(p => [p.id, p]))

export default function BottomBar({ onResizeCanvas, onResizeToPreset }) {
    const {
        customW, setCustomW,
        customH, setCustomH,
        lockRatio, setLockRatio,
        activePreset,
    } = useCanvasStore()

    const [hoveredPreset, setHoveredPreset] = useState(null)
    const [expandedGroup, setExpandedGroup] = useState(null)

    const currentPreset = PRESETS.find(p => p.id === activePreset)

    return (
        <div className="ce-bottom-bar">
            {/* ─── Custom Size Controls ─── */}
            <div className="ce-bb-resize-group">
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#818cf8', flexShrink: 0 }}>
                    crop_square
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                        className="ce-resize-input"
                        type="number" min={100} max={8000} value={customW}
                        onChange={e => {
                            const w = parseInt(e.target.value) || 100
                            setCustomW(w)
                            if (lockRatio && customH && customW) setCustomH(Math.round(w * (customH / customW)))
                        }}
                        title="Width (px)"
                    />
                    <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>W</span>
                </div>
                <span style={{ fontSize: 11, color: '#334155', flexShrink: 0 }}>×</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                        className="ce-resize-input"
                        type="number" min={100} max={8000} value={customH}
                        onChange={e => {
                            const h = parseInt(e.target.value) || 100
                            setCustomH(h)
                            if (lockRatio && customW && customH) setCustomW(Math.round(h * (customW / customH)))
                        }}
                        title="Height (px)"
                    />
                    <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>H</span>
                </div>

                {/* Lock ratio */}
                <button
                    className="ce-tool-btn"
                    onClick={() => setLockRatio(!lockRatio)}
                    style={{ width: 22, height: 22, flexShrink: 0 }}
                    title={lockRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: lockRatio ? '#818cf8' : '#475569' }}>
                        {lockRatio ? 'lock' : 'lock_open'}
                    </span>
                </button>

                {/* Flip W/H */}
                <button
                    className="ce-tool-btn"
                    onClick={() => { const tmp = customW; setCustomW(customH); setCustomH(tmp) }}
                    style={{ width: 22, height: 22, flexShrink: 0 }}
                    title="Flip orientation (portrait ↔ landscape)"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>swap_horiz</span>
                </button>

                {/* Apply */}
                <button
                    className="ce-preset-btn active"
                    onClick={() => onResizeCanvas?.(customW, customH)}
                    style={{ padding: '3px 10px', fontSize: 10, height: 24, flexShrink: 0 }}
                    title={`Resize artboard to ${customW}×${customH}px`}
                >
                    Apply
                </button>
            </div>

            {/* ─── Divider ─── */}
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.07)', margin: '0 6px', flexShrink: 0 }} />

            {/* ─── Active preset indicator ─── */}
            {currentPreset && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, padding: '3px 8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#818cf8' }}>{currentPreset.icon}</span>
                    <span style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 600 }}>{currentPreset.label}</span>
                    <span style={{ fontSize: 9, color: '#64748b' }}>{currentPreset.w}×{currentPreset.h}</span>
                </div>
            )}

            {/* ─── Divider ─── */}
            <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.07)', margin: '0 6px', flexShrink: 0 }} />

            {/* ─── Platform Preset Groups ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflowX: 'auto', flexShrink: 1 }}>
                {PRESET_GROUPS.map(group => {
                    const groupPresets = group.ids.map(id => PRESET_MAP[id]).filter(Boolean)
                    const isGroupActive = groupPresets.some(p => p.id === activePreset)
                    const isExpanded = expandedGroup === group.label

                    return (
                        <div key={group.label} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1 }}>
                            {/* Group label button */}
                            <button
                                className={`ce-preset-btn ${isGroupActive ? 'active' : ''}`}
                                onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', whiteSpace: 'nowrap', fontSize: 10 }}
                                title={`${group.label} presets`}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{group.icon}</span>
                                {group.label}
                                <span className="material-symbols-outlined" style={{ fontSize: 10, opacity: 0.6 }}>
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>

                            {/* Expanded preset sub-buttons */}
                            {isExpanded && (
                                <div style={{
                                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                                    background: '#141420', border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column',
                                    gap: 2, minWidth: 154, zIndex: 100,
                                    boxShadow: '0 -8px 24px rgba(0,0,0,0.5)'
                                }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: '#52525b', padding: '2px 6px 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                        {group.label} Sizes
                                    </div>
                                    {groupPresets.map(p => (
                                        <button
                                            key={p.id}
                                            className={`ce-preset-btn ${activePreset === p.id ? 'active' : ''}`}
                                            onClick={() => { onResizeToPreset?.(p); setExpandedGroup(null) }}
                                            onMouseEnter={() => setHoveredPreset(p.id)}
                                            onMouseLeave={() => setHoveredPreset(null)}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', fontSize: 11, textAlign: 'left', width: '100%' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{p.icon}</span>
                                                <div>
                                                    <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{p.label}</div>
                                                    {p.note && <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.2 }}>{p.note}</div>}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontSize: 9, color: '#a1a1aa', fontVariantNumeric: 'tabular-nums' }}>{p.ratio || ''}</div>
                                                <div style={{ fontSize: 9, color: '#52525b', fontVariantNumeric: 'tabular-nums' }}>{p.w}×{p.h}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

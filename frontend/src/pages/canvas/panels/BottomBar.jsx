// ═══════════════════════════════════════════════════════════════
// BottomBar.jsx — Canvas Bottom Bar with Size Controls + Platform Adapt
// Intelligently adapts canvas content when a platform preset is clicked
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect } from 'react'
import useCanvasStore from '../state/useCanvasStore'
import { PRESETS } from '../data/presets'

// Group definitions for platform presets
const PRESET_GROUPS = [
    {
        label: 'Instagram',
        icon: 'photo_camera',
        color: '#E1306C',
        ids: ['ig-post', 'ig-post-square', 'ig-story', 'ig-reel'],
    },
    {
        label: 'Facebook',
        icon: 'thumb_up',
        color: '#1877F2',
        ids: ['fb-post', 'fb-story'],
    },
    {
        label: 'Social',
        icon: 'public',
        color: '#14b8a6',
        ids: ['linkedin', 'twitter', 'whatsapp-status', 'pinterest'],
    },
    {
        label: 'Video',
        icon: 'smart_display',
        color: '#FF0000',
        ids: ['yt-thumb'],
    },
    {
        label: 'Ads & Web',
        icon: 'web',
        color: '#f59e0b',
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

    const [expandedGroup, setExpandedGroup] = useState(null)
    const popupRef = useRef(null)

    const currentPreset = PRESETS.find(p => p.id === activePreset)

    // Close popup when clicking outside
    useEffect(() => {
        if (!expandedGroup) return
        const handleClick = (e) => {
            if (popupRef.current && !popupRef.current.contains(e.target)) {
                setExpandedGroup(null)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [expandedGroup])

    return (
        <div className="ce-bottom-bar">
            {/* ─── Size Controls ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '2px 8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <input
                        className="ce-resize-input"
                        type="number" min={100} max={8000} value={customW}
                        onChange={e => {
                            const w = parseInt(e.target.value) || 100
                            setCustomW(w)
                            if (lockRatio && customH && customW) setCustomH(Math.round(w * (customH / customW)))
                        }}
                        title="Width (px)"
                        style={{ width: 48 }}
                    />
                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>×</span>
                    <input
                        className="ce-resize-input"
                        type="number" min={100} max={8000} value={customH}
                        onChange={e => {
                            const h = parseInt(e.target.value) || 100
                            setCustomH(h)
                            if (lockRatio && customW && customH) setCustomW(Math.round(h * (customW / customH)))
                        }}
                        title="Height (px)"
                        style={{ width: 48 }}
                    />
                    <button
                        className="ce-bb-icon-btn"
                        onClick={() => setLockRatio(!lockRatio)}
                        title={lockRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 13, color: lockRatio ? '#818cf8' : '#475569' }}>
                            {lockRatio ? 'lock' : 'lock_open'}
                        </span>
                    </button>
                    <button
                        className="ce-bb-icon-btn"
                        onClick={() => { const tmp = customW; setCustomW(customH); setCustomH(tmp) }}
                        title="Flip orientation"
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>swap_horiz</span>
                    </button>
                </div>
                <button
                    className="ce-bb-apply-btn"
                    onClick={() => onResizeCanvas?.(customW, customH)}
                    title={`Adapt canvas to ${customW}×${customH}px`}
                >
                    Apply
                </button>
            </div>

            {/* ─── Separator ─── */}
            <div className="ce-bb-separator" />

            {/* ─── Active preset chip ─── */}
            {currentPreset && (
                <div className="ce-bb-active-chip">
                    <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#818cf8' }}>{currentPreset.icon}</span>
                    <span style={{ fontSize: 10, color: '#a5b4fc', fontWeight: 600 }}>{currentPreset.label}</span>
                    <span style={{ fontSize: 9, color: '#64748b' }}>{currentPreset.w}×{currentPreset.h}</span>
                </div>
            )}

            {/* ─── Separator ─── */}
            <div className="ce-bb-separator" />

            {/* ─── Adapt to label ─── */}
            <span style={{ fontSize: 10, color: '#52525b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                Adapt&nbsp;to
            </span>

            {/* ─── Platform Preset Groups ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap', flexShrink: 1 }}>
                {PRESET_GROUPS.map(group => {
                    const groupPresets = group.ids.map(id => PRESET_MAP[id]).filter(Boolean)
                    const isGroupActive = groupPresets.some(p => p.id === activePreset)
                    const isExpanded = expandedGroup === group.label

                    return (
                        <div key={group.label} style={{ position: 'relative' }} ref={isExpanded ? popupRef : undefined}>
                            {/* Group label button */}
                            <button
                                className={`ce-bb-group-btn ${isGroupActive ? 'active' : ''}`}
                                onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                                title={`Adapt design to ${group.label} sizes`}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: isGroupActive ? group.color : undefined }}>{group.icon}</span>
                                <span>{group.label}</span>
                                <span className="material-symbols-outlined" style={{ fontSize: 10, opacity: 0.5 }}>
                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>

                            {/* Expanded preset dropdown */}
                            {isExpanded && (
                                <div className="ce-bb-dropdown">
                                    <div className="ce-bb-dropdown-header">
                                        <span style={{ color: group.color }}>●</span>
                                        {group.label} Sizes
                                    </div>
                                    {groupPresets.map(p => (
                                        <button
                                            key={p.id}
                                            className={`ce-bb-dropdown-item ${activePreset === p.id ? 'active' : ''}`}
                                            onClick={() => { onResizeToPreset?.(p); setExpandedGroup(null) }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{p.icon}</span>
                                                <div>
                                                    <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{p.label}</div>
                                                    {p.note && <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.2, marginTop: 1 }}>{p.note}</div>}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div style={{ fontSize: 10, color: '#a1a1aa', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{p.ratio || ''}</div>
                                                <div style={{ fontSize: 9, color: '#52525b', fontVariantNumeric: 'tabular-nums' }}>{p.w}×{p.h}</div>
                                            </div>
                                        </button>
                                    ))}
                                    <div style={{ fontSize: 8, color: '#3f3f46', padding: '4px 8px 2px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 2 }}>
                                        Click to adapt your canvas
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

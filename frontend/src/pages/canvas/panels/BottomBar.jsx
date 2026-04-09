// ═══════════════════════════════════════════════════════════════
// BottomBar.jsx — Canvas Bottom Bar with Resize + Platform Presets
// Contains custom W×H inputs, lock ratio, flip, and platform
// preset buttons (IG Post, Story, FB, LinkedIn, YT, etc.)
// ═══════════════════════════════════════════════════════════════

import React from 'react'
import useCanvasStore from '../state/useCanvasStore'
import { PRESETS } from '../data/presets'

export default function BottomBar({
    onResizeCanvas,
    onResizeToPreset,
}) {
    const {
        customW, setCustomW,
        customH, setCustomH,
        lockRatio, setLockRatio,
        activePreset,
    } = useCanvasStore()

    return (
        <div className="ce-bottom-bar">
            {/* Custom resize controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#818cf8' }}>crop</span>
                <input className="ce-resize-input" type="number" min={100} max={4000} value={customW}
                    onChange={e => {
                        const w = parseInt(e.target.value) || 100
                        setCustomW(w)
                        if (lockRatio) setCustomH(Math.round(w * (customH / customW)))
                    }} title="Width" />
                <span style={{ fontSize: 10, color: '#475569' }}>×</span>
                <input className="ce-resize-input" type="number" min={100} max={4000} value={customH}
                    onChange={e => {
                        const h = parseInt(e.target.value) || 100
                        setCustomH(h)
                        if (lockRatio) setCustomW(Math.round(h * (customW / customH)))
                    }} title="Height" />
                <button className="ce-tool-btn" onClick={() => setLockRatio(!lockRatio)}
                    style={{ width: 24, height: 24 }} title={lockRatio ? 'Unlock ratio' : 'Lock ratio'}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{lockRatio ? 'lock' : 'lock_open'}</span>
                </button>
                <button className="ce-tool-btn" onClick={() => { const tmp = customW; setCustomW(customH); setCustomH(tmp) }}
                    style={{ width: 24, height: 24 }} title="Flip orientation">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>swap_horiz</span>
                </button>
                <button className="ce-preset-btn active" onClick={() => onResizeCanvas?.(customW, customH)}
                    style={{ padding: '4px 10px', fontSize: 10 }}>
                    Apply
                </button>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
            {PRESETS.map(p => (
                <button key={p.id} className={`ce-preset-btn ${activePreset === p.id ? 'active' : ''}`}
                    onClick={() => onResizeToPreset?.(p)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{p.icon}</span>
                    {p.label}
                </button>
            ))}
        </div>
    )
}
